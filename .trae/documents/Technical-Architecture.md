# 灵墨小说工坊 技術架構文檔

## 1. 架構設計

```
┌─────────────────────────────────────────────────────────────┐
│                      Electron 桌面端                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   Vue3 前端應用                       │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │   │
│  │  │  項目管理  │  │  AI創作   │  │ 素材與生成中心   │   │   │
│  │  │   頁面    │  │   頁面    │  │      頁面       │   │   │
│  │  └────┬─────┘  └────┬─────┘  └────────┬─────────┘   │   │
│  │       └────────────┬┴────────────────┘              │   │
│  │              ┌──────▼──────┐                         │   │
│  │              │   Vue Router  │                        │   │
│  │              └──────┬──────┘                         │   │
│  │                     │                                 │   │
│  │              ┌──────▼──────┐                         │   │
│  │              │   Pinia    │                         │   │
│  │              │   狀態管理   │                         │   │
│  │              └──────┬──────┘                         │   │
│  └─────────────────────┼───────────────────────────────┘   │
│                         │ IPC 通信                          │
│  ┌─────────────────────▼───────────────────────────────┐   │
│  │                 Express 後端 API                      │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────────┐   │   │
│  │  │  項目接口   │ │  素材接口   │ │   AI 生成接口   │   │   │
│  │  │ /projects  │ │ /materials │ │ /generate     │   │   │
│  │  └─────┬──────┘ └─────┬──────┘ └───────┬────────┘   │   │
│  │        └───────────────┼───────────────┘             │   │
│  │                 ┌──────▼──────┐                       │   │
│  │                 │   Service   │                      │   │
│  │                 │    層       │                       │   │
│  │                 └──────┬──────┘                       │   │
│  │                        │                              │   │
│  │                 ┌──────▼──────┐                       │   │
│  │                 │ Repository  │                      │   │
│  │                 │    層       │                       │   │
│  │                 └──────┬──────┘                       │   │
│  └─────────────────────────┼─────────────────────────────┘   │
│                            │                               │
│                     ┌──────▼──────┐                        │
│                     │  JSON 文件   │                        │
│                     │    存儲      │                        │
│                     └─────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

## 2. 技術棧詳情

| 層面 | 技術 | 版本 |
|------|------|------|
| 前端框架 | Vue3 (Composition API) | ^3.4.0 |
| 構建工具 | Vite | ^5.0.0 |
| 開發語言 | TypeScript | ^5.3.0 |
| 樣式框架 | TailwindCSS | ^3.4.0 |
| 狀態管理 | Pinia | ^2.1.0 |
| 桌面端 | Electron | ^28.0.0 |
| 後端框架 | Express | ^4.18.0 |
| 後端語言 | Node.js + TypeScript | ^20.0.0 |
| 數據存儲 | 本地 JSON 文件 | - |
| AI 接口 | OpenAI API 兼容格式 | - |
| 圖標庫 | Lucide Vue | ^0.300.0 |

## 3. 目錄結構

```
lingmo-novel-workshop/
├── electron/                     # Electron 主進程
│   ├── main.ts                   # 主進程入口
│   ├── preload.ts                # 預加載腳本
│   └── ipc/                      # IPC 通信處理
├── src/                         # Vue 前端源碼
│   ├── assets/                   # 靜態資源
│   ├── components/               # 公共組件
│   │   ├── common/              # 通用組件
│   │   ├── layout/              # 佈局組件
│   │   └── material/            # 素材相關組件
│   ├── composables/              # Vue Composables
│   ├── pages/                    # 頁面組件
│   │   ├── Home.vue             # 首頁/項目列表
│   │   ├── ProjectDetail.vue    # 項目詳情
│   │   ├── Creation.vue         # AI創作頁
│   │   ├── MaterialCenter.vue    # 素材與生成中心
│   │   └── Settings.vue         # 設置頁
│   ├── router/                   # 路由配置
│   ├── stores/                   # Pinia 狀態管理
│   ├── types/                    # TypeScript 類型定義
│   ├── utils/                    # 工具函數
│   ├── App.vue                   # 根組件
│   └── main.ts                   # 前端入口
├── api/                         # Express 後端源碼
│   ├── controllers/             # 控制器
│   │   ├── projectController.ts
│   │   ├── materialController.ts
│   │   ├── generatorController.ts
│   │   └── aiController.ts
│   ├── services/                 # 業務邏輯層
│   │   ├── projectService.ts
│   │   ├── materialService.ts
│   │   ├── generatorService.ts
│   │   └── aiService.ts
│   ├── repositories/             # 數據訪問層
│   │   └── jsonRepository.ts
│   ├── routes/                   # 路由定義
│   │   └── index.ts
│   ├── middleware/               # 中間件
│   └── index.ts                 # 後端入口
├── data/                        # JSON 數據存儲目錄
│   ├── projects.json            # 項目表
│   ├── materials.json           # 公共素材庫
│   ├── generators.json          # 生成器配置
│   ├── templates.json           # 爆文模板
│   └── settings.json            # 用戶設置
├── package.json
├── vite.config.ts
├── electron-builder.json
└── tsconfig.json
```

## 4. 數據模型

### 4.1 項目表 (projects.json)
```typescript
interface Project {
  id: string;                    // 項目唯一ID
  name: string;                  // 項目名稱
  description?: string;          // 項目描述
  outline?: Outline;             // 大綱內容
  createdAt: string;             // 創建時間
  updatedAt: string;              // 更新時間
}

