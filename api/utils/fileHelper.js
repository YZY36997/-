import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 基础数据目录（开发/生产自动选择）
const BASE_DIR = process.env.VITE_DEV_SERVER_URL
  ? path.join(__dirname, '..', '..', 'backend', 'data')
  : path.join(process.resourcesPath || '', 'data')

/**
 * 解析用户自定义数据目录
 * 优先级: 环境变量 LINGMO_DATA_DIR > settings.customDataDir > 内置目录
 */
let DATA_DIR = BASE_DIR

// 1. 检查环境变量（生产环境启动时注入）
if (process.env.LINGMO_DATA_DIR) {
  DATA_DIR = process.env.LINGMO_DATA_DIR
} else {
  // 2. 读取 settings.json 中的自定义目录
  try {
    const settingsPath = path.join(BASE_DIR, 'settings.json')
    if (fs.existsSync(settingsPath)) {
      const s = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      if (s.settings && s.settings.customDataDir && s.settings.customDataDir.trim()) {
        DATA_DIR = s.settings.customDataDir
      }
    }
  } catch (e) { /* 忽略解析错误，使用默认目录 */ }
}

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  } catch (e) {
    console.error('创建数据目录失败：', DATA_DIR, e.message)
    // 回退到默认目录
    DATA_DIR = BASE_DIR
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
  }
}

/**
 * 确保子目录存在
 */
export function ensureDir(subDir) {
  const dir = path.join(DATA_DIR, subDir)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * 获取子目录的绝对路径
 */
export function getSubDir(subDir) {
  return ensureDir(subDir)
}

/**
 * 读取 JSON 文件
 */
export async function readFile(filename) {
  const filePath = path.join(DATA_DIR, filename)
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(content)
    }
    return null
  } catch (error) {
    console.error(`读取文件失败 ${filename}:`, error)
    throw error
  }
}

/**
 * 写入 JSON 文件
 */
export async function writeFile(filename, data) {
  const filePath = path.join(DATA_DIR, filename)
  try {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error(`写入文件失败 ${filename}:`, error)
    throw error
  }
}

/**
 * 读取纯文本文件（章节、素材等）
 */
export function readTextFile(filepath) {
  const fullPath = path.isAbsolute(filepath) ? filepath : path.join(DATA_DIR, filepath)
  try {
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, 'utf-8')
    }
    return ''
  } catch (error) {
    console.error(`读取文本文件失败 ${filepath}:`, error)
    throw error
  }
}

/**
 * 写入纯文本文件（章节、素材等）
 */
export function writeTextFile(filepath, content) {
  const fullPath = path.isAbsolute(filepath) ? filepath : path.join(DATA_DIR, filepath)
  try {
    const dir = path.dirname(fullPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(fullPath, content || '', 'utf-8')
    return true
  } catch (error) {
    console.error(`写入文本文件失败 ${filepath}:`, error)
    throw error
  }
}

/**
 * 追加文本到文件（章节拼接）
 */
export function appendTextFile(filepath, content) {
  const fullPath = path.isAbsolute(filepath) ? filepath : path.join(DATA_DIR, filepath)
  try {
    const dir = path.dirname(fullPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.appendFileSync(fullPath, content || '', 'utf-8')
    return true
  } catch (error) {
    console.error(`追加文本文件失败 ${filepath}:`, error)
    throw error
  }
}

/**
 * 删除文件
 */
export function deleteFile(filepath) {
  const fullPath = path.isAbsolute(filepath) ? filepath : path.join(DATA_DIR, filepath)
  try {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath)
      return true
    }
    return false
  } catch (error) {
    console.error(`删除文件失败 ${filepath}:`, error)
    throw error
  }
}

/**
 * 删除目录（递归）
 */
export function deleteDir(dirPath) {
  const fullPath = path.isAbsolute(dirPath) ? dirPath : path.join(DATA_DIR, dirPath)
  try {
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true })
      return true
    }
    return false
  } catch (error) {
    console.error(`删除目录失败 ${dirPath}:`, error)
    throw error
  }
}

/**
 * 列出目录内容
 */
export function listDir(dirPath) {
  const fullPath = path.isAbsolute(dirPath) ? dirPath : path.join(DATA_DIR, dirPath)
  try {
    if (fs.existsSync(fullPath)) {
      return fs.readdirSync(fullPath)
    }
    return []
  } catch (error) {
    console.error(`列出目录失败 ${dirPath}:`, error)
    return []
  }
}

/**
 * 检查文件是否存在
 */
export function fileExists(filepath) {
  const fullPath = path.isAbsolute(filepath) ? filepath : path.join(DATA_DIR, filepath)
  try {
    return fs.existsSync(fullPath)
  } catch (e) {
    return false
  }
}

/**
 * 获取文件元信息（大小、时间）
 */
export function getFileStat(filepath) {
  const fullPath = path.isAbsolute(filepath) ? filepath : path.join(DATA_DIR, filepath)
  try {
    const stat = fs.statSync(fullPath)
    return {
      size: stat.size,
      sizeKB: Math.round(stat.size / 1024),
      createdAt: stat.birthtime,
      updatedAt: stat.mtime,
      exists: true
    }
  } catch (e) {
    return { size: 0, sizeKB: 0, exists: false }
  }
}

/**
 * 获取文件路径
 */
export function getFilePath(filename) {
  return path.join(DATA_DIR, filename)
}

/**
 * 获取当前数据目录
 */
export function getDataDir() {
  return DATA_DIR
}

/**
 * 重新加载数据目录（用户在界面上修改后）
 */
export function reloadDataDir(newDir) {
  if (newDir && newDir.trim()) {
    try {
      if (!fs.existsSync(newDir)) {
        fs.mkdirSync(newDir, { recursive: true })
      }
      DATA_DIR = newDir
      return true
    } catch (e) {
      console.error('切换数据目录失败:', e.message)
      return false
    }
  }
  return false
}

export { DATA_DIR }
