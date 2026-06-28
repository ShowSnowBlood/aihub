'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Database,
  Github,
  Loader2,
  RefreshCw,
  Square,
  Terminal,
} from 'lucide-react'

type JobStatus = 'running' | 'success' | 'failed' | 'stopped' | 'unknown'

type CollectorJob = {
  id: string
  commandId: string
  label: string
  group: string
  status: JobStatus
  pid?: number
  platform: string
  cwd: string
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

type Candidate = {
  id: number
  type: string
  status: string
  title: string
  sourceName?: string | null
  category?: string | null
  score: number
  sourceUrl?: string | null
  createdAt: string
  summaryZh?: string | null
}

type ExternalSkill = {
  id: number
  sourceSlug: string
  name: string
  description?: string | null
  categoryZh?: string | null
  status: string
  qualityScore: number
  heatScore: number
  stars?: number | null
  forks?: number | null
  downloads?: number | null
  sourceUrl?: string | null
  githubUrl?: string | null
  rawData?: string | null
  collectedAt: string
}

type JobInsight = {
  sourceSlug?: string
  source?: any
  runs?: any[]
  candidateGroups?: Array<{ type: string; status: string; _count: { _all: number } }>
  candidates?: Candidate[]
  externalSkillGroups?: Array<{ sourceSlug: string; status: string; _count: { _all: number } }>
  externalSkills?: ExternalSkill[]
}

type JobPayload = {
  ok: boolean
  error?: string
  job?: CollectorJob
  log?: string
  insight?: JobInsight
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
    second: '2-digit',
  })
}

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('zh-CN')
}

