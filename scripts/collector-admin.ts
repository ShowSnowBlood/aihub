import { PrismaClient } from '@prisma/client'
import { existsSync, readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { classifySkill, semanticSkillTags } from '../src/lib/skill-classifier'
import { buildKnowledgeVectors } from '../src/lib/knowledge-vector'
import { generateDeepSeekGrowthPlan } from '../src/lib/deepseek-orchestrator'

const prisma = new PrismaClient()

loadLocalEnv()

type CandidateType = 'news' | 'github' | 'skill' | 'prompt'

function arg(name: string, fallback?: string) {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  return process.argv[index + 1] || fallback
}

function hasFlag(name: string) {
  return process.argv.includes(name)
}

function toInt(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function trim(value?: string | null, size = 90) {
  if (!value) return ''
  return value.length > size ? `${value.slice(0, size - 3)}...` : value
}

function makeSlug(value: string, fallbackPrefix = 'item') {
  const base = value
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
  return base || `${fallbackPrefix}-${Date.now().toString(36)}`
}

function splitList(value?: string | null) {
  if (!value) return []
  return value
    .split(/,|\n/)
    .map(item => item.trim())
    .filter(Boolean)
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
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

function loadLocalEnv() {
  for (const fileName of ['.env.local', '.env']) {
    const filePath = path.join(process.cwd(), fileName)
    if (!existsSync(filePath)) continue

    const content = readFileSync(filePath, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (!match) continue
      const [, key, rawValue] = match
      if (process.env[key]) continue
      process.env[key] = parseEnvValue(rawValue)
    }
  }
}

function githubHeaders() {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'AIHub-GitHub-Skill-Enricher/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  return headers
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function githubJson(url: string, retries = 2) {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { headers: githubHeaders() })
      if (response.ok) return response.json()
      if (![403, 408, 429, 500, 502, 503, 504].includes(response.status) || attempt >= retries) {
        throw new Error(`GitHub API ${response.status}: ${url}`)
      }
      lastError = new Error(`GitHub API ${response.status}: ${url}`)
    } catch (error) {
      lastError = error
      if (attempt >= retries) break
    }
    await sleep(900 * (attempt + 1))
  }
  throw lastError instanceof Error ? lastError : new Error(`GitHub fetch failed: ${url}`)
}

function githubRepoFromUrl(value?: string | null) {
  if (!value) return ''
  try {
    const url = new URL(value)
    if (!/^github\.com$/i.test(url.hostname)) return ''
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return ''
    return normalizeGithubRepoKey(`${parts[0]}/${parts[1]}`)
  } catch {
    return normalizeGithubRepoKey(value)
  }
}

function githubRepoFromSkill(row: { sourceUrl?: string | null; githubUrl?: string | null; homepageUrl?: string | null; downloadUrl?: string | null; rawData?: string | null }) {
  const raw = parseJson<Record<string, any>>(row.rawData, {})
  const item = raw.item && typeof raw.item === 'object' ? raw.item : {}
  const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
  return normalizeGithubRepoKey(firstString(
    raw.originalRepo,
    github.originalRepo,
    raw.installRepo,
    github.installRepo,
    githubRepoFromUrl(raw.originalGithubUrl),
    githubRepoFromUrl(github.originalGithubUrl),
    githubRepoFromUrl(row.downloadUrl),
    githubRepoFromUrl(raw.installGitUrl),
    githubRepoFromUrl(github.installGitUrl),
    github.repo,
    raw.repo,
    raw.sourceRepo,
    raw.source,
    item.source,
    githubRepoFromUrl(row.homepageUrl),
    githubRepoFromUrl(row.githubUrl),
    githubRepoFromUrl(row.sourceUrl),
    githubRepoFromUrl(raw.githubUrl),
    githubRepoFromUrl(raw.sourceUrl),
    githubRepoFromUrl(raw.repoUrl),
    githubRepoFromUrl(raw.github?.repoUrl),
    githubRepoFromUrl(item.githubUrl),
    githubRepoFromUrl(item.github_url),
    githubRepoFromUrl(item.html_url),
  ))
}

function githubPublishedRepoFromSkill(row: { sourceUrl?: string | null; githubUrl?: string | null; rawData?: string | null }) {
  const raw = parseJson<Record<string, any>>(row.rawData, {})
  const item = raw.item && typeof raw.item === 'object' ? raw.item : {}
  const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
  return normalizeGithubRepoKey(firstString(
    githubRepoFromUrl(row.sourceUrl),
    githubRepoFromUrl(raw.skillMdUrl),
    githubRepoFromUrl(github.skillMdUrl),
    raw.sourceRepo,
    github.sourceRepo,
    raw.repo,
    raw.source,
    item.source,
    githubRepoFromUrl(raw.sourceRepoUrl),
    githubRepoFromUrl(raw.sourceUrl),
    githubRepoFromUrl(row.githubUrl),
  ))
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

function githubInfoFromRaw(rawData?: string | null) {
  const raw = parseJson<Record<string, any>>(rawData, {})
  const item = raw.item && typeof raw.item === 'object' ? raw.item : {}
  const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
  const repo = normalizeGithubRepoKey(firstString(raw.originalRepo, github.originalRepo, raw.installRepo, github.installRepo, github.repo, raw.repo, raw.sourceRepo, raw.source, item.source))
  const stars = toInt(String(github.stars ?? raw.stars ?? 0), 0)
  const forks = toInt(String(github.forks ?? raw.forks ?? 0), 0)
  const releaseDownloads = toInt(String(github.releaseDownloads ?? 0), 0)
  const installs = toInt(String(raw.installs ?? item.installs ?? 0), 0)
  const downloads = Math.max(releaseDownloads, installs)
  const skillPath = firstString(raw.skillMdPath, github.skillMdPath, github.skillPath, raw.file)
  return { repo, stars, forks, downloads, skillPath }
}

function githubMetricsForPublishedRepo(row: { sourceUrl?: string | null; rawData?: string | null }, repo: string) {
  const raw = parseJson<Record<string, any>>(row.rawData, {})
  const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
  const normalizedRepo = normalizeGithubRepoKey(repo)
  const metricRepo = normalizeGithubRepoKey(firstString(
    github.repo,
    raw.originalRepo,
    raw.installRepo,
    raw.repo,
  ))
  const sourceRepo = githubPublishedRepoFromSkill(row)
  if (!normalizedRepo || normalizedRepo.toLowerCase() !== sourceRepo.toLowerCase()) {
    return { stars: 0, forks: 0, downloads: 0 }
  }
  if (metricRepo && metricRepo.toLowerCase() !== normalizedRepo.toLowerCase()) {
    return { stars: 0, forks: 0, downloads: 0 }
  }
  const info = githubInfoFromRaw(row.rawData)
  return {
    stars: toNumberValue(info.stars),
    forks: toNumberValue(info.forks),
    downloads: toNumberValue(info.downloads),
  }
}

function githubMetricsFromRow(row: {
  rawData?: string | null
  stars?: number | null
  forks?: number | null
  downloads?: number | null
}) {
  const info = githubInfoFromRaw(row.rawData)
  return {
    stars: Math.max(toNumberValue(row.stars), info.stars),
    forks: Math.max(toNumberValue(row.forks), info.forks),
    downloads: Math.max(toNumberValue(row.downloads), info.downloads),
  }
}

async function githubReleaseStats(repo: string, perPage: number) {
  if (perPage <= 0) return { releaseDownloads: 0, releaseCount: 0, latestRelease: null as any }
  const releases = await githubJson(`https://api.github.com/repos/${repo}/releases?per_page=${Math.min(perPage, 100)}`)
    .catch(() => [])
  const list = Array.isArray(releases) ? releases : []
  let releaseDownloads = 0
  for (const release of list) {
    for (const asset of release.assets || []) {
      releaseDownloads += toInt(String(asset.download_count || 0), 0)
    }
  }
  const latest = list[0]
  return {
    releaseDownloads,
    releaseCount: list.length,
    latestRelease: latest ? {
      tagName: latest.tag_name,
      name: latest.name,
      url: latest.html_url,
      publishedAt: latest.published_at,
    } : null,
  }
}

function scoreWithGithubSignals(current: number, stars: number, downloads: number, forks: number) {
  const starScore = stars > 0 ? Math.floor(Math.log10(stars + 1) * 14) : 0
  const downloadScore = downloads > 0 ? Math.floor(Math.log10(downloads + 1) * 8) : 0
  const forkScore = forks > 0 ? Math.floor(Math.log10(forks + 1) * 8) : 0
  return Math.min(100, Math.max(current, 40 + starScore + downloadScore + forkScore))
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function toNumberValue(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

const sourceTopicKeywordMap: Record<string, string[]> = {
  'github-python-crawler-skill-index': [
    'scrapling',
    'D4Vinci/Scrapling',
    'scrapy',
    'playwright',
    'selenium',
    'beautifulsoup',
    'bs4',
    'lxml',
    'parsel',
    'xpath',
    'css selector',
    'httpx',
    'aiohttp',
    'firecrawl',
    'crawl4ai',
    'web scraping',
    'stealth scraping',
    'adaptive scraping',
    'anti bot',
    'anti-bot',
    'proxy rotation',
    'spider',
    'scraper',
    'data extraction',
    'browser automation',
    '爬虫',
    '采集',
    '抓取',
  ],
  'github-cybersecurity-skill-index': [
    'shannon',
    'KeygraphHQ/shannon',
    'unicodeveloper/shannon',
    'hacker',
    'hacker skills',
    'AI pentester',
    'offensive security',
    'pentest',
    'penetration testing',
    'web exploitation',
    'red team',
    'blue team',
    'ctf',
    'pwn',
    'reverse engineering',
    'reversing',
    'forensics',
    'malware analysis',
    'osint',
    'bug bounty',
    'burp',
    'nmap',
    'metasploit',
    'kali',
    'owasp',
    'appsec',
    'vulnerability',
    'exploit',
    'bug hunter',
    'bug-hunter',
    'bug hunting',
    'vuln hunting',
    'web-vuln',
    'credential attack',
    'password spray',
    'security vulnerabilities',
    'secure code',
    'secure web applications',
    'sast',
    'semgrep',
    'yara',
    'sigma',
    '安全',
    '渗透',
    '漏洞',
    '攻防',
    '审计',
  ],
}

const crawlerCoreTerms = [
  'scrapling',
  'D4Vinci/Scrapling',
  'scrapy',
  'beautifulsoup',
  'bs4',
  'lxml',
  'parsel',
  'xpath',
  'css selector',
  'firecrawl',
  'crawl4ai',
  'web scraping',
  'stealth scraping',
  'adaptive scraping',
  'anti bot',
  'anti-bot',
  'proxy rotation',
  'spider',
  'scraper',
]

const crawlerAutomationTerms = [
  'playwright',
  'selenium',
  'browser automation',
  'httpx',
  'aiohttp',
]

const crawlerContextTerms = [
  'scraping',
  'crawler',
  'crawl',
  'scraper',
  'spider',
  'data extraction',
  'html parser',
  'xpath',
  'css selector',
  'anti bot',
  'proxy rotation',
  '爬虫',
  '采集',
  '抓取',
]

const cybersecurityCoreTerms = [
  'shannon',
  'KeygraphHQ/shannon',
  'unicodeveloper/shannon',
  'hacker',
  'hacker skills',
  'AI pentester',
  'offensive security',
  'pentest',
  'penetration testing',
  'web exploitation',
  'red team',
  'blue team',
  'ctf',
  'pwn',
  'reverse engineering',
  'reversing',
  'forensics',
  'malware analysis',
  'osint',
  'bug bounty',
  'burp',
  'nmap',
  'metasploit',
  'kali',
  'owasp',
  'appsec',
  'vulnerability',
  'exploit',
  'bug hunter',
  'bug-hunter',
  'bug hunting',
  'vuln hunting',
  'web-vuln',
  'credential attack',
  'password spray',
  'security audit',
  'security audits',
  'security vulnerabilities',
  'secure code',
  'secure web applications',
  'web security',
  'code security',
  'sast',
  'semgrep',
  'yara',
  'sigma',
  'threat intelligence',
  'incident response',
  '安全',
  '渗透',
  '漏洞',
  '攻防',
]

const sourceExclusionKeywordMap: Record<string, string[]> = {
  'github-python-crawler-skill-index': [
    'copywriting',
    'content writing',
    'marketing',
    'sales',
    'crm',
    'resume writing',
    'cv writing',
    'recruiting',
    'powerpoint',
    'spreadsheet',
    'prompt library',
    '运营',
    '营销',
    '销售',
    '招聘',
  ],
  'github-cybersecurity-skill-index': [
    'copywriting',
    'content writing',
    'marketing',
    'sales',
    'crm',
    'resume writing',
    'cv writing',
    'recruiting',
    'powerpoint',
    'spreadsheet',
    'prompt library',
    '运营',
    '营销',
    '销售',
    '招聘',
  ],
}

const aggregateSkillRepoNameKeywords = [
  'awesome',
  'collection',
  'marketplace',
  'directory',
  'catalog',
  'registry',
  'skill-exchange',
  'skills-exchange',
  'skill-library',
  'skills-library',
  'skills-for',
  'agentskillexchange',
  'agent-skills',
  'claude-skills',
  'codex-skills',
  'application-skills',
  'oh-my-claude-skills',
  'antigravity',
]

const TOOL_CAPABILITY_STATE_FILE = '.collector-state/tool-capabilities.json'

type CapabilityEntry = {
  value: string
  count: number
}

type CapabilityRepo = {
  repo: string
  count: number
  stars: number
  forks: number
  downloads: number
  sourceUrl: string
}

type ToolCapabilityProfile = {
  label: string
  sourceSlug: string
  sourceSlugs: string[]
  skillCount: number
  activeSkillCount: number
  repoCount: number
  queryCount: number
  keywordCount: number
  generatedAt: string
  topKeywords: CapabilityEntry[]
  topRepos: CapabilityRepo[]
  categories: CapabilityEntry[]
  codeQueries: string[]
  repoQueries: string[]
  topicKeywords: string[]
  toolHints: string[]
  safeModeHints: string[]
  sampleSkills: Array<{
    id: number
    name: string
    repo: string
    sourceUrl: string | null
    stars: number
    score: number
  }>
}

type ToolCapabilityHistoryProfile = {
  sourceSlug: string
  label: string
  skillCount: number
  activeSkillCount: number
  repoCount: number
  queryCount: number
  keywordCount: number
}

type ToolCapabilityHistoryEntry = {
  generatedAt: string
  totalProfiles: number
  totalSkills: number
  totalActiveSkills: number
  totalRepos: number
  totalQueries: number
  totalKeywords: number
  profiles: Record<string, ToolCapabilityHistoryProfile>
}

type ToolCapabilityState = {
  version: number
  generatedAt: string
  source: string
  safetyPolicy: {
    mode: string
    notes: string[]
  }
  profiles: Record<string, ToolCapabilityProfile>
  history?: ToolCapabilityHistoryEntry[]
}

const capabilityKeywordCatalog: Record<string, string[]> = {
  'github-python-crawler-skill-index': [
    'python',
    'web scraping',
    'scrapling',
    'D4Vinci/Scrapling',
    'scrapy',
    'playwright',
    'selenium',
    'beautifulsoup',
    'bs4',
    'httpx',
    'aiohttp',
    'lxml',
    'parsel',
    'xpath',
    'css selector',
    'browser automation',
    'stealth scraping',
    'adaptive scraping',
    'anti bot',
    'anti-bot',
    'proxy rotation',
    'spider',
    'scraper',
    'rate limit',
    'retry',
    'captcha',
    'data extraction',
    'api extraction',
    'crawl4ai',
    'firecrawl',
    '爬虫',
    '采集',
    '抓取',
    '网页解析',
  ],
  'github-cybersecurity-skill-index': [
    'shannon',
    'KeygraphHQ/shannon',
    'unicodeveloper/shannon',
    'hacker',
    'hacker skills',
    'AI pentester',
    'offensive security',
    'pentest',
    'penetration testing',
    'web exploitation',
    'vulnerability',
    'red team',
    'blue team',
    'ctf',
    'pwn',
    'reverse engineering',
    'reversing',
    'forensics',
    'malware analysis',
    'osint',
    'bug bounty',
    'exploit',
    'bug hunter',
    'bug-hunter',
    'bug hunting',
    'vuln hunting',
    'web-vuln',
    'credential attack',
    'password spray',
    'security vulnerabilities',
    'secure code',
    'secure web applications',
    'appsec',
    'web security',
    'owasp',
    'burp',
    'kali',
    'nmap',
    'metasploit',
    'yara',
    'sigma',
    'semgrep',
    'sast',
    'secret scanning',
    'threat intelligence',
    'incident response',
    'hardening',
    'defensive',
    '安全',
    '渗透',
    '漏洞',
    '攻防',
    '审计',
    '威胁情报',
    '应急响应',
  ],
}

const capabilityStopWords = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'into',
  'your',
  'you',
  'are',
  'can',
  'will',
  'skill',
  'skills',
  'agent',
  'agents',
  'claude',
  'codex',
  'github',
  'readme',
  'using',
  'use',
  'based',
  'tools',
  'tool',
  'data',
  'file',
  'files',
  'skill.md',
  'skills.md',
  'readme.md',
  'blob',
  'tree',
  'head',
  'main',
  'raw',
  'https',
  'http',
  'www',
  'com',
  'github.com',
  'githubusercontent',
  'githubusercontent.com',
  'raw.githubusercontent.com',
  'filename',
  'path',
  'description',
  'category',
  'tags',
  'summary',
  'metadata',
  'engineering',
  'general',
  'project',
  'projects',
  'repository',
  'repo',
  'source',
  'workflow',
  'scrapling 风格爬虫采集',
  'shannon 黑客技能库',
  '代码与工程',
  '项目解析',
  '通用',
  '自动摘要',
  'github 源仓库',
])

const mojibakeFragments = [
  '鐖',
  '閲',
  '瀹',
  '缃',
  '鏀',
  '鍒',
  '鍙',
  '濞',
  '搴',
  '鎶',
  '鑳',
  '鎬',
  '琛',
  '淇',
  '椋',
  '鏂',
  '绌',
  '绋',
  '璇',
  '妯',
  '鍏',
  '浠',
  '邃',
  '鈥',
  '銆',
  '€',
  '�',
]

function isLikelyMojibake(value: string) {
  return mojibakeFragments.some(fragment => value.includes(fragment))
}

function isUsefulCapabilityKeyword(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return false
  if (normalized.length < 3 && !/[\u4e00-\u9fff]{2}/.test(normalized)) return false
  if (capabilityStopWords.has(normalized)) return false
  if (isLikelyMojibake(value)) return false
  if (/^(when|then|that|this|from|with|into|after|before|about)$/.test(normalized)) return false
  if (/^[a-f0-9]{7,}$/i.test(normalized)) return false
  return true
}

function toolCapabilityStatePath() {
  return path.join(process.cwd(), TOOL_CAPABILITY_STATE_FILE)
}

function compactList(values: string[], limit: number) {
  const seen = new Set<string>()
  const list: string[] = []
  for (const value of values) {
    const trimmed = value.trim().replace(/\s+/g, ' ')
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) continue
    seen.add(key)
    list.push(trimmed)
    if (list.length >= limit) break
  }
  return list
}

function addCount(map: Map<string, number>, value: string, amount = 1) {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!isUsefulCapabilityKeyword(normalized)) return
  map.set(normalized, (map.get(normalized) || 0) + amount)
}

