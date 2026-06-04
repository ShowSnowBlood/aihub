/**
 * 一次性迁移 API：将数据库中已有的 base64 图片迁移到 R2
 * 访问 /api/admin/migrate-images 触发（需管理员登录）
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { uploadImage, parseBase64Image, isR2Configured } from '@/lib/r2'
import { verifyAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  // 验证管理员身份
  const authResult = await verifyAdmin(request)
  if (authResult instanceof NextResponse) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  // authResult 是 AuthResult { userId, isAdmin }
  if (!authResult.isAdmin) {
    return NextResponse.json({ error: '需要管理员权限' }, { status: 403 })
  }

  if (!isR2Configured()) {
    return NextResponse.json({ error: 'R2 未配置' }, { status: 500 })
  }

  const result = { total: 0, migrated: 0, failed: 0, errors: [] as string[] }

  try {
    const shares = await prisma.$queryRaw<Array<{ id: number; images: string | null }>>`
      SELECT id, images FROM shares WHERE images IS NOT NULL AND images != ''
    `
    result.total = shares.length

    for (const share of shares) {
      if (!share.images) continue
      try {
        let images: string[]
        try { images = JSON.parse(share.images) } catch { continue }
        if (!Array.isArray(images) || images.length === 0) continue

        const newImages: string[] = []
        let changed = false

        for (let i = 0; i < images.length; i++) {
          const img = images[i]
          if (img.startsWith('http')) { newImages.push(img); continue }
          const parsed = parseBase64Image(img)
          if (!parsed) { newImages.push(img); continue }
          const key = `shares/${share.id}/${i}-${Date.now()}.${parsed.mimeType.split('/')[1]}`
          const url = await uploadImage(key, parsed.buffer, parsed.mimeType)
          newImages.push(url)
          changed = true
          result.migrated++
        }
        if (changed) {
          await prisma.$executeRaw`UPDATE shares SET images = ${JSON.stringify(newImages)} WHERE id = ${share.id}`
        }
      } catch (err: any) {
        result.failed++
        result.errors.push(`share#${share.id}: ${err.message}`)
      }
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  return NextResponse.json(result)
}
