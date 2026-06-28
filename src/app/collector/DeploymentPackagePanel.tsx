'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Loader2, Package, UploadCloud } from 'lucide-react'

export type DeploymentVersion = {
  id: number
  version: string
  title?: string | null
  status: string
  statusLabel?: string | null
  packageName?: string | null
  packageSize?: number | null
  checksum?: string | null
  notes?: string | null
  operator?: string | null
  jobId?: string | null
  skillCount?: number | null
  externalSkillCount?: number | null
  promptCount?: number | null
  newsCount?: number | null
  startedAt?: string | null
  finishedAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

type Props = {
  initialVersions: DeploymentVersion[]
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

function formatNumber(value?: number | null) {
  return Number(value || 0).toLocaleString('zh-CN')
}

function formatBytes(value?: number | null) {
  const size = Number(value || 0)
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${size} B`
}

function statusClass(status: string) {
  if (status === 'success') return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
  if (status === 'failed') return 'border-red-400/40 bg-red-400/10 text-red-200'
  if (status === 'deploying') return 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
  if (status === 'queued') return 'border-amber-400/40 bg-amber-400/10 text-amber-200'
  return 'border-zinc-700 bg-zinc-900 text-zinc-300'
}

function nextVersionLabel(versions: DeploymentVersion[]) {
  const latest = versions[0]?.version
  const match = latest?.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) return '0.0.1'
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3]) + 1}`
}

export default function DeploymentPackagePanel({ initialVersions }: Props) {
  const [versions, setVersions] = useState(initialVersions)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [operator, setOperator] = useState('local-admin')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const nextVersion = useMemo(() => nextVersionLabel(versions), [versions])
  const latest = versions[0]

  async function refresh() {
    const response = await fetch('/api/collector/deployments', { cache: 'no-store' })
    const data = await response.json()
    if (data?.ok) setVersions(data.versions || [])
  }

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    setError('')
    try {
      if (!file) throw new Error('请选择部署包。')
      const form = new FormData()
      form.set('package', file)
      form.set('title', title)
      form.set('notes', notes)
      form.set('operator', operator)
      const response = await fetch('/api/collector/deployments', {
        method: 'POST',
        body: form,
      })
      const data = await response.json()
      if (!response.ok || data?.ok === false) throw new Error(data?.error || '部署包上传失败。')
      setMessage(data.message || `已上传 ${data.version?.version || ''}`)
      setFile(null)
      setTitle('')
      setNotes('')
      await refresh()
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '部署包上传失败。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      <section className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
              <UploadCloud className="h-4 w-4 text-cyan-300" />
              上传部署包
            </div>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-zinc-500">
              每次上传都会生成一次 Skill 知识库版本迭代，默认从 0.0.1 开始递增。部署会保留本机 .env、.collector-state、数据库、Git 和 node_modules。
            </p>
          </div>
          <span className="rounded border border-cyan-400/40 bg-cyan-400/10 px-2 py-1 font-mono text-xs text-cyan-100">
            next {nextVersion}
          </span>
        </div>

        <form onSubmit={upload} className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-500">部署包</span>
            <input
              type="file"
              accept=".zip,.tar,.tgz,.gz,.tar.gz"
              onChange={event => setFile(event.currentTarget.files?.[0] || null)}
              className="block w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm text-zinc-100 file:mr-3 file:rounded file:border-0 file:bg-cyan-400/10 file:px-3 file:py-1.5 file:text-cyan-100"
            />
            {file ? <span className="mt-1 block text-xs text-zinc-500">{file.name} · {formatBytes(file.size)}</span> : null}
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-500">版本标题</span>
              <input
                value={title}
                onChange={event => setTitle(event.target.value)}
                placeholder={`AIHub Collector ${nextVersion}`}
                className="h-10 w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 text-sm text-zinc-100 outline-none focus:border-cyan-400"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-500">操作人</span>
              <input
                value={operator}
                onChange={event => setOperator(event.target.value)}
                className="h-10 w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 text-sm text-zinc-100 outline-none focus:border-cyan-400"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-zinc-500">更新说明</span>
            <textarea
              value={notes}
              onChange={event => setNotes(event.target.value)}
              rows={4}
              placeholder="这次上传修复了哪些采集、分类、部署或后台能力。"
              className="w-full resize-y rounded-md border border-zinc-700 bg-[#0b0f14] px-3 py-2 text-sm leading-6 text-zinc-100 outline-none focus:border-cyan-400"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-cyan-500/50 bg-cyan-400/10 px-3 text-sm font-medium text-cyan-100 hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              上传并自动部署
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={busy}
              className="inline-flex h-9 items-center rounded-md border border-zinc-700 px-3 text-sm text-zinc-200 hover:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              刷新历史
            </button>
          </div>

          {(message || error) && (
            <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${error ? 'border-red-400/30 bg-red-400/10 text-red-200' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'}`}>
              {error ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{error || message}</span>
            </div>
          )}
        </form>
      </section>

      <section className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
            <Package className="h-4 w-4 text-cyan-300" />
            当前版本
          </div>
          {latest ? <span className={`rounded-full border px-2 py-0.5 text-xs ${statusClass(latest.status)}`}>{latest.statusLabel || latest.status}</span> : null}
        </div>

        {latest ? (
          <div className="mt-4 space-y-4">
            <div>
              <div className="font-mono text-2xl font-semibold text-white">{latest.version}</div>
              <div className="mt-1 text-sm text-zinc-400">{latest.title || '-'}</div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Mini label="外部 Skill" value={formatNumber(latest.externalSkillCount)} />
              <Mini label="发布 Skill" value={formatNumber(latest.skillCount)} />
              <Mini label="提示词候选" value={formatNumber(latest.promptCount)} />
              <Mini label="AI 资讯候选" value={formatNumber(latest.newsCount)} />
              <Mini label="包大小" value={formatBytes(latest.packageSize)} />
              <Mini label="上传时间" value={formatDate(latest.createdAt)} />
            </div>
            {latest.jobId ? (
              <Link className="inline-flex h-9 items-center rounded-md border border-zinc-700 px-3 text-sm text-zinc-200 hover:border-cyan-400 hover:text-cyan-100" href={`/collector/jobs/${encodeURIComponent(latest.jobId)}`}>
                查看部署任务日志
              </Link>
            ) : null}
            {latest.notes ? <p className="rounded-md border border-zinc-800 bg-[#0b0f14] p-3 text-xs leading-5 text-zinc-500">{latest.notes}</p> : null}
          </div>
        ) : (
          <div className="mt-4 rounded-md border border-zinc-800 bg-[#0b0f14] p-8 text-center text-sm text-zinc-500">
            还没有部署版本，上传第一个包后会生成 0.0.1。
          </div>
        )}
      </section>

      <section className="xl:col-span-2">
        <div className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950/40">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="bg-zinc-950 text-xs text-zinc-500">
              <tr className="border-b border-zinc-800">
                <th className="px-3 py-3">版本</th>
                <th className="px-3 py-3">状态</th>
                <th className="px-3 py-3">部署包</th>
                <th className="px-3 py-3">数据快照</th>
                <th className="px-3 py-3">时间</th>
                <th className="px-3 py-3">任务</th>
              </tr>
            </thead>
            <tbody>
              {versions.map(version => (
                <tr key={version.id} className="border-b border-zinc-900 align-top">
                  <td className="px-3 py-3">
                    <div className="font-mono text-cyan-200">{version.version}</div>
                    <div className="mt-1 max-w-[220px] truncate text-xs text-zinc-500">{version.title || '-'}</div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${statusClass(version.status)}`}>{version.statusLabel || version.status}</span>
                    <div className="mt-1 text-[11px] text-zinc-600">{version.operator || '-'}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="max-w-[260px] truncate text-zinc-300">{version.packageName || '-'}</div>
                    <div className="mt-1 font-mono text-[11px] text-zinc-600">{formatBytes(version.packageSize)}</div>
                  </td>
                  <td className="px-3 py-3 text-xs text-zinc-400">
                    <div>external {formatNumber(version.externalSkillCount)} / published {formatNumber(version.skillCount)}</div>
                    <div className="mt-1">prompt {formatNumber(version.promptCount)} / news {formatNumber(version.newsCount)}</div>
                  </td>
                  <td className="px-3 py-3 text-xs text-zinc-500">
                    <div>上传 {formatDate(version.createdAt)}</div>
                    <div className="mt-1">结束 {formatDate(version.finishedAt)}</div>
                  </td>
                  <td className="px-3 py-3">
                    {version.jobId ? (
                      <Link className="text-xs text-cyan-300 hover:text-cyan-100" href={`/collector/jobs/${encodeURIComponent(version.jobId)}`}>
                        {version.jobId.slice(0, 22)}...
                      </Link>
                    ) : (
                      <span className="text-xs text-zinc-600">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {versions.length === 0 && (
                <tr>
                  <td className="px-3 py-8 text-center text-sm text-zinc-500" colSpan={6}>暂无版本历史。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-[#0b0f14] px-3 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 font-medium text-zinc-100">{value}</div>
    </div>
  )
}
