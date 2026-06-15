<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { lingmo } from '@/api/lingmo';
import AiPanel from './AiPanel.vue';
import ChapterTree from './ChapterTree.vue';
import { useUiStore } from '@/stores/ui';

const ui = useUiStore();
const chapters = ref<any[]>([]);
const volumes = ref<any[]>([]);
const selectedChapterId = ref<number | null>(null);
const chapterTitle = ref('');
const chapterStatus = ref('draft');
const content = ref('');
const history = ref<any[]>([]);
const showHistory = ref(false);
const lastSavedAt = ref('');
const autoSaveTimer = ref<any>(null);
const saving = ref(false);

const totalWordCount = computed(() => chapters.value.reduce((acc: number, c: any) => acc + ((c && typeof c.word_count === 'number') ? c.word_count : 0), 0));

function ensureProject() {
  if (!ui.currentProjectId) {
    alert('请先在「作品中心」选择或创建一部作品。');
    window.location.hash = '#/home';
    return 0;
  }
  return ui.currentProjectId;
}

async function loadTree() {
  const pid = ensureProject(); if (!pid) return;
  const c1 = await lingmo.invoke(lingmo.ACTIONS.CHAPTER_LIST, { project_id: pid });
  const c2 = await lingmo.invoke(lingmo.ACTIONS.VOLUME_LIST, { project_id: pid });
  chapters.value = c1.ok && Array.isArray(c1.data) ? c1.data : [];
  volumes.value = c2.ok && Array.isArray(c2.data) ? c2.data : [];
  if (selectedChapterId.value && chapters.value.find((c: any) => c.id === selectedChapterId.value)) return;
  if (chapters.value.length) selectChapter(chapters.value[0].id);
}

function selectChapter(id: number) {
  if (!id) return;
  const ch = chapters.value.find((c: any) => c.id === id);
  if (!ch) return;
  selectedChapterId.value = id;
  chapterTitle.value = ch.title || '新章节';
  chapterStatus.value = ch.status || 'draft';
  loadContent(id);
}

async function loadContent(id: number) {
  const r = await lingmo.invoke(lingmo.ACTIONS.CHAPTER_CONTENT_GET, { id });
  content.value = r.ok && r.data ? (r.data.content || '') : '';
  history.value = [];
}

async function saveContent() {
  if (!selectedChapterId.value) return;
  saving.value = true;
  const r = await lingmo.invoke(lingmo.ACTIONS.CHAPTER_CONTENT_SAVE, { id: selectedChapterId.value, content: content.value || '', version_tag: 'auto' });
  if (r.ok) {
    lastSavedAt.value = new Date().toLocaleTimeString();
    const ch = chapters.value.find((c: any) => c.id === selectedChapterId.value);
    if (ch) ch.word_count = (content.value || '').length;
  }
  saving.value = false;
}

function scheduleAutoSave() {
  if (autoSaveTimer.value) clearTimeout(autoSaveTimer.value);
  autoSaveTimer.value = setTimeout(() => saveContent(), 2000);
}
function onContentInput() { scheduleAutoSave(); }

async function loadHistory() {
  if (!selectedChapterId.value) return;
  const r = await lingmo.invoke(lingmo.ACTIONS.CHAPTER_CONTENT_HISTORY, { id: selectedChapterId.value });
  history.value = r.ok && Array.isArray(r.data) ? r.data : [];
  showHistory.value = true;
}

async function updateChapter() {
  if (!selectedChapterId.value) return;
  await lingmo.invoke(lingmo.ACTIONS.CHAPTER_UPDATE, { id: selectedChapterId.value, title: chapterTitle.value, status: chapterStatus.value, summary: '', word_count: (content.value || '').length });
  const ch = chapters.value.find((c: any) => c.id === selectedChapterId.value);
  if (ch) { ch.title = chapterTitle.value; ch.status = chapterStatus.value; }
  ElMessage.success('章节已更新');
}

function onAiGenerated(text: string) {
  content.value += (content.value ? '\n' : '') + (text || '');
  scheduleAutoSave();
}
function onAiReplace(text: string) {
  content.value = text || '';
  scheduleAutoSave();
}