function topEntries(map: Map<string, number>, limit: number): CapabilityEntry[] {
  return Array.from(map.entries())
    .filter(([value]) => isUsefulCapabilityKeyword(value))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }))
}

function githubQueryTerm(keyword: string) {
  const cleaned = keyword.trim().replace(/["']/g, '').replace(/\s+/g, ' ')
  if (!cleaned) return ''
  return /\s/.test(cleaned) ? `"${cleaned}"` : cleaned
}

function capabilityText(row: {
  name?: string | null
  description?: string | null
  category?: string | null
  categoryZh?: string | null
  tags?: string | null
  tagsZh?: string | null
  useCases?: string | null
  sourceUrl?: string | null
  githubUrl?: string | null
  rawData?: string | null
}) {
  const raw = parseJson<Record<string, any>>(row.rawData, {})
  const item = raw.item && typeof raw.item === 'object' ? raw.item : {}
  const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
  return [
    row.name,
    row.description,
    row.category,
    row.categoryZh,
    row.tags,
    row.tagsZh,
    row.useCases,
    row.sourceUrl,
    row.githubUrl,
    raw.repo,
    raw.file,
    raw.source,
    raw.skillId,
    raw.indexQuery,
    github.repo,
    github.description,
    github.language,
    Array.isArray(github.topics) ? github.topics.join(' ') : '',
    github.skillPath,
    item.source,
    item.skillId,
    item.description,
  ].filter(Boolean).join(' ')
}

function keywordInText(text: string, keyword: string) {
  const normalized = keyword.trim().toLowerCase()
  return normalized ? text.includes(normalized) : false
}

function hasAnyKeyword(text: string, keywords: string[]) {
  return keywords.some(keyword => keywordInText(text, keyword))
}

function hasExcludedKeyword(text: string, sourceSlug?: string | null) {
  const exclusions = sourceExclusionKeywordMap[String(sourceSlug || '')] || []
  return hasAnyKeyword(text, exclusions)
}

function isAggregateSkillRepo(repo?: string | null) {
  const normalized = normalizeGithubRepoKey(repo)
  if (!normalized) return false
  const repoName = normalized.split('/')[1]?.toLowerCase() || normalized.toLowerCase()
  if (repoName === 'skills') return true
  if (repoName.endsWith('-skills') || repoName.endsWith('_skills')) return true
  return aggregateSkillRepoNameKeywords.some(keyword => repoName.includes(keyword))
}

function matchesCrawlerCapabilityText(text: string) {
  if (hasAnyKeyword(text, crawlerCoreTerms)) return true
  return hasAnyKeyword(text, crawlerAutomationTerms) && hasAnyKeyword(text, crawlerContextTerms)
}

function matchesCybersecurityCapabilityText(text: string) {
  return hasAnyKeyword(text, cybersecurityCoreTerms)
}

function addCatalogKeywordMatches(map: Map<string, number>, text: string, catalog: string[]) {
  const haystack = text.toLowerCase()
  for (const keyword of catalog) {
    if (haystack.includes(keyword.toLowerCase())) addCount(map, keyword)
  }
}

function addTokenKeywords(map: Map<string, number>, text: string) {
  const tokens = text
    .toLowerCase()
    .match(/[a-z][a-z0-9+_.-]{2,}|[\u4e00-\u9fff]{2,}/g) || []
  for (const token of tokens) {
    if (capabilityStopWords.has(token)) continue
    if (/^\d+$/.test(token)) continue
    addCount(map, token)
  }
}

function sourceCapabilityLabel(sourceSlug: string) {
  if (sourceSlug === 'github-python-crawler-skill-index') return 'Scrapling 风格爬虫采集能力'
  if (sourceSlug === 'github-cybersecurity-skill-index') return 'Shannon 黑客技能库能力'
  return sourceSlug
}

function capabilityToolHints(sourceSlug: string, topKeywords: CapabilityEntry[]) {
  const keywordValues = new Set(topKeywords.map(item => item.value.toLowerCase()))
  if (sourceSlug === 'github-python-crawler-skill-index') {
    const hints = [
      '只收真实采集工具链能力：Scrapling、Scrapy、Playwright/Selenium scraping、Firecrawl、crawl4ai、BeautifulSoup/lxml/parsel。',
      '静态 HTML 用 httpx/aiohttp + BeautifulSoup/lxml/parsel，动态列表页再用 Scrapling 或 Playwright 模拟滚动和点击。',
      '每条 Skill 必须能追溯到 GitHub 源仓库、SKILL.md 或工具 README，不把普通 agent 整合库当成能力源。',
      '大规模采集启用速率限制、断点续爬、失败重试、内容指纹、源仓库 star/fork 校验和原始 URL 保留。',
    ]
    if (keywordValues.has('scrapy')) hints.push('发现 Scrapy 相关能力时，适合把站点列表页扩展为队列式广度采集。')
    if (keywordValues.has('scrapling')) hints.push('发现 Scrapling 相关能力时，适合处理反爬较强、结构变化频繁的公开页面。')
    if (keywordValues.has('playwright')) hints.push('发现 Playwright 相关能力时，只在 scraping/browser automation 语境下纳入能力池。')
    return hints
  }

  return [
    '按 Shannon 黑客技能库方向收录：AI pentester、offensive security、red/blue team、CTF、OSINT、逆向、取证和 malware analysis。',
    '只保存元数据、分类、GitHub 源位置、stars/forks/license、README/SKILL.md 摘要和审核标签。',
    '涉及红队、渗透、漏洞利用的内容不执行外部目标扫描，不采集凭据，不绕过访问控制。',
    '后台默认把 offensive 标签交给人工审核，能力池只用于索引、分类和来源追溯。',
  ]
}

function capabilitySafeModeHints(sourceSlug: string) {
  if (sourceSlug === 'github-cybersecurity-skill-index') {
    return [
      'metadata-only',
      'no exploit execution',
      'no unauthorized scanning',
      'no credential collection',
      'keep GitHub source traceability',
      'manual review required for offensive labels',
    ]
  }
  return [
    'respect robots and public access boundaries',
    'rate-limit requests',
    'prefer official APIs',
    'preserve original source URLs',
    'do not bypass login, paywall, captcha, or access controls',
  ]
}

function buildCapabilityQueries(sourceSlug: string, topKeywords: CapabilityEntry[]) {
  const baseTerms = sourceSlug === 'github-python-crawler-skill-index'
    ? [
      'web scraping',
      'scrapling',
      'scrapy',
      'scrapy spider',
      'playwright scraping',
      'selenium scraping',
      'beautifulsoup',
      'firecrawl',
      'crawl4ai',
      'stealth scraping',
      'browser automation scraping',
    ]
    : [
      'shannon hacker',
      'AI pentester',
      'offensive security',
      'penetration testing',
      'web exploitation',
      'red team',
      'blue team',
      'ctf pwn',
      'reverse engineering',
      'osint',
      'malware analysis',
    ]
  const catalog = capabilityKeywordCatalog[sourceSlug] || []
  const catalogSet = new Set(catalog.map(item => item.toLowerCase()))
  const selected = compactList([
    ...baseTerms,
    ...topKeywords
      .map(item => item.value)
      .filter(keyword => catalogSet.has(keyword.toLowerCase())),
  ], 28)
  const codeQueries = compactList(selected.flatMap(keyword => {
    const term = githubQueryTerm(keyword)
    if (!term) return []
    return [
      `filename:SKILL.md ${term}`,
      `path:skills filename:SKILL.md ${term}`,
    ]
  }), 90)
  const repoQueries = compactList(selected.flatMap(keyword => {
    const term = githubQueryTerm(keyword)
    if (!term) return []
    return [
      `${term} skills stars:>5`,
      `${term} SKILL.md stars:>5`,
    ]
  }), 60)
  return { codeQueries, repoQueries }
}

async function buildCapabilityProfileForSource(sourceSlug: string, limit: number): Promise<ToolCapabilityProfile> {
  const allRows = await prisma.externalSkill.findMany({
    where: {
      sourceSlug,
    },
    orderBy: [{ heatScore: 'desc' }, { qualityScore: 'desc' }, { updatedAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      sourceSlug: true,
      name: true,
      description: true,
      category: true,
      categoryZh: true,
      tags: true,
      tagsZh: true,
      useCases: true,
      sourceUrl: true,
      githubUrl: true,
      rawData: true,
      status: true,
      qualityScore: true,
      heatScore: true,
    },
  })
  const rows = allRows.filter(row => {
    if (['low_quality', 'out_of_scope'].includes(row.status || '')) return false
    return externalSkillMatchesTopic(row)
  })

  const keywordCounts = new Map<string, number>()
  const categoryCounts = new Map<string, number>()
  const repoCounts = new Map<string, CapabilityRepo>()
  const catalog = capabilityKeywordCatalog[sourceSlug] || sourceTopicKeywordMap[sourceSlug] || []

  for (const row of rows) {
    const text = capabilityText(row)
    addCatalogKeywordMatches(keywordCounts, text, catalog)
    addTokenKeywords(keywordCounts, text)
    addCount(categoryCounts, row.categoryZh || row.category || '未分类')

    const repo = githubPublishedRepoFromSkill(row)
    if (!repo) continue
    if (isPlaceholderGithubRepo(repo)) continue
    const info = githubMetricsForPublishedRepo(row, repo)
    const current = repoCounts.get(repo) || {
      repo,
      count: 0,
      stars: 0,
      forks: 0,
      downloads: 0,
      sourceUrl: githubRepoUrl(repo),
    }
    current.count += 1
    current.stars = Math.max(current.stars, toNumberValue(info.stars))
    current.forks = Math.max(current.forks, toNumberValue(info.forks))
    current.downloads = Math.max(current.downloads, toNumberValue(info.downloads))
    current.sourceUrl = firstString(row.sourceUrl, githubRepoUrl(repo), current.sourceUrl)
    repoCounts.set(repo, current)
  }

  const topKeywords = topEntries(keywordCounts, 36)
  const topRepos = Array.from(repoCounts.values())
    .sort((a, b) => b.stars - a.stars || b.count - a.count || b.forks - a.forks || a.repo.localeCompare(b.repo))
    .slice(0, 40)
  const generatedQueries = buildCapabilityQueries(sourceSlug, topKeywords)
  const topicKeywords = compactList([
    ...(sourceTopicKeywordMap[sourceSlug] || []),
    ...catalog,
    ...topKeywords
      .map(item => item.value)
      .filter(keyword => catalog.map(value => value.toLowerCase()).includes(keyword.toLowerCase())),
  ], 80)

  return {
    label: sourceCapabilityLabel(sourceSlug),
    sourceSlug,
    sourceSlugs: [sourceSlug],
    skillCount: allRows.length,
    activeSkillCount: rows.length,
    repoCount: repoCounts.size,
    queryCount: generatedQueries.codeQueries.length + generatedQueries.repoQueries.length,
    keywordCount: topKeywords.length,
    generatedAt: new Date().toISOString(),
    topKeywords,
    topRepos,
    categories: topEntries(categoryCounts, 16),
    codeQueries: generatedQueries.codeQueries,
    repoQueries: generatedQueries.repoQueries,
    topicKeywords,
    toolHints: capabilityToolHints(sourceSlug, topKeywords),
    safeModeHints: capabilitySafeModeHints(sourceSlug),
    sampleSkills: rows
      .map(row => {
        const repo = githubPublishedRepoFromSkill(row)
        const info = githubMetricsForPublishedRepo(row, repo)
        return {
          id: row.id,
          name: row.name,
          repo,
          sourceUrl: row.sourceUrl,
          stars: toNumberValue(info.stars),
          score: Math.max(row.heatScore || 0, row.qualityScore || 0),
        }
      })
      .filter(row => row.repo && !isPlaceholderGithubRepo(row.repo))
      .slice(0, 12),
  }
}

let toolCapabilityStateCache: ToolCapabilityState | null | undefined

function loadToolCapabilityState(): ToolCapabilityState | null {
  if (toolCapabilityStateCache !== undefined) return toolCapabilityStateCache
  const statePath = toolCapabilityStatePath()
  if (!existsSync(statePath)) {
    toolCapabilityStateCache = null
    return toolCapabilityStateCache
  }
  try {
    toolCapabilityStateCache = JSON.parse(readFileSync(statePath, 'utf8')) as ToolCapabilityState
    return toolCapabilityStateCache
  } catch {
    toolCapabilityStateCache = null
    return toolCapabilityStateCache
  }
}

function topicKeywordsForSource(sourceSlug?: string | null) {
  const slug = String(sourceSlug || '')
  const profile = loadToolCapabilityState()?.profiles?.[slug]
  return compactList([
    ...(sourceTopicKeywordMap[slug] || []),
    ...(Array.isArray(profile?.topicKeywords) ? profile.topicKeywords : []),
  ], 120)
}

function capabilityHistoryEntry(generatedAt: string, profiles: Record<string, ToolCapabilityProfile>): ToolCapabilityHistoryEntry {
  const values = Object.values(profiles)
  const historyProfiles = Object.fromEntries(values.map(profile => [
    profile.sourceSlug,
    {
      sourceSlug: profile.sourceSlug,
      label: profile.label,
      skillCount: profile.skillCount,
      activeSkillCount: profile.activeSkillCount,
      repoCount: profile.repoCount,
      queryCount: profile.queryCount,
      keywordCount: profile.keywordCount,
    },
  ]))

  return {
    generatedAt,
    totalProfiles: values.length,
    totalSkills: values.reduce((sum, profile) => sum + Number(profile.skillCount || 0), 0),
    totalActiveSkills: values.reduce((sum, profile) => sum + Number(profile.activeSkillCount || 0), 0),
    totalRepos: values.reduce((sum, profile) => sum + Number(profile.repoCount || 0), 0),
    totalQueries: values.reduce((sum, profile) => sum + Number(profile.queryCount || 0), 0),
    totalKeywords: values.reduce((sum, profile) => sum + Number(profile.keywordCount || 0), 0),
    profiles: historyProfiles,
  }
}

function externalSkillMatchesTopic(row: {
  name?: string | null
  description?: string | null
  category?: string | null
  categoryZh?: string | null
  tags?: string | null
  tagsZh?: string | null
  useCases?: string | null
  sourceSlug?: string | null
  sourceUrl?: string | null
  githubUrl?: string | null
  rawData?: string | null
}) {
  const sourceSlug = String(row.sourceSlug || '')
  const strictSource = sourceSlug === 'github-python-crawler-skill-index' || sourceSlug === 'github-cybersecurity-skill-index'
  const haystack = capabilityText(row).toLowerCase()

  const repo = strictSource ? githubRepoFromSkill(row) : ''
  if (strictSource && !repo) return false
  if (strictSource && isPlaceholderGithubRepo(repo)) return false
  if (strictSource && isAggregateSkillRepo(repo)) return false
  if (strictSource && hasExcludedKeyword(haystack, sourceSlug)) return false
  if (sourceSlug === 'github-python-crawler-skill-index') return matchesCrawlerCapabilityText(haystack)
  if (sourceSlug === 'github-cybersecurity-skill-index') return matchesCybersecurityCapabilityText(haystack)

  const keywords = topicKeywordsForSource(row.sourceSlug)
  if (keywords.length === 0) return true
  return keywords.some(keyword => haystack.includes(keyword.toLowerCase()))
}

function isGithubRepoKey(value?: string | null) {
  if (!value) return false
  const trimmed = value.trim().replace(/^\/+|\/+$/g, '')
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed) && !trimmed.includes('..')
}

function normalizeGithubRepoKey(value?: string | null) {
  if (!value) return ''
  const trimmed = value.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/^\/+|\/+$/g, '')
  const parts = trimmed.split('/').filter(Boolean)
  if (parts.length < 2) return ''
  const repoName = parts[1].replace(/\.git$/i, '')
  const repo = `${parts[0]}/${repoName}`
  return isGithubRepoKey(repo) ? repo : ''
}

function isPlaceholderGithubRepo(value?: string | null) {
  const key = normalizeGithubRepoKey(value).toLowerCase()
  if (!key) return true
  return new Set([
    'owner/repo',
    'org/repo',
    'user/repo',
    'username/repo',
    'example/repo',
    'your/repo',
    'your-org/repo',
    'your-username/repo',
    'github/repo',
  ]).has(key)
}

function githubRepoUrl(repo?: string | null) {
  const key = normalizeGithubRepoKey(repo)
  return key ? `https://github.com/${key}` : ''
}

function githubCloneUrl(repo?: string | null) {
  const key = normalizeGithubRepoKey(repo)
  return key ? `https://github.com/${key}.git` : ''
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

function githubConcreteSourcePath(value?: string | null) {
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

function isConcreteGithubSkillSourceUrl(value?: string | null) {
  const sourcePath = githubConcreteSourcePath(value).toLowerCase()
  if (!sourcePath) return false
  const inSkillDirectory = /(^|\/)(skills?|agent-skills?|claude-skills?)(\/|$)/i.test(sourcePath)
  const isSkillFile = /(^|\/)skill\.(md|mdx)$/i.test(sourcePath)
  const isSkillNamedMarkdown = /(^|\/)[^/]*skill[^/]*\.(md|mdx)$/i.test(sourcePath)
  const isReadmeLike = /(^|\/)(readme|license|contributing|changelog|security|code_of_conduct)\.(md|mdx)$/i.test(sourcePath)
  if (isReadmeLike && !inSkillDirectory) return false
  return isSkillFile || inSkillDirectory || isSkillNamedMarkdown
}

function isPreciseSkillSourceUrl(value?: string | null) {
  if (!value) return false
  try {
    const url = new URL(value)
    if (/^github\.com$/i.test(url.hostname)) {
      return isConcreteGithubSkillSourceUrl(value)
    }
    if (/officialskills\.sh$/i.test(url.hostname)) {
      return url.pathname.split('/').filter(Boolean).length >= 3
    }
    if (/skills\.sh$/i.test(url.hostname)) {
      return url.pathname.split('/').filter(Boolean).length >= 2
    }
    return false
  } catch {
    return false
  }
}

function skillsShMarketplaceUrl(sourceKey?: string | null, skillKey?: string | null) {
  const sourcePart = String(sourceKey || '').trim().replace(/^\/+|\/+$/g, '')
  const skillPart = String(skillKey || '').trim().replace(/^\/+|\/+$/g, '')
  return sourcePart && skillPart ? `https://officialskills.sh/${sourcePart}/${skillPart}` : ''
}

function parseOfficialSkillsUrl(value?: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (!/officialskills\.sh$/i.test(url.hostname)) return null
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    if (parts.length < 3) return null
    const sourceKey = `${parts[0]}/${parts[1]}`
    const skillKey = parts.slice(2).join('/')
    if (!isGithubRepoKey(sourceKey) || !skillKey) return null
    return { sourceKey, skillKey, marketplaceUrl: skillsShMarketplaceUrl(sourceKey, skillKey) }
  } catch {
    return null
  }
}

function skillsShLinkInfo(row: { sourceUrl?: string | null; githubUrl?: string | null; rawData?: string | null; canonicalUrl?: string | null }) {
  const raw = parseJson<Record<string, any>>(row.rawData, {})
  const item = raw.item && typeof raw.item === 'object' ? raw.item : {}
  const official = parseOfficialSkillsUrl(firstString(row.sourceUrl, raw.officialskillsUrl, raw.marketplaceUrl, item.url, item.detailUrl))
  const canonical = String(row.canonicalUrl || raw.externalId || '').replace(/^skills\.sh:/, '')
  const parts = canonical.split('/').filter(Boolean)
  const sourceKey = normalizeGithubRepoKey(firstString(raw.source, item.source, official?.sourceKey, parts.length >= 2 ? `${parts[0]}/${parts[1]}` : ''))
  const skillKey = firstString(raw.skillId, item.skillId, official?.skillKey, parts.length >= 3 ? parts.slice(2).join('/') : '')
  const marketplaceUrl = firstString(raw.marketplaceUrl, raw.officialskillsUrl, official?.marketplaceUrl, skillsShMarketplaceUrl(sourceKey, skillKey))
  const githubUrl = firstString(row.githubUrl, raw.githubUrl, raw.github_url, item.githubUrl, item.github_url, githubRepoUrl(sourceKey))
  return { sourceKey, skillKey, marketplaceUrl, githubUrl, raw }
}

const classificationNoiseTags = new Set([
  'skill',
  'skills',
  'skills.sh',
  'browser-slow',
  'dynamic-browser',
  'scrapling',
  'collector',
  'public-repo',
  'public-page',
  'community',
  'official',
  'skills-sh-api',
  'skills-sh-search-api',
  'skills-sh-browser',
  'search-api',
  '网页搜索与研究',
  '内容写作与改写',
  '代码与工程',
  'RAG 与知识库',
  '数据处理与分析',
  '自动化与工作流',
  '多模态与创意',
  '运营与增长',
  '学习与课程',
  '安全与合规',
  '通用 Agent Skill',
  '外部 Skill 市场',
])

const skillCategoryMap: Array<{ categoryZh: string; keywords: string[] }> = [
  { categoryZh: 'Scrapling 风格爬虫采集', keywords: ['scrapling', 'scrapy', 'web scraping', 'stealth scraping', 'adaptive scraping', 'playwright scraping', 'selenium scraping', 'beautifulsoup', 'bs4', 'lxml', 'parsel', 'firecrawl', 'crawl4ai', 'browser automation scraping', '爬虫', '采集', '抓取', '网页解析'] },
  { categoryZh: 'Shannon 黑客技能库', keywords: ['shannon', 'hacker skills', 'ai pentester', 'offensive security', 'penetration testing', 'pentest', 'web exploitation', 'red team', 'blue team', 'ctf', 'pwn', 'reverse engineering', 'malware analysis', 'osint', 'bug bounty', 'bug hunter', 'bug-hunter', 'security vulnerabilities', 'secure code', '渗透测试', '漏洞', '攻防', '红队', '蓝队', '威胁情报'] },
  { categoryZh: '网页搜索与研究', keywords: ['search', 'research', 'browser-use', 'browser automation', 'firecrawl', 'crawler', '检索', '搜索', '调研'] },
  { categoryZh: '内容写作与改写', keywords: ['write', 'content', 'copy', 'rewrite', 'summar', 'blog', 'social', 'newsletter', '写作', '摘要', '改写'] },
  { categoryZh: '代码与工程', keywords: ['code', 'github', 'repo', 'review', 'test', 'deploy', 'engineering', 'golang', 'go-', 'typescript', 'python', 'react', 'nextjs', 'next.js', 'vite', 'vue', 'azure', 'vercel', 'cloudflare', 'firebase', 'supabase', 'cli', 'sdk', 'api routes', 'agents-cli', 'workspace', 'googleworkspace', 'gws-', 'stitch', '代码', '仓库', '测试'] },
  { categoryZh: 'RAG 与知识库', keywords: ['rag', 'knowledge', 'retrieval', 'vector', 'embedding', 'pdf', '知识库', '向量'] },
  { categoryZh: '数据处理与分析', keywords: ['data', 'spreadsheet', 'excel', 'csv', 'sql', 'analytics', 'chart', '数据', '表格'] },
  { categoryZh: '自动化与工作流', keywords: ['workflow', 'automation', 'agent', 'tool', 'mcp', 'api', '自动化', '工作流', '工具'] },
  { categoryZh: '多模态与创意', keywords: ['image', 'video', 'audio', 'design', 'creative', 'diagram', 'excalidraw', 'canvas', 'visual', '视觉', '图片', '视频'] },
  { categoryZh: '运营与增长', keywords: ['marketing', 'seo', 'sales', 'crm', 'support', '运营', '增长', '客服'] },
  { categoryZh: '学习与课程', keywords: ['learn', 'course', 'tutorial', 'education', '学习', '课程', '教程'] },
  { categoryZh: '安全与合规', keywords: ['security', 'privacy', 'compliance', 'audit', '安全', '合规', '审计'] },
]

function semanticTags(tags: string[] = []) {
  return semanticSkillTags(tags)
}

function classifySkillZh(text: string, fallback = '通用 Agent Skill') {
  return classifySkill({ name: text }, fallback).categoryZh
}

function translateTagsZh(tags: string[]) {
  return classifySkill({ tags }).tagsZh
}

function classificationTextForExternalSkill(item: {
  name: string
  description?: string | null
  tags?: string | null
  rawData?: string | null
}) {
  const tags = splitList(item.tags)
  const raw = parseJson<Record<string, any>>(item.rawData, {})
  const parser = firstString(raw.parser, raw.collectorLabels?.parser)
  const itemRaw = raw.item && typeof raw.item === 'object' ? raw.item : {}
  if (parser === 'skills-sh-search-api') {
    return [
      item.name,
      raw.source,
      raw.skillId,
      itemRaw.source,
      itemRaw.skillId,
      raw.searchQuery,
      semanticTags(tags).join(' '),
    ].filter(Boolean).join(' ')
  }

  return `${item.name} ${item.description || ''} ${semanticTags(tags).join(' ')}`
}

function classifyExternalSkillRow(item: {
  name: string
  description?: string | null
  category?: string | null
  tags?: string | null
  sourceSlug?: string | null
  sourceUrl?: string | null
  githubUrl?: string | null
  rawData?: string | null
}) {
  const raw = parseJson<Record<string, any>>(item.rawData, {})
  const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
  return classifySkill({
    name: item.name,
    description: item.description,
    category: item.category,
    tags: splitList(item.tags),
    sourceSlug: item.sourceSlug,
    sourceUrl: item.sourceUrl,
    githubUrl: firstString(item.githubUrl, raw.githubUrl, raw.github_url, github.url, github.repoUrl),
    repo: firstString(
      raw.originalRepo,
      raw.sourceRepo,
      raw.installRepo,
      raw.repo,
      raw.source,
      github.originalRepo,
      github.sourceRepo,
      github.installRepo,
      github.repo,
    ),
    path: firstString(raw.skillMdPath, raw.file, github.skillMdPath, github.skillPath),
    rawData: raw,
    capabilityKeywords: topicKeywordsForSource(item.sourceSlug).slice(0, 40),
  }, firstString(item.category, '通用 Agent Skill'))
}

function isLowQualitySkillName(name: string) {
  const value = name.trim().toLowerCase()
  if (!value) return true
  if (name.startsWith('@')) return true
  if (name.includes('](https')) return true
  if (name.startsWith('[')) return true
  if (/^20\d{2}-\d{2}-\d{2}$/.test(name)) return true
  if (/^\d+(\.\d+)*$/.test(name)) return true
  if (/^[a-z]+:$/i.test(name)) return true
  if (/^https?:\/\//i.test(name)) return true
  if (/[\\/][^\\/]+\.(toml|json|ya?ml|md|txt|js|ts|tsx|jsx|py|sh)$/i.test(name)) return true
  if (/^\.?[a-z0-9_-]+\.(toml|json|ya?ml|md|txt|js|ts|tsx|jsx|py|sh)$/i.test(name)) return true
  if ([
    'readme',
    'license',
    'contributing',
    'table of contents',
    'contents',
    'install',
    'installation',
    'optional',
    'skills',
    'skill',
    'features',
    'overview',
    'requirements',
    'configuration',
    'getting started',
    'focused by default',
    'pricing',
    'sales',
    'support',
    'enterprise',
    'other',
    'marketing',
    'document ops',
    'it ops',
    'discord',
    'issues',
    'release announcements',
    'detailed docs',
    'smart recommendations',
    'code generation',
    'pre-delivery checks',
    'design system generated',
    'you ask',
    'state management',
    'story behind this skill',
    'main',
    'dev',
  ].includes(value)) return true
  if (/^(view all|learn more|read more|get started|copy|download|sign in|sign up)\b/i.test(name)) return true
  if (/ command reference$/i.test(name)) return true
  if (value.includes('badge') || value.includes('star history') || value.includes('sponsor')) return true
  return false
}

async function uniqueSlug(table: 'news' | 'tool' | 'skill', base: string) {
  let slug = base
  let index = 2

  while (true) {
    const existing =
      table === 'news'
        ? await prisma.news.findUnique({ where: { slug } })
        : table === 'tool'
          ? await prisma.tool.findUnique({ where: { slug } })
          : await prisma.skillResource.findUnique({ where: { slug } })
    if (!existing) return slug
    slug = `${base}-${index++}`
  }
}

async function categoryForGithub(name?: string | null) {
  if (!name) return null
  const slug = makeSlug(name, 'category')
  return prisma.category.upsert({
    where: { slug },
    update: {
      name,
      description: `${name} related AI projects`,
      icon: name.includes('RAG') ? 'Database' : name.includes('Agent') ? 'Bot' : 'Github',
    },
    create: {
      name,
      slug,
      description: `${name} related AI projects`,
      icon: name.includes('RAG') ? 'Database' : name.includes('Agent') ? 'Bot' : 'Github',
      sortOrder: 300,
    },
  })
}

async function stats() {
  const [candidateGroups, sourceGroups, skillSourceGroups, lastRuns] = await Promise.all([
    prisma.collectionCandidate.groupBy({
      by: ['type', 'status'],
      _count: { _all: true },
    }),
    prisma.collectionSource.groupBy({
      by: ['target', 'enabled'],
      _count: { _all: true },
    }),
    prisma.skillResource.groupBy({
      by: ['sourceType', 'sourceName'],
      _count: { _all: true },
    }),
    prisma.collectionRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 8,
      include: { source: { select: { slug: true, name: true, target: true } } },
    }),
  ])

  console.log('\n候选内容统计')
  console.table(candidateGroups.map(item => ({
    type: item.type,
    status: item.status,
    count: item._count._all,
  })))

  console.log('\n采集源统计')
  console.table(sourceGroups.map(item => ({
    target: item.target,
    enabled: item.enabled,
    count: item._count._all,
  })))

  console.log('\n已发布 Skill 来源')
  console.table(skillSourceGroups.map(item => ({
    sourceType: item.sourceType,
    sourceName: item.sourceName || '',
    count: item._count._all,
  })))

  console.log('\n最近采集任务')
  console.table(lastRuns.map(run => ({
    id: run.id,
    scope: run.scope,
    source: run.source?.slug || '-',
    target: run.source?.target || '-',
    status: run.status,
    candidates: run.candidateCount,
    startedAt: run.startedAt.toISOString(),
    error: trim(run.errorMessage, 80),
  })))
}

async function sources() {
  const where: any = {}
  if (hasFlag('--enabled')) where.enabled = true
  const target = arg('--target')
  if (target) where.target = target
  const rows = await prisma.collectionSource.findMany({
    where,
    orderBy: [{ target: 'asc' }, { priority: 'desc' }, { slug: 'asc' }],
  })

  console.table(rows.map(source => ({
    id: source.id,
    slug: source.slug,
    name: source.name,
    type: source.type,
    target: source.target,
    enabled: source.enabled,
    priority: source.priority,
    lastStatus: source.lastStatus,
    failCount: source.failCount,
    lastSuccessAt: source.lastSuccessAt?.toISOString() || '',
    lastError: trim(source.lastError, 70),
  })))
}

async function candidates() {
  const type = arg('--type') as CandidateType | undefined
  const status = arg('--status', 'pending')
  const source = arg('--source')
  const limit = Math.min(toInt(arg('--limit'), 30), 200)
  const where: any = {}

  if (type) where.type = type
  if (status && status !== 'all') where.status = status
  if (source) where.sourceName = { contains: source, mode: 'insensitive' }

  const rows = await prisma.collectionCandidate.findMany({
    where,
    orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      type: true,
      status: true,
      score: true,
      title: true,
      sourceName: true,
      category: true,
      relatedSkills: true,
      sourceUrl: true,
      createdAt: true,
    },
  })

  console.table(rows.map(item => ({
    id: item.id,
    type: item.type,
    status: item.status,
    score: item.score,
    title: trim(item.title, 58),
    source: trim(item.sourceName, 34),
    category: item.category || '',
    relatedSkills: trim(item.relatedSkills, 54),
    url: trim(item.sourceUrl, 80),
  })))
}

