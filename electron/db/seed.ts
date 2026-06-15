/**
 * 灵墨小说工坊 · 初始种子数据：提示词分组 + 内置模板
 */
import Database from 'better-sqlite3';

type PromptGroup = { id: number; name: string; builtin: number };

export function seed(db: Database.Database): void {
  // 仅在表为空时插入
  const count = (db.prepare('SELECT COUNT(*) AS c FROM prompt_groups').get() as any)?.c || 0;
  if (count > 0) return;

  const groups: { name: string; builtin: number; builtin_prompts: { name: string; content: string }[] = [
    {
      name: '去 AI 化',
      builtin: 1,
      builtin_prompts: [
        {
          name: '去 AI 话术',
          content: '避免"微微一笑、瞳孔微缩、目光一凝"、"淡淡地说道"等模板化词。换成更自然的动作和对话。'
        },
        {
          name: '口语化转书面',
          content: '将过于口语的表达改为书面化、自然中文。'
        }
      ]
    },
    {
      name: '文风设定',
      builtin: 1,
      builtin_prompts: [
        {
          name: '古风仙侠',
          content: '文风偏古典中文，古风意境含蓄，使用"道、法、术、器，避免现代网络词。'
        },
        {
          name: '爽文节奏',
          content: '节奏紧凑，多用对话推动，每 800-1200 字一个小转折，一个大转折，爽点密集。'
        },
        {
          name: '镜头描写',
          content: '增加景物描写和环境描写，用镜头式的语言增强氛围感。'
        }
      ]
    },
    {
      name: '人物约束',
      builtin: 1,
      builtin_prompts: [
        {
          name: '主角冷静智者',
          content: '主角性格冷静，不冲动，决策沉稳，说话简洁。'
        }
      ]
    },
    {
      name: '剧情规则',
      builtin: 1,
      builtin_prompts: [
        {
          name: '章节钩子',
          content: '每章结尾必须留有悬念或未解决事件，让读者想继续看下一章。'
        }
      ]
    },
    {
      name: '题材专属规则',
      builtin: 1,
      builtin_prompts: [
        {
          name: '玄幻力量体系',
          content: '严格遵循本作品的力量体系等级，不可出现等级跳跃。'
        }
      ]
    },
    {
      name: '禁用词 / 禁忌规则',
      builtin: 1,
      builtin_prompts: [
        {
          name: '全局禁词',
          content: '避免使用色情、血腥暴力、种族歧视、政治敏感等违反内容。'
        }
      ]
    }
  ];

  const insertGroup = db.prepare('INSERT INTO prompt_groups (name, builtin, sort_order) VALUES (?, ?, ?)');
  const insertPrompt = db.prepare('INSERT INTO prompts (group_id, name, content, enabled, priority) VALUES (?, ?, ?, 1, 2)');

  const tx = db.transaction(() => {
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const info = insertGroup.run(g.name, g.builtin, i + 1);
      const groupId = Number(info.lastInsertRowid);
      for (const p of g.builtin_prompts) {
        insertPrompt.run(groupId, p.name, p.content);
      }
    }
  });
  (tx as any)();

  // 默认 AI 模型（未填 key 占位，用户之后在设置页修改）
  db.prepare(`
    INSERT INTO ai_models (name, provider, base_url, model_name, temperature, max_tokens, context_len, is_default, enabled)
    VALUES ('DeepSeek Chat (默认)', 'deepseek', 'https://api.deepseek.com', 'deepseek-chat', 0.7, 2048, 8000, 1, 1);
  `).run();

  // 初始软件设置
  db.prepare("INSERT INTO settings (key, value) VALUES ('theme', 'dark') ON CONFLICT DO NOTHING").run();
}