interface Outline {
  title: string;                 // 大綱標題
  summary?: string;              // 故事簡介
  volumes: Volume[];             // 分卷列表
}

interface Volume {
  id: string;
  name: string;                  // 分卷名稱
  chapters: Chapter[];          // 章節列表
}

interface Chapter {
  id: string;
  title: string;                 // 章節標題
  content?: string;              // 章節內容
  status: 'draft' | 'complete'; // 章節狀態
}
```

### 4.2 素材表 (materials.json)
```typescript
interface Material {
  id: string;                    // 素材唯一ID
  project_id: string | null;    // 所屬項目ID，null 表示公共素材
  category: MaterialCategory;   // 素材分類
  name: string;                  // 素材名稱
  content: string;               // 素材內容
  tags?: string[];               // 標籤
  createdAt: string;
  updatedAt: string;
}

type MaterialCategory = 
  | 'world'      // 世界觀
  | 'character'  // 人物
  | 'faction'    // 勢力
  | 'scene'      // 場景
  | 'technique'  // 功法
  | 'plot'       // 劇情
  | 'other';     // 其他
```

### 4.3 生成器配置 (generators.json)
```typescript
interface Generator {
  id: string;                    // 生成器ID
  name: string;                  // 生成器名稱
  category: GeneratorCategory;   // 生成器分類
  description: string;           // 功能描述
  systemPrompt: string;          // 系統提示詞模板
  userPromptTemplate: string;    // 用戶提示詞模板
  parameters?: GeneratorParams;  // 生成參數
  isCustom: boolean;             // 是否為用戶自定義
  project_id?: string;           // 自定義生成器所屬項目
}

type GeneratorCategory =
  | 'world'        // 世界觀設定類
  | 'character'    // 人物角色類
  | 'plot'         // 劇情橋段類
  | 'copywriting'  // 文案包裝類
  | 'tool';        // 輔助工具類
```

## 5. API 接口定義

### 5.1 項目接口
| 方法 | 路徑 | 描述 |
|------|------|------|
| GET | /api/projects | 獲取所有項目列表 |
| POST | /api/projects | 創建新項目 |
| GET | /api/projects/:id | 獲取項目詳情 |
| PUT | /api/projects/:id | 更新項目 |
| DELETE | /api/projects/:id | 刪除項目 |
| POST | /api/projects/:id/import-outline | 導入大綱（自動建項+拆分素材） |

### 5.2 素材接口
| 方法 | 路徑 | 描述 |
|------|------|------|
| GET | /api/materials | 獲取素材列表（支持 project_id 篩選） |
| POST | /api/materials | 創建素材 |
| PUT | /api/materials/:id | 更新素材 |
| DELETE | /api/materials/:id | 刪除素材 |
| GET | /api/materials/public | 獲取全局公共素材 |
| GET | /api/materials/project/:projectId | 獲取項目私有素材 |

### 5.3 AI 生成接口
| 方法 | 路徑 | 描述 |
|------|------|------|
| POST | /api/generate | 通用 AI 生成 |
| POST | /api/generate/chapter | 生成章節內容 |
| POST | /api/generate/material | 素材聯動生成 |
| POST | /api/outline/complete | 殘缺大綱補全 |
| POST | /api/outline/merge | 多大纲合成 |

### 5.4 生成器接口
| 方法 | 路徑 | 描述 |
|------|------|------|
| GET | /api/generators | 獲取所有生成器配置 |
| POST | /api/generators | 創建自定義生成器 |
| PUT | /api/generators/:id | 更新自定義生成器 |
| DELETE | /api/generators/:id | 刪除自定義生成器 |

### 5.5 模板接口
| 方法 | 路徑 | 描述 |
|------|------|------|
| GET | /api/templates | 獲取爆文模板列表 |
| POST | /api/templates/sync | 聯網同步模板 |
| GET | /api/templates/:id | 獲取模板詳情 |

## 6. Electron 配置

### 6.1 主進程職責
- 管理窗口生命周期
- 處理 IPC 通信
- 調用系統級 API（文件系統、對話框等）
- 打包為桌面應用

### 6.2 預加載腳本職責
- 暴露安全的 IPC 方法到渲染進程
- 隔離前後端通信

### 6.3 窗口配置
```typescript
{
  width: 1400,
  height: 900,
  minWidth: 1200,
  minHeight: 700,
  title: '灵墨小说工坊',
  webPreferences: {
    preload: 'electron/preload.ts',
    contextIsolation: true,
    nodeIntegration: false
  }
}
```

## 7. 打包配置

### 7.1 electron-builder 配置
```json
{
  "appId": "com.lingmo.novel-workshop",
  "productName": "灵墨小说工坊",
  "directories": {
    "output": "release"
  },
  "win": {
    "target": [
      {
        "target": "nsis",
        "arch": ["x64"]
      },
      {
        "target": "portable",
        "arch": ["x64"]
      }
    ]
  }
}
```

## 8. 環境變量

| 變量名 | 描述 | 默認值 |
|--------|------|--------|
| NODE_ENV | 運行環境 | development |
| PORT | 後端服務端口 | 3001 |
| DATA_DIR | 數據存儲目錄 | ./data |
| AI_API_URL | AI 接口地址 | - |
| AI_API_KEY | AI 接口密鑰 | - |
