# 灵墨小说工坊 v3.5 技术架构文档

## 1. 项目概述

### 项目名称
灵墨小说工坊 (Lingmo Novel Workshop)

### 项目类型
跨平台桌面应用程序 (Electron)

### 核心功能
AI智能小说创作工具，提供项目化素材管理、AI生成器、创作页全链路打通

### 目标平台
- Windows 10/11 (EXE)
- 浏览器模式 (开发/演示用)

---

## 2. 技术栈详解

| 层级 | 技术选型 | 版本 |
|------|----------|------|
| 桌面框架 | Electron | 28.0.0 |
| 前端框架 | Vue3 | 3.4+ |
| 构建工具 | Vite | 5.0+ |
| UI组件库 | Element Plus | 2.5+ |
| 状态管理 | Pinia | 2.1+ |
| 前端路由 | Vue Router | 4.2+ |
| 后端框架 | Express | 4.18+ |
| 本地存储 | JSON文件 | - |
| AI接入 | OpenAI兼容API / Ollama | - |
| 打包工具 | electron-builder | 24.9+ |

---

## 3. 目录结构

```
lingmo-novel-studio/
├── electron/
│   ├── main.js                 # Electron主进程
│   ├── preload.js              # 预加载脚本
│   └── window.js               # 窗口管理
├── backend/
│   ├── app.js                  # Express应用入口
│   ├── router/
│   │   ├── index.js            # 路由汇总
│   │   ├── projects.js         # 项目管理路由
│   │   ├── materials.js        # 素材管理路由
│   │   ├── generator.js        # AI生成器路由
│   │   ├── outline.js          # 大纲处理路由
│   │   └── templates.js        # 爆文模板路由
│   ├── service/
│   │   ├── projectService.js   # 项目服务
│   │   ├── materialService.js  # 素材服务
│   │   ├── generatorService.js # 生成器服务
│   │   ├── aiService.js        # AI调用服务
│   │   └── templateService.js  # 模板服务
│   └── data/                   # JSON数据存储
│       ├── projects.json       # 项目表
│       ├── materials.json      # 全局素材库
│       ├── generators.json     # 生成器配置
│       ├── templates.json      # 爆文模板
│       └── settings.json       # 系统设置
├── src/
│   ├── main.js                 # Vue入口
│   ├── App.vue                 # 根组件
│   ├── router/
│   │   └── index.js            # 路由配置
│   ├── stores/
│   │   ├── project.js          # 项目状态
│   │   ├── material.js         # 素材状态
│   │   └── generator.js         # 生成器状态
│   ├── views/
│   │   ├── MainLayout.vue      # 主布局
│   │   ├── HomePage.vue        # 首页
│   │   ├── ProjectList.vue     # 项目列表
│   │   ├── MaterialCenter.vue  # 素材与生成中心
│   │   ├── CreationPage.vue    # AI创作页
│   │   └── TemplateLibrary.vue  # 爆文模板库
│   ├── components/
│   │   ├── common/             # 通用组件
│   │   ├── project/            # 项目相关组件
│   │   ├── material/           # 素材相关组件
│   │   ├── generator/          # 生成器组件
│   │   └── creation/           # 创作页组件
│   └── assets/
│       ├── styles/
│       │   ├── variables.scss  # CSS变量
│       │   └── main.scss       # 全局样式
│       └── images/
├── public/
├── scripts/
│   ├── dev.bat                 # 一键启动开发
│   ├── build.bat               # 一键打包
│   └── pack.bat                # Electron打包
├── package.json
├── vite.config.js
├── electron-builder.yml
└── README.md
```

---

## 4. 数据模型设计

### 4.1 项目表 (projects.json)

```json
{
  "projects": [
    {
      "id": "proj_xxxxx",
      "name": "小说项目名称",
      "description": "项目描述",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "outline": {
        "title": "大纲标题",
        "summary": "大纲简介",
        "chapters": []
      },
      "settings": {
        "genre": "玄幻",
        "style": "爽文风"
      }
    }
  ]
}
```

### 4.2 素材表 (materials.json)

