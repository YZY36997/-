/** AI 生成服务
 * 统一适配 OpenAI 协议：DeepSeek / OpenAI / Qwen / Ollama / 自定义
 * 所有生成请求会先拼装 RAG 上下文 + 世界观 + 角色 + 提示词
 */
import { getDb } from '../db/index.js';
import { ragBuildContext } from './rag.service.js';

function getDefaultModel(): any {
  return getDb().prepare('SELECT * FROM ai_models WHERE enabled = 1 AND is_default = 1 LIMIT 1').get() as any;
}

async function chatCompletion(messages: { role: string; content: string }[], opts?: any): Promise<string> {
  const model = opts?.model || getDefaultModel();
  if (!model || !model.api_key) throw new Error('请在「AI 接口配置」中填写 API Key 并启用默认模型');
  const url = `${model.base_url.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${model.api_key}`
    },
    body: JSON.stringify({
      model: model.model_name,
      messages,
      temperature: opts?.temperature ?? model.temperature ?? 0.7,
      max_tokens: opts?.max_tokens ?? model.max_tokens ?? 2048,
      stream: false
    })
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => String(res.status));
    throw new Error(`AI 请求失败(${res.status}): ${txt.slice(0, 200)}`);
  }
  const data: any = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

/** 拼装 system prompt：世界观 + 角色 + 提示词 + RAG */
export function buildSystemPrompt(projectId: number, extraHint?: string, level?: number): string {
  const parts: string[] = [];
  // 作品信息
  const proj = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
  if (proj) {
    parts.push(`【作品】《${proj.name}》 题材：${proj.genre}；简介：${proj.description || ''}`);
  }
  // 项目总设定
  const settings = getDb().prepare('SELECT * FROM project_settings WHERE project_id = ?').get(projectId) as any;
  if (settings) {
    parts.push(`【创作要求】核心卖点:${settings.core_sell || ''}；核心冲突:${settings.core_conflict || ''}；开篇钩子:${settings.opening_hook || ''}；目标受众:${settings.target_audience || ''}；禁忌:${settings.taboos || ''}；文风:${settings.style || ''}`);
  }
  // 世界观
  const world = getDb().prepare('SELECT * FROM worldviews WHERE project_id = ?').get(projectId) as any;
  if (world) {
    parts.push(`【世界观】基础规则:${(world.base_rules || '').slice(0, 400)}；时间线:${(world.time_line || '').slice(0, 300)}；地域:${(world.geography || '').slice(0, 300)}；术语:${(world.terminology || '').slice(0, 200)}；力量体系:${(world.power_levels || '').slice(0, 400)}`);
  }
  // 角色 Top N
  const chars = getDb().prepare('SELECT * FROM characters WHERE project_id = ? ORDER BY (CASE role WHEN \'protagonist\' THEN 1 WHEN \'main\' THEN 2 ELSE 3 END), id LIMIT 10').all(projectId) as any[];
  if (chars.length) {
    parts.push('【主要人物卡】');
    for (const c of chars) {
      parts.push(`· ${c.name}（${c.role}）：${[c.personality, c.background, c.abilities, c.current_status].filter(Boolean).join(' / ').slice(0, 300)}`);
    }
  }
  // 势力
  const factions = getDb().prepare('SELECT * FROM factions WHERE project_id = ? LIMIT 8').all(projectId) as any[];
  if (factions.length) {
    parts.push('【势力】' + factions.map(f => `${f.name}(${f.category || ''})`).join('，'));
  }
  // 提示词（按 priority 排序取 top）
  const prompts = getDb().prepare(`
    SELECT p.* FROM prompts p JOIN prompt_groups g ON g.id = p.group_id
    WHERE p.enabled = 1 AND (p.project_id IS NULL OR p.project_id = ?)
    ORDER BY g.sort_order, p.priority DESC LIMIT 10
  `).all(projectId) as any[];
  if (prompts.length) {
    parts.push('【写作约束】');
    for (const p of prompts) parts.push(`· ${p.name}：${(p.content || '').slice(0, 200)}`);
  }
  // RAG 上下文（根据等级切换策略）
  const ragCtx = ragBuildContext(projectId, extraHint || '', level || 2);
  if (ragCtx) parts.push(`【长效记忆 · 等级 L${level || 2}】\n${ragCtx}`);
  parts.push('写作要求：请严格遵循上述设定，避免人物关系、力量体系、伏笔前后矛盾。使用简体中文，避免现代网络词、AI 模板化话术。每段 600~1200 字，对话与动作并重。');
  return parts.join('\n');
}

/** 续写（在给定文字之后接下去） */
export async function continueText(projectId: number, contextText: string, extraHint?: string): Promise<string> {
  const sys = buildSystemPrompt(projectId, extraHint, 2);
  return chatCompletion([
    { role: 'system', content: sys },
    { role: 'user', content: `请接在以下文字之后续写不少于 800 字正文：\n${contextText.slice(-2400)}` }
  ]);
}

