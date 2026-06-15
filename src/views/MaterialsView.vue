<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { lingmo } from '@/api/lingmo';
import { useUiStore } from '@/stores/ui';
import { useI18n } from '@/composables/useI18n';

const ui = useUiStore();
const { t } = useI18n();

type Material = {
  id: number;
  project_id: number | null;
  category: string;
  title: string;
  body: string;
  source_file?: string;
  tags?: string;
  notes?: string;
};

const category = ref('chapter');
const categories = [
  { key: 'chapter', label: () => t('materials.chapter') },
  { key: 'outline', label: () => t('materials.outline') },
  { key: 'character', label: () => t('materials.character') },
  { key: 'worldbuilding', label: () => t('materials.worldbuilding') },
  { key: 'general', label: () => t('materials.general') }
];

const items = ref<Material[]>([]);
const selectedId = ref<number | null>(null);
const draft = ref<Material>({ id: 0, project_id: null, category: 'chapter', title: '', body: '', tags: '', notes: '' });

const selected = computed(() => items.value.find(m => m.id === selectedId.value));

async function load() {
  if (!ui.currentProjectId) {
    alert('请先选择作品');
    return;
  }
  const r = await lingmo.invoke<Material[]>(lingmo.ACTIONS.MATERIAL_LIST, { project_id: ui.currentProjectId, category: category.value });
  items.value = r.ok && Array.isArray(r.data) ? r.data : [];
  if (items.value.length && !items.value.find(m => m.id === selectedId.value)) {
    select(items.value[0]);
  } else if (!items.value.length) {
    selectedId.value = null;
    newMaterial();
  }
}

function select(m: Material) {
  selectedId.value = m.id;
  draft.value = { ...m };
}

function newMaterial() {
  selectedId.value = null;
  draft.value = { id: 0, project_id: ui.currentProjectId, category: category.value, title: '新素材', body: '', tags: '', notes: '' };
}

async function save() {
  const r = await lingmo.invoke<{ id: number }>(lingmo.ACTIONS.MATERIAL_SAVE, {
    ...draft.value,
    project_id: ui.currentProjectId,
    category: category.value
  });
  if (r.ok) {
    ElMessage.success('已保存');
    await load();
  }
}

async function deleteCurrent() {
  if (!selected.value) return;
  if (!confirm('确认删除该素材？')) return;
  await lingmo.invoke(lingmo.ACTIONS.MATERIAL_DELETE, { id: selected.value.id });
  await load();
}

async function onFileSelected(event: Event, mode: 'chapter' | 'outline' | 'character' | 'material') {
  const input = event.target as HTMLInputElement;
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const text = await file.text();
  if (mode === 'chapter') {
    await lingmo.invoke(lingmo.ACTIONS.MATERIAL_IMPORT_CHAPTER_TEXT, { project_id: ui.currentProjectId, text, split_by_blank: false });
    ElMessage.success('章节文本导入完成，请前往正文创作页查看。');
  } else if (mode === 'outline') {
    await lingmo.invoke(lingmo.ACTIONS.MATERIAL_IMPORT_OUTLINE_TEXT, { project_id: ui.currentProjectId, text });
    ElMessage.success('大纲导入完成。');
  } else if (mode === 'character') {
    await lingmo.invoke(lingmo.ACTIONS.MATERIAL_IMPORT_CHARACTER_TEXT, { project_id: ui.currentProjectId, text });
    ElMessage.success('人物设定导入完成。');
  } else {
    await lingmo.invoke(lingmo.ACTIONS.MATERIAL_BULK_IMPORT, {
      project_id: ui.currentProjectId,
      category: category.value,
      rows: [{ title: file.name.replace(/\.[^.]+$/, ''), body: text, source_file: file.name }]
    });
    await load();
  }
  input.value = '';
}

watch(category, load);
watch(() => ui.currentProjectId, load);

onMounted(load);
</script>

<template>
  <div class="page-wrap materials-page">
    <div class="page-header">
      <h2>{{ t('materials.title') }}</h2>
      <p>{{ t('materials.subtitle') }}</p>
    </div>

    <div class="materials-body">
      <aside class="materials-left">
        <div class="category-tabs">
          <button
            v-for="c in categories"
            :key="c.key"
            :class="{ active: category === c.key }"
            @click="category = c.key"
          >{{ c.label() }}</button>
        </div>
        <div class="materials-list">
          <div class="list-actions">
            <button class="btn primary" @click="newMaterial">＋ {{ t('materials.new') }}</button>
          </div>
          <div
            v-for="m in items"
            :key="m.id"
            class="material-item"
            :class="{ active: m.id === selectedId }"
            @click="select(m)"
          >
            <div class="material-title">{{ m.title }}</div>
            <div class="material-preview">{{ (m.body || '').slice(0, 80) }}</div>
          </div>
          <div v-if="items.length === 0" class="empty muted">暂无素材，点右上角新增。</div>
        </div>
      </aside>

      <section class="materials-center">
        <div class="toolbar">
          <el-input v-model="draft.title" placeholder="素材标题" style="max-width: 360px;" />
          <button class="btn primary" @click="save">{{ t('common.save') }}</button>
          <button class="btn danger" v-if="selected" @click="deleteCurrent">{{ t('common.delete') }}</button>
          <label class="btn">
            {{ t('materials.importFile') }}
            <input type="file" accept=".txt,.md,.markdown" style="display:none"
              @change="(e: any) => onFileSelected(e, 'material')" />
          </label>
          <label class="btn">
            {{ t('materials.importChapterText') }}
            <input type="file" accept=".txt,.md,.markdown" style="display:none"
              @change="(e: any) => onFileSelected(e, 'chapter')" />
          </label>
          <label class="btn">
            {{ t('materials.importOutlineText') }}
            <input type="file" accept=".txt,.md,.markdown" style="display:none"
              @change="(e: any) => onFileSelected(e, 'outline')" />
          </label>
          <label class="btn">
            {{ t('materials.importCharacterText') }}
            <input type="file" accept=".txt,.md,.markdown" style="display:none"
              @change="(e: any) => onFileSelected(e, 'character')" />
          </label>
        </div>
        <div class="form">
          <label>{{ t('materials.tags') }}</label>
          <el-input v-model="draft.tags" placeholder="如：剧情, 高潮, 角色A" />
          <label>{{ t('materials.notes') }}</label>
          <el-input v-model="draft.notes" type="textarea" :rows="2" />
          <label>{{ t('materials.body') }}</label>
          <el-input v-model="draft.body" type="textarea" :rows="18" placeholder="正文 / 素材内容（Markdown 兼容）" />
        </div>
      </section>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.materials-page { padding: 0; height: 100%; }
.materials-body {
  display: grid;
  grid-template-columns: 320px 1fr;
  height: calc(100% - 80px);
  gap: 12px;
  padding: 12px 20px 20px;
}
.materials-left {
  border-right: 1px solid var(--border);
  padding-right: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
  button {
    padding: 6px 10px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    &.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  }
}
.materials-list { flex: 1; overflow-y: auto; }
.list-actions { margin-bottom: 8px; }
.material-item {
  padding: 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  &.active { background: var(--surface); border-color: var(--border); }
  &:hover { background: var(--surface); }
  .material-title { font-weight: 600; }
  .material-preview { font-size: 12px; color: var(--muted); margin-top: 4px; }
}
.materials-center {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.form {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  label { font-size: 13px; color: var(--muted); margin-top: 6px; }
}
.empty { padding: 16px; text-align: center; }
</style>
