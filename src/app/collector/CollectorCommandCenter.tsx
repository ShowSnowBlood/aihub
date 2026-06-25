'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Activity, AlertTriangle, CheckCircle2, Loader2, Play, RefreshCw, Square, Terminal } from 'lucide-react'

type CollectorCommand = {
  id: string
  label: string
  group: '采集' | '维护' | '诊断'
  description: string
  npmArgs: string[]
}

type CollectorJob = {
  id: string
  commandId: string
  label: string
  group: string
  status: 'running' | 'success' | 'failed' | 'stopped' | 'unknown'
  pid?: number
  platform: string
  command: string
  args: string[]
  displayCommand?: string
  logFile: string
  startedAt: string
  finishedAt?: string
  exitCode?: number | null
  signal?: string | null
  error?: string
}

type Props = {
  initialCommands: CollectorCommand[]
  initialJobs: CollectorJob[]
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusClass(status: CollectorJob['status']) {
  if (status === 'success') return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
  if (status === 'failed') return 'border-red-400/40 bg-red-400/10 text-red-200'
  if (status === 'running') return 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
  if (status === 'stopped') return 'border-amber-400/40 bg-amber-400/10 text-amber-200'
  return 'border-zinc-700 bg-zinc-900 text-zinc-300'
}

export default function CollectorCommandCenter({ initialCommands, initialJobs }: Props) {
  const [commands] = useState(initialCommands)
  const [jobs, setJobs] = useState(initialJobs)
  const [selectedCommand, setSelectedCommand] = useState(initialCommands[0]?.id || '')
  const [selectedJob, setSelectedJob] = useState<CollectorJob | null>(initialJobs[0] || null)
  const [log, setLog] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const selectedSpec = useMemo(
    () => commands.find(command => command.id === selectedCommand),
    [commands, selectedCommand],
  )

  const runningJobs = jobs.filter(job => job.status === 'running')

  async function refreshJobs() {
    const response = await fetch('/api/collector/jobs', { cache: 'no-store' })
    const data = await response.json()
    setJobs(data.jobs || [])
    if (selectedJob) {
      const fresh = (data.jobs || []).find((job: CollectorJob) => job.id === selectedJob.id)
      if (fresh) setSelectedJob(fresh)
    }
  }

  async function startJob(commandId = selectedCommand) {
    if (!commandId) return
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const response = await fetch('/api/collector/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId }),
      })
      const data = await response.json()
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error || '任务启动失败')
      }
      setMessage(`已启动：${data.job.label}`)
      setSelectedJob(data.job)
      window.location.href = `/collector/jobs/${encodeURIComponent(data.job.id)}`
      await refreshJobs()
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : '任务启动失败')
    } finally {
      setBusy(false)
    }
  }

  async function stopJob(jobId: string) {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const response = await fetch('/api/collector/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      })
      const data = await response.json()
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error || '停止失败')
      }
      setMessage(`已发送停止指令：${data.job.label}`)
      await refreshJobs()
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : '停止失败')
    } finally {
      setBusy(false)
    }
  }

  async function openJob(job: CollectorJob) {
    setSelectedJob(job)
    const response = await fetch(`/api/collector/jobs/${encodeURIComponent(job.id)}`, { cache: 'no-store' })
    const data = await response.json()
    if (data?.ok) {
      setSelectedJob(data.job)
      setLog(data.log || '')
    } else {
      setLog(data?.error || '日志读取失败')
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshJobs()
      if (selectedJob?.status === 'running') void openJob(selectedJob)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [selectedJob?.id, selectedJob?.status])

  return (
    <div className="grid gap-4 2xl:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatusBox label="可用指令" value={`${commands.length} 个`} />
          <StatusBox label="运行中" value={`${runningJobs.length} 个`} tone={runningJobs.length > 0 ? 'cyan' : 'zinc'} />
          <StatusBox label="平台" value={jobs[0]?.platform || 'local'} />
        </div>

        <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-100">
            <Terminal className="h-4 w-4 text-cyan-300" />
            指令发送
          </div>
          <select
            value={selectedCommand}
            onChange={event => setSelectedCommand(event.target.value)}
            className="h-10 w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 text-sm text-zinc-100 outline-none focus:border-cyan-400"
          >
            {commands.map(command => (
              <option key={command.id} value={command.id}>
                [{command.group}] {command.label}
              </option>
            ))}
          </select>
          {selectedSpec && (
            <div className="mt-3 rounded-md border border-zinc-800 bg-[#0b0f14] p-3">
              <div className="text-sm text-zinc-200">{selectedSpec.description}</div>
              <div className="mt-2 font-mono text-xs text-zinc-500">npm {selectedSpec.npmArgs.join(' ')}</div>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void startJob()}
              disabled={busy || !selectedCommand}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-cyan-500/50 bg-cyan-400/10 px-3 text-sm font-medium text-cyan-100 hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              发送指令
            </button>
            <button
              type="button"
              onClick={() => void refreshJobs()}
              disabled={busy}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 px-3 text-sm font-medium text-zinc-200 hover:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              刷新状态
            </button>
          </div>
          {(message || error) && (
            <div className={`mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${error ? 'border-red-400/30 bg-red-400/10 text-red-200' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'}`}>
              {error ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{error || message}</span>
            </div>
          )}
        </div>

        <div className="rounded-md border border-zinc-800 bg-zinc-950/50">
          <div className="border-b border-zinc-800 px-3 py-2 text-sm font-medium text-zinc-100">快捷指令</div>
          <div className="grid gap-2 p-3 sm:grid-cols-2">
            {commands.slice(0, 8).map(command => (
              <button
                key={command.id}
                type="button"
                onClick={() => void startJob(command.id)}
                disabled={busy}
                className="flex min-h-[4.5rem] flex-col items-start rounded-md border border-zinc-800 bg-[#0b0f14] p-3 text-left hover:border-cyan-500/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-sm font-medium text-zinc-100">{command.label}</span>
                <span className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{command.description}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
              <Activity className="h-4 w-4 text-cyan-300" />
              最近任务
            </div>
            <span className="text-xs text-zinc-500">日志保存在 .collector-state/jobs</span>
          </div>
          <div className="max-h-[340px] overflow-auto">
            {jobs.map(job => (
              <div key={job.id} className="grid gap-3 border-b border-zinc-900 px-3 py-3 lg:grid-cols-[1fr_auto]">
                <button type="button" onClick={() => void openJob(job)} className="min-w-0 text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-zinc-100">{job.label}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${statusClass(job.status)}`}>{job.status}</span>
                  </div>
                  <div className="mt-1 font-mono text-xs text-zinc-500">{job.displayCommand || `${job.command} ${job.args.join(' ')}`}</div>
                  <div className="mt-1 text-xs text-zinc-600">{formatDate(job.startedAt)} · pid {job.pid || '-'}</div>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void openJob(job)}
                    className="inline-flex h-8 items-center rounded-md border border-zinc-700 px-2 text-xs text-zinc-200 hover:border-cyan-400"
                  >
                    日志
                  </button>
                  <Link
                    href={`/collector/jobs/${encodeURIComponent(job.id)}`}
                    className="inline-flex h-8 items-center rounded-md border border-zinc-700 px-2 text-xs text-zinc-200 hover:border-cyan-400"
                  >
                    详情
                  </Link>
                  {job.status === 'running' && (
                    <button
                      type="button"
                      onClick={() => void stopJob(job.id)}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-red-500/40 px-2 text-xs text-red-200 hover:border-red-300"
                    >
                      <Square className="h-3 w-3" />
                      停止
                    </button>
                  )}
                </div>
              </div>
            ))}
            {jobs.length === 0 && (
              <div className="px-3 py-6 text-sm text-zinc-500">还没有本地任务，发送一个指令后会显示在这里。</div>
            )}
          </div>
        </div>

        <div className="rounded-md border border-zinc-800 bg-[#05070a]">
          <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
            <div className="text-sm font-medium text-zinc-100">{selectedJob ? `${selectedJob.label} 日志` : '任务日志'}</div>
            <div className="text-xs text-zinc-500">{selectedJob?.id || '-'}</div>
          </div>
          <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap p-3 font-mono text-xs leading-5 text-zinc-300">
            {log || '选择一个任务查看日志。'}
          </pre>
        </div>
      </div>
    </div>
  )
}

function StatusBox({ label, value, tone = 'zinc' }: { label: string; value: string; tone?: 'zinc' | 'cyan' }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-[#0b0f14] px-3 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 font-medium ${tone === 'cyan' ? 'text-cyan-200' : 'text-zinc-100'}`}>{value}</div>
    </div>
  )
}
