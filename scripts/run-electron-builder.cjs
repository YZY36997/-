/**
 * 灵墨小说工坊 - Electron Builder 启动器 v3
 *
 * 针对截图中 404 / ERR_ELECTRON_BUILDER_CANNOT_EXECUTE 的完整修复:
 * 1. 精确探测多个 Electron 下载镜像 (逐一下载测试，直到成功)
 * 2. 强制版本号统一 (28.2.5，避免 v28.0.0 与 28.2.5 不一致)
 * 3. 提前缓存 Electron zip 到用户目录，避开 npm cache/_npx 权限问题
 * 4. app-builder.exe 执行失败时的自动修复 (重新安装 electron-builder)
 * 5. 完整的错误诊断和恢复建议
 *
 * 使用: node scripts/run-electron-builder.cjs --win --x64
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync, spawnSync } = require('child_process');
const os = require('os');

const ROOT = path.join(__dirname, '..');

// ===== 工具函数 =====

function log(msg) { console.log('  [builder] ' + msg); }
function ok(msg) { console.log('  ✓ [builder] ' + msg); }
function warn(msg) { console.log('  ⚠ [builder] ' + msg); }
function err(msg) { console.log('  ✗ [builder] ' + msg); }
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

/**
 * HTTP HEAD - 检查 URL 是否可访问 (返回状态码)
 */
function httpHead(url, timeoutMs) {
  return new Promise(function (resolve) {
    timeoutMs = timeoutMs || 10000;
    const lib = url.startsWith('https://') ? https : http;

    try {
      const req = lib.request(url, { method: 'HEAD', timeout: timeoutMs }, function (res) {
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, statusCode: res.statusCode });
      });
      req.on('timeout', function () { req.destroy(); resolve({ ok: false, statusCode: 0, timeout: true }); });
      req.on('error', function () { resolve({ ok: false, statusCode: 0, error: true }); });
      req.end();
    } catch (e) {
      resolve({ ok: false, statusCode: 0, error: true });
    }
  });
}

/**
 * HTTP GET - 下载文件到磁盘
 */
function httpDownload(url, destPath, timeoutMs) {
  return new Promise(function (resolve, reject) {
    timeoutMs = timeoutMs || 300000;
    const lib = url.startsWith('https://') ? https : http;

    log('  下载: ' + url);
    const startTime = Date.now();

    try {
      const req = lib.get(url, { timeout: timeoutMs }, function (res) {
        // 处理重定向
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).href;
          res.resume();
          httpDownload(redirectUrl, destPath, timeoutMs).then(resolve, reject);
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error('HTTP ' + res.statusCode));
          return;
        }

        const tmpPath = destPath + '.part';
        const file = fs.createWriteStream(tmpPath);
        let downloaded = 0;
        let lastLog = 0;

        res.on('data', function (chunk) {
          downloaded += chunk.length;
          file.write(chunk);
          // 每 5 秒打印一次进度
          const now = Date.now();
          if (now - lastLog > 5000) {
            lastLog = now;
            log('  已下载: ' + (downloaded / 1024 / 1024).toFixed(1) + ' MB');
          }
        });

        res.on('end', function () {
          file.end();
          try {
            fs.renameSync(tmpPath, destPath);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            ok('下载完成: ' + fileSizeMB(destPath) + ' MB (' + elapsed + ' 秒)');
            resolve(true);
          } catch (e) { reject(e); }
        });

        file.on('error', function (e) { reject(e); });
      });

      req.on('timeout', function () { req.destroy(); reject(new Error('下载超时')); });
      req.on('error', function (e) { reject(e); });
    } catch (e) { reject(e); }
  });
}

/**
 * 探测可用镜像 - 返回可工作的镜像 URL
 */
async function findWorkingMirror(mirrors, version, platform, arch, filename) {
  log('正在探测可用镜像 (版本: v' + version + ', 平台: ' + platform + '-' + arch + ')...');

  for (let i = 0; i < mirrors.length; i++) {
    const mirror = mirrors[i];
    // 构造测试 URL (两种格式都尝试)
    const testUrls = [
      // 格式 1: mirror/v{version}/filename
      mirror.replace(/\/+$/, '') + '/v' + version + '/' + filename,
      // 格式 2: mirror/{version}/filename (某些镜像不含 v)
      mirror.replace(/\/+$/, '') + '/' + version + '/' + filename,
      // 格式 3: GitHub Releases 下载
      mirror.replace(/\/+$/, '') + '/v' + version + '/' + filename,
    ];

    for (const url of testUrls) {
      log('  [' + (i + 1) + '/' + mirrors.length + '] 探测: ' + url.substring(0, 60) + '...');
      try {
        const result = await httpHead(url, 8000);
        if (result.ok) {
          ok('可用镜像: ' + mirror);
          log('  下载 URL: ' + url);
          return { mirror: mirror, url: url, urlFormat: testUrls.indexOf(url) };
        }
      } catch (e) {}
    }
  }

  // 所有镜像都失败
  warn('所有镜像探测失败，将使用默认镜像继续');
  return { mirror: mirrors[0], url: null, urlFormat: 0 };
}

