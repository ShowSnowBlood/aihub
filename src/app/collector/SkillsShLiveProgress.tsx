'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, RefreshCw } from 'lucide-react'
import CollectorRunButton from './CollectorRunButton'

export type SkillsShLiveData = {
  browserSeenCount: number
  publicVisibleTotal: number
  installSignalTotal: number
  targetTotal: number
  skillsShStatsSyncedAt: string | null
  skillsShStatsMode: string
  skillsShBrowserTotal: number
  skillsShTotal: number
  skillsShSearchTotal: number
  skillsShGithubTotal: number
  githubGlobalIndexTotal: number
  skillResourceTotal: number
  linkedExternalSkillTotal: number
  skillsShSearchState: {
    nextQueryIndex: number
    queryCount: number
    processedQueries: number
    collectedCount: number
    rateLimited: boolean
    updatedAt: string | null
    failures: Array<{ query?: string; error?: string }>
  }
  githubSourceState: {
    repoCount: number
    nextRepoIndex: number
    collectedCount: number
  }
  githubIndexState: {
    nextQueryIndex: number
    queryCount: number
  }
  skillsShDaemonStatus: string
  skillsShDaemonNote: string
  skillsShDaemonPid: number | string | null
  skillsShDaemonStartedAt: string | null
  skillsShSourceStatus: string
  browserConfig: {
    stateFile: string
    browserLimit: number
    scrollSteps: number
    delayMs: number
    maxClicks: number
    maxPagesPerRun: number
    rotatePages: boolean
    includeSeen: boolean
  }
  browserRotation: {
    nextUrlIndex: number
    nextUrlIndexUpdatedAt: string | null
    discoveredPageCount: number
    lastRunAt: string | null
    lastRun: {
      url: string | null
      totalParsed: number
      emittedCount: number
      freshCount: number
      replayCount: number
      seenCount: number
      startedAt: string | null
      finishedAt: string | null
    } | null
  }
  browserPages: Array<{
    url: string
    freshCount?: number
    emittedCount?: number
    replayCount?: number
    totalParsed?: number
    seenCount?: number
    lastRunAt?: string
  }>
}

type SkillsShLiveProgressProps = {
  initialData: SkillsShLiveData
}

function trim(value?: string | null, size = 90) {
  if (!value) return ''
  return value.length > size ? `${value.slice(0, size - 3)}...` : value
}

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('zh-CN')
}

