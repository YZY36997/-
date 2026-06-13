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
  generators: { generators: [] },
  templates: { templates: [] },
  settings: { settings: {} }
};
Object.entries(defaultData).forEach(([name, content]) => {
  const fp = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(fp)) { try { fs.writeFileSync(fp, JSON.stringify(content, null, 2)); } catch(e) {} }
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

  // 健康检查
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: app.getVersion ? app.getVersion() : '3.5.0', dataDir: DATA_DIR, engine: useExpress ? 'express' : 'native-http', timestamp: new Date().toISOString() });
  });

  // 项目
  app.get('/api/projects', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'projects.json'), { projects: [] });
    res.json(data.projects || []);
  });
  app.post('/api/projects', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'projects.json'), { projects: [] });
    if (!data.projects) data.projects = [];
    const project = {
      id: genId('proj'),
      name: req.body.name || '未命名项目',
      description: req.body.description || '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      outline: req.body.outline || { title: '', summary: '', chapters: [] },
      settings: req.body.settings || { genre: '玄幻', style: '爽文风' }
    };
    data.projects.push(project);
    writeJSON(path.join(DATA_DIR, 'projects.json'), data);
    res.status(201).json(project);
  });
  app.get('/api/projects/:id', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'projects.json'), { projects: [] });
    const p = (data.projects || []).find(p => p.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'NotFound' });
    res.json(p);
  });
  app.put('/api/projects/:id', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'projects.json'), { projects: [] });
    const idx = (data.projects || []).findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'NotFound' });
    data.projects[idx] = { ...data.projects[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    writeJSON(path.join(DATA_DIR, 'projects.json'), data);
    res.json(data.projects[idx]);
  });
  app.delete('/api/projects/:id', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'projects.json'), { projects: [] });
    if (!data.projects) data.projects = [];
    data.projects = data.projects.filter(p => p.id !== req.params.id);
    writeJSON(path.join(DATA_DIR, 'projects.json'), data);
    const mat = readJSON(path.join(DATA_DIR, 'materials.json'), { materials: [] });
    mat.materials = (mat.materials || []).filter(m => m.project_id !== req.params.id);
    writeJSON(path.join(DATA_DIR, 'materials.json'), mat);
    res.json({ success: true });
  });

  // 素材
  app.get('/api/materials', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'materials.json'), { materials: [] });
    let list = data.materials || [];
    if (req.query.project_id === 'global') list = list.filter(m => m.project_id === null);
    else if (req.query.project_id) list = list.filter(m => m.project_id === req.query.project_id);
    if (req.query.category) list = list.filter(m => m.category === req.query.category);
    if (req.query.keyword) { const kw = String(req.query.keyword).toLowerCase(); list = list.filter(m => (m.name || '').toLowerCase().includes(kw) || (m.content || '').toLowerCase().includes(kw)); }
    res.json(list);
  });
  app.post('/api/materials', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'materials.json'), { materials: [] });
    if (!data.materials) data.materials = [];
    const mat = { id: genId('mat'), project_id: req.body.project_id !== undefined ? req.body.project_id : null, category: req.body.category || 'setting', subCategory: req.body.subCategory || '', name: req.body.name || '未命名素材', content: req.body.content || '', tags: req.body.tags || [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    data.materials.push(mat); writeJSON(path.join(DATA_DIR, 'materials.json'), data); res.status(201).json(mat);
  });
  app.post('/api/materials/batch', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'materials.json'), { materials: [] });
    if (!data.materials) data.materials = [];
    const list = (req.body.materials || []).map(m => ({ id: genId('mat'), project_id: m.project_id !== undefined ? m.project_id : null, category: m.category || 'setting', subCategory: m.subCategory || '', name: m.name || '未命名素材', content: m.content || '', tags: m.tags || [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
    data.materials.push(...list); writeJSON(path.join(DATA_DIR, 'materials.json'), data); res.status(201).json(list);
  });
  app.put('/api/materials/:id', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'materials.json'), { materials: [] });
    const idx = (data.materials || []).findIndex(m => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'NotFound' });
    data.materials[idx] = { ...data.materials[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    writeJSON(path.join(DATA_DIR, 'materials.json'), data); res.json(data.materials[idx]);
  });
  app.delete('/api/materials/:id', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'materials.json'), { materials: [] });
    if (!data.materials) data.materials = [];
    data.materials = data.materials.filter(m => m.id !== req.params.id);
    writeJSON(path.join(DATA_DIR, 'materials.json'), data); res.json({ success: true });
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
    const data = readJSON(path.join(DATA_DIR, 'settings.json'), { settings: {} });
    const s = data.settings || {};
    res.json({ ...s, apiKey: s.apiKey ? (s.apiKey.slice(0, 4) + '****' + s.apiKey.slice(-4)) : '' });
  });
  app.put('/api/settings', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'settings.json'), { settings: {} });
    data.settings = { ...(data.settings || {}), ...req.body };
    writeJSON(path.join(DATA_DIR, 'settings.json'), data);
    res.json({ ...data.settings, apiKey: data.settings.apiKey ? (data.settings.apiKey.slice(0, 4) + '****' + data.settings.apiKey.slice(-4)) : '' });
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
