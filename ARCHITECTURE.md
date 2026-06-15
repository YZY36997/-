# 灵墨小说工坊 · 整体架构说明

## 一、技术栈

| 层级         | 技术                            | 说明                              |
|-------------|---------------------------------|---------------------------------|
| 桌面容器     | Electron 30+                    | 主进程 / 渲染进程 / preload       |
| 前端框架     | Vue 3 + TypeScript + Vite 5     | 脚本 setup，按需引入 Element Plus |
| 状态管理     | Pinia                           | 全局状态：ui / project / ai      |
| 样式         | SCSS + Element Plus + 双主题 CSS | 深色水墨科技 / 浅色简约           |
| 本地数据库   | better-sqlite3 (同步 API)       | 全作品/设定/提示词统一本地持久化 |
| 大模型接口   | fetch 统一适配 OpenAI 兼容协议   | DeepSeek / 通义 / 小米 / 自定义  |
| 打包         | electron-builder                | NSIS 安装包 + 绿色免安装         |

## 二、目录结构（分层架构）

```
lingmo-novel-workshop/
├── package.json              # 根依赖 + 脚本
├── electron-builder.json     # 打包配置（win x64）
├── vite.config.ts            # 渲染进程构建
├── tsconfig.json
├── electron/                 # Electron 主进程（Node.js）
│   ├── main.ts               # 窗口、菜单、生命周期
│   ├── preload.ts            # 安全暴露 IPC API 给前端
│   ├── db/
│   │   ├── index.ts          # SQLite 初始化 / 连接池
│   │   ├── schema.sql        # 建表 DDL
│   │   └── seed.ts           # 初始模板数据（世界观、模板）
│   ├── services/
│   │   ├── project.service.ts
│   │   ├── chapter.service.ts
│   │   ├── character.service.ts
│   │   ├── faction.service.ts
│   │   ├── artifact.service.ts
│   │   ├── foreshadow.service.ts
│   │   ├── outline.service.ts
│   │   ├── prompt.service.ts
│   │   ├── ai.service.ts
│   │   ├── rag.service.ts
│   │   ├── analysis.service.ts
│   │   └── settings.service.ts
│   └── ipc/
│       └── channels.ts       # IPC 通道常量 + 路由
├── src/                      # 渲染进程（Vue）
│   ├── main.ts
│   ├── App.vue
│   ├── assets/styles/
│   │   ├── themes/dark.scss  # 水墨科技深色主题
│   │   ├── themes/light.scss # 浅色简约主题
│   │   ├── components.scss   # 统一组件样式
│   │   └── layout.scss       # 全局布局规范（四栏）
│   ├── router/index.ts
│   ├── stores/
│   │   ├── ui.store.ts       # UI 状态（主题、折叠、当前路由）
│   │   ├── project.store.ts  # 当前作品 + 章节列表
│   │   ├── ai.store.ts       # AI 配置、提示词、模型
│   │   └── settings.store.ts # 软件设置
│   ├── components/
│   │   ├── AppHeader.vue     # 顶部导航栏
│   │   ├── AppSidebar.vue    # 左侧功能树
│   │   ├── AiPanel.vue       # 右侧 AI 辅助面板
│   │   ├── ProjectCard.vue   # 作品卡片
│   │   ├── ChapterTree.vue   # 卷-章-小节三级目录
│   │   ├── NovelEditor.vue   # 高性能文本编辑器
│   │   ├── GraphCanvas.vue   # SVG 关系图谱
│   │   └── PromptChip.vue    # 提示词标签
│   ├── views/
│   │   ├── HomeView.vue            # 作品管理中心
│   │   ├── EditorView.vue          # 正文创作页
│   │   ├── HubView.vue             # 设定中枢（5 个子页）
│   │   ├── CharactersView.vue      # 角色卡片库
│   │   ├── GraphView.vue           # 角色关系图谱
│   │   ├── OutlineView.vue         # 大纲创作系统
│   │   ├── PolishView.vue          # 润色工坊
│   │   ├── PromptsView.vue         # 提示词管理
│   │   ├── AiConfigView.vue        # AI 接口配置
│   │   ├── RagView.vue             # RAG 三级检索
│   │   ├── AnalysisView.vue        # 追读力分析
│   │   └── SettingsView.vue        # 软件设置 / 回收站
│   └── api/
│       └── lingmo.ts         # 封装 preload 暴露的 IPC API
└── scripts/
    ├── dev.bat               # 开发启动
    ├── build.bat             # 打包
    └── doctor.bat            # 环境校验
```

