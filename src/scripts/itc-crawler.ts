/**
 * IT之家开源社区抓取脚本
 * 数据源: https://open.itc.cn/
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface ITCProject {
  id: string
  title: string
  description?: string
  url?: string
  githubUrl?: string
  starCount?: number
  forkCount?: number
  language?: string
  tags?: string
  occurTime?: string
  [key: string]: unknown
}

/**
 * 抓取 ITC 开源项目
 */
async function fetchITCProjects(occurTime?: string): Promise<ITCProject[]> {
  const url = occurTime 
    ? `https://open.itc.cn/feed/communityLoad.json?occurTime=${encodeURIComponent(occurTime)}`
    : 'https://open.itc.cn/feed/communityLoad.json'
  
  console.log(`📡 抓取: ${url}`)
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const data = await response.json() as { status: number; result: Array<{detail?: string; occurTime?: string}>; ok: boolean }
    
    if (!data.ok || !Array.isArray(data.result)) {
      console.log('⚠️ 返回数据异常:', data)
      return []
    }
    
    // 解析社区动态中的项目信息
    const projects: ITCProject[] = []
    for (const item of data.result) {
      if (item.detail) {
        const project = parseITCDetail(item.detail, item.occurTime || '')
        if (project) projects.push(project)
      }
    }
    
    return projects
  } catch (error) {
    console.error('❌ 抓取失败:', error)
    return []
  }
}

/**
 * 解析 ITC detail HTML 内容
 */
function parseITCDetail(detail: string, occurTime: string): ITCProject | null {
  // 提取 GitHub 链接
  const githubMatch = detail.match(/github\.com\/([^\/"]+)\/([^\/"\s]+)/)
  if (!githubMatch) return null
  
  const owner = githubMatch[1]
  const repo = githubMatch[2].replace(/\.git$/, '')
  
  // 提取项目名称（从链接文本或仓库名）
  const nameMatch = detail.match(/>([^<]+)<\/a>\s*$/m) || detail.match(/>([^<]+)<\/a>\s*ï¼/)
  const name = nameMatch ? nameMatch[1].trim() : repo
  
  // 提取描述（去掉 HTML 标签）
  const description = detail
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200)
  
  return {
    id: `${owner}-${repo}`,
    title: name,
    description,
    githubUrl: `https://github.com/${owner}/${repo}`,
    url: `https://github.com/${owner}/${repo}`,
    occurTime
  }
}

/**
 * 保存项目到数据库
 */
async function saveProject(project: ITCProject) {
  try {
    // 提取 GitHub 信息
    const githubUrl = project.githubUrl || project.url || ''
    const githubMatch = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/)
    
    let slug = ''
    if (githubMatch) {
      slug = `${githubMatch[1]}-${githubMatch[2]}`.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    } else {
      slug = project.title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '-').substring(0, 50)
    }
    
    // 检查是否已存在
    const existing = await prisma.tool.findFirst({
      where: {
        OR: [
          { slug },
          { name: project.title }
        ]
      }
    })
    
    if (existing) {
      console.log(`   ⏭️ 已存在: ${project.title}`)
      return
    }
    
    // 自动分类
    const categoryId = await autoCategorize(project)
    
    // 创建工具
    await prisma.tool.create({
      data: {
        name: project.title,
        slug,
        description: project.description || '',
        githubUrl,
        websiteUrl: githubUrl,
        categoryId,
        tags: project.tags || project.language || '',
        stars: project.starCount || 0,
        isOpenSource: true,
        source: 'ITC',
        sourceUrl: `https://open.itc.cn/`,
        status: 'approved',
        publishedAt: new Date()
      }
    })
    
    console.log(`   ✅ 新增: ${project.title}`)
  } catch (error) {
    console.error(`   ❌ 保存失败 ${project.title}:`, error)
  }
}

/**
 * 自动分类
 */
async function autoCategorize(project: ITCProject): Promise<number | null> {
  const text = `${project.title} ${project.description || ''} ${project.tags || ''}`.toLowerCase()
  
  const categoryMap: Record<string, string[]> = {
    '代码助手': ['code', '编程', 'developer', 'ide', 'editor', 'git', 'debug'],
    '聊天对话': ['chat', '对话', '聊天', 'assistant', 'bot', 'llm', 'gpt'],
    '图像生成': ['image', '图片', '绘画', 'draw', 'art', 'stable-diffusion', 'midjourney'],
    '视频生成': ['video', '视频', 'animation'],
    '音频处理': ['audio', '语音', 'music', 'sound', 'tts', 'voice'],
    '写作助手': ['write', '写作', 'markdown', 'note', 'doc'],
    '搜索引擎': ['search', '搜索', 'rag', 'retrieval'],
    '办公效率': ['productivity', '办公', 'excel', 'pdf', 'tool'],
    '设计工具': ['design', '设计', 'ui', 'figma', 'icon'],
    '知识管理': ['knowledge', '笔记', 'wiki', 'bookmark'],
    '数据分析': ['data', '数据', 'analytics', 'chart', 'visualization'],
    '教育学习': ['education', '学习', 'course', 'tutorial'],
    '健康医疗': ['health', '医疗', 'medical'],
    '金融理财': ['finance', '金融', 'trading', 'crypto'],
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
  console.log('🚀 开始抓取 ITC 开源项目...\n')
  
  try {
    let totalSaved = 0
    let totalSkipped = 0
    
    // 抓取多页数据（过去30天，每页约20条）
    const pages = 5
    let lastOccurTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    
    for (let i = 0; i < pages; i++) {
      const timeStr = lastOccurTime.toISOString().replace('T', ' ').substring(0, 19)
      console.log(`📄 第 ${i + 1}/${pages} 页 (occurTime=${timeStr})`)
      
      const projects = await fetchITCProjects(timeStr)
      console.log(`   获取到 ${projects.length} 个项目`)
      
      if (projects.length === 0) {
        console.log('   没有更多数据，结束抓取')
        break
      }
      
      // 保存到数据库
      for (const project of projects) {
        const existing = await prisma.tool.findFirst({
          where: { slug: project.id.replace(/[^a-z0-9-]/g, '-') }
        })
        if (existing) {
          totalSkipped++
          continue
        }
        await saveProject(project)
        totalSaved++
      }
      
      // 更新时间为最后一条数据的时间
      if (projects.length > 0 && projects[projects.length - 1].occurTime) {
        lastOccurTime = new Date(projects[projects.length - 1].occurTime || '')
      }
      
      // 延迟避免请求过快
      if (i < pages - 1) {
        await new Promise(r => setTimeout(r, 1000))
      }
    }
    
    console.log(`\n✅ 完成！新增 ${totalSaved} 个，跳过 ${totalSkipped} 个已存在`)
    
  } catch (error) {
    console.error('❌ 执行失败:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// 运行
main()
