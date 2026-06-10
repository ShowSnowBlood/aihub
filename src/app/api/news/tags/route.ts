import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // 获取所有文章的标题和摘要
    const allNews = await prisma.news.findMany({
      select: { title: true, summary: true },
      take: 100,
    })
    
    // 简单的标签提取逻辑
    const tagKeywords = ['大模型', '开源', 'ChatGPT', '图像生成', '视频生成', '编程助手', '多模态', 'AI工具']
    const tagCounts = tagKeywords.map(tag => ({
      name: tag,
      count: allNews.filter(n => 
        n.title.includes(tag) || (n.summary?.includes(tag) ?? false)
      ).length
    })).filter(t => t.count > 0).sort((a, b) => b.count - a.count)
    
    return NextResponse.json({ tags: tagCounts }, {
      headers: {
        'Cache-Control': 'public, max-age=600, s-maxage=1800, stale-while-revalidate=86400',
      },
    })
  } catch (error) {
    console.error('Failed to fetch tags:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tags' },
      { status: 500 }
    )
  }
}
