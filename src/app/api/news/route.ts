import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    
    const skip = (page - 1) * limit
    
    // 获取文章列表
    const news = await prisma.news.findMany({
      orderBy: { publishedAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        title: true,
        titleZh: true,
        summary: true,
        summaryZh: true,
        sourceName: true,
        isAutoCrawled: true,
        publishedAt: true,
        createdAt: true,
        viewCount: true,
      }
    })
    
    // 获取总数
    const total = await prisma.news.count()
    const totalPages = Math.ceil(total / limit)
    
    return NextResponse.json({
      news,
      total,
      totalPages,
      currentPage: page,
    })
  } catch (error) {
    console.error('Failed to fetch news:', error)
    return NextResponse.json(
      { error: 'Failed to fetch news' },
      { status: 500 }
    )
  }
}
