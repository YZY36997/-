import { Router } from 'express'
import { readFile, writeFile } from '../utils/fileHelper.js'

const router = Router()

// 获取所有模板
router.get('/', async (req, res) => {
  try {
    const data = await readFile('templates.json')
    let templates = data.templates || []

    // 按题材筛选
    if (req.query.genre) {
      templates = templates.filter(t => t.genre === req.query.genre)
    }

    // 按功能筛选
    if (req.query.function) {
      templates = templates.filter(t => t.function === req.query.function)
    }

    // 筛选收藏
    if (req.query.favorite === 'true') {
      templates = templates.filter(t => t.isFavorite)
    }

    res.json(templates)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 获取单个模板
router.get('/:id', async (req, res) => {
  try {
    const data = await readFile('templates.json')
    const template = data.templates.find(t => t.id === req.params.id)
    if (!template) {
      return res.status(404).json({ error: '模板不存在' })
    }
    res.json(template)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 更新模板（收藏）
router.put('/:id', async (req, res) => {
  try {
    const data = await readFile('templates.json')
    const index = data.templates.findIndex(t => t.id === req.params.id)
    if (index === -1) {
      return res.status(404).json({ error: '模板不存在' })
    }
    if (req.body.isFavorite !== undefined) {
      data.templates[index].isFavorite = req.body.isFavorite
    }
    await writeFile('templates.json', data)
    res.json(data.templates[index])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 获取模板分类
router.get('/meta/categories', async (req, res) => {
  const genres = [
    { id: '玄幻', name: '玄幻' },
    { id: '仙侠', name: '仙侠' },
    { id: '都市', name: '都市' },
    { id: '古言', name: '古代言情' },
    { id: '现言', name: '现代言情' },
    { id: '悬疑', name: '悬疑' },
    { id: '科幻', name: '科幻' }
  ]
  const functions = [
    { id: '开局', name: '开局' },
    { id: '反转', name: '反转' },
    { id: '高潮', name: '高潮' },
    { id: '收尾', name: '收尾' }
  ]
  res.json({ genres, functions })
})

export default router
