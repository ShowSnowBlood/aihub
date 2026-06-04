/**
 * 迁移脚本：将数据库中已有的 base64 图片上传到 R2
 * 
 * 用法: npx tsx src/scripts/migrate-images-to-r2.ts
 */
import { prisma } from '@/lib/prisma'
import { uploadImage, parseBase64Image, isR2Configured } from '@/lib/r2'

async function migrate() {
  if (!isR2Configured()) {
    console.error('❌ R2 环境变量未配置，跳过迁移')
    process.exit(1)
  }

  console.log('🔍 开始扫描数据库中的 base64 图片...')

  // 查询所有有图片的分享
  const shares = await prisma.$queryRaw<Array<{ id: number; images: string | null }>>`
    SELECT id, images FROM shares WHERE images IS NOT NULL AND images != ''
  `

  let migrated = 0
  let failed = 0

  for (const share of shares) {
    if (!share.images) continue

    try {
      let images: string[]
      try {
        images = JSON.parse(share.images)
      } catch {
        continue
      }

      if (!Array.isArray(images) || images.length === 0) continue

      const newImages: string[] = []
      let changed = false

      for (let i = 0; i < images.length; i++) {
        const img = images[i]

        // 已经是 R2 URL，跳过
        if (img.startsWith('http')) {
          newImages.push(img)
          continue
        }

        // 解析 base64
        const parsed = parseBase64Image(img)
        if (!parsed) {
          newImages.push(img)
          continue
        }

        // 上传到 R2
        const key = `shares/${share.id}/${i}-${Date.now()}.${parsed.mimeType.split('/')[1]}`
        const url = await uploadImage(key, parsed.buffer, parsed.mimeType)
        newImages.push(url)
        changed = true
        migrated++
        console.log(`  ✅ share#${share.id}[${i}] → ${url.slice(0, 60)}...`)
      }

      if (changed) {
        // 更新数据库，只存 URL 不再存 base64
        await prisma.$executeRaw`
          UPDATE shares SET images = ${JSON.stringify(newImages)} WHERE id = ${share.id}
        `
      }
    } catch (err) {
      failed++
      console.error(`  ❌ share#${share.id} 迁移失败:`, err)
    }
  }

  console.log(`\n📊 迁移完成：成功 ${migrated} 张，失败 ${failed} 个分享`)
}

migrate()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
