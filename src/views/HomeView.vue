<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, ElDialog } from 'element-plus';
import { lingmo } from '@/api/lingmo';
import { useUiStore } from '@/stores/ui';

const ui = useUiStore();
const router = useRouter();
const projects = ref<any[]>([]);
const recycleBin = ref<any[]>([]);
const keyword = ref('');
const genre = ref('全部');
const sortBy = ref('updated_at');
const loading = ref(false);
const viewMode = ref<'work' | 'recycle'>('work');

const showDialog = ref(false);
const form = ref<any>({ name: '', genre: '玄幻', description: '' });

const templates = [
  { name: '玄幻', icon: '☷', desc: '修仙、武道、天地灵气' },
  { name: '仙侠', icon: '☯', desc: '侠客、道术、仙山秘境' },
  { name: '都市', icon: '🏙', desc: '都市现实、职场情感' },
  { name: '灵异', icon: '☠', desc: '鬼怪、悬疑、恐怖' },
  { name: '科幻', icon: '🚀', desc: '未来、太空、赛博朋克' },
  { name: '言情', icon: '❀', desc: '情感、恋爱、故事' },
  { name: '历史', icon: '✦', desc: '历史传记、王朝更替' },
  { name: '悬疑', icon: '◉', desc: '推理、案件、阴谋' }
];

const filtered = computed(() => {
  let list = projects.value;
  if (genre.value !== '全部') list = list.filter(p => p.genre === genre.value);
  if (keyword.value) list = list.filter(p => (p.name || '').includes(keyword.value));
  if (sortBy.value === 'created_at') list = [...list].sort((a, b) => (b.id || 0) - (a.id || 0));
  else list = [...list].sort((a, b) => (b.id || 0) - (a.id || 0));
  return list;
});

async function load() {
  loading.value = true;
  const r = await lingmo.invoke(lingmo.ACTIONS.PROJECT_LIST, { genre: '', keyword: '' });
  projects.value = r.ok && Array.isArray(r.data) ? r.data : [];
  loading.value = false;
}
async function loadRecycle() {
  const r = await lingmo.invoke(lingmo.ACTIONS.PROJECT_RECYCLE_LIST);
  recycleBin.value = r.ok && Array.isArray(r.data) ? r.data : [];
}

function openNew() { form.value = { name: '', genre: '玄幻', description: '' }; showDialog.value = true; }
function openFromTemplate(t: any) { form.value = { name: '', genre: t.name, description: t.desc }; showDialog.value = true; }

async function createProject() {
  if (!form.value.name.trim()) { ElMessage.warning('请填写作品名称'); return; }
  const r = await lingmo.invoke(lingmo.ACTIONS.PROJECT_CREATE, form.value);
  if (r.ok) { ElMessage.success('作品已创建'); showDialog.value = false; load(); }
  else ElMessage.error(r.error || '创建失败');
}

function enter(p: any) { ui.setProject(p.id, p.name); router.push('/editor'); }

async function removeProject(p: any) {
  try {
    await ElMessageBox.confirm(`确定删除《${p.name}》？（将移入回收站，可恢复）`, '提示', { type: 'warning' });
    const r = await lingmo.invoke(lingmo.ACTIONS.PROJECT_DELETE, { id: p.id });
    if (r.ok) { ElMessage.success('已移入回收站'); load(); }
    else ElMessage.error(r.error || '失败');
  } catch (_) {}
}

async function restoreProject(p: any) {
  const r = await lingmo.invoke(lingmo.ACTIONS.PROJECT_RESTORE, { id: p.id });
  if (r.ok) { ElMessage.success('已恢复'); loadRecycle(); load(); }
}

async function rename(p: any) {
  try {
    const { value }: any = await ElMessageBox.prompt('新名称', '重命名', { inputValue: p.name });
    if (!value) return;
    const r = await lingmo.invoke(lingmo.ACTIONS.PROJECT_UPDATE, { id: p.id, name: value, genre: p.genre, description: p.description || '', status: p.status || 'draft' });
    if (r.ok) load(); else ElMessage.error(r.error || '失败');
  } catch (_) {}
}

async function exportProject(p: any) {
  const r = await lingmo.invoke(lingmo.ACTIONS.PROJECT_EXPORT_JSON, { id: p.id });
  if (r.ok && r.data) {
    try {
      const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${p.name || '作品'}_备份_${Date.now()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      ElMessage.success('已导出作品备份');
    } catch (e: any) { ElMessage.error('导出失败：' + e.message); }
  }
}

async function importProject(file: File) {
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const name = json.project?.name || '导入作品';
    const r = await lingmo.invoke(lingmo.ACTIONS.PROJECT_CREATE, { name, genre: json.project?.genre || '玄幻', description: json.project?.description || '' });
    if (!r.ok) throw new Error(r.error || '创建失败');
    ElMessage.success(`已导入：${name}`);
    load();
  } catch (e: any) { ElMessage.error('导入失败：' + e.message); }
}

function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files[0]) importProject(input.files[0]);
}

onMounted(async () => { await load(); if (recycleBin.value.length === 0) await loadRecycle(); });
</script>

