// 五行元素类型
export type ElementType = 'gold' | 'wood' | 'water' | 'fire' | 'earth' | 'legendary'

// 精灵稀有度
export type RarityType = 'common' | 'rare' | 'epic' | 'legendary'

// 精灵心情
export type PetMood = 'happy' | 'excited' | 'tired' | 'hungry' | 'sad' | 'bored' | 'angry' | 'curious'

// 互动动作
export type PetAction = 'chat' | 'feed' | 'play' | 'pet'

// 精灵进化阶段
export type EvolutionStage = 'baby' | 'youth' | 'adult'

// 精灵阶段定义
export interface PetStage {
  name: string
  description: string
  // 像素精灵配置
  pixelArt: {
    width: number
    height: number
    // 像素颜色映射 (16-bit风格)
    pixels: string[][]  // 每个像素的颜色代码
    // 动画帧
    frames?: string[][][]
    frameDuration?: number
  }
  // 颜色主题
  colors: {
    primary: string
    secondary: string
    accent: string
    glow: string
  }
  // 光效大小
  glowSize: 'sm' | 'md' | 'lg'
}

// 五行精灵定义
export interface PetDefinition {
  id: string
  name: string
  element: ElementType
  rarity: RarityType
  description: string
  // 获得条件 (传说级需要)
  unlockCondition?: {
    type: 'login_streak' | 'invite_users' | 'submit_tools' | 'reach_level'
    value: number
    description: string
  }
  // 三阶段形态
  stages: {
    baby: PetStage
    youth: PetStage
    adult: PetStage
  }
  // 元素特性
  elementTrait: {
    strength: string
    weakness: string
    skill: string
  }
}

// 用户精灵数据
export interface UserPetData {
  id: string
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
  pet: PetDefinition
  currentStage: EvolutionStage
  chatCount?: number
  feedCount?: number
  playCount?: number
  petCount?: number
}

// ============================================
// 16-bit像素风精灵定义
// ============================================

// 辅助函数：创建像素图案
const createPixelPattern = (pattern: string[]): string[][] => {
  return pattern.map(row => row.split('').map(char => {
    const colorMap: Record<string, string> = {
      '.': 'transparent',
      'B': '#000000',  // 黑色轮廓
      'W': '#FFFFFF',  // 白色
      'G': '#FFD700',  // 金色
      'S': '#C0C0C0',  // 银色
      'R': '#FF4444',  // 红色
      'O': '#FF8800',  // 橙色
      'Y': '#FFDD00',  // 黄色
      'L': '#88FF00',  // 亮绿
      'E': '#44AA00',  // 深绿
      'C': '#00CCFF',  // 青色
      'U': '#0088FF',  // 蓝色
      'P': '#AA00FF',  // 紫色
      'M': '#FF00FF',  // 品红
      'K': '#FF6699',  // 粉色
      'N': '#8B4513',  // 棕色
      'T': '#D2B48C',  // 肤色
      'A': '#AAAAAA',  // 灰色
      'D': '#444444',  // 深灰
    }
    return colorMap[char] || 'transparent'
  }))
}

// ============================================
// 三个传说级精灵 (极度稀有)
// ============================================

