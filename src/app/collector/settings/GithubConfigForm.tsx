'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, Github, Loader2, Save, Trash2, Zap } from 'lucide-react'
import CollectorRunButton from '../CollectorRunButton'

type GithubConfigStatus = {
  configured: boolean
  source: string | null
  maskedToken: string | null
  envFile: string
  envFileExists: boolean
  updatedAt: string | null
  tokenPrefix: string | null
}

type GithubRateLimitStatus = {
  ok: boolean
  status: number
  message: string
  login?: string | null
  rate?: {
    coreLimit?: number
    coreRemaining?: number
    coreResetAt?: string | null
    searchLimit?: number
    searchRemaining?: number
    searchResetAt?: string | null
  }
}

type Props = {
  initialConfig: GithubConfigStatus
  initialCheck: GithubRateLimitStatus
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

function rateLabel(value?: number) {
  return typeof value === 'number' ? value.toLocaleString('zh-CN') : '-'
}

export default function GithubConfigForm({ initialConfig, initialCheck }: Props) {
  const [token, setToken] = useState('')
  const [config, setConfig] = useState(initialConfig)
  const [check, setCheck] = useState<GithubRateLimitStatus | null>(initialCheck)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [removing, setRemoving] = useState(false)

  async function saveToken() {
    setSaving(true)
    setMessage('')
    setError('')

    try {
      const response = await fetch('/api/collector/github-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await response.json()
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error || '保存失败')
      }
      setConfig(data.config)
      setCheck(data.check)
      setToken('')
      setMessage('GitHub Token 已保存，后续采集任务会自动读取。')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function testToken() {
    setTesting(true)
    setMessage('')
    setError('')

    try {
      const response = await fetch('/api/collector/github-config', { method: 'PATCH' })
      const data = await response.json()
      setConfig(data.config)
      setCheck(data.check)
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.check?.message || data?.error || '检测失败')
      }
      setMessage(data?.check?.message || 'GitHub Token 可用。')
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : '检测失败')
    } finally {
      setTesting(false)
    }
  }

  async function removeToken() {
    if (!window.confirm('确认删除本地 .env.local 里的 GITHUB_TOKEN 吗？')) return
    setRemoving(true)
    setMessage('')
    setError('')

    try {
      const response = await fetch('/api/collector/github-config', { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error || '删除失败')
      }
      setConfig(data.config)
      setCheck(null)
      setMessage('本地 GitHub Token 已删除。')
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : '删除失败')
    } finally {
      setRemoving(false)
    }
  }

  const busy = saving || testing || removing
  const configured = config.configured

  return (
    <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
      <section className="rounded-md border border-zinc-800 bg-[#10161d]">
        <div className="border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2 text-zinc-100">
            <Github className="h-4 w-4 text-cyan-300" />
            <h2 className="font-medium">GitHub Token 设置</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            用于 GitHub Code Search、仓库 Tree 扫描和 Top 100 榜单采集。Token 只保存在本地 .env.local，不会在页面回显完整内容。
          </p>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <StatusTile label="配置状态" value={configured ? '已配置' : '未配置'} tone={configured ? 'emerald' : 'amber'} />
            <StatusTile label="来源" value={config.source || '-'} />
            <StatusTile label="Token" value={config.maskedToken || '-'} />
          </div>

          <label className="block">
            <span className="text-sm font-medium text-zinc-200">Personal Access Token</span>
            <input
              value={token}
              onChange={event => setToken(event.target.value)}
              placeholder="github_pat_... 或 ghp_..."
              type="password"
              autoComplete="off"
              className="mt-2 h-11 w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 font-mono text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-400"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveToken}
              disabled={busy || token.trim().length === 0}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-cyan-500/50 bg-cyan-400/10 px-3 text-sm font-medium text-cyan-100 hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存并检测
            </button>
            <button
              type="button"
              onClick={testToken}
              disabled={busy || !configured}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 px-3 text-sm font-medium text-zinc-200 hover:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              检测连接
            </button>
            <button
              type="button"
              onClick={removeToken}
              disabled={busy || !config.envFileExists}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-red-500/40 px-3 text-sm font-medium text-red-200 hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              删除本地配置
            </button>
          </div>

          {(message || error) && (
            <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${error ? 'border-red-400/30 bg-red-400/10 text-red-200' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'}`}>
              {error ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{error || message}</span>
            </div>
          )}

          <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3 text-xs leading-5 text-zinc-400">
            <div>推荐权限：Fine-grained Token 使用 <span className="text-zinc-200">Contents: Read-only</span> 和 <span className="text-zinc-200">Metadata: Read-only</span>；Classic Token 使用 <span className="text-zinc-200">public_repo</span>。</div>
            <div className="mt-2 flex flex-wrap gap-3">
              <a className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-100" href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">
                管理 Token <ExternalLink className="h-3 w-3" />
              </a>
              <a className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-100" href="https://github.com/settings/tokens/new" target="_blank" rel="noreferrer">
                创建 Classic Token <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-zinc-800 bg-[#10161d]">
        <div className="border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2 text-zinc-100">
            <Zap className="h-4 w-4 text-cyan-300" />
            <h2 className="font-medium">采集状态与操作</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            配置成功后可以直接触发 GitHub 全网 Skill 索引，长批量任务建议继续用命令行跑。
          </p>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <StatusTile label="Core 剩余额度" value={`${rateLabel(check?.rate?.coreRemaining)} / ${rateLabel(check?.rate?.coreLimit)}`} tone={check?.ok ? 'emerald' : 'amber'} />
            <StatusTile label="Search 剩余额度" value={`${rateLabel(check?.rate?.searchRemaining)} / ${rateLabel(check?.rate?.searchLimit)}`} tone={check?.ok ? 'emerald' : 'amber'} />
            <StatusTile label="Core 重置" value={formatDate(check?.rate?.coreResetAt)} />
            <StatusTile label="Search 重置" value={formatDate(check?.rate?.searchResetAt)} />
          </div>

          <div className={`rounded-md border px-3 py-3 text-sm ${check?.ok ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-amber-400/30 bg-amber-400/10 text-amber-200'}`}>
            {check?.message || '保存 Token 后会在这里显示 GitHub API 检测结果。'}
          </div>

          <div className="grid gap-3">
            <ActionBox
              title="GitHub 全网 Skill 索引"
              command="npm.cmd run collector:source -- github-global-skill-index"
            >
              <CollectorRunButton sourceSlug="github-global-skill-index" label="启动索引" compact />
            </ActionBox>
            <ActionBox
              title="skills.sh GitHub 源扩采"
              command="npm.cmd run collector:source -- skills-sh-github-sources"
            >
              <CollectorRunButton sourceSlug="skills-sh-github-sources" label="启动扩采" compact />
            </ActionBox>
            <ActionBox
              title="批量循环采集"
              command="npm.cmd run collector:batch-skills -- --rounds 20 --delay-ms 3000"
            >
              <span className="text-xs text-zinc-500">长任务建议在终端执行，页面触发适合单源短任务。</span>
            </ActionBox>
          </div>
        </div>
      </section>
    </div>
  )
}

function StatusTile({ label, value, tone = 'zinc' }: { label: string; value: string; tone?: 'zinc' | 'emerald' | 'amber' }) {
  const toneClass = {
    zinc: 'text-zinc-100',
    emerald: 'text-emerald-200',
    amber: 'text-amber-200',
  }[tone]

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 break-all font-medium ${toneClass}`}>{value}</div>
    </div>
  )
}

function ActionBox({ title, command, children }: { title: string; command: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-zinc-100">{title}</div>
          <div className="mt-1 rounded border border-zinc-800 bg-[#0b0f14] px-2 py-1 font-mono text-xs text-zinc-400">{command}</div>
        </div>
        {children}
      </div>
    </div>
  )
}
