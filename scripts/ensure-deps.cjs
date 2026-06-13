/**
 * 灵墨小说工坊 - 依赖确保脚本 (CommonJS)
 *
 * 在启动开发/构建前验证关键依赖是否已安装，缺失时自动安装。
 * 支持命令行参数:
 *   --only-backend   只检查/安装后端运行所需依赖
 *   --only-frontend  只检查/安装前端构建所需依赖
 *   (默认)           检查/安装全部依赖
 *
 * 使用:
 *   node scripts/ensure-deps.cjs
 *   node scripts/ensure-deps.cjs --only-backend
 *   node scripts/ensure-deps.cjs --only-frontend
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const NM = path.join(ROOT, 'node_modules');

const args = process.argv.slice(2);
const onlyBackend = args.indexOf('--only-backend') >= 0;
const onlyFrontend = args.indexOf('--only-frontend') >= 0;

function log(msg) { console.log('  ' + msg); }
function warn(msg) { console.log('  ⚠ ' + msg); }
function ok(msg) { console.log('  ✓ ' + msg); }
function err(msg) { console.log('  ✗ ' + msg); }

function header(title) {
  console.log('');
  console.log('══════════════════════════════════════════');
  console.log('  ' + title);
  console.log('══════════════════════════════════════════');
}

function exists(p) {
  return fs.existsSync(path.join(NM, p));
}

// 依赖清单
const BACKEND_DEPS = [
  'express', 'cors', 'axios', 'uuid', 'body-parser'
];

const FRONTEND_DEPS = [
  'vite', '@vitejs/plugin-vue', 'vue', 'vue-router', 'pinia',
  'element-plus', '@element-plus/icons-vue', 'lucide-vue-next',
  'tailwindcss', 'postcss', 'autoprefixer'
];

const DEV_TOOLS = [
  'concurrently', 'cross-env', 'wait-on', 'nodemon'
];

const ELECTRON_TOOLS = [
  'electron', 'electron-builder'
];

header('灵墨小说工坊 - 依赖检查');

let mode = '完整模式 (前端 + 后端 + Electron)';
if (onlyBackend && !onlyFrontend) mode = '仅后端模式';
else if (onlyFrontend && !onlyBackend) mode = '仅前端模式';

log('运行模式: ' + mode);
log('项目根目录: ' + ROOT);
console.log('');

// 读取 package.json
let pkg = {};
try {
  pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
} catch (e) {
  err('package.json 读取失败: ' + e.message);
  process.exit(1);
}

// 1. 确定需要检查的依赖
let required = [];
if (!onlyFrontend) required = required.concat(BACKEND_DEPS);
if (!onlyBackend) required = required.concat(FRONTEND_DEPS, DEV_TOOLS);
required = required.concat(ELECTRON_TOOLS); // Electron 工具总是需要

// 2. 检查依赖是否已安装
const missing = [];
if (fs.existsSync(NM)) {
  for (const dep of required) {
    if (!exists(dep)) {
      missing.push(dep);
    }
  }
  const installed = required.length - missing.length;
  ok('核心依赖已就绪 ' + installed + '/' + required.length + ' 项');
  if (missing.length > 0) {
    warn('缺失依赖: ' + missing.join(', '));
  }
} else {
  warn('node_modules 目录不存在');
  missing.push('__ALL__'); // 需要全部安装
}

// 3. 检查 package.json 配置 (electron-builder 对格式敏感)
header('package.json 配置检查');

if (pkg.main && /electron\/main\.js$/.test(pkg.main)) {
  ok('main 字段: ' + pkg.main);
} else {
  warn('main 字段缺失或错误: ' + (pkg.main || '(空)'));
}

if (pkg.author && String(pkg.author).length > 2) {
  ok('author: ' + pkg.author);
} else {
  warn('author 字段缺失 (electron-builder 会警告)');
}

// 检查 electron 版本是否为精确版本
const electronVersion = (pkg.devDependencies && pkg.devDependencies.electron) || '';
if (electronVersion) {
  if (/^[\^~]/.test(electronVersion)) {
    warn('electron 版本: "' + electronVersion + '" 含范围符 ^/~，建议改为精确版本');
  } else {
    ok('electron 版本已固定: ' + electronVersion);
  }
} else {
  warn('devDependencies.electron 缺失');
}

// 4. 如果有缺失依赖，自动安装
if (missing.length > 0) {
  header('自动安装依赖');

  const mirrors = [
    'https://npmmirror.com/mirrors/electron/',
    'https://registry.npmmirror.com/-/binary/electron/',
    'https://github.com/electron/electron/releases/download/'
  ];

  log('使用国内镜像加速安装...');
  log('ELECTRON_MIRROR: ' + mirrors[0]);
  console.log('');

  const env = Object.assign({}, process.env, {
    ELECTRON_MIRROR: mirrors[0],
    ELECTRON_BUILDER_CACHE: path.join(os.homedir(), '.cache', 'electron-builder'),
    npm_config_electron_mirror: mirrors[0]
  });

  try {
    const installCmd = 'npm install --legacy-peer-deps --no-audit --no-fund';
    log('执行: ' + installCmd);
    console.log('');

    execSync(installCmd, {
      cwd: ROOT,
      env: env,
      stdio: 'inherit',
      timeout: 600000 // 10 分钟超时
    });

    console.log('');
    ok('依赖安装完成');
  } catch (e) {
    console.log('');
    warn('依赖安装过程中出现警告 (可能是 npm EPERM 文件锁问题)');
    log('  EPERM 错误通常由: 1) IDE 占用文件  2) 杀毒软件  3) Explorer 窗口打开 node_modules');
    log('  如后续命令正常运行，可忽略此警告。如持续失败，请:');
    log('    1. 关闭 VS Code / 文件管理器');
    log('    2. 运行: node scripts/clean.js --deep');
    log('    3. 以管理员身份重启终端后重试');
    console.log('');
    // 非致命错误 — 继续执行后续命令
  }
}

// 5. 验证关键文件路径
header('项目结构检查');

const criticalPaths = [
  ['前端源码 src/', 'src'],
  ['前端入口 index.html', 'index.html'],
  ['Electron 主进程 electron/main.js', 'electron/main.js'],
  ['Vite 配置 vite.config.js', 'vite.config.js'],
  ['数据目录 backend/data/', path.join('backend', 'data')],
];

for (const [name, rel] of criticalPaths) {
  if (fs.existsSync(path.join(ROOT, rel))) {
    ok(name);
  } else {
    warn(name + ' 不存在');
  }
}

// 6. 检查所有自定义脚本
header('脚本清单');
const scripts = [
  'scripts/ensure-deps.cjs',
  'scripts/verify-desktop.cjs',
  'scripts/run-electron-builder.cjs',
  'scripts/run-electron.cjs',
  'scripts/dev-server.js',
  'scripts/clean.js',
  'scripts/doctor.js',
  'electron/desktop-config.js'
];

for (const s of scripts) {
  if (fs.existsSync(path.join(ROOT, s))) {
    ok(s);
  } else {
    warn(s + ' 缺失');
  }
}

console.log('');
log('依赖检查通过 ✓');
console.log('');

process.exit(0);
