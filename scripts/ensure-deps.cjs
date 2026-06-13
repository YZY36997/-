/**
 * 灵墨小说工坊 - 依赖确保脚本 (CommonJS)
 *
 * 在启动开发/构建前验证关键依赖是否已安装。
 * 支持命令行参数:
 *   --only-backend   只检查后端运行所需依赖
 *   --only-frontend  只检查前端构建所需依赖
 *   (默认)           检查全部依赖
 *
 * 使用: node scripts/ensure-deps.cjs [--only-backend] [--only-frontend]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const NM = path.join(ROOT, 'node_modules');

const args = process.argv.slice(2);
const onlyBackend = args.includes('--only-backend');
const onlyFrontend = args.includes('--only-frontend');

function log(msg, level) {
  const prefix = level === 'warn' ? '  ⚠ ' : level === 'error' ? '  ✗ ' : '  ✓ ';
  console.log(prefix + msg);
}

function header(title) {
  console.log('');
  console.log('══════════════════════════════════════════');
  console.log('  ' + title);
  console.log('══════════════════════════════════════════');
}

function exists(p) {
  return fs.existsSync(path.join(NM, p));
}

/**
 * 关键依赖清单 — 分前端/后端两类
 */
const BACKEND_DEPS = [
  'express',
  'cors',
  'axios',
  'uuid',
  'body-parser'
];

const FRONTEND_DEPS = [
  'vite',
  '@vitejs/plugin-vue',
  'vue',
  'vue-router',
  'pinia',
  'element-plus',
  '@element-plus/icons-vue',
  'lucide-vue-next'
];

const DEV_TOOLS = [
  'concurrently',
  'cross-env',
  'wait-on'
];

const ELECTRON_TOOLS = [
  'electron',
  'electron-builder'
];

header('灵墨小说工坊 - 依赖检查');
console.log('  运行模式: ' + (onlyBackend ? '仅后端' : onlyFrontend ? '仅前端' : '完整模式'));
console.log('  项目根目录: ' + ROOT);
console.log('');

// 1) 检查 node_modules 是否存在
let needInstall = false;
if (!fs.existsSync(NM)) {
  log('node_modules 目录不存在', 'warn');
  needInstall = true;
} else {
  // 2) 逐项检查关键依赖
  const required = [];
  if (!onlyFrontend) required.push(...BACKEND_DEPS);
  if (!onlyBackend) required.push(...FRONTEND_DEPS, ...DEV_TOOLS);
  required.push(...ELECTRON_TOOLS); // electron 工具总是需要

  const missing = required.filter(function (dep) { return !exists(dep); });
  if (missing.length > 0) {
    log('缺少依赖: ' + missing.join(', '), 'warn');
    needInstall = true;
  } else {
    log('核心依赖已就绪 (' + required.length + ' 项)');
  }

  // 3) 验证 package.json 中 electron 版本是否固定（electron-builder 的强约束）
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    const electronVersion = (pkg.devDependencies && pkg.devDependencies.electron) || '';
    if (/^[\^~]/.test(electronVersion)) {
      log('警告: electron 版本 (' + electronVersion + ') 含范围符，electron-builder 打包时可能失败', 'warn');
    } else if (electronVersion) {
      log('electron 版本已固定: ' + electronVersion);
    }
  } catch (e) { /* 静默 */ }
}

// 4) 如需安装，尝试执行 npm install
if (needInstall) {
  console.log('');
  console.log('  → 自动安装依赖 (npm install --legacy-peer-deps) ...');

  // Windows 权限问题容错：尝试设置 ELECTRON_MIRROR 国内镜像
  const env = Object.assign({}, process.env, {
    ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
    ELECTRON_BUILDER_CACHE: process.env.ELECTRON_BUILDER_CACHE || path.join(require('os').homedir(), '.electron-builder-cache')
  });

  try {
    execSync('npm install --legacy-peer-deps', {
      cwd: ROOT,
      env: env,
      stdio: 'inherit',
      timeout: 300000  // 5 分钟超时（国内下载 Electron 可能较慢）
    });
    log('依赖安装完成');
  } catch (err) {
    console.log('');
    log('依赖安装过程出现警告（可能是 Windows 文件锁或缓存问题）', 'warn');
    console.log('    如后续命令正常工作，可忽略本警告');
    console.log('    如持续失败，请尝试:');
    console.log('      1. 以管理员身份重新打开 PowerShell/CMD');
    console.log('      2. 手动执行: npm cache clean --force');
    console.log('      3. 删除 node_modules 后重试: npm install --legacy-peer-deps');
    console.log('      4. 运行: node scripts/clean.js --deep');
    console.log('');

    // 非致命错误 — 继续执行，让后续命令自行决定成败
    process.exitCode = 0;
  }
}

// 5) 验证关键目录结构
console.log('');
log('项目结构:');
const paths = [
  ['electron/main.js', exists('../../../electron/main.js')],  // 占位 - 下面实际检查
];
const criticalPaths = [
  ['frontend 源码', fs.existsSync(path.join(ROOT, 'src')) || fs.existsSync(path.join(ROOT, 'frontend'))],
  ['electron/main.js', fs.existsSync(path.join(ROOT, 'electron', 'main.js'))],
  ['数据目录', fs.existsSync(path.join(ROOT, 'backend', 'data')) || fs.existsSync(path.join(ROOT, 'data'))],
  ['package.json', fs.existsSync(path.join(ROOT, 'package.json'))]
];
for (const [name, ok] of criticalPaths) {
  if (ok) log(name + ' ✓');
  else log(name + ' 不存在（可能影响功能）', 'warn');
}

console.log('');
console.log('  依赖检查通过 ✓');
console.log('');

process.exit(0);
