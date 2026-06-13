/**
 * 灵墨小说工坊 - Electron 手动下载工具
 *
 * 当 electron-builder 的内置下载器因 404/网络原因失败时
 * 使用本脚本手动下载 Electron zip 到标准缓存目录
 *
 * 使用:
 *   node scripts/download-electron.cjs                    # 使用 package.json 中声明的版本
 *   node scripts/download-electron.cjs --version 28.2.5   # 指定版本
 *   node scripts/download-electron.cjs --win --x64        # 指定目标平台 (默认当前平台)
 *   node scripts/download-electron.cjs --mirror https://npmmirror.com/mirrors/electron/
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');

const ROOT = path.join(__dirname, '..');

// ===== 工具函数 =====

function log(msg) { console.log('  [download] ' + msg); }
function ok(msg) { console.log('  ✓ [download] ' + msg); }
function warn(msg) { console.log('  ⚠ [download] ' + msg); }
function err(msg) { console.log('  ✗ [download] ' + msg); }
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

// ===== 参数解析 =====

const args = process.argv.slice(2);
let version = null;
let targetPlatform = process.platform === 'win32' ? 'win32'
  : process.platform === 'darwin' ? 'darwin' : 'linux';
let targetArch = process.arch === 'x64' ? 'x64'
  : process.arch === 'arm64' ? 'arm64' : 'x64';
let userMirror = null;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--version' && args[i + 1]) { version = args[++i]; }
  else if (a === '--v' && args[i + 1]) { version = args[++i]; }
  else if (a === '--win' || a === '--windows') targetPlatform = 'win32';
  else if (a === '--mac' || a === '--macos') targetPlatform = 'darwin';
  else if (a === '--linux') targetPlatform = 'linux';
  else if (a === '--x64') targetArch = 'x64';
  else if (a === '--arm64') targetArch = 'arm64';
  else if (a === '--ia32') targetArch = 'ia32';
  else if (a === '--mirror' && args[i + 1]) userMirror = args[++i];
}

// ===== 读取 package.json =====

if (!version) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    if (pkg.devDependencies && pkg.devDependencies.electron) {
      version = pkg.devDependencies.electron.replace(/^[\^~>=<\s]+/, '');
    }
  } catch (e) {}
}
if (!version) version = '28.2.5';

// ===== 镜像列表 =====

const MIRRORS = userMirror
  ? [userMirror]
  : [
    'https://npmmirror.com/mirrors/electron/',
    'https://registry.npmmirror.com/-/binary/electron/',
    'https://mirrors.huaweicloud.com/electron/',
    'https://mirrors.bfsu.edu.cn/electron/',
    'https://cdn.npmmirror.com/binaries/electron/',
    'https://github.com/electron/electron/releases/download/'
  ];

const filename = 'electron-v' + version + '-' + targetPlatform + '-' + targetArch + '.zip';
const cacheDir = path.join(os.homedir(), '.cache', 'electron');
const cacheFile = path.join(cacheDir, filename);

mkdirp(cacheDir);

// ===== HTTP 函数 =====

function httpHead(url, timeoutMs) {
  return new Promise(function (resolve) {
    timeoutMs = timeoutMs || 10000;
    const lib = url.startsWith('https://') ? https : http;
    try {
      const req = lib.request(url, { method: 'HEAD', timeout: timeoutMs, followRedirects: true }, function (res) {
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, statusCode: res.statusCode });
      });
      req.on('timeout', function () { req.destroy(); resolve({ ok: false, timeout: true }); });
      req.on('error', function () { resolve({ ok: false, error: true }); });
      req.end();
    } catch (e) { resolve({ ok: false, error: true }); }
  });
}

function httpGet(url, dest, timeoutMs) {
  return new Promise(function (resolve, reject) {
    timeoutMs = timeoutMs || 300000;
    const lib = url.startsWith('https://') ? https : http;
    const startTime = Date.now();

    try {
      const req = lib.get(url, { timeout: timeoutMs, headers: { 'User-Agent': 'LingMo-Novel-Studio' } }, function (res) {
        // 处理重定向
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const loc = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).href;
          res.resume();
          log('  重定向 → ' + loc.substring(0, 50) + '...');
          httpGet(loc, dest, timeoutMs).then(resolve, reject);
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error('HTTP ' + res.statusCode));
          return;
        }

        const totalMB = res.headers['content-length']
          ? (parseInt(res.headers['content-length']) / 1024 / 1024).toFixed(1)
          : '?';

        const tmp = dest + '.part';
        const file = fs.createWriteStream(tmp);
        let downloaded = 0;
        let lastLog = 0;

        log('  大小: ' + totalMB + ' MB，开始下载...');

        res.on('data', function (chunk) {
          downloaded += chunk.length;
          file.write(chunk);
          const now = Date.now();
          if (now - lastLog > 3000) {
            lastLog = now;
            const mb = (downloaded / 1024 / 1024).toFixed(1);
            const elapsed = ((now - startTime) / 1000).toFixed(0);
            log('  进度: ' + mb + ' / ' + totalMB + ' MB (' + elapsed + ' 秒)');
          }
        });

        res.on('end', function () {
          file.end();
          try {
            if (fs.existsSync(tmp)) {
              if (fs.existsSync(dest)) {
                try { fs.unlinkSync(dest); } catch (e) {}
              }
              fs.renameSync(tmp, dest);
              const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
              ok('下载完成: ' + fileSizeMB(dest) + ' MB / ' + elapsed + ' 秒');
              resolve(true);
            } else {
              reject(new Error('临时文件不存在'));
            }
          } catch (e) { reject(e); }
        });

        file.on('error', function (e) { reject(e); });
      });

      req.on('timeout', function () { req.destroy(); reject(new Error('下载超时')); });
      req.on('error', function (e) { reject(e); });
    } catch (e) { reject(e); }
  });
}

// ===== 构造 URL 候选 =====

function buildCandidateUrls(mirror, ver, fn) {
  const base = mirror.replace(/\/+$/, '');
  return [
    base + '/v' + ver + '/' + fn,           // 最常见: /v28.2.5/electron-v28.2.5-win32-x64.zip
    base + '/' + ver + '/' + fn,            // 无 v 前缀: /28.2.5/...
    base + '/v' + ver + '/' + fn.replace(   // GitHub raw: /v28.2.5/...
      'electron-v', 'electron-')
  ];
}

// ===== 主流程 =====

(async function main() {
  header('灵墨小说工坊 - Electron 手动下载器');
  log('版本: v' + version);
  log('目标: ' + targetPlatform + ' / ' + targetArch);
  log('文件名: ' + filename);
  log('缓存目录: ' + cacheDir);
  console.log('');

  // 检查是否已缓存
  if (fs.existsSync(cacheFile)) {
    const size = fs.statSync(cacheFile).size;
    if (size > 50 * 1024 * 1024) {
      ok('已缓存: ' + fileSizeMB(cacheFile) + ' MB');
      console.log('');
      console.log('  文件位置: ' + cacheFile);
      console.log('  现在可以执行: npm run build:exe');
      process.exit(0);
    } else {
      warn('已存在但文件过小 (' + fileSizeMB(cacheFile) + ' MB)，重新下载');
      try { fs.unlinkSync(cacheFile); } catch (e) {}
    }
  }

  // 探测可用镜像
  header('正在探测镜像可用性...');

  let downloadUrl = null;
  let workingMirror = null;

  for (let i = 0; i < MIRRORS.length; i++) {
    const mirror = MIRRORS[i];
    const urls = buildCandidateUrls(mirror, version, filename);

    log('[' + (i + 1) + '/' + MIRRORS.length + '] ' + mirror.substring(0, 50));

    for (let j = 0; j < urls.length; j++) {
      log('  → 测试: ' + urls[j].substring(0, 70));
      try {
        const res = await httpHead(urls[j], 8000);
        if (res.ok) {
          ok('可用: HTTP ' + res.statusCode);
          downloadUrl = urls[j];
          workingMirror = mirror;
          break;
        }
      } catch (e) {}
    }

    if (downloadUrl) break;
  }

  if (!downloadUrl) {
    err('所有镜像都无法访问');
    console.log('');
    console.log('  请检查网络或手动下载:');
    console.log('  https://github.com/electron/electron/releases/tag/v' + version);
    console.log('  下载: ' + filename);
    console.log('  保存到: ' + cacheFile);
    process.exit(1);
  }

  // 下载
  header('开始下载');
  log('来源: ' + workingMirror);
  log('URL : ' + downloadUrl);
  console.log('');

  try {
    await httpGet(downloadUrl, cacheFile, 300000);
  } catch (e) {
    err('下载失败: ' + e.message);
    console.log('');
    console.log('  建议: 手动从以下地址下载:');
    console.log('    ' + downloadUrl);
    console.log('');
    console.log('  保存到: ' + cacheFile);
    process.exit(1);
  }

  // 验证
  header('验证');
  if (!fs.existsSync(cacheFile)) { err('文件未找到'); process.exit(1); }
  const size = fs.statSync(cacheFile).size;
  if (size < 50 * 1024 * 1024) {
    err('文件过小 (' + (size / 1024 / 1024).toFixed(1) + ' MB)，可能下载失败');
    process.exit(1);
  }
  ok('文件大小: ' + fileSizeMB(cacheFile) + ' MB');

  // 设置环境变量提示
  console.log('');
  header('完成');
  console.log('  ✓ Electron 已缓存到: ' + cacheFile);
  console.log('');
  console.log('  设置环境变量后即可打包:');
  console.log('    Windows (PowerShell):');
  console.log('      $env:ELECTRON_MIRROR="' + workingMirror + '"');
  console.log('      $env:ELECTRON_CACHE="' + cacheDir + '"');
  console.log('      npm run build:exe');
  console.log('');
  console.log('    Windows (CMD):');
  console.log('      set ELECTRON_MIRROR=' + workingMirror);
  console.log('      set ELECTRON_CACHE=' + cacheDir);
  console.log('      npm run build:exe');
  console.log('');
  console.log('    Linux/Mac:');
  console.log('      ELECTRON_MIRROR="' + workingMirror + '" \\');
  console.log('      ELECTRON_CACHE="' + cacheDir + '" \\');
  console.log('      npm run build:exe');
  console.log('');
  process.exit(0);
})();
