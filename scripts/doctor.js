/**
 * 灵墨小说工坊 - 项目环境诊断工具 v2
 *
 * 检查项:
 * - Node.js 版本 (>= 16)
 * - 核心依赖安装状态
 * - package.json 关键配置 (electron 版本固定 / author 字段)
 * - 项目目录结构
 * - 数据文件完整性
 * - npm 缓存健康状态
 * - Windows/Linux 平台特有建议
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const NM = path.join(ROOT, 'node_modules');

let warnings = 0;
let errors = 0;

function ok(msg) { console.log('  ✓ ' + msg); }
function warn(msg) { console.log('  ⚠ ' + msg); warnings++; }
function err(msg) { console.log('  ✗ ' + msg); errors++; }
function info(msg) { console.log('  ℹ ' + msg); }
function header(title) {
  console.log('');
  console.log('══════════════════════════════════════════');
  console.log('  ' + title);
  console.log('══════════════════════════════════════════');
}

// ===== 工具函数 =====
function exists(p) { return fs.existsSync(path.join(NM, p)); }
function checkFile(p) { return fs.existsSync(path.join(ROOT, p)); }

function verNum(v) {
  const parts = String(v).replace(/[^0-9.]/g, '').split('.').map(function (n) {
    return parseInt(n, 10) || 0;
  });
  return (parts[0] * 10000 + parts[1] * 100 + parts[2]);
}

// ===== 读取 package.json =====
let pkg = {};
try {
  pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
} catch (e) {
  err('package.json 读取失败: ' + e.message);
  process.exit(1);
}

header('灵墨小说工坊 - 项目环境诊断 v2');
console.log('  检测时间: ' + new Date().toLocaleString());
console.log('  平台: ' + process.platform + ' / ' + process.arch);
console.log('  项目: ' + (pkg.name || 'lingmo-novel-studio') + ' v' + (pkg.version || '?'));

// 1. Node.js
header('1. Node.js 环境');
const nodeVer = process.version.slice(1);
ok('Node.js 版本: ' + nodeVer + (verNum(nodeVer) >= 160000 ? '' : ' (警告: 建议 >= 16.x)'));
if (verNum(nodeVer) < 160000) { warn('Node.js 版本过低，部分功能可能不兼容'); }
ok('npm: ' + (process.platform));
info('用户主目录: ' + os.homedir());

// 2. package.json 结构校验
header('2. package.json 配置');
if (pkg.main) ok('main 字段: ' + pkg.main);
else err('缺少 main 字段 (Electron 启动必需)');

if (pkg.author && String(pkg.author).length > 0) ok('author 字段: ' + pkg.author);
else warn('缺少 author 字段 (electron-builder 会警告)');

if (pkg.scripts && pkg.scripts.build) ok('build 脚本已定义');
else err('缺少 npm run build 脚本');
if (pkg.scripts && pkg.scripts['build:exe']) ok('build:exe 脚本已定义');
else warn('缺少 build:exe (Windows 打包脚本)');

// 3. 关键依赖版本检查（electron 必须是固定版本）
header('3. 依赖版本校验');
const devDeps = pkg.devDependencies || {};
const deps = pkg.dependencies || {};

const electronVer = devDeps.electron || '';
if (electronVer) {
  if (/^[\^~]/.test(electronVer)) {
    err('electron 版本 "' + electronVer + '" 含范围符 (^/~)，必须为精确版本');
    err('  请改为: "electron": "' + electronVer.replace(/^[\^~]/, '') + '"');
  } else {
    ok('electron 版本已固定: ' + electronVer);
  }
} else {
  err('缺少 electron 依赖');
}

const ebVer = devDeps['electron-builder'] || '';
if (ebVer) {
  if (/^[\^~]/.test(ebVer)) warn('electron-builder 建议使用精确版本: ' + ebVer);
  else ok('electron-builder 版本: ' + ebVer);
}

// 4. 依赖安装状态
header('4. 依赖安装状态');
if (!fs.existsSync(NM)) {
  warn('node_modules 不存在，请先运行: npm install --legacy-peer-deps');
} else {
  const coreDeps = ['express', 'cors', 'axios', 'uuid', 'vite', 'vue', 'vue-router',
    'pinia', 'element-plus', 'electron', 'electron-builder', 'concurrently', 'cross-env'];
  let installed = 0;
  for (const d of coreDeps) {
    if (exists(d)) { ok(d + ' 已安装'); installed++; }
    else warn(d + ' 未安装');
  }
  info('共 ' + installed + '/' + coreDeps.length + ' 项核心依赖就绪');
}

// 5. 项目结构
header('5. 项目目录结构');
const paths = [
  ['src (前端源码)', 'src'],
  ['electron/main.js', 'electron/main.js'],
  ['electron/preload.js', 'electron/preload.js'],
  ['scripts (开发脚本)', 'scripts'],
  ['backend/data (用户数据)', path.join('backend', 'data')],
  ['index.html', 'index.html'],
  ['vite.config.js', 'vite.config.js'],
];
for (const [name, p] of paths) {
  if (checkFile(p)) ok(name + ' ✓');
  else warn(name + ' 未找到');
}

// 6. 数据文件
header('6. 数据文件');
const dataFiles = ['projects.json', 'materials.json', 'generators.json',
  'templates.json', 'settings.json'];
const dataDir = path.join(ROOT, 'backend', 'data');
for (const f of dataFiles) {
  if (fs.existsSync(path.join(dataDir, f))) ok(f);
  else warn(f + ' 不存在 (首次运行会自动创建)');
}

// 7. Electron 打包配置
header('7. Electron 打包配置');
if (pkg.build) {
  ok('build 字段存在');
  if (pkg.build.appId) ok('appId: ' + pkg.build.appId);
  if (pkg.build.productName) ok('productName: ' + pkg.build.productName);
  if (pkg.build.electronVersion) ok('electronVersion 已声明: ' + pkg.build.electronVersion);
  else info('建议在 build 中添加 "electronVersion": "' + (electronVer || '28.2.5') + '"');
} else {
  err('缺少 build 字段 (electron-builder 必需)');
}

// 8. npm 缓存 & 临时目录
header('8. npm 缓存状态');
const npmCache = path.join(os.homedir(), '.npm', '_cacache');
if (fs.existsSync(npmCache)) {
  ok('npm 缓存目录存在');
} else {
  info('npm 缓存目录不存在（首次安装会自动创建）');
}
if (process.platform === 'win32') {
  info('Windows 平台: 如遇 EPERM 错误，请关闭 IDE 后重试');
  info('  或运行: node scripts/clean.js --deep');
}

// 9. 项目脚本
header('9. 关键脚本');
const scripts = [
  ['scripts/ensure-deps.cjs', path.join(ROOT, 'scripts', 'ensure-deps.cjs')],
  ['scripts/doctor.js', path.join(ROOT, 'scripts', 'doctor.js')],
  ['scripts/dev-server.js', path.join(ROOT, 'scripts', 'dev-server.js')],
  ['scripts/clean.js', path.join(ROOT, 'scripts', 'clean.js')],
  ['scripts/dev.bat', path.join(ROOT, 'scripts', 'dev.bat')],
  ['scripts/pack.bat', path.join(ROOT, 'scripts', 'pack.bat')],
];
for (const [name, p] of scripts) {
  if (fs.existsSync(p)) ok(name + ' ✓');
  else warn(name + ' 缺失');
}

// 总结
header('诊断总结');
console.log('  通过: ' + '正常');
if (warnings > 0) console.log('  警告: ' + warnings + ' 项 (黄色标识)');
if (errors > 0) console.log('  错误: ' + errors + ' 项 (红色标识 - 需要修复)');

if (errors === 0) {
  console.log('');
  console.log('  ✓ 环境检查通过！可以正常运行');
  console.log('');
  console.log('  常用命令:');
  console.log('    npm run dev              启动开发 (前端 + 后端)');
  console.log('    npm run build            仅构建前端');
  console.log('    npm run build:exe        打包 Windows EXE');
  console.log('    node scripts/clean.js    清理构建产物');
  process.exit(0);
} else {
  console.log('');
  console.log('  ✗ 存在 ' + errors + ' 项错误，请先修复后重试');
  console.log('  如需快速重置，可执行:');
  console.log('    node scripts/clean.js --deep');
  console.log('    npm install --legacy-peer-deps');
  process.exit(1);
}
