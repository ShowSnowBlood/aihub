import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAdmin } from '@/lib/auth'

// GET /api/admin/stats  后台数据统计
export async function GET(request: NextRequest) {
  const auth = await verifyAdmin(request)
  if (auth instanceof NextResponse) return auth

  try {
    const today = new Date().toISOString().split('T')[0]

    const results = await Promise.all([
      // 工具总数
      prisma.$queryRawUnsafe<Array<any>>(`SELECT COUNT(*) as c FROM tools WHERE status = 'approved'`),
      // 分享总数
      prisma.$queryRawUnsafe<Array<any>>(`SELECT COUNT(*) as c FROM shares WHERE status = 'approved'`),
      // 用户总数
      prisma.$queryRawUnsafe<Array<any>>(`SELECT COUNT(*) as c FROM users WHERE role != 'BANNED'`),
      // 待审核工具
      prisma.$queryRawUnsafe<Array<any>>(`SELECT COUNT(*) as c FROM tools WHERE status = 'pending'`),
      // 待审核分享
      prisma.$queryRawUnsafe<Array<any>>(`SELECT COUNT(*) as c FROM shares WHERE status = 'pending'`),
      // 今日新增工具
      prisma.$queryRawUnsafe<Array<any>>(`SELECT COUNT(*) as c FROM tools WHERE "createdAt"::date >= $1::date`, today),
      // 今日新增分享
      prisma.$queryRawUnsafe<Array<any>>(`SELECT COUNT(*) as c FROM shares WHERE "createdAt"::date >= $1::date`, today),
      // 今日新增用户
      prisma.$queryRawUnsafe<Array<any>>(`SELECT COUNT(*) as c FROM users WHERE "createdAt"::date >= $1::date`, today),
    ])

    const stats = {
      tools: Number(results[0][0]?.c || 0),
      shares: Number(results[1][0]?.c || 0),
      users: Number(results[2][0]?.c || 0),
      pendingTools: Number(results[3][0]?.c || 0),
      pendingShares: Number(results[4][0]?.c || 0),
      todayNew: [5, 6, 7].reduce((sum, i) => sum + Number(results[i]?.[0]?.c || 0), 0)
    }

    return NextResponse.json(stats)
  } catch (error: any) {
    console.error('获取统计失败:', error)
    return NextResponse.json({ error: '获取统计失败' }, { status: 500 })
  }
}
