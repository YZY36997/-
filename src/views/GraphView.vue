<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { lingmo } from '@/api/lingmo';
import { useUiStore } from '@/stores/ui';
import { ElMessage } from 'element-plus';

const ui = useUiStore();
const route = useRoute();
const router = useRouter();

const projectId = ref<number | null>(null);
const characters = ref<any[]>([]);
const relations = ref<any[]>([]);

const view = reactive({ scale: 1, tx: 40, ty: 40 });
const dragging = reactive<{ id: number | null; startX: number; startY: number }>({ id: null, startX: 0, startY: 0 });
const panning = reactive({ on: false, x: 0, y: 0 });

async function load() {
  const pid = ui.currentProjectId || null;
  if (!pid) {
    router.push('/home');
    return;
  }
  projectId.value = pid;
  const r1 = await lingmo.invoke(lingmo.ACTIONS.CHARACTER_LIST, { project_id: pid });
  const r2 = await lingmo.invoke(lingmo.ACTIONS.CHARACTER_RELATION_LIST, { project_id: pid });
  const list = r1.ok ? (r1.data || []) : [];
  // 给节点初始化位置（以中心为原点的圆形布局）
  const total = Math.max(list.length, 1);
  const cx = 400, cy = 260, radius = 140;
  characters.value = list.map((c: any, i: number) => {
    const angle = (i / total) * Math.PI * 2;
    return {
      id: c.id, name: c.name || '角色', role: c.role,
      x: c.x ?? (cx + Math.cos(angle) * radius),
      y: c.y ?? (cy + Math.sin(angle) * radius)
    };
  });
  relations.value = r2.ok ? (r2.data || []) : [];
}

function nodeOf(id: number) {
  return characters.value.find((c) => c.id === id);
}

function nodeMouseDown(e: MouseEvent, c: any) {
  e.stopPropagation();
  dragging.id = c.id;
  dragging.startX = e.clientX;
  dragging.startY = e.clientY;
}

function onMouseMove(e: MouseEvent) {
  if (dragging.id !== null) {
    const dx = (e.clientX - dragging.startX) / view.scale;
    const dy = (e.clientY - dragging.startY) / view.scale;
    dragging.startX = e.clientX;
    dragging.startY = e.clientY;
    const idx = characters.value.findIndex((c) => c.id === dragging.id);
    if (idx >= 0) {
      characters.value[idx].x += dx;
      characters.value[idx].y += dy;
    }
  }
  if (panning.on) {
    view.tx += e.clientX - panning.x;
    view.ty += e.clientY - panning.y;
    panning.x = e.clientX;
    panning.y = e.clientY;
  }
}

function onMouseUp() {
  dragging.id = null;
  panning.on = false;
}

function onCanvasMouseDown(e: MouseEvent) {
  panning.on = true;
  panning.x = e.clientX;
  panning.y = e.clientY;
}

function onWheel(e: WheelEvent) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.92 : 1.08;
  view.scale = Math.max(0.35, Math.min(2.5, view.scale * delta));
}

function resetView() {
  view.scale = 1;
  view.tx = 40;
  view.ty = 40;
}

async function addRelation() {
  if (characters.value.length < 2) { ElMessage.warning('至少需要两个角色'); return; }
  const from = characters.value[0];
  const to = characters.value[1];
  const label = window.prompt ? window.prompt('关系描述（例如：师徒 / 敌对）', '朋友') : '朋友';
  const typeMap: Record<string, string> = { '朋友': 'friend', '恋人': 'lover', '敌人': 'enemy', '师徒': 'mentor', '从属': 'subordinate', '对手': 'rival' };
  const type = typeMap[label || ''] || 'friend';
  await lingmo.invoke(lingmo.ACTIONS.CHARACTER_RELATION_CREATE, { project_id: projectId.value, source_id: from.id, target_id: to.id, relation_type: type, label });
  load();
}

async function removeRelation(id: number) {
  await lingmo.invoke(lingmo.ACTIONS.CHARACTER_RELATION_DELETE, { id });
  load();
}

const relColor = (t: string) => ({ friend: '#5fb4ff', lover: '#ff6b9d', enemy: '#ff6b6b', mentor: '#ffd166', subordinate: '#a3e635', rival: '#d4a5ff' } as any)[t] || '#94a3b8';

onMounted(load);
onMounted(() => {
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
});
</script>

<template>
  <div style="height:100%;overflow:auto;background:var(--bg);display:flex;flex-direction:column">
    <div style="padding:16px 28px 6px">
      <h2 style="margin:0">人物关系图谱</h2>
      <p style="margin:6px 0 0;color:var(--text-muted);font-size:13.5px">拖拽节点、滚轮缩放、空白处拖动画布平移</p>
    </div>
    <div style="padding:8px 28px;display:flex;gap:10px;align-items:center">
      <el-button size="small" @click="resetView">重置视图</el-button>
      <el-button size="small" type="primary" @click="addRelation">+ 新建关系</el-button>
      <span style="color:var(--text-muted);font-size:13px;margin-left:8px">角色：{{ characters.length }} · 关系：{{ relations.length }}</span>
    </div>
    <div style="flex:1;min-height:420px;margin:10px 28px 20px;border:1px solid var(--border);border-radius:12px;background:var(--surface);overflow:hidden">
      <svg style="width:100%;height:100%;cursor:grab" @mousedown="onCanvasMouseDown" @wheel="onWheel">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(120,140,180,0.12)" stroke-width="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        <g :transform="`translate(${view.tx},${view.ty}) scale(${view.scale})`">
          <g v-for="r in relations" :key="'r'+r.id">
            <line
              v-if="nodeOf(r.source_id) && nodeOf(r.target_id)"
              :x1="nodeOf(r.source_id).x" :y1="nodeOf(r.source_id).y"
              :x2="nodeOf(r.target_id).x" :y2="nodeOf(r.target_id).y"
              :stroke="relColor(r.relation_type)" stroke-width="2"
              stroke-dasharray="4,3" opacity="0.9"
            />
            <text
              v-if="nodeOf(r.source_id) && nodeOf(r.target_id)"
              :x="(nodeOf(r.source_id).x + nodeOf(r.target_id).x)/2"
              :y="(nodeOf(r.source_id).y + nodeOf(r.target_id).y)/2 - 8"
              text-anchor="middle"
              fill="#8e9ab8" font-size="11px"
            >{{ r.label || r.relation_type }}</text>
          </g>
          <g v-for="c in characters" :key="'n'+c.id"
             :transform="`translate(${c.x - 50},${c.y - 16})`"
             style="cursor:grab"
             @mousedown.stop="(e: any) => nodeMouseDown(e, c)">
            <rect width="100" height="32" rx="16" fill="var(--surface-2)" :stroke="relColor(c.role||'protagonist')" stroke-width="2" />
            <text x="50" y="21" text-anchor="middle" font-size="14px" fill="#e6e8ef">{{ c.name }}</text>
          </g>
        </g>
      </svg>
    </div>

    <div style="margin:0 28px 28px;padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:10px">
      <div style="font-weight:600">关系列表</div>
      <el-table :data="relations" size="small" class="mt-12">
        <el-table-column label="角色 A" width="200">
          <template #default="{ row }">{{ nodeOf(row.source_id)?.name || '?' }}</template>
        </el-table-column>
        <el-table-column label="角色 B" width="200">
          <template #default="{ row }">{{ nodeOf(row.target_id)?.name || '?' }}</template>
        </el-table-column>
        <el-table-column prop="relation_type" label="类型" width="120" />
        <el-table-column prop="label" label="描述" />
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button size="small" type="danger" @click="removeRelation(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>