const LEGENDARY_PETS: PetDefinition[] = [
  {
    id: 'void_devourer',
    name: '虚空噬星兽',
    element: 'legendary',
    rarity: 'legendary',
    description: '来自宇宙深渊的远古生物，能够吞噬星辰，周身环绕着微型黑洞',
    unlockCondition: {
      type: 'login_streak',
      value: 30,
      description: '连续登录30天'
    },
    stages: {
      baby: {
        name: '虚空幼卵',
        description: '一颗散发着诡异紫黑色光芒的蛋，周围空间微微扭曲',
        pixelArt: {
          width: 16,
          height: 16,
          pixels: createPixelPattern([
            '......BBBBBB......',
            '....BBPPPPPPBB....',
            '...BPPPPPPPPPPB...',
            '..BPPPPUUUPPPPPB..',
            '.BPPPPUUWWUUPPPPB.',
            '.BPPPUUWWWWUUPPPB.',
            'BPPPUUWWBBWWUUPPPB',
            'BPPPUWWBWWBWWUPPB.',
            'BPPPUWWBWWBWWUPPB.',
            'BPPPUUWWBBWWUUPPB.',
            '.BPPPUUWWWWUUPPPB.',
            '.BPPPPUUWWUUPPPPB.',
            '..BPPPPUUUPPPPPB..',
            '...BPPPPPPPPPPB...',
            '....BBPPPPPPBB....',
            '......BBBBBB......',
          ]),
          frameDuration: 500
        },
        colors: {
          primary: '#8B00FF',
          secondary: '#4B0082',
          accent: '#FF00FF',
          glow: 'rgba(139, 0, 255, 0.8)'
        },
        glowSize: 'sm'
      },
      youth: {
        name: '虚空吞噬者',
        description: '破壳而出的虚空生物，开始展现吞噬光线的能力',
        pixelArt: {
          width: 20,
          height: 20,
          pixels: createPixelPattern([
            '......BBBBBBBB......',
            '....BBPPPPPPPPBB....',
            '...BPPPPPUUPPPPPB...',
            '..BPPPPUUWWUUPPPPB..',
            '.BPPPUUWWWWWWUUPPB..',
            '.BPPPUWWBBWWWWUUPB..',
            'BPPPUWWBWWBWWWUUPB..',
            'BPPPUWWBWWBWWWUUPB..',
            'BPPPUUWWBBWWWWUUPB..',
            'BPPPPUUWWWWWWUUPPB..',
            'BPPPPUUWWWWWWUUPPB..',
            '.BPPPPUUWWWWUUPPPB..',
            '.BPPPPPUUWWUUPPPPB..',
            '..BPPPPUUWWUUPPPB...',
            '...BPPPPUUUUPPPPB...',
            '....BBPPPPPPPPBB....',
            '......BBBBBBBB......',
            '....................',
            '....................',
            '....................',
          ])
        },
        colors: {
          primary: '#9400D3',
          secondary: '#4B0082',
          accent: '#FF1493',
          glow: 'rgba(148, 0, 211, 0.9)'
        },
        glowSize: 'md'
      },
      adult: {
        name: '虚空噬星兽·完全体',
        description: '掌控虚空之力的终极形态，所过之处星辰黯淡',
        pixelArt: {
          width: 24,
          height: 24,
          pixels: createPixelPattern([
            '........BBBBBBBBBB........',
            '......BBPPPPPPPPPPBB......',
            '.....BPPPPPUUUUPPPPPB.....',
            '....BPPPPUUWWWWUUPPPPB....',
            '...BPPPUUWWWWWWWWUUPPPB...',
            '..BPPPUUWWBBWWBBWWUUPPB...',
            '..BPPPUWWBWWWWWWBWWUPPB...',
            '.BPPPUUWWBWWBBWWBWWUUPPB..',
            '.BPPPUWWWBWWBBWWWBWWUPPB..',
            'BPPPUUWWWBWWWWWWBWWWUUPPB.',
            'BPPPUUWWWWWWBBWWWWWWUUPPB.',
            'BPPPPUUWWWWWWWWWWWWUUPPPB.',
            'BPPPPUUWWWWWWWWWWWWUUPPPB.',
            'BPPPPUUWWWWWWWWWWWWUUPPPB.',
            '.BPPPPUUWWWWWWWWWWWUUPPPB.',
            '.BPPPPUUWWWWWWWWWWWUUPPPB.',
            '..BPPPPUUWWWWWWWWWUUPPPB..',
            '..BPPPPPUUWWWWWWWUUPPPPB..',
            '...BPPPPPUUWWWWWUUPPPPB...',
            '....BPPPPPUUWWWUUPPPPB....',
            '.....BPPPPPUUUUUPPPPB.....',
            '......BBPPPPPPPPPPBB......',
            '........BBBBBBBBBB........',
            '..........................',
          ])
        },
        colors: {
          primary: '#9932CC',
          secondary: '#8B008B',
          accent: '#FF00FF',
          glow: 'rgba(153, 50, 204, 1)'
        },
        glowSize: 'lg'
      }
    },
    elementTrait: {
      strength: '吞噬一切，无视元素克制',
      weakness: '无',
      skill: '虚空吞噬：吞噬周围所有负面状态，为主人带来好运'
    }
  },
  {
    id: 'chrono_dragon',
    name: '时空龙神',
    element: 'legendary',
    rarity: 'legendary',
    description: '穿梭于时空裂缝中的古老龙族，掌控时间流速',
    unlockCondition: {
      type: 'invite_users',
      value: 10,
      description: '成功邀请10位用户注册'
    },
    stages: {
      baby: {
        name: '时空龙蛋',
        description: '散发着七彩光芒的神秘龙蛋，表面有时钟纹路',
        pixelArt: {
          width: 16,
          height: 16,
          pixels: createPixelPattern([
            '......BBBBBB......',
            '....BBCCCCCCBB....',
            '...BCCCCUUCCCCB...',
            '..BCCCUUWWUUCCCB..',
            '.BCCCUWWBBWWUCCCB.',
            '.BCCUWWBWWBWWUCCB.',
            'BCCCUWWBWWBWWUCCCB',
            'BCCCUUWWBBWWUUCCCB',
            'BCCCUUWWBBWWUUCCCB',
            'BCCCUWWBWWBWWUCCCB',
            '.BCCUWWBWWBWWUCCB.',
            '.BCCCUWWBBWWUCCCB.',
            '..BCCCUUWWUUCCCB..',
            '...BCCCCUUCCCCB...',
            '....BBCCCCCCBB....',
            '......BBBBBB......',
          ])
        },
        colors: {
          primary: '#00CED1',
          secondary: '#20B2AA',
          accent: '#FFD700',
          glow: 'rgba(0, 206, 209, 0.8)'
        },
        glowSize: 'sm'
      },
      youth: {
        name: '时空幼龙',
        description: '刚刚破壳的时空龙，尾巴拖曳着彩虹光痕',
        pixelArt: {
          width: 20,
          height: 20,
          pixels: createPixelPattern([
            '......BBBBBBBB......',
            '....BBCCCCCCCCBB....',
            '...BCCCCUUUUCCCCB...',
            '..BCCCUUWWWWUUCCCB..',
            '.BCCCUWWBBWWWWUCCCB.',
            '.BCCUWWBWWBWWWWUCCB.',
            'BCCCUWWBWWBWWWWUCCCB',
            'BCCCUUWWBBWWWWUUCCCB',
            'BCCCUUWWBBWWWWUUCCCB',
            'BCCCUWWBWWBWWWWUCCCB',
            'BCCCUWWBWWBWWWWUCCCB',
            '.BCCUWWBWWBWWWWUCCB.',
            '.BCCCUWWBBWWWWUCCCB.',
            '..BCCCUUWWWWUUCCCB..',
            '...BCCCCUUUUCCCCB...',
            '....BBCCCCCCCCBB....',
            '......BBBBBBBB......',
            '....................',
            '....................',
            '....................',
          ])
        },
        colors: {
          primary: '#00FFFF',
          secondary: '#00CED1',
          accent: '#FFD700',
          glow: 'rgba(0, 255, 255, 0.9)'
        },
        glowSize: 'md'
      },
      adult: {
        name: '时空龙神·永恒形态',
        description: '掌控时空的终极龙神，翅膀一扇可穿越千年',
        pixelArt: {
          width: 24,
          height: 24,
          pixels: createPixelPattern([
            '........BBBBBBBBBB........',
            '......BBCCCCCCCCCCBB......',
            '.....BCCCCUUUUUUCCCCB.....',
            '....BCCCCUUWWWWUUCCCCB....',
            '...BCCCUUWWWWWWWWUUCCCB...',
            '..BCCCUUWWBBWWBBWWUUCCCB..',
            '..BCCCUWWBWWWWWWBWWUCCCB..',
            '.BCCCUUWWBWWBBWWBWWUUCCCB.',
            '.BCCCUWWWBWWBBWWWBWWUCCCB.',
            'BCCCUUWWWBWWWWWWBWWWUCCCB.',
            'BCCCUUWWWWWWBBWWWWWWUCCCB.',
            'BCCCCUUWWWWWWWWWWWWUUCCCCB',
            'BCCCCUUWWWWWWWWWWWWUUCCCCB',
            'BCCCCUUWWWWWWWWWWWWUUCCCCB',
            '.BCCCCUUWWWWWWWWWWWUCCCCB.',
            '.BCCCCUUWWWWWWWWWWWUCCCCB.',
            '..BCCCCUUWWWWWWWWWUCCCCB..',
            '..BCCCCCUUWWWWWWWUCCCCCB..',
            '...BCCCCCUUWWWWWUCCCCCB...',
            '....BCCCCCUUWWWUCCCCCB....',
            '.....BCCCCCUUUUUCCCCCB....',
            '......BBCCCCCCCCCCBB......',
            '........BBBBBBBBBB........',
            '..........................',
          ])
        },
        colors: {
          primary: '#40E0D0',
          secondary: '#00CED1',
          accent: '#FFD700',
          glow: 'rgba(64, 224, 208, 1)'
        },
        glowSize: 'lg'
      }
    },
    elementTrait: {
      strength: '操控时间，预知未来',
      weakness: '无',
      skill: '时光倒流：每天可让主人重新选择一次AI工具'
    }
  },
  {
    id: 'creator_nuwa',
    name: '创世女娲',
    element: 'legendary',
    rarity: 'legendary',
    description: '远古创世女神，拥有创造万物的神力，周身环绕生命之光',
    unlockCondition: {
      type: 'submit_tools',
      value: 10,
      description: '提交10个工具并被采纳'
    },
    stages: {
      baby: {
        name: '生命火种',
        description: '一团跳动的金色火焰，蕴含着创世之力',
        pixelArt: {
          width: 16,
          height: 16,
          pixels: createPixelPattern([
            '......BBBBBB......',
            '....BBYYYYYYBB....',
            '...BYYYYOOYYYYB...',
            '..BYYYOORROOYYYB..',
            '.BYYYOORRWWOOYYYB.',
            '.BYYOORRWWWWOOYYB.',
            'BYYYORRWWBBWWOOYYB',
            'BYYYORWWBWWBWWYYB.',
            'BYYYORWWBWWBWWYYB.',
            'BYYYORRWWBBWWOOYYB',
            '.BYYOORRWWWWOOYYB.',
            '.BYYYOORRWWOOYYYB.',
            '..BYYYOORROOYYYB..',
            '...BYYYYOOYYYYB...',
            '....BBYYYYYYBB....',
            '......BBBBBB......',
          ])
        },
        colors: {
          primary: '#FFD700',
          secondary: '#FFA500',
          accent: '#FF6347',
          glow: 'rgba(255, 215, 0, 0.8)'
        },
        glowSize: 'sm'
      },
      youth: {
        name: '女娲灵体',
        description: '从火焰中诞生的灵体，开始显现人形轮廓',
        pixelArt: {
          width: 20,
          height: 20,
          pixels: createPixelPattern([
            '......BBBBBBBB......',
            '....BBYYYYYYYYBB....',
            '...BYYYYOOOOYYYYB...',
            '..BYYYYOORROOYYYYB..',
            '.BYYYYOORRWWOOYYYYB.',
            '.BYYYOORRWWWWOOYYYB.',
            'BYYYYORRWWBBWWOOYYYB',
            'BYYYYORWWBWWBWWYYYB.',
            'BYYYYORWWBWWBWWYYYB.',
            'BYYYYORRWWBBWWOOYYYB',
            'BYYYYOORRWWWWOOYYYB.',
            '.BYYYOORRWWWWOOYYYB.',
            '.BYYYYOORRWWOOYYYYB.',
            '..BYYYYOORROOYYYYB..',
            '...BYYYYOOOOYYYYB...',
            '....BBYYYYYYYYBB....',
            '......BBBBBBBB......',
            '....................',
            '....................',
            '....................',
          ])
        },
        colors: {
          primary: '#FFA500',
          secondary: '#FF8C00',
          accent: '#FF4500',
          glow: 'rgba(255, 165, 0, 0.9)'
        },
        glowSize: 'md'
      },
      adult: {
        name: '创世女娲·完全体',
        description: '创世女神的完整形态，手持五彩石，创造生命',
        pixelArt: {
          width: 24,
          height: 24,
          pixels: createPixelPattern([
            '........BBBBBBBBBB........',
            '......BBYYYYYYYYYYBB......',
            '.....BYYYYOOOOOOYYYYB.....',
            '....BYYYYOORROORROOYYYYB..',
            '...BYYYYOORRWWWWWWOOYYYYB.',
            '..BYYYYOORRWWBBWWWWOOYYYB.',
            '..BYYYORRWWBWWWWWWBWWOOYYB',
            '.BYYYYORWWBWWBBWWWWBWWYYYB',
            '.BYYYYORWWBWWBBWWWWBWWYYYB',
            'BYYYYORRWWBWWWWWWWWBWWOOYY',
            'BYYYYORRWWWWWWBBWWWWWWOOYY',
            'BYYYYORRWWWWWWWWWWWWWWOOYY',
            'BYYYYORRWWWWWWWWWWWWWWOOYY',
            'BYYYYORRWWWWWWWWWWWWWWOOYY',
            '.BYYYYORRWWWWWWWWWWWWOOYYB',
            '.BYYYYORRWWWWWWWWWWWWOOYYB',
            '..BYYYYORRWWWWWWWWWWOOYYB.',
            '..BYYYYORRWWWWWWWWWWOOYYB.',
            '...BYYYYORRWWWWWWWWOOYYYB.',
            '....BYYYYORRWWWWWWOOYYYB..',
            '.....BYYYYORROORROOYYYB...',
            '......BBYYYYOOOOYYYYBB....',
            '........BBBBBBBBBB........',
            '..........................',
          ])
        },
        colors: {
          primary: '#FF8C00',
          secondary: '#FF6347',
          accent: '#FFD700',
          glow: 'rgba(255, 140, 0, 1)'
        },
        glowSize: 'lg'
      }
    },
    elementTrait: {
      strength: '创造生命，治愈万物',
      weakness: '无',
      skill: '创世之力：每天为主人创造一次免费使用高级AI工具的机会'
    }
  }
]

