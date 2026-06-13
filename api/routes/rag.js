/**
 * 灵墨小说工坊 - RAG 三级检索系统（长篇防崩坏核心）
 *
 * 架构说明（与现有 "零依赖降级策略" 一致）：
 *   Level 1 向量检索  -> 通过外部兼容 OpenAI Embedding 的 HTTP 服务（缺省走 BM25）
 *   Level 2 知识图谱混合检索 -> 读取 knowledge_graphs.json（见 knowledge-graph.js）
 *   Level 3 BM25 关键词兜底 -> 本地纯 JS 实现，任何环境可跑
 *
 * 检索失败降级策略：
 *   - 若向量服务不可用/未配置，自动回退到 BM25
 *   - 若知识库为空，回退到「只注入人物档案」的普通生成
 *   - 所有生成路由均走 buildRagContext()，调用方无需感知实现细节
 */

import express from 'express';
import { readFile, writeFile, ensureDir, getDataDir } from '../utils/fileHelper.js';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// ============================================================
// 0. 元数据与模块开关
// ============================================================
const FEATURE_TOGGLE = {
  rag_enabled: true,
  vector_enabled: true,     // Level 1
  graph_enabled: true,      // Level 2
  bm25_enabled: true,       // Level 3
  fallback_enabled: true
};

// ============================================================
// 1. Level 3 - BM25 本地纯 JS 实现（OKAPI BM25+）
// ============================================================
const DEFAULT_K1 = 1.5;
const DEFAULT_B = 0.75;

/** 简单中文分词：按非字符切开 + 保留 2-4 字 n-gram 作为中文近似词项 */
function tokenize(text) {
  if (!text) return [];
  const tokens = [];
  const cleaned = String(text).toLowerCase();
  const parts = cleaned.split(/[\s\u3000，。！？、；：""''（）《》【】…—\-\/\\,.!?;:"'()\[\]<>]+/).filter(Boolean);
  for (const p of parts) {
    if (/^[a-zA-Z0-9]+$/.test(p)) { tokens.push(p); continue; } // 英文/数字保留原词
    // 中文生成 n-gram (2~3 字) 做近似词项
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= p.length; i++) tokens.push(p.slice(i, i + n));
    }
    // 同时保留单字作为兜底
    for (const ch of p) tokens.push(ch);
  }
  return tokens;
}

function buildBm25Index(docs) {
  const N = docs.length;
  const docTerms = docs.map(d => tokenize(d.title + '\n' + d.content));
  const avgLen = docTerms.reduce((s, t) => s + t.length, 0) / Math.max(1, N);
  const df = new Map();
  for (const terms of docTerms) {
    const seen = new Set(terms);
    for (const t of seen) df.set(t, (df.get(t) || 0) + 1);
  }
  const tf = docTerms.map(terms => {
    const map = new Map();
    for (const t of terms) map.set(t, (map.get(t) || 0) + 1);
    return map;
  });
  return { N, avgLen, df, tf, docTerms, docs };
}

function bm25Score(idx, queryTokens, index) {
  let score = 0;
  const map = index.tf[idx];
  const docLen = index.docTerms[idx].length;
  for (const q of queryTokens) {
    const f = map.get(q) || 0;
    if (f === 0) continue;
    const nq = index.df.get(q) || 0;
    const idf = Math.log((index.N - nq + 0.5) / (nq + 0.5) + 1);
    const denom = f + DEFAULT_K1 * (1 - DEFAULT_B + DEFAULT_B * docLen / Math.max(1, index.avgLen));
    score += (f * (DEFAULT_K1 + 1) * idf) / Math.max(1e-9, denom);
  }
  return score;
}

