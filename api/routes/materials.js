import { Router } from 'express'
import { readFile, writeFile } from '../utils/fileHelper.js'
import { v4 as uuidv4 } from 'uuid'

const router = Router()

// 获取所有素材
router.get('/', async (req, res) => {
  try {
    const data = await readFile('materials.json')
    let materials = data.materials || []

    // 按项目筛选
    if (req.query.project_id === 'global') {
      materials = materials.filter(m => m.project_id === null)
    } else if (req.query.project_id) {
      materials = materials.filter(m => m.project_id === req.query.project_id)
    }

    // 按分类筛选
    if (req.query.category) {
      materials = materials.filter(m => m.category === req.query.category)
    }

    // 按关键词搜索
    if (req.query.keyword) {
      const keyword = req.query.keyword.toLowerCase()
      materials = materials.filter(m =>
        m.name.toLowerCase().includes(keyword) ||
        m.content.toLowerCase().includes(keyword)
      )
    }

    res.json(materials)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 获取全局素材
router.get('/global', async (req, res) => {
  try {
    const data = await readFile('materials.json')
    const globalMaterials = data.materials.filter(m => m.project_id === null)
    res.json(globalMaterials)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 获取项目私有素材
router.get('/project/:projectId', async (req, res) => {
  try {
    const data = await readFile('materials.json')
    const projectMaterials = data.materials.filter(
      m => m.project_id === req.params.projectId
    )
    res.json(projectMaterials)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 获取单个素材
router.get('/:id', async (req, res) => {
  try {
    const data = await readFile('materials.json')
    const material = data.materials.find(m => m.id === req.params.id)
    if (!material) {
      return res.status(404).json({ error: '素材不存在' })
    }
    res.json(material)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 创建素材
router.post('/', async (req, res) => {
  try {
    const data = await readFile('materials.json')
    const newMaterial = {
      id: `mat_${Date.now()}`,
      project_id: req.body.project_id || null,
      category: req.body.category || 'setting',
      subCategory: req.body.subCategory || '',
      name: req.body.name || '未命名素材',
      content: req.body.content || '',
      tags: req.body.tags || [],
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

// 批量创建素材
router.post('/batch', async (req, res) => {
  try {
    const data = await readFile('materials.json')
    const newMaterials = (req.body.materials || []).map(m => ({
      id: `mat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      project_id: m.project_id || null,
      category: m.category || 'setting',
      subCategory: m.subCategory || '',
      name: m.name || '未命名素材',
      content: m.content || '',
      tags: m.tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }))
    data.materials.push(...newMaterials)
    await writeFile('materials.json', data)
    res.status(201).json(newMaterials)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 更新素材
router.put('/:id', async (req, res) => {
  try {
    const data = await readFile('materials.json')
    const index = data.materials.findIndex(m => m.id === req.params.id)
    if (index === -1) {
      return res.status(404).json({ error: '素材不存在' })
    }
    data.materials[index] = {
      ...data.materials[index],
      ...req.body,
      id: req.params.id,
      updatedAt: new Date().toISOString()
    }
    await writeFile('materials.json', data)
    res.json(data.materials[index])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 删除素材
router.delete('/:id', async (req, res) => {
  try {
    const data = await readFile('materials.json')
    const index = data.materials.findIndex(m => m.id === req.params.id)
    if (index === -1) {
      return res.status(404).json({ error: '素材不存在' })
    }
    data.materials.splice(index, 1)
    await writeFile('materials.json', data)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
