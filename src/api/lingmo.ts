/** 前端对 Electron IPC 的统一封装 + 动作常量 */
type LingmoResult<T = any> = { ok: boolean; data: T; error?: string };

declare global {
  interface Window {
    lingmo: {
      invoke: (action: string, args?: any) => Promise<LingmoResult>;
      onEvent: (channel: string, cb: (data: any) => void) => () => void;
    };
  }
}

export const ACTIONS = {
  SYS_PING: 'sys.ping',
  SYS_GET_THEME: 'sys.getTheme',
  SYS_SET_THEME: 'sys.setTheme',

  PROJECT_LIST: 'project.list',
  PROJECT_RECYCLE: 'project.recycle',
  PROJECT_RECYCLE_LIST: 'project.recycleList',
  PROJECT_GET: 'project.get',
  PROJECT_CREATE: 'project.create',
  PROJECT_UPDATE: 'project.update',
  PROJECT_DELETE: 'project.delete',
  PROJECT_RESTORE: 'project.restore',
  PROJECT_EXPORT: 'project.export',
  PROJECT_EXPORT_JSON: 'project.exportJson',

  PROJECT_SETTINGS_GET: 'projectSettings.get',
  PROJECT_SETTINGS_SAVE: 'projectSettings.save',
  WORLDVIEW_GET: 'worldview.get',
  WORLDVIEW_SAVE: 'worldview.save',

  FACTION_LIST: 'faction.list',
  FACTION_SAVE: 'faction.save',
  FACTION_DELETE: 'faction.delete',
  ARTIFACT_LIST: 'artifact.list',
  ARTIFACT_SAVE: 'artifact.save',
  ARTIFACT_DELETE: 'artifact.delete',

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
  FORESHADOW_SAVE: 'foreshadow.update',
  FORESHADOW_DELETE: 'foreshadow.delete',

  OUTLINE_TREE: 'outline.tree',
  OUTLINE_SAVE: 'outline.save',
  OUTLINE_DELETE: 'outline.delete',

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
  AI_BUILD_SYSTEM_PROMPT: 'ai.buildSystemPrompt',

  RAG_RETRIEVE: 'rag.retrieve',
  RAG_FILTER_GET: 'rag.filterGet',
  RAG_FILTER_SAVE: 'rag.filterSave',

  ANALYSIS_CHAPTER: 'analysis.chapter',
  ANALYSIS_PROJECT: 'analysis.project',

  // 素材库
  MATERIAL_LIST: 'material.list',
  MATERIAL_GET: 'material.get',
  MATERIAL_SAVE: 'material.save',
  MATERIAL_DELETE: 'material.delete',
  MATERIAL_BULK_IMPORT: 'material.bulkImport',
  MATERIAL_IMPORT_CHAPTER_TEXT: 'material.importChapterText',
  MATERIAL_IMPORT_OUTLINE_TEXT: 'material.importOutlineText',
  MATERIAL_IMPORT_CHARACTER_TEXT: 'material.importCharacterText',

  // 语言 / 全局设置
  SYS_GET_LOCALE: 'sys.getLocale',
  SYS_SET_LOCALE: 'sys.setLocale',
  SETTINGS_GET_ALL: 'settings.getAll',
  SETTINGS_SET: 'settings.set'
};

export const lingmo = {
  async invoke<T = any>(action: string, args?: any): Promise<{ ok: boolean; data: T; error?: string }> {
    const w = typeof window !== 'undefined' ? window : null;
    if (w && w.lingmo && typeof w.lingmo.invoke === 'function') {
      try {
        const r = await w.lingmo.invoke(action, args || {});
        if (r && r.ok) return { ok: true, data: r.data as T };
        return { ok: false, data: null as any, error: r?.error || '失败' };
      } catch (e: any) {
        return { ok: false, data: null as any, error: e.message || String(e) };
      }
    }
    // 开发期在浏览器中给出友好提示，不中断页面
    console.warn('[lingmo] 未检测到 Electron 环境，该动作返回空：', action);
    return { ok: false, data: null as any, error: 'no-electron' };
  },
  ACTIONS
};
