const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  // 检查是否已存在
  const existing = await prisma.category.findUnique({
    where: { slug: 'user-submit' }
  })

  if (existing) {
    console.log('✅ 用户分享分类已存在')
    return
  }

  // 创建其他分类（用户提交工具用）
  const category = await prisma.category.create({
    data: {
      name: '其他',
      slug: 'user-submit',
      description: '用户自主提交的AI工具推荐，等待审核或社区精选',
      icon: '📦',
      sortOrder: 999, // 放在最后
    }
  })

  console.log('✅ 创建成功:', category)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
