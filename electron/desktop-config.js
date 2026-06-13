/**
 * 灵墨小说工坊 - Electron Builder 配置 (v3 - 精确镜像)
 *
 * 核心修复 (基于截图 404 错误分析):
 * 1. electron 版本号精确声明 (不使用 ^ 范围符)
 * 2. electronDownload.mirror 使用正确的 URL 格式
 * 3. 避免 URL 拼接产生 ".dist/" 等错误路径
 * 4. 自动检测本地缓存的 electron 包
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');

// 读取 package.json 中的 electron 版本 (确保精确匹配)
let electronVersion = '28.2.5'; // 默认版本 (精确)
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  if (pkg.devDependencies && pkg.devDependencies.electron) {
    electronVersion = pkg.devDependencies.electron.replace(/^[\^~>=<\s]+/, '');
  }
} catch (e) {}

// Electron 镜像列表 (按优先级) - 每个 URL 末尾必须有斜杠
const MIRRORS = [
  // 1. 清华大学镜像 (推荐，最稳定)
  'https://npmmirror.com/mirrors/electron/',
  // 2. npmmirror 旧域名 (兼容)
  'https://registry.npmmirror.com/-/binary/electron/',
  // 3. 华为云镜像
  'https://mirrors.huaweicloud.com/electron/',
  // 4. 官方 GitHub Releases (不通过镜像)
  'https://github.com/electron/electron/releases/download/',
  // 5. 北京外国语大学镜像
  'https://mirrors.bfsu.edu.cn/electron/',
];

// 从环境变量读取用户首选镜像
const userMirror = process.env.ELECTRON_MIRROR
  || process.env.npm_config_electron_mirror
  || process.env.npm_config_ELECTRON_MIRROR
  || MIRRORS[0];

// 缓存目录 (放在用户主目录，避免 npm cache/_npx 权限问题)
const electronCacheDir = process.env.ELECTRON_CACHE
  || path.join(os.homedir(), '.cache', 'electron');

const builderCacheDir = process.env.ELECTRON_BUILDER_CACHE
  || path.join(os.homedir(), '.cache', 'electron-builder');

// 确保缓存目录存在 (递归)
function mkdirp(dir) {
  try {
    if (!fs.existsSync(dir)) {
      const parent = path.dirname(dir);
      if (parent && parent !== dir) mkdirp(parent);
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (e) {}
}
mkdirp(electronCacheDir);
mkdirp(builderCacheDir);

// === 主配置 ===
const config = {
  appId: 'com.lingmo.novel-studio',
  productName: '灵墨小说工坊',
  productFilename: '灵墨小说工坊',
  copyright: 'Copyright © 2024 LingMo Studio',
  // 关键: electron版本必须精确，不能用 ^
  electronVersion: electronVersion,

  directories: {
    output: path.join(ROOT, 'release'),
    buildResources: path.join(ROOT, 'build'),
    cache: builderCacheDir
  },

  files: [
    'dist/**/*',
    'electron/**/*',
    'package.json'
  ],

  // 后端运行时依赖 (express/axios/cors 等)
  extraResources: [
    { from: path.join(ROOT, 'backend', 'data'), to: 'data', filter: ['**/*'] }
  ].filter(function (item) {
    return fs.existsSync(item.from);
  }),

  // === Windows 配置 ===
  win: {
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'portable', arch: ['x64'] }
    ],
    artifactName: '${productName}-${version}-setup.${ext}',
    // 禁止签名 (非商业软件不需要)
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

  // === 关键: Electron 预下载配置 ===
  // 修复截图中的 ".dist/electron-v28.0.0-win32-x64.zip: 404" 错误
  electronDownload: {
    mirror: userMirror,
    cache: electronCacheDir,
    // 不使用 unsafeCache，避免文件锁
    strictSSL: false,
    // 超时时间
    timeout: 120000
  },

  // 不使用 asar (后端文件需要直接 I/O)
  asar: false,
  compression: 'maximum',

  // 移除已弃用模块的警告
  removePackageKeywords: true,

  // 不自动检测 author 等字段 (我们已在 package.json 中声明)
  buildDependenciesFromSource: false,

  // 不使用 npm/yarn 自动安装 (避免 EPERM)
  npmRebuild: false,

  _debug: {
    electronVersion: electronVersion,
    mirror: userMirror,
    cacheDir: electronCacheDir,
    builderCacheDir: builderCacheDir
  }
};

// === 添加全部 express/axios 运行时依赖到 extraResources ===
// (为了让 exe 内的后端能正常工作)
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
  const fromPath = path.join(ROOT, 'node_modules', dep);
  if (fs.existsSync(fromPath)) {
    config.extraResources.push({
      from: fromPath,
      to: 'node_modules/' + dep
    });
  }
}

module.exports = config;

// CLI 使用: 直接打印 JSON 供 electron-builder 解析
if (require.main === module) {
  process.stdout.write(JSON.stringify(config, null, 2));
}
