const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const APP_ROOT = path.join(__dirname, '..');
const RENDERER_DIST = path.join(APP_ROOT, 'dist');

// 数据目录 - 在Electron环境中优先使用用户目录
const isDev = !process.env.PORTABLE_EXECUTABLE_DIR &&
  (process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development');

const DATA_DIR = isDev
  ? path.join(APP_ROOT, 'backend', 'data')
  : path.join(app.getPath('userData'), 'data');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 将默认数据从resources复制到用户目录（首次运行时）
if (!isDev) {
  const templateDir = path.join(process.resourcesPath, 'data');
  if (fs.existsSync(templateDir)) {
    ['projects.json', 'materials.json', 'generators.json', 'templates.json', 'settings.json'].forEach(filename => {
      const src = path.join(templateDir, filename);
      const dest = path.join(DATA_DIR, filename);
      if (fs.existsSync(src) && !fs.existsSync(dest)) {
        try { fs.copyFileSync(src, dest); }
        catch (e) { console.error(`复制 ${filename} 失败:`, e); }
      }
    });
  }
}

// 全局HTTP服务器引用
let expressServer = null;
const API_PORT = 3001;

// JSON读写辅助函数
function readJSON(filePath, defaultValue) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    console.error(`读取JSON失败 ${filePath}:`, e);
  }
  return defaultValue;
}

function writeJSON(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error(`写入JSON失败 ${filePath}:`, e);
    return false;
  }
}