async function externalSkills() {
  const source = arg('--source')
  const category = arg('--category')
  const status = arg('--status')
  const limit = Math.min(toInt(arg('--limit'), 40), 500)
  const where: any = {}

  if (source) where.sourceSlug = { contains: source, mode: 'insensitive' }
  if (category) where.categoryZh = { contains: category, mode: 'insensitive' }
  if (status) where.status = status

  const [total, bySource, byCategory, rows] = await Promise.all([
    prisma.externalSkill.count({ where }),
    prisma.externalSkill.groupBy({
      by: ['sourceSlug'],
      where,
      _count: { _all: true },
      orderBy: { _count: { sourceSlug: 'desc' } },
      take: 30,
    }),
    prisma.externalSkill.groupBy({
      by: ['categoryZh'],
      where,
      _count: { _all: true },
      orderBy: { _count: { categoryZh: 'desc' } },
      take: 30,
    }),
    prisma.externalSkill.findMany({
      where,
      orderBy: [{ qualityScore: 'desc' }, { collectedAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        sourceSlug: true,
        name: true,
        nameZh: true,
        categoryZh: true,
        tagsZh: true,
        qualityScore: true,
        stars: true,
        forks: true,
        downloads: true,
        sourceUrl: true,
        githubUrl: true,
        status: true,
        rawData: true,
      },
    }),
  ])

  console.log(`\n外部 Skill 原始库总数: ${total}`)
  console.log('\n按来源统计')
  console.table(bySource.map((item: any) => ({
    source: item.sourceSlug,
    count: item._count._all,
  })))

  console.log('\n按中文分类统计')
  console.table(byCategory.map((item: any) => ({
    categoryZh: item.categoryZh || '未分类',
    count: item._count._all,
  })))

  console.log('\n样本')
  console.table(rows.map((item: any) => {
    const github = { ...githubInfoFromRaw(item.rawData), ...githubMetricsFromRow(item) }
    return {
      id: item.id,
      source: item.sourceSlug,
      score: item.qualityScore,
      stars: github.stars,
      forks: github.forks,
      downloads: github.downloads,
      repo: trim(github.repo, 34),
      path: trim(github.skillPath, 44),
      category: item.categoryZh || '',
      name: trim(item.nameZh || item.name, 52),
      tags: trim(item.tagsZh, 34),
      status: item.status,
      url: trim(item.githubUrl || item.sourceUrl, 64),
    }
  }))
}

async function candidateDetail() {
  const id = toInt(arg('--id'), 0)
  if (!id) throw new Error('Usage: npm run collector:admin -- detail --id 123')

  const item = await prisma.collectionCandidate.findUnique({
    where: { id },
    include: { source: true, cluster: true },
  })
  if (!item) throw new Error(`Candidate ${id} not found`)
  console.log(JSON.stringify(item, null, 2))
}

async function publishCandidate() {
  const id = toInt(arg('--id'), 0)
  if (!id) throw new Error('Usage: npm run collector:publish -- --id 123')

  const candidate = await prisma.collectionCandidate.findUnique({ where: { id } })
  if (!candidate) throw new Error(`Candidate ${id} not found`)
  if (candidate.status === 'published') {
    console.log(JSON.stringify({ ok: true, id, publishedRef: candidate.publishedRef, status: candidate.status }))
    return
  }

  let publishedRef = ''
  if (candidate.type === 'news') {
    const slug = await uniqueSlug('news', makeSlug(candidate.title, 'news'))
    const news = await prisma.news.create({
      data: {
        title: candidate.title,
        slug,
        summary: candidate.summary,
        summaryZh: candidate.summaryZh,
        content: candidate.contentSnippet || candidate.summary || candidate.title,
        sourceName: candidate.sourceName,
        sourceUrl: candidate.canonicalUrl || candidate.sourceUrl,
        author: candidate.author,
        publishedAt: candidate.publishedAt,
        isAutoCrawled: true,
      },
    })
    publishedRef = `news:${news.id}`
  } else if (candidate.type === 'github') {
    const raw = parseJson<Record<string, any>>(candidate.rawData, {})
    const category = await categoryForGithub(candidate.category)
    const slug = await uniqueSlug('tool', makeSlug(`github-${candidate.title}`, 'github'))
    const tags = splitList(candidate.tags)
    const tool = await prisma.tool.create({
      data: {
        name: candidate.title,
        slug,
        description: candidate.summary || candidate.contentSnippet,
        shortDesc: candidate.summary || candidate.title,
        websiteUrl: raw.homepage || candidate.canonicalUrl || candidate.sourceUrl,
        githubUrl: candidate.canonicalUrl || candidate.sourceUrl,
        categoryId: category?.id,
        pricingType: 'OPEN_SOURCE',
        isOpenSource: true,
        tags: tags.join(','),
        features: JSON.stringify({
          reason: candidate.highlights,
          direction: candidate.category,
          relatedSkills: candidate.relatedSkills,
          scoreDetail: candidate.scoreDetail,
        }),
        source: 'collector-github',
        sourceUrl: candidate.canonicalUrl || candidate.sourceUrl,
        stars: Number(raw.stars || 0),
        upvotes: candidate.score,
        isFeatured: candidate.score >= 80,
        isActive: true,
        status: 'approved',
        reviewedAt: new Date(),
        publishedAt: new Date(),
      },
    })
    publishedRef = `tool:${tool.id}`
  } else if (candidate.type === 'skill') {
    const slug = await uniqueSlug('skill', makeSlug(candidate.title, 'skill'))
    const skill = await prisma.skillResource.create({
      data: {
        name: candidate.title,
        slug,
        description: candidate.summary || candidate.contentSnippet,
        category: candidate.category || 'General',
        sourceType: candidate.sourceName?.includes('Project') ? 'project' : candidate.sourceName?.includes('Manual') ? 'manual' : 'collector',
        sourceName: candidate.sourceName,
        sourceUrl: candidate.canonicalUrl || candidate.sourceUrl,
        tags: candidate.tags,
        useCases: candidate.highlights,
        inputSpec: '由采集候选生成，发布后可由运营补充输入规范。',
        outputSpec: '由采集候选生成，发布后可由运营补充输出规范。',
        maturity: candidate.score >= 80 ? 'ready' : 'candidate',
        score: candidate.score,
        isFeatured: candidate.score >= 80,
        isActive: true,
      },
    })
    publishedRef = `skill:${skill.id}`
  }

  await prisma.collectionCandidate.update({
    where: { id },
    data: {
      status: 'published',
      reviewedAt: new Date(),
      publishedRef,
    },
  })

  await prisma.collectionReviewAction.create({
    data: {
      candidateId: id,
      action: 'publish',
      operator: 'collector-admin',
      afterData: JSON.stringify({ publishedRef }),
    },
  })

  console.log(JSON.stringify({ ok: true, id, publishedRef }, null, 2))
}

async function setStatus() {
  const id = toInt(arg('--id'), 0)
  const status = arg('--status')
  const note = arg('--note')
  if (!id || !status) throw new Error('Usage: npm run collector:admin -- status --id 123 --status ignored')

  await prisma.collectionCandidate.update({
    where: { id },
    data: { status, reviewNote: note, reviewedAt: new Date() },
  })
  await prisma.collectionReviewAction.create({
    data: {
      candidateId: id,
      action: status,
      operator: 'collector-admin',
      note,
    },
  })
  console.log(JSON.stringify({ ok: true, id, status }, null, 2))
}

async function cleanWrongSkills() {
  const deprecatedSources = await prisma.collectionSource.findMany({
    where: { slug: { in: ['codex-local-skills'] } },
    select: { id: true },
  })
  const deprecatedSourceIds = deprecatedSources.map(source => source.id)

  const badCandidates = await prisma.collectionCandidate.findMany({
    where: {
      type: 'skill',
      OR: [
        { sourceName: { contains: 'Codex', mode: 'insensitive' } },
        { sourceUrl: { contains: '.codex', mode: 'insensitive' } },
        { canonicalUrl: { contains: '.codex', mode: 'insensitive' } },
        deprecatedSourceIds.length ? { sourceId: { in: deprecatedSourceIds } } : { id: -1 },
      ],
    },
    select: { id: true, title: true },
  })
  const badCandidateIds = badCandidates.map(item => item.id)

  let reviewActions = 0
  let duplicateUpdates = 0
  let candidateDeletes = 0

  if (badCandidateIds.length > 0) {
    duplicateUpdates = (await prisma.collectionCandidate.updateMany({
      where: { duplicateOfId: { in: badCandidateIds } },
      data: { duplicateOfId: null, status: 'pending' },
    })).count

    reviewActions = (await prisma.collectionReviewAction.deleteMany({
      where: { candidateId: { in: badCandidateIds } },
    })).count

    candidateDeletes = (await prisma.collectionCandidate.deleteMany({
      where: { id: { in: badCandidateIds } },
    })).count
  }

  const skillDeletes = (await prisma.skillResource.deleteMany({
    where: {
      OR: [
        { sourceName: { contains: 'Codex', mode: 'insensitive' } },
        { sourceUrl: { contains: '.codex', mode: 'insensitive' } },
        { tags: { contains: 'local-skill', mode: 'insensitive' } },
      ],
    },
  })).count

  const disabledSources = (await prisma.collectionSource.updateMany({
    where: { slug: { in: ['codex-local-skills'] } },
    data: {
      enabled: false,
      lastStatus: 'disabled',
      lastError: 'Disabled by collector-admin: Codex/system skills are not community Skill candidates.',
    },
  })).count

  console.log(JSON.stringify({
    ok: true,
    removedCandidateCount: candidateDeletes,
    removedSkillResourceCount: skillDeletes,
    removedReviewActionCount: reviewActions,
    resetDuplicateCount: duplicateUpdates,
    disabledSources,
    removedCandidateSamples: badCandidates.slice(0, 20),
  }, null, 2))
}

async function cleanLowQualityExternalSkills() {
  const badExternal = await prisma.externalSkill.findMany({
    where: {
      OR: [
        { name: { contains: '](https', mode: 'insensitive' } },
        { name: { startsWith: '[' } },
        { name: { startsWith: '2026-' } },
        { name: { startsWith: '2025-' } },
        { name: { startsWith: '2024-' } },
      ],
    },
    select: { id: true, name: true, sourceSlug: true },
  })
  const sampledExternal = await prisma.externalSkill.findMany({
    select: { id: true, name: true, sourceSlug: true },
    take: 10000,
  })
  const badExternalByName = sampledExternal.filter(item => isLowQualitySkillName(item.name))
  const badExternalIds = Array.from(new Set([...badExternal, ...badExternalByName].map(item => item.id)))
  const badNames = Array.from(new Set([...badExternal, ...badExternalByName].map(item => item.name)))

  const externalDeletes = badExternalIds.length
    ? (await prisma.externalSkill.deleteMany({ where: { id: { in: badExternalIds } } })).count
    : 0

  const sampledCandidates = await prisma.collectionCandidate.findMany({
    where: { type: 'skill' },
    select: { id: true, title: true },
    take: 10000,
  })
  const badCandidateByName = sampledCandidates.filter(item => isLowQualitySkillName(item.title))
  const badCandidates = await prisma.collectionCandidate.findMany({
    where: {
      type: 'skill',
      OR: [
        { title: { contains: '](https', mode: 'insensitive' } },
        { title: { startsWith: '[' } },
        { title: { startsWith: '2026-' } },
        { title: { startsWith: '2025-' } },
        { title: { startsWith: '2024-' } },
        badNames.length ? { title: { in: badNames } } : { id: -1 },
      ],
    },
    select: { id: true, title: true },
  })
  const badCandidateIds = Array.from(new Set([...badCandidates, ...badCandidateByName].map(item => item.id)))

  let candidateDeletes = 0
  let reviewActionDeletes = 0
  if (badCandidateIds.length) {
    await prisma.collectionCandidate.updateMany({
      where: { duplicateOfId: { in: badCandidateIds } },
      data: { duplicateOfId: null },
    })
    reviewActionDeletes = (await prisma.collectionReviewAction.deleteMany({
      where: { candidateId: { in: badCandidateIds } },
    })).count
    candidateDeletes = (await prisma.collectionCandidate.deleteMany({
      where: { id: { in: badCandidateIds } },
    })).count
  }

  console.log(JSON.stringify({
    ok: true,
      removedExternalSkills: externalDeletes,
      removedCandidates: candidateDeletes,
      removedReviewActions: reviewActionDeletes,
      samples: {
      external: [...badExternal, ...badExternalByName].slice(0, 20),
      candidates: [...badCandidates, ...badCandidateByName].slice(0, 20),
    },
  }, null, 2))
}

type ExternalSkillQualityStatus = 'collected' | 'low_quality' | 'needs_source'

type ExternalSkillQualityRow = {
  id: number
  name: string
  sourceSlug: string
  sourceUrl: string | null
  githubUrl: string | null
  homepageUrl?: string | null
  downloadUrl?: string | null
  status: string
  rawData: string | null
}

function concreteSkillSourceUrlFromRow(row: ExternalSkillQualityRow) {
  const raw = parseJson<Record<string, any>>(row.rawData, {})
  const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
  return firstString(
    row.sourceUrl && isConcreteGithubSkillSourceUrl(row.sourceUrl) ? row.sourceUrl : '',
    raw.skillMdUrl && isConcreteGithubSkillSourceUrl(raw.skillMdUrl) ? raw.skillMdUrl : '',
    github.skillMdUrl && isConcreteGithubSkillSourceUrl(github.skillMdUrl) ? github.skillMdUrl : '',
    raw.githubUrl && isConcreteGithubSkillSourceUrl(raw.githubUrl) ? raw.githubUrl : '',
    row.githubUrl && isConcreteGithubSkillSourceUrl(row.githubUrl) ? row.githubUrl : '',
    row.sourceUrl && isPreciseSkillSourceUrl(row.sourceUrl) ? row.sourceUrl : '',
  )
}

function externalSkillQualityDecision(row: ExternalSkillQualityRow): { status: ExternalSkillQualityStatus; reason: string; concreteSourceUrl?: string } {
  const raw = parseJson<Record<string, any>>(row.rawData, {})
  const parser = firstString(raw.parser, raw.collectorLabels?.parser)
  const sourcePrecision = firstString(raw.sourcePrecision, raw.github?.sourcePrecision)
  const sourceUrl = firstString(row.sourceUrl, raw.skillMdUrl, raw.github?.skillMdUrl, row.githubUrl, raw.githubUrl)
  const concreteSourceUrl = concreteSkillSourceUrlFromRow(row)

  if (isLowQualitySkillName(row.name)) return { status: 'low_quality', reason: 'generic or documentation-like skill name', concreteSourceUrl }
  if (!githubRepoFromSkill(row)) return { status: 'needs_source', reason: 'missing resolvable GitHub owner/repo', concreteSourceUrl }
  if (sourcePrecision === 'readme-anchor') return { status: 'low_quality', reason: 'README anchor/list item is not an original skill publish location', concreteSourceUrl }
  if (parser === 'markdown-list' && !concreteSourceUrl) return { status: 'low_quality', reason: 'README list item has no concrete SKILL.md or skills directory URL', concreteSourceUrl }
  if (sourceUrl && sourceUrl.includes('github.com') && !concreteSourceUrl) return { status: 'needs_source', reason: 'GitHub source is not a concrete skill file or directory', concreteSourceUrl }
  if (!concreteSourceUrl && !sourceUrl.includes('github.com')) return { status: 'needs_source', reason: 'original GitHub skill publish URL is missing', concreteSourceUrl }
  if (!isPreciseSkillSourceUrl(sourceUrl) && !concreteSourceUrl) return { status: 'needs_source', reason: 'source URL is not precise enough', concreteSourceUrl }
  return { status: 'collected', reason: 'valid concrete GitHub skill source', concreteSourceUrl }
}

async function markExternalSkillDataQuality() {
  const limit = Math.min(toInt(arg('--limit'), 100000), 500000)
  const dryRun = hasFlag('--dry-run')
  const rows = await prisma.externalSkill.findMany({
    where: {
      status: { in: ['collected', 'low_quality', 'needs_source'] },
    },
    take: limit,
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      name: true,
      sourceSlug: true,
      sourceUrl: true,
      githubUrl: true,
      homepageUrl: true,
      downloadUrl: true,
      status: true,
      rawData: true,
    },
  })

  let updated = 0
  const byStatus: Record<string, number> = {}
  const samples: Array<{ id: number; from: string; to: string; name: string; reason: string; sourceUrl: string | null }> = []

  for (const row of rows) {
    const decision = externalSkillQualityDecision(row)
    byStatus[decision.status] = (byStatus[decision.status] || 0) + 1
    const nextStatus = decision.status
    const raw = parseJson<Record<string, any>>(row.rawData, {})
    const oldQuality = raw.dataQuality && typeof raw.dataQuality === 'object' ? raw.dataQuality : {}
    const nextQuality = {
      status: decision.status,
      reason: decision.reason,
      concreteSourceUrl: decision.concreteSourceUrl || undefined,
    }
    const oldComparableQuality = {
      status: firstString(oldQuality.status),
      reason: firstString(oldQuality.reason),
      concreteSourceUrl: firstString(oldQuality.concreteSourceUrl) || undefined,
    }
    const qualityChanged = JSON.stringify(oldComparableQuality) !== JSON.stringify(nextQuality)
    const nextRaw = {
      ...raw,
      dataQuality: {
        ...nextQuality,
        checkedAt: qualityChanged ? new Date().toISOString() : firstString(oldQuality.checkedAt) || undefined,
      },
    }
    const nextSourceUrl = decision.concreteSourceUrl || row.sourceUrl
    const shouldUpdate = row.status !== nextStatus || row.sourceUrl !== nextSourceUrl || qualityChanged
    if (!shouldUpdate) continue
    if (!dryRun) {
      await prisma.externalSkill.update({
        where: { id: row.id },
        data: {
          status: nextStatus,
          publishedRef: nextStatus === 'collected' ? undefined : null,
          sourceUrl: nextSourceUrl,
          rawData: JSON.stringify(nextRaw),
        },
      })
    }
    updated++
    if (samples.length < 30) {
      samples.push({
        id: row.id,
        from: row.status,
        to: nextStatus,
        name: trim(row.name, 72),
        reason: decision.reason,
        sourceUrl: decision.concreteSourceUrl || row.sourceUrl,
      })
    }
  }

  const result = { ok: true, dryRun, scanned: rows.length, updated, byStatus, samples }
  console.log(JSON.stringify(result, null, 2))
  return result
}

