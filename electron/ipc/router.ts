/** IPC 路由分发
 * 渲染进程 -> 主进程：window.lingmo.invoke(action, args)
 * 所有业务调用经过这里，统一返回 { ok, data, error }
 */
import { ACTIONS } from './channels.js';

import { projectService } from '../services/project.service.js';
import { projectSettingsService, worldviewService, volumeService, chapterService } from '../services/chapter.service.js';
import { characterService, characterRelationService, factionService, artifactService, foreshadowService } from '../services/character.service.js';
import { outlineService, promptGroupService, promptService, aiModelService } from '../services/prompt.service.js';
import { continueText, rewriteText, polishText, generateDialogScene, checkOoc, checkTypo, scanForeshadow, generateOutline, generateIdea, testModel, buildSystemPrompt } from '../services/ai.service.js';
import { ragBuildIndex, ragRetrieve, ragFilterGet, ragFilterSave, ragBuildContext } from '../services/rag.service.js';
import { analyzeChapter, analyzeProject } from '../services/analysis.service.js';
import { settingsService, recycleService } from '../services/settings.service.js';

type Handler = (args: any) => any;
const handlers: Record<string, Handler> = {
  // -------- 系统 --------
  [ACTIONS.SYS_PING]: () => ({ pong: Date.now() }),
  [ACTIONS.SYS_APP_INFO]: () => ({ version: '1.0.0', name: '灵墨小说工坊' }),
  [ACTIONS.SYS_GET_THEME]: () => settingsService.get('theme'),
  [ACTIONS.SYS_SET_THEME]: (args) => { settingsService.set('theme', args.theme); return true; },

  // -------- 作品 --------
  [ACTIONS.PROJECT_LIST]: (args) => projectService.list(args.genre, args.keyword),
  [ACTIONS.PROJECT_GET]: (args) => projectService.get(args.id),
  [ACTIONS.PROJECT_CREATE]: (args) => projectService.create(args),
  [ACTIONS.PROJECT_UPDATE]: (args) => projectService.update(args.id, args),
  [ACTIONS.PROJECT_DELETE]: (args) => projectService.softDelete(args.id),

  [ACTIONS.PROJECT_SETTINGS_GET]: (args) => projectSettingsService.get(args.project_id),
  [ACTIONS.PROJECT_SETTINGS_SAVE]: (args) => { projectSettingsService.save(args.project_id, args); return true; },

  [ACTIONS.WORLDVIEW_GET]: (args) => worldviewService.get(args.project_id),
  [ACTIONS.WORLDVIEW_SAVE]: (args) => { worldviewService.save(args.project_id, args); return true; },

  // -------- 卷 / 章节 / 正文 --------
  [ACTIONS.VOLUME_LIST]: (args) => volumeService.list(args.project_id),
  [ACTIONS.VOLUME_CREATE]: (args) => ({ id: volumeService.create(args.project_id, args.title) }),
  [ACTIONS.VOLUME_UPDATE]: (args) => { volumeService.update(args.id, args); return true; },
  [ACTIONS.VOLUME_DELETE]: (args) => { volumeService.remove(args.id); return true; },

  [ACTIONS.CHAPTER_LIST]: (args) => chapterService.list(args.project_id),
  [ACTIONS.CHAPTER_GET]: (args) => chapterService.get(args.id),
  [ACTIONS.CHAPTER_CREATE]: (args) => ({ id: chapterService.create(args.project_id, args) }),
  [ACTIONS.CHAPTER_UPDATE]: (args) => { chapterService.update(args.id, args); return true; },
  [ACTIONS.CHAPTER_DELETE]: (args) => { chapterService.remove(args.id); return true; },

  [ACTIONS.CHAPTER_CONTENT_GET]: (args) => chapterService.getContent(args.id),
  [ACTIONS.CHAPTER_CONTENT_SAVE]: (args) => ({ id: chapterService.saveContent(args.id, args.content, args.version_tag) }),
  [ACTIONS.CHAPTER_CONTENT_HISTORY]: (args) => chapterService.history(args.id),

  // -------- 角色 --------
  [ACTIONS.CHARACTER_LIST]: (args) => characterService.list(args.project_id),
  [ACTIONS.CHARACTER_CREATE]: (args) => ({ id: characterService.create(args.project_id, args) }),
  [ACTIONS.CHARACTER_UPDATE]: (args) => { characterService.update(args.id, args); return true; },
  [ACTIONS.CHARACTER_DELETE]: (args) => { characterService.remove(args.id); return true; },

  [ACTIONS.CHARACTER_RELATION_LIST]: (args) => characterRelationService.list(args.project_id),
  [ACTIONS.CHARACTER_RELATION_CREATE]: (args) => ({ id: characterRelationService.create(args.project_id, args) }),
  [ACTIONS.CHARACTER_RELATION_UPDATE]: (args) => { characterRelationService.update(args.id, args); return true; },
  [ACTIONS.CHARACTER_RELATION_DELETE]: (args) => { characterRelationService.remove(args.id); return true; },

  // -------- 势力 / 物品 / 伏笔 --------
  [ACTIONS.FORESHADOW_LIST]: (args) => foreshadowService.list(args.project_id),
  [ACTIONS.FORESHADOW_CREATE]: (args) => ({ id: foreshadowService.create(args.project_id, args) }),
  [ACTIONS.FORESHADOW_UPDATE]: (args) => { foreshadowService.update(args.id, args); return true; },
  [ACTIONS.FORESHADOW_DELETE]: (args) => { foreshadowService.remove(args.id); return true; },

  // -------- 大纲 --------
  [ACTIONS.OUTLINE_TREE]: (args) => outlineService.tree(args.project_id),
  [ACTIONS.OUTLINE_NODE_SAVE]: (args) => ({ id: outlineService.save(args.project_id, args) }),
  [ACTIONS.OUTLINE_NODE_DELETE]: (args) => { outlineService.remove(args.id); return true; },

  // -------- 提示词 --------
  [ACTIONS.PROMPT_GROUP_LIST]: () => promptGroupService.list(),
  [ACTIONS.PROMPT_GROUP_SAVE]: (args) => ({ id: promptGroupService.save(args) }),
  [ACTIONS.PROMPT_GROUP_DELETE]: (args) => { promptGroupService.remove(args.id); return true; },

  [ACTIONS.PROMPT_LIST]: (args) => promptService.list(args.project_id),
  [ACTIONS.PROMPT_CREATE]: (args) => ({ id: promptService.create(args) }),
  [ACTIONS.PROMPT_UPDATE]: (args) => { promptService.update(args.id, args); return true; },
  [ACTIONS.PROMPT_DELETE]: (args) => { promptService.remove(args.id); return true; },

  // -------- AI 模型 --------
  [ACTIONS.AI_MODEL_LIST]: () => aiModelService.list(),
  [ACTIONS.AI_MODEL_SAVE]: (args) => ({ id: aiModelService.save(args) }),
  [ACTIONS.AI_MODEL_DELETE]: (args) => { aiModelService.remove(args.id); return true; },
  [ACTIONS.AI_MODEL_TEST]: (args) => testModel(args.id),

  // -------- AI 生成 --------
  [ACTIONS.AI_CONTINUE]: async (args) => ({ text: await continueText(args.project_id, args.context || '', args.hint) }),
  [ACTIONS.AI_REWRITE]: async (args) => ({ text: await rewriteText(args.project_id, args.before || '', args.selected || '', args.hint) }),
  [ACTIONS.AI_POLISH]: async (args) => ({ text: await polishText(args.project_id, args.text || '', args.template || '去 AI 化') }),
  [ACTIONS.AI_DIALOG_SCENE]: async (args) => ({ text: await generateDialogScene(args.project_id, args.hint) }),
  [ACTIONS.AI_CHECK_OOC]: async (args) => ({ text: await checkOoc(args.project_id, args.content || '') }),
  [ACTIONS.AI_CHECK_TYPO]: async (args) => ({ text: await checkTypo(args.project_id, args.content || '') }),
  [ACTIONS.AI_FORESHADOW_SCAN]: async (args) => ({ text: await scanForeshadow(args.project_id, args.content || '') }),
  [ACTIONS.AI_GENERATE_OUTLINE]: async (args) => ({ text: await generateOutline(args.project_id, args.hint) }),
  [ACTIONS.AI_GENERATE_IDEA]: async (args) => ({ text: await generateIdea(args.project_id, args.hint) }),

  // -------- RAG --------
  'rag.buildSystemPrompt': (args) => ({ text: buildSystemPrompt(args.project_id, args.hint, args.level || 2) }),
  [ACTIONS.RAG_BUILD]: (args) => ({ count: ragBuildIndex(args.project_id) }),
  [ACTIONS.RAG_RETRIEVE]: (args) => ({ hits: ragRetrieve(args.project_id, args.query, args.level) }),
  [ACTIONS.RAG_FILTER_GET]: (args) => ragFilterGet(args.project_id),
  [ACTIONS.RAG_FILTER_SAVE]: (args) => { ragFilterSave(args.project_id, args); return true; },

  // -------- 追读力分析 --------
  [ACTIONS.ANALYSIS_CHAPTER]: (args) => analyzeChapter(args.content || ''),
  [ACTIONS.ANALYSIS_PROJECT]: (args) => analyzeProject(args.project_id),

  // -------- 回收站 --------
  [ACTIONS.RECYCLE_LIST]: () => recycleService.list(),
  [ACTIONS.RECYCLE_RESTORE]: (args) => { recycleService.restore(args.id); return true; },
  [ACTIONS.RECYCLE_EMPTY]: () => { recycleService.empty(); return true; }
};

export async function routeAction(action: string, args: any): Promise<any> {
  const handler = handlers[action];
  if (!handler) throw new Error(`Unknown action: ${action}`);
  return await handler(args);
}
