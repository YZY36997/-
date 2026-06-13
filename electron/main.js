/**
 * 灵墨小说工坊 - Electron 主进程 v3.5.0
 * 
 * 核心特性：
 * 1. 零依赖降级设计：express/cors/axios 全部可选，缺失时用 Node 内置模块
 * 2. 内置后端 API 服务器（与 dev-server.js 功能一致）
 * 3. Electron 窗口 + 本地数据隔离
 * 4. 打包后可独立运行 EXE（无 node_modules 也可）
 */

const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const querystring = require('querystring');

// ------------------------------------------------------------
// 依赖容错层 - 零依赖可运行
// ------------------------------------------------------------
let express = null;
let cors = null;
let axios = null;
let useNativeHttp = true;   // 默认使用原生 https，更稳健
let useExpress = false;
let uuidV4 = null;

try { express = require('express'); useExpress = true; } catch(e) { /* 降级到原生 http */ }
try { cors = require('cors'); } catch(e) { /* 手动设置 CORS 头 */ }
try { axios = require('axios'); useNativeHttp = false; } catch(e) { /* 降级到原生 https */ }
try { uuidV4 = require('uuid').v4; } catch(e) { /* 用内置随机 */ }

function genId(prefix) {
  if (uuidV4) return `${prefix}_${uuidV4().slice(0, 8)}_${Date.now().toString(36)}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ------------------------------------------------------------
// AI API 调用层
// ------------------------------------------------------------
function nativePost(url, data, options) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(url);
      const lib = parsed.protocol === 'https:' ? https : http;
      const postData = JSON.stringify(data || {});
      const reqOptions = {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: Object.assign(
          { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
          options?.headers || {}
        ),
        timeout: options?.timeout || 120000
      };
      const req = lib.request(reqOptions, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try { resolve({ data: JSON.parse(body || '{}'), status: res.statusCode }); }
          catch (e) { resolve({ data: body, status: res.statusCode }); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(new Error('请求超时，请检查网络或 API 地址')); });
      req.write(postData);
      req.end();
    } catch (err) { reject(err); }
  });
}

function httpPost(url, data, options) {
  if (axios && !useNativeHttp) {
    return axios.post(url, data, { headers: options?.headers || {}, timeout: options?.timeout || 120000 });
  }
  return nativePost(url, data, options);
}

// ------------------------------------------------------------
// 环境与数据目录
// ------------------------------------------------------------
const APP_ROOT = path.join(__dirname, '..');
const RENDERER_DIST = path.join(APP_ROOT, 'dist');
const isDev = !process.env.PORTABLE_EXECUTABLE_DIR && (process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development');

const DATA_DIR = process.env.PORTABLE_EXECUTABLE_DIR
  ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'lingmo-data')
  : path.join(app.getPath ? app.getPath('userData') : APP_ROOT, 'data');

try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e) {}

const defaultData = {
  projects: { projects: [] },
  materials: { materials: [] },
  characters: { characters: [] },
  chapters: { chapters: [] },
  generators: { generators: [] },
  templates: { templates: [] },
  settings: { settings: {} }
};
Object.entries(defaultData).forEach(([name, content]) => {
  const fp = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(fp)) { try { fs.writeFileSync(fp, JSON.stringify(content, null, 2)); } catch(e) {} }
});
// 子目录
['chapters', 'characters', 'materials', 'exports'].forEach(sub => {
  const d = path.join(DATA_DIR, sub);
  try { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); } catch(e) {}
});

function readJSON(file, defaultValue) {
  try { if (fs.existsSync(file)) { const raw = fs.readFileSync(file, 'utf-8'); if (raw.trim()) return JSON.parse(raw); } } catch(e) {}
  return defaultValue;
}

function writeJSON(file, data) {
  try {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, file);
    return true;
  } catch (e) { return false; }
}

function writeText(subpath, content) {
  try {
    const full = path.isAbsolute(subpath) ? subpath : path.join(DATA_DIR, subpath);
    const dir = path.dirname(full);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(full, content || '', 'utf-8');
    return true;
  } catch (e) { return false; }
}

function jsonPath(name) { return path.join(DATA_DIR, `${name}.json`); }

async function callAI(settings, systemPrompt, userPrompt, options) {
  const apiKey = settings.apiKey || '';
  const apiEndpoint = settings.apiEndpoint || '';
  const model = settings.model || 'gpt-4';
  const temperature = options?.temperature ?? settings.temperature ?? 0.8;
  const maxTokens = options?.maxTokens || settings.maxTokens || 2000;
  if (!apiKey || !apiEndpoint) throw new Error('请先在设置中配置 AI API 密钥和地址');
  const payload = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature,
    max_tokens: maxTokens
  };
  const response = await httpPost(apiEndpoint, payload, {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    timeout: options?.timeout || 120000
  });
  const text = response?.data?.choices?.[0]?.message?.content || (typeof response?.data === 'string' ? response.data : '');
  return { text, usage: response?.data?.usage };
}

function buildContextSystemPrompt(projectId, style, language, extraContext) {
  const parts = [];
  if (language === 'en') parts.push('You are a professional fiction writer.', `Style:${style || 'balanced'}`, 'Write in English.');
  else parts.push('你是一位专业的网文小说创作者', `创作风格:${style || '爽文风'}`, '语言:简体中文', '严格遵循世界观设定与人物性格');

  try {
    const projects = readJSON(jsonPath('projects'), { projects: [] });
    const project = (projects.projects || []).find(p => p.id === projectId);
    if (project) {
      if (language === 'en') { parts.push(`Title:${project.name}`); if (project.description) parts.push(`Synopsis:${project.description}`); }
      else { parts.push(`作品:《${project.name}》`); if (project.description) parts.push(`简介:${project.description}`); }
    }
  } catch (e) {}

  try {
    const mat = readJSON(jsonPath('materials'), { materials: [] });
    const pm = (mat.materials || []).filter(m => m.project_id === projectId || m.project_id == null);
    if (pm.length) {
      const w = pm.filter(m => m.category === 'worldview');
      const c = pm.filter(m => m.category === 'character');
      const p = pm.filter(m => m.category === 'plot');
      if (w.length) { parts.push(language === 'en' ? '\nWorldbuilding:' : '\n【世界观设定】'); for (const m of w) parts.push(`- ${m.name}:${m.content}`); }
      if (c.length) { parts.push(language === 'en' ? '\nCharacters:' : '\n【主要人物】'); for (const m of c) parts.push(`- ${m.name}:${m.content}`); }
      if (p.length) { parts.push(language === 'en' ? '\nPlot Hooks:' : '\n【情节桥段】'); for (const m of p) parts.push(`- ${m.name}:${m.content}`); }
    }
  } catch (e) {}

  try {
    const chD = readJSON(jsonPath('characters'), { characters: [] });
    const chs = (chD.characters || []).filter(c => c.project_id === projectId || c.project_id == null);
    if (chs.length && language !== 'en') {
      parts.push('【人物详情】');
      for (const c of chs) {
        const line = [
          c.name && `姓名:${c.name}`, c.role && `身份:${c.role}`,
          c.personality && `性格:${c.personality}`, c.abilities && `能力:${c.abilities}`,
          c.goal && `目标:${c.goal}`
        ].filter(Boolean).join(' | ');
        if (line) parts.push('- ' + line);
      }
    }
  } catch (e) {}

  if (extraContext) parts.push(extraContext);
  return parts.join('\n');
}

// ------------------------------------------------------------
// 服务器抽象层 - 与 dev-server.js 保持一致
// ------------------------------------------------------------
function createServer() {
  const routes = [];
  const middlewares = [];

  function parsePattern(pattern) {
    const parts = pattern.split('/').filter(Boolean);
    const paramNames = [];
    const regexParts = parts.map(p => {
      if (p.startsWith(':')) { paramNames.push(p.slice(1)); return '([^/]+)'; }
      return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    return { regex: new RegExp('^/' + regexParts.join('/') + '/?$'), paramNames };
  }

  function register(method, pattern, handler) {
    const { regex, paramNames } = parsePattern(pattern);
    routes.push({ method: method.toUpperCase(), pattern, regex, paramNames, handler });
  }

  function match(req) {
    const url = req.parsedUrl || require('url').parse(req.url);
    req.parsedUrl = url;
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = url.pathname.match(r.regex);
      if (m) {
        req.params = {};
        r.paramNames.forEach((name, i) => { req.params[name] = decodeURIComponent(m[i + 1]); });
        req.query = querystring.parse(url.query || '');
        return r.handler;
      }
    }
    return null;
  }

  const server = {
    get: (p, h) => register('GET', p, h),
    post: (p, h) => register('POST', p, h),
    put: (p, h) => register('PUT', p, h),
    delete: (p, h) => register('DELETE', p, h),
    use: (fn) => { middlewares.push(fn); },
    listen: (port, cb) => {
      function makeRes(res) {
        return {
          status(code) { res.statusCode = code; return this; },
          json(data) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            res.end(JSON.stringify(data));
          },
          send(s) { res.setHeader('Access-Control-Allow-Origin', '*'); res.end(String(s)); }
        };
      }
      const httpServer = http.createServer((req, res) => {
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          res.statusCode = 204; return res.end();
        }
        let body = '';
        req.on('data', (chunk) => { body += chunk; if (body.length > 10 * 1024 * 1024) req.destroy(); });
        req.on('end', () => {
          try { req.body = body.trim() ? JSON.parse(body) : {}; } catch(e) { req.body = {}; }
          for (const mw of middlewares) { try { mw(req, makeRes(res)); } catch(e) {} }
          const handler = match(req);
          if (handler) { try { handler(req, makeRes(res)); } catch(e) { makeRes(res).status(500).json({ error: e.message || '服务器错误' }); } }
          else { makeRes(res).status(404).json({ error: 'NotFound' }); }
        });
      });
      httpServer.listen(port, () => { if (cb) cb(); });
      return httpServer;
    }
  };

  if (useExpress) {
    const app = express();
    if (cors) app.use(cors());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    app._nativeListen = app.listen.bind(app);
    app.listen = (port, cb) => { const s = app._nativeListen(port, () => { if (cb) cb(); }); return s; };
    return app;
  }
  return server;
}

// ------------------------------------------------------------
// API 路由
// ------------------------------------------------------------
function startServer() {
  const app = createServer();

  // 健康检查 & 数据目录
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      version: app.getVersion ? app.getVersion() : '3.5.0',
      dataDir: DATA_DIR,
      engine: useExpress ? 'express' : 'native-http',
      timestamp: new Date().toISOString(),
      features: ['projects', 'materials', 'characters', 'chapters', 'ai-chapter',
        'knowledge-graph', 'foreshadow', 'analysis', 'rules-engine',
        'prompts', 'models', 'rag', 'event-bus', 'feature-toggles',
        'character-memory']
    });
  });
  app.get('/api/data-path', (req, res) => { res.json({ dataDir: DATA_DIR }); });

  // 项目
  app.get('/api/projects', (req, res) => {
    const data = readJSON(jsonPath('projects'), { projects: [] });
    const ch = readJSON(jsonPath('chapters'), { chapters: [] });
    const enriched = (data.projects || []).map(p => {
      const pcs = (ch.chapters || []).filter(c => c.project_id === p.id);
      return { ...p, chapter_count: pcs.length, total_words: pcs.reduce((s, c) => s + (c.word_count || 0), 0) };
    });
    res.json(enriched);
  });
  app.post('/api/projects', (req, res) => {
    const data = readJSON(jsonPath('projects'), { projects: [] });
    if (!data.projects) data.projects = [];
    const project = {
      id: genId('proj'),
      name: req.body.name || '未命名项目',
      description: req.body.description || '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      outline: req.body.outline || { title: '', summary: '', chapters: [], content: '' },
      settings: req.body.settings || {
        genre: '玄幻', style: '爽文风', language: req.body.language || 'zh-CN', target_words_per_chapter: 2000
      }
    };
    data.projects.push(project);
    writeJSON(jsonPath('projects'), data);
    res.status(201).json(project);
  });
  app.get('/api/projects/:id', (req, res) => {
    const data = readJSON(jsonPath('projects'), { projects: [] });
    const p = (data.projects || []).find(p => p.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'NotFound' });
    const ch = readJSON(jsonPath('chapters'), { chapters: [] });
    const chars = readJSON(jsonPath('characters'), { characters: [] });
    const mats = readJSON(jsonPath('materials'), { materials: [] });
    const chapters = (ch.chapters || []).filter(c => c.project_id === p.id).sort((a, b) => (a.chapter_no || 0) - (b.chapter_no || 0));
    const characters = (chars.characters || []).filter(c => c.project_id === p.id || c.project_id == null);
    const materials = (mats.materials || []).filter(m => m.project_id === p.id || m.project_id == null);
    res.json({ ...p, chapters, characters, materials, chapter_count: chapters.length, character_count: characters.length, material_count: materials.length, total_words: chapters.reduce((s, c) => s + (c.word_count || 0), 0) });
  });
  app.put('/api/projects/:id', (req, res) => {
    const data = readJSON(jsonPath('projects'), { projects: [] });
    const idx = (data.projects || []).findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'NotFound' });
    data.projects[idx] = { ...data.projects[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    writeJSON(jsonPath('projects'), data);
    res.json(data.projects[idx]);
  });
  app.put('/api/projects/:id/outline', (req, res) => {
    const data = readJSON(jsonPath('projects'), { projects: [] });
    const idx = (data.projects || []).findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'NotFound' });
    data.projects[idx].outline = req.body.outline || data.projects[idx].outline;
    data.projects[idx].updatedAt = new Date().toISOString();
    writeJSON(jsonPath('projects'), data);
    if (Array.isArray(req.body.chapters) && req.body.chapters.length > 0) {
      try {
        const chData = readJSON(jsonPath('chapters'), { chapters: [] });
        if (!chData.chapters) chData.chapters = [];
        const now = new Date().toISOString();
        const newChs = req.body.chapters.map((ch, i) => ({
          id: genId('ch'),
          project_id: req.params.id,
          chapter_no: ch.chapter_no || (i + 1),
          title: ch.title || `第${i + 1}章`,
          summary: ch.summary || '',
          content: ch.content || '',
          status: ch.content ? 'drafting' : 'outline',
          ai_generated: false,
          word_count: (ch.content || '').length,
          tags: [], notes: ch.notes || '',
          createdAt: now, updatedAt: now
        }));
        chData.chapters = (chData.chapters || []).filter(c => c.project_id !== req.params.id).concat(newChs);
        writeJSON(jsonPath('chapters'), chData);
      } catch (e) {}
    }
    res.json({ success: true, project: data.projects[idx] });
  });
  app.delete('/api/projects/:id', (req, res) => {
    const data = readJSON(jsonPath('projects'), { projects: [] });
    if (!data.projects) data.projects = [];
    data.projects = data.projects.filter(p => p.id !== req.params.id);
    writeJSON(jsonPath('projects'), data);
    const mat = readJSON(jsonPath('materials'), { materials: [] });
    if (mat.materials) { mat.materials = mat.materials.filter(m => m.project_id !== req.params.id); writeJSON(jsonPath('materials'), mat); }
    const ch = readJSON(jsonPath('chapters'), { chapters: [] });
    if (ch.chapters) { ch.chapters = ch.chapters.filter(c => c.project_id !== req.params.id); writeJSON(jsonPath('chapters'), ch); }
    const cData = readJSON(jsonPath('characters'), { characters: [] });
    if (cData.characters) { cData.characters = cData.characters.filter(c => c.project_id !== req.params.id); writeJSON(jsonPath('characters'), cData); }
    res.json({ success: true });
  });
  app.post('/api/projects/:id/import', (req, res) => {
    const { type, text } = req.body;
    const projectId = req.params.id;
    if (!text) return res.status(400).json({ error: 'text 为空' });
    const projectsData = readJSON(jsonPath('projects'), { projects: [] });
    const project = (projectsData.projects || []).find(p => p.id === projectId);
    if (!project) return res.status(404).json({ error: '项目不存在' });
    let stats = { chapters: 0, characters: 0, materials: 0 };

    if (type === 'chapters' || type === 'novel' || type === 'novel_text') {
      const raw = String(text);
      const separator = /\n\s*(?:第[一二三四五六七八九十百千万0-9]+[章回节篇卷])|(?:Chapter\s*\d+)/i;
      const parts = raw.split(separator);
      const now = new Date().toISOString();
      const chData = readJSON(jsonPath('chapters'), { chapters: [] });
      if (!chData.chapters) chData.chapters = [];
      chData.chapters = chData.chapters.filter(c => c.project_id !== projectId);
      const newChs = [];
      for (let i = 0; i < parts.length; i++) {
        const chunk = parts[i].trim();
        if (chunk.length < 20) continue;
        const lines = chunk.split('\n');
        newChs.push({
          id: genId('ch'), project_id: projectId, chapter_no: i + 1,
          title: lines[0].length < 60 ? lines[0] : `第 ${i + 1} 章`,
          summary: (lines.slice(1, 3).join(' ')).slice(0, 200),
          content: lines.slice(1).join('\n').trim(),
          status: 'completed', ai_generated: false,
          word_count: lines.slice(1).join('\n').trim().length,
          tags: ['导入'], notes: '', createdAt: now, updatedAt: now
        });
      }
      chData.chapters.push(...newChs);
      writeJSON(jsonPath('chapters'), chData);
      stats.chapters = newChs.length;
    } else if (type === 'outline' || type === 'outline_text') {
      project.outline = { ...(project.outline || {}), content: text, updatedAt: new Date().toISOString() };
      const idx = projectsData.projects.findIndex(p => p.id === projectId);
      projectsData.projects[idx] = project;
      writeJSON(jsonPath('projects'), projectsData);
    } else if (type === 'materials' || type === 'material_text') {
      const raw = String(text);
      const blocks = raw.split(/\n{2,}/).map(b => b.trim()).filter(b => b.length > 10);
      const now = new Date().toISOString();
      const mData = readJSON(jsonPath('materials'), { materials: [] });
      if (!mData.materials) mData.materials = [];
      const newMats = blocks.map((b, i) => {
        const firstLine = b.split('\n')[0];
        const rest = b.split('\n').slice(1).join('\n').trim();
        return { id: genId('mat'), project_id: projectId, category: 'setting', subCategory: '', name: firstLine.slice(0, 50) || `导入素材 ${i + 1}`, content: rest || b, tags: ['导入'], source: 'text-import', createdAt: now, updatedAt: now };
      });
      mData.materials.push(...newMats);
      writeJSON(jsonPath('materials'), mData);
      stats.materials = newMats.length;
    } else {
      return res.status(400).json({ error: '未知 type, 可用: chapters/novel, outline, materials' });
    }
    res.json({ success: true, type, stats });
  });

  // 素材
  app.get('/api/materials', (req, res) => {
    const data = readJSON(jsonPath('materials'), { materials: [] });
    let list = data.materials || [];
    if (req.query.project_id === 'global') list = list.filter(m => m.project_id === null || m.project_id === undefined);
    else if (req.query.project_id) list = list.filter(m => m.project_id === req.query.project_id);
    if (req.query.category) list = list.filter(m => (m.category || 'setting') === req.query.category);
    if (req.query.keyword) {
      const kw = String(req.query.keyword).toLowerCase();
      list = list.filter(m => (m.name || '').toLowerCase().includes(kw) || (m.content || '').toLowerCase().includes(kw) || ((m.tags || []).some(t => String(t).toLowerCase().includes(kw))));
    }
    res.json(list);
  });
  app.get('/api/materials/categories', (req, res) => {
    res.json([
      { id: 'worldview', name: '世界观' }, { id: 'character', name: '人物' },
      { id: 'setting', name: '场景' }, { id: 'plot', name: '情节桥段' },
      { id: 'dialogue', name: '对话' }, { id: 'writing', name: '文风' },
      { id: 'reference', name: '参考资料' }, { id: 'other', name: '其他' }
    ]);
  });
  app.get('/api/materials/global', (req, res) => {
    const data = readJSON(jsonPath('materials'), { materials: [] });
    res.json((data.materials || []).filter(m => m.project_id === null || m.project_id === undefined));
  });
  app.get('/api/materials/project/:projectId', (req, res) => {
    const data = readJSON(jsonPath('materials'), { materials: [] });
    res.json((data.materials || []).filter(m => m.project_id === req.params.projectId));
  });
  app.get('/api/materials/:id', (req, res) => {
    const data = readJSON(jsonPath('materials'), { materials: [] });
    const m = (data.materials || []).find(x => x.id === req.params.id);
    if (!m) return res.status(404).json({ error: '素材不存在' });
    res.json(m);
  });
  app.post('/api/materials', (req, res) => {
    const data = readJSON(jsonPath('materials'), { materials: [] });
    if (!data.materials) data.materials = [];
    const now = new Date().toISOString();
    const mat = { id: genId('mat'), project_id: req.body.project_id !== undefined ? req.body.project_id : null, category: req.body.category || 'setting', subCategory: req.body.subCategory || '', name: req.body.name || '未命名素材', content: req.body.content || '', tags: req.body.tags || [], source: req.body.source || '', createdAt: now, updatedAt: now };
    data.materials.push(mat); writeJSON(jsonPath('materials'), data); res.status(201).json(mat);
  });
  app.post('/api/materials/batch', (req, res) => {
    const data = readJSON(jsonPath('materials'), { materials: [] });
    if (!data.materials) data.materials = [];
    const now = new Date().toISOString();
    const list = (req.body.materials || []).map(m => ({ id: genId('mat'), project_id: m.project_id !== undefined ? m.project_id : null, category: m.category || 'setting', subCategory: m.subCategory || '', name: m.name || '未命名素材', content: m.content || '', tags: m.tags || [], source: m.source || '', createdAt: now, updatedAt: now }));
    data.materials.push(...list); writeJSON(jsonPath('materials'), data); res.status(201).json(list);
  });
  app.put('/api/materials/:id', (req, res) => {
    const data = readJSON(jsonPath('materials'), { materials: [] });
    const idx = (data.materials || []).findIndex(m => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '素材不存在' });
    data.materials[idx] = { ...data.materials[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    writeJSON(jsonPath('materials'), data); res.json(data.materials[idx]);
  });
  app.delete('/api/materials/:id', (req, res) => {
    const data = readJSON(jsonPath('materials'), { materials: [] });
    if (!data.materials) data.materials = [];
    data.materials = data.materials.filter(m => m.id !== req.params.id);
    writeJSON(jsonPath('materials'), data); res.json({ success: true });
  });
  app.post('/api/materials/batch/delete', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '请提供 ids 数组' });
    const data = readJSON(jsonPath('materials'), { materials: [] });
    if (!data.materials) data.materials = [];
    const before = data.materials.length;
    data.materials = data.materials.filter(m => !ids.includes(m.id));
    writeJSON(jsonPath('materials'), data);
    res.json({ success: true, deleted: before - data.materials.length });
  });
  app.post('/api/materials/import/text', (req, res) => {
    const { text, format, delimiter, project_id, default_category, auto_detect } = req.body;
    if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text 不能为空' });
    const data = readJSON(jsonPath('materials'), { materials: [] });
    if (!data.materials) data.materials = [];
    const raw = String(text);
    const blocks = [];
    const fmt = format || 'auto';
    if (fmt === 'markdown' || (fmt === 'auto' && (raw.includes('## ') || raw.includes('# ')))) {
      const lines = raw.split('\n');
      let current = null;
      for (const line of lines) {
        const titleMatch = line.match(/^#{1,6}\s+(.+)$/);
        if (titleMatch) {
          if (current) blocks.push(current);
          current = { name: titleMatch[1].trim(), content: '' };
        } else if (current) {
          current.content += (current.content ? '\n' : '') + line;
        }
      }
      if (current) blocks.push(current);
      for (const b of blocks) b.content = (b.content || '').trim();
    } else if (fmt === 'custom' && delimiter) {
      const parts = raw.split(delimiter).map(p => p.trim()).filter(Boolean);
      for (const p of parts) {
        const fl = p.split('\n')[0];
        const rest = p.split('\n').slice(1).join('\n').trim();
        blocks.push({ name: fl.slice(0, 80) || '导入素材', content: rest || p });
      }
    } else {
      const parts = raw.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
      for (const p of parts) {
        const fl = p.split('\n')[0];
        const rest = p.split('\n').slice(1).join('\n').trim();
        blocks.push({ name: fl.slice(0, 80) || '导入素材', content: rest || p });
      }
    }
    const now = new Date().toISOString();
    const newMats = blocks.filter(b => b.content && b.content.length > 0).map(b => {
      let category = default_category || 'setting';
      if (auto_detect) {
        const lower = (b.name + ' ' + b.content).toLowerCase();
        if (lower.includes('人物') || lower.includes('character') || lower.includes('person')) category = 'character';
        else if (lower.includes('世界观') || lower.includes('world') || lower.includes('功法')) category = 'worldview';
        else if (lower.includes('场景') || lower.includes('scene') || lower.includes('地点')) category = 'setting';
        else if (lower.includes('剧情') || lower.includes('plot') || lower.includes('桥段')) category = 'plot';
        else if (lower.includes('对话') || lower.includes('dialogue')) category = 'dialogue';
      }
      return { id: genId('mat'), project_id: project_id !== undefined ? project_id : null, category, subCategory: '', name: b.name || '导入素材', content: b.content || '', tags: ['导入'], source: 'text-import', createdAt: now, updatedAt: now };
    });
    data.materials.push(...newMats);
    writeJSON(jsonPath('materials'), data);
    res.status(201).json({ success: true, imported: newMats.length, materials: newMats });
  });
  app.post('/api/materials/export', (req, res) => {
    const { ids, project_id, format, save_to_file } = req.body;
    const data = readJSON(jsonPath('materials'), { materials: [] });
    let list = data?.materials || [];
    if (Array.isArray(ids) && ids.length > 0) list = list.filter(m => ids.includes(m.id));
    else if (project_id === 'global') list = list.filter(m => m.project_id === null || m.project_id === undefined);
    else if (project_id) list = list.filter(m => m.project_id === project_id);

    let output = '';
    if (format === 'json') output = JSON.stringify(list, null, 2);
    else if (format === 'txt') output = list.map(m => `【${m.name}】\n${m.content}`).join('\n\n---\n\n');
    else output = list.map(m => `## ${m.name}\n\n> 分类: ${m.category}\n\n${m.content}`).join('\n\n---\n\n');
    if (save_to_file) writeText(`exports/materials-${Date.now()}.${format === 'json' ? 'json' : format === 'txt' ? 'txt' : 'md'}`, output);
    res.json({ success: true, count: list.length, content: output });
  });
  app.post('/api/materials/:id/move', (req, res) => {
    const { target_project_id, copy } = req.body;
    const data = readJSON(jsonPath('materials'), { materials: [] });
    if (!data.materials) data.materials = [];
    const idx = data.materials.findIndex(m => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '素材不存在' });
    if (copy) {
      const newMat = { ...data.materials[idx], id: genId('mat'), project_id: target_project_id !== undefined ? target_project_id : null, tags: [...(data.materials[idx].tags || []), '复制'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      data.materials.push(newMat);
      writeJSON(jsonPath('materials'), data);
      res.json({ success: true, material: newMat });
    } else {
      data.materials[idx].project_id = target_project_id !== undefined ? target_project_id : null;
      data.materials[idx].updatedAt = new Date().toISOString();
      writeJSON(jsonPath('materials'), data);
      res.json({ success: true, material: data.materials[idx] });
    }
  });
  app.get('/api/materials/stats/summary', (req, res) => {
    const data = readJSON(jsonPath('materials'), { materials: [] });
    const list = data?.materials || [];
    const byCategory = {}; const byProject = {}; let totalChars = 0;
    for (const m of list) {
      byCategory[m.category || 'other'] = (byCategory[m.category || 'other'] || 0) + 1;
      byProject[m.project_id || 'global'] = (byProject[m.project_id || 'global'] || 0) + 1;
      totalChars += (m.content || '').length;
    }
    res.json({ total: list.length, by_category: byCategory, by_project: byProject, total_characters: totalChars, total_words: Math.round(totalChars / 2) });
  });

  // 角色
  app.get('/api/characters', (req, res) => {
    const data = readJSON(jsonPath('characters'), { characters: [] });
    let list = data.characters || [];
    if (req.query.project_id === 'global') list = list.filter(c => c.project_id === null || c.project_id === undefined);
    else if (req.query.project_id) list = list.filter(c => c.project_id === req.query.project_id);
    if (req.query.category) list = list.filter(c => (c.category || 'supporting') === req.query.category);
    if (req.query.keyword) {
      const kw = String(req.query.keyword).toLowerCase();
      list = list.filter(c => (c.name || '').toLowerCase().includes(kw) || (c.content || '').toLowerCase().includes(kw) || (c.role || '').toLowerCase().includes(kw));
    }
    res.json(list);
  });
  app.get('/api/characters/categories', (req, res) => {
    res.json([
      { id: 'protagonist', name: '主角' }, { id: 'antagonist', name: '反派' },
      { id: 'supporting', name: '配角' }, { id: 'other', name: '其他' }
    ]);
  });
  app.get('/api/characters/:id', (req, res) => {
    const data = readJSON(jsonPath('characters'), { characters: [] });
    const c = (data.characters || []).find(x => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: '角色不存在' });
    res.json(c);
  });
  app.post('/api/characters', (req, res) => {
    const data = readJSON(jsonPath('characters'), { characters: [] });
    if (!data.characters) data.characters = [];
    const now = new Date().toISOString();
    const c = {
      id: genId('char'), project_id: req.body.project_id !== undefined ? req.body.project_id : null,
      name: req.body.name || '未命名角色', role: req.body.role || '', gender: req.body.gender || '',
      age: req.body.age || null, personality: req.body.personality || '', background: req.body.background || '',
      appearance: req.body.appearance || '', abilities: req.body.abilities || '',
      relationships: req.body.relationships || '', goal: req.body.goal || '',
      content: req.body.content || '', tags: req.body.tags || [], category: req.body.category || 'supporting',
      // 角色记忆系统扩展字段（防长篇崩坏）
      level: req.body.level || 'B',
      motivation: req.body.motivation || '',
      power: req.body.power || [],
      intro_chapter: req.body.intro_chapter || null,
      current_status: req.body.current_status || 'active',
      memory_notes: req.body.memory_notes || [],
      createdAt: now, updatedAt: now
    };
    data.characters.push(c);
    writeJSON(jsonPath('characters'), data);
    if (c.content) writeText(`characters/${c.id}.txt`, c.content);
    res.status(201).json(c);
  });
  app.post('/api/characters/batch', (req, res) => {
    const data = readJSON(jsonPath('characters'), { characters: [] });
    if (!data.characters) data.characters = [];
    const now = new Date().toISOString();
    const list = (req.body.characters || []).map(c => ({
      id: genId('char'), project_id: c.project_id !== undefined ? c.project_id : null,
      name: c.name || '未命名角色', role: c.role || '', gender: c.gender || '', age: c.age || null,
      personality: c.personality || '', background: c.background || '', appearance: c.appearance || '',
      abilities: c.abilities || '', relationships: c.relationships || '', goal: c.goal || '',
      content: c.content || '', tags: c.tags || [], category: c.category || 'supporting',
      level: c.level || 'B', motivation: c.motivation || '', power: c.power || [],
      intro_chapter: c.intro_chapter || null, current_status: c.current_status || 'active',
      memory_notes: c.memory_notes || [],
      createdAt: now, updatedAt: now
    }));
    data.characters.push(...list);
    writeJSON(jsonPath('characters'), data);
    res.status(201).json(list);
  });
  app.put('/api/characters/:id', (req, res) => {
    const data = readJSON(jsonPath('characters'), { characters: [] });
    const idx = (data.characters || []).findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '角色不存在' });
    data.characters[idx] = { ...data.characters[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    writeJSON(jsonPath('characters'), data);
    if (data.characters[idx].content) writeText(`characters/${req.params.id}.txt`, data.characters[idx].content);
    res.json(data.characters[idx]);
  });
  app.delete('/api/characters/:id', (req, res) => {
    const data = readJSON(jsonPath('characters'), { characters: [] });
    if (!data.characters) data.characters = [];
    data.characters = data.characters.filter(c => c.id !== req.params.id);
    writeJSON(jsonPath('characters'), data);
    res.json({ success: true });
  });
  app.post('/api/characters/import', (req, res) => {
    const { text, project_id } = req.body;
    if (!text) return res.status(400).json({ error: '未提供文本内容' });
    const raw = String(text);
    const blocks = [];
    const parts = raw.split(/\n\s*(?:【|\[)/);
    for (const part of parts) {
      const cleaned = part.replace(/】|\]/g, '').trim();
      if (cleaned.length > 20) {
        const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
        blocks.push({ name: lines[0] || '未命名角色', content: lines.slice(1).join('\n') });
      }
    }
    let items = blocks;
    if (blocks.length === 0) items = [{ name: '导入角色', content: raw }];
    const data = readJSON(jsonPath('characters'), { characters: [] });
    if (!data.characters) data.characters = [];
    const now = new Date().toISOString();
    const newChars = items.map(item => ({
      id: genId('char'), project_id: project_id || null,
      name: item.name || '未命名角色', role: '', gender: '', age: null,
      personality: '', background: '', appearance: '', abilities: '',
      relationships: '', goal: '', content: item.content || '',
      tags: ['导入'], category: 'supporting', createdAt: now, updatedAt: now
    }));
    data.characters.push(...newChars);
    writeJSON(jsonPath('characters'), data);
    for (const c of newChars) if (c.content) writeText(`characters/${c.id}.txt`, c.content);
    res.json({ success: true, imported: newChars.length, characters: newChars });
  });

  // 章节
  app.get('/api/chapters', (req, res) => {
    const data = readJSON(jsonPath('chapters'), { chapters: [] });
    let list = data.chapters || [];
    if (req.query.project_id) list = list.filter(c => c.project_id === req.query.project_id);
    if (req.query.status) list = list.filter(c => c.status === req.query.status);
    if (req.query.keyword) {
      const kw = String(req.query.keyword).toLowerCase();
      list = list.filter(c => (c.title || '').toLowerCase().includes(kw) || (c.content || '').toLowerCase().includes(kw) || (c.summary || '').toLowerCase().includes(kw));
    }
    list.sort((a, b) => (a.chapter_no || 0) - (b.chapter_no || 0));
    res.json(list);
  });
  app.get('/api/chapters/:id', (req, res) => {
    const data = readJSON(jsonPath('chapters'), { chapters: [] });
    const c = (data.chapters || []).find(x => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: '章节不存在' });
    res.json(c);
  });
  app.post('/api/chapters', (req, res) => {
    const data = readJSON(jsonPath('chapters'), { chapters: [] });
    if (!data.chapters) data.chapters = [];
    const now = new Date().toISOString();
    const c = {
      id: genId('ch'), project_id: req.body.project_id || null,
      chapter_no: req.body.chapter_no || ((data.chapters || []).filter(x => x.project_id === req.body.project_id).length + 1),
      title: req.body.title || '新章节', summary: req.body.summary || '', content: req.body.content || '',
      status: req.body.status || 'drafting', ai_generated: !!req.body.ai_generated,
      word_count: (req.body.content || '').length, tags: req.body.tags || [], notes: req.body.notes || '',
      createdAt: now, updatedAt: now
    };
    data.chapters.push(c);
    writeJSON(jsonPath('chapters'), data);
    if (c.content) writeText(`chapters/${c.id}.txt`, c.content);
    res.status(201).json(c);
  });
  app.post('/api/chapters/batch', (req, res) => {
    const data = readJSON(jsonPath('chapters'), { chapters: [] });
    if (!data.chapters) data.chapters = [];
    const now = new Date().toISOString();
    const list = (req.body.chapters || []).map((ch, i) => ({
      id: genId('ch'), project_id: ch.project_id || req.body.project_id || null,
      chapter_no: ch.chapter_no || (i + 1),
      title: ch.title || `第 ${i + 1} 章`, summary: ch.summary || '', content: ch.content || '',
      status: ch.status || (ch.content ? 'drafting' : 'outline'), ai_generated: !!ch.ai_generated,
      word_count: (ch.content || '').length, tags: ch.tags || [], notes: ch.notes || '',
      createdAt: now, updatedAt: now
    }));
    data.chapters.push(...list);
    writeJSON(jsonPath('chapters'), data);
    for (const c of list) if (c.content) writeText(`chapters/${c.id}.txt`, c.content);
    res.status(201).json(list);
  });
  app.put('/api/chapters/:id', (req, res) => {
    const data = readJSON(jsonPath('chapters'), { chapters: [] });
    const idx = (data.chapters || []).findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '章节不存在' });
    const newContent = req.body.content !== undefined ? req.body.content : data.chapters[idx].content;
    data.chapters[idx] = { ...data.chapters[idx], ...req.body, id: req.params.id, word_count: (newContent || '').length, updatedAt: new Date().toISOString() };
    writeJSON(jsonPath('chapters'), data);
    if (newContent) writeText(`chapters/${req.params.id}.txt`, newContent);
    res.json(data.chapters[idx]);
  });
  app.delete('/api/chapters/:id', (req, res) => {
    const data = readJSON(jsonPath('chapters'), { chapters: [] });
    if (!data.chapters) data.chapters = [];
    data.chapters = data.chapters.filter(c => c.id !== req.params.id);
    writeJSON(jsonPath('chapters'), data);
    res.json({ success: true });
  });
  app.get('/api/chapters/stats/:projectId', (req, res) => {
    const data = readJSON(jsonPath('chapters'), { chapters: [] });
    const list = (data.chapters || []).filter(c => c.project_id === req.params.projectId);
    const totalWords = list.reduce((s, c) => s + (c.word_count || 0), 0);
    res.json({
      total_chapters: list.length, total_words: totalWords,
      avg_words_per_chapter: list.length > 0 ? Math.round(totalWords / list.length) : 0,
      completed: list.filter(c => c.status === 'completed').length
    });
  });

  // AI 章节生成
  app.post('/api/ai-chapter/generate-chapter', async (req, res) => {
    try {
      const { project_id, chapter_id, title, summary, chapter_no, style, language, target_words, previous_chapter } = req.body;
      if (!project_id) return res.status(400).json({ error: '必须指定 project_id' });
      const lang = language === 'en' ? 'en' : 'zh-CN';
      const settingsData = readJSON(jsonPath('settings'), { settings: {} });
      const settings = settingsData?.settings || {};
      const extra = [
        title ? (lang === 'en' ? `Chapter Title:${title}` : `本章标题:${title}`) : '',
        (chapter_no != null) ? (lang === 'en' ? `Chapter ${chapter_no}` : `这是第 ${chapter_no} 章`) : '',
        summary ? (lang === 'en' ? `Outline:${summary}` : `本章大纲:${summary}`) : '',
        previous_chapter ? (lang === 'en' ? `Previous chapter context:${previous_chapter}` : `上一章情节回顾:${previous_chapter}`) : ''
      ].filter(Boolean).join('\n');
      const sysPrompt = buildContextSystemPrompt(project_id, style || settings.style || '爽文风', lang, extra);
      let userPrompt;
      if (lang === 'en') userPrompt = `Please write a full chapter.${target_words ? ` Target ~${target_words} words.` : ''}\nWrite in-depth with dialogue, description, and character thoughts. Output the chapter text directly without meta-commentary.`;
      else userPrompt = `请根据以上设定撰写本章正文。${target_words ? `目标字数:约${target_words}字` : ''}\n要求：\n1.注重人物塑造、冲突推进和情绪渲染\n2.加入合理的对话、动作、心理描写\n3.段落适中适合手机阅读\n4.严格遵循世界观设定和人物性格\n5.避免空泛形容词和无意义的重复\n\n直接输出本章正文，不要任何说明或元信息。`;

      const result = await callAI(settings, sysPrompt, userPrompt, { temperature: req.body.temperature, maxTokens: req.body.max_tokens });
      const generatedText = (result.text || '').trim();
      const wordCount = generatedText.length;
      let savedChapter = null;
      try {
        const chData = readJSON(jsonPath('chapters'), { chapters: [] });
        if (!chData.chapters) chData.chapters = [];
        const now = new Date().toISOString();
        const idx = chapter_id ? chData.chapters.findIndex(c => c.id === chapter_id) : -1;
        if (idx !== -1) {
          chData.chapters[idx].content = generatedText;
          chData.chapters[idx].word_count = wordCount;
          chData.chapters[idx].status = 'drafting';
          chData.chapters[idx].ai_generated = true;
          chData.chapters[idx].updatedAt = now;
          savedChapter = chData.chapters[idx];
        } else {
          savedChapter = { id: genId('ch'), project_id, chapter_no: chapter_no || 1, title: title || '新章节', summary: summary || '', content: generatedText, status: 'drafting', ai_generated: true, word_count: wordCount, tags: ['AI生成'], notes: '', createdAt: now, updatedAt: now };
          chData.chapters.push(savedChapter);
        }
        writeJSON(jsonPath('chapters'), chData);
        if (generatedText) writeText(`chapters/${savedChapter.id}.txt`, generatedText);
      } catch (e) {}
      res.json({ success: true, generated_text: generatedText, word_count: wordCount, chapter: savedChapter, usage: result.usage });
    } catch (err) { res.status(500).json({ error: err.message || 'AI生成失败' }); }
  });

  app.post('/api/ai-chapter/continue-chapter', async (req, res) => {
    try {
      const { chapter_id, project_id, language, target_words } = req.body;
      if (!chapter_id) return res.status(400).json({ error: '必须指定 chapter_id' });
      const lang = language === 'en' ? 'en' : 'zh-CN';
      const chData = readJSON(jsonPath('chapters'), { chapters: [] });
      const chapter = (chData.chapters || []).find(c => c.id === chapter_id);
      if (!chapter) return res.status(404).json({ error: '章节不存在' });
      const settingsData = readJSON(jsonPath('settings'), { settings: {} });
      const settings = settingsData?.settings || {};
      const head = (chapter.content || '').length > 500 ? (chapter.content || '').slice(-500) : (chapter.content || '');
      const sysPrompt = buildContextSystemPrompt(chapter.project_id || project_id, settings.style || '爽文风', lang, '');
      let userPrompt;
      if (lang === 'en') userPrompt = `Continue writing from this point:\n\n${head}\n\nContinue directly without transition phrases. Aim for at least 800 words.`;
      else userPrompt = `请从以下段落结束处续写本章正文。${target_words ? `续写字数：约${target_words}字` : ''}\n\n【当前章节末尾】\n${head}\n\n请直接续写正文，不要写"以下是续写内容"等过渡语。`;
      const result = await callAI(settings, sysPrompt, userPrompt, { temperature: req.body.temperature });
      const continuation = (result.text || '').trim();
      const newContent = (chapter.content || '') + (chapter.content && !chapter.content.endsWith('\n') ? '\n' : '') + continuation;
      chapter.content = newContent;
      chapter.word_count = newContent.length;
      chapter.ai_generated = true;
      chapter.updatedAt = new Date().toISOString();
      const idx = chData.chapters.findIndex(c => c.id === chapter_id);
      chData.chapters[idx] = chapter;
      writeJSON(jsonPath('chapters'), chData);
      writeText(`chapters/${chapter.id}.txt`, newContent);
      res.json({ success: true, continuation, total_word_count: newContent.length, chapter });
    } catch (err) { res.status(500).json({ error: err.message || '续写失败' }); }
  });

  app.post('/api/ai-chapter/batch-generate', async (req, res) => {
    try {
      const { project_id, chapters, language, style, temperature } = req.body;
      if (!project_id) return res.status(400).json({ error: '必须指定 project_id' });
      if (!Array.isArray(chapters) || chapters.length === 0) return res.status(400).json({ error: '请提供 chapters 数组' });
      const lang = language === 'en' ? 'en' : 'zh-CN';
      const settingsData = readJSON(jsonPath('settings'), { settings: {} });
      const settings = settingsData?.settings || {};
      const results = [];
      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        try {
          const sys = buildContextSystemPrompt(project_id, style || '爽文风', lang, lang === 'en' ? `Chapter Title:${ch.title}\nOutline:${ch.summary || ''}` : `本章标题:${ch.title}\n本章大纲:${ch.summary || ''}`);
          const user = lang === 'en'
            ? `Please write this chapter (${ch.title}). Write naturally with dialogue, action, and character thoughts.`
            : `请撰写本章《${ch.title}》的正文。本章大纲:${ch.summary || '(无大纲)'}\n直接输出正文，包含对话、动作、心理描写。`;
          const aiRes = await callAI(settings, sys, user, { temperature });
          const text = (aiRes.text || '').trim();
          results.push({ chapter_index: i, chapter_title: ch.title, success: true, text, word_count: text.length });
        } catch (e) { results.push({ chapter_index: i, chapter_title: ch.title, success: false, error: e.message || '生成失败' }); }
      }
      const chData = readJSON(jsonPath('chapters'), { chapters: [] });
      if (!chData.chapters) chData.chapters = [];
      const now = new Date().toISOString();
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.success) {
          const newC = { id: genId('ch'), project_id, chapter_no: chapters[i].chapter_no || (i + 1), title: chapters[i].title || `第 ${i + 1} 章`, summary: chapters[i].summary || '', content: r.text, status: 'drafting', ai_generated: true, word_count: r.word_count, tags: ['AI生成', '批量生成'], notes: '', createdAt: now, updatedAt: now };
          chData.chapters.push(newC);
          if (r.text) writeText(`chapters/${newC.id}.txt`, r.text);
        }
      }
      writeJSON(jsonPath('chapters'), chData);
      const successCount = results.filter(r => r.success).length;
      res.json({ success: true, total: chapters.length, success_count: successCount, results });
    } catch (err) { res.status(500).json({ error: err.message || '批量生成失败' }); }
  });

  app.post('/api/ai-chapter/generate-outline', async (req, res) => {
    try {
      const { project_id, topic, genre, chapter_count, language, style, temperature, max_tokens } = req.body;
      if (!project_id) return res.status(400).json({ error: '必须指定 project_id' });
      const lang = language === 'en' ? 'en' : 'zh-CN';
      const n = chapter_count || 20;
      const settingsData = readJSON(jsonPath('settings'), { settings: {} });
      const settings = settingsData?.settings || {};
      const sysPrompt = buildContextSystemPrompt(project_id, style || '爽文风', lang, '');
      let userPrompt;
      if (lang === 'en') userPrompt = `Please create a novel outline with approximately ${n} chapters.${topic ? `\nTopic:${topic}` : ''}${genre ? `\nGenre:${genre}` : ''}\nFor each chapter provide the chapter number, title, 1-2 sentence plot summary, and main characters involved. Format as numbered list.`;
      else userPrompt = `请为这本小说生成一个约${n}章的完整大纲。${topic ? `\n主题:${topic}` : ''}${genre ? `\n题材:${genre}` : ''}\n每章请包含:章节标题、核心情节1-2句话、本章主要人物。按编号形式输出。`;
      const result = await callAI(settings, sysPrompt, userPrompt, { temperature, maxTokens: max_tokens || 4000 });
      res.json({ success: true, outline: result.text || '', usage: result.usage });
    } catch (err) { res.status(500).json({ error: err.message || '大纲生成失败' }); }
  });

  app.post('/api/ai-chapter/generate-character', async (req, res) => {
    try {
      const { project_id, name, role, hints, language, style, temperature } = req.body;
      if (!name) return res.status(400).json({ error: '必须指定角色名' });
      const lang = language === 'en' ? 'en' : 'zh-CN';
      const settingsData = readJSON(jsonPath('settings'), { settings: {} });
      const settings = settingsData?.settings || {};
      const sysPrompt = buildContextSystemPrompt(project_id || null, style || '爽文风', lang, '');
      let userPrompt;
      if (lang === 'en') userPrompt = `Create a detailed character profile for "${name}".${role ? `\nRole:${role}` : ''}${hints ? `\nNotes:${hints}` : ''}\nInclude personality, background, appearance, abilities, relationships, and motivation. Output a coherent detailed description.`;
      else userPrompt = `请为角色"${name}"生成一份完整的角色设定。${role ? `\n身份定位:${role}` : ''}${hints ? `\n补充说明:${hints}` : ''}\n请包含以下维度:1.性格特征 2.背景来历 3.外貌描写 4.能力功法特长 5.与其他主要人物关系 6.目标动机\n请输出条理清晰的文字描述，长度500字以上。`;
      const result = await callAI(settings, sysPrompt, userPrompt, { temperature });
      const text = (result.text || '').trim();
      let savedChar = null;
      try {
        const cD = readJSON(jsonPath('characters'), { characters: [] });
        if (!cD.characters) cD.characters = [];
        const now = new Date().toISOString();
        savedChar = { id: genId('char'), project_id: project_id || null, name: name, role: role || '', gender: '', age: null, personality: '', background: '', appearance: '', abilities: '', relationships: '', goal: '', content: text, tags: ['AI生成'], category: 'supporting', createdAt: now, updatedAt: now };
        cD.characters.push(savedChar);
        writeJSON(jsonPath('characters'), cD);
        if (text) writeText(`characters/${savedChar.id}.txt`, text);
      } catch (e) {}
      res.json({ success: true, generated_text: text, word_count: text.length, character: savedChar });
    } catch (err) { res.status(500).json({ error: err.message || '角色生成失败' }); }
  });

  // 生成器
  app.get('/api/generators', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'generators.json'), { generators: [] });
    res.json(data.generators || []);
  });
  app.get('/api/generators/categories', (req, res) => {
    res.json([
      { id: 'outline', name: '大纲类' }, { id: 'character', name: '人物类' }, { id: 'worldview', name: '世界观类' },
      { id: 'plot', name: '情节类' }, { id: 'dialogue', name: '对话类' }, { id: 'writing', name: '文风/润色类' },
      { id: 'template', name: '爆文模板类' }, { id: 'tool', name: '工具类' }, { id: 'custom', name: '自定义' }
    ]);
  });
  app.post('/api/generators', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'generators.json'), { generators: [] });
    if (!data.generators) data.generators = [];
    const gen = { id: `gen_custom_${Date.now()}`, category: req.body.category || 'custom', name: req.body.name || '自定义生成器', description: req.body.description || '', systemPrompt: req.body.systemPrompt || '', userPromptTemplate: req.body.userPromptTemplate || '', defaultParams: req.body.defaultParams || { temperature: 0.8, maxTokens: 2000 }, isCustom: true, project_id: req.body.project_id || null, createdAt: new Date().toISOString() };
    data.generators.push(gen); writeJSON(path.join(DATA_DIR, 'generators.json'), data); res.status(201).json(gen);
  });
  app.put('/api/generators/:id', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'generators.json'), { generators: [] });
    const idx = (data.generators || []).findIndex(g => g.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'NotFound' });
    data.generators[idx] = { ...data.generators[idx], ...req.body, id: req.params.id, isCustom: true };
    writeJSON(path.join(DATA_DIR, 'generators.json'), data); res.json(data.generators[idx]);
  });
  app.delete('/api/generators/:id', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'generators.json'), { generators: [] });
    if (!data.generators) data.generators = [];
    data.generators = data.generators.filter(g => g.id !== req.params.id || !g.isCustom);
    writeJSON(path.join(DATA_DIR, 'generators.json'), data); res.json({ success: true });
  });

  // AI 生成
  app.post('/api/generators/generate', async (req, res) => {
    const { generator_id, params, project_id, with_project_material } = req.body;
    const genData = readJSON(path.join(DATA_DIR, 'generators.json'), { generators: [] });
    const gen = (genData.generators || []).find(g => g.id === generator_id);
    const settings = readJSON(path.join(DATA_DIR, 'settings.json'), { settings: {} }).settings || {};
    if (!settings.apiKey || !settings.apiEndpoint) {
      return res.status(400).json({ error: `请在设置中配置 AI API。\n\n当前状态:\n- API密钥: ${settings.apiKey ? '已配置 ✓' : '未配置 ✗'}\n- API地址: ${settings.apiEndpoint || '未配置'}\n- 模型: ${settings.model || '(默认 gpt-4)'}\n\n支持所有兼容 OpenAI 接口格式的服务商 (Ollama / DeepSeek / Claude 等)。` });
    }
    const builtinTpl = {
      gen_outline_basic: { sys: '你是一个资深网文编辑，擅长将创意打磨成完整可行的小说大纲。请严格按照大纲结构输出：核心卖点、主题、主线、分卷结构、章节列表、结局设计。', user: '用户创意：\n{input}\n\n题材：{genre}\n文风：{style}\n请输出完整大纲。' },
      gen_character_card: { sys: '你是网文人物设计专家。请生成生动、立体的人物设定，包含外貌、性格、成长轨迹、关系网络等。', user: '人物定位：{input}\n请输出完整人物设定卡。' },
      gen_worldview_basic: { sys: '你是世界级奇幻/科幻设定专家，请构建严谨自洽的世界观体系。', user: '核心创意：{input}\n请输出完整世界观。' },
      gen_plot_conflict: { sys: '你是顶级剧情设计顾问，擅长设计令人拍案叫绝的剧情冲突、反转和高潮。', user: '当前章节背景：{input}\n请设计一个精彩冲突桥段（起因、经过、反转、结果）。' },
      gen_writing_enhance: { sys: '你是文学编辑，擅长将普通文字改写成有画面感、有节奏、有张力的高质量文字。', user: '原文：\n{input}\n请润色。要求：{requirement}' },
      gen_tool_names: { sys: '你是起名大师，请根据风格生成有创意、好记、符合题材的名称。', user: '类型：{type}\n数量：{count}\n风格：{style}\n题材：{genre}\n请输出。' },
      gen_template_kpi: { sys: '你是网文爆款内容专家，熟悉行业KPI数据。', user: '题材：{genre}\n核心卖点：{sellingPoint}\n请生成：5个高点击率标题 + 300字黄金开头。' }
    };
    const tpl = builtinTpl[generator_id] || {
      sys: gen?.systemPrompt || '你是网文写作助手，请帮助用户创作高质量内容。',
      user: (gen?.userPromptTemplate || '').replace(/\{(\w+)\}/g, (match, key) => params?.[key] != null ? String(params[key]) : match) || '请根据输入创作：\n{input}'
    };
    const replaceVars = (t) => t.replace(/\{(\w+)\}/g, (match, key) => {
      const val = params?.[key];
      return val != null && String(val).trim() !== '' ? String(val) :
        (key === 'genre' ? '玄幻' : key === 'style' ? '爽文风' : key === 'count' ? '10' : key === 'type' ? '人名' : key === 'sellingPoint' ? '系统流' : key === 'input' ? '请补充输入内容' : '');
    });
    let systemPrompt = tpl.sys, userPrompt = replaceVars(tpl.user);
    if (with_project_material && project_id) {
      const matData = readJSON(path.join(DATA_DIR, 'materials.json'), { materials: [] });
      const projMat = (matData.materials || []).filter(m => m.project_id === project_id && ['worldview', 'character', 'setting', 'plot'].includes(m.category));
      if (projMat.length > 0) {
        const ctx = projMat.slice(0, 5).map(m => `【${m.name}】\n${m.content}`).join('\n\n------\n\n');
        systemPrompt = `当前项目核心设定，请严格遵循：\n\n${ctx}\n\n------\n\n${systemPrompt}`;
      }
    }
    try {
      const response = await httpPost(settings.apiEndpoint, {
        model: settings.model || 'gpt-4',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        temperature: params?.temperature ?? gen?.defaultParams?.temperature ?? settings.temperature ?? 0.8,
        max_tokens: params?.maxTokens ?? gen?.defaultParams?.maxTokens ?? settings.maxTokens ?? 2000
      }, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` }, timeout: 120000 });
      const generatedText = response.data?.choices?.[0]?.message?.content || '';
      if (project_id) {
        try {
          const projFile = path.join(DATA_DIR, 'projects.json');
          const projData = readJSON(projFile, { projects: [] });
          const projIdx = (projData.projects || []).findIndex(p => p.id === project_id);
          if (projIdx !== -1) {
            if (!projData.projects[projIdx].generations) projData.projects[projIdx].generations = [];
            projData.projects[projIdx].generations.push({ generator: gen?.name || 'AI生成', prompt: userPrompt, result: generatedText, createdAt: new Date().toISOString() });
            projData.projects[projIdx].updatedAt = new Date().toISOString();
            writeJSON(projFile, projData);
          }
        } catch (_) {}
      }
      res.json({ success: true, generated_text: generatedText, usage: response.data.usage });
    } catch (err) {
      const msg = err?.response?.data?.error?.message || err?.response?.data?.error || err?.message || '生成失败，请检查 API 配置或网络连接';
      res.status(500).json({ error: `AI生成失败: ${msg}` });
    }
  });

  // 模板
  app.get('/api/templates', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'templates.json'), { templates: [] });
    let list = data.templates || [];
    if (req.query.genre) list = list.filter(t => t.genre === req.query.genre);
    if (req.query.function) list = list.filter(t => t.function === req.query.function);
    res.json(list);
  });
  app.post('/api/templates', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'templates.json'), { templates: [] });
    if (!data.templates) data.templates = [];
    const tpl = { id: `tpl_${Date.now()}`, ...req.body, createdAt: new Date().toISOString() };
    data.templates.push(tpl); writeJSON(path.join(DATA_DIR, 'templates.json'), data); res.status(201).json(tpl);
  });
  app.put('/api/templates/:id', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'templates.json'), { templates: [] });
    const idx = (data.templates || []).findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'NotFound' });
    data.templates[idx] = { ...data.templates[idx], ...req.body, id: req.params.id };
    writeJSON(path.join(DATA_DIR, 'templates.json'), data); res.json(data.templates[idx]);
  });

  // 设置
  app.get('/api/settings', (req, res) => {
    const data = readJSON(jsonPath('settings'), { settings: {} });
    const s = data.settings || {};
    const safe = { ...s };
    if (safe.apiKey) {
      const key = String(safe.apiKey);
      safe.apiKey = key.length > 8 ? (key.slice(0, 4) + '****' + key.slice(-4)) : '****';
    }
    safe._currentDataDir = DATA_DIR;
    res.json(safe);
  });
  app.put('/api/settings', (req, res) => {
    const data = readJSON(jsonPath('settings'), { settings: {} });
    const original = (data.settings || {}).apiKey || '';
    let newKey = req.body.apiKey;
    if (typeof newKey === 'string' && newKey.includes('****')) newKey = original;
    data.settings = { ...(data.settings || {}), ...req.body };
    if (newKey !== undefined) data.settings.apiKey = newKey;
    if (req.body.customDataDir && typeof req.body.customDataDir === 'string' && req.body.customDataDir.trim()) {
      DATA_DIR = req.body.customDataDir.trim();
    }
    writeJSON(jsonPath('settings'), data);
    const safe = { ...data.settings };
    if (safe.apiKey) {
      const k = String(safe.apiKey);
      safe.apiKey = k.length > 8 ? (k.slice(0, 4) + '****' + k.slice(-4)) : '****';
    }
    res.json(safe);
  });
  app.post('/api/settings/data-dir', (req, res) => {
    try {
      const { dir } = req.body;
      if (!dir || typeof dir !== 'string' || !dir.trim()) return res.status(400).json({ error: 'dir 不能为空' });
      const data = readJSON(jsonPath('settings'), { settings: {} });
      if (!data.settings) data.settings = {};
      const oldDir = DATA_DIR;
      data.settings.customDataDir = dir.trim();
      writeJSON(jsonPath('settings'), data);
      DATA_DIR = dir.trim();
      res.json({ success: true, old_data_dir: oldDir, new_data_dir: DATA_DIR });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/settings/language', (req, res) => {
    const { language } = req.body;
    const lang = (language === 'en' || language === 'zh-CN') ? language : 'zh-CN';
    const data = readJSON(jsonPath('settings'), { settings: {} });
    if (!data.settings) data.settings = {};
    data.settings.language = lang;
    writeJSON(jsonPath('settings'), data);
    res.json({ success: true, language: lang, label: lang === 'en' ? 'English' : '简体中文' });
  });
  app.get('/api/settings/languages', (req, res) => {
    res.json([{ id: 'zh-CN', label: '简体中文', flag: '🇨🇳' }, { id: 'en', label: 'English', flag: '🇺🇸' }]);
  });
  app.get('/api/settings/summary', (req, res) => {
    const data = readJSON(jsonPath('settings'), { settings: {} });
    const s = data?.settings || {};
    res.json({
      language: s.language || 'zh-CN',
      data_dir: DATA_DIR,
      customDataDir: s.customDataDir || '',
      ai: { apiEndpoint: s.apiEndpoint || '', model: s.model || '', temperature: s.temperature ?? 0.8, maxTokens: s.maxTokens ?? 2000, configured: !!(s.apiKey && s.apiEndpoint) },
      writing: { default_genre: s.default_genre || s.genre || '玄幻', default_style: s.default_style || s.style || '爽文风', target_words_per_chapter: s.target_words_per_chapter || 2000 },
      ui: { theme: s.theme || 'auto' }
    });
  });
  app.post('/api/settings/reset', (req, res) => {
    const data = readJSON(jsonPath('settings'), { settings: {} });
    data.settings = { language: 'zh-CN', genre: '玄幻', style: '爽文风', theme: 'auto' };
    writeJSON(jsonPath('settings'), data);
    res.json({ success: true, settings: data.settings });
  });

  // 大纲补全
  app.post('/api/outline/complete', async (req, res) => {
    const { incomplete_outline, style, project_id } = req.body;
    const settings = readJSON(path.join(DATA_DIR, 'settings.json'), { settings: {} }).settings || {};
    if (!settings.apiKey || !settings.apiEndpoint) return res.status(400).json({ error: '请先在设置中配置 AI API 密钥和地址' });
    try {
      const response = await httpPost(settings.apiEndpoint, {
        model: settings.model || 'gpt-4',
        messages: [{ role: 'system', content: '你是一个专业的网文大纲策划专家，擅长补全不完整的大纲。请生成完整的世界观、人物、分卷、章节、转折点和结局设计。' }, { role: 'user', content: `残缺大纲：\n${incomplete_outline}\n\n风格：${style || '爽文风'}\n请补全为完整小说大纲。` }],
        temperature: 0.85, max_tokens: 3000
      }, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` }, timeout: 120000 });
      const result = response.data?.choices?.[0]?.message?.content || '';
      try {
        const mat = readJSON(path.join(DATA_DIR, 'materials.json'), { materials: [] });
        if (!mat.materials) mat.materials = [];
        mat.materials.push({ id: genId('mat'), project_id: project_id || null, category: 'plot', subCategory: '大纲', name: `补全大纲 ${new Date().toLocaleString()}`, content: result, tags: ['AI补全', style || '爽文风'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        writeJSON(path.join(DATA_DIR, 'materials.json'), mat);
      } catch (_) {}
      res.json({ success: true, completed_outline: result });
    } catch (err) { res.status(500).json({ error: err?.response?.data?.error?.message || err?.message || '补全失败，请检查网络或 API 配置' }); }
  });

  // 大纲合成
  app.post('/api/outline/merge', async (req, res) => {
    const { outlines, style, project_id } = req.body;
    if (!Array.isArray(outlines) || outlines.length < 2) return res.status(400).json({ error: '至少需要 2 份大纲才能合成' });
    const settings = readJSON(path.join(DATA_DIR, 'settings.json'), { settings: {} }).settings || {};
    if (!settings.apiKey || !settings.apiEndpoint) return res.status(400).json({ error: '请先在设置中配置 AI API' });
    try {
      const combined = outlines.map((o, i) => `大纲${i + 1}：\n${typeof o === 'string' ? o : (o.content || '')}`).join('\n\n---\n\n');
      const response = await httpPost(settings.apiEndpoint, {
        model: settings.model || 'gpt-4',
        messages: [{ role: 'system', content: '你是一个专业的网文大纲策划专家，擅长将多份大纲合成为逻辑通顺的完整大纲。请梳理时间线、去重冲突、拼接逻辑。' }, { role: 'user', content: `待合成的${outlines.length}份大纲：\n\n${combined}\n\n请合成为一份完整大纲。` }],
        temperature: 0.85, max_tokens: 4000
      }, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` }, timeout: 120000 });
      const result = response.data?.choices?.[0]?.message?.content || '';
      try {
        const mat = readJSON(path.join(DATA_DIR, 'materials.json'), { materials: [] });
        if (!mat.materials) mat.materials = [];
        mat.materials.push({ id: genId('mat'), project_id: project_id || null, category: 'plot', subCategory: '合成大纲', name: `合成大纲 ${new Date().toLocaleString()}`, content: result, tags: ['AI合成', `${outlines.length}份合并`], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        writeJSON(path.join(DATA_DIR, 'materials.json'), mat);
      } catch (_) {}
      res.json({ success: true, merged_outline: result });
    } catch (err) { res.status(500).json({ error: err?.response?.data?.error?.message || err?.message || '合成失败，请检查网络或 API 配置' }); }
  });

  // 大纲导入
  app.post('/api/outline/import', (req, res) => {
    const { outline, project_name, project_id } = req.body;
    const data = readJSON(path.join(DATA_DIR, 'projects.json'), { projects: [] });
    if (!data.projects) data.projects = [];
    const pid = project_id || genId('proj');
    const idx = data.projects.findIndex(p => p.id === pid);
    if (idx >= 0) {
      data.projects[idx] = { ...data.projects[idx], outline: { title: outline?.title || data.projects[idx].outline?.title || '', summary: outline?.summary || data.projects[idx].outline?.summary || '', chapters: outline?.chapters || data.projects[idx].outline?.chapters || [], content: outline?.content || data.projects[idx].outline?.content || '' }, updatedAt: new Date().toISOString() };
    } else {
      data.projects.push({ id: pid, name: project_name || '新小说项目', description: outline?.summary || '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), outline: { title: outline?.title || '', summary: outline?.summary || '', chapters: outline?.chapters || [], content: outline?.content || '' }, settings: { genre: outline?.genre || '玄幻', style: outline?.style || '爽文风' } });
    }
    writeJSON(path.join(DATA_DIR, 'projects.json'), data);
    if (outline?.content) {
      try {
        const mat = readJSON(path.join(DATA_DIR, 'materials.json'), { materials: [] });
        if (!mat.materials) mat.materials = [];
        mat.materials.push({ id: genId('mat'), project_id: pid, category: 'plot', subCategory: '大纲导入', name: '导入的大纲', content: outline.content, tags: ['导入'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        writeJSON(path.join(DATA_DIR, 'materials.json'), mat);
      } catch (_) {}
    }
    res.status(201).json({ project_id: pid, message: '导入成功' });
  });

  // ============================================================
  // 14. 知识图谱 (knowledge-graph) - 人物关系图谱/节点拖拽/手动连线/分组管理
  // ============================================================
  app.get('/api/knowledge-graph/meta', (req, res) => {
    res.json({
      relation_types: [
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
      ],
      node_types: [
        { id: 'character', label: '人物' }, { id: 'faction', label: '势力' },
        { id: 'item', label: '道具/功法' }, { id: 'location', label: '地点' },
        { id: 'foreshadowing', label: '伏笔' }, { id: 'generic', label: '其他' }
      ]
    });
  });

  app.get('/api/knowledge-graph', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'knowledge_graphs.json'), { graphs: {} });
    const g = (all.graphs && all.graphs[req.query.project_id]) || { nodes: [], edges: [], history: [] };
    res.json(g);
  });

  app.post('/api/knowledge-graph/nodes', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'knowledge_graphs.json'), { graphs: {} });
    if (!all.graphs) all.graphs = {};
    if (!all.graphs[req.body.project_id]) all.graphs[req.body.project_id] = { nodes: [], edges: [], history: [] };
    const node = {
      id: 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      type: req.body.type || 'character',
      name: req.body.name || '未命名节点',
      summary: req.body.summary || '',
      tags: req.body.tags || [],
      character_id: req.body.character_id || null,
      coordinates: req.body.coordinates || { x: Math.random() * 600, y: Math.random() * 400 },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    all.graphs[req.body.project_id].nodes.push(node);
    writeJSON(path.join(DATA_DIR, 'knowledge_graphs.json'), all);
    res.status(201).json(node);
  });

  app.put('/api/knowledge-graph/nodes/:id', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'knowledge_graphs.json'), { graphs: {} });
    const pid = req.body.project_id || req.query.project_id;
    if (!all.graphs || !all.graphs[pid]) return res.status(404).json({ error: '不存在项目图谱' });
    const g = all.graphs[pid];
    const idx = g.nodes.findIndex(n => n.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '节点不存在' });
    g.nodes[idx] = { ...g.nodes[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    writeJSON(path.join(DATA_DIR, 'knowledge_graphs.json'), all);
    res.json(g.nodes[idx]);
  });

  app.delete('/api/knowledge-graph/nodes/:id', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'knowledge_graphs.json'), { graphs: {} });
    const pid = req.query.project_id;
    if (!all.graphs || !all.graphs[pid]) return res.status(404).json({ error: '不存在项目图谱' });
    all.graphs[pid].nodes = all.graphs[pid].nodes.filter(n => n.id !== req.params.id);
    all.graphs[pid].edges = all.graphs[pid].edges.filter(e => e.source !== req.params.id && e.target !== req.params.id);
    writeJSON(path.join(DATA_DIR, 'knowledge_graphs.json'), all);
    res.json({ success: true });
  });

  app.post('/api/knowledge-graph/edges', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'knowledge_graphs.json'), { graphs: {} });
    if (!all.graphs[req.body.project_id]) all.graphs[req.body.project_id] = { nodes: [], edges: [], history: [] };
    const g = all.graphs[req.body.project_id];
    if (!req.body.source || !req.body.target) return res.status(400).json({ error: 'source / target 必填' });
    const edge = {
      id: 'e_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      source: req.body.source, target: req.body.target,
      type: req.body.type || 'other', label: req.body.label || '', weight: req.body.weight || 1,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    g.edges.push(edge);
    writeJSON(path.join(DATA_DIR, 'knowledge_graphs.json'), all);
    res.status(201).json(edge);
  });

  app.put('/api/knowledge-graph/edges/:id', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'knowledge_graphs.json'), { graphs: {} });
    const pid = req.body.project_id || req.query.project_id;
    if (!all.graphs || !all.graphs[pid]) return res.status(404).json({ error: '不存在项目图谱' });
    const g = all.graphs[pid];
    const idx = g.edges.findIndex(e => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '边不存在' });
    g.edges[idx] = { ...g.edges[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    writeJSON(path.join(DATA_DIR, 'knowledge_graphs.json'), all);
    res.json(g.edges[idx]);
  });

  app.delete('/api/knowledge-graph/edges/:id', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'knowledge_graphs.json'), { graphs: {} });
    const pid = req.query.project_id;
    if (!all.graphs || !all.graphs[pid]) return res.status(404).json({ error: '不存在项目图谱' });
    all.graphs[pid].edges = all.graphs[pid].edges.filter(e => e.id !== req.params.id);
    writeJSON(path.join(DATA_DIR, 'knowledge_graphs.json'), all);
    res.json({ success: true });
  });

  app.post('/api/knowledge-graph/history', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'knowledge_graphs.json'), { graphs: {} });
    if (!all.graphs[req.body.project_id]) all.graphs[req.body.project_id] = { nodes: [], edges: [], history: [] };
    const g = all.graphs[req.body.project_id];
    if (!g.history) g.history = [];
    const h = {
      id: 'h_' + Date.now().toString(36),
      edge_id: req.body.edge_id, chapter_no: req.body.chapter_no || null,
      from_type: req.body.from_type, to_type: req.body.to_type,
      label: req.body.label || '', description: req.body.description || '',
      createdAt: new Date().toISOString()
    };
    g.history.push(h);
    writeJSON(path.join(DATA_DIR, 'knowledge_graphs.json'), all);
    res.status(201).json(h);
  });

  app.get('/api/knowledge-graph/history', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'knowledge_graphs.json'), { graphs: {} });
    const g = (all.graphs || {})[req.query.project_id] || { history: [] };
    res.json(g.history || []);
  });

  app.post('/api/knowledge-graph/auto-import-characters', (req, res) => {
    const { project_id } = req.body;
    const charsData = readJSON(path.join(DATA_DIR, 'characters.json'), { characters: [] });
    const list = (charsData.characters || []).filter(c => c.project_id === project_id || (c.project_id == null));
    const all = readJSON(path.join(DATA_DIR, 'knowledge_graphs.json'), { graphs: {} });
    if (!all.graphs[project_id]) all.graphs[project_id] = { nodes: [], edges: [], history: [] };
    const g = all.graphs[project_id];
    const existing = new Set(g.nodes.filter(n => n.type === 'character').map(n => n.character_id));
    for (const c of list) {
      if (existing.has(c.id)) continue;
      g.nodes.push({
        id: 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        type: 'character', name: c.name,
        summary: (c.personality || '') + ' ' + (c.background || ''),
        tags: c.tags || [], character_id: c.id,
        coordinates: { x: 120 + existing.size * 20, y: 120 + existing.size * 20 },
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }
    writeJSON(path.join(DATA_DIR, 'knowledge_graphs.json'), all);
    res.json({ imported: list.filter(c => !existing.has(c.id)).length, total_nodes: g.nodes.length });
  });

  app.get('/api/knowledge-graph/summary', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'knowledge_graphs.json'), { graphs: {} });
    const g = (all.graphs || {})[req.query.project_id] || { nodes: [], edges: [], history: [] };
    const byType = {};
    for (const n of g.nodes || []) byType[n.type] = (byType[n.type] || 0) + 1;
    res.json({ nodes: (g.nodes || []).length, edges: (g.edges || []).length, history: (g.history || []).length, by_type: byType });
  });

  app.get('/api/knowledge-graph/adjacency', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'knowledge_graphs.json'), { graphs: {} });
    const g = (all.graphs || {})[req.query.project_id] || { nodes: [], edges: [] };
    const adj = {};
    for (const n of g.nodes || []) adj[n.id] = [];
    for (const e of g.edges || []) {
      if (adj[e.source]) adj[e.source].push(e.target);
      if (adj[e.target]) adj[e.target].push(e.source);
    }
    res.json({ adjacency: adj, nodes: g.nodes, edges: g.edges });
  });

  // ============================================================
  // 15. 伏笔库 (foreshadow) - 管理埋设/回收状态，支持情节债务追踪
  // ============================================================
  app.get('/api/foreshadow', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'foreshadows.json'), { foreshadows: [] });
    let list = all.foreshadows || [];
    if (req.query.project_id) list = list.filter(f => f.project_id === req.query.project_id);
    if (req.query.status) list = list.filter(f => f.status === req.query.status);
    res.json(list.sort((a, b) => (a.priority || 0) < (b.priority || 0) ? 1 : -1));
  });

  app.post('/api/foreshadow', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'foreshadows.json'), { foreshadows: [] });
    const f = {
      id: 'fs_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      project_id: req.body.project_id || null,
      title: req.body.title || '未命名伏笔',
      content: req.body.content || '',
      category: req.body.category || 'mid',
      status: req.body.status || 'planted',
      planted_chapter: req.body.planted_chapter || null,
      recovered_chapter: req.body.recovered_chapter || null,
      related_characters: req.body.related_characters || [],
      related_materials: req.body.related_materials || [],
      priority: req.body.priority !== undefined ? req.body.priority : 3,
      tags: req.body.tags || [], note: req.body.note || '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    all.foreshadows.push(f);
    writeJSON(path.join(DATA_DIR, 'foreshadows.json'), all);
    res.status(201).json(f);
  });

  app.put('/api/foreshadow/:id', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'foreshadows.json'), { foreshadows: [] });
    const idx = (all.foreshadows || []).findIndex(f => f.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '伏笔不存在' });
    all.foreshadows[idx] = { ...all.foreshadows[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    writeJSON(path.join(DATA_DIR, 'foreshadows.json'), all);
    res.json(all.foreshadows[idx]);
  });

  app.post('/api/foreshadow/:id/recover', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'foreshadows.json'), { foreshadows: [] });
    const idx = (all.foreshadows || []).findIndex(f => f.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '伏笔不存在' });
    all.foreshadows[idx].status = 'recovered';
    all.foreshadows[idx].recovered_chapter = req.body.recovered_chapter || all.foreshadows[idx].recovered_chapter;
    all.foreshadows[idx].recovered_note = req.body.note || '';
    all.foreshadows[idx].updatedAt = new Date().toISOString();
    writeJSON(path.join(DATA_DIR, 'foreshadows.json'), all);
    res.json(all.foreshadows[idx]);
  });

  app.delete('/api/foreshadow/:id', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'foreshadows.json'), { foreshadows: [] });
    all.foreshadows = (all.foreshadows || []).filter(f => f.id !== req.params.id);
    writeJSON(path.join(DATA_DIR, 'foreshadows.json'), all);
    res.json({ success: true });
  });

  app.get('/api/foreshadow/summary/:projectId', (req, res) => {
    const list = (readJSON(path.join(DATA_DIR, 'foreshadows.json'), { foreshadows: [] }).foreshadows || []).filter(f => f.project_id === req.params.projectId);
    const recovered = list.filter(f => f.status === 'recovered').length;
    res.json({
      total: list.length,
      planted: list.filter(f => f.status === 'planted').length,
      recovered,
      dropped: list.filter(f => f.status === 'dropped').length,
      suspense: list.filter(f => f.status === 'suspense').length,
      recovery_ratio: list.length ? +(recovered / list.length).toFixed(2) : 0,
      list
    });
  });

  // ============================================================
  // 16. 追读力分析 (analysis) - Hook 强度/爽点密度/伏笔回收/综合评分
  // ============================================================
  const RAG_HOOK_PATTERNS = [
    { id: 'question', label: '提问式开篇', regex: /为什么|怎么|难道|究竟/g, score: 2 },
    { id: 'conflict', label: '冲突式开篇', regex: /怒吼|大骂|怒斥|反抗|对峙|冷笑/g, score: 3 },
    { id: 'reversal', label: '反转式开篇', regex: /没想到|居然|竟然|反倒|谁知|哪知/g, score: 4 },
    { id: 'dialogue', label: '悬念式开篇', regex: /秘密|真相|原来|其实|不知|没有人|可怕/g, score: 3 },
    { id: 'foreshadow', label: '伏笔式开篇', regex: /多年以后|后来|将来|有一天|那一天|日后/g, score: 2 }
  ];
  const RAG_CLIMAX_PATTERNS = [
    { id: 'power_up', label: '修为突破', regex: /突破|晋升|境界|修为|达到|气势|轰然|嗡|竟|势不可挡|势如破竹/g, score: 3 },
    { id: 'treasure', label: '宝物/捡漏', regex: /原来是|竟是|此物|宝物|法器|灵丹|金色|红光|光芒|光泽|珠光|宝气|熠熠|灵气/g, score: 4 },
    { id: 'face_slap', label: '打脸/反转', regex: /打脸|冷哼|鄙夷|不屑|震惊|惊呆|目瞪|哗然|难以置信|脸色|众人/g, score: 5 },
    { id: 'reward', label: '奖励/兑现', regex: /奖励|获得|得到|到手|收获|赢|成功|达成|完成|成就|拿到/g, score: 3 },
    { id: 'emotion', label: '情感爆发', regex: /热泪|感动|哭|笑|激动|狂喜|心里|暖|软|甜|心动/g, score: 4 },
    { id: 'mystery', label: '悬念揭露', regex: /原来|竟然|果然|居然|真相|秘密|揭晓|公开/g, score: 4 }
  ];

  function analysisCountMatches(text, patterns) {
    const hits = {}; let total = 0;
    for (const p of patterns) {
      const m = String(text || '').match(p.regex);
      const c = m ? m.length : 0;
      if (c > 0) hits[p.id] = { count: c, label: p.label };
      total += c;
    }
    return { hits, total };
  }

  app.post('/api/analysis/chapter', (req, res) => {
    const text = String(req.body.content || '');
    const ch = { hook: analysisCountMatches(text.slice(0, 200), RAG_HOOK_PATTERNS), hits: analysisCountMatches(text, RAG_CLIMAX_PATTERNS) };
    const hookStrength = Math.min(100, Math.round(ch.hook.total * 12));
    const density = text.length ? +(ch.hits.total / (text.length / 1000)).toFixed(2) : 0;
    res.json({
      chapter_id: req.body.chapter_id, project_id: req.body.project_id,
      word_count: text.length, hook_strength: hookStrength, hook_hits: ch.hook.hits,
      climax_hits: ch.hits.hits, climax_total: ch.hits.total, density_per_1k: density,
      sentence_count: text.split(/[。！？.!?\n]/g).length - 1,
      dialogue_count: Math.floor((text.match(/["""]/g) || []).length / 2),
      timestamp: new Date().toISOString()
    });
  });

  app.get('/api/analysis/dashboard/:projectId', (req, res) => {
    const chapters = (readJSON(path.join(DATA_DIR, 'chapters.json'), { chapters: [] }).chapters || []).filter(c => c.project_id === req.params.projectId);
    const fores = (readJSON(path.join(DATA_DIR, 'foreshadows.json'), { foreshadows: [] }).foreshadows || []).filter(f => f.project_id === req.params.projectId);
    const totalWords = chapters.reduce((s, c) => s + (c.word_count || 0), 0);
    const perChapter = [];
    let totalHook = 0, totalDensity = 0;
    for (const c of chapters) {
      const text = String(c.content || '');
      const hook = analysisCountMatches(text.slice(0, 200), RAG_HOOK_PATTERNS);
      const climax = analysisCountMatches(text, RAG_CLIMAX_PATTERNS);
      const hs = Math.min(100, Math.round(hook.total * 12));
      const dens = text.length ? +(climax.total / (text.length / 1000)).toFixed(2) : 0;
      totalHook += hs; totalDensity += dens;
      perChapter.push({ chapter_id: c.id, chapter_no: c.chapter_no, title: c.title, hook_strength: hs, climax_total: climax.total, density_per_1k: dens, word_count: c.word_count || 0 });
    }
    const avgHook = chapters.length ? +(totalHook / chapters.length).toFixed(1) : 0;
    const avgDensity = chapters.length ? +(totalDensity / chapters.length).toFixed(2) : 0;
    const recovered = fores.filter(f => f.status === 'recovered').length;
    const composite = Math.min(100, Math.round(avgHook * 0.3 + avgDensity * 35 + (fores.length ? (recovered / fores.length) * 15 : 0) + Math.min(30, chapters.length * 0.8)));
    res.json({
      project_id: req.params.projectId,
      chapters_count: chapters.length, total_words: totalWords,
      foreshadows: { total: fores.length, planted: fores.filter(f => f.status === 'planted').length, recovered, dropped: fores.filter(f => f.status === 'dropped').length, recovery_ratio: fores.length ? +(recovered / fores.length).toFixed(2) : 0 },
      avg_hook_strength: avgHook, avg_density_per_1k: avgDensity,
      composite_score: composite, open_plot_debt: fores.filter(f => f.status === 'planted').length,
      per_chapter: perChapter, rating: composite >= 80 ? 'A' : composite >= 60 ? 'B' : composite >= 40 ? 'C' : 'D'
    });
  });

  app.post('/api/analysis/suggestions/:projectId', (req, res) => {
    try {
      // 兼容：直接调用当前文件的 analysis/dashboard API
      const dashRaw = { data: null };
      const chapters = (readJSON(path.join(DATA_DIR, 'chapters.json'), { chapters: [] }).chapters || []).filter(c => c.project_id === req.params.projectId);
      const fores = (readJSON(path.join(DATA_DIR, 'foreshadows.json'), { foreshadows: [] }).foreshadows || []).filter(f => f.project_id === req.params.projectId);
      let totalHook2 = 0, totalDens2 = 0;
      for (const c of chapters) {
        const text = String(c.content || '');
        const hook = analysisCountMatches(text.slice(0, 200), RAG_HOOK_PATTERNS);
        const climax = analysisCountMatches(text, RAG_CLIMAX_PATTERNS);
        totalHook2 += Math.min(100, Math.round(hook.total * 12));
        totalDens2 += text.length ? +(climax.total / (text.length / 1000)).toFixed(2) : 0;
      }
      const avgHook = chapters.length ? +(totalHook2 / chapters.length).toFixed(1) : 0;
      const avgDensity = chapters.length ? +(totalDens2 / chapters.length).toFixed(2) : 0;
      const recovered = fores.filter(f => f.status === 'recovered').length;
      const composite = Math.min(100, Math.round(avgHook * 0.3 + avgDensity * 35 + (fores.length ? (recovered / fores.length) * 15 : 0) + Math.min(30, chapters.length * 0.8)));
      const dash = { avg_hook_strength: avgHook, avg_density_per_1k: avgDensity, open_plot_debt: fores.filter(f => f.status === 'planted').length, chapters_count: chapters.length, composite_score: composite, rating: composite >= 80 ? 'A' : composite >= 60 ? 'B' : composite >= 40 ? 'C' : 'D' };
      const list = [];
      if (dash.avg_hook_strength < 30) list.push({ level: 'warn', title: '开头 Hook 偏弱', content: '建议章节开头加入提问/冲突/反转式开头，增强读者停留欲。' });
      if (dash.avg_density_per_1k < 0.8) list.push({ level: 'warn', title: '爽点密度偏低', content: '建议在章节中加强修为突破 / 打脸 / 宝物获得这类情节，把爽点密度提到 1.0/千字以上。' });
      if (dash.open_plot_debt > 5) list.push({ level: 'warn', title: '情节债务过多', content: `当前存在 ${dash.open_plot_debt} 条未回收伏笔，建议加快回收节奏，避免读者遗忘。` });
      if (dash.chapters_count < 3) list.push({ level: 'info', title: '章节数过少', content: '当前作品章节过少，建议至少累积到 5 章以上分析会更有意义。' });
      if (dash.composite_score >= 80) list.push({ level: 'success', title: '整体追读力良好', content: `综合分数 ${dash.composite_score}（${dash.rating}），建议继续保持当前叙事节奏。` });
      else list.push({ level: 'info', title: '追读力待加强', content: `综合分数 ${dash.composite_score}（${dash.rating}），建议重点强化 Hook 和爽点分布。` });
      res.json({ suggestions: list });
    } catch (e) { res.status(500).json({ error: e.message || '分析建议失败' }); }
  });

  // ============================================================
  // 17. 规则引擎 (rules-engine) - 禁词/题材内置规则/用户自定义规则/生成后校验
  // ============================================================
  app.get('/api/rules/meta', (req, res) => {
    res.json({
      builtin_forbidden: [
        { regex: '色情|淫秽|淫荡|强暴|强奸|性交', level: 'block', note: '色情禁词（平台高风险）' },
        { regex: '屠杀|虐杀|血肉横飞|肢解|断头|开膛|血腥', level: 'block', note: '血腥暴力禁词' },
        { regex: '歧视|种族|民族|黑人|白皮|白猪|黄祸|支那', level: 'block', note: '种族/民族歧视' },
        { regex: '共产党|政府|国家领导人|习近平', level: 'warn', note: '敏感政治话题，建议避免' }
      ],
      genres: ['玄幻仙侠', '都市', '历史军事', '恐怖悬疑', '科幻', '女频言情'],
      note: '自定义规则通过 /custom 管理；/validate 会同时应用全局禁词+题材内置规则+自定义规则+项目绑定规则'
    });
  });

  app.get('/api/rules', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'rules.json'), { custom: [], project: {} });
    res.json({ enabled: all.enabled !== false, custom: all.custom || [], project_ids: Object.keys(all.project || {}) });
  });

  app.post('/api/rules/custom', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'rules.json'), { custom: [], project: {} });
    if (!all.custom) all.custom = [];
    const rule = {
      id: 'r_' + Date.now().toString(36), type: req.body.type || 'custom',
      title: req.body.title || '自定义规则', scope: req.body.scope || 'global',
      project_id: req.body.project_id || null, patterns: req.body.patterns || [],
      enabled: req.body.enabled !== false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    all.custom.push(rule);
    writeJSON(path.join(DATA_DIR, 'rules.json'), all);
    res.status(201).json(rule);
  });

  app.put('/api/rules/custom/:id', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'rules.json'), { custom: [], project: {} });
    const idx = (all.custom || []).findIndex(r => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '规则不存在' });
    all.custom[idx] = { ...all.custom[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    writeJSON(path.join(DATA_DIR, 'rules.json'), all);
    res.json(all.custom[idx]);
  });

  app.delete('/api/rules/custom/:id', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'rules.json'), { custom: [], project: {} });
    all.custom = (all.custom || []).filter(r => r.id !== req.params.id);
    writeJSON(path.join(DATA_DIR, 'rules.json'), all);
    res.json({ success: true });
  });

  app.put('/api/rules/project/:projectId/bind', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'rules.json'), { custom: [], project: {} });
    if (!all.project) all.project = {};
    all.project[req.params.projectId] = {
      genre: req.body.genre || '',
      extra_rules: req.body.extra_rules || [],
      auto_check_on_generate: req.body.auto_check_on_generate !== false,
      updatedAt: new Date().toISOString()
    };
    writeJSON(path.join(DATA_DIR, 'rules.json'), all);
    res.json(all.project[req.params.projectId]);
  });

  app.post('/api/rules/validate', (req, res) => {
    const { text, project_id, extra_genre } = req.body;
    const content = String(text || '');
    const violations = [];
    const all = readJSON(path.join(DATA_DIR, 'rules.json'), { custom: [], project: {} });
    if (all.enabled === false) return res.json({ enabled: false, skipped: true, violations: [] });
    // 1 全局禁词
    [
      { regex: '色情|淫秽|淫荡|强暴|强奸|性交', level: 'block', note: '色情禁词' },
      { regex: '屠杀|虐杀|血肉横飞|肢解|断头|开膛|血腥', level: 'block', note: '血腥暴力禁词' },
      { regex: '歧视|种族|民族|黑人|白皮|白猪|黄祸|支那', level: 'block', note: '种族歧视' },
      { regex: '共产党|政府|国家领导人|习近平', level: 'warn', note: '敏感政治话题' }
    ].forEach(p => {
      try { const reg = new RegExp(p.regex, 'gi'); const m = content.match(reg); if (m) violations.push({ rule: 'forbidden', level: p.level, note: p.note, hits: m.slice(0, 8) }); } catch (_) {}
    });
    // 2 题材内置规则
    const genreMap = {
      '玄幻仙侠': [{ regex: '凡人|修仙|灵气复苏|宗门|秘境|金丹|元婴', level: 'suggest', note: '玄幻高频词' }, { regex: '校花|总裁|豪门|选秀', level: 'warn', note: '与玄幻风格冲突的都市元素' }],
      '都市': [{ regex: '修仙|宗门|金丹|元婴|灵气复苏', level: 'warn', note: '都市题材建议与修仙元素区分' }, { regex: '老总|总裁|豪门|富二代', level: 'suggest', note: '都市爽文高频词' }],
      '历史军事': [{ regex: '皇帝|将军|朝廷|宦官|诸侯|世家|战功', level: 'suggest', note: '历史军事高频词' }, { regex: '手机|电脑|互联网|高铁|现代', level: 'warn', note: '历史题材避免现代词' }],
      '恐怖悬疑': [{ regex: '阴森|诡异|诡谲|寂静|冰冷|尸体|血|血腥味', level: 'suggest', note: '恐怖氛围强化词' }, { regex: '哈哈|大笑|开心|欢乐|阳光|温暖|明媚', level: 'warn', note: '温馨词消解恐怖氛围' }],
      '科幻': [{ regex: '飞船|星舰|机甲|跃迁|曲率|维度|黑洞|量子|基因', level: 'suggest', note: '科幻科技词' }, { regex: '修仙|灵气|宗门|金丹', level: 'warn', note: '科幻避免奇幻元素' }],
      '女频言情': [{ regex: '心动|拥抱|吻|表白|脸红|心跳|温柔|宠溺', level: 'suggest', note: '言情核心情绪词' }, { regex: '怒吼|怒骂|暴打|血腥|砍|打', level: 'warn', note: '言情注意暴力比例' }]
    };
    const project = all.project && project_id && all.project[project_id];
    const genre = (project && project.genre) || extra_genre || '';
    if (genre && genreMap[genre]) {
      for (const p of genreMap[genre]) {
        try { const reg = new RegExp(p.regex, 'gi'); const m = content.match(reg); if (m) violations.push({ rule: 'genre:' + genre, level: p.level, note: p.note, hits: m.slice(0, 8) }); } catch (_) {}
      }
    }
    // 3 项目额外规则
    if (project && project.extra_rules && project.extra_rules.length) {
      for (const r of project.extra_rules) {
        for (const p of r.patterns || []) {
          try { const reg = new RegExp(p.regex, 'gi'); const m = content.match(reg); if (m) violations.push({ rule: 'project:' + (r.title || 'project rule'), level: p.level || 'warn', note: p.note || '', hits: m.slice(0, 8) }); } catch (_) {}
        }
      }
    }
    // 4 自定义
    for (const r of all.custom || []) {
      if (r.enabled === false) continue;
      if (r.project_id && r.project_id !== project_id) continue;
      for (const p of r.patterns || []) {
        try { const reg = new RegExp(p.regex, 'gi'); const m = content.match(reg); if (m) violations.push({ rule: r.type + ':' + r.title, level: p.level || 'warn', note: p.note || '', hits: m.slice(0, 8) }); } catch (_) {}
      }
    }
    const blockCount = violations.filter(v => v.level === 'block').length;
    res.json({ enabled: true, total_violations: violations.length, blocked: blockCount, warned: violations.filter(v => v.level === 'warn').length, suggested: violations.filter(v => v.level === 'suggest').length, violations });
  });

  app.put('/api/rules/toggle', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'rules.json'), { custom: [], project: {} });
    all.enabled = req.body.enabled === true || req.body.enabled === 'true';
    writeJSON(path.join(DATA_DIR, 'rules.json'), all);
    res.json({ enabled: all.enabled });
  });

  // ============================================================
  // 18. 提示词仓库 (prompts) - 分类管理/生成上下文聚合
  // ============================================================
  app.get('/api/prompts/categories', (req, res) => {
    res.json([
      { id: 'anti_ai', label: '去 AI 味' }, { id: 'style', label: '文风控制' },
      { id: 'dialogue', label: '对话优化' }, { id: 'scene', label: '场景描写' },
      { id: 'character_binding', label: '角色绑定' }, { id: 'project', label: '作品绑定' },
      { id: 'generic', label: '其他' }
    ]);
  });

  app.get('/api/prompts', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'prompts.json'), { prompts: [] });
    let list = all.prompts || [];
    if (req.query.category) list = list.filter(p => p.category === req.query.category);
    if (req.query.project_id) list = list.filter(p => p.project_id === req.query.project_id);
    if (req.query.character_id) list = list.filter(p => p.character_id === req.query.character_id);
    if (req.query.keyword) {
      const kw = String(req.query.keyword).toLowerCase();
      list = list.filter(p => (p.name || '').toLowerCase().includes(kw) || (p.content || '').toLowerCase().includes(kw));
    }
    res.json(list.sort((a, b) => (b.priority || 0) - (a.priority || 0)));
  });

  app.post('/api/prompts', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'prompts.json'), { prompts: [] });
    if (!all.prompts) all.prompts = [];
    const p = {
      id: 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5),
      name: req.body.name || '未命名', category: req.body.category || 'generic',
      project_id: req.body.project_id || null, character_id: req.body.character_id || null,
      content: req.body.content || '', tags: req.body.tags || [],
      priority: req.body.priority !== undefined ? req.body.priority : 10,
      enabled: req.body.enabled !== false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    all.prompts.push(p);
    writeJSON(path.join(DATA_DIR, 'prompts.json'), all);
    res.status(201).json(p);
  });

  app.put('/api/prompts/:id', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'prompts.json'), { prompts: [] });
    const idx = (all.prompts || []).findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '提示词不存在' });
    all.prompts[idx] = { ...all.prompts[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    writeJSON(path.join(DATA_DIR, 'prompts.json'), all);
    res.json(all.prompts[idx]);
  });

  app.delete('/api/prompts/:id', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'prompts.json'), { prompts: [] });
    all.prompts = (all.prompts || []).filter(p => p.id !== req.params.id);
    writeJSON(path.join(DATA_DIR, 'prompts.json'), all);
    res.json({ success: true });
  });

  app.post('/api/prompts/batch-import', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'prompts.json'), { prompts: [] });
    if (!all.prompts) all.prompts = [];
    const items = (req.body.items || []).map(p => ({
      id: 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5),
      name: p.name || '未命名', category: p.category || 'generic',
      project_id: p.project_id || null, character_id: p.character_id || null,
      content: p.content || '', tags: p.tags || [], priority: p.priority !== undefined ? p.priority : 10,
      enabled: p.enabled !== false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    }));
    all.prompts.push(...items);
    writeJSON(path.join(DATA_DIR, 'prompts.json'), all);
    res.json({ imported: items.length });
  });

  app.post('/api/prompts/build-context', (req, res) => {
    const { project_id, character_ids, categories, top_n } = req.body;
    const all = readJSON(path.join(DATA_DIR, 'prompts.json'), { prompts: [] });
    let pool = (all.prompts || []).filter(p => p.enabled !== false);
    if (project_id) pool = pool.filter(p => !p.project_id || p.project_id === project_id);
    if (Array.isArray(character_ids) && character_ids.length) pool = pool.filter(p => !p.character_id || character_ids.includes(p.character_id));
    if (Array.isArray(categories) && categories.length) pool = pool.filter(p => categories.includes(p.category));
    pool = pool.sort((a, b) => (b.priority || 0) - (a.priority || 0)).slice(0, top_n || 10);
    const labels = { anti_ai: '去 AI 味', style: '文风控制', dialogue: '对话优化', scene: '场景描写', character_binding: '角色绑定', project: '作品绑定', generic: '通用' };
    const parts = pool.map(p => `【${labels[p.category] || '其他'} - ${p.name}】\n${p.content}`);
    res.json({ prompts: pool, context_text: parts.join('\n\n') });
  });

  // ============================================================
  // 19. 多模型配置 (models) - 提供商/任务绑定/参数模板/失败切换
  // ============================================================
  app.get('/api/models/meta', (req, res) => res.json({
    tasks: ['writing', 'polish', 'review', 'embedding', 'summary', 'outline', 'character']
  }));

  app.get('/api/models', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'models.json'), { providers: [], tasks: {}, templates: [], fallback_chain: [] });
    const providers = (all.providers || []).map(p => ({ ...p, api_key: p.api_key ? '****' : null }));
    res.json({ providers, tasks: all.tasks || [], templates: all.templates || [], fallback_chain: all.fallback_chain || [] });
  });

  app.post('/api/models/providers', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'models.json'), { providers: [], tasks: {}, templates: [], fallback_chain: [] });
    if (!all.providers) all.providers = [];
    const p = {
      id: 'pr_' + Date.now().toString(36), name: req.body.name || '未命名',
      base_url: req.body.base_url || '', api_key: req.body.api_key || '',
      api_type: req.body.api_type || 'openai-compatible', model: req.body.model || '',
      enabled: req.body.enabled !== false, priority: req.body.priority || 10,
      notes: req.body.notes || '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    all.providers.push(p);
    writeJSON(path.join(DATA_DIR, 'models.json'), all);
    res.status(201).json({ ...p, api_key: p.api_key ? '****' : null });
  });

  app.put('/api/models/providers/:id', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'models.json'), { providers: [], tasks: {}, templates: [], fallback_chain: [] });
    const idx = (all.providers || []).findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '供应商不存在' });
    let newKey = req.body.api_key;
    if (typeof newKey === 'string' && newKey.includes('****')) newKey = all.providers[idx].api_key;
    all.providers[idx] = { ...all.providers[idx], ...req.body, id: req.params.id, api_key: newKey !== undefined ? newKey : all.providers[idx].api_key, updatedAt: new Date().toISOString() };
    writeJSON(path.join(DATA_DIR, 'models.json'), all);
    res.json({ ...all.providers[idx], api_key: all.providers[idx].api_key ? '****' : null });
  });

  app.delete('/api/models/providers/:id', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'models.json'), { providers: [], tasks: {}, templates: [], fallback_chain: [] });
    all.providers = (all.providers || []).filter(p => p.id !== req.params.id);
    writeJSON(path.join(DATA_DIR, 'models.json'), all);
    res.json({ success: true });
  });

  app.post('/api/models/tasks', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'models.json'), { providers: [], tasks: [], templates: [], fallback_chain: [] });
    if (!Array.isArray(all.tasks)) all.tasks = [];
    const t = {
      task: req.body.task || 'writing', provider_id: req.body.provider_id,
      model: req.body.model || '', temperature: req.body.temperature !== undefined ? req.body.temperature : 0.8,
      top_p: req.body.top_p !== undefined ? req.body.top_p : 1.0,
      max_tokens: req.body.max_tokens || 2048,
      repetition_penalty: req.body.repetition_penalty || 1.0,
      system_prompt: req.body.system_prompt || ''
    };
    all.tasks = all.tasks.filter(x => x.task !== t.task);
    all.tasks.push(t);
    writeJSON(path.join(DATA_DIR, 'models.json'), all);
    res.status(201).json(t);
  });

  app.get('/api/models/tasks/:task', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'models.json'), { providers: [], tasks: [], templates: [], fallback_chain: [] });
    res.json((all.tasks || []).find(x => x.task === req.params.task) || {});
  });

  app.delete('/api/models/tasks/:task', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'models.json'), { providers: [], tasks: [], templates: [], fallback_chain: [] });
    all.tasks = (all.tasks || []).filter(x => x.task !== req.params.task);
    writeJSON(path.join(DATA_DIR, 'models.json'), all);
    res.json({ success: true });
  });

  app.post('/api/models/templates', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'models.json'), { providers: [], tasks: [], templates: [], fallback_chain: [] });
    if (!Array.isArray(all.templates)) all.templates = [];
    const tpl = {
      id: 'tpl_' + Date.now().toString(36), name: req.body.name || '未命名模板',
      temperature: req.body.temperature !== undefined ? req.body.temperature : 0.8,
      top_p: req.body.top_p !== undefined ? req.body.top_p : 1.0,
      repetition_penalty: req.body.repetition_penalty || 1.0,
      max_tokens: req.body.max_tokens || 2048, system_prompt: req.body.system_prompt || '',
      createdAt: new Date().toISOString()
    };
    all.templates.push(tpl);
    writeJSON(path.join(DATA_DIR, 'models.json'), all);
    res.status(201).json(tpl);
  });

  app.delete('/api/models/templates/:id', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'models.json'), { providers: [], tasks: [], templates: [], fallback_chain: [] });
    all.templates = (all.templates || []).filter(t => t.id !== req.params.id);
    writeJSON(path.join(DATA_DIR, 'models.json'), all);
    res.json({ success: true });
  });

  app.put('/api/models/fallback-chain', (req, res) => {
    const all = readJSON(path.join(DATA_DIR, 'models.json'), { providers: [], tasks: [], templates: [], fallback_chain: [] });
    all.fallback_chain = req.body.chain || [];
    writeJSON(path.join(DATA_DIR, 'models.json'), all);
    res.json({ fallback_chain: all.fallback_chain });
  });

  app.post('/api/models/resolve', (req, res) => {
    const { task } = req.body;
    const m = readJSON(path.join(DATA_DIR, 'models.json'), { providers: [], tasks: [], templates: [], fallback_chain: [] });
    const taskCfg = (m.tasks || []).find(x => x.task === (task || 'writing'));
    const providers = (m.providers || []).filter(p => p.enabled !== false);
    if (taskCfg) {
      const provider = providers.find(p => p.id === taskCfg.provider_id);
      if (provider) {
        return res.json({
          provider: { ...provider, api_key: provider.api_key ? '****' : null },
          task_config: taskCfg, available_providers: providers.map(p => p.id),
          fallback_chain: m.fallback_chain || [],
          note: '前端调用生成时需自行注入实际 api_key 和 base_url；失败时按 fallback_chain 重试。'
        });
      }
    }
    const settings = readJSON(path.join(DATA_DIR, 'settings.json'), { settings: {} }).settings || {};
    res.json({
      provider: { name: '默认主配置', base_url: settings.apiEndpoint || '', api_type: 'openai-compatible', api_key: settings.apiKey ? '****' : null, model: settings.model || '' },
      task_config: taskCfg || { task: task || 'writing' },
      available_providers: providers.map(p => p.id),
      fallback_chain: m.fallback_chain || [],
      note: '未配置任务绑定，使用 settings.json 中的主配置；建议在 /models/tasks 配置各任务模型。'
    });
  });

  // ============================================================
  // 20. RAG 三级检索系统 (向量检索 + 图谱混合 + BM25兜底)
  // ============================================================
  function tokenizeRagLocal(text) {
    if (!text) return [];
    const parts = String(text).toLowerCase().split(/[\s,。！？、；：""''（）《》【】…\—\-\/\\.!?;:"'()\[\]<>]+/).filter(Boolean);
    const out = [];
    for (const p of parts) {
      if (/^[a-zA-Z0-9]+$/.test(p)) { out.push(p); continue; }
      for (let n = 2; n <= 3; n++) for (let i = 0; i + n <= p.length; i++) out.push(p.slice(i, i + n));
      for (const ch of p) out.push(ch);
    }
    return out;
  }

  function buildBm25Local(docs) {
    const N = docs.length;
    const docTerms = docs.map(d => tokenizeRagLocal(String(d.title || '') + ' ' + String(d.content || '')));
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

  function bm25ScoreLocal(idx, queryTokens, index) {
    let score = 0;
    const map = index.tf[idx];
    const docLen = index.docTerms[idx].length;
    for (const q of queryTokens) {
      const f = map.get(q) || 0;
      if (f === 0) continue;
      const nq = index.df.get(q) || 0;
      const idf = Math.log((index.N - nq + 0.5) / (nq + 0.5) + 1);
      const denom = f + 1.5 * (1 - 0.75 + 0.75 * docLen / Math.max(1, index.avgLen));
      score += (f * 2.5 * idf) / Math.max(1e-9, denom);
    }
    return score;
  }

  app.post('/api/rag/retrieve', (req, res) => {
    const { query, project_id, top_k } = req.body;
    if (!project_id || !query) return res.status(400).json({ error: 'project_id 和 query 必填' });
    const materials = (readJSON(path.join(DATA_DIR, 'materials.json'), { materials: [] }).materials || []).filter(m => m.project_id === project_id || m.project_id == null || m.project_id === undefined);
    const chapters = (readJSON(path.join(DATA_DIR, 'chapters.json'), { chapters: [] }).chapters || []).filter(c => c.project_id === project_id);
    const characters = (readJSON(path.join(DATA_DIR, 'characters.json'), { characters: [] }).characters || []).filter(c => c.project_id === project_id || c.project_id == null || c.project_id === undefined);
    const docs = [];
    for (const m of materials) docs.push({ id: 'mat:' + m.id, title: m.name || '', content: m.content || '', category: m.category || 'setting' });
    for (const c of chapters) docs.push({ id: 'ch:' + c.id, title: c.title || '', content: (c.summary || '') + ' ' + ((c.content || '').slice(0, 500)), category: 'chapter' });
    for (const ch of characters) docs.push({ id: 'char:' + ch.id, title: ch.name || '', content: (ch.personality || '') + ' ' + (ch.background || '') + ' ' + (ch.content || ''), category: 'character' });
    const index = buildBm25Local(docs);
    const qTokens = tokenizeRagLocal(query);
    const scored = [];
    for (let i = 0; i < index.N; i++) scored.push({ index: i, score: bm25ScoreLocal(i, qTokens, index) });
    scored.sort((a, b) => b.score - a.score);
    const topN = Math.min(top_k || 8, scored.length);
    const results = scored.slice(0, topN).filter(s => s.score > 0).map(s => ({ ...docs[s.index], level: 'bm25', bm25_score: s.score }));

    // Graph 混排（查询时角色/势力做 1 跳扩展）
    let graphUsed = false;
    try {
      const kg = (readJSON(path.join(DATA_DIR, 'knowledge_graphs.json'), { graphs: {} }).graphs || {})[project_id];
      if (kg && kg.nodes && kg.nodes.length) {
        const qSet = new Set(qTokens);
        const hits = kg.nodes
          .map(n => ({ node: n, overlap: tokenizeRagLocal((n.name || '') + ' ' + (n.summary || '')).filter(t => qSet.has(t)).length }))
          .filter(x => x.overlap > 0)
          .sort((a, b) => b.overlap - a.overlap)
          .slice(0, 5);
        if (hits.length) {
          for (const h of hits) results.push({ id: 'graph:' + h.node.id, title: h.node.name, content: h.node.summary, category: h.node.type, level: 'graph', graph_score: h.overlap });
          graphUsed = true;
        }
      }
    } catch (_) {}

    res.json({
      level: (graphUsed ? 'graph+bm25' : 'bm25'),
      used: ['bm25'],
      query, project_id, top_k: topN,
      results
    });
  });

  app.post('/api/rag/build-context', (req, res) => {
    const { project_id, query, top_k } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id 必填' });
    // 本地调用 rag/retrieve 的逻辑
    const materials = (readJSON(path.join(DATA_DIR, 'materials.json'), { materials: [] }).materials || []).filter(m => m.project_id === project_id || m.project_id == null || m.project_id === undefined);
    const chapters = (readJSON(path.join(DATA_DIR, 'chapters.json'), { chapters: [] }).chapters || []).filter(c => c.project_id === project_id);
    const characters = (readJSON(path.join(DATA_DIR, 'characters.json'), { characters: [] }).characters || []).filter(c => c.project_id === project_id || c.project_id == null || c.project_id === undefined);
    const docs = [];
    for (const m of materials) docs.push({ id: 'mat:' + m.id, title: m.name || '', content: m.content || '', category: m.category || 'setting' });
    for (const c of chapters) docs.push({ id: 'ch:' + c.id, title: c.title || '', content: (c.summary || '') + ' ' + ((c.content || '').slice(0, 500)), category: 'chapter' });
    for (const ch of characters) docs.push({ id: 'char:' + ch.id, title: ch.name || '', content: (ch.personality || '') + ' ' + (ch.background || '') + ' ' + (ch.content || ''), category: 'character' });
    const index = buildBm25Local(docs);
    const qTokens = tokenizeRagLocal(query || '当前章节故事');
    const scored = [];
    for (let i = 0; i < index.N; i++) scored.push({ index: i, score: bm25ScoreLocal(i, qTokens, index) });
    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, top_k || 8).filter(s => s.score > 0).map(s => ({ ...docs[s.index], level: 'bm25', bm25_score: s.score }));
    const parts = [];
    parts.push('【长篇防崩坏 · 检索上下文注入】');
    parts.push('检索层级: bm25（自动融合）');
    if (results.length) {
      parts.push('\n[相关设定/章节/人物]');
      results.forEach((r, i) => {
        parts.push(`#${i + 1} [${r.level}] ${r.title} (${r.category})`);
        parts.push((r.content || '').slice(0, 600));
      });
    }
    res.json({ text: parts.join('\n'), sources: results, level: 'bm25' });
  });

  // ============================================================
  // 21. 功能开关 (feature toggles) - 控制各模块启用状态
  // ============================================================
  const DEFAULT_TOGGLES = {
    rag: true, graph: true, foreshadow: true, analysis: true,
    rules: true, prompts: true, models_multi: true, event_bus: true,
    character_memory: true, novel_storage: true
  };

  app.get('/api/feature-toggles', (req, res) => {
    const t = readJSON(path.join(DATA_DIR, 'feature_toggles.json'), { toggles: {} });
    res.json({ toggles: { ...DEFAULT_TOGGLES, ...(t.toggles || {}) }, version: '1.0' });
  });

  app.put('/api/feature-toggles', (req, res) => {
    const t = readJSON(path.join(DATA_DIR, 'feature_toggles.json'), { toggles: {} });
    t.toggles = { ...DEFAULT_TOGGLES, ...(t.toggles || {}), ...(req.body.toggles || {}) };
    writeJSON(path.join(DATA_DIR, 'feature_toggles.json'), t);
    res.json({ toggles: t.toggles, updatedAt: new Date().toISOString() });
  });

  // ============================================================
  // 22. 事件总线 (event bus) - 章节保存时触发分析/图谱/记忆更新
  // ============================================================
  app.post('/api/event-bus/publish', (req, res) => {
    const { event, payload, project_id } = req.body;
    const ts = new Date().toISOString();
    const eb = readJSON(path.join(DATA_DIR, 'event_bus.json'), { events: [] });
    if (!Array.isArray(eb.events)) eb.events = [];
    const e = { id: 'ev_' + Date.now().toString(36), event: event || 'unknown', project_id: project_id || null, payload: payload || {}, timestamp: ts };
    eb.events.push(e);
    // 只保留最近 500 条
    if (eb.events.length > 500) eb.events = eb.events.slice(-500);
    writeJSON(path.join(DATA_DIR, 'event_bus.json'), eb);

    // 内置响应：如果是章节保存/素材保存事件，触发 RAG 索引重建提示
    const actions = [];
    if (event === 'chapter_saved' || event === 'material_saved' || event === 'character_saved') {
      actions.push({ type: 'rag_index_dirty', note: 'RAG 索引标记为脏，下次检索时将自动重建' });
    }
    res.json({ event_id: e.id, timestamp: ts, processed: true, auto_actions: actions });
  });

  app.get('/api/event-bus/events', (req, res) => {
    const eb = readJSON(path.join(DATA_DIR, 'event_bus.json'), { events: [] });
    let list = eb.events || [];
    if (req.query.project_id) list = list.filter(e => e.project_id === req.query.project_id);
    if (req.query.event) list = list.filter(e => e.event === req.query.event);
    res.json(list.slice(-100));
  });

  return app;
}

