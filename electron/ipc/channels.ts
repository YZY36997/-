/**
 * 灵墨小说工坊 · IPC 通道常量
 * 所有业务统一走 lingmo:invoke 通道，通过 payload.action 分发
 */

export const CHANNEL = 'lingmo:invoke' as const;
export const EVENT = 'lingmo:event' as const;

/** 所有允许的 action 枚举（渲染进程通过 window.lingmo.invoke(action, args) 调用） */
export const ACTIONS = {
  // 系统
  SYS_PING: 'sys.ping',
  SYS_APP_INFO: 'sys.appInfo',
  SYS_SET_THEME: 'sys.setTheme',
  SYS_GET_THEME: 'sys.getTheme',

  // 作品
  PROJECT_LIST: 'project.list',
  PROJECT_GET: 'project.get',
  PROJECT_CREATE: 'project.create',
  PROJECT_UPDATE: 'project.update',
  PROJECT_DELETE: 'project.delete',

  // 项目总设定
  PROJECT_SETTINGS_GET: 'projectSettings.get',
  PROJECT_SETTINGS_SAVE: 'projectSettings.save',

  // 世界观
  WORLDVIEW_GET: 'worldview.get',
  WORLDVIEW_SAVE: 'worldview.save',

  // 卷 / 章节 / 正文
  VOLUME_LIST: 'volume.list',
  VOLUME_CREATE: 'volume.create',
  VOLUME_UPDATE: 'volume.update',
  VOLUME_DELETE: 'volume.delete',

  CHAPTER_LIST: 'chapter.list',
  CHAPTER_GET: 'chapter.get',
  CHAPTER_CREATE: 'chapter.create',
  CHAPTER_UPDATE: 'chapter.update',
  CHAPTER_DELETE: 'chapter.delete',
  CHAPTER_MOVE: 'chapter.move',

  CHAPTER_CONTENT_GET: 'chapterContent.get',
  CHAPTER_CONTENT_SAVE: 'chapterContent.save',
  CHAPTER_CONTENT_HISTORY: 'chapterContent.history',

  // 角色
  CHARACTER_LIST: 'character.list',
  CHARACTER_CREATE: 'character.create',
  CHARACTER_UPDATE: 'character.update',
  CHARACTER_DELETE: 'character.delete',

  CHARACTER_RELATION_LIST: 'characterRelation.list',
  CHARACTER_RELATION_CREATE: 'characterRelation.create',
  CHARACTER_RELATION_UPDATE: 'characterRelation.update',
  CHARACTER_RELATION_DELETE: 'characterRelation.delete',

  // 势力
  FACTION_LIST: 'faction.list',
  FACTION_CREATE: 'faction.create',
  FACTION_UPDATE: 'faction.update',
  FACTION_DELETE: 'faction.delete',

  // 物品
  ARTIFACT_LIST: 'artifact.list',
  ARTIFACT_CREATE: 'artifact.create',
  ARTIFACT_UPDATE: 'artifact.update',
  ARTIFACT_DELETE: 'artifact.delete',

  // 伏笔
  FORESHADOW_LIST: 'foreshadow.list',
  FORESHADOW_CREATE: 'foreshadow.create',
  FORESHADOW_UPDATE: 'foreshadow.update',
  FORESHADOW_DELETE: 'foreshadow.delete',

  // 大纲
  OUTLINE_TREE: 'outline.tree',
  OUTLINE_NODE_SAVE: 'outline.save',
  OUTLINE_NODE_DELETE: 'outline.delete',

  // 提示词
  PROMPT_GROUP_LIST: 'promptGroup.list',
  PROMPT_GROUP_SAVE: 'promptGroup.save',
  PROMPT_GROUP_DELETE: 'promptGroup.delete',
  PROMPT_LIST: 'prompt.list',
  PROMPT_CREATE: 'prompt.create',
  PROMPT_UPDATE: 'prompt.update',
  PROMPT_DELETE: 'prompt.delete',

  // AI 模型配置
  AI_MODEL_LIST: 'aiModel.list',
  AI_MODEL_SAVE: 'aiModel.save',
  AI_MODEL_DELETE: 'aiModel.delete',
  AI_MODEL_TEST: 'aiModel.test',

  // AI 生成（核心）
  AI_CONTINUE: 'ai.continue',           // 续写
  AI_REWRITE: 'ai.rewrite',             // 重写选中片段
  AI_POLISH: 'ai.polish',               // 润色
  AI_DIALOG_SCENE: 'ai.dialogScene',    // 对话/场景生成
  AI_CHECK_OOC: 'ai.checkOoc',          // OOC 检测
  AI_CHECK_TYPO: 'ai.checkTypo',        // 错别字
  AI_FORESHADOW_SCAN: 'ai.foreshadowScan', // 伏笔自动识别
  AI_GENERATE_OUTLINE: 'ai.generateOutline',
  AI_GENERATE_IDEA: 'ai.generateIdea',  // 灵感生成

  // RAG 三级检索
  RAG_BUILD: 'rag.build',               // 重新建索引
  RAG_RETRIEVE: 'rag.retrieve',         // 检索（手动调用）
  RAG_FILTER_SAVE: 'rag.filterSave',
  RAG_FILTER_GET: 'rag.filterGet',

  // 追读力分析
  ANALYSIS_CHAPTER: 'analysis.chapter',
  ANALYSIS_PROJECT: 'analysis.project',

  // 回收站
  RECYCLE_LIST: 'recycle.list',
  RECYCLE_RESTORE: 'recycle.restore',
  RECYCLE_EMPTY: 'recycle.empty',
} as const;

export type ActionKey = keyof typeof ACTIONS;