/** 重写选中片段 */
export async function rewriteText(projectId: number, before: string, selected: string, hint?: string): Promise<string> {
  const sys = buildSystemPrompt(projectId, hint, 2);
  return chatCompletion([
    { role: 'system', content: sys },
    { role: 'user', content: `【上下文】${(before || '').slice(-1000)}\n【请重写以下片段】${selected}\n【要求】${hint || '保持原意，润色得更有张力，保持人物性格一致'}` }
  ]);
}

/** 润色（模板化:去 AI 化/镜头描写/情绪强化/古风/爽文节奏/精简） */
export async function polishText(projectId: number, text: string, template: string): Promise<string> {
  const templates: Record<string, string> = {
    '去 AI 化': '去掉模板化话术（如"微微一怔""瞳孔一缩""眼中闪过一丝"等），用更自然的中文写作，保留原意。',
    '镜头描写': '从镜头视角重写，增强景物描写、动态、光线、声音、慢动作。',
    '情绪强化': '加强人物内心情绪、感官刺激、肢体语言，提高戏剧张力。',
    '古风仙侠': '改成偏古风中文，适当使用古典意象和句式，避免现代网络词。',
    '爽文节奏': '加快节奏，每段都有小冲突或小爽点，结尾留钩子。',
    '精简冗余': '删除冗余、同义重复的描述，保留核心情节与张力。'
  };
  const instruction = templates[template] || template;
  const sys = buildSystemPrompt(projectId, instruction, 1);
  return chatCompletion([
    { role: 'system', content: sys },
    { role: 'user', content: `【润色要求】${instruction}\n【原文】${text.slice(0, 4000)}` }
  ]);
}

/** 对话/场景生成 */
export async function generateDialogScene(projectId: number, hint: string): Promise<string> {
  const sys = buildSystemPrompt(projectId, hint, 2);
  return chatCompletion([
    { role: 'system', content: sys },
    { role: 'user', content: `请为本作品创作一段【${hint || '对话 + 场景'}】，包含场景描写、人物对话、动作、心理。` }
  ]);
}

/** OOC 检测：给出当前章节正文，返回可能的人设跑偏点 */
export async function checkOoc(projectId: number, chapterText: string): Promise<string> {
  const sys = buildSystemPrompt(projectId, 'OOC 检测', 3);
  return chatCompletion([
    { role: 'system', content: sys },
    { role: 'user', content: `检查以下章节正文是否存在人物性格、能力、关系前后矛盾（OOC），逐点列出：\n${chapterText.slice(0, 4000)}` }
  ]);
}

/** 错别字检测 */
export async function checkTypo(projectId: number, text: string): Promise<string> {
  return chatCompletion([
    { role: 'system', content: '你是专业中文编辑。请检查以下文本中明显的错别字、语病，并给出修正建议。' },
    { role: 'user', content: text.slice(0, 6000) }
  ]);
}

/** 自动扫描章节，找出埋设伏笔的位置 */
export async function scanForeshadow(projectId: number, text: string): Promise<string> {
  const fores = getDb().prepare('SELECT * FROM foreshadowings WHERE project_id = ?').all(projectId) as any[];
  const sys = buildSystemPrompt(projectId, '伏笔扫描', 3);
  const hint = fores.length ? `已有伏笔清单：${fores.map(f => f.title).join('，')}` : '本作品目前无伏笔登记，请指出文中作者埋下的可回收钩子。';
  return chatCompletion([
    { role: 'system', content: sys },
    { role: 'user', content: `${hint}\n阅读以下章节正文，指出何处存在伏笔、暗示，并总结：\n${text.slice(0, 5000)}` }
  ]);
}

/** 大纲生成：根据作品信息生成多级大纲 */
export async function generateOutline(projectId: number, hint: string): Promise<string> {
  const sys = buildSystemPrompt(projectId, hint, 2);
  return chatCompletion([
    { role: 'system', content: sys },
    { role: 'user', content: `请根据以上设定，为《${hint || '本作'}》生成一份多级大纲（卷 -> 大章 -> 小节），每章标注核心目标、爽点、预埋伏笔、情绪节奏。` }
  ]);
}

/** 灵感生成 */
export async function generateIdea(projectId: number, hint: string): Promise<string> {
  const sys = buildSystemPrompt(projectId, hint, 2);
  return chatCompletion([
    { role: 'system', content: sys },
    { role: 'user', content: `给出 5 个剧情分支灵感，要求简短且有张力。主题：${hint || '下一阶段剧情走向'}` }
  ]);
}

/** 连通性测试 */
export async function testModel(modelId: number): Promise<{ ok: boolean; message: string }> {
  const m = getDb().prepare('SELECT * FROM ai_models WHERE id = ?').get(modelId) as any;
  if (!m) return { ok: false, message: '模型不存在' };
  try {
    const text = await chatCompletion([{ role: 'user', content: '请回复：测试通过。' }], { model: m, max_tokens: 50 });
    return { ok: true, message: text || '(空)' };
  } catch (e: any) {
    return { ok: false, message: e.message || '未知错误' };
  }
}
