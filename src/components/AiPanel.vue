<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { lingmo } from '@/api/lingmo';
import { useUiStore } from '@/stores/ui';

const props = defineProps<{ projectId: number; content: string }>();
const emit = defineEmits(['generated', 'replace']);

const ui = useUiStore();
const extraHint = ref('');
const busy = ref(false);
const resultText = ref('');
const savedTemplates = ref<string[]>(['去除AI话术', '沉浸式镜头描写', '情绪强化', '仙侠古风', '爽文节奏', '精简冗余语句', '口语化转书面化']);

function busyWrap(fn: () => Promise<any>) {
  busy.value = true;
  resultText.value = '…… AI 生成中 ……';
  fn().finally(() => { busy.value = false; });
}

function pickResult(r: any): string {
  if (!r || !r.ok) return '';
  const data = r.data as any;
  if (typeof data === 'string') return data;
  if (data && typeof data.text === 'string') return data.text;
  return JSON.stringify(data);
}

async function doContinue() {
  const r = await lingmo.invoke(lingmo.ACTIONS.AI_CONTINUE, { project_id: props.projectId, context: props.content, hint: extraHint.value, level: ui.ragLevel });
  const text = pickResult(r) || '（无返回内容）';
  resultText.value = text;
  if (text && text !== '（无返回内容）') emit('generated', text);
}

async function doRewrite() {
  const r = await lingmo.invoke(lingmo.ACTIONS.AI_REWRITE, { project_id: props.projectId, before: (props.content || '').slice(-800), selected: props.content || '', hint: extraHint.value, level: ui.ragLevel });
  resultText.value = pickResult(r);
}

async function doScene() {
  const r = await lingmo.invoke(lingmo.ACTIONS.AI_DIALOG_SCENE, { project_id: props.projectId, hint: extraHint.value, level: ui.ragLevel });
  const text = pickResult(r);
  resultText.value = text;
  if (text) emit('generated', text);
}

async function doOoc() {
  const r = await lingmo.invoke(lingmo.ACTIONS.AI_CHECK_OOC, { project_id: props.projectId, content: props.content, level: ui.ragLevel });
  resultText.value = pickResult(r);
}

async function doTypo() {
  const r = await lingmo.invoke(lingmo.ACTIONS.AI_CHECK_TYPO, { project_id: props.projectId, content: props.content });
  resultText.value = pickResult(r);
}

async function doForeshadow() {
  const r = await lingmo.invoke(lingmo.ACTIONS.AI_FORESHADOW_SCAN, { project_id: props.projectId, content: props.content });
  resultText.value = pickResult(r);
}

async function doIdea() {
  const r = await lingmo.invoke(lingmo.ACTIONS.AI_GENERATE_IDEA, { project_id: props.projectId, hint: extraHint.value, level: ui.ragLevel });
  resultText.value = pickResult(r);
}

function copyResult() {
  if (!resultText.value) return;
  navigator.clipboard?.writeText(resultText.value);
  ElMessage.success('已复制');
}
function useTemplate(t: string) { extraHint.value = t; }
</script>

<template>
  <div class="ai-panel">
    <div class="ai-section">
      <div class="ai-section-title">AI 续写 / 生成</div>
      <div class="level-switch">
        <span class="muted" style="font-size:12px;">RAG 记忆：</span>
        <el-radio-group v-model="ui.ragLevel" size="small">
          <el-radio-button :value="1">L1 简单</el-radio-button>
          <el-radio-button :value="2">L2 混合</el-radio-button>
          <el-radio-button :value="3">L3 兜底</el-radio-button>
        </el-radio-group>
      </div>
      <textarea class="ai-textarea" rows="3" v-model="extraHint" placeholder="临时写作要求（可选）：例如采用古风描写、侧重心理描写、加快节奏等"></textarea>
      <div class="ai-btn-row">
        <el-button size="small" type="primary" :disabled="busy" @click="busyWrap(doContinue)">一键续写</el-button>
        <el-button size="small" :disabled="busy" @click="busyWrap(doRewrite)">选中重写</el-button>
        <el-button size="small" :disabled="busy" @click="busyWrap(doScene)">场景 / 对话</el-button>
        <el-button size="small" :disabled="busy" @click="busyWrap(doIdea)">脑洞建议</el-button>
      </div>
    </div>

    <div class="ai-section">
      <div class="ai-section-title">智能检测</div>
      <div class="ai-btn-row">
        <el-button size="small" :disabled="busy" @click="busyWrap(doOoc)">人设 OOC 检测</el-button>
        <el-button size="small" :disabled="busy" @click="busyWrap(doTypo)">错别字 / 语病</el-button>
        <el-button size="small" :disabled="busy" @click="busyWrap(doForeshadow)">伏笔分析</el-button>
      </div>
    </div>

    <div class="ai-section">
      <div class="ai-section-title">常用写作指令模板</div>
      <div class="ai-btn-row small">
        <el-button v-for="t in savedTemplates" :key="t" size="small" plain @click="useTemplate(t)">{{ t }}</el-button>
      </div>
    </div>

    <div class="ai-section flex-col">
      <div class="ai-section-title flex-between"><span>AI 输出 / 建议</span>
        <div v-if="resultText" style="display:flex; gap:6px;">
          <el-button size="small" @click="copyResult">复制</el-button>
          <el-button size="small" type="primary" @click="emit('generated', resultText)">追加到正文</el-button>
          <el-button size="small" type="warning" @click="emit('replace', resultText)">替换当前章节</el-button>
        </div>
      </div>
      <div class="ai-result-box" v-if="resultText">{{ resultText }}</div>
      <div v-else class="muted small">选择上方按钮以开始 AI 辅助写作。所有生成内容会自动读取本作品的角色 / 世界观 / 提示词设定，并可通过左侧三级记忆开关调整。</div>
    </div>
  </div>
</template>

<style scoped>
.ai-panel { padding: 12px; display: flex; flex-direction: column; gap: 14px; overflow: auto; flex: 1; }
.ai-section { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
.ai-section-title { font-weight: 600; font-size: 13px; margin-bottom: 8px; color: var(--text); display: flex; align-items: center; justify-content: space-between; }
.ai-textarea { width: 100%; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font-size: 13px; min-height: 68px; resize: vertical; outline: none; }
.ai-btn-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.ai-btn-row.small .el-button { font-size: 12px; padding: 4px 8px; }
.ai-result-box { background: var(--surface); border: 1px solid var(--border); padding: 10px 12px; border-radius: 8px; font-size: 13px; white-space: pre-wrap; max-height: 360px; overflow: auto; line-height: 1.7; color: var(--text); }
.level-switch { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.flex-col { display: flex; flex-direction: column; }
.flex-between { display: flex; justify-content: space-between; align-items: center; }
.muted { color: var(--text-muted); }
.small { font-size: 12px; }
</style>
