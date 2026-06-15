<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import AppHeader from '@/components/AppHeader.vue';
import AppSidebar from '@/components/AppSidebar.vue';
import { useUiStore } from '@/stores/ui';
const ui = useUiStore();
const route = useRoute();
const isHome = computed(() => route.path === '/home');
onMounted(async () => {
  await ui.initTheme();
  await ui.initLocale();
});
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
.fade-enter-active, .fade-leave-active { transition: opacity .18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