function applyFormat(tag: string) {
  const ta = document.querySelector('textarea.editor-content') as HTMLTextAreaElement;
  if (!ta) return;
  const start = ta.selectionStart, end = ta.selectionEnd;
  const val = content.value || '';
  const selected = val.substring(start, end);
  const wrapMap: Record<string, string> = {
    b: '**', i: '*', quote: '「', code: '```'
  };
  if (tag === 'newline') {
    content.value = val.substring(0, end) + '\n' + val.substring(end);
  } else if (tag === 'sep') {
    content.value = val.substring(0, end) + '\n——\n' + val.substring(end);
  } else if (wrapMap[tag]) {
    const w = wrapMap[tag];
    content.value = val.substring(0, start) + w + (selected || '文本') + (tag === 'quote' ? '」' : w) + val.substring(end);
  }
  scheduleAutoSave();
}

onMounted(loadTree);
</script>

<template>
  <div class="editor-page" v-if="ui.currentProjectId">
    <div class="editor-left">
      <ChapterTree :project-id="ui.currentProjectId" :volumes="volumes" :chapters="chapters" :selected-chapter-id="selectedChapterId" @select="selectChapter" @reload="loadTree"/>
    </div>
    <div class="editor-center">
      <div class="editor-toolbar">
        <el-input v-model="chapterTitle" placeholder="章节标题" style="width: 280px;" @change="updateChapter"/>
        <el-select v-model="chapterStatus" style="width: 120px;" @change="updateChapter">
          <el-option label="待写" value="todo"/>
          <el-option label="草稿" value="draft"/>
          <el-option label="已完成" value="done"/>
        </el-select>
        <el-button @click="applyFormat('b')">加粗</el-button>
        <el-button @click="applyFormat('quote')">引号</el-button>
        <el-button @click="applyFormat('sep')">分隔符</el-button>
        <el-button @click="applyFormat('newline')">换行</el-button>
        <el-button :loading="saving" @click="saveContent">{{ saving ? '保存中' : '保存' }}</el-button>
        <el-button @click="loadHistory">历史版本</el-button>
        <el-button @click="loadTree">刷新目录</el-button>
        <div class="stat-right">
          <span>章节字数：{{ (content || '').length.toLocaleString() }}</span>
          <span>作品总字数：{{ totalWordCount.toLocaleString() }}</span>
          <span v-if="lastSavedAt">最近保存：{{ lastSavedAt }}</span>
        </div>
      </div>
      <textarea
        v-if="selectedChapterId"
        class="editor-content"
        v-model="content"
        placeholder="在此输入正文内容……"
        @input="onContentInput"></textarea>
      <div v-else class="editor-placeholder">选择一个章节开始写作，或新建章节</div>
    </div>
    <div class="editor-right">
      <AiPanel :project-id="ui.currentProjectId" :content="content" @generated="onAiGenerated" @replace="onAiReplace"/>
    </div>

    <el-dialog v-model="showHistory" title="历史版本" width="640px">
      <div v-if="history.length === 0" class="muted">暂无历史</div>
      <el-table v-else :data="history" size="small">
        <el-table-column prop="version_tag" label="版本" width="120"/>
        <el-table-column prop="created_at" label="时间" width="200"/>
      </el-table>
    </el-dialog>
  </div>
</template>

<style scoped>
.editor-page { display: flex; height: 100%; background: var(--bg); }
.editor-left { width: 280px; min-width: 200px; border-right: 1px solid var(--border); background: var(--surface); display: flex; flex-direction: column; overflow: hidden; }
.editor-center { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.editor-right { width: 360px; min-width: 280px; border-left: 1px solid var(--border); background: var(--surface); overflow: hidden; display: flex; flex-direction: column; }

.editor-toolbar { display: flex; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--border); align-items: center; flex-wrap: wrap; background: var(--surface); }
.stat-right { margin-left: auto; display: flex; gap: 14px; color: var(--text-muted); font-size: 12.5px; }

textarea.editor-content {
  background: var(--bg);
  border: none;
  color: var(--text);
  font-family: "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  font-size: 16px;
  border-radius: 0;
  resize: none;
  flex: 1;
  padding: 24px 36px;
  line-height: 1.85;
  outline: none;
  white-space: pre-wrap;
}

.editor-placeholder { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); }
.muted { color: var(--text-muted); font-size: 13px; }
</style>
