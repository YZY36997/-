/**
 * 灵墨小说工坊 - Electron 开发模式启动器
 *
 * 在开发模式下启动 Electron 应用，自动等待前端开发服务器就绪
 *
 * 使用:
 *   node scripts/run-electron.cjs
 *   环境变量: VITE_DEV_SERVER_URL=http://localhost:5173 (自动检测)
 */

'use strict';

const path = require('path');
const http = require('http');
const { execSync, spawn } = require('child_process');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');

function log(msg) { console.log('  [electron] ' + msg); }
function warn(msg) { console.log('  ⚠ [electron] ' + msg); }
function ok(msg) { console.log('  ✓ [electron] ' + msg); }

// 检查 electron 依赖是否安装
const electronBin = path.join(ROOT, 'node_modules', '.bin', 'electron');
const electronWin = electronBin + '.cmd';

if (!fs.existsSync(electronBin) && !fs.existsSync(electronWin)) {
  warn('未检测到 Electron，正在安装...');
  try {
    execSync('npm install --legacy-peer-deps electron@28.2.5', {
      cwd: ROOT,
      stdio: 'inherit',
      env: Object.assign({}, process.env, {
        ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/'
      })
    });
  } catch (e) {
    console.error('  ✗ Electron 安装失败');
    process.exit(1);
  }
}

// 等待开发服务器 (默认 http://localhost:5173)
function waitForServer(url, timeoutMs, attempts) {
  return new Promise(function (resolve, reject) {
    let tried = 0;
    const maxTries = attempts || 30;
    const timeout = timeoutMs || 2000;

    function tryConnect() {
      tried++;
      const req = http.get(url, function (res) {
        if (res.statusCode === 200 || res.statusCode === 404 || res.statusCode === 304) {
          ok('开发服务器已就绪: ' + url);
          resolve(true);
        } else {
          if (tried < maxTries) {
            setTimeout(tryConnect, timeout);
          } else {
            reject(new Error('超时未连接到开发服务器'));
          }
        }
      });
      req.on('error', function () {
        if (tried < maxTries) {
          log('等待开发服务器... (' + tried + '/' + maxTries + ')');
          setTimeout(tryConnect, timeout);
        } else {
          reject(new Error('超时未连接到开发服务器'));
        }
      });
      req.setTimeout(timeout);
    }
    tryConnect();
  });
}

(async function main() {
  const serverUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
  log('等待前端开发服务器就绪: ' + serverUrl);

  try {
    await waitForServer(serverUrl, 1500, 40);
  } catch (e) {
    warn(e.message + '，但仍尝试启动 Electron...');
  }

  // 设置环境变量并启动 Electron
  process.env.NODE_ENV = 'development';
  process.env.VITE_DEV_SERVER_URL = serverUrl;

  log('启动 Electron 应用...');

  let electronPath = electronBin;
  if (process.platform === 'win32' && fs.existsSync(electronWin)) {
    electronPath = electronWin;
  }

  // 优先使用本地 electron，其次 npx
  const child = spawn(electronPath, [ROOT], {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit'
  });

  child.on('exit', function (code) {
    log('Electron 已退出 (code=' + code + ')');
    process.exit(code || 0);
  });

  child.on('error', function (err) {
    warn('本地 electron 启动失败，尝试 npx...');
    // 回退到 npx
    const child2 = spawn('npx', ['electron', ROOT], {
      cwd: ROOT,
      env: process.env,
      stdio: 'inherit'
    });
    child2.on('exit', function (code) { process.exit(code || 0); });
  });
})();
