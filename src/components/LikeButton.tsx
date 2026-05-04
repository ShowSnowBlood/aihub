'use client'

import { useState, useEffect } from 'react'
import { ThumbsUp } from 'lucide-react'

interface LikeButtonProps {
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

export default function LikeButton({ toolId, toolData }: LikeButtonProps) {
  const [isLiked, setIsLiked] = useState(false)

  useEffect(() => {
    // 从 localStorage 读取点赞状态
    const likedTools = JSON.parse(localStorage.getItem('likedTools') || '[]')
    setIsLiked(likedTools.some((t: any) => t.id === toolId))
  }, [toolId])

  const handleLike = () => {
    // 检查登录
    const userStr = localStorage.getItem('user')
    if (!userStr) {
      if (confirm('请先登录后再点赞，是否跳转到登录页面？')) {
        window.location.href = '/login'
      }
      return
    }
    
    const likedTools = JSON.parse(localStorage.getItem('likedTools') || '[]')
    
    if (isLiked) {
      // 取消点赞
      const newLikedTools = likedTools.filter((t: any) => t.id !== toolId)
      localStorage.setItem('likedTools', JSON.stringify(newLikedTools))
      setIsLiked(false)
    } else {
      // 添加点赞 - 存储完整工具信息
      likedTools.push({
        ...toolData,
        likedAt: new Date().toISOString()
      })
      localStorage.setItem('likedTools', JSON.stringify(likedTools))
      setIsLiked(true)
    }
    // 触发自定义事件，通知其他组件 localStorage 已更新
    window.dispatchEvent(new Event('localStorageChange'))
  }

  return (
    <button
      onClick={handleLike}
      className={`flex items-center gap-2 px-6 py-3 font-orbitron font-medium transition-all ${
        isLiked
          ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan hover:bg-neon-cyan/30'
          : 'bg-cyber-muted/30 text-cyber-foreground border border-cyber-border hover:border-neon-cyan hover:text-neon-cyan'
      }`}
      style={{ clipPath: 'polygon(0 6px, 6px 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0 calc(100% - 6px))' }}
    >
      <ThumbsUp className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
      {isLiked ? '已点赞' : '点赞'}
    </button>
  )
}
