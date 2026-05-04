'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, X } from 'lucide-react'

interface TrendData {
  date: string
  upvotes: number
  viewCount: number
  stars: number
  rank?: number
}

interface TrendChartProps {
  toolId: number
  toolName: string
  onClose: () => void
}

export default function TrendChart({ toolId, toolName, onClose }: TrendChartProps) {
  const [data, setData] = useState<TrendData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isMock, setIsMock] = useState(false)

  useEffect(() => {
    fetchTrendData()
  }, [toolId])

  const fetchTrendData = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/trends?toolId=${toolId}&days=7`)
      const result = await response.json()
      
      if (response.ok) {
        setData(result.data)
        setIsMock(result.isMock || false)
      } else {
        setError(result.error || '获取数据失败')
      }
    } catch (err) {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  // 计算趋势
  const calculateTrend = () => {
    if (data.length < 2) return { direction: 'flat', percentage: 0 }
    
    const first = data[0].upvotes
    const last = data[data.length - 1].upvotes
    const change = last - first
    const percentage = first > 0 ? (change / first) * 100 : 0
    
    return {
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
      percentage: Math.abs(percentage).toFixed(1)
    }
  }

  // 生成 SVG 路径
  const generatePath = () => {
    if (data.length === 0) return ''
    
    const maxUpvotes = Math.max(...data.map(d => d.upvotes))
    const minUpvotes = Math.min(...data.map(d => d.upvotes))
    const range = maxUpvotes - minUpvotes || 1
    
    const width = 400
    const height = 120
    const padding = 10
    
    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * (width - padding * 2) + padding
      const y = height - padding - ((d.upvotes - minUpvotes) / range) * (height - padding * 2)
      return `${x},${y}`
    })
    
    return `M ${points.join(' L ')}`
  }

  // 生成区域填充路径
  const generateAreaPath = () => {
    if (data.length === 0) return ''
    
    const maxUpvotes = Math.max(...data.map(d => d.upvotes))
    const minUpvotes = Math.min(...data.map(d => d.upvotes))
    const range = maxUpvotes - minUpvotes || 1
    
    const width = 400
    const height = 120
    const padding = 10
    
    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * (width - padding * 2) + padding
      const y = height - padding - ((d.upvotes - minUpvotes) / range) * (height - padding * 2)
      return `${x},${y}`
    })
    
    return `M ${points[0]} L ${points.join(' L ')} L ${points[points.length - 1].split(',')[0]},${height} L ${padding},${height} Z`
  }

  const trend = calculateTrend()

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div 
        className="bg-cyber-card border border-cyber-border w-full max-w-lg relative overflow-hidden"
        style={{
          clipPath: 'polygon(0 16px, 16px 0, calc(100% - 16px) 0, 100% 16px, 100% calc(100% - 16px), calc(100% - 16px) 100%, 16px 100%, 0 calc(100% - 16px))'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-cyber-border">
          <div>
            <h3 className="text-lg font-orbitron font-bold text-cyber-foreground">
              {toolName}
            </h3>
            <p className="text-sm text-cyber-muted-foreground font-mono mt-1">
              {'>'} 近7天热度趋势
              {isMock && <span className="text-neon-yellow ml-2">(演示数据)</span>}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-cyber-muted text-cyber-muted-foreground hover:text-cyber-foreground transition-colors"
            style={{
              clipPath: 'polygon(0 4px, 4px 0, calc(100% - 4px) 0, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0 calc(100% - 4px))'
            }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {loading ? (
            <div className="h-40 flex items-center justify-center">
              <div className="animate-pulse text-cyber-muted-foreground font-mono">
                {'>'} 加载中...
              </div>
            </div>
          ) : error ? (
            <div className="h-40 flex items-center justify-center text-red-400 font-mono">
              {'>'} {error}
            </div>
          ) : data.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-cyber-muted-foreground font-mono">
              {'>'} 暂无数据
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="flex items-center gap-6 mb-6">
                <div className="flex items-center gap-2">
                  {trend.direction === 'up' ? (
                    <TrendingUp className="w-5 h-5 text-neon-green" />
                  ) : trend.direction === 'down' ? (
                    <TrendingDown className="w-5 h-5 text-red-400" />
                  ) : (
                    <Minus className="w-5 h-5 text-cyber-muted-foreground" />
                  )}
                  <span className={`font-orbitron font-bold text-lg ${
                    trend.direction === 'up' ? 'text-neon-green' :
                    trend.direction === 'down' ? 'text-red-400' :
                    'text-cyber-muted-foreground'
                  }`}>
                    {trend.direction === 'up' ? '+' : ''}{trend.percentage}%
                  </span>
                </div>
                <div className="text-sm text-cyber-muted-foreground font-mono">
                  当前热度: <span className="text-neon-magenta font-bold">{data[data.length - 1]?.upvotes?.toLocaleString() || 0}</span>
                </div>
              </div>

              {/* Chart */}
              <div className="relative h-32 mb-4">
                <svg 
                  viewBox="0 0 400 120" 
                  className="w-full h-full"
                  preserveAspectRatio="none"
                >
                  {/* Grid lines */}
                  {[0, 1, 2, 3].map(i => (
                    <line
                      key={i}
                      x1="0"
                      y1={30 * i}
                      x2="400"
                      y2={30 * i}
                      stroke="rgba(42, 42, 58, 0.5)"
                      strokeWidth="1"
                    />
                  ))}

                  {/* Area fill */}
                  <path
                    d={generateAreaPath()}
                    fill="url(#gradient)"
                    opacity="0.3"
                  />

                  {/* Line */}
                  <path
                    d={generatePath()}
                    fill="none"
                    stroke={trend.direction === 'up' ? '#00ff88' : trend.direction === 'down' ? '#ff3366' : '#00d4ff'}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Gradient */}
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop 
                        offset="0%" 
                        stopColor={trend.direction === 'up' ? '#00ff88' : trend.direction === 'down' ? '#ff3366' : '#00d4ff'}
                        stopOpacity="0.5"
                      />
                      <stop 
                        offset="100%" 
                        stopColor={trend.direction === 'up' ? '#00ff88' : trend.direction === 'down' ? '#ff3366' : '#00d4ff'}
                        stopOpacity="0"
                      />
                    </linearGradient>
                  </defs>

                  {/* Data points */}
                  {data.map((d, i) => {
                    const maxUpvotes = Math.max(...data.map(d => d.upvotes))
                    const minUpvotes = Math.min(...data.map(d => d.upvotes))
                    const range = maxUpvotes - minUpvotes || 1
                    const x = (i / (data.length - 1)) * 380 + 10
                    const y = 110 - ((d.upvotes - minUpvotes) / range) * 100
                    
                    return (
                      <circle
                        key={i}
                        cx={x}
                        cy={y}
                        r="4"
                        fill="#0a0a0f"
                        stroke={trend.direction === 'up' ? '#00ff88' : trend.direction === 'down' ? '#ff3366' : '#00d4ff'}
                        strokeWidth="2"
                      />
                    )
                  })}
                </svg>
              </div>

              {/* Date labels */}
              <div className="flex justify-between text-xs text-cyber-muted-foreground font-mono">
                {data.filter((_, i) => i % 2 === 0).map((d, i) => (
                  <span key={i}>
                    {d.date.slice(5)}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-cyber-muted/30 border-t border-cyber-border">
          <p className="text-xs text-cyber-muted-foreground font-mono text-center">
            {'>'} 数据每日自动更新 // 热度基于点赞和浏览量计算
          </p>
        </div>
      </div>
    </div>
  )
}