## 三、前后端通信（IPC）

| 方向         | 通道名 |
|-------------|--------|
| 渲染→主进程    | `lingmo:invoke`   |
| 主进程→渲染    | `lingmo:event`    |

所有业务操作通过统一 `invoke(channel, payload)` 调用，返回 Promise。错误统一通过全局 `onError` 事件抛出。

## 四、数据库设计要点（详见 `electron/db/schema.sql`）

- `projects` 作品
- `volumes` / `chapters` / `chapter_contents` 卷-章-内容历史
- `characters` 角色 + `character_relations` 关系边（图谱）
- `factions` 势力 + `faction_relations` 势力关系
- `artifacts` 物品库（法宝/丹药/功法/道具/信物）
- `foreshadowings` 伏笔追踪（未埋设/已埋设/已回收）
- `worldview` 世界观（time_line / geography / terminology / power_levels）
- `project_settings` 项目总设定（卖点/冲突/钩子/受众/禁忌/文风）
- `outlines` 大纲（项目 → 卷 → 大章 → 小节，递归 lft/rgt 树）
- `prompt_groups` / `prompts` 分组提示词
- `ai_models` 模型配置（多 API Key）
- `rag_vectors` 向量片段（供 L2 检索，失败时走 L3 BM25）
- `settings` 软件全局设置（主题/默认模型/存档策略）
- `recycle_bin` 软删除记录

## 五、核心模块能力

| 模块          | 能力                                                                |
|--------------|----------------------------------------------------------------------|
| 编辑器        | `contenteditable` 富文本 + Markdown 纯文本切换；实时本地存档；历史版本回溯 |
| AI 助手面板   | 续写/重写/润色/对话场景生成；错别字；OOC 检测；伏笔提醒；自定义指令    |
| 关系图谱      | SVG 画布，节点拖拽、滚轮缩放、颜色按关系类型；数据双向同步角色卡        |
| 设定中枢      | 5 个子 Tab：总设定 / 世界观 / 势力 / 物品 / 伏笔                        |
| RAG 三级记忆  | L1 上下文；L2 图谱+向量；L3 BM25 全文兜底；白名单/黑名单过滤段          |
| 追读力分析    | Hook 强度、爽点密度、伏笔回收率、OOC 位置；ECharts 可视化               |
| 润色工坊      | 双栏对比；模板：去 AI 化 / 镜头描写 / 情绪 / 古风 / 爽文 / 精简        |

## 六、主题系统

两套主题采用 CSS Variables 实现，切换根节点 `data-theme` 即可。

```
--color-bg       背景
--color-surface  卡片/面板
--color-primary  主色（青蓝渐变）
--color-accent   辅助色
--color-text     正文
--color-muted    次要
--border-color   边框
```

组件库统一使用 `var(--color-*)` 而非硬编码，保证全局一致。

## 七、二次开发扩展点

1. `electron/services/*.service.ts` — 业务服务，模块化可替换
2. `electron/db/schema.sql` — 数据表通过 `migrate_versions` 支持增量升级
3. `src/views/*` — 页面即 Vue SFC，可独立开发
4. `src/api/lingmo.ts` — IPC 封装，对接 `window.lingmo.*`
5. `prompts` 与 `ai_models` 表保留 `extra` JSON 字段，支持插件字段
