'use client'

import { useState, useEffect } from 'react'
import { Bookmark } from 'lucide-react'

interface FavoriteButtonProps {
  toolId: number
  toolData: {
    id: number
    slug: string
    name: string
    description: string | null
    iconUrl: string | null
    websiteUrl: string
    category: string
  }
}

export default function FavoriteButton({ toolId, toolData }: FavoriteButtonProps) {
  const [isFavorited, setIsFavorited] = useState(false)

  useEffect(() => {
    // 从 localStorage 读取收藏状态
    const favorites = JSON.parse(localStorage.getItem('favorites') || '[]')
    setIsFavorited(favorites.some((t: any) => t.id === toolId))
  }, [toolId])

  const handleFavorite = () => {
    const favorites = JSON.parse(localStorage.getItem('favorites') || '[]')
    
    if (isFavorited) {
      // 取消收藏
      const newFavorites = favorites.filter((t: any) => t.id !== toolId)
      localStorage.setItem('favorites', JSON.stringify(newFavorites))
      setIsFavorited(false)
    } else {
      // 添加收藏 - 存储完整工具信息
      favorites.push({
        ...toolData,
        addedAt: new Date().toISOString()
      })
      localStorage.setItem('favorites', JSON.stringify(favorites))
      setIsFavorited(true)
    }
    // 触发自定义事件，通知其他组件 localStorage 已更新
    window.dispatchEvent(new Event('localStorageChange'))
  }

  return (
    <button
      onClick={handleFavorite}
      className={`flex items-center gap-2 px-6 py-3 font-orbitron font-medium transition-all ${
        isFavorited
          ? 'bg-neon-magenta/20 text-neon-magenta border border-neon-magenta hover:bg-neon-magenta/30'
          : 'bg-cyber-muted/30 text-cyber-foreground border border-cyber-border hover:border-neon-magenta hover:text-neon-magenta'
      }`}
      style={{ clipPath: 'polygon(0 6px, 6px 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0 calc(100% - 6px))' }}
    >
      <Bookmark className={`w-5 h-5 ${isFavorited ? 'fill-current' : ''}`} />
      {isFavorited ? '已收藏' : '收藏'}
    </button>
  )
}
