/**
 * 灵墨小说工坊 - 多模型配置（供应商 / 任务绑定 / 失败切换 / 参数模板）
 *
 * 供应商：{ id, name, base_url, api_key, enabled, api_type }
 *   - api_type: openai-compatible | ollama | anthropic | deepseek | qwen | xiaomi
 *
 * 任务绑定：{ task: 'writing'|'polish'|'review'|'embedding'|'summary'|'outline'|'character', provider_id, model, temperature, max_tokens }
 *
 * 参数模板：{ id, name, temperature, top_p, repetition_penalty, max_tokens, system_prompt }
 */
import express from 'express';
import { readFile, writeFile } from '../utils/fileHelper.js';

const router = express.Router();

const TASKS = ['writing', 'polish', 'review', 'embedding', 'summary', 'outline', 'character'];

async function readModels() {
  const d = (await readFile('models.json').catch(() => ({}))) || {};
  return { providers: d.providers || [], tasks: d.tasks || [], templates: d.templates || [], fallback_chain: d.fallback_chain || [] };
}
async function writeModels(data) { await writeFile('models.json', data); }

router.get('/meta', (req, res) => res.json({ tasks: TASKS }));

router.get('/', async (req, res) => {
  const m = await readModels();
  // 隐藏密钥，只显示后四位
  const providers = m.providers.map(p => ({ ...p, api_key: p.api_key ? '****' + (String(p.api_key).slice(-4)) : null }));
  res.json({ providers, tasks: m.tasks, templates: m.templates, fallback_chain: m.fallback_chain });
});

// 供应商
router.post('/providers', async (req, res) => {
  const m = await readModels();
  const p = {
    id: 'pr_' + Date.now().toString(36),
    name: req.body.name || '未命名',
    base_url: req.body.base_url || '',
    api_key: req.body.api_key || '',
    api_type: req.body.api_type || 'openai-compatible',
    model: req.body.model || '',
    enabled: req.body.enabled !== false,
    priority: req.body.priority || 10,
    notes: req.body.notes || '',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  m.providers.push(p);
  await writeModels(m);
  res.status(201).json({ ...p, api_key: p.api_key ? '****' : null });
});
router.put('/providers/:id', async (req, res) => {
  const m = await readModels();
  const idx = m.providers.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '供应商不存在' });
  // 保留原密钥（如果提交 ****）
  if (req.body.api_key && req.body.api_key.includes('****')) {
    req.body.api_key = m.providers[idx].api_key;
  }
  m.providers[idx] = { ...m.providers[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
  await writeModels(m);
  res.json({ ...m.providers[idx], api_key: m.providers[idx].api_key ? '****' : null });
});
router.delete('/providers/:id', async (req, res) => {
  const m = await readModels();
  m.providers = m.providers.filter(p => p.id !== req.params.id);
  await writeModels(m);
  res.json({ success: true });
});

// 任务绑定
router.post('/tasks', async (req, res) => {
  const m = await readModels();
  const t = { task: req.body.task || 'writing', provider_id: req.body.provider_id,
    model: req.body.model || '',
    temperature: req.body.temperature ?? 0.8,
    top_p: req.body.top_p ?? 1.0,
    max_tokens: req.body.max_tokens || 2048,
    repetition_penalty: req.body.repetition_penalty || 1.0,
    system_prompt: req.body.system_prompt || ''
  };
  // 每个 task 最多一个绑定（新绑定覆盖旧的）
  m.tasks = m.tasks.filter(x => x.task !== t.task);
  m.tasks.push(t);
  await writeModels(m);
  res.status(201).json(t);
});
router.get('/tasks/:task', async (req, res) => {
  const m = await readModels();
  res.json(m.tasks.find(t => t.task === req.params.task) || {});
});
router.delete('/tasks/:task', async (req, res) => {
  const m = await readModels();
  m.tasks = m.tasks.filter(t => t.task !== req.params.task);
  await writeModels(m);
  res.json({ success: true });
});

// 参数模板
router.post('/templates', async (req, res) => {
  const m = await readModels();
  const tpl = {
    id: 'tpl_' + Date.now().toString(36),
    name: req.body.name || '未命名模板',
    temperature: req.body.temperature ?? 0.8,
    top_p: req.body.top_p ?? 1.0,
    repetition_penalty: req.body.repetition_penalty || 1.0,
    max_tokens: req.body.max_tokens || 2048,
    system_prompt: req.body.system_prompt || '',
    createdAt: new Date().toISOString()
  };
  m.templates.push(tpl);
  await writeModels(m);
  res.status(201).json(tpl);
});
router.delete('/templates/:id', async (req, res) => {
  const m = await readModels();
  m.templates = m.templates.filter(t => t.id !== req.params.id);
  await writeModels(m);
  res.json({ success: true });
});

// 失败切换链
router.put('/fallback-chain', async (req, res) => {
  const m = await readModels();
  m.fallback_chain = req.body.chain || [];
  await writeModels(m);
  res.json({ fallback_chain: m.fallback_chain });
});

// 获取实际生成时要用的配置（给 ai-chapter.js）
router.post('/resolve', async (req, res) => {
  const { task, use_fallback_chain } = req.body;
  const t = (await readModels());
  const taskCfg = t.tasks.find(x => x.task === (task || 'writing'));
  const providers = t.providers.filter(p => p.enabled !== false);

  if (taskCfg) {
    const provider = providers.find(p => p.id === taskCfg.provider_id);
    if (provider) {
      res.json({ provider: { ...provider, api_key: provider.api_key ? '****' + (String(provider.api_key).slice(-4)) : null },
        task_config: taskCfg,
        available_providers: providers.map(p => p.id),
        note: '前端调用生成时，应在请求体内注入实际 api_key 和 base_url；若失败，按 fallback_chain 顺序重试。'
      });
      return;
    }
  }

  // 无配置时走 settings.json 主配置
  const s = await readFile('settings.json').catch(() => null);
  const settings = s?.settings || {};
  res.json({
    provider: { name: '默认主配置', base_url: settings.apiEndpoint || '', api_type: 'openai-compatible', api_key: settings.apiKey ? '****' : null, model: settings.model || '' },
    task_config: taskCfg || { task: task || 'writing' },
    available_providers: providers.map(p => p.id),
    fallback_chain: t.fallback_chain,
    note: '未配置任务绑定，使用 settings.json 中的主配置；建议在 /tasks 配置各任务模型。'
  });
});

export default router;
