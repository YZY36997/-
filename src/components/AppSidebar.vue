<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import { computed } from 'vue'

const ui = useUiStore()
const route = useRoute()
const router = useRouter()

const currentPath = computed(() => route.path.split('/').slice(0, 2).join('/'))

const menus = [
  { key: 'home', title: '作品中心', icon: '📚', path: '/home' },
  { key: 'editor', title: '正文创作', icon: '✒️', path: '/editor', needProject: true },
  { key: 'hub', title: '设定中枢', icon: '📘', path: '/hub', needProject: true },
  { key: 'characters', title: '角色管理', icon: '🧙', path: '/characters', needProject: true },
  { key: 'graph', title: '关系图谱', icon: '🌐', path: '/graph', needProject: true },
  { key: 'outline', title: '大纲创作', icon: '🗺️', path: '/outline', needProject: true },
  { key: 'polish', title: '润色工坊', icon: '✨', path: '/polish', needProject: true },
  { key: 'prompts', title: '提示词库', icon: '🧩', path: '/prompts' },
  { key: 'ai-config', title: 'AI 接口', icon: '🤖', path: '/ai-config' },
  { key: 'rag', title: 'RAG 记忆', icon: '🧠', path: '/rag', needProject: true },
  { key: 'analysis', title: '追读力分析', icon: '📈', path: '/analysis', needProject: true },
  { key: 'settings', title: '软件设置', icon: '⚙️', path: '/settings' }
]

function click(item: any) {
  if (item.needProject && !ui.currentProjectId) {
    router.push('/home').then(() => setTimeout(() => window.alert('请先选择或新建一个作品'), 50))
    return
  }
  router.push(item.path)
}
</script>

<template>
  <aside class="app-sidebar" :class="{ collapsed: ui.sidebarCollapsed }">
    <div class="sb-inner">
      <div class="sb-item" v-for="item in menus" :key="item.key" :class="{ active: currentPath === item.path }" @click="click(item)">
        <span class="icon">{{ item.icon }}</span>
        <span class="title" v-if="!ui.sidebarCollapsed">{{ item.title }}</span>
      </div>
    </div>
    <div class="sb-footer" v-if="!ui.sidebarCollapsed">
      <span class="muted" style="font-size:12px">v1.0 · 本地存储</span>
    </div>
  </aside>
</template>

<style scoped>
.app-sidebar {
  width: 200px; background: var(--surface); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; transition: width .2s;
}
.app-sidebar.collapsed { width: 64px; }
.sb-inner { flex: 1; padding: 14px 6px; overflow-y: auto; }
.sb-item {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px;
  border-radius: 8px; cursor: pointer; margin-bottom: 2px; color: var(--text-muted);
  transition: background .15s, color .15s;
}
.sb-item:hover { background: var(--surface-2); color: var(--text); }
.sb-item.active {
  background: linear-gradient(135deg, rgba(95,180,255,0.18), rgba(139,107,255,0.18));
  color: var(--text);
  border-left: 3px solid var(--primary);
  padding-left: 9px;
}
.sb-item .icon { font-size: 16px; width: 22px; text-align: center; }
.sb-item .title { font-size: 13.5px; }
.sb-footer { padding: 12px 18px; border-top: 1px solid var(--border); text-align: center; }
</style>
