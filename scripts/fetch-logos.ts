import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// 使用 Clearbit Logo API 获取品牌logo
function getClearbitLogoUrl(domain: string): string {
  return `https://logo.clearbit.com/${domain}`
}

// 使用 Google Favicon 作为备选
function getGoogleFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=256`
}

// 使用 DuckDuckGo Favicon 作为备选
function getDuckDuckGoFaviconUrl(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`
}

async function main() {
  // 获取所有没有logoUrl但有websiteUrl的工具
  const tools = await prisma.tool.findMany({
    where: {
      logoUrl: null,
      websiteUrl: { not: null }
    },
    select: {
      id: true,
      name: true,
      websiteUrl: true
    }
  })

  console.log(`找到 ${tools.length} 个需要获取logo的工具`)
  console.log('开始批量获取logo...\n')

  let successCount = 0
  let failCount = 0

  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i]
    try {
      const url = new URL(tool.websiteUrl!)
      const domain = url.hostname.replace(/^www\./, '')
      
      // 优先使用 Clearbit Logo API
      const logoUrl = getClearbitLogoUrl(domain)
      
      // 更新数据库
      await prisma.tool.update({
        where: { id: tool.id },
        data: { logoUrl: logoUrl }
      })
      
      console.log(`✅ [${i + 1}/${tools.length}] ${tool.name} -> ${logoUrl}`)
      successCount++
      
      // 添加小延迟，避免请求过快
      await new Promise(resolve => setTimeout(resolve, 100))
    } catch (error) {
      console.log(`❌ [${i + 1}/${tools.length}] ${tool.name}: ${error}`)
      failCount++
    }
  }

  console.log(`\n=== 完成 ===`)
  console.log(`成功: ${successCount}`)
  console.log(`失败: ${failCount}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())