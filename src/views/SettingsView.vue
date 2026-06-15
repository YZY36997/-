<script setup lang="ts">
import { useUiStore } from '@/stores/ui';
import { useI18n } from '@/composables/useI18n';

const ui = useUiStore();
const { t } = useI18n();
</script>

<template>
  <div style="height:100%;overflow:auto;background:var(--bg)">
    <div class="page-header"><h2>{{ t('nav.settings') }}</h2><p>{{ t('settings.about') }}</p></div>
    <div style="padding:16px 28px 60px;max-width:1200px;margin:0 auto">
      <div class="card" style="margin-bottom: 14px;">
        <b>{{ t('settings.theme') }}</b>
        <div style="margin-top:10px; display:flex; gap:8px;">
          <button :class="['btn', ui.theme === 'dark' ? 'primary' : '']" @click="ui.theme = 'dark'; ui.toggleTheme()">{{ t('settings.dark') }}</button>
          <button :class="['btn', ui.theme === 'light' ? 'primary' : '']" @click="ui.theme = 'light'; ui.toggleTheme()">{{ t('settings.light') }}</button>
        </div>
      </div>
      <div class="card" style="margin-bottom: 14px;">
        <b>{{ t('settings.language') }}</b>
        <div style="margin-top:10px; display:flex; gap:8px;">
          <button :class="['btn', ui.locale === 'zh-CN' ? 'primary' : '']" @click="ui.setLocale('zh-CN')">简体中文</button>
          <button :class="['btn', ui.locale === 'en-US' ? 'primary' : '']" @click="ui.setLocale('en-US')">English</button>
        </div>
      </div>
      <div class="card">
        <b>{{ t('settings.about') }}</b>
        <p class="muted mt-8">{{ t('appName') }} · {{ t('appSubtitle') }}</p>
        <ul class="mt-8 muted" style="font-size:13px;line-height:1.8">
          <li>数据本地化存储，使用 SQLite，默认位于用户目录。</li>
          <li>支持多题材作品、RAG 三级记忆、追读力分析与 AI 模型热切换。</li>
        </ul>
      </div>
    </div>
  </div>
</template>
