'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Activity, ArrowUpRight, CheckCircle2, Database, Github, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import type { SkillsShLiveData } from './SkillsShLiveProgress'
import CollectorCommandRunButton from './CollectorCommandRunButton'

type IndexState = {
  nextQueryIndex: number
  queryCount: number
  processedQueries?: number
  collectedCount?: number
  rawFetches?: number
  usedFallback?: boolean
  updatedAt?: string | null
}

type DaemonEvents = {
  cycle: number
  cycleEvent: string
  currentSource: string
  currentSourceEvent: string
  latestFinishedSources: Array<{
    cycle: number
    source: string
    saved: number
    elapsedSeconds: number
  }>
  latestSync: null | {
    scannedExternalSkills: number
    repos: number
    synced: number
    created: number
    updated: number
    linkedExternalSkills: number
  }
}

type OverviewLiveData = SkillsShLiveData & {
  externalSkillTotal?: number
  githubPythonCrawlerTotal: number
  githubCybersecurityTotal: number
  githubPythonCrawlerState: IndexState
  githubCybersecurityState: IndexState
  daemonEvents: DaemonEvents
  recentActivity?: {
    externalCreated5m: number
    externalUpdated5m: number
    externalCreated30m: number
    externalUpdated30m: number
    skillResourceUpdated5m: number
    skillResourceUpdated30m: number
  }
}

type Props = {
  initialData: OverviewLiveData
}

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('zh-CN')
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

function percent(value: number, total: number) {
  if (!total) return 0
  return Math.min(100, (value / total) * 100)
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    'skills-sh-all': 'skills.sh 公开页/API',
    'skills-sh-browser-slow': 'skills.sh 慢速浏览器',
    'skills-sh-search-index': 'skills.sh 搜索扩量',
    'skills-sh-github-sources': 'skills.sh GitHub 源扩采',
    'github-global-skill-index': 'GitHub 全网 Skill 索引',
    'github-python-crawler-skill-index': 'Scrapling 爬虫 Skill',
    'github-cybersecurity-skill-index': 'Shannon 安全 Skill',
  }
  return labels[source] || source || '-'
}

function statusClass(status?: string | null) {
  if (status === 'running') return 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
  if (status === 'success') return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
  if (status === 'failed') return 'border-red-400/40 bg-red-400/10 text-red-200'
  if (status === 'partial') return 'border-amber-400/40 bg-amber-400/10 text-amber-200'
  return 'border-zinc-700 bg-zinc-900 text-zinc-300'
}

