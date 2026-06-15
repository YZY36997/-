<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { lingmo } from '@/api/lingmo';
import { useUiStore } from '@/stores/ui';

const ui = useUiStore();
const outline = ref<any[]>([]);
const aiDraft = ref('');
const busy = ref(false);
const editing = ref<any>(null);

async function load() {
  if (!ui.currentProjectId) return;
  const r = await lingmo.invoke(lingmo.ACTIONS.OUTLINE_TREE, { project_id: ui.currentProjectId });
  outline.value = r.ok ? (r.data || []) : [];
}

function addNode(parent: any | null) {
  const parentId = parent ? (parent.parent_id ? `${parent.parent_id}-${parent.id}` : parent.id) : null;
  editing.value = { id: null, parent_id: parentId, title: '新节点', summary: '', core_goal: '', plot: '', pleasure: '', foreshadow: '', mood: '', body: '', sort_order: 0 };
}

async function saveNode() {
  if (!editing.value?.title) { ElMessage.warning('请填写标题'); return; }
  const r = await lingmo.invoke(lingmo.ACTIONS.OUTLINE_SAVE, { project_id: ui.currentProjectId, ...editing.value });
  if (r.ok) { editing.value = null; load(); ElMessage.success('已保存'); }
}

async function removeNode(id: number) {
  const r = await lingmo.invoke(lingmo.ACTIONS.OUTLINE_DELETE, { id });
  if (r.ok) load();
}

async function aiGenOutline() {
  busy.value = true;
  const r = await lingmo.invoke(lingmo.ACTIONS.AI_GENERATE_OUTLINE, { project_id: ui.currentProjectId, hint: '请生成分卷分章大纲' });
  const data: any = r.ok && r.data ? r.data : null;
  aiDraft.value = data && (typeof data === 'string') ? data : (data && data.text ? data.text : '');
  busy.value = false;
}

onMounted(load);
</script>

<template>
  <div class="outline-wrap" v-if="ui.currentProjectId">
    <div class="header">
      <h2>大纲创作系统</h2>
      <p class="sub">层级树形大纲，可无限新增节点。AI 按设定自动生成章节要点。</p>
      <div class="actions">
        <el-button @click="addNode(null)">＋ 新增一级节点</el-button>
        <el-button type="primary" @click="aiGenOutline" :loading="busy">AI 生成大纲</el-button>
      </div>
    </div>

    <div v-if="aiDraft" class="card">
      <div class="card-title">AI 草稿（可复制、修改，按需创建节点）</div>
      <pre class="draft-box">{{ aiDraft }}</pre>
    </div>

    <div class="card">
      <div class="card-title">章节节点 · 共 {{ outline.length }} 条</div>
      <div v-if="outline.length === 0" class="muted">暂无节点。点击「＋ 新增一级节点」创建第一卷。</div>
      <div v-for="(o, i) in outline" :key="i" class="node">
        <div class="node-title">
          <b>{{ o.title }}</b>
          <div class="node-actions">
            <el-button size="small" @click="editing = o">编辑</el-button>
            <el-button size="small" @click="addNode(o)">＋ 子节点</el-button>
            <el-button size="small" type="danger" @click="removeNode(o.id)">删除</el-button>
          </div>
        </div>
        <div class="node-body" v-if="o.core_goal || o.summary || o.plot || o.mood || o.foreshadow">
          <div v-if="o.core_goal"><span class="tag">核心目标</span>{{ o.core_goal }}</div>
          <div v-if="o.summary"><span class="tag">章节摘要</span>{{ o.summary }}</div>
          <div v-if="o.plot"><span class="tag">剧情走向</span>{{ o.plot }}</div>
          <div v-if="o.pleasure"><span class="tag">爽点设计</span>{{ o.pleasure }}</div>
          <div v-if="o.foreshadow"><span class="tag">预埋伏笔</span>{{ o.foreshadow }}</div>
          <div v-if="o.mood"><span class="tag">情绪节奏</span>{{ o.mood }}</div>
        </div>
      </div>
    </div>

    <el-dialog v-model="editing" :title="editing && editing.id ? '编辑节点' : '新增节点'" width="640px">
      <template v-if="editing">
        <div class="dlg-form">
          <div class="field"><label>标题</label><el-input v-model="editing.title"/></div>
          <div class="field"><label>核心目标</label><el-input v-model="editing.core_goal" type="textarea" :rows="2"/></div>
          <div class="field"><label>章节摘要</label><el-input v-model="editing.summary" type="textarea" :rows="2"/></div>
          <div class="field"><label>剧情走向</label><el-input v-model="editing.plot" type="textarea" :rows="2"/></div>
          <div class="field"><label>爽点设计</label><el-input v-model="editing.pleasure" type="textarea" :rows="2"/></div>
          <div class="field"><label>预埋伏笔</label><el-input v-model="editing.foreshadow" type="textarea" :rows="2"/></div>
          <div class="field"><label>情绪节奏</label><el-input v-model="editing.mood" type="textarea" :rows="2"/></div>
          <div class="field"><label>正文/备注</label><el-input v-model="editing.body" type="textarea" :rows="3"/></div>
        </div>
      </template>
      <template #footer>
        <el-button @click="editing = null">取消</el-button>
        <el-button type="primary" @click="saveNode">保存</el-button>
      </template>
    </el-dialog>
  </div>
  <div v-else class="no-project">请先在「作品管理中心」选择一个作品。</div>
</template>

<style scoped>
.outline-wrap { padding: 20px 28px; height: 100%; overflow: auto; background: var(--bg); color: var(--text); }
.header { display: flex; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.header h2 { margin: 0; }
.sub { flex: 1; margin: 0; color: var(--text-muted); font-size: 13px; }
.actions { display: flex; gap: 8px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; margin-bottom: 14px; }
.card-title { font-weight: 700; font-size: 15px; margin-bottom: 10px; }
.draft-box { background: var(--bg); padding: 12px; border-radius: 8px; white-space: pre-wrap; font-size: 13px; border: 1px solid var(--border); }
.node { padding: 12px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 10px; background: var(--bg); }
.node-title { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.node-actions { display: flex; gap: 6px; }
.node-body { margin-top: 10px; font-size: 13.5px; line-height: 1.7; }
.node-body > div { margin-bottom: 6px; }
.tag { display: inline-block; padding: 2px 8px; background: var(--primary); color: #fff; border-radius: 4px; font-size: 11px; margin-right: 8px; }
.muted { color: var(--text-muted); text-align: center; padding: 20px; }
.no-project { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); }
.dlg-form .field { margin-bottom: 10px; }
.dlg-form label { display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 4px; }
</style>
