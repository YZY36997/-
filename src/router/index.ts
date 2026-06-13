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
    }
  ]
})

export default router
