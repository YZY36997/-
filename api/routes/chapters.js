import { Router } from 'express'
import { readFile, writeFile, writeTextFile, readTextFile, deleteFile, ensureDir, getFileStat, listDir, deleteDir } from '../utils/fileHelper.js'
import fs from 'fs'
import path from 'path'

const router = Router()

/**
 * 章节模型:
 * {
 *   id: string,
 *   project_id: string,              // 所属项目
 *   chapter_no: number,              // 章节序号
 *   title: string,                   // 章节标题
 *   summary: string,                 // 章节大纲/概要
 *   content: string,                 // 章节文本正文（JSON中存储，也有独立 .txt）
 *   status: string,                  // outline / drafting / completed
 *   ai_generated: boolean,           // 是否 AI 生成
 *   word_count: number,              // 字数
 *   tags: string[],
 *   notes: string,                   // 作者备注
 *   createdAt: string,
 *   updatedAt: string
 * }
 */

// 获取项目的所有章节
router.get('/', async (req, res) => {
  try {
    if (!req.query.project_id) {
      return res.status(400).json({ error: '请指定项目ID (project_id)' })
    }
    const projectId = req.query.project_id

    const data = await readFile('chapters.json')
    let chapters = data?.chapters || []
    chapters = chapters.filter(c => c.project_id === projectId)

    // 按章节号排序
    chapters.sort((a, b) => (a.chapter_no || 0) - (b.chapter_no || 0))

    // 按状态筛选
    if (req.query.status) {
      chapters = chapters.filter(c => c.status === req.query.status)
    }

    // 关键词搜索
    if (req.query.keyword) {
      const kw = String(req.query.keyword).toLowerCase()
      chapters = chapters.filter(c =>
        (c.title || '').toLowerCase().includes(kw) ||
        (c.summary || '').toLowerCase().includes(kw) ||
        (c.content || '').toLowerCase().includes(kw)
      )
    }

    res.json(chapters)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 获取项目的章节统计（总字数/章节数/完成度）
router.get('/stats/:projectId', async (req, res) => {
  try {
    const data = await readFile('chapters.json')
    const chapters = (data?.chapters || []).filter(c => c.project_id === req.params.projectId)

    const totalWords = chapters.reduce((sum, c) => sum + (c.word_count || 0), 0)
    const completed = chapters.filter(c => c.status === 'completed').length
    const drafting = chapters.filter(c => c.status === 'drafting').length
    const outlineOnly = chapters.filter(c => c.status === 'outline').length

    res.json({
      total_chapters: chapters.length,
      total_words: totalWords,
      avg_words_per_chapter: chapters.length > 0 ? Math.round(totalWords / chapters.length) : 0,
      completed,
      drafting,
      outline_only: outlineOnly
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 获取单个章节
router.get('/:id', async (req, res) => {
  try {
    const data = await readFile('chapters.json')
    const chapter = (data?.chapters || []).find(c => c.id === req.params.id)
    if (!chapter) {
      return res.status(404).json({ error: '章节不存在' })
    }

    // 如果 content 为空，尝试读取独立 .txt 文件
    if (!chapter.content) {
      try {
        const txt = readTextFile(`chapters/${chapter.project_id}/${chapter.id}.txt`)
        if (txt) chapter.content = txt
      } catch (e) {}
    }
    res.json(chapter)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 创建新章节（通常只先填大纲 + 标题）
router.post('/', async (req, res) => {
  try {
    const data = await readFile('chapters.json') || { chapters: [] }
    if (!data.chapters) data.chapters = []

    const newChapter = {
      id: `ch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      project_id: req.body.project_id || null,
      chapter_no: req.body.chapter_no || 1,
      title: req.body.title || '新章节',
      summary: req.body.summary || '',
      content: req.body.content || '',
      status: req.body.status || (req.body.content ? 'drafting' : 'outline'),
      ai_generated: req.body.ai_generated === true,
      word_count: (req.body.content || '').length,
      tags: req.body.tags || [],
      notes: req.body.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    if (!newChapter.project_id) {
      return res.status(400).json({ error: '必须指定 project_id' })
    }

    data.chapters.push(newChapter)
    await writeFile('chapters.json', data)

    // 如果有正文内容，写入独立 .txt 文件
    if (newChapter.content) {
      try {
        ensureDir(`chapters/${newChapter.project_id}`)
        writeTextFile(`chapters/${newChapter.project_id}/${newChapter.id}.txt`, newChapter.content)
      } catch (e) {}
    }

    res.status(201).json(newChapter)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 批量创建章节（从大纲）
router.post('/batch', async (req, res) => {
  try {
    const data = await readFile('chapters.json') || { chapters: [] }
    if (!data.chapters) data.chapters = []

    const items = Array.isArray(req.body.chapters) ? req.body.chapters : []
    if (!req.body.project_id) {
      return res.status(400).json({ error: '必须指定 project_id' })
    }

    const now = new Date().toISOString()
    const nowTs = Date.now()
    const newChapters = items.map((item, i) => {
      const ch = {
        id: `ch_${nowTs}_${i.toString().padStart(3, '0')}`,
        project_id: req.body.project_id,
        chapter_no: item.chapter_no || (i + 1),
        title: item.title || `第 ${i + 1} 章`,
        summary: item.summary || '',
        content: item.content || '',
        status: item.content ? (item.status || 'drafting') : 'outline',
        ai_generated: item.ai_generated === true,
        word_count: (item.content || '').length,
        tags: item.tags || [],
        notes: item.notes || '',
        createdAt: now,
        updatedAt: now
      }
      return ch
    })

    data.chapters.push(...newChapters)
    await writeFile('chapters.json', data)

    // 批量写入 .txt 文件
    for (const ch of newChapters) {
      if (ch.content) {
        try {
          ensureDir(`chapters/${ch.project_id}`)
          writeTextFile(`chapters/${ch.project_id}/${ch.id}.txt`, ch.content)
        } catch (e) {}
      }
    }

    res.status(201).json({
      created: newChapters.length,
      chapters: newChapters
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 更新章节（通常更新正文内容）
router.put('/:id', async (req, res) => {
  try {
    const data = await readFile('chapters.json') || { chapters: [] }
    const idx = (data.chapters || []).findIndex(c => c.id === req.params.id)
    if (idx === -1) {
      return res.status(404).json({ error: '章节不存在' })
    }

    const updatedAt = new Date().toISOString()
    const newContent = req.body.content || ''

    data.chapters[idx] = {
      ...data.chapters[idx],
      ...req.body,
      id: req.params.id,
      word_count: newContent.length || data.chapters[idx].word_count,
      status: newContent ? (req.body.status || 'drafting') : (req.body.status || 'outline'),
      updatedAt: updatedAt
    }

    await writeFile('chapters.json', data)

    // 同步写入独立 .txt 文件
    try {
      if (data.chapters[idx].project_id) {
        ensureDir(`chapters/${data.chapters[idx].project_id}`)
        writeTextFile(
          `chapters/${data.chapters[idx].project_id}/${req.params.id}.txt`,
          data.chapters[idx].content || ''
        )
      }
    } catch (e) {}

    res.json(data.chapters[idx])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 追加文本到章节
router.post('/:id/append', async (req, res) => {
  try {
    const data = await readFile('chapters.json') || { chapters: [] }
    const idx = (data.chapters || []).findIndex(c => c.id === req.params.id)
    if (idx === -1) {
      return res.status(404).json({ error: '章节不存在' })
    }

    const appendText = req.body.text || ''
    if (!appendText) {
      return res.status(400).json({ error: 'text 为空' })
    }

    const currentContent = data.chapters[idx].content || ''
    const newContent = currentContent + (currentContent && !currentContent.endsWith('\n') ? '\n' : '') + appendText
    data.chapters[idx].content = newContent
    data.chapters[idx].word_count = newContent.length
    data.chapters[idx].status = req.body.status || 'drafting'
    data.chapters[idx].updatedAt = new Date().toISOString()

    await writeFile('chapters.json', data)

    // 追加到 .txt 文件
    try {
      if (data.chapters[idx].project_id) {
        ensureDir(`chapters/${data.chapters[idx].project_id}`)
        writeTextFile(
          `chapters/${data.chapters[idx].project_id}/${req.params.id}.txt`,
          newContent
        )
      }
    } catch (e) {}

    res.json(data.chapters[idx])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 标记章节状态
router.put('/:id/status', async (req, res) => {
  try {
    const data = await readFile('chapters.json') || { chapters: [] }
    const idx = (data.chapters || []).findIndex(c => c.id === req.params.id)
    if (idx === -1) {
      return res.status(404).json({ error: '章节不存在' })
    }
    data.chapters[idx].status = req.body.status || data.chapters[idx].status
    data.chapters[idx].updatedAt = new Date().toISOString()
    await writeFile('chapters.json', data)
    res.json(data.chapters[idx])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 删除章节
router.delete('/:id', async (req, res) => {
  try {
    const data = await readFile('chapters.json') || { chapters: [] }
    if (!data.chapters) data.chapters = []

    const found = data.chapters.find(c => c.id === req.params.id)
    if (!found) {
      return res.status(404).json({ error: '章节不存在' })
    }

    data.chapters = data.chapters.filter(c => c.id !== req.params.id)
    await writeFile('chapters.json', data)

    try {
      if (found.project_id) {
        deleteFile(`chapters/${found.project_id}/${req.params.id}.txt`)
      }
    } catch (e) {}

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 删除项目的所有章节
router.delete('/project/:projectId', async (req, res) => {
  try {
    const data = await readFile('chapters.json') || { chapters: [] }
    if (!data.chapters) data.chapters = []

    const before = data.chapters.length
    data.chapters = data.chapters.filter(c => c.project_id !== req.params.projectId)
    await writeFile('chapters.json', data)

    try {
      deleteDir(`chapters/${req.params.projectId}`)
    } catch (e) {}

    res.json({ success: true, deleted: before - data.chapters.length })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 导出项目所有章节为单个 TXT 文件
router.get('/export/:projectId', async (req, res) => {
  try {
    const data = await readFile('chapters.json')
    const chapters = (data?.chapters || [])
      .filter(c => c.project_id === req.params.projectId)
      .sort((a, b) => (a.chapter_no || 0) - (b.chapter_no || 0))

    const lines = []
    for (const ch of chapters) {
      lines.push(`\n========== 第${ch.chapter_no}章: ${ch.title} ==========\n`)
      if (ch.summary) lines.push('【大纲】\n' + ch.summary + '\n')
      if (ch.content) lines.push('\n' + ch.content)
      else lines.push('\n[正文待写]')
    }
    const full = lines.join('\n')

    const filename = `project_${req.params.projectId}_chapters.txt`
    try {
      writeTextFile(`exports/${filename}`, full)
    } catch (e) {}

    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(full)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
