/** Electron 主进程 —— 灵墨小说工坊
 * 窗口：默认 1600×1000，可置顶、最小化、最大化
 * 通信：统一 lingmo:invoke，action 分发
 */
import { app, BrowserWindow, ipcMain, Menu, nativeTheme, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeAction } from './ipc/router.js';
import { ACTIONS, CHANNEL } from './ipc/channels.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0f0f18',
    title: '灵墨小说工坊',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173').catch(() => mainWindow?.loadFile(path.join(__dirname, '..', 'dist', 'index.html')));
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
  mainWindow.on('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  // 菜单
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { label: '新建作品', click: () => mainWindow?.webContents.send('lingmo:action', 'new-project') },
        { type: 'separator' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    },
    { label: '视图', submenu: [{ role: 'reload', label: '刷新' }, { role: 'togglefullscreen', label: '全屏' }] },
    { label: '帮助', submenu: [{ label: '关于灵墨小说工坊', click: () => dialog.showMessageBox(mainWindow!, { title: '关于', message: '灵墨小说工坊 v1.0\n长篇网文创作辅助软件\nElectron + Vue 3 + SQLite', type: 'info' }) }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  // 主题初始化
  nativeTheme.themeSource = 'dark';
}

// ============== IPC ==============
ipcMain.handle(CHANNEL, async (_event, action: string, args: any) => {
  try {
    const data = await routeAction(action, args || {});
    return { ok: true, data };
  } catch (e: any) {
    console.error('[lingmo:invoke]', action, e);
    return { ok: false, error: e.message || String(e) };
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
