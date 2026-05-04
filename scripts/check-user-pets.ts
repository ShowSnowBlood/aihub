import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await (prisma as any).user.findMany({
    select: { id: true, username: true, email: true }
  });
  
  console.log('用户列表:');
  for (const user of users) {
    console.log(`- ${user.username} (${user.email})`);
    
    const userPets = await (prisma as any).userPet.findMany({
      where: { userId: user.id },
      include: { pet: true }
    });
    
    if (userPets.length > 0) {
      for (const up of userPets) {
        console.log(`  → 精灵: ${up.pet.name} (${up.pet.rarity}) ${up.isEquipped ? '[已装备]' : ''}`);
      }
    } else {
      console.log('  → 没有精灵');
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
