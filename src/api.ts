import axios, { type AxiosInstance } from 'axios'

const isElectron = typeof window !== 'undefined' && 'electronAPI' in window

const baseURL = isElectron ? 'http://localhost:3001' : ''

const api: AxiosInstance = axios.create({
  baseURL,
  timeout: 120000,
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.response.use(
  response => response,
  error => {
    console.error('API 请求错误:', error?.response?.data || error?.message || error)
    return Promise.reject(error)
  }
)

// ---------- Projects ----------
export const projectApi = {
  list: () => api.get('/api/projects').then(r => r.data),
  detail: (id: string) => api.get(`/api/projects/${id}`).then(r => r.data),
  create: (data: any) => api.post('/api/projects', data).then(r => r.data),
  update: (id: string, data: any) => api.put(`/api/projects/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/api/projects/${id}`).then(r => r.data),
  recycle: (ids: string[]) => api.post('/api/projects/recycle', { project_ids: ids }).then(r => r.data),
  recycleList: () => api.get('/api/projects/recycle').then(r => r.data),
  restore: (ids: string[]) => api.post('/api/projects/restore', { project_ids: ids }).then(r => r.data),
  importText: (project_id: string, text: string, name: string) => api.post('/api/projects/import-text', { project_id, text, name }).then(r => r.data),
  worldTemplateList: () => api.get('/api/world-template/categories').then(r => r.data),
  worldTemplate: (cat: string) => api.get(`/api/world-template/category/${cat}`).then(r => r.data),
  applyTemplate: (project_id: string, cat: string, values: any) => api.post('/api/world-template/apply', { project_id, category: cat, values }).then(r => r.data),
  outlineTree: (project_id: string) => api.get(`/api/projects/${project_id}/outline-tree`).then(r => r.data),
  saveOutlineTree: (project_id: string, tree: any) => api.put(`/api/projects/${project_id}/outline-tree`, { tree }).then(r => r.data)
}

// ---------- Chapters ----------
export const chapterApi = {
  list: (project_id: string) => api.get(`/api/chapters?project_id=${project_id}`).then(r => r.data),
  detail: (id: string) => api.get(`/api/chapters/${id}`).then(r => r.data),
  create: (data: any) => api.post('/api/chapters', data).then(r => r.data),
  update: (id: string, data: any) => api.put(`/api/chapters/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/api/chapters/${id}`).then(r => r.data),
  generate: (data: any) => api.post('/api/ai-chapter/generate-chapter', data).then(r => r.data),
  continueText: (data: any) => api.post('/api/ai-chapter/continue-chapter', data).then(r => r.data),
  batch: (data: any) => api.post('/api/ai-chapter/batch-generate', data).then(r => r.data),
  genOutline: (data: any) => api.post('/api/ai-chapter/generate-outline', data).then(r => r.data),
  genCharacter: (data: any) => api.post('/api/ai-chapter/generate-character', data).then(r => r.data),
  analyze: (project_id: string, text: string) => api.post('/api/ai-chapter/analyze', { project_id, text }).then(r => r.data),
  buildSystemPrompt: (data: any) => api.post('/api/ai-chapter/build-system-prompt', data).then(r => r.data)
}

// ---------- Characters ----------
export const characterApi = {
  list: (project_id: string) => api.get(`/api/characters?project_id=${project_id}`).then(r => r.data),
  summary: (project_id: string) => api.get(`/api/characters/project/${project_id}/summary`).then(r => r.data),
  meta: () => api.get('/api/characters/meta').then(r => r.data),
  create: (data: any) => api.post('/api/characters', data).then(r => r.data),
  batch: (characters: any[]) => api.post('/api/characters/batch', { characters }).then(r => r.data),
  update: (id: string, data: any) => api.put(`/api/characters/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/api/characters/${id}`).then(r => r.data),
  snapshot: (id: string, data: any) => api.post(`/api/characters/${id}/snapshot`, data).then(r => r.data),
  oocCheck: (id: string, content: string) => api.post(`/api/characters/${id}/ooc-check`, { content }).then(r => r.data)
}

// ---------- Materials ----------
export const materialApi = {
  list: (project_id?: string, category?: string) => {
    const q = new URLSearchParams()
    if (project_id) q.set('project_id', project_id)
    if (category) q.set('category', category)
    return api.get('/api/materials' + (q.toString() ? '?' + q.toString() : '')).then(r => r.data)
  },
  create: (data: any) => api.post('/api/materials', data).then(r => r.data),
  update: (id: string, data: any) => api.put(`/api/materials/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/api/materials/${id}`).then(r => r.data)
}

// ---------- Factions ----------
export const factionApi = {
  list: (project_id?: string) => {
    const q = project_id ? `?project_id=${project_id}` : '';
    return api.get('/api/factions' + q).then(r => r.data);
  },
  detail: (id: string) => api.get(`/api/factions/${id}`).then(r => r.data),
  summary: (project_id: string) => api.get(`/api/factions/${project_id}/summary`).then(r => r.data),
  create: (data: any) => api.post('/api/factions', data).then(r => r.data),
  update: (id: string, data: any) => api.put(`/api/factions/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/api/factions/${id}`).then(r => r.data)
}

// ---------- Artifacts (道具/功法/秘闻) ----------
export const artifactApi = {
  list: (project_id: string, type?: string) => {
    const q = new URLSearchParams()
    if (project_id) q.set('project_id', project_id)
    if (type) q.set('type', type)
    return api.get('/api/artifacts' + (q.toString() ? '?' + q.toString() : '')).then(r => r.data)
  },
  create: (data: any) => api.post('/api/artifacts', data).then(r => r.data),
  update: (id: string, data: any) => api.put(`/api/artifacts/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/api/artifacts/${id}`).then(r => r.data),
  batchImport: (items: any[], project_id: string) => api.post('/api/artifacts/batch-import', { items, project_id }).then(r => r.data)
}

// ---------- Foreshadow (伏笔库) ----------
export const foreshadowApi = {
  list: (project_id: string) => api.get(`/api/foreshadow?project_id=${project_id}`).then(r => r.data),
  summary: (project_id: string) => api.get(`/api/foreshadow/summary/${project_id}`).then(r => r.data),
  create: (data: any) => api.post('/api/foreshadow', data).then(r => r.data),
  update: (id: string, data: any) => api.put(`/api/foreshadow/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/api/foreshadow/${id}`).then(r => r.data),
  recover: (id: string, data?: any) => api.post(`/api/foreshadow/${id}/recover`, data || {}).then(r => r.data)
}

// ---------- Knowledge Graph (人物关系图) ----------
export const graphApi = {
  detail: (project_id?: string) => {
    const q = project_id ? `?project_id=${project_id}` : '';
    return api.get('/api/knowledge-graph' + q).then(r => r.data);
  },
  summary: () => api.get('/api/knowledge-graph/summary').then(r => r.data),
  addNode: (data: any) => api.post('/api/knowledge-graph/nodes', data).then(r => r.data),
  updateNode: (id: string, data: any) => api.put(`/api/knowledge-graph/nodes/${id}`, data).then(r => r.data),
  removeNode: (id: string) => api.delete(`/api/knowledge-graph/nodes/${id}`).then(r => r.data),
  addEdge: (data: any) => api.post('/api/knowledge-graph/edges', data).then(r => r.data),
  updateEdge: (id: string, data: any) => api.put(`/api/knowledge-graph/edges/${id}`, data).then(r => r.data),
  removeEdge: (id: string) => api.delete(`/api/knowledge-graph/edges/${id}`).then(r => r.data),
  adjacency: (node_id: string) => api.get(`/api/knowledge-graph/adjacency?node_id=${node_id}`).then(r => r.data),
  history: () => api.get('/api/knowledge-graph/history').then(r => r.data),
  autoImportCharacters: (project_id: string) => api.post('/api/knowledge-graph/auto-import-characters', { project_id }).then(r => r.data)
}

// ---------- Analysis (追读力) ----------
export const analysisApi = {
  chapter: (data: any) => api.post('/api/analysis/chapter', data).then(r => r.data),
  dashboard: (project_id: string) => api.get(`/api/analysis/dashboard/${project_id}`).then(r => r.data),
  suggestions: (project_id: string) => api.post(`/api/analysis/suggestions/${project_id}`, {}).then(r => r.data)
}

// ---------- Rules Engine (规则引擎) ----------
export const rulesApi = {
  meta: () => api.get('/api/rules/meta').then(r => r.data),
  list: () => api.get('/api/rules').then(r => r.data),
  create: (data: any) => api.post('/api/rules/custom', data).then(r => r.data),
  update: (id: string, data: any) => api.put(`/api/rules/custom/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/api/rules/custom/${id}`).then(r => r.data),
  toggle: (enabled: boolean) => api.put('/api/rules/toggle', { enabled }).then(r => r.data),
  bind: (project_id: string, data: any) => api.put(`/api/rules/project/${project_id}/bind`, data).then(r => r.data),
  validate: (text: string, project_id?: string, extra_genre?: string) => api.post('/api/rules/validate', { text, project_id, extra_genre }).then(r => r.data)
}

// ---------- Prompts (提示词仓库) ----------
export const promptsApi = {
  categories: () => api.get('/api/prompts/categories').then(r => r.data),
  list: (q: any = {}) => {
    const qs = new URLSearchParams()
    if (q.project_id) qs.set('project_id', q.project_id)
    if (q.category) qs.set('category', q.category)
    if (q.keyword) qs.set('keyword', q.keyword)
    return api.get('/api/prompts' + (qs.toString() ? '?' + qs.toString() : '')).then(r => r.data)
  },
  create: (data: any) => api.post('/api/prompts', data).then(r => r.data),
  update: (id: string, data: any) => api.put(`/api/prompts/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/api/prompts/${id}`).then(r => r.data),
  buildContext: (project_id: string, hint?: string) => api.post('/api/prompts/build-context', { project_id, hint }).then(r => r.data),
  batchImport: (items: any[], project_id?: string) => api.post('/api/prompts/batch-import', { items, project_id }).then(r => r.data)
}

// ---------- RAG (三级检索) ----------
export const ragApi = {
  retrieve: (query: string, project_id: string, top_k = 8) => api.post('/api/rag/retrieve', { query, project_id, top_k }).then(r => r.data),
  buildContext: (query: string, project_id: string, top_k = 8) => api.post('/api/rag/build-context', { query, project_id, top_k }).then(r => r.data),
  chunks: (project_id: string) => api.get(`/api/rag/chunks?project_id=${project_id}`).then(r => r.data),
  createChunk: (data: any) => api.post('/api/rag/chunks', data).then(r => r.data),
  removeChunk: (id: string) => api.delete(`/api/rag/chunks/${id}`).then(r => r.data),
  ingestChapter: (chapter_id: string) => api.post('/api/rag/ingest/chapter', { chapter_id }).then(r => r.data),
  ingestMaterial: (material_id: string) => api.post('/api/rag/ingest/material', { material_id }).then(r => r.data)
}

// ---------- Models (多模型配置) ----------
export const modelsApi = {
  list: () => api.get('/api/models').then(r => r.data),
  create: (data: any) => api.post('/api/models', data).then(r => r.data),
  update: (id: string, data: any) => api.put(`/api/models/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/api/models/${id}`).then(r => r.data),
  taskBindings: () => api.get('/api/models/task-bindings').then(r => r.data),
  setTaskBinding: (task: string, model_id: string) => api.post('/api/models/task-bindings', { task, model_id }).then(r => r.data),
  resolve: (task: string) => api.post('/api/models/resolve', { task }).then(r => r.data),
  testConnection: (base_url: string, api_key: string, model: string) => api.post('/api/models/test', { base_url, api_key, model }).then(r => r.data)
}

// ---------- Templates (爆文模板) ----------
export const templateApi = {
  list: () => api.get('/api/templates').then(r => r.data)
}

// ---------- Event Bus ----------
export const eventBusApi = {
  publish: (event: string, payload: any, project_id?: string) => api.post('/api/event-bus/publish', { event, payload, project_id }).then(r => r.data),
  list: (project_id?: string) => {
    const q = project_id ? '?project_id=' + project_id : ''
    return api.get('/api/event-bus/events' + q).then(r => r.data)
  }
}

// ---------- Feature Toggles ----------
export const toggleApi = {
  get: () => api.get('/api/feature-toggles').then(r => r.data),
  set: (toggles: any) => api.put('/api/feature-toggles', { toggles }).then(r => r.data)
}

// ---------- Health ----------
export const healthApi = {
  check: () => api.get('/api/health').then(r => r.data)
}

// ---------- Settings (兼容) ----------
export const settingsApi = {
  get: () => api.get('/api/settings').then(r => r.data),
  save: (data: any) => api.post('/api/settings', data).then(r => r.data)
}

export default api
export { isElectron, baseURL }
