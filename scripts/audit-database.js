const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function auditDatabase() {
  console.log('=== 数据库健康度检查 ===\n');
  
  try {
    // 1. 工具统计
    const totalTools = await prisma.tool.count();
    const noDescriptionTools = await prisma.tool.count({
      where: { 
        OR: [
          { description: null }, 
          { description: '' }
        ] 
      }
    });
    const zeroViewsTools = await prisma.tool.count({
      where: { viewCount: 0 }
    });
    
    // 低活跃工具（浏览<5）
    const lowViewsResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count FROM tools WHERE viewCount < 5
    `);
    const lowViewsCount = Number(lowViewsResult[0].count);
    
    console.log('## 工具统计');
    console.log(`- 工具总数: ${totalTools}`);
    console.log(`- 无描述工具数: ${noDescriptionTools}`);
    console.log(`- 零浏览工具数: ${zeroViewsTools}`);
    console.log(`- 低活跃工具数(浏览<5): ${lowViewsCount}\n`);
    
    // 低活跃工具列表
    const lowActivityTools = await prisma.$queryRawUnsafe(`
      SELECT id, name, "viewCount", "createdAt" FROM tools WHERE "viewCount" < 5 ORDER BY "viewCount" ASC LIMIT 20
    `);
    console.log('### 低活跃工具列表 (浏览量<5, 前20个)');
    lowActivityTools.forEach(tool => {
      const date = new Date(tool.createdAt).toISOString().split('T')[0];
      console.log(`- [${tool.id}] ${tool.name} - 浏览: ${tool.viewCount} - 创建: ${date}`);
    });
    console.log('');
    
    // 2. 分享/评论/资讯统计
    const totalShares = await prisma.share.count();
    const totalComments = await prisma.comment.count();
    const totalNews = await prisma.news.count();
    const totalUsers = await prisma.user.count();
    
    console.log('\n## 内容统计');
    console.log(`- 用户总数: ${totalUsers}`);
    console.log(`- 分享总数: ${totalShares}`);
    console.log(`- 评论总数: ${totalComments}`);
    console.log(`- 资讯总数: ${totalNews}\n`);
    
    // 近期活动统计
    const commentsLast7Days = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count FROM comments WHERE "createdAt" > datetime('now', '-7 days')
    `);
    const sharesLast7Days = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count FROM shares WHERE "createdAt" > datetime('now', '-7 days')
    `);
    
    console.log('### 近期活动');
    console.log(`- 近7天新评论: ${Number(commentsLast7Days[0].count)}`);
    console.log(`- 近7天新分享: ${Number(sharesLast7Days[0].count)}\n`);
    
    // AI互动统计
    const aiInteractions = await prisma.aiInteraction.count();
    console.log(`\n## AI互动统计`);
    console.log(`- AI互动总数: ${aiInteractions}\n`);
    
    // 验证码日志统计
    const verificationLogs = await prisma.verificationLog.count();
    console.log(`\n## 验证码日志统计`);
    console.log(`- 验证码日志总数: ${verificationLogs}\n`);
    
  } catch (error) {
    console.error('数据库查询错误:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

auditDatabase();
