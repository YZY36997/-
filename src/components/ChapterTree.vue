<script setup lang="ts">
import { ref } from 'vue'
const props = defineProps<{ volumes: any[]; chapters: any[]; currentChapterId: number | null }>()
const emit = defineEmits<{ (e: 'create-chapter', v: number): void; (e: 'select', id: number): void; (e: 'delete', id: number): void }>()

const expanded = ref<Record<number, boolean>>({})

function chaptersOf(vid: number) { return props.chapters.filter((c: any) => c.volume_id === vid) }
function toggle(vid: number) { expanded.value[vid] = !expanded.value[vid] }
</script>

<template>
  <div class="ch-tree" style="flex:1;overflow-y:auto;padding:8px">
    <div v-if="volumes.length === 0" class="muted" style="padding:20px;text-align:center">先新建卷</div>
    <div v-for="v in volumes" :key="v.id" class="vol">
      <div class="vol-header between" @click="toggle(v.id)">
        <div><span class="caret">{{ expanded[v.id] ? '▼' : '▶' }}</span> {{ v.title }}</div>
        <el-button size="small" link @click.stop="emit('create-chapter', v.id)">+ 章节</el-button>
      </div>
      <div v-if="expanded[v.id] !== false">
        <div v-for="c in chaptersOf(v.id)" :key="c.id"
          class="ch-item between" :class="{ active: c.id === currentChapterId }"
          @click="emit('select', c.id)">
          <div class="ellipsis" style="flex:1">{{ c.title }}</div>
          <div class="muted" style="font-size:11px">{{ (c.word_count || 0) }}</div>
          <el-button size="small" link type="danger" @click.stop="emit('delete', c.id)">×</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vol { margin-bottom: 4px; }
.vol-header { padding: 8px 10px; cursor: pointer; font-weight: 600; color: var(--text); }
.vol-header:hover { background: var(--surface-2); border-radius: 6px; }
.caret { font-size: 10px; color: var(--text-muted); margin-right: 4px; }
.ch-item { padding: 6px 22px; border-radius: 6px; cursor: pointer; font-size: 13px; color: var(--text-muted); }
.ch-item:hover { background: var(--surface-2); color: var(--text); }
.ch-item.active { background: linear-gradient(135deg, rgba(95,180,255,0.22), rgba(139,107,255,0.18)); color: var(--text); }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
