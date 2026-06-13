import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 数据目录
const DATA_DIR = process.env.VITE_DEV_SERVER_URL
  ? path.join(__dirname, '..', '..', 'backend', 'data')
  : path.join(process.resourcesPath || '', 'data')

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

/**
 * 读取JSON文件
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
 * 写入JSON文件
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
 * 获取文件路径
 */
export function getFilePath(filename) {
  return path.join(DATA_DIR, filename)
}

export { DATA_DIR }