// ===== 主流程 =====

(async function main() {
  header('灵墨小说工坊 - Electron Builder 启动器 v3');

  // 1. 读取配置
  const args = process.argv.slice(2);
  let pkg = {};
  try { pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')); }
  catch (e) { err('无法读取 package.json: ' + e.message); process.exit(1); }

  const electronVersion = (pkg.devDependencies && pkg.devDependencies.electron)
    ? pkg.devDependencies.electron.replace(/^[\^~>=<\s]+/, '')
    : '28.2.5';

  log('项目: ' + (pkg.name || 'lingmo-novel-studio') + ' v' + (pkg.version || ''));
  log('Electron: v' + electronVersion);
  log('平台: ' + process.platform + ' / ' + process.arch);

  // 2. 解析目标
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

  // 3. 检查前端构建
  header('步骤 1/5: 检查前端构建');
  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
    err('dist/index.html 不存在！请先执行: npm run build');
    process.exit(1);
  }
  ok('前端构建存在');

  // 4. 检查 Electron 主进程
  header('步骤 2/5: 检查主进程');
  if (!fs.existsSync(path.join(ROOT, 'electron', 'main.js'))) {
    err('electron/main.js 不存在');
    process.exit(1);
  }
  ok('主进程存在');

  // 5. 探测可用镜像 & 确保 Electron 已下载
  header('步骤 3/5: 镜像探测与 Electron 缓存');

  const filename = 'electron-v' + electronVersion + '-' + targetPlatform + '-' + targetArch + '.zip';
  const cacheDir = path.join(os.homedir(), '.cache', 'electron');
  const cacheFile = path.join(cacheDir, filename);

  mkdirp(cacheDir);

  // 检查本地是否已有缓存
  if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 50 * 1024 * 1024) {
    ok('本地已缓存 Electron: ' + fileSizeMB(cacheFile) + ' MB');
  } else {
    // 需要下载
    const mirrors = [
      'https://npmmirror.com/mirrors/electron/',
      'https://registry.npmmirror.com/-/binary/electron/',
      'https://mirrors.huaweicloud.com/electron/',
      'https://mirrors.bfsu.edu.cn/electron/',
      'https://github.com/electron/electron/releases/download/'
    ];

    const best = await findWorkingMirror(mirrors, electronVersion, targetPlatform, targetArch, filename);

    // 设置环境变量
    process.env.ELECTRON_MIRROR = best.mirror;
    process.env.ELECTRON_CACHE = cacheDir;
    process.env.ELECTRON_BUILDER_CACHE = path.join(os.homedir(), '.cache', 'electron-builder');
    process.env.npm_config_electron_mirror = best.mirror;

    // 如果有直接可下载的 URL，尝试手动下载 (比 electron-builder 更可靠)
    if (best.url) {
      log('尝试手动下载 Electron 包...');
      try {
        await httpDownload(best.url, cacheFile, 300000);
      } catch (e) {
        warn('手动下载失败: ' + e.message);
        warn('将由 electron-builder 内部下载器处理');
      }
    }
  }

  // 6. 修复 app-builder.exe 问题
  header('步骤 4/5: 修复 app-builder 执行环境');

  const appBinPaths = [
    path.join(ROOT, 'node_modules', 'app-builder-bin', 'win', targetArch, 'app-builder.exe'),
    path.join(ROOT, 'node_modules', 'app-builder-bin', 'win', 'x64', 'app-builder.exe'),
  ];

  let appBuilderReady = false;
  for (const p of appBinPaths) {
    if (fs.existsSync(p)) {
      const stats = fs.statSync(p);
      if (stats.size > 1024) {
        ok('app-builder.exe 就绪: ' + path.relative(ROOT, p));
        appBuilderReady = true;
        break;
      }
    }
  }

  if (!appBuilderReady) {
    warn('未找到 app-builder.exe，尝试重新安装 electron-builder...');
    try {
      execSync('npm install --legacy-peer-deps --no-audit --no-fund electron-builder@24.13.3', {
        cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'], timeout: 120000
      });
      ok('electron-builder 已重新安装');
    } catch (e) {
      warn('重新安装失败: ' + e.message);
      warn('Windows 提示: 如果遇到 EPERM 权限错误');
      warn('  1. 关闭 VS Code / 资源管理器');
      warn('  2. 暂停防病毒软件的实时保护');
      warn('  3. 以管理员身份重新运行 PowerShell');
    }
  }

  // 7. 构建配置文件路径
  const configPath = path.join(ROOT, 'electron', 'desktop-config.js');
  log('使用配置: electron/desktop-config.js');

  // 8. 设置环境变量 (强制)
  process.env.ELECTRON_MIRROR = process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/';
  process.env.ELECTRON_CACHE = cacheDir;
  process.env.ELECTRON_BUILDER_CACHE = path.join(os.homedir(), '.cache', 'electron-builder');
  process.env.ELECTRON_VERSION = electronVersion;
  process.env.npm_config_electron_mirror = process.env.ELECTRON_MIRROR;
  process.env.USE_HARD_LINKS = 'false';  // 避免跨设备链接错误

  // 9. 调用 electron-builder
  header('步骤 5/5: 执行 electron-builder');
  console.log('');
  log('目标: ' + targetPlatform + ' / ' + targetArch);
  log('Electron: v' + electronVersion);
  log('镜像: ' + process.env.ELECTRON_MIRROR);
  log('缓存: ' + process.env.ELECTRON_CACHE);
  console.log('');

  const builderArgs = [
    '--' + (targetPlatform === 'win32' ? 'win' : targetPlatform === 'darwin' ? 'mac' : 'linux'),
    '--' + targetArch,
    '--config', configPath
  ];

  let exitCode = 1;
  let lastError = '';

  // 方法 1: 本地 node_modules/.bin/electron-builder (最优先)
  const localBin = path.join(ROOT, 'node_modules', '.bin', 'electron-builder'
    + (process.platform === 'win32' ? '.cmd' : ''));

  if (fs.existsSync(localBin) || fs.existsSync(localBin.replace(/\.cmd$/, ''))) {
    log('→ 调用: node_modules/.bin/electron-builder ' + builderArgs.join(' '));
    try {
      execSync([localBin].concat(builderArgs).map(function (a) {
        return /\s/.test(a) ? '"' + a + '"' : a;
      }).join(' '), {
        cwd: ROOT, env: process.env, stdio: 'inherit', timeout: 600000
      });
      exitCode = 0;
    } catch (e) { lastError = e.message || String(e); warn('方法 1 失败'); }
  }

  // 方法 2: npx electron-builder
  if (exitCode !== 0) {
    log('→ 尝试: npx electron-builder ' + builderArgs.join(' '));
    try {
      execSync('npx electron-builder ' + builderArgs.join(' '), {
        cwd: ROOT, env: process.env, stdio: 'inherit', timeout: 600000
      });
      exitCode = 0;
    } catch (e) { lastError = e.message || String(e); warn('方法 2 失败'); }
  }

  // 方法 3: 直接 require electron-builder (最可靠，但需要 JS 调用)
  if (exitCode !== 0) {
    log('→ 尝试: 直接调用 electron-builder API');
    try {
      const builder = require(path.join(ROOT, 'node_modules', 'electron-builder'));
      // 读取并应用配置
      const cfg = require(configPath);
      const buildOpts = {
        config: cfg,
        win: ['nsis', 'portable']
      };
      await builder.build(buildOpts);
      exitCode = 0;
    } catch (e) {
      lastError = e.message || String(e);
      warn('方法 3 失败: ' + e.message);
    }
  }

  // 10. 输出结果
  console.log('');
  header('构建结果');

  if (exitCode === 0) {
    ok('✓ 打包成功！');
    const releaseDir = path.join(ROOT, 'release');
    if (fs.existsSync(releaseDir)) {
      console.log('');
      console.log('  生成文件:');
      try {
        const files = fs.readdirSync(releaseDir);
        for (const f of files) {
          if (!fs.statSync(path.join(releaseDir, f)).isDirectory()) {
            console.log('    - ' + f + ' (' + fileSizeMB(path.join(releaseDir, f)) + ' MB)');
          }
        }
      } catch (e) {}
    }
    console.log('');
    console.log('  安装版: 双击 exe 文件即可安装到 Windows');
    console.log('  便携版: 免安装，直接双击运行');
  } else {
    err('打包失败');
    console.log('');
    console.log('  ===== 错误诊断 =====');
    console.log('  最后错误: ' + (lastError || '(未知)').substring(0, 200));
    console.log('');
    console.log('  常见问题与解决方案:');
    console.log('  1. 404 (Electron 下载失败)');
    console.log('     → 切换镜像: set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/');
    console.log('     → 或手动下载: node scripts/download-electron.cjs');
    console.log('');
    console.log('  2. EPERM / 权限被拒 (Windows)');
    console.log('     → 关闭 VS Code / 资源管理器');
    console.log('     → 暂停防病毒软件');
    console.log('     → 以管理员身份重新运行 PowerShell');
    console.log('     → 执行: node scripts/clean.js --deep  然后重试');
    console.log('');
    console.log('  3. ERR_ELECTRON_BUILDER_CANNOT_EXECUTE');
    console.log('     → app-builder.exe 被防病毒软件拦截');
    console.log('     → 将项目目录添加到杀毒软件白名单');
    console.log('     → 或执行: npm install --legacy-peer-deps electron-builder@24.13.3');
    console.log('');
    console.log('  4. 跨平台构建 (Linux 打包 Windows EXE)');
    console.log('     → 需要 Wine，建议直接在 Windows 中打包');
    console.log('');
    console.log('  5. 版本不一致');
    console.log('     → 确保 package.json 中 electron 为精确版本号 (无 ^/~)');
    console.log('     → 当前版本: ' + electronVersion);
    console.log('');
    console.log('  完整诊断命令: node scripts/doctor.js');
    console.log('  手动下载 Electron: node scripts/download-electron.cjs');
    console.log('');
  }

  process.exit(exitCode);
})();
