import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// PATCH /api/admin/comments/:id - 下架/恢复评论
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params
  const { action, reason } = await request.json()

  if (!id || !action) {
    return NextResponse.json({ error: '缺少参数' }, { status: 400 })
  }

  try {
    const now = new Date().toISOString()
    
    if (id.startsWith('tool_')) {
      const realId = parseInt(id.replace('tool_', ''))
      if (action === 'suspend') {
        await prisma.$executeRaw`
          UPDATE comments 
          SET status = 'suspended', suspendedAt = ${now}, suspendedReason = ${reason || ''}
          WHERE id = ${realId}
        `
      } else if (action === 'restore') {
        await prisma.$executeRaw`
          UPDATE comments 
          SET status = 'approved', suspendedAt = NULL, suspendedReason = NULL
          WHERE id = ${realId}
        `
      }
    } else if (id.startsWith('share_')) {
      const realId = parseInt(id.replace('share_', ''))
      if (action === 'suspend') {
        await prisma.$executeRaw`
          UPDATE share_comments 
          SET status = 'suspended', suspendedAt = ${now}, suspendedReason = ${reason || ''}
          WHERE id = ${realId}
        `
      } else if (action === 'restore') {
        await prisma.$executeRaw`
          UPDATE share_comments 
          SET status = 'approved', suspendedAt = NULL, suspendedReason = NULL
          WHERE id = ${realId}
        `
      }
    }
    
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('操作评论失败:', error)
    return NextResponse.json({ error: '操作失败: ' + error.message }, { status: 500 })
  }
}
