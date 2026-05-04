import { prisma } from '../src/lib/prisma'

async function main() {
  // 查看所有工具
  const tools = await prisma.tool.findMany({
    select: { id: true, name: true, shortDesc: true },
    take: 20
  })
  
  console.log('所有工具:')
  tools.forEach(t => console.log(`- ${t.name}: ${t.shortDesc}`))
  
  // 搜索测试
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
    select: { id: true, name: true }
  })
  
  console.log(`\n搜索 "${searchTerm}" 结果:`)
  console.log(`找到 ${results.length} 个工具`)
  results.forEach(t => console.log(`- ${t.name}`))
  
  // 搜索 ChatGPT（正确拼写）
  const results2 = await prisma.tool.findMany({
    where: {
      OR: [
        { name: { contains: 'ChatGPT' } },
        { shortDesc: { contains: 'ChatGPT' } },
        { description: { contains: 'ChatGPT' } },
        { tags: { contains: 'ChatGPT' } },
      ]
    },
    select: { id: true, name: true }
  })
  
  console.log(`\n搜索 "ChatGPT" 结果:`)
  console.log(`找到 ${results2.length} 个工具`)
  results2.forEach(t => console.log(`- ${t.name}`))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
