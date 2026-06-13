/**
 * 灵墨小说工坊 - 打包前桌面环境验证
 *
 * 在执行 electron-builder 前确认:
 * - dist/ 前端构建产物存在
 * - electron/main.js 存在
 * - package.json 配置正确 (author, electron 版本)
 * - 核心运行时依赖已安装
 * - 数据目录可访问
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

function ok(msg) { console.log('  OK   ' + msg); }
function warn(msg) { console.log('  WARN ' + msg); warnings++; }
function err(msg) { console.log('  ERR  ' + msg); errors++; }

function header(title) {
  console.log('');
  console.log('══════════════════════════════════════════');
  console.log('  ' + title);
  console.log('══════════════════════════════════════════');
}

header('灵墨小说工坊 - 打包前验证');
console.log('  项目: ' + ROOT);
console.log('  平台: ' + process.platform + '/' + process.arch);

// 1. package.json
header('1. package.json');
let pkg = {};
try {
  pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  ok('package.json 可读取');
} catch (e) {
  err('package.json 读取失败: ' + e.message);
}

if (pkg.main && /electron\/main\.js$/.test(pkg.main)) {
  ok('main 字段: ' + pkg.main);
} else {
  err('main 字段应为 electron/main.js，当前: ' + (pkg.main || '(空)'));
}

if (pkg.author && String(pkg.author).length > 2) {
  ok('author: ' + pkg.author);
} else {
  warn('author 字段缺失或过短 (electron-builder 会警告)');
}

if (pkg.version) {
  ok('version: ' + pkg.version);
} else {
  err('version 字段缺失');
}

if (pkg.devDependencies && pkg.devDependencies.electron) {
  const ev = pkg.devDependencies.electron;
  if (/^[\^~]/.test(ev)) {
    err('electron 版本含范围符: "' + ev + '"，必须为精确版本 (无 ^/~)');
  } else {
    ok('electron 版本精确: ' + ev);
  }
} else {
  err('devDependencies.electron 缺失');
}

// 2. 前端构建产物
header('2. 前端构建');
if (fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  ok('dist/index.html 存在');
} else {
  err('未找到 dist/index.html，请先执行: npm run build');
}

if (fs.existsSync(path.join(ROOT, 'dist', 'assets'))) {
  const assets = fs.readdirSync(path.join(ROOT, 'dist', 'assets'));
  ok('dist/assets/ 存在 (' + assets.length + ' 个文件)');
} else {
  err('未找到 dist/assets/ 目录');
}

// 3. Electron 主进程
header('3. Electron 主进程');
if (fs.existsSync(path.join(ROOT, 'electron', 'main.js'))) {
  ok('electron/main.js 存在');
} else {
  err('electron/main.js 缺失');
}

if (fs.existsSync(path.join(ROOT, 'electron', 'preload.js'))) {
  ok('electron/preload.js 存在');
} else {
  warn('electron/preload.js 不存在 (可忽略)');
}

// 4. 配置文件
header('4. 打包配置');
if (fs.existsSync(path.join(ROOT, 'electron', 'desktop-config.js'))) {
  ok('electron/desktop-config.js 存在');
} else {
  warn('electron/desktop-config.js 不存在 (将使用 package.json 中的 build 字段)');
}

if (fs.existsSync(path.join(ROOT, 'electron-builder.yml'))) {
  ok('electron-builder.yml 存在');
}

// 5. 核心运行时依赖
header('5. 运行时依赖');
const runtimeDeps = ['express', 'axios', 'cors', 'body-parser'];
for (const dep of runtimeDeps) {
  if (fs.existsSync(path.join(ROOT, 'node_modules', dep))) {
    ok(dep + ' 已安装');
  } else {
    err(dep + ' 未安装 (将无法在 exe 内运行后端)');
  }
}

// 6. 数据目录
header('6. 数据目录');
const dataDir = path.join(ROOT, 'backend', 'data');
if (fs.existsSync(dataDir)) {
  const files = fs.readdirSync(dataDir);
  ok('backend/data/ 存在 (' + files.length + ' 个文件)');
} else {
  warn('backend/data/ 不存在 (首次运行将自动创建空数据)');
}

// 7. Node 版本 / 平台提示
header('7. 运行环境');
ok('Node.js ' + process.version);
if (process.platform !== 'win32') {
  warn('当前不是 Windows 平台，打包 Windows EXE 时会下载交叉编译依赖');
  warn('  若出现 wine / NSIS 错误，请在真实 Windows 环境下打包');
} else {
  ok('Windows 平台，可以直接打包 Windows EXE');
}

// 总结
header('验证总结');
console.log('  错误: ' + errors + ' 项');
console.log('  警告: ' + warnings + ' 项');

if (errors > 0) {
  console.log('');
  console.log('  ✗ 存在 ' + errors + ' 项错误，请修复后再打包');
  console.log('  可执行: npm run build 构建前端');
  console.log('           npm install --legacy-peer-deps 安装依赖');
  process.exit(1);
} else {
  console.log('');
  console.log('  ✓ 验证通过，可以开始打包');
  if (warnings > 0) {
    console.log('  (含 ' + warnings + ' 个警告，不影响功能)');
  }
  process.exit(0);
}
