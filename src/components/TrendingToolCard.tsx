'use client'

import { useState } from 'react'
import Link from 'next/link'
import { TrendingUp, Star, Zap, BarChart3 } from 'lucide-react'
import TrendChart from './TrendChart'

interface Tool {
  id: number
  name: string
  slug: string
  shortDesc?: string
  description?: string
  upvotes: number
  stars: number
  tags?: string
  category?: {
    name: string
  } | null
  trendHistories?: Array<{
    rank: number | null
    upvotes: number
    viewCount: number
    date: string
  }>
}

interface TrendingToolCardProps {
  tool: Tool
  rank: number
  tab: string
}

// 排名样式函数 - 在客户端组件内部定义
function getRankStyle(rank: number): string {
  if (rank === 1) {
    return 'bg-gradient-to-br from-yellow-500/20 to-yellow-600/20 border-yellow-500 text-yellow-400'
  } else if (rank === 2) {
    return 'bg-gradient-to-br from-gray-400/20 to-gray-500/20 border-gray-400 text-gray-300'
  } else if (rank === 3) {
    return 'bg-gradient-to-br from-orange-600/20 to-orange-700/20 border-orange-600 text-orange-400'
  } else {
    return 'bg-cyber-muted border-cyber-border text-cyber-muted-foreground'
  }
}

export default function TrendingToolCard({ tool, rank, tab }: TrendingToolCardProps) {
  const [showChart, setShowChart] = useState(false)

  // 从趋势历史计算变化百分比
  const calcChange = () => {
    if (!tool.trendHistories || tool.trendHistories.length < 2) return null
    const sorted = [...tool.trendHistories].sort((a, b) => a.date.localeCompare(b.date))
    const oldest = sorted[0]
    const newest = sorted[sorted.length - 1]
    if (oldest.upvotes <= 0) return null
    return Math.round(((newest.upvotes - oldest.upvotes) / oldest.upvotes) * 100)
  }
  const changePercent = calcChange()

  const tags = tool.tags ? tool.tags.split(',').slice(0, 3) : []

  return (
    <>
      <div
        className="group relative"
        style={{
          clipPath: 'polygon(0 10px, 10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px))'
        }}
      >
        <div className="bg-cyber-card border border-cyber-border p-5 hover:border-neon-magenta/50 hover:shadow-[0_0_25px_rgba(255,0,255,0.15)] transition-all duration-300 flex items-center gap-5">
          {/* Rank */}
          <div className={`w-14 h-14 flex items-center justify-center flex-shrink-0 font-orbitron font-black text-2xl border-2 ${getRankStyle(rank)}`}
            style={{
              clipPath: 'polygon(0 6px, 6px 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0 calc(100% - 6px))'
            }}
          >
            {rank}
          </div>
          
          {/* Tool Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h3 className="text-lg font-semibold text-cyber-foreground group-hover:text-neon-magenta transition-colors">
                <Link href={`/tools/${tool.slug}`}>
                  {tool.name}
                </Link>
              </h3>
              {tool.category && (
                <span 
                  className="px-2 py-0.5 bg-cyber-muted text-cyber-muted-foreground text-xs font-mono border border-cyber-border"
                  style={{
                    clipPath: 'polygon(0 3px, 3px 0, calc(100% - 3px) 0, 100% 3px, 100% calc(100% - 3px), calc(100% - 3px) 100%, 3px 100%, 0 calc(100% - 3px))'
                  }}
                >
                  {tool.category.name}
                </span>
              )}
              {tab === 'trending' && changePercent !== null && (
                <span 
                  className={`px-2 py-0.5 text-xs font-mono border flex items-center gap-1 ${
                    changePercent >= 0
                      ? 'bg-neon-green/10 text-neon-green border-neon-green/50'
                      : 'bg-neon-red/10 text-neon-red border-neon-red/50'
                  }`}
                  style={{
                    clipPath: 'polygon(0 3px, 3px 0, calc(100% - 3px) 0, 100% 3px, 100% calc(100% - 3px), calc(100% - 3px) 100%, 3px 100%, 0 calc(100% - 3px))'
                  }}
                >
                  <TrendingUp className="w-3 h-3" />
                  {changePercent >= 0 ? '+' : ''}{changePercent}%
                </span>
              )}
              {tab === 'newest' && (
                <span 
                  className="px-2 py-0.5 bg-neon-cyan/10 text-neon-cyan text-xs font-mono border border-neon-cyan/50"
                  style={{
                    clipPath: 'polygon(0 3px, 3px 0, calc(100% - 3px) 0, 100% 3px, 100% calc(100% - 3px), calc(100% - 3px) 100%, 3px 100%, 0 calc(100% - 3px))'
                  }}
                >
                  NEW
                </span>
              )}
              {tab === 'rated' && tool.stars > 50000 && (
                <span 
                  className="px-2 py-0.5 bg-neon-yellow/10 text-neon-yellow text-xs font-mono border border-neon-yellow/50"
                  style={{
                    clipPath: 'polygon(0 3px, 3px 0, calc(100% - 3px) 0, 100% 3px, 100% calc(100% - 3px), calc(100% - 3px) 100%, 3px 100%, 0 calc(100% - 3px))'
                  }}
                >
                  ⭐ 热门
                </span>
              )}
            </div>
            <p className="text-cyber-muted-foreground text-sm mb-3 line-clamp-2">
              {tool.shortDesc || tool.description}
            </p>
            <div className="flex items-center gap-4 text-sm font-mono text-cyber-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Star className="w-4 h-4 text-neon-yellow" />
                {(tool.stars || 0).toLocaleString()}
              </span>
              <span className="flex items-center gap-1">
                <Zap className="w-4 h-4 text-neon-magenta" />
                {(tool.upvotes || 0).toLocaleString()}
              </span>
              {tags.length > 0 && (
                <div className="flex gap-2">
                  {tags.map((tag: string) => (
                    <span 
                      key={tag} 
                      className="text-xs bg-cyber-muted px-2 py-1 text-cyber-muted-foreground border border-cyber-border"
                      style={{
                        clipPath: 'polygon(0 2px, 2px 0, calc(100% - 2px) 0, 100% 2px, 100% calc(100% - 2px), calc(100% - 2px) 100%, 2px 100%, 0 calc(100% - 2px))'
                      }}
                    >
                      {tag.trim()}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex flex-col gap-2 flex-shrink-0">
            <button
              onClick={() => setShowChart(true)}
              className="px-3 py-2 bg-neon-cyan/10 text-neon-cyan border border-neon-cyan font-mono text-xs uppercase tracking-wider hover:bg-neon-cyan hover:text-cyber-background transition-all duration-200 flex items-center gap-1"
            >
              <BarChart3 className="w-3 h-3" />
              趋势
            </button>
            <Link
              href={`/tools/${tool.slug}`}
              className="px-3 py-2 bg-neon-magenta/10 text-neon-magenta border border-neon-magenta font-mono text-xs uppercase tracking-wider hover:bg-neon-magenta hover:text-cyber-background transition-all duration-200 text-center"
            >
              查看
            </Link>
          </div>
        </div>
      </div>

      {/* Trend Chart Modal */}
      {showChart && (
        <TrendChart
          toolId={tool.id}
          toolName={tool.name}
          onClose={() => setShowChart(false)}
        />
      )}
    </>
  )
}
