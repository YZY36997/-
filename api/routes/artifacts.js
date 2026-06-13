const express = require('express')
const fs = require('fs')
const path = require('path')

const router = express.Router()
const DATA_DIR = process.env.DATA_DIR || path.join(require('os').homedir(), '.novel-workshop')

function readJSON(name, def) {
  try {
    const file = path.join(DATA_DIR, name)
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch (_) {}
  return def
}
function writeJSON(name, data) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(data, null, 2))
    return true
  } catch (_) { return false }
}

// 道具/功法/秘闻 /api/artifacts
const ALLOWED_TYPES = ['道具', '功法', '秘闻', '武器', '宝物', '法术', '地图']

router.get('/', (req, res) => {
  const { project_id, type, keyword } = req.query
  const db = readJSON('artifacts.json', { items: [] })
  let list = db.items || []
  if (project_id) list = list.filter(x => x.project_id === project_id || x.project_id === null)
  if (type) list = list.filter(x => (x.type || '') === String(type))
  if (keyword) {
    const k = String(keyword).toLowerCase()
    list = list.filter(x => (x.name || '').toLowerCase().includes(k) || (x.summary || '').toLowerCase().includes(k))
  }
  res.json(list.sort((a, b) => (b.priority || 0) - (a.priority || 0)))
})

router.get('/:id', (req, res) => {
  const db = readJSON('artifacts.json', { items: [] })
  const item = (db.items || []).find(x => x.id === req.params.id)
  if (!item) return res.status(404).json({ error: '未找到' })
  res.json(item)
})

router.post('/', (req, res) => {
  const db = readJSON('artifacts.json', { items: [] })
  if (!Array.isArray(db.items)) db.items = []
  const now = new Date().toISOString()
  const item = {
    id: 'art_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    project_id: req.body.project_id || null,
    name: req.body.name || '未命名',
    type: ALLOWED_TYPES.includes(req.body.type) ? req.body.type : '道具',
    level: req.body.level || '',
    summary: req.body.summary || '',
    description: req.body.description || '',
    owner: req.body.owner || '',
    power_level: Number(req.body.power_level || 0),
    origin_story: req.body.origin_story || '',
    related_characters: req.body.related_characters || [],
    related_factions: req.body.related_factions || [],
    related_chapters: req.body.related_chapters || [],
    tags: req.body.tags || [],
    priority: Number(req.body.priority || 0),
    createdAt: now, updatedAt: now
  }
  db.items.push(item)
  writeJSON('artifacts.json', db)
  res.status(201).json(item)
})

router.put('/:id', (req, res) => {
  const db = readJSON('artifacts.json', { items: [] })
  const idx = (db.items || []).findIndex(x => x.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: '未找到' })
  db.items[idx] = { ...db.items[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() }
  writeJSON('artifacts.json', db)
  res.json(db.items[idx])
})

router.delete('/:id', (req, res) => {
  const db = readJSON('artifacts.json', { items: [] })
  db.items = (db.items || []).filter(x => x.id !== req.params.id)
  writeJSON('artifacts.json', db)
  res.json({ success: true })
})

// 导入现有素材为道具/功法条目
router.post('/batch-import', (req, res) => {
  const { items, project_id } = req.body || {}
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items 必填' })
  const db = readJSON('artifacts.json', { items: [] })
  if (!Array.isArray(db.items)) db.items = []
  const now = new Date().toISOString()
  const newItems = items.map(it => ({
    id: 'art_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    project_id: project_id || it.project_id || null,
    name: it.name || '未命名',
    type: ALLOWED_TYPES.includes(it.type) ? it.type : '道具',
    level: it.level || '',
    summary: it.summary || '',
    description: it.description || '',
    owner: it.owner || '',
    power_level: Number(it.power_level || 0),
    origin_story: it.origin_story || '',
    related_characters: it.related_characters || [],
    related_factions: it.related_factions || [],
    related_chapters: it.related_chapters || [],
    tags: it.tags || [],
    priority: Number(it.priority || 0),
    createdAt: now, updatedAt: now
  }))
  db.items.push(...newItems)
  writeJSON('artifacts.json', db)
  res.json({ imported: newItems.length, items: newItems })
})

module.exports = router
