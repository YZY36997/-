/**
 * 灵墨小说工坊 - 打包前环境验证 (v2 - 单目录版)
 *
 * 针对截图中报错的项目分析:
 * - 原项目使用 --prefix frontend (monorepo)，本项目为单目录结构
 * - 关键验证项: package.json / 前端构建 / 主进程 / 运行时依赖 / 数据目录
 *
 * 使用: node scripts/verify-desktop.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');

let errors = 0;
let warnings = 0;

function ok(msg) { console.log('  OK    ' + msg); }
function warn(msg) { console.log('  WARN  ' + msg); warnings++; }
function err(msg) { console.log('  ERR   ' + msg); errors++; }
function info(msg) { console.log('  INFO  ' + msg); }

function header(title) {
  console.log('');
  console.log('══════════════════════════════════════════');
  console.log('  ' + title);
  console.log('══════════════════════════════════════════');
}

// 读取 package.json
let pkg = {};
try {
  pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
} catch (e) {
  err('package.json 读取失败: ' + e.message);
  process.exit(1);
}

header('灵墨小说工坊 - 打包前验证 v2');
console.log('  项目: ' + ROOT);
console.log('  平台: ' + process.platform + ' / ' + process.arch);

// 1. package.json 检查 (electron-builder 对格式敏感)
header('1. package.json');

ok('文件可读取');

if (pkg.name) ok('name: ' + pkg.name);
else err('缺少 name 字段');

if (pkg.version) ok('version: ' + pkg.version);
else err('缺少 version 字段');

if (pkg.author && String(pkg.author).length > 0) {
  ok('author: ' + pkg.author);
} else {
  warn('author 字段缺失 (electron-builder 会警告)');
}

if (pkg.main) ok('main: ' + pkg.main);
else err('main 字段缺失 (Electron 主进程路径必需)');

// Electron 版本必须是精确号
const electronDep = pkg.devDependencies && pkg.devDependencies.electron;
if (electronDep) {
  if (/^[\^~]/.test(electronDep)) {
    err('electron 版本含范围符 "' + electronDep + '"，必须是精确版本号');
    err('  修改 package.json: "electron": "' + electronDep.replace(/^[\^~]/, '') + '"');
  } else {
    ok('devDependencies.electron: ' + electronDep);
  }
} else {
  err('devDependencies.electron 缺失');
}

const builderDep = pkg.devDependencies && pkg.devDependencies['electron-builder'];
if (builderDep) ok('devDependencies.electron-builder: ' + builderDep);
else warn('devDependencies.electron-builder 缺失');

// 2. 前端构建产物
header('2. 前端构建');

if (fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  ok('dist/index.html 存在');
  // 统计文件数量
  try {
    const assetDir = path.join(ROOT, 'dist', 'assets');
    if (fs.existsSync(assetDir)) {
      const assets = fs.readdirSync(assetDir);
      ok('dist/assets/ 有 ' + assets.length + ' 个文件');
    }
  } catch (e) {}
} else {
  err('dist/index.html 不存在');
  info('  → 需要先执行: npm run build');
}

// 3. Electron 主进程 + 配置
header('3. Electron 主进程');

if (fs.existsSync(path.join(ROOT, 'electron', 'main.js'))) {
  ok('electron/main.js 存在');
  const size = fs.statSync(path.join(ROOT, 'electron', 'main.js')).size;
  info('  大小: ' + (size / 1024).toFixed(1) + ' KB');
} else err('electron/main.js 缺失');

if (fs.existsSync(path.join(ROOT, 'electron', 'preload.js'))) ok('electron/preload.js 存在');
else warn('electron/preload.js 不存在 (可选)');

header('4. 打包配置');
if (fs.existsSync(path.join(ROOT, 'electron', 'desktop-config.js'))) {
  ok('electron/desktop-config.js (完整配置)');
} else warn('electron/desktop-config.js 缺失');

if (fs.existsSync(path.join(ROOT, 'electron-builder.yml'))) {
  ok('electron-builder.yml (YAML 配置)');
} else info('electron-builder.yml 不存在 (非必需)');

if (pkg.build && typeof pkg.build === 'object') {
  ok('package.json 中存在 build 配置');
  if (pkg.build.electronVersion) ok('  build.electronVersion: ' + pkg.build.electronVersion);
} else info('package.json 中 build 配置不存在 (使用外部配置文件)');

// 5. 运行时依赖
header('5. 运行时依赖');

const runtimeDeps = [
  { name: 'express', size: 100 },
  { name: 'axios', size: 100 },
  { name: 'cors', size: 10 },
  { name: 'body-parser', size: 10 },
  { name: 'uuid', size: 10 }
];

for (const dep of runtimeDeps) {
  const p = path.join(ROOT, 'node_modules', dep.name);
  if (fs.existsSync(p)) {
    ok(dep.name + ' 已安装');
  } else {
    err(dep.name + ' 未安装');
  }
}

// 检查 app-builder.exe (Windows 特有，是 electron-builder 内部工具)
header('6. app-builder (Windows 打包必需)');

const appBinPaths = [
  path.join(ROOT, 'node_modules', 'app-builder-bin'),
];

let hasAppBuilder = false;
for (const p of appBinPaths) {
  if (fs.existsSync(p)) {
    ok('app-builder-bin 已安装');
    hasAppBuilder = true;
    // 尝试列出子目录
    try {
      const subdirs = fs.readdirSync(p);
      info('  子目录: ' + subdirs.join(', '));
    } catch (e) {}
    break;
  }
}
if (!hasAppBuilder) {
  warn('app-builder-bin 缺失 (需要时会自动下载)');
  info('  Windows 打包时如出现 ERR_ELECTRON_BUILDER_CANNOT_EXECUTE');
  info('  → 执行: npm install --legacy-peer-deps electron-builder@24.13.3');
}

// 7. 数据目录
header('7. 数据目录');

const dataDir = path.join(ROOT, 'backend', 'data');
if (fs.existsSync(dataDir)) {
  try {
    const files = fs.readdirSync(dataDir);
    ok('backend/data/ 存在 (' + files.length + ' 个文件)');
  } catch (e) { ok('backend/data/ 存在'); }
} else {
  warn('backend/data/ 不存在 (首次运行会自动创建)');
}

// 8. 平台特有警告
header('8. 平台警告');
if (process.platform === 'win32') {
  ok('Windows 平台 - 可以直接打包 Windows EXE');
  info('  如遇到 EPERM 权限错误:');
  info('  1. 关闭 VS Code / 资源管理器');
  info('  2. 暂停防病毒软件的实时保护');
  info('  3. 以管理员身份运行 PowerShell');
} else if (process.platform === 'linux') {
  warn('Linux 平台 - 打包 Windows EXE 需要 Wine');
  info('  建议直接在 Windows 环境下打包，或安装 Wine:');
  info('    Ubuntu/Debian: sudo apt install wine64');
  info('    Arch Linux: sudo pacman -S wine');
} else if (process.platform === 'darwin') {
  warn('macOS 平台 - 打包 Windows EXE 需要 Wine + 签名配置');
  info('  建议直接在 Windows 环境下打包');
}

// 9. npm cache / _npx 权限状态 (截图中的错误来源)
header('9. npm 缓存状态');
try {
  const npmCache = path.join(os.homedir(), '.npm');
  if (fs.existsSync(npmCache)) {
    ok('npm 缓存目录存在: ' + npmCache);
  } else {
    info('npm 缓存目录不存在 (首次安装会自动创建)');
  }

  // Windows 特有: 检查是否有 EPERM 锁定征兆
  if (process.platform === 'win32') {
    const npxCache = path.join(os.tmpdir(), 'npm-cache-*');
    info('  临时 npx 目录: ' + npxCache);
    info('  如遇 EPERM 错误，可运行: node scripts/clean.js --deep');
  }
} catch (e) {}

// 总结
header('验证总结');
console.log('  错误: ' + errors + ' 项');
console.log('  警告: ' + warnings + ' 项');
console.log('');

if (errors > 0) {
  console.log('  ✗ 存在 ' + errors + ' 个错误，修复前打包可能失败');
  console.log('');
  console.log('  推荐的完整流程:');
  console.log('    1. node scripts/clean.js --deep');
  console.log('    2. npm install --legacy-peer-deps');
  console.log('    3. npm run build');
  console.log('    4. node scripts/verify-desktop.cjs  (再次检查)');
  console.log('    5. npm run build:exe');
  process.exit(1);
}

console.log('  ✓ 验证通过，可以开始打包');
if (warnings > 0) console.log('  (含 ' + warnings + ' 个警告)');
console.log('');
console.log('  打包命令: npm run build:exe');
console.log('  诊断命令: node scripts/doctor.js');
console.log('  手动下载 Electron: node scripts/download-electron.cjs');
console.log('');
process.exit(0);
