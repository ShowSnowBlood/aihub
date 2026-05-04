// 五行元素类型
export type ElementType = 'gold' | 'wood' | 'water' | 'fire' | 'earth'

// 精灵心情
export type PetMood = 'happy' | 'excited' | 'tired' | 'hungry' | 'sad' | 'bored' | 'angry' | 'curious'

// 互动动作
export type PetAction = 'chat' | 'feed' | 'play' | 'pet'

// 精灵进化阶段
export type EvolutionStage = 'baby' | 'youth' | 'adult'

// 五行精灵定义
export interface PetDefinition {
  id: string
  name: string
  element: ElementType
  description: string
  // 三阶段形态
  stages: {
    baby: PetStage    // 1-9级
    youth: PetStage   // 10-19级
    adult: PetStage   // 20+级
  }
  // 元素特性
  elementTrait: {
    strength: string
    weakness: string
    skill: string
  }
}

// 精灵阶段定义
export interface PetStage {
  name: string
  icon: string
  appearance: string
  color: string
  glowColor: string
  size: 'sm' | 'md' | 'lg'
}

// 用户精灵数据
export interface UserPetData {
  id: string  // UserPet 记录的 ID
  userId: number
  petId: string
  nickname: string | null
  level: number
  exp: number
  intimacy: number
  mood: PetMood
  hunger: number
  energy: number
  isEquipped: boolean
  obtainedAt?: Date
  lastInteractAt?: Date
  // 关联数据
  pet: PetDefinition
  // 计算字段（根据当前等级和阶段）
  icon: string
  name: string
  color: string
  element: ElementType
  description?: string
  rarity?: string
  currentStage: EvolutionStage
  elementTrait?: {
    strength: string
    weakness: string
    skill: string
  }
}