function runNpmCommand(args: string[]) {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = spawnSync(npmCommand, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status && result.status !== 0) {
    throw new Error(`npm ${args.join(' ')} failed with code ${result.status}`)
  }
}

async function optimizeExternalSkillData() {
  const skipGithubStars = hasFlag('--skip-github-stars')
  const skipSkillSync = hasFlag('--skip-skill-sync')
  const before = await externalSkillQualitySnapshot()

  await backfillSkillSourceLinks()
  await markExternalSkillDataQuality()
  await backfillExternalSkillMetrics()
  await reclassifyExternalSkills()
  if (!skipGithubStars) await syncGithubRepoStars()

  if (!skipSkillSync) {
    const syncLimit = arg('--sync-limit', arg('--limit', '100000')) || '100000'
    const syncRepoLimit = arg('--sync-repo-limit', '10000') || '10000'
    runNpmCommand(['run', 'collector:sync-skills', '--', '--limit', syncLimit, '--repo-limit', syncRepoLimit])
  }

  const after = await externalSkillQualitySnapshot()
  console.log(JSON.stringify({ ok: true, before, after, skipGithubStars, skipSkillSync }, null, 2))
}

async function externalSkillQualitySnapshot() {
  const validWhere = { status: { notIn: ['ignored', 'low_quality', 'out_of_scope', 'needs_source', 'aggregated_source'] } }
  const [total, valid, noStars, needsSource, lowQuality, aggregated, linked, skillResources, latest] = await Promise.all([
    prisma.externalSkill.count(),
    prisma.externalSkill.count({ where: validWhere }),
    prisma.externalSkill.count({ where: { ...validWhere, stars: 0 } }),
    prisma.externalSkill.count({ where: { status: 'needs_source' } }),
    prisma.externalSkill.count({ where: { status: 'low_quality' } }),
    prisma.externalSkill.count({ where: { status: 'aggregated_source' } }),
    prisma.externalSkill.count({ where: { ...validWhere, publishedRef: { not: null } } }),
    prisma.skillResource.count({ where: { sourceType: 'external-skill', isActive: true } }),
    prisma.externalSkill.aggregate({ _max: { id: true, updatedAt: true } }),
  ])
  return {
    total,
    valid,
    noStars,
    needsSource,
    lowQuality,
    aggregated,
    linked,
    skillResources,
    latestId: latest._max.id || 0,
    latestUpdatedAt: latest._max.updatedAt?.toISOString() || null,
  }
}

