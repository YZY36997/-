import { Router } from 'express'
import { readFile, writeFile, deleteDir } from '../utils/fileHelper.js'

const router = Router()

// 获取所有项目（列表形式，简化信息）
router.get('/', async (req, res) => {
  try {
    const data = await readFile('projects.json')
    const projects = data?.projects || []

    // 附带章节统计
    let chaptersData = null
    try {
      chaptersData = await readFile('chapters.json')
    } catch (e) { /* 可能文件还不存在 */ }
    const chapters = chaptersData?.chapters || []

    const enriched = projects.map(p => {
      const projectChapters = chapters.filter(c => c.project_id === p.id)
      const totalWords = projectChapters.reduce((s, c) => s + (c.word_count || 0), 0)
      return {
        ...p,
        chapter_count: projectChapters.length,
        total_words: totalWords
      }
    })

    res.json(enriched)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 获取单个项目详情（包含章节、角色、素材等关联信息）
router.get('/:id', async (req, res) => {
  try {
    const data = await readFile('projects.json')
    const project = (data?.projects || []).find(p => p.id === req.params.id)
    if (!project) {
      return res.status(404).json({ error: '项目不存在' })
    }

    // 收集关联信息
    let chapters = []
    let characters = []
    let materials = []

    try {
      const cData = await readFile('chapters.json')
      chapters = (cData?.chapters || [])
        .filter(c => c.project_id === req.params.id)
        .sort((a, b) => (a.chapter_no || 0) - (b.chapter_no || 0))
    } catch (e) { /* 章节文件可能不存在 */ }

    try {
      const chData = await readFile('characters.json')
      characters = (chData?.characters || []).filter(
        c => c.project_id === req.params.id || c.project_id === null
      )
    } catch (e) {}

    try {
      const mData = await readFile('materials.json')
      materials = (mData?.materials || []).filter(
        m => m.project_id === req.params.id || m.project_id === null
      )
    } catch (e) {}

    const totalWords = chapters.reduce((s, c) => s + (c.word_count || 0), 0)

    res.json({
      ...project,
      chapters: chapters,
      characters: characters,
      materials: materials,
      chapter_count: chapters.length,
      character_count: characters.length,
      material_count: materials.length,
      total_words: totalWords
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 创建新项目
router.post('/', async (req, res) => {
  try {
    const data = await readFile('projects.json') || { projects: [] }
    if (!data.projects) data.projects = []

    const newProject = {
      id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: req.body.name || '未命名项目',
      description: req.body.description || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      outline: req.body.outline || { title: '', summary: '', chapters: [], content: '' },
      settings: req.body.settings || {
        genre: '玄幻',
        style: '剧情流',
        language: req.body.language || 'zh-CN',
        target_words_per_chapter: 2000
      }
    }
    data.projects.push(newProject)
    await writeFile('projects.json', data)
    res.status(201).json(newProject)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 更新项目
router.put('/:id', async (req, res) => {
  try {
    const data = await readFile('projects.json')
    const idx = (data?.projects || []).findIndex(p => p.id === req.params.id)
    if (idx === -1) {
      return res.status(404).json({ error: '项目不存在' })
    }
    data.projects[idx] = {
      ...data.projects[idx],
      ...req.body,
      id: req.params.id,
      updatedAt: new Date().toISOString()
    }
    await writeFile('projects.json', data)
    res.json(data.projects[idx])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 更新项目大纲
router.put('/:id/outline', async (req, res) => {
  try {
    const data = await readFile('projects.json')
    const idx = (data?.projects || []).findIndex(p => p.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: '项目不存在' })

    data.projects[idx].outline = req.body.outline || data.projects[idx].outline
    data.projects[idx].updatedAt = new Date().toISOString()
    await writeFile('projects.json', data)

    // 如果提供了大纲章节列表且带标题，批量创建 chapter 条目
    const chapterList = Array.isArray(req.body.chapters) ? req.body.chapters : []
    if (chapterList.length > 0) {
      try {
        const chaptersData = await readFile('chapters.json') || { chapters: [] }
        if (!chaptersData.chapters) chaptersData.chapters = []

        // 先删除该项目已有的 outline 章节
        const existing = chaptersData.chapters.filter(c => c.project_id === req.params.id)
        const otherChapters = chaptersData.chapters.filter(c => c.project_id !== req.params.id)

        const now = new Date().toISOString()
        const nowTs = Date.now()
        const newChapters = chapterList.map((ch, i) => ({
          id: `ch_${nowTs}_${i.toString().padStart(3, '0')}`,
          project_id: req.params.id,
          chapter_no: ch.chapter_no || (i + 1),
          title: ch.title || `第${i + 1}章`,
          summary: ch.summary || ch.content || '',
          content: ch.content || '',
          status: ch.content ? 'drafting' : 'outline',
          ai_generated: false,
          word_count: (ch.content || '').length,
          tags: [],
          notes: ch.notes || '',
          createdAt: now,
          updatedAt: now
        }))

        chaptersData.chapters = [...otherChapters, ...newChapters]
        await writeFile('chapters.json', chaptersData)
      } catch (e) { /* 仅最佳努力创建 */ }
    }

    res.json({ success: true, project: data.projects[idx] })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 删除项目（同时删除关联的章节、角色、私有素材）
router.delete('/:id', async (req, res) => {
  try {
    const data = await readFile('projects.json')
    const project = (data?.projects || []).find(p => p.id === req.params.id)
    if (!project) return res.status(404).json({ error: '项目不存在' })

    data.projects = data.projects.filter(p => p.id !== req.params.id)
    await writeFile('projects.json', data)

    // 清理关联章节
    try {
      const chaptersData = await readFile('chapters.json')
      if (chaptersData?.chapters) {
        chaptersData.chapters = chaptersData.chapters.filter(c => c.project_id !== req.params.id)
        await writeFile('chapters.json', chaptersData)
        try { deleteDir(`chapters/${req.params.id}`) } catch (e) {}
      }
    } catch (e) { /* 章节文件可能不存在 */ }

    // 清理私有素材
    try {
      const mData = await readFile('materials.json')
      if (mData?.materials) {
        mData.materials = mData.materials.filter(m => m.project_id !== req.params.id)
        await writeFile('materials.json', mData)
      }
    } catch (e) {}

    // 清理私有角色
    try {
      const cData = await readFile('characters.json')
      if (cData?.characters) {
        cData.characters = cData.characters.filter(c => c.project_id !== req.params.id)
        await writeFile('characters.json', cData)
      }
    } catch (e) {}

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 从外部文本导入（小说文本 / 大纲 / 素材）
router.post('/:id/import', async (req, res) => {
  try {
    const { type, text, auto_split_chapters, delimiter } = req.body
    if (!text) return res.status(400).json({ error: 'text 为空' })
    const projectId = req.params.id

    // 确认项目存在
    const projectsData = await readFile('projects.json')
    const project = (projectsData?.projects || []).find(p => p.id === projectId)
    if (!project) return res.status(404).json({ error: '项目不存在' })

    let stats = { chapters: 0, characters: 0, materials: 0 }

    // === 根据类型处理 ===

    if (type === 'chapters' || type === 'novel' || type === 'novel_text') {
      // 小说文本 - 按章标题或自定义分隔符切分
      const separator = delimiter || /\n\s*(?:第[一二三四五六七八九十百千万0-9]+[章回节篇卷])|(?:Chapter\s*\d+)/i
      const raw = String(text)
      const parts = raw.split(separator)

      if (parts.length > 1) {
        // 匹配到章节
        try {
          const chaptersData = await readFile('chapters.json') || { chapters: [] }
          if (!chaptersData.chapters) chaptersData.chapters = []

          // 移除旧章节（用户要覆盖）
          chaptersData.chapters = chaptersData.chapters.filter(c => c.project_id !== projectId)

          const now = new Date().toISOString()
          const nowTs = Date.now()
          const newChapters = []

          for (let i = 0; i < parts.length; i++) {
            const chunk = parts[i].trim()
            if (chunk.length < 20) continue

            // 尝试提取标题（第一段）
            const lines = chunk.split('\n')
            const title = lines[0].length < 60 ? lines[0] : `第 ${i + 1} 章`
            const body = lines.slice(1).join('\n').trim()

            if (body.length < 20) continue

            newChapters.push({
              id: `ch_${nowTs}_${i.toString().padStart(3, '0')}`,
              project_id: projectId,
              chapter_no: i + 1,
              title: title,
              summary: body.slice(0, 200),
              content: body,
              status: 'completed',
              ai_generated: false,
              word_count: body.length,
              tags: ['导入'],
              notes: '',
              createdAt: now,
              updatedAt: now
            })
          }
          chaptersData.chapters.push(...newChapters)
          await writeFile('chapters.json', chaptersData)
          stats.chapters = newChapters.length
        } catch (e) {
          console.warn('章节保存失败:', e.message)
        }
      } else {
        // 没匹配到，整个作为 1 章
        try {
          const chaptersData = await readFile('chapters.json') || { chapters: [] }
          if (!chaptersData.chapters) chaptersData.chapters = []
          const newChapter = {
            id: `ch_${Date.now()}`,
            project_id: projectId,
            chapter_no: 1,
            title: '导入内容',
            summary: text.slice(0, 200),
            content: text,
            status: 'drafting',
            ai_generated: false,
            word_count: text.length,
            tags: ['导入'],
            notes: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
          chaptersData.chapters.push(newChapter)
          await writeFile('chapters.json', chaptersData)
          stats.chapters = 1
        } catch (e) {}
      }
    } else if (type === 'outline' || type === 'outline_text') {
      // 大纲 - 存到项目 outline 字段 + 每章为 outline 状态
      project.outline = {
        ...project.outline,
        content: text,
        updatedAt: new Date().toISOString()
      }
      if (auto_split_chapters) {
        // 按序号切分
        const sectionRe = /\n\s*\d+[.、]/g
        const parts = String(text).split(sectionRe)
        try {
          const chaptersData = await readFile('chapters.json') || { chapters: [] }
          if (!chaptersData.chapters) chaptersData.chapters = []
          const now = new Date().toISOString()
          const nowTs = Date.now()

          const newChapters = parts.slice(0, 20).map((p, i) => ({
            id: `ch_${nowTs}_${i.toString().padStart(3, '0')}`,
            project_id: projectId,
            chapter_no: i + 1,
            title: p.split('\n')[0].slice(0, 60) || `第 ${i + 1} 章`,
            summary: p.trim().slice(0, 500),
            content: '',
            status: 'outline',
            ai_generated: false,
            word_count: 0,
            tags: ['大纲导入'],
            notes: '',
            createdAt: now,
            updatedAt: now
          }))
          chaptersData.chapters.push(...newChapters)
          await writeFile('chapters.json', chaptersData)
          stats.chapters = newChapters.length
        } catch (e) {}
      }
      // 保存项目
      const idx = projectsData.projects.findIndex(p => p.id === projectId)
      if (idx !== -1) {
        projectsData.projects[idx] = project
        projectsData.projects[idx].updatedAt = new Date().toISOString()
        await writeFile('projects.json', projectsData)
      }
    } else if (type === 'materials' || type === 'material_text') {
      // 素材 - 按 【分类】 或空行切分
      const raw = String(text)
      const blocks = raw.split(/\n{2,}/).map(b => b.trim()).filter(b => b.length > 10)

      try {
        const mData = await readFile('materials.json') || { materials: [] }
        if (!mData.materials) mData.materials = []
        const now = new Date().toISOString()

        const newMaterials = blocks.map((block, i) => {
          const firstLine = block.split('\n')[0]
          const rest = block.split('\n').slice(1).join('\n').trim()
          return {
            id: `mat_${Date.now()}_${i.toString().padStart(3, '0')}`,
            project_id: projectId,
            category: 'setting',
            subCategory: '',
            name: firstLine.slice(0, 50) || `导入素材 ${i + 1}`,
            content: rest || block,
            tags: ['导入'],
            createdAt: now,
            updatedAt: now
          }
        })
        mData.materials.push(...newMaterials)
        await writeFile('materials.json', mData)
        stats.materials = newMaterials.length
      } catch (e) {}
    } else {
      return res.status(400).json({ error: '未知的 type, 可用: chapters/novel, outline, materials' })
    }

    res.json({
      success: true,
      type: type,
      stats: stats
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
