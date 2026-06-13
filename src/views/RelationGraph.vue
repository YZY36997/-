<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { graphApi, characterApi, ElMessage, ElMessageBox } from '@/api'
import { ElMessage as Msg } from 'element-plus'
import { Users, Plus, Save, X, Shuffle, Wand2, Sparkles, Trash2, ZoomIn, ZoomOut, Maximize2 } from 'lucide-vue-next'

const route = useRoute()
const projectId = computed(() => route.params.projectId as string)

const nodes = ref<any[]>([])
const edges = ref<any[]>([])
const draggingNode = ref<any>(null)
const dragOffset = reactive({ x: 0, y: 0 })
const svgRef = ref<any>(null)
const viewBox = ref({ x: -100, y: -100, w: 1400, h: 900 })
const selectedNode = ref<any>(null)
const selectedEdge = ref<any>(null)
const connectMode = ref(false)
const pendingConnection = ref<any>(null)
const cursorPos = reactive({ x: 0, y: 0 })
const showParseDialog = ref(false)
const parseText = ref('')
const charactersFromApi = ref<any[]>([])

// ---- 载入 ----
onMounted(async () => {
  try {
    const g = await graphApi.detail(projectId.value)
    nodes.value = g.nodes || []
    edges.value = g.edges || []
    const chars = await characterApi.list(projectId.value)
    charactersFromApi.value = chars || []
    // 为没有坐标的角色分配随机位置
    charactersFromApi.value.forEach((c, idx) => {
      if (!nodes.value.find(n => n.character_id === c.id || n.name === c.name)) {
        const angle = (idx / Math.max(1, charactersFromApi.value.length)) * Math.PI * 2
        const radius = 280
        nodes.value.push({
          id: 'auto_' + c.id + '_' + Date.now(),
          name: c.name,
          type: 'character',
          character_id: c.id,
          summary: c.personality || c.background || '',
          coordinates: { x: 400 + radius * Math.cos(angle), y: 300 + radius * Math.sin(angle) }
        })
      }
    })
  } catch (e) { Msg.error('加载关系图失败') }
})

// ---- 节点拖拽 ----
function onNodeMouseDown(e: MouseEvent, node: any) {
  if (connectMode.value) {
    pendingConnection.value = node
    return
  }
  draggingNode.value = node
  const pt = svgPoint(e)
  if (!node.coordinates) node.coordinates = { x: 0, y: 0 }
  dragOffset.x = pt.x - node.coordinates.x
  dragOffset.y = pt.y - node.coordinates.y
  selectedNode.value = node
  selectedEdge.value = null
  e.stopPropagation()
}
function onMouseMove(e: MouseEvent) {
  const pt = svgPoint(e)
  cursorPos.x = pt.x
  cursorPos.y = pt.y
  if (draggingNode.value) {
    draggingNode.value.coordinates = { x: pt.x - dragOffset.x, y: pt.y - dragOffset.y }
  }
}
function onMouseUp(e: MouseEvent) {
  if (connectMode.value && pendingConnection.value) {
    const target = findNodeAt(cursorPos.x, cursorPos.y)
    if (target && target.id !== pendingConnection.value.id) {
      // 添加边
      const from = pendingConnection.value
      if (!edges.value.find((ed: any) =>
        (ed.source === from.id && ed.target === target.id) ||
        (ed.source === target.id && ed.target === from.id)
      )) {
        edges.value.push({
          id: 'e_' + Date.now(),
          source: from.id,
          target: target.id,
          type: 'friend',
          label: '朋友',
          weight: 1
        })
      }
    }
    pendingConnection.value = null
  }
  draggingNode.value = null
}
function svgPoint(e: MouseEvent) {
  if (!svgRef.value) return { x: 0, y: 0 }
  const svg: SVGSVGElement = svgRef.value
  const rect = svg.getBoundingClientRect()
  const vb = viewBox.value
  return {
    x: (e.clientX - rect.left) * (vb.w / rect.width) + vb.x,
    y: (e.clientY - rect.top) * (vb.h / rect.height) + vb.y
  }
}
function findNodeAt(x: number, y: number) {
  for (let i = nodes.value.length - 1; i >= 0; i--) {
    const n = nodes.value[i]
    const cx = n.coordinates?.x || 0
    const cy = n.coordinates?.y || 0
    if (Math.abs(x - cx) < 42 && Math.abs(y - cy) < 42) return n
  }
  return null
}

