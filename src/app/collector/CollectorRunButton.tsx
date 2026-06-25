'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Play, RefreshCw } from 'lucide-react'

type CollectorRunButtonProps = {
  sourceSlug?: string
  label?: string
  compact?: boolean
}

export default function CollectorRunButton({ sourceSlug, label = '启动采集', compact = false }: CollectorRunButtonProps) {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function run() {
    setStatus('running')
    setMessage('')
    try {
      const response = await fetch('/api/collector/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceSlug }),
      })
      const data = await response.json()
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error || '启动失败')
      }
      setStatus('success')
      setMessage(data?.message || '已启动')
      if (data?.job?.id) {
        router.push(`/collector/jobs/${encodeURIComponent(data.job.id)}`)
      }
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : '启动失败')
    }
  }

  const isRunning = status === 'running'

  return (
    <div className={compact ? 'flex items-center gap-2' : 'space-y-2'}>
      <button
        type="button"
        onClick={run}
        disabled={isRunning}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-cyan-500/50 bg-cyan-400/10 px-3 text-sm font-medium text-cyan-100 transition-colors hover:border-cyan-300 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isRunning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {isRunning ? '启动中' : label}
      </button>
      {message && (
        <span className={`text-xs ${status === 'error' ? 'text-red-300' : 'text-emerald-300'}`}>
          {message}
        </span>
      )}
    </div>
  )
}
