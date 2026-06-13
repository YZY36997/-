import { Router } from 'express'
import { readFile, writeFile, writeTextFile, readTextFile, deleteFile, ensureDir, getSubDir, getFileStat } from '../utils/fileHelper.js'

const router = Router()

/**
 * 角色模型:
 * {
 *   id: string,
 *   project_id: string | null,
 *   name: string,           // 角色名
 *   role: string,           // 身份/职业
 *   gender: string,         // 性别
 *   age: number | null,     // 年龄
 *   personality: string,    // 性格特征
 *   background: string,     // 背景故事
 *   appearance: string,     // 外貌
 *   abilities: string,      // 能力/技能
 *   relationships: string,  // 人际关系
 *   goal: string,           // 目标/动机
 *   content: string,        // 完整角色设定文本
 *   tags: string[],         // 标签
 *   category: string,       // 分类: protagonist / antagonist / supporting / other
 *   createdAt: string,
 *   updatedAt: string
 * }
 */

// 获取所有角色
router.get('/', async (req, res) => {
  try {
    const data = await readFile('characters.json')
    let characters = data?.characters || []

    // 按项目筛选
    if (req.query.project_id === 'global') {
      characters = characters.filter(c => c.project_id === null)
    } else if (req.query.project_id) {
      characters = characters.filter(c => c.project_id === req.query.project_id)
    }

    // 按分类筛选
    if (req.query.category) {
      characters = characters.filter(c => c.category === req.query.category)
    }

    // 关键词搜索
    if (req.query.keyword) {
      const kw = String(req.query.keyword).toLowerCase()
      characters = characters.filter(c =>
        (c.name || '').toLowerCase().includes(kw) ||
        (c.role || '').toLowerCase().includes(kw) ||
        (c.content || '').toLowerCase().includes(kw)
      )
    }

    res.json(characters)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 获取角色分类
router.get('/categories', (req, res) => {
  const categories = [
    { id: 'protagonist', name: '主角' },
    { id: 'antagonist', name: '反派' },
    { id: 'supporting', name: '配角' },
    { id: 'other', name: '其他' }
  ]
  res.json(categories)
})

// 获取单个角色
router.get('/:id', async (req, res) => {
  try {
    const data = await readFile('characters.json')
    const character = (data?.characters || []).find(c => c.id === req.params.id)
    if (!character) {
      return res.status(404).json({ error: '角色不存在' })
    }
    res.json(character)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 创建角色
router.post('/', async (req, res) => {
  try {
    const data = await readFile('characters.json') || { characters: [] }
    if (!data.characters) data.characters = []

    const newChar = {
      id: `char_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      project_id: req.body.project_id || null,
      name: req.body.name || '未命名角色',
      role: req.body.role || '',
      gender: req.body.gender || '',
      age: req.body.age || null,
      personality: req.body.personality || '',
      background: req.body.background || '',
      appearance: req.body.appearance || '',
      abilities: req.body.abilities || '',
      relationships: req.body.relationships || '',
      goal: req.body.goal || '',
      content: req.body.content || '',
      tags: req.body.tags || [],
      category: req.body.category || 'supporting',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    data.characters.push(newChar)
    await writeFile('characters.json', data)

    // 如果有 content 文本，写入独立的 .txt 备份
    if (newChar.content) {
      try {
        const txtDir = ensureDir('characters')
        writeTextFile(`characters/${newChar.id}.txt`, newChar.content)
      } catch (e) { /* 仅作备份，失败不致命 */ }
    }

    res.status(201).json(newChar)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 批量创建角色（从导入文本）
router.post('/batch', async (req, res) => {
  try {
    const data = await readFile('characters.json') || { characters: [] }
    if (!data.characters) data.characters = []

    const items = Array.isArray(req.body.characters) ? req.body.characters : []
    const now = new Date().toISOString()
    const newChars = items.map(item => ({
      id: `char_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      project_id: item.project_id || null,
      name: item.name || '未命名角色',
      role: item.role || '',
      gender: item.gender || '',
      age: item.age || null,
      personality: item.personality || '',
      background: item.background || '',
      appearance: item.appearance || '',
      abilities: item.abilities || '',
      relationships: item.relationships || '',
      goal: item.goal || '',
      content: item.content || '',
      tags: item.tags || [],
      category: item.category || 'supporting',
      createdAt: now,
      updatedAt: now
    }))

    data.characters.push(...newChars)
    await writeFile('characters.json', data)
    res.status(201).json(newChars)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 更新角色
router.put('/:id', async (req, res) => {
  try {
    const data = await readFile('characters.json') || { characters: [] }
    const idx = (data.characters || []).findIndex(c => c.id === req.params.id)
    if (idx === -1) {
      return res.status(404).json({ error: '角色不存在' })
    }
    data.characters[idx] = {
      ...data.characters[idx],
      ...req.body,
      id: req.params.id,
      updatedAt: new Date().toISOString()
    }
    await writeFile('characters.json', data)

    // 更新 .txt 备份
    if (data.characters[idx].content) {
      try {
        writeTextFile(`characters/${req.params.id}.txt`, data.characters[idx].content)
      } catch (e) {}
    }

    res.json(data.characters[idx])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 删除角色
router.delete('/:id', async (req, res) => {
  try {
    const data = await readFile('characters.json') || { characters: [] }
    if (!data.characters) data.characters = []

    const found = data.characters.find(c => c.id === req.params.id)
    if (!found) {
      return res.status(404).json({ error: '角色不存在' })
    }
    data.characters = data.characters.filter(c => c.id !== req.params.id)
    await writeFile('characters.json', data)

    // 删除 .txt 备份
    try {
      deleteFile(`characters/${req.params.id}.txt`)
    } catch (e) {}

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 从文本文件导入角色（浏览器端上传后，后端解析）
router.post('/import', async (req, res) => {
  try {
    const { text, project_id } = req.body
    if (!text) {
      return res.status(400).json({ error: '未提供文本内容' })
    }

    // 简易解析：按"【角色名】"或空行分隔的多个角色
    const raw = String(text)
    const blocks = []

    // 按 "【" / "[" 等分隔符切分
    const parts = raw.split(/\n\s*(?:【|\[)/)
    for (const part of parts) {
      const cleaned = part.replace(/】|\]/g, '').trim()
      if (cleaned.length > 20) {
        const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean)
        const name = lines[0] || '未命名角色'
        const content = lines.slice(1).join('\n')
        blocks.push({ name, content })
      }
    }

    // 如果没切出多个，就整个作为一个角色导入
    let items = blocks
    if (blocks.length === 0) {
      items = [{ name: '导入角色', content: raw }]
    }

    // 写入数据库
    const data = await readFile('characters.json') || { characters: [] }
    if (!data.characters) data.characters = []

    const now = new Date().toISOString()
    const newChars = items.map(item => ({
      id: `char_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      project_id: project_id || null,
      name: item.name || '未命名角色',
      role: '',
      gender: '',
      age: null,
      personality: '',
      background: '',
      appearance: '',
      abilities: '',
      relationships: '',
      goal: '',
      content: item.content || '',
      tags: ['导入'],
      category: 'supporting',
      createdAt: now,
      updatedAt: now
    }))

    data.characters.push(...newChars)
    await writeFile('characters.json', data)

    // .txt 备份
    for (const c of newChars) {
      try { writeTextFile(`characters/${c.id}.txt`, c.content) } catch (e) {}
    }

    res.json({
      success: true,
      imported: newChars.length,
      characters: newChars
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
