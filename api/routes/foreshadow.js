/**
 * 灵墨小说工坊 - 伏笔库：埋设（planted）/ 回收（recovered）/ 遗漏（open）
 *
 * 字段：
 *  - id / project_id / title / content / tags / category（小伏笔 / 中 / 大）
 *  - status: planted | recovered | dropped | suspense
 *  - planted_chapter（埋设章节）
 *  - recovered_chapter（回收章节）
 *  - related_characters（角色 ID 列表）
 *  - priority（1~5，用户标记重要程度）
 */
import express from 'express';
import { readFile, writeFile } from '../utils/fileHelper.js';

const router = express.Router();

function newId() { return `fs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`; }

async function readFores() {
  const d = (await readFile('foreshadows.json').catch(() => ({}))) || {};
  return d.foreshadows || [];
}
async function writeFores(list) { await writeFile('foreshadows.json', { foreshadows: list }); }

router.get('/', async (req, res) => {
  let list = await readFores();
  if (req.query.project_id) list = list.filter(f => f.project_id === req.query.project_id);
  if (req.query.status) list = list.filter(f => f.status === req.query.status);
  res.json(list.sort((a, b) => (a.priority || 0) < (b.priority || 0) ? 1 : -1));
});

router.post('/', async (req, res) => {
  const list = await readFores();
  const f = {
    id: newId(), project_id: req.body.project_id || null,
    title: req.body.title || '未命名伏笔', content: req.body.content || '',
    category: req.body.category || 'mid',
    status: req.body.status || 'planted',
    planted_chapter: req.body.planted_chapter || null,
    recovered_chapter: req.body.recovered_chapter || null,
    related_characters: req.body.related_characters || [],
    related_materials: req.body.related_materials || [],
    priority: req.body.priority ?? 3,
    tags: req.body.tags || [],
    note: req.body.note || '',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  list.push(f);
  await writeFores(list);
  res.status(201).json(f);
});

router.put('/:id', async (req, res) => {
  const list = await readFores();
  const idx = list.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '伏笔不存在' });
  list[idx] = { ...list[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
  await writeFores(list);
  res.json(list[idx]);
});

router.post('/:id/recover', async (req, res) => {
  const list = await readFores();
  const idx = list.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '伏笔不存在' });
  list[idx].status = 'recovered';
  list[idx].recovered_chapter = req.body.recovered_chapter || list[idx].recovered_chapter;
  list[idx].recovered_note = req.body.note || list[idx].recovered_note || '';
  list[idx].updatedAt = new Date().toISOString();
  await writeFores(list);
  res.json(list[idx]);
});

router.delete('/:id', async (req, res) => {
  const list = await readFores();
  await writeFores(list.filter(f => f.id !== req.params.id));
  res.json({ success: true });
});

router.get('/summary/:projectId', async (req, res) => {
  const list = (await readFores()).filter(f => f.project_id === req.params.projectId);
  const planted = list.filter(f => f.status === 'planted').length;
  const recovered = list.filter(f => f.status === 'recovered').length;
  const dropped = list.filter(f => f.status === 'dropped').length;
  const suspense = list.filter(f => f.status === 'suspense').length;
  const ratio = list.length ? +(recovered / list.length).toFixed(2) : 0;
  res.json({ total: list.length, planted, recovered, dropped, suspense, recovery_ratio: ratio, list });
});

export default router;
