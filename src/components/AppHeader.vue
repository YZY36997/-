<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useUiStore } from '@/stores/ui';
const router = useRouter();
const ui = useUiStore();
</script>

<template>
  <header class="app-header">
    <div class="h-left">
      <el-button link @click="ui.$patch({ sidebarCollapsed: !ui.sidebarCollapsed })" circle>
        <span style="font-size:16px">≡</span>
      </el-button>
      <div class="logo" @click="router.push('/home')">
        <span class="dot" />
        <span class="name">灵墨小说工坊</span>
      </div>
      <el-divider direction="vertical" />
      <span class="muted" v-if="ui.currentProjectName">当前作品：{{ ui.currentProjectName }}</span>
    </div>
    <div class="h-right">
      <el-tooltip :content="ui.theme === 'dark' ? '切换到浅色' : '切换到深色'" placement="bottom">
        <el-button circle link @click="ui.toggleTheme()">
          <span style="font-size:16px">{{ ui.theme === 'dark' ? '☾' : '☀' }}</span>
        </el-button>
      </el-tooltip>
      <el-button link @click="router.push('/ai-config')">AI 接口</el-button>
      <el-button link @click="router.push('/settings')">设置</el-button>
      <el-button link type="primary" @click="router.push('/home')">作品中心</el-button>
    </div>
  </header>
</template>
