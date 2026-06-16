<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { lingmo } from '@/api/lingmo';
import { useUiStore } from '@/stores/ui';

const ui = useUiStore();
const active = ref('settings');

const projectSettings = reactive({ core_sell: '', core_conflict: '', opening_hook: '', target_audience: '', taboos: '', style: '' });
const worldview = reactive({ base_rules: '', time_line: '', geography: '', terminology: '', power_levels: '' });
const factions = ref<any[]>([]);
const artifacts = ref<any[]>([]);
const foreshadows = ref<any[]>([]);

async function loadAll() {
  if (!ui.currentProjectId) { ElMessage.warning('请先在作品中心选择一个作品。'); return; }
  const pid = ui.currentProjectId;
  const [ps, wv, f1, f2, fs] = await Promise.all([
    lingmo.invoke(lingmo.ACTIONS.PROJECT_SETTINGS_GET, { project_id: pid }),
    lingmo.invoke(lingmo.ACTIONS.WORLDVIEW_GET, { project_id: pid }),
    lingmo.invoke(lingmo.ACTIONS.FACTION_LIST, { project_id: pid }),
    lingmo.invoke(lingmo.ACTIONS.ARTIFACT_LIST, { project_id: pid }),
    lingmo.invoke(lingmo.ACTIONS.FORESHADOW_LIST, { project_id: pid })
  ]);
  if (ps.ok && ps.data) Object.assign(projectSettings, ps.data);
  if (wv.ok && wv.data) Object.assign(worldview, wv.data);
  factions.value = f1.ok && Array.isArray(f1.data) ? f1.data : [];
  artifacts.value = f2.ok && Array.isArray(f2.data) ? f2.data : [];
  foreshadows.value = fs.ok && Array.isArray(fs.data) ? fs.data : [];
}

async function saveProjectSettings() {
  const r = await lingmo.invoke(lingmo.ACTIONS.PROJECT_SETTINGS_SAVE, { project_id: ui.currentProjectId, ...projectSettings });
  ElMessage.success(r.ok ? '已保存项目设定' : '保存失败');
}
async function saveWorldview() {
  const r = await lingmo.invoke(lingmo.ACTIONS.WORLDVIEW_SAVE, { project_id: ui.currentProjectId, ...worldview });
  ElMessage.success(r.ok ? '已保存世界观' : '保存失败');
}

function newFaction() { factions.value.push({ id: null, name: '新势力', category: 'sect', stance: '', territory: '', core_people: '', description: '' }); }
async function saveFaction(f: any) {
  const r = await lingmo.invoke(lingmo.ACTIONS.FACTION_SAVE, { project_id: ui.currentProjectId, ...f });
  if (r.ok && r.data) { Object.assign(f, r.data); ElMessage.success('已保存'); }
}
async function deleteFaction(f: any) {
  if (!f.id) { factions.value = factions.value.filter((x: any) => x !== f); return; }
  const r = await lingmo.invoke(lingmo.ACTIONS.FACTION_DELETE, { id: f.id });
  if (r.ok) factions.value = factions.value.filter((x: any) => x.id !== f.id);
}

function newArtifact() { artifacts.value.push({ id: null, name: '新物品', category: 'item', attributes: '', origin: '', usage: '', description: '' }); }
async function saveArtifact(a: any) {
  const r = await lingmo.invoke(lingmo.ACTIONS.ARTIFACT_SAVE, { project_id: ui.currentProjectId, ...a });
  if (r.ok && r.data) { Object.assign(a, r.data); ElMessage.success('已保存'); }
}
async function deleteArtifact(a: any) {
  if (!a.id) { artifacts.value = artifacts.value.filter((x: any) => x !== a); return; }
  const r = await lingmo.invoke(lingmo.ACTIONS.ARTIFACT_DELETE, { id: a.id });
  if (r.ok) artifacts.value = artifacts.value.filter((x: any) => x.id !== a.id);
}

function newForeshadow() { foreshadows.value.push({ id: null, title: '新伏笔', content: '', status: 'todo', priority: 2 }); }
async function saveForeshadow(f: any) {
  const action = f.id ? lingmo.ACTIONS.FORESHADOW_UPDATE : lingmo.ACTIONS.FORESHADOW_CREATE;
  const r = await lingmo.invoke(action, { project_id: ui.currentProjectId, ...f });
  if (r.ok && r.data) { if (!f.id) f.id = r.data.id; ElMessage.success('已保存'); }
}
async function deleteForeshadow(f: any) {
  if (!f.id) { foreshadows.value = foreshadows.value.filter((x: any) => x !== f); return; }
  const r = await lingmo.invoke(lingmo.ACTIONS.FORESHADOW_DELETE, { id: f.id });
  if (r.ok) foreshadows.value = foreshadows.value.filter((x: any) => x.id !== f.id);
}

