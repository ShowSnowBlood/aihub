import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { getGithubToken, loadLocalGithubToken } from '@/lib/collector-github-config'
import { deepSeekChat, getDeepSeekConfigStatus } from '@/lib/deepseek-config'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_LIMIT = 500
const DEFAULT_LIMIT = 100
const DEFAULT_RATE_LIMIT_PER_MINUTE = 600
const MARKDOWN_FETCH_TIMEOUT_MS = 5000
const README_FETCH_TIMEOUT_MS = 5000
const README_CACHE_TTL_MS = 12 * 60 * 60 * 1000
const DESCRIPTION_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const DESCRIPTION_AI_TIMEOUT_MS = 15000
const DEFAULT_AI_DESCRIPTION_LIMIT = 20
const MAX_AI_DESCRIPTION_LIMIT = 80
const DEFAULT_FETCH_MISSING_MARKDOWN_LIMIT = 0
const MAX_FETCH_MISSING_MARKDOWN_LIMIT = 80
const MAX_SKILL_MARKDOWN_RESPONSE_CHARS = 120_000
const SKILL_CRAWLER_TOKEN_ENV = 'SKILL_CRAWLER_API_TOKEN'

type SyncSkillStatus = 'published' | 'unlisted' | 'archived' | 'deleted'
type SourceType = 'github' | 'official' | 'site' | 'other'

type RateBucket = {
  startedAt: number
  count: number
}

type SyncSkillRow = {
  id: number
  slug: string
  name: string
  description: string | null
  descriptionZh: string | null
  author: string | null
  category: string | null
  categoryZh: string | null
  tags: string | null
  tagsZh: string | null
  sourceSlug: string | null
  sourceUrl: string | null
  githubUrl: string | null
  homepageUrl: string | null
  downloadUrl: string | null
  status: string | null
  qualityScore: number
  heatScore: number
  stars: number | null
  downloads: number | null
  rawData: string | null
  fingerprint: string
  collectedAt: Date
  updatedAt: Date
}

type DedupeGroup = {
  key: string
  row: SyncSkillRow
  meta: ReturnType<typeof githubMetadata>
  rows: Array<{
    row: SyncSkillRow
    meta: ReturnType<typeof githubMetadata>
  }>
  repo: string
  duplicateCount: number
  githubStars: number
  installCount: number
  updatedAt: Date
}

type CacheEntry<T> = {
  value: T
  expiresAt: number
}

type ReadmeResult = {
  markdown: string
  url: string
}

type DescriptionResult = {
  text: string
  source: 'stored_zh' | 'readme_deepseek' | 'readme_heuristic' | 'skill_markdown' | 'fallback'
  readmeUrl?: string | null
  aiTranslated: boolean
}

const globalRateState = globalThis as unknown as {
  skillCrawlerApiRateBuckets?: Map<string, RateBucket>
  skillCrawlerReadmeCache?: Map<string, CacheEntry<ReadmeResult>>
  skillCrawlerReadmePromiseCache?: Map<string, Promise<ReadmeResult>>
  skillCrawlerDescriptionCache?: Map<string, CacheEntry<DescriptionResult>>
}

if (!globalRateState.skillCrawlerApiRateBuckets) {
  globalRateState.skillCrawlerApiRateBuckets = new Map()
}
if (!globalRateState.skillCrawlerReadmeCache) {
  globalRateState.skillCrawlerReadmeCache = new Map()
}
if (!globalRateState.skillCrawlerReadmePromiseCache) {
  globalRateState.skillCrawlerReadmePromiseCache = new Map()
}
if (!globalRateState.skillCrawlerDescriptionCache) {
  globalRateState.skillCrawlerDescriptionCache = new Map()
}

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ code, message }, { status, headers: noStoreHeaders() })
}

function noStoreHeaders() {
  return {
    'Cache-Control': 'no-store, max-age=0',
    'Content-Type': 'application/json; charset=utf-8',
  }
}

function bearerToken(request: NextRequest) {
  const header = request.headers.get('authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ''
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

function localEnvValue(key: string) {
  for (const file of ['.env.local', '.env']) {
    const filePath = path.join(process.cwd(), file)
    if (!existsSync(filePath)) continue
    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 0) continue
      const name = trimmed.slice(0, eq).trim()
      if (name !== key) continue
      return parseEnvValue(trimmed.slice(eq + 1))
    }
  }
  return ''
}

function configuredApiToken() {
  return process.env[SKILL_CRAWLER_TOKEN_ENV]?.trim() || localEnvValue(SKILL_CRAWLER_TOKEN_ENV).trim()
}

function isAuthorized(request: NextRequest) {
  const expected = configuredApiToken()
  if (!expected) return false
  return bearerToken(request) === expected
}

function rateLimitKey(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedFor || request.headers.get('x-real-ip') || bearerToken(request).slice(0, 16) || 'anonymous'
}

