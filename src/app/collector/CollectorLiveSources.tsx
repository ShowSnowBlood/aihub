'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowUpRight, Globe2, Layers3, RefreshCw } from 'lucide-react'

type SourceCount = {
  candidates?: number
  runs?: number
  externalSkills?: number
}

type LiveSource = {
  id: number
  name: string
  slug: string
  type: string
  target: string
  url?: string | null
  enabled: boolean
  priority: number
  frequencyMins: number
  lastRunAt?: string | Date | null
  lastSuccessAt?: string | Date | null
  lastStatus?: string | null
  lastError?: string | null
  failCount?: number
  _count?: SourceCount
}

type SourceGroup = {
  target: string
  enabled: boolean
  _count: { _all: number }
}

type SkillSourceGroup = {
  sourceSlug: string
  _count: { _all: number }
}

type CategoryGroup = {
  categoryZh: string | null
  _count: { _all: number }
}

export type CollectorLiveSourcesData = {
  refreshedAt: string
  sources: LiveSource[]
  sourceGroups: SourceGroup[]
  skillSourceGroups: SkillSourceGroup[]
  categoryGroups: CategoryGroup[]
}

type Props = {
  initialData: CollectorLiveSourcesData
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

function trim(value?: string | null, size = 72) {
  if (!value) return ''
  return value.length > size ? `${value.slice(0, size - 3)}...` : value
}

function statusClass(status?: string | null) {
  if (status === 'success') return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
  if (status === 'failed') return 'border-red-400/40 bg-red-400/10 text-red-200'
  if (status === 'running') return 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
  if (status === 'partial') return 'border-amber-400/40 bg-amber-400/10 text-amber-200'
  if (status === 'disabled') return 'border-zinc-600 bg-zinc-900 text-zinc-300'
  return 'border-zinc-700 bg-zinc-900 text-zinc-300'
}

function sourceKind(source: Pick<LiveSource, 'type' | 'slug' | 'url'>) {
  const value = `${source.slug} ${source.type} ${source.url || ''}`.toLowerCase()
  if (value.includes('skills-sh') || value.includes('skills.sh')) return 'skills.sh'
  if (value.includes('github')) return 'GitHub'
  if (value.includes('rss')) return 'AI 资讯'
  if (value.includes('prompt') || value.includes('aishort')) return '提示词'
  return source.type
}

function sourceSummary(sources: LiveSource[]) {
  return {
    total: sources.length,
    aiNews: sources.filter(source => `${source.slug} ${source.type}`.toLowerCase().includes('ai-news') || source.type.includes('RSS')).length,
    prompts: sources.filter(source => `${source.slug} ${source.type} ${source.url || ''}`.toLowerCase().includes('prompt') || `${source.url || ''}`.toLowerCase().includes('aishort')).length,
    skillsSh: sources.filter(source => `${source.slug} ${source.url || ''}`.toLowerCase().includes('skills-sh') || `${source.url || ''}`.toLowerCase().includes('skills.sh')).length,
    github: sources.filter(source => `${source.slug} ${source.type} ${source.url || ''}`.toLowerCase().includes('github')).length,
  }
}

export default function CollectorLiveSources({ initialData }: Props) {
  const [data, setData] = useState(initialData)
  const [error, setError] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const loadingRef = useRef(false)

  async function load() {
    if (loadingRef.current) return
    loadingRef.current = true
    setIsRefreshing(true)
    try {
      const response = await fetch('/api/collector/sources', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || '数据源刷新失败')
      const nextData = payload.data || { sources: payload.sources || [] }
      setData({
        refreshedAt: payload.refreshedAt || new Date().toISOString(),
        sources: nextData.sources || [],
        sourceGroups: nextData.sourceGroups || [],
        skillSourceGroups: nextData.skillSourceGroups || [],
        categoryGroups: nextData.categoryGroups || [],
      })
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '数据源刷新失败')
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

  const summary = useMemo(() => sourceSummary(data.sources), [data.sources])

  return (
    <section className="grid gap-4 2xl:grid-cols-[1.15fr_0.85fr]">
      <Panel title="AI 资讯、提示词、GitHub 与 skills.sh 数据源" icon={Globe2} description="来源状态、入库数量和最近运行时间每 5 秒同步一次。">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-xs">
          <div className="flex items-center gap-2 text-cyan-100">
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>实时同步 · 5 秒</span>
            <span className={error ? 'text-red-300' : 'text-zinc-500'}>
              {error || `已刷新 ${formatDate(data.refreshedAt)}`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded border border-zinc-700 px-2 py-1 text-zinc-300 hover:border-cyan-400 hover:text-cyan-100"
          >
            立即刷新
          </button>
        </div>

        <SourceSummary
          totalCount={summary.total}
          aiNewsCount={summary.aiNews}
          promptCount={summary.prompts}
          skillsShCount={summary.skillsSh}
          githubCount={summary.github}
        />

        <div className="mt-4 max-h-[640px] overflow-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr className="border-b border-zinc-800">
                <th className="py-3 pr-3">来源</th>
                <th className="py-3 pr-3">目标</th>
                <th className="py-3 pr-3">方式</th>
                <th className="py-3 pr-3">状态</th>
                <th className="py-3 pr-3">优先级</th>
                <th className="py-3 pr-3">频率</th>
                <th className="py-3 pr-3">候选</th>
                <th className="py-3 pr-3">原始 Skill</th>
                <th className="py-3 pr-3">运行</th>
                <th className="py-3 pr-3">最近成功</th>
                <th className="py-3 pr-3">最近运行</th>
                <th className="py-3">网站</th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map(source => (
                <tr key={source.id} className="border-b border-zinc-900 align-top">
                  <td className="py-3 pr-3">
                    <div className="font-medium text-zinc-100">{source.name}</div>
                    <div className="text-xs text-zinc-500">{source.slug}</div>
                    {source.lastError && <div className="mt-1 max-w-[320px] truncate text-xs text-red-300">{source.lastError}</div>}
                  </td>
                  <td className="py-3 pr-3 text-zinc-300">{source.target}</td>
                  <td className="py-3 pr-3 text-zinc-400">{sourceKind(source)}</td>
                  <td className="py-3 pr-3"><StatusBadge status={source.enabled ? source.lastStatus : 'disabled'} /></td>
                  <td className="py-3 pr-3 text-zinc-300">{source.priority}</td>
                  <td className="py-3 pr-3 text-zinc-400">{source.frequencyMins} 分钟</td>
                  <td className="py-3 pr-3 text-zinc-300">{formatNumber(source._count?.candidates)}</td>
                  <td className="py-3 pr-3 text-zinc-300">{formatNumber(source._count?.externalSkills)}</td>
                  <td className="py-3 pr-3 text-zinc-300">{formatNumber(source._count?.runs)}</td>
                  <td className="py-3 pr-3 text-zinc-500">{formatDate(source.lastSuccessAt)}</td>
                  <td className="py-3 pr-3 text-zinc-500">{formatDate(source.lastRunAt)}</td>
                  <td className="py-3">
                    {source.url ? (
                      <a className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-100" href={source.url} target="_blank" rel="noreferrer">
                        {trim(source.url, 38)} <ArrowUpRight className="h-3 w-3" />
                      </a>
                    ) : <span className="text-zinc-600">-</span>}
                  </td>
                </tr>
              ))}
              {data.sources.length === 0 && (
                <tr>
                  <td className="py-8 text-sm text-zinc-500" colSpan={12}>还没有启用的数据源。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="来源与分类统计" icon={Layers3} description="这里也跟随来源 API 实时刷新，便于判断覆盖面和分类倾斜。">
        <div className="grid gap-4 md:grid-cols-3 2xl:grid-cols-1">
          <MetricBlock title="目标分布" rows={data.sourceGroups.map(item => ({
            label: `${item.target} ${item.enabled ? '启用' : '停用'}`,
            value: item._count._all,
          }))} />
          <MetricBlock title="Skill 来源" rows={data.skillSourceGroups.map(item => ({
            label: item.sourceSlug,
            value: item._count._all,
          }))} />
          <MetricBlock title="中文分类" rows={data.categoryGroups.map(item => ({
            label: item.categoryZh || '未分类',
            value: item._count._all,
          }))} />
        </div>
      </Panel>
    </section>
  )
}

function Panel({ title, icon: Icon, description, children }: { title: string; icon: any; description?: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">
            <Icon className="h-4 w-4" />
            {title}
          </div>
          {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

function StatusBadge({ status }: { status?: string | null }) {
  return (
    <span className={`inline-flex rounded border px-2 py-1 text-[11px] font-medium ${statusClass(status)}`}>
      {status || 'idle'}
    </span>
  )
}

function SourceSummary({ totalCount, aiNewsCount, promptCount, skillsShCount, githubCount }: { totalCount: number; aiNewsCount: number; promptCount: number; skillsShCount: number; githubCount: number }) {
  const rows = [
    { label: '全部来源', value: totalCount },
    { label: 'AI 资讯', value: aiNewsCount },
    { label: '提示词库', value: promptCount },
    { label: 'skills.sh', value: skillsShCount },
    { label: 'GitHub', value: githubCount },
  ]
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {rows.map(item => (
        <div key={item.label} className="rounded-md border border-zinc-800 bg-[#0b0f14] px-3 py-2">
          <div className="text-xs text-zinc-500">{item.label}</div>
          <div className="mt-1 text-lg font-semibold text-zinc-100">{formatNumber(item.value)}</div>
        </div>
      ))}
    </div>
  )
}

function MetricBlock({ title, rows }: { title: string; rows: Array<{ label: string; value: number }> }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-[#0b0f14] p-3">
      <div className="mb-3 text-sm font-medium text-zinc-100">{title}</div>
      <div className="space-y-2">
        {rows.map(row => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-zinc-400">{row.label}</span>
            <span className="font-mono text-zinc-100">{formatNumber(row.value)}</span>
          </div>
        ))}
        {rows.length === 0 && <div className="text-sm text-zinc-500">暂无数据</div>}
      </div>
    </div>
  )
}
