/**
 * 灵墨小说工坊 - Electron Builder 启动器
 *
 * 功能:
 * 1. 自动测试并切换可用的 Electron 下载镜像 (解决 404 问题)
 * 2. 配置环境变量 (ELECTRON_MIRROR / 缓存路径)
 * 3. 调用 electron-builder 进行打包
 *
 * 使用:
 *   node scripts/run-electron-builder.cjs --win --x64
 *   node scripts/run-electron-builder.cjs --linux --x64
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const os = require('os');

const ROOT = path.join(__dirname, '..');

// ============ 工具函数 ============

function log(msg) {
  console.log('  [builder] ' + msg);
}

function warn(msg) {
  console.log('  ⚠ [builder] ' + msg);
}

function error(msg) {
  console.error('  ✗ [builder] ' + msg);
}

function ok(msg) {
  console.log('  ✓ [builder] ' + msg);
}

/**
 * HTTP HEAD 请求 - 检查 URL 是否存在
 * 使用原生 https/http 避免 axios 依赖
 */
function checkUrl(url, timeoutMs) {
  return new Promise(function (resolve) {
    timeoutMs = timeoutMs || 8000;
    const client = url.startsWith('https:') ? https : http;

    let req;
    try {
      req = client.request(url, { method: 'HEAD', timeout: timeoutMs }, function (res) {
        const code = res.statusCode || 0;
        // 301/302 视为可能存在 (跟随重定向需要额外处理)
        // 2xx 表示存在
        if (code >= 200 && code < 300) {
          resolve({ ok: true, statusCode: code });
        } else if (code >= 300 && code < 400) {
          // 重定向 - 也视为可用 (有些镜像会 302)
          resolve({ ok: true, statusCode: code, redirected: true });
        } else {
          resolve({ ok: false, statusCode: code });
        }
      });

      req.on('timeout', function () {
        req.destroy();
        resolve({ ok: false, statusCode: 0, timeout: true });
      });

      req.on('error', function () {
        resolve({ ok: false, statusCode: 0, error: true });
      });

      req.end();
    } catch (e) {
      resolve({ ok: false, statusCode: 0, error: true });
    }
  });
}

/**
 * 测试镜像是否存在指定版本的 Electron
 * 实际会请求 electron-v{version}-{platform}-{arch}.zip
 */
async function testMirror(mirror, version, platform, arch) {
  // 尝试两种 URL 格式 (不同镜像的路径结构不同)
  const filename = 'electron-v' + version + '-' + platform + '-' + arch + '.zip';
  const urls = [
    mirror.replace(/\/$/, '') + '/v' + version + '/' + filename,
    mirror.replace(/\/$/, '') + '/' + version + '/' + filename,
    mirror.replace(/\/$/, '') + '/v' + version + '/' + filename.replace('electron-v', 'SHASUMS256.txt'),
  ];

  for (const url of urls) {
    try {
      const result = await checkUrl(url, 6000);
      if (result.ok) {
        return { mirror: mirror, url: url, ok: true };
      }
    } catch (e) {
      // 静默失败，尝试下一个
    }
  }
  return { mirror: mirror, ok: false };
}

/**
 * 检查本地是否已缓存 Electron
 */
function checkLocalElectron(version, platform, arch) {
  const cacheDirs = [
    path.join(os.homedir(), '.cache', 'electron'),
    path.join(os.homedir(), '.electron'),
    path.join(os.tmpdir(), 'electron-download'),
    path.join(ROOT, '.npm-cache', '_npx', 'electron', 'cache'),
  ];

  const filename = 'electron-v' + version + '-' + platform + '-' + arch + '.zip';
  for (const dir of cacheDirs) {
    const testPath = path.join(dir, filename);
    try {
      if (fs.existsSync(testPath) && fs.statSync(testPath).size > 1024 * 1024) {
        return testPath;
      }
    } catch (e) {} // 忽略权限错误
  }
  return null;
}

// ============ 主流程 ============

