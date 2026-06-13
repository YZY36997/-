import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

export interface Project {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  outline: {
    title: string
    summary: string
    chapters: any[]
  }
  settings: {
    genre: string
    style: string
  }
}

export const useProjectStore = defineStore('project', () => {
  const projects = ref<Project[]>([])
  const currentProject = ref<Project | null>(null)
  const loading = ref(false)

  const sortedProjects = computed(() => {
    return [...projects.value].sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  })

  async function fetchProjects() {
    loading.value = true
    try {
      const response = await axios.get('/api/projects')
      projects.value = response.data
    } catch (error) {
      console.error('获取项目列表失败:', error)
    } finally {
      loading.value = false
    }
  }

  async function fetchProject(id: string) {
    try {
      const response = await axios.get(`/api/projects/${id}`)
      currentProject.value = response.data
      return response.data
    } catch (error) {
      console.error('获取项目详情失败:', error)
      return null
    }
  }

  async function createProject(data: Partial<Project>) {
    try {
      const response = await axios.post('/api/projects', data)
      projects.value.push(response.data)
      return response.data
    } catch (error) {
      console.error('创建项目失败:', error)
      return null
    }
  }

  async function updateProject(id: string, data: Partial<Project>) {
    try {
      const response = await axios.put(`/api/projects/${id}`, data)
      const index = projects.value.findIndex(p => p.id === id)
      if (index !== -1) {
        projects.value[index] = response.data
      }
      if (currentProject.value?.id === id) {
        currentProject.value = response.data
      }
      return response.data
    } catch (error) {
      console.error('更新项目失败:', error)
      return null
    }
  }

  async function deleteProject(id: string) {
    try {
      await axios.delete(`/api/projects/${id}`)
      projects.value = projects.value.filter(p => p.id !== id)
      if (currentProject.value?.id === id) {
        currentProject.value = null
      }
      return true
    } catch (error) {
      console.error('删除项目失败:', error)
      return false
    }
  }

  function setCurrentProject(project: Project | null) {
    currentProject.value = project
  }

  return {
    projects,
    currentProject,
    loading,
    sortedProjects,
    fetchProjects,
    fetchProject,
    createProject,
    updateProject,
    deleteProject,
    setCurrentProject
  }
})
