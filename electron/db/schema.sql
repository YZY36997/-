-- =====================================================================
-- 灵墨小说工坊 · 本地 SQLite 建表脚本
-- 所有作品 / 章节 / 设定 / 提示词 / AI 配置 统一本地持久化
-- =====================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- ---------------------------------------------------------------------
-- 1. 版本管理（支持增量升级，二次开发可在此追加 migration）
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    applied_at  TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 2. 软件全局设置
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
    key          TEXT PRIMARY KEY,
    value        TEXT,                  -- JSON 字符串
    updated_at   TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 3. 作品
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,                     -- 作品名
    genre           TEXT DEFAULT '玄幻',               -- 题材：玄幻/仙侠/都市/科幻/悬疑/言情/历史/其他
    cover_data      TEXT,                              -- base64 封面
    description     TEXT,                              -- 简介
    status          TEXT DEFAULT 'draft',              -- draft / serializing / finished
    word_count      INTEGER DEFAULT 0,
    progress        INTEGER DEFAULT 0,                -- 0~100 创作进度
    ai_level        INTEGER DEFAULT 2,                -- 1 L1 / 2 L2 / 3 L3
    default_style   TEXT,                              -- 默认文风提示
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT DEFAULT CURRENT_TIMESTAMP,
    deleted         INTEGER DEFAULT 0                 -- 软删除
);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_genre ON projects(genre);

