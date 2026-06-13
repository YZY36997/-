<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { rulesApi, projectApi } from '@/api'
import { ShieldCheck, Plus, Trash2 } from 'lucide-vue-next'

const rules = ref<any[]>([])
const enabledGlobal = ref(true)
const dialogVisible = ref(false)
const form = ref<any>({ title: '新规则', type: 'custom', patterns: [{ regex: '', level: 'warn', note: '' }] })

async function load() {
  const data: any = await rulesApi.list()
  rules.value = data?.custom || []
  enabledGlobal.value = data?.enabled !== false
}

onMounted(async () => {
  try { load() } catch (e) { /* ignore */ }
})

async function createRule() {
  if (!form.value.title) return
  const saved = await rulesApi.create(form.value)
  rules.value.push(saved)
  dialogVisible.value = false
  form.value = { title: '新规则', type: 'custom', patterns: [{ regex: '', level: 'warn', note: '' }] }
}

async function removeRule(id: string) {
  await rulesApi.remove(id)
  rules.value = rules.value.filter(r => r.id !== id)
}

async function toggleGlobal(val: boolean) {
  await rulesApi.toggle(val)
  enabledGlobal.value = val
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1><ShieldCheck /> 规则引擎</h1>
      <p class="subtitle">全局禁词 · 题材内置规则 · 作者自定义约束 · 生成后违规校验</p>
    </div>

    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>内置规则（系统内置，不可删除）</span>
          <el-switch v-model="enabledGlobal" active-text="启用规则引擎" inactive-text="禁用" @change="toggleGlobal" />
        </div>
      </template>
      <el-descriptions :column="1" border size="small">
        <el-descriptions-item label="🚫 全局禁词（高风险）">色情 · 淫秽 · 血腥暴力 · 屠杀 · 虐杀 · 歧视 · 政治敏感 · 未成年人不良导向</el-descriptions-item>
        <el-descriptions-item label="玄幻仙侠">避免出现"手机 / 互联网 / 微信 / 支付宝"等现代词；修仙境界保持一致</el-descriptions-item>
        <el-descriptions-item label="都市">避免强行引入修仙体系；保持现代生活逻辑；避免政治敏感话题</el-descriptions-item>
        <el-descriptions-item label="科幻">科学设定需自洽；避免奇幻修仙术语混入</el-descriptions-item>
        <el-descriptions-item label="恐怖悬疑">保持氛围一致性；避免突兀温馨词</el-descriptions-item>
        <el-descriptions-item label="言情">细腻情绪描写；避免过度暴力/强取豪夺</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card class="mt-20" shadow="never">
      <template #header>
        <div class="card-header">
          <span>自定义规则 · {{ rules.length }}</span>
          <el-button type="primary" @click="dialogVisible = true"><Plus icon="Plus" /></el-button>
        </div>
      </template>
      <el-table :data="rules" stripe empty-text="尚未添加规则">
        <el-table-column prop="title" label="名称" width="180" />
        <el-table-column prop="type" label="类型" width="120">
          <template #default="{ row }"><el-tag size="small">{{ row.type }}</el-tag></template>
        </el-table-column>
        <el-table-column label="命中规则">
          <template #default="{ row }">
            <el-tag v-for="(p, i) in (row.patterns || [])" :key="i" :type="p.level === 'block' ? 'danger' : 'warning'" class="pattern-chip">
              {{ p.regex || '（未填写）' }}
              <span v-if="p.note"> · {{ p.note }}</span>
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="100" align="center">
          <template #default="{ row }">
            <el-switch :model-value="row.enabled !== false" @change="rulesApi.update(row.id, { ...row, enabled: !row.enabled }).then(() => load())" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" align="center">
          <template #default="{ row }">
            <el-button size="small" type="danger" @click="removeRule(row.id)"><Trash2 /></el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" title="新建规则" width="640px">
      <el-form label-width="100px">
        <el-form-item label="规则名"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type" style="width:100%">
            <el-option label="禁词" value="forbidden" />
            <el-option label="题材" value="genre" />
            <el-option label="文风" value="style" />
            <el-option label="剧情" value="plot" />
            <el-option label="自定义" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item label="命中词">
          <el-input v-model="form.patterns[0].regex" placeholder="例：(手机|电脑|互联网)" />
        </el-form-item>
        <el-form-item label="违规级别">
          <el-radio-group v-model="form.patterns[0].level">
            <el-radio-button value="warn" />
            <el-radio-button value="block" />
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.patterns[0].note" placeholder="如：建议替换为..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="createRule">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page { max-width: 1200px; margin: 0 auto; padding: 24px; }
.page-header h1 { display: flex; align-items: center; gap: 12px; margin: 0 0 6px; font-size: 26px; color: #1a1a2e; }
.page-header .subtitle { color: #888; margin: 0 0 24px; }
.mt-20 { margin-top: 24px; }
.card-header { font-weight: 600; color: #1a1a2e; display: flex; justify-content: space-between; align-items: center; }
.pattern-chip { margin-right: 6px; margin-bottom: 6px; }
</style>
