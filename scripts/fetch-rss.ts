import { prisma } from '../src/lib/prisma'
import Parser from 'rss-parser'
import slugify from 'slugify'

const rssParser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
})

// RSS源配置
const RSS_SOURCES = [
  {
    name: '机器之心',
    url: 'https://www.jiqizhixin.com/rss',
    category: 'AI资讯',
    enabled: false  // 持续500错误，暂时禁用
  },
  {
    name: '量子位',
    url: 'https://www.qbitai.com/feed',
    category: 'AI资讯', 
    enabled: true
  },
  {
    name: 'OpenAI Blog',
    url: 'https://openai.com/blog/rss.xml',
    category: 'AI技术',
    enabled: true
  },
  {
    name: 'Anthropic',
    url: 'https://www.anthropic.com/rss.xml',
    category: 'AI技术',
    enabled: false  // 404链接失效，暂时禁用
  },
  {
    name: 'AI科技评论',
    url: 'https://www.leiphone.com/feed',
    category: 'AI资讯',
    enabled: true
  }
]

// 清理HTML标签和特殊字符
function stripHtml(html: string): string {
  if (!html) return ''
  
  return html
    // 移除script和style标签及其内容
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // 移除HTML标签
    .replace(/<[^>]*>/g, '')
    // 解码HTML实体
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, (match) => {
      try {
        return String.fromCharCode(parseInt(match.replace(/&#|;/g, '')))
      } catch {
        return match
      }
    })
    // 移除多余空白
    .replace(/\s+/g, ' ')
    .trim()
}

// 提取摘要（前200字）
function extractSummary(content: string): string {
  const text = stripHtml(content)
  return text.length > 200 ? text.slice(0, 200) + '...' : text
}

// 生成唯一slug
function generateSlug(title: string): string {
  return slugify(title, { lower: true, strict: true, locale: 'zh' }) + '-' + Date.now().toString(36)
}

// 带超时的URL获取（解决parseURL可能挂起的问题）
async function fetchWithTimeout(url: string, timeoutMs: number = 15000): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: controller.signal as any
    })
    clearTimeout(timeout)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return await response.text()
  } catch (error) {
    clearTimeout(timeout)
    throw error
  }
}

// 抓取单个RSS源
async function fetchRSS(source: typeof RSS_SOURCES[0]) {
  console.log(`[${source.name}] 开始抓取...`)

  try {
    // 先用fetch获取内容（有超时保护），再用parseString解析
    const xmlContent = await fetchWithTimeout(source.url, 15000)
    const feed = await rssParser.parseString(xmlContent)
    const items = feed.items.slice(0, 10) // 每个源最多10条
    
    let inserted = 0
    let skipped = 0
    
    for (const item of items) {
      if (!item.title || !item.link) continue
      
      // 检查是否已存在（根据链接去重）
      const existing = await prisma.news.findFirst({
        where: { sourceUrl: item.link }
      })
      
      if (existing) {
        skipped++
        continue
      }
      
      // 提取并清理内容
      const rawContent = item['content:encoded'] || item.content || item.summary || ''
      const content = stripHtml(rawContent)
      const summary = extractSummary(content) || item.title
      
      // 解析发布时间
      const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date()
      
      // 生成slug
      const slug = generateSlug(item.title)
      
      // 插入数据库
      await prisma.news.create({
        data: {
          title: item.title,
          slug: slug,
          summary: summary,
          content: content,
          sourceUrl: item.link,
          sourceName: source.name,
          publishedAt: publishedAt,
          isAutoCrawled: true,
          viewCount: 0
        }
      })
      
      inserted++
      console.log(`  ✓ 新增: ${item.title.slice(0, 50)}...`)
    }
    
    console.log(`[${source.name}] 完成: 新增${inserted}条, 跳过${skipped}条`)
    return { inserted, skipped }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[${source.name}] 抓取失败:`, errorMessage)
    return { inserted: 0, skipped: 0, error: errorMessage }
  }
}

// 主函数
async function main() {
  console.log('=== RSS资讯自动抓取 ===')
  console.log(`开始时间: ${new Date().toLocaleString()}`)
  console.log('')
  
  const enabledSources = RSS_SOURCES.filter(s => s.enabled)
  console.log(`已启用 ${enabledSources.length} 个RSS源`)
  console.log('')
  
  let totalInserted = 0
  let totalSkipped = 0
  
  for (const source of enabledSources) {
    const result = await fetchRSS(source)
    totalInserted += result.inserted
    totalSkipped += result.skipped
    console.log('')
  }
  
  console.log('=== 抓取完成 ===')
  console.log(`总计: 新增${totalInserted}条, 跳过${totalSkipped}条`)
  console.log(`结束时间: ${new Date().toLocaleString()}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
