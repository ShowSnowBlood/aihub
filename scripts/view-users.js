const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.$queryRaw`
    SELECT id, username, email, bio, location, website, role, createdAt, updatedAt 
    FROM users
    ORDER BY id
  `;
  
  console.log('\n========== 用户列表 ==========\n');
  users.forEach(u => {
    console.log(`ID: ${u.id}`);
    console.log(`用户名: ${u.username}`);
    console.log(`邮箱: ${u.email || '无'}`);
    console.log(`简介: ${u.bio || '无'}`);
    console.log(`所在地: ${u.location || '无'}`);
    console.log(`网站: ${u.website || '无'}`);
    console.log(`角色: ${u.role}`);
    console.log(`注册时间: ${new Date(u.createdAt).toLocaleString('zh-CN')}`);
    console.log('------------------------------\n');
  });
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});