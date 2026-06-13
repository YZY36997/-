/**
 * 灵墨小说工坊 - 项目清理脚本
 * 
 * 清理 npm 缓存、临时文件、构建产物
 * 运行方式: node scripts/clean.js [--deep] [--node]
 * 
 * --deep   同时删除 node_modules (重新安装依赖)
 * --node   不删除 node_modules, 仅清理缓存和构建产物
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const deepClean = args.includes('--deep');

function rmrf(target) {
  if (!fs.existsSync(target)) return false;
  try {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      // 兼容旧 Node.js - 递归删除
      for (const f of fs.readdirSync(target)) {
        rmrf(path.join(target, f));
      }
      fs.rmdirSync(target);
    } else {
      fs.unlinkSync(target);
    }
    return true;
  } catch (e) {
    console.warn(`  [跳过] ${path.relative(ROOT, target)}: ${e.message}`);
    return false;
  }
}

function header(title) {
  console.log('');
  console.log('═'.repeat(50));
  console.log(`  ${title}`);
  console.log('═'.repeat(50));
}

let cleanedCount = 0;

header('灵墨小说工坊 - 项目清理');
console.log(`  工作目录: ${ROOT}`);
console.log(`  模式: ${deepClean ? '深度清理 (包含 node_modules)' : '标准清理 (缓存/构建产物)'}`);
console.log('');

// 1. 构建产物
header('清理构建产物');
const buildTargets = [
  'dist',
  'release',
  path.join('dist-electron'),
  '.vite',
  '.parcel-cache',
  '.turbo',
];
for (const t of buildTargets) {
  const full = path.join(ROOT, t);
  if (rmrf(full)) { console.log(`  ✓ 删除 ${t}`); cleanedCount++; }
}

// 2. npm/包管理缓存目录
header('清理缓存目录');
const cacheTargets = [
  path.join(os.tmpdir(), 'npm-*'),  // 占位 - 下面单独处理
];
// 直接清理 npm cache 目录中的临时项
try {
  const npmCache = path.join(os.homedir(), '.npm', '_cacache');
  if (fs.existsSync(npmCache) && deepClean) {
    // 只清理临时文件，不清空整个 cache
    const entries = fs.readdirSync(npmCache).filter(f => f.startsWith('tmp-'));
    for (const e of entries) { rmrf(path.join(npmCache, e)); }
    if (entries.length) console.log(`  ✓ 清理 ${entries.length} 个 npm 缓存临时项`);
  }
} catch (e) {}

// 清理项目中的临时文件
const tempFiles = [
  'npm-debug.log',
  'yarn-debug.log',
  'yarn-error.log',
  '.DS_Store',
  'Thumbs.db',
];
for (const t of tempFiles) {
  const full = path.join(ROOT, t);
  if (rmrf(full)) { console.log(`  ✓ 删除 ${t}`); cleanedCount++; }
}

// 3. 深度清理: node_modules
if (deepClean) {
  header('深度清理: node_modules');
  const nm = path.join(ROOT, 'node_modules');
  if (rmrf(nm)) { console.log(`  ✓ 删除 node_modules (下次运行需执行 npm install)`); cleanedCount++; }
  else console.log('  node_modules 不存在，跳过');

  // 清理 package-lock.json
  const lock = path.join(ROOT, 'package-lock.json');
  if (fs.existsSync(lock)) {
    try { fs.unlinkSync(lock); console.log('  ✓ 删除 package-lock.json'); cleanedCount++; }
    catch (e) { console.log(`  [警告] package-lock.json 删除失败: ${e.message}`); }
  }
}

// 4. 项目数据备份（可选）- 不删除，只提示
header('项目数据保护');
const dataDir = path.join(ROOT, 'backend', 'data');
console.log(`  ℹ 保留数据目录: ${path.relative(ROOT, dataDir)}`);
console.log(`  ℹ (项目、素材、生成器数据等用户数据始终保留)`);

// 总结
header('清理完成');
console.log(`  共清理 ${cleanedCount} 项`);
if (deepClean) {
  console.log('');
  console.log('  下一步:');
  console.log('    npm install    重新安装依赖');
  console.log('    npm run dev    启动开发服务器');
}
console.log('');
