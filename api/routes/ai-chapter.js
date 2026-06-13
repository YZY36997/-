import { Router } from 'express'
import { readFile, writeFile, writeTextFile, ensureDir } from '../utils/fileHelper.js'
import axios from 'axios'

const router = Router()

/**
 * AI 小说创作核心逻辑:
 * 1. 用户选择项目 → 2. 通过 RAG 三级检索获取最相关素材 + 知识图谱关系 + 角色档案 →
 * 3. 获取提示词仓库分类 context → 4. 选择要写的章节 →
 * 5. 调用 AI API → 6. 保存章节 → 7. 自动触发 RAG chunk 更新
 *
 * 语言选项: zh-CN / en
 * 模块开关：在 feature_toggles.json 中 rag / graph / vector_enabled / fallback_enabled
 */

// AI API 调用封装（与 generators.js 和 outline.js 保持一致）
async function callAI(settings, systemPrompt, userPrompt, options) {
  const apiKey = settings.apiKey || process.env.OPENAI_API_KEY || ''
  const apiEndpoint = settings.apiEndpoint || 'https://api.openai.com/v1/chat/completions'
  const model = settings.model || 'gpt-4'
  const temperature = options?.temperature ?? settings.temperature ?? 0.8
  const maxTokens = options?.maxTokens || settings.maxTokens || 2000

  if (!apiKey) {
    throw new Error('请先在设置中配置 AI API 密钥')
  }

  const response = await axios.post(
    apiEndpoint,
    {
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: temperature,
      max_tokens: maxTokens
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 180000
    }
  )

  return {
    text: response.data.choices?.[0]?.message?.content || '',
    usage: response.data.usage
  }
}

