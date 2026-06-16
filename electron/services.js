/** 业务服务层（作品 / 章节 / 设定 / 角色 / 势力 / 物品 / 伏笔 / 大纲 / 提示词 / AI / RAG / 分析 / 设置）*/
const { getDb } = require('./db/db.js');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ---------- 作品 ----------
const projectService = {
  list(genre, keyword, sortBy = 'updated_at') {
    const params = [];
    let sql = 'SELECT p.*, '
      + '(SELECT COUNT(*) FROM chapters c WHERE c.project_id = p.id) AS chapter_count '
      + 'FROM projects p WHERE p.deleted = 0';
    if (genre && genre !== '全部') { sql += ' AND p.genre = ?'; params.push(genre); }
    if (keyword) { sql += ' AND p.name LIKE ?'; params.push(`%${keyword}%`); }
    const order = sortBy === 'created_at' ? 'p.created_at DESC' : 'p.updated_at DESC';
    sql += ' ORDER BY ' + order;
    return getDb().prepare(sql).all(...params);
  },
  listRecycle() {
    return getDb().prepare('SELECT * FROM projects WHERE deleted = 1 ORDER BY updated_at DESC').all();
  },
  get(id) { return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id); },
  create(data) {
    const info = getDb().prepare(
      'INSERT INTO projects (name, genre, description, core_conflict, status, word_count, progress) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      data.name || '未命名',
      data.genre || '玄幻',
      data.description || '',
      data.core_conflict || '',
      data.status || 'serializing',
      0, 0
    );
    return { id: info.lastInsertRowid };
  },
  update(id, data) {
    getDb().prepare(
      'UPDATE projects SET name = ?, genre = ?, description = ?, cover_data = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(
      data.name, data.genre, data.description || '', data.cover_data || null, data.status || 'serializing', id
    );
  },
  softDelete(id) {
    const p = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (p) getDb().prepare('INSERT INTO recycle_bin (entity_type, entity_id, snapshot) VALUES (?, ?, ?)')
      .run('project', id, JSON.stringify(p));
    getDb().prepare('UPDATE projects SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  },
  restore(id) {
    getDb().prepare('UPDATE projects SET deleted = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    getDb().prepare('DELETE FROM recycle_bin WHERE entity_type = \'project\' AND entity_id = ?').run(id);
  },
  exportJson(id) {
    const project = this.get(id);
    if (!project) return null;
    const volumes = getDb().prepare('SELECT * FROM volumes WHERE project_id = ?').all(id);
    const chapters = getDb().prepare('SELECT * FROM chapters WHERE project_id = ?').all(id);
    const characters = getDb().prepare('SELECT * FROM characters WHERE project_id = ?').all(id);
    const worldviews = getDb().prepare('SELECT * FROM worldviews WHERE project_id = ?').get(id);
    const foreshadowings = getDb().prepare('SELECT * FROM foreshadowings WHERE project_id = ?').all(id);
    const outlines = getDb().prepare('SELECT * FROM outlines WHERE project_id = ?').all(id);
    return { project, volumes, chapters, characters, worldviews, foreshadowings, outlines };
  }
};

// ---------- 项目总设定 ----------
const projectSettingsService = {
  get(projectId) {
    const r = getDb().prepare('SELECT * FROM project_settings WHERE project_id = ?').get(projectId);
    return r || { project_id: projectId, core_sell: '', core_conflict: '', opening_hook: '', target_audience: '', taboos: '', style: '' };
  },
  save(projectId, data) {
    getDb().prepare(
      `INSERT INTO project_settings (project_id, core_sell, core_conflict, opening_hook, target_audience, taboos, style)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         core_sell = excluded.core_sell, core_conflict = excluded.core_conflict, opening_hook = excluded.opening_hook,
         target_audience = excluded.target_audience, taboos = excluded.taboos, style = excluded.style`
    ).run(
      projectId,
      data.core_sell || '', data.core_conflict || '', data.opening_hook || '',
      data.target_audience || '', data.taboos || '', data.style || ''
    );
  }
};

// ---------- 世界观 ----------
const worldviewService = {
  get(projectId) {
    const r = getDb().prepare('SELECT * FROM worldviews WHERE project_id = ?').get(projectId);
    return r || { project_id: projectId, base_rules: '', time_line: '', geography: '', terminology: '', power_levels: '' };
  },
  save(projectId, data) {
    getDb().prepare(
      `INSERT INTO worldviews (project_id, base_rules, time_line, geography, terminology, power_levels)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         base_rules = excluded.base_rules, time_line = excluded.time_line, geography = excluded.geography,
         terminology = excluded.terminology, power_levels = excluded.power_levels`
    ).run(
      projectId, data.base_rules || '', data.time_line || '', data.geography || '',
      data.terminology || '', data.power_levels || ''
    );
  }
};

// ---------- 势力 ----------
const factionService = {
  list(projectId) { return getDb().prepare('SELECT * FROM factions WHERE project_id = ? ORDER BY id ASC').all(projectId); },
  upsert(projectId, data) {
    const info = getDb().prepare(
      `INSERT INTO factions (id, project_id, name, category, stance, territory, core_people, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, category = excluded.category, stance = excluded.stance,
         territory = excluded.territory, core_people = excluded.core_people, description = excluded.description`
    ).run(data.id || null, projectId, data.name || '新势力', data.category || 'sect', data.stance || '',
      data.territory || '', data.core_people || '', data.description || '');
    return { id: data.id || info.lastInsertRowid };
  },
  remove(id) { getDb().prepare('DELETE FROM factions WHERE id = ?').run(id); }
};

// ---------- 物品 ----------
const artifactService = {
  list(projectId) { return getDb().prepare('SELECT * FROM artifacts WHERE project_id = ? ORDER BY id ASC').all(projectId); },
  upsert(projectId, data) {
    const info = getDb().prepare(
      `INSERT INTO artifacts (id, project_id, name, category, attributes, origin, usage, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, category = excluded.category, attributes = excluded.attributes,
         origin = excluded.origin, usage = excluded.usage, description = excluded.description`
    ).run(data.id || null, projectId, data.name || '新物品', data.category || 'item',
      data.attributes || '', data.origin || '', data.usage || '', data.description || '');
    return { id: data.id || info.lastInsertRowid };
  },
  remove(id) { getDb().prepare('DELETE FROM artifacts WHERE id = ?').run(id); }
};

// ---------- 卷 ----------
const volumeService = {
  list(projectId) { return getDb().prepare('SELECT * FROM volumes WHERE project_id = ? ORDER BY sort_order ASC, id ASC').all(projectId); },
  create(projectId, title) {
    const info = getDb().prepare('INSERT INTO volumes (project_id, title, sort_order) VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM volumes WHERE project_id = ?))')
      .run(projectId, title || '新卷', projectId);
    return { id: info.lastInsertRowid };
  },
  update(id, data) { getDb().prepare('UPDATE volumes SET title = ?, summary = ? WHERE id = ?').run(data.title || '', data.summary || '', id); },
  remove(id) { getDb().prepare('DELETE FROM volumes WHERE id = ?').run(id); }
};

// ---------- 章节 ----------
const chapterService = {
  list(projectId) { return getDb().prepare('SELECT * FROM chapters WHERE project_id = ? ORDER BY volume_id, sort_order ASC, id ASC').all(projectId); },
  get(id) { return getDb().prepare('SELECT * FROM chapters WHERE id = ?').get(id); },
  create(projectId, data) {
    const info = getDb().prepare('INSERT INTO chapters (project_id, volume_id, parent_id, title, summary, status, sort_order) VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM chapters WHERE project_id = ?))')
      .run(projectId, data.volume_id || null, data.parent_id || null, data.title || '新章节', data.summary || '', data.status || 'todo', projectId);
    return { id: info.lastInsertRowid };
  },
  update(id, data) {
    getDb().prepare('UPDATE chapters SET title = ?, summary = ?, status = ?, volume_id = ?, parent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(data.title, data.summary || '', data.status || 'todo', data.volume_id || null, data.parent_id || null, id);
  },
  remove(id) {
    getDb().prepare('DELETE FROM chapter_contents WHERE chapter_id = ?').run(id);
    getDb().prepare('DELETE FROM chapters WHERE id = ?').run(id);
  },
  getContent(id) {
    const r = getDb().prepare('SELECT id, content FROM chapter_contents WHERE chapter_id = ? ORDER BY id DESC LIMIT 1').get(id);
    return r || { id: 0, content: '' };
  },
  saveContent(id, content, tag) {
    const info = getDb().prepare('INSERT INTO chapter_contents (chapter_id, content, version_tag) VALUES (?, ?, ?)')
      .run(id, content || '', tag || 'auto');
    const words = (content || '').length;
    getDb().prepare('UPDATE chapters SET word_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(words, id);
    const ch = getDb().prepare('SELECT project_id FROM chapters WHERE id = ?').get(id);
    if (ch) {
      const totals = getDb().prepare('SELECT COALESCE(SUM(word_count), 0) AS w, COUNT(*) AS c FROM chapters WHERE project_id = ?').get(ch.project_id);
      getDb().prepare('UPDATE projects SET word_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(totals.w, ch.project_id);
    }
    return { id: info.lastInsertRowid, words };
  },
  history(id) { return getDb().prepare('SELECT id, version_tag, created_at FROM chapter_contents WHERE chapter_id = ? ORDER BY id DESC LIMIT 30').all(id); }
};

// ---------- 角色 ----------
const characterService = {
  list(projectId) { return getDb().prepare('SELECT * FROM characters WHERE project_id = ? ORDER BY id ASC').all(projectId); },
  create(projectId, data) {
    const info = getDb().prepare(
      `INSERT INTO characters (project_id, name, role, appearance, personality, background,
        abilities, weakness, first_chapter, current_status, relationships, pos_x, pos_y)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      projectId, data.name || '新角色', data.role || 'supporting', data.appearance || '',
      data.personality || '', data.background || '', data.abilities || '', data.weakness || '',
      data.first_chapter || '', data.current_status || '', data.relationships || '',
      typeof data.pos_x === 'number' ? data.pos_x : Math.random() * 300,
      typeof data.pos_y === 'number' ? data.pos_y : Math.random() * 300
    );
    return { id: info.lastInsertRowid };
  },
  update(id, data) {
    getDb().prepare(
      `UPDATE characters SET name = ?, role = ?, appearance = ?, personality = ?, background = ?,
        abilities = ?, weakness = ?, first_chapter = ?, current_status = ?, relationships = ?,
        pos_x = ?, pos_y = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(
      data.name, data.role || 'supporting', data.appearance || '', data.personality || '',
      data.background || '', data.abilities || '', data.weakness || '', data.first_chapter || '',
      data.current_status || '', data.relationships || '',
      typeof data.pos_x === 'number' ? data.pos_x : 0, typeof data.pos_y === 'number' ? data.pos_y : 0, id
    );
  },
  remove(id) { getDb().prepare('DELETE FROM characters WHERE id = ?').run(id); }
};

const characterRelationService = {
  list(projectId) {
    return getDb().prepare(
      `SELECT cr.*, s.name AS source_name, t.name AS target_name
       FROM character_relations cr
       LEFT JOIN characters s ON s.id = cr.source_id
       LEFT JOIN characters t ON t.id = cr.target_id
       WHERE cr.project_id = ?`
    ).all(projectId);
  },
  create(projectId, data) {
    const info = getDb().prepare('INSERT INTO character_relations (project_id, source_id, target_id, relation_type, label, weight, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(projectId, data.source_id, data.target_id, data.relation_type || 'friend', data.label || '', data.weight || 1, data.note || '');
    return { id: info.lastInsertRowid };
  },
  update(id, data) {
    getDb().prepare('UPDATE character_relations SET relation_type = ?, label = ?, weight = ?, note = ? WHERE id = ?')
      .run(data.relation_type || 'friend', data.label || '', data.weight || 1, data.note || '', id);
  },
  remove(id) { getDb().prepare('DELETE FROM character_relations WHERE id = ?').run(id); }
};

// ---------- 势力 / 物品（兼容旧的 factions / artifacts 表结构）
const factionServiceLegacy = {
  list(projectId) {
    const rows = getDb().prepare('SELECT * FROM factions WHERE project_id = ? ORDER BY id ASC').all(projectId);
    return rows;
  },
  upsert(projectId, data) {
    const stmt = data.id
      ? `UPDATE factions SET name=?, category=?, stance=?, territory=?, core_people=?, description=? WHERE id=?`
      : `INSERT INTO factions (project_id, name, category, stance, territory, core_people, description) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const params = data.id
      ? [data.name || '', data.category || 'sect', data.stance || '', data.territory || '', data.core_people || '', data.description || '', data.id]
      : [projectId, data.name || '新势力', data.category || 'sect', data.stance || '', data.territory || '', data.core_people || '', data.description || ''];
    const info = getDb().prepare(stmt).run(...params);
    return { id: data.id || info.lastInsertRowid };
  },
  remove(id) { getDb().prepare('DELETE FROM factions WHERE id = ?').run(id); }
};
const artifactServiceLegacy = {
  list(projectId) { return getDb().prepare('SELECT * FROM artifacts WHERE project_id = ? ORDER BY id ASC').all(projectId); },
  upsert(projectId, data) {
    const stmt = data.id
      ? `UPDATE artifacts SET name=?, category=?, attributes=?, origin=?, usage=?, description=? WHERE id=?`
      : `INSERT INTO artifacts (project_id, name, category, attributes, origin, usage, description) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const params = data.id
      ? [data.name || '', data.category || 'item', data.attributes || '', data.origin || '', data.usage || '', data.description || '', data.id]
      : [projectId, data.name || '新物品', data.category || 'item', data.attributes || '', data.origin || '', data.usage || '', data.description || ''];
    const info = getDb().prepare(stmt).run(...params);
    return { id: data.id || info.lastInsertRowid };
  },
  remove(id) { getDb().prepare('DELETE FROM artifacts WHERE id = ?').run(id); }
};

// ---------- 伏笔 ----------
const foreshadowService = {
  list(projectId) { return getDb().prepare('SELECT * FROM foreshadowings WHERE project_id = ? ORDER BY priority DESC, id ASC').all(projectId); },
  create(projectId, data) {
    const info = getDb().prepare('INSERT INTO foreshadowings (project_id, title, content, status, planted_chapter_id, recovered_chapter_id, priority) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(projectId, data.title || '新伏笔', data.content || '', data.status || 'todo',
        data.planted_chapter_id || null, data.recovered_chapter_id || null, data.priority || 2);
    return { id: info.lastInsertRowid };
  },
  update(id, data) {
    getDb().prepare('UPDATE foreshadowings SET title = ?, content = ?, status = ?, planted_chapter_id = ?, recovered_chapter_id = ?, priority = ? WHERE id = ?')
      .run(data.title, data.content || '', data.status || 'todo',
        data.planted_chapter_id || null, data.recovered_chapter_id || null, data.priority || 2, id);
  },
  remove(id) { getDb().prepare('DELETE FROM foreshadowings WHERE id = ?').run(id); }
};

// ---------- 大纲 ----------
const outlineService = {
  tree(projectId) { return getDb().prepare('SELECT * FROM outlines WHERE project_id = ? ORDER BY sort_order ASC, id ASC').all(projectId); },
  save(projectId, data) {
    const goal = data.goal || data.core_goal || '';
    const info = getDb().prepare(
      `INSERT INTO outlines (id, project_id, parent_id, level, title, goal, summary, plot, pleasure, foreshadow, mood, body, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         parent_id = excluded.parent_id, level = excluded.level, title = excluded.title, goal = excluded.goal,
         summary = excluded.summary, plot = excluded.plot, pleasure = excluded.pleasure, foreshadow = excluded.foreshadow,
         mood = excluded.mood, body = excluded.body, sort_order = excluded.sort_order`
    ).run(
      data.id || null, projectId, data.parent_id || null, data.level || 2, data.title || '',
      goal, data.summary || '', data.plot || '', data.pleasure || '', data.foreshadow || '',
      data.mood || '', data.body || '', data.sort_order || 0
    );
    return { id: data.id || info.lastInsertRowid };
  },
  remove(id) { getDb().prepare('DELETE FROM outlines WHERE id = ?').run(id); }
};

// ---------- 提示词分组 / 提示词 ----------
const promptGroupService = {
  list() { return getDb().prepare('SELECT * FROM prompt_groups ORDER BY sort_order ASC, id ASC').all(); },
  save(data) {
    const info = getDb().prepare(
      `INSERT INTO prompt_groups (id, name, sort_order) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order`
    ).run(data.id || null, data.name || '新分组', data.sort_order || 0);
    return { id: data.id || info.lastInsertRowid };
  },
  remove(id) {
    const g = getDb().prepare('SELECT builtin FROM prompt_groups WHERE id = ?').get(id);
    if (g && g.builtin) throw new Error('内置分组不可删除');
    getDb().prepare('DELETE FROM prompts WHERE group_id = ?').run(id);
    getDb().prepare('DELETE FROM prompt_groups WHERE id = ?').run(id);
  }
};
const promptService = {
  list(projectId) {
    let sql = 'SELECT p.*, g.name AS group_name FROM prompts p LEFT JOIN prompt_groups g ON g.id = p.group_id WHERE 1=1';
    const params = [];
    if (projectId) { sql += ' AND (p.project_id IS NULL OR p.project_id = ?)'; params.push(projectId); }
    sql += ' ORDER BY p.priority DESC, p.id ASC';
    return getDb().prepare(sql).all(...params);
  },
  create(data) {
    const info = getDb().prepare('INSERT INTO prompts (group_id, project_id, name, content, enabled, priority) VALUES (?, ?, ?, ?, ?, ?)')
      .run(data.group_id, data.project_id || null, data.name || '新提示词', data.content || '', data.enabled ? 1 : 0, data.priority || 1);
    return { id: info.lastInsertRowid };
  },
  update(id, data) {
    getDb().prepare('UPDATE prompts SET group_id = ?, name = ?, content = ?, enabled = ?, priority = ? WHERE id = ?')
      .run(data.group_id, data.name, data.content || '', data.enabled ? 1 : 0, data.priority || 1, id);
  },
  remove(id) { getDb().prepare('DELETE FROM prompts WHERE id = ?').run(id); }
};

// ---------- AI 模型 ----------
const aiModelService = {
  list() { return getDb().prepare('SELECT * FROM ai_models ORDER BY is_default DESC, id ASC').all(); },
  save(data) {
    if (data.is_default) getDb().prepare('UPDATE ai_models SET is_default = 0').run();
    const info = getDb().prepare(
      `INSERT INTO ai_models (id, name, provider, base_url, api_key, model_name, temperature, max_tokens, context_len, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, provider = excluded.provider, base_url = excluded.base_url, api_key = excluded.api_key,
         model_name = excluded.model_name, temperature = excluded.temperature, max_tokens = excluded.max_tokens,
         context_len = excluded.context_len, is_default = excluded.is_default`
    ).run(
      data.id || null, data.name || '新模型', data.provider || 'custom', data.base_url || '',
      data.api_key || '', data.model_name || '', Number(data.temperature) || 0.7,
      Number(data.max_tokens) || 2048, Number(data.context_len) || 8000, data.is_default ? 1 : 0
    );
    return { id: data.id || info.lastInsertRowid };
  },
  remove(id) { getDb().prepare('DELETE FROM ai_models WHERE id = ?').run(id); },
  getDefault() { return getDb().prepare('SELECT * FROM ai_models WHERE is_default = 1 LIMIT 1').get(); }
};

// ---------- RAG 上下文拼装 ----------
function buildSystemPrompt(projectId, hint, level) {
  const parts = [];
  parts.push('你是一位中文网文写作助手，请严格根据下方设定续写 / 润色 / 改写正文内容，保持文风统一，遵循人物设定与世界观规则。');

  const proj = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (proj) parts.push(`作品：${proj.name}（${proj.genre}）${proj.description ? '，' + proj.description : ''}`);

  if (level >= 1) {
    const chars = getDb().prepare('SELECT id, name, role, personality, abilities, current_status FROM characters WHERE project_id = ? ORDER BY id ASC LIMIT 20').all(projectId);
    if (chars.length) parts.push('主要角色：\n' + chars.map(c => `- ${c.name}（${c.role}）${c.personality ? '：' + c.personality : ''}${c.abilities ? '；能力：' + c.abilities : ''}${c.current_status ? '；当前剧情状态：' + c.current_status : ''}`).join('\n'));
  }

  if (level >= 2) {
    const wv = getDb().prepare('SELECT * FROM worldviews WHERE project_id = ?').get(projectId);
    if (wv) {
      const wp = [];
      if (wv.base_rules) wp.push(`世界规则：${wv.base_rules}`);
      if (wv.time_line) wp.push(`时间线：${wv.time_line}`);
      if (wv.geography) wp.push(`地域：${wv.geography}`);
      if (wv.power_levels) wp.push(`力量等级：${wv.power_levels}`);
      if (wv.terminology) wp.push(`专属术语：${wv.terminology}`);
      if (wp.length) parts.push('世界观：\n' + wp.join('\n'));
    }
    const facts = getDb().prepare('SELECT * FROM factions WHERE project_id = ?').all(projectId);
    if (facts.length) parts.push('主要势力：\n' + facts.map(f => `- ${f.name}（${f.category}）${f.stance ? '，立场：' + f.stance : ''}${f.territory ? '，地盘：' + f.territory : ''}${f.core_people ? '，核心人物：' + f.core_people : ''}`).join('\n'));
    const arts = getDb().prepare('SELECT * FROM artifacts WHERE project_id = ? LIMIT 20').all(projectId);
    if (arts.length) parts.push('重要物品 / 功法：\n' + arts.map(a => `- ${a.name}（${a.category}）${a.usage ? '：' + a.usage : ''}`).join('\n'));
  }

  if (level >= 3) {
    const fores = getDb().prepare('SELECT title, content, status FROM foreshadowings WHERE project_id = ? ORDER BY priority DESC LIMIT 20').all(projectId);
    if (fores.length) parts.push('已埋设 / 待回收伏笔：\n' + fores.map(f => `· [${f.status}] ${f.title}${f.content ? ' - ' + f.content : ''}`).join('\n'));
    const recent = getDb().prepare(`SELECT c.title, cc.content FROM chapters c
      JOIN chapter_contents cc ON cc.chapter_id = c.id WHERE c.project_id = ?
      ORDER BY cc.id DESC LIMIT 2`).all(projectId);
    if (recent.length) parts.push('最近章节摘要（保持连贯）：\n' + recent.map((r, i) => `章节《${r.title}》：${(r.content || '').slice(0, 500)}`).join('\n'));
  }

  const activePrompts = getDb().prepare('SELECT p.name, p.content FROM prompts p WHERE p.enabled = 1 ORDER BY p.priority DESC, p.id ASC LIMIT 20').all();
  if (activePrompts.length) parts.push('提示词规则：\n' + activePrompts.map(p => `- ${p.name}：${p.content}`).join('\n'));

  if (hint) parts.push('临时写作要求：' + hint);
  return parts.join('\n\n');
}

async function chatCompletion(messages, modelOverride) {
  const m = modelOverride || aiModelService.getDefault();
  if (!m || !m.api_key) return { text: '【AI 未配置】请在「提示词 / AI 接口」填入 API Key 并设为默认模型。', ok: false };
  const baseUrl = m.base_url || 'https://api.deepseek.com/chat/completions';
  return new Promise((resolve) => {
    try {
      const url = new URL(baseUrl);
      const req = (url.protocol === 'https:' ? https : http).request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${m.api_key}`,
          'Accept': 'application/json'
        },
        timeout: 120_000
      }, (res) => {
        let data = '';
        res.on('data', (c) => data += c);
        res.on('end', () => {
          try {
            const obj = JSON.parse(data);
            const text = obj.choices?.[0]?.message?.content || obj.choices?.[0]?.text || obj.message?.content || data;
            resolve({ text, ok: true });
          } catch (e) { resolve({ text: '【解析失败】' + data, ok: false }); }
        });
      });
      req.on('error', (e) => resolve({ text: '【网络错误】' + e.message, ok: false }));
      req.on('timeout', () => { req.destroy(new Error('请求超时')); });
      const body = JSON.stringify({ model: m.model_name || 'deepseek-chat', messages, temperature: Number(m.temperature) || 0.7, max_tokens: Number(m.max_tokens) || 2048 });
      req.write(body);
      req.end();
    } catch (e) { resolve({ text: '【异常】' + e.message, ok: false }); }
  });
}

async function continueText(projectId, context, hint, level) {
  const sys = buildSystemPrompt(projectId, hint, Number(level) || 2);
  const r = await chatCompletion([
    { role: 'system', content: sys },
    { role: 'user', content: '请接在以下文字后面续写不少于 600 字正文（保持风格、人物与世界观连贯）：\n' + (context || '').slice(-2400) }
  ]);
  return r;
}
async function rewriteText(projectId, before, selected, hint, level) {
  const sys = buildSystemPrompt(projectId, hint, Number(level) || 2);
  const r = await chatCompletion([
    { role: 'system', content: sys },
    { role: 'user', content: `上下文（最近章节）：${before}\n\n请改写/润色/重写以下片段，使其更符合作品设定，并输出改写后的完整内容：\n${selected}` }
  ]);
  return r;
}
async function polishText(projectId, text, template, level) {
  const sys = buildSystemPrompt(projectId, '润色模板：' + (template || '基础润色'), Number(level) || 1);
  const r = await chatCompletion([
    { role: 'system', content: sys },
    { role: 'user', content: `请按模板要求润色以下内容，仅输出润色后的正文：\n${text || ''}` }
  ]);
  return r;
}
async function generateDialogScene(projectId, hint, level) {
  const sys = buildSystemPrompt(projectId, hint, Number(level) || 1);
  const r = await chatCompletion([
    { role: 'system', content: sys },
    { role: 'user', content: '请生成一段沉浸式的对话或场景描写（约 400~800 字）。' }
  ]);
  return r;
}
async function checkOoc(projectId, content, level) {
  const sys = buildSystemPrompt(projectId, null, Number(level) || 2);
  const r = await chatCompletion([
    { role: 'system', content: sys },
    { role: 'user', content: `请检查以下段落是否出现人物性格跑偏、世界观规则矛盾、逻辑漏洞或错字语病，并给出修改建议：\n${content}` }
  ]);
  return r;
}
async function checkTypo(projectId, content) {
  const r = await chatCompletion([
    { role: 'system', content: '你是文字校对，请检查以下段落是否存在错别字、语病或不通顺之处，给出简明修改建议。' },
    { role: 'user', content: content || '' }
  ]);
  return r;
}
async function scanForeshadow(projectId, content) {
  const r = await chatCompletion([
    { role: 'system', content: '请指出这段内容中可以作为伏笔的细节，或建议新增的伏笔；每一条以「·」开头。' },
    { role: 'user', content: content || '' }
  ]);
  return r;
}
async function generateOutline(projectId, hint, level) {
  const sys = buildSystemPrompt(projectId, hint, Number(level) || 2);
  const r = await chatCompletion([
    { role: 'system', content: sys },
    { role: 'user', content: '请生成本作品的分卷 / 分章大纲，包含每章核心目标、剧情走向、爽点、伏笔埋设位置及情绪节奏。' }
  ]);
  return r;
}
async function generateIdea(projectId, hint, level) {
  const sys = buildSystemPrompt(projectId, hint, Number(level) || 1);
  const r = await chatCompletion([
    { role: 'system', content: sys },
    { role: 'user', content: '请提出 3~5 个适合本作品的脑洞或剧情走向建议。' }
  ]);
  return r;
}
async function testModel(id) {
  const m = id ? getDb().prepare('SELECT * FROM ai_models WHERE id = ?').get(id) : aiModelService.getDefault();
  if (!m) return { ok: false, text: '未找到模型。' };
  const r = await chatCompletion([{ role: 'user', content: 'Ping，请用一个字回复。' }], m);
  return r;
}

// ---------- RAG 检索 ----------
const ragService = {
  retrieve(projectId, query, level) {
    const hits = [];
    const lv = Number(level) || 2;
    const kw = (query || '').trim();

    const chars = getDb().prepare('SELECT * FROM characters WHERE project_id = ?').all(projectId);
    if (chars.length) {
      const filtered = kw ? chars.filter(c => (c.name || '').includes(kw) || (c.personality || '').includes(kw)) : chars.slice(0, 10);
      for (const c of filtered.slice(0, 20)) hits.push({
        type: '角色', title: c.name,
        snippet: `${c.role}｜${c.personality || ''}${c.abilities ? '；能力：' + c.abilities : ''}`,
        id: c.id
      });
    }

    if (lv >= 2) {
      const wv = getDb().prepare('SELECT * FROM worldviews WHERE project_id = ?').get(projectId);
      if (wv) hits.push({ type: '世界观', title: '世界设定', snippet: `${wv.base_rules || ''} ${wv.geography || ''} ${wv.power_levels || ''}`.slice(0, 200) });
      for (const f of getDb().prepare('SELECT * FROM factions WHERE project_id = ?').all(projectId)) {
        hits.push({ type: '势力', title: f.name, snippet: `${f.category}｜${f.stance || ''}｜${f.description || ''}`.slice(0, 160), id: f.id });
      }
      for (const a of getDb().prepare('SELECT * FROM artifacts WHERE project_id = ?').all(projectId)) {
        hits.push({ type: '物品', title: a.name, snippet: `${a.category}｜${a.usage || ''}｜${a.description || ''}`.slice(0, 160), id: a.id });
      }
    }

    if (lv >= 3) {
      for (const f of getDb().prepare('SELECT * FROM foreshadowings WHERE project_id = ? ORDER BY priority DESC').all(projectId)) {
        hits.push({ type: '伏笔', title: f.title, snippet: `[${f.status}] ${f.content || ''}`.slice(0, 160), id: f.id });
      }
      const like = kw ? `%${kw}%` : null;
      const chSql = like
        ? `SELECT c.id, c.title, cc.content FROM chapters c JOIN chapter_contents cc ON cc.chapter_id = c.id WHERE c.project_id = ? AND (c.title LIKE ? OR cc.content LIKE ?) ORDER BY cc.id DESC LIMIT 5`
        : `SELECT c.id, c.title, cc.content FROM chapters c JOIN chapter_contents cc ON cc.chapter_id = c.id WHERE c.project_id = ? ORDER BY cc.id DESC LIMIT 3`;
      const chRows = like ? getDb().prepare(chSql).all(projectId, like, like) : getDb().prepare(chSql).all(projectId);
      for (const r of chRows) hits.push({ type: '章节', title: r.title, snippet: (r.content || '').slice(0, 200), id: r.id });
    }

    // 过滤白名单 / 黑名单
    const filters = getDb().prepare("SELECT * FROM rag_filters WHERE project_id = ? AND filter_type IN ('whitelist', 'blacklist')").all(projectId);
    const wl = filters.find(f => f.filter_type === 'whitelist');
    const bl = filters.find(f => f.filter_type === 'blacklist');
    let result = hits;
    if (wl && wl.scope) {
      try {
        const sc = JSON.parse(wl.scope);
        result = result.filter(h => !h.id || !sc || !(sc as any).length || (sc as any).includes(h.type));
      } catch (_) {}
    }
    if (bl && bl.scope) {
      try {
        const sc = JSON.parse(bl.scope);
        result = result.filter(h => !h.id || !sc.includes(h.type));
      } catch (_) {}
    }
    return result.slice(0, 50);
  },
  getFilters(projectId) {
    const rows = getDb().prepare('SELECT * FROM rag_filters WHERE project_id = ?').all(projectId);
    const out = { whitelist: '', blacklist: '' };
    for (const r of rows) if (r.filter_type === 'whitelist' || r.filter_type === 'blacklist') out[r.filter_type] = r.scope || '';
    return out;
  },
  saveFilter(projectId, type, scope) {
    getDb().prepare(
      `INSERT INTO rag_filters (project_id, filter_type, scope) VALUES (?, ?, ?)
       ON CONFLICT(project_id, filter_type) DO UPDATE SET scope = excluded.scope`
    ).run(projectId, type, scope || '');
  }
};

// ---------- 追读力分析 ----------
const HOOK_KEYWORDS = ['突然', '竟然', '原来', '难道', '震惊', '发现', '不料', '心中一', '眉头一', '冷然', '骇然', '居然', '谁知', '蓦然'];
const PLEASURE_KEYWORDS = ['一掌', '轰', '剑光', '冷笑', '踏破', '威压', '霸气', '傲然', '横扫', '突破', '突破', '秒杀', '一剑', '大笑'];
function analyzeChapter(text) {
  const content = text || '';
  let hookHits = 0, pleasureHits = 0;
  for (const k of HOOK_KEYWORDS) hookHits += (content.match(new RegExp(k, 'g')) || []).length;
  for (const k of PLEASURE_KEYWORDS) pleasureHits += (content.match(new RegExp(k, 'g')) || []).length;
  const sentences = (content.split(/[。！？\.]/).filter(s => s.trim().length > 0)).length;
  const hookStrength = Math.min(100, hookHits * 7 + (content.includes('？') ? 3 : 0));
  const oocRisk = content.length > 4000 ? 20 : Math.floor(content.length / 200);
  return {
    hook_hits: hookHits,
    hook_strength: hookStrength,
    pleasure_hits: pleasureHits,
    pleasure_density: Math.min(100, Math.floor((pleasureHits / Math.max(1, sentences / 10)) * 15)),
    sentences,
    char_count: content.length,
    ooc_risk: Math.min(60, oocRisk)
  };
}
function analyzeProject(projectId) {
  const totalChapters = getDb().prepare('SELECT COUNT(*) AS c FROM chapters WHERE project_id = ?').get(projectId)?.c || 0;
  const totalWords = getDb().prepare('SELECT COALESCE(SUM(word_count), 0) AS w FROM chapters WHERE project_id = ?').get(projectId)?.w || 0;
  const foresTotal = getDb().prepare('SELECT COUNT(*) AS c FROM foreshadowings WHERE project_id = ?').get(projectId)?.c || 0;
  const foresResolved = getDb().prepare("SELECT COUNT(*) AS c FROM foreshadowings WHERE project_id = ? AND status = 'recovered'").get(projectId)?.c || 0;
  const foresPlanted = getDb().prepare("SELECT COUNT(*) AS c FROM foreshadowings WHERE project_id = ? AND status = 'planted'").get(projectId)?.c || 0;
  return {
    total_chapters: totalChapters,
    total_words: totalWords,
    foreshadow_total: foresTotal,
    foreshadow_planted: foresPlanted,
    foreshadow_resolved: foresResolved
  };
}

// ---------- 素材库 ----------
const materialService = {
  list(projectId, category) {
    let sql = 'SELECT * FROM materials WHERE 1=1';
    const params: any[] = [];
    if (projectId) { sql += ' AND (project_id = ? OR project_id IS NULL)'; params.push(projectId); }
    else { sql += ' AND project_id IS NULL'; }
    if (category) { sql += ' AND category = ?'; params.push(category); }
    sql += ' ORDER BY sort_order ASC, id ASC';
    return getDb().prepare(sql).all(...params);
  },
  get(id) { return getDb().prepare('SELECT * FROM materials WHERE id = ?').get(id); },
  upsert(data) {
    const info = getDb().prepare(
      `INSERT INTO materials (id, project_id, category, title, body, source_file, tags, notes, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         project_id = excluded.project_id, category = excluded.category, title = excluded.title,
         body = excluded.body, source_file = excluded.source_file, tags = excluded.tags,
         notes = excluded.notes, sort_order = excluded.sort_order, updated_at = CURRENT_TIMESTAMP`
    ).run(
      data.id || null, data.project_id || null, data.category || 'general',
      data.title || '未命名素材', data.body || '', data.source_file || '',
      data.tags || '', data.notes || '', Number(data.sort_order) || 0
    );
    return { id: data.id || info.lastInsertRowid };
  },
  remove(id) { getDb().prepare('DELETE FROM materials WHERE id = ?').run(id); },
  bulkImport(projectId, category, rows) {
    const stmt = getDb().prepare(
      'INSERT INTO materials (project_id, category, title, body, source_file, tags, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    let n = 0;
    const tx = getDb().prepare('BEGIN');
    tx.run();
    try {
      for (const r of rows || []) {
        stmt.run(projectId || null, category || 'general', r.title || '未命名', r.body || '',
          r.source_file || '', r.tags || '', r.notes || '');
        n++;
      }
      getDb().prepare('COMMIT').run();
    } catch (e) {
      getDb().prepare('ROLLBACK').run();
      throw e;
    }
    return { imported: n };
  },
  // 按章节文本一行一章自动切分生成章节
  importChapterText(projectId, volumeId, text, splitByBlankLine) {
    if (!text) return { imported: 0 };
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const chapters: any[] = [];
    if (splitByBlankLine) {
      const blocks: string[] = [];
      let buf: string[] = [];
      for (const l of text.split(/\r?\n/)) {
        if (l.trim() === '') {
          if (buf.length) { blocks.push(buf.join('\n')); buf = []; }
        } else buf.push(l);
      }
      if (buf.length) blocks.push(buf.join('\n'));
      for (let i = 0; i < blocks.length; i++) {
        const firstLine = blocks[i].split('\n')[0].slice(0, 40) || `第 ${i + 1} 章`;
        chapters.push({ title: firstLine, content: blocks[i] });
      }
    } else {
      // 按 "第X章/第X回/Chapter X" 分组
      let cur: any = null;
      const re = /^(第[一二三四五六七八九十百千万\d0-9]+[章回卷节]|Chapter\s*\d+|章节\s*\d+)/i;
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (re.test(line)) {
          if (cur) chapters.push(cur);
          cur = { title: line, content: [] };
        } else if (cur) {
          cur.content.push(raw);
        } else {
          cur = { title: `第 ${chapters.length + 1} 章`, content: [raw] };
        }
      }
      if (cur) chapters.push(cur);
    }
    if (!chapters.length) chapters.push({ title: '导入章节', content: text });
    const tx = getDb().prepare('BEGIN');
    tx.run();
    let count = 0;
    try {
      const chapStmt = getDb().prepare('INSERT INTO chapters (project_id, volume_id, title, word_count, sort_order) VALUES (?, ?, ?, ?, ?)');
      const contentStmt = getDb().prepare('INSERT INTO chapter_contents (chapter_id, content, version_tag) VALUES (?, ?, ?)');
      for (const ch of chapters) {
        const body = Array.isArray(ch.content) ? ch.content.join('\n') : String(ch.content);
        const info = chapStmt.run(projectId, volumeId || null, ch.title || '未命名章节', body.length, count + 1);
        contentStmt.run(info.lastInsertRowid, body || '', 'imported');
        count++;
      }
      const totals = getDb().prepare('SELECT COALESCE(SUM(word_count), 0) AS w, COUNT(*) AS c FROM chapters WHERE project_id = ?').get(projectId);
      getDb().prepare('UPDATE projects SET word_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(totals.w, projectId);
      getDb().prepare('COMMIT').run();
    } catch (e) {
      getDb().prepare('ROLLBACK').run();
      throw e;
    }
    return { imported: count };
  },
  importOutlineText(projectId, text) {
    const lines = (text || '').split(/\r?\n/).filter(l => l.trim());
    const nodes: any[] = [];
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].trim();
      const indentMatch = raw.match(/^(\s*)([-*#>·]+)?\s*(.*)$/);
      const rest = indentMatch ? indentMatch[3] : raw;
      const leading = indentMatch && indentMatch[1] ? indentMatch[1].length : 0;
      const hasBullet = !!(indentMatch && indentMatch[2]);
      const level = Math.min(3, hasBullet ? Math.floor(leading / 2) + 1 : (rest.startsWith('第') ? 1 : 2));
      nodes.push({ level, title: rest.slice(0, 80) || `节点 ${i + 1}`, body: rest });
    }
    const stmt = getDb().prepare('INSERT INTO outlines (project_id, parent_id, level, title, body, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
    const tx = getDb().prepare('BEGIN');
    tx.run();
    let count = 0;
    try {
      for (const n of nodes) stmt.run(projectId, null, n.level, n.title, n.body, count++);
      getDb().prepare('COMMIT').run();
    } catch (e) {
      getDb().prepare('ROLLBACK').run();
      throw e;
    }
    return { imported: count };
  },
  importCharacterText(projectId, text) {
    const blocks = (text || '').split(/\r?\n\s*\r?\n|\n\s*\n/).filter(b => b.trim());
    const stmt = getDb().prepare('INSERT INTO characters (project_id, name, personality, background, abilities, weakness, first_chapter, current_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const tx = getDb().prepare('BEGIN');
    tx.run();
    let count = 0;
    try {
      for (const b of blocks) {
        const lines = b.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (!lines.length) continue;
        let name = lines[0];
        const others: Record<string, string> = { personality: '', background: '', abilities: '', weakness: '', first_chapter: '', current_status: '' };
        let cur: string | null = null;
        for (let i = 1; i < lines.length; i++) {
          const m = lines[i].match(/^(性格|背景|身世|能力|弱点|登场|状态|personality|background|abilities|weakness|first|status)[：:]/i);
          if (m) { cur = m[0].replace(/[：:].*$/, ''); continue; }
          if (cur) {
            if (/^(personality|性格)/i.test(cur)) others.personality += lines[i] + ' ';
            else if (/^(background|背景|身世)/i.test(cur)) others.background += lines[i] + ' ';
            else if (/^(abilities|能力)/i.test(cur)) others.abilities += lines[i] + ' ';
            else if (/^(weakness|弱点)/i.test(cur)) others.weakness += lines[i] + ' ';
            else if (/^(first|登场)/i.test(cur)) others.first_chapter += lines[i] + ' ';
            else if (/^(status|状态)/i.test(cur)) others.current_status += lines[i] + ' ';
          } else others.background += lines[i] + ' ';
        }
        stmt.run(projectId, name, others.personality.trim(), others.background.trim(),
          others.abilities.trim(), others.weakness.trim(), others.first_chapter.trim(), others.current_status.trim());
        count++;
      }
      getDb().prepare('COMMIT').run();
    } catch (e) {
      getDb().prepare('ROLLBACK').run();
      throw e;
    }
    return { imported: count };
  }
};

// ---------- 语言 / 全局偏好 ----------
function getLocale() { return getSetting('locale') || 'zh-CN'; }
function setLocale(locale) { setSetting('locale', locale || 'zh-CN'); }

// ---------- 设置 ----------
function getSetting(key) { const r = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key); return r ? r.value : null; }
function setSetting(key, value) {
  getDb().prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"
  ).run(key, value);
}
function allSettings() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  const out: Record<string, any> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

module.exports = {
  projectService, projectSettingsService, worldviewService,
  factionService, artifactService,
  volumeService, chapterService,
  characterService, characterRelationService,
  foreshadowService, outlineService,
  promptGroupService, promptService, aiModelService,
  ragService, analyzeChapter, analyzeProject,
  materialService,
  continueText, rewriteText, polishText, generateDialogScene,
  checkOoc, checkTypo, scanForeshadow, generateOutline, generateIdea,
  testModel, buildSystemPrompt,
  getSetting, setSetting, allSettings, getLocale, setLocale
};