// 12个五行精灵定义
export const PET_DEFINITIONS: PetDefinition[] = [
  // 金系精灵 (3个)
  {
    id: 'gold_lion',
    name: '金铠狮',
    element: 'gold',
    description: '身披金色铠甲的勇猛战士，拥有坚不可摧的防御力',
    stages: {
      baby: {
        name: '小金球',
        icon: '🔸',
        appearance: 'gold_baby',
        color: '#FFD700',
        glowColor: 'rgba(255, 215, 0, 0.6)',
        size: 'sm',
      },
      youth: {
        name: '金甲兽',
        icon: '🦁',
        appearance: 'gold_youth',
        color: '#FFA500',
        glowColor: 'rgba(255, 165, 0, 0.7)',
        size: 'md',
      },
      adult: {
        name: '金铠狮王',
        icon: '👑',
        appearance: 'gold_adult',
        color: '#FFD700',
        glowColor: 'rgba(255, 215, 0, 0.9)',
        size: 'lg',
      },
    },
    elementTrait: {
      strength: '防御坚固，推荐工具准确',
      weakness: '木系',
      skill: '金盾守护：为主人筛选最可靠的AI工具',
    },
  },
  {
    id: 'gold_eagle',
    name: '锐金鹰',
    element: 'gold',
    description: '翱翔天际的锐利猎手，目光如炬洞察一切',
    stages: {
      baby: {
        name: '小金羽',
        icon: '🪶',
        appearance: 'gold_baby',
        color: '#FFD700',
        glowColor: 'rgba(255, 215, 0, 0.6)',
        size: 'sm',
      },
      youth: {
        name: '银翼鹰',
        icon: '🦅',
        appearance: 'gold_youth',
        color: '#C0C0C0',
        glowColor: 'rgba(192, 192, 192, 0.7)',
        size: 'md',
      },
      adult: {
        name: '锐金鹰皇',
        icon: '⚡',
        appearance: 'gold_adult',
        color: '#FFD700',
        glowColor: 'rgba(255, 215, 0, 0.9)',
        size: 'lg',
      },
    },
    elementTrait: {
      strength: '搜索快速，发现隐藏好工具',
      weakness: '木系',
      skill: '鹰眼洞察：快速定位主人需要的工具',
    },
  },
  {
    id: 'gold_dragon',
    name: '金龙皇',
    element: 'gold',
    description: '传说中的金系至尊，威严霸气统领四方',
    stages: {
      baby: {
        name: '金鳞苗',
        icon: '🐉',
        appearance: 'gold_baby',
        color: '#FFD700',
        glowColor: 'rgba(255, 215, 0, 0.6)',
        size: 'sm',
      },
      youth: {
        name: '金龙子',
        icon: '🐲',
        appearance: 'gold_youth',
        color: '#FFA500',
        glowColor: 'rgba(255, 165, 0, 0.7)',
        size: 'md',
      },
      adult: {
        name: '至尊金龙',
        icon: '🔱',
        appearance: 'gold_adult',
        color: '#FFD700',
        glowColor: 'rgba(255, 215, 0, 0.9)',
        size: 'lg',
      },
    },
    elementTrait: {
      strength: '全知全能，精通所有AI领域',
      weakness: '木系',
      skill: '龙威天下：为主人提供最专业的建议',
    },
  },

  // 木系精灵 (3个)
  {
    id: 'wood_elf',
    name: '森灵姬',
    element: 'wood',
    description: '森林深处的精灵公主，与自然和谐共生',
    stages: {
      baby: {
        name: '小叶芽',
        icon: '🌱',
        appearance: 'wood_baby',
        color: '#4ADE80',
        glowColor: 'rgba(74, 222, 128, 0.6)',
        size: 'sm',
      },
      youth: {
        name: '花仙子',
        icon: '🧚',
        appearance: 'wood_youth',
        color: '#22C55E',
        glowColor: 'rgba(34, 197, 94, 0.7)',
        size: 'md',
      },
      adult: {
        name: '森灵女王',
        icon: '🌸',
        appearance: 'wood_adult',
        color: '#16A34A',
        glowColor: 'rgba(22, 163, 74, 0.9)',
        size: 'lg',
      },
    },
    elementTrait: {
      strength: '创意无限，擅长推荐创意类工具',
      weakness: '金系',
      skill: '自然之息：激发主人的创意灵感',
    },
  },
  {
    id: 'wood_deer',
    name: '翠灵鹿',
    element: 'wood',
    description: '森林中的祥瑞之兽，带来生机与希望',
    stages: {
      baby: {
        name: '小鹿角',
        icon: '🦌',
        appearance: 'wood_baby',
        color: '#86EFAC',
        glowColor: 'rgba(134, 239, 172, 0.6)',
        size: 'sm',
      },
      youth: {
        name: '青灵鹿',
        icon: '🌿',
        appearance: 'wood_youth',
        color: '#4ADE80',
        glowColor: 'rgba(74, 222, 128, 0.7)',
        size: 'md',
      },
      adult: {
        name: '翠灵神鹿',
        icon: '✨',
        appearance: 'wood_adult',
        color: '#22C55E',
        glowColor: 'rgba(34, 197, 94, 0.9)',
        size: 'lg',
      },
    },
    elementTrait: {
      strength: '治愈温和，推荐适合新手的工具',
      weakness: '金系',
      skill: '生机祝福：帮助主人轻松上手AI工具',
    },
  },
  {
    id: 'wood_tiger',
    name: '青木虎',
    element: 'wood',
    description: '丛林中的王者，勇猛而充满野性',
    stages: {
      baby: {
        name: '小虎崽',
        icon: '🐱',
        appearance: 'wood_baby',
        color: '#65A30D',
        glowColor: 'rgba(101, 163, 13, 0.6)',
        size: 'sm',
      },
      youth: {
        name: '青纹虎',
        icon: '🐯',
        appearance: 'wood_youth',
        color: '#4ADE80',
        glowColor: 'rgba(74, 222, 128, 0.7)',
        size: 'md',
      },
      adult: {
        name: '青木虎王',
        icon: '🌲',
        appearance: 'wood_adult',
        color: '#15803D',
        glowColor: 'rgba(21, 128, 61, 0.9)',
        size: 'lg',
      },
    },
    elementTrait: {
      strength: '力量强大，推荐专业级工具',
      weakness: '金系',
      skill: '虎啸山林：为主人挖掘最强大的工具',
    },
  },

  // 水系精灵 (3个)
  {
    id: 'water_dolphin',
    name: '蓝晶豚',
    element: 'water',
    description: '海洋中的智慧生物，聪明伶俐善解人意',
    stages: {
      baby: {
        name: '小水滴',
        icon: '💧',
        appearance: 'water_baby',
        color: '#60A5FA',
        glowColor: 'rgba(96, 165, 250, 0.6)',
        size: 'sm',
      },
      youth: {
        name: '蓝海豚',
        icon: '🐬',
        appearance: 'water_youth',
        color: '#3B82F6',
        glowColor: 'rgba(59, 130, 246, 0.7)',
        size: 'md',
      },
      adult: {
        name: '蓝晶圣豚',
        icon: '🌊',
        appearance: 'water_adult',
        color: '#2563EB',
        glowColor: 'rgba(37, 99, 235, 0.9)',
        size: 'lg',
      },
    },
    elementTrait: {
      strength: '智慧灵动，擅长学习类工具推荐',
      weakness: '土系',
      skill: '智慧之泉：帮助主人快速学习AI知识',
    },
  },
  {
    id: 'water_jellyfish',
    name: '幻光母',
    element: 'water',
    description: '深海中的梦幻生物，散发着神秘光芒',
    stages: {
      baby: {
        name: '小水母',
        icon: '🎐',
        appearance: 'water_baby',
        color: '#A78BFA',
        glowColor: 'rgba(167, 139, 250, 0.6)',
        size: 'sm',
      },
      youth: {
        name: '幻光母',
        icon: '🔮',
        appearance: 'water_youth',
        color: '#8B5CF6',
        glowColor: 'rgba(139, 92, 246, 0.7)',
        size: 'md',
      },
      adult: {
        name: '深海幻后',
        icon: '💎',
        appearance: 'water_adult',
        color: '#7C3AED',
        glowColor: 'rgba(124, 58, 237, 0.9)',
        size: 'lg',
      },
    },
    elementTrait: {
      strength: '神秘优雅，擅长艺术类工具推荐',
      weakness: '土系',
      skill: '幻光迷梦：为主人带来视觉盛宴',
    },
  },
  {
    id: 'water_dragon',
    name: '玄水龙',
    element: 'water',
    description: '掌控水元素的龙族，威严而深不可测',
    stages: {
      baby: {
        name: '水龙蛋',
        icon: '🥚',
        appearance: 'water_baby',
        color: '#0EA5E9',
        glowColor: 'rgba(14, 165, 233, 0.6)',
        size: 'sm',
      },
      youth: {
        name: '玄水蛟',
        icon: '🐍',
        appearance: 'water_youth',
        color: '#0284C7',
        glowColor: 'rgba(2, 132, 199, 0.7)',
        size: 'md',
      },
      adult: {
        name: '玄水龙王',
        icon: '🌊',
        appearance: 'water_adult',
        color: '#0369A1',
        glowColor: 'rgba(3, 105, 161, 0.9)',
        size: 'lg',
      },
    },
    elementTrait: {
      strength: '深不可测，精通所有技术类工具',
      weakness: '土系',
      skill: '水漫金山：为主人提供全方位技术支持',
    },
  },

  // 火系精灵 (3个)
  {
    id: 'fire_phoenix',
    name: '烈焰凰',
    element: 'fire',
    description: '涅槃重生的不死鸟，热情如火永不熄灭',
    stages: {
      baby: {
        name: '小火苗',
        icon: '🔥',
        appearance: 'fire_baby',
        color: '#F87171',
        glowColor: 'rgba(248, 113, 113, 0.6)',
        size: 'sm',
      },
      youth: {
        name: '火雏鸟',
        icon: '🐦',
        appearance: 'fire_youth',
        color: '#EF4444',
        glowColor: 'rgba(239, 68, 68, 0.7)',
        size: 'md',
      },
      adult: {
        name: '烈焰凤凰',
        icon: '🔥',
        appearance: 'fire_adult',
        color: '#DC2626',
        glowColor: 'rgba(220, 38, 38, 0.9)',
        size: 'lg',
      },
    },
    elementTrait: {
      strength: '热情活力，推荐最新最热工具',
      weakness: '水系',
      skill: '烈焰燎原：为主人带来最前沿AI资讯',
    },
  },
  {
    id: 'fire_fox',
    name: '赤焰狐',
    element: 'fire',
    description: '火焰中诞生的灵狐，狡黠聪慧魅力十足',
    stages: {
      baby: {
        name: '小狐火',
        icon: '🦊',
        appearance: 'fire_baby',
        color: '#FB923C',
        glowColor: 'rgba(251, 146, 60, 0.6)',
        size: 'sm',
      },
      youth: {
        name: '赤焰狐',
        icon: '🔥',
        appearance: 'fire_youth',
        color: '#F97316',
        glowColor: 'rgba(249, 115, 22, 0.7)',
        size: 'md',
      },
      adult: {
        name: '九尾焰狐',
        icon: '✨',
        appearance: 'fire_adult',
        color: '#EA580C',
        glowColor: 'rgba(234, 88, 12, 0.9)',
        size: 'lg',
      },
    },
    elementTrait: {
      strength: '魅力四射，擅长社交类工具推荐',
      weakness: '水系',
      skill: '魅惑之火：让主人的内容更具吸引力',
    },
  },
  {
    id: 'fire_lion',
    name: '炎阳狮',
    element: 'fire',
    description: '太阳化身的热血战士，光明磊落勇往直前',
    stages: {
      baby: {
        name: '小火球',
        icon: '☀️',
        appearance: 'fire_baby',
        color: '#FCD34D',
        glowColor: 'rgba(252, 211, 77, 0.6)',
        size: 'sm',
      },
      youth: {
        name: '炎阳兽',
        icon: '🦁',
        appearance: 'fire_youth',
        color: '#F59E0B',
        glowColor: 'rgba(245, 158, 11, 0.7)',
        size: 'md',
      },
      adult: {
        name: '炎阳狮王',
        icon: '👑',
        appearance: 'fire_adult',
        color: '#D97706',
        glowColor: 'rgba(217, 119, 6, 0.9)',
        size: 'lg',
      },
    },
    elementTrait: {
      strength: '光明正大，推荐高效生产力工具',
      weakness: '水系',
      skill: '烈日当空：让主人的工作效率倍增',
    },
  },

  // 土系精灵 (3个)
  {
    id: 'earth_bear',
    name: '岩甲熊',
    element: 'earth',
    description: '大地守护者，稳重可靠坚如磐石',
    stages: {
      baby: {
        name: '小石仔',
        icon: '🪨',
        appearance: 'earth_baby',
        color: '#A8A29E',
        glowColor: 'rgba(168, 162, 158, 0.6)',
        size: 'sm',
      },
      youth: {
        name: '岩甲熊',
        icon: '🐻',
        appearance: 'earth_youth',
        color: '#78716C',
        glowColor: 'rgba(120, 113, 108, 0.7)',
        size: 'md',
      },
      adult: {
        name: '大地战熊',
        icon: '⛰️',
        appearance: 'earth_adult',
        color: '#57534E',
        glowColor: 'rgba(87, 83, 78, 0.9)',
        size: 'lg',
      },
    },
    elementTrait: {
      strength: '稳重可靠，推荐安全稳定的工具',
      weakness: '木系',
      skill: '大地守护：为主人保驾护航',
    },
  },
  {
    id: 'earth_turtle',
    name: '玄甲龟',
    element: 'earth',
    description: '长寿智慧的象征，沉稳内敛深谋远虑',
    stages: {
      baby: {
        name: '小龟壳',
        icon: '🐢',
        appearance: 'earth_baby',
        color: '#84CC16',
        glowColor: 'rgba(132, 204, 22, 0.6)',
        size: 'sm',
      },
      youth: {
        name: '玄甲龟',
        icon: '🐌',
        appearance: 'earth_youth',
        color: '#65A30D',
        glowColor: 'rgba(101, 163, 13, 0.7)',
        size: 'md',
      },
      adult: {
        name: '千年玄龟',
        icon: '🏔️',
        appearance: 'earth_adult',
        color: '#4D7C0F',
        glowColor: 'rgba(77, 124, 15, 0.9)',
        size: 'lg',
      },
    },
    elementTrait: {
      strength: '智慧深邃，擅长数据分析类工具',
      weakness: '木系',
      skill: '智慧沉淀：为主人提供深度分析',
    },
  },
  {
    id: 'earth_dragon',
    name: '地龙皇',
    element: 'earth',
    description: '大地深处的龙族，掌控山川河流',
    stages: {
      baby: {
        name: '土龙蛋',
        icon: '🥚',
        appearance: 'earth_baby',
        color: '#B45309',
        glowColor: 'rgba(180, 83, 9, 0.6)',
        size: 'sm',
      },
      youth: {
        name: '地龙子',
        icon: '🐉',
        appearance: 'earth_youth',
        color: '#92400E',
        glowColor: 'rgba(146, 64, 14, 0.7)',
        size: 'md',
      },
      adult: {
        name: '地龙皇帝',
        icon: '🌋',
        appearance: 'earth_adult',
        color: '#78350F',
        glowColor: 'rgba(120, 53, 15, 0.9)',
        size: 'lg',
      },
    },
    elementTrait: {
      strength: '包容万物，精通所有类型工具',
      weakness: '木系',
      skill: '大地之力：为主人提供全面支持',
    },
  },
]

// 获取精灵定义
export function getPetDefinition(petId: string): PetDefinition | undefined {
  return PET_DEFINITIONS.find(p => p.id === petId)
}

// 获取进化阶段
export function getEvolutionStage(level: number): EvolutionStage {
  if (level >= 20) return 'adult'
  if (level >= 10) return 'youth'
  return 'baby'
}

// 获取当前阶段信息
export function getCurrentStage(pet: PetDefinition, level: number): PetStage {
  const stage = getEvolutionStage(level)
  return pet.stages[stage]
}
