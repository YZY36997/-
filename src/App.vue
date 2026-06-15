<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'

const route = useRoute()
const ui = useUiStore()

const isHome = computed(() => route.path === '/' || route.path === '/home')

onMounted(() => {
  ui.initTheme()
})
</script>

<template>
  <div class="app-root" :data-theme="ui.theme">
    <AppHeader v-if="!isHome" />
    <div class="app-body">
      <AppSidebar v-if="!isHome" />
      <main class="app-main">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in"><component :is="Component" /></transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-root { width: 100vw; height: 100vh; display: flex; flex-direction: column; overflow: hidden; background: var(--bg); color: var(--text); }
.app-body { flex: 1; display: flex; min-height: 0; }
.app-main { flex: 1; min-width: 0; overflow-y: auto; }
.fade-enter-active, .fade-leave-active { transition: opacity .2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
