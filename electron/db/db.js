/** Electron 数据库层（sqlite3）
 * 使用更好的 better-sqlite3 或回退到 built-in sqlite
 * 由于打包兼容性，优先使用内置同步接口（better-sqlite3）
 */
const path = require('path');
const fs = require('fs');
let Database;
try { Database = require('better-sqlite3'); } catch (_) {
  // fallback to sqlite3 if needed
  Database = null;
}

function getDbPath() {
  const userData = process.env.LINGMO_DATA
    || (require('electron').app ? require('electron').app.getPath('userData') : path.join(process.cwd(), '_local'));
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
  const p = db.prepare('SELECT COUNT(*) AS c FROM projects').get();
  if (p && p.c === 0) {
    db.prepare('INSERT INTO projects (name, genre, summary, status, word_count, chapter_count) VALUES (?, ?, ?, ?, ?, ?)').run('示例作品 · 灵墨启始', '玄幻', '一个关于仙途求索的故事', '连载中', 0, 0);
  }
  const pg = db.prepare('SELECT COUNT(*) AS c FROM prompt_groups').get();
  if (pg && pg.c === 0) {
    db.prepare('INSERT INTO prompt_groups (name, description) VALUES (?, ?), (?, ?), (?, ?)').run(
      '文风', '统一的写作风格提示',
      '人物约束', '防止人物跑偏',
      '去 AI 化', '让生成内容更像真人写作'
    );
  }
  const pm = db.prepare('SELECT COUNT(*) AS c FROM ai_models').get();
  if (pm && pm.c === 0) {
    db.prepare('INSERT INTO ai_models (name, provider, api_url, api_key, model, temperature, max_tokens, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      'DeepSeek-默认', 'deepseek',
      'https://api.deepseek.com/v1/chat/completions', '',
      'deepseek-chat', 0.7, 2048, 1
    );
  }
  if (db.prepare("SELECT COUNT(*) AS c FROM settings WHERE key = 'theme'").get().c === 0) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('theme', 'dark')").run();
  }
}

module.exports = { getDb };
