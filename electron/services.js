/** 业务服务层（简化集合）——作品/章节/角色/伏笔/大纲/提示词/模型/AI/RAG/分析/设置 */
const { getDb } = require('./db/db.js');

// ---------- 作品 ----------
const projectService = {
  list(genre, keyword) {
    let sql = 'SELECT * FROM projects WHERE deleted = 0';
    const params = [];
    if (genre && genre !== '全部') { sql += ' AND genre = ?'; params.push(genre); }
    if (keyword) { sql += ' AND name LIKE ?'; params.push(`%${keyword}%`); }
    sql += ' ORDER BY updated_at DESC';
    return getDb().prepare(sql).all(...params);
  },
  get(id) { return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id); },
  create(data) {
    const info = getDb().prepare('INSERT INTO projects (name, genre, summary, core_conflict, writing_style, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(data.name || '未命名', data.genre || '玄幻', data.summary || '', data.core_conflict || '', data.writing_style || '', data.status || '草稿');
    return { id: info.lastInsertRowid };
  },
  update(id, data) {
    getDb().prepare('UPDATE projects SET name = ?, genre = ?, summary = ?, core_conflict = ?, writing_style = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(data.name, data.genre, data.summary, data.core_conflict || '', data.writing_style || '', id);
  },
  softDelete(id) {
    getDb().prepare('UPDATE projects SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  }
};

// ---------- 作品设定 ----------
const projectSettingsService = {
  get(projectId) {
    const r = getDb().prepare('SELECT * FROM project_settings WHERE project_id = ?').get(projectId);
    return r || {};
  },
  save(projectId, data) {
    getDb().prepare(`INSERT INTO project_settings (project_id, target_audience, forbidden_topics, writing_style) VALUES (?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET target_audience = ?, forbidden_topics = ?, writing_style = ?`)
      .run(projectId, data.target_audience || '', data.forbidden_topics || '', data.writing_style || '',
        data.target_audience || '', data.forbidden_topics || '', data.writing_style || '');
  }
};

// ---------- 世界观 ----------
const worldviewService = {
  get(projectId) { return getDb().prepare('SELECT * FROM worldviews WHERE project_id = ?').get(projectId) || {}; },
  save(projectId, data) {
    getDb().prepare(`INSERT INTO worldviews (project_id, world_rules, timeline, regions, power_system, terminology, factions, items_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        world_rules = ?, timeline = ?, regions = ?, power_system = ?, terminology = ?, factions = ?, items_data = ?`)
      .run(projectId, data.world_rules || '', data.timeline || '', data.regions || '',
        data.power_system || '', data.terminology || '', data.factions || '', data.items_data || '',
        data.world_rules || '', data.timeline || '', data.regions || '',
        data.power_system || '', data.terminology || '', data.factions || '', data.items_data || '');
  }
};

// ---------- 卷 ----------
const volumeService = {
  list(projectId) { return getDb().prepare('SELECT * FROM volumes WHERE project_id = ? ORDER BY id ASC').all(projectId); },
  create(projectId, title) {
    const info = getDb().prepare('INSERT INTO volumes (project_id, title) VALUES (?, ?)').run(projectId, title);
    return { id: info.lastInsertRowid };
  },
  update(id, data) { getDb().prepare('UPDATE volumes SET title = ? WHERE id = ?').run(data.title, id); },
  remove(id) { getDb().prepare('DELETE FROM volumes WHERE id = ?').run(id); }
};

// ---------- 章节 ----------
const chapterService = {
  list(projectId) { return getDb().prepare('SELECT * FROM chapters WHERE project_id = ? ORDER BY volume_id, id ASC').all(projectId); },
  get(id) { return getDb().prepare('SELECT * FROM chapters WHERE id = ?').get(id); },
  create(projectId, data) {
    const info = getDb().prepare('INSERT INTO chapters (project_id, volume_id, title, summary, word_count, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(projectId, data.volume_id || null, data.title || '新章节', data.summary || '', data.word_count || 0, data.status || 'draft');
    return { id: info.lastInsertRowid };
  },
  update(id, data) {
    getDb().prepare('UPDATE chapters SET title = ?, summary = ?, word_count = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(data.title, data.summary || '', data.word_count || 0, data.status || 'draft', id);
  },
  remove(id) { getDb().prepare('DELETE FROM chapters WHERE id = ?').run(id); },
  getContent(id) { return getDb().prepare('SELECT id, content FROM chapter_contents WHERE chapter_id = ? ORDER BY id DESC LIMIT 1').get(id) || { id: 0, content: '' }; },
  saveContent(id, content, tag) {
    const info = getDb().prepare('INSERT INTO chapter_contents (chapter_id, content, version_tag) VALUES (?, ?, ?)').run(id, content || '', tag || 'auto');
    const words = (content || '').length;
    getDb().prepare('UPDATE chapters SET word_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(words, id);
    return { id: info.lastInsertRowid };
  },
  history(id) { return getDb().prepare('SELECT id, version_tag, created_at FROM chapter_contents WHERE chapter_id = ? ORDER BY id DESC').all(id); }
};

// ---------- 角色 ----------
const characterService = {
  list(projectId) { return getDb().prepare('SELECT * FROM characters WHERE project_id = ? ORDER BY id ASC').all(projectId); },
  create(projectId, data) {
    const info = getDb().prepare(`INSERT INTO characters (project_id, name, role, appearance, personality, background,
      abilities, weakness, relationships, first_appearance_chapter, status, x, y)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(projectId, data.name || '', data.role || 'minor', data.appearance || '', data.personality || '',
        data.background || '', data.abilities || '', data.weakness || '', data.relationships || '',
        data.first_appearance_chapter || '', data.status || 'alive', data.x || 100, data.y || 100);
    return { id: info.lastInsertRowid };
  },
  update(id, data) {
    getDb().prepare(`UPDATE characters SET name=?, role=?, appearance=?, personality=?, background=?,
      abilities=?, weakness=?, relationships=?, first_appearance_chapter=?, status=?, x=?, y=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(data.name, data.role, data.appearance, data.personality, data.background,
        data.abilities, data.weakness, data.relationships, data.first_appearance_chapter, data.status, data.x || 100, data.y || 100, id);
  },
  remove(id) { getDb().prepare('DELETE FROM characters WHERE id = ?').run(id); }
};

const characterRelationService = {
  list(projectId) { return getDb().prepare('SELECT * FROM character_relations WHERE project_id = ?').all(projectId); },
  create(projectId, data) {
    const info = getDb().prepare('INSERT INTO character_relations (project_id, from_id, to_id, type, label, description) VALUES (?, ?, ?, ?, ?, ?)')
      .run(projectId, data.from, data.to, data.type || 'friend', data.label || '', data.description || '');
    return { id: info.lastInsertRowid };
  },
  update(id, data) {
    getDb().prepare('UPDATE character_relations SET type=?, label=?, description=? WHERE id=?').run(data.type, data.label, data.description, id);
  },
  remove(id) { getDb().prepare('DELETE FROM character_relations WHERE id = ?').run(id); }
};

// ---------- 伏笔 ----------
const foreshadowService = {
  list(projectId) { return getDb().prepare('SELECT * FROM foreshadows WHERE project_id = ?').all(projectId); },
  create(projectId, data) {
    const info = getDb().prepare('INSERT INTO foreshadows (project_id, title, content, status, chapter_id) VALUES (?, ?, ?, ?, ?)')
      .run(projectId, data.title || '', data.content || '', data.status || 'planted', data.chapter_id || null);
    return { id: info.lastInsertRowid };
  },
  update(id, data) {
    getDb().prepare('UPDATE foreshadows SET title=?, content=?, status=? WHERE id=?').run(data.title, data.content, data.status, id);
  },
  remove(id) { getDb().prepare('DELETE FROM foreshadows WHERE id = ?').run(id); }
};

// ---------- 大纲 ----------
const outlineService = {
  tree(projectId) { return getDb().prepare('SELECT * FROM outlines WHERE project_id = ? ORDER BY order_index ASC').all(projectId); },
  save(projectId, data) {
    const info = getDb().prepare(`INSERT INTO outlines (project_id, parent_id, title, summary, core_goal, plot, foreshadow, mood, order_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
      parent_id=excluded.parent_id, title=excluded.title, summary=excluded.summary, core_goal=excluded.core_goal,
      plot=excluded.plot, foreshadow=excluded.foreshadow, mood=excluded.mood, order_index=excluded.order_index`)
      .run(projectId, data.parent_id || null, data.title || '', data.summary || '', data.core_goal || '',
        data.plot || '', data.foreshadow || '', data.mood || '', data.order_index || 1);
    return { id: data.id || info.lastInsertRowid };
  },
  remove(id) { getDb().prepare('DELETE FROM outlines WHERE id = ?').run(id); }
};

// ---------- 提示词 ----------
const promptGroupService = {
  list() { return getDb().prepare('SELECT * FROM prompt_groups ORDER BY id ASC').all(); },
  save(data) {
    const info = getDb().prepare('INSERT INTO prompt_groups (name, description) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description')
      .run(data.name, data.description || '');
    return { id: data.id || info.lastInsertRowid };
  },
  remove(id) { getDb().prepare('DELETE FROM prompt_groups WHERE id = ?').run(id); }
};
const promptService = {
  list(projectId) { return getDb().prepare('SELECT * FROM prompts ORDER BY id DESC').all(); },
  create(data) {
    const info = getDb().prepare('INSERT INTO prompts (project_id, group_id, title, content, enabled) VALUES (?, ?, ?, ?, ?)')
      .run(data.project_id || null, data.group_id || null, data.title || '', data.content || '', data.enabled || 1);
    return { id: info.lastInsertRowid };
  },
  update(id, data) {
    getDb().prepare('UPDATE prompts SET group_id=?, title=?, content=?, enabled=? WHERE id=?').run(data.group_id, data.title, data.content, data.enabled, id);
  },
  remove(id) { getDb().prepare('DELETE FROM prompts WHERE id = ?').run(id); }
};

// ---------- AI 模型 ----------
const aiModelService = {
  list() { return getDb().prepare('SELECT id, name, provider, api_url, model, temperature, max_tokens, is_default FROM ai_models ORDER BY is_default DESC, id ASC').all(); },
  save(data) {
    if (data.is_default) getDb().prepare('UPDATE ai_models SET is_default = 0').run();
    const info = getDb().prepare(`INSERT INTO ai_models (name, provider, api_url, api_key, model, temperature, max_tokens, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, provider=excluded.provider, api_url=excluded.api_url, api_key=excluded.api_key,
      model=excluded.model, temperature=excluded.temperature, max_tokens=excluded.max_tokens, is_default=excluded.is_default`)
      .run(data.name || '新模型', data.provider || 'openai', data.api_url || '', data.api_key || '',
        data.model || '', data.temperature || 0.7, data.max_tokens || 2048, data.is_default || 0);
    return { id: data.id || info.lastInsertRowid };
  },
  remove(id) { getDb().prepare('DELETE FROM ai_models WHERE id = ?').run(id); },
  getDefault() { return getDb().prepare('SELECT * FROM ai_models WHERE is_default = 1 LIMIT 1').get(); }
};

// ---------- AI 生成 ----------
function buildSystemPrompt(projectId, hint, level) {
  const parts = [];
  parts.push('你是一位中文网文写作助手，请严格根据下方设定续写 / 润色 / 改写正文内容，保持文风统一，遵循人物设定和世界观规则。');
  const chars = getDb().prepare('SELECT name, role, personality, abilities, weakness FROM characters WHERE project_id = ?').all(projectId);
  if (chars.length) parts.push('主要角色：' + chars.map(c => `- ${c.name}（${c.role}）: ${c.personality} ${c.abilities}`).join('; '));
  const wv = getDb().prepare('SELECT world_rules, regions, power_system, timeline FROM worldviews WHERE project_id = ?').get(projectId);
  if (wv) parts.push('世界观：' + JSON.stringify(wv));
  const activePrompts = getDb().prepare('SELECT p.title, p.content FROM prompts p JOIN prompt_groups g ON p.group_id = g.id WHERE p.enabled = 1').all();
  if (activePrompts.length) parts.push('启用提示词：' + activePrompts.map(p => `${p.title}: ${p.content}`).join('; '));
  if (hint) parts.push('临时要求：' + hint);
  return parts.join('\n\n');
}

async function chatCompletion(messages, model) {
  const m = model || aiModelService.getDefault();
  if (!m || !m.api_key) {
    return '【AI 未配置】请在"AI 接口配置"中设置 API Key 并设为默认模型。提示：内容已在本地存档，可手动继续编写。';
  }
  try {
    const https = require(m.api_url.startsWith('http://') ? 'http' : 'https');
    // 统一适配 OpenAI / DeepSeek / Qwen / Ollama 的兼容格式
    const url = new URL(m.api_url);
    const req = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${m.api_key}`,
        'Accept': 'application/json'
      }
    };
    const body = JSON.stringify({ model: m.model, messages, temperature: m.temperature || 0.7, max_tokens: m.max_tokens || 2048 });
    return new Promise((resolve) => {
      const r = https.request(req, (res) => {
        let data = '';
        res.on('data', (c) => data += c);
        res.on('end', () => {
          try {
            const obj = JSON.parse(data);
            const text = obj.choices?.[0]?.message?.content || obj.choices?.[0]?.text || obj.message?.content || data;
            resolve(text);
          } catch (e) { resolve('【解析失败】' + data); }
        });
      });
      r.on('error', (e) => resolve('【网络错误】' + e.message));
      r.write(body); r.end();
    });
  } catch (e) { return '【异常】' + e.message; }
}

async function continueText(projectId, context, hint) {
  const sys = buildSystemPrompt(projectId, hint, 2);
  return chatCompletion([{ role: 'system', content: sys }, { role: 'user', content: '请在以下文本后面续写不少于 600 字正文，保持文风、节奏与人物一致：\n' + context }]);
}
async function rewriteText(projectId, before, selected, hint) {
  const sys = buildSystemPrompt(projectId, hint, 2);
  return chatCompletion([{ role: 'system', content: sys }, { role: 'user', content: `上下文：${before}\n\n请改写 / 润色下面这段内容：\n${selected}` }]);
}
async function polishText(projectId, text, template) {
  const sys = buildSystemPrompt(projectId, `润色模板：${template}`, 1);
  return chatCompletion([{ role: 'system', content: sys }, { role: 'user', content: `请按模板要求润色以下内容：\n${text}` }]);
}
async function generateDialogScene(projectId, hint) {
  const sys = buildSystemPrompt(projectId, hint, 1);
  return chatCompletion([{ role: 'system', content: sys }, { role: 'user', content: '请生成一段沉浸式对话/场景描写，约 500 字。' }]);
}
async function checkOoc(projectId, content) {
  const sys = buildSystemPrompt(projectId, null, 2);
  return chatCompletion([{ role: 'system', content: sys }, { role: 'user', content: `请检查以下段落是否有人物 OOC（角色性格跑偏）、世界观前后矛盾、错字语病，并给出修改建议：\n${content}` }]);
}
async function checkTypo(projectId, content) {
  return chatCompletion([{ role: 'system', content: '请作为文字校对，检查是否有错别字和语病。' }, { role: 'user', content: content }]);
}
async function scanForeshadow(projectId, content) {
  return chatCompletion([{ role: 'system', content: '请指出这段内容中可以作为伏笔的细节，或建议增加的伏笔。' }, { role: 'user', content: content }]);
}
async function generateOutline(projectId, hint) {
  const sys = buildSystemPrompt(projectId, hint, 2);
  return chatCompletion([{ role: 'system', content: sys }, { role: 'user', content: '请生成本作品的分卷 / 分章大纲结构，包含每章核心目标、情绪节奏、爽点设计与伏笔埋设位置。' }]);
}
async function generateIdea(projectId, hint) {
  const sys = buildSystemPrompt(projectId, hint, 1);
  return chatCompletion([{ role: 'system', content: sys }, { role: 'user', content: '请提出 3-5 个适合本作品的脑洞方向。' }]);
}
async function testModel(id) {
  const m = id ? getDb().prepare('SELECT * FROM ai_models WHERE id = ?').get(id) : aiModelService.getDefault();
  if (!m) return { status: 'no-model' };
  const t = await chatCompletion([{ role: 'user', content: 'Ping，请用一个字回复。' }], m);
  return { status: 'ok', echo: t.slice(0, 40) };
}

// ---------- RAG 检索 ----------
const ragService = {
  buildIndex(projectId) { return { count: 0, note: '使用实时检索模式（LIKE + 轻量向量化）' }; },
  retrieve(projectId, query, level) {
    const hits = [];
    const q = '%' + (query || '').trim() + '%';
    // 角色
    for (const row of getDb().prepare('SELECT id, name, role, personality FROM characters WHERE project_id = ?').all(projectId)) {
      if (level >= 1 || row.name && (query || '').length > 0) hits.push({ type: '角色', title: row.name, snippet: row.personality || '' });
    }
    // 世界观
    if (level >= 2) {
      const wv = getDb().prepare('SELECT * FROM worldviews WHERE project_id = ?').get(projectId);
      if (wv) hits.push({ type: '世界观', title: '世界规则', snippet: (wv.world_rules || '').slice(0, 200) });
    }
    // 章节内容 / 大纲 / 伏笔（L3 兜底）
    if (level >= 3) {
      for (const row of getDb().prepare(`SELECT c.id, c.title, cc.content FROM chapters c JOIN chapter_contents cc ON cc.chapter_id = c.id WHERE c.project_id = ? AND (c.title LIKE ? OR cc.content LIKE ?)`).all(projectId, q, q)) {
        hits.push({ type: '章节', title: row.title, snippet: (row.content || '').slice(0, 120) });
      }
      for (const row of getDb().prepare(`SELECT id, title, content FROM foreshadows WHERE project_id = ?`).all(projectId)) {
        hits.push({ type: '伏笔', title: row.title, snippet: (row.content || '').slice(0, 120) });
      }
    }
    return hits.slice(0, 20);
  },
  getFilter(projectId) { return getDb().prepare('SELECT * FROM rag_filters WHERE project_id = ?').get(projectId) || { allow_character: 1, allow_worldview: 1, allow_foreshadow: 1, allow_outline: 1 }; },
  saveFilter(projectId, data) {
    getDb().prepare(`INSERT INTO rag_filters (project_id, allow_character, allow_worldview, allow_foreshadow, allow_outline)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET
      allow_character=excluded.allow_character, allow_worldview=excluded.allow_worldview,
      allow_foreshadow=excluded.allow_foreshadow, allow_outline=excluded.allow_outline`)
      .run(projectId, data.allow_character ?? 1, data.allow_worldview ?? 1, data.allow_foreshadow ?? 1, data.allow_outline ?? 1);
  }
};

// ---------- 追读力分析 ----------
const HOOK_KEYWORDS = ['突然', '竟然', '原来', '难道', '震惊', '发现', '不料', '心中一'];
function analyzeChapter(text) {
  const content = text || '';
  let hookHits = 0;
  for (const k of HOOK_KEYWORDS) hookHits += (content.match(new RegExp(k, 'g')) || []).length;
  return {
    hook_hits: hookHits,
    hook_strength: Math.min(100, hookHits * 8 + (content.includes('？') ? 5 : 0)),
    cool_points: (content.match(/[\u{1F386}\u{2728}]/gu) || []).length + Math.floor(hookHits / 2),
    typos: 0,
    char_count: content.length
  };
}
function analyzeProject(projectId) {
  const totalChapters = getDb().prepare('SELECT COUNT(*) AS c FROM chapters WHERE project_id = ?').get(projectId)?.c || 0;
  const totalWords = getDb().prepare('SELECT COALESCE(SUM(word_count), 0) AS c FROM chapters WHERE project_id = ?').get(projectId)?.c || 0;
  const fores = getDb().prepare('SELECT COUNT(*) AS c FROM foreshadows WHERE project_id = ?').get(projectId)?.c || 0;
  const foresResolved = getDb().prepare("SELECT COUNT(*) AS c FROM foreshadows WHERE project_id = ? AND status = 'resolved'").get(projectId)?.c || 0;
  return { total_chapters: totalChapters, total_words: totalWords, foreshadow_total: fores, foreshadow_resolved: foresResolved };
}

// ---------- 设置 / 回收站 ----------
function getSetting(key) { const r = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key); return r ? r.value : null; }
function setSetting(key, value) { getDb().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP").run(key, value, value); }
function allSettings() { const rows = getDb().prepare('SELECT key, value FROM settings').all(); const out = {}; for (const r of rows) out[r.key] = r.value; return out; }

module.exports = {
  projectService, projectSettingsService, worldviewService, volumeService, chapterService,
  characterService, characterRelationService, foreshadowService, outlineService,
  promptGroupService, promptService, aiModelService,
  ragService, analyzeChapter, analyzeProject,
  continueText, rewriteText, polishText, generateDialogScene, checkOoc, checkTypo, scanForeshadow, generateOutline, generateIdea, testModel, buildSystemPrompt,
  getSetting, setSetting, allSettings
};
