/**
 * 灵墨小说工坊 - 人物关系/知识图谱
 *
 * - Node（节点）：角色、势力、道具、地点、伏笔
 *   - type: character/faction/item/location/foreshadowing/generic
 *   - 含 name、summary、tags、coordinates（画布坐标，供前端拖拽）
 * - Edge（边）：双向或单向关系
 *   - type: master_apprentice, enemy, ambiguous, superior_subordinate, kinship, friend, colleague, owner, team, other
 *   - label: 自定义文本
 *   - weight: 关系强度
 * - History（关系变化时间线）：从敌对→合作、从信任→背叛
 *
 * 核心产物：graph.json 被 rag.js Level 2 读取，做 1 跳邻居扩展；人物详情在 ai-chapter.js 被注入。
 */
import express from 'express';
import { readFile, writeFile } from '../utils/fileHelper.js';

const router = express.Router();

const RELATION_TYPES = [
  { id: 'master_apprentice', label: '师徒', directional: true, from: '师父', to: '弟子' },
  { id: 'enemy', label: '敌对', directional: false },
  { id: 'ambiguous', label: '暧昧', directional: false },
  { id: 'superior_subordinate', label: '上下级', directional: true, from: '上司', to: '下属' },
  { id: 'kinship', label: '血缘', directional: false },
  { id: 'friend', label: '朋友', directional: false },
  { id: 'colleague', label: '同门/同事', directional: false },
  { id: 'owner', label: '归属', directional: true, from: '所属', to: '成员' },
  { id: 'team', label: '队伍', directional: false },
  { id: 'foreshadow_owner', label: '伏笔相关者', directional: true, from: '触发者', to: '伏笔' },
  { id: 'other', label: '其他', directional: false }
];

const NODE_TYPES = [
  { id: 'character', label: '人物' }, { id: 'faction', label: '势力' },
  { id: 'item', label: '道具/功法' }, { id: 'location', label: '地点' },
  { id: 'foreshadowing', label: '伏笔' }, { id: 'generic', label: '其他' }
];

async function readGraph() {
  const data = (await readFile('knowledge_graphs.json').catch(() => ({}))) || {};
  return { graphs: data.graphs || {}, global: data.global || { nodes: [], edges: [] } };
}

async function writeGraph(data) { await writeFile('knowledge_graphs.json', data); }

function getProjectGraph(all, projectId) {
  if (!projectId) return all.global;
  if (!all.graphs[projectId]) all.graphs[projectId] = { nodes: [], edges: [], history: [] };
  return all.graphs[projectId];
}

