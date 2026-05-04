'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { 
  MessageSquare, 
  Image, 
  Video, 
  Music, 
  Code, 
  FileText, 
  Search,
  Sparkles,
  Briefcase,
  GraduationCap,
  Github,
  Lock,
  LucideIcon
} from 'lucide-react'

const STORAGE_KEY = 'aihub_category_filter'

// 图标映射
const iconMap: Record<string, LucideIcon> = {
  'MessageSquare': MessageSquare,
  'Image': Image,
  'Video': Video,
  'Music': Music,
  'Code': Code,
  'FileText': FileText,
  'Search': Search,
  'Briefcase': Briefcase,
  'GraduationCap': GraduationCap,
  'Github': Github,
  'Lock': Lock,
  'Sparkles': Sparkles,
}

// 默认图标
const defaultIcon = Sparkles

interface Category {
  id: number
  name: string
  slug: string
  description?: string | null
  icon?: string | null
}

interface CategoryFilterProps {
  categories: Category[]
}

export default function CategoryFilter({ categories }: CategoryFilterProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentCategory = searchParams.get('category') || 'all'
  const currentSource = searchParams.get('source') || 'all'

  // 构建分类列表（包含固定选项和动态分类）
  const buildCategoryList = () => {
    const list = [
      { id: 'all', name: '全部', slug: '', type: 'category', icon: 'Sparkles' },
      { id: 'opensource', name: '开源免费', slug: 'opensource', type: 'source', icon: 'Github' },
      { id: 'closedsource', name: '非开源', slug: 'closedsource', type: 'source', icon: 'Lock' },
    ]

    // 添加动态分类
    categories.forEach((cat) => {
      list.push({
        id: String(cat.id),
        name: cat.name,
        slug: cat.slug,
        type: 'category',
        icon: cat.icon || getDefaultIconForSlug(cat.slug),
      })
    })

    return list
  }

  // 根据 slug 获取默认图标
  const getDefaultIconForSlug = (slug: string): string => {
    const iconMap: Record<string, string> = {
      'chat': 'MessageSquare',
      'image': 'Image',
      'video': 'Video',
      'audio': 'Music',
      'code': 'Code',
      'writing': 'FileText',
      'search': 'Search',
      'office': 'Briefcase',
      'education': 'GraduationCap',
    }
    return iconMap[slug] || 'Sparkles'
  }

  const categoryList = buildCategoryList()

  // 保存分类选择到 localStorage
  const saveFilter = (category: string, source: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ category, source }))
    }
  }

  // 判断当前激活状态
  const isActive = (cat: typeof categoryList[0]) => {
    if (cat.type === 'source') {
      return currentSource === cat.slug
    }
    if (cat.slug === '') {
      return currentCategory === 'all' && currentSource === 'all'
    }
    return currentCategory === cat.slug && currentSource === 'all'
  }

  // 构建链接
  const buildHref = (cat: typeof categoryList[0]) => {
    const params = new URLSearchParams()
    let newCategory = currentCategory
    let newSource = currentSource
    
    if (cat.type === 'source') {
      // 开源/非开源筛选
      params.set('source', cat.slug)
      newSource = cat.slug
      // 保留原有的category参数
      if (currentCategory && currentCategory !== 'all') {
        params.set('category', currentCategory)
      }
    } else if (cat.slug === '') {
      // 全部 - 清除所有筛选和 localStorage，不保存到 localStorage
      newCategory = 'all'
      newSource = 'all'
      // 清除 localStorage 中的分类筛选
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY)
      }
      // 直接返回 /tools，不执行后面的 saveFilter
      return '/tools'
    } else {
      // 普通分类
      params.set('category', cat.slug)
      newCategory = cat.slug
      // 保留原有的source参数
      if (currentSource && currentSource !== 'all') {
        params.set('source', currentSource)
      }
    }
    
    // 保存到 localStorage
    saveFilter(newCategory, newSource)
    
    const queryString = params.toString()
    return queryString ? `/tools?${queryString}` : '/tools'
  }

  return (
    <div className="bg-cyber-card border-b border-cyber-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 py-4 overflow-x-auto scrollbar-hide">
          {categoryList.map((cat) => {
            const Icon = iconMap[cat.icon || 'Sparkles'] || defaultIcon
            const active = isActive(cat)
            // 开源/非开源使用不同的样式
            const isSourceFilter = cat.type === 'source'

            return (
              <Link
                key={cat.id}
                href={buildHref(cat)}
                className={`
                  flex items-center gap-2 px-4 py-2 text-sm font-mono uppercase tracking-wider whitespace-nowrap
                  clip-chamfer-sm transition-all duration-200 border
                  ${active 
                    ? isSourceFilter
                      ? 'bg-neon-green text-cyber-background border-neon-green shadow-neon'
                      : 'bg-neon-cyan text-cyber-background border-neon-cyan shadow-neon-tertiary'
                    : isSourceFilter
                      ? 'bg-cyber-muted/30 text-neon-green border-neon-green/30 hover:border-neon-green hover:shadow-neon'
                      : 'bg-cyber-muted/30 text-cyber-muted-foreground border-cyber-border hover:border-neon-cyan hover:text-neon-cyan'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                {cat.name}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
