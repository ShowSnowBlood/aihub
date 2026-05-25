import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/admin/tools?status=&page=&limit=&search=
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') as 'pending' | 'approved' | 'rejected' | 'suspended' | null
  const source = searchParams.get('source') as 'crawler' | 'user' | null
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '10')
  const search = searchParams.get('search') || ''
  const skip = (page - 1) * limit

  try {
    // 使用原始 SQL 查询（绕过 Prisma Client 缓存问题）
    // 显示所有工具，包括爬虫抓取的和用户提交的
    let whereClause = 'WHERE 1=1'
    if (status) {
      whereClause += ` AND status = '${status}'`
    }
    if (source) {
      whereClause += ` AND source = '${source}'`
    }
    const hasSearch = !!search
    if (search) {
      whereClause += ` AND (LOWER(t.name) LIKE LOWER('%${search}%') OR LOWER(t."shortDesc") LIKE LOWER('%${search}%') OR LOWER(t.description) LIKE LOWER('%${search}%') OR LOWER(t.tags) LIKE LOWER('%${search}%'))`
    }

    // 构建 ORDER BY：有搜索时按相关性排序，无搜索时按创建时间
    const orderClause = hasSearch
      ? `
      ORDER BY
        (CASE WHEN LOWER(t.name) = LOWER('${search}') THEN 100 ELSE 0 END +
         CASE WHEN LOWER(t.name) LIKE LOWER('${search}%') THEN 50 ELSE 0 END +
         CASE WHEN LOWER(t.name) LIKE LOWER('%${search}%') THEN 30 ELSE 0 END +
         CASE WHEN LOWER(t.tags) LIKE LOWER('%${search}%') THEN 20 ELSE 0 END +
         CASE WHEN LOWER(t."shortDesc") LIKE LOWER('%${search}%') THEN 15 ELSE 0 END +
         CASE WHEN LOWER(t.description) LIKE LOWER('%${search}%') THEN 5 ELSE 0 END) DESC,
        t."createdAt" DESC`
      : `ORDER BY t."createdAt" DESC`

    // 并行查询：列表 + 统计 + 筛选总数（原来 6 次串行 → 2 次并行）
    const [tools, statsResult, totalResult] = await Promise.all([
      prisma.$queryRawUnsafe(`
        SELECT t.*, c.name as "categoryName"
        FROM tools t
        LEFT JOIN categories c ON t."categoryId" = c.id
        ${whereClause}
        ${orderClause}
        LIMIT ${limit} OFFSET ${skip}
      `),
      prisma.$queryRawUnsafe(`SELECT status, COUNT(*) as count FROM tools GROUP BY status`),
      prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM tools t ${whereClause}`)
    ]) as [any[], any[], any[]]

    const total = Number((totalResult as any[])[0]?.count || 0)
    const pending = Number((statsResult as any[]).find(r => r.status === 'pending')?.count || 0)
    const approved = Number((statsResult as any[]).find(r => r.status === 'approved')?.count || 0)
    const rejected = Number((statsResult as any[]).find(r => r.status === 'rejected')?.count || 0)
    const suspended = Number((statsResult as any[]).find(r => r.status === 'suspended')?.count || 0)

    return NextResponse.json({
      tools,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      stats: { pending, approved, rejected, suspended, total: pending + approved + rejected + suspended }
    })
  } catch (error: any) {
    console.error('获取工具列表失败:', error)
    return NextResponse.json({ error: '获取失败: ' + error.message }, { status: 500 })
  }
}