async function markStaleRuns() {
  const minutes = Math.max(toInt(arg('--minutes'), 30), 1)
  const cutoff = new Date(Date.now() - minutes * 60_000)
  const result = await prisma.collectionRun.updateMany({
    where: {
      status: 'running',
      startedAt: { lt: cutoff },
    },
    data: {
      status: 'failed',
      finishedAt: new Date(),
      errorMessage: `Marked stale after ${minutes} minutes without completion.`,
    },
  })
  console.log(JSON.stringify({ ok: true, staleRunCount: result.count, cutoff: cutoff.toISOString() }, null, 2))
}

async function reclassifyExternalSkills() {
  const source = arg('--source')
  const limit = Math.min(toInt(arg('--limit'), 10000), 50000)
  const where: any = {}
  if (source) where.sourceSlug = { contains: source, mode: 'insensitive' }

  const rows = await prisma.externalSkill.findMany({
    where,
    take: limit,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      categoryZh: true,
      tags: true,
      tagsZh: true,
      sourceSlug: true,
      sourceUrl: true,
      githubUrl: true,
      rawData: true,
    },
  })

  let updated = 0
  const samples: Array<{ id: number; source: string; name: string; from: string | null; to: string }> = []

  for (const item of rows) {
    const raw = parseJson<Record<string, any>>(item.rawData, {})
    const classification = classifyExternalSkillRow(item)
    const newCategory = classification.categoryZh
    const newTagsZh = classification.tagsZh.join(',')
    const nextClassifier = {
      version: 1,
      categoryZh: classification.categoryZh,
      tagsZh: classification.tagsZh,
      confidence: classification.confidence,
      matchedKeywords: classification.matchedKeywords,
      scoreDetail: classification.scoreDetail,
      capabilityHints: classification.capabilityHints,
    }
    const oldClassifier = raw.skillClassifier && typeof raw.skillClassifier === 'object' ? raw.skillClassifier : {}
    const comparableOldClassifier = { ...oldClassifier }
    delete (comparableOldClassifier as Record<string, unknown>).classifiedAt
    const classifierChanged = JSON.stringify(comparableOldClassifier) !== JSON.stringify(nextClassifier)
    const nextRaw = {
      ...raw,
      skillClassifier: {
        ...nextClassifier,
        classifiedAt: classifierChanged
          ? new Date().toISOString()
          : firstString((oldClassifier as Record<string, unknown>).classifiedAt),
      },
    }
    if (newCategory === item.categoryZh && newTagsZh === (item.tagsZh || '') && !classifierChanged) continue

    await prisma.externalSkill.update({
      where: { id: item.id },
      data: {
        categoryZh: newCategory,
        tagsZh: newTagsZh || undefined,
        rawData: JSON.stringify(nextRaw),
      },
    })
    updated++
    if (samples.length < 20 && newCategory !== item.categoryZh) {
      samples.push({
        id: item.id,
        source: item.sourceSlug,
        name: trim(item.name, 54),
        from: item.categoryZh,
        to: newCategory,
      })
    }
  }

  console.log(JSON.stringify({ ok: true, scanned: rows.length, updated, samples }, null, 2))
}

