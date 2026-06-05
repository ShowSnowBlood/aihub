import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAdmin } from '@/lib/auth'
import { createNotification } from '@/lib/notification'

// POST /api/admin/tools/batch-review  批量审核工具
export async function POST(request: NextRequest) {
  const auth = await verifyAdmin(request)
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { ids, action, note } = body // action: 'approve' | 'reject'

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '请选择要审核的工具' }, { status: 400 })
    }
    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: '无效的操作' }, { status: 400 })
    }

    const status = action === 'approve' ? 'approved' : 'rejected'
    const isActive = action === 'approve'

    // 批量更新
    const result = await prisma.$executeRawUnsafe(`
      UPDATE tools SET status = $1, "isActive" = $2, "reviewedAt" = NOW(), "reviewNote" = $3
      WHERE id = ANY($4::int[])
    `, status, isActive, note || null, ids)

    // 获取更新后的工具信息（用于通知）
    const tools = await prisma.$queryRawUnsafe<Array<any>>(`
      SELECT id, name, "submittedBy" FROM tools WHERE id = ANY($1::int[])
    `, ids)

    // 通知每个工具提交者
    const actionLabel = action === 'approve' ? '已通过' : '未通过'
    for (const tool of tools) {
      if (tool.submittedBy) {
        createNotification({
          userId: tool.submittedBy,
          type: 'system',
          title: `工具${actionLabel}`,
          content: `你提交的工具「${tool.name}」${actionLabel}${note ? `: ${note}` : ''}`,
          link: '/user-center?tab=submissions'
        }).catch(() => {})
      }
    }

    return NextResponse.json({
      success: true,
      message: `已${action === 'approve' ? '通过' : '拒绝'} ${ids.length} 个工具`,
      count: ids.length
    })
  } catch (error: any) {
    console.error('批量审核工具失败:', error)
    return NextResponse.json({ error: '批量审核失败: ' + error.message }, { status: 500 })
  }
}