// ============================================
// 五行普通精灵 (12个)
// ============================================

const COMMON_PETS: PetDefinition[] = [
  // 金系 (2个普通)
  {
    id: 'gold_knight',
    name: '金甲骑士',
    element: 'gold',
    rarity: 'rare',
    description: '身披金色铠甲的忠诚骑士，守护主人的AI之旅',
    stages: {
      baby: {
        name: '小金块',
        description: '一块闪闪发光的金块，隐约能看出铠甲的形状',
        pixelArt: {
          width: 16,
          height: 16,
          pixels: createPixelPattern([
            '......BBBBBB......',
            '....BBGGGGGGBB....',
            '...BGGGGSSGGGGB...',
            '..BGGGGSWWSGGGGB..',
            '.BGGGGSWWBWSGGGGB.',
            '.BGGGSWWBBWWSGGGB.',
            'BGGGGSWWBBWWSGGGGB',
            'BGGGGSWWBBWWSGGGGB',
            'BGGGGSWWBBWWSGGGGB',
            'BGGGGSWWBBWWSGGGGB',
            '.BGGGSWWBBWWSGGGB.',
            '.BGGGGSWWBWSGGGGB.',
            '..BGGGGSWWSGGGGB..',
            '...BGGGGSSGGGGB...',
            '....BBGGGGGGBB....',
            '......BBBBBB......',
          ])
        },
        colors: {
          primary: '#FFD700',
          secondary: '#DAA520',
          accent: '#B8860B',
          glow: 'rgba(255, 215, 0, 0.6)'
        },
        glowSize: 'sm'
      },
      youth: {
        name: '银甲卫士',
        description: '初具形态的铠甲卫士，手持短剑',
        pixelArt: {
          width: 20,
          height: 20,
          pixels: createPixelPattern([
            '......BBBBBBBB......',
            '....BBGGGGGGGGBB....',
            '...BGGGGSSSSGGGGB...',
            '..BGGGGSWWSWWSGGGGB..',
            '.BGGGGSWWBBWWSGGGGB.',
            '.BGGGSWWBBBBWWSGGGB.',
            'BGGGGSWWBBBBWWSGGGGB',
            'BGGGGSWWBBBBWWSGGGGB',
            'BGGGGSWWBBBBWWSGGGGB',
            'BGGGGSWWBBBBWWSGGGGB',
            'BGGGGSWWBBBBWWSGGGGB',
            '.BGGGSWWBBBBWWSGGGB.',
            '.BGGGGSWWBBWWSGGGGB.',
            '..BGGGGSWWWWGGGGGB..',
            '...BGGGGSSSSGGGGB...',
            '....BBGGGGGGGGBB....',
            '......BBBBBBBB......',
            '....................',
            '....................',
            '....................',
          ])
        },
        colors: {
          primary: '#C0C0C0',
          secondary: '#A9A9A9',
          accent: '#FFD700',
          glow: 'rgba(192, 192, 192, 0.7)'
        },
        glowSize: 'md'
      },
      adult: {
        name: '金甲骑士',
        description: '威风凛凛的金甲骑士，手持圣剑，守护主人',
        pixelArt: {
          width: 24,
          height: 24,
          pixels: createPixelPattern([
            '........BBBBBBBBBB........',
            '......BBGGGGGGGGGGGBB......',
            '.....BGGGGSSSSSSGGGGGB.....',
            '....BGGGGSWWSWWSWWSGGGGB....',
            '...BGGGGSWWBBWWBBWWSGGGGB...',
            '..BGGGGSWWBBBBBBBBWWSGGGGB..',
            '..BGGGSWWBBBBBBBBBBWWSGGGB..',
            '.BGGGGSWWBBBBBBBBBBWWSGGGGB.',
            '.BGGGGSWWBBBBBBBBBBWWSGGGGB.',
            'BGGGGSWWBBBBBBBBBBBBWWSGGGGB',
            'BGGGGSWWBBBBBBBBBBBBWWSGGGGB',
            'BGGGGSWWBBBBBBBBBBBBWWSGGGGB',
            'BGGGGSWWBBBBBBBBBBBBWWSGGGGB',
            'BGGGGSWWBBBBBBBBBBBBWWSGGGGB',
            '.BGGGGSWWBBBBBBBBBBWWSGGGGB.',
            '.BGGGGSWWBBBBBBBBBBWWSGGGGB.',
            '..BGGGSWWBBBBBBBBBBWWSGGGB..',
            '..BGGGGSWWBBBBBBBBWWSGGGGB..',
            '...BGGGGSWWBBBBBBWWSGGGGB...',
            '....BGGGGSWWBBBBWWSGGGGB....',
            '.....BGGGGSSSSSSGGGGGB.....',
            '......BBGGGGGGGGGGGBB......',
            '........BBBBBBBBBB........',
            '..........................',
          ])
        },
        colors: {
          primary: '#FFD700',
          secondary: '#DAA520',
          accent: '#B8860B',
          glow: 'rgba(255, 215, 0, 0.9)'
        },
        glowSize: 'lg'
      }
    },
    elementTrait: {
      strength: '防御坚固，推荐可靠工具',
      weakness: '木系',
      skill: '圣盾守护：为主人筛选最安全的AI工具'
    }
  },
  // ... 其他精灵定义继续
]

// 合并所有精灵定义
export const PET_DEFINITIONS: PetDefinition[] = [
  ...LEGENDARY_PETS,
  ...COMMON_PETS
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

// 获取稀有度颜色
export function getRarityColor(rarity: RarityType): string {
  const colors: Record<RarityType, string> = {
    common: '#9CA3AF',
    rare: '#3B82F6',
    epic: '#8B5CF6',
    legendary: '#FFD700'
  }
  return colors[rarity]
}

// 获取稀有度标签
export function getRarityLabel(rarity: RarityType): string {
  const labels: Record<RarityType, string> = {
    common: '普通',
    rare: '稀有',
    epic: '史诗',
    legendary: '传说'
  }
  return labels[rarity]
}
