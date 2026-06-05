'use client'

import { useState, useEffect } from 'react'
import { Plus, Wrench, Sparkles, Code, HelpCircle } from 'lucide-react'
import CreateShareModal from '@/components/CreateShareModalNew'

interface SharePageClientProps {
  mode: 'tool' | 'life' | 'tech' | 'qa'
}

export default function SharePageClient({ mode }: SharePageClientProps) {
  const [showModal, setShowModal] = useState(false)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  function handleToolSubmit() {
    if (!isClient) return
    
    const saved = localStorage.getItem('user')
    if (!saved) {
      window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search)
      return
    }
    
    // 工具圈：跳转到主页的提交工具页面
    window.location.href = '/submit'
  }

  function handleLifeShare() {
    if (!isClient) return
    
    // 生活圈：直接打开发布动态弹窗（弹窗内部会处理登录状态）
    setShowModal(true)
  }

  const isToolMode = mode === 'tool'
  const isLifeMode = mode === 'life'
  const isTechMode = mode === 'tech'
  const isQaMode = mode === 'qa'
  const showPublishModal = isLifeMode || isTechMode || isQaMode

  function getButtonText() {
    if (isToolMode) return <><Wrench className="w-4 h-4" />提交工具</>
    if (isTechMode) return <><Code className="w-4 h-4" />技术分享</>
    if (isQaMode) return <><HelpCircle className="w-4 h-4" />提问</>
    return <><Sparkles className="w-4 h-4" />发布动态</>
  }

  function getButtonStyle() {
    if (isToolMode) return 'bg-neon-green text-cyber-background hover:shadow-neon font-bold'
    if (isTechMode) return 'bg-neon-green/80 text-cyber-background hover:shadow-neon font-bold'
    if (isQaMode) return 'bg-neon-magenta/80 text-cyber-background hover:shadow-neon-secondary font-bold'
    return 'bg-neon-cyan text-cyber-background hover:shadow-neon-tertiary font-bold'
  }

  return (
    <>
      <button
        onClick={isToolMode ? handleToolSubmit : handleLifeShare}
        className={`flex items-center gap-2 px-4 py-2.5 clip-chamfer-sm text-sm font-mono uppercase tracking-wider transition-all ${getButtonStyle()}`}
      >
        <Plus className="w-4 h-4" />
        {getButtonText()}
      </button>

      {/* 生活圈/技术分享/问答求助使用弹窗发布 */}
      {showModal && showPublishModal && (
        <CreateShareModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            window.location.href = `/user-share?tab=${mode}`
          }}
          mode={mode}
        />
      )}
    </>
  )
}
