<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { lingmo } from '@/api/lingmo'

const groups = ref<any[]>([])
const prompts = ref<any[]>([])
const groupForm = ref<any>({ name: '', description: '' })
const promptForm = ref<any>({ group_id: 0, name: '', content: '', enabled: 1, priority: 1 })

async function load() {
  const [r1, r2] = await Promise.all([
    lingmo.invoke(lingmo.ACTIONS.PROMPT_GROUP_LIST),
    lingmo.invoke(lingmo.ACTIONS.PROMPT_LIST, { project_id: null })
  ])
  groups.value = r1.ok ? (r1.data || []) : []
  prompts.value = r2.ok ? (r2.data || []) : []
}

async function addGroup() {
  if (!groupForm.value.name) return
  const r = await lingmo.invoke(lingmo.ACTIONS.PROMPT_GROUP_SAVE, groupForm.value)
  if (r.ok) { ElMessage.success('已添加'); groupForm.value = { name: '', description: '' }; load() }
}
async function removeGroup(id: number) {
  await lingmo.invoke(lingmo.ACTIONS.PROMPT_GROUP_DELETE, { id }); load()
}

async function addPrompt() {
  if (!promptForm.value.name) return
  const r = await lingmo.invoke(lingmo.ACTIONS.PROMPT_CREATE, promptForm.value)
  if (r.ok) { promptForm.value = { group_id: (groups.value[0]?.id) || 0, name: '', content: '', enabled: 1, priority: 1 }; load() }
}
async function removePrompt(id: number) {
  await lingmo.invoke(lingmo.ACTIONS.PROMPT_DELETE, { id }); load()
}
const groupName = (id: number) => groups.value.find((g: any) => g.id === id)?.name || '通用'

onMounted(load)
onMounted(() => { if (groups.value.length) promptForm.value.group_id = groups.value[0].id })
</script>

<template>
  <div style="height:100%;overflow:auto;background:var(--bg)">
    <div class="page-header"><h2>提示词库</h2><p>按类目管理提示词，AI 续写 / 润色时自动读取已启用的提示词。</p></div>
    <div style="padding:16px 28px 60px;max-width:1400px;margin:0 auto">
      <div class="card">
        <b>新增分组</b>
        <el-form :inline="true" class="mt-8">
          <el-form-item label="分组"><el-input v-model="groupForm.name" /></el-form-item>
          <el-form-item label="描述"><el-input v-model="groupForm.description" /></el-form-item>
          <el-form-item><el-button type="primary" @click="addGroup">添加</el-button></el-form-item>
        </el-form>
      </div>
      <div class="card mt-16">
        <b>新增提示词</b>
        <el-form label-width="80px" class="mt-8">
          <el-form-item label="所属分组">
            <el-select v-model="promptForm.group_id" style="width:220px">
              <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="标题"><el-input v-model="promptForm.name" style="max-width:400px" /></el-form-item>
          <el-form-item label="内容"><el-input v-model="promptForm.content" type="textarea" :rows="4" /></el-form-item>
        </el-form>
        <el-button type="primary" @click="addPrompt">添加提示词</el-button>
      </div>
      <div class="card mt-16">
        <b>分组列表（{{ groups.length }}）</b>
        <el-table :data="groups" class="mt-12">
          <el-table-column prop="name" label="名称" width="200" />
          <el-table-column prop="description" label="描述" />
          <el-table-column label="操作" width="120"><template #default="{row}"><el-button size="small" type="danger" @click="removeGroup(row.id)">删除</el-button></template></el-table-column>
        </el-table>
      </div>
      <div class="card mt-16">
        <b>提示词列表（{{ prompts.length }}）</b>
        <el-table :data="prompts" class="mt-12">
          <el-table-column label="分组" width="140"><template #default="{row}">{{ groupName(row.group_id) }}</template></el-table-column>
          <el-table-column prop="name" label="标题" width="200" />
          <el-table-column prop="content" label="内容" />
          <el-table-column label="操作" width="120"><template #default="{row}"><el-button size="small" type="danger" @click="removePrompt(row.id)">删除</el-button></template></el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>
