<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'

const settings = ref({
  aiProvider: 'openai',
  apiEndpoint: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  model: 'gpt-4',
  temperature: 0.8,
  maxTokens: 2000,
  theme: 'light',
  language: 'zh-CN'
})

const loading = ref(false)
const testing = ref(false)
const testResult = ref('')

onMounted(async () => {
  await fetchSettings()
})

async function fetchSettings() {
  loading.value = true
  try {
    const response = await api.get('/api/settings')
    settings.value = { ...settings.value, ...response.data }
  } catch (error) {
    console.error('获取设置失败:', error)
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  try {
    await api.put('/api/settings', settings.value)
    ElMessage.success('设置已保存')
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

async function testConnection() {
  if (!settings.value.apiKey) {
    ElMessage.warning('请先输入API密钥')
    return
  }

  testing.value = true
  testResult.value = ''

  try {
    await api.post('/api/generators/generate', {
      generator_id: 'gen_tool_names',
      params: { type: '人名', count: '3', style: '古风', genre: '玄幻' },
      project_id: null,
      with_project_material: false
    })
    testResult.value = '连接成功！'
    ElMessage.success('API连接测试成功')
  } catch (error: any) {
    testResult.value = '连接失败：' + (error.response?.data?.error || error.message)
    ElMessage.error('API连接测试失败')
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <div class="settings-page">
    <div class="page-header">
      <h1 class="page-title">设置</h1>
    </div>

    <el-card class="settings-card">
      <template #header>
        <div class="card-header">
          <span>AI设置</span>
        </div>
      </template>

      <el-form :model="settings" label-width="120px">
        <el-form-item label="API提供商">
          <el-select v-model="settings.aiProvider">
            <el-option label="OpenAI" value="openai" />
            <el-option label="自定义API" value="custom" />
          </el-select>
        </el-form-item>

        <el-form-item label="API地址">
          <el-input v-model="settings.apiEndpoint" placeholder="请输入API地址" />
          <div class="form-tip">OpenAI默认: https://api.openai.com/v1/chat/completions</div>
        </el-form-item>

        <el-form-item label="API密钥" required>
          <el-input
            v-model="settings.apiKey"
            type="password"
            show-password
            placeholder="请输入API密钥"
          />
          <div class="form-tip">你的API密钥仅存储在本地，不会被上传</div>
        </el-form-item>

        <el-form-item label="模型">
          <el-input v-model="settings.model" placeholder="如: gpt-4, gpt-3.5-turbo" />
        </el-form-item>

        <el-form-item label="Temperature">
          <el-slider v-model="settings.temperature" :min="0" :max="1" :step="0.1" show-input />
          <div class="form-tip">控制随机性，较低值更确定性，较高值更有创意</div>
        </el-form-item>

        <el-form-item label="最大Token">
          <el-input-number v-model="settings.maxTokens" :min="100" :max="8000" :step="100" />
          <div class="form-tip">单次生成的最大token数</div>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="testConnection" :loading="testing">
            测试连接
          </el-button>
          <el-button type="success" @click="saveSettings">
            保存设置
          </el-button>
        </el-form-item>

        <el-form-item v-if="testResult">
          <el-alert :title="testResult" :type="testResult.includes('成功') ? 'success' : 'error'" />
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="settings-card">
      <template #header>
        <div class="card-header">
          <span>界面设置</span>
        </div>
      </template>

      <el-form :model="settings" label-width="120px">
        <el-form-item label="主题">
          <el-radio-group v-model="settings.theme">
            <el-radio label="light">浅色</el-radio>
            <el-radio label="dark">深色</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="语言">
          <el-select v-model="settings.language">
            <el-option label="简体中文" value="zh-CN" />
            <el-option label="English" value="en-US" />
          </el-select>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="settings-card">
      <template #header>
        <div class="card-header">
          <span>关于</span>
        </div>
      </template>
      <div class="about-info">
        <h3>灵墨小说工坊 v3.5</h3>
        <p>AI智能小说创作桌面应用</p>
        <p class="copyright">基于 Electron + Vue3 + Express 构建</p>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 800px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  font-size: 24px;
  color: #333;
  margin: 0;
}

.settings-card {
  margin-bottom: 20px;
}

.card-header {
  font-weight: 600;
  color: #333;
}

.form-tip {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.about-info {
  text-align: center;
  padding: 20px;
}

.about-info h3 {
  margin: 0 0 8px 0;
  color: #333;
}

.about-info p {
  margin: 4px 0;
  color: #666;
}

.copyright {
  margin-top: 16px !important;
  font-size: 12px;
  color: #999;
}
</style>