export default function CollectorOverviewLivePanel({ initialData }: Props) {
  const [data, setData] = useState(initialData)
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState('')
  const loadingRef = useRef(false)

  async function load() {
    if (loadingRef.current) return
    loadingRef.current = true
    setIsRefreshing(true)
    try {
      const response = await fetch('/api/collector/skills-sh-live', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || '总览实时状态刷新失败')
      setData(payload.data)
      setLastRefreshAt(payload.refreshedAt || new Date().toISOString())
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '总览实时状态刷新失败')
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

  const finishedSources = data.daemonEvents?.latestFinishedSources || []
  const currentSource = data.daemonEvents?.currentSource || ''
  const currentSourceRunning = data.daemonEvents?.currentSourceEvent === 'source-start'
  const groupedExternalSkills = data.skillsShSearchTotal + data.skillsShGithubTotal + data.githubGlobalIndexTotal + data.githubPythonCrawlerTotal + data.githubCybersecurityTotal + data.skillsShTotal + data.skillsShBrowserTotal
  const totalExternalSkills = Number(data.externalSkillTotal || groupedExternalSkills)
  const recentActivity = data.recentActivity || {
    externalCreated5m: 0,
    externalUpdated5m: 0,
    externalCreated30m: 0,
    externalUpdated30m: 0,
    skillResourceUpdated5m: 0,
    skillResourceUpdated30m: 0,
  }

  const sourceRows = useMemo(() => [
    { label: 'skills.sh 搜索扩量', value: data.skillsShSearchTotal, note: `Query ${data.skillsShSearchState.nextQueryIndex}/${data.skillsShSearchState.queryCount}` },
    { label: 'skills.sh GitHub 源扩采', value: data.skillsShGithubTotal, note: `仓库池 ${data.githubSourceState.nextRepoIndex}/${data.githubSourceState.repoCount}` },
    { label: 'GitHub 全网 Skill', value: data.githubGlobalIndexTotal, note: `Query ${data.githubIndexState.nextQueryIndex}/${data.githubIndexState.queryCount}` },
    { label: 'Scrapling 爬虫 Skill', value: data.githubPythonCrawlerTotal, note: `Query ${data.githubPythonCrawlerState.nextQueryIndex}/${data.githubPythonCrawlerState.queryCount}` },
    { label: 'Shannon 安全 Skill', value: data.githubCybersecurityTotal, note: `Query ${data.githubCybersecurityState.nextQueryIndex}/${data.githubCybersecurityState.queryCount}` },
    { label: 'skills.sh 慢爬/公开页', value: data.skillsShBrowserTotal + data.skillsShTotal, note: `Seen ${formatNumber(data.browserSeenCount)}` },
  ], [data])

  return (
    <section className="grid gap-4 2xl:grid-cols-[1.05fr_0.95fr]">
      <div className="rounded-md border border-zinc-800 bg-[#10161d]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-300" />
            <div>
              <div className="font-medium text-zinc-100">实时采集驾驶舱</div>
              <div className="mt-0.5 text-xs text-zinc-500">GitHub 全网和 skills.sh 常驻同步状态，每 5 秒刷新。</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${statusClass(data.skillsShDaemonStatus)}`}>{data.skillsShDaemonStatus}</span>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-zinc-700 px-2.5 text-xs text-zinc-300 hover:border-cyan-400 hover:text-cyan-100"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-cyan-300 ${isRefreshing ? 'animate-spin' : ''}`} />
              {error || `已刷新 ${formatDate(lastRefreshAt)}`}
            </button>
          </div>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-md border border-zinc-800 bg-[#0b0f14] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-zinc-400">当前常驻任务</div>
                <div className="mt-2 flex items-center gap-2 text-xl font-semibold text-white">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-50" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-300" />
                  </span>
                  第 {formatNumber(data.daemonEvents?.cycle || 0)} 轮
                </div>
                <div className="mt-2 text-sm text-zinc-300">{currentSourceRunning ? '正在采集' : '最近来源'}：{sourceLabel(currentSource)}</div>
                <div className="mt-1 text-xs text-zinc-500">{data.skillsShDaemonNote} · 启动 {formatDate(data.skillsShDaemonStartedAt)}</div>
              </div>
              <Link href="/collector?page=command" className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-700 px-2.5 text-xs text-zinc-300 hover:border-cyan-400 hover:text-cyan-100">
                控制台 <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <MiniMetric icon={Database} label="外部 Skill 入库" value={formatNumber(totalExternalSkills)} />
              <MiniMetric icon={Search} label="skills.sh 当前视图 Skill" value={formatNumber(data.publicVisibleTotal)} />
              <MiniMetric icon={CheckCircle2} label="同步原技能库" value={formatNumber(data.skillResourceTotal)} />
              <MiniMetric icon={Github} label="GitHub 源仓库池" value={`${formatNumber(data.githubSourceState.nextRepoIndex)}/${formatNumber(data.githubSourceState.repoCount)}`} />
              <MiniMetric icon={Search} label="All Time 累计安装" value={formatNumber(data.installSignalTotal)} />
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <MiniMetric icon={Database} label="5 分钟新增 Skill" value={`+${formatNumber(recentActivity.externalCreated5m)}`} />
              <MiniMetric icon={RefreshCw} label="5 分钟更新 Skill" value={formatNumber(recentActivity.externalUpdated5m)} />
              <MiniMetric icon={CheckCircle2} label="5 分钟同步资源" value={formatNumber(recentActivity.skillResourceUpdated5m)} />
              <MiniMetric icon={Database} label="30 分钟新增 Skill" value={`+${formatNumber(recentActivity.externalCreated30m)}`} />
              <MiniMetric icon={RefreshCw} label="30 分钟更新 Skill" value={formatNumber(recentActivity.externalUpdated30m)} />
              <MiniMetric icon={CheckCircle2} label="30 分钟同步资源" value={formatNumber(recentActivity.skillResourceUpdated30m)} />
            </div>

            {data.daemonEvents?.latestSync && (
              <div className="mt-4 rounded-md border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs leading-5 text-emerald-100/90">
                上轮同步：扫描 {formatNumber(data.daemonEvents.latestSync.scannedExternalSkills)} 条，聚合 {formatNumber(data.daemonEvents.latestSync.repos)} 个源仓库，创建 {formatNumber(data.daemonEvents.latestSync.created)} 个，更新 {formatNumber(data.daemonEvents.latestSync.updated)} 个。
              </div>
            )}
            <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/50 p-3 text-xs leading-5 text-zinc-500">
              skills.sh 的 All Time 是全站累计安装量，不是唯一 Skill 数。当前视图 Skill 来自 skills.sh 页面 payload 的 totalSkills；本地外部 Skill 入库会包含搜索扩量和 GitHub 源扩采，所以通常会大于当前视图数。
            </div>
          </div>

          <div className="rounded-md border border-zinc-800 bg-[#0b0f14] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-zinc-100">来源入库进度</div>
                <div className="mt-1 text-xs text-zinc-500">只显示 GitHub 与 skills.sh 主链路，便于判断哪条线在增长。</div>
              </div>
              <Link href="/collector?page=sources" className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-100">
                数据源 <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="space-y-2">
              {sourceRows.map(row => (
                <div key={row.label} className="grid gap-2 rounded border border-zinc-800 bg-zinc-950/40 px-3 py-2 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm text-zinc-200">{row.label}</span>
                      <span className="font-mono text-sm text-cyan-200 sm:hidden">{formatNumber(row.value)}</span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">{row.note}</div>
                  </div>
                  <div className="hidden font-mono text-sm text-cyan-200 sm:block">{formatNumber(row.value)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-zinc-800 bg-[#10161d]">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-cyan-300" />
            <div>
              <div className="font-medium text-zinc-100">最近完成来源</div>
              <div className="mt-0.5 text-xs text-zinc-500">从常驻任务日志解析，按完成顺序显示。</div>
            </div>
          </div>
          <CollectorCommandRunButton commandId="skills-sh-daemon" label="确保常驻" compact />
        </div>
        <div className="p-4">
          <div className="space-y-2">
            {finishedSources.slice().reverse().map((source, index) => (
              <div key={`${source.cycle}-${source.source}-${index}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded border border-zinc-800 bg-[#0b0f14] px-3 py-2 text-sm">
                <span className="flex h-7 w-7 items-center justify-center rounded bg-zinc-900 text-xs text-zinc-500">{source.cycle}</span>
                <div className="min-w-0">
                  <div className="truncate text-zinc-200">{sourceLabel(source.source)}</div>
                  <div className="text-xs text-zinc-500">耗时 {formatNumber(source.elapsedSeconds)} 秒</div>
                </div>
                <span className="font-mono text-cyan-200">+{formatNumber(source.saved)}</span>
              </div>
            ))}
            {finishedSources.length === 0 && (
              <div className="rounded border border-zinc-800 bg-[#0b0f14] px-3 py-8 text-sm text-zinc-500">常驻任务完成第一个来源后，这里会出现最近采集结果。</div>
            )}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ProgressTile label="skills.sh 搜索 Query" value={data.skillsShSearchState.nextQueryIndex} total={data.skillsShSearchState.queryCount} />
            <ProgressTile label="GitHub 全网 Query" value={data.githubIndexState.nextQueryIndex} total={data.githubIndexState.queryCount} />
            <ProgressTile label="Scrapling Query" value={data.githubPythonCrawlerState.nextQueryIndex} total={data.githubPythonCrawlerState.queryCount} />
            <ProgressTile label="Shannon Query" value={data.githubCybersecurityState.nextQueryIndex} total={data.githubCybersecurityState.queryCount} />
          </div>
        </div>
      </div>
    </section>
  )
}

function MiniMetric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-3">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <Icon className="h-3.5 w-3.5 text-zinc-500" />
        {label}
      </div>
      <div className="mt-1 font-mono text-lg font-semibold text-zinc-100">{value}</div>
    </div>
  )
}

function ProgressTile({ label, value, total }: { label: string; value: number; total: number }) {
  const width = percent(value, total)
  return (
    <div className="rounded-md border border-zinc-800 bg-[#0b0f14] p-3">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono text-zinc-200">{formatNumber(value)}/{formatNumber(total)}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full bg-cyan-300" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}
