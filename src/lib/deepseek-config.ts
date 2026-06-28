import { existsSync, readFileSync, statSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export type DeepSeekConfigSource = '.env.local' | '.env' | 'runtime'

export type DeepSeekConfigStatus = {
  configured: boolean
  source: DeepSeekConfigSource | null
  maskedToken: string | null
  envFile: string
  envFileExists: boolean
  updatedAt: string | null
  apiUrl: string
  model: string
}

export type DeepSeekCheckStatus = {
  ok: boolean
  status: number
  message: string
  model?: string
  latencyMs?: number
}

export type DeepSeekMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type DeepSeekChatOptions = {
  messages: DeepSeekMessage[]
  temperature?: number
  maxTokens?: number
  responseFormat?: 'json_object' | 'text'
  timeoutMs?: number
  maxRetries?: number
}

const LOCAL_ENV_FILE = '.env.local'
const FALLBACK_ENV_FILE = '.env'
const DEFAULT_API_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-v4-flash'

function envPath(fileName: string) {
  return path.join(process.cwd(), fileName)
}

function parseEnvValue(value: string) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function readEnvValue(fileName: string, key: string) {
  const filePath = envPath(fileName)
  if (!existsSync(filePath)) return null

  const content = readFileSync(filePath, 'utf8')
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*(.*)\\s*$`)
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(pattern)
    if (!match) continue
    const value = parseEnvValue(match[1]).trim()
    if (value) return value
  }

  return null
}

function configSource() {
  const localKey = readEnvValue(LOCAL_ENV_FILE, 'DEEPSEEK_API_KEY')
  if (localKey) return { token: localKey, source: LOCAL_ENV_FILE as DeepSeekConfigSource }

  const envKey = readEnvValue(FALLBACK_ENV_FILE, 'DEEPSEEK_API_KEY')
  if (envKey) return { token: envKey, source: FALLBACK_ENV_FILE as DeepSeekConfigSource }

  const runtimeKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (runtimeKey) return { token: runtimeKey, source: 'runtime' as DeepSeekConfigSource }

  return { token: null, source: null }
}

function maskToken(token: string) {
  if (token.length <= 12) return `${token.slice(0, 2)}...${token.slice(-2)}`
  return `${token.slice(0, 8)}...${token.slice(-6)}`
}

function normalizeApiUrl(value?: string | null) {
  const raw = (value || DEFAULT_API_URL).trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(raw)) throw new Error('DeepSeek API 地址必须以 http:// 或 https:// 开头。')
  return raw
}

function normalizeModel(value?: string | null) {
  return (value || DEFAULT_MODEL).trim() || DEFAULT_MODEL
}

export function isLikelyDeepSeekToken(token: string) {
  const normalized = token.trim()
  return normalized.length >= 20 && /^[A-Za-z0-9_\-\.]+$/.test(normalized)
}

export function loadLocalDeepSeekConfig() {
  const token = readEnvValue(LOCAL_ENV_FILE, 'DEEPSEEK_API_KEY') || readEnvValue(FALLBACK_ENV_FILE, 'DEEPSEEK_API_KEY')
  const apiUrl = readEnvValue(LOCAL_ENV_FILE, 'DEEPSEEK_API_URL') || readEnvValue(FALLBACK_ENV_FILE, 'DEEPSEEK_API_URL')
  const model = readEnvValue(LOCAL_ENV_FILE, 'DEEPSEEK_MODEL') || readEnvValue(FALLBACK_ENV_FILE, 'DEEPSEEK_MODEL')
  if (token) process.env.DEEPSEEK_API_KEY = token
  if (apiUrl) process.env.DEEPSEEK_API_URL = apiUrl
  if (model) process.env.DEEPSEEK_MODEL = model
  return getDeepSeekConfig()
}

export function getDeepSeekConfig() {
  const { token } = configSource()
  return {
    token,
    apiUrl: normalizeApiUrl(process.env.DEEPSEEK_API_URL || readEnvValue(LOCAL_ENV_FILE, 'DEEPSEEK_API_URL') || readEnvValue(FALLBACK_ENV_FILE, 'DEEPSEEK_API_URL') || DEFAULT_API_URL),
    model: normalizeModel(process.env.DEEPSEEK_MODEL || readEnvValue(LOCAL_ENV_FILE, 'DEEPSEEK_MODEL') || readEnvValue(FALLBACK_ENV_FILE, 'DEEPSEEK_MODEL') || DEFAULT_MODEL),
  }
}

export function getDeepSeekConfigStatus(): DeepSeekConfigStatus {
  const { token, source } = configSource()
  const filePath = envPath(LOCAL_ENV_FILE)
  const envFileExists = existsSync(filePath)
  const updatedAt = envFileExists ? statSync(filePath).mtime.toISOString() : null
  const config = getDeepSeekConfig()

  return {
    configured: Boolean(token),
    source,
    maskedToken: token ? maskToken(token) : null,
    envFile: LOCAL_ENV_FILE,
    envFileExists,
    updatedAt,
    apiUrl: config.apiUrl,
    model: config.model,
  }
}

type DeepSeekModelListResult = {
  ok: boolean
  models: string[]
  source: 'remote' | 'fallback'
  apiUrl: string
  model: string
  error?: string
}

export async function listDeepSeekModels(): Promise<DeepSeekModelListResult> {
  loadLocalDeepSeekConfig()
  const { token, apiUrl, model } = getDeepSeekConfig()
  if (!token) {
    return {
      ok: false,
      models: [],
      source: 'fallback',
      apiUrl,
      model,
      error: 'DEEPSEEK_API_KEY 未配置',
    }
  }

  try {
    const response = await fetch(`${apiUrl}/models`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      return {
        ok: false,
        models: [],
        source: 'fallback',
        apiUrl,
        model,
        error: data?.error?.message || data?.message || `DeepSeek /models ${response.status}`,
      }
    }

    const models = Array.isArray(data?.data)
      ? data.data
          .map((item: any) => {
            if (typeof item === 'string') return item.trim()
            if (item && typeof item === 'object') {
              return String(item.id || item.name || item.model || '').trim()
            }
            return ''
          })
          .filter(Boolean)
      : []

    return {
      ok: true,
      models: Array.from(new Set(models)),
      source: 'remote',
      apiUrl,
      model,
    }
  } catch (error) {
    return {
      ok: false,
      models: [],
      source: 'fallback',
      apiUrl,
      model,
      error: error instanceof Error ? error.message : 'DeepSeek models fetch failed',
    }
  }
}

export async function saveDeepSeekConfig(input: { token?: string; apiUrl?: string; model?: string }) {
  const token = input.token?.trim()
  if (token !== undefined && token !== '' && !isLikelyDeepSeekToken(token)) {
    throw new Error('请填写 DeepSeek API Key，不要填写账号密码。')
  }

  const apiUrl = normalizeApiUrl(input.apiUrl)
  const model = normalizeModel(input.model)
  if (token) await updateEnvValue(LOCAL_ENV_FILE, 'DEEPSEEK_API_KEY', token)
  await updateEnvValue(LOCAL_ENV_FILE, 'DEEPSEEK_API_URL', apiUrl)
  await updateEnvValue(LOCAL_ENV_FILE, 'DEEPSEEK_MODEL', model)
  if (token) process.env.DEEPSEEK_API_KEY = token
  process.env.DEEPSEEK_API_URL = apiUrl
  process.env.DEEPSEEK_MODEL = model
}

export async function removeLocalDeepSeekConfig() {
  await updateEnvValue(LOCAL_ENV_FILE, 'DEEPSEEK_API_KEY', null)
  await updateEnvValue(LOCAL_ENV_FILE, 'DEEPSEEK_API_URL', null)
  await updateEnvValue(LOCAL_ENV_FILE, 'DEEPSEEK_MODEL', null)
  delete process.env.DEEPSEEK_API_KEY
  delete process.env.DEEPSEEK_API_URL
  delete process.env.DEEPSEEK_MODEL
}

async function updateEnvValue(fileName: string, key: string, value: string | null) {
  const filePath = envPath(fileName)
  const content = existsSync(filePath) ? await fs.readFile(filePath, 'utf8') : ''
  const lines = content ? content.split(/\r?\n/) : []
  const nextLines: string[] = []
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`)
  let replaced = false

  for (const line of lines) {
    if (!pattern.test(line)) {
      nextLines.push(line)
      continue
    }

    replaced = true
    if (value !== null) nextLines.push(`${key}=${value}`)
  }

  if (!replaced && value !== null) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== '') nextLines.push('')
    nextLines.push(`${key}=${value}`)
  }

  await fs.writeFile(filePath, `${nextLines.join('\n').replace(/\n+$/g, '')}\n`, 'utf8')
}

