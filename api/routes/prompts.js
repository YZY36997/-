/**
 * 灵墨小说工坊 - 提示词仓库（与爆文模板分离，专注生成控制）
 *
 * 分类：
 *   - anti_ai：去 AI 味 / 去水词
 *   - style：文风（冷峻 / 细腻 / 热血 / 文言 / 白话 / 古典 / 网文）
 *   - dialogue：对话优化（不同性格的说话方式）
 *   - scene：场景描写模板（战斗/情感/悬念/日常/都市）
 *   - character_binding：绑定到角色的人设提示（可在续写时自动注入）
 *   - project：全局绑定到作品
 *   - generic：其他
 *
 * 字段：{ id, name, category, project_id, character_id, content, tags, priority, enabled }
 *   - priority 数字越大越优先；生成时自动取 topN 注入
 *   - character_binding 若绑定了 character_id，在该角色出场章节自动注入
 */
import express from 'express';
import { readFile, writeFile } from '../utils/fileHelper.js';

const router = express.Router();

const CATEGORIES = [
  { id: 'anti_ai', label: '去 AI 味' },
  { id: 'style', label: '文风控制' },
  { id: 'dialogue', label: '对话优化' },
  { id: 'scene', label: '场景描写' },
  { id: 'character_binding', label: '角色绑定' },
  { id: 'project', label: '作品绑定' },
  { id: 'generic', label: '其他' }
];

function newId() { return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`; }

async function readPrompts() {
  const d = (await readFile('prompts.json').catch(() => ({}))) || {};
  return d.prompts || [];
}
async function writePrompts(list) { await writeFile('prompts.json', { prompts: list }); }

router.get('/categories', (req, res) => res.json(CATEGORIES));

router.get('/', async (req, res) => {
  let list = await readPrompts();
  if (req.query.category) list = list.filter(p => p.category === req.query.category);
  if (req.query.project_id) list = list.filter(p => p.project_id === req.query.project_id);
  if (req.query.character_id) list = list.filter(p => p.character_id === req.query.character_id);
  if (req.query.keyword) {
    const kw = String(req.query.keyword).toLowerCase();
    list = list.filter(p =>
      (p.name || '').toLowerCase().includes(kw) || (p.content || '').toLowerCase().includes(kw)
    );
  }
  res.json(list.sort((a, b) => (b.priority || 0) - (a.priority || 0)));
});

router.post('/', async (req, res) => {
  const list = await readPrompts();
  const p = {
    id: newId(), name: req.body.name || '未命名',
    category: req.body.category || 'generic',
    project_id: req.body.project_id || null,
    character_id: req.body.character_id || null,
    content: req.body.content || '',
    tags: req.body.tags || [],
    priority: req.body.priority ?? 10,
    enabled: req.body.enabled !== false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  list.push(p);
  await writePrompts(list);
  res.status(201).json(p);
});

router.put('/:id', async (req, res) => {
  const list = await readPrompts();
  const idx = list.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '提示词不存在' });
  list[idx] = { ...list[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
  await writePrompts(list);
  res.json(list[idx]);
});

router.delete('/:id', async (req, res) => {
  const list = await readPrompts();
  await writePrompts(list.filter(p => p.id !== req.params.id));
  res.json({ success: true });
});

// 批量导入导出（支持 projects/characters/tags 过滤）
router.post('/batch-import', async (req, res) => {
  const list = await readPrompts();
  const items = (req.body.items || []).map(p => ({
    id: newId(), name: p.name || '未命名', category: p.category || 'generic',
    project_id: p.project_id || null, character_id: p.character_id || null,
    content: p.content || '', tags: p.tags || [], priority: p.priority ?? 10,
    enabled: p.enabled !== false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  }));
  list.push(...items);
  await writePrompts(list);
  res.json({ imported: items.length });
});

// 生成时自动聚合上下文（供 ai-chapter.js 调用 / 前端直接取）
router.post('/build-context', async (req, res) => {
  const { project_id, character_ids, categories, top_n } = req.body;
  const list = await readPrompts();
  let pool = list.filter(p => p.enabled !== false);
  if (project_id) pool = pool.filter(p => !p.project_id || p.project_id === project_id);
  if (Array.isArray(character_ids) && character_ids.length) {
    pool = pool.filter(p => !p.character_id || character_ids.includes(p.character_id));
  }
  if (Array.isArray(categories) && categories.length) {
    pool = pool.filter(p => categories.includes(p.category));
  }
  pool = pool.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  const pick = pool.slice(0, top_n || 10);
  const parts = pick.map(p => `【${CATEGORIES.find(c => c.id === p.category)?.label || p.category}】${p.name}\n${p.content}`);
  res.json({ prompts: pick, context_text: parts.join('\n\n') });
});

export default router;
