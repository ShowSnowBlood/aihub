'use client'

import { useState } from 'react'
import { Flag } from 'lucide-react'
import ReportModal from './ReportModal'

interface ReportButtonProps {
  type: 'tool' | 'share' | 'comment' | 'share_comment'
  targetId: number
  targetTitle?: string
  className?: string
}

export default function ReportButton({ type, targetId, targetTitle, className = '' }: ReportButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`flex items-center justify-center gap-2 text-gray-500 hover:text-red-600 py-3 text-sm transition-colors ${className}`}
      >
        <Flag className="w-4 h-4" />
        报告问题
      </button>

      <ReportModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        type={type}
        targetId={targetId}
        targetTitle={targetTitle}
      />
    </>
  )
}
