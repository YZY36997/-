import { Router } from 'express'
import { readFile, writeFile } from '../utils/fileHelper.js'

const router = Router()

// 获取设置
router.get('/', async (req, res) => {
  try {
    const data = await readFile('settings.json')
    res.json(data.settings || {})
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 更新设置
router.put('/', async (req, res) => {
  try {
    const data = await readFile('settings.json')
    data.settings = {
      ...data.settings,
      ...req.body
    }
    await writeFile('settings.json', data)
    res.json(data.settings)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
