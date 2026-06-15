import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  { path: '/', redirect: '/home' },
  { path: '/home', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { title: '作品中心', sidebar: false } },
  { path: '/editor', name: 'editor', component: () => import('@/views/EditorView.vue'), meta: { title: '正文创作' } },
  { path: '/world', name: 'world', component: () => import('@/views/HubView.vue'), meta: { title: '设定中枢' } },
  { path: '/characters', name: 'characters', component: () => import('@/views/CharactersView.vue'), meta: { title: '角色管理' } },
  { path: '/graph', name: 'graph', component: () => import('@/views/GraphView.vue'), meta: { title: '关系图谱' } },
  { path: '/outline', name: 'outline', component: () => import('@/views/OutlineView.vue'), meta: { title: '大纲创作' } },
  { path: '/polish', name: 'polish', component: () => import('@/views/PolishView.vue'), meta: { title: '润色工坊' } },
  { path: '/prompts', name: 'prompts', component: () => import('@/views/PromptsView.vue'), meta: { title: '提示词库' } },
  { path: '/ai-config', name: 'ai-config', component: () => import('@/views/AiConfigView.vue'), meta: { title: 'AI 接口配置' } },
  { path: '/rag', name: 'rag', component: () => import('@/views/RagView.vue'), meta: { title: '长效记忆' } },
  { path: '/analysis', name: 'analysis', component: () => import('@/views/AnalysisView.vue'), meta: { title: '追读力分析' } },
  { path: '/materials', name: 'materials', component: () => import('@/views/MaterialsView.vue'), meta: { title: '素材库' } },
  { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue'), meta: { title: '软件设置' } }
];

const router = createRouter({ history: createWebHashHistory(), routes });
router.afterEach((to) => { document.title = `${to.meta.title || '灵墨小说工坊'} · 灵墨小说工坊`; });
export default router;
