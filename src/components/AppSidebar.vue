<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { useUiStore } from '@/stores/ui';
import { useI18n } from '@/composables/useI18n';
const ui = useUiStore();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const menus = [
  { key: 'editor', path: '/editor', icon: '✎', titleKey: 'nav.editor' },
  { key: 'world', path: '/world', icon: '◉', titleKey: 'nav.world' },
  { key: 'characters', path: '/characters', icon: '☻', titleKey: 'nav.characters' },
  { key: 'graph', path: '/graph', icon: '⚯', titleKey: 'nav.graph' },
  { key: 'outline', path: '/outline', icon: '❖', titleKey: 'nav.outline' },
  { key: 'polish', path: '/polish', icon: '✧', titleKey: 'nav.polish' },
  { key: 'prompts', path: '/prompts', icon: '❏', titleKey: 'nav.prompts' },
  { key: 'materials', path: '/materials', icon: '▤', titleKey: 'nav.materials' },
  { key: 'ai-config', path: '/ai-config', icon: '⚙', titleKey: 'nav.aiConfig' },
  { key: 'rag', path: '/rag', icon: '◈', titleKey: 'nav.rag' },
  { key: 'analysis', path: '/analysis', icon: '◍', titleKey: 'nav.analysis' }
];

function click(m: any) { router.push(m.path); }
</script>

<template>
  <aside class="app-sidebar" :class="{ collapsed: ui.sidebarCollapsed }">
    <div class="sb-inner">
      <div
        class="sb-item"
        v-for="item in menus"
        :key="item.key"
        :class="{ active: route.path.startsWith(item.path) }"
        @click="click(item)"
        :title="t(item.titleKey)">
        <span class="icon">{{ item.icon }}</span>
        <span class="title" v-if="!ui.sidebarCollapsed">{{ t(item.titleKey) }}</span>
      </div>
    </div>
    <div class="sb-footer" v-if="!ui.sidebarCollapsed">
      <span class="muted" style="font-size:11px">v1.0 · 本地存储</span>
    </div>
  </aside>
</template>