// ---- 编辑 ----
function newNode() {
  const id = 'n_' + Date.now()
  nodes.value.push({
    id, name: '新角色', type: 'character', summary: '',
    coordinates: { x: 400, y: 300 }
  })
  selectedNode.value = nodes.value[nodes.value.length - 1]
}
function deleteNode(n: any) {
  nodes.value = nodes.value.filter(x => x.id !== n.id)
  edges.value = edges.value.filter(e => e.source !== n.id && e.target !== n.id)
  if (selectedNode.value?.id === n.id) selectedNode.value = null
}
function toggleConnect() {
  connectMode.value = !connectMode.value
  pendingConnection.value = null
}

// ---- 保存 ----
async function save() {
  try {
    for (const n of nodes.value) {
      if (n.id.startsWith('auto_') || n.id.startsWith('n_')) {
        try {
          await graphApi.addNode({ ...n, project_id: projectId.value, character_id: n.character_id || null })
          n.id = n.id
        } catch (_) {}
      } else {
        await graphApi.updateNode(n.id, { ...n, project_id: projectId.value })
      }
    }
    for (const e of edges.value) {
      if (e._new) {
        await graphApi.addEdge({ ...e, project_id: projectId.value })
        delete e._new
      }
      else if (e.id) await graphApi.updateEdge(e.id, e)
    }
    Msg.success('图谱已保存')
  } catch (e) { Msg.error('保存失败') }
}

// ---- 自动解析正文中的角色关系 ----
async function runParse() {
  if (!parseText.value.trim()) return Msg.warning('请先输入要解析的文本')
  try {
    const r: any = await graphApi.autoParse(projectId.value, parseText.value)
    // 简单本地解析模式：如果后端没实现 auto-parse，也能做个简单提示
    const list = r.nodes || []
    if (list.length) {
      list.forEach((n: any) => {
        if (!nodes.value.find(x => x.name === n.name)) nodes.value.push({ ...n, coordinates: { x: Math.random() * 600 + 200, y: Math.random() * 400 + 150 } })
      })
      Msg.success('解析完成，新增 ' + list.length + ' 个关系节点')
    } else {
      // 简易前端解析：根据常见角色关系关键词做识别
      const simpleNodes = new Set<string>()
      const lines = parseText.value.split(/[\n，。？！]/).filter(Boolean)
      for (const l of lines) {
        const nm = l.match(/[“"]([\u4e00-\u9fa5A-Za-z]{2,5})[”"]/) || l.match(/([\u4e00-\u9fa5]{2,3})[说说道]/)
        if (nm) simpleNodes.add(nm[1])
      }
      const added: string[] = []
      simpleNodes.forEach(name => {
        if (!nodes.value.find(n => n.name === name)) {
          nodes.value.push({
            id: 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 4),
            name,
            type: 'character',
            summary: '',
            _new: true,
            coordinates: { x: 400 + Math.random() * 400 - 200, y: 300 + Math.random() * 400 - 200 }
          })
          added.push(name)
        }
      })
      if (added.length) Msg.success('识别到 ' + added.length + ' 个角色，请在画布中连线')
      else Msg.info('未识别到角色，请先在设定中创建角色')
    }
    showParseDialog.value = false
  } catch (_) { Msg.error('解析失败') }
}

// ---- 视图 ----
function zoomIn() { viewBox.value.w = Math.max(400, viewBox.value.w * 0.8); viewBox.value.h = Math.max(280, viewBox.value.h * 0.8) }
function zoomOut() { viewBox.value.w = viewBox.value.w * 1.2; viewBox.value.h = viewBox.value.h * 1.2 }
function fitView() { viewBox.value = { x: -150, y: -150, w: 1500, h: 900 } }

function nodeByName(id: string) { return nodes.value.find(n => n.id === id) }

// ---- 统计 ----
const stats = computed(() => ({
  nodes: nodes.value.length,
  edges: edges.value.length,
  groups: Array.from(new Set(nodes.value.map((n: any) => n.type || 'other')))
}))

// ---- 边编辑 ----
const edgeTypes = ['情侣', '朋友', '敌对', '师徒', '血缘', '同事', '盟友', '上下级']
function updateEdgeType(edge: any, t: string) {
  edge.type = t
  edge.label = t
  if (edge.id && !edge.id.startsWith('e_')) edge.id = 'e_' + Date.now()
  edge._new = true
}
function deleteEdge(edge: any) { edges.value = edges.value.filter(e => e.id !== edge.id); selectedEdge.value = null }
</script>

