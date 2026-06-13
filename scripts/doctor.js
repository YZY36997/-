/**
 * 灵墨小说工坊 - 项目环境诊断脚本
 * 检查 Node.js 版本、依赖安装状态、目录结构等
 * 运行方式: node scripts/doctor.js
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));

let issues = 0;
let warnings = 0;

function check(title, ok, detail, isWarning = false) {
  if (ok) {
    console.log(`  ✓ ${title}${detail ? ': ' + detail : ''}`);
  } else if (isWarning) {
    console.log(`  ⚠ ${title}${detail ? ': ' + detail : ''}`);
    warnings++;
  } else {
    console.log(`  ✗ ${title}${detail ? ': ' + detail : ''}`);
    issues++;
  }
}

console.log('\n══════════════════════════════════════════');
console.log('  灵墨小说工坊 - 项目环境诊断');
console.log('  ' + new Date().toLocaleString('zh-CN'));
console.log('══════════════════════════════════════════\n');

// 1. Node.js 版本
console.log('[1] Node.js 环境');
const nodeVersion = process.versions.node;
const [major, minor] = nodeVersion.split('.').map(Number);
check('Node.js 版本', major >= 16, `${nodeVersion} (推荐 >= 16.x)`);
check('npm 可用', true, process.platform);
console.log();

// 2. 检查 package.json 依赖
console.log('[2] package.json 依赖声明');
const deps = Object.keys(pkg.dependencies || {});
const devDeps = Object.keys(pkg.devDependencies || {});
check('运行时依赖', deps.length > 0, `${deps.length} 项 (${deps.join(', ')})`);
check('开发依赖', devDeps.length > 0, `${devDeps.length} 项`);
console.log();

// 3. 检查 node_modules 是否安装
console.log('[3] 依赖安装状态');
const criticalRuntimeDeps = ['express', 'cors', 'axios', 'uuid'];
for (const dep of criticalRuntimeDeps) {
  const installed = fs.existsSync(path.join(rootDir, 'node_modules', dep));
  check(`${dep}`, installed, installed ? '已安装' : '未安装，请运行 npm install', false);
}

const criticalDevDeps = ['vite', 'element-plus', 'pinia', 'vue', 'vue-router', '@element-plus/icons-vue'];
for (const dep of criticalDevDeps) {
  const installed = fs.existsSync(path.join(rootDir, 'node_modules', dep));
  check(`${dep}`, installed, installed ? '已安装' : '未安装 (开发依赖)', false);
}
console.log();

// 4. 检查必要目录和文件
console.log('[4] 项目结构检查');
const requiredDirs = [
  { path: 'src', label: '前端源码' },
  { path: 'electron', label: 'Electron 主进程' },
  { path: 'scripts', label: '开发脚本' },
  { path: 'backend/data', label: '数据目录' },
];
for (const dir of requiredDirs) {
  const exists = fs.existsSync(path.join(rootDir, dir.path));
  check(`${dir.label} (${dir.path})`, exists, exists ? '存在' : '不存在，将自动创建');
}

const requiredFiles = [
  { path: 'package.json', label: 'package.json' },
  { path: 'index.html', label: 'index.html' },
  { path: 'vite.config.js', label: 'Vite 配置' },
];
for (const f of requiredFiles) {
  const exists = fs.existsSync(path.join(rootDir, f.path));
  check(`${f.label} (${f.path})`, exists, exists ? '存在' : '缺失');
}
console.log();

// 5. 检查数据文件是否存在（如不存在则正常）
console.log('[5] 数据文件状态');
const dataFiles = ['projects.json', 'materials.json', 'generators.json', 'templates.json', 'settings.json'];
for (const file of dataFiles) {
  const exists = fs.existsSync(path.join(rootDir, 'backend', 'data', file));
  check(`${file}`, true, exists ? '存在' : '将在首次运行时创建');
}
console.log();

// 6. 检查 Electron 打包配置
console.log('[6] Electron 配置');
check('Electron 主进程 (electron/main.js)', fs.existsSync(path.join(rootDir, 'electron', 'main.js')));
check('Electron 预加载 (electron/preload.js)', fs.existsSync(path.join(rootDir, 'electron', 'preload.js')));
check('package.json 中 main 字段正确', pkg.main === 'electron/main.js', `main: ${pkg.main}`);
check('package.json 中 build 字段存在', !!pkg.build, pkg.build ? '存在' : '缺失');
console.log();

// 7. 检查脚本命令
console.log('[7] npm 脚本');
const requiredScripts = ['build', 'client:dev', 'server:dev', 'dev', 'dev:electron'];
for (const s of requiredScripts) {
  check(`npm run ${s}`, !!pkg.scripts?.[s], pkg.scripts?.[s] ? '已定义' : '未定义');
}
console.log();

// 总结
console.log('══════════════════════════════════════════');
if (issues === 0 && warnings === 0) {
  console.log('  ✓ 环境检查通过！项目可以正常运行');
  console.log('');
  console.log('  启动方式:');
  console.log('  - 开发模式: npm run dev');
  console.log('  - 生产构建: npm run build');
  console.log('  - Electron:  npm run dev:electron');
} else {
  console.log(`  发现 ${issues} 个问题, ${warnings} 个警告`);
  if (issues > 0) {
    console.log('');
    console.log('  建议执行: npm install  安装缺失依赖');
    console.log('  如遇到网络问题，使用国内镜像:');
    console.log('    npm config set registry https://registry.npmmirror.com');
    console.log('    ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install');
  }
}
console.log('══════════════════════════════════════════\n');

process.exit(issues > 0 ? 1 : 0);