function checkRateLimit(request: NextRequest) {
  const limit = Math.max(1, Number(process.env.SKILL_CRAWLER_API_RATE_LIMIT_PER_MINUTE || DEFAULT_RATE_LIMIT_PER_MINUTE))
  const now = Date.now()
  const windowMs = 60_000
  const key = rateLimitKey(request)
  const buckets = globalRateState.skillCrawlerApiRateBuckets!
  const current = buckets.get(key)
  if (!current || now - current.startedAt >= windowMs) {
    buckets.set(key, { startedAt: now, count: 1 })
    return true
  }
  current.count += 1
  return current.count <= limit
}

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function parseDateOnly(value: string, endOfDay = false) {
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function dateOnlyString(date: Date) {
  return date.toISOString().slice(0, 10)
}

function positiveInt(value: string | null, field: string) {
  if (!value || !/^\d+$/.test(value)) {
    return { ok: false as const, message: `${field} must be a positive integer` }
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return { ok: false as const, message: `${field} must be a positive integer` }
  }
  return { ok: true as const, value: parsed }
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function cleanSlug(value: string, fallback: string) {
  const slug = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_:-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 180)
  return slug || fallback
}

function slugToken(value: string) {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/\bc\+\+\b/g, 'cpp')
    .replace(/\bc#\b/g, 'csharp')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9_:-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
  return /^[a-z0-9_:-]+$/.test(normalized) ? normalized : ''
}

function flattenTextValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(flattenTextValues)
  if (typeof value === 'number' && Number.isFinite(value)) return [String(value)]
  if (typeof value !== 'string') return []
  const trimmed = value.trim()
  if (!trimmed) return []

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed.flatMap(flattenTextValues)
    } catch {
      // Fall back to separator parsing below.
    }
  }

  return trimmed
    .split(/[,，;；|、\r\n]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function uniqueSlugList(values: unknown[], resolver: (value: string) => string, limit = 20) {
  const slugs: string[] = []
  const seen = new Set<string>()
  for (const value of values.flatMap(flattenTextValues)) {
    const slug = resolver(value)
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    slugs.push(slug)
    if (slugs.length >= limit) break
  }
  return slugs
}

function includesAny(value: string, terms: string[]) {
  const lower = value.toLowerCase()
  return terms.some(term => lower.includes(term.toLowerCase()))
}

function categorySlug(value: string) {
  if (includesAny(value, ['scrapling', 'scrapy', 'crawler', 'scraper', 'spider', 'firecrawl', 'crawl4ai', '\u722c\u866b', '\u91c7\u96c6', '\u6293\u53d6'])) {
    return 'crawler-data-collection'
  }
  if (includesAny(value, ['shannon', 'security', 'pentest', 'vulnerability', 'red team', 'blue team', 'osint', '\u5b89\u5168', '\u6e17\u900f', '\u6f0f\u6d1e', '\u653b\u9632'])) {
    return 'security-audit-research'
  }
  if (includesAny(value, ['github', 'repo', 'open source', '\u5f00\u6e90', '\u4ed3\u5e93'])) {
    return 'github-open-source'
  }
  if (includesAny(value, ['rag', 'knowledge', 'retrieval', 'vector', 'embedding', '\u77e5\u8bc6\u5e93', '\u5411\u91cf'])) {
    return 'rag-knowledge-base'
  }
  if (includesAny(value, ['prompt', '\u63d0\u793a\u8bcd'])) {
    return 'prompt-role-template'
  }
  if (includesAny(value, ['frontend', 'ui', 'react', 'nextjs', 'vue', '\u524d\u7aef', '\u754c\u9762'])) {
    return 'frontend-ui-engineering'
  }
  if (includesAny(value, ['code', 'engineering', 'developer', 'python', 'typescript', 'test', '\u4ee3\u7801', '\u5de5\u7a0b', '\u6d4b\u8bd5'])) {
    return 'code-engineering-automation'
  }
  if (includesAny(value, ['data', 'excel', 'spreadsheet', 'csv', 'sql', 'analytics', '\u6570\u636e', '\u8868\u683c'])) {
    return 'data-analysis-processing'
  }
  if (includesAny(value, ['image', 'video', 'audio', 'design', 'multimodal', '\u56fe\u7247', '\u89c6\u9891', '\u8bbe\u8ba1', '\u591a\u6a21\u6001'])) {
    return 'multimodal-creative'
  }
  if (includesAny(value, ['news', 'research', 'paper', 'model', '\u8d44\u8baf', '\u7814\u7a76', '\u8bba\u6587', '\u6a21\u578b'])) {
    return 'ai-news-research'
  }
  if (includesAny(value, ['deploy', 'cloud', 'devops', 'ops', 'docker', 'kubernetes', '\u90e8\u7f72', '\u8fd0\u7ef4', '\u4e91'])) {
    return 'devops-cloud'
  }
  if (includesAny(value, ['workflow', 'automation', 'agent', 'mcp', 'tool', '\u81ea\u52a8\u5316', '\u5de5\u4f5c\u6d41', '\u5de5\u5177'])) {
    return 'agent-workflow-tools'
  }
  if (includesAny(value, ['writing', 'content', 'blog', 'summary', 'copy', '\u5199\u4f5c', '\u5185\u5bb9', '\u6458\u8981'])) {
    return 'content-writing'
  }
  if (includesAny(value, ['marketing', 'growth', 'sales', 'seo', '\u8fd0\u8425', '\u589e\u957f', '\u8425\u9500'])) {
    return 'growth-operations'
  }
  if (includesAny(value, ['learning', 'course', 'education', 'tutorial', '\u5b66\u4e60', '\u8bfe\u7a0b', '\u6559\u7a0b'])) {
    return 'learning-research'
  }
  return slugToken(value)
}

function tagSlug(value: string) {
  if (includesAny(value, ['scrapling'])) return 'scrapling'
  if (includesAny(value, ['scrapy'])) return 'scrapy'
  if (includesAny(value, ['playwright'])) return 'playwright'
  if (includesAny(value, ['selenium'])) return 'selenium'
  if (includesAny(value, ['crawler', 'scraper', '\u722c\u866b', '\u6293\u53d6'])) return 'crawler'
  if (includesAny(value, ['data collection', 'data extraction', '\u6570\u636e\u91c7\u96c6'])) return 'data-collection'
  if (includesAny(value, ['security', '\u5b89\u5168'])) return 'security'
  if (includesAny(value, ['pentest', '\u6e17\u900f'])) return 'pentest'
  if (includesAny(value, ['vulnerability', '\u6f0f\u6d1e'])) return 'vulnerability'
  if (includesAny(value, ['rag'])) return 'rag'
  if (includesAny(value, ['knowledge', '\u77e5\u8bc6\u5e93'])) return 'knowledge-base'
  if (includesAny(value, ['vector', 'embedding', '\u5411\u91cf'])) return 'vector-search'
  if (includesAny(value, ['prompt', '\u63d0\u793a\u8bcd'])) return 'prompt'
  if (includesAny(value, ['automation', '\u81ea\u52a8\u5316'])) return 'automation'
  if (includesAny(value, ['workflow', '\u5de5\u4f5c\u6d41'])) return 'workflow'
  if (includesAny(value, ['github'])) return 'github'
  return slugToken(value)
}

function normalizeGithubRepo(value?: string | null) {
  const repo = String(value || '')
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/^github\.com\//i, '')
    .split(/[?#]/)[0]
    .split('/')
    .slice(0, 2)
    .join('/')
    .replace(/\.git$/i, '')
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) ? repo : ''
}

function githubRepoFromUrl(value?: string | null) {
  if (!value) return ''
  try {
    const url = new URL(value)
    if (!/^github\.com$/i.test(url.hostname)) return ''
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return ''
    return normalizeGithubRepo(`${parts[0]}/${parts[1]}`)
  } catch {
    return normalizeGithubRepo(value)
  }
}

function githubBlobToRawUrl(value?: string | null) {
  if (!value) return ''
  try {
    const url = new URL(value)
    if (/^raw\.githubusercontent\.com$/i.test(url.hostname)) return url.toString()
    if (!/^github\.com$/i.test(url.hostname)) return ''
    const parts = url.pathname.split('/').filter(Boolean)
    const marker = parts.findIndex(part => part === 'blob' || part === 'tree')
    if (marker < 0 || parts.length <= marker + 2) return ''
    const owner = parts[0]
    const repo = parts[1]
    const branch = parts[marker + 1]
    const sourcePath = parts.slice(marker + 2).join('/')
    const isBlob = parts[marker] === 'blob'
    const filePath = isBlob || /(^|\/)skill\.md$/i.test(sourcePath)
      ? sourcePath
      : `${sourcePath.replace(/\/+$/g, '')}/SKILL.md`
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`
  } catch {
    return ''
  }
}

function githubRawToContentsApiUrl(value?: string | null) {
  if (!value) return ''
  try {
    const url = new URL(value)
    let owner = ''
    let repo = ''
    let ref = ''
    let filePath = ''

    if (/^raw\.githubusercontent\.com$/i.test(url.hostname)) {
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
      if (parts.length < 4) return ''
      owner = parts[0]
      repo = parts[1]
      ref = parts[2]
      filePath = parts.slice(3).join('/')
    } else if (/^github\.com$/i.test(url.hostname)) {
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
      const marker = parts.findIndex(part => part === 'blob' || part === 'tree')
      if (marker < 0 || parts.length <= marker + 2) return ''
      owner = parts[0]
      repo = parts[1]
      ref = parts[marker + 1]
      const sourcePath = parts.slice(marker + 2).join('/')
      filePath = parts[marker] === 'blob' || /(^|\/)skill\.md$/i.test(sourcePath)
        ? sourcePath
        : `${sourcePath.replace(/\/+$/g, '')}/SKILL.md`
    } else {
      return ''
    }

    if (!owner || !repo || !ref || !filePath) return ''
    return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`
  } catch {
    return ''
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function githubRawToContentsApiUrlCandidates(value?: string | null) {
  const candidates = new Set<string>()
  const primary = githubRawToContentsApiUrl(value)
  if (primary) candidates.add(primary)
  if (!value) return Array.from(candidates)

  try {
    const url = new URL(value)
    let owner = ''
    let repo = ''
    let ref = ''
    let filePath = ''

    if (/^raw\.githubusercontent\.com$/i.test(url.hostname)) {
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
      if (parts.length < 4) return Array.from(candidates)
      owner = parts[0]
      repo = parts[1]
      ref = parts[2]
      filePath = parts.slice(3).join('/')
    } else if (/^github\.com$/i.test(url.hostname)) {
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
      const marker = parts.findIndex(part => part === 'blob' || part === 'tree')
      if (marker < 0 || parts.length <= marker + 2) return Array.from(candidates)
      owner = parts[0]
      repo = parts[1]
      ref = parts[marker + 1]
      const sourcePath = parts.slice(marker + 2).join('/')
      filePath = parts[marker] === 'blob' || /(^|\/)skill\.md$/i.test(sourcePath)
        ? sourcePath
        : `${sourcePath.replace(/\/+$/g, '')}/SKILL.md`
    }

    if (!owner || !repo || !ref || !filePath) return Array.from(candidates)

    const refs = Array.from(new Set([ref, 'main', 'master'].filter(Boolean)))
    const paths = new Set<string>([filePath])
    const directoryMatch = filePath.match(/^(.*\/)([^/]+)\/SKILL\.md$/i)
    if (directoryMatch) {
      const base = directoryMatch[1]
      const dir = directoryMatch[2]
      const ownerPrefix = owner.split('-')[0]
      const repoPrefix = repo
        .replace(/^agent-/i, '')
        .replace(/^ai-/i, '')
        .replace(/-(agent-)?skills?$/i, '')
      for (const prefix of [ownerPrefix, repoPrefix].filter(Boolean)) {
        const stripped = dir.replace(new RegExp(`^${escapeRegExp(prefix)}-`, 'i'), '')
        if (stripped && stripped !== dir) paths.add(`${base}${stripped}/SKILL.md`)
      }
    }

    for (const candidateRef of refs) {
      for (const candidatePath of Array.from(paths)) {
        candidates.add(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${candidatePath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(candidateRef)}`)
      }
    }
  } catch {
    // Keep the primary candidate if URL parsing fails.
  }

  return Array.from(candidates)
}

function githubSkillPathFromUrl(value?: string | null) {
  if (!value) return ''
  try {
    const url = new URL(value)
    if (!/^github\.com$/i.test(url.hostname)) return ''
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    const marker = parts.findIndex(part => part === 'blob' || part === 'tree')
    if (marker < 0 || parts.length <= marker + 2) return ''
    return parts.slice(marker + 2).join('/')
  } catch {
    return ''
  }
}

function isGithubRepoHomeUrl(value?: string | null) {
  if (!value) return false
  try {
    const url = new URL(value)
    if (!/^github\.com$/i.test(url.hostname)) return false
    const parts = url.pathname.split('/').filter(Boolean)
    return parts.length === 2 && !url.hash
  } catch {
    return false
  }
}

function githubMetadata(row: {
  rawData?: string | null
  sourceUrl?: string | null
  githubUrl?: string | null
  homepageUrl?: string | null
  downloadUrl?: string | null
  stars?: number | null
  downloads?: number | null
}) {
  const raw = parseJson<Record<string, any>>(row.rawData, {})
  const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
  const item = raw.item && typeof raw.item === 'object' ? raw.item : {}
  const repo = normalizeGithubRepo(firstString(
    raw.originalRepo,
    github.originalRepo,
    raw.installRepo,
    github.installRepo,
    github.repo,
    raw.repo,
    raw.sourceRepo,
    raw.source,
    item.source,
    githubRepoFromUrl(raw.originalGithubUrl),
    githubRepoFromUrl(github.originalGithubUrl),
    githubRepoFromUrl(row.githubUrl),
    githubRepoFromUrl(row.homepageUrl),
    githubRepoFromUrl(row.sourceUrl),
    githubRepoFromUrl(row.downloadUrl),
    githubRepoFromUrl(raw.githubUrl),
    githubRepoFromUrl(raw.repoUrl),
    githubRepoFromUrl(github.repoUrl),
    githubRepoFromUrl(item.githubUrl),
    githubRepoFromUrl(item.github_url),
    githubRepoFromUrl(item.html_url),
  ))
  const repoUrl = repo ? `https://github.com/${repo}` : ''
  const skillMdUrl = firstString(raw.skillMdUrl, github.skillMdUrl, row.sourceUrl, row.githubUrl)
  const skillMdRawUrl = firstString(raw.skillMdRawUrl, github.skillMdRawUrl, githubBlobToRawUrl(skillMdUrl))
  const installGitUrl = firstString(raw.installGitUrl, github.installGitUrl, row.downloadUrl, repoUrl ? `${repoUrl}.git` : '')
  const installCount = Math.max(
    toNumber(row.downloads),
    toNumber(raw.installs),
    toNumber(item.installs),
    toNumber(github.releaseDownloads),
  )
  const stars = Math.max(toNumber(row.stars), toNumber(raw.stars), toNumber(github.stars))
  return {
    raw,
    github,
    repo,
    repoUrl,
    sourceUrl: firstString(skillMdUrl, row.sourceUrl, row.githubUrl, row.homepageUrl, repoUrl),
    installGitUrl,
    installCount,
    stars,
    skillMdUrl,
    skillMdRawUrl,
  }
}

function sourceType(row: { sourceSlug?: string | null; sourceUrl?: string | null; githubUrl?: string | null; homepageUrl?: string | null }, repo: string): SourceType {
  const sourceText = `${row.sourceSlug || ''} ${row.sourceUrl || ''} ${row.githubUrl || ''} ${row.homepageUrl || ''}`.toLowerCase()
  if (repo || sourceText.includes('github.com')) return 'github'
  if (sourceText.includes('official') || sourceText.includes('anthropic') || sourceText.includes('openai')) return 'official'
  if (row.sourceUrl || row.homepageUrl) return 'site'
  return 'other'
}

function syncStatus(value?: string | null): SyncSkillStatus {
  const status = String(value || '').toLowerCase()
  if (status === 'unlisted') return 'unlisted'
  if (status === 'archived') return 'archived'
  if (status === 'deleted') return 'deleted'
  return 'published'
}

function isGeneratedFallbackMarkdown(value: string) {
  const head = value.slice(0, 1200)
  return /^---\s*[\s\S]{0,260}\bname:\s*external-/i.test(head) ||
    (/^---\s*[\s\S]{0,800}\bsource:\s*https:\/\/github\.com\//i.test(head) && /来自\s+[\w.-]+\/[\w.-]+\s+的公开\s+Skill/i.test(head))
}

function storedMarkdown(raw: Record<string, any>) {
  const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
  const markdown = firstString(
    raw.skillMarkdown,
    raw.skill_markdown,
    raw.skillMdMarkdown,
    raw.markdown,
    github.skillMarkdown,
    github.skill_markdown,
    github.skillMdMarkdown,
  )
  if (!markdown || isGeneratedFallbackMarkdown(markdown)) return ''
  return markdown
}

function classifierData(raw: Record<string, any>) {
  return raw.skillClassifier && typeof raw.skillClassifier === 'object' ? raw.skillClassifier : {}
}

function syncCategories(row: {
  category?: string | null
  categoryZh?: string | null
}, meta: ReturnType<typeof githubMetadata>) {
  const classifier = classifierData(meta.raw)
  const categories = uniqueSlugList([
    row.categoryZh,
    row.category,
    meta.raw.categoryZh,
    meta.raw.category,
    classifier.categoryZh,
  ], categorySlug)
  return categories.length ? categories : ['general-agent-skill']
}

function syncTags(row: {
  tags?: string | null
  tagsZh?: string | null
}, meta: ReturnType<typeof githubMetadata>) {
  const classifier = classifierData(meta.raw)
  const item = meta.raw.item && typeof meta.raw.item === 'object' ? meta.raw.item : {}
  return uniqueSlugList([
    row.tagsZh,
    row.tags,
    meta.raw.tagsZh,
    meta.raw.tags,
    item.tags,
    item.keywords,
    classifier.tagsZh,
    classifier.matchedKeywords,
  ], tagSlug)
}

function canonicalRepoKey(row: {
  sourceSlug?: string | null
  sourceUrl?: string | null
  githubUrl?: string | null
  homepageUrl?: string | null
  downloadUrl?: string | null
  rawData?: string | null
}, meta: ReturnType<typeof githubMetadata>) {
  const raw = meta.raw
  const github = meta.github
  return normalizeGithubRepo(firstString(
    raw.originalRepo,
    github.originalRepo,
    raw.installRepo,
    github.installRepo,
    github.repo,
    raw.repo,
    raw.sourceRepo,
    raw.source,
    raw.item && typeof raw.item === 'object' ? (raw.item as Record<string, any>).source : '',
    githubRepoFromUrl(raw.originalGithubUrl),
    githubRepoFromUrl(github.originalGithubUrl),
    githubRepoFromUrl(row.githubUrl),
    githubRepoFromUrl(row.homepageUrl),
    githubRepoFromUrl(row.sourceUrl),
    githubRepoFromUrl(row.downloadUrl),
    githubRepoFromUrl(raw.githubUrl),
    githubRepoFromUrl(raw.repoUrl),
    githubRepoFromUrl(github.repoUrl),
    githubRepoFromUrl((raw.item && typeof raw.item === 'object') ? (raw.item as Record<string, any>).githubUrl : ''),
    githubRepoFromUrl((raw.item && typeof raw.item === 'object') ? (raw.item as Record<string, any>).github_url : ''),
    githubRepoFromUrl((raw.item && typeof raw.item === 'object') ? (raw.item as Record<string, any>).html_url : ''),
  ))
}

function canonicalSkillKey(row: {
  sourceSlug?: string | null
  sourceUrl?: string | null
  githubUrl?: string | null
  homepageUrl?: string | null
  downloadUrl?: string | null
  slug?: string | null
  name?: string | null
}, meta: ReturnType<typeof githubMetadata>) {
  const repo = canonicalRepoKey(row, meta)
  const nameKey = slugToken(firstString(row.name, row.slug, meta.raw.name, meta.raw.title, meta.raw.item?.title)) || 'unnamed'
  if (repo) {
    return cleanSlug(`${repo}|${nameKey}`, row.slug || 'skill')
  }
  const raw = meta.raw
  const github = meta.github
  const canonicalUrl = firstString(
    raw.skillMdUrl,
    github.skillMdUrl,
    row.sourceUrl && row.sourceUrl.includes('github.com') && !isGithubRepoHomeUrl(row.sourceUrl) ? row.sourceUrl : '',
    row.githubUrl && row.githubUrl.includes('github.com') && !isGithubRepoHomeUrl(row.githubUrl) ? row.githubUrl : '',
    raw.githubUrl && !isGithubRepoHomeUrl(raw.githubUrl) ? raw.githubUrl : '',
    raw.github_url && !isGithubRepoHomeUrl(raw.github_url) ? raw.github_url : '',
    github.url && !isGithubRepoHomeUrl(github.url) ? github.url : '',
  )
  return cleanSlug(`${canonicalUrl || row.sourceSlug || 'no-source'}|${nameKey}`, row.slug || 'skill')
}

function skillDisplayName(row: {
  id: number
  slug?: string | null
  name?: string | null
}, meta: ReturnType<typeof githubMetadata>) {
  const internalSlug = cleanSlug(row.slug || '', `skill-${row.id}`)
  return String(firstString(row.name, meta.raw.name, meta.raw.title, meta.raw.item?.title, internalSlug)).slice(0, 255)
}

function trueSkillSignal(row: SyncSkillRow, meta: ReturnType<typeof githubMetadata>) {
  const name = skillDisplayName(row, meta)
  const normalizedName = slugToken(name)
  const skillMdUrl = firstString(meta.raw.skillMdUrl, meta.github.skillMdUrl, meta.skillMdUrl, row.sourceUrl, row.githubUrl)
  const skillPath = githubSkillPathFromUrl(skillMdUrl)
  const markdown = storedMarkdown(meta.raw)
  const hasSkillMd = /(^|\/)skill\.md$/i.test(skillPath) || /(^|\/)skill\.md([?#].*)?$/i.test(skillMdUrl)
  const hasSkillFrontmatter = /^---\s*[\s\S]{0,1200}\bname\s*:/i.test(markdown) &&
    /^---\s*[\s\S]{0,1200}\bdescription\s*:/i.test(markdown)
  const kebabLike = normalizedName && normalizedName === name.toLowerCase().trim()
  const headingLike = /\s/.test(name) && !kebabLike

  return [
    hasSkillMd ? 5 : 0,
    hasSkillFrontmatter ? 4 : 0,
    kebabLike ? 2 : 0,
    headingLike ? -3 : 0,
    /^(view all|learn more|read more|get started|copy|download|sign in|sign up)\b/i.test(name) ? -5 : 0,
  ].reduce((sum, value) => sum + value, 0)
}

function duplicatePriority(row: SyncSkillRow, meta: ReturnType<typeof githubMetadata>) {
  const raw = meta.raw
  const github = meta.github
  const repo = meta.repo ? 1 : 0
  const concreteSource = (row.sourceUrl && !isGithubRepoHomeUrl(row.sourceUrl) ? 1 : 0) +
    (row.githubUrl && !isGithubRepoHomeUrl(row.githubUrl) ? 1 : 0) +
    (firstString(raw.skillMdUrl, github.skillMdUrl) ? 1 : 0)
  const titleQuality = row.name && !/^(view all|learn more|read more|get started|copy|download|sign in|sign up)\b/i.test(row.name) ? 1 : 0
  const detailQuality = [row.description, raw.skillMdDescription, github.skillMdDescription].filter(Boolean).length
  return [
    repo,
    Math.max(meta.installCount, row.downloads || 0),
    Math.max(meta.stars, row.stars || 0),
    trueSkillSignal(row, meta),
    concreteSource,
    titleQuality,
    detailQuality,
    row.qualityScore || 0,
    row.heatScore || 0,
    row.updatedAt.getTime(),
    row.id,
  ]
}

function comparePriority(a: number[], b: number[]) {
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const av = a[index] || 0
    const bv = b[index] || 0
    if (av !== bv) return bv - av
  }
  return 0
}

function dedupeSyncRows(rows: SyncSkillRow[]) {
  const groups = new Map<string, DedupeGroup>()
  for (const row of rows) {
    const meta = githubMetadata(row)
    const repo = canonicalRepoKey(row, meta)
    if (!repo) continue

    const key = canonicalSkillKey(row, meta).toLowerCase()
    const current = groups.get(key)
    const priority = duplicatePriority(row, meta)
    if (!current) {
      groups.set(key, {
        key,
        row,
        meta,
        rows: [{ row, meta }],
        repo,
        duplicateCount: 1,
        githubStars: meta.stars,
        installCount: meta.installCount,
        updatedAt: row.updatedAt,
      })
      continue
    }

    current.duplicateCount += 1
    current.rows.push({ row, meta })
    current.githubStars = Math.max(current.githubStars, meta.stars)
    current.installCount = Math.max(current.installCount, meta.installCount)
    current.updatedAt = row.updatedAt > current.updatedAt ? row.updatedAt : current.updatedAt
    if (comparePriority(priority, duplicatePriority(current.row, current.meta)) < 0) {
      current.row = row
      current.meta = meta
    }
  }
  return Array.from(groups.values())
}

function sortDedupeGroups(groups: DedupeGroup[]) {
  return groups.sort((a, b) => {
    return b.installCount - a.installCount ||
      b.githubStars - a.githubStars ||
      (b.row.heatScore || 0) - (a.row.heatScore || 0) ||
      b.updatedAt.getTime() - a.updatedAt.getTime() ||
      a.repo.localeCompare(b.repo)
  })
}

async function fetchMarkdown(rawUrl: string) {
  if (!rawUrl) return ''
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return ''
  }
  if (!/^https:$/.test(url.protocol)) return ''
  if (!/(^raw\.githubusercontent\.com$|^github\.com$)/i.test(url.hostname)) return ''

  async function fetchText(targetUrl: string, headers: Record<string, string>) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), MARKDOWN_FETCH_TIMEOUT_MS)
    try {
      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers,
        cache: 'no-store',
      })
      if (!response.ok) return ''
      const text = await response.text()
      return text.trim()
    } catch {
      return ''
    } finally {
      clearTimeout(timeout)
    }
  }

  const apiUrls = githubRawToContentsApiUrlCandidates(url.toString())
  for (const apiUrl of apiUrls) {
    const text = await fetchText(apiUrl, githubApiHeaders('application/vnd.github.raw'))
    if (text) return text
  }

  const direct = await fetchText(url.toString(), { Accept: 'text/plain, text/markdown, */*' })
  if (direct) return direct
  return ''
}

function githubApiHeaders(accept = 'application/vnd.github+json') {
  loadLocalGithubToken()
  const token = getGithubToken()
  const headers: Record<string, string> = {
    Accept: accept,
    'User-Agent': 'AIHub-Skill-Sync-API',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function readmeCacheKey(meta: ReturnType<typeof githubMetadata>) {
  return meta.repo.toLowerCase()
}

function cachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string) {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }
  return entry.value
}

function setCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

async function fetchGithubReadmeUncached(meta: ReturnType<typeof githubMetadata>): Promise<ReadmeResult> {
  if (!meta.repo) return { markdown: '', url: '' }
  const [owner, repoName] = meta.repo.split('/')
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/readme`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), README_FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(apiUrl, {
      headers: githubApiHeaders('application/vnd.github.raw'),
      signal: controller.signal,
      cache: 'no-store',
    })
    if (response.ok) {
      const contentType = response.headers.get('content-type') || ''
      const text = await response.text()
      if (contentType.includes('application/json') || text.trim().startsWith('{')) {
        const data = parseJson<Record<string, any>>(text, {})
        const content = firstString(data.content)
        if (content) {
          const markdown = Buffer.from(content.replace(/\s+/g, ''), 'base64').toString('utf8').trim()
          return { markdown, url: firstString(data.html_url, `${meta.repoUrl}#readme`) }
        }
      }
      return { markdown: text.trim(), url: `${meta.repoUrl}#readme` }
    }
  } catch {
    return { markdown: '', url: '' }
  } finally {
    clearTimeout(timeout)
  }

  return { markdown: '', url: '' }
}