function queryBm25(query, index, topK = 8) {
  const qTokens = tokenize(query);
  if (qTokens.length === 0 || index.N === 0) return [];
  const scored = [];
  for (let i = 0; i < index.N; i++) {
    const s = bm25Score(i, qTokens, index);
    if (s > 0) scored.push({ index: i, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map(r => ({ ...index.docs[r.index], bm25_score: r.score, level: 'bm25' }));
}

// ============================================================
// 2. Level 1 - 向量检索（HTTP 外部服务兼容 OpenAI Embeddings）
// ============================================================
async function getSettings() {
  try {
    const s = await readFile('settings.json');
    return s?.settings || {};
  } catch (_) { return {}; }
}

async function httpPostJSON(url, payload, headers, timeoutMs = 15000) {
  // 零依赖：使用 Node 内置 https/http
  const lib = await import('node:url');
  const parsed = new lib.URL(url);
  const net = await import(parsed.protocol === 'https:' ? 'node:https' : 'node:http');
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload || {});
    const req = net.request({
      hostname: parsed.hostname, port: parsed.port,
      path: parsed.pathname + parsed.search, method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, headers || {})
    }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data || '{}') }); }
        catch (e) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.write(body);
    req.end();
  });
}

async function vectorize(text, settings) {
  const endpoint = settings.vectorEndpoint || settings.apiEndpoint;
  const apiKey = settings.vectorApiKey || settings.apiKey;
  const model = settings.vectorModel || 'text-embedding-3-small';
  if (!endpoint || !apiKey) throw new Error('向量服务未配置');
  const res = await httpPostJSON(endpoint.replace(/\/chat\/completions.*$/i, '/embeddings'), {
    model, input: text, encoding_format: 'float'
  }, { 'Authorization': `Bearer ${apiKey}` }, 20000);
  if (!res || !res.data || !Array.isArray(res.data.data) || !res.data.data[0]?.embedding) {
    throw new Error('向量服务返回异常');
  }
  return res.data.data[0].embedding;
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / Math.max(1e-9, Math.sqrt(na) * Math.sqrt(nb));
}

/** 本地向量库：数据存 vectors.json，每个 chunk 带 metadata（作品/章节/角色/设定类型） */
async function listVectorChunks(projectId) {
  const data = await readFile('vectors.json') || { chunks: [] };
  if (!projectId) return data.chunks || [];
  return (data.chunks || []).filter(c => c.project_id === projectId);
}

