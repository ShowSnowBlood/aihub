/**
 * GitHub Trending 抓取脚本
 * 使用 GitHub Search API 获取热门 AI/开源项目
 * 不需要 API Key，免费使用
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface GitHubRepo {
  full_name: string
  description: string | null
  html_url: string
  stargazers_count: number
  forks_count: number
  language: string | null
  topics: string[]
  created_at: string
  updated_at: string
}

/**
 * 抓取 GitHub 热门项目
 */
async function fetchGitHubTrending(): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = []
  
  // 搜索条件：最近90天创建，star > 50，按 star 排序
  const queries = [
    'created:>2026-01-01 stars:>50',  // 最近3个月的高星项目
    'created:>2026-04-01 stars:>10',  // 最近1个月的较新项目
  ]
  
  for (const query of queries) {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=30`
    
    console.log(`📡 抓取: ${query}`)
    
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'AI-Tools-Navigator/1.0'
        }
      })
      
      if (!response.ok) {
        if (response.status === 403) {
          console.log('   ⚠️ API 速率限制，等待 60 秒...')
          await new Promise(r => setTimeout(r, 60000))
          continue
        }
        throw new Error(`HTTP ${response.status}`)
      }
      
      const data = await response.json() as { items: GitHubRepo[] }
      
      if (data.items && Array.isArray(data.items)) {
        repos.push(...data.items)
        console.log(`   ✅ 获取 ${data.items.length} 个项目`)
      }
      
      // 延迟避免速率限制
      await new Promise(r => setTimeout(r, 2000))
      
    } catch (error) {
      console.error(`   ❌ 抓取失败:`, error)
    }
  }
  
  // 去重
  const uniqueRepos = Array.from(new Map(repos.map(r => [r.full_name, r])).values())
  
  return uniqueRepos
}

/**
 * 保存项目到数据库
 */
async function saveRepo(repo: GitHubRepo) {
  try {
    // 生成 slug
    const slug = repo.full_name.toLowerCase().replace(/\//g, '-')
    
    // 检查是否已存在
    const existing = await prisma.tool.findFirst({
      where: {
        OR: [
          { slug },
          { name: repo.full_name.split('/')[1] },
          { githubUrl: repo.html_url }
        ]
      }
    })
    
    if (existing) {
      // 更新 star 数
      await prisma.tool.update({
        where: { id: existing.id },
        data: { 
          stars: repo.stargazers_count,
          updatedAt: new Date()
        }
      })
      console.log(`   🔄 更新: ${repo.full_name} (${repo.stargazers_count} ⭐)`)
      return
    }
    
    // 自动分类
    const categoryId = await autoCategorize(repo)
    
    // 提取标签
    const tags = [
      repo.language,
      ...repo.topics.slice(0, 3)
    ].filter(Boolean).join(',')
    
    // 创建工具
    await prisma.tool.create({
      data: {
        name: repo.full_name.split('/')[1],
        slug,
        description: repo.description || '',
        githubUrl: repo.html_url,
        websiteUrl: repo.homepage || repo.html_url,
        categoryId,
        tags,
        stars: repo.stargazers_count,
        isOpenSource: true,
        source: 'GitHub Trending',
        sourceUrl: repo.html_url,
        status: 'approved',
        publishedAt: new Date(repo.created_at)
      }
    })
    
    console.log(`   ✅ 新增: ${repo.full_name} (${repo.stargazers_count} ⭐)`)
  } catch (error) {
    console.error(`   ❌ 保存失败 ${repo.full_name}:`, error)
  }
}

/**
 * 自动分类
 */
async function autoCategorize(repo: GitHubRepo): Promise<number | null> {
  const text = `${repo.full_name} ${repo.description || ''} ${repo.topics.join(' ')} ${repo.language || ''}`.toLowerCase()
  
  const categoryMap: Record<string, string[]> = {
    '代码助手': ['code', '编程', 'developer', 'ide', 'editor', 'git', 'debug', 'copilot', 'coding', 'programming'],
    '聊天对话': ['chat', '对话', '聊天', 'assistant', 'bot', 'llm', 'gpt', 'claude', 'mcp', 'agent'],
    '图像生成': ['image', '图片', '绘画', 'draw', 'art', 'stable-diffusion', 'midjourney', 'dall-e', 'vision'],
    '视频生成': ['video', '视频', 'animation', 'sora', 'runway', 'movie'],
    '音频处理': ['audio', '语音', 'music', 'sound', 'tts', 'voice', 'whisper', 'speech'],
    '写作助手': ['write', '写作', 'markdown', 'note', 'doc', 'copywriting', 'content'],
    '搜索引擎': ['search', '搜索', 'rag', 'retrieval', 'perplexity', 'crawler', 'scrape'],
    '办公效率': ['productivity', '办公', 'excel', 'pdf', 'tool', 'automation', 'workflow'],
    '设计工具': ['design', '设计', 'ui', 'figma', 'icon', 'prototype', 'css', 'tailwind'],
    '知识管理': ['knowledge', '笔记', 'wiki', 'bookmark', 'notion', 'obsidian', 'docs'],
    '数据分析': ['data', '数据', 'analytics', 'chart', 'visualization', 'bi', 'sql', 'database'],
    '教育学习': ['education', '学习', 'course', 'tutorial', 'learn', 'study'],
    '健康医疗': ['health', '医疗', 'medical', 'fitness', 'care'],
    '金融理财': ['finance', '金融', 'trading', 'crypto', 'investment', 'stock'],
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
  console.log('🚀 开始抓取 GitHub Trending...\n')
  
  try {
    const repos = await fetchGitHubTrending()
    console.log(`\n📦 共获取 ${repos.length} 个唯一项目\n`)
    
    if (repos.length === 0) {
      console.log('⚠️ 没有获取到数据')
      return
    }
    
    // 保存到数据库
    let saved = 0
    let updated = 0
    
    for (const repo of repos) {
      const existing = await prisma.tool.findFirst({
        where: { githubUrl: repo.html_url }
      })
      
      if (existing) {
        await saveRepo(repo)
        updated++
      } else {
        await saveRepo(repo)
        saved++
      }
    }
    
    console.log(`\n✅ 完成！新增 ${saved} 个，更新 ${updated} 个`)
    
  } catch (error) {
    console.error('❌ 执行失败:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// 运行
main()
