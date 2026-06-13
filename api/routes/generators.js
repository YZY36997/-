import { Router } from 'express'
import { readFile, writeFile } from '../utils/fileHelper.js'
import axios from 'axios'

const router = Router()

// 获取所有生成器
router.get('/', async (req, res) => {
  try {
    const data = await readFile('generators.json')
    let generators = data.generators || []

    // 按分类筛选
    if (req.query.category) {
      generators = generators.filter(g => g.category === req.query.category)
    }

    // 筛选自定义生成器
    if (req.query.isCustom === 'true') {
      generators = generators.filter(g => g.isCustom === true)
    } else if (req.query.isCustom === 'false') {
      generators = generators.filter(g => g.isCustom === false)
    }

    // 按项目筛选
    if (req.query.project_id) {
      generators = generators.filter(g =>
        g.project_id === req.query.project_id || g.project_id === null
      )
    }

    res.json(generators)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 获取生成器分类
router.get('/categories', async (req, res) => {
  const categories = [
    { id: 'worldview', name: '世界观设定类' },
    { id: 'character', name: '人物角色类' },
    { id: 'plot', name: '剧情桥段类' },
    { id: 'copywriting', name: '文案包装类' },
    { id: 'tool', name: '辅助工具类' }
  ]
  res.json(categories)
})

// 获取单个生成器
router.get('/:id', async (req, res) => {
  try {
    const data = await readFile('generators.json')
    const generator = data.generators.find(g => g.id === req.params.id)
    if (!generator) {
      return res.status(404).json({ error: '生成器不存在' })
    }
    res.json(generator)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 创建自定义生成器
router.post('/', async (req, res) => {
  try {
    const data = await readFile('generators.json')
    const newGenerator = {
      id: `gen_custom_${Date.now()}`,
      category: req.body.category || 'tool',
      name: req.body.name || '自定义生成器',
      description: req.body.description || '',
      systemPrompt: req.body.systemPrompt || '',
      userPromptTemplate: req.body.userPromptTemplate || '',
      defaultParams: req.body.defaultParams || { temperature: 0.8, maxTokens: 2000 },
      isCustom: true,
      project_id: req.body.project_id || null,
      createdAt: new Date().toISOString()
    }
    data.generators.push(newGenerator)
    await writeFile('generators.json', data)
    res.status(201).json(newGenerator)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 更新自定义生成器
router.put('/:id', async (req, res) => {
  try {
    const data = await readFile('generators.json')
    const index = data.generators.findIndex(g => g.id === req.params.id)
    if (index === -1) {
      return res.status(404).json({ error: '生成器不存在' })
    }
    if (!data.generators[index].isCustom) {
      return res.status(403).json({ error: '只能修改自定义生成器' })
    }
    data.generators[index] = {
      ...data.generators[index],
      ...req.body,
      id: req.params.id,
      isCustom: true
    }
    await writeFile('generators.json', data)
    res.json(data.generators[index])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 删除自定义生成器
router.delete('/:id', async (req, res) => {
  try {
    const data = await readFile('generators.json')
    const generator = data.generators.find(g => g.id === req.params.id)
    if (!generator) {
      return res.status(404).json({ error: '生成器不存在' })
    }
    if (!generator.isCustom) {
      return res.status(403).json({ error: '只能删除自定义生成器' })
    }
    data.generators = data.generators.filter(g => g.id !== req.params.id)
    await writeFile('generators.json', data)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 执行生成
router.post('/generate', async (req, res) => {
  try {
    const { generator_id, params, project_id, with_project_material } = req.body

    // 获取生成器配置
    const data = await readFile('generators.json')
    const generator = data.generators.find(g => g.id === generator_id)
    if (!generator) {
      return res.status(404).json({ error: '生成器不存在' })
    }

    // 获取设置
    const settingsData = await readFile('settings.json')
    const settings = settingsData.settings

    // 如果启用了项目素材联动，获取项目素材
    let projectMaterials = []
    if (with_project_material && project_id) {
      const materialsData = await readFile('materials.json')
      projectMaterials = materialsData.materials.filter(
        m => m.project_id === project_id && ['worldview', 'character'].includes(m.category)
      )
    }

    // 构建提示词
    let systemPrompt = generator.systemPrompt
    let userPrompt = generator.userPromptTemplate

    // 注入项目素材到系统提示词
    if (projectMaterials.length > 0) {
      const materialContext = projectMaterials
        .map(m => `[${m.category}:${m.name}]\n${m.content}`)
        .join('\n\n')
      systemPrompt = `以下是当前项目的核心设定，请务必遵循：\n\n${materialContext}\n\n---\n\n${systemPrompt}`
    }

    // 替换用户提示词模板中的变量
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        userPrompt = userPrompt.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
      })
    }

    // 调用AI API
    if (!settings.apiKey) {
      return res.status(400).json({ error: '请先在设置中配置AI API密钥' })
    }

    const response = await axios.post(
      settings.apiEndpoint || 'https://api.openai.com/v1/chat/completions',
      {
        model: settings.model || 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: params?.temperature || generator.defaultParams?.temperature || settings.temperature || 0.8,
        max_tokens: params?.maxTokens || generator.defaultParams?.maxTokens || settings.maxTokens || 2000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`
        },
        timeout: 120000
      }
    )

    const generatedText = response.data.choices[0]?.message?.content || ''

    res.json({
      success: true,
      generated_text: generatedText,
      usage: response.data.usage
    })
  } catch (error) {
    console.error('AI生成失败:', error.response?.data || error.message)
    res.status(500).json({
      error: error.response?.data?.error?.message || error.message || 'AI生成失败'
    })
  }
})

export default router
