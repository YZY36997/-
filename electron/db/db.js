/** Electron 数据库层（better-sqlite3）
 * 统一维护：建表 / 种子数据 / 数据库连接。
 */
const path = require('path');
const fs = require('fs');

let Database;
try { Database = require('better-sqlite3'); } catch (_) { Database = null; }

function getDbPath() {
  let userData;
  try { userData = require('electron').app.getPath('userData'); } catch (_) { userData = path.join(process.cwd(), '_local'); }
  if (!fs.existsSync(userData)) fs.mkdirSync(userData, { recursive: true });
  return path.join(userData, 'lingmo-novel-workshop.db');
}

let _db;
function getDb() {
  if (_db) return _db;
  if (!Database) throw new Error('需要安装 better-sqlite3');
  const dbFile = getDbPath();
  _db = new Database(dbFile);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  const schemaFile = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaFile, 'utf8');
  _db.exec(sql);
  seed(_db);
  return _db;
}

function seed(db) {
  // 示例作品
  const p = db.prepare('SELECT COUNT(*) AS c FROM projects WHERE deleted = 0').get();
  if (!p || p.c === 0) {
    db.prepare(`INSERT INTO projects (name, genre, description, status, word_count, progress)
      VALUES (?, ?, ?, ?, ?, ?)`).run('示例作品 · 灵墨启始', '玄幻', '一个关于仙途求索的故事', 'serializing', 0, 0);
  }
  // 提示词分组（内置，不可删除）
  const pg = db.prepare('SELECT COUNT(*) AS c FROM prompt_groups').get();
  if (!pg || pg.c === 0) {
    const groups = [
      ['文风设定', 1],
      ['人物约束', 1],
      ['剧情规则', 1],
      ['题材专属', 1],
      ['禁词 / 禁忌', 1],
      ['去 AI 化', 1]
    ];
    const stmt = db.prepare('INSERT INTO prompt_groups (name, builtin, sort_order) VALUES (?, ?, ?)');
    groups.forEach(([name, b], i) => stmt.run(name, b, i));

    // 预置若干条提示词
    const seedPrompts = [
      [1, '网文通用风', '请使用干净利落、节奏感强的中文网文表达，避免翻译腔与过度修饰。'],
      [2, '主角动机一致', '主角的所有决策必须符合其设定（性格、背景、目标）。'],
      [3, '章节节奏', '每章至少推进一个核心冲突或完成一个爽点。'],
      [5, '禁用词', '避免低幼化表达、低俗用语、网络敏感词。'],
      [6, '去 AI 话术', '避免"只见……"、"却不知……"这类重复套路。']
    ];
    const ps = db.prepare('INSERT INTO prompts (group_id, name, content, enabled, priority) VALUES (?, ?, ?, 1, 1)');
    seedPrompts.forEach(([g, n, c]) => ps.run(g, n, c));
  }
  // AI 模型默认配置
  const pm = db.prepare('SELECT COUNT(*) AS c FROM ai_models').get();
  if (!pm || pm.c === 0) {
    db.prepare(`INSERT INTO ai_models (name, provider, base_url, api_key, model_name, temperature, max_tokens, context_len, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'DeepSeek-默认', 'deepseek',
      'https://api.deepseek.com/chat/completions', '',
      'deepseek-chat', 0.7, 2048, 8000, 1
    );
  }
  // 默认主题
  const th = db.prepare("SELECT COUNT(*) AS c FROM settings WHERE key = 'theme'").get();
  if (!th || th.c === 0) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('theme', 'dark')").run();
  }
}

module.exports = { getDb, getDbPath };
