import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/user/tools?userId=xxx - 获取指定用户提交的工具列表
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '10')
  const skip = (page - 1) * limit

  if (!userId) {
    return NextResponse.json({ error: '缺少用户ID' }, { status: 400 })
  }

  try {
    // 获取用户提交的工具列表
    const tools = await prisma.$queryRawUnsafe(`
      SELECT 
        t.*,
        c.name as categoryName,
        c.slug as categorySlug,
        (SELECT COUNT(*) FROM comments WHERE toolId = t.id) as commentsCount,
        (SELECT COUNT(*) FROM shares WHERE toolId = t.id) as sharesCount
      FROM tools t
      LEFT JOIN categories c ON t.categoryId = c.id
      WHERE t.submittedBy = ${parseInt(userId)}
      ORDER BY t.createdAt DESC
      LIMIT ${limit} OFFSET ${skip}
    `)

    // 格式化数据 - 将 BigInt 转换为 Number
    const formattedTools = (tools as any[]).map(t => ({
      id: Number(t.id),
      name: t.name,
      slug: t.slug,
      shortDesc: t.shortDesc,
      description: t.description,
      websiteUrl: t.websiteUrl,
      logoUrl: t.logoUrl,
      status: t.status,
      createdAt: t.createdAt,
      category: t.categoryName ? {
        name: t.categoryName,
        slug: t.categorySlug
      } : null,
      _count: {
        comments: Number(t.commentsCount || 0),
        shares: Number(t.sharesCount || 0)
      }
    }))

    // 获取总数
    const totalResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count FROM tools WHERE submittedBy = ${parseInt(userId)}
    `)
    const total = Number((totalResult as any)[0].count)

    return NextResponse.json({
      tools: formattedTools,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    })
  } catch (error: any) {
    console.error('获取用户工具失败:', error)
    return NextResponse.json({ error: '获取失败: ' + error.message }, { status: 500 })
  }
}
