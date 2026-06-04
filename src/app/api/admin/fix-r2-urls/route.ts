import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAdmin } from '@/lib/auth'

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || ''

export async function GET(request: NextRequest) {
  const authResult = await verifyAdmin(request)
  if (authResult instanceof NextResponse) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  if (!authResult.isAdmin) {
    return NextResponse.json({ error: '需要管理员权限' }, { status: 403 })
  }

  let fixed = 0
  const shares = await prisma.$queryRaw<Array<{ id: number; images: string | null }>>`
    SELECT id, images FROM shares WHERE images IS NOT NULL AND images LIKE '%r2.cloudflarestorage.com%'
  `

  for (const share of shares) {
    if (!share.images) continue
    const newImages = share.images.replace(
      /https:\/\/aihub-images\.[^/]+\/shares\/(\d+)\/([^",\]]+)/g,
      (match, shareId, filename) => `${R2_PUBLIC_URL}/shares/${shareId}/${filename}`
    )
    if (newImages !== share.images) {
      await prisma.$executeRaw`UPDATE shares SET images = ${newImages} WHERE id = ${share.id}`
      fixed++
    }
  }

  return NextResponse.json({ fixed })
}
