import { prisma } from '../src/lib/prisma'

async function main() {
  const searchTerm = 'ChataGPT'
  
  // 模拟页面上的查询条件
  const where: any = { isActive: true }
  where.OR = [
    { name: { contains: searchTerm } },
    { shortDesc: { contains: searchTerm } },
    { description: { contains: searchTerm } },
    { tags: { contains: searchTerm } },
  ]
  
  const results = await prisma.tool.findMany({
    where,
    select: { 
      id: true, 
      name: true, 
      shortDesc: true, 
      description: true,
      tags: true,
      isActive: true
    }
  })
  
  console.log(`搜索 "${searchTerm}" 找到 ${results.length} 个工具:\n`)
  results.forEach(t => {
    console.log(`- ${t.name} (isActive: ${t.isActive})`)
    console.log(`  简介: ${t.shortDesc}`)
    console.log(`  标签: ${t.tags}`)
    console.log()
  })
  
  // 检查那 4 个工具的 isActive 状态
  const names = ['Khan Academy Khanmigo', 'Duolingo Max', 'Quizlet AI', 'Synthesis']
  const tools = await prisma.tool.findMany({
    where: { name: { in: names } },
    select: { id: true, name: true, isActive: true }
  })
  
  console.log('\n这 4 个工具的状态:')
  tools.forEach(t => console.log(`- ${t.name}: isActive=${t.isActive}`))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
