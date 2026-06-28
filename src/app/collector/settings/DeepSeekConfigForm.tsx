'use client'

import { useState } from 'react'
import { AlertTriangle, BrainCircuit, CheckCircle2, Database, Loader2, RefreshCw, Save, Sparkles, Trash2, Zap } from 'lucide-react'

type DeepSeekConfigStatus = {
  configured: boolean
  source: string | null
  maskedToken: string | null
  envFile: string
  envFileExists: boolean
  updatedAt: string | null
  apiUrl: string
  model: string
}

type DeepSeekCheckStatus = {
  ok: boolean
  status: number
  message: string
  model?: string
  latencyMs?: number
}

type Props = {
  initialConfig: DeepSeekConfigStatus
  initialCheck: DeepSeekCheckStatus
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

export default function DeepSeekConfigForm({ initialConfig, initialCheck }: Props) {
  const [token, setToken] = useState('')
  const [apiUrl, setApiUrl] = useState(initialConfig.apiUrl || 'https://api.deepseek.com')
  const [model, setModel] = useState(initialConfig.model || 'deepseek-v4-flash')
  const [config, setConfig] = useState(initialConfig)
  const [check, setCheck] = useState<DeepSeekCheckStatus | null>(initialCheck)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [removing, setRemoving] = useState(false)

  async function saveConfig() {
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const response = await fetch('/api/collector/deepseek-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, apiUrl, model }),
      })
      const data = await response.json()
      if (!response.ok || data?.ok === false) throw new Error(data?.error || '保存失败')
      setConfig(data.config)
      setCheck(data.check)
      setToken('')
      setMessage('AI API 配置已保存，知识库和增长计划任务下一轮会自动读取。')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function testConfig() {
    setTesting(true)
    setMessage('')
    setError('')
    try {
      const response = await fetch('/api/collector/deepseek-config', { method: 'PATCH' })
      const data = await response.json()
      setConfig(data.config)
      setCheck(data.check)
      if (!response.ok || data?.ok === false) throw new Error(data?.check?.message || data?.error || '检测失败')
      setMessage(data?.check?.message || 'AI API 可用。')
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : '检测失败')
    } finally {
      setTesting(false)
    }
  }

  async function removeConfig() {
    if (!window.confirm('确认删除本地 .env.local 里的 AI API 配置吗？')) return
    setRemoving(true)
    setMessage('')
    setError('')
    try {
      const response = await fetch('/api/collector/deepseek-config', { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok || data?.ok === false) throw new Error(data?.error || '删除失败')
      setConfig(data.config)
      setCheck(null)
      setMessage('本地 AI API 配置已删除。')
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
            <BrainCircuit className="h-4 w-4 text-cyan-300" />
            <h2 className="font-medium">AI API 调度配置</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            AI API 负责理解知识库、能力画像和采集状态，输出下一轮 Skill、AI 资讯、提示词增长计划。保存后后台任务自动读取。
          </p>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <StatusTile label="配置状态" value={configured ? '已配置' : '未配置'} tone={configured ? 'emerald' : 'amber'} />
            <StatusTile label="来源" value={config.source || '-'} />
            <StatusTile label="Token" value={config.maskedToken || '-'} />
            <StatusTile label="更新时间" value={formatDate(config.updatedAt)} />
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_0.8fr]">
            <label className="block">
              <span className="text-sm font-medium text-zinc-200">API 地址</span>
              <input
                value={apiUrl}
                onChange={event => setApiUrl(event.target.value)}
                placeholder="https://api.deepseek.com"
                className="mt-2 h-11 w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 font-mono text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-400"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-zinc-200">模型</span>
              <input
                value={model}
                onChange={event => setModel(event.target.value)}
                placeholder="deepseek-v4-flash"
                className="mt-2 h-11 w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 font-mono text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-400"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-zinc-200">API Key</span>
            <input
              value={token}
              onChange={event => setToken(event.target.value)}
              placeholder="sk-... 或控制台生成的 Key"
              type="password"
              autoComplete="off"
              className="mt-2 h-11 w-full rounded-md border border-zinc-700 bg-[#0b0f14] px-3 font-mono text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-400"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveConfig}
              disabled={busy || (!token.trim() && !apiUrl.trim() && !model.trim())}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-cyan-500/50 bg-cyan-400/10 px-3 text-sm font-medium text-cyan-100 hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存并检测
            </button>
            <button
              type="button"
              onClick={testConfig}
              disabled={busy || !configured}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 px-3 text-sm font-medium text-zinc-200 hover:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              检测连接
            </button>
            <button
              type="button"
              onClick={removeConfig}
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

          <div className={`rounded-md border px-3 py-3 text-sm ${check?.ok ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-amber-400/30 bg-amber-400/10 text-amber-200'}`}>
            {check?.message || '保存 API Key 后，这里会显示连接检测结果。'}
            {check?.latencyMs ? <span className="ml-2 text-xs opacity-80">耗时 {check.latencyMs}ms</span> : null}
          </div>
        </div>
      </section>

      <section className="rounded-md border border-zinc-800 bg-[#10161d]">
        <div className="border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2 text-zinc-100">
            <Sparkles className="h-4 w-4 text-cyan-300" />
            <h2 className="font-medium">自动增强链路</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            这些步骤由后台采集器和调度任务自动执行；页面只负责配置、检测和展示状态。
          </p>
        </div>

        <div className="space-y-3 p-4">
          <AutoFlow
            icon={Database}
            title="构建知识库"
            status="自动任务读取"
            note="从 Skill、提示词、AI 资讯和能力画像抽取可检索知识，写入 knowledge_vectors。"
          />
          <AutoFlow
            icon={BrainCircuit}
            title="生成增长计划"
            status={configured ? '可调用 AI API' : '等待 API Key'}
            note="读取知识库和采集状态，生成 skills.sh、GitHub、AI 资讯、提示词的下一轮查询计划。"
          />
          <AutoFlow
            icon={RefreshCw}
            title="常驻采集消费计划"
            status="持续轮询"
            note="GitHub、skills.sh 与提示词常驻任务会在下一轮自动合并新增查询词。"
          />
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

function AutoFlow({ icon: Icon, title, status, note }: { icon: any; title: string; status: string; note: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
          <div>
            <div className="text-sm font-medium text-zinc-100">{title}</div>
            <div className="mt-1 text-xs leading-5 text-zinc-500">{note}</div>
          </div>
        </div>
        <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2 py-0.5 text-xs text-cyan-100">{status}</span>
      </div>
    </div>
  )
}
