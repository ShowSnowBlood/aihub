import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function cleanContent(text: string | null): string {
  if (!text) return ''
  return text
    // 去掉代码片段（连续的非自然语言字符）
    .replace(/\b(def |import |print\(|return |class |const |function |var |let )[^\n]{0,200}/g, '')
    .replace(/[a-zA-Z_]+\([^)]{0,100}\)/g, (match) => {
      // 保留简单英文词，去掉明显的函数调用
      if (match.includes(',') || match.length > 30) return ''
      return match
    })
    // 去掉明显的代码行（含 = ; { } 等）
    .replace(/[^\s.!?,]+[=;{}[\]]+[^\n]*/g, '')
    // 清理多余空白
    .replace(/\s+/g, ' ')
    .trim()
}

function isGarbled(text: string | null): boolean {
  if (!text || text.length < 20) return false
  // 含大量代码特征字符
  const codeChars = (text.match(/[=;{}[\]()]/g) || []).length
  const ratio = codeChars / text.length
  return ratio > 0.05
}

async function main() {
  console.log('🔧 开始修复资讯内容...\n')

  const news = await prisma.news.findMany({
    select: { id: true, title: true, summary: true, content: true, sourceName: true }
  })

  let fixed = 0
  let deleted = 0

  for (const item of news) {
    const summaryGarbled = isGarbled(item.summary)
    const contentGarbled = isGarbled(item.content)

    if (!summaryGarbled && !contentGarbled) continue

    const newSummary = (summaryGarbled ? cleanContent(item.summary) : item.summary) || ''
    const newContent = (contentGarbled ? cleanContent(item.content) : item.content) || ''

    // 如果清理后内容太少，直接删掉这条
    if (newSummary.length < 10 && newContent.length < 10) {
      await prisma.news.delete({ where: { id: item.id } })
      console.log(`🗑️  删除: [${item.sourceName}] ${item.title.slice(0, 40)}`)
      deleted++
      continue
    }

    await prisma.news.update({
      where: { id: item.id },
      data: {
        summary: newSummary.slice(0, 300),
        content: newContent.slice(0, 2000)
      }
    })
    console.log(`✅ 修复: [${item.sourceName}] ${item.title.slice(0, 40)}`)
    fixed++
  }

  console.log(`\n📊 完成：修复 ${fixed} 条，删除 ${deleted} 条`)
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
