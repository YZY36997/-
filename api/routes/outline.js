import { Router } from 'express'
import { readFile, writeFile } from '../utils/fileHelper.js'
import axios from 'axios'

const router = Router()

// 导入大纲（自动创建项目）
router.post('/import', async (req, res) => {
  try {
    const { outline, project_name, auto_split } = req.body

    // 创建新项目
    const projectsData = await readFile('projects.json')
    const newProject = {
      id: `proj_${Date.now()}`,
      name: project_name || '新项目',
      description: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      outline: {
        title: outline.title || '',
        summary: outline.summary || '',
        chapters: outline.chapters || []
      },
      settings: {
        genre: outline.genre || '玄幻',
        style: outline.style || '爽文风'
      }
    }
    projectsData.projects.push(newProject)
    await writeFile('projects.json', projectsData)

    // 自动拆分素材
    if (auto_split && outline.content) {
      const materialsData = await readFile('materials.json')
      const extractedMaterials = extractMaterialsFromOutline(outline.content, newProject.id)
      materialsData.materials.push(...extractedMaterials)
      await writeFile('materials.json', materialsData)
    }

    res.status(201).json({
      project: newProject,
      message: auto_split ? '项目创建成功，素材已自动拆分' : '项目创建成功'
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 补全残缺大纲
router.post('/complete', async (req, res) => {
  try {
    const { incomplete_outline, style, project_id, multiple_versions } = req.body

    // 获取设置
    const settingsData = await readFile('settings.json')
    const settings = settingsData.settings

    // 获取项目素材
    let projectContext = ''
    if (project_id) {
      const materialsData = await readFile('materials.json')
      const projectMaterials = materialsData.materials.filter(m => m.project_id === project_id)
      if (projectMaterials.length > 0) {
        projectContext = '项目已有设定：\n' + projectMaterials
          .map(m => `[${m.name}]\n${m.content}`)
          .join('\n\n')
      }
    }

    const systemPrompt = `你是一个专业的网文大纲策划专家，擅长补全和完善不完整的大纲。请根据残缺大纲补全完整的大纲。`
    const userPrompt = `${projectContext}\n\n残缺大纲：\n${incomplete_outline}\n\n期望风格：${style || '剧情流'}\n\n请补全这个大纲，包括：\n1. 完整的起承转合\n2. 分卷/章节安排\n3. 主要转折点\n4. 结局设计\n\n${multiple_versions ? '请生成2-3个不同版本的完整大纲供选择。' : '请生成一个完整的详细大纲。'}`

    if (!settings.apiKey) {
      return res.status(400).json({ error: '请先在设置中配置AI API密钥' })
    }

    const response = await axios.post(
      settings.apiEndpoint,
      {
        model: settings.model || 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.8,
        max_tokens: 4000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`
        },
        timeout: 120000
      }
    )

    const completedOutline = response.data.choices[0]?.message?.content || ''

    res.json({
      success: true,
      completed_outline: completedOutline
    })
  } catch (error) {
    console.error('大纲补全失败:', error.message)
    res.status(500).json({ error: error.message || '大纲补全失败' })
  }
})

// 合成多份大纲
router.post('/merge', async (req, res) => {
  try {
    const { outlines, style, project_id } = req.body

    if (!Array.isArray(outlines) || outlines.length < 2) {
      return res.status(400).json({ error: '请提供至少2份大纲进行合成' })
    }

    // 获取设置
    const settingsData = await readFile('settings.json')
    const settings = settingsData.settings

    // 获取项目素材
    let projectContext = ''
    if (project_id) {
      const materialsData = await readFile('materials.json')
      const projectMaterials = materialsData.materials.filter(m => m.project_id === project_id)
      if (projectMaterials.length > 0) {
        projectContext = '项目已有设定：\n' + projectMaterials
          .map(m => `[${m.name}]\n${m.content}`)
          .join('\n\n')
      }
    }

    const systemPrompt = `你是一个专业的网文大纲策划专家，擅长将多个大纲合成为逻辑通顺的完整大纲。`
    const userPrompt = `${projectContext}\n\n请合成以下${outlines.length}份大纲，梳理时间线、去重冲突、拼接逻辑，生成一份完整的总大纲。\n\n待合成的大纲：\n${outlines.map((o, i) => `【大纲${i + 1}】\n${typeof o === 'string' ? o : o.content}`).join('\n\n')}\n\n期望风格：${style || '剧情流'}\n\n请生成：\n1. 梳理后的时间线\n2. 去重后的冲突设计\n3. 完整的总大纲`
    if (!settings.apiKey) {
      return res.status(400).json({ error: '请先在设置中配置AI API密钥' })
    }

    const response = await axios.post(
      settings.apiEndpoint,
      {
        model: settings.model || 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.8,
        max_tokens: 4000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`
        },
        timeout: 120000
      }
    )

    const mergedOutline = response.data.choices[0]?.message?.content || ''

    res.json({
      success: true,
      merged_outline: mergedOutline
    })
  } catch (error) {
    console.error('大纲合成失败:', error.message)
    res.status(500).json({ error: error.message || '大纲合成失败' })
  }
})

// 拆分大纲为素材
router.post('/split', async (req, res) => {
  try {
    const { outline_content, project_id } = req.body

    if (!project_id) {
      return res.status(400).json({ error: '请指定项目ID' })
    }

    // 使用AI自动识别并拆分素材
    const settingsData = await readFile('settings.json')
    const settings = settingsData.settings

    const systemPrompt = `你是一个专业的素材识别专家，擅长从小说大纲中提取各类素材。请从以下大纲内容中识别并提取素材，按类别整理。`
    const userPrompt = `请从以下大纲中提取素材，分类整理：\n\n${outline_content}\n\n请按以下类别提取：\n1. 世界观设定（势力宗门、功法体系、世界规则等）\n2. 人物设定（主角、配角、反派等）\n3. 场景设定（重要场景、地点等）\n4. 剧情桥段（重要事件、高潮等）\n\n以JSON格式输出，格式：\n{\n  "materials": [\n    {"category": "worldview/character/scene/plot", "name": "素材名", "content": "素材内容", "subCategory": "子分类"}\n  ]\n}`
    if (!settings.apiKey) {
      return res.status(400).json({ error: '请先在设置中配置AI API密钥' })
    }

    const response = await axios.post(
      settings.apiEndpoint,
      {
        model: settings.model || 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.5,
        max_tokens: 3000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`
        },
        timeout: 120000
      }
    )

    const extractedText = response.data.choices[0]?.message?.content || ''

    // 解析JSON
    let extractedMaterials = []
    try {
      const jsonMatch = extractedText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        extractedMaterials = (parsed.materials || []).map(m => ({
          ...m,
          id: `mat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          project_id: project_id,
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }))
      }
    } catch (parseError) {
      console.error('解析提取结果失败:', parseError)
    }

    // 保存到素材库
    if (extractedMaterials.length > 0) {
      const materialsData = await readFile('materials.json')
      materialsData.materials.push(...extractedMaterials)
      await writeFile('materials.json', materialsData)
    }

    res.json({
      success: true,
      extracted_count: extractedMaterials.length,
      materials: extractedMaterials
    })
  } catch (error) {
    console.error('素材拆分失败:', error.message)
    res.status(500).json({ error: error.message || '素材拆分失败' })
  }
})

// 辅助函数：从大纲内容中提取素材
function extractMaterialsFromOutline(content, projectId) {
  const materials = []
  // 简单的内容提取，实际应该用AI
  return materials
}

export default router
