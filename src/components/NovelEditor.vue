<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{ content: string }>();
const emit = defineEmits<{ (e: 'update', v: string): void }>();

const ta = ref<string>(props.content);

watch(() => props.content, (v) => { if (v !== ta.value) ta.value = v; });

function setContent(v: string) { ta.value = v; }
function onChange(e: Event) {
  const target = e.target as HTMLTextAreaElement;
  emit('update', target.value);
}

function insertTab() { /* placeholder */ }

defineExpose({ setContent });
</script>

<template>
  <div class="novel-editor">
    <div class="toolbar">
      <span style="color:var(--text-muted);font-size:12px">提示：直接在下方编辑，支持 Markdown 风格纯文本写作</span>
      <span style="flex:1"></span>
      <el-button size="small" @click="insertTab">插入 Tab</el-button>
    </div>
    <textarea v-model="ta" @input="onChange" placeholder="开始创作你的故事..." spellcheck="false"></textarea>
  </div>
</template>

<style scoped>
.novel-editor { display: flex; flex-direction: column; flex: 1; background: var(--bg); }
.toolbar { padding: 8px 16px; border-bottom: 1px solid var(--border); display: flex; gap: 6px; background: var(--surface); align-items: center; }
textarea {
  flex: 1; width: 100%; border: none; outline: none; resize: none;
  padding: 28px 48px; line-height: 2; font-size: 16px; background: var(--bg); color: var(--text);
  font-family: "Songti SC", "Noto Serif SC", "Source Han Serif SC", "FangSong", serif;
  white-space: pre-wrap;
}
textarea::placeholder { color: var(--text-muted); }
</style>
