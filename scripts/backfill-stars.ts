/**
 * 为已有GitHub链接但stars=0的工具补上真实star数
 * 用法: npx tsx scripts/backfill-stars.ts
 */
import { prisma } from '@/lib/prisma'
import { getGitHubStars } from '@/lib/github-stars'

async function main() {
  console.log('📦 查询需要补 star 的工具...')
  
  const tools = await prisma.tool.findMany({
    where: {
      githubUrl: { not: null },
      stars: 0,
    },
    select: { id: true, name: true, githubUrl: true },
  })

  console.log(`📊 共 ${tools.length} 个工具需要补 star\n`)

  let updated = 0
  let failed = 0

  for (let i = 0; i < tools.length; i++) {
    const t = tools[i]
    process.stdout.write(`  [${i + 1}/${tools.length}] ${t.name}... `)

    const stars = await getGitHubStars(t.githubUrl)
    if (stars > 0) {
      await prisma.tool.update({ where: { id: t.id }, data: { stars } })
      console.log(`⭐ ${stars}`)
      updated++
    } else {
      console.log(`-`)
      failed++
    }

    // GitHub API 限速，慢一点
    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`\n✨ 完成! 更新: ${updated}, 无数据: ${failed}`)
  await prisma.$disconnect()
}

main().catch(e => {
  console.error('❌', e)
  process.exit(1)
})
