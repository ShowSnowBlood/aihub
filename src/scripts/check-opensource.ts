import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const total = await prisma.tool.count()
  const openSource = await prisma.tool.count({ where: { isOpenSource: true } })
  const closedSource = await prisma.tool.count({ where: { isOpenSource: false } })
  
  console.log('📊 数据统计:')
  console.log(`   工具总数: ${total}`)
  console.log(`   开源免费: ${openSource}`)
  console.log(`   非开源: ${closedSource}`)
  
  // 列出一些开源工具
  const openSourceTools = await prisma.tool.findMany({
    where: { isOpenSource: true },
    select: { name: true, githubUrl: true },
    take: 10
  })
  
  console.log('\n🔓 开源工具示例:')
  openSourceTools.forEach(t => {
    console.log(`   - ${t.name} ${t.githubUrl ? '(GitHub)' : ''}`)
  })
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