function newId(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`; }

router.get('/meta', (req, res) => {
  res.json({ relation_types: RELATION_TYPES, node_types: NODE_TYPES });
});

// 单作品/全局的完整图谱
router.get('/', async (req, res) => {
  const all = await readGraph();
  const graph = getProjectGraph(all, req.query.project_id || null);
  res.json(graph);
});

// 角色卡片 CRUD
router.post('/nodes', async (req, res) => {
  const all = await readGraph();
  const graph = getProjectGraph(all, req.body.project_id || null);
  const node = {
    id: newId('n'), type: req.body.type || 'character', name: req.body.name || '未命名节点',
    summary: req.body.summary || '', tags: req.body.tags || [],
    character_id: req.body.character_id || null,
    metadata: req.body.metadata || {},
    coordinates: req.body.coordinates || { x: Math.random() * 600, y: Math.random() * 400 },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  graph.nodes.push(node);
  await writeGraph(all);
  res.status(201).json(node);
});

router.put('/nodes/:id', async (req, res) => {
  const all = await readGraph();
  const graph = getProjectGraph(all, req.body.project_id || req.query.project_id || null);
  const idx = graph.nodes.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '节点不存在' });
  graph.nodes[idx] = { ...graph.nodes[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
  await writeGraph(all);
  res.json(graph.nodes[idx]);
});

router.delete('/nodes/:id', async (req, res) => {
  const all = await readGraph();
  const graph = getProjectGraph(all, req.query.project_id || null);
  graph.nodes = graph.nodes.filter(n => n.id !== req.params.id);
  graph.edges = graph.edges.filter(e => e.source !== req.params.id && e.target !== req.params.id);
  await writeGraph(all);
  res.json({ success: true });
});

// 边 CRUD
router.post('/edges', async (req, res) => {
  const all = await readGraph();
  const graph = getProjectGraph(all, req.body.project_id || null);
  if (!req.body.source || !req.body.target) return res.status(400).json({ error: 'source 和 target 必填' });
  const edge = {
    id: newId('e'),
    source: req.body.source, target: req.body.target,
    type: req.body.type || 'other', label: req.body.label || '',
    weight: req.body.weight ?? 1,
    metadata: req.body.metadata || {},
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  graph.edges.push(edge);
  await writeGraph(all);
  res.status(201).json(edge);
});

router.put('/edges/:id', async (req, res) => {
  const all = await readGraph();
  const graph = getProjectGraph(all, req.body.project_id || null);
  const idx = graph.edges.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '边不存在' });
  graph.edges[idx] = { ...graph.edges[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
  await writeGraph(all);
  res.json(graph.edges[idx]);
});

router.delete('/edges/:id', async (req, res) => {
  const all = await readGraph();
  const graph = getProjectGraph(all, req.query.project_id || null);
  graph.edges = graph.edges.filter(e => e.id !== req.params.id);
  await writeGraph(all);
  res.json({ success: true });
});

// 关系变化历史
router.post('/history', async (req, res) => {
  const all = await readGraph();
  const graph = getProjectGraph(all, req.body.project_id || null);
  const h = {
    id: newId('h'),
    edge_id: req.body.edge_id,
    chapter_no: req.body.chapter_no || null,
    from_type: req.body.from_type, to_type: req.body.to_type,
    label: req.body.label || '',
    description: req.body.description || '',
    createdAt: new Date().toISOString()
  };
  if (!graph.history) graph.history = [];
  graph.history.push(h);
  await writeGraph(all);
  res.status(201).json(h);
});
router.get('/history', async (req, res) => {
  const all = await readGraph();
  const graph = getProjectGraph(all, req.query.project_id || null);
  res.json(graph.history || []);
});

// 人物卡片 → 节点自动创建（基于 characters.json）
router.post('/auto-import-characters', async (req, res) => {
  const { project_id } = req.body;
  const charsData = (await readFile('characters.json') || { characters: [] });
  const list = (charsData.characters || []).filter(c =>
    (project_id && c.project_id === project_id) || (!project_id && c.project_id === null)
  );
  const all = await readGraph();
  const graph = getProjectGraph(all, project_id || null);
  const existingIds = new Set(graph.nodes.filter(n => n.type === 'character').map(n => n.character_id));
  const added = [];
  for (const c of list) {
    if (existingIds.has(c.id)) continue;
    graph.nodes.push({
      id: newId('n'), type: 'character', name: c.name || '',
      summary: (c.personality || '') + ' ' + (c.background || ''),
      tags: c.tags || [], character_id: c.id,
      metadata: { role: c.role, gender: c.gender, age: c.age },
      coordinates: { x: 120 + added.length * 30, y: 120 + added.length * 20 },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    added.push(c.id);
  }
  await writeGraph(all);
  res.json({ imported: added.length, total_nodes: graph.nodes.length });
});

// 作品图谱统计 + 图谱邻接表（供前端渲染）
router.get('/summary', async (req, res) => {
  const all = await readGraph();
  const graph = getProjectGraph(all, req.query.project_id || null);
  const byType = {};
  for (const n of graph.nodes) byType[n.type] = (byType[n.type] || 0) + 1;
  res.json({ nodes: graph.nodes.length, edges: graph.edges.length, history: (graph.history || []).length, by_type: byType });
});

router.get('/adjacency', async (req, res) => {
  const all = await readGraph();
  const graph = getProjectGraph(all, req.query.project_id || null);
  // 返回 { nodeId: [邻居id...] }
  const adj = {};
  for (const n of graph.nodes) adj[n.id] = [];
  for (const e of graph.edges) {
    if (adj[e.source]) adj[e.source].push(e.target);
    if (adj[e.target]) adj[e.target].push(e.source);
  }
  res.json({ adjacency: adj, nodes: graph.nodes, edges: graph.edges });
});

export default router;
