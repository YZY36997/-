<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessageBox, ElMessage } from 'element-plus';
import { lingmo } from '@/api/lingmo';
import { useUiStore } from '@/stores/ui';

const ui = useUiStore();
const router = useRouter();

const projects = ref<any[]>([]);
const keyword = ref('');
const genre = ref('全部');
const loading = ref(false);
const showDialog = ref(false);
const form = ref<any>({ name: '', genre: '玄幻', summary: '' });

const templates = [
  { name: '玄幻', icon: '🗡️', desc: '修仙、武道、天地灵气' },
  { name: '仙侠', icon: '🧘', desc: '侠客、道术、仙山秘境' },
  { name: '都市', icon: '🏙️', desc: '都市现实、职场情感' },
  { name: '灵异', icon: '👻', desc: '鬼怪、悬疑、恐怖' },
  { name: '科幻', icon: '🚀', desc: '未来、太空、赛博朋克' }
];

const filtered = computed(() => {
  return projects.value.filter((p) =>
    (genre.value === '全部' || p.genre === genre.value) &&
    (!keyword.value || p.name.includes(keyword.value))
  );
});

async function load() {
  loading.value = true;
  const res = await lingmo.invoke(lingmo.ACTIONS.PROJECT_LIST, { keyword: '', genre: '' });
  projects.value = res.ok && res.data ? res.data : [];
  loading.value = false;
}

function openNew() {
  form.value = { name: '', genre: '玄幻', summary: '' };
  showDialog.value = true;
}

function openFromTemplate(t: any) {
  form.value = { name: `${t.name}· 新作品`, genre: t.name, summary: t.desc };
  showDialog.value = true;
}

async function createProject() {
  if (!form.value.name.trim()) {
    ElMessage.warning('请填写作品名称');
    return;
  }
  const r = await lingmo.invoke(lingmo.ACTIONS.PROJECT_CREATE, form.value);
  if (r.ok) {
    ElMessage.success('作品已创建');
    showDialog.value = false;
    load();
  } else {
    ElMessage.error(r.error || '创建失败');
  }
}

function enter(p: any) {
  ui.setProject(p.id, p.name);
  router.push('/editor');
}

async function removeProject(p: any) {
  try {
    await ElMessageBox.confirm(`确定删除《${p.name}》？`, '提示', { type: 'warning' });
    await lingmo.invoke(lingmo.ACTIONS.PROJECT_DELETE, { id: p.id });
    load();
  } catch {}
}

async function rename(p: any) {
  try {
    const { value }: any = await ElMessageBox.prompt('新名称', '重命名', { inputValue: p.name });
    if (!value) return;
    await lingmo.invoke(lingmo.ACTIONS.PROJECT_UPDATE, { id: p.id, name: value, genre: p.genre, summary: p.summary || '' });
    load();
  } catch {}
}

function fmtDate(s: string) {
  return s ? s.replace('T', ' ').slice(0, 16) : '-';
}

onMounted(load);
</script>

<template>
  <div style="height:100%;overflow:auto;background:var(--bg);padding:28px 32px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div>
        <div style="font-size:26px;font-weight:700;letter-spacing:2px">灵墨小说工坊</div>
        <div style="color:var(--text-muted);margin-top:6px;font-size:14px">长篇网文 AI 创作 · 设定中枢 · RAG 记忆 · 追读力分析</div>
      </div>
      <div style="display:flex;gap:10px">
        <el-button type="primary" @click="openNew">+ 新建作品</el-button>
      </div>
    </div>

    <div style="display:flex;flex-wrap:wrap;gap:14px;margin-bottom:24px">
      <div v-for="t in templates" :key="t.name"
           @click="openFromTemplate(t)"
           style="flex:1;min-width:180px;padding:16px;border-radius:10px;border:1px solid var(--border);background:var(--surface);cursor:pointer;transition:border-color .2s">
        <div style="font-size:22px">{{ t.icon }}</div>
        <div style="font-weight:600;margin-top:6px">{{ t.name }}</div>
        <div style="color:var(--text-muted);font-size:12.5px;margin-top:4px">{{ t.desc }}</div>
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:16px;margin-bottom:14px">
      <el-button-group>
        <el-button :type="genre === '全部' ? 'primary' : ''" @click="genre='全部'">全部</el-button>
        <el-button v-for="t in templates" :key="t.name" :type="genre === t.name ? 'primary' : ''" @click="genre=t.name">{{ t.name }}</el-button>
      </el-button-group>
      <el-input v-model="keyword" placeholder="搜索作品名称" clearable style="width:260px" />
      <span style="color:var(--text-muted)">共 {{ filtered.length }} 部</span>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(260px, 1fr));gap:14px">
      <div v-for="p in filtered" :key="p.id"
           style="border:1px solid var(--border);border-radius:10px;background:var(--surface);overflow:hidden">
        <div style="height:80px;background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700">
          {{ (p.name || '作品').charAt(0) }}
        </div>
        <div style="padding:14px">
          <div style="font-weight:600;font-size:15px">{{ p.name }}</div>
          <div style="color:var(--text-muted);font-size:12.5px;margin-top:4px">{{ p.genre }}</div>
          <div style="margin-top:8px;font-size:12px;color:var(--text-muted)">章节：{{ p.chapter_count || 0 }} · {{ fmtDate(p.updated_at) }}</div>
          <div style="margin-top:8px;display:flex;gap:8px;align-items:center;justify-content:space-between">
            <span style="padding:2px 10px;border-radius:999px;font-size:12px;background:rgba(95,180,255,0.2);color:var(--primary)">{{ p.status || '草稿' }}</span>
            <el-button size="small" type="primary" @click="enter(p)">进入创作</el-button>
          </div>
          <div style="margin-top:10px;display:flex;gap:8px">
            <el-button size="small" @click="rename(p)">重命名</el-button>
            <el-button size="small" type="danger" @click="removeProject(p)">删除</el-button>
          </div>
        </div>
      </div>
      <div v-if="filtered.length === 0" style="padding:60px;color:var(--text-muted);text-align:center;border:1px dashed var(--border);border-radius:10px">
        暂无作品，点击「+ 新建作品」或上方模板开始创作
      </div>
    </div>
  </div>

  <el-dialog v-model="showDialog" title="新建作品" width="520px">
    <el-form label-width="90px">
      <el-form-item label="作品名称">
        <el-input v-model="form.name" placeholder="例如：某某传" />
      </el-form-item>
      <el-form-item label="题材分类">
        <el-select v-model="form.genre">
          <el-option v-for="t in templates" :key="t.name" :label="t.name" :value="t.name" />
        </el-select>
      </el-form-item>
      <el-form-item label="简介">
        <el-input v-model="form.summary" type="textarea" :rows="3" placeholder="可选，一段简短的介绍" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showDialog=false">取消</el-button>
      <el-button type="primary" @click="createProject">创建</el-button>
    </template>
  </el-dialog>
</template>
