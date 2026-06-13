import { Router } from 'express'
import { readFile, writeFile, readTextFile, writeTextFile, ensureDir, listDir } from '../utils/fileHelper.js'

const router = Router()

/**
 * 获取素材分类映射
 */
function getCategoryLabels(language) {
  if (language === 'en') {
    return {
      worldview: 'Worldbuilding',
      character: 'Characters',
      setting: 'Settings',
      plot: 'Plot Hooks',
      dialogue: 'Dialogue',
      writing: 'Writing Style',
      reference: 'References',
      other: 'Other'
    }
  }
  return {
    worldview: '世界观',
    character: '人物',
    setting: '场景',
    plot: '情节桥段',
    dialogue: '对话',
    writing: '文风',
    reference: '参考资料',
    other: '其他'
  }
}

/**
 * 读取素材（支持筛选和搜索）
 */
router.get('/', async (req, res) => {
  try {
    const data = await readFile('materials.json')
    let materials = data?.materials || []

    if (req.query.project_id === 'global') {
      materials = materials.filter(m => m.project_id === null || m.project_id === undefined)
    } else if (req.query.project_id) {
      materials = materials.filter(m => m.project_id === req.query.project_id)
    }

    if (req.query.category) {
      materials = materials.filter(m => (m.category || 'other') === req.query.category)
    }

    if (req.query.keyword) {
      const keyword = String(req.query.keyword).toLowerCase()
      materials = materials.filter(m =>
        (m.name || '').toLowerCase().includes(keyword) ||
        (m.content || '').toLowerCase().includes(keyword) ||
        ((m.tags || []).some(t => String(t).toLowerCase().includes(keyword)))
    }

    if (req.query.tag) {
      const tag = String(req.query.tag).toLowerCase()
      materials = materials.filter(m => (m.tags || []).some(t => String(t).toLowerCase() === tag)))
    }

    if (req.query.sort === 'name') {
      materials.sort((a, b) => (a.name || '').localeCompare(b.name || '')
    } else {
      materials.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
    }

    res.json(materials)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 获取分类列表
 */
router.get('/categories', async (req, res) => {
  try {
    const language = req.query.language || 'zh-CN'
    const labels = getCategoryLabels(language)
    const data = await readFile('materials.json')
    const materials = data?.materials || []
    const counts = {}
    for (const m of materials) {
      const c = m.category || 'other'
      counts[c] = (counts[c] || 0) + 1
    }
    const categories = Object.keys(labels).map(id => ({
      id,
      name: labels[id] || id,
      count: counts[id] || 0
    }))
    res.json(categories)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 获取全局素材
 */
router.get('/global', async (req, res) => {
  try {
    const data = await readFile('materials.json')
    const globalMaterials = (data?.materials || []).filter(
      m => m.project_id === null || m.project_id === undefined
    )
    res.json(globalMaterials)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 获取项目私有素材
 */
router.get('/project/:projectId', async (req, res) => {
  try {
    const data = await readFile('materials.json')
    const projectMaterials = (data?.materials || []).filter(
      m => m.project_id === req.params.projectId
    )
    res.json(projectMaterials)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 获取单条素材
 */
router.get('/:id', async (req, res) => {
  try {
    const data = await readFile('materials.json')
    const material = (data?.materials || []).find(m => m.id === req.params.id)
    if (!material) return res.status(404).json({ error: '素材不存在 / Material not found' })
    res.json(material)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 创建素材
 */
router.post('/', async (req, res) => {
  try {
    const data = await readFile('materials.json') || { materials: [] }
    if (!data.materials) data.materials = []
    const newMaterial = {
      id: `mat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      project_id: req.body.project_id !== undefined ? req.body.project_id : null,
      category: req.body.category || 'setting',
      subCategory: req.body.subCategory || '',
      name: req.body.name || '未命名素材',
      content: req.body.content || '',
      tags: req.body.tags || [],
      source: req.body.source || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    data.materials.push(newMaterial)
    await writeFile('materials.json', data)
    res.status(201).json(newMaterial)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 批量创建素材
 */
router.post('/batch', async (req, res) => {
  try {
    const data = await readFile('materials.json') || { materials: [] }
    if (!data.materials) data.materials = []
    const now = new Date().toISOString()
    const newMaterials = (req.body.materials || []).map(m => ({
      id: `mat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      project_id: m.project_id !== undefined ? m.project_id : null,
      category: m.category || 'setting',
      subCategory: m.subCategory || '',
      name: m.name || '未命名素材',
      content: m.content || '',
      tags: m.tags || [],
      source: m.source || '',
      createdAt: now,
      updatedAt: now
    }))
    data.materials.push(...newMaterials)
    await writeFile('materials.json', data)
    res.status(201).json(newMaterials)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 更新素材
 */
router.put('/:id', async (req, res) => {
  try {
    const data = await readFile('materials.json') || { materials: [] }
    if (!data.materials) data.materials = []
    const idx = data.materials.findIndex(m => m.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: '素材不存在' })
    data.materials[idx] = {
      ...data.materials[idx],
      ...req.body,
      id: req.params.id,
      updatedAt: new Date().toISOString()
    }
    await writeFile('materials.json', data)
    res.json(data.materials[idx])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 删除素材
 */
router.delete('/:id', async (req, res) => {
  try {
    const data = await readFile('materials.json') || { materials: [] }
    if (!data.materials) data.materials = []
    const before = data.materials.length
    data.materials = data.materials.filter(m => m.id !== req.params.id)
    await writeFile('materials.json', data)
    res.json({ success: true, deleted: before - data.materials.length })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 批量删除
 */
router.post('/batch/delete', async (req, res) => {
  try {
    const { ids } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: '请提供 ids 数组' })
    }
    const data = await readFile('materials.json') || { materials: [] }
    if (!data.materials) data.materials = []
    const before = data.materials.length
    data.materials = data.materials.filter(m => !ids.includes(m.id))
    await writeFile('materials.json', data)
    res.json({ success: true, deleted: before - data.materials.length })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 从文本内容批量导入素材
 *
 * 支持三种格式:
 * 1. plain: 空行分隔的段落 -> 每段作为一个素材
 * 2. markdown: 使用 ## 标题 + 正文
 * 3. custom: 自定义分隔符
 */
router.post('/import/text', async (req, res) => {
  try {
    const { text, format, delimiter, project_id, default_category, auto_detect, language } = req.body
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text 不能为空' })
    }

    const data = await readFile('materials.json') || { materials: [] }
    if (!data.materials) data.materials = []

    const lang = language || 'zh-CN'
    const now = new Date().toISOString()
    const raw = String(text)
    const blocks = []

    const fmt = format || 'auto'
    if (fmt === 'markdown' || (fmt === 'auto' && raw.includes('## ') || raw.includes('# ')) {
      const lines = raw.split('\n')
      let current = null
      for (const line of lines) {
        const titleMatch = line.match(/^#{1,6}\s+(.+)$/)
        if (titleMatch) {
          if (current) blocks.push(current)
          current = { name: titleMatch[1].trim(), content: '' }
        } else if (current) {
          current.content += (current.content ? '\n' : '') + line
        }
      }
      if (current) blocks.push(current)
      // 去除 content 首尾空白
      for (const b of blocks) b.content = (b.content || '').trim()
    } else if (fmt === 'custom' && delimiter) {
      const parts = raw.split(delimiter).map(p => p.trim()).filter(Boolean)
      for (const p of parts) {
        const firstLine = p.split('\n')[0]
        const rest = p.split('\n').slice(1).join('\n').trim()
        blocks.push({
          name: firstLine.slice(0, 80) || (lang === 'en' ? 'Imported material' : '导入的素材'),
          content: rest || p
        })
      }
    } else {
      // 默认: 空行分段
      const parts = raw.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
      for (const p of parts) {
        const firstLine = p.split('\n')[0]
        const rest = p.split('\n').slice(1).join('\n').trim()
        blocks.push({
          name: firstLine.slice(0, 80) || (lang === 'en' ? 'Imported material' : '导入的素材'),
          content: rest || p
        })
      }
    }

    const newMaterials = blocks.filter(b => b.content && b.content.length > 0).map((b, idx) => {
      let category = default_category || 'setting'
      // 自动识别
      if (auto_detect) {
        const lower = (b.name + ' ' + b.content).toLowerCase()
        if (lower.includes('人物') || lower.includes('character') || lower.includes('person') || lower.includes('主角') || lower.includes('反派')) category = 'character'
        else if (lower.includes('世界观') || lower.includes('world') || lower.includes('功法') || lower.includes('势力')) category = 'worldview'
        else if (lower.includes('场景') || lower.includes('scene') || lower.includes('地点')) category = 'setting'
        else if (lower.includes('剧情') || lower.includes('plot') || lower.includes('桥段') || lower.includes('冲突')) category = 'plot'
        else if (lower.includes('对话') || lower.includes('dialogue')) category = 'dialogue'
      }
      return {
        id: `mat_${Date.now()}_${idx.toString().padStart(3, '0')}_${Math.random().toString(36).slice(2, 6)}`,
        project_id: project_id !== undefined ? project_id : null,
        category,
        subCategory: '',
        name: b.name || (lang === 'en' ? 'Imported material' : '导入的素材'),
        content: b.content || '',
        tags: ['导入'],
        source: 'text-import',
        createdAt: now,
        updatedAt: now
      }
    })

    data.materials.push(...newMaterials)
    await writeFile('materials.json', data)
    res.status(201).json({ success: true, imported: newMaterials.length, materials: newMaterials })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 从本地文本文件（位于数据目录内导入）
 *
 * body: { filename, project_id, category, format, language }
 */
router.post('/import/file', async (req, res) => {
  try {
    const { filename, project_id, category, format, language } = req.body
    if (!filename) return res.status(400).json({ error: 'filename 不能为空' })

    const raw = readTextFile(filename)
    if (!raw) return res.status(400).json({ error: '文件为空或不存在' })

    const data = await readFile('materials.json') || { materials: [] }
    if (!data.materials) data.materials = []
    const now = new Date().toISOString()

    const newMaterial = {
      id: `mat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      project_id: project_id !== undefined ? project_id : null,
      category: category || 'reference',
      subCategory: '',
      name: String(filename).split('/').pop().split('.')[0] || (language === 'en' ? 'File import' : '文件导入'),
      content: raw,
      tags: ['导入', 'file'],
      source: 'file:' + filename,
      createdAt: now,
      updatedAt: now
    }
    data.materials.push(newMaterial)
    await writeFile('materials.json', data)
    res.status(201).json({ success: true, material: newMaterial })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 导出素材为 JSON / Markdown / TXT
 */
router.post('/export', async (req, res) => {
  try {
    const { ids, project_id, format, filename } = req.body
    const data = await readFile('materials.json') || { materials: [] }
    let list = data?.materials || []

    if (Array.isArray(ids) && ids.length > 0) {
      list = list.filter(m => ids.includes(m.id))
    } else if (project_id === 'global') {
      list = list.filter(m => m.project_id === null || m.project_id === undefined)
    } else if (project_id) {
      list = list.filter(m => m.project_id === project_id)
    }

    let output = ''
    const fmt = format || 'markdown'
    if (fmt === 'json') {
      output = JSON.stringify(list, null, 2)
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
    } else if (fmt === 'txt') {
      output = list.map(m => `【${m.name}】\n${m.content}`).join('\n\n---\n\n')
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    } else {
      output = list.map(m => `## ${m.name}\n\n> 分类: ${m.category} | 标签: ${(m.tags || []).join(', ')}\n\n${m.content}`).join('\n\n---\n\n')
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
    }

    // 如果提供了 filename，同时也写入数据目录
    if (filename) {
      try {
        ensureDir('exports')
        const fn = String(filename)
        writeTextFile('exports/' + fn, output)
        res.json({ success: true, count: list.length, file: 'exports/' + fn, content: output })
        return
      } catch (e) {
        res.json({ success: true, count: list.length, content: output })
        return
      }
    }
    res.json({ success: true, count: list.length, content: output })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 将素材移动/复制到另一个项目
 */
router.post('/:id/move', async (req, res) => {
  try {
    const { target_project_id, copy } = req.body
    const data = await readFile('materials.json') || { materials: [] }
    if (!data.materials) data.materials = []
    const idx = data.materials.findIndex(m => m.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: '素材不存在' })

    if (copy) {
      const original = data.materials[idx]
      const copyMat = {
        ...original,
        id: `mat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        project_id: target_project_id !== undefined ? target_project_id : null,
        tags: [...(original.tags || []), '复制'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      data.materials.push(copyMat)
      await writeFile('materials.json', data)
      res.json({ success: true, material: copyMat })
    } else {
      data.materials[idx].project_id = target_project_id !== undefined ? target_project_id : null
      data.materials[idx].updatedAt = new Date().toISOString()
      await writeFile('materials.json', data)
      res.json({ success: true, material: data.materials[idx] })
    }
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 统计信息
 */
router.get('/stats/summary', async (req, res) => {
  try {
    const data = await readFile('materials.json') || { materials: [] }
    const list = data?.materials || []
    const byCategory = {}
    const byProject = {}
    let totalChars = 0
    for (const m of list) {
      byCategory[m.category || 'other'] = (byCategory[m.category || 'other'] || 0) + 1
      const pid = m.project_id || 'global'
      byProject[pid] = (byProject[pid] || 0) + 1
      totalChars += (m.content || '').length
    }
    res.json({
      total: list.length,
      by_category: byCategory,
      by_project: byProject,
      total_characters: totalChars,
      total_words: Math.round(totalChars / 2)
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 列出可导入的文本文件（数据目录下 materials/imports 子目录）
 */
router.get('/files/list', async (req, res) => {
  try {
    ensureDir('materials')
    const files = listDir('materials')
    res.json({ files })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