async function fetchGithubReadme(meta: ReturnType<typeof githubMetadata>) {
  const key = readmeCacheKey(meta)
  if (!key) return { markdown: '', url: '' }
  const readmeCache = globalRateState.skillCrawlerReadmeCache!
  const promiseCache = globalRateState.skillCrawlerReadmePromiseCache!
  const cached = cachedValue(readmeCache, key)
  if (cached) return cached

  const pending = promiseCache.get(key)
  if (pending) return pending

  const promise = fetchGithubReadmeUncached(meta)
    .then(result => {
      setCachedValue(readmeCache, key, result, README_CACHE_TTL_MS)
      return result
    })
    .finally(() => {
      promiseCache.delete(key)
    })
  promiseCache.set(key, promise)
  return promise
}

function cleanDisplayText(value?: string | null) {
  return String(value || '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasChinese(value: string) {
  return /[\u4e00-\u9fff]/.test(value)
}

function isMostlyChinese(value: string) {
  const chinese = value.match(/[\u4e00-\u9fff]/g)?.length || 0
  const latin = value.match(/[A-Za-z]/g)?.length || 0
  return chinese >= 12 && chinese >= latin * 0.18
}

function looksLikeGeneratedRepoDescription(value: string) {
  const text = cleanDisplayText(value)
  const repoTemplate = /\u662f\u6765\u81ea\s*[\w.-]+\/[\w.-]+\s*\u7684\u5f00\u6e90\s*Skill/i.test(text)
  const generatedBasis = /\u6839\u636e\s*((GitHub\s*)?README|Skill\s*Markdown)/i.test(text) &&
    /(\u539f\u9879\u76ee\u8bf4\u660e|\u5b89\u88c5\u5730\u5740|\u4f7f\u7528\u573a\u666f)/i.test(text)
  return repoTemplate || generatedBasis
}

function parseFrontMatterFields(markdown: string) {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---/)
  const fields: Record<string, string> = {}
  if (!match) return fields
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)$/)
    if (!field) continue
    fields[field[1]] = field[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return fields
}

