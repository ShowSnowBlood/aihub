import { prisma } from '../src/lib/prisma'

async function main() {
  const searchTerm = 'ChataGPT'
  
  const results = await prisma.tool.findMany({
    where: {
      OR: [
        { name: { contains: searchTerm } },
        { shortDesc: { contains: searchTerm } },
        { description: { contains: searchTerm } },
        { tags: { contains: searchTerm } },
      ]
    },
    select: { 
      id: true, 
      name: true, 
      shortDesc: true, 
      description: true,
      tags: true 
    }
  })
  
  console.log(`搜索 "${searchTerm}" 找到 ${results.length} 个工具:\n`)
  results.forEach(t => {
    console.log(`- ${t.name}`)
    console.log(`  简介: ${t.shortDesc}`)
    console.log(`  标签: ${t.tags}`)
    console.log(`  描述: ${t.description?.substring(0, 200)}...`)
    console.log()
  })
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