// ------------------------------------------------------------
// IPC 通道（供前端直接调用）
// ------------------------------------------------------------
function registerIpc() {
  ipcMain.handle('api:projects', async () => {
    const data = readJSON(path.join(DATA_DIR, 'projects.json'), { projects: [] });
    return data.projects || [];
  });
  ipcMain.handle('api:materials', async (e, opts) => {
    const data = readJSON(path.join(DATA_DIR, 'materials.json'), { materials: [] });
    let list = data.materials || [];
    if (opts?.project_id === 'global') list = list.filter(m => m.project_id === null);
    else if (opts?.project_id) list = list.filter(m => m.project_id === opts.project_id);
    if (opts?.category) list = list.filter(m => m.category === opts.category);
    return list;
  });
  ipcMain.handle('api:data-dir', () => DATA_DIR);
  ipcMain.handle('api:health', () => ({ status: 'ok', dataDir: DATA_DIR, version: app.getVersion ? app.getVersion() : '3.5.0' }));
}

// ------------------------------------------------------------
// Electron 窗口
// ------------------------------------------------------------
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#1a1a1a',
    title: '灵墨小说工坊 v3.5.0',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    autoHideMenuBar: true
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const indexHtml = path.join(RENDERER_DIST, 'index.html');
    if (fs.existsSync(indexHtml)) mainWindow.loadFile(indexHtml);
    else mainWindow.loadURL(`file://${path.join(__dirname, '..', 'index.html')}`);
  }

  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

// ------------------------------------------------------------
// 应用启动
// ------------------------------------------------------------
let apiServer = null;

app.whenReady().then(() => {
  // 启动后端 API（端口：生产 30091，开发 3001）
  const API_PORT = isDev ? 3001 : 30091;
  const server = startServer();
  apiServer = server.listen(API_PORT, () => {
    console.log(`[灵墨小说工坊] 后端 API: http://localhost:${API_PORT} (${useExpress ? 'Express' : '零依赖原生HTTP'})`);
    console.log(`[灵墨小说工坊] 数据目录: ${DATA_DIR}`);
  });

  registerIpc();
  createWindow();

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (apiServer && apiServer.close) { try { apiServer.close(); } catch(e) {} }
});