<template>
  <div class="home-wrap">
    <div class="home-toolbar">
      <div class="flex gap-12 items-center">
        <el-button type="primary" @click="openNew">＋ 新建作品</el-button>
        <el-button @click="openFromTemplate({ name: '玄幻', desc: '' })">模板·玄幻</el-button>
        <el-button @click="openFromTemplate({ name: '仙侠', desc: '' })">模板·仙侠</el-button>
        <label class="el-button import-btn">
          导入本地作品
          <input type="file" accept=".json" style="display:none" @change="onImportFile"/>
        </label>
        <el-button @click="exportProject({ id: 0, name: '全部' })" v-if="false">导出</el-button>
      </div>
      <div class="flex gap-12 items-center" style="margin-left:auto">
        <el-radio-group v-model="genre" size="default">
          <el-radio-button value="全部">全部</el-radio-button>
          <el-radio-button v-for="t in templates" :key="t.name" :value="t.name">{{ t.name }}</el-radio-button>
        </el-radio-group>
        <el-input v-model="keyword" placeholder="搜索作品名称" clearable style="width:240px"/>
        <el-select v-model="sortBy" style="width:140px">
          <el-option label="按更新时间" value="updated_at"/>
          <el-option label="按创建时间" value="created_at"/>
        </el-select>
        <el-button type="warning" plain @click="viewMode = viewMode === 'work' ? 'recycle' : 'work'; if (viewMode === 'recycle') loadRecycle()">
          {{ viewMode === 'work' ? '回收站' : '返回作品' }}（{{ viewMode === 'work' ? '作品' : '回收站' }}）
        </el-button>
        <el-button @click="ui.toggleTheme()">主题切换</el-button>
      </div>
    </div>

    <div v-if="viewMode === 'work'">
      <div v-if="filtered.length === 0" class="empty-card">
        <div class="empty-title">暂无作品</div>
        <div class="empty-sub">点击「＋ 新建作品」或选择上方模板开始创作</div>
      </div>

      <div v-else class="project-grid">
        <div v-for="p in filtered" :key="p.id" class="project-card">
          <div class="cover" @click="enter(p)">
            <span class="cover-text">{{ (p.name || '作品').charAt(0) }}</span>
            <span class="cover-status">{{ p.status === 'serializing' ? '连载中' : p.status === 'done' ? '已完结' : '草稿' }}</span>
          </div>
          <div class="body">
            <div class="title" @click="enter(p)">{{ p.name }}</div>
            <div class="genre">{{ p.genre }} · {{ p.chapter_count || 0 }} 章</div>
            <div class="meta">
              <span>{{ (p.word_count || 0).toLocaleString() }} 字</span>
              <span class="muted">{{ (p.updated_at || '').toString().replace('T', ' ').slice(0, 16) }}</span>
            </div>
            <div class="actions">
              <el-button size="small" @click="rename(p)">重命名</el-button>
              <el-button size="small" @click="exportProject(p)">导出</el-button>
              <el-button size="small" type="danger" @click="removeProject(p)">删除</el-button>
              <el-button size="small" type="primary" @click="enter(p)">进入创作</el-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else>
      <div class="section-title">回收站（可恢复）</div>
      <div v-if="recycleBin.length === 0" class="empty-card"><div class="empty-title">回收站为空</div></div>
      <div v-else class="project-grid">
        <div v-for="p in recycleBin" :key="p.id" class="project-card recycle">
          <div class="body">
            <div class="title">{{ p.name }}</div>
            <div class="genre">{{ p.genre }}</div>
            <div class="actions">
              <el-button size="small" type="primary" @click="restoreProject(p)">恢复</el-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <el-dialog v-model="showDialog" title="新建作品" width="520px">
      <el-form label-width="80px">
        <el-form-item label="作品名称">
          <el-input v-model="form.name" placeholder="例如：某某传"/>
        </el-form-item>
        <el-form-item label="题材分类">
          <el-select v-model="form.genre">
            <el-option v-for="t in templates" :key="t.name" :label="t.name" :value="t.name"/>
          </el-select>
        </el-form-item>
        <el-form-item label="简介">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="可选，一段简短的介绍"/>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog=false">取消</el-button>
        <el-button type="primary" @click="createProject">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.home-wrap { padding: 20px 28px; }
.home-toolbar { display: flex; flex-wrap: wrap; gap: 12px; padding: 14px 18px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 18px; align-items: center; }
.import-btn { position: relative; cursor: pointer; display: inline-flex; align-items: center; }

.empty-card { padding: 80px 20px; text-align: center; background: var(--surface); border: 1px dashed var(--border); border-radius: 14px; margin: 20px 0; }
.empty-title { font-size: 18px; font-weight: 600; color: var(--text); }
.empty-sub { margin-top: 8px; color: var(--text-muted); font-size: 13px; }

.section-title { font-size: 16px; font-weight: 600; color: var(--text); margin: 14px 4px; }

.project-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }

.project-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; transition: transform .15s, box-shadow .15s; }
.project-card:hover { transform: translateY(-2px); box-shadow: 0 6px 24px rgba(0,0,0,.18); }
.project-card .cover { height: 110px; background: linear-gradient(135deg, var(--primary-grad-a, #3b82f6), var(--primary-grad-b, #7c3aed)); color: #fff; display: flex; align-items: center; justify-content: center; position: relative; cursor: pointer; }
.project-card.recycle .cover { background: linear-gradient(135deg, #78716c, #4b5563); }
.cover-text { font-size: 44px; font-weight: 700; letter-spacing: 2px; }
.cover-status { position: absolute; right: 10px; top: 10px; background: rgba(0,0,0,.3); padding: 2px 10px; border-radius: 999px; font-size: 12px; }
.project-card .body { padding: 14px 16px; }
.project-card .title { font-weight: 700; font-size: 15px; cursor: pointer; }
.project-card .genre { color: var(--text-muted); font-size: 12.5px; margin-top: 4px; }
.project-card .meta { display: flex; justify-content: space-between; margin-top: 8px; font-size: 12.5px; color: var(--text); }
.project-card .actions { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
.muted { color: var(--text-muted); }
</style>
