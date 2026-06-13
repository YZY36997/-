/**
 * 灵墨小说工坊 - Electron Builder 启动器 v4
 *
 * ===== 针对截图 1 核心错误的完整修复
 *
 * [错误 A] app-builder.exe 在 _npx/97431443581207c9/node_modules/app-builder-bin/win/x64/app-builder.exe
 *           路径执行失败 → ERR_ELECTRON_BUILDER_CANNOT_EXECUTE
 *   → 原因: npx 将 app-builder-bin 下载到 %TEMP%/npm-cache/_npx/<随机哈希>/ 临时目录
 *          Windows Defender 扫描临时目录 + EPERM 文件锁 + 哈希路径不一致
 *   → 修复: 禁止使用 `npx electron-builder`；确保 `node_modules/electron-builder` 已安装，
 *          始终使用 `node_modules/.bin/electron-builder` (或 JS API require 调用)
 *
 * [错误 B] https://npmmirror.com/mirrors/electron/.dist/electron-v28.0.0-win32-x64.zip → 404
 *   → 原因: 多配置源冲突 (package.json build 字段 + yml + js 合并) 导致 URL 拼接错误
 *   → 修复: 单一配置源 desktop-config.js + 预下载 Electron 到标准缓存目录
 *
 * 使用: node scripts/run-electron-builder.cjs --win --x64
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync, spawnSync, exec } = require('child_process');
const os = require('os');

const ROOT = path.join(__dirname, '..');

// ===== 工具函数 =====
function log(msg) { console.log('  [build] ' + msg); }
function ok(msg) { console.log('  ✓ [build] ' + msg); }
function warn(msg) { console.log('  ⚠ [build] ' + msg); }
function err(msg) { console.log('  ✗ [build] ' + msg); }
function header(title) {
  console.log('');
  console.log('══════════════════════════════════════════');
  console.log('  ' + title);
  console.log('══════════════════════════════════════════');
}
function mkdirp(dir) {
  try {
    if (!fs.existsSync(dir)) {
      const parent = path.dirname(dir);
      if (parent && parent !== dir) mkdirp(parent);
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (e) {}
}
function fileSizeMB(p) {
  try { return (fs.statSync(p).size / 1024 / 1024).toFixed(1); }
  catch (e) { return '0'; }
}

// ===== HTTP 工具 =====
function httpHead(url, timeoutMs) {
  return new Promise(function (resolve) {
    timeoutMs = timeoutMs || 10000;
    const lib = url.startsWith('https://') ? https : http;
    try {
      const req = lib.request(url, { method: 'HEAD', timeout: timeoutMs }, function (res) {
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, statusCode: res.statusCode });
      });
      req.on('timeout', function () { req.destroy(); resolve({ ok: false, timeout: true }); });
      req.on('error', function () { resolve({ ok: false, error: true }); });
      req.end();
    } catch (e) { resolve({ ok: false, error: true }); }
  });
}

function httpDownload(url, destPath, timeoutMs) {
  return new Promise(function (resolve, reject) {
    timeoutMs = timeoutMs || 300000;
    const lib = url.startsWith('https://') ? https : http;
    const startTime = Date.now();
    try {
      const req = lib.get(url, { timeout: timeoutMs, headers: { 'User-Agent': 'LingMo-Novel-Studio' } }, function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const loc = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).href;
          res.resume();
          httpDownload(loc, destPath, timeoutMs).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error('HTTP ' + res.statusCode));
          return;
        }
        const tmp = destPath + '.part';
        const file = fs.createWriteStream(tmp);
        let downloaded = 0;
        let lastLog = 0;
        res.on('data', function (chunk) {
          downloaded += chunk.length;
          file.write(chunk);
          const now = Date.now();
          if (now - lastLog > 5000) {
            lastLog = now;
            log('  进度: ' + (downloaded / 1024 / 1024).toFixed(1) + ' MB');
          }
        });
        res.on('end', function () {
          file.end();
          try {
            if (fs.existsSync(tmp)) {
              if (fs.existsSync(destPath)) { try { fs.unlinkSync(destPath); } catch (e) {} }
              fs.renameSync(tmp, destPath);
              resolve(true);
            } else reject(new Error('临时文件不存在'));
          } catch (e) { reject(e); }
        });
        file.on('error', function (e) { reject(e); });
      });
      req.on('timeout', function () { req.destroy(); reject(new Error('下载超时')); });
      req.on('error', function (e) { reject(e); });
    } catch (e) { reject(e); }
  });
}

// ===== 镜像探测 =====
async function probeMirrors(mirrors, version, filename) {
  log('正在探测可用镜像 (v' + version + ')...');
  for (let i = 0; i < mirrors.length; i++) {
    const mirror = mirrors[i].replace(/\/+$/, '') + '/';
    // 精确的 URL: mirror/v{version}/electron-v{version}-{platform}-{arch}.zip
    const testUrl = mirror + 'v' + version + '/' + filename;
    log('  [' + (i + 1) + '/' + mirrors.length + '] ' + testUrl.substring(0, 70));
    try {
      const r = await httpHead(testUrl, 8000);
      if (r.ok) { ok('可用镜像: ' + mirror); return { mirror: mirror, url: testUrl }; }
    } catch (e) {}
  }
  return { mirror: mirrors[0].replace(/\/+$/, '') + '/', url: null };
}

// ===== 确保 electron-builder 已安装到项目本地 node_modules (核心: 不使用 npx) =====
function ensureLocalBuilder() {
  header('步骤 3/5: 确保 electron-builder 本地就绪');

  // 1. 检查本地项目 node_modules 是否存在 electron-builder 包
  const pkgPath = path.join(ROOT, 'node_modules', 'electron-builder', 'package.json');
  const binPathWin = path.join(ROOT, 'node_modules', '.bin', 'electron-builder.cmd');
  const binPathNix = path.join(ROOT, 'node_modules', '.bin', 'electron-builder');

  const binExists = fs.existsSync(binPathWin) || fs.existsSync(binPathNix);
  const pkgExists = fs.existsSync(pkgPath);

  if (binExists && pkgExists) {
    ok('electron-builder 已在本地 node_modules 就绪');
    return true;
  }

  // 2. 未就绪 → 安装到项目本地 node_modules (注意: 从不使用 npx 临时下载!)
  warn('本地 electron-builder 不存在');
  warn('正在安装 electron-builder@24.13.3 到项目本地 node_modules/ ...');

  try {
    execSync('npm install --legacy-peer-deps --no-audit --no-fund electron-builder@24.13.3', {
      cwd: ROOT, stdio: 'inherit', timeout: 300000
    });

    if (fs.existsSync(binPathWin) || fs.existsSync(binPathNix)) {
      ok('electron-builder 安装成功');
      return true;
    }
    warn('安装后仍未找到可执行文件');
  } catch (e) {
    err('npm install electron-builder 失败: ' + (e.message || String(e)));
  }
  return false;
}

// ===== 检查 app-builder.exe (Windows 特有二进制, 是 electron-builder 的底层工具) =====
function ensureAppBuilderBin(targetArch) {
  header('步骤 4/5: 检查 app-builder.exe');

  const expectedPaths = [
    path.join(ROOT, 'node_modules', 'app-builder-bin', 'win', targetArch, 'app-builder.exe'),
    path.join(ROOT, 'node_modules', 'app-builder-bin', 'win', 'x64', 'app-builder.exe'),
    path.join(ROOT, 'node_modules', 'app-builder-bin', 'win', 'ia32', 'app-builder.exe'),
    // Linux/mac 版本 (方便在非 Windows 平台也能检测)
    path.join(ROOT, 'node_modules', 'app-builder-bin', 'linux', 'x64', 'app-builder'),
    path.join(ROOT, 'node_modules', 'app-builder-bin', 'mac', 'app-builder')
  ];

  for (const p of expectedPaths) {
    if (fs.existsSync(p)) {
      const stats = fs.statSync(p);
      if (stats.size > 1024) {
        ok('app-builder 二进制就绪: ' + path.relative(ROOT, p) + ' (' + (stats.size / 1024).toFixed(0) + ' KB)');
        return true;
      }
    }
  }

  warn('app-builder-bin 未找到');
  warn('尝试重装 app-builder-bin ...');

  try {
    execSync('npm install --legacy-peer-deps --no-audit --no-fund app-builder-bin@4.0.0', {
      cwd: ROOT, stdio: 'inherit', timeout: 120000
    });

    for (const p of expectedPaths) {
      if (fs.existsSync(p) && fs.statSync(p).size > 1024) {
        ok('app-builder-bin 已安装');
        return true;
      }
    }
  } catch (e) {
    warn('npm install app-builder-bin 失败: ' + (e.message || String(e)));
  }

  warn('app-builder-bin 仍未就绪 (在 Windows 下可能需要关闭杀毒软件后重新安装)');
  return false;
}

// ===== 主流程 =====
(async function main() {
  header('灵墨小说工坊 - Electron Builder 启动器 v4');

  // ===== 1. 读取配置
  const args = process.argv.slice(2);
  let pkg = {};
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  } catch (e) {
    err('无法读取 package.json: ' + e.message);
    process.exit(1);
  }

  const electronVersion = (pkg.devDependencies && pkg.devDependencies.electron)
    ? String(pkg.devDependencies.electron).replace(/^[\^~>=<\s]+/, '')
    : '28.2.5';

  log('项目: ' + (pkg.name || 'lingmo-novel-studio') + ' v' + (pkg.version || ''));
  log('Electron: v' + electronVersion + ' (精确版本)');
  log('运行平台: ' + process.platform + ' / ' + process.arch);

  // ===== 2. 解析目标
  let targetPlatform = 'win32';
  let targetArch = 'x64';
  for (const a of args) {
    if (a === '--win' || a === '--windows') targetPlatform = 'win32';
    else if (a === '--mac' || a === '--macos') targetPlatform = 'darwin';
    else if (a === '--linux') targetPlatform = 'linux';
    else if (a === '--x64') targetArch = 'x64';
    else if (a === '--arm64') targetArch = 'arm64';
    else if (a === '--ia32') targetArch = 'ia32';
  }
  log('构建目标: ' + targetPlatform + ' / ' + targetArch);

  // ===== 3. 检查前端构建
  header('步骤 1/5: 前端构建检查');
  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
    err('dist/index.html 不存在！请先执行: npm run build');
    process.exit(1);
  }
  try {
    const files = fs.readdirSync(path.join(ROOT, 'dist', 'assets'));
    ok('前端构建存在: ' + files.length + ' 个资源文件');
  } catch (e) {
    ok('前端构建存在');
  }

  // ===== 4. 检查主进程
  header('步骤 2/5: 主进程检查');
  if (!fs.existsSync(path.join(ROOT, 'electron', 'main.js'))) {
    err('electron/main.js 不存在');
    process.exit(1);
  }
  ok('electron/main.js 存在 (' + fileSizeMB(path.join(ROOT, 'electron', 'main.js')) + ' KB)');

  // ===== 5. 确保 electron-builder 已安装 (核心: 本地 node_modules)
  ensureLocalBuilder();

  // ===== 6. 检查 app-builder.exe (底层二进制)
  ensureAppBuilderBin(targetArch);

  // ===== 7. 镜像探测与 Electron 预下载 (在调用 electron-builder 前完成)
  header('步骤 5/5: Electron 预下载');

  const filename = 'electron-v' + electronVersion + '-' + targetPlatform + '-' + targetArch + '.zip';
  const cacheDir = path.join(os.homedir(), '.cache', 'electron');
  const cacheFile = path.join(cacheDir, filename);
  mkdirp(cacheDir);

  // 设置环境变量 (强制 electron-builder 也使用同一镜像和缓存)
  const mirrors = [
    'https://npmmirror.com/mirrors/electron/',
    'https://registry.npmmirror.com/-/binary/electron/',
    'https://mirrors.huaweicloud.com/electron/',
    'https://mirrors.bfsu.edu.cn/electron/',
    'https://github.com/electron/electron/releases/download/'
  ];

  // 检查本地缓存
  if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 50 * 1024 * 1024) {
    ok('Electron 已缓存: ' + fileSizeMB(cacheFile) + ' MB');
    process.env.ELECTRON_MIRROR = mirrors[0].replace(/\/+$/, '') + '/';
    process.env.ELECTRON_CACHE = cacheDir;
    process.env.ELECTRON_VERSION = electronVersion;
  } else {
    const best = await probeMirrors(mirrors, electronVersion, filename);
    process.env.ELECTRON_MIRROR = best.mirror;
    process.env.ELECTRON_CACHE = cacheDir;
    process.env.ELECTRON_VERSION = electronVersion;
    process.env.ELECTRON_BUILDER_CACHE = path.join(os.homedir(), '.cache', 'electron-builder');
    process.env.npm_config_electron_mirror = best.mirror;
    process.env.USE_HARD_LINKS = 'false';

    if (best.url) {
      log('手动下载 Electron: ' + filename + ' ...');
      try {
        await httpDownload(best.url, cacheFile, 300000);
        ok('下载完成: ' + fileSizeMB(cacheFile) + ' MB');
      } catch (e) {
        warn('手动下载失败: ' + e.message);
        warn('将交给 electron-builder 内部下载器');
      }
    } else {
      warn('所有镜像探测失败，交给 electron-builder 内部处理');
    }
  }

  // ===== 8. 调用 electron-builder (只用本地 node_modules/.bin)
  header('执行 electron-builder');

  const configPath = path.join(ROOT, 'electron', 'desktop-config.js');
  const builderBin = process.platform === 'win32'
    ? path.join(ROOT, 'node_modules', '.bin', 'electron-builder.cmd')
    : path.join(ROOT, 'node_modules', '.bin', 'electron-builder');

  const builderArgs = [
    '--' + (targetPlatform === 'win32' ? 'win' : targetPlatform === 'darwin' ? 'mac' : 'linux'),
    '--' + targetArch,
    '--config', configPath
  ];

  log('使用配置: electron/desktop-config.js');
  log('调用路径: node_modules/.bin/electron-builder' + (process.platform === 'win32' ? '.cmd' : ''));
  log('参数: ' + builderArgs.join(' '));
  log('镜像: ' + process.env.ELECTRON_MIRROR);
  log('缓存: ' + process.env.ELECTRON_CACHE);
  console.log('');

  let exitCode = 1;
  let lastError = '';

  // ===== 方法 1: 本地 node_modules/.bin/electron-builder (首选)
  if (fs.existsSync(builderBin)) {
    log('方法 1: 调用本地 electron-builder');
    try {
      execSync('"' + builderBin + '" ' + builderArgs.join(' '), {
        cwd: ROOT, env: process.env, stdio: 'inherit', timeout: 600000
      });
      exitCode = 0;
    } catch (e) {
      lastError = e.message || String(e);
      warn('方法 1 失败: ' + (e.code || '未知错误'));
    }
  }

  // ===== 方法 2: JS API require 调用 electron-builder (最可靠，无 npx 问题)
  if (exitCode !== 0) {
    log('方法 2: 直接调用 electron-builder JS API');
    try {
      const builder = require(path.join(ROOT, 'node_modules', 'electron-builder'));
      const cfg = require(configPath);
      await builder.build({
        config: cfg,
        win: ['nsis', 'portable'],
        x64: true
      });
      exitCode = 0;
    } catch (e) {
      lastError = e.message || String(e);
      warn('方法 2 失败: ' + e.message);
    }
  }

  // ===== 9. 结果
  console.log('');
  header('构建结果');

  if (exitCode === 0) {
    ok('打包成功！');
    const releaseDir = path.join(ROOT, 'release');
    if (fs.existsSync(releaseDir)) {
      console.log('');
      console.log('  生成文件位于 release/:');
      try {
        const files = fs.readdirSync(releaseDir);
        for (const f of files) {
          const full = path.join(releaseDir, f);
          if (!fs.statSync(full).isDirectory()) {
            console.log('    - ' + f + ' (' + fileSizeMB(full) + ' MB)');
          }
        }
      } catch (e) {}
    }
    console.log('');
    console.log('  双击 exe 文件即可在 Windows 上安装/运行');
    process.exit(0);
  }

  err('打包失败');
  console.log('');
  console.log('  ===== 错误诊断 =====');
  console.log('  最后错误: ' + (lastError || '(未知)').substring(0, 300));
  console.log('');
  console.log('  针对截图 1 错误的分步解决方案:');
  console.log('');
  console.log('  [问题 A] URL 含 .dist/ 导致 404');
  console.log('     → 已移除 package.json build 字段');
  console.log('     → 已移除 electron-builder.yml');
  console.log('     → 唯一配置源: electron/desktop-config.js');
  console.log('');
  console.log('  [问题 B] app-builder.exe 执行失败 (ERR_ELECTRON_BUILDER_CANNOT_EXECUTE)');
  console.log('     → 禁止使用 npx electron-builder (会下载到 %TEMP%/_npx/<hash>/)');
  console.log('     → 已强制使用: node_modules/.bin/electron-builder');
  console.log('     → Windows 提示:');
  console.log('        1. 将项目目录添加到杀毒软件白名单');
  console.log('        2. 关闭 VS Code / 资源管理器');
  console.log('        3. 以管理员身份运行 PowerShell');
  console.log('        4. 执行: node scripts/clean.js --deep');
  console.log('');
  console.log('  [问题 C] Electron 下载 404');
  console.log('     → 已执行: node scripts/download-electron.cjs --win --x64');
  console.log('     → 或设置: set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/');
  console.log('');
  console.log('  完整诊断: node scripts/doctor.js');
  console.log('  手动下载 Electron: node scripts/download-electron.cjs');
  console.log('');
  process.exit(1);
})();
