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
    res.json({ status: 'ok', version: app.getVersion ? app.getVersion() : '3.5.0', dataDir: DATA_DIR, engine: useExpress ? 'express' : 'native-http', timestamp: new Date().toISOString(), features: ['projects', 'materials', 'characters', 'chapters', 'ai-chapter'] });
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
