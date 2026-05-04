'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Flag, AlertCircle, Check } from 'lucide-react'

interface ReportModalProps {
  isOpen: boolean
  onClose: () => void
  type: 'tool' | 'share' | 'comment' | 'share_comment'
  targetId: number
  targetTitle?: string
}

const REPORT_REASONS = [
  { id: '垃圾广告', label: '垃圾广告', desc: '发布垃圾信息、广告推广' },
  { id: '违法违规', label: '违法违规', desc: '涉及违法内容或违反法规' },
  { id: '侵权盗版', label: '侵权盗版', desc: '侵犯他人知识产权' },
  { id: '虚假信息', label: '虚假信息', desc: '内容不实或误导性信息' },
  { id: '恶意攻击', label: '恶意攻击', desc: '人身攻击、辱骂、仇恨言论' },
  { id: '其他问题', label: '其他问题', desc: '其他需要说明的问题' }
]

export default function ReportModal({ isOpen, onClose, type, targetId, targetTitle }: ReportModalProps) {
  const [selectedReason, setSelectedReason] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!isOpen || !mounted) return null

  const handleSubmit = async () => {
    if (!selectedReason) {
      setResult({ success: false, message: '请选择举报原因' })
      return
    }

    setIsSubmitting(true)
    setResult(null)

    try {
      // 获取当前用户（如果已登录）
      const userStr = localStorage.getItem('user')
      const user = userStr ? JSON.parse(userStr) : null

      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          targetId,
          reason: selectedReason,
          description: description.trim() || undefined,
          reporterId: user?.id
        })
      })

      const data = await res.json()

      if (res.ok) {
        setResult({ success: true, message: data.message || '举报提交成功' })
        // 2秒后自动关闭
        setTimeout(() => {
          onClose()
          setResult(null)
          setSelectedReason('')
          setDescription('')
        }, 2000)
      } else {
        setResult({ success: false, message: data.error || '提交失败' })
      }
    } catch (error) {
      setResult({ success: false, message: '网络错误，请稍后重试' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      onClose()
      setResult(null)
      setSelectedReason('')
      setDescription('')
    }
  }

  const typeLabels: Record<string, string> = {
    tool: '工具',
    share: '分享',
    comment: '评论',
    share_comment: '评论'
  }

  return createPortal(
    <div 
      className="fixed inset-0 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      style={{ zIndex: 99999 }}
    >
      <div 
        className="bg-[#12121a] border border-[#2a2a3a] w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 relative"
        style={{ 
          clipPath: 'polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))',
          zIndex: 99999
        }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a3a] bg-gradient-to-r from-[#ff3366]/10 to-transparent">
          <div className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-[#ff3366]" />
            <h3 className="text-lg font-semibold text-[#e0e0e0]">举报{typeLabels[type] || '内容'}</h3>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-2 text-[#4b5563] hover:text-[#e0e0e0] hover:bg-[#2a2a3a] rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6">
          {targetTitle && (
            <p className="text-sm text-[#4b5563] mb-4 line-clamp-2 font-mono">
              <span className="text-[#00d4ff]">{'>'}</span> 举报对象：{targetTitle}
            </p>
          )}

          {result?.success ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 bg-[#00ff88]/10 border border-[#00ff88]/30 rounded-full flex items-center justify-center mb-4">
                <Check className="w-8 h-8 text-[#00ff88]" />
              </div>
              <p className="text-lg font-medium text-[#00ff88] mb-2">{result.message}</p>
              <p className="text-sm text-[#4b5563]">感谢您的反馈，我们会尽快处理</p>
            </div>
          ) : (
            <>
              {/* 举报原因 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-[#e0e0e0] mb-3 font-mono">
                  请选择举报原因 <span className="text-[#ff3366]">*</span>
                </label>
                <div className="space-y-2">
                  {REPORT_REASONS.map((reason) => (
                    <label
                      key={reason.id}
                      className={`flex items-start gap-3 p-3 border cursor-pointer transition-all ${
                        selectedReason === reason.id
                          ? 'border-[#ff3366] bg-[#ff3366]/10'
                          : 'border-[#2a2a3a] hover:border-[#4b5563] hover:bg-[#1a1a24]'
                      }`}
                      style={{ clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))' }}
                    >
                      <input
                        type="radio"
                        name="reason"
                        value={reason.id}
                        checked={selectedReason === reason.id}
                        onChange={(e) => setSelectedReason(e.target.value)}
                        className="mt-0.5 w-4 h-4 text-[#ff3366] border-[#2a2a3a] bg-[#0a0a0f] focus:ring-[#ff3366] focus:ring-offset-0"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-[#e0e0e0]">{reason.label}</div>
                        <div className="text-xs text-[#4b5563]">{reason.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* 详细描述 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-[#e0e0e0] mb-2 font-mono">
                  详细描述（选填）
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="请补充说明举报原因，有助于我们更快处理..."
                  rows={3}
                  maxLength={500}
                  className="w-full px-4 py-3 bg-[#0a0a0f] border border-[#2a2a3a] text-[#e0e0e0] resize-none focus:outline-none focus:border-[#ff3366] focus:shadow-[0_0_10px_#ff336640] transition-all text-sm"
                  style={{ clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))' }}
                />
                <div className="text-right text-xs text-[#4b5563] mt-1 font-mono">
                  {description.length}/500
                </div>
              </div>

              {/* 错误提示 */}
              {result && !result.success && (
                <div className="flex items-center gap-2 p-3 bg-[#ff3366]/10 border border-[#ff3366]/30 text-[#ff3366] text-sm mb-4 font-mono">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {result.message}
                </div>
              )}

              {/* 提交按钮 */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !selectedReason}
                className="w-full py-3 bg-[#ff3366] text-white font-medium hover:bg-[#ff3366]/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 font-mono"
                style={{ clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))' }}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    提交中...
                  </>
                ) : (
                  <>
                    <Flag className="w-4 h-4" />
                    提交举报
                  </>
                )}
              </button>

              <p className="text-center text-xs text-[#4b5563] mt-4 font-mono">
                我们会认真处理每一条举报，恶意举报将被追究责任
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
