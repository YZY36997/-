<script setup lang="ts">
import { useUiStore } from '@/stores/ui'
import { useRouter, useRoute } from 'vue-router'

const ui = useUiStore()
const router = useRouter()
const route = useRoute()

function goHome() { router.push('/home') }
</script>

<template>
  <header class="app-header">
    <div class="h-left">
      <el-button link @click="ui.toggleSidebar" circle>
        <span style="font-size:18px">☰</span>
      </el-button>
      <div class="logo" @click="goHome">
        <span class="dot" />
        <span class="name">灵墨小说工坊</span>
      </div>
      <el-divider direction="vertical" />
      <span class="muted project" v-if="ui.currentProjectName">当前作品：{{ ui.currentProjectName }}</span>
    </div>
    <div class="h-right">
      <el-tooltip :content="ui.theme === 'dark' ? '切换浅色' : '切换深色'" placement="bottom">
        <el-button circle link @click="ui.toggleTheme">
          <span style="font-size:16px">{{ ui.theme === 'dark' ? '☾' : '☀' }}</span>
        </el-button>
      </el-tooltip>
      <el-button link @click="$router.push('/settings')">设置</el-button>
      <el-button link @click="goHome">作品中心</el-button>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  height: 54px; padding: 0 18px; display: flex; align-items: center; justify-content: space-between;
  background: var(--surface); border-bottom: 1px solid var(--border);
}
.h-left, .h-right { display: flex; align-items: center; gap: 14px; }
.logo { display: flex; align-items: center; gap: 10px; cursor: pointer; }
.logo .dot { width: 12px; height: 12px; border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--accent));
  box-shadow: 0 0 12px var(--primary);
}
.logo .name { font-weight: 600; font-size: 15px; letter-spacing: 1px; }
.project { font-size: 13px; }
</style>
