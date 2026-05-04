'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { FolderGit2, ArrowUpDown, Star, Clock, Zap } from 'lucide-react'

interface Category {
  id: number
  name: string
  slug: string
}

interface OpenSourceFilterProps {
  categories: Category[]
  categoryCountMap: Record<number, number>
  totalCount: number
}

export default function OpenSourceFilter({ categories, categoryCountMap, totalCount }: OpenSourceFilterProps) {
  const searchParams = useSearchParams()
  const lang = searchParams.get('lang')
  const sort = searchParams.get('sort') || ''

  const buildHref = (newLang?: string, newSort?: string) => {
    const params = new URLSearchParams()
    if (newLang) params.set('lang', newLang)
    if (newSort) params.set('sort', newSort)
    const queryString = params.toString()
    return queryString ? `/opensource?${queryString}` : '/opensource'
  }

  return (
    <div className="space-y-6">
      {/* Category Filter - Cyberpunk Style */}
      <div 
        className="bg-cyber-card border border-cyber-border overflow-hidden"
        style={{
          clipPath: 'polygon(0 10px, 10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px))'
        }}
      >
        <div className="px-5 py-4 border-b border-cyber-border bg-cyber-muted/50">
          <h3 className="font-orbitron font-semibold text-cyber-foreground flex items-center gap-2">
            <FolderGit2 className="w-4 h-4 text-neon-green" />
            工具分类
          </h3>
        </div>
        <div className="p-4 space-y-1">
          <Link
            href="/opensource"
            scroll={false}
            className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-all duration-200 font-mono text-sm ${
              !lang 
                ? 'bg-neon-green/10 text-neon-green border border-neon-green/50' 
                : 'text-cyber-muted-foreground hover:text-cyber-foreground hover:bg-cyber-muted'
            }`}
            style={{
              clipPath: !lang ? 'polygon(0 4px, 4px 0, calc(100% - 4px) 0, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0 calc(100% - 4px))' : undefined
            }}
          >
            <span>全部</span>
            <span className="text-xs text-cyber-muted-foreground">{totalCount}</span>
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={buildHref(cat.slug)}
              scroll={false}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-all duration-200 font-mono text-sm ${
                lang === cat.slug 
                  ? 'bg-neon-green/10 text-neon-green border border-neon-green/50' 
                  : 'text-cyber-muted-foreground hover:text-cyber-foreground hover:bg-cyber-muted'
              }`}
              style={{
                clipPath: lang === cat.slug ? 'polygon(0 4px, 4px 0, calc(100% - 4px) 0, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0 calc(100% - 4px))' : undefined
              }}
            >
              <span>{cat.name}</span>
              <span className="text-xs text-cyber-muted-foreground">{categoryCountMap[cat.id] || 0}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Sort - Cyberpunk Style */}
      <div 
        className="bg-cyber-card border border-cyber-border overflow-hidden"
        style={{
          clipPath: 'polygon(0 10px, 10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px))'
        }}
      >
        <div className="px-5 py-4 border-b border-cyber-border bg-cyber-muted/50">
          <h3 className="font-orbitron font-semibold text-cyber-foreground flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-neon-cyan" />
            排序方式
          </h3>
        </div>
        <div className="p-4 space-y-1">
          {[
            { label: 'Star 最多', value: '', icon: Star },
            { label: '最新发布', value: 'newest', icon: Clock },
            { label: '推荐最多', value: 'upvotes', icon: Zap },
          ].map((s) => (
            <Link
              key={s.value}
              href={buildHref(lang || undefined, s.value)}
              scroll={false}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-all duration-200 font-mono text-sm ${
                sort === s.value 
                  ? 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/50' 
                  : 'text-cyber-muted-foreground hover:text-cyber-foreground hover:bg-cyber-muted'
              }`}
              style={{
                clipPath: sort === s.value ? 'polygon(0 4px, 4px 0, calc(100% - 4px) 0, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0 calc(100% - 4px))' : undefined
              }}
            >
              <s.icon className="w-4 h-4" />
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Info Card - Holographic Style */}
      <div 
        className="relative overflow-hidden"
        style={{
          clipPath: 'polygon(0 10px, 10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px))'
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-neon-green/20 via-transparent to-neon-cyan/20" />
        <div className="absolute inset-0 backdrop-blur-sm bg-cyber-card/80" />
        
        {/* Corner accents */}
        <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-neon-green" />
        <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-neon-green" />
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-neon-cyan" />
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-neon-cyan" />
        
        <div className="relative p-5">
          <h4 className="font-orbitron font-semibold text-cyber-foreground mb-2 text-sm">开源精神</h4>
          <p className="text-cyber-muted-foreground text-xs font-mono leading-relaxed">
            {'>'} 开源软件让AI技术更加民主化<br/>
            {'>'} 自由使用、修改和分发<br/>
            {'>'} 社区驱动的持续创新
          </p>
        </div>
      </div>
    </div>
  )
}