async function backfillExternalSkillMetrics() {
  const limit = Math.min(toInt(arg('--limit'), 100000), 500000)
  const source = arg('--source')
  const where: any = {}
  if (source) where.sourceSlug = { contains: source, mode: 'insensitive' }

  const rows = await prisma.externalSkill.findMany({
    where,
    take: limit,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      sourceSlug: true,
      rawData: true,
      stars: true,
      forks: true,
      downloads: true,
    },
  })

  let updated = 0
  const samples: Array<{ id: number; source: string; name: string; stars: number; forks: number; downloads: number }> = []

  for (const row of rows) {
    const metrics = githubMetricsFromRow(row)
    if (row.stars === metrics.stars && row.forks === metrics.forks && row.downloads === metrics.downloads) continue
    await prisma.externalSkill.update({
      where: { id: row.id },
      data: metrics,
    })
    updated++
    if (samples.length < 20) {
      samples.push({
        id: row.id,
        source: row.sourceSlug,
        name: trim(row.name, 64),
        ...metrics,
      })
    }
  }

  console.log(JSON.stringify({
    ok: true,
    scanned: rows.length,
    updated,
    samples,
  }, null, 2))
}

async function backfillSkillSourceLinks() {
  const source = arg('--source', 'skills-sh')
  const limit = Math.min(toInt(arg('--limit'), 50000), 200000)
  const where: any = {}
  if (source) {
    where.OR = [
      { sourceSlug: { contains: source, mode: 'insensitive' } },
      { sourceUrl: { contains: 'officialskills.sh', mode: 'insensitive' } },
    ]
  }

  const externalRows = await prisma.externalSkill.findMany({
    where,
    take: limit,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      sourceSlug: true,
      name: true,
      sourceUrl: true,
      githubUrl: true,
      rawData: true,
    },
  })

  let externalUpdated = 0
  const samples: Array<{ id: number; name: string; from: string | null; to: string }> = []

  for (const row of externalRows) {
    const info = skillsShLinkInfo(row)
    if (!info.githubUrl) continue
    const nextRaw = {
      ...info.raw,
      source: info.sourceKey || info.raw.source,
      skillId: info.skillKey || info.raw.skillId,
      githubUrl: info.githubUrl,
      marketplaceUrl: info.marketplaceUrl || info.raw.marketplaceUrl,
      officialskillsUrl: info.marketplaceUrl || info.raw.officialskillsUrl,
    }
    const nextSourceUrl = info.githubUrl
    const needsUpdate = row.sourceUrl !== nextSourceUrl || row.githubUrl !== info.githubUrl || JSON.stringify(nextRaw) !== row.rawData
    if (!needsUpdate) continue

    await prisma.externalSkill.update({
      where: { id: row.id },
      data: {
        sourceUrl: nextSourceUrl,
        githubUrl: info.githubUrl,
        rawData: JSON.stringify(nextRaw),
      },
    })
    externalUpdated++
    if (samples.length < 20) {
      samples.push({
        id: row.id,
        name: trim(row.name, 54),
        from: row.sourceUrl,
        to: nextSourceUrl,
      })
    }
  }

  const candidateRows = await prisma.collectionCandidate.findMany({
    where: {
      type: 'skill',
      OR: [
        { sourceName: { contains: 'skills.sh', mode: 'insensitive' } },
        { sourceUrl: { contains: 'officialskills.sh', mode: 'insensitive' } },
        { canonicalUrl: { startsWith: 'skills.sh:' } },
      ],
    },
    take: limit,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      sourceUrl: true,
      canonicalUrl: true,
      rawData: true,
    },
  })

  let candidateUpdated = 0
  for (const row of candidateRows) {
    const info = skillsShLinkInfo(row)
    if (!info.githubUrl) continue
    const nextRaw = {
      ...info.raw,
      source: info.sourceKey || info.raw.source,
      skillId: info.skillKey || info.raw.skillId,
      githubUrl: info.githubUrl,
      marketplaceUrl: info.marketplaceUrl || info.raw.marketplaceUrl,
      officialskillsUrl: info.marketplaceUrl || info.raw.officialskillsUrl,
    }
    if (row.sourceUrl === info.githubUrl && JSON.stringify(nextRaw) === row.rawData) continue
    await prisma.collectionCandidate.update({
      where: { id: row.id },
      data: {
        sourceUrl: info.githubUrl,
        rawData: JSON.stringify(nextRaw),
      },
    })
    candidateUpdated++
  }

  console.log(JSON.stringify({
    ok: true,
    scannedExternal: externalRows.length,
    updatedExternal: externalUpdated,
    scannedCandidates: candidateRows.length,
    updatedCandidates: candidateUpdated,
    samples,
  }, null, 2))
}

async function markImpreciseSkillSources() {
  const limit = Math.min(toInt(arg('--limit'), 100000), 300000)
  const rows = await prisma.externalSkill.findMany({
    where: { status: { not: 'needs_source' } },
    take: limit,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      sourceSlug: true,
      sourceUrl: true,
      rawData: true,
    },
  })

  let updated = 0
  const samples: Array<{ id: number; name: string; source: string; url: string | null }> = []

  for (const row of rows) {
    const raw = parseJson<Record<string, any>>(row.rawData, {})
    const parser = firstString(raw.parser, raw.collectorLabels?.parser)
    const imprecise = !isPreciseSkillSourceUrl(row.sourceUrl) || isGithubRepoHomeUrl(row.sourceUrl) || parser.includes('source-hint')
    if (!imprecise) continue

    await prisma.externalSkill.update({
      where: { id: row.id },
      data: {
        status: 'needs_source',
        rawData: JSON.stringify({
          ...raw,
          sourcePrecision: 'needs_exact_publish_url',
          sourcePrecisionReason: 'sourceUrl is not a concrete skill publish location.',
        }),
      },
    })
    updated++
    if (samples.length < 30) {
      samples.push({
        id: row.id,
        name: trim(row.name, 64),
        source: row.sourceSlug,
        url: row.sourceUrl,
      })
    }
  }

  console.log(JSON.stringify({ ok: true, scanned: rows.length, updated, samples }, null, 2))
}

async function markOutOfScopeSkillSources() {
  const limit = Math.min(toInt(arg('--limit'), 300000), 500000)
  const rows = await prisma.externalSkill.findMany({
    where: {
      status: { not: 'out_of_scope' },
      NOT: {
        OR: [
          { sourceSlug: { contains: 'github', mode: 'insensitive' } },
          { sourceSlug: { contains: 'skills-sh', mode: 'insensitive' } },
          { sourceUrl: { contains: 'github.com', mode: 'insensitive' } },
          { sourceUrl: { contains: 'skills.sh', mode: 'insensitive' } },
        ],
      },
    },
    take: limit,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      sourceSlug: true,
      sourceUrl: true,
      rawData: true,
    },
  })

  let updated = 0
  const samples: Array<{ id: number; name: string; source: string; url: string | null }> = []

  for (const row of rows) {
    const raw = parseJson<Record<string, any>>(row.rawData, {})
    await prisma.externalSkill.update({
      where: { id: row.id },
      data: {
        status: 'out_of_scope',
        rawData: JSON.stringify({
          ...raw,
          scopeStatus: 'out_of_scope',
          scopeReason: 'Current collection source scope only keeps GitHub and skills.sh.',
        }),
      },
    })
    updated++
    if (samples.length < 30) {
      samples.push({
        id: row.id,
        name: trim(row.name, 64),
        source: row.sourceSlug,
        url: row.sourceUrl,
      })
    }
  }

  console.log(JSON.stringify({ ok: true, scanned: rows.length, updated, samples }, null, 2))
}

async function purgeExternalSkillsWithoutGithubRepo() {
  const limit = Math.min(toInt(arg('--limit'), 300000), 500000)
  const dryRun = hasFlag('--dry-run')
  const rows = await prisma.externalSkill.findMany({
    take: limit,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      sourceSlug: true,
      sourceUrl: true,
      githubUrl: true,
      rawData: true,
    },
  })

  const badRows = rows.filter(row => !githubRepoFromSkill(row))
  const badIds = badRows.map(row => row.id)
  const removed = dryRun || badIds.length === 0
    ? 0
    : (await prisma.externalSkill.deleteMany({ where: { id: { in: badIds } } })).count

  console.log(JSON.stringify({
    ok: true,
    dryRun,
    scanned: rows.length,
    invalid: badRows.length,
    removed,
    kept: rows.length - badRows.length,
    rule: 'ExternalSkill must resolve to a github.com/owner/repo source from sourceUrl, githubUrl, or rawData.',
    samples: badRows.slice(0, 30).map(row => ({
      id: row.id,
      name: trim(row.name, 72),
      source: row.sourceSlug,
      sourceUrl: row.sourceUrl,
      githubUrl: row.githubUrl,
    })),
  }, null, 2))
}

async function markTopicMismatchSkills() {
  const limit = Math.min(toInt(arg('--limit'), 100000), 300000)
  const dryRun = hasFlag('--dry-run')
  const sources = (arg('--sources', Object.keys(sourceTopicKeywordMap).join(',')) || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  const rows = await prisma.externalSkill.findMany({
    where: {
      sourceSlug: { in: sources },
      status: { notIn: ['low_quality', 'out_of_scope'] },
    },
    take: limit,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      categoryZh: true,
      tags: true,
      tagsZh: true,
      useCases: true,
      sourceSlug: true,
      sourceUrl: true,
      githubUrl: true,
      rawData: true,
    },
  })

  const mismatches = rows.filter(row => !externalSkillMatchesTopic(row))
  let updated = 0
  if (!dryRun && mismatches.length > 0) {
    for (const row of mismatches) {
      const raw = parseJson<Record<string, any>>(row.rawData, {})
      await prisma.externalSkill.update({
        where: { id: row.id },
        data: {
          status: 'out_of_scope',
          rawData: JSON.stringify({
            ...raw,
            topicMismatch: true,
            topicMismatchMarkedAt: new Date().toISOString(),
          }),
        },
      })
      updated++
    }
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun,
    scanned: rows.length,
    mismatches: mismatches.length,
    updated,
    sources,
    samples: mismatches.slice(0, 30).map(row => ({
      id: row.id,
      source: row.sourceSlug,
      name: trim(row.name, 72),
      category: row.categoryZh,
      url: row.sourceUrl,
    })),
  }, null, 2))
}