function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/^---[\s\S]*?\n---/, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[>*+-]\s+/gm, '')
}

function isUsefulReadmeParagraph(value: string) {
  const text = cleanDisplayText(value)
  const lower = text.toLowerCase()
  if (text.length < 35) return false
  if (/^(installation|install|usage|quick start|getting started|license|contributing|table of contents|features?)$/i.test(text)) return false
  if (lower.includes('shields.io') || lower.includes('badge') || lower.includes('sponsor')) return false
  if (/^(npm|pnpm|yarn|pip|uv|git clone|docker|curl|wget)\s/i.test(text)) return false
  if ((text.match(/\|/g) || []).length >= 4) return false
  return true
}

function uniqueTextParts(values: string[], limit: number) {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values.map(item => cleanDisplayText(item)).filter(Boolean)) {
    const key = value.toLowerCase().slice(0, 160)
    if (seen.has(key)) continue
    seen.add(key)
    output.push(value)
    if (output.join(' ').length >= limit) break
  }
  return output
}

function extractMarkdownSummary(markdown: string, meta: ReturnType<typeof githubMetadata>) {
  if (!markdown) return ''
  const frontMatter = parseFrontMatterFields(markdown)
  const plain = markdownToPlainText(markdown)
  const paragraphs = plain
    .split(/\n{2,}/)
    .map(item => cleanDisplayText(item))
    .filter(isUsefulReadmeParagraph)
  const parts = uniqueTextParts([
    frontMatter.description,
    meta.github.description,
    meta.raw.description,
    ...paragraphs.slice(0, 3),
  ].filter(Boolean), 1200)
  return cleanDisplayText(parts.join(' ')).slice(0, 1200)
}

