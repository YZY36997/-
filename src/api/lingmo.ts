/** 前端 API：Electron 环境下使用 preload 暴露的 lingmo，否则降级 */

// 暴露字符串动作常量（与 Electron 主进程 switch case 保持一致）
const ACTIONS = {
  SYS_PING: 'sys.ping',
  SYS_GET_THEME: 'sys.getTheme',
  SYS_SET_THEME: 'sys.setTheme',

  PROJECT_LIST: 'project.list',
  PROJECT_GET: 'project.get',
  PROJECT_CREATE: 'project.create',
  PROJECT_UPDATE: 'project.update',
  PROJECT_DELETE: 'project.delete',

  PROJECT_SETTINGS_GET: 'projectSettings.get',
  PROJECT_SETTINGS_SAVE: 'projectSettings.save',
  WORLDVIEW_GET: 'worldview.get',
  WORLDVIEW_SAVE: 'worldview.save',

  VOLUME_LIST: 'volume.list',
  VOLUME_CREATE: 'volume.create',
  VOLUME_UPDATE: 'volume.update',
  VOLUME_DELETE: 'volume.delete',

  CHAPTER_LIST: 'chapter.list',
  CHAPTER_GET: 'chapter.get',
  CHAPTER_CREATE: 'chapter.create',
  CHAPTER_UPDATE: 'chapter.update',
  CHAPTER_DELETE: 'chapter.delete',
  CHAPTER_CONTENT_GET: 'chapterContent.get',
  CHAPTER_CONTENT_SAVE: 'chapterContent.save',
  CHAPTER_CONTENT_HISTORY: 'chapterContent.history',

  CHARACTER_LIST: 'character.list',
  CHARACTER_CREATE: 'character.create',
  CHARACTER_UPDATE: 'character.update',
  CHARACTER_DELETE: 'character.delete',

  CHARACTER_RELATION_LIST: 'characterRelation.list',
  CHARACTER_RELATION_CREATE: 'characterRelation.create',
  CHARACTER_RELATION_UPDATE: 'characterRelation.update',
  CHARACTER_RELATION_DELETE: 'characterRelation.delete',

  FORESHADOW_LIST: 'foreshadow.list',
  FORESHADOW_CREATE: 'foreshadow.create',
  FORESHADOW_UPDATE: 'foreshadow.update',
  FORESHADOW_DELETE: 'foreshadow.delete',

  OUTLINE_TREE: 'outline.tree',
  OUTLINE_NODE_SAVE: 'outline.save',
  OUTLINE_NODE_DELETE: 'outline.delete',

  PROMPT_GROUP_LIST: 'promptGroup.list',
  PROMPT_GROUP_SAVE: 'promptGroup.save',
  PROMPT_GROUP_DELETE: 'promptGroup.delete',
  PROMPT_LIST: 'prompt.list',
  PROMPT_CREATE: 'prompt.create',
  PROMPT_UPDATE: 'prompt.update',
  PROMPT_DELETE: 'prompt.delete',

  AI_MODEL_LIST: 'aiModel.list',
  AI_MODEL_SAVE: 'aiModel.save',
  AI_MODEL_DELETE: 'aiModel.delete',
  AI_MODEL_TEST: 'aiModel.test',

  AI_CONTINUE: 'ai.continue',
  AI_REWRITE: 'ai.rewrite',
  AI_POLISH: 'ai.polish',
  AI_DIALOG_SCENE: 'ai.dialogScene',
  AI_CHECK_OOC: 'ai.checkOoc',
  AI_CHECK_TYPO: 'ai.checkTypo',
  AI_FORESHADOW_SCAN: 'ai.foreshadowScan',
  AI_GENERATE_OUTLINE: 'ai.generateOutline',
  AI_GENERATE_IDEA: 'ai.generateIdea',

  RAG_BUILD: 'rag.build',
  RAG_RETRIEVE: 'rag.retrieve',
  RAG_FILTER_GET: 'rag.filterGet',
  RAG_FILTER_SAVE: 'rag.filterSave',

  ANALYSIS_CHAPTER: 'analysis.chapter',
  ANALYSIS_PROJECT: 'analysis.project'
};

// 判断环境并选择调用方式
async function invoke(action, args) {
  const w = (typeof window !== 'undefined') ? (window as any) : null;
  if (w && w.lingmo && typeof w.lingmo.invoke === 'function') {
    try {
      const res = await w.lingmo.invoke(action, args || {});
      if (res && res.ok) return { ok: true, data: res.data };
      return { ok: false, error: res?.error || '失败', data: null };
    } catch (e) {
      return { ok: false, error: (e as any).message || String(e), data: null };
    }
  }
  // 浏览器降级：返回提示数据（开发调试用）
  console.warn('[lingmo] 未检测到 Electron 环境，使用模拟数据');
  return { ok: true, data: {} };
}

export const lingmo = { invoke, ACTIONS };
export default lingmo;
