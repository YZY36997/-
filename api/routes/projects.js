import { Router } from 'express'
import { readFile, writeFile, getFilePath } from '../utils/fileHelper.js'

const router = Router()

// 获取所有项目
router.get('/', async (req, res) => {
  try {
    const data = await readFile('projects.json')
    res.json(data.projects || [])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 获取单个项目
router.get('/:id', async (req, res) => {
  try {
    const data = await readFile('projects.json')
    const project = data.projects.find(p => p.id === req.params.id)
    if (!project) {
      return res.status(404).json({ error: '项目不存在' })
    }
    res.json(project)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 创建新项目
router.post('/', async (req, res) => {
  try {
    const data = await readFile('projects.json')
    const newProject = {
      id: `proj_${Date.now()}`,
      name: req.body.name || '未命名项目',
      description: req.body.description || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      outline: req.body.outline || {
        title: '',
        summary: '',
        chapters: []
      },
      settings: req.body.settings || {
        genre: '玄幻',
        style: '爽文风'
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
    const index = data.projects.findIndex(p => p.id === req.params.id)
    if (index === -1) {
      return res.status(404).json({ error: '项目不存在' })
    }
    data.projects[index] = {
      ...data.projects[index],
      ...req.body,
      id: req.params.id,
      updatedAt: new Date().toISOString()
    }
    await writeFile('projects.json', data)
    res.json(data.projects[index])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 删除项目
router.delete('/:id', async (req, res) => {
  try {
    const data = await readFile('projects.json')
    const index = data.projects.findIndex(p => p.id === req.params.id)
    if (index === -1) {
      return res.status(404).json({ error: '项目不存在' })
    }
    data.projects.splice(index, 1)
    await writeFile('projects.json', data)

    // 同时删除项目相关的私有素材
    const materialsData = await readFile('materials.json')
    materialsData.materials = materialsData.materials.filter(
      m => m.project_id !== req.params.id
    )
    await writeFile('materials.json', materialsData)

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
