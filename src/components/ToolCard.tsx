import Link from 'next/link'
import { Star, ExternalLink, Heart, Cpu } from 'lucide-react'
import { formatNumber } from '@/lib/utils'

interface ToolCardProps {
  tool: {
    id: number
    name: string
    slug: string
    shortDesc?: string | null
    description?: string | null
    logoUrl?: string | null
    websiteUrl?: string | null
    category?: { name: string; slug: string } | null
    pricingType: string
    stars: number
    upvotes: number
    tags: string[] | string | null
  }
}

const pricingLabels: Record<string, string> = {
  FREE: '免费',
  FREEMIUM: '免费增值',
  PAID: '付费',
  OPEN_SOURCE: '开源',
  CONTACT: '联系询价',
}

const pricingColors: Record<string, string> = {
  FREE: 'border-neon-green text-neon-green',
  FREEMIUM: 'border-neon-cyan text-neon-cyan',
  PAID: 'border-neon-magenta text-neon-magenta',
  OPEN_SOURCE: 'border-neon-yellow text-neon-yellow',
  CONTACT: 'border-cyber-muted-foreground text-cyber-muted-foreground',
}

// 根据字符串生成霓虹色彩
function stringToNeonColor(str: string): { bg: string; border: string; text: string } {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  
  const neonColors = [
    { bg: 'rgba(0, 255, 136, 0.1)', border: 'rgba(0, 255, 136, 0.3)', text: '#00ff88' },
    { bg: 'rgba(0, 212, 255, 0.1)', border: 'rgba(0, 212, 255, 0.3)', text: '#00d4ff' },
    { bg: 'rgba(255, 0, 255, 0.1)', border: 'rgba(255, 0, 255, 0.3)', text: '#ff00ff' },
    { bg: 'rgba(255, 255, 0, 0.1)', border: 'rgba(255, 255, 0, 0.3)', text: '#ffff00' },
    { bg: 'rgba(255, 51, 102, 0.1)', border: 'rgba(255, 51, 102, 0.3)', text: '#ff3366' },
  ]
  
  return neonColors[Math.abs(hash) % neonColors.length]
}

export default function ToolCard({ tool }: ToolCardProps) {
  // 处理 tags
  const tagsArray = Array.isArray(tool.tags)
    ? tool.tags
    : tool.tags
    ? tool.tags.split(',').map(t => t.trim()).filter(Boolean)
    : []

  const brandColor = stringToNeonColor(tool.name)
  const pricingStyle = pricingColors[tool.pricingType] || pricingColors.CONTACT

  return (
    <Link href={`/tools/${tool.slug}`} className="block group">
      <div className="card-cyber p-5 h-full">
        <div className="flex items-start gap-4">
          {/* Logo - 霓虹风格 */}
          <div 
            className="w-14 h-14 flex items-center justify-center flex-shrink-0 transition-all duration-300 group-hover:scale-105"
            style={{ 
              background: brandColor.bg,
              border: `2px solid ${brandColor.border}`,
              boxShadow: `0 0 10px ${brandColor.border}`,
            }}
          >
            <span 
              className="text-2xl font-orbitron font-black"
              style={{ color: brandColor.text }}
            >
              {tool.name.charAt(0).toUpperCase()}
            </span>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-lg font-orbitron font-bold text-cyber-foreground group-hover:text-neon-green transition-colors line-clamp-1">
                  {tool.name}
                </h3>
                {tool.category && (
                  <span className="text-xs text-cyber-muted-foreground font-mono uppercase tracking-wider">
                    {tool.category.name}
                  </span>
                )}
              </div>
              <span className={`text-xs px-2 py-1 border font-mono uppercase tracking-wider flex-shrink-0 ${pricingStyle}`}>
                {pricingLabels[tool.pricingType]}
              </span>
            </div>

            <p className="text-sm text-cyber-muted-foreground mt-2 line-clamp-2 font-mono">
              {tool.shortDesc || tool.description}
            </p>

            {/* Tags */}
            {tagsArray.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {tagsArray.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 border border-cyber-border text-cyber-muted-foreground transition-colors group-hover:border-neon-green/50 group-hover:text-neon-green/70 font-mono"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Stats */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-cyber-border">
              <div className="flex items-center gap-4 text-sm text-cyber-muted-foreground font-mono">
                {tool.stars > 0 && (
                  <span className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-neon-yellow" />
                    {formatNumber(tool.stars)}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Heart className="w-4 h-4 text-neon-magenta" />
                  {formatNumber(tool.upvotes)}
                </span>
              </div>
              <ExternalLink className="w-4 h-4 text-cyber-muted-foreground group-hover:text-neon-green transition-all duration-300 transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </div>
        </div>
        
        {/* Hover Glow Effect */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-t from-neon-green/5 to-transparent" />
        </div>
      </div>
    </Link>
  )
}