async function enrichGithubSkillMetadata() {
  const source = arg('--source', '')
  const limit = Math.min(toInt(arg('--limit'), 5000), 100000)
  const repoLimit = Math.min(toInt(arg('--repo-limit'), 80), 1000)
  const releasePerRepo = Math.min(toInt(arg('--release-per-repo'), 20), 100)
  const where: any = {
    OR: [
      { githubUrl: { contains: 'github.com', mode: 'insensitive' } },
      { sourceUrl: { contains: 'github.com', mode: 'insensitive' } },
    ],
  }
  if (source) {
    where.AND = [{
      OR: [
        { sourceSlug: { contains: source, mode: 'insensitive' } },
        { sourceUrl: { contains: source, mode: 'insensitive' } },
        { githubUrl: { contains: source, mode: 'insensitive' } },
      ],
    }]
  }

  const rows = await prisma.externalSkill.findMany({
    where,
    take: limit,
    orderBy: [{ updatedAt: 'desc' }],
    select: {
      id: true,
      sourceSlug: true,
      name: true,
      sourceUrl: true,
      githubUrl: true,
      rawData: true,
      qualityScore: true,
      heatScore: true,
    },
  })

  const rowsByRepo = new Map<string, typeof rows>()
  for (const row of rows) {
    const repo = githubRepoFromSkill(row)
    if (!repo) continue
    const list = rowsByRepo.get(repo) || []
    list.push(row)
    rowsByRepo.set(repo, list)
  }

  const repos = Array.from(rowsByRepo.keys()).slice(0, repoLimit)
  const samples: Array<{ repo: string; skills: number; stars: number; downloads: number; url: string }> = []
  let updatedSkills = 0
  let failedRepos = 0

  for (const repo of repos) {
    try {
      const repoInfo = await githubJson(`https://api.github.com/repos/${repo}`)
      const releaseStats = await githubReleaseStats(repo, releasePerRepo)
      const github = {
        repo,
        repoUrl: repoInfo.html_url || githubRepoUrl(repo),
        name: repoInfo.name,
        fullName: repoInfo.full_name || repo,
        owner: repoInfo.owner?.login,
        description: repoInfo.description,
        stars: toInt(String(repoInfo.stargazers_count || 0), 0),
        forks: toInt(String(repoInfo.forks_count || 0), 0),
        watchers: toInt(String(repoInfo.watchers_count || 0), 0),
        openIssues: toInt(String(repoInfo.open_issues_count || 0), 0),
        language: repoInfo.language,
        topics: Array.isArray(repoInfo.topics) ? repoInfo.topics : [],
        license: repoInfo.license?.spdx_id || repoInfo.license?.name || null,
        defaultBranch: repoInfo.default_branch || 'HEAD',
        homepage: repoInfo.homepage || null,
        pushedAt: repoInfo.pushed_at || null,
        updatedAt: repoInfo.updated_at || null,
        createdAt: repoInfo.created_at || null,
        archived: Boolean(repoInfo.archived),
        disabled: Boolean(repoInfo.disabled),
        releaseDownloads: releaseStats.releaseDownloads,
        releaseCount: releaseStats.releaseCount,
        latestRelease: releaseStats.latestRelease,
        enrichedAt: new Date().toISOString(),
        tokenUsed: Boolean(process.env.GITHUB_TOKEN),
      }

      const repoRows = rowsByRepo.get(repo) || []
      for (const row of repoRows) {
        const raw = parseJson<Record<string, any>>(row.rawData, {})
        const sourceUrl = row.sourceUrl || row.githubUrl || github.repoUrl
        const preciseGithubUrl = firstString(
          sourceUrl && sourceUrl.includes('github.com') && !isGithubRepoHomeUrl(sourceUrl) ? sourceUrl : '',
          row.githubUrl && row.githubUrl.includes('github.com') && !isGithubRepoHomeUrl(row.githubUrl) ? row.githubUrl : '',
          raw.githubUrl,
          raw.github?.repoUrl,
          github.repoUrl,
        )
        const skillPath = firstString(
          raw.github?.skillPath,
          raw.file,
          githubSkillPathFromUrl(sourceUrl),
          githubSkillPathFromUrl(row.githubUrl),
        )
        const installs = toInt(String(raw.installs || raw.item?.installs || 0), 0)
        const downloads = Math.max(github.releaseDownloads, installs)
        const score = scoreWithGithubSignals(row.qualityScore || 0, github.stars, downloads, github.forks)
        await prisma.externalSkill.update({
          where: { id: row.id },
          data: {
            author: github.owner || undefined,
            license: github.license || undefined,
            homepageUrl: github.homepage || undefined,
            downloadUrl: github.latestRelease?.url || undefined,
            githubUrl: preciseGithubUrl,
            qualityScore: score,
            heatScore: Math.max(row.heatScore || 0, score),
            stars: github.stars,
            forks: github.forks,
            downloads,
            rawData: JSON.stringify({
              ...raw,
              githubUrl: preciseGithubUrl,
              repoUrl: github.repoUrl,
              github: {
                ...github,
                skillPath: skillPath || undefined,
              },
            }),
          },
        })
        updatedSkills++
      }

      if (samples.length < 25) {
        samples.push({
          repo,
          skills: repoRows.length,
          stars: github.stars,
          downloads: github.releaseDownloads,
          url: github.repoUrl,
        })
      }
    } catch (error) {
      failedRepos++
      if (samples.length < 25) {
        samples.push({
          repo,
          skills: rowsByRepo.get(repo)?.length || 0,
          stars: 0,
          downloads: 0,
          url: `ERROR: ${(error as Error).message}`,
        })
      }
    }
  }

  console.log(JSON.stringify({
    ok: true,
    tokenUsed: Boolean(process.env.GITHUB_TOKEN),
    scannedSkills: rows.length,
    repoCandidates: rowsByRepo.size,
    processedRepos: repos.length,
    updatedSkills,
    failedRepos,
    samples,
  }, null, 2))
}

async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>) {
  let nextIndex = 0
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const index = nextIndex++
      if (index >= items.length) break
      await worker(items[index], index)
    }
  })
  await Promise.all(workers)
}

async function syncGithubRepoStars() {
  const source = arg('--source', '')
  const limit = Math.min(toInt(arg('--limit'), 50000), 300000)
  const repoLimit = Math.min(toInt(arg('--repo-limit'), 5000), 5000)
  const concurrency = Math.min(Math.max(toInt(arg('--concurrency'), 4), 1), 12)
  const missingOnly = hasFlag('--missing-only')
  const where: any = {
    OR: [
      { githubUrl: { contains: 'github.com', mode: 'insensitive' } },
      { sourceUrl: { contains: 'github.com', mode: 'insensitive' } },
      { homepageUrl: { contains: 'github.com', mode: 'insensitive' } },
      { downloadUrl: { contains: 'github.com', mode: 'insensitive' } },
    ],
  }
  const andFilters: any[] = []
  if (source) {
    andFilters.push({
      OR: [
        { sourceSlug: { contains: source, mode: 'insensitive' } },
        { sourceUrl: { contains: source, mode: 'insensitive' } },
        { githubUrl: { contains: source, mode: 'insensitive' } },
      ],
    })
  }
  if (missingOnly) {
    andFilters.push({
      OR: [
        { stars: 0 },
        { forks: 0 },
      ],
    })
  }
  if (andFilters.length) where.AND = andFilters

  const rows = await prisma.externalSkill.findMany({
    where,
    take: limit,
    orderBy: [{ downloads: 'desc' }, { stars: 'asc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      sourceSlug: true,
      name: true,
      sourceUrl: true,
      githubUrl: true,
      homepageUrl: true,
      downloadUrl: true,
      rawData: true,
      qualityScore: true,
      heatScore: true,
      stars: true,
      forks: true,
      downloads: true,
    },
  })

  const rowsByRepo = new Map<string, { repo: string; list: typeof rows }>()
  for (const row of rows) {
    const repo = githubRepoFromSkill(row)
    if (!repo) continue
    const key = repo.toLowerCase()
    const group = rowsByRepo.get(key) || { repo, list: [] as typeof rows }
    group.list.push(row)
    rowsByRepo.set(key, group)
  }

  const repoJobs = Array.from(rowsByRepo.values())
    .map(group => ({
      repo: group.repo,
      list: group.list,
      zeroRows: group.list.filter(row => !row.stars || !row.forks).length,
      maxDownloads: Math.max(...group.list.map(row => row.downloads || 0), 0),
      maxStars: Math.max(...group.list.map(row => row.stars || 0), 0),
    }))
    .sort((a, b) => b.zeroRows - a.zeroRows || b.maxDownloads - a.maxDownloads || b.list.length - a.list.length || b.maxStars - a.maxStars)
    .slice(0, repoLimit)

  let updatedRepos = 0
  let updatedSkills = 0
  let failedRepos = 0
  const samples: Array<{ repo: string; skills: number; stars: number; forks: number; url: string }> = []

  await runWithConcurrency(repoJobs, concurrency, async ({ repo, list }) => {
    try {
      const repoInfo = await githubJson(`https://api.github.com/repos/${repo}`)
      const stars = toInt(String(repoInfo.stargazers_count || 0), 0)
      const forks = toInt(String(repoInfo.forks_count || 0), 0)
      const repoUrl = repoInfo.html_url || githubRepoUrl(repo)
      const cloneUrl = githubCloneUrl(repo)
      const githubPatch = {
        repo,
        repoUrl,
        name: repoInfo.name,
        fullName: repoInfo.full_name || repo,
        owner: repoInfo.owner?.login,
        description: repoInfo.description,
        stars,
        forks,
        watchers: toInt(String(repoInfo.watchers_count || 0), 0),
        openIssues: toInt(String(repoInfo.open_issues_count || 0), 0),
        language: repoInfo.language,
        topics: Array.isArray(repoInfo.topics) ? repoInfo.topics : [],
        license: repoInfo.license?.spdx_id || repoInfo.license?.name || null,
        defaultBranch: repoInfo.default_branch || 'HEAD',
        homepage: repoInfo.homepage || null,
        pushedAt: repoInfo.pushed_at || null,
        updatedAt: repoInfo.updated_at || null,
        createdAt: repoInfo.created_at || null,
        archived: Boolean(repoInfo.archived),
        disabled: Boolean(repoInfo.disabled),
        repoStarsSyncedAt: new Date().toISOString(),
        tokenUsed: Boolean(process.env.GITHUB_TOKEN),
      }

      for (const row of list) {
        const raw = parseJson<Record<string, any>>(row.rawData, {})
        const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
        const score = scoreWithGithubSignals(row.qualityScore || 0, stars, row.downloads || 0, forks)
        await prisma.externalSkill.update({
          where: { id: row.id },
          data: {
            author: githubPatch.owner || undefined,
            license: githubPatch.license || undefined,
            homepageUrl: repoUrl,
            downloadUrl: cloneUrl,
            githubUrl: repoUrl,
            qualityScore: score,
            heatScore: Math.max(row.heatScore || 0, score),
            stars,
            forks,
            rawData: JSON.stringify({
              ...raw,
              repoUrl,
              installRepo: raw.installRepo || repo,
              installGitUrl: raw.installGitUrl || cloneUrl,
              githubUrl: repoUrl,
              github: {
                ...github,
                ...githubPatch,
                installRepo: github.installRepo || raw.installRepo || repo,
                installGitUrl: github.installGitUrl || raw.installGitUrl || cloneUrl,
                skillPath: firstString(raw.skillMdPath, github.skillMdPath, github.skillPath, raw.file) || undefined,
                skillMdUrl: firstString(raw.skillMdUrl, github.skillMdUrl) || undefined,
                skillMdDescription: firstString(raw.skillMdDescription, github.skillMdDescription) || undefined,
              },
            }),
          },
        })
        updatedSkills++
      }

      updatedRepos++
      if (samples.length < 30) {
        samples.push({ repo, skills: list.length, stars, forks, url: repoUrl })
      }
    } catch (error) {
      failedRepos++
      if (samples.length < 30) {
        samples.push({
          repo,
          skills: list.length,
          stars: 0,
          forks: 0,
          url: `ERROR: ${(error as Error).message}`,
        })
      }
    }
  })

  console.log(JSON.stringify({
    ok: true,
    tokenUsed: Boolean(process.env.GITHUB_TOKEN),
    scannedSkills: rows.length,
    repoCandidates: rowsByRepo.size,
    processedRepos: repoJobs.length,
    updatedRepos,
    updatedSkills,
    failedRepos,
    concurrency,
    samples,
  }, null, 2))
}

async function buildToolCapabilityProfiles() {
  const limit = Math.min(toInt(arg('--limit'), 20000), 100000)
  const sources = (arg('--sources', 'github-python-crawler-skill-index,github-cybersecurity-skill-index') || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  const generatedAt = new Date().toISOString()
  const profiles: Record<string, ToolCapabilityProfile> = {}

  for (const sourceSlug of sources) {
    profiles[sourceSlug] = await buildCapabilityProfileForSource(sourceSlug, limit)
  }

  const previousState = loadToolCapabilityState()
  const previousHistory = Array.isArray(previousState?.history) ? previousState.history : []
  const history = [
    ...previousHistory,
    capabilityHistoryEntry(generatedAt, profiles),
  ].slice(-20)

  const state: ToolCapabilityState = {
    version: 1,
    generatedAt,
    source: 'ExternalSkill rows from GitHub specialty indexes',
    safetyPolicy: {
      mode: 'metadata-only',
      notes: [
        'Capability profiles enhance crawler keywords, source discovery and admin review only.',
        'Cybersecurity skills are not executed against external targets.',
        'Every skill must keep a precise GitHub source URL or repository trace.',
      ],
    },
    profiles,
    history,
  }

  const statePath = toolCapabilityStatePath()
  await fs.mkdir(path.dirname(statePath), { recursive: true })
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8')
  toolCapabilityStateCache = state

  console.log(JSON.stringify({
    ok: true,
    stateFile: TOOL_CAPABILITY_STATE_FILE,
    generatedAt,
    profiles: Object.values(profiles).map(profile => ({
      sourceSlug: profile.sourceSlug,
      label: profile.label,
      skills: profile.skillCount,
      repos: profile.repoCount,
      keywords: profile.keywordCount,
      queries: profile.queryCount,
      topKeywords: profile.topKeywords.slice(0, 10),
      topRepos: profile.topRepos.slice(0, 8).map(repo => ({
        repo: repo.repo,
        skills: repo.count,
        stars: repo.stars,
      })),
    })),
    safetyPolicy: state.safetyPolicy,
  }, null, 2))
}

async function buildKnowledgeVectorStore() {
  const limit = Math.min(toInt(arg('--limit'), 30000), 200000)
  const result = await buildKnowledgeVectors(prisma, { limit })
  console.log(JSON.stringify(result, null, 2))
}

async function deepSeekGrowthPlan() {
  const plan = await generateDeepSeekGrowthPlan(prisma)
  console.log(JSON.stringify(plan, null, 2))
}

async function deepSeekGrowthDispatch() {
  const knowledge = await buildKnowledgeVectors(prisma, { limit: Math.min(toInt(arg('--limit'), 50000), 200000) })
  const plan = await generateDeepSeekGrowthPlan(prisma)
  const commandMap: Record<string, string[]> = {
    'build-tool-capability-profiles': ['run', 'collector:build-capabilities'],
    'skills-sh-daemon': ['run', 'collector:batch-skills', '--', '--sources', 'skills-sh-search-index,skills-sh-github-sources,github-global-skill-index,github-python-crawler-skill-index,github-cybersecurity-skill-index', '--rounds', '3', '--delay-ms', '1500'],
    'prompt-library-daemon': ['run', 'collector:prompts'],
    'ai-news': ['run', 'collector:news'],
    'prompt-library': ['run', 'collector:prompts'],
    'skills-sh-search-index': ['run', 'collector:source', '--', 'skills-sh-search-index'],
    'skills-sh-github-sources': ['run', 'collector:source', '--', 'skills-sh-github-sources'],
    'github-index': ['run', 'collector:source', '--', 'github-global-skill-index'],
    'github-full-skill-index': ['run', 'collector:batch-skills', '--', '--sources', 'github-global-skill-index,skills-sh-github-sources', '--rounds', '4', '--delay-ms', '1500'],
    'github-python-crawler-skills': ['run', 'collector:source', '--', 'github-python-crawler-skill-index'],
    'github-cybersecurity-skills': ['run', 'collector:source', '--', 'github-cybersecurity-skill-index'],
    'sync-external-skills': ['run', 'collector:sync-skills', '--', '--limit', '50000', '--repo-limit', '5000'],
    'optimize-skill-data': ['run', 'collector:admin', '--', 'optimize-external-skill-data', '--limit', '100000', '--repo-limit', '5000'],
    'enrich-github-skill-metadata': ['run', 'collector:sync-github-stars', '--', '--limit', '100000', '--repo-limit', '5000', '--concurrency', '4'],
    'reclassify-skills': ['run', 'collector:admin', '--', 'reclassify-external-skills', '--limit', '100000'],
  }
  const requested = plan.commands.map(command => command.commandId)
  const fallback = ['skills-sh-search-index', 'prompt-library', 'ai-news']
  const commands = Array.from(new Set([...requested, ...fallback]))
    .filter(commandId => commandId !== 'build-knowledge-vectors' && commandId !== 'deepseek-growth-plan')
    .slice(0, 6)
  const results: Array<{ commandId: string; exitCode: number | null; stdout: string; stderr: string }> = []

  for (const commandId of commands) {
    const npmArgs = commandMap[commandId]
    if (!npmArgs) continue
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const child = spawnSync(npmCommand, npmArgs, {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 120000,
    })
    results.push({
      commandId,
      exitCode: child.status,
      stdout: trim(child.stdout || '', 4000),
      stderr: trim(child.stderr || '', 4000),
    })
  }

  console.log(JSON.stringify({
    ok: true,
    knowledge,
    plan,
    dispatched: results,
  }, null, 2))
}

function deploymentPackageAbsolutePath(value?: string | null) {
  if (!value) return ''
  return path.isAbsolute(value) ? value : path.join(process.cwd(), value)
}

function runDeployStep(label: string, command: string, args: string[], options: { optional?: boolean; cwd?: string } = {}) {
  console.log(`[deploy] ${label}: ${command} ${args.join(' ')}`)
  const isWindowsCommandShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)
  const child = isWindowsCommandShim ? spawnSync('cmd.exe', ['/d', '/s', '/c', command, ...args], {
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 20 * 60 * 1000,
  }) : spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 20 * 60 * 1000,
  })
  if (child.stdout) console.log(child.stdout.trim())
  if (child.stderr) console.error(child.stderr.trim())
  if (child.error && !options.optional) {
    throw new Error(`${label} failed: ${child.error.message}`)
  }
  if (child.status !== 0 && !options.optional) {
    throw new Error(`${label} failed with exit code ${child.status}`)
  }
  return child.status || 0
}