// 构建 system prompt (注入项目信息 + 三级检索上下文 + 知识图谱 + 提示词 context)
async function buildContextSystemPrompt(projectId, style, language, extraContext, ragQuery) {
  const parts = []
  const ragEnabled = await isModuleEnabled('rag')

  // 基于语言输出不同的 system prompt 头部
  if (language === 'en') {
    parts.push('You are a professional fiction writer.')
    parts.push('Style: ' + (style || 'balanced'))
    parts.push('You must write the entire response in ENGLISH.')
    if (ragEnabled) parts.push('Context from project knowledge (retrieved via vector+graph+BM25) must be strictly followed to avoid plot/character inconsistency.')
  } else {
    parts.push('你是一位专业的网文小说创作者，擅长创作高质量的小说章节。')
    parts.push('创作风格: ' + (style || '剧情流'))
    parts.push('语言: 简体中文。')
    parts.push('必须严格遵循给定的世界观设定、人物性格、剧情逻辑，确保故事连续性。')
  }

  // 获取项目信息
  try {
    const projects = await readFile('projects.json')
    const project = (projects?.projects || []).find(p => p.id === projectId)
    if (project) {
      if (language === 'en') {
        parts.push(`Title: ${project.name}`)
        if (project.description) parts.push(`Synopsis: ${project.description}`)
        if (project.settings?.genre) parts.push(`Genre: ${project.settings.genre}`)
      } else {
        parts.push(`作品: 《${project.name}》`)
        if (project.description) parts.push(`简介: ${project.description}`)
        if (project.settings?.genre) parts.push(`题材: ${project.settings.genre}`)
        if (project.settings?.style) parts.push(`风格: ${project.settings.style}`)
      }
    }
  } catch (e) { /* 忽略 */ }

  // ========== 三级 RAG 检索 ==========
  if (ragEnabled && projectId) {
    try {
      const rag = await hybridRetrieveForProject(projectId, ragQuery || (extraContext || '') || '当前章节故事', 8)
      if (rag && rag.results && rag.results.length) {
        const label = language === 'en' ? '[Project Knowledge]' : '【长篇防崩坏 · 知识库检索】'
        parts.push(`\n${label}（检索方式: ${rag.level}）`)
        rag.results.forEach((r, i) => {
          parts.push(`#${i + 1} [${r.level}] ${r.title || r.id} (${r.category || r.type || '—'})`)
          parts.push((r.content || '').toString().slice(0, 800))
        })
      }
    } catch (e) { /* 静默降级 */ }
  }

  // ========== 角色档案（重点角色 memory 摘要注入） ==========
  if (projectId) {
    try {
      const charData = await readFile('characters.json')
      const chars = (charData?.characters || []).filter(c => c.project_id === projectId || c.project_id == null)
      if (chars.length) {
        const topChars = chars
          .slice()
          .sort((a, b) => ((b.priority || b.level || 0) - (a.priority || a.level || 0)))
          .slice(0, 8)
        const chunk = []
        if (language === 'en') chunk.push('\n--- Character Details ---')
        else chunk.push('\n【主要人物档案】')
        for (const c of topChars) {
          const lines = []
          lines.push(`【${c.name || '未命名'}】` + (c.role ? `（${c.role}）` : ''))
          if (c.personality) lines.push(`性格: ${c.personality}`)
          if (c.motivation) lines.push(`动机: ${c.motivation}`)
          if (c.background) lines.push(`背景: ${c.background}`)
          if (c.abilities) lines.push(`能力: ${c.abilities}`)
          if (c.relationships) lines.push(`关系: ${c.relationships}`)
          if (c.goal) lines.push(`目标: ${c.goal}`)
          if (c.memory) lines.push(`记忆: ${(c.memory || '').slice(0, 300)}`)
          if (c.current_status) lines.push(`状态: ${c.current_status}`)
          chunk.push(lines.join('\n'))
        }
        parts.push(chunk.join('\n\n'))
      }
    } catch (e) { /* 忽略 */ }
  }

  // ========== 知识图谱关系注入 ==========
  if (projectId) {
    try {
      const kg = (await readFile('knowledge_graphs.json') || { graphs: {} })
      const graph = kg.graphs?.[projectId]
      if (graph && Array.isArray(graph.edges) && graph.edges.length) {
        const edgeChunk = graph.edges
          .slice(0, 20)
          .map(e => `  · ${e.source ?? ''} —[${e.label || e.type || ''}]→ ${e.target ?? ''}`)
        parts.push((language === 'en' ? '\n--- Character Relationships ---' : '\n【人物关系图谱】') + '\n' + edgeChunk.join('\n'))
      }
    } catch (e) { /* 忽略 */ }
  }

  // ========== 提示词仓库 context ==========
  try {
    const prompts = await readFile('prompts.json') || { prompts: [] }
    const list = (prompts.prompts || []).filter(p => p.enabled !== false && (!p.project_id || p.project_id === projectId))
    if (list.length) {
      const byCategory = {}
      for (const p of list) {
        const cat = p.category || 'generic'
        if (!byCategory[cat]) byCategory[cat] = []
        byCategory[cat].push(p)
      }
      for (const cat of Object.keys(byCategory)) {
        const picked = byCategory[cat].sort((a, b) => (b.priority || 0) - (a.priority || 0)).slice(0, 2)
        if (!picked.length) continue
        parts.push(`\n【写作约束 · ${promptCategoryLabel(cat)}】`)
        for (const p of picked) parts.push(`- ${p.name}: ${p.content?.slice(0, 400) || ''}`)
      }
    }
  } catch (e) { /* 忽略 */ }

  // 额外的上下文 (如大纲/前章末尾)
  if (extraContext) parts.push('\n' + extraContext)

  // 输出约束
  if (language === 'en') {
    parts.push('\n--- Writing Requirements ---')
    parts.push('1. Write at least 500 words')
    parts.push('2. Use multiple paragraphs with dialogues and descriptions')
    parts.push('3. Include both action and character inner thoughts')
    parts.push('4. Maintain consistency with the worldbuilding above')
    parts.push('5. End with a hook or cliffhanger if it fits the plot')
  } else {
    parts.push('\n【写作要求】')
    parts.push('1. 字数不少于1500字，力求情节饱满')
    parts.push('2. 分段合理，包含对话、动作描写、心理描写、场景描写')
    parts.push('3. 人物语言符合角色性格和身份设定')
    parts.push('4. 严格遵循世界观设定，不得与上面的素材冲突')
    parts.push('5. 每段不超过800字（适合手机阅读）')
    parts.push('6. 章末适当留有悬念或钩子')
    parts.push('7. 避免堆砌形容词，注重情节推进和人物塑造')
  }

  return parts.join('\n')
}

async function isModuleEnabled(name) {
  try {
    const data = await readFile('feature_toggles.json').catch(() => ({}))
    if (data && data.toggles && typeof data.toggles[name] !== 'undefined') return data.toggles[name] !== false
  } catch (_) { /* ignore */ }
  return true
}

