import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/user/shares?userId=xxx - 获取指定用户的分享列表
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
    // 获取用户的分享列表（包括待审核和已通过）
    const shares = await prisma.$queryRawUnsafe(`
      SELECT 
        s.*,
        u.username as userName,
        u.avatarUrl as userAvatarUrl,
        t.name as toolName,
        t.slug as toolSlug,
        t.shortDesc as toolShortDesc,
        t.description as toolDescription,
        t.websiteUrl as toolWebsiteUrl,
        c.name as categoryName,
        c.slug as categorySlug,
        (SELECT COUNT(*) FROM comments WHERE shareId = s.id) as commentsCount
      FROM shares s
      LEFT JOIN users u ON s.userId = u.id
      LEFT JOIN tools t ON s.toolId = t.id
      LEFT JOIN categories c ON t.categoryId = c.id
      WHERE s.userId = ${parseInt(userId)}
      ORDER BY s.createdAt DESC
      LIMIT ${limit} OFFSET ${skip}
    `)

    // 格式化数据 - 将 BigInt 转换为 Number
    const formattedShares = (shares as any[]).map(s => ({
      id: Number(s.id),
      content: s.content,
      images: s.images ? JSON.parse(s.images) : null,
      likes: Number(s.likes || 0),
      status: s.status,
      createdAt: s.createdAt,
      user: {
        id: Number(s.userId),
        username: s.userName,
        avatarUrl: s.userAvatarUrl
      },
      tool: {
        id: Number(s.toolId),
        name: s.toolName,
        slug: s.toolSlug,
        shortDesc: s.toolShortDesc,
        description: s.toolDescription,
        websiteUrl: s.toolWebsiteUrl,
        category: s.categoryName ? {
          name: s.categoryName,
          slug: s.categorySlug
        } : null
      },
      _count: {
        comments: Number(s.commentsCount || 0)
      }
    }))

    // 获取总数
    const totalResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count FROM shares WHERE userId = ${parseInt(userId)}
    `)
    const total = Number((totalResult as any)[0].count)

    return NextResponse.json({
      shares: formattedShares,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    })
  } catch (error: any) {
    console.error('获取用户分享失败:', error)
    return NextResponse.json({ error: '获取失败: ' + error.message }, { status: 500 })
  }
}
