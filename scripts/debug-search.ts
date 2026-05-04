import { prisma } from '../src/lib/prisma'

async function main() {
  // 模拟页面上的完整查询
  const search = 'ChataGPT'
  const where: any = { isActive: true }
  
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { shortDesc: { contains: search } },
      { description: { contains: search } },
      { tags: { contains: search } },
    ]
  }
  
  console.log('查询条件:', JSON.stringify(where, null, 2))
  
  const totalItems = await prisma.tool.count({ where })
  console.log(`\n总数: ${totalItems}`)
  
  const tools = await prisma.tool.findMany({
    where,
    select: { id: true, name: true },
    take: 10
  })
  
  console.log('\n结果:')
  tools.forEach(t => console.log(`- ${t.name}`))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
