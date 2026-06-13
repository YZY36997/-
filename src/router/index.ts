import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomePage.vue')
    },
    {
      path: '/projects',
      name: 'projects',
      component: () => import('../views/ProjectList.vue')
    },
    {
      path: '/material-center',
      name: 'material-center',
      component: () => import('../views/MaterialCenter.vue')
    },
    {
      path: '/creation/:projectId?',
      name: 'creation',
      component: () => import('../views/CreationPage.vue')
    },
    {
      path: '/templates',
      name: 'templates',
      component: () => import('../views/TemplateLibrary.vue')
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsPage.vue')
    },
    {
      path: '/setting-hub/:projectId?',
      name: 'setting-hub',
      component: () => import('../views/SettingHub.vue')
    },
    {
      path: '/relation-graph/:projectId?',
      name: 'relation-graph',
      component: () => import('../views/RelationGraph.vue')
    },
    {
      path: '/analysis/:projectId?',
      name: 'analysis-dashboard',
      component: () => import('../views/AnalysisDashboard.vue')
    },
    {
      path: '/rules-engine',
      name: 'rules-engine',
      component: () => import('../views/RulesEnginePage.vue')
    },
    {
      path: '/prompts-workshop',
      name: 'prompts-workshop',
      component: () => import('../views/PromptsWorkshop.vue')
    },
    {
      path: '/models-config',
      name: 'models-config',
      component: () => import('../views/ModelsConfigPage.vue')
    },
    {
      path: '/world-template',
      name: 'world-template',
      component: () => import('../views/WorldTemplatePage.vue')
    },
    {
      path: '/foreshadow/:projectId?',
      name: 'foreshadow-panel',
      component: () => import('../views/ForeshadowPanel.vue')
    }
  ]
})

export default router
