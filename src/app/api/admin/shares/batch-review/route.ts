import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAdmin } from '@/lib/auth'
import { createNotification } from '@/lib/notification'
import { addExp } from '@/lib/add-exp'
import { EXP_RULES } from '@/lib/level'
import { checkAndUnlock } from '@/lib/check-achievements'

// POST /api/admin/shares/batch-review  批量审核分享
export async function POST(request: NextRequest) {
  const auth = await verifyAdmin(request)
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { ids, action, note } = body // action: 'approve' | 'reject'

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '请选择要审核的分享' }, { status: 400 })
    }
    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: '无效的操作' }, { status: 400 })
    }

    // 获取分享信息（用于通知）
    const shares = await prisma.$queryRawUnsafe<Array<any>>(`
      SELECT id, type, "userId" FROM shares WHERE id = ANY($1::int[])
    `, ids)

    if (action === 'approve') {
      await prisma.$executeRawUnsafe(`
        UPDATE shares SET status = 'approved', "reviewedAt" = NOW() WHERE id = ANY($1::int[])
      `, ids)
      // 给作者加经验 + 成就检查
      for (const share of shares) {
        addExp(share.userId, EXP_RULES.CREATE_SHARE).catch(() => {})
        checkAndUnlock(share.userId).catch(() => {})
      }
    } else {
      await prisma.$executeRawUnsafe(`
        UPDATE shares SET status = 'rejected', "reviewedAt" = NOW(), "reviewNote" = $1 WHERE id = ANY($2::int[])
      `, note || null, ids)
    }

    // 通知分享作者
    const actionLabel = action === 'approve' ? '已通过' : '未通过'
    for (const share of shares) {
      const typeLabel = share.type === 'tool' ? '工具分享' : share.type === 'tech_share' ? '技术分享' : share.type === 'qa_help' ? '问答求助' : '生活圈动态'
      createNotification({
        userId: share.userId,
        type: 'system',
        title: `${typeLabel}${actionLabel}`,
        content: `你的${typeLabel}${actionLabel}${note ? `: ${note}` : ''}`,
        link: '/user-center?tab=submissions'
      }).catch(() => {})
    }

    return NextResponse.json({
      success: true,
      message: `已${action === 'approve' ? '通过' : '拒绝'} ${ids.length} 个分享`,
      count: ids.length
    })
  } catch (error: any) {
    console.error('批量审核分享失败:', error)
    return NextResponse.json({ error: '批量审核失败: ' + error.message }, { status: 500 })
  }
}
