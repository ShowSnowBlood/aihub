import { prisma } from '@/lib/prisma';

async function main() {
  console.log('=== 检查精灵系统数据 ===\n');
  
  // 1. 检查所有精灵
  const pets = await (prisma as any).pet.findMany({
    orderBy: { rarity: 'asc' }
  });
  console.log(`数据库中有 ${pets.length} 个精灵:`);
  pets.forEach((p: any) => {
    console.log(`  - ${p.name} (${p.rarity}) - ${p.icon}`);
  });
  
  // 2. 检查所有用户
  const users = await (prisma as any).user.findMany();
  console.log(`\n数据库中有 ${users.length} 个用户:`);
  users.forEach((u: any) => {
    console.log(`  - ID: ${u.id}, 用户名: ${u.username}`);
  });
  
  // 3. 检查用户精灵关联
  const userPets = await (prisma as any).userPet.findMany({
    include: { pet: true, user: true }
  });
  console.log(`\n用户拥有 ${userPets.length} 个精灵记录:`);
  userPets.forEach((up: any) => {
    console.log(`  - 用户 ${up.user.username} 拥有 ${up.pet.name} (${up.pet.rarity}) - 装备状态: ${up.isEquipped}`);
  });
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