export async function deepSeekChat(options: DeepSeekChatOptions) {
  loadLocalDeepSeekConfig()
  const { token, apiUrl, model } = getDeepSeekConfig()
  if (!token) throw new Error('DEEPSEEK_API_KEY 未配置。')

  const attempts = Math.max(1, (options.maxRetries ?? 1) + 1)
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController()
    const timeout = options.timeoutMs
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : null
    try {
      const response = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          model,
          messages: options.messages,
          temperature: options.temperature ?? 0.2,
          max_tokens: options.maxTokens ?? 1600,
          ...(options.responseFormat === 'json_object' ? { response_format: { type: 'json_object' } } : {}),
        }),
        cache: 'no-store',
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.error?.message || data?.message || `DeepSeek API ${response.status}`)
      }

      const content = data?.choices?.[0]?.message?.content?.trim()
      if (!content) throw new Error('DeepSeek 返回为空。')
      return { content, model: data?.model || model, usage: data?.usage || null }
    } catch (error) {
      lastError = error
      if (attempt >= attempts) break
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('DeepSeek API 请求失败。')
}

export async function testDeepSeekConfig(): Promise<DeepSeekCheckStatus> {
  const startedAt = Date.now()
  try {
    const result = await deepSeekChat({
      messages: [
        { role: 'system', content: '你是 AIHub Collector 的连接检测器，只回答 JSON。' },
        { role: 'user', content: '{"task":"ping","reply":"ok"}' },
      ],
      temperature: 0,
      maxTokens: 40,
      responseFormat: 'json_object',
    })
    return {
      ok: true,
      status: 200,
      message: 'DeepSeek 连接正常，已可用于知识库理解和采集调度。',
      model: result.model,
      latencyMs: Date.now() - startedAt,
    }
  } catch (error) {
    return {
      ok: false,
      status: 503,
      message: error instanceof Error ? error.message : 'DeepSeek 检测失败。',
      latencyMs: Date.now() - startedAt,
    }
  }
}