onMounted(loadAll);
</script>

<template>
  <div class="hub-wrap" v-if="ui.currentProjectId">
    <div class="hub-header">
      <h2 class="title">设定中枢 · {{ ui.currentProjectName }}</h2>
      <p class="sub">项目设定 / 世界观 / 势力 / 物品 / 伏笔 · 互通联动；AI 生成时自动读取。</p>
      <el-button type="primary" @click="loadAll">重新加载</el-button>
    </div>

    <div class="tabs">
      <div class="tab" :class="{ active: active === 'settings' }" @click="active = 'settings'">项目总设定</div>
      <div class="tab" :class="{ active: active === 'worldview' }" @click="active = 'worldview'">世界观</div>
      <div class="tab" :class="{ active: active === 'factions' }" @click="active = 'factions'">势力体系</div>
      <div class="tab" :class="{ active: active === 'artifacts' }" @click="active = 'artifacts'">物品资料库</div>
      <div class="tab" :class="{ active: active === 'foreshadows' }" @click="active = 'foreshadows'">伏笔追踪</div>
    </div>

    <div class="tab-pane" v-show="active === 'settings'">
      <div class="card">
        <h3>项目核心设定</h3>
        <div class="grid">
          <div class="field"><label>核心卖点 / 故事钩子</label><el-input v-model="projectSettings.core_sell" type="textarea" :rows="2"/></div>
          <div class="field"><label>核心冲突</label><el-input v-model="projectSettings.core_conflict" type="textarea" :rows="2"/></div>
          <div class="field"><label>开篇钩子</label><el-input v-model="projectSettings.opening_hook" type="textarea" :rows="2"/></div>
          <div class="field"><label>目标受众</label><el-input v-model="projectSettings.target_audience"/></div>
          <div class="field"><label>创作禁忌 / 雷区</label><el-input v-model="projectSettings.taboos" type="textarea" :rows="2"/></div>
          <div class="field"><label>整体文风</label><el-input v-model="projectSettings.style" type="textarea" :rows="2"/></div>
        </div>
        <el-button type="primary" @click="saveProjectSettings">保存项目设定</el-button>
      </div>
    </div>

    <div class="tab-pane" v-show="active === 'worldview'">
      <div class="card">
        <h3>世界观设定</h3>
        <div class="grid">
          <div class="field"><label>世界基础规则</label><el-input v-model="worldview.base_rules" type="textarea" :rows="3"/></div>
          <div class="field"><label>时间线 / 历史</label><el-input v-model="worldview.time_line" type="textarea" :rows="3"/></div>
          <div class="field"><label>地域划分 / 场景</label><el-input v-model="worldview.geography" type="textarea" :rows="3"/></div>
          <div class="field"><label>力量等级体系</label><el-input v-model="worldview.power_levels" type="textarea" :rows="3"/></div>
          <div class="field full"><label>专属术语 / 设定</label><el-input v-model="worldview.terminology" type="textarea" :rows="3"/></div>
        </div>
        <el-button type="primary" @click="saveWorldview">保存世界观</el-button>
      </div>
    </div>

    <div class="tab-pane" v-show="active === 'factions'">
      <div class="card">
        <div class="card-header"><h3>势力体系 · 共 {{ factions.length }} 个</h3><el-button type="primary" @click="newFaction">＋ 新增势力</el-button></div>
        <div class="item-list">
          <div v-for="(f, i) in factions" :key="i" class="item">
            <div class="item-grid">
              <el-input v-model="f.name" placeholder="名称"/>
              <el-select v-model="f.category" style="width:100%;">
                <el-option label="宗门" value="sect"/><el-option label="家族" value="family"/><el-option label="组织" value="org"/><el-option label="国家" value="country"/><el-option label="其他" value="other"/>
              </el-select>
              <el-input v-model="f.stance" placeholder="立场（正/邪/中立）"/>
              <el-input v-model="f.territory" placeholder="地盘"/>
              <el-input v-model="f.core_people" placeholder="核心人物"/>
              <el-input v-model="f.description" type="textarea" :rows="2" placeholder="描述"/>
            </div>
            <div class="item-actions">
              <el-button size="small" type="primary" @click="saveFaction(f)">保存</el-button>
              <el-button size="small" type="danger" @click="deleteFaction(f)">删除</el-button>
            </div>
          </div>
          <div v-if="factions.length === 0" class="muted">暂无势力，点击「＋ 新增势力」创建。</div>
        </div>
      </div>
    </div>

    <div class="tab-pane" v-show="active === 'artifacts'">
      <div class="card">
        <div class="card-header"><h3>物品资料库 · 共 {{ artifacts.length }} 个</h3><el-button type="primary" @click="newArtifact">＋ 新增物品</el-button></div>
        <div class="item-list">
          <div v-for="(a, i) in artifacts" :key="i" class="item">
            <div class="item-grid">
              <el-input v-model="a.name" placeholder="名称"/>
              <el-select v-model="a.category" style="width:100%;">
                <el-option label="法宝" value="magic"/><el-option label="丹药" value="pill"/><el-option label="功法" value="skill"/><el-option label="道具" value="item"/><el-option label="信物" value="token"/>
              </el-select>
              <el-input v-model="a.attributes" placeholder="属性 / 数值"/>
              <el-input v-model="a.origin" placeholder="来源"/>
              <el-input v-model="a.usage" placeholder="用途"/>
              <el-input v-model="a.description" type="textarea" :rows="2" placeholder="描述"/>
            </div>
            <div class="item-actions">
              <el-button size="small" type="primary" @click="saveArtifact(a)">保存</el-button>
              <el-button size="small" type="danger" @click="deleteArtifact(a)">删除</el-button>
            </div>
          </div>
          <div v-if="artifacts.length === 0" class="muted">暂无物品。</div>
        </div>
      </div>
    </div>

    <div class="tab-pane" v-show="active === 'foreshadows'">
      <div class="card">
        <div class="card-header"><h3>伏笔追踪库 · 共 {{ foreshadows.length }} 条</h3><el-button type="primary" @click="newForeshadow">＋ 新增伏笔</el-button></div>
        <div class="item-list">
          <div v-for="(f, i) in foreshadows" :key="i" class="item">
            <div class="item-grid">
              <el-input v-model="f.title" placeholder="标题"/>
              <el-select v-model="f.status" style="width:100%;">
                <el-option label="未埋设" value="todo"/><el-option label="已埋设" value="planted"/><el-option label="已回收" value="resolved"/>
              </el-select>
              <el-input-number v-model="f.priority" :min="1" :max="3" style="width:100%;"/>
              <el-input v-model="f.content" type="textarea" :rows="2" placeholder="伏笔内容 / 回收方案" style="grid-column: span 3;"/>
            </div>
            <div class="item-actions">
              <el-button size="small" type="primary" @click="saveForeshadow(f)">保存</el-button>
              <el-button size="small" type="danger" @click="deleteForeshadow(f)">删除</el-button>
            </div>
          </div>
          <div v-if="foreshadows.length === 0" class="muted">暂无伏笔。</div>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="no-project">请先在「作品管理中心」选择一个作品。</div>
</template>

<style scoped>
.hub-wrap { padding: 20px 28px; height: 100%; overflow: auto; background: var(--bg); color: var(--text); }
.hub-header { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; }
.hub-header .title { margin: 0; font-size: 20px; font-weight: 700; }
.hub-header .sub { flex: 1; margin: 0; color: var(--text-muted); font-size: 13px; padding-right: 20px; }

.tabs { display: flex; gap: 4px; background: var(--surface); padding: 6px; border-radius: 10px; border: 1px solid var(--border); margin-bottom: 14px; }
.tab { padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 14px; color: var(--text-muted); transition: background .15s; }
.tab:hover { background: var(--bg); }
.tab.active { background: var(--primary); color: #fff; font-weight: 600; }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; margin-bottom: 14px; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.card-header h3 { margin: 0; font-size: 16px; }

.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
.grid .field.full { grid-column: 1 / -1; }
.grid label { display: block; font-size: 13px; margin-bottom: 4px; color: var(--text-muted); }

.item { margin-bottom: 14px; padding: 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }
.item-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 8px; }
.item-actions { display: flex; gap: 6px; }

.muted { color: var(--text-muted); font-size: 13px; padding: 12px; text-align: center; }
.no-project { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); background: var(--bg); }
</style>