<template>
  <div class="graph-page">
    <div class="page-header">
      <div>
        <h2><Sparkles :size="20" /> 人物引力星图</h2>
        <p class="sub">节点：{{ stats.nodes }} · 关系：{{ stats.edges }} · 拖动节点/连线整理角色关系</p>
      </div>
      <div class="toolbar">
        <el-button @click="newNode"><el-icon><Plus /></el-icon>新建节点</el-button>
        <el-button :type="connectMode ? 'success' : 'primary'" @click="toggleConnect">
          <el-icon><Shuffle /></el-icon>{{ connectMode ? '连线中 (点击第一个节点 -> 第二个)' : '进入连线模式' }}
        </el-button>
        <el-button @click="showParseDialog = true"><el-icon><Wand2 /></el-icon>从正文自动识别</el-button>
        <el-button type="primary" @click="save"><el-icon><Save /></el-icon>保存图谱</el-button>
        <el-button circle @click="zoomIn"><el-icon><ZoomIn /></el-icon></el-button>
        <el-button circle @click="zoomOut"><el-icon><ZoomOut /></el-icon></el-button>
        <el-button circle @click="fitView"><el-icon><Maximize2 /></el-icon></el-button>
      </div>
    </div>

    <div class="canvas-wrap">
      <svg ref="svgRef" class="canvas" :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`"
        @mousemove="onMouseMove" @mouseup="onMouseUp" @mouseleave="onMouseUp">
        <!-- 关系线 -->
        <g v-for="e in edges" :key="e.id" class="edge-group">
          <line
            :x1="nodeByName(e.source)?.coordinates?.x || 0"
            :y1="nodeByName(e.source)?.coordinates?.y || 0"
            :x2="nodeByName(e.target)?.coordinates?.x || 0"
            :y2="nodeByName(e.target)?.coordinates?.y || 0"
            :stroke="edgeTypeColor(e.type)"
            stroke-width="2"
            stroke-dasharray="4,4"
            @click="selectedEdge = e; selectedNode = null"
            class="edge-line"
          />
          <text
            :x="((nodeByName(e.source)?.coordinates?.x || 0) + (nodeByName(e.target)?.coordinates?.x || 0)) / 2"
            :y="((nodeByName(e.source)?.coordinates?.y || 0) + (nodeByName(e.target)?.coordinates?.y || 0)) / 2 - 6"
            text-anchor="middle"
            font-size="12"
            fill="#909399"
            class="edge-label"
          >
            {{ e.label || e.type }}
          </text>
        </g>
        <!-- 临时连线（拖拽中） -->
        <line
          v-if="connectMode && pendingConnection"
          :x1="pendingConnection.coordinates?.x || 0"
          :y1="pendingConnection.coordinates?.y || 0"
          :x2="cursorPos.x"
          :y2="cursorPos.y"
          stroke="#67c23a" stroke-width="3" stroke-dasharray="5,5"
        />
        <!-- 节点 -->
        <g
          v-for="n in nodes"
          :key="n.id"
          class="node-group"
          :class="{ selected: selectedNode?.id === n.id, dragging: draggingNode?.id === n.id, connecting: connectMode }"
          :transform="`translate(${(n.coordinates?.x || 0) - 40}, ${(n.coordinates?.y || 0) - 40})`"
          @mousedown="onNodeMouseDown($event, n)"
          @dblclick="selectedNode = n"
        >
          <circle cx="40" cy="40" r="40" :fill="nodeTypeColor(n.type)" stroke="#fff" stroke-width="3" />
          <text x="40" y="44" text-anchor="middle" font-size="14" fill="#fff" font-weight="600">{{ n.name }}</text>
        </g>
      </svg>

      <!-- 节点/关系 侧边属性面板 -->
      <div v-if="selectedNode" class="side-panel">
        <div class="side-title">
          <h4>节点属性</h4>
          <el-button text @click="selectedNode = null"><el-icon><X /></el-icon></el-button>
        </div>
        <el-form :model="selectedNode" size="small" label-width="80px">
          <el-form-item label="名称"><el-input v-model="selectedNode.name" /></el-form-item>
          <el-form-item label="类型">
            <el-select v-model="selectedNode.type" style="width:100%">
              <el-option label="主角" value="protagonist" />
              <el-option label="角色" value="character" />
              <el-option label="势力" value="faction" />
              <el-option label="道具" value="item" />
              <el-option label="地点" value="place" />
            </el-select>
          </el-form-item>
          <el-form-item label="关联人物">
            <el-select v-if="charactersFromApi.length" v-model="selectedNode.character_id" style="width:100%" clearable>
              <el-option v-for="c in charactersFromApi" :key="c.id" :label="c.name" :value="c.id" />
            </el-select>
            <el-input v-else v-model="selectedNode.character_id" placeholder="角色ID" />
          </el-form-item>
          <el-form-item label="摘要/描述">
            <el-input v-model="selectedNode.summary" type="textarea" :rows="5" />
          </el-form-item>
        </el-form>
        <div class="side-actions">
          <el-button type="danger" @click="deleteNode(selectedNode)"><el-icon><Trash2 /></el-icon>删除此节点（含相关连线）</el-button>
        </div>
      </div>

      <div v-else-if="selectedEdge" class="side-panel">
        <div class="side-title">
          <h4>关系属性</h4>
          <el-button text @click="selectedEdge = null"><el-icon><X /></el-icon></el-button>
        </div>
        <el-form size="small" label-width="80px">
          <el-form-item label="关系类型">
            <el-select :model-value="selectedEdge.type" style="width:100%" @change="(v: string) => updateEdgeType(selectedEdge, v)">
              <el-option v-for="t in edgeTypes" :key="t" :label="t" :value="t" />
            </el-select>
          </el-form-item>
          <el-form-item label="权重">
            <el-input-number :model-value="selectedEdge.weight || 1" :min="1" :max="10" style="width:100%" @change="(v: number) => selectedEdge.weight = v; selectedEdge._new = true" />
          </el-form-item>
        </el-form>
        <div class="side-actions">
          <el-button type="danger" @click="deleteEdge(selectedEdge)"><el-icon><Trash2 /></el-icon>删除此关系</el-button>
        </div>
      </div>

      <!-- 模式提示 -->
      <div v-if="connectMode" class="mode-tip">
        <Sparkles :size="16" /> {{ pendingConnection ? '已选中节点【' + pendingConnection.name + '】，请点击第二个节点完成连线' : '连线模式：请点击第一个节点开始' }}
      </div>
    </div>

    <el-dialog v-model="showParseDialog" title="从正文自动识别角色关系" width="560px">
      <el-input v-model="parseText" type="textarea" :rows="10" placeholder="粘贴小说正文/章节段落... 系统将尝试识别文中出现的角色名并加入图谱，便于你后续手动连线。" />
      <template #footer>
        <el-button @click="showParseDialog = false">取消</el-button>
        <el-button type="primary" @click="runParse">开始识别</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts">
function edgeTypeColor(t: string) {
  const map: Record<string, string> = {
    '情侣': '#f56c6c', '敌对': '#f56c6c', '朋友': '#67c23a',
    '师徒': '#409eff', '血缘': '#e6a23c', '同事': '#909399',
    '盟友': '#409eff', '上下级': '#606266'
  }
  return map[t] || '#c0c4cc'
}
function nodeTypeColor(t: string) {
  const map: Record<string, string> = {
    protagonist: '#f56c6c', character: '#409eff', faction: '#e6a23c',
    item: '#67c23a', place: '#909399'
  }
  return map[t] || '#909399'
}
export default {}
</script>

<style scoped>
.graph-page {
  padding: 20px 24px;
  background: #1e2230;
  min-height: 100vh;
  color: #d7dae0;
}
.page-header {
  background: #2a2e3f;
  padding: 16px 24px;
  border-radius: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}
.page-header h2 { margin: 0; color: #fff; font-size: 20px; display: flex; gap: 8px; align-items: center; }
.page-header .sub { margin: 4px 0 0; color: #8f96a8; font-size: 12px; }
.toolbar { display: flex; gap: 8px; flex-wrap: wrap; }

.canvas-wrap {
  position: relative;
  background: linear-gradient(135deg, #2a2e3f 0%, #1e2230 100%);
  border-radius: 12px;
  height: 75vh;
  overflow: hidden;
}
.canvas {
  width: 100%;
  height: 100%;
  display: block;
  cursor: grab;
  user-select: none;
}
.node-group { cursor: grab; }
.node-group.selected circle { filter: drop-shadow(0 0 10px #ffd04b); stroke: #ffd04b; stroke-width: 5; }
.node-group.dragging { cursor: grabbing; }
.node-group.connecting circle { stroke: #67c23a; }
.edge-line { cursor: pointer; }
.edge-line:hover { stroke-width: 4; }

.side-panel {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 320px;
  background: #fff;
  color: #303133;
  border-radius: 10px;
  padding: 16px 18px;
  box-shadow: 0 4px 20px rgba(0,0,0,.2);
  max-height: calc(100% - 32px);
  overflow: auto;
}
.side-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.side-title h4 { margin: 0; }
.side-actions { margin-top: 12px; display: flex; justify-content: flex-end; }

.mode-tip {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: #67c23a;
  color: #fff;
  padding: 8px 16px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  box-shadow: 0 4px 12px rgba(103,194,58,.3);
}
</style>