// 启动Express后端服务
function startServer() {
  const server = express();
  server.use(cors());
  server.use(express.json({ limit: '10mb' }));
  server.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 健康检查
  server.get('/api/health', (req, res) => {
    res.json({ status: 'ok', dataDir: DATA_DIR });
  });

  // 项目管理API
  server.get('/api/projects', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'projects.json'), { projects: [] });
    res.json(data.projects || []);
  });

  server.post('/api/projects', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'projects.json'), { projects: [] });
    const newProject = {
      id: `proj_${Date.now()}`,
      name: req.body.name || '未命名项目',
      description: req.body.description || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      outline: req.body.outline || { title: '', summary: '', chapters: [], content: '' },
      settings: req.body.settings || { genre: '玄幻', style: '爽文风' }
    };
    if (!data.projects) data.projects = [];
    data.projects.push(newProject);
    writeJSON(path.join(DATA_DIR, 'projects.json'), data);
    res.status(201).json(newProject);
  });

  server.get('/api/projects/:id', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'projects.json'), { projects: [] });
    const project = (data.projects || []).find(p => p.id === req.params.id);
    if (!project) return res.status(404).json({ error: 'Not Found' });
    res.json(project);
  });

  server.put('/api/projects/:id', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'projects.json'), { projects: [] });
    const idx = (data.projects || []).findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not Found' });
    data.projects[idx] = { ...data.projects[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    writeJSON(path.join(DATA_DIR, 'projects.json'), data);
    res.json(data.projects[idx]);
  });

  server.delete('/api/projects/:id', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'projects.json'), { projects: [] });
    if (!data.projects) data.projects = [];
    data.projects = data.projects.filter(p => p.id !== req.params.id);
    writeJSON(path.join(DATA_DIR, 'projects.json'), data);
    const matData = readJSON(path.join(DATA_DIR, 'materials.json'), { materials: [] });
    matData.materials = (matData.materials || []).filter(m => m.project_id !== req.params.id);
    writeJSON(path.join(DATA_DIR, 'materials.json'), matData);
    res.json({ success: true });
  });

  // 素材管理API
  server.get('/api/materials', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'materials.json'), { materials: [] });
    let list = data.materials || [];
    if (req.query.project_id === 'global') list = list.filter(m => m.project_id === null);
    else if (req.query.project_id) list = list.filter(m => m.project_id === req.query.project_id);
    if (req.query.category) list = list.filter(m => m.category === req.query.category);
    if (req.query.keyword) {
      const kw = String(req.query.keyword).toLowerCase();
      list = list.filter(m => (m.name || '').toLowerCase().includes(kw) || (m.content || '').toLowerCase().includes(kw));
    }
    res.json(list);
  });

  server.post('/api/materials', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'materials.json'), { materials: [] });
    if (!data.materials) data.materials = [];
    const newMat = {
      id: `mat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      project_id: req.body.project_id || null,
      category: req.body.category || 'setting',
      subCategory: req.body.subCategory || '',
      name: req.body.name || '未命名素材',
      content: req.body.content || '',
      tags: req.body.tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.materials.push(newMat);
    writeJSON(path.join(DATA_DIR, 'materials.json'), data);
    res.status(201).json(newMat);
  });

  server.post('/api/materials/batch', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'materials.json'), { materials: [] });
    if (!data.materials) data.materials = [];
    const list = (req.body.materials || []).map(m => ({
      id: `mat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      project_id: m.project_id || null,
      category: m.category || 'setting',
      subCategory: m.subCategory || '',
      name: m.name || '未命名素材',
      content: m.content || '',
      tags: m.tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
    data.materials.push(...list);
    writeJSON(path.join(DATA_DIR, 'materials.json'), data);
    res.status(201).json(list);
  });

  server.put('/api/materials/:id', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'materials.json'), { materials: [] });
    const idx = (data.materials || []).findIndex(m => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not Found' });
    data.materials[idx] = { ...data.materials[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    writeJSON(path.join(DATA_DIR, 'materials.json'), data);
    res.json(data.materials[idx]);
  });

  server.delete('/api/materials/:id', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'materials.json'), { materials: [] });
    if (!data.materials) data.materials = [];
    data.materials = data.materials.filter(m => m.id !== req.params.id);
    writeJSON(path.join(DATA_DIR, 'materials.json'), data);
    res.json({ success: true });
  });

  // 生成器API
  server.get('/api/generators', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'generators.json'), { generators: [] });
    res.json(data.generators || []);
  });

  server.post('/api/generators', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'generators.json'), { generators: [] });
    if (!data.generators) data.generators = [];
    const newGen = {
      id: `gen_custom_${Date.now()}`,
      category: req.body.category || 'tool',
      name: req.body.name || '自定义生成器',
      description: req.body.description || '',
      systemPrompt: req.body.systemPrompt || '',
      userPromptTemplate: req.body.userPromptTemplate || '',
      defaultParams: req.body.defaultParams || { temperature: 0.8, maxTokens: 2000 },
      isCustom: true,
      project_id: req.body.project_id || null,
      createdAt: new Date().toISOString()
    };
    data.generators.push(newGen);
    writeJSON(path.join(DATA_DIR, 'generators.json'), data);
    res.status(201).json(newGen);
  });

  server.put('/api/generators/:id', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'generators.json'), { generators: [] });
    const idx = (data.generators || []).findIndex(g => g.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not Found' });
    data.generators[idx] = { ...data.generators[idx], ...req.body, id: req.params.id, isCustom: true };
    writeJSON(path.join(DATA_DIR, 'generators.json'), data);
    res.json(data.generators[idx]);
  });

  server.delete('/api/generators/:id', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'generators.json'), { generators: [] });
    if (!data.generators) data.generators = [];
    data.generators = data.generators.filter(g => g.id !== req.params.id || !g.isCustom);
    writeJSON(path.join(DATA_DIR, 'generators.json'), data);
    res.json({ success: true });
  });

  // 执行AI生成
  server.post('/api/generators/generate', async (req, res) => {
    const { generator_id, params, project_id, with_project_material } = req.body;
    const genData = readJSON(path.join(DATA_DIR, 'generators.json'), { generators: [] });
    const gen = (genData.generators || []).find(g => g.id === generator_id);
    if (!gen) return res.status(404).json({ error: 'Generator not found' });

    const settingsData = readJSON(path.join(DATA_DIR, 'settings.json'), { settings: {} });
    const settings = settingsData.settings || {};
    if (!settings.apiKey) return res.status(400).json({ error: '请先在设置中配置AI API密钥' });

    let systemPrompt = gen.systemPrompt || '';
    if (with_project_material && project_id) {
      const matData = readJSON(path.join(DATA_DIR, 'materials.json'), { materials: [] });
      const projMaterials = (matData.materials || []).filter(m =>
        m.project_id === project_id && ['worldview', 'character', 'setting'].includes(m.category)
      );
      if (projMaterials.length > 0) {
        const materialContext = projMaterials.map(m => `【${m.name}】\n${m.content}`).join('\n\n');
        systemPrompt = `当前项目核心设定，请严格遵循：\n\n${materialContext}\n\n---\n\n${systemPrompt}`;
      }
    }

    const userPrompt = (gen.userPromptTemplate || '').replace(/\{(\w+)\}/g, (match, key) => {
      return params?.[key] != null ? String(params[key]) : match;
    });

    try {
      const endpoint = settings.apiEndpoint || 'https://api.openai.com/v1/chat/completions';
      const model = settings.model || 'gpt-4';
      const temperature = params?.temperature ?? gen.defaultParams?.temperature ?? settings.temperature ?? 0.8;
      const maxTokens = params?.maxTokens ?? gen.defaultParams?.maxTokens ?? settings.maxTokens ?? 2000;

      const response = await axios.post(endpoint, {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt || (params?.input || '请继续创作') }
        ],
        temperature,
        max_tokens: maxTokens
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`
        },
        timeout: 120000
      });

      const generatedText = response.data?.choices?.[0]?.message?.content || '';

      if (project_id) {
        try {
          const projFile = path.join(DATA_DIR, 'projects.json');
          const projData = readJSON(projFile, { projects: [] });
          const projIdx = (projData.projects || []).findIndex(p => p.id === project_id);
          if (projIdx !== -1) {
            if (!projData.projects[projIdx].generations) projData.projects[projIdx].generations = [];
            projData.projects[projIdx].generations.push({
              generator: gen.name,
              prompt: userPrompt,
              result: generatedText,
              createdAt: new Date().toISOString()
            });
            writeJSON(projFile, projData);
          }
        } catch (_) { }
      }

      res.json({ success: true, generated_text: generatedText, usage: response.data.usage });
    } catch (err) {
      console.error('AI生成失败:', err.message);
      res.status(500).json({ error: err.response?.data?.error?.message || err.message || 'Generation failed' });
    }
  });

  // 模板API
  server.get('/api/templates', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'templates.json'), { templates: [] });
    let list = data.templates || [];
    if (req.query.genre) list = list.filter(t => t.genre === req.query.genre);
    if (req.query.function) list = list.filter(t => t.function === req.query.function);
    res.json(list);
  });

  server.put('/api/templates/:id', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'templates.json'), { templates: [] });
    const idx = (data.templates || []).findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not Found' });
    if (req.body.isFavorite !== undefined) data.templates[idx].isFavorite = req.body.isFavorite;
    writeJSON(path.join(DATA_DIR, 'templates.json'), data);
    res.json(data.templates[idx]);
  });

  // 设置API
  server.get('/api/settings', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'settings.json'), { settings: {} });
    res.json(data.settings || {});
  });

  server.put('/api/settings', (req, res) => {
    const data = readJSON(path.join(DATA_DIR, 'settings.json'), { settings: {} });
    data.settings = { ...(data.settings || {}), ...req.body };
    writeJSON(path.join(DATA_DIR, 'settings.json'), data);
    res.json(data.settings);
  });

  // 大纲补全
  server.post('/api/outline/complete', async (req, res) => {
    const { incomplete_outline, style, project_id } = req.body;
    const settingsData = readJSON(path.join(DATA_DIR, 'settings.json'), { settings: {} });
    const settings = settingsData.settings || {};
    if (!settings.apiKey) return res.status(400).json({ error: '请配置AI API密钥' });

    let systemPrompt = '你是一个专业的网文大纲策划专家，擅长补全和完善不完整的大纲。请根据残缺大纲，补充完整的世界观、人物、分卷、章节、转折点和结局设计。';
    if (project_id) {
      const matData = readJSON(path.join(DATA_DIR, 'materials.json'), { materials: [] });
      const materials = (matData.materials || []).filter(m => m.project_id === project_id && ['worldview', 'setting'].includes(m.category));
      if (materials.length > 0) {
        systemPrompt += '\n\n已有设定参考：\n' + materials.map(m => m.content).join('\n\n');
      }
    }

    try {
      const response = await axios.post(
        settings.apiEndpoint || 'https://api.openai.com/v1/chat/completions',
        {
          model: settings.model || 'gpt-4',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `残缺大纲：\n${incomplete_outline}\n\n风格：${style || '爽文风'}\n\n请补全为完整的小说大纲。` }
          ],
          temperature: 0.8,
          max_tokens: 3000
        },
        { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` }, timeout: 120000 }
      );
      const result = response.data?.choices?.[0]?.message?.content || '';

      try {
        const matData = readJSON(path.join(DATA_DIR, 'materials.json'), { materials: [] });
        if (!matData.materials) matData.materials = [];
        matData.materials.push({
          id: `mat_${Date.now()}_complete`,
          project_id: project_id || null,
          category: 'plot',
          subCategory: '大纲',
          name: `补全大纲 ${new Date().toLocaleDateString()}`,
          content: result,
          tags: ['补全', style || ''].filter(Boolean),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        writeJSON(path.join(DATA_DIR, 'materials.json'), matData);
      } catch (_) { }

      res.json({ success: true, completed_outline: result });
    } catch (err) {
      res.status(500).json({ error: err.response?.data?.error?.message || err.message || 'Generation failed' });
    }
  });

  // 大纲合成
  server.post('/api/outline/merge', async (req, res) => {
    const { outlines, style, project_id } = req.body;
    if (!Array.isArray(outlines) || outlines.length < 2) {
      return res.status(400).json({ error: '至少需要2份大纲进行合成' });
    }

    const settingsData = readJSON(path.join(DATA_DIR, 'settings.json'), { settings: {} });
    const settings = settingsData.settings || {};
    if (!settings.apiKey) return res.status(400).json({ error: '请配置AI API密钥' });

    try {
      const combined = outlines.map((o, i) => `大纲${i + 1}：\n${typeof o === 'string' ? o : (o.content || o.title || '')}`).join('\n\n---\n\n');
      const response = await axios.post(
        settings.apiEndpoint || 'https://api.openai.com/v1/chat/completions',
        {
          model: settings.model || 'gpt-4',
          messages: [
            { role: 'system', content: '你是一个专业的网文大纲策划专家，擅长将多份大纲合成为逻辑通顺的完整大纲。请梳理时间线、去重冲突、拼接逻辑。' },
            { role: 'user', content: `待合成的${outlines.length}份大纲：\n\n${combined}\n\n请合成为一份完整大纲。` }
          ],
          temperature: 0.8,
          max_tokens: 4000
        },
        { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` }, timeout: 120000 }
      );

      const result = response.data?.choices?.[0]?.message?.content || '';
      try {
        const matData = readJSON(path.join(DATA_DIR, 'materials.json'), { materials: [] });
        if (!matData.materials) matData.materials = [];
        matData.materials.push({
          id: `mat_${Date.now()}_merge`,
          project_id: project_id || null,
          category: 'plot',
          subCategory: '合成大纲',
          name: `合成大纲 ${new Date().toLocaleDateString()}`,
          content: result,
          tags: ['合成', `${outlines.length}份合并`],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        writeJSON(path.join(DATA_DIR, 'materials.json'), matData);
      } catch (_) { }

      res.json({ success: true, merged_outline: result });
    } catch (err) {
      res.status(500).json({ error: err.response?.data?.error?.message || err.message || 'Generation failed' });
    }
  });

  // 导入大纲
  server.post('/api/outline/import', (req, res) => {
    const { outline, project_name, auto_split, project_id } = req.body;
    const projData = readJSON(path.join(DATA_DIR, 'projects.json'), { projects: [] });
    if (!projData.projects) projData.projects = [];
    const pid = project_id || `proj_${Date.now()}`;

    const existingIdx = projData.projects.findIndex(p => p.id === pid);
    if (existingIdx >= 0) {
      projData.projects[existingIdx] = {
        ...projData.projects[existingIdx],
        outline: {
          title: outline?.title || projData.projects[existingIdx].outline?.title || '',
          summary: outline?.summary || projData.projects[existingIdx].outline?.summary || '',
          chapters: outline?.chapters || projData.projects[existingIdx].outline?.chapters || [],
          content: outline?.content || projData.projects[existingIdx].outline?.content || ''
        },
        updatedAt: new Date().toISOString()
      };
    } else {
      projData.projects.push({
        id: pid,
        name: project_name || '新小说项目',
        description: outline?.summary || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        outline: {
          title: outline?.title || '',
          summary: outline?.summary || '',
          chapters: outline?.chapters || [],
          content: outline?.content || ''
        },
        settings: { genre: outline?.genre || '玄幻', style: outline?.style || '爽文风' }
      });
    }
    writeJSON(path.join(DATA_DIR, 'projects.json'), projData);

    if (auto_split && outline?.content) {
      const matData = readJSON(path.join(DATA_DIR, 'materials.json'), { materials: [] });
      if (!matData.materials) matData.materials = [];
      matData.materials.push({
        id: `mat_${Date.now()}_import`,
        project_id: pid,
        category: 'plot',
        subCategory: '大纲导入',
        name: '导入的大纲',
        content: outline.content,
        tags: ['导入'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      writeJSON(path.join(DATA_DIR, 'materials.json'), matData);
    }

    res.status(201).json({ project_id: pid, message: '导入成功' });
  });

  expressServer = server.listen(API_PORT, () => {
    console.log(`API服务已启动: http://localhost:${API_PORT}`);
    console.log(`数据目录: ${DATA_DIR}`);
  });
}

// 创建Electron窗口
let mainWindow = null;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    title: '灵墨小说工坊',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    show: false,
    backgroundColor: '#1f1f2f'
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function setupIpcHandlers() {
  ipcMain.handle('get-data-path', () => DATA_DIR);
  ipcMain.handle('read-file', async (_, filePath) => {
    const fullPath = path.join(DATA_DIR, filePath);
    if (fs.existsSync(fullPath)) {
      try { return fs.readFileSync(fullPath, 'utf-8'); }
      catch (e) { return null; }
    }
    return null;
  });
  ipcMain.handle('write-file', async (_, filePath, content) => {
    const fullPath = path.join(DATA_DIR, filePath);
    try {
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf-8');
      return true;
    } catch (e) {
      console.error('写入文件失败:', e);
      return false;
    }
  });
  ipcMain.handle('get-api-port', () => API_PORT);
}

// App生命周期
app.whenReady().then(() => {
  startServer();
  createWindow();
  setupIpcHandlers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (expressServer) expressServer.close(() => console.log('API服务已关闭'));
  if (process.platform !== 'darwin') app.quit();
});
