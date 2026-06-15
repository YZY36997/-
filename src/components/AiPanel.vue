<script setup lang="ts">
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { lingmo } from '@/api/lingmo';

const props = defineProps<{ projectId: number | null; context: string }>();
const emit = defineEmits<{ (e: 'insert', text: string): void }>();

const hint = ref('');
const result = ref('');
const busy = ref(false);
const tab = ref<'continue' | 'rewrite' | 'polish' | 'dialog' | 'ooc' | 'typo' | 'foreshadow'>('continue');

const buttonText = computed(() => {
  switch (tab.value) {
    case 'continue': return '一键续写';
    case 'rewrite': return '选中片段重写';
    case 'polish': return '智能润色';
    case 'dialog': return '生成对话/场景';
    case 'ooc': return '扫描人设跑偏';
    case 'typo': return '错别字检测';
    default: return '扫描伏笔';
  }
});

function actionKey() {
  switch (tab.value) {
    case 'continue': return lingmo.ACTIONS.AI_CONTINUE;
    case 'rewrite': return lingmo.ACTIONS.AI_REWRITE;
    case 'polish': return lingmo.ACTIONS.AI_POLISH;
    case 'dialog': return lingmo.ACTIONS.AI_DIALOG_SCENE;
    case 'ooc': return lingmo.ACTIONS.AI_CHECK_OOC;
    case 'typo': return lingmo.ACTIONS.AI_CHECK_TYPO;
    default: return lingmo.ACTIONS.AI_FORESHADOW_SCAN;
  }
}

async function run() {
  if (!props.projectId) { ElMessage.warning('请先选择作品'); return; }
  busy.value = true;
  result.value = 'AI 正在思考中…';
  try {
    const r = await lingmo.invoke(actionKey(), {
      project_id: props.projectId,
      context: props.context || '',
      text: props.context || '',
      selected: '',
      hint: hint.value,
      template: '润色模板'
    });
    if (r.ok && r.data) {
      const d: any = r.data;
      const txt = typeof d === 'string' ? d : (d.text || d.content || JSON.stringify(d));
      result.value = txt || '(空)';
    } else {
      result.value = '调用失败：' + (r.error || '未知错误');
    }
  } catch (e: any) {
    result.value = '错误：' + e.message;
  } finally {
    busy.value = false;
  }
}

function insert() {
  if (result.value && result.value !== 'AI 正在思考中…') emit('insert', result.value);
}
</script>

<template>
  <div class="ai-panel" style="flex:1;display:flex;flex-direction:column">
    <el-tabs v-model="tab" style="padding:10px 12px 0">
      <el-tab-pane label="续写" name="continue" />
      <el-tab-pane label="重写" name="rewrite" />
      <el-tab-pane label="润色" name="polish" />
      <el-tab-pane label="对话/场景" name="dialog" />
      <el-tab-pane label="人设OOC" name="ooc" />
      <el-tab-pane label="错别字" name="typo" />
      <el-tab-pane label="伏笔扫描" name="foreshadow" />
    </el-tabs>

    <div class="ai-body" style="flex:1;display:flex;flex-direction:column;min-height:0">
      <div style="padding:10px 14px">
        <el-input v-model="hint" type="textarea" :rows="3" placeholder="写作要求/偏好（可选）：例如 主角冷静、古风语气..." />
      </div>
      <div style="padding:0 14px 10px">
        <el-button type="primary" :loading="busy" style="width:100%" @click="run">{{ buttonText }}</el-button>
      </div>
      <div class="ai-result" style="flex:1;overflow-y:auto;background:var(--surface-2);margin:0 12px 12px;border:1px solid var(--border);border-radius:8px">
        <div style="padding:14px;white-space:pre-wrap;line-height:1.7;font-size:13.5px">{{ result || '点击上方按钮开始生成 AI 建议' }}</div>
        <div v-if="result && result !== 'AI 正在思考中…'" style="padding:8px 12px;border-top:1px solid var(--border)">
          <el-button size="small" type="primary" @click="insert" style="width:100%">采纳 / 插入正文</el-button>
        </div>
      </div>
    </div>
  </div>
</template>