function extractSkillMarkdownSummary(markdown: string) {
  if (!markdown) return ''
  const frontMatter = parseFrontMatterFields(markdown)
  const frontMatterDescription = cleanDisplayText(frontMatter.description).slice(0, 520)
  if (frontMatterDescription) return frontMatterDescription

  const plain = markdownToPlainText(markdown)
  const firstParagraph = plain
    .split(/\n{2,}/)
    .map(item => cleanDisplayText(item))
    .find(isUsefulReadmeParagraph)
  return cleanDisplayText(firstParagraph).slice(0, 520)
}

function isWeakDescription(value: string | null | undefined, meta?: ReturnType<typeof githubMetadata>) {
  const text = cleanDisplayText(value).toLowerCase()
  if (!text || text.length < 12) return true
  if (looksLikeGeneratedRepoDescription(text)) return true
  if (text.includes('自动汉化摘要') || text.includes('公开 skill') || text.includes('skills.sh 技能索引')) return true
  if (text.includes('已映射到 github 源仓库') || text.includes('no description provided')) return true
  if (meta?.repo && text === meta.repo.toLowerCase()) return true
  return false
}

function storedChineseDescription(row: SyncSkillRow, meta: ReturnType<typeof githubMetadata>) {
  const candidates = [
    meta.raw.readmeSummaryZh,
    meta.github.readmeSummaryZh,
    meta.raw.descriptionZh,
    meta.github.descriptionZh,
    row.descriptionZh,
  ]
  for (const value of candidates) {
    const text = cleanDisplayText(firstString(value)).slice(0, 520)
    if (text && isMostlyChinese(text) && !isWeakDescription(text, meta)) return text
  }
  return ''
}

function chineseFocusFromText(value: string) {
  const lower = value.toLowerCase()
  const mapping: Array<[RegExp, string]> = [
    [/(scrapling|scrapy|crawler|scraper|spider|crawl|playwright|selenium|beautifulsoup|parsel|firecrawl|crawl4ai)/, '网页采集和浏览器自动化'],
    [/(agent|workflow|automation|mcp|tool use|orchestrat)/, 'Agent 工作流和自动化'],
    [/(rag|retrieval|vector|embedding|knowledge)/, 'RAG 知识库和检索增强'],
    [/(prompt|role|template)/, '提示词和角色模板'],
    [/(security|pentest|vulnerability|osint|red team|ctf|reverse|malware)/, '安全研究和攻防分析'],
    [/(python|typescript|javascript|code|review|test|developer|cli|sdk)/, '代码工程和开发效率'],
    [/(data|csv|excel|spreadsheet|sql|analytics|visualization)/, '数据处理和分析'],
    [/(image|video|audio|design|multimodal|comfyui|flux)/, '多模态创作和设计'],
    [/(deploy|docker|kubernetes|cloud|devops|server)/, '部署运维和云服务'],
    [/(readme|documentation|docs|tutorial|course|learning)/, '文档整理和学习资料'],
  ]
  return mapping
    .filter(([pattern]) => pattern.test(lower))
    .map(([, label]) => label)
    .slice(0, 4)
    .join('、')
}

