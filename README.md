# 灵墨小说工坊 · LingMo Novel Workshop

一款 **Windows 桌面端** 长篇网文创作辅助软件，基于 **Electron + Vue 3 + TypeScript + Element Plus + SQLite (better-sqlite3)** 开发。
全部作品数据本地存储，可对接主流大模型 API，并提供 RAG 长效记忆与追读力分析功能。

---

## 功能模块

- 作品中心：多作品管理、快速模板（玄幻 / 仙侠 / 都市 / 灵异 / 科幻）、回收站。
- 正文创作：卷 → 章 → 小节树状目录、章节字数统计、自动存档。
- 设定中枢：项目总设定 / 世界观 / 势力 / 功法 / 伏笔追踪库。
- 角色管理：角色卡片（外貌、性格、能力、弱点、人际关系、首次登场章节）。
- 人物关系图谱：可拖拽节点、滚轮缩放、不同颜色区分亲密 / 敌对 / 从属等。
- 大纲创作：层级大纲 + 爽点 / 情绪节奏标签 + AI 生成大纲。
- 润色工坊：双栏对比，去 AI 话术 / 沉浸式镜头 / 情绪强化 / 仙侠古风等模板。
- 提示词库：分组管理、按作品绑定、支持新增/编辑/删除。
- AI 接口配置：多模型 / 多供应商 / 温度 / 最大 token / 连通测试。
- RAG 长效记忆：L1（简易） / L2（知识图谱+向量） / L3（兜底关键词）三级检索 + 记忆白名单。
- 追读力分析：钩子强度、爽点密度、伏笔回收进度。

---

## 目录结构

```
/
├── electron/                 # Electron 主进程 & Node 后端
│   ├── db/
│   │   ├── schema.sql        # 数据库表结构
│   │   └── db.js             # 数据库连接 & 初始化 & 种子
│   ├── services.js           # 全部业务服务（作品/章节/角色/大纲/AI/RAG/分析）
│   ├── main.js               # 主进程入口（创建窗口 + IPC 路由）
│   ├── preload.js            # 预加载脚本（暴露 window.lingmo）
│   ├── package.json
│   └── tsconfig.json
├── src/                      # Vue 3 前端
│   ├── api/lingmo.ts         # 前端 IPC 调用封装
│   ├── assets/styles/        # 全局样式 / 双主题
│   ├── components/           # 通用组件（Header、Sidebar、章节树、编辑器、AI 面板等）
│   ├── stores/ui.ts          # Pinia 全局状态（主题、当前作品）
│   ├── router/index.ts       # 路由
│   ├── views/                # 页面（Home、Editor、Hub、Characters、Graph、Outline、Polish、Prompts、AiConfig、Rag、Analysis、Settings）
│   ├── App.vue
│   └── main.ts
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## 构建与运行

### 1. 构建前端

```bash
# 在项目根目录
npm install
npm run build
# 输出：/dist（前端打包产物）
```

### 2. 启动 Electron 桌面端

```bash
cd electron
npm install        # 安装 electron / better-sqlite3
npm start          # 启动桌面程序
```

### 3. 打包绿色免安装版 / 标准安装包（Windows）

```bash
cd electron
npm run pack
# 将在 /dist 下生成 win-x64 产物
```

> 注：`electron/package.json` 中的 `electron-builder` 已包含 `win` 配置。如需要自定义安装包，请参考 [electron-builder 配置文档](https://www.electron.build/)。

---

## 开发调试

1. 前端开发：`npm install && npm run dev`，浏览器打开 `http://localhost:5173`。
2. Electron 调试：
   - 先执行 `npm run build` 打包前端；
   - 再执行 `cd electron && npm install && npm start`；
   - 主进程与渲染进程分别有独立控制台。

---

## 数据存储位置

- Windows：`%APPDATA%/lingmo-novel-workshop/lingmo-novel-workshop.db`
- 开发调试：Electron 的 `app.getPath('userData')` 目录下

所有作品、章节、角色、设定、提示词、AI 模型配置、RAG 检索偏好、追读力分析结果
全部保存于本地 SQLite 数据库中，可直接备份该 `.db` 文件迁移。

---

## AI 接口说明

程序调用 `/electron/services.js` 中的 `chatCompletion()`，基于默认模型的 `api_url + api_key`，
以标准 OpenAI 兼容协议发送请求。目前支持：

- **DeepSeek**（默认，`api.deepseek.com`）
- **OpenAI**、**通义千问**、**文心一言** 等提供 OpenAI 兼容接口的供应商
- **本地 Ollama**（`localhost:11434/v1`）

你可以在软件的 **「AI 接口配置」** 页面新增、切换或测试不同模型。

---

## 主题

- **深色**（水墨科技风，默认主推）
- **浅色**（清新简约）

切换按钮位于顶部导航右侧。

---

## 开源许可

MIT
