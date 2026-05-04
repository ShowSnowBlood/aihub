'use client'

import { useState, useEffect } from 'react'
import { Heart, Share2 } from 'lucide-react'
import ShareModal from './ShareModal'

interface ToolActionsProps {
  toolId: number
  toolName: string
  toolUrl: string
  toolDesc?: string
}

export default function ToolActions({ toolId, toolName, toolUrl, toolDesc = '' }: ToolActionsProps) {
  const [isFavorited, setIsFavorited] = useState(false)
  const [isShareOpen, setIsShareOpen] = useState(false)

  // 检查是否已收藏
  useEffect(() => {
    const favorites = JSON.parse(localStorage.getItem('favoriteTools') || '[]')
    setIsFavorited(favorites.includes(toolId))
  }, [toolId])

  // 收藏功能
  const handleFavorite = () => {
    const favorites = JSON.parse(localStorage.getItem('favoriteTools') || '[]')
    
    if (isFavorited) {
      const newFavorites = favorites.filter((id: number) => id !== toolId)
      localStorage.setItem('favoriteTools', JSON.stringify(newFavorites))
      setIsFavorited(false)
    } else {
      favorites.push(toolId)
      localStorage.setItem('favoriteTools', JSON.stringify(favorites))
      setIsFavorited(true)
    }
  }

  return (
    <>
      <button
        onClick={handleFavorite}
        className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-colors ${
          isFavorited
            ? 'bg-red-100 text-red-600 hover:bg-red-200'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        <Heart className={`w-5 h-5 ${isFavorited ? 'fill-current' : ''}`} />
        {isFavorited ? '已收藏' : '收藏'}
      </button>

      <button
        onClick={() => setIsShareOpen(true)}
        className="flex items-center gap-2 bg-gray-100 text-gray-700 px-6 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
      >
        <Share2 className="w-5 h-5" />
        分享
      </button>

      {/* 分享弹窗 */}
      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        toolName={toolName}
        toolUrl={toolUrl}
        toolDesc={toolDesc}
      />
    </>
  )
}
