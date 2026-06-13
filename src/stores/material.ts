import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

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

export const useMaterialStore = defineStore('material', () => {
  const materials = ref<Material[]>([])
  const globalMaterials = ref<Material[]>([])
  const loading = ref(false)
  const currentFilter = ref({
    projectId: null as string | null,
    category: '',
    keyword: ''
  })

  const filteredMaterials = computed(() => {
    let result = materials.value

    if (currentFilter.value.projectId === 'global') {
      result = globalMaterials.value
    } else if (currentFilter.value.projectId) {
      result = result.filter(m => m.project_id === currentFilter.value.projectId)
    }

    if (currentFilter.value.category) {
      result = result.filter(m => m.category === currentFilter.value.category)
    }

    if (currentFilter.value.keyword) {
      const keyword = currentFilter.value.keyword.toLowerCase()
      result = result.filter(m =>
        m.name.toLowerCase().includes(keyword) ||
        m.content.toLowerCase().includes(keyword)
      )
    }

    return result
  })

  const materialsByCategory = computed(() => {
    const grouped: Record<string, Material[]> = {}
    filteredMaterials.value.forEach(m => {
      if (!grouped[m.category]) {
        grouped[m.category] = []
      }
      grouped[m.category].push(m)
    })
    return grouped
  })

  async function fetchMaterials(projectId?: string) {
    loading.value = true
    try {
      let url = '/api/materials'
      if (projectId) {
        url += `/project/${projectId}`
      }
      const response = await axios.get(url)
      materials.value = response.data
    } catch (error) {
      console.error('获取素材列表失败:', error)
    } finally {
      loading.value = false
    }
  }

  async function fetchGlobalMaterials() {
    try {
      const response = await axios.get('/api/materials/global')
      globalMaterials.value = response.data
    } catch (error) {
      console.error('获取全局素材失败:', error)
    }
  }

  async function createMaterial(data: Partial<Material>) {
    try {
      const response = await axios.post('/api/materials', data)
      materials.value.push(response.data)
      return response.data
    } catch (error) {
      console.error('创建素材失败:', error)
      return null
    }
  }

  async function updateMaterial(id: string, data: Partial<Material>) {
    try {
      const response = await axios.put(`/api/materials/${id}`, data)
      const index = materials.value.findIndex(m => m.id === id)
      if (index !== -1) {
        materials.value[index] = response.data
      }
      return response.data
    } catch (error) {
      console.error('更新素材失败:', error)
      return null
    }
  }

  async function deleteMaterial(id: string) {
    try {
      await axios.delete(`/api/materials/${id}`)
      materials.value = materials.value.filter(m => m.id !== id)
      return true
    } catch (error) {
      console.error('删除素材失败:', error)
      return false
    }
  }

  async function batchCreateMaterials(materialsList: Partial<Material>[]) {
    try {
      const response = await axios.post('/api/materials/batch', { materials: materialsList })
      materials.value.push(...response.data)
      return response.data
    } catch (error) {
      console.error('批量创建素材失败:', error)
      return []
    }
  }

  function setFilter(filter: Partial<typeof currentFilter.value>) {
    currentFilter.value = { ...currentFilter.value, ...filter }
  }

  return {
    materials,
    globalMaterials,
    loading,
    currentFilter,
    filteredMaterials,
    materialsByCategory,
    fetchMaterials,
    fetchGlobalMaterials,
    createMaterial,
    updateMaterial,
    deleteMaterial,
    batchCreateMaterials,
    setFilter
  }
})
