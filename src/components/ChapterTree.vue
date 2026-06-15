<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { lingmo } from '@/api/lingmo';

const props = defineProps<{ projectId: number; volumes: any[]; chapters: any[]; selectedChapterId: number | null }>();
const emit = defineEmits(['select', 'reload']);

async function createVolume() {
  if (!props.projectId) return;
  const title = window.prompt('新卷名称', '第一卷');
  if (!title) return;
  const r = await lingmo.invoke(lingmo.ACTIONS.VOLUME_CREATE, { project_id: props.projectId, title });
  if (r.ok) emit('reload');
}
async function createChapter(volumeId: number | null) {
  if (!props.projectId) return;
  const r = await lingmo.invoke(lingmo.ACTIONS.CHAPTER_CREATE, { project_id: props.projectId, volume_id: volumeId, title: '新章节', status: 'draft' });
  if (r.ok) emit('reload');
}
async function deleteChapter(id: number) {
  if (!confirm('确认删除该章节？')) return;
  const r = await lingmo.invoke(lingmo.ACTIONS.CHAPTER_DELETE, { id });
  if (r.ok) { emit('reload'); }
}

function statusLabel(s: string) { if (s === 'done') return '已完成'; if (s === 'draft') return '草稿'; return '待写'; }
</script>

<template>
  <div class="chapter-tree">
    <div style="padding: 6px 8px; display: flex; gap: 6px; align-items: center; justify-content: space-between; margin-bottom: 8px;">
      <span style="font-weight: 600; font-size: 13px;">章节目录</span>
      <div style="display: flex; gap: 4px;">
        <el-button size="small" @click="createVolume()">＋ 卷</el-button>
        <el-button size="small" type="primary" plain @click="createChapter(null)">＋ 章节</el-button>
      </div>
    </div>

    <template v-if="volumes.length === 0">
      <div class="chapter-item" v-for="ch in chapters" :key="ch.id" :class="{ active: ch.id === selectedChapterId }" @click="emit('select', ch.id)">
        <span class="title">{{ ch.title || '新章节' }}</span>
        <span class="wc">{{ (ch.word_count || 0) }}</span>
        <span class="status-badge" :class="ch.status">{{ statusLabel(ch.status) }}</span>
        <el-button link size="small" @click.stop="deleteChapter(ch.id)">✕</el-button>
      </div>
      <div v-if="chapters.length === 0" class="muted" style="padding: 10px; font-size: 12px; text-align: center;">暂无章节，点击上方“＋ 章节”创建</div>
    </template>

    <div v-for="v in volumes" :key="v.id" class="volume-group">
      <div class="volume-title">
        <span>▸ {{ v.title }}</span>
        <el-button link size="small" @click.stop="createChapter(v.id)">＋</el-button>
      </div>
      <div class="chapter-item"
        v-for="ch in chapters.filter((c: any) => c.volume_id === v.id)"
        :key="ch.id"
        :class="{ active: ch.id === selectedChapterId }"
        @click="emit('select', ch.id)">
        <span class="title">{{ ch.title || '新章节' }}</span>
        <span class="wc">{{ (ch.word_count || 0) }}</span>
        <span class="status-badge" :class="ch.status">{{ statusLabel(ch.status) }}</span>
        <el-button link size="small" @click.stop="deleteChapter(ch.id)">✕</el-button>
      </div>
    </div>
  </div>
</template>
