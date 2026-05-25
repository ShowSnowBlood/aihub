import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/admin/shares?status=&type=&page=&limit=&search=
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') as 'pending' | 'approved' | 'rejected' | 'suspended' | null
    const type = searchParams.get('type') as 'tool' | 'life' | null
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const search = searchParams.get('search') || ''
    const skip = (page - 1) * limit

    // 构建 WHERE 条件
    const whereConditions: string[] = []
    if (status) whereConditions.push(`s.status = '${status}'`)
    if (type) whereConditions.push(`s.type = '${type}'`)
    if (search) {
      whereConditions.push(`(
        s.content LIKE '%${search}%' OR 
        u.username LIKE '%${search}%' OR 
        t.name LIKE '%${search}%'
      )`)
    }
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    // 并行查询：列表 + 筛选总数（原来 7 次查询 → 2 次并行关键路径）
    const [shares, totalResult] = await Promise.all([
      prisma.$queryRawUnsafe(`
        SELECT 
          s.id, s.type, s.content, s.images, s.video, s.likes, s.status, 
          s."suspendedReason", 
          to_char(s."suspendedAt", 'YYYY-MM-DD"T"HH24:MI:SS') as "suspendedAt",
          to_char(s."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS') as "createdAt",
          s."userId", s."toolId",
          s."submitToolName", s."submitToolWebsite", s."submitToolDesc",
          s."submitToolCategory", s."submitToolPricing", s."submitToolGithub", s."submitToolLogo",
          u.username as "userUsername", u."avatarUrl" as "userAvatarUrl",
          t.name as "toolName", t.slug as "toolSlug",
          (SELECT COUNT(*) FROM share_comments sc WHERE sc."shareId" = s.id) as "commentsCount"
        FROM shares s
        LEFT JOIN users u ON s."userId" = u.id
        LEFT JOIN tools t ON s."toolId" = t.id
        ${whereClause}
        ORDER BY s."createdAt" DESC
        LIMIT ${limit} OFFSET ${skip}
      `),
      prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM shares s ${whereClause}`)
    ])

    const total = Number((totalResult as any[])[0]?.count || 0)

    // 转换数据格式以匹配前端期望的结构
    const formattedShares = (shares as any[]).map(share => ({
      id: share.id,
      type: share.type,
      content: share.content,
      images: share.images,
      video: share.video,
      likes: share.likes,
      status: share.status,
      suspendedReason: share.suspendedReason,
      suspendedAt: share.suspendedAt,
      createdAt: share.createdAt,
      userId: share.userId,
      toolId: share.toolId,
      submitToolName: share.submitToolName,
      submitToolWebsite: share.submitToolWebsite,
      submitToolDesc: share.submitToolDesc,
      submitToolCategory: share.submitToolCategory,
      submitToolPricing: share.submitToolPricing,
      submitToolGithub: share.submitToolGithub,
      submitToolLogo: share.submitToolLogo,
      user: share.userId ? {
        id: share.userId,
        username: share.userUsername,
        avatarUrl: share.userAvatarUrl
      } : null,
      tool: share.toolId ? {
        id: share.toolId,
        name: share.toolName,
        slug: share.toolSlug
      } : null,
      _count: {
        comments: Number(share.commentsCount || 0)
      }
    }))

    // 统计信息（非关键路径，失败不阻断列表返回）
    let pending = 0, approved = 0, rejected = 0, suspended = 0, toolCount = 0, lifeCount = 0

    try {
      const [statusResult, typeResult] = await Promise.all([
        prisma.$queryRawUnsafe(`SELECT status, COUNT(*) as count FROM shares GROUP BY status`),
        prisma.$queryRawUnsafe(`SELECT type, COUNT(*) as count FROM shares GROUP BY type`)
      ])
      pending = Number((statusResult as any[]).find((r: any) => r.status === 'pending')?.count || 0)
      approved = Number((statusResult as any[]).find((r: any) => r.status === 'approved')?.count || 0)
      rejected = Number((statusResult as any[]).find((r: any) => r.status === 'rejected')?.count || 0)
      suspended = Number((statusResult as any[]).find((r: any) => r.status === 'suspended')?.count || 0)
      toolCount = Number((typeResult as any[]).find((r: any) => r.type === 'tool')?.count || 0)
      lifeCount = Number((typeResult as any[]).find((r: any) => r.type === 'life')?.count || 0)
    } catch (statsErr) {
      console.error('获取分享统计数据失败:', statsErr)
    }

    return NextResponse.json({
      shares: formattedShares,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      stats: { pending, approved, rejected, suspended, total: pending + approved + rejected + suspended, tool: toolCount, life: lifeCount }
    })
  } catch (error) {
    console.error('获取分享列表失败:', error)
    return NextResponse.json(
      { error: '获取分享列表失败', shares: [], total: 0, page: 1, totalPages: 1, stats: { pending: 0, approved: 0, rejected: 0, suspended: 0, total: 0, tool: 0, life: 0 } },
      { status: 500 }
    )
  }
}
