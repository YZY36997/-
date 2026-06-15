<script setup lang="ts">
import { useUiStore } from '@/stores/ui'
const ui = useUiStore()
</script>

<template>
  <div style="height:100%;overflow:auto;background:var(--bg)">
    <div class="page-header"><h2>软件设置</h2><p>主题 / 快捷键 / 数据偏好</p></div>
    <div style="padding:16px 28px 60px;max-width:1200px;margin:0 auto">
      <div class="card">
        <b>主题</b>
        <p class="muted mt-8">深色 / 浅色全局切换，自动保存。</p>
        <el-radio-group v-model="ui.theme" class="mt-12" @change="ui.toggleTheme()">
          <el-radio-button label="dark">深色</el-radio-button>
          <el-radio-button label="light">浅色</el-radio-button>
        </el-radio-group>
      </div>
      <div class="card mt-16">
        <b>关于</b>
        <p class="muted mt-8">灵墨小说工坊 · 长篇网文创作辅助软件</p>
        <ul class="mt-8 muted" style="font-size:13px;line-height:1.8">
          <li>本地数据：作品 / 章节 / 角色 / 设定全部本地存储，不联网也可使用。</li>
          <li>AI 接口：按供应商/多模型切换、失败降级。</li>
          <li>RAG：三级检索，防止长篇设定崩坏。</li>
        </ul>
      </div>
    </div>
  </div>
</template>
