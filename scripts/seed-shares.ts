import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // 先创建测试用户
  const user1 = await prisma.user.upsert({
    where: { username: 'testuser1' },
    update: {},
    create: {
      username: 'testuser1',
      email: 'test1@example.com',
      password: 'testpassword123',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=test1',
      bio: 'AI工具爱好者',
    },
  })

  const user2 = await prisma.user.upsert({
    where: { username: 'testuser2' },
    update: {},
    create: {
      username: 'testuser2',
      email: 'test2@example.com',
      password: 'testpassword123',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=test2',
      bio: '开源项目贡献者',
    },
  })

  console.log('Created users:', user1.id, user2.id)

  // 获取现有工具
  const tools = await prisma.tool.findMany({ take: 3 })
  
  if (tools.length === 0) {
    console.log('No tools found, please add tools first')
    return
  }

  console.log('Found tools:', tools.map(t => t.name))

  // 创建测试分享数据
  const shares = [
    {
      content: '这个工具真的太好用了！帮我节省了大量时间，强烈推荐给大家 👍 #AI工具 #效率神器',
      images: JSON.stringify(['https://picsum.photos/400/300?random=1']),
      toolId: tools[0].id,
      userId: user1.id,
      likes: 23,
      status: 'approved',
    },
    {
      content: '用了两周，来分享下使用心得。界面简洁，功能强大，特别是批量处理功能，比同类产品快3倍！\n\n缺点是目前只支持英文界面，希望后续能出中文版。',
      images: JSON.stringify(['https://picsum.photos/400/300?random=2', 'https://picsum.photos/400/300?random=3']),
      toolId: tools[0].id,
      userId: user2.id,
      likes: 45,
      status: 'approved',
    },
    {
      content: '刚发现的开源宝藏项目，GitHub上已经10k+ star了。代码质量很高，文档也很完善，适合学习参考。',
      images: null,
      toolId: tools[1]?.id || tools[0].id,
      userId: user1.id,
      likes: 12,
      status: 'approved',
    },
    // 待审核的分享
    {
      content: '这是一条待审核的分享内容...',
      images: null,
      toolId: tools[0].id,
      userId: user2.id,
      likes: 0,
      status: 'pending',
    },
  ]

  for (const share of shares) {
    await prisma.share.create({
      data: share,
    })
  }

  console.log('Created', shares.length, 'shares')

  // 创建测试评论
  const approvedShares = await prisma.share.findMany({
    where: { status: 'approved' },
    take: 2,
  })

  if (approvedShares.length > 0) {
    await prisma.shareComment.create({
      data: {
        content: '确实好用，我也在用！',
        userId: user2.id,
        shareId: approvedShares[0].id,
        likes: 5,
      },
    })

    await prisma.shareComment.create({
      data: {
        content: '感谢分享，马上去试试',
        userId: user1.id,
        shareId: approvedShares[0].id,
        likes: 2,
      },
    })

    console.log('Created comments')
  }

  console.log('Seed completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
