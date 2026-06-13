import { Router } from 'express'
import { readFile, writeFile, getDataDir, reloadDataDir, ensureDir, listDir, fileExists } from '../utils/fileHelper.js'

const router = Router()

/**
 * 读取设置（包含自定义数据目录、语言、AI 配置等）
 */
router.get('/', async (req, res) => {
  try {
    const data = await readFile('settings.json')
    const settings = data?.settings || {}

    // 安全处理：不返回明文 API Key（脱敏）
    const safe = { ...settings }
    if (safe.apiKey) {
      const key = String(safe.apiKey)
      safe.apiKey = key.length > 8
        ? (key.slice(0, 4) + '****' + key.slice(-4))
        : '****'
    }

    // 附加当前数据目录信息（供前端展示）
    safe._currentDataDir = getDataDir()

    res.json(safe)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 更新设置（支持局部字段合并）
 *
 * 支持字段:
 * - customDataDir: string  自定义数据目录（切换保存位置）
 * - language: 'zh-CN' | 'en'
 * - apiEndpoint / apiKey / model  (AI 服务地址 / 密钥 / 模型)
 * - temperature / maxTokens
 * - ui_theme
 * - default_genre / default_style
 * - target_words_per_chapter
 */
router.put('/', async (req, res) => {
  try {
    const data = await readFile('settings.json') || { settings: {} }
    if (!data.settings) data.settings = {}

    // 合并字段（保留未提供的旧值）
    data.settings = { ...data.settings, ...req.body }

    // 如果用户提供了明文 **** 占位符，不要覆盖原始 apiKey
    if (req.body.apiKey && typeof req.body.apiKey === 'string') {
      if (req.body.apiKey.includes('****')) {
        // 前端提交的是脱敏值，恢复原值
        if (data._originalApiKey) data.settings.apiKey = data._originalApiKey
      } else {
        // 新的明文 key，直接保存
        data.settings.apiKey = req.body.apiKey
      }
    }

    await writeFile('settings.json', data)

    // 返回时脱敏
    const safe = { ...data.settings }
    if (safe.apiKey) {
      const k = String(safe.apiKey)
      safe.apiKey = k.length > 8 ? (k.slice(0, 4) + '****' + k.slice(-4)) : '****'
    }
    res.json(safe)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 切换 / 设置数据目录（可触发热切换）
 *
 * body: { dir: '/path/to/data', move_existing: true/false }
 */
router.post('/data-dir', async (req, res) => {
  try {
    const { dir, move_existing } = req.body
    if (!dir || typeof dir !== 'string') {
      return res.status(400).json({ error: 'dir 不能为空' })
    }

    const data = await readFile('settings.json') || { settings: {} }
    if (!data.settings) data.settings = {}

    const oldDir = getDataDir()
    data.settings.customDataDir = dir
    await writeFile('settings.json', data)

    // 在运行时尝试热切换目录（如果失败，下次启动会自动切换）
    let switched = false
    try {
      switched = reloadDataDir(dir)
    } catch (e) { /* 忽略热切换失败 */ }

    res.json({
      success: true,
      old_data_dir: oldDir,
      new_data_dir: dir,
      hot_switched: switched,
      note: switched ? '数据目录已热切换。' : '数据目录设置已保存，将在下次启动时生效。'
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 获取当前数据目录路径信息
 */
router.get('/data-dir', async (req, res) => {
  try {
    const dir = getDataDir()
    const subDirs = []
    try {
      ensureDir('chapters')
      ensureDir('characters')
      ensureDir('materials')
      ensureDir('exports')
    } catch (e) {}
    try { subDirs.push({ name: 'projects', path: dir + '/projects' }) } catch (e) {}
    res.json({ data_dir: dir, sub_dirs: ['chapters', 'characters', 'materials', 'exports'] })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 切换语言（zh-CN / en）
 */
router.post('/language', async (req, res) => {
  try {
    const { language } = req.body
    const lang = (language === 'en' || language === 'zh-CN') ? language : 'zh-CN'
    const data = await readFile('settings.json') || { settings: {} }
    if (!data.settings) data.settings = {}
    data.settings.language = lang
    await writeFile('settings.json', data)

    res.json({
      success: true,
      language: lang,
      label: lang === 'en' ? 'English' : '简体中文'
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 列出支持的语言选项
 */
router.get('/languages', async (req, res) => {
  try {
    res.json([
      { id: 'zh-CN', label: '简体中文', flag: '🇨🇳' },
      { id: 'en', label: 'English', flag: '🇺🇸' }
    ])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 获取当前系统配置摘要（供前端初始化用）
 */
router.get('/summary', async (req, res) => {
  try {
    const data = await readFile('settings.json') || { settings: {} }
    const s = data?.settings || {}

    // 按分类整理
    res.json({
      language: s.language || 'zh-CN',
      data_dir: getDataDir(),
      customDataDir: s.customDataDir || '',
      ai: {
        apiEndpoint: s.apiEndpoint || '',
        model: s.model || '',
        temperature: s.temperature ?? 0.8,
        maxTokens: s.maxTokens ?? 2000,
        configured: !!(s.apiKey && s.apiEndpoint)
      },
      writing: {
        default_genre: s.default_genre || s.genre || '玄幻',
        default_style: s.default_style || s.style || '爽文风',
        target_words_per_chapter: s.target_words_per_chapter || 2000
      },
      ui: {
        theme: s.theme || 'auto'
      }
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 重置为默认设置
 */
router.post('/reset', async (req, res) => {
  try {
    const data = await readFile('settings.json') || {}
    data.settings = {
      language: 'zh-CN',
      genre: '玄幻',
      style: '爽文风',
      theme: 'auto'
    }
    await writeFile('settings.json', data)
    res.json({ success: true, settings: data.settings })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
