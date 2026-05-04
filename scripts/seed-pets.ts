import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// 12个五行精灵定义
const PETS = [
  // 金系精灵 (3个)
  {
    id: 'gold_lion',
    name: '金铠狮',
    element: 'gold',
    rarity: 'A',
    icon: '👑',
    color: '#FFD700',
    description: '身披金色铠甲的勇猛战士，拥有坚不可摧的防御力',
    stageBaby: JSON.stringify({ name: '小金球', icon: '🔸', color: '#FFD700', glowColor: 'rgba(255, 215, 0, 0.6)' }),
    stageYouth: JSON.stringify({ name: '金甲兽', icon: '🦁', color: '#FFA500', glowColor: 'rgba(255, 165, 0, 0.7)' }),
    stageAdult: JSON.stringify({ name: '金铠狮王', icon: '👑', color: '#FFD700', glowColor: 'rgba(255, 215, 0, 0.9)' }),
    elementTrait: JSON.stringify({ strength: '防御坚固，推荐工具准确', weakness: '木系', skill: '金盾守护：为主人筛选最可靠的AI工具' }),
    sortOrder: 1,
  },
  {
    id: 'gold_eagle',
    name: '锐金鹰',
    element: 'gold',
    rarity: 'S',
    icon: '⚡',
    color: '#FFD700',
    description: '翱翔天际的锐利猎手，目光如炬洞察一切',
    stageBaby: JSON.stringify({ name: '小金羽', icon: '🪶', color: '#FFD700', glowColor: 'rgba(255, 215, 0, 0.6)' }),
    stageYouth: JSON.stringify({ name: '银翼鹰', icon: '🦅', color: '#C0C0C0', glowColor: 'rgba(192, 192, 192, 0.7)' }),
    stageAdult: JSON.stringify({ name: '锐金鹰皇', icon: '⚡', color: '#FFD700', glowColor: 'rgba(255, 215, 0, 0.9)' }),
    elementTrait: JSON.stringify({ strength: '搜索快速，发现隐藏好工具', weakness: '木系', skill: '鹰眼洞察：快速定位主人需要的工具' }),
    sortOrder: 2,
  },
  {
    id: 'gold_dragon',
    name: '金龙皇',
    element: 'gold',
    rarity: 'SS',
    icon: '🔱',
    color: '#FFD700',
    description: '传说中的金系至尊，威严霸气统领四方',
    stageBaby: JSON.stringify({ name: '金鳞苗', icon: '🐉', color: '#FFD700', glowColor: 'rgba(255, 215, 0, 0.6)' }),
    stageYouth: JSON.stringify({ name: '金龙子', icon: '🐲', color: '#FFA500', glowColor: 'rgba(255, 165, 0, 0.7)' }),
    stageAdult: JSON.stringify({ name: '至尊金龙', icon: '🔱', color: '#FFD700', glowColor: 'rgba(255, 215, 0, 0.9)' }),
    elementTrait: JSON.stringify({ strength: '全知全能，精通所有AI领域', weakness: '木系', skill: '龙威天下：为主人提供最专业的建议' }),
    sortOrder: 3,
  },

  // 木系精灵 (3个)
  {
    id: 'wood_elf',
    name: '森灵姬',
    element: 'wood',
    rarity: 'A',
    icon: '🌸',
    color: '#4ADE80',
    description: '森林深处的精灵公主，与自然和谐共生',
    stageBaby: JSON.stringify({ name: '小叶芽', icon: '🌱', color: '#4ADE80', glowColor: 'rgba(74, 222, 128, 0.6)' }),
    stageYouth: JSON.stringify({ name: '花仙子', icon: '🧚', color: '#22C55E', glowColor: 'rgba(34, 197, 94, 0.7)' }),
    stageAdult: JSON.stringify({ name: '森灵女王', icon: '🌸', color: '#16A34A', glowColor: 'rgba(22, 163, 74, 0.9)' }),
    elementTrait: JSON.stringify({ strength: '创意无限，擅长推荐创意类工具', weakness: '金系', skill: '自然之息：激发主人的创意灵感' }),
    sortOrder: 4,
  },
  {
    id: 'wood_deer',
    name: '翠灵鹿',
    element: 'wood',
    rarity: 'B',
    icon: '✨',
    color: '#86EFAC',
    description: '森林中的祥瑞之兽，带来生机与希望',
    stageBaby: JSON.stringify({ name: '小鹿角', icon: '🦌', color: '#86EFAC', glowColor: 'rgba(134, 239, 172, 0.6)' }),
    stageYouth: JSON.stringify({ name: '青灵鹿', icon: '🌿', color: '#4ADE80', glowColor: 'rgba(74, 222, 128, 0.7)' }),
    stageAdult: JSON.stringify({ name: '翠灵神鹿', icon: '✨', color: '#22C55E', glowColor: 'rgba(34, 197, 94, 0.9)' }),
    elementTrait: JSON.stringify({ strength: '治愈温和，推荐适合新手的工具', weakness: '金系', skill: '生机祝福：帮助主人轻松上手AI工具' }),
    sortOrder: 5,
  },
  {
    id: 'wood_tiger',
    name: '青木虎',
    element: 'wood',
    rarity: 'S',
    icon: '🌲',
    color: '#65A30D',
    description: '丛林中的王者，勇猛而充满野性',
    stageBaby: JSON.stringify({ name: '小虎崽', icon: '🐱', color: '#65A30D', glowColor: 'rgba(101, 163, 13, 0.6)' }),
    stageYouth: JSON.stringify({ name: '青纹虎', icon: '🐯', color: '#4ADE80', glowColor: 'rgba(74, 222, 128, 0.7)' }),
    stageAdult: JSON.stringify({ name: '青木虎王', icon: '🌲', color: '#15803D', glowColor: 'rgba(21, 128, 61, 0.9)' }),
    elementTrait: JSON.stringify({ strength: '力量强大，推荐专业级工具', weakness: '金系', skill: '虎啸山林：为主人挖掘最强大的工具' }),
    sortOrder: 6,
  },

  // 水系精灵 (3个)
  {
    id: 'water_dolphin',
    name: '蓝晶豚',
    element: 'water',
    rarity: 'A',
    icon: '🌊',
    color: '#60A5FA',
    description: '海洋中的智慧生物，聪明伶俐善解人意',
    stageBaby: JSON.stringify({ name: '小水滴', icon: '💧', color: '#60A5FA', glowColor: 'rgba(96, 165, 250, 0.6)' }),
    stageYouth: JSON.stringify({ name: '蓝海豚', icon: '🐬', color: '#3B82F6', glowColor: 'rgba(59, 130, 246, 0.7)' }),
    stageAdult: JSON.stringify({ name: '蓝晶圣豚', icon: '🌊', color: '#2563EB', glowColor: 'rgba(37, 99, 235, 0.9)' }),
    elementTrait: JSON.stringify({ strength: '智慧灵动，擅长学习类工具推荐', weakness: '土系', skill: '智慧之泉：帮助主人快速学习AI知识' }),
    sortOrder: 7,
  },
  {
    id: 'water_jellyfish',
    name: '幻光母',
    element: 'water',
    rarity: 'B',
    icon: '💎',
    color: '#A78BFA',
    description: '深海中的梦幻生物，散发着神秘光芒',
    stageBaby: JSON.stringify({ name: '小水母', icon: '🎐', color: '#A78BFA', glowColor: 'rgba(167, 139, 250, 0.6)' }),
    stageYouth: JSON.stringify({ name: '幻光母', icon: '🔮', color: '#8B5CF6', glowColor: 'rgba(139, 92, 246, 0.7)' }),
    stageAdult: JSON.stringify({ name: '深海幻后', icon: '💎', color: '#7C3AED', glowColor: 'rgba(124, 58, 237, 0.9)' }),
    elementTrait: JSON.stringify({ strength: '神秘优雅，擅长艺术类工具推荐', weakness: '土系', skill: '幻光迷梦：为主人带来视觉盛宴' }),
    sortOrder: 8,
  },
  {
    id: 'water_dragon',
    name: '玄水龙',
    element: 'water',
    rarity: 'SS',
    icon: '🌊',
    color: '#0EA5E9',
    description: '掌控水元素的龙族，威严而深不可测',
    stageBaby: JSON.stringify({ name: '水龙蛋', icon: '🥚', color: '#0EA5E9', glowColor: 'rgba(14, 165, 233, 0.6)' }),
    stageYouth: JSON.stringify({ name: '玄水蛟', icon: '🐍', color: '#0284C7', glowColor: 'rgba(2, 132, 199, 0.7)' }),
    stageAdult: JSON.stringify({ name: '玄水龙王', icon: '🌊', color: '#0369A1', glowColor: 'rgba(3, 105, 161, 0.9)' }),
    elementTrait: JSON.stringify({ strength: '深不可测，精通所有技术类工具', weakness: '土系', skill: '水漫金山：为主人提供全方位技术支持' }),
    sortOrder: 9,
  },

  // 火系精灵 (3个)
  {
    id: 'fire_phoenix',
    name: '烈焰凰',
    element: 'fire',
    rarity: 'S',
    icon: '🔥',
    color: '#F87171',
    description: '涅槃重生的不死鸟，热情如火永不熄灭',
    stageBaby: JSON.stringify({ name: '小火苗', icon: '🔥', color: '#F87171', glowColor: 'rgba(248, 113, 113, 0.6)' }),
    stageYouth: JSON.stringify({ name: '火雏鸟', icon: '🐦', color: '#EF4444', glowColor: 'rgba(239, 68, 68, 0.7)' }),
    stageAdult: JSON.stringify({ name: '烈焰凤凰', icon: '🔥', color: '#DC2626', glowColor: 'rgba(220, 38, 38, 0.9)' }),
    elementTrait: JSON.stringify({ strength: '热情活力，推荐最新最热工具', weakness: '水系', skill: '烈焰燎原：为主人带来最前沿AI资讯' }),
    sortOrder: 10,
  },
  {
    id: 'fire_fox',
    name: '赤焰狐',
    element: 'fire',
    rarity: 'A',
    icon: '✨',
    color: '#FB923C',
    description: '火焰中诞生的灵狐，狡黠聪慧魅力十足',
    stageBaby: JSON.stringify({ name: '小狐火', icon: '🦊', color: '#FB923C', glowColor: 'rgba(251, 146, 60, 0.6)' }),
    stageYouth: JSON.stringify({ name: '赤焰狐', icon: '🔥', color: '#F97316', glowColor: 'rgba(249, 115, 22, 0.7)' }),
    stageAdult: JSON.stringify({ name: '九尾焰狐', icon: '✨', color: '#EA580C', glowColor: 'rgba(234, 88, 12, 0.9)' }),
    elementTrait: JSON.stringify({ strength: '魅力四射，擅长社交类工具推荐', weakness: '水系', skill: '魅惑之火：让主人的内容更具吸引力' }),
    sortOrder: 11,
  },
  {
    id: 'fire_lion',
    name: '炎阳狮',
    element: 'fire',
    rarity: 'A',
    icon: '👑',
    color: '#FCD34D',
    description: '太阳化身的热血战士，光明磊落勇往直前',
    stageBaby: JSON.stringify({ name: '小火球', icon: '☀️', color: '#FCD34D', glowColor: 'rgba(252, 211, 77, 0.6)' }),
    stageYouth: JSON.stringify({ name: '炎阳兽', icon: '🦁', color: '#F59E0B', glowColor: 'rgba(245, 158, 11, 0.7)' }),
    stageAdult: JSON.stringify({ name: '炎阳狮王', icon: '👑', color: '#D97706', glowColor: 'rgba(217, 119, 6, 0.9)' }),
    elementTrait: JSON.stringify({ strength: '光明正大，推荐高效生产力工具', weakness: '水系', skill: '烈日当空：让主人的工作效率倍增' }),
    sortOrder: 12,
  },

  // 土系精灵 (3个)
  {
    id: 'earth_bear',
    name: '岩甲熊',
    element: 'earth',
    rarity: 'B',
    icon: '⛰️',
    color: '#A8A29E',
    description: '大地守护者，稳重可靠坚如磐石',
    stageBaby: JSON.stringify({ name: '小石仔', icon: '🪨', color: '#A8A29E', glowColor: 'rgba(168, 162, 158, 0.6)' }),
    stageYouth: JSON.stringify({ name: '岩甲熊', icon: '🐻', color: '#78716C', glowColor: 'rgba(120, 113, 108, 0.7)' }),
    stageAdult: JSON.stringify({ name: '大地战熊', icon: '⛰️', color: '#57534E', glowColor: 'rgba(87, 83, 78, 0.9)' }),
    elementTrait: JSON.stringify({ strength: '稳重可靠，推荐安全稳定的工具', weakness: '木系', skill: '大地守护：为主人保驾护航' }),
    sortOrder: 13,
  },
  {
    id: 'earth_turtle',
    name: '玄甲龟',
    element: 'earth',
    rarity: 'A',
    icon: '🏔️',
    color: '#84CC16',
    description: '长寿智慧的象征，沉稳内敛深谋远虑',
    stageBaby: JSON.stringify({ name: '小龟壳', icon: '🐢', color: '#84CC16', glowColor: 'rgba(132, 204, 22, 0.6)' }),
    stageYouth: JSON.stringify({ name: '玄甲龟', icon: '🐌', color: '#65A30D', glowColor: 'rgba(101, 163, 13, 0.7)' }),
    stageAdult: JSON.stringify({ name: '千年玄龟', icon: '🏔️', color: '#4D7C0F', glowColor: 'rgba(77, 124, 15, 0.9)' }),
    elementTrait: JSON.stringify({ strength: '智慧深邃，擅长数据分析类工具', weakness: '木系', skill: '智慧沉淀：为主人提供深度分析' }),
    sortOrder: 14,
  },
  {
    id: 'earth_dragon',
    name: '地龙皇',
    element: 'earth',
    rarity: 'SS',
    icon: '🌋',
    color: '#B45309',
    description: '大地深处的龙族，掌控山川河流',
    stageBaby: JSON.stringify({ name: '土龙蛋', icon: '🥚', color: '#B45309', glowColor: 'rgba(180, 83, 9, 0.6)' }),
    stageYouth: JSON.stringify({ name: '地龙子', icon: '🐉', color: '#92400E', glowColor: 'rgba(146, 64, 14, 0.7)' }),
    stageAdult: JSON.stringify({ name: '地龙皇帝', icon: '🌋', color: '#78350F', glowColor: 'rgba(120, 53, 15, 0.9)' }),
    elementTrait: JSON.stringify({ strength: '包容万物，精通所有类型工具', weakness: '木系', skill: '大地之力：为主人提供全面支持' }),
    sortOrder: 15,
  },
]

async function main() {
  console.log('开始初始化精灵数据...')

  for (const pet of PETS) {
    await prisma.pet.upsert({
      where: { id: pet.id },
      update: pet,
      create: pet,
    })
    console.log(`✓ ${pet.name} (${pet.element}系)`)
  }

  console.log('\n精灵数据初始化完成！')
  console.log(`共创建 ${PETS.length} 个精灵`)
  console.log('- 金系: 3个')
  console.log('- 木系: 3个')
  console.log('- 水系: 3个')
  console.log('- 火系: 3个')
  console.log('- 土系: 3个')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