```json
{
  "materials": [
    {
      "id": "mat_xxxxx",
      "project_id": "proj_xxxxx",
      "category": "worldview|character|scene|plot|setting",
      "subCategory": "流派/宗门/功法等",
      "name": "素材名称",
      "content": "素材内容",
      "tags": ["标签1", "标签2"],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

**说明：**
- `project_id = null` 时为全局公共素材
- `project_id` 有值时为该项目私有素材

### 4.3 生成器配置 (generators.json)

```json
{
  "generators": [
    {
      "id": "gen_xxxxx",
      "category": "worldview|character|plot| copywriting|tool",
      "name": "生成器名称",
      "description": "生成器描述",
      "systemPrompt": "系统提示词模板",
      "userPromptTemplate": "用户输入模板",
      "defaultParams": {
        "temperature": 0.7,
        "maxTokens": 2000
      },
      "isCustom": false,
      "project_id": null,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### 4.4 爆文模板 (templates.json)

```json
{
  "templates": [
    {
      "id": "tpl_xxxxx",
      "genre": "玄幻|仙侠|都市|古言|现言",
      "function": "开局|反转|高潮|收尾",
      "title": "模板标题",
      "content": "模板内容",
      "source": "来源",
      "cachedAt": "2024-01-01T00:00:00.000Z",
      "isFavorite": false
    }
  ]
}
```

---

## 5. 核心API接口设计

### 5.1 项目管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/projects | 获取所有项目 |
| POST | /api/projects | 创建新项目 |
| GET | /api/projects/:id | 获取项目详情 |
| PUT | /api/projects/:id | 更新项目 |
| DELETE | /api/projects/:id | 删除项目 |

### 5.2 素材管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/materials | 获取素材列表 |
| POST | /api/materials | 创建素材 |
| GET | /api/materials/:id | 获取素材详情 |
| PUT | /api/materials/:id | 更新素材 |
| DELETE | /api/materials/:id | 删除素材 |
| GET | /api/materials/project/:projectId | 获取项目私有素材 |
| GET | /api/materials/global | 获取全局素材 |

### 5.3 AI生成器

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/generators | 获取生成器列表 |
| POST | /api/generators | 创建自定义生成器 |
| POST | /api/generators/generate | 执行生成 |
| GET | /api/generators/categories | 获取分类 |

### 5.4 大纲处理

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/outline/import | 导入大纲 |
| POST | /api/outline/complete | 补全残缺大纲 |
| POST | /api/outline/merge | 合成多份大纲 |
| POST | /api/outline/split | 拆分大纲为素材 |

### 5.5 爆文模板

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/templates | 获取模板列表 |
| POST | /api/templates/update | 联网更新模板 |
| POST | /api/templates/favorite | 收藏模板 |

---

## 6. 关键模块实现方案

### 6.1 项目化素材隔离

**后端实现：**
- 素材查询时增加 `project_id` 过滤条件
- 全局素材查询 `project_id = null`
- 项目素材查询 `project_id = projectId`
- 导入大纲时自动创建项目并绑定素材

**前端实现：**
- Pinia store 维护当前项目ID
- 素材面板支持切换"全局/项目"视图
- 左侧项目树形导航

### 6.2 AI创作页素材联动

**后端实现：**
- 生成接口增加 `with_project_material` 参数
- 当参数为true时，自动查询项目人设、世界观素材
- 拼接素材内容到 system prompt

**前端实现：**
- 右侧常驻素材抽屉组件
- 一键插入/注入功能
- 生成结果右键保存为素材

### 6.3 三模块融合

**前端实现：**
- 统一布局：左侧导航 + 中间列表 + 右侧详情
- 共用素材列表组件
- 生成面板可内嵌到详情区域
- 双向联动逻辑：素材→生成器、生成结果→素材

### 6.4 生成器精细化

**配置化实现：**
- generators.json 存储所有生成器配置
- 前端动态渲染分类Tab
- 自定义生成器存项目私有目录

### 6.5 残缺大纲补全/合成

**后端实现：**
- `outline/complete` 接口：调用AI补全
- `outline/merge` 接口：调用AI合成
- 复用现有素材拆分逻辑归档结果

### 6.6 爆文模板联网更新

**后端实现：**
- 定时任务拉取远程模板
- 本地缓存 + 增量更新
- 离线优先策略

---

## 7. Electron 打包配置

```yaml
# electron-builder.yml
appId: com.lingmo.novel-studio
productName: 灵墨小说工坊
directories:
  output: release
win:
  target:
    - target: nsis
      arch:
        - x64
    - target: portable
      arch:
        - x64
  icon: public/icon.ico
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
```

---

## 8. 开发规范

### 代码规范
- 前端：Vue3 Composition API + `<script setup>`
- 后端：Express + async/await
- 命名：中文注释，英文变量命名

### Git规范
- 功能分支开发
- commit message 采用中文描述

### 测试规范
- 核心功能手动测试
- 打包后EXE功能验证

---

## 9. 依赖清单

### 前端依赖
```json
{
  "vue": "^3.4.0",
  "vue-router": "^4.2.0",
  "pinia": "^2.1.0",
  "element-plus": "^2.5.0",
  "@element-plus/icons-vue": "^2.3.0",
  "axios": "^1.6.0",
  "sass": "^1.69.0"
}
```

### 后端依赖
```json
{
  "express": "^4.18.0",
  "cors": "^2.8.5",
  "body-parser": "^1.20.0",
  "axios": "^1.6.0",
  "node-schedule": "^2.1.0",
  "uuid": "^9.0.0"
}
```

### 开发依赖
```json
{
  "vite": "^5.0.0",
  "@vitejs/plugin-vue": "^5.0.0",
  "electron": "^28.0.0",
  "electron-builder": "^24.9.0",
  "sass": "^1.69.0"
}
```

---

## 10. 文件清单

| 文件路径 | 说明 |
|---------|------|
| package.json | 项目依赖配置 |
| vite.config.js | Vite构建配置 |
| electron-builder.yml | Electron打包配置 |
| electron/main.js | Electron主进程 |
| electron/preload.js | 预加载脚本 |
| backend/app.js | Express应用入口 |
| backend/router/*.js | 路由文件 |
| backend/service/*.js | 业务服务 |
| backend/data/*.json | JSON数据存储 |
| src/main.js | Vue入口 |
| src/App.vue | 根组件 |
| src/router/index.js | 路由配置 |
| src/stores/*.js | Pinia状态管理 |
| src/views/*.vue | 页面组件 |
| src/components/**/*.vue | 组件 |
| scripts/dev.bat | 开发启动脚本 |
| scripts/build.bat | 构建脚本 |
| scripts/pack.bat | 打包脚本 |
