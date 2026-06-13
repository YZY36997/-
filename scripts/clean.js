/**
 * 灵墨小说工坊 - 项目清理脚本 (跨平台)
 *
 * 处理场景:
 * - Windows EPERM: 进程持有文件句柄导致 rmdir 失败
 * - npm cache 临时文件被防病毒软件锁定
 * - node_modules 深层嵌套路径过长
 *
 * 用法: node scripts/clean.js [--deep] [--dry]
 *   --deep   同时删除 node_modules/package-lock.json (重新安装)
 *   --dry    只列出不执行 (预览模式)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const deepClean = args.includes('--deep');
const dryRun = args.includes('--dry');

let deleted = 0;
let skipped = 0;

function log(msg) {
  console.log('  ' + msg);
}

function warn(msg) {
  console.log('  ⚠ ' + msg);
}

function ok(msg) {
  console.log('  ✓ ' + msg);
}

function header(title) {
  console.log('');
  console.log('══════════════════════════════════════════');
  console.log('  ' + title);
  console.log('══════════════════════════════════════════');
}

/**
 * 跨平台递归删除 - 对 Windows 文件锁有容错
 * 失败时不抛出异常，只计数并提示
 */
function safeRemove(target, options) {
  options = options || {};
  const depth = options.depth || 0;

  // 最大深度保护
  if (depth > 50) return false;

  if (!fs.existsSync(target)) return false;

  // 处理符号链接避免循环
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch (e) {
    skipped++;
    warn('无法访问 ' + path.relative(ROOT, target) + ': ' + e.message);
    return false;
  }

  if (stat.isDirectory()) {
    // 先递归删除内容
    let entries;
    try {
      entries = fs.readdirSync(target);
    } catch (e) {
      skipped++;
      warn('无法读取目录 ' + path.relative(ROOT, target) + ': ' + e.message);
      return false;
    }

    let allRemoved = true;
    for (const entry of entries) {
      const subPath = path.join(target, entry);
      if (!safeRemove(subPath, { depth: depth + 1 })) {
        allRemoved = false;
      }
    }

    // 只有全部子项都删除成功才删除父目录
    if (allRemoved) {
      try {
        if (dryRun) {
          log('[dry] 删除目录: ' + path.relative(ROOT, target));
        } else {
          fs.rmdirSync(target);
        }
        deleted++;
        return true;
      } catch (e) {
        skipped++;
        // Windows 上常见 EPERM - 提示但不报错
        if (e.code === 'EPERM' || e.code === 'EACCES') {
          warn('权限不足跳过 ' + path.relative(ROOT, target) + ' (可能被其他进程占用)');
        } else if (e.code === 'ENOTEMPTY') {
          warn('目录非空，跳过 ' + path.relative(ROOT, target));
        } else {
          warn(path.relative(ROOT, target) + ': ' + (e.code || e.message));
        }
        return false;
      }
    }
    return false;
  }

  // 文件或符号链接
  try {
    if (dryRun) {
      log('[dry] 删除文件: ' + path.relative(ROOT, target));
    } else {
      fs.unlinkSync(target);
    }
    deleted++;
    return true;
  } catch (e) {
    skipped++;
    if (e.code === 'EPERM' || e.code === 'EACCES') {
      warn('权限不足跳过文件 ' + path.relative(ROOT, target));
    } else {
      warn(path.relative(ROOT, target) + ': ' + (e.code || e.message));
    }
    return false;
  }
}

// ==================== 主流程 ====================

header('灵墨小说工坊 - 项目清理');
console.log('  项目根目录: ' + ROOT);
console.log('  模式: ' + (deepClean ? '深度清理 (含 node_modules)' : '标准清理 (构建产物/缓存)') +
            (dryRun ? ' (dry-run 预览模式)' : ''));
console.log('');

// 1) 前端/后端构建产物
header('清理构建产物');
const buildTargets = [
  path.join(ROOT, 'dist'),
  path.join(ROOT, 'release'),
  path.join(ROOT, 'dist-electron'),
  path.join(ROOT, '.vite'),
  path.join(ROOT, '.parcel-cache'),
  path.join(ROOT, '.turbo'),
];
for (const t of buildTargets) {
  if (fs.existsSync(t)) {
    safeRemove(t);
    if (!dryRun) ok('已清理 ' + path.relative(ROOT, t));
    else log('[dry] 将清理 ' + path.relative(ROOT, t));
  }
}

// 2) 临时文件 (debug logs 等)
header('清理临时文件');
const tempFiles = [
  'npm-debug.log',
  'yarn-debug.log',
  'yarn-error.log',
  '.DS_Store',
  'Thumbs.db'
];
for (const f of tempFiles) {
  const full = path.join(ROOT, f);
  if (fs.existsSync(full)) {
    safeRemove(full);
    if (!dryRun) ok('已清理 ' + f);
  }
}

// 3) 深度清理: node_modules / package-lock
if (deepClean) {
  header('深度清理: node_modules');
  const nm = path.join(ROOT, 'node_modules');
  if (fs.existsSync(nm)) {
    console.log('  正在处理 node_modules (Windows 上可能需要多次尝试)...');
    console.log('  如遇到 EPERM 错误，可能是 IDE/编辑器持有文件句柄');
    console.log('  建议关闭 VS Code/其他应用后重试');
    console.log('');
    safeRemove(nm);
    if (!dryRun) ok('已清理 node_modules');
    else log('[dry] 将清理 node_modules');
  } else {
    log('node_modules 不存在，跳过');
  }

  const lock = path.join(ROOT, 'package-lock.json');
  if (fs.existsSync(lock)) {
    safeRemove(lock);
    if (!dryRun) ok('已清理 package-lock.json');
  }
}

// 4) 用户数据保护提示
header('用户数据保护');
const dataDirs = [
  path.join(ROOT, 'backend', 'data'),
  path.join(ROOT, 'data'),
];
for (const d of dataDirs) {
  if (fs.existsSync(d)) {
    ok('保留数据目录: ' + path.relative(ROOT, d));
  }
}
log('(项目、素材、生成器等用户数据始终保留)');

// 总结
header('清理完成');
console.log('  已清理: ' + deleted + ' 项' + (skipped > 0 ? ' (跳过 ' + skipped + ' 项: 权限/锁定)' : ''));
if (deepClean && !dryRun) {
  console.log('');
  console.log('  下一步:');
  console.log('    npm install --legacy-peer-deps    重新安装依赖');
  console.log('    npm run dev                       启动开发');
}
if (dryRun) {
  console.log('');
  console.log('  (dry-run 预览模式，未实际删除任何文件)');
  console.log('  去掉 --dry 参数以实际执行清理');
}
console.log('');