-- ---------------------------------------------------------------------
-- 4. 项目总设定（卖点、冲突、钩子、受众、禁忌、文风）
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_settings (
    project_id   INTEGER PRIMARY KEY,
    core_sell    TEXT,                      -- 核心卖点
    core_conflict TEXT,                     -- 核心冲突
    opening_hook TEXT,                      -- 开篇钩子
    target_audience TEXT,                   -- 目标受众
    taboos       TEXT,                      -- 创作禁忌
    style        TEXT,                      -- 整体文风要求
    updated_at   TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 5. 世界观设定
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS worldviews (
    project_id    INTEGER PRIMARY KEY,
    base_rules    TEXT,                     -- 世界基础规则
    time_line     TEXT,                     -- 时间线
    geography     TEXT,                     -- 地域划分
    terminology   TEXT,                     -- 专属术语
    power_levels  TEXT,                     -- 力量等级体系
    extra         TEXT,                     -- JSON 扩展字段
    updated_at    TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 6. 卷 + 章节（三级目录：卷 → 章 → 小节）
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS volumes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL,
    title       TEXT NOT NULL,
    sort_order  INTEGER DEFAULT 0,
    summary     TEXT,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_volumes_project ON volumes(project_id);

CREATE TABLE IF NOT EXISTS chapters (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL,
    volume_id   INTEGER,
    parent_id   INTEGER,                      -- 支持小节
    title       TEXT NOT NULL,
    summary     TEXT,
    status      TEXT DEFAULT 'todo',          -- todo / draft / done
    word_count  INTEGER DEFAULT 0,
    sort_order  INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (volume_id) REFERENCES volumes(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_chapters_project ON chapters(project_id);
CREATE INDEX IF NOT EXISTS idx_chapters_volume ON chapters(volume_id);

CREATE TABLE IF NOT EXISTS chapter_contents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_id  INTEGER NOT NULL,
    content     TEXT,                          -- 正文（纯文本 / Markdown / HTML）
    version_tag TEXT,                          -- 版本标签（可选）
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chapter_contents_chapter ON chapter_contents(chapter_id);

-- ---------------------------------------------------------------------
-- 7. 角色
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS characters (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id   INTEGER NOT NULL,
    name         TEXT NOT NULL,
    role         TEXT DEFAULT 'supporting',    -- protagonist / main / supporting / extra
    avatar_data  TEXT,                         -- base64
    appearance   TEXT,                         -- 外貌
    personality  TEXT,                         -- 性格
    background   TEXT,                         -- 身世背景
    abilities    TEXT,                         -- 特殊能力
    weakness     TEXT,                         -- 弱点
    first_chapter TEXT,                        -- 首次登场章节
    current_status TEXT,                       -- 当前剧情状态
    extra        TEXT,                         -- JSON 扩展字段
    pos_x        REAL DEFAULT 0,               -- 图谱画布坐标
    pos_y        REAL DEFAULT 0,
    created_at   TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at   TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_characters_project ON characters(project_id);

CREATE TABLE IF NOT EXISTS character_relations (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id     INTEGER NOT NULL,
    source_id      INTEGER NOT NULL,           -- 源角色
    target_id      INTEGER NOT NULL,           -- 目标角色
    relation_type  TEXT DEFAULT 'friend',      -- friend / enemy / lover / subordinate / master / kin / ambiguous
    label          TEXT,                       -- 显示文本（如 "师徒"、"仇敌"）
    weight         INTEGER DEFAULT 1,          -- 关系强度
    note           TEXT,
    created_at     TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at     TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES characters(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_relation_source ON character_relations(source_id);
CREATE INDEX IF NOT EXISTS idx_relation_target ON character_relations(target_id);

-- ---------------------------------------------------------------------
-- 8. 势力
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS factions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL,
    name        TEXT NOT NULL,
    category    TEXT DEFAULT 'sect',           -- sect / family / org / country / other
    stance      TEXT,                           -- 立场（正/邪/中立）
    territory   TEXT,                           -- 地盘
    core_people TEXT,                           -- 核心人物
    description TEXT,
    extra       TEXT,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 9. 物品库（法宝/丹药/功法/道具/信物）
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS artifacts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL,
    name        TEXT NOT NULL,
    category    TEXT DEFAULT 'item',           -- magic / pill / skill / item / token
    attributes  TEXT,                           -- 属性（JSON）
    origin      TEXT,                           -- 来源
    usage       TEXT,                           -- 用途
    description TEXT,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 10. 伏笔追踪库
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS foreshadowings (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id         INTEGER NOT NULL,
    title              TEXT NOT NULL,
    content            TEXT,
    status             TEXT DEFAULT 'todo',    -- todo / planted / recovered
    planted_chapter_id INTEGER,                -- 埋设章节
    recovered_chapter_id INTEGER,              -- 回收章节
    priority           INTEGER DEFAULT 2,      -- 1~3
    related_characters TEXT,                   -- JSON 数组
    note               TEXT,
    created_at         TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at         TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 11. 大纲（项目 → 卷 → 大章 → 小节；递归 tree）
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outlines (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL,
    parent_id   INTEGER,
    title       TEXT NOT NULL,
    level       INTEGER DEFAULT 0,             -- 0 项目 / 1 卷 / 2 大章 / 3 小节
    goal        TEXT,                          -- 章节核心目标
    plot        TEXT,                          -- 剧情走向
    pleasure    TEXT,                          -- 爽点设计
    foreshadow  TEXT,                          -- 预埋伏笔
    mood        TEXT,                          -- 情绪节奏
    body        TEXT,
    sort_order  INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 12. 提示词分组 + 提示词条目
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prompt_groups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,                  -- 文风设定 / 人物约束 / 剧情规则 / 题材专属 / 禁词 / 去 AI 化
    builtin     INTEGER DEFAULT 0,              -- 1 内置不可删
    sort_order  INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prompts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id    INTEGER NOT NULL,
    project_id  INTEGER,                        -- 若为项目专属
    name        TEXT NOT NULL,
    content     TEXT NOT NULL,
    enabled     INTEGER DEFAULT 1,
    priority    INTEGER DEFAULT 1,              -- 1~5 注入优先级
    extra       TEXT,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES prompt_groups(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 13. AI 模型配置（多供应商 / 多 API Key）
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_models (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    provider     TEXT NOT NULL,                 -- deepseek / openai / qwen / mimax / ollama / custom
    base_url     TEXT,
    api_key      TEXT,
    model_name   TEXT,                          -- 例如 deepseek-chat
    temperature  REAL DEFAULT 0.7,
    max_tokens   INTEGER DEFAULT 2048,
    context_len  INTEGER DEFAULT 8000,
    is_default   INTEGER DEFAULT 0,
    enabled      INTEGER DEFAULT 1,
    extra        TEXT,
    created_at   TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at   TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 14. RAG 向量片段表（L2 混合检索）；L3 直接走全文 like
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rag_chunks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL,
    source_type TEXT,                           -- chapter / character / worldview / foreshadow / faction / artifact
    source_id   INTEGER,
    title       TEXT,
    body        TEXT NOT NULL,                  -- 分块内容
    embedding   TEXT,                           -- JSON 向量（可选，无向量服务时走 BM25）
    token_count INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_rag_project ON rag_chunks(project_id);
CREATE INDEX IF NOT EXISTS idx_rag_source ON rag_chunks(source_type, source_id);

-- ---------------------------------------------------------------------
-- 15. RAG 白名单 / 黑名单
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rag_filters (
    project_id   INTEGER NOT NULL,
    filter_type  TEXT NOT NULL,                 -- whitelist / blacklist
    scope        TEXT,                          -- chapter_ids / character_ids / keywords JSON
    updated_at   TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, filter_type),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 16. 回收站（软删除统一在此记录）
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recycle_bin (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type  TEXT NOT NULL,                 -- project / chapter / character ...
    entity_id    INTEGER NOT NULL,
    snapshot     TEXT,                          -- JSON 快照
    deleted_at   TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 18. 素材库（章节素材 / 大纲素材 / 角色设定素材 / 通用素材）
--    支持从外部 .txt / .md 导入，按项目 / 分类进行管理
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS materials (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id    INTEGER,                           -- 全局素材可为空
    category      TEXT DEFAULT 'general',            -- chapter / outline / character / general / worldbuilding
    title         TEXT NOT NULL,
    body          TEXT,                              -- 素材正文（支持纯文本 / Markdown）
    source_file   TEXT,                              -- 原始文件路径（可选）
    tags          TEXT,                              -- 逗号分隔 / JSON 数组
    notes         TEXT,
    sort_order    INTEGER DEFAULT 0,
    created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at    TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_materials_project ON materials(project_id);
CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category);

-- ---------------------------------------------------------------------
-- 19. 语言 / 数据存储偏好设置
--    settings 表足够承载；这里通过 schema_migrations 标记能力
-- ---------------------------------------------------------------------
INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (1, 'init-schema');
INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (2, 'materials-and-i18n');