function formatDate(value?: Date | string | null) {
  if (!value) return '-'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function percent(value: number, total: number) {
  if (!total) return '0%'
  return `${Math.min(100, (value / total) * 100).toFixed(1)}%`
}

function statusClass(status?: string | null) {
  if (status === 'success') return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
  if (status === 'failed') return 'border-red-400/40 bg-red-400/10 text-red-200'
  if (status === 'running') return 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
  if (status === 'partial') return 'border-amber-400/40 bg-amber-400/10 text-amber-200'
  if (status === 'disabled') return 'border-zinc-600 bg-zinc-900 text-zinc-300'
  return 'border-zinc-700 bg-zinc-900 text-zinc-300'
}

export default function SkillsShLiveProgress({ initialData }: SkillsShLiveProgressProps) {
  const [data, setData] = useState(initialData)
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const loadingRef = useRef(false)
  const skillsShStoredTotal = data.skillsShBrowserTotal + data.skillsShTotal + data.skillsShSearchTotal + data.skillsShGithubTotal
  const publicSkillTarget = data.installSignalTotal || data.targetTotal || data.publicVisibleTotal

  async function load() {
    if (loadingRef.current) return
    loadingRef.current = true
    setIsRefreshing(true)
    try {
      const response = await fetch('/api/collector/skills-sh-live', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || '实时数据刷新失败')
      setData(payload.data)
      setLastRefreshAt(payload.refreshedAt || new Date().toISOString())
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '实时数据刷新失败')
    } finally {
      loadingRef.current = false
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 5000)
    return () => window.clearInterval(timer)
  }, [])

  const refreshLabel = useMemo(() => {
    if (error) return error
    return lastRefreshAt ? `已刷新 ${formatDate(lastRefreshAt)}` : '实时刷新中'
  }, [error, lastRefreshAt])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-xs">
        <div className="flex items-center gap-2 text-cyan-100">
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>实时刷新 · 5 秒</span>
          <span className={error ? 'text-red-300' : 'text-zinc-500'}>{refreshLabel}</span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded border border-zinc-700 px-2 py-1 text-zinc-300 hover:border-cyan-400 hover:text-cyan-100"
        >
          立即刷新
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <ProgressMetric label="断点已见 Skill" value={data.browserSeenCount} total={data.publicVisibleTotal || data.browserSeenCount} note={`本地状态文件 ${data.browserConfig.stateFile}`} />
            <ProgressMetric label="All Time 累计安装" value={data.installSignalTotal} total={publicSkillTarget} note={`skills.sh 当前视图 Skill ${formatNumber(data.publicVisibleTotal)} · ${data.skillsShStatsMode} ${formatDate(data.skillsShStatsSyncedAt)}`} />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <MiniStatus label="已入库，浏览器慢爬" value={formatNumber(data.skillsShBrowserTotal)} />
            <MiniStatus label="已入库，公开页/API" value={formatNumber(data.skillsShTotal)} />
            <MiniStatus label="已入库，搜索扩量" value={formatNumber(data.skillsShSearchTotal)} />
            <MiniStatus label="已入库，GitHub 源扩采" value={formatNumber(data.skillsShGithubTotal)} />
            <MiniStatus label="已同步原技能库" value={formatNumber(data.skillResourceTotal)} />
            <MiniStatus label="已关联外部 Skill" value={formatNumber(data.linkedExternalSkillTotal)} />
            <MiniStatus label="GitHub 源仓库池" value={`${formatNumber(data.githubSourceState.repoCount)} 个`} />
            <MiniStatus label="GitHub 下次索引" value={formatNumber(data.githubSourceState.nextRepoIndex)} />
            <MiniStatus label="GitHub 上轮新增" value={formatNumber(data.githubSourceState.collectedCount)} />
            <MiniStatus label="全网索引已入库" value={formatNumber(data.githubGlobalIndexTotal)} />
            <MiniStatus label="全网索引 Query" value={`${formatNumber(data.githubIndexState.nextQueryIndex)}/${formatNumber(data.githubIndexState.queryCount)}`} />
            <MiniStatus label="skills.sh 当前视图 Skill" value={formatNumber(data.publicVisibleTotal)} />
            <MiniStatus label="All Time 累计安装" value={formatNumber(data.installSignalTotal)} />
            <MiniStatus label="skills.sh 链路入库" value={formatNumber(skillsShStoredTotal)} />
            <MiniStatus label="本地扩采超出当前视图" value={formatNumber(Math.max(0, skillsShStoredTotal - data.publicVisibleTotal))} />
            <MiniStatus label="同步模式" value={data.skillsShStatsMode} />
            <MiniStatus label="常驻采集" value={data.skillsShDaemonStatus} />
            <MiniStatus label="Daemon PID" value={String(data.skillsShDaemonPid || '-')} />
            <MiniStatus label="Daemon 启动" value={formatDate(data.skillsShDaemonStartedAt)} />
          </div>
          <div className="rounded-md border border-zinc-800 bg-[#0b0f14] p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-zinc-100">skills.sh 常驻搜索扩量</div>
                <div className="mt-1 text-xs text-zinc-500">
                  Query {formatNumber(data.skillsShSearchState.nextQueryIndex)}/{formatNumber(data.skillsShSearchState.queryCount)}
                  {' '}· 本轮 {formatNumber(data.skillsShSearchState.collectedCount)}
                  {' '}· 处理 {formatNumber(data.skillsShSearchState.processedQueries)}
                  {' '}· {formatDate(data.skillsShSearchState.updatedAt)}
                </div>
              </div>
              <StatusBadge status={data.skillsShSearchState.rateLimited ? 'partial' : 'running'} />
            </div>
            <div className="grid gap-2 text-xs text-zinc-400 sm:grid-cols-2 lg:grid-cols-4">
              <span>搜索入库 {formatNumber(data.skillsShSearchTotal)}</span>
              <span>已同步 SkillResource {formatNumber(data.skillResourceTotal)}</span>
              <span>外部 Skill 关联 {formatNumber(data.linkedExternalSkillTotal)}</span>
              <span>限流 {data.skillsShSearchState.rateLimited ? '是，自动降速重试' : '否'}</span>
            </div>
            {data.skillsShSearchState.failures.length > 0 && (
              <div className="mt-3 rounded border border-amber-400/20 bg-amber-400/5 p-2 text-xs text-amber-100">
                {data.skillsShSearchState.failures.map((failure, index) => (
                  <div key={`${failure.query || index}-${index}`}>{failure.query || 'query'}: {trim(failure.error || '', 110)}</div>
                ))}
              </div>
            )}
            <div className="mt-3">
              <CollectorRunButton sourceSlug="skills-sh-search-index" label="手动补跑搜索" compact />
            </div>
          </div>
          <div className="rounded-md border border-zinc-800 bg-[#0b0f14] p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-zinc-100">常驻慢爬配置</div>
                <div className="mt-1 text-xs text-zinc-500">{data.skillsShDaemonNote}</div>
              </div>
              <StatusBadge status={data.skillsShSourceStatus} />
            </div>
            <div className="grid gap-2 text-xs text-zinc-400 sm:grid-cols-2 lg:grid-cols-4">
              <span>每轮上限 {formatNumber(data.browserConfig.browserLimit)}</span>
              <span>滚动步数 {formatNumber(data.browserConfig.scrollSteps)}</span>
              <span>滚动延迟 {formatNumber(data.browserConfig.delayMs)} ms</span>
              <span>点击预算 {formatNumber(data.browserConfig.maxClicks)}</span>
              <span>每轮页面 {formatNumber(data.browserConfig.maxPagesPerRun || data.browserRotation.discoveredPageCount)}</span>
              <span>下轮页码 {formatNumber(data.browserRotation.nextUrlIndex + 1)}/{formatNumber(data.browserRotation.discoveredPageCount)}</span>
              <span>轮转 {data.browserConfig.rotatePages ? '开启' : '关闭'}</span>
              <span>重放已见 {data.browserConfig.includeSeen ? '开启' : '关闭'}</span>
            </div>
            {data.browserRotation.lastRun && (
              <div className="mt-3 rounded border border-zinc-800 bg-zinc-950/60 p-2 text-xs text-zinc-400">
                <div className="font-medium text-zinc-200">最近慢爬页：{trim(data.browserRotation.lastRun.url || '-', 78)}</div>
                <div className="mt-1 grid gap-2 sm:grid-cols-4">
                  <span>Parsed {formatNumber(data.browserRotation.lastRun.totalParsed)}</span>
                  <span>Emitted {formatNumber(data.browserRotation.lastRun.emittedCount)}</span>
                  <span>Fresh {formatNumber(data.browserRotation.lastRun.freshCount)}</span>
                  <span>Replay {formatNumber(data.browserRotation.lastRun.replayCount)}</span>
                </div>
              </div>
            )}
            <div className="mt-3">
              <CollectorRunButton sourceSlug="skills-sh-browser-slow" label="手动补跑一轮" compact />
            </div>
          </div>
        </div>
        <div className="max-h-[560px] overflow-auto rounded-md border border-zinc-800">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-zinc-950/70 text-xs text-zinc-500">
              <tr className="border-b border-zinc-800">
                <th className="px-3 py-3">页面</th>
                <th className="px-3 py-3">Fresh</th>
                <th className="px-3 py-3">Emitted</th>
                <th className="px-3 py-3">Replay</th>
                <th className="px-3 py-3">Parsed</th>
                <th className="px-3 py-3">Seen</th>
                <th className="px-3 py-3">最近运行</th>
              </tr>
            </thead>
            <tbody>
              {data.browserPages.map(page => (
                <tr key={page.url} className="border-b border-zinc-900">
                  <td className="px-3 py-3">
                    <a className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-100" href={page.url} target="_blank" rel="noreferrer">
                      {trim(page.url, 56)} <ArrowUpRight className="h-3 w-3" />
                    </a>
                  </td>
                  <td className="px-3 py-3 text-emerald-200">{formatNumber(Number(page.freshCount || 0))}</td>
                  <td className="px-3 py-3 text-cyan-200">{formatNumber(Number(page.emittedCount || 0))}</td>
                  <td className="px-3 py-3 text-amber-200">{formatNumber(Number(page.replayCount || 0))}</td>
                  <td className="px-3 py-3 text-zinc-300">{formatNumber(Number(page.totalParsed || 0))}</td>
                  <td className="px-3 py-3 text-zinc-300">{formatNumber(Number(page.seenCount || 0))}</td>
                  <td className="px-3 py-3 text-zinc-500">{formatDate(page.lastRunAt)}</td>
                </tr>
              ))}
              {data.browserPages.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-sm text-zinc-500" colSpan={7}>还没有慢爬 checkpoint，启动一次 skills.sh 慢爬后这里会出现页面进度。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status?: string | null }) {
  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusClass(status)}`}>{status || 'idle'}</span>
}

function ProgressMetric({ label, value, total, note }: { label: string; value: number; total: number; note: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-zinc-100">{label}</div>
          <div className="mt-1 text-xs text-zinc-500">{note}</div>
        </div>
        <div className="text-sm text-cyan-200">{percent(value, total)}</div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full bg-cyan-300 transition-all duration-500" style={{ width: percent(value, total) }} />
      </div>
      <div className="mt-3 text-2xl font-semibold text-white">{formatNumber(value)}</div>
    </div>
  )
}

function MiniStatus({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-[#0b0f14] px-3 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 font-medium text-zinc-100">{value}</div>
    </div>
  )
}
