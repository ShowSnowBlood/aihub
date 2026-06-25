import { existsSync, readFileSync, statSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export type GithubTokenSource = '.env.local' | '.env' | 'runtime'

export type GithubConfigStatus = {
  configured: boolean
  source: GithubTokenSource | null
  maskedToken: string | null
  envFile: string
  envFileExists: boolean
  updatedAt: string | null
  tokenPrefix: string | null
}

export type GithubRateLimitStatus = {
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

const LOCAL_ENV_FILE = '.env.local'
const FALLBACK_ENV_FILE = '.env'

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

function readEnvToken(fileName: string) {
  const filePath = envPath(fileName)
  if (!existsSync(filePath)) return null

  const content = readFileSync(filePath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?GITHUB_TOKEN\s*=\s*(.*)\s*$/)
    if (!match) continue
    const token = parseEnvValue(match[1]).trim()
    if (token) return token
  }

  return null
}

function tokenSource() {
  const localToken = readEnvToken(LOCAL_ENV_FILE)
  if (localToken) return { token: localToken, source: LOCAL_ENV_FILE as GithubTokenSource }

  const envToken = readEnvToken(FALLBACK_ENV_FILE)
  if (envToken) return { token: envToken, source: FALLBACK_ENV_FILE as GithubTokenSource }

  const runtimeToken = process.env.GITHUB_TOKEN?.trim()
  if (runtimeToken) return { token: runtimeToken, source: 'runtime' as GithubTokenSource }

  return { token: null, source: null }
}

function maskToken(token: string) {
  if (token.startsWith('github_pat_')) return `github_pat_...${token.slice(-6)}`
  if (/^gh[a-z]_/.test(token)) return `${token.slice(0, 4)}...${token.slice(-6)}`
  if (token.length <= 12) return `${token.slice(0, 2)}...${token.slice(-2)}`
  return `${token.slice(0, 6)}...${token.slice(-6)}`
}

function tokenPrefix(token: string) {
  if (token.startsWith('github_pat_')) return 'fine-grained'
  const match = token.match(/^(gh[a-z])_/)
  return match?.[1] || 'token'
}

function resetDate(seconds?: number) {
  if (!seconds) return null
  return new Date(seconds * 1000).toISOString()
}

export function isLikelyGithubToken(token: string) {
  return /^(github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|ghs_[A-Za-z0-9_]{20,})$/.test(token.trim())
}

export function getGithubToken() {
  return tokenSource().token
}

export function loadLocalGithubToken() {
  const localToken = readEnvToken(LOCAL_ENV_FILE) || readEnvToken(FALLBACK_ENV_FILE)
  if (localToken) process.env.GITHUB_TOKEN = localToken
  return tokenSource().token
}

export function getGithubConfigStatus(): GithubConfigStatus {
  const { token, source } = tokenSource()
  const filePath = envPath(LOCAL_ENV_FILE)
  const envFileExists = existsSync(filePath)
  const updatedAt = envFileExists ? statSync(filePath).mtime.toISOString() : null

  return {
    configured: Boolean(token),
    source,
    maskedToken: token ? maskToken(token) : null,
    envFile: LOCAL_ENV_FILE,
    envFileExists,
    updatedAt,
    tokenPrefix: token ? tokenPrefix(token) : null,
  }
}

export async function saveGithubToken(token: string) {
  const normalized = token.trim()
  if (!isLikelyGithubToken(normalized)) {
    throw new Error('请填写 GitHub Personal Access Token，不要填写账号密码。')
  }

  await updateEnvValue(LOCAL_ENV_FILE, 'GITHUB_TOKEN', normalized)
  process.env.GITHUB_TOKEN = normalized
}

export async function removeLocalGithubToken() {
  await updateEnvValue(LOCAL_ENV_FILE, 'GITHUB_TOKEN', null)
  delete process.env.GITHUB_TOKEN
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

export async function testGithubToken(token = getGithubToken() || ''): Promise<GithubRateLimitStatus> {
  const normalized = token.trim()
  if (!normalized) {
    return {
      ok: false,
      status: 400,
      message: '还没有配置 GITHUB_TOKEN。',
    }
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'AIHub-Collector-Config',
    'X-GitHub-Api-Version': '2022-11-28',
    Authorization: `Bearer ${normalized}`,
  }

  const response = await fetch('https://api.github.com/rate_limit', {
    headers,
    cache: 'no-store',
  }).catch(error => {
    throw new Error(error instanceof Error ? error.message : 'GitHub API 暂时无法访问。')
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: data?.message || 'GitHub Token 检测失败。',
    }
  }

  let login: string | null = null
  const userResponse = await fetch('https://api.github.com/user', {
    headers,
    cache: 'no-store',
  }).catch(() => null)
  if (userResponse?.ok) {
    const user = await userResponse.json().catch(() => ({}))
    login = typeof user?.login === 'string' ? user.login : null
  }

  const core = data?.resources?.core || {}
  const search = data?.resources?.search || {}

  return {
    ok: true,
    status: response.status,
    message: login ? `连接正常，当前账号：${login}` : '连接正常，Token 可用。',
    login,
    rate: {
      coreLimit: core.limit,
      coreRemaining: core.remaining,
      coreResetAt: resetDate(core.reset),
      searchLimit: search.limit,
      searchRemaining: search.remaining,
      searchResetAt: resetDate(search.reset),
    },
  }
}
