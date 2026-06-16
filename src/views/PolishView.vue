<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { lingmo } from '@/api/lingmo';
import { useUiStore } from '@/stores/ui';

const ui = useUiStore();
const projectId = ref<number | null>(null);

const source = ref('此处粘贴你想要润色的原文段落...');
const polished = ref('');
const template = ref('去 AI 化');
const busy = ref(false);

onMounted(() => { projectId.value = ui.currentProjectId; });

async function runPolish() {
  if (!source.value.trim()) { ElMessage.warning('请先填写原文'); return; }
  busy.value = true;
  const r = await lingmo.invoke(lingmo.ACTIONS.AI_POLISH, { project_id: projectId.value, text: source.value, template: template.value, level: ui.ragLevel || 2 });
  if (r.ok && r.data) {
    polished.value = typeof r.data === 'string' ? r.data : r.data.text || JSON.stringify(r.data);
  } else {
    polished.value = '调用失败：' + (r.error || '');
  }
  busy.value = false;
}

function accept() { source.value = polished.value; ElMessage.success('已替换原文'); }
</script>

<template>
  <div style="height:100%;overflow:auto;background:var(--bg)">
    <div class="page-header"><h2>润色工坊</h2><p>左右对照编辑模式，按模板润色文风。</p></div>
    <div style="padding:16px 28px 60px;max-width:1600px;margin:0 auto">
      <div style="padding:14px 16px;display:flex;gap:12px;align-items:center;border:1px solid var(--border);border-radius:8px;background:var(--surface)">
        <el-select v-model="template" style="width:180px">
          <el-option label="去 AI 化" value="去 AI 化" />
          <el-option label="沉浸式镜头" value="沉浸式镜头" />
          <el-option label="情绪强化" value="情绪强化" />
          <el-option label="仙侠古风" value="仙侠古风" />
          <el-option label="爽文节奏" value="爽文节奏" />
          <el-option label="精简冗余" value="精简冗余" />
          <el-option label="口语化转书面化" value="口语化转书面化" />
        </el-select>
        <el-button type="primary" :loading="busy" @click="runPolish">开始润色</el-button>
        <div style="flex:1"></div>
        <el-button size="small" @click="accept" v-if="polished">采纳 / 替换原文</el-button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
        <div style="padding:16px;border:1px solid var(--border);border-radius:8px;background:var(--surface);min-height:480px">
          <b>原文</b>
          <el-input v-model="source" type="textarea" :rows="22" style="margin-top:10px"/>
        </div>
        <div style="padding:16px;border:1px solid var(--border);border-radius:8px;background:var(--surface)">
          <b>润色结果</b>
          <pre style="white-space:pre-wrap;background:var(--surface-2);padding:14px;border-radius:8px;margin-top:10px;line-height:1.8;font-family:inherit;min-height:400px">{{ polished || '点击上方按钮开始润色' }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