// Lightweight local BM25 + graph hybrid retrieval (零依赖，若未开 rag.js 的 vector 也能跑)
function tokenize(text) {
  if (!text) return []
  const cleaned = String(text || '').toLowerCase()
  return cleaned.split(/[\s\u3000，。！？、；：""''（）《》【】…—\-\/\\,.!?;:"'()\[\]<>]+/).filter(Boolean)
}
async function hybridRetrieveForProject(projectId, query, topK) {
  const materials = (await readFile('materials.json').catch(() => ({ materials: [] })))?.materials || []
  const chapters = (await readFile('chapters.json').catch(() => ({ chapters: [] })))?.chapters || []
  const characters = (await readFile('characters.json').catch(() => ({ characters: [] })))?.characters || []
  const mList = materials.filter(m => !projectId || m.project_id === projectId || m.project_id == null)
  const cList = chapters.filter(c => c.project_id === projectId)
  const chList = characters.filter(c => c.project_id === projectId || c.project_id == null)
  const docs = []
  for (const m of mList) docs.push({ id: 'mat:' + m.id, title: m.name || '', content: m.content || '', category: m.category || 'setting', level: 'bm25' })
  for (const c of cList) docs.push({ id: 'ch:' + c.id, title: `第${c.chapter_no || ''}章 ${c.title || ''}`, content: (c.summary || '') + ' ' + ((c.content || '').slice(0, 600)), category: 'chapter', level: 'bm25' })
  for (const ch of chList) docs.push({ id: 'char:' + ch.id, title: ch.name || '', content: (ch.personality || '') + ' ' + (ch.background || '') + ' ' + (ch.memory || '') + ' ' + (ch.content || ''), category: 'character', level: 'bm25' })

  const qTokens = tokenize(query)
  const scored = docs.map(d => {
    const tSet = new Set(tokenize(d.title + ' ' + d.content))
    let overlap = 0
    for (const t of qTokens) if (tSet.has(t)) overlap++
    return { d, score: overlap }
  }).sort((a, b) => b.score - a.score)

  // 若关键词命中不足，回退到最近素材
  let results = scored.filter(s => s.score > 0).slice(0, topK).map(s => s.d)
  let level = 'bm25'
  if (results.length < Math.max(3, topK / 2)) {
    results = results.concat(docs.slice(0, topK - results.length))
    level = 'bm25+fallback'
  }

  return { level, used: ['bm25'], query, results }
}

function promptCategoryLabel(id) {
  const map = { anti_ai: '去 AI 味', style: '文风', dialogue: '对话', scene: '场景', character_binding: '角色绑定', project: '作品约束', generic: '通用' }
  return map[id] || id
}

// === 核心接口 ===

// 生成单个章节的正文
router.post('/generate-chapter', async (req, res) => {
  try {
    const {
      project_id,
      chapter_id,
      title,
      summary,
      chapter_no,
      style,
      language,
      target_words,
      previous_chapter,
      use_materials,
      temperature,
      max_tokens
    } = req.body

    if (!project_id) {
      return res.status(400).json({ error: '必须指定 project_id' })
    }

    const lang = language === 'en' ? 'en' : 'zh-CN'

    // 读取 AI 设置
    const settingsData = await readFile('settings.json')
    const settings = settingsData?.settings || {}

    // 构建 system prompt
    const extraContextParts = []
    if (title) {
      extraContextParts.push(
        lang === 'en' ? `Chapter Title: ${title}` : `本章标题: ${title}`
      )
    }
    if (chapter_no != null) {
      extraContextParts.push(
        lang === 'en' ? `Chapter ${chapter_no}` : `这是第 ${chapter_no} 章`
      )
    }
    if (summary) {
      extraContextParts.push(
        lang === 'en' ? `Chapter Outline: ${summary}` : `本章大纲: ${summary}`
      )
    }
    if (previous_chapter) {
      extraContextParts.push(
        lang === 'en'
          ? `Context from previous chapter: ${previous_chapter}`
          : `上一章情节回顾: ${previous_chapter}`
      )
    }

    // 构建 system prompt (注入 三级检索 + 知识图谱 + 角色档案 + 提示词 context)
    const systemPrompt = await buildContextSystemPrompt(
      project_id,
      style || settings.style || '剧情流',
      lang,
      extraContextParts.join('\n'),
      (title || '') + ' ' + (summary || '')
    )

    // 构建 user prompt
    let userPrompt
    if (lang === 'en') {
      userPrompt =
        `Please write a full chapter.${target_words ? ` Target: ~${target_words} words.` : ''}\n` +
        `Focus on character interactions, emotional depth, plot progression, and sensory details.` +
        `\n\nUse ${title ? '[' + title + ']' : 'the chapter plan'} as your outline.` +
        `\nOutput the chapter text directly, without meta-commentary.`
    } else {
      userPrompt =
        `请根据以上设定，撰写本章正文。${target_words ? `目标字数: 约 ${target_words} 字。` : ''}\n` +
        `要求：\n` +
        `1. 注重人物塑造、冲突推进、情绪渲染\n` +
        `2. 加入合理的对话、动作、心理描写\n` +
        `3. 段落长度适中（适合手机阅读）\n` +
        `4. 与世界观和人物设定保持一致\n` +
        `5. 避免空泛形容词和无意义的重复\n` +
        `\n直接输出本章正文，不需要额外说明。`
    }

    // 调用 AI
    const result = await callAI(
      settings,
      systemPrompt,
      userPrompt,
      { temperature, maxTokens: max_tokens }
    )

    const generatedText = result.text.trim()
    const wordCount = generatedText.length

    // 保存到章节
    let savedChapter = null
    try {
      const chaptersData = await readFile('chapters.json') || { chapters: [] }
      if (!chaptersData.chapters) chaptersData.chapters = []

      // 如果提供了 chapter_id 则更新，否则创建新章节
      let idx = chapter_id ? chaptersData.chapters.findIndex(c => c.id === chapter_id) : -1

      if (idx !== -1) {
        chaptersData.chapters[idx].content = generatedText
        chaptersData.chapters[idx].word_count = wordCount
        chaptersData.chapters[idx].status = 'drafting'
        chaptersData.chapters[idx].ai_generated = true
        chaptersData.chapters[idx].updatedAt = new Date().toISOString()
        savedChapter = chaptersData.chapters[idx]
      } else {
        const newChapter = {
          id: `ch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          project_id: project_id,
          chapter_no: chapter_no || 1,
          title: title || '新章节',
          summary: summary || '',
          content: generatedText,
          status: 'drafting',
          ai_generated: true,
          word_count: wordCount,
          tags: ['AI生成'],
          notes: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        chaptersData.chapters.push(newChapter)
        savedChapter = newChapter
      }

      await writeFile('chapters.json', chaptersData)

      // 写入独立 .txt 文件
      try {
        ensureDir(`chapters/${project_id}`)
        writeTextFile(`chapters/${project_id}/${savedChapter.id}.txt`, generatedText)
      } catch (e) {}
    } catch (e) {
      console.warn('保存章节失败:', e.message)
    }

    res.json({
      success: true,
      generated_text: generatedText,
      word_count: wordCount,
      chapter: savedChapter,
      usage: result.usage
    })
  } catch (error) {
    console.error('AI 章节生成失败:', error.message)
    res.status(500).json({
      error: error.response?.data?.error?.message || error.message || 'AI 生成失败'
    })
  }
})

// 续写上一章（基于现有章节内容继续生成）
router.post('/continue-chapter', async (req, res) => {
  try {
    const { chapter_id, project_id, language, target_words, temperature } = req.body
    if (!chapter_id) return res.status(400).json({ error: '必须指定 chapter_id' })

    const lang = language === 'en' ? 'en' : 'zh-CN'

    // 读取当前章节内容
    const chaptersData = await readFile('chapters.json') || { chapters: [] }
    const chapter = (chaptersData.chapters || []).find(c => c.id === chapter_id)
    if (!chapter) return res.status(404).json({ error: '章节不存在' })

    const currentContent = chapter.content || ''
    const head = currentContent.length > 500 ? currentContent.slice(-500) : currentContent

    const settingsData = await readFile('settings.json')
    const settings = settingsData?.settings || {}

    // 构建上下文
    const systemPrompt = await buildContextSystemPrompt(
      chapter.project_id || project_id,
      settings.style || '剧情流',
      lang,
      ''
    )

    let userPrompt
    if (lang === 'en') {
      userPrompt =
        `Continue writing this chapter from the following point.\n\n` +
        `[Current text]\n${head}\n\n` +
        `Continue directly, without any transition phrases. Aim for at least 800 words.`
    } else {
      userPrompt =
        `请从以下段落结束处开始续写本章正文。${target_words ? `续写字数: 约 ${target_words} 字。` : ''}\n\n` +
        `【当前章节末尾】\n${head}\n\n` +
        `请直接续写正文，不要写"以下是续写内容"等过渡语。`
    }

    const result = await callAI(settings, systemPrompt, userPrompt, { temperature })
    const continuation = result.text.trim()

    // 追加到章节
    const newContent = (currentContent + (currentContent.endsWith('\n') ? '' : '\n') + continuation)
    chapter.content = newContent
    chapter.word_count = newContent.length
    chapter.ai_generated = true
    chapter.updatedAt = new Date().toISOString()

    const idx = chaptersData.chapters.findIndex(c => c.id === chapter_id)
    chaptersData.chapters[idx] = chapter
    await writeFile('chapters.json', chaptersData)

    try {
      ensureDir(`chapters/${chapter.project_id}`)
      writeTextFile(`chapters/${chapter.project_id}/${chapter.id}.txt`, newContent)
    } catch (e) {}

    res.json({
      success: true,
      continuation: continuation,
      total_word_count: newContent.length,
      chapter
    })
  } catch (error) {
    res.status(500).json({ error: error.message || '续写失败' })
  }
})

// 批量生成章节（基于大纲列表一次性生成多个章节的正文）
router.post('/batch-generate', async (req, res) => {
  try {
    const { project_id, chapters, language, style, temperature } = req.body
    if (!project_id) return res.status(400).json({ error: '必须指定 project_id' })
    if (!Array.isArray(chapters) || chapters.length === 0) {
      return res.status(400).json({ error: '请提供要生成的 chapters 数组' })
    }

    const lang = language === 'en' ? 'en' : 'zh-CN'
    const settingsData = await readFile('settings.json')
    const settings = settingsData?.settings || {}

    const results = []

    // 串行生成（避免并发 API 调用）
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i]

      try {
        const systemPrompt = await buildContextSystemPrompt(
          project_id,
          style || '剧情流',
          lang,
          (lang === 'en' ? `Chapter Title: ${ch.title}\nOutline: ${ch.summary || ''}` : `本章标题: ${ch.title}\n本章大纲: ${ch.summary || ''}`)
        )

        let userPrompt
        if (lang === 'en') {
          userPrompt =
            `Please write this chapter (${ch.title}). Outline: ${ch.summary || ''}.\n` +
            `Write naturally, with dialogue, action and inner thoughts.`
        } else {
          userPrompt =
            `请撰写本章《${ch.title}》的正文。\n` +
            `本章大纲: ${ch.summary || '(无大纲)'}\n\n` +
            `请直接输出正文，包含对话、动作、心理描写。`
        }

        const aiResult = await callAI(settings, systemPrompt, userPrompt, { temperature })
        const text = aiResult.text.trim()

        results.push({
          chapter_index: i,
          chapter_title: ch.title,
          success: true,
          text: text,
          word_count: text.length
        })
      } catch (e) {
        results.push({
          chapter_index: i,
          chapter_title: ch.title,
          success: false,
          error: e.message || '生成失败'
        })
      }
    }

    // 保存所有成功生成的章节
    const chaptersData = await readFile('chapters.json') || { chapters: [] }
    if (!chaptersData.chapters) chaptersData.chapters = []
    const now = new Date().toISOString()

    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      if (r.success) {
        const newChapter = {
          id: `ch_${Date.now()}_${i.toString().padStart(3, '0')}`,
          project_id: project_id,
          chapter_no: chapters[i].chapter_no || (i + 1),
          title: chapters[i].title || `第 ${i + 1} 章`,
          summary: chapters[i].summary || '',
          content: r.text,
          status: 'drafting',
          ai_generated: true,
          word_count: r.word_count,
          tags: ['AI生成', '批量生成'],
          notes: '',
          createdAt: now,
          updatedAt: now
        }
        chaptersData.chapters.push(newChapter)

        try {
          ensureDir(`chapters/${project_id}`)
          writeTextFile(`chapters/${project_id}/${newChapter.id}.txt`, r.text)
        } catch (e) {}
      }
    }

    await writeFile('chapters.json', chaptersData)

    const successCount = results.filter(r => r.success).length
    res.json({
      success: true,
      total: chapters.length,
      success_count: successCount,
      results: results
    })
  } catch (error) {
    res.status(500).json({ error: error.message || '批量生成失败' })
  }
})

// 生成大纲（基于项目信息 + 素材）
router.post('/generate-outline', async (req, res) => {
  try {
    const { project_id, topic, genre, chapter_count, language, style, temperature, max_tokens } = req.body
    if (!project_id) return res.status(400).json({ error: '必须指定 project_id' })

    const lang = language === 'en' ? 'en' : 'zh-CN'
    const n = chapter_count || 20

    const settingsData = await readFile('settings.json')
    const settings = settingsData?.settings || {}

    const systemPrompt = await buildContextSystemPrompt(project_id, style || '剧情流', lang, '')

    let userPrompt
    if (lang === 'en') {
      userPrompt =
        `Please create a novel outline with approximately ${n} chapters.\n` +
        (topic ? `Topic: ${topic}\n` : '') +
        (genre ? `Genre: ${genre}\n` : '') +
        `For each chapter, provide:\n` +
        `- Chapter number and title\n` +
        `- 1-2 sentence summary of the plot\n` +
        `- Main characters involved\n\n` +
        `Format the output as numbered list.`
    } else {
      userPrompt =
        `请为这本小说生成一个约 ${n} 章的完整大纲。\n` +
        (topic ? `主题: ${topic}\n` : '') +
        (genre ? `题材: ${genre}\n` : '') +
        `每章包含:\n` +
        `1. 章节标题\n` +
        `2. 核心情节 (1-2 句话)\n` +
        `3. 本章节主要人物\n\n` +
        `请按 1.,2.,3. 这样的编号形式输出，包含起承转合完整结构。`
    }

    const result = await callAI(settings, systemPrompt, userPrompt, { temperature, maxTokens: max_tokens || 4000 })

    res.json({
      success: true,
      outline: result.text,
      usage: result.usage
    })
  } catch (error) {
    res.status(500).json({ error: error.message || '大纲生成失败' })
  }
})

// 生成角色设定
router.post('/generate-character', async (req, res) => {
  try {
    const { project_id, name, role, hints, language, style, temperature } = req.body
    if (!name) return res.status(400).json({ error: '必须指定角色名 (name)' })

    const lang = language === 'en' ? 'en' : 'zh-CN'
    const settingsData = await readFile('settings.json')
    const settings = settingsData?.settings || {}

    const systemPrompt = await buildContextSystemPrompt(project_id || null, style || '剧情流', lang, '')

    let userPrompt
    if (lang === 'en') {
      userPrompt =
        `Create a detailed character profile for "${name}".\n` +
        (role ? `Role: ${role}\n` : '') +
        (hints ? `Notes: ${hints}\n` : '') +
        `Include:\n` +
        `1. Personality\n` +
        `2. Background / Origin story\n` +
        `3. Appearance\n` +
        `4. Abilities & Skills\n` +
        `5. Relationships with other characters\n` +
        `6. Motivation & Goals\n\n` +
        `Output a coherent, detailed description.`
    } else {
      userPrompt =
        `请为角色「${name}」生成一份完整、细致的角色设定。\n` +
        (role ? `身份定位: ${role}\n` : '') +
        (hints ? `补充说明: ${hints}\n` : '') +
        `请包含以下维度:\n` +
        `1. 性格特征\n` +
        `2. 背景/来历\n` +
        `3. 外貌描写\n` +
        `4. 能力/功法/特长\n` +
        `5. 与其他主要人物关系\n` +
        `6. 目标/动机\n\n` +
        `请输出一段条理清晰的文字描述，长度500字以上。`
    }

    const result = await callAI(settings, systemPrompt, userPrompt, { temperature })
    const text = result.text.trim()

    // 自动保存到角色库
    let savedChar = null
    try {
      const charsData = await readFile('characters.json') || { characters: [] }
      if (!charsData.characters) charsData.characters = []
      const newChar = {
        id: `char_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        project_id: project_id || null,
        name: name,
        role: role || '',
        gender: '',
        age: null,
        personality: '',
        background: '',
        appearance: '',
        abilities: '',
        relationships: '',
        goal: '',
        content: text,
        tags: ['AI生成'],
        category: 'supporting',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      charsData.characters.push(newChar)
      await writeFile('characters.json', charsData)
      try {
        ensureDir('characters')
        writeTextFile(`characters/${newChar.id}.txt`, text)
      } catch (e) {}
      savedChar = newChar
    } catch (e) {}

    res.json({
      success: true,
      generated_text: text,
      word_count: text.length,
      character: savedChar
    })
  } catch (error) {
    res.status(500).json({ error: error.message || '角色生成失败' })
  }
})

// 生成后辅助校验（违规词 + OOC 简易 + 追读力评分建议）
router.post('/analyze', async (req, res) => {
  try {
    const { project_id, text } = req.body || {}
    if (!text) return res.status(400).json({ error: '缺少 text' })
    const content = String(text)

    const violations = []
    // 1) 全局禁词（和 rules-engine.js 保持一致）
    const FORBIDDEN = [
      { regex: /色情|淫秽|淫荡|强暴|强奸|性交/g, label: '色情禁词' },
      { regex: /屠杀|虐杀|血肉横飞|肢解|断头|开膛|血腥/g, label: '血腥暴力' },
      { regex: /歧视|种族|民族|黑人|白皮|白猪|黄祸|支那/g, label: '种族/民族歧视' }
    ]
    for (const f of FORBIDDEN) {
      const m = content.match(f.regex)
      if (m) violations.push({ level: 'block', label: f.label, hits: m.slice(0, 5) })
    }

    // 2) OOC 简易校验（对比角色 personality 的关键词）
    if (project_id) {
      try {
        const chars = (await readFile('characters.json') || { characters: [] })
        const list = (chars.characters || []).filter(c => c.project_id === project_id || c.project_id == null)
        for (const c of list.slice(0, 5)) {
          const tags = (c.personality_tags || []).concat((c.personality || '').split(/[，,。；;\s]/).filter(Boolean))
          if (tags.length === 0) continue
          const hits = []
          for (const t of tags.slice(0, 10)) {
            if (!t || t.length < 2) continue
            try {
              const m = content.match(new RegExp(String(t), 'gi'))
              if (m) hits.push({ tag: t, count: m.length })
            } catch (_) {}
          }
          if (hits.length) violations.push({
            level: 'info',
            label: `角色对齐检测: ${c.name}`,
            tag_hits: hits
          })
        }
      } catch (_) {}
    }

    // 3) 追读力 & hook 强度（analysis.js 同款简化版）
    const HOOK = /为什么|怎么|难道|究竟|没想到|居然|秘密|真相|多年以后|后来/g
    const CLIMAX = /突破|晋级|冷笑|打脸|宝物|灵丹|气势|热泪|感动/g
    const hookCount = (content.match(HOOK) || []).length
    const climaxCount = (content.match(CLIMAX) || []).length
    const paragraphCount = content.split(/\n{2,}|\r{2,}/).filter(s => s && s.trim().length > 10).length

    const hookStrength = Math.min(100, Math.round(hookCount * 12))
    const density = content.length ? +(climaxCount / (content.length / 1000)).toFixed(2) : 0
    const composite = Math.min(100, Math.round(hookStrength * 0.4 + density * 30 + Math.min(30, paragraphCount * 4)))

    res.json({
      success: true,
      word_count: content.length,
      paragraph_count: paragraphCount,
      hook_strength: hookStrength,
      hook_hits: hookCount,
      climax_density_per_1k: density,
      composite_score: composite,
      rating: composite >= 80 ? 'A' : composite >= 60 ? 'B' : composite >= 40 ? 'C' : 'D',
      suggestions: [
        composite < 50 ? '本章节 hook/爽点密度偏低，建议在关键处加入悬念、反转或冲突升级。' : '整体追读力合格，已具备基本读者吸引力。',
        violations.some(v => v.level === 'block') ? '检测到可能违规词（平台风险），建议替换或删除。' : '未检测到明显禁词。',
        paragraphCount < 5 ? '段落数过少，建议按场景拆分，避免长篇大块文字（不适合手机阅读）。' : '段落结构合理。'
      ],
      violations
    })
  } catch (e) {
    res.status(500).json({ error: e.message || 'analyze 失败' })
  }
})

// 前端可调用：预构建上下文（仅返回字符串 + 结果，便于 UI 预览/调试）
router.post('/build-system-prompt', async (req, res) => {
  try {
    const { project_id, style, language, extra, query } = req.body || {}
    const text = await buildContextSystemPrompt(project_id, style, language, extra, query)
    res.json({ success: true, system_prompt: text, char_count: text.length })
  } catch (e) {
    res.status(500).json({ error: e.message || '构建 prompt 失败' })
  }
})

export default router
