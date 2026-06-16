/** Electron 主进程入口：窗口创建 + IPC 路由分发 */
const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path');

const {
  projectService, projectSettingsService, worldviewService,
  factionService, artifactService,
  volumeService, chapterService,
  characterService, characterRelationService,
  foreshadowService, outlineService,
  promptGroupService, promptService, aiModelService,
  ragService, analyzeChapter, analyzeProject, materialService,
  continueText, rewriteText, polishText, generateDialogScene,
  checkOoc, checkTypo, scanForeshadow, generateOutline, generateIdea,
  testModel, buildSystemPrompt,
  getSetting, setSetting, allSettings, getLocale, setLocale
} = require('./services.js');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600, height: 1000, minWidth: 1080, minHeight: 680,
    backgroundColor: '#0f0f18',
    title: '灵墨小说工坊 · 长篇网文创作辅助',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false
  });

  const devPath = path.join(__dirname, '..', 'dist', 'index.html');
  mainWindow.loadFile(devPath).catch(() => {
    mainWindow.loadURL('data:text/html,<html><body style="background:#111;color:#fff;font-family:sans-serif;padding:30px"><h1>灵墨小说工坊</h1><p>请先构建前端：<code>cd .. && npm install && npm run build</code></p></body></html>');
  });

  mainWindow.on('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  const template = [
    { label: '文件', submenu: [
      { label: '打开作品中心', click: () => mainWindow.webContents.send('lingmo:action', 'home') },
      { type: 'separator' }, { role: 'quit', label: '退出' }] },
    { label: '编辑', submenu: [{ role: 'reload', label: '刷新' }, { role: 'toggleDevTools', label: '开发者工具' }] },
    { label: '帮助', submenu: [{ label: '官方文档', click: () => shell.openExternal('https://example.com/lingmo') }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function ok(data) { return { ok: true, data }; }
function fail(error) { return { ok: false, error: error?.message || String(error) }; }

ipcMain.handle('lingmo:invoke', async (event, action, args) => {
  args = args || {};
  try {
    switch (action) {
      // 系统
      case 'sys.ping': return ok(Date.now());
      case 'sys.getTheme': return ok(getSetting('theme') || 'dark');
      case 'sys.setTheme': setSetting('theme', args.theme); return ok(true);

      // 作品
      case 'project.list': return ok(projectService.list(args.genre, args.keyword, args.sortBy));
      case 'project.recycle': return ok(projectService.listRecycle());
      case 'project.recycleList': return ok(projectService.listRecycle());
      case 'project.get': return ok(projectService.get(args.id));
      case 'project.create': return ok(projectService.create(args));
      case 'project.update': projectService.update(args.id, args); return ok(true);
      case 'project.delete': projectService.softDelete(args.id); return ok(true);
      case 'project.restore': projectService.restore(args.id); return ok(true);
      case 'project.export': return ok(projectService.exportJson(args.id));
      case 'project.exportJson': return ok(projectService.exportJson(args.id));

      // 设定
      case 'projectSettings.get': return ok(projectSettingsService.get(args.project_id));
      case 'projectSettings.save': projectSettingsService.save(args.project_id, args); return ok(true);
      case 'worldview.get': return ok(worldviewService.get(args.project_id));
      case 'worldview.save': worldviewService.save(args.project_id, args); return ok(true);

      // 势力 / 物品
      case 'faction.list': return ok(factionService.list(args.project_id));
      case 'faction.save': return ok(factionService.upsert(args.project_id, args));
      case 'faction.delete': factionService.remove(args.id); return ok(true);
      case 'artifact.list': return ok(artifactService.list(args.project_id));
      case 'artifact.save': return ok(artifactService.upsert(args.project_id, args));
      case 'artifact.delete': artifactService.remove(args.id); return ok(true);

      // 卷 / 章节
      case 'volume.list': return ok(volumeService.list(args.project_id));
      case 'volume.create': return ok(volumeService.create(args.project_id, args.title));
      case 'volume.update': volumeService.update(args.id, args); return ok(true);
      case 'volume.delete': volumeService.remove(args.id); return ok(true);

      case 'chapter.list': return ok(chapterService.list(args.project_id));
      case 'chapter.get': return ok(chapterService.get(args.id));
      case 'chapter.create': return ok(chapterService.create(args.project_id, args));
      case 'chapter.update': chapterService.update(args.id, args); return ok(true);
      case 'chapter.delete': chapterService.remove(args.id); return ok(true);
      case 'chapterContent.get': return ok(chapterService.getContent(args.id));
      case 'chapterContent.save': return ok(chapterService.saveContent(args.id, args.content, args.version_tag));
      case 'chapterContent.history': return ok(chapterService.history(args.id));

      // 角色 / 关系
      case 'character.list': return ok(characterService.list(args.project_id));
      case 'character.create': return ok(characterService.create(args.project_id, args));
      case 'character.update': characterService.update(args.id, args); return ok(true);
      case 'character.delete': characterService.remove(args.id); return ok(true);
      case 'characterRelation.list': return ok(characterRelationService.list(args.project_id));
      case 'characterRelation.create': return ok(characterRelationService.create(args.project_id, args));
      case 'characterRelation.update': characterRelationService.update(args.id, args); return ok(true);
      case 'characterRelation.delete': characterRelationService.remove(args.id); return ok(true);

      // 伏笔
      case 'foreshadow.list': return ok(foreshadowService.list(args.project_id));
      case 'foreshadow.create': return ok(foreshadowService.create(args.project_id, args));
      case 'foreshadow.update': foreshadowService.update(args.id, args); return ok(true);
      case 'foreshadow.delete': foreshadowService.remove(args.id); return ok(true);

      // 大纲
      case 'outline.tree': return ok(outlineService.tree(args.project_id));
      case 'outline.save': return ok(outlineService.save(args.project_id, args));
      case 'outline.delete': outlineService.remove(args.id); return ok(true);

      // 提示词
      case 'promptGroup.list': return ok(promptGroupService.list());
      case 'promptGroup.save': return ok(promptGroupService.save(args));
      case 'promptGroup.delete': promptGroupService.remove(args.id); return ok(true);
      case 'prompt.list': return ok(promptService.list(args.project_id));
      case 'prompt.create': return ok(promptService.create(args));
      case 'prompt.update': promptService.update(args.id, args); return ok(true);
      case 'prompt.delete': promptService.remove(args.id); return ok(true);

      // AI 模型
      case 'aiModel.list': return ok(aiModelService.list());
      case 'aiModel.save': return ok(aiModelService.save(args));
      case 'aiModel.delete': aiModelService.remove(args.id); return ok(true);
      case 'aiModel.test': return ok(await testModel(args.id));

      // AI 生成
      case 'ai.continue': return ok(await continueText(args.project_id, args.context || '', args.hint, args.level));
      case 'ai.rewrite': return ok(await rewriteText(args.project_id, args.before || '', args.selected || '', args.hint, args.level));
      case 'ai.polish': return ok(await polishText(args.project_id, args.text || '', args.template || '', args.level));
      case 'ai.dialogScene': return ok(await generateDialogScene(args.project_id, args.hint, args.level));
      case 'ai.checkOoc': return ok(await checkOoc(args.project_id, args.content || '', args.level));
      case 'ai.checkTypo': return ok(await checkTypo(args.project_id, args.content || ''));
      case 'ai.foreshadowScan': return ok(await scanForeshadow(args.project_id, args.content || ''));
      case 'ai.generateOutline': return ok(await generateOutline(args.project_id, args.hint, args.level));
      case 'ai.generateIdea': return ok(await generateIdea(args.project_id, args.hint, args.level));
      case 'ai.buildSystemPrompt': return ok({ text: buildSystemPrompt(args.project_id, args.hint, args.level || 2) });

      // RAG
      case 'rag.retrieve': return ok({ hits: ragService.retrieve(args.project_id, args.query, args.level) });
      case 'rag.filterGet': return ok(ragService.getFilters(args.project_id));
      case 'rag.filterSave': ragService.saveFilter(args.project_id, args.type, args.scope); return ok(true);

      // 追读力分析
      case 'analysis.chapter': return ok(analyzeChapter(args.content || ''));
      case 'analysis.project': return ok(analyzeProject(args.project_id));

      // 素材库
      case 'material.list': return ok(materialService.list(args.project_id, args.category));
      case 'material.get': return ok(materialService.get(args.id));
      case 'material.save': return ok(materialService.upsert(args));
      case 'material.delete': materialService.remove(args.id); return ok(true);
      case 'material.bulkImport': return ok(materialService.bulkImport(args.project_id, args.category, args.rows || []));
      case 'material.importChapterText': return ok(materialService.importChapterText(args.project_id, args.volume_id, args.text || '', args.split_by_blank));
      case 'material.importOutlineText': return ok(materialService.importOutlineText(args.project_id, args.text || ''));
      case 'material.importCharacterText': return ok(materialService.importCharacterText(args.project_id, args.text || ''));

      // 语言 / 全量设置
      case 'sys.getLocale': return ok(getLocale());
      case 'sys.setLocale': setLocale(args.locale); return ok(true);
      case 'settings.getAll': return ok(allSettings());
      case 'settings.set': setSetting(args.key, args.value); return ok(true);

      default: throw new Error('未知 action: ' + action);
    }
  } catch (e) {
    console.error('[lingmo:invoke]', action, e);
    return fail(e);
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