async function queryVectors(query, projectId, settings, topK = 8) {
  if (!FEATURE_TOGGLE.vector_enabled) throw new Error('vector disabled');
  const qVec = await vectorize(query, settings);
  const chunks = await listVectorChunks(projectId);
  if (!chunks.length) return [];
  const scored = chunks
    .filter(c => c.vector && c.vector.length === qVec.length)
    .map(c => ({ chunk: c, score: cosine(qVec, c.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return scored.map(s => ({ ...s.chunk, vector_score: s.score, level: 'vector' }));
}

// ============================================================
// 3. Level 2 - 知识图谱混合检索
// ============================================================
async function queryGraph(query, projectId) {
  if (!FEATURE_TOGGLE.graph_enabled) return [];
  try {
    const data = await readFile('knowledge_graphs.json') || { graphs: {} };
    const graph = data.graphs?.[projectId] || { nodes: [], edges: [] };
    const qTokens = tokenize(query);
    const qSet = new Set(qTokens);
    const hitNodes = graph.nodes
      .map(n => ({ node: n, tokens: tokenize((n.name || '') + ' ' + (n.summary || '') + ' ' + (n.metadata?.content || '')) }))
      .map(x => ({ ...x.node, overlap: x.tokens.filter(t => qSet.has(t)).length }))
      .filter(n => n.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 10);
    // 扩展 1 跳邻居（图谱反哺）
    const ids = new Set(hitNodes.map(n => n.id));
    for (const e of graph.edges) {
      if (ids.has(e.source) || ids.has(e.target)) {
        ids.add(e.source); ids.add(e.target);
      }
    }
    const expanded = (graph.nodes || []).filter(n => ids.has(n.id));
    return expanded.map(n => ({ id: n.id, title: n.name, content: n.summary || n.metadata?.content || '', type: n.type, level: 'graph', graph_score: 1 }));
  } catch (e) { return []; }
}

// ============================================================
// 4. 混合检索主入口（三级融合 + 降级）
// ============================================================
async function hybridRetrieve(query, projectId, opts = {}) {
  const topK = opts.topK || 8;
  const settings = await getSettings();
  const ragToggle = await readFile('feature_toggles.json').catch(() => ({}));
  const t = { ...FEATURE_TOGGLE, ...(ragToggle?.toggles || {}) };

  const materials = (await readFile('materials.json') || { materials: [] }).materials || [];
  const chapters = (await readFile('chapters.json') || { chapters: [] }).chapters || [];
  const characters = (await readFile('characters.json') || { characters: [] }).characters || [];

  // 构造 BM25 文档池（素材 + 章节摘要 + 人物档案）
  const bm25Docs = [];
  for (const m of materials) if (!projectId || m.project_id === projectId || m.project_id === null) {
    bm25Docs.push({ id: `mat:${m.id}`, title: m.name || '', content: m.content || '', category: m.category || 'setting', project_id: m.project_id });
  }
  for (const c of chapters.filter(ch => ch.project_id === projectId)) {
    bm25Docs.push({ id: `ch:${c.id}`, title: `第${c.chapter_no || ''}章 ${c.title || ''}`, content: (c.summary || '') + '\n' + ((c.content || '').slice(0, 400)), category: 'chapter', project_id: c.project_id });
  }
  for (const ch of characters.filter(cc => cc.project_id === projectId || cc.project_id == null)) {
    bm25Docs.push({ id: `char:${ch.id}`, title: ch.name || '', content: (ch.personality || '') + ' ' + (ch.background || '') + ' ' + (ch.content || ''), category: 'character', project_id: ch.project_id });
  }
  const bm25Index = buildBm25Index(bm25Docs);

  const results = [];
  const seenIds = new Set();
  const tryAdd = (arr) => {
    for (const r of arr) {
      const key = r.id || r.chunk?.id;
      if (!key || seenIds.has(key)) continue;
      seenIds.add(key);
      results.push(r);
      if (results.length >= topK * 3) return;
    }
  };

  // Level 1: 向量（可失败）
  let vectorUsed = false;
  if (t.vector_enabled && (settings.vectorEndpoint || settings.apiEndpoint) && (settings.vectorApiKey || settings.apiKey)) {
    try {
      const v = await queryVectors(query, projectId, settings, topK);
      tryAdd(v);
      vectorUsed = v.length > 0;
    } catch (e) { /* 失败后降级 */ }
  }

  // Level 2: 图谱
  if (t.graph_enabled) {
    const g = await queryGraph(query, projectId);
    tryAdd(g);
  }

  // Level 3: BM25 兜底
  if (t.bm25_enabled && bm25Index.N > 0) {
    const b = queryBm25(query, bm25Index, topK);
    tryAdd(b);
  }

  // 失败兜底：如果三级均空，返回 topK 条最近素材
  if (results.length === 0 && t.fallback_enabled) {
    const fallback = bm25Docs.slice(0, topK).map(d => ({ ...d, level: 'fallback' }));
    return {
      level: 'fallback', used: ['fallback'], query,
      results: fallback,
      warning: '三级检索均无结果，已回退到最近素材/章节注入'
    };
  }

  return {
    level: vectorUsed ? 'vector+graph+bm25' : (results.some(r => r.level === 'graph') ? 'graph+bm25' : 'bm25'),
    used: [
      vectorUsed ? 'vector' : null,
      t.graph_enabled ? 'graph' : null,
      t.bm25_enabled ? 'bm25' : null
    ].filter(Boolean),
    query,
    results: results.slice(0, topK)
  };
}

// ============================================================
// 5. 上下文注入（生成前自动选择最相关设定）
// ============================================================
async function buildRagContext(projectId, query, opts = {}) {
  if (!projectId) return { text: '', sources: [], level: 'disabled' };
  try {
    const rag = await hybridRetrieve(query || '当前章节故事', projectId, { topK: opts.topK || 8 });
    const parts = [];
    parts.push('【长篇防崩坏 · 检索上下文注入】');
    parts.push(`检索层级: ${rag.level}（自动融合）`);
    if (rag.warning) parts.push(`⚠ ${rag.warning}`);
    if (rag.results && rag.results.length) {
      parts.push('\n[相关设定/章节/人物]');
      rag.results.forEach((r, i) => {
        const head = `#${i + 1} [${r.level}] ${r.title || r.id} (${r.category || r.type || '—'})`;
        const body = (r.content || '').slice(0, 600);
        parts.push(head + '\n' + body);
      });
    }
    return { text: parts.join('\n'), sources: rag.results || [], level: rag.level };
  } catch (e) {
    return { text: '', sources: [], level: 'error', error: e.message };
  }
}

// ============================================================
// 6. 向量库 CRUD（章节保存/素材保存时调用 ingest）
// ============================================================
router.get('/toggles', async (req, res) => {
  const saved = await readFile('feature_toggles.json').catch(() => ({}));
  res.json({ ...FEATURE_TOGGLE, ...(saved?.toggles || {}) });
});
router.put('/toggles', async (req, res) => {
  const data = (await readFile('feature_toggles.json').catch(() => ({}))) || {};
  data.toggles = { ...(data.toggles || {}), ...(req.body || {}) };
  await writeFile('feature_toggles.json', data);
  res.json(data.toggles);
});

router.get('/chunks', async (req, res) => {
  const list = await listVectorChunks(req.query.project_id || null);
  res.json(list.map(c => ({ id: c.id, project_id: c.project_id, source: c.source, title: c.title, category: c.category, length: (c.content || '').length, createdAt: c.createdAt })));
});

router.post('/chunks', async (req, res) => {
  const { project_id, source, source_id, title, content, category } = req.body;
  if (!content) return res.status(400).json({ error: 'content 不能为空' });
  const settings = await getSettings();
  const data = await readFile('vectors.json') || { chunks: [] };
  if (!data.chunks) data.chunks = [];
  let vector = null;
  if (FEATURE_TOGGLE.vector_enabled && (settings.vectorEndpoint || settings.apiEndpoint)) {
    try { vector = await vectorize(content, settings); } catch (e) { vector = null; }
  }
  const chunk = {
    id: `vec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    project_id: project_id || null,
    source: source || 'manual',
    source_id: source_id || null,
    title: title || '未命名 chunk',
    category: category || 'generic',
    content: String(content).slice(0, 2000),
    vector, // 允许为 null（BM25 仍可用）
    createdAt: new Date().toISOString()
  };
  data.chunks.push(chunk);
  await writeFile('vectors.json', data);
  res.status(201).json({ ...chunk, vector_size: chunk.vector?.length || 0 });
});

router.delete('/chunks/:id', async (req, res) => {
  const data = await readFile('vectors.json') || { chunks: [] };
  data.chunks = (data.chunks || []).filter(c => c.id !== req.params.id);
  await writeFile('vectors.json', data);
  res.json({ success: true });
});

router.post('/ingest/material', async (req, res) => {
  const { material_id } = req.body;
  if (!material_id) return res.status(400).json({ error: '缺少 material_id' });
  const matData = await readFile('materials.json') || { materials: [] };
  const m = (matData.materials || []).find(x => x.id === material_id);
  if (!m) return res.status(404).json({ error: '素材不存在' });
  const data = await readFile('vectors.json') || { chunks: [] };
  if (!data.chunks) data.chunks = [];
  const settings = await getSettings();
  let vector = null;
  if (FEATURE_TOGGLE.vector_enabled && (settings.vectorEndpoint || settings.apiEndpoint)) {
    try { vector = await vectorize(m.name + '\n' + (m.content || ''), settings); } catch (_) {}
  }
  const chunk = {
    id: `vec_mat_${m.id}_${Date.now()}`,
    project_id: m.project_id, source: 'material', source_id: m.id,
    title: m.name || '', category: m.category || 'setting',
    content: (m.content || '').slice(0, 2000), vector,
    createdAt: new Date().toISOString()
  };
  data.chunks = (data.chunks || []).filter(c => c.source !== 'material' || c.source_id !== m.id).concat(chunk);
  await writeFile('vectors.json', data);
  res.json({ id: chunk.id, vector_size: chunk.vector?.length || 0 });
});

router.post('/ingest/chapter', async (req, res) => {
  const { chapter_id } = req.body;
  if (!chapter_id) return res.status(400).json({ error: '缺少 chapter_id' });
  const chData = await readFile('chapters.json') || { chapters: [] };
  const c = (chData.chapters || []).find(x => x.id === chapter_id);
  if (!c) return res.status(404).json({ error: '章节不存在' });
  const data = await readFile('vectors.json') || { chunks: [] };
  if (!data.chunks) data.chunks = [];
  const settings = await getSettings();
  // 按段落切片（约 400 字一段），支持长章节
  const paragraphs = (c.content || '').split(/\n{2,}/).filter(p => p.trim().length > 20);
  const chunks = [];
  for (let i = 0; i < paragraphs.length; i++) {
    let vector = null;
    if (FEATURE_TOGGLE.vector_enabled && (settings.vectorEndpoint || settings.apiEndpoint)) {
      try { vector = await vectorize(paragraphs[i], settings); } catch (_) {}
    }
    chunks.push({
      id: `vec_ch_${c.id}_${i}`, project_id: c.project_id, source: 'chapter', source_id: c.id,
      title: `第${c.chapter_no || ''}章 - 片段${i + 1}`, category: 'chapter',
      content: paragraphs[i].slice(0, 2000), vector,
      createdAt: new Date().toISOString()
    });
  }
  data.chunks = (data.chunks || []).filter(x => x.source !== 'chapter' || x.source_id !== c.id).concat(chunks);
  await writeFile('vectors.json', data);
  res.json({ chapter_id, ingested_chunks: chunks.length, has_vectors: chunks.some(c => c.vector) });
});

// ============================================================
// 7. 混合检索 API（前端直接调用）
// ============================================================
router.post('/retrieve', async (req, res) => {
  const { query, project_id, top_k } = req.body;
  if (!project_id) return res.status(400).json({ error: '缺少 project_id' });
  if (!query) return res.status(400).json({ error: '缺少 query' });
  const out = await hybridRetrieve(query, project_id, { topK: top_k });
  res.json(out);
});

// 纯 BM25（测试用，或快速检索）
router.post('/bm25', async (req, res) => {
  const { query, project_id, top_k } = req.body;
  if (!project_id) return res.status(400).json({ error: '缺少 project_id' });
  const materials = (await readFile('materials.json') || { materials: [] }).materials || [];
  const chapters = (await readFile('chapters.json') || { chapters: [] }).chapters || [];
  const docs = [];
  for (const m of materials) if (m.project_id === project_id || m.project_id == null) docs.push({ id: m.id, title: m.name, content: m.content, category: m.category });
  for (const c of chapters) if (c.project_id === project_id) docs.push({ id: c.id, title: c.title, content: c.content, category: 'chapter' });
  const index = buildBm25Index(docs);
  const result = queryBm25(query, index, top_k || 8);
  res.json({ query, count: result.length, results: result });
});

// ============================================================
// 8. RAG 上下文注入辅助（供 ai-chapter.js 调用）
// ============================================================
router.post('/build-context', async (req, res) => {
  const { project_id, query, top_k } = req.body;
  if (!project_id) return res.status(400).json({ error: '缺少 project_id' });
  const ctx = await buildRagContext(project_id, query || '当前章节', { topK: top_k });
  res.json(ctx);
});

// 简单事件总线：章节保存后自动 ingesting
router.post('/events/chapter-saved', async (req, res) => {
  const { chapter_id } = req.body;
  if (!chapter_id) return res.status(400).json({ error: '缺少 chapter_id' });
  // 异步调用 ingest（这里同步执行，方便前端拿到状态）
  try {
    const result = await (await fetch('http://localhost:' + (process.env.PORT || 3001) + '/api/rag/ingest/chapter', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapter_id })
    })).json();
    res.json({ success: true, ...result });
  } catch (e) {
    // 在独立脚本中可能没有 fetch，走纯 Node https
    res.json({ success: false, note: '事件总线未可用，请直接调用 /api/rag/ingest/chapter', error: e.message });
  }
});

export default router;
export { buildRagContext, hybridRetrieve };
