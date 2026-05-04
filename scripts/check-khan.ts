import { prisma } from '../src/lib/prisma'

async function main() {
  // 查找 Khan Academy
  const khan = await prisma.tool.findMany({
    where: {
      OR: [
        { name: { contains: 'Khan' } },
        { name: { contains: 'Academy' } },
      ]
    },
    select: { id: true, name: true, shortDesc: true, description: true }
  })
  
  console.log('Khan Academy 相关工具:')
  khan.forEach(t => {
    console.log(`- ID: ${t.id}`)
    console.log(`  名称: ${t.name}`)
    console.log(`  简介: ${t.shortDesc}`)
    console.log(`  描述: ${t.description?.substring(0, 100)}...`)
    console.log()
  })
  
  // 查看总共有多少工具
  const total = await prisma.tool.count()
  console.log(`数据库总共有 ${total} 个工具`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
