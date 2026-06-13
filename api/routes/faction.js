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

// 势力设定 /api/factions
router.get('/', (req, res) => {
  const { project_id } = req.query
  const db = readJSON('factions.json', { factions: [] })
  let list = db.factions || []
  if (project_id) list = list.filter(f => f.project_id === project_id || f.project_id === null)
  const sorted = list.sort((a, b) => (a.power_level || 0) - (b.power_level || 0))
  res.json(sorted)
})

router.get('/:id', (req, res) => {
  const db = readJSON('factions.json', { factions: [] })
  const f = (db.factions || []).find(x => x.id === req.params.id)
  if (!f) return res.status(404).json({ error: '势力不存在' })
  res.json(f)
})

router.post('/', (req, res) => {
  const db = readJSON('factions.json', { factions: [] })
  if (!Array.isArray(db.factions)) db.factions = []
  const now = new Date().toISOString()
  const faction = {
    id: 'fac_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    project_id: req.body.project_id || null,
    name: req.body.name || '未命名势力',
    type: req.body.type || '中立', // 正义/邪恶/中立/神秘
    leader: req.body.leader || '',
    slogan: req.body.slogan || '',
    territory: req.body.territory || '',
    core_resource: req.body.core_resource || '',
    power_level: Number(req.body.power_level || 50), // 0-100
    philosophy: req.body.philosophy || '',
    members: req.body.members || [],
    allies: req.body.allies || [],
    enemies: req.body.enemies || [],
    history: req.body.history || '',
    tags: req.body.tags || [],
    notes: req.body.notes || '',
    createdAt: now, updatedAt: now
  }
  db.factions.push(faction)
  writeJSON('factions.json', db)
  res.status(201).json(faction)
})

router.put('/:id', (req, res) => {
  const db = readJSON('factions.json', { factions: [] })
  const idx = (db.factions || []).findIndex(f => f.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: '势力不存在' })
  db.factions[idx] = { ...db.factions[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() }
  writeJSON('factions.json', db)
  res.json(db.factions[idx])
})

router.delete('/:id', (req, res) => {
  const db = readJSON('factions.json', { factions: [] })
  const existed = (db.factions || []).some(f => f.id === req.params.id)
  db.factions = (db.factions || []).filter(f => f.id !== req.params.id)
  writeJSON('factions.json', db)
  res.json({ success: existed })
})

// 势力关系网（按项目）
router.get('/:projectId/summary', (req, res) => {
  const db = readJSON('factions.json', { factions: [] })
  const list = (db.factions || []).filter(f => f.project_id === req.params.projectId || f.project_id === null)
  const byType = {}
  list.forEach(f => {
    const t = f.type || '中立'
    if (!byType[t]) byType[t] = 0
    byType[t] += 1
  })
  res.json({ total: list.length, by_type: byType, avg_power: list.length ? Math.round(list.reduce((s, f) => s + (f.power_level || 0), 0) / list.length) : 0, list })
})

module.exports = router
