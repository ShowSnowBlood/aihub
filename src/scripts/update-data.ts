#!/usr/bin/env node
/**
 * AI Hub 数据更新脚本
 * 定时运行：node src/scripts/update-data.ts
 * 或：npm run update-data
 */

import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

const DB_PATH = join(process.cwd(), 'prisma', 'dev.db')

async function main() {
  console.log('🤖 AI Hub 数据更新任务')
  console.log('========================')
  console.log(`⏰ 执行时间: ${new Date().toLocaleString('zh-CN')}`)
  
  // 检查数据库是否存在
  if (!existsSync(DB_PATH)) {
    console.error('❌ 数据库不存在，请先运行: npx prisma migrate dev')
    process.exit(1)
  }

  try {
    // 1. 运行爬虫获取新数据
    console.log('\n📡 开始抓取外部数据...')
    // 这里可以调用 crawler.ts
    // 暂时跳过，因为 API 需要 token
    console.log('⏭️  跳过外部抓取（需要配置 API Token）')
    
    // 2. 更新统计数据
    console.log('\n📊 更新统计数据...')
    // 可以在这里添加更多数据处理逻辑
    
    console.log('\n✅ 数据更新完成！')
    console.log('========================')
    
  } catch (error) {
    console.error('❌ 更新失败:', error)
    process.exit(1)
  }
}

main()