function heuristicChineseDescription(row: SyncSkillRow, meta: ReturnType<typeof githubMetadata>, sourceText: string, sourceLabel: string) {
  const cleaned = cleanDisplayText(sourceText.replace(/[*_`>#]+/g, ' '))
  const statusLikeSnippet = /时间|轮次|状态|完成|updated|created/i.test(cleaned) && cleaned.length < 220
  if (isMostlyChinese(cleaned) && !statusLikeSnippet && !isWeakDescription(cleaned, meta)) {
    return cleaned.slice(0, 520)
  }

  const skillName = cleanDisplayText(row.name || row.slug || '该 Skill')
  const repoText = meta.repo ? ` ${meta.repo}` : ''
  const focus = chineseFocusFromText(`${skillName} ${meta.repo} ${cleaned}`)
  const basis = sourceLabel === 'readme' ? 'GitHub README' : 'Skill Markdown'
  const focusText = focus
    ? `主要围绕${focus}展开`
    : 'README 提供了项目定位、使用方式和能力边界'
  return `${skillName} 是来自${repoText || '原始 GitHub 仓库'} 的开源 Skill。根据${basis}，它${focusText}，适合需要参考原项目说明、安装地址和使用场景的开发者或运营人员。`.slice(0, 520)
}

function normalizeAiDescription(value: string) {
  return cleanDisplayText(value)
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/^中文概述[:：]\s*/i, '')
    .replace(/^描述[:：]\s*/i, '')
    .slice(0, 520)
}

function normalizeSummaryDescription(value: string, meta?: ReturnType<typeof githubMetadata>) {
  const text = cleanDisplayText(value)
    .replace(/^description\s*[:：]\s*/i, '')
    .replace(/^summary\s*[:：]\s*/i, '')
    .slice(0, 520)
  return text && !isWeakDescription(text, meta) ? text : ''
}

function canUseDeepSeekDescription() {
  try {
    return getDeepSeekConfigStatus().configured
  } catch {
    return false
  }
}

async function translateSummaryToChinese(row: SyncSkillRow, meta: ReturnType<typeof githubMetadata>, summaryText: string) {
  const text = cleanDisplayText(summaryText)
  if (!text || isMostlyChinese(text) || !canUseDeepSeekDescription()) return ''
  try {
    const response = await deepSeekChat({
      temperature: 0.1,
      maxTokens: 320,
      timeoutMs: DESCRIPTION_AI_TIMEOUT_MS,
      maxRetries: 0,
      messages: [
        {
          role: 'system',
          content: '你是开源项目 README 摘要助手。只输出简体中文一段话，80 到 180 字，不要 Markdown，不要编造 README 没有的信息。',
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: '把 GitHub README 内容概述并翻译成中文，作为 Skill 列表 description 字段。',
            skillName: row.name || row.slug,
            repo: meta.repo,
            sourceUrl: meta.repoUrl,
            readmeExcerpt: text.slice(0, 2400),
          }),
        },
      ],
    })
    const translated = normalizeAiDescription(response.content)
    return hasChinese(translated) && !isWeakDescription(translated, meta) ? translated : ''
  } catch {
    return ''
  }
}

function descriptionCacheKey(row: SyncSkillRow, meta: ReturnType<typeof githubMetadata>) {
  return `${row.id}:${row.updatedAt.getTime()}:${meta.repo || row.slug}`
}

async function persistDescription(row: SyncSkillRow, meta: ReturnType<typeof githubMetadata>, result: DescriptionResult) {
  if (!result.text || result.source === 'stored_zh' || result.source === 'fallback') return
  if (!isMostlyChinese(result.text)) return
  if (!isWeakDescription(row.descriptionZh, meta) && row.descriptionZh === result.text) return

  try {
    const raw = meta.raw && typeof meta.raw === 'object' ? meta.raw : {}
    const github = meta.github && typeof meta.github === 'object' ? meta.github : {}
    const now = new Date().toISOString()
    await prisma.externalSkill.update({
      where: { id: row.id },
      data: {
        descriptionZh: result.text,
        updatedAt: row.updatedAt,
        rawData: JSON.stringify({
          ...raw,
          readmeSummaryZh: result.text,
          readmeSummarySource: result.source,
          readmeSummaryUpdatedAt: now,
          readmeUrl: result.readmeUrl || raw.readmeUrl,
          github: {
            ...github,
            readmeSummaryZh: result.text,
            readmeSummarySource: result.source,
            readmeUrl: result.readmeUrl || github.readmeUrl,
          },
        }),
      },
    })
  } catch {
    // The API should still return a good description even if cache persistence fails.
  }
}

async function persistSkillMarkdown(row: SyncSkillRow, meta: ReturnType<typeof githubMetadata>, markdown: string) {
  const summary = normalizeSummaryDescription(extractSkillMarkdownSummary(markdown), meta)
  if (!markdown || !summary || isGeneratedFallbackMarkdown(markdown)) return

  try {
    const raw = meta.raw && typeof meta.raw === 'object' ? meta.raw : {}
    const github = meta.github && typeof meta.github === 'object' ? meta.github : {}
    const now = new Date().toISOString()
    await prisma.externalSkill.update({
      where: { id: row.id },
      data: {
        description: isWeakDescription(row.description, meta) ? summary : row.description,
        descriptionZh: isMostlyChinese(summary) ? summary : row.descriptionZh,
        rawData: JSON.stringify({
          ...raw,
          skillMarkdown: markdown,
          skillMdDescription: summary,
          skillMarkdownFetchedAt: now,
          github: {
            ...github,
            skillMdDescription: summary,
            skillMarkdownFetchedAt: now,
          },
        }),
      },
    })
  } catch {
    // Keep the API response available even if the write-back cache fails.
  }
}

async function buildChineseDescription(
  row: SyncSkillRow,
  meta: ReturnType<typeof githubMetadata>,
  actualSkillMarkdown: string,
  options: { useAi: boolean },
): Promise<DescriptionResult> {
  const cacheKey = descriptionCacheKey(row, meta)
  const descriptionCache = globalRateState.skillCrawlerDescriptionCache!
  const cached = cachedValue(descriptionCache, cacheKey)
  if (cached) return cached

  const rawStoredSkillSummary = firstString(meta.raw.skillMdDescription, meta.github.skillMdDescription)
  const nameKey = slugToken(firstString(row.name, row.slug, meta.raw.name, meta.raw.title))
  const storedSkillSummary = slugToken(rawStoredSkillSummary) && slugToken(rawStoredSkillSummary) === nameKey ? '' : rawStoredSkillSummary
  const skillSummary = normalizeSummaryDescription(extractSkillMarkdownSummary(actualSkillMarkdown) || storedSkillSummary, meta)

  if (skillSummary) {
    let text = skillSummary
    let aiTranslated = false
    if (options.useAi && !isMostlyChinese(skillSummary)) {
      const translated = await translateSummaryToChinese(row, meta, skillSummary)
      if (translated) {
        text = translated
        aiTranslated = true
      }
    }
    const result: DescriptionResult = {
      text,
      source: aiTranslated ? 'readme_deepseek' : 'skill_markdown',
      readmeUrl: null,
      aiTranslated,
    }
    setCachedValue(descriptionCache, cacheKey, result, DESCRIPTION_CACHE_TTL_MS)
    await persistDescription(row, meta, result)
    return result
  }

  const stored = storedChineseDescription(row, meta)
  if (stored) {
    return { text: stored, source: 'stored_zh', aiTranslated: false, readmeUrl: firstString(meta.raw.readmeUrl, meta.github.readmeUrl) || null }
  }

  if (!options.useAi) {
    const sourceText = storedSkillSummary || row.description || meta.github.description
    const text = normalizeSummaryDescription(sourceText, meta)
    const result: DescriptionResult = {
      text,
      source: storedSkillSummary ? 'skill_markdown' : 'fallback',
      readmeUrl: firstString(meta.raw.readmeUrl, meta.github.readmeUrl) || null,
      aiTranslated: false,
    }
    setCachedValue(descriptionCache, cacheKey, result, DESCRIPTION_CACHE_TTL_MS)
    await persistDescription(row, meta, result)
    return result
  }

  const readme = await fetchGithubReadme(meta)
  const readmeSummary = extractMarkdownSummary(readme.markdown, meta)
  const sourceText = readmeSummary || row.description || meta.github.description

  let text = ''
  let source: DescriptionResult['source'] = readmeSummary ? 'readme_heuristic' : 'fallback'
  let aiTranslated = false

  if (sourceText && !isMostlyChinese(sourceText)) {
    text = await translateSummaryToChinese(row, meta, sourceText)
    if (text) {
      source = 'readme_deepseek'
      aiTranslated = true
    }
  }

  if (!text && sourceText) {
    text = normalizeSummaryDescription(sourceText, meta)
  }
  if (!text) {
    text = normalizeSummaryDescription(row.description || meta.github.description, meta)
  }

  const result: DescriptionResult = {
    text,
    source,
    readmeUrl: readme.url || null,
    aiTranslated,
  }
  setCachedValue(descriptionCache, cacheKey, result, DESCRIPTION_CACHE_TTL_MS)
  await persistDescription(row, meta, result)
  return result
}

function hasStoredApiReadyData(group: DedupeGroup) {
  const markdown = storedMarkdown(group.meta.raw)
  if (!markdown) return false
  if (!isLikelySkillMarkdown(group.row, group.meta, markdown)) return false
  const rawStoredSkillSummary = firstString(group.meta.raw.skillMdDescription, group.meta.github.skillMdDescription)
  const nameKey = slugToken(firstString(group.row.name, group.row.slug, group.meta.raw.name, group.meta.raw.title))
  const storedSkillSummary = slugToken(rawStoredSkillSummary) && slugToken(rawStoredSkillSummary) === nameKey ? '' : rawStoredSkillSummary
  const summary = normalizeSummaryDescription(extractSkillMarkdownSummary(markdown) || storedSkillSummary, group.meta)
  return Boolean(summary)
}

function isLikelySkillMarkdown(row: SyncSkillRow, meta: ReturnType<typeof githubMetadata>, markdown: string) {
  if (!markdown) return false
  const source = firstString(meta.raw.skillMdUrl, meta.github.skillMdUrl, row.sourceUrl, row.githubUrl, meta.sourceUrl)
  const sourcePath = githubSkillPathFromUrl(source)
  if (/(^|\/)skill\.md$/i.test(sourcePath) || /(^|\/)skill\.md([?#].*)?$/i.test(source)) return true
  return /^---\s*[\s\S]{0,1200}\bname\s*:/i.test(markdown) &&
    /^---\s*[\s\S]{0,1200}\bdescription\s*:/i.test(markdown)
}

function skillMarkdownForResponse(markdown: string) {
  if (!markdown) return { markdown: '', truncated: false, length: 0 }
  if (markdown.length <= MAX_SKILL_MARKDOWN_RESPONSE_CHARS) {
    return { markdown, truncated: false, length: markdown.length }
  }
  return {
    markdown: `${markdown.slice(0, MAX_SKILL_MARKDOWN_RESPONSE_CHARS)}\n\n<!-- skill_markdown truncated by API response limit -->`,
    truncated: true,
    length: markdown.length,
  }
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>) {
  const results: R[] = new Array(items.length)
  let index = 0
  async function worker() {
    while (index < items.length) {
      const current = index
      index += 1
      results[current] = await mapper(items[current], current)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

function parseAiDescriptionLimit(searchParams: URLSearchParams) {
  const raw = searchParams.get('ai_description_limit') || process.env.SKILL_CRAWLER_AI_DESCRIPTION_LIMIT || String(DEFAULT_AI_DESCRIPTION_LIMIT)
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return DEFAULT_AI_DESCRIPTION_LIMIT
  return Math.max(0, Math.min(Math.floor(parsed), MAX_AI_DESCRIPTION_LIMIT))
}

function parseFetchMissingMarkdownLimit(searchParams: URLSearchParams) {
  const raw = searchParams.get('fetch_missing_limit') ||
    process.env.SKILL_CRAWLER_FETCH_MISSING_MARKDOWN_LIMIT ||
    String(DEFAULT_FETCH_MISSING_MARKDOWN_LIMIT)
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return DEFAULT_FETCH_MISSING_MARKDOWN_LIMIT
  return Math.max(0, Math.min(Math.floor(parsed), MAX_FETCH_MISSING_MARKDOWN_LIMIT))
}

function parseStarThreshold(searchParams: URLSearchParams) {
  const names = ['Star', 'star', 'stars', 'min_star', 'min_stars', 'minStar', 'minStars']
  const name = names.find(key => searchParams.has(key))
  if (!name) return { ok: true as const, value: null as number | null }

  const raw = String(searchParams.get(name) || '').trim()
  if (!raw || /^(true|on|yes)$/i.test(raw)) {
    return { ok: true as const, value: 50 }
  }

  const parsed = Number(raw.replace(/,/g, ''))
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { ok: false as const, message: `${name} must be a non-negative number` }
  }

  return { ok: true as const, value: parsed }
}

function parseDateField(searchParams: URLSearchParams) {
  const raw = String(searchParams.get('date_field') || searchParams.get('dateField') || 'updated_at')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')

  if (raw === 'updated_at' || raw === 'updatedat' || raw === 'update') {
    return { ok: true as const, apiField: 'updated_at', prismaField: 'updatedAt' as const }
  }
  if (raw === 'collected_at' || raw === 'collectedat' || raw === 'collected' || raw === 'created_at' || raw === 'createdat') {
    return { ok: true as const, apiField: 'collected_at', prismaField: 'collectedAt' as const }
  }
  return {
    ok: false as const,
    message: 'date_field must be updated_at or collected_at',
  }
}

function parseVerifiedOnly(searchParams: URLSearchParams) {
  const raw = searchParams.get('verified_only') ||
    searchParams.get('verifiedOnly') ||
    searchParams.get('clean') ||
    searchParams.get('stored_verified_only') ||
    ''
  if (!raw) return false
  return !['0', 'false', 'off', 'no', 'all'].includes(raw.trim().toLowerCase())
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return jsonError(401, 'unauthorized', 'Bearer token is missing or invalid')
  }
  if (!checkRateLimit(request)) {
    return jsonError(429, 'rate_limited', 'Too many requests')
  }

  const { searchParams } = new URL(request.url)
  const fromDateParam = searchParams.get('from_date') || ''
  const toDateParam = searchParams.get('to_date') || ''

  if (fromDateParam && !isDateOnly(fromDateParam)) {
    return jsonError(400, 'invalid_request', 'from_date must be YYYY-MM-DD')
  }
  if (toDateParam && !isDateOnly(toDateParam)) {
    return jsonError(400, 'invalid_request', 'to_date must be YYYY-MM-DD')
  }

  const from = fromDateParam ? parseDateOnly(fromDateParam) : new Date(0)
  const to = toDateParam ? parseDateOnly(toDateParam, true) : new Date('9999-12-31T23:59:59.999Z')
  if (!from) return jsonError(400, 'invalid_request', 'from_date must be YYYY-MM-DD')
  if (!to) return jsonError(400, 'invalid_request', 'to_date must be YYYY-MM-DD')
  if (from.getTime() > to.getTime()) {
    return jsonError(400, 'invalid_request', 'from_date must be before or equal to to_date')
  }

  const pageParam = positiveInt(searchParams.get('page') || '1', 'page')
  if (!pageParam.ok) return jsonError(400, 'invalid_request', pageParam.message)
  const limitParam = positiveInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 'limit')
  if (!limitParam.ok) return jsonError(400, 'invalid_request', limitParam.message)
  if (limitParam.value > MAX_LIMIT) {
    return jsonError(400, 'invalid_request', `limit must be less than or equal to ${MAX_LIMIT}`)
  }

  const page = pageParam.value
  const limit = limitParam.value
  const aiDescriptionParam = String(searchParams.get('ai_description') || searchParams.get('translate_description') || searchParams.get('enhance') || '0').toLowerCase()
  const useAiDescriptions = !['0', 'false', 'off', 'no', 'auto'].includes(aiDescriptionParam)
  const aiDescriptionLimit = parseAiDescriptionLimit(searchParams)
  const fetchMissingMarkdownParam = String(searchParams.get('fetch_missing_markdown') || searchParams.get('fetch_markdown') || '0').toLowerCase()
  const fetchMissingMarkdown = !['0', 'false', 'off', 'no', ''].includes(fetchMissingMarkdownParam)
  const fetchMissingMarkdownLimit = fetchMissingMarkdown ? parseFetchMissingMarkdownLimit(searchParams) : 0
  const verifiedOnly = parseVerifiedOnly(searchParams)
  const starThresholdParam = parseStarThreshold(searchParams)
  if (!starThresholdParam.ok) return jsonError(400, 'invalid_request', starThresholdParam.message)
  const starThreshold = starThresholdParam.value
  const dateFieldParam = parseDateField(searchParams)
  if (!dateFieldParam.ok) return jsonError(400, 'invalid_request', dateFieldParam.message)

  const where: any = {
    status: {
      notIn: ['ignored', 'low_quality', 'out_of_scope', 'needs_source', 'aggregated_source'],
    },
  }
  const hasDateFilter = Boolean(fromDateParam || toDateParam)
  if (hasDateFilter) {
    where[dateFieldParam.prismaField] = {
      gte: from,
      lte: to,
    }
  }
  if (starThreshold !== null) {
    where.stars = { gt: starThreshold }
  }
  if (verifiedOnly) {
    where.AND = [
      {
        OR: [
          { rawData: { contains: 'skillMarkdown' } },
          { rawData: { contains: 'skill_markdown' } },
          { rawData: { contains: 'skillMdMarkdown' } },
          { rawData: { contains: '"markdown"' } },
        ],
      },
      {
        OR: [
          { sourceUrl: { contains: 'SKILL.md' } },
          { sourceUrl: { contains: 'skill.md' } },
          { githubUrl: { contains: 'SKILL.md' } },
          { githubUrl: { contains: 'skill.md' } },
          { rawData: { contains: 'SKILL.md' } },
          { rawData: { contains: 'skill.md' } },
        ],
      },
    ]
  }

  try {
    const rows = await prisma.externalSkill.findMany({
      where,
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        descriptionZh: true,
        author: true,
        category: true,
        categoryZh: true,
        tags: true,
        tagsZh: true,
        sourceSlug: true,
        sourceUrl: true,
        githubUrl: true,
        homepageUrl: true,
        downloadUrl: true,
        status: true,
        qualityScore: true,
        heatScore: true,
        stars: true,
        downloads: true,
        rawData: true,
        fingerprint: true,
        collectedAt: true,
        updatedAt: true,
      },
    }) as SyncSkillRow[]

    const allGroups = sortDedupeGroups(dedupeSyncRows(rows))
    const groupedRawRows = allGroups.reduce((sum, group) => sum + group.duplicateCount, 0)
    const filteredGroups = starThreshold === null
      ? allGroups
      : allGroups.filter(group => Math.max(group.meta.stars, group.githubStars) > starThreshold)
    const verifiedGroups = verifiedOnly ? filteredGroups.filter(hasStoredApiReadyData) : []
    const apiGroups = verifiedOnly ? verifiedGroups : filteredGroups
    const start = (page - 1) * limit
    const buildResponseItem = async (group: DedupeGroup, index: number) => {
      const row = group.row
      const meta = group.meta
      const displayName = skillDisplayName(row, meta)
      const savedMarkdown = storedMarkdown(meta.raw)
      const canFetchMissing = !savedMarkdown && fetchMissingMarkdown && index < fetchMissingMarkdownLimit
      const fetchedMarkdown = canFetchMissing ? await fetchMarkdown(meta.skillMdRawUrl) : ''
      const rawSkillMarkdown = savedMarkdown || fetchedMarkdown
      const actualSkillMarkdown = isLikelySkillMarkdown(row, meta, rawSkillMarkdown) ? rawSkillMarkdown : ''
      const responseMarkdown = skillMarkdownForResponse(actualSkillMarkdown)
      const skillMarkdown = responseMarkdown.markdown
      if (!skillMarkdown && verifiedOnly) return null
      if (!savedMarkdown && actualSkillMarkdown) await persistSkillMarkdown(row, meta, actualSkillMarkdown)

      const description = await buildChineseDescription(row, meta, actualSkillMarkdown, {
        useAi: useAiDescriptions && index < aiDescriptionLimit,
      })
      const fallbackDescription = normalizeSummaryDescription(firstString(
        row.descriptionZh,
        row.description,
        meta.raw.description,
        meta.raw.summary,
        meta.github.description,
        displayName,
      ), meta) || displayName
      const descriptionText = description.text || fallbackDescription
      if (!descriptionText && verifiedOnly) return null

      const categories = syncCategories(row, meta)
      const tags = syncTags(row, meta)
      return {
        slug: displayName,
        name: displayName,
        repo: group.repo,
        repo_url: meta.repoUrl || `https://github.com/${group.repo}`,
        description: descriptionText,
        description_source: description.text ? description.source : 'fallback',
        description_readme_url: description.readmeUrl || null,
        description_ai_translated: description.aiTranslated,
        author_name: row.author || firstString(meta.raw.author, meta.raw.owner, meta.github.owner) || null,
        source_type: sourceType(row, meta.repo),
        source_url: meta.sourceUrl || null,
        install_command: meta.installGitUrl ? `codex skills install ${meta.installGitUrl}` : null,
        install_count: Math.max(meta.installCount, group.installCount),
        github_stars: Math.max(meta.stars, group.githubStars),
        categories,
        tags,
        skill_markdown: skillMarkdown || null,
        skill_markdown_length: responseMarkdown.length,
        skill_markdown_truncated: responseMarkdown.truncated,
        markdown_verified: Boolean(skillMarkdown),
        verification_status: skillMarkdown ? 'verified_skill_markdown' : 'source_only',
        status: syncStatus(row.status),
        collected_at: row.collectedAt.toISOString(),
        updated_at: group.updatedAt.toISOString(),
      }
    }

    const data: Array<NonNullable<Awaited<ReturnType<typeof buildResponseItem>>>> = []
    let cursor = start
    let inspected = 0
    const maxInspect = Math.min(apiGroups.length - start, fetchMissingMarkdown ? Math.max(limit * 5, 100) : Math.max(limit * 20, 1000))
    while (data.length < limit && cursor < apiGroups.length && inspected < maxInspect) {
      const batchSize = Math.min(Math.max(limit, 20), apiGroups.length - cursor, maxInspect - inspected)
      const batchGroups = apiGroups.slice(cursor, cursor + batchSize)
      const batch = await mapWithConcurrency(batchGroups, 4, async (group, index) => buildResponseItem(group, inspected + index))
      cursor += batchGroups.length
      inspected += batchGroups.length
      for (const item of batch) {
        if (!item) continue
        data.push(item)
        if (data.length >= limit) break
      }
    }

    const hasMore = cursor < apiGroups.length

    return NextResponse.json({
      data,
      page,
      limit,
      has_more: hasMore,
      next_page: hasMore ? page + 1 : null,
      dedupe_mode: 'github_skill',
      markdown_mode: verifiedOnly
        ? (fetchMissingMarkdown ? 'verified_stored_or_fetch_missing' : 'stored_verified_only')
        : (fetchMissingMarkdown ? 'all_candidates_stored_or_fetch_missing' : 'all_candidates'),
      verified_only: verifiedOnly,
      total_raw: rows.length,
      total_raw_with_github_repo: groupedRawRows,
      total_raw_without_github_repo: rows.length - groupedRawRows,
      total: apiGroups.length,
      total_verified: verifiedOnly ? verifiedGroups.length : null,
      total_before_markdown_filter: filteredGroups.length,
      total_before_star_filter: starThreshold === null ? allGroups.length : null,
      deduped: groupedRawRows - allGroups.length,
      star_filter: starThreshold === null ? null : {
        field: 'github_stars',
        operator: '>',
        value: starThreshold,
        prefilter: 'external_skills.stars',
      },
      date_filter_enabled: hasDateFilter,
      date_field: dateFieldParam.apiField,
      sync_window: {
        from_date: fromDateParam || null,
        to_date: toDateParam || null,
        date_filter_enabled: hasDateFilter,
        date_field: dateFieldParam.apiField,
        effective_from_date: dateOnlyString(from),
        effective_to_date: dateOnlyString(to),
      },
    }, { headers: noStoreHeaders() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return jsonError(500, 'internal_error', message)
  }
}
