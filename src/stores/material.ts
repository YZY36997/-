import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api'

export interface Material {
  id: string
  project_id: string | null
  category: string
  subCategory: string
  name: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export const CATEGORY_LABELS: Record<string, string> = {
  worldview: '世界观',
  character: '人物',
  scene: '场景',
  plot: '剧情',
  setting: '设定',
  other: '其他'
}

export const useMaterialStore = defineStore('material', () => {
  const materials = ref<Material[]>([])
  const globalMaterials = ref<Material[]>([])
  const loading = ref(false)

  async function fetchMaterials(projectId?: string, category?: string, keyword?: string) {
    loading.value = true
    try {
      const params: Record<string, any> = {}
      if (projectId) params.project_id = projectId
      if (category) params.category = category
      if (keyword) params.keyword = keyword
      const response = await api.get('/api/materials', { params })
      materials.value = Array.isArray(response.data) ? response.data : []
      return materials.value
    } catch (err) {
      console.error('获取素材列表失败:', err)
      return []
    } finally {
      loading.value = false
    }
  }

  async function fetchGlobalMaterials(category?: string, keyword?: string) {
    try {
      const params: Record<string, any> = { project_id: 'global' }
      if (category) params.category = category
      if (keyword) params.keyword = keyword
      const response = await api.get('/api/materials', { params })
      globalMaterials.value = Array.isArray(response.data) ? response.data : []
      return globalMaterials.value
    } catch (err) {
      console.error('获取全局素材失败:', err)
      return []
    }
  }

  async function createMaterial(data: Partial<Material>): Promise<Material | null> {
    try {
      const payload = {
        name: data.name || '未命名素材',
        category: data.category || 'setting',
        subCategory: data.subCategory || '',
        content: data.content || '',
        tags: data.tags || [],
        project_id: data.project_id !== undefined ? data.project_id : null
      }
      const response = await api.post('/api/materials', payload)
      materials.value.push(response.data)
      if (!payload.project_id) globalMaterials.value.push(response.data)
      return response.data
    } catch (err) {
      console.error('创建素材失败:', err)
      return null
    }
  }

  async function batchCreateMaterials(list: Partial<Material>[]): Promise<Material[]> {
    try {
      const response = await api.post('/api/materials/batch', { materials: list })
      const created = Array.isArray(response.data) ? response.data : []
      materials.value.push(...created)
      return created
    } catch (err) {
      console.error('批量创建素材失败:', err)
      return []
    }
  }

  async function updateMaterial(id: string, data: Partial<Material>): Promise<Material | null> {
    try {
      const response = await api.put(`/api/materials/${id}`, data)
      const idx = materials.value.findIndex(m => m.id === id)
      if (idx !== -1) materials.value[idx] = response.data
      const gIdx = globalMaterials.value.findIndex(m => m.id === id)
      if (gIdx !== -1) globalMaterials.value[gIdx] = response.data
      return response.data
    } catch (err) {
      console.error('更新素材失败:', err)
      return null
    }
  }

  async function deleteMaterial(id: string): Promise<boolean> {
    try {
      await api.delete(`/api/materials/${id}`)
      materials.value = materials.value.filter(m => m.id !== id)
      globalMaterials.value = globalMaterials.value.filter(m => m.id !== id)
      return true
    } catch (err) {
      console.error('删除素材失败:', err)
      return false
    }
  }

  // 按项目过滤
  function getMaterialsByProject(projectId: string): Material[] {
    return materials.value.filter(m => m.project_id === projectId)
  }

  // 按分类过滤
  function getMaterialsByCategory(category: string): Material[] {
    return materials.value.filter(m => m.category === category)
  }

  // 按关键字本地过滤（备用）
  function localSearch(keyword: string): Material[] {
    if (!keyword) return materials.value
    const kw = keyword.toLowerCase()
    return materials.value.filter(m =>
      (m.name || '').toLowerCase().includes(kw) ||
      (m.content || '').toLowerCase().includes(kw)
    )
  }

  return {
    materials,
    globalMaterials,
    loading,
    fetchMaterials,
    fetchGlobalMaterials,
    createMaterial,
    batchCreateMaterials,
    updateMaterial,
    deleteMaterial,
    getMaterialsByProject,
    getMaterialsByCategory,
    localSearch
  }
})