function trim(value?: string | null, size = 110) {
  if (!value) return ''
  return value.length > size ? `${value.slice(0, size - 3)}...` : value
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function githubInfoFromSkill(skill: ExternalSkill) {
  const raw = parseJson<Record<string, any>>(skill.rawData, {})
  const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
  const item = raw.item && typeof raw.item === 'object' ? raw.item : {}
  const repo = String(github.repo || raw.repo || raw.source || item.source || '').trim()
  const repoUrl = String(github.repoUrl || raw.repoUrl || (repo ? `https://github.com/${repo}` : '')).trim()
  const stars = Math.max(toNumber(skill.stars), toNumber(github.stars ?? raw.stars))
  const forks = Math.max(toNumber(skill.forks), toNumber(github.forks ?? raw.forks))
  const downloads = Math.max(toNumber(skill.downloads), toNumber(github.releaseDownloads), toNumber(raw.installs ?? item.installs))
  return { repo, repoUrl, stars, forks, downloads }
}

function statusClass(status?: string | null) {
  if (status === 'success') return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
  if (status === 'failed') return 'border-red-400/40 bg-red-400/10 text-red-200'
  if (status === 'running') return 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
  if (status === 'stopped') return 'border-amber-400/40 bg-amber-400/10 text-amber-200'
  return 'border-zinc-700 bg-zinc-900 text-zinc-300'
}

export default function JobDetailClient({ jobId }: { jobId: string }) {
  const [payload, setPayload] = useState<JobPayload>({ ok: false })
  const [loading, setLoading] = useState(true)
  const [stopping, setStopping] = useState(false)

  const job = payload.job
  const insight = payload.insight || {}
  const isRunning = job?.status === 'running'

  const touchedCount = useMemo(() => {
    const candidateCount = (insight.candidateGroups || []).reduce((sum, item) => sum + Number(item._count?._all || 0), 0)
    const skillCount = (insight.externalSkillGroups || []).reduce((sum, item) => sum + Number(item._count?._all || 0), 0)
    return candidateCount + skillCount
  }, [insight.candidateGroups, insight.externalSkillGroups])

  async function load() {
    const response = await fetch(`/api/collector/jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store' })
    const data = await response.json()
    setPayload(data)
    setLoading(false)
  }

  async function stopJob() {
    if (!job) return
    setStopping(true)
    try {
      await fetch('/api/collector/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      })
      await load()
    } finally {
      setStopping(false)
    }
  }

  useEffect(() => {
    void load()
  }, [jobId])

  useEffect(() => {
    if (!isRunning) return
    const timer = window.setInterval(() => void load(), 5000)
    return () => window.clearInterval(timer)
  }, [isRunning, jobId])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0f14] text-zinc-100">
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
          正在读取任务详情
        </div>
      </main>
    )
  }

  if (!payload.ok || !job) {
    return (
      <main className="min-h-screen bg-[#0b0f14] p-6 text-zinc-100">
        <Link href="/collector" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-cyan-200">
          <ArrowLeft className="h-4 w-4" />
          返回采集后台
        </Link>
        <div className="mt-6 rounded-md border border-red-400/30 bg-red-400/10 p-4 text-red-100">
          {payload.error || '任务不存在'}
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#0b0f14] text-zinc-100">
      <header className="border-b border-zinc-800 bg-[#0f141b]">
        <div className="px-5 py-6 lg:px-8">
          <Link href="/collector" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-cyan-200">
            <ArrowLeft className="h-4 w-4" />
            返回采集后台
          </Link>
          <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-cyan-300">
                <Terminal className="h-4 w-4" />
                Collector Job
                <span className={`rounded-full border px-2 py-0.5 text-xs ${statusClass(job.status)}`}>{job.status}</span>
                <span className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">{job.platform}</span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">{job.label}</h1>
              <p className="mt-3 max-w-5xl font-mono text-xs leading-5 text-zinc-500">{job.id}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 px-3 text-sm text-zinc-200 hover:border-cyan-400"
              >
                <RefreshCw className="h-4 w-4" />
                刷新
              </button>
              {isRunning && (
                <button
                  type="button"
                  onClick={() => void stopJob()}
                  disabled={stopping}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-red-500/40 px-3 text-sm text-red-200 hover:border-red-300 disabled:opacity-50"
                >
                  {stopping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                  停止
                </button>
              )}
              <Link href="/collector/skills" className="inline-flex h-9 items-center gap-2 rounded-md border border-cyan-500/50 bg-cyan-400/10 px-3 text-sm font-medium text-cyan-100 hover:border-cyan-300">
                <Database className="h-4 w-4" />
                所有 Skill
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="space-y-5 px-5 py-5 lg:px-8">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Metric icon={Activity} label="状态" value={job.status} />
          <Metric icon={Clock3} label="启动时间" value={formatDate(job.startedAt)} />
          <Metric icon={CheckCircle2} label="结束时间" value={formatDate(job.finishedAt)} />
          <Metric icon={Database} label="影响数据" value={formatNumber(touchedCount)} />
          <Metric icon={Terminal} label="PID" value={String(job.pid || '-')} />
          <Metric icon={AlertTriangle} label="退出码" value={job.exitCode === undefined || job.exitCode === null ? '-' : String(job.exitCode)} />
        </section>

        <section className="grid gap-5 2xl:grid-cols-[0.9fr_1.1fr]">
          <Panel title="启动信息" icon={Terminal}>
            <div className="grid gap-3 md:grid-cols-2">
              <InfoLine label="命令" value={job.displayCommand || `${job.command} ${job.args.join(' ')}`} mono />
              <InfoLine label="工作目录" value={job.cwd} mono />
              <InfoLine label="关联 source" value={insight.sourceSlug || '多源/维护命令'} />
              <InfoLine label="日志文件" value={job.logFile} mono />
            </div>
            {insight.source && (
              <div className="mt-4 rounded-md border border-zinc-800 bg-[#0b0f14] p-3">
                <div className="text-sm font-medium text-zinc-100">{insight.source.name}</div>
                <div className="mt-1 text-xs text-zinc-500">{insight.source.slug} · {insight.source.type} · {insight.source.target}</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <MiniStatus label="候选" value={formatNumber(insight.source._count?.candidates)} />
                  <MiniStatus label="任务" value={formatNumber(insight.source._count?.runs)} />
                  <MiniStatus label="外部 Skill" value={formatNumber(insight.source._count?.externalSkills)} />
                </div>
              </div>
            )}
          </Panel>

          <Panel title="采集结果概览" icon={Database}>
            <div className="grid gap-3 md:grid-cols-2">
              <GroupList
                title="候选内容"
                rows={(insight.candidateGroups || []).map(item => ({
                  label: `${item.type} / ${item.status}`,
                  value: item._count._all,
                }))}
              />
              <GroupList
                title="外部 Skill 入库"
                rows={(insight.externalSkillGroups || []).map(item => ({
                  label: `${item.sourceSlug} / ${item.status}`,
                  value: item._count._all,
                }))}
              />
            </div>
            <div className="mt-4 overflow-x-auto rounded-md border border-zinc-800">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-zinc-950/80 text-xs text-zinc-500">
                  <tr className="border-b border-zinc-800">
                    <th className="px-3 py-3">Run</th>
                    <th className="px-3 py-3">Source</th>
                    <th className="px-3 py-3">状态</th>
                    <th className="px-3 py-3">候选</th>
                    <th className="px-3 py-3">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {(insight.runs || []).map(run => (
                    <tr key={run.id} className="border-b border-zinc-900">
                      <td className="px-3 py-3 font-mono text-xs text-zinc-300">#{run.id}</td>
                      <td className="px-3 py-3 text-zinc-300">{run.source?.slug || run.scope}</td>
                      <td className="px-3 py-3"><span className={`rounded-full border px-2 py-0.5 text-xs ${statusClass(run.status)}`}>{run.status}</span></td>
                      <td className="px-3 py-3 text-cyan-200">{formatNumber(run.candidateCount)}</td>
                      <td className="px-3 py-3 text-xs text-zinc-500">{formatDate(run.startedAt)}</td>
                    </tr>
                  ))}
                  {(insight.runs || []).length === 0 && (
                    <tr>
                      <td className="px-3 py-6 text-sm text-zinc-500" colSpan={5}>暂无关联 CollectionRun。</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>

        <section className="grid gap-5 2xl:grid-cols-[1fr_1fr]">
          <Panel title="本次候选内容" icon={Activity}>
            <div className="max-h-[520px] overflow-auto rounded-md border border-zinc-800">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="sticky top-0 bg-zinc-950 text-xs text-zinc-500">
                  <tr className="border-b border-zinc-800">
                    <th className="px-3 py-3">ID</th>
                    <th className="px-3 py-3">标题</th>
                    <th className="px-3 py-3">类型</th>
                    <th className="px-3 py-3">Score</th>
                    <th className="px-3 py-3">来源</th>
                    <th className="px-3 py-3">链接</th>
                  </tr>
                </thead>
                <tbody>
                  {(insight.candidates || []).map(candidate => (
                    <tr key={candidate.id} className="border-b border-zinc-900 align-top">
                      <td className="px-3 py-3 font-mono text-xs text-zinc-500">#{candidate.id}</td>
                      <td className="px-3 py-3">
                        <div className="max-w-[360px] font-medium text-zinc-100">{candidate.title}</div>
                        <div className="mt-1 text-xs leading-5 text-zinc-500">{trim(candidate.summaryZh, 120)}</div>
                      </td>
                      <td className="px-3 py-3 text-zinc-300">{candidate.type} / {candidate.status}</td>
                      <td className="px-3 py-3 font-mono text-xs text-cyan-200">{formatNumber(candidate.score)}</td>
                      <td className="px-3 py-3 text-zinc-400">{candidate.sourceName || '-'}</td>
                      <td className="px-3 py-3">
                        {candidate.sourceUrl ? <OpenLink href={candidate.sourceUrl} /> : <span className="text-zinc-600">-</span>}
                      </td>
                    </tr>
                  ))}
                  {(insight.candidates || []).length === 0 && (
                    <tr>
                      <td className="px-3 py-8 text-sm text-zinc-500" colSpan={6}>暂无候选更新。</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="本次 Skill 入库" icon={Github}>
            <div className="max-h-[520px] overflow-auto rounded-md border border-zinc-800">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="sticky top-0 bg-zinc-950 text-xs text-zinc-500">
                  <tr className="border-b border-zinc-800">
                    <th className="px-3 py-3">ID</th>
                    <th className="px-3 py-3">Skill</th>
                    <th className="px-3 py-3">Repo</th>
                    <th className="px-3 py-3">Score</th>
                    <th className="px-3 py-3">Stars</th>
                    <th className="px-3 py-3">安装/下载</th>
                    <th className="px-3 py-3">链接</th>
                  </tr>
                </thead>
                <tbody>
                  {(insight.externalSkills || []).map(skill => {
                    const github = githubInfoFromSkill(skill)
                    return (
                      <tr key={skill.id} className="border-b border-zinc-900 align-top">
                        <td className="px-3 py-3 font-mono text-xs text-zinc-500">#{skill.id}</td>
                        <td className="px-3 py-3">
                          <div className="max-w-[320px] font-medium text-zinc-100">{skill.name}</div>
                          <div className="mt-1 text-xs leading-5 text-zinc-500">{trim(skill.description, 110)}</div>
                        </td>
                        <td className="px-3 py-3">
                          {github.repo ? (
                            <a className="inline-flex max-w-[230px] items-center gap-1 font-mono text-xs text-cyan-300 hover:text-cyan-100" href={github.repoUrl || `https://github.com/${github.repo}`} target="_blank" rel="noreferrer">
                              <span className="truncate">{github.repo}</span>
                              <ArrowUpRight className="h-3 w-3 shrink-0" />
                            </a>
                          ) : <span className="text-zinc-600">-</span>}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-cyan-200">{formatNumber(skill.heatScore || skill.qualityScore)}</td>
                        <td className="px-3 py-3 font-mono text-xs text-zinc-300">{formatNumber(github.stars)}</td>
                        <td className="px-3 py-3 font-mono text-xs text-zinc-300">{formatNumber(github.downloads)}</td>
                        <td className="px-3 py-3">{skill.sourceUrl ? <OpenLink href={skill.sourceUrl} /> : <span className="text-zinc-600">-</span>}</td>
                      </tr>
                    )
                  })}
                  {(insight.externalSkills || []).length === 0 && (
                    <tr>
                      <td className="px-3 py-8 text-sm text-zinc-500" colSpan={7}>暂无 Skill 入库更新。</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>

        <Panel title="实时日志" icon={Terminal}>
          <pre className="max-h-[560px] overflow-auto rounded-md border border-zinc-800 bg-[#05070a] p-4 font-mono text-xs leading-5 text-zinc-300">
            {payload.log || '暂无日志。'}
          </pre>
        </Panel>
      </div>
    </main>
  )
}

