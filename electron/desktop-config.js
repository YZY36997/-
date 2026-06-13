/**
 * 灵墨小说工坊 - Electron Builder 配置
 *
 * 通过 Node.js 动态配置解决以下问题:
 * 1. Electron 下载镜像自动切换 (npmmirror 404 时回退到 GitHub)
 * 2. 文件包含规则 (express/cors/axios 等运行时依赖)
 * 3. 动态确定版本号和 Electron 版本
 *
 * 使用: 由 scripts/run-electron-builder.cjs 加载
 */

'use strict';

const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');

// 读取 package.json 中的版本和依赖
let pkg = {};
try {
  pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
} catch (e) {
  console.warn('  [desktop-config] 无法读取 package.json:', e.message);
}

// 确定 electron 版本 (从 devDependencies 读取，确保与实际安装一致)
const electronVersion = (pkg.devDependencies && pkg.devDependencies.electron)
  || process.env.ELECTRON_VERSION
  || '28.2.5';

// 镜像列表 - 按顺序尝试，遇到 404 自动回退到下一个
const mirrorOptions = [
  'https://npmmirror.com/mirrors/electron/',
  'https://registry.npmmirror.com/-/binary/electron/',
  'https://cdn.npmmirror.com/binaries/electron/',
  'https://github.com/electron/electron/releases/download/',
  'https://mirrors.huaweicloud.com/electron/'
];

const mirror = process.env.ELECTRON_MIRROR || mirrorOptions[0];

module.exports = {
  appId: 'com.lingmo.novel-studio',
  productName: '灵墨小说工坊',
  productFilename: '灵墨小说工坊',
  copyright: 'Copyright © 2024 LingMo Studio',
  electronVersion: electronVersion,

  directories: {
    output: path.join(ROOT, 'release'),
    buildResources: path.join(ROOT, 'build')
  },

  // 主进程入口
  files: [
    'dist/**/*',
    'electron/**/*',
    'package.json'
  ],

  // 后端运行时依赖 (这些需要被包含进 exe 才能运行)
  // 使用 asar:false 简化，避免 asar 内 require 解析问题
  extraResources: [
    {
      from: path.join(ROOT, 'backend', 'data'),
      to: 'data',
      filter: ['**/*']
    },
    {
      from: path.join(ROOT, 'node_modules', 'axios'),
      to: 'node_modules/axios',
      filter: ['**/*.js', '**/*.json', '**/*.md']
    },
    {
      from: path.join(ROOT, 'node_modules', 'express'),
      to: 'node_modules/express',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'cors'),
      to: 'node_modules/cors',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'body-parser'),
      to: 'node_modules/body-parser',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'follow-redirects'),
      to: 'node_modules/follow-redirects',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'proxy-from-env'),
      to: 'node_modules/proxy-from-env',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'qs'),
      to: 'node_modules/qs',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'cookie'),
      to: 'node_modules/cookie',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'debug'),
      to: 'node_modules/debug',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'ms'),
      to: 'node_modules/ms',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'mime'),
      to: 'node_modules/mime',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'mime-db'),
      to: 'node_modules/mime-db',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'mime-types'),
      to: 'node_modules/mime-types',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'http-errors'),
      to: 'node_modules/http-errors',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'depd'),
      to: 'node_modules/depd',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'setprototypeof'),
      to: 'node_modules/setprototypeof',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'statuses'),
      to: 'node_modules/statuses',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'inherits'),
      to: 'node_modules/inherits',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'toidentifier'),
      to: 'node_modules/toidentifier',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'on-finished'),
      to: 'node_modules/on-finished',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'ee-first'),
      to: 'node_modules/ee-first',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'vary'),
      to: 'node_modules/vary',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'fresh'),
      to: 'node_modules/fresh',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'range-parser'),
      to: 'node_modules/range-parser',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'negotiator'),
      to: 'node_modules/negotiator',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'safe-buffer'),
      to: 'node_modules/safe-buffer',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'safer-buffer'),
      to: 'node_modules/safer-buffer',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'iconv-lite'),
      to: 'node_modules/iconv-lite',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'send'),
      to: 'node_modules/send',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'serve-static'),
      to: 'node_modules/serve-static',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'encodeurl'),
      to: 'node_modules/encodeurl',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'escape-html'),
      to: 'node_modules/escape-html',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'finalhandler'),
      to: 'node_modules/finalhandler',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'parseurl'),
      to: 'node_modules/parseurl',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'path-to-regexp'),
      to: 'node_modules/path-to-regexp',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'merge-descriptors'),
      to: 'node_modules/merge-descriptors',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'methods'),
      to: 'node_modules/methods',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'utils-merge'),
      to: 'node_modules/utils-merge',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'etag'),
      to: 'node_modules/etag',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'unpipe'),
      to: 'node_modules/unpipe',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'proxy-addr'),
      to: 'node_modules/proxy-addr',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'forwarded'),
      to: 'node_modules/forwarded',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'ipaddr.js'),
      to: 'node_modules/ipaddr.js',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'type-is'),
      to: 'node_modules/type-is',
      filter: ['**/*.js', '**/*.json']
    },
    {
      from: path.join(ROOT, 'node_modules', 'media-typer'),
      to: 'node_modules/media-typer',
      filter: ['**/*.js', '**/*.json']
    }
  ].filter(function (item) {
    // 自动过滤不存在的目录，避免 electron-builder 警告
    if (item.from && typeof item.from === 'string') {
      return fs.existsSync(item.from);
    }
    return true;
  }),

  // Windows 打包配置
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64']
      },
      {
        target: 'portable',
        arch: ['x64']
      }
    ],
    artifactName: '${productName}-${version}-setup.${ext}'
  },

  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: '灵墨小说工坊',
    runAfterFinish: true
  },

  portable: {
    artifactName: '${productName}-${version}-portable.${ext}'
  },

  // Electron 预下载配置 (镜像列表，run-electron-builder.cjs 会处理回退)
  electronDownload: {
    mirror: mirror,
    cacheRoot: path.join(require('os').homedir(), '.cache', 'electron')
  },

  // 不使用 asar，简化调试和后端文件 I/O
  asar: false,
  asarUnpack: [],

  // 压缩等级
  compression: 'maximum',

  // 移除代码签名警告 (非商业软件不需要)
  signAndEditExecutable: false,

  // 镜像列表，供外部脚本使用
  _mirrorOptions: mirrorOptions,
  _electronVersion: electronVersion
};
