/**
 * 灵墨小说工坊 - Electron Builder 配置 (v4 - 单配置源)
 *
 * 基于截图错误的完整修复记录:
 * [问题 1] URL 拼接错误: https://npmmirror.com/mirrors/electron/.dist/electron-v28.0.0-win32-x64.zip (404)
 *   → 原因: electronDownload.mirror 末尾缺少尾部斜杠 / 多配置源冲突 (package.json build 字段 + yml + js 三配置合并错误
 *   → 修复: 移除 package.json build 字段 + 移除 electron-builder.yml, 仅此文件为唯一配置源
 *   → URL 格式: mirror/v{version}/electron-v{version}-{platform}-{arch}.zip
 *
 * [问题 2] app-builder.exe 执行失败: ERR_ELECTRON_BUILDER_CANNOT_EXECUTE
 *   → 原因: npx 将 app-builder-bin 下载到 %TEMP%/npm-cache/_npx/<hash>/ 临时目录
 *   → 杀毒软件拦截 + EPERM 权限锁
 *   → 修复: run-electron-builder.cjs 强制使用项目本地 node_modules/.bin/electron-builder
 *
 * [问题 3] 版本不一致: electron=28.0.0 (声明 与 electron-v28.2.5 (实际)
 *   → 原因: 多配置源字段不统一
 *   → 修复: 从此文件动态读取 package.json devDependencies.electron 精确版本
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');

// ===== 读取 package.json - 精确版本声明
let electronVersion = '28.2.5';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  if (pkg.devDependencies && pkg.devDependencies.electron) {
    electronVersion = String(pkg.devDependencies.electron).replace(/^[\^~>=<\s]+/, '');
  }
} catch (e) { /* 使用默认值 */ }

// ===== 镜像 URL (必须以 / 结尾) =====
// electron-builder 的 electronDownload 内部拼接规则:
//   URL = mirror + customDir || ('v' + version) + '/' + customFilename || ('electron-v' + version + '-' + platform + '-' + arch + '.zip'
//   例: https://npmmirror.com/mirrors/electron/v28.2.5/electron-v28.2.5-win32-x64.zip
const MIRROR = (process.env.ELECTRON_MIRROR
  || process.env.npm_config_electron_mirror
  || 'https://npmmirror.com/mirrors/electron/')
  .replace(/\/+$/, '') + '/';

// ===== 缓存目录 (用户主目录，避开 npm-cache/_npx 临时区权限问题
const ELECTRON_CACHE = process.env.ELECTRON_CACHE
  || path.join(os.homedir(), '.cache', 'electron');

const BUILDER_CACHE = process.env.ELECTRON_BUILDER_CACHE
  || path.join(os.homedir(), '.cache', 'electron-builder');

// 缓存目录确保存在
function mkdirp(dir) {
  try {
    if (!fs.existsSync(dir)) {
      const parent = path.dirname(dir);
      if (parent && parent !== dir) mkdirp(parent);
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (e) {}
}
mkdirp(ELECTRON_CACHE);
mkdirp(BUILDER_CACHE);

// ===== 主配置
const config = {
  appId: 'com.lingmo.novel-studio',
  productName: '灵墨小说工坊',
  productFilename: '灵墨小说工坊',
  copyright: 'Copyright © 2024 LingMo Studio',
  author: 'LingMo Studio',
  electronVersion: electronVersion,

  directories: {
    output: path.join(ROOT, 'release'),
    buildResources: path.join(ROOT, 'build'),
    cache: BUILDER_CACHE
  },

  files: [
    'dist/**/*',
    'electron/**/*',
    'package.json'
  ],

  // ===== Windows 配置
  win: {
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'portable', arch: ['x64'] }
    ],
    artifactName: '${productName}-${version}-setup.${ext}',
    sign: null,
    certificateFile: null,
    certificatePassword: null,
    signAndEditExecutable: false,
    verifyUpdateCodeSignature: false
  },

  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: '灵墨小说工坊',
    runAfterFinish: true,
    differentialPackage: false
  },

  portable: {
    artifactName: '${productName}-${version}-portable.${ext}',
    requestExecutionLevel: 'user'
  },

  // ===== Electron 下载配置 (核心修复) =====
  // 精确的镜像: {mirror}/v{version}/electron-v{version}-{platform}-{arch}.zip
  electronDownload: {
    mirror: MIRROR,
    cache: ELECTRON_CACHE,
    strictSSL: false,
    timeout: 120000,
    isVerifyChecksum: false
  },

  asar: false,
  compression: 'maximum',
  removePackageKeywords: true,
  buildDependenciesFromSource: false,
  npmRebuild: false,

  // ===== extraResources (data/ 运行时依赖 (express/axios/cors) =====
  extraResources: []
};

// backend/data 数据目录 (存在时加入
if (fs.existsSync(path.join(ROOT, 'backend', 'data'))) {
  config.extraResources.push({
    from: path.join(ROOT, 'backend', 'data'),
    to: 'data',
    filter: ['**/*']
  });
}

// node_modules 运行时依赖 (加入 exe 中 node_modules/ 以便 express/axios/cors/body-parser/uuid 等)
const runtimeDeps = [
  'axios', 'express', 'cors', 'body-parser', 'uuid',
  'qs', 'cookie', 'debug', 'ms', 'depd', 'setprototypeof',
  'statuses', 'inherits', 'toidentifier', 'on-finished',
  'ee-first', 'vary', 'fresh', 'range-parser', 'negotiator',
  'safe-buffer', 'safer-buffer', 'iconv-lite', 'send',
  'serve-static', 'encodeurl', 'escape-html', 'finalhandler',
  'parseurl', 'path-to-regexp', 'merge-descriptors', 'methods',
  'utils-merge', 'etag', 'unpipe', 'proxy-addr', 'forwarded',
  'ipaddr.js', 'type-is', 'media-typer', 'mime', 'mime-db',
  'mime-types', 'follow-redirects', 'proxy-from-env'
];

for (const dep of runtimeDeps) {
  const depPath = path.join(ROOT, 'node_modules', dep);
  if (fs.existsSync(depPath)) {
    config.extraResources.push({
      from: depPath,
      to: 'node_modules/' + dep
    });
  }
}

module.exports = config;

// 直接执行时打印 JSON (供 electron-builder --config 使用)
if (require.main === module) {
  process.stdout.write(JSON.stringify(config, null, 2));
}