function Panel({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-zinc-800 bg-[#10161d]">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
        <Icon className="h-4 w-4 text-cyan-300" />
        <h2 className="font-medium text-zinc-100">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-[#111820] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-500">{label}</span>
        <Icon className="h-4 w-4 text-cyan-300" />
      </div>
      <div className="mt-2 truncate text-lg font-semibold text-white">{value}</div>
    </div>
  )
}

function MiniStatus({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 font-medium text-zinc-100">{value ?? '-'}</div>
    </div>
  )
}

function InfoLine({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-[#0b0f14] p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 break-all text-sm text-zinc-100 ${mono ? 'font-mono text-xs' : ''}`}>{value || '-'}</div>
    </div>
  )
}

function GroupList({ title, rows }: { title: string; rows: Array<{ label: string; value: number }> }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-[#0b0f14] p-3">
      <div className="mb-2 text-sm font-medium text-zinc-100">{title}</div>
      <div className="space-y-2">
        {rows.map(row => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-zinc-400">{row.label}</span>
            <span className="font-mono text-cyan-200">{formatNumber(row.value)}</span>
          </div>
        ))}
        {rows.length === 0 && <div className="text-sm text-zinc-600">暂无数据</div>}
      </div>
    </div>
  )
}

function OpenLink({ href }: { href: string }) {
  return (
    <a className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-100" href={href} target="_blank" rel="noreferrer">
      打开 <ArrowUpRight className="h-3 w-3" />
    </a>
  )
}

