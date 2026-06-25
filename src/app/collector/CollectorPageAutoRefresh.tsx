'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

type Props = {
  intervalMs?: number
}

function formatTime(value?: string | null) {
  if (!value) return '等待同步'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '等待同步'
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default function CollectorPageAutoRefresh({ intervalMs = 15000 }: Props) {
  const router = useRouter()
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    let cancelled = false
    const sync = () => {
      if (document.visibilityState !== 'visible') return
      setIsSyncing(true)
      router.refresh()
      window.setTimeout(() => {
        if (!cancelled) {
          setLastSyncAt(new Date().toISOString())
          setIsSyncing(false)
        }
      }, 350)
    }

    const timer = window.setInterval(sync, intervalMs)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [intervalMs, router])

  return (
    <span className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950/50 px-3 text-xs text-zinc-400">
      <RefreshCw className={`h-3.5 w-3.5 text-cyan-300 ${isSyncing ? 'animate-spin' : ''}`} />
      页面数据 {Math.round(intervalMs / 1000)}s 同步 · {formatTime(lastSyncAt)}
    </span>
  )
}