async function extractDeployPackage(packagePath: string, extractDir: string) {
  await fs.rm(extractDir, { recursive: true, force: true })
  await fs.mkdir(extractDir, { recursive: true })
  const lower = packagePath.toLowerCase()
  if (lower.endsWith('.zip')) {
    if (process.platform === 'win32') {
      runDeployStep('extract zip', 'powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Expand-Archive -LiteralPath ${JSON.stringify(packagePath)} -DestinationPath ${JSON.stringify(extractDir)} -Force`,
      ])
    } else {
      runDeployStep('extract zip', 'unzip', ['-q', packagePath, '-d', extractDir])
    }
    return
  }
  if (lower.endsWith('.tar') || lower.endsWith('.tgz') || lower.endsWith('.tar.gz')) {
    runDeployStep('extract tar', 'tar', ['-xf', packagePath, '-C', extractDir])
    return
  }
  throw new Error('Unsupported deployment package format.')
}

async function detectDeployRoot(extractDir: string) {
  const entries = await fs.readdir(extractDir, { withFileTypes: true })
  const hasPackageJson = entries.some(entry => entry.isFile() && entry.name === 'package.json')
  const directories = entries.filter(entry => entry.isDirectory())
  if (!hasPackageJson && directories.length === 1) return path.join(extractDir, directories[0].name)
  return extractDir
}

function shouldSkipDeployPath(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  const first = parts[0] || ''
  if (!first) return false
  if ([
    '.git',
    '.next',
    '.collector-state',
    '.venv',
    '.venv-scrapling',
    'node_modules',
    'exports',
    'dev-server.combined.log',
    'dev-server.err.log',
    'dev-server.out.log',
  ].includes(first)) return true
  if (first === '.env' || first === '.env.local') return true
  if (/^\.env\./.test(first)) return true
  if (normalized.includes('/.collector-state/')) return true
  if (normalized.includes('/node_modules/')) return true
  return false
}

async function copyDeployTree(sourceRoot: string, targetRoot: string) {
  const resolvedTarget = path.resolve(targetRoot)

  async function walk(currentSource: string) {
    const relative = path.relative(sourceRoot, currentSource)
    if (relative && shouldSkipDeployPath(relative)) return
    const currentTarget = path.resolve(targetRoot, relative)
    if (currentTarget !== resolvedTarget && !currentTarget.startsWith(`${resolvedTarget}${path.sep}`)) {
      throw new Error(`Refusing to copy outside project root: ${currentTarget}`)
    }
    const stat = await fs.lstat(currentSource)
    if (stat.isSymbolicLink()) return
    if (stat.isDirectory()) {
      await fs.mkdir(currentTarget, { recursive: true })
      const entries = await fs.readdir(currentSource)
      for (const entry of entries) {
        await walk(path.join(currentSource, entry))
      }
      return
    }
    if (stat.isFile()) {
      await fs.mkdir(path.dirname(currentTarget), { recursive: true })
      await fs.copyFile(currentSource, currentTarget)
    }
  }

  await walk(sourceRoot)
}

async function deploymentCounts() {
  const [skillCount, externalSkillCount, promptCount, newsCount] = await Promise.all([
    prisma.skillResource.count().catch(() => 0),
    prisma.externalSkill.count().catch(() => 0),
    prisma.collectionCandidate.count({ where: { type: 'prompt' } }).catch(() => 0),
    prisma.collectionCandidate.count({ where: { type: 'news' } }).catch(() => 0),
  ])
  return { skillCount, externalSkillCount, promptCount, newsCount }
}

async function applyLatestDeployPackage() {
  const requestedVersion = arg('--version', '')
  const versionRow = requestedVersion
    ? await prisma.skillLibraryVersion.findUnique({ where: { version: requestedVersion } })
    : await prisma.skillLibraryVersion.findFirst({
      where: { status: { in: ['queued', 'uploaded', 'failed'] } },
      orderBy: { id: 'desc' },
    })

  if (!versionRow) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: 'No queued deployment package.' }, null, 2))
    return
  }

  const packagePath = deploymentPackageAbsolutePath(versionRow.packagePath)
  if (!packagePath || !existsSync(packagePath)) {
    throw new Error(`Deployment package not found: ${versionRow.packagePath || '-'}`)
  }

  const startedAt = new Date()
  await prisma.skillLibraryVersion.update({
    where: { id: versionRow.id },
    data: { status: 'deploying', startedAt },
  })

  const tempRoot = path.join(process.cwd(), '.collector-state', 'deploy-work', `version-${versionRow.version.replace(/[^0-9a-z.-]/gi, '-')}`)
  try {
    await extractDeployPackage(packagePath, tempRoot)
    const sourceRoot = await detectDeployRoot(tempRoot)
    console.log(`[deploy] source root: ${sourceRoot}`)
    await copyDeployTree(sourceRoot, process.cwd())

    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx'
    runDeployStep('install dependencies', npmCommand, ['install'])
    runDeployStep('sync database schema', npxCommand, ['prisma', 'db', 'push'])
    runDeployStep('generate Prisma client', npmCommand, ['run', 'db:generate'])
    runDeployStep('build collector UI', npmCommand, ['run', 'collector:build-ui'])

    if (existsSync(path.join(process.cwd(), 'ecosystem.config.cjs'))) {
      const pm2Command = process.platform === 'win32' ? 'pm2.cmd' : 'pm2'
      runDeployStep('reload pm2 services', pm2Command, ['startOrReload', 'ecosystem.config.cjs', '--update-env'], { optional: true })
      runDeployStep('save pm2 process list', pm2Command, ['save'], { optional: true })
    } else {
      console.log('[deploy] ecosystem.config.cjs not found; skipping PM2 reload.')
    }

    const counts = await deploymentCounts()
    const updated = await prisma.skillLibraryVersion.update({
      where: { id: versionRow.id },
      data: {
        status: 'success',
        finishedAt: new Date(),
        notes: versionRow.notes,
        ...counts,
      },
    })
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined)
    console.log(JSON.stringify({ ok: true, version: updated.version, status: updated.status, counts }, null, 2))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Deployment failed.'
    await prisma.skillLibraryVersion.update({
      where: { id: versionRow.id },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        notes: `${versionRow.notes ? `${versionRow.notes}\n` : ''}部署失败：${message}`,
      },
    }).catch(() => undefined)
    console.error(`[deploy] failed: ${message}`)
    throw error
  }
}

async function main() {
  const command = process.argv[2] || 'stats'
  if (command === 'stats') await stats()
  else if (command === 'sources') await sources()
  else if (command === 'candidates') await candidates()
  else if (command === 'external-skills') await externalSkills()
  else if (command === 'detail') await candidateDetail()
  else if (command === 'publish') await publishCandidate()
  else if (command === 'status') await setStatus()
  else if (command === 'clean-wrong-skills') await cleanWrongSkills()
  else if (command === 'clean-low-quality-external-skills') await cleanLowQualityExternalSkills()
  else if (command === 'mark-external-skill-data-quality') await markExternalSkillDataQuality()
  else if (command === 'optimize-external-skill-data') await optimizeExternalSkillData()
  else if (command === 'mark-stale-runs') await markStaleRuns()
  else if (command === 'reclassify-external-skills') await reclassifyExternalSkills()
  else if (command === 'backfill-external-skill-metrics') await backfillExternalSkillMetrics()
  else if (command === 'backfill-skill-source-links') await backfillSkillSourceLinks()
  else if (command === 'enrich-github-skill-metadata') await enrichGithubSkillMetadata()
  else if (command === 'sync-github-repo-stars') await syncGithubRepoStars()
  else if (command === 'mark-imprecise-skill-sources') await markImpreciseSkillSources()
  else if (command === 'mark-out-of-scope-skill-sources') await markOutOfScopeSkillSources()
  else if (command === 'purge-external-skills-without-github') await purgeExternalSkillsWithoutGithubRepo()
  else if (command === 'mark-topic-mismatch-skills') await markTopicMismatchSkills()
  else if (command === 'build-tool-capability-profiles') await buildToolCapabilityProfiles()
  else if (command === 'build-knowledge-vectors') await buildKnowledgeVectorStore()
  else if (command === 'deepseek-growth-plan') await deepSeekGrowthPlan()
  else if (command === 'deepseek-growth-dispatch') await deepSeekGrowthDispatch()
  else if (command === 'apply-latest-deploy-package') await applyLatestDeployPackage()
  else if (hasFlag('--help')) help()
  else {
    help()
    process.exitCode = 1
  }
}

function help() {
  console.log(`
Collector admin commands:
  npm run collector:stats
  npm run collector:sources
  npm run collector:candidates -- --type skill --status pending --limit 30
  npm run collector:external-skills -- --source skills-sh --limit 50
  npm run collector:admin -- detail --id 123
  npm run collector:publish -- --id 123
  npm run collector:admin -- status --id 123 --status ignored --note "low quality"
  npm run collector:clean-skills
  npm run collector:admin -- clean-low-quality-external-skills
  npm run collector:admin -- mark-external-skill-data-quality --limit 100000
  npm run collector:admin -- optimize-external-skill-data --limit 100000 --repo-limit 5000
  npm run collector:admin -- mark-stale-runs --minutes 10
  npm run collector:admin -- reclassify-external-skills --source skills-sh --limit 10000
  npm run collector:admin -- backfill-external-skill-metrics --limit 100000
  npm run collector:admin -- backfill-skill-source-links --source skills-sh --limit 50000
  npm run collector:admin -- enrich-github-skill-metadata --limit 100000 --repo-limit 5000
  npm run collector:admin -- sync-github-repo-stars --limit 100000 --repo-limit 5000 --concurrency 4
  npm run collector:admin -- build-tool-capability-profiles --limit 20000
  npm run collector:admin -- build-knowledge-vectors --limit 30000
  npm run collector:admin -- deepseek-growth-plan
  npm run collector:admin -- deepseek-growth-dispatch
  npm run collector:admin -- mark-imprecise-skill-sources --limit 100000
  npm run collector:admin -- purge-external-skills-without-github --limit 300000
`)
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
