/**
 * AwesomeTop 抓取脚本
 * 数据源: https://awesometop.cn/
 * 使用 Puppeteer 抓取 Nuxt.js 渲染的页面
 */

import { PrismaClient } from '@prisma/client'
import puppeteer from 'puppeteer'

const prisma = new PrismaClient()

interface AwesomeTool {
  name: string
  description?: string
  url?: string
  githubUrl?: string
  tags?: string[]
}

/**
 * 抓取 AwesomeTop 页面
 */
async function fetchAwesomeTop(): Promise<AwesomeTool[]> {
  console.log('🚀 启动浏览器...')
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })
  
  try {
    const page = await browser.newPage()
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
    
    console.log('📡 访问 awesometop.cn...')
    await page.goto('https://awesometop.cn/', { waitUntil: 'networkidle2', timeout: 30000 })
    
    // 等待页面加载
    await page.waitForTimeout(3000)
    
    // 提取工具数据
    const tools = await page.evaluate(() => {
      const results: Array<{name: string; description?: string; url?: string; tags?: string[]}> = []
      
      // 尝试多种选择器
      const selectors = [
        '[data-testid="tool-card"]',
        '.tool-card',
        '.card',
        '[class*="tool"]',
        '[class*="card"]',
        'article',
        '.item'
      ]
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector)
        if (elements.length > 0) {
          console.log(`Found ${elements.length} elements with selector: ${selector}`)
          
          elements.forEach(el => {
            const nameEl = el.querySelector('h3, h2, .title, [class*="title"], a')
            const descEl = el.querySelector('p, .description, [class*="desc"]')
            const linkEl = el.querySelector('a[href^="http"]')
            
            if (nameEl) {
              results.push({
                name: nameEl.textContent?.trim() || '',
                description: descEl?.textContent?.trim(),
                url: linkEl?.getAttribute('href') || undefined,
                tags: Array.from(el.querySelectorAll('.tag, [class*="tag"]')).map(t => t.textContent?.trim() || '').filter(Boolean)
              })
            }
          })
          
          if (results.length > 0) break
        }
      }
      
      // 如果没找到，尝试从页面文本中提取
      if (results.length === 0) {
        // 返回页面结构信息帮助调试
        return {
          debug: true,
          title: document.title,
          bodyText: document.body.innerText.substring(0, 500),
          allLinks: Array.from(document.querySelectorAll('a[href^="http"]')).slice(0, 10).map(a => ({
            text: a.textContent?.trim(),
            href: a.getAttribute('href')
          }))
        }
      }
      
      return results
    })
    
    return tools as AwesomeTool[]
  } finally {
    await browser.close()
  }
}

/**
 * 保存工具到数据库
 */
async function saveTool(tool: AwesomeTool) {
  try {
    if (!tool.name) return
    
    // 生成 slug
    const slug = tool.name.toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '-')
      .substring(0, 50)
    
    // 检查是否已存在
    const existing = await prisma.tool.findFirst({
      where: {
        OR: [
          { slug },
          { name: tool.name }
        ]
      }
    })
    
    if (existing) {
      console.log(`   ⏭️ 已存在: ${tool.name}`)
      return
    }
    
    // 自动分类
    const categoryId = await autoCategorize(tool)
    
    // 创建工具
    await prisma.tool.create({
      data: {
        name: tool.name,
        slug,
        description: tool.description || '',
        websiteUrl: tool.url,
        githubUrl: tool.githubUrl || tool.url,
        categoryId,
        tags: tool.tags?.join(',') || '',
        isOpenSource: true,
        source: 'AwesomeTop',
        sourceUrl: 'https://awesometop.cn/',
        status: 'approved',
        publishedAt: new Date()
      }
    })
    
    console.log(`   ✅ 新增: ${tool.name}`)
  } catch (error) {
    console.error(`   ❌ 保存失败 ${tool.name}:`, error)
  }
}

/**
 * 自动分类
 */
async function autoCategorize(tool: AwesomeTool): Promise<number | null> {
  const text = `${tool.name} ${tool.description || ''} ${tool.tags?.join(' ') || ''}`.toLowerCase()
  
  const categoryMap: Record<string, string[]> = {
    '代码助手': ['code', '编程', 'developer', 'ide', 'editor', 'git', 'debug', 'copilot'],
    '聊天对话': ['chat', '对话', '聊天', 'assistant', 'bot', 'llm', 'gpt', 'claude'],
    '图像生成': ['image', '图片', '绘画', 'draw', 'art', 'stable-diffusion', 'midjourney', 'dall-e'],
    '视频生成': ['video', '视频', 'animation', 'sora', 'runway'],
    '音频处理': ['audio', '语音', 'music', 'sound', 'tts', 'voice', 'whisper'],
    '写作助手': ['write', '写作', 'markdown', 'note', 'doc', 'copywriting'],
    '搜索引擎': ['search', '搜索', 'rag', 'retrieval', 'perplexity'],
    '办公效率': ['productivity', '办公', 'excel', 'pdf', 'tool', 'automation'],
    '设计工具': ['design', '设计', 'ui', 'figma', 'icon', 'prototype'],
    '知识管理': ['knowledge', '笔记', 'wiki', 'bookmark', 'notion'],
    '数据分析': ['data', '数据', 'analytics', 'chart', 'visualization', 'bi'],
    '教育学习': ['education', '学习', 'course', 'tutorial', 'learn'],
    '健康医疗': ['health', '医疗', 'medical', 'fitness'],
    '金融理财': ['finance', '金融', 'trading', 'crypto', 'investment'],
  }
  
  for (const [categoryName, keywords] of Object.entries(categoryMap)) {
    if (keywords.some(kw => text.includes(kw))) {
      const category = await prisma.category.findFirst({
        where: { name: categoryName }
      })
      if (category) return category.id
    }
  }
  
  // 默认其他工具
  const other = await prisma.category.findFirst({
    where: { name: '其他工具' }
  })
  return other?.id || null
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始抓取 AwesomeTop...\n')
  
  try {
    const result = await fetchAwesomeTop()
    
    // 如果是调试信息
    if ('debug' in result && result.debug) {
      console.log('页面结构：', JSON.stringify(result, null, 2))
      return
    }
    
    const tools = result as AwesomeTool[]
    console.log(`📦 获取到 ${tools.length} 个工具\n`)
    
    if (tools.length === 0) {
      console.log('⚠️ 没有获取到数据')
      return
    }
    
    // 保存到数据库
    let saved = 0
    for (const tool of tools) {
      await saveTool(tool)
      saved++
    }
    
    console.log(`\n✅ 完成！处理了 ${saved} 个工具`)
    
  } catch (error) {
    console.error('❌ 执行失败:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// 运行
main()