(async function main() {
  const args = process.argv.slice(2);
  const targetArgs = args.length > 0 ? args : ['--win', '--x64'];

  // 1. 读取配置
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  const version = (pkg.devDependencies && pkg.devDependencies.electron) || '28.2.5';
  log('项目: ' + pkg.name + ' v' + pkg.version);
  log('Electron 版本: ' + version);
  log('平台参数: ' + targetArgs.join(' '));

  // 2. 检查构建产物
  const distPath = path.join(ROOT, 'dist');
  if (!fs.existsSync(distPath)) {
    error('未找到 dist/ 目录，请先执行: npm run build');
    process.exit(1);
  }
  ok('前端构建产物存在: dist/');

  // 3. 检查 Electron 主进程文件
  if (!fs.existsSync(path.join(ROOT, 'electron', 'main.js'))) {
    error('未找到 electron/main.js');
    process.exit(1);
  }
  ok('主进程文件存在: electron/main.js');

  // 4. 确定平台/架构
  let platform = 'win32';
  let arch = 'x64';
  if (targetArgs.indexOf('--linux') >= 0) platform = 'linux';
  if (targetArgs.indexOf('--mac') >= 0) platform = 'darwin';
  if (targetArgs.indexOf('--arm64') >= 0) arch = 'arm64';
  if (targetArgs.indexOf('--ia32') >= 0) arch = 'ia32';

  log('目标平台: ' + platform + '-' + arch);

  // 5. 检查本地 Electron 是否已下载
  const localElectron = checkLocalElectron(version, platform, arch);
  if (localElectron) {
    ok('本地已缓存 Electron: ' + path.basename(localElectron));
  } else {
    log('本地未缓存 Electron，将在打包时自动下载');
  }

  // 6. 测试镜像，选择可用的
  const mirrors = [
    'https://npmmirror.com/mirrors/electron/',
    'https://registry.npmmirror.com/-/binary/electron/',
    'https://cdn.npmmirror.com/binaries/electron/',
    'https://mirrors.huaweicloud.com/electron/',
    'https://github.com/electron/electron/releases/download/'
  ];

  log('正在测试镜像可用性...');
  let selectedMirror = mirrors[0];

  for (let i = 0; i < mirrors.length; i++) {
    log('  测试 ' + (i + 1) + '/' + mirrors.length + ': ' + mirrors[i]);
    const result = await testMirror(mirrors[i], version, platform, arch);
    if (result.ok) {
      selectedMirror = mirrors[i];
      ok('  ✓ 可用: ' + mirrors[i]);
      break;
    } else {
      warn('  ✗ 不可用，跳过');
    }
  }

  log('使用镜像: ' + selectedMirror);

  // 7. 设置环境变量
  process.env.ELECTRON_MIRROR = selectedMirror;
  process.env.ELECTRON_BUILDER_CACHE = path.join(os.homedir(), '.cache', 'electron-builder');
  process.env.ELECTRON_CACHE = path.join(os.homedir(), '.cache', 'electron');
  process.env.npm_config_electron_mirror = selectedMirror;

  // 8. 调用 electron-builder
  console.log('');
  log('开始打包 (electron-builder)...');
  log('配置文件: electron/desktop-config.js');
  console.log('');

  const builderArgs = targetArgs.concat([
    '--config', path.join(ROOT, 'electron', 'desktop-config.js')
  ]);

  // 尝试两种方式调用 electron-builder
  let exitCode = 1;
  const callers = [
    // 1. 本地 node_modules/.bin/electron-builder
    function () {
      return execSync(
        '"' + path.join(ROOT, 'node_modules', '.bin', 'electron-builder') + '" ' + builderArgs.join(' '),
        {
          cwd: ROOT,
          env: process.env,
          stdio: 'inherit'
        }
      );
    },
    // 2. npx 调用
    function () {
      return execSync(
        'npx electron-builder ' + builderArgs.join(' '),
        {
          cwd: ROOT,
          env: process.env,
          stdio: 'inherit'
        }
      );
    }
  ];

  for (let i = 0; i < callers.length; i++) {
    try {
      callers[i]();
      exitCode = 0;
      break;
    } catch (e) {
      if (i === callers.length - 1) {
        error('electron-builder 执行失败');
        console.log('');
        console.log('  常见错误排查:');
        console.log('    1. 确保已安装依赖: npm install --legacy-peer-deps');
        console.log('    2. 如出现 404，请检查网络连接或切换镜像');
        console.log('    3. 如出现 EPERM，请关闭杀毒软件后重试');
        console.log('    4. Linux/Mac 打包 Windows 需安装 wine');
        console.log('');
        // 尝试给出更有用的错误信息
        if (e.message && e.message.indexOf('ERR_ELECTRON_BUILDER_CANNOT_EXECUTE') >= 0) {
          error('app-builder.exe 无法执行，通常是权限或路径问题');
        }
        if (e.message && e.message.indexOf('404') >= 0) {
          error('Electron 包下载 404，请换其他版本或检查网络');
        }
      } else {
        warn('方式 ' + (i + 1) + ' 调用失败，尝试下一种方式...');
      }
    }
  }

  // 9. 输出结果
  console.log('');
  if (exitCode === 0) {
    ok('打包完成！输出目录: release/');
    // 列出生成的文件
    const releaseDir = path.join(ROOT, 'release');
    if (fs.existsSync(releaseDir)) {
      try {
        const files = fs.readdirSync(releaseDir);
        console.log('  生成文件:');
        for (const f of files) {
          if (f !== 'win-unpacked' && f !== 'builder-debug.yml' && f !== 'builder-effective-config.yaml') {
            const fp = path.join(releaseDir, f);
            const size = Math.round(fs.statSync(fp).size / 1024 / 1024);
            console.log('    - ' + f + '  (' + size + ' MB)');
          }
        }
      } catch (e) {}
    }
  } else {
    error('打包失败，请查看上方日志');
  }

  process.exit(exitCode);
})();
