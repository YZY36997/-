/**
 * 灵墨小说工坊 - 角色记忆系统（characters.json 增强版）
 *
 * 角色字段（相对于基础版本新增）：
 *   - level: S/A/B/C（主角/重要配角/配角/路人）
 *   - motivation: 角色核心动机/目标/执念
 *   - power: 战力/能力摘要（可为数组）
 *   - intro_chapter: 首次登场章节
 *   - current_status: active(活跃) / cooling(冷却) / gone(退场) / dead(死亡) / missing(失踪)
 *   - plot_arc: 本角色在作品中的弧光（如"弃子→逆袭→登顶"）
 *   - personality_tags: 性格关键词数组（方便 AI 自动生成时 OOC 检测）
 *   - relation_snapshot: 关系快照（与 knowledge-graph 联动，记录某章节时的关系状态）
 *   - memory: 自由文本记忆字段（作者写的"到当前章节为止该角色经历"）
 *   - ooc_check: 防 OOC 关键词（生气时的语言特征 / 标志性动作）
 */
import express from 'express';
import { readFile, writeFile } from '../utils/fileHelper.js';

const router = express.Router();

const STATUS = ['active', 'cooling', 'gone', 'dead', 'missing'];
const LEVELS = ['S', 'A', 'B', 'C'];

function newId() { return `ch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`; }

async function readCharacters() {
  const d = (await readFile('characters.json').catch(() => ({}))) || {};
  return d.characters || [];
}
async function writeCharacters(list) { await writeFile('characters.json', { characters: list }); }

router.get('/meta', (req, res) => {
  res.json({ status: STATUS, levels: LEVELS });
});

router.get('/', async (req, res) => {
  let list = await readCharacters();
  if (req.query.project_id === 'global') list = list.filter(c => c.project_id == null);
  else if (req.query.project_id) list = list.filter(c => c.project_id === req.query.project_id);
  if (req.query.level) list = list.filter(c => (c.level || 'B') === req.query.level);
  if (req.query.status) list = list.filter(c => (c.current_status || 'active') === req.query.status);
  if (req.query.keyword) {
    const kw = String(req.query.keyword).toLowerCase();
    list = list.filter(c =>
      (c.name || '').toLowerCase().includes(kw) ||
      (c.role || '').toLowerCase().includes(kw) ||
      (c.personality || '').toLowerCase().includes(kw) ||
      (c.memory || '').toLowerCase().includes(kw)
    );
  }
  res.json(list);
});

router.get('/:id', async (req, res) => {
  const list = await readCharacters();
  const c = list.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: '角色不存在' });
  res.json(c);
});

router.post('/', async (req, res) => {
  const list = await readCharacters();
  const now = new Date().toISOString();
  const c = {
    id: newId(),
    project_id: req.body.project_id !== undefined ? req.body.project_id : null,
    name: req.body.name || '未命名角色',
    role: req.body.role || '',
    gender: req.body.gender || '',
    age: req.body.age || null,
    personality: req.body.personality || '',
    background: req.body.background || '',
    appearance: req.body.appearance || '',
    abilities: req.body.abilities || '',
    relationships: req.body.relationships || '',
    goal: req.body.goal || '',
    content: req.body.content || '',
    tags: req.body.tags || [],
    category: req.body.category || 'supporting',
    // memory 扩展
    level: req.body.level || 'B',
    motivation: req.body.motivation || '',
    power: req.body.power || [],
    intro_chapter: req.body.intro_chapter || null,
    current_status: req.body.current_status || 'active',
    plot_arc: req.body.plot_arc || '',
    personality_tags: req.body.personality_tags || [],
    relation_snapshot: req.body.relation_snapshot || [],
    memory: req.body.memory || '',
    ooc_check: req.body.ooc_check || [],
    createdAt: now, updatedAt: now
  };
  list.push(c);
  await writeCharacters(list);
  res.status(201).json(c);
});

router.put('/:id', async (req, res) => {
  const list = await readCharacters();
  const idx = list.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '角色不存在' });
  list[idx] = { ...list[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
  await writeCharacters(list);
  res.json(list[idx]);
});

router.delete('/:id', async (req, res) => {
  const list = await readCharacters();
  await writeCharacters(list.filter(c => c.id !== req.params.id));
  res.json({ success: true });
});

// 关系时间线：添加某个章节时该角色的状态快照
router.post('/:id/snapshot', async (req, res) => {
  const list = await readCharacters();
  const idx = list.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '角色不存在' });
  const snap = {
    id: 'sn_' + Date.now().toString(36),
    chapter_no: req.body.chapter_no || null,
    status: req.body.status || list[idx].current_status,
    power: req.body.power || list[idx].power,
    relationships: req.body.relationships || list[idx].relationships,
    note: req.body.note || '',
    createdAt: new Date().toISOString()
  };
  if (!list[idx].relation_snapshot) list[idx].relation_snapshot = [];
  list[idx].relation_snapshot.push(snap);
  list[idx].updatedAt = snap.createdAt;
  await writeCharacters(list);
  res.json(snap);
});

// OOC 校验：根据章节内容对比角色性格关键词（简单规则版）
router.post('/:id/ooc-check', async (req, res) => {
  const list = await readCharacters();
  const c = list.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: '角色不存在' });
  const content = String(req.body.content || '');
  const tagList = (c.personality_tags || []).concat(c.ooc_check || []);
  const hits = [];
  for (const t of tagList) {
    try {
      const reg = new RegExp(String(t), 'gi');
      const m = content.match(reg);
      if (m) hits.push({ tag: t, count: m.length });
    } catch (_) {}
  }
  res.json({ character_id: c.id, tag_hits: hits, ooc_risk: hits.length === 0 && content.length > 200 ? 'low' : (hits.length > 2 ? 'moderate' : 'ok') });
});

// 作品角色统计（供 AI 生成上下文用）
router.get('/project/:projectId/summary', async (req, res) => {
  const list = (await readCharacters()).filter(c => c.project_id === req.params.projectId);
  const byLevel = {};
  for (const l of LEVELS) byLevel[l] = list.filter(c => (c.level || 'B') === l).length;
  res.json({
    total: list.length, by_level: byLevel,
    active: list.filter(c => (c.current_status || 'active') === 'active').length,
    list: list.sort((a, b) => (levelRank(a.level) - levelRank(b.level)))
  });
});
function levelRank(l) { return { S: 0, A: 1, B: 2, C: 3 }[l] || 2; }

export default router;
