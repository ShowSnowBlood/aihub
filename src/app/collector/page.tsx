import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BrainCircuit,
  Bot,
  BarChart3,
  CheckCircle2,
  Clock3,
  Database,
  Gauge,
  Github,
  GitBranch,
  Globe2,
  Layers3,
  ListChecks,
  PackageCheck,
  Play,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Newspaper,
  Fingerprint,
  Flame,
  Star,
  FileText,
  Table2,
  TrendingUp,
} from 'lucide-react'
import { collectorCommandSpecs, ensureCollectorJobRunning, listCollectorJobs } from '@/lib/collector-runner'
import { readDeepSeekGrowthPlan } from '@/lib/deepseek-orchestrator'
import { getDeepSeekConfigStatus, loadLocalDeepSeekConfig } from '@/lib/deepseek-config'
import { getKnowledgeVectorStats, type KnowledgeVectorStats } from '@/lib/knowledge-vector'
import { prisma } from '@/lib/prisma'
import CollectorCoreTables, { type CollectorCoreTablesData } from './CollectorCoreTables'
import CollectorCommandCenter from './CollectorCommandCenter'
import CollectorCommandRunButton from './CollectorCommandRunButton'
import DeploymentPackagePanel, { type DeploymentVersion } from './DeploymentPackagePanel'
import CollectorLiveSources, { type CollectorLiveSourcesData } from './CollectorLiveSources'
import CollectorOverviewLivePanel from './CollectorOverviewLivePanel'
import CollectorPageAutoRefresh from './CollectorPageAutoRefresh'
import CollectorSwitchNav from './CollectorSwitchNav'
import CollectorRunButton from './CollectorRunButton'
import SkillsShLiveProgress, { type SkillsShLiveData } from './SkillsShLiveProgress'

export const metadata = {
  title: '采集后台 | AI Hub',
  description: 'AI 资讯、GitHub 项目与外部 Skills 的采集源、任务和数据管理后台。',
}

export const dynamic = 'force-dynamic'

type CollectorSwitchPage =
  | 'overview'
  | 'core'
  | 'command'
  | 'skills-sh'
  | 'ai-news'
  | 'prompts'
  | 'sources'
  | 'tools'
  | 'runs'
  | 'skills'
  | 'capabilities'
  | 'deepseek'
  | 'deploy'

type PageProps = {
  searchParams?: {
    page?: string
  }
}

const switchPages: Array<{
  page: CollectorSwitchPage
  label: string
  icon: any
  description: string
}> = [
  { page: 'overview', label: '总览', icon: Gauge, description: '核心数量、入口和运行边界' },
  { page: 'core', label: '核心表', icon: Table2, description: 'Skill、提示词、AI 资讯三张主表' },
  { page: 'command', label: '本地控制台', icon: Terminal, description: '发送指令、停止任务、查看日志' },
  { page: 'skills-sh', label: 'skills.sh', icon: RefreshCw, description: '慢爬进度、断点和源扩采' },
  { page: 'ai-news', label: 'AI 资讯', icon: Newspaper, description: '资讯源、热点聚类和候选' },
  { page: 'prompts', label: '提示词库', icon: FileText, description: 'AiShort 行业提示词候选' },
  { page: 'sources', label: '数据源', icon: Globe2, description: '采集源和分类覆盖统计' },
  { page: 'tools', label: '采集工具', icon: SlidersHorizontal, description: '后端工具入口和命令' },
  { page: 'runs', label: '任务监控', icon: Activity, description: '最近任务、失败源和维护动作' },
  { page: 'skills', label: 'Skill 原始库', icon: Database, description: '原始 Skill、审核和发布候选' },
  { page: 'capabilities', label: '能力画像', icon: Fingerprint, description: '爬虫与安全 Skill 反哺采集' },
  { page: 'deepseek', label: 'DeepSeek 增强', icon: BrainCircuit, description: '知识库、增长计划和采集调度' },
  { page: 'deploy', label: '部署包', icon: PackageCheck, description: '上传部署包、自动重建和版本迭代历史' },
]

const quickLinks = [
  { href: '/collector/settings', label: '采集配置', icon: Github },
  { href: '/collector/skills', label: '所有 Skill', icon: Database },
]

function normalizeSwitchPage(value?: string): CollectorSwitchPage {
  return switchPages.some(item => item.page === value) ? value as CollectorSwitchPage : 'overview'
}

function switchHref(page: CollectorSwitchPage) {
  return `/collector?page=${page}`
}

type BrowserState = {
  seen?: string[]
  runs?: Array<Record<string, any>>
  pages?: Record<string, any>
  discoveredPages?: Array<Record<string, any>>
  totals?: Record<string, number>
  liveStats?: {
    totalSkills?: number
    allTimeTotal?: number
    fetchedAt?: string
  }
  lastRunAt?: string
  lastSeenCount?: number
  nextUrlIndex?: number
  nextUrlIndexUpdatedAt?: string
}

type SkillsShLiveStats = {
  ok: boolean
  totalSkills?: number
  allTimeTotal?: number
  fetchedAt?: string
  error?: string
}

type GithubSourceState = {
  nextRepoIndex?: number
  lastRepo?: string
  repoCount?: number
  processedRepos?: number
  collectedCount?: number
  updatedAt?: string
}

type GithubIndexState = {
  nextQueryIndex?: number
  queryCount?: number
  processedQueries?: number
  collectedCount?: number
  rawFetches?: number
  consecutiveEmptyRaw?: number
  usedFallback?: boolean
  updatedAt?: string
}

type SkillsShSearchState = {
  nextQueryIndex?: number
  queryCount?: number
  processedQueries?: number
  collectedCount?: number
  rateLimited?: boolean
  failures?: Array<{ query?: string; error?: string }>
  updatedAt?: string
}

type PromptCrawlerState = {
  totalAvailable?: number
  collectedCount?: number
  seenCount?: number
  apiPages?: number
  bulkRequests?: number
  updatedAt?: string
  lastError?: string | null
  modes?: Array<Record<string, any>>
}

type CapabilityProfile = {
  label?: string
  sourceSlug?: string
  skillCount?: number
  activeSkillCount?: number
  repoCount?: number
  queryCount?: number
  keywordCount?: number
  generatedAt?: string
  topKeywords?: Array<{ value: string; count: number }>
  topRepos?: Array<{ repo: string; count: number; stars: number; sourceUrl?: string }>
  codeQueries?: string[]
  repoQueries?: string[]
  topicKeywords?: string[]
  toolHints?: string[]
  safeModeHints?: string[]
}

type CapabilityHistoryProfile = {
  sourceSlug?: string
  label?: string
  skillCount?: number
  activeSkillCount?: number
  repoCount?: number
  queryCount?: number
  keywordCount?: number
}

type CapabilityHistoryEntry = {
  generatedAt?: string
  totalProfiles?: number
  totalSkills?: number
  totalActiveSkills?: number
  totalRepos?: number
  totalQueries?: number
  totalKeywords?: number
  profiles?: Record<string, CapabilityHistoryProfile>
}

type CapabilityUsage = {
  totalProfiles: number
  totalSkills: number
  totalActiveSkills: number
  totalRepos: number
  totalCodeQueries: number
  totalRepoQueries: number
  totalTopicKeywords: number
}

type ToolCapabilityState = {
  generatedAt?: string
  safetyPolicy?: {
    mode?: string
    notes?: string[]
  }
  profiles?: Record<string, CapabilityProfile>
  history?: CapabilityHistoryEntry[]
}

function trim(value?: string | null, size = 90) {
  if (!value) return ''
  return value.length > size ? `${value.slice(0, size - 3)}...` : value
}

function splitList(value?: string | null) {
  if (!value) return []
  return value.split(/,|\n/).map(item => item.trim()).filter(Boolean)
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
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

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('zh-CN')
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function normalizeGithubRepo(value?: string | null) {
  const repo = String(value || '')
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
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

function githubCloneUrl(repo?: string | null) {
  const key = normalizeGithubRepo(repo)
  return key ? `https://github.com/${key}.git` : ''
}

function githubInfoFromSkill(skill: {
  rawData?: string | null
  sourceUrl?: string | null
  githubUrl?: string | null
  homepageUrl?: string | null
  downloadUrl?: string | null
  stars?: number | null
  forks?: number | null
  downloads?: number | null
}) {
  const raw = parseJson<Record<string, any>>(skill.rawData, {})
  const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
  const item = raw.item && typeof raw.item === 'object' ? raw.item : {}
  const repo = normalizeGithubRepo(firstString(
    raw.originalRepo,
    github.originalRepo,
    raw.installRepo,
    github.installRepo,
    githubRepoFromUrl(raw.originalGithubUrl),
    githubRepoFromUrl(github.originalGithubUrl),
    githubRepoFromUrl(skill.downloadUrl),
    githubRepoFromUrl(raw.installGitUrl),
    githubRepoFromUrl(github.installGitUrl),
    github.repo,
    raw.repo,
    raw.sourceRepo,
    raw.source,
    item.source,
    githubRepoFromUrl(skill.homepageUrl),
    githubRepoFromUrl(skill.githubUrl),
    githubRepoFromUrl(skill.sourceUrl),
    githubRepoFromUrl(raw.githubUrl),
    githubRepoFromUrl(raw.repoUrl),
    githubRepoFromUrl(github.repoUrl),
    githubRepoFromUrl(item.githubUrl),
    githubRepoFromUrl(item.github_url),
    githubRepoFromUrl(item.html_url),
  ))
  const repoUrl = firstString(
    raw.originalGithubUrl,
    github.originalGithubUrl,
    skill.homepageUrl,
    repo ? `https://github.com/${repo}` : '',
    raw.repoUrl,
    github.repoUrl,
  )
  const installRepo = normalizeGithubRepo(firstString(raw.installRepo, github.installRepo, repo, githubRepoFromUrl(skill.downloadUrl), githubRepoFromUrl(raw.installGitUrl), githubRepoFromUrl(github.installGitUrl)))
  const installGitUrl = firstString(skill.downloadUrl, raw.installGitUrl, github.installGitUrl, githubCloneUrl(installRepo))
  const sourceUrl = firstString(
    raw.skillMdUrl,
    github.skillMdUrl,
    skill.sourceUrl && skill.sourceUrl.includes('github.com') && !isGithubRepoHomeUrl(skill.sourceUrl) ? skill.sourceUrl : '',
    skill.githubUrl && skill.githubUrl.includes('github.com') && !isGithubRepoHomeUrl(skill.githubUrl) ? skill.githubUrl : '',
    raw.githubUrl && !isGithubRepoHomeUrl(raw.githubUrl) ? raw.githubUrl : '',
  )
  const skillPath = firstString(raw.skillMdPath, github.skillMdPath, github.skillPath, raw.file, githubSkillPathFromUrl(sourceUrl))
  const stars = Math.max(toNumber(skill.stars), toNumber(github.stars ?? raw.stars))
  const forks = Math.max(toNumber(skill.forks), toNumber(github.forks ?? raw.forks))
  const releaseDownloads = toNumber(github.releaseDownloads)
  const installs = toNumber(raw.installs ?? item.installs)
  const downloads = Math.max(toNumber(skill.downloads), releaseDownloads, installs)
  const latestReleaseUrl = String(github.latestRelease?.url || '').trim()
  return { repo, repoUrl, installGitUrl, sourceUrl, skillPath, stars, forks, downloads, latestReleaseUrl }
}

function classifierInfoFromSkill(skill: { rawData?: string | null; categoryZh?: string | null; tagsZh?: string | null }) {
  const raw = parseJson<Record<string, any>>(skill.rawData, {})
  const classifier = raw.skillClassifier && typeof raw.skillClassifier === 'object' ? raw.skillClassifier : {}
  return {
    categoryZh: firstString(classifier.categoryZh, skill.categoryZh, '未分类'),
    tagsZh: Array.isArray(classifier.tagsZh) ? classifier.tagsZh.map(String) : splitList(skill.tagsZh),
    confidence: toNumber(classifier.confidence),
    matchedKeywords: Array.isArray(classifier.matchedKeywords) ? classifier.matchedKeywords.map(String) : [],
    capabilityHints: Array.isArray(classifier.capabilityHints) ? classifier.capabilityHints.map(String) : [],
    classifiedAt: firstString(classifier.classifiedAt),
  }
}

function percent(value: number, total: number) {
  if (!total) return '0%'
  return `${Math.min(100, (value / total) * 100).toFixed(1)}%`
}

function statusClass(status?: string | null) {
  if (status === 'success') return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
  if (status === 'failed') return 'border-red-400/40 bg-red-400/10 text-red-200'
  if (status === 'running') return 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
  if (status === 'partial') return 'border-amber-400/40 bg-amber-400/10 text-amber-200'
  if (status === 'disabled') return 'border-zinc-600 bg-zinc-900 text-zinc-300'
  return 'border-zinc-700 bg-zinc-900 text-zinc-300'
}

function sourceKind(source: { type: string; slug: string }) {
  if (source.slug.includes('skills-sh')) return 'skills.sh'
  if (source.type.includes('GitHub')) return 'GitHub'
  if (source.type.includes('RSS')) return 'AI 资讯'
  if (source.type.includes('Site')) return '站点列表'
  return source.type
}

function browserStatePath(config: Record<string, any>) {
  const configured = String(config.stateFile || '.collector-state/skills-sh-browser.json')
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured)
}

function readBrowserState(config: Record<string, any>): BrowserState {
  const filePath = browserStatePath(config)
  if (!existsSync(filePath)) return {}
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as BrowserState
  } catch {
    return {}
  }
}

function readGithubSourceState(config: Record<string, any>): GithubSourceState {
  const configured = String(config.githubStateFile || '.collector-state/skills-sh-github-sources.json')
  const filePath = path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured)
  if (!existsSync(filePath)) return {}
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as GithubSourceState
  } catch {
    return {}
  }
}

function readGithubIndexState(config: Record<string, any>): GithubIndexState {
  const configured = String(config.indexStateFile || '.collector-state/github-skill-index.json')
  const filePath = path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured)
  if (!existsSync(filePath)) return {}
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as GithubIndexState
  } catch {
    return {}
  }
}

function readSkillsShSearchState(config: Record<string, any>): SkillsShSearchState {
  const configured = String(config.stateFile || '.collector-state/skills-sh-search-index.json')
  const filePath = path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured)
  if (!existsSync(filePath)) return {}
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as SkillsShSearchState
  } catch {
    return {}
  }
}

function readPromptCrawlerState(config: Record<string, any>): PromptCrawlerState {
  const configured = String(config.stateFile || '.collector-state/aishort-prompts.json')
  const filePath = path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured)
  if (!existsSync(filePath)) return {}
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as PromptCrawlerState
  } catch {
    return {}
  }
}

function readToolCapabilityState(): ToolCapabilityState {
  const filePath = path.join(process.cwd(), '.collector-state/tool-capabilities.json')
  if (!existsSync(filePath)) return {}
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as ToolCapabilityState
  } catch {
    return {}
  }
}

function capabilityUsage(profiles: Array<CapabilityProfile | undefined>): CapabilityUsage {
  return profiles.reduce<CapabilityUsage>((acc, profile) => {
    if (!profile) return acc
    acc.totalProfiles += 1
    acc.totalSkills += Number(profile.skillCount || 0)
    acc.totalActiveSkills += Number(profile.activeSkillCount || 0)
    acc.totalRepos += Number(profile.repoCount || 0)
    acc.totalCodeQueries += Number(profile.codeQueries?.length || 0)
    acc.totalRepoQueries += Number(profile.repoQueries?.length || 0)
    acc.totalTopicKeywords += Number(profile.topicKeywords?.length || 0)
    return acc
  }, {
    totalProfiles: 0,
    totalSkills: 0,
    totalActiveSkills: 0,
    totalRepos: 0,
    totalCodeQueries: 0,
    totalRepoQueries: 0,
    totalTopicKeywords: 0,
  })
}

function capabilitySnapshotFromProfiles(generatedAt: string | undefined, profiles: Record<string, CapabilityProfile> = {}): CapabilityHistoryEntry | undefined {
  const values = Object.values(profiles)
  if (values.length === 0) return undefined
  return {
    generatedAt,
    totalProfiles: values.length,
    totalSkills: values.reduce((sum, profile) => sum + Number(profile.skillCount || 0), 0),
    totalActiveSkills: values.reduce((sum, profile) => sum + Number(profile.activeSkillCount || 0), 0),
    totalRepos: values.reduce((sum, profile) => sum + Number(profile.repoCount || 0), 0),
    totalQueries: values.reduce((sum, profile) => sum + Number(profile.queryCount || 0), 0),
    totalKeywords: values.reduce((sum, profile) => sum + Number(profile.keywordCount || 0), 0),
    profiles: Object.fromEntries(values.map(profile => [
      String(profile.sourceSlug || ''),
      {
        sourceSlug: profile.sourceSlug,
        label: profile.label,
        skillCount: profile.skillCount,
        activeSkillCount: profile.activeSkillCount,
        repoCount: profile.repoCount,
        queryCount: profile.queryCount,
        keywordCount: profile.keywordCount,
      },
    ]).filter(([sourceSlug]) => sourceSlug)),
  }
}

function capabilityHistoryValue(entry: CapabilityHistoryEntry | undefined, key: keyof CapabilityHistoryEntry) {
  return Number(entry?.[key] || 0)
}

function capabilityDelta(current: CapabilityHistoryEntry | undefined, previous: CapabilityHistoryEntry | undefined, key: keyof CapabilityHistoryEntry) {
  return capabilityHistoryValue(current, key) - capabilityHistoryValue(previous, key)
}

function capabilityProfileDelta(current: CapabilityHistoryEntry | undefined, previous: CapabilityHistoryEntry | undefined, sourceSlug: string, key: keyof CapabilityHistoryProfile) {
  return Number(current?.profiles?.[sourceSlug]?.[key] || 0) - Number(previous?.profiles?.[sourceSlug]?.[key] || 0)
}

function signedNumber(value: number) {
  if (value > 0) return `+${formatNumber(value)}`
  if (value < 0) return `-${formatNumber(Math.abs(value))}`
  return '0'
}

function deploymentStatusLabel(status: string) {
  if (status === 'success') return '已部署'
  if (status === 'deploying') return '部署中'
  if (status === 'queued') return '排队中'
  if (status === 'failed') return '失败'
  return '已上传'
}

function serializeDeploymentVersion(row: any): DeploymentVersion {
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    status: row.status,
    statusLabel: deploymentStatusLabel(row.status),
    packageName: row.packageName,
    packageSize: row.packageSize,
    checksum: row.checksum,
    notes: row.notes,
    operator: row.operator,
    jobId: row.jobId,
    skillCount: row.skillCount,
    externalSkillCount: row.externalSkillCount,
    promptCount: row.promptCount,
    newsCount: row.newsCount,
    startedAt: row.startedAt?.toISOString?.() || null,
    finishedAt: row.finishedAt?.toISOString?.() || null,
    createdAt: row.createdAt?.toISOString?.() || null,
    updatedAt: row.updatedAt?.toISOString?.() || null,
  }
}

function statePages(state: BrowserState) {
  return Object.entries(state.pages || {})
    .map(([url, data]) => ({ url, ...(data || {}) }))
    .sort((a, b) => Number(b.freshCount || 0) - Number(a.freshCount || 0))
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

function numberFromSkillsShHtml(html: string, key: 'totalSkills' | 'allTimeTotal') {
  const patterns = [
    new RegExp(`\\\\?"${key}\\\\?"\\s*:\\s*(\\d+)`),
    new RegExp(`"${key}"\\s*:\\s*(\\d+)`),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match) return Number(match[1])
  }
  return 0
}

async function fetchSkillsShLiveStats(): Promise<SkillsShLiveStats> {
  try {
    const response = await withTimeout(fetch('https://www.skills.sh/', {
      cache: 'no-store',
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'AIHub-Collector-LiveStats/1.0',
      },
    }), 7000, 'skills.sh live stats timeout')
    if (!response.ok) throw new Error(`skills.sh HTTP ${response.status}`)

    const html = await withTimeout(response.text(), 7000, 'skills.sh live stats body timeout')
    const totalSkills = numberFromSkillsShHtml(html, 'totalSkills')
    const allTimeTotal = numberFromSkillsShHtml(html, 'allTimeTotal')
    if (!totalSkills && !allTimeTotal) throw new Error('skills.sh stats not found in page payload')

    return {
      ok: true,
      totalSkills,
      allTimeTotal,
      fetchedAt: new Date().toISOString(),
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function syncBrowserStateLiveStats(config: Record<string, any>, state: BrowserState, liveStats: SkillsShLiveStats) {
  if (!liveStats.ok || (!liveStats.totalSkills && !liveStats.allTimeTotal)) return state

  const nextState: BrowserState = {
    ...state,
    totals: {
      ...(state.totals || {}),
      ...(liveStats.totalSkills ? { totalSkills: liveStats.totalSkills } : {}),
      ...(liveStats.allTimeTotal ? { allTimeTotal: liveStats.allTimeTotal } : {}),
    },
    liveStats: {
      totalSkills: liveStats.totalSkills || state.liveStats?.totalSkills,
      allTimeTotal: liveStats.allTimeTotal || state.liveStats?.allTimeTotal,
      fetchedAt: liveStats.fetchedAt,
    },
  }

  try {
    const filePath = browserStatePath(config)
    writeFileSync(filePath, JSON.stringify(nextState, null, 2), 'utf8')
  } catch {
    return nextState
  }

  return nextState
}

function isActiveSourceScope(source: { slug: string; type: string; url?: string | null }) {
  const value = `${source.slug} ${source.type} ${source.url || ''}`.toLowerCase()
  return value.includes('github') || value.includes('skills-sh') || value.includes('skills.sh') || value.includes('ai-news') || value.includes('rss') || value.includes('prompt') || value.includes('aishort')
}

const scopedSourceWhere = {
  OR: [
    { slug: { contains: 'ai-news' } },
    { slug: { contains: 'prompt' } },
    { type: { contains: 'RSS' } },
    { type: { contains: 'Prompt' } },
    { slug: { contains: 'github' } },
    { slug: { contains: 'skills-sh' } },
    { type: { contains: 'GitHub' } },
    { type: { contains: 'Skills.sh' } },
    { url: { contains: 'skills.sh' } },
    { url: { contains: 'aishort.top' } },
  ],
}

const scopedSkillSourceWhere = {
  AND: [
    {
      OR: [
        { sourceSlug: { contains: 'github' } },
        { sourceSlug: { contains: 'skills-sh' } },
      ],
    },
    {
      status: {
        notIn: ['ignored', 'low_quality', 'out_of_scope', 'needs_source', 'aggregated_source'],
      },
    },
  ],
}

const scopedCandidateWhere = {
  source: {
    is: {
      enabled: true,
      ...scopedSourceWhere,
    },
  },
}

export default async function CollectorPage({ searchParams = {} }: PageProps) {
  const activePage = normalizeSwitchPage(searchParams.page)
  const activePageMeta = switchPages.find(item => item.page === activePage) || switchPages[0]
  const showOverview = activePage === 'overview'
  const showCore = activePage === 'core'
  const showSkillsSh = activePage === 'skills-sh'
  const showAiNews = activePage === 'ai-news'
  const showPrompts = activePage === 'prompts'
  const showSources = activePage === 'sources'
  const showTools = activePage === 'tools'
  const showRuns = activePage === 'runs'
  const showSkills = activePage === 'skills'
  const showCapabilities = activePage === 'capabilities'
  const showDeepSeek = activePage === 'deepseek'
  const showDeploy = activePage === 'deploy'
  const needsSkillCounts = showOverview || showCore || showSkillsSh || showSources || showTools || showSkills || showCapabilities || showDeepSeek
  const needsSkillQualityCounts = showOverview || showCapabilities
  const needsSourceGroups = showOverview || showCore || showSources || showAiNews || showPrompts
  const needsSkillSourceGroups = showOverview || showSkillsSh || showSources || showTools || showCapabilities
  const needsNewsCounts = showOverview || showCore || showAiNews || showTools || showDeepSeek
  const needsPromptCounts = showOverview || showCore || showPrompts || showTools || showDeepSeek
  const needsRunData = showOverview || showRuns
  const needsDeploymentVersions = showOverview || showDeploy || showSkills

  let sourceCount = 0
  let enabledSourceCount = 0
  let pendingCount = 0
  let externalSkillCount = 0
  let publishedSkillCount = 0
  let linkedExternalSkillCount = 0
  let githubTraceSkillCount = 0
  let categoryCoveredSkillCount = 0
  let classifierExplainedSkillCount = 0
  let sourceGroups: any[] = []
  let skillSourceGroups: any[] = []
  let categoryGroups: any[] = []
  let sources: any[] = []
  let latestRuns: any[] = []
  let externalSkills: any[] = []
  let newsCandidates: any[] = []
  let newsPendingCount = 0
  let promptCandidates: any[] = []
  let promptPendingCount = 0
  let candidates: any[] = []
  let hotClusters: any[] = []
  let failedSources: any[] = []
  let knowledgeStats: KnowledgeVectorStats = {
    total: 0,
    byScope: [],
    bySourceType: [],
    updatedAt: null,
  }
  let deploymentVersions: DeploymentVersion[] = []
  let databaseOffline = false
  let databaseError = ''

  let collectorJobs = await listCollectorJobs(12)
  let skillsShDaemonJob = collectorJobs.find(job => job.commandId === 'skills-sh-daemon' && job.status === 'running')
  let skillsShDaemonStarted = false
  let promptDaemonJob = collectorJobs.find(job => job.commandId === 'prompt-library-daemon' && job.status === 'running')
  let promptDaemonStarted = false

  try {
    ;[
      sourceCount,
      enabledSourceCount,
      pendingCount,
      externalSkillCount,
      publishedSkillCount,
      linkedExternalSkillCount,
      githubTraceSkillCount,
      categoryCoveredSkillCount,
      classifierExplainedSkillCount,
      sourceGroups,
      skillSourceGroups,
      categoryGroups,
      sources,
      latestRuns,
      externalSkills,
      newsCandidates,
      newsPendingCount,
      promptCandidates,
      promptPendingCount,
      candidates,
      hotClusters,
      failedSources,
      knowledgeStats,
      deploymentVersions,
    ] = await withTimeout(Promise.all([
      prisma.collectionSource.count({ where: { enabled: true, ...scopedSourceWhere } }),
      prisma.collectionSource.count({ where: { enabled: true, ...scopedSourceWhere } }),
      showOverview ? prisma.collectionCandidate.count({ where: { status: 'pending', ...scopedCandidateWhere } }) : Promise.resolve(0),
      needsSkillCounts ? prisma.externalSkill.count({ where: scopedSkillSourceWhere }) : Promise.resolve(0),
      needsSkillCounts ? prisma.skillResource.count() : Promise.resolve(0),
      needsSkillCounts ? prisma.externalSkill.count({ where: { ...scopedSkillSourceWhere, publishedRef: { not: null } } }) : Promise.resolve(0),
      needsSkillQualityCounts ? prisma.externalSkill.count({
        where: {
          AND: [
            scopedSkillSourceWhere,
            {
              OR: [
                { githubUrl: { contains: 'github.com', mode: 'insensitive' } },
                { sourceUrl: { contains: 'github.com', mode: 'insensitive' } },
                { homepageUrl: { contains: 'github.com', mode: 'insensitive' } },
                { downloadUrl: { contains: 'github.com', mode: 'insensitive' } },
                { rawData: { contains: '"repo"' } },
                { rawData: { contains: '"originalRepo"' } },
                { rawData: { contains: '"sourceRepo"' } },
              ],
            },
          ],
        },
      }) : Promise.resolve(0),
      needsSkillQualityCounts ? prisma.externalSkill.count({ where: { ...scopedSkillSourceWhere, categoryZh: { not: null } } }) : Promise.resolve(0),
      needsSkillQualityCounts ? prisma.externalSkill.count({ where: { AND: [scopedSkillSourceWhere, { rawData: { contains: '"skillClassifier"' } }] } }) : Promise.resolve(0),
      needsSourceGroups ? prisma.collectionSource.groupBy({
        by: ['target', 'enabled'],
        where: { enabled: true, ...scopedSourceWhere },
        _count: { _all: true },
        orderBy: [{ target: 'asc' }, { enabled: 'desc' }],
      }) : Promise.resolve([]),
      needsSkillSourceGroups ? prisma.externalSkill.groupBy({
        by: ['sourceSlug'],
        where: scopedSkillSourceWhere,
        _count: { _all: true },
        orderBy: { _count: { sourceSlug: 'desc' } },
        take: 18,
      }) : Promise.resolve([]),
      showSources ? prisma.externalSkill.groupBy({
        by: ['categoryZh'],
        where: scopedSkillSourceWhere,
        _count: { _all: true },
        orderBy: { _count: { categoryZh: 'desc' } },
        take: 16,
      }) : Promise.resolve([]),
      prisma.collectionSource.findMany({
        where: { enabled: true, ...scopedSourceWhere },
        orderBy: [{ target: 'asc' }, { priority: 'desc' }, { updatedAt: 'desc' }],
        include: { _count: { select: { candidates: true, runs: true, externalSkills: true } } },
      }),
      needsRunData ? prisma.collectionRun.findMany({
        orderBy: { startedAt: 'desc' },
        take: 18,
        include: { source: { select: { slug: true, name: true, target: true, type: true } } },
      }) : Promise.resolve([]),
      showSkills || showCore ? prisma.externalSkill.findMany({
        where: scopedSkillSourceWhere,
        orderBy: [{ heatScore: 'desc' }, { qualityScore: 'desc' }, { collectedAt: 'desc' }],
        take: 80,
        select: {
          id: true,
          sourceSlug: true,
          name: true,
          description: true,
          categoryZh: true,
          tagsZh: true,
          qualityScore: true,
          heatScore: true,
          stars: true,
          forks: true,
          downloads: true,
          sourceUrl: true,
          githubUrl: true,
          homepageUrl: true,
          downloadUrl: true,
          status: true,
          rawData: true,
          collectedAt: true,
        },
      }) : Promise.resolve([]),
      showAiNews || showCore ? prisma.collectionCandidate.findMany({
        where: { type: 'news', status: 'pending', ...scopedCandidateWhere },
        orderBy: [{ score: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: 60,
        select: {
          id: true,
          title: true,
          sourceName: true,
          category: true,
          score: true,
          fingerprint: true,
          summaryZh: true,
          highlights: true,
          tags: true,
          sourceUrl: true,
          publishedAt: true,
          createdAt: true,
          cluster: {
            select: {
              title: true,
              heatScore: true,
            },
          },
        },
      }) : Promise.resolve([]),
      needsNewsCounts ? prisma.collectionCandidate.count({ where: { type: 'news', status: 'pending', ...scopedCandidateWhere } }) : Promise.resolve(0),
      showPrompts || showCore ? prisma.collectionCandidate.findMany({
        where: { type: 'prompt', status: 'pending', ...scopedCandidateWhere },
        orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
        take: 60,
        select: {
          id: true,
          title: true,
          sourceName: true,
          author: true,
          category: true,
          score: true,
          fingerprint: true,
          summaryZh: true,
          highlights: true,
          tags: true,
          sourceUrl: true,
          createdAt: true,
          rawData: true,
        },
      }) : Promise.resolve([]),
      needsPromptCounts ? prisma.collectionCandidate.count({ where: { type: 'prompt', status: 'pending', ...scopedCandidateWhere } }) : Promise.resolve(0),
      showSkills ? prisma.collectionCandidate.findMany({
        where: { type: 'skill', status: 'pending', ...scopedCandidateWhere },
        orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
        take: 60,
        select: {
          id: true,
          title: true,
          sourceName: true,
          category: true,
          score: true,
          relatedSkills: true,
          sourceUrl: true,
          createdAt: true,
        },
      }) : Promise.resolve([]),
      showAiNews ? prisma.collectionCluster.findMany({
        where: {
          candidates: {
            some: {
              type: 'news',
              source: {
                is: {
                  enabled: true,
                  ...scopedSourceWhere,
                },
              },
            },
          },
        },
        orderBy: [{ heatScore: 'desc' }, { updatedAt: 'desc' }],
        take: 10,
        include: {
          _count: {
            select: { candidates: true },
          },
        },
      }) : Promise.resolve([]),
      needsRunData ? prisma.collectionSource.findMany({
        where: { enabled: true, lastStatus: 'failed', ...scopedSourceWhere },
        orderBy: [{ updatedAt: 'desc' }],
        take: 8,
      }) : Promise.resolve([]),
      showOverview || showDeepSeek || showCapabilities ? getKnowledgeVectorStats(prisma) : Promise.resolve(knowledgeStats),
      needsDeploymentVersions ? prisma.skillLibraryVersion.findMany({
        orderBy: { id: 'desc' },
        take: 12,
      }).then(rows => rows.map(serializeDeploymentVersion)) : Promise.resolve([]),
    ]), 9000, '数据库连接超时，请检查 PostgreSQL localhost:5432')

    if (!skillsShDaemonJob) {
      const daemon = await ensureCollectorJobRunning('skills-sh-daemon')
      skillsShDaemonJob = daemon.job
      skillsShDaemonStarted = daemon.started
      if (daemon.started) collectorJobs = await listCollectorJobs(12)
    }
    if (!promptDaemonJob) {
      const daemon = await ensureCollectorJobRunning('prompt-library-daemon')
      promptDaemonJob = daemon.job
      promptDaemonStarted = daemon.started
      if (daemon.started) collectorJobs = await listCollectorJobs(12)
    }
  } catch (error) {
    databaseOffline = true
    databaseError = error instanceof Error ? error.message : '数据库连接失败'
  }

  const activeScopedSources = sources.filter(source => source.enabled && isActiveSourceScope(source))
  const aiNewsSourceRows = activeScopedSources.filter(source => source.target === 'news' || `${source.slug} ${source.type}`.toLowerCase().includes('ai-news') || source.type === 'RSS')
  const promptSourceRows = activeScopedSources.filter(source => source.target === 'prompt' || `${source.slug} ${source.type} ${source.url || ''}`.toLowerCase().includes('prompt') || `${source.url || ''}`.toLowerCase().includes('aishort.top'))
  const skillsShSourceRows = activeScopedSources.filter(source => `${source.slug} ${source.url || ''}`.toLowerCase().includes('skills-sh') || `${source.url || ''}`.toLowerCase().includes('skills.sh'))
  const githubSourceRows = activeScopedSources.filter(source => `${source.slug} ${source.type} ${source.url || ''}`.toLowerCase().includes('github'))
  const aiNewsPendingCount = newsPendingCount || newsCandidates.length
  const promptLibraryPendingCount = promptPendingCount || promptCandidates.length
  const aiNewsTotalCount = sourceGroups.find(item => item.target === 'news')?._count._all || aiNewsSourceRows.length
  const promptTotalCount = sourceGroups.find(item => item.target === 'prompt')?._count._all || promptSourceRows.length
  const officialNewsSource = sources.find(source => source.slug === 'ai-news-openai-rss')
  const aiShortPromptSource = sources.find(source => source.slug === 'prompt-aishort-community')
  const aiTishiciPromptSource = sources.find(source => source.slug === 'prompt-directory-ai-tishici-readme')
  const skillsShSlow = sources.find(source => source.slug === 'skills-sh-browser-slow')
  const skillsShApi = sources.find(source => source.slug === 'skills-sh-all')
  const skillsShSearch = sources.find(source => source.slug === 'skills-sh-search-index')
  const skillsShGithub = sources.find(source => source.slug === 'skills-sh-github-sources')
  const githubGlobalIndex = sources.find(source => source.slug === 'github-global-skill-index')
  const githubPythonCrawlerIndex = sources.find(source => source.slug === 'github-python-crawler-skill-index')
  const githubCybersecurityIndex = sources.find(source => source.slug === 'github-cybersecurity-skill-index')
  const browserConfig = parseJson<Record<string, any>>(skillsShSlow?.config, {})
  const skillsShSearchConfig = parseJson<Record<string, any>>(skillsShSearch?.config, {})
  const promptCrawlerConfig = parseJson<Record<string, any>>(aiShortPromptSource?.config, {})
  const githubSourceConfig = parseJson<Record<string, any>>(skillsShGithub?.config, {})
  const githubIndexConfig = parseJson<Record<string, any>>(githubGlobalIndex?.config, {})
  const githubPythonCrawlerConfig = parseJson<Record<string, any>>(githubPythonCrawlerIndex?.config, {})
  const githubCybersecurityConfig = parseJson<Record<string, any>>(githubCybersecurityIndex?.config, {})
  let browserState = readBrowserState(browserConfig)
  const shouldFetchSkillsShLiveStats = false
  const cachedSkillsShLiveStats: SkillsShLiveStats = {
    ok: false,
    totalSkills: Number(browserState.totals?.totalSkills || browserState.liveStats?.totalSkills || 0),
    allTimeTotal: Number(browserState.totals?.allTimeTotal || browserState.liveStats?.allTimeTotal || 0),
    fetchedAt: browserState.liveStats?.fetchedAt || browserState.lastRunAt,
  }
  const skillsShLiveStats = shouldFetchSkillsShLiveStats
    ? await fetchSkillsShLiveStats()
    : cachedSkillsShLiveStats
  browserState = syncBrowserStateLiveStats(browserConfig, browserState, skillsShLiveStats)
  const promptCrawlerState = readPromptCrawlerState(promptCrawlerConfig)
  const skillsShSearchState = readSkillsShSearchState(skillsShSearchConfig)
  const githubSourceState = readGithubSourceState(githubSourceConfig)
  const githubIndexState = readGithubIndexState(githubIndexConfig)
  const githubPythonCrawlerState = readGithubIndexState(githubPythonCrawlerConfig)
  const githubCybersecurityState = readGithubIndexState(githubCybersecurityConfig)
  const toolCapabilityState = readToolCapabilityState()
  const pythonCapabilityProfile = toolCapabilityState.profiles?.['github-python-crawler-skill-index']
  const cybersecurityCapabilityProfile = toolCapabilityState.profiles?.['github-cybersecurity-skill-index']
  const capabilityTotals = capabilityUsage([pythonCapabilityProfile, cybersecurityCapabilityProfile])
  const capabilityHistory = Array.isArray(toolCapabilityState.history) ? toolCapabilityState.history : []
  const currentCapabilitySnapshot = capabilityHistory[capabilityHistory.length - 1]
  const previousCapabilitySnapshot = capabilityHistory[capabilityHistory.length - 2]
  const capabilityGrowth = {
    totalProfiles: capabilityDelta(currentCapabilitySnapshot, previousCapabilitySnapshot, 'totalProfiles'),
    totalSkills: capabilityDelta(currentCapabilitySnapshot, previousCapabilitySnapshot, 'totalSkills'),
    totalActiveSkills: capabilityDelta(currentCapabilitySnapshot, previousCapabilitySnapshot, 'totalActiveSkills'),
    totalRepos: capabilityDelta(currentCapabilitySnapshot, previousCapabilitySnapshot, 'totalRepos'),
    totalQueries: capabilityDelta(currentCapabilitySnapshot, previousCapabilitySnapshot, 'totalQueries'),
    totalKeywords: capabilityDelta(currentCapabilitySnapshot, previousCapabilitySnapshot, 'totalKeywords'),
    python: {
      skillCount: capabilityProfileDelta(currentCapabilitySnapshot, previousCapabilitySnapshot, 'github-python-crawler-skill-index', 'skillCount'),
      activeSkillCount: capabilityProfileDelta(currentCapabilitySnapshot, previousCapabilitySnapshot, 'github-python-crawler-skill-index', 'activeSkillCount'),
      repoCount: capabilityProfileDelta(currentCapabilitySnapshot, previousCapabilitySnapshot, 'github-python-crawler-skill-index', 'repoCount'),
      queryCount: capabilityProfileDelta(currentCapabilitySnapshot, previousCapabilitySnapshot, 'github-python-crawler-skill-index', 'queryCount'),
    },
    cybersecurity: {
      skillCount: capabilityProfileDelta(currentCapabilitySnapshot, previousCapabilitySnapshot, 'github-cybersecurity-skill-index', 'skillCount'),
      activeSkillCount: capabilityProfileDelta(currentCapabilitySnapshot, previousCapabilitySnapshot, 'github-cybersecurity-skill-index', 'activeSkillCount'),
      repoCount: capabilityProfileDelta(currentCapabilitySnapshot, previousCapabilitySnapshot, 'github-cybersecurity-skill-index', 'repoCount'),
      queryCount: capabilityProfileDelta(currentCapabilitySnapshot, previousCapabilitySnapshot, 'github-cybersecurity-skill-index', 'queryCount'),
    },
  }
  const browserSeenCount = Array.isArray(browserState.seen) ? browserState.seen.length : Number(browserState.lastSeenCount || 0)
  const promptCrawlerModes = Array.isArray(promptCrawlerState.modes) ? promptCrawlerState.modes : []
  const browserLastRun = browserState.runs?.[browserState.runs.length - 1]
  const browserPages = statePages(browserState)
  const publicVisibleTotal = Number(skillsShLiveStats.totalSkills || browserState.totals?.totalSkills || browserState.liveStats?.totalSkills || browserLastRun?.totalSkills || 0)
  const installSignalTotal = Number(skillsShLiveStats.allTimeTotal || browserState.totals?.allTimeTotal || browserState.liveStats?.allTimeTotal || browserLastRun?.allTimeTotal || 0)
  const targetTotal = Number(publicVisibleTotal || browserConfig.totalTarget || 80000)
  const skillsShStatsSyncedAt = skillsShLiveStats.fetchedAt || browserState.liveStats?.fetchedAt || browserState.lastRunAt
  const skillsShStatsMode = skillsShLiveStats.ok ? '实时同步' : '本地缓存'
  const skillsShTotal = skillSourceGroups.find(item => item.sourceSlug === 'skills-sh-all')?._count._all || 0
  const skillsShSearchTotal = skillSourceGroups.find(item => item.sourceSlug === 'skills-sh-search-index')?._count._all || 0
  const skillsShBrowserTotal = skillSourceGroups.find(item => item.sourceSlug === 'skills-sh-browser-slow')?._count._all || 0
  const skillsShGithubTotal = skillSourceGroups.find(item => item.sourceSlug === 'skills-sh-github-sources')?._count._all || 0
  const githubGlobalIndexTotal = skillSourceGroups.find(item => item.sourceSlug === 'github-global-skill-index')?._count._all || 0
  const githubPythonCrawlerTotal = skillSourceGroups.find(item => item.sourceSlug === 'github-python-crawler-skill-index')?._count._all || 0
  const githubCybersecurityTotal = skillSourceGroups.find(item => item.sourceSlug === 'github-cybersecurity-skill-index')?._count._all || 0
  const capabilitySourceGrowth = {
    python: {
      total: capabilityProfileDelta(currentCapabilitySnapshot, previousCapabilitySnapshot, 'github-python-crawler-skill-index', 'skillCount'),
      active: capabilityProfileDelta(currentCapabilitySnapshot, previousCapabilitySnapshot, 'github-python-crawler-skill-index', 'activeSkillCount'),
    },
    cybersecurity: {
      total: capabilityProfileDelta(currentCapabilitySnapshot, previousCapabilitySnapshot, 'github-cybersecurity-skill-index', 'skillCount'),
      active: capabilityProfileDelta(currentCapabilitySnapshot, previousCapabilitySnapshot, 'github-cybersecurity-skill-index', 'activeSkillCount'),
    },
  }
  const githubTraceCoverage = externalSkillCount ? percent(githubTraceSkillCount, externalSkillCount) : '0%'
  const categoryCoverage = externalSkillCount ? percent(categoryCoveredSkillCount, externalSkillCount) : '0%'
  const classifierCoverage = externalSkillCount ? percent(classifierExplainedSkillCount, externalSkillCount) : '0%'
  const publishedCoverage = externalSkillCount ? percent(linkedExternalSkillCount, externalSkillCount) : '0%'
  loadLocalDeepSeekConfig()
  const deepSeekConfigStatus = getDeepSeekConfigStatus()
  const deepSeekGrowthPlan = readDeepSeekGrowthPlan()
  const skillsShDaemonStatus = skillsShDaemonJob?.status === 'running' ? 'running' : databaseOffline ? 'offline' : 'starting'
  const skillsShDaemonNote = skillsShDaemonJob
    ? `${skillsShDaemonStarted ? '刚自动启动' : '常驻运行'} · pid ${skillsShDaemonJob.pid || '-'}`
    : databaseOffline
      ? '数据库离线，暂不启动'
      : '等待自动启动'
  const promptDaemonStatus = promptDaemonJob?.status === 'running' ? 'running' : databaseOffline ? 'offline' : 'starting'
  const promptDaemonNote = promptDaemonJob
    ? `${promptDaemonStarted ? '刚自动启动' : '常驻运行'} · pid ${promptDaemonJob.pid || '-'}`
    : databaseOffline
      ? '数据库离线，暂不启动'
      : '等待自动启动'
  const skillsShLiveInitialData: SkillsShLiveData = {
    browserSeenCount,
    publicVisibleTotal,
    installSignalTotal,
    targetTotal,
    skillsShStatsSyncedAt: skillsShStatsSyncedAt || null,
    skillsShStatsMode,
    skillsShBrowserTotal,
    skillsShTotal,
    skillsShSearchTotal,
    skillsShGithubTotal,
    githubGlobalIndexTotal,
    skillResourceTotal: publishedSkillCount,
    linkedExternalSkillTotal: linkedExternalSkillCount,
    skillsShSearchState: {
      nextQueryIndex: Number(skillsShSearchState.nextQueryIndex || 0),
      queryCount: Number(skillsShSearchState.queryCount || 0),
      processedQueries: Number(skillsShSearchState.processedQueries || 0),
      collectedCount: Number(skillsShSearchState.collectedCount || 0),
      rateLimited: Boolean(skillsShSearchState.rateLimited),
      updatedAt: skillsShSearchState.updatedAt || null,
      failures: Array.isArray(skillsShSearchState.failures) ? skillsShSearchState.failures.slice(-3) : [],
    },
    githubSourceState: {
      repoCount: Number(githubSourceState.repoCount || 0),
      nextRepoIndex: Number(githubSourceState.nextRepoIndex || 0),
      collectedCount: Number(githubSourceState.collectedCount || 0),
    },
    githubIndexState: {
      nextQueryIndex: Number(githubIndexState.nextQueryIndex || 0),
      queryCount: Number(githubIndexState.queryCount || 0),
    },
    skillsShDaemonStatus,
    skillsShDaemonNote,
    skillsShDaemonPid: skillsShDaemonJob?.pid || null,
    skillsShDaemonStartedAt: skillsShDaemonJob?.startedAt || null,
    skillsShSourceStatus: skillsShSlow?.enabled ? skillsShSlow?.lastStatus || 'idle' : 'disabled',
    browserConfig: {
      stateFile: browserConfig.stateFile || '.collector-state/skills-sh-browser.json',
      browserLimit: Number(browserConfig.browserLimit || 80),
      scrollSteps: Number(browserConfig.scrollSteps || 10),
      delayMs: Number(browserConfig.delayMs || 1000),
      maxClicks: Number(browserConfig.maxClicks || 20),
      maxPagesPerRun: Number(browserConfig.maxPagesPerRun || 0),
      rotatePages: browserConfig.rotatePages !== false,
      includeSeen: Boolean(browserConfig.includeSeen),
    },
    browserRotation: {
      nextUrlIndex: Number(browserState.nextUrlIndex || 0),
      nextUrlIndexUpdatedAt: browserState.nextUrlIndexUpdatedAt || null,
      discoveredPageCount: Array.isArray(browserState.discoveredPages) ? browserState.discoveredPages.length : 0,
      lastRunAt: browserState.lastRunAt || null,
      lastRun: browserState.runs?.length ? {
        url: browserState.runs[browserState.runs.length - 1]?.url || null,
        totalParsed: Number(browserState.runs[browserState.runs.length - 1]?.totalParsed || 0),
        emittedCount: Number(browserState.runs[browserState.runs.length - 1]?.emittedCount || 0),
        freshCount: Number(browserState.runs[browserState.runs.length - 1]?.freshCount || 0),
        replayCount: Number(browserState.runs[browserState.runs.length - 1]?.replayCount || 0),
        seenCount: Number(browserState.runs[browserState.runs.length - 1]?.seenCount || 0),
        startedAt: browserState.runs[browserState.runs.length - 1]?.startedAt || null,
        finishedAt: browserState.runs[browserState.runs.length - 1]?.finishedAt || null,
      } : null,
    },
    browserPages: browserPages.slice(0, 12).map(page => ({
      url: page.url,
      freshCount: Number(page.freshCount || 0),
      emittedCount: Number(page.emittedCount || 0),
      replayCount: Number(page.replayCount || 0),
      totalParsed: Number(page.totalParsed || 0),
      seenCount: Number(page.seenCount || 0),
      lastRunAt: page.lastRunAt,
    })),
  }
  const overviewLiveInitialData = {
    ...skillsShLiveInitialData,
    externalSkillTotal: externalSkillCount,
    githubPythonCrawlerTotal,
    githubCybersecurityTotal,
    githubPythonCrawlerState: {
      nextQueryIndex: Number(githubPythonCrawlerState.nextQueryIndex || 0),
      queryCount: Number(githubPythonCrawlerState.queryCount || 0),
      processedQueries: Number(githubPythonCrawlerState.processedQueries || 0),
      collectedCount: Number(githubPythonCrawlerState.collectedCount || 0),
      rawFetches: Number(githubPythonCrawlerState.rawFetches || 0),
      usedFallback: Boolean(githubPythonCrawlerState.usedFallback),
      updatedAt: githubPythonCrawlerState.updatedAt || null,
    },
    githubCybersecurityState: {
      nextQueryIndex: Number(githubCybersecurityState.nextQueryIndex || 0),
      queryCount: Number(githubCybersecurityState.queryCount || 0),
      processedQueries: Number(githubCybersecurityState.processedQueries || 0),
      collectedCount: Number(githubCybersecurityState.collectedCount || 0),
      rawFetches: Number(githubCybersecurityState.rawFetches || 0),
      usedFallback: Boolean(githubCybersecurityState.usedFallback),
      updatedAt: githubCybersecurityState.updatedAt || null,
    },
    daemonEvents: {
      cycle: 0,
      cycleEvent: '',
      currentSource: '',
      currentSourceEvent: '',
      latestFinishedSources: [],
      latestSync: null,
    },
    recentActivity: {
      externalCreated5m: 0,
      externalUpdated5m: 0,
      externalCreated30m: 0,
      externalUpdated30m: 0,
      skillResourceUpdated5m: 0,
      skillResourceUpdated30m: 0,
    },
  }
  const toIso = (value: Date | string | null | undefined) => value instanceof Date ? value.toISOString() : value || null
  const liveSourcesInitialData: CollectorLiveSourcesData = {
    refreshedAt: new Date().toISOString(),
    sources: activeScopedSources.map(source => ({
      id: source.id,
      name: source.name,
      slug: source.slug,
      type: source.type,
      target: source.target,
      url: source.url,
      enabled: source.enabled,
      priority: source.priority,
      frequencyMins: source.frequencyMins,
      lastRunAt: toIso(source.lastRunAt),
      lastSuccessAt: toIso(source.lastSuccessAt),
      lastStatus: source.lastStatus,
      lastError: source.lastError,
      failCount: source.failCount,
      _count: {
        candidates: Number(source._count?.candidates || 0),
        runs: Number(source._count?.runs || 0),
        externalSkills: Number(source._count?.externalSkills || 0),
      },
    })),
    sourceGroups: sourceGroups.map(item => ({
      target: item.target,
      enabled: Boolean(item.enabled),
      _count: { _all: Number(item._count?._all || 0) },
    })),
    skillSourceGroups: skillSourceGroups.map(item => ({
      sourceSlug: item.sourceSlug,
      _count: { _all: Number(item._count?._all || 0) },
    })),
      categoryGroups: categoryGroups.map(item => ({
        categoryZh: item.categoryZh || null,
        _count: { _all: Number(item._count?._all || 0) },
      })),
  }
  const coreTablesInitialData: CollectorCoreTablesData = {
    counts: {
      skills: Number(externalSkillCount || externalSkills.length || 0),
      prompts: Number(promptLibraryPendingCount || promptCandidates.length || 0),
      news: Number(aiNewsPendingCount || newsCandidates.length || 0),
    },
    skills: externalSkills.map(skill => ({
      id: Number(skill.id),
      sourceSlug: String(skill.sourceSlug || ''),
      name: String(skill.name || ''),
      description: skill.description || null,
      categoryZh: skill.categoryZh || null,
      tagsZh: skill.tagsZh || null,
      qualityScore: Number(skill.qualityScore || 0),
      heatScore: Number(skill.heatScore || 0),
      stars: Number(skill.stars || 0),
      forks: Number(skill.forks || 0),
      downloads: Number(skill.downloads || 0),
      sourceUrl: skill.sourceUrl || null,
      githubUrl: skill.githubUrl || null,
      homepageUrl: skill.homepageUrl || null,
      downloadUrl: skill.downloadUrl || null,
      status: skill.status || null,
      rawData: skill.rawData || null,
      collectedAt: toIso(skill.collectedAt),
    })),
    prompts: promptCandidates.map(candidate => ({
      id: Number(candidate.id),
      title: String(candidate.title || ''),
      sourceName: candidate.sourceName || null,
      author: candidate.author || null,
      category: candidate.category || null,
      score: Number(candidate.score || 0),
      summaryZh: candidate.summaryZh || null,
      highlights: candidate.highlights || null,
      tags: candidate.tags || null,
      sourceUrl: candidate.sourceUrl || null,
      createdAt: toIso(candidate.createdAt),
      rawData: candidate.rawData || null,
    })),
    news: newsCandidates.map(candidate => ({
      id: Number(candidate.id),
      title: String(candidate.title || ''),
      sourceName: candidate.sourceName || null,
      category: candidate.category || null,
      score: Number(candidate.score || 0),
      summaryZh: candidate.summaryZh || null,
      highlights: candidate.highlights || null,
      tags: candidate.tags || null,
      sourceUrl: candidate.sourceUrl || null,
      publishedAt: toIso(candidate.publishedAt),
      createdAt: toIso(candidate.createdAt),
      cluster: candidate.cluster ? {
        title: candidate.cluster.title || null,
        heatScore: Number(candidate.cluster.heatScore || 0),
      } : null,
    })),
  }

  return (
    <main className="admin-page-root min-h-screen bg-[#0b0f14] text-zinc-100">
      <aside className="fixed left-0 top-0 hidden h-screen w-64 border-r border-zinc-800 bg-[#0c1117] px-4 py-5 xl:block">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-cyan-400/10 text-cyan-200">
            <Server className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold text-white">AIHub Collector</div>
            <div className="text-xs text-zinc-500">数据采集后台</div>
          </div>
        </div>
        <CollectorSwitchNav scope="collector" layout="sidebar" basePath="/collector" />
        <div className="absolute bottom-5 left-4 right-4 rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-xs leading-5 text-zinc-400">
          <div className="mb-2 flex items-center gap-2 text-cyan-200">
            <Clock3 className="h-3.5 w-3.5" />
            慢爬规则
          </div>
          每轮限量、滚动延迟、断点续爬。只采公开可见数据，不绕过登录、付费、验证码或站点限制。
        </div>
      </aside>

      <div className="xl:pl-64">
        <header id="overview" className="border-b border-zinc-800 bg-[#0f141b]">
          <div className="px-5 py-6 lg:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-cyan-300">
                  <Bot className="h-4 w-4" />
                  AI 资源采集后台
                  <span className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">Scrapling browser</span>
                  <span className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">GitHub sources</span>
                </div>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
                  {activePage === 'overview' ? '采集后台总览' : activePageMeta.label}
                </h1>
                <p className="mt-3 max-w-4xl text-sm leading-6 text-zinc-400">
                  {activePageMeta.description}。这里专门管理外部 AI 资讯、GitHub AI 项目和 Skill 数据，每个模块都可以独立切换查看。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <CollectorPageAutoRefresh enabled={false} />
                <CollectorRunButton label="启动全量采集" compact />
                <CollectorCommandRunButton commandId="prompt-library-daemon" label="确保提示词常驻" compact />
                <Link className="inline-flex h-9 items-center gap-2 rounded-md border border-cyan-500/50 bg-cyan-400/10 px-3 text-sm font-medium text-cyan-100 hover:border-cyan-300" href="/collector/settings">
                  <Github className="h-4 w-4" />
                  采集配置
                </Link>
                <Link className="inline-flex h-9 items-center rounded-md border border-zinc-700 px-3 text-sm text-zinc-200 hover:border-cyan-400" href="/api/collector/stats">
                  JSON 状态
                </Link>
                <Link className="inline-flex h-9 items-center rounded-md border border-zinc-700 px-3 text-sm text-zinc-200 hover:border-cyan-400" href="/skills">
                  查看发布库
                </Link>
              </div>
            </div>
          </div>
        </header>

        <div className="space-y-6 px-5 py-6 lg:px-8">
          <div className="sticky top-0 z-20 -mx-5 border-b border-zinc-800 bg-[#0b0f14]/95 px-5 py-3 backdrop-blur lg:-mx-8 lg:px-8">
            <CollectorSwitchNav scope="collector" layout="tabs" basePath="/collector" />
          </div>

          {databaseOffline && (
            <div className="rounded-md border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <div className="font-medium">数据库未连接，当前为离线控制台模式</div>
                  <div className="mt-1 text-amber-100/80">
                    本地指令、任务日志和启动监控仍可使用；数据源、候选库和统计需要启动 PostgreSQL localhost:5432 后刷新页面。
                    {databaseError ? ` 错误：${trim(databaseError, 160)}` : ''}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activePage === 'overview' && (
            <>
              <CollectorOverviewLivePanel initialData={overviewLiveInitialData} />

              <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                <StatCard icon={Globe2} label="采集源" value={sourceCount} note={`${enabledSourceCount} 个启用`} tone="cyan" />
                <StatCard icon={Newspaper} label="AI 资讯候选" value={aiNewsPendingCount} note={`${formatNumber(aiNewsSourceRows.length)} 个资讯源`} tone="blue" />
                <StatCard icon={FileText} label="提示词候选" value={promptLibraryPendingCount} note={`${formatNumber(promptSourceRows.length)} 个提示词源`} tone="violet" />
                <StatCard icon={Database} label="外部 Skill 原始库" value={externalSkillCount} note="external_skills" tone="emerald" />
                <StatCard icon={ShieldCheck} label="已发布 Skill" value={publishedSkillCount} note="skill_resources" tone="violet" />
                <StatCard icon={Gauge} label="待审核候选" value={pendingCount} note="collection_candidates" tone="amber" />
                <StatCard icon={RefreshCw} label="skills.sh 公开 Skill" value={publicVisibleTotal} note={`唯一 Skill 数 · ${skillsShStatsMode} ${formatDate(skillsShStatsSyncedAt)}`} tone="blue" />
                <StatCard icon={AlertTriangle} label="失败源" value={failedSources.length} note="需要处理" tone="red" />
              </section>

              <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                <Panel title="数据质量口径" icon={ShieldCheck} description="这里看的是入库质量，不是单纯总数。总数不增长时，先看新增/更新和重复命中。">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <QualityMeter label="GitHub 源追踪" value={githubTraceSkillCount} total={externalSkillCount} percentLabel={githubTraceCoverage} note="能定位到原始仓库或源文件" />
                    <QualityMeter label="中文分类覆盖" value={categoryCoveredSkillCount} total={externalSkillCount} percentLabel={categoryCoverage} note="已写入 categoryZh" />
                    <QualityMeter label="分类解释覆盖" value={classifierExplainedSkillCount} total={externalSkillCount} percentLabel={classifierCoverage} note="rawData.skillClassifier" />
                    <QualityMeter label="发布同步覆盖" value={linkedExternalSkillCount} total={externalSkillCount} percentLabel={publishedCoverage} note="已聚合到 skill_resources" />
                  </div>
                </Panel>

                <Panel title="增长判断" icon={Gauge} description="采集器命中已有 fingerprint 时会更新记录，不会让总数增加。">
                  <div className="grid gap-3 md:grid-cols-3">
                    <MiniStatus label="skills.sh 公开唯一 Skill" value={formatNumber(publicVisibleTotal)} />
                    <MiniStatus label="All Time 累计安装" value={formatNumber(installSignalTotal)} />
                    <MiniStatus label="外部 Skill 当前入库" value={formatNumber(externalSkillCount)} />
                  </div>
                  <div className="mt-3 rounded-md border border-zinc-800 bg-[#0b0f14] p-3 text-xs leading-5 text-zinc-500">
                    页面每 5 秒刷新，常驻任务会先扩大搜索和源仓库池；如果命中的是已存在 GitHub 源文件，数据会表现为更新时间变化、Star/Fork/分类解释补齐，而不是总数立刻上涨。
                  </div>
                </Panel>
              </section>

              <section className="grid gap-4 xl:grid-cols-3">
                <OverviewShortcut icon={Terminal} title="本地采集控制台" href={switchHref('command')} metric={`${collectorCommandSpecs.length} 个指令`} note="启动采集后自动进入任务详情页。" />
                <OverviewShortcut icon={Table2} title="三张核心表" href={switchHref('core')} metric={`${formatNumber(externalSkillCount)}/${formatNumber(promptLibraryPendingCount)}/${formatNumber(aiNewsPendingCount)}`} note="Skill、提示词、AI 资讯分表查看和排序。" />
                <OverviewShortcut icon={RefreshCw} title="skills.sh 常驻采集" href={switchHref('skills-sh')} metric={skillsShDaemonStatus} note={`${skillsShDaemonNote}；公开唯一 Skill ${formatNumber(publicVisibleTotal)}，All Time 累计安装 ${formatNumber(installSignalTotal)}。`} />
                <OverviewShortcut icon={Newspaper} title="AI 资讯候选" href={switchHref('ai-news')} metric={`${formatNumber(aiNewsPendingCount)} 待审核`} note="RSS 源、热点聚类和资讯候选。" />
                <OverviewShortcut icon={FileText} title="行业提示词库" href={switchHref('prompts')} metric={`${formatNumber(promptLibraryPendingCount)} 待审核`} note={`${promptDaemonNote}；AiShort 分页、正文解析和提示词候选。`} />
                <OverviewShortcut icon={Database} title="Skill 原始库" href={switchHref('skills')} metric={`${formatNumber(externalSkillCount)} 条`} note="GitHub 源仓库、Star、skills.sh 累计安装与审核候选。" />
                <OverviewShortcut icon={Fingerprint} title="工具能力画像" href={switchHref('capabilities')} metric={`Crawler ${formatNumber(githubPythonCrawlerTotal)} / Shannon ${formatNumber(githubCybersecurityTotal)}`} note="用专项 Skill 反哺下一轮采集关键词。" />
                <OverviewShortcut icon={BrainCircuit} title="DeepSeek 增强" href={switchHref('deepseek')} metric={deepSeekConfigStatus.configured ? `${formatNumber(knowledgeStats.total)} 知识条目` : '待配置'} note="理解知识库和能力画像，生成采集增长计划。" />
                <OverviewShortcut icon={PackageCheck} title="部署包版本" href={switchHref('deploy')} metric={deploymentVersions[0]?.version || '0.0.1'} note={deploymentVersions[0] ? `${deploymentVersions[0].statusLabel || deploymentVersions[0].status}，上传后自动部署。` : '上传第一个部署包后生成版本历史。'} />
                <OverviewShortcut icon={Globe2} title="数据源网站" href={switchHref('sources')} metric={`${formatNumber(activeScopedSources.length)} 个主源`} note="查看来源启停、频率、候选和分类覆盖。" />
                <OverviewShortcut icon={SlidersHorizontal} title="采集工具" href={switchHref('tools')} metric="后端工具入口" note="按工具直接触发 GitHub、skills.sh、资讯和提示词采集。" />
                <OverviewShortcut icon={Activity} title="任务监控" href={switchHref('runs')} metric={`${formatNumber(latestRuns.length)} 条最近运行`} note="查看最近任务、失败源和维护命令。" />
              </section>

              <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4 text-sm text-zinc-400">
                <div className="mb-2 flex items-center gap-2 text-zinc-200">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  运行边界
                </div>
                <div className="grid gap-2 lg:grid-cols-3">
                  <p>AI 资讯采集只保存标题、摘要、元数据、正文片段和原文链接，发布前进入审核队列。</p>
                  <p>Skill 慢爬由常驻任务自动循环运行，支持滚动、可见按钮点击、限速和 checkpoint。</p>
                  <p>候选内容通过内容指纹去重、热点聚类归并，再由运营人工精选或发布。</p>
                </div>
              </div>
            </>
          )}

          {activePage === 'command' && (
          <Panel id="command-center" title="本地采集控制台" icon={Terminal} description="跨 Windows/Linux 的白名单指令发送、任务停止、运行日志和最近任务监控。">
            <CollectorCommandCenter initialCommands={collectorCommandSpecs} initialJobs={collectorJobs} />
          </Panel>
          )}

          {activePage === 'core' && (
            <CollectorCoreTables initialData={coreTablesInitialData} />
          )}

          {activePage === 'capabilities' && (
            <div className="space-y-4">
              <Panel id="capability-control" title="能力池驱动采集" icon={Fingerprint} description="能力画像里的 Skill 是采集器可调用的检索、分类和审核信号；它会写入 tool-capabilities.json，并被 GitHub 专项采集自动合并到 query 池。">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                  <ConceptTile icon={Fingerprint} title="画像数" value={formatNumber(capabilityTotals.totalProfiles)} note="当前可被读取的能力画像。" />
                  <ConceptTile icon={Database} title="能力 Skill" value={formatNumber(capabilityTotals.totalSkills || githubPythonCrawlerTotal + githubCybersecurityTotal)} note="原始专项 Skill 样本。" />
                  <ConceptTile icon={Github} title="源仓库" value={formatNumber(capabilityTotals.totalRepos)} note="去除聚合库和占位库后的源仓库。" />
                  <ConceptTile icon={Search} title="Code Query" value={formatNumber(capabilityTotals.totalCodeQueries)} note="GitHub Code Search 输入。" />
                  <ConceptTile icon={Globe2} title="Repo Query" value={formatNumber(capabilityTotals.totalRepoQueries)} note="GitHub 仓库搜索输入。" />
                  <ConceptTile icon={ShieldCheck} title="分类解释" value={classifierCoverage} note="写回 rawData.skillClassifier。" />
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_0.9fr]">
                  <div className="grid gap-4 2xl:grid-cols-2">
                    <CapabilityProfileCard
                      title="Scrapling / Python 爬虫能力池"
                      profile={pythonCapabilityProfile}
                      fallbackSkillCount={githubPythonCrawlerTotal}
                    />
                    <CapabilityProfileCard
                      title="Shannon 安全研究能力池"
                      profile={cybersecurityCapabilityProfile}
                      fallbackSkillCount={githubCybersecurityTotal}
                    />
                  </div>

                  <div className="space-y-4">
                    <CapabilityActionPanel
                      generatedAt={toolCapabilityState.generatedAt}
                      mode={toolCapabilityState.safetyPolicy?.mode || 'metadata-only'}
                      notes={toolCapabilityState.safetyPolicy?.notes || []}
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <CommandActionCard
                        icon={Fingerprint}
                        title="重建能力画像"
                        commandId="build-tool-capability-profiles"
                        command="npm run collector:build-capabilities"
                        note="生成 codeQueries / repoQueries / topicKeywords。"
                      />
                      <CommandActionCard
                        icon={ListChecks}
                        title="重算 Skill 分类"
                        commandId="reclassify-skills"
                        command="npm run collector:admin -- reclassify-external-skills --limit 50000"
                        note="把分类、标签、命中词写回 external_skills。"
                      />
                      <CommandActionCard
                        icon={RefreshCw}
                        title="启动爬虫能力采集"
                        commandId="github-python-crawler-skills"
                        command="npm run collector:source -- github-python-crawler-skill-index"
                        note={`query ${formatNumber(Number(githubPythonCrawlerState.nextQueryIndex || 0))}/${formatNumber(Number(githubPythonCrawlerState.queryCount || 0))} · 上轮 ${formatNumber(Number(githubPythonCrawlerState.collectedCount || 0))}`}
                      />
                      <CommandActionCard
                        icon={ShieldCheck}
                        title="启动安全能力采集"
                        commandId="github-cybersecurity-skills"
                        command="npm run collector:source -- github-cybersecurity-skill-index"
                        note={`query ${formatNumber(Number(githubCybersecurityState.nextQueryIndex || 0))}/${formatNumber(Number(githubCybersecurityState.queryCount || 0))} · 上轮 ${formatNumber(Number(githubCybersecurityState.collectedCount || 0))}`}
                      />
                      <CommandActionCard
                        icon={BrainCircuit}
                        title="DeepSeek 调度增长"
                        commandId="deepseek-growth-plan"
                        command="npm run collector:deepseek-plan"
                        note="读取能力画像，生成 Skill、资讯、提示词增长计划。"
                      />
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel id="capability-inputs" title="采集器实际输入" icon={Terminal} description="这里展示能力画像将要喂给采集器的关键词和 GitHub 查询，便于判断下一轮会去哪里找原始 Skill。">
                <div className="grid gap-4 xl:grid-cols-2">
                  <CapabilityQueryMatrix title="Scrapling / Python 爬虫" profile={pythonCapabilityProfile} />
                  <CapabilityQueryMatrix title="Shannon 安全研究" profile={cybersecurityCapabilityProfile} />
                </div>
              </Panel>
            </div>
          )}

          {activePage === 'deepseek' && (
            <div className="space-y-4">
              <Panel id="deepseek-control" title="DeepSeek 知识库与增长调度" icon={BrainCircuit} description="DeepSeek 读取本地知识库、能力画像和采集状态，生成 Skill、AI 资讯、提示词三类数据的增长计划。">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                  <ConceptTile icon={BrainCircuit} title="DeepSeek" value={deepSeekConfigStatus.configured ? '已配置' : '未配置'} note={`${deepSeekConfigStatus.model || '-'} · ${deepSeekConfigStatus.maskedToken || '无 token'}`} />
                  <ConceptTile icon={Database} title="知识库条目" value={formatNumber(knowledgeStats.total)} note={`最近更新 ${formatDate(knowledgeStats.updatedAt)}`} />
                  <ConceptTile icon={Fingerprint} title="能力画像" value={formatNumber(capabilityTotals.totalProfiles)} note={`查询词 ${formatNumber(capabilityTotals.totalCodeQueries + capabilityTotals.totalRepoQueries)}`} />
                  <ConceptTile icon={Github} title="Skill 原始库" value={formatNumber(externalSkillCount)} note="DeepSeek 重点补齐原始 GitHub 来源。" />
                  <ConceptTile icon={Newspaper} title="AI 资讯候选" value={formatNumber(aiNewsPendingCount)} note="模型动态、产品发布、研究进展。" />
                  <ConceptTile icon={FileText} title="提示词候选" value={formatNumber(promptLibraryPendingCount)} note="行业提示词与模板候选。" />
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                  <div className="space-y-3">
                    <div className="rounded-md border border-zinc-800 bg-[#0b0f14] p-3">
                      <div className="mb-2 text-sm font-medium text-zinc-100">自动增强流程</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <AutoProcessCard
                          icon={Database}
                          title="构建知识库"
                          status={knowledgeStats.total > 0 ? '已构建' : '等待自动任务'}
                          command="npm run collector:build-knowledge -- --limit 50000"
                          note="从 Skill、提示词、AI 资讯和能力画像抽取可检索知识。"
                        />
                        <AutoProcessCard
                          icon={BrainCircuit}
                          title="生成增长计划"
                          status={deepSeekConfigStatus.configured ? '自动生成' : '等待 API Key'}
                          command="npm run collector:deepseek-plan"
                          note="调用 DeepSeek 生成下一轮采集 query 和推荐命令。"
                        />
                        <AutoProcessCard
                          icon={Sparkles}
                          title="一键增强采集"
                          status={deepSeekGrowthPlan ? '计划已生成' : '等待计划'}
                          command="npm run collector:admin -- deepseek-growth-dispatch"
                          note="构建知识库、生成计划，并执行有边界的一轮增强采集。"
                        />
                        <AutoProcessCard
                          icon={RefreshCw}
                          title="确保 Skill 常驻"
                          status={skillsShDaemonStatus === 'running' ? '常驻运行' : skillsShDaemonStatus}
                          command="npm run collector:skills-sh-daemon"
                          note="GitHub + skills.sh 持续同步，读取 DeepSeek 新增查询词。"
                        />
                      </div>
                    </div>

                    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
                      <div className="mb-3 text-sm font-medium text-zinc-100">知识库分布</div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {knowledgeStats.byScope.map(item => (
                          <MiniStatus key={item.scope} label={item.scope} value={formatNumber(item.count)} />
                        ))}
                        {knowledgeStats.byScope.length === 0 && <div className="text-sm text-zinc-500">还没有知识库条目，先运行“构建知识库”。</div>}
                      </div>
                    </div>
                  </div>

                  <DeepSeekPlanPanel plan={deepSeekGrowthPlan} />
                </div>
              </Panel>

              <Panel id="deepseek-data-flow" title="DeepSeek 如何驱动增长" icon={GitBranch} description="增长计划不是纯报告，生成后的查询词会被 skills.sh、GitHub Skill 索引和提示词采集器读取。">
                <div className="grid gap-3 xl:grid-cols-3">
                  <ProcessBlock
                    title="1. 建知识库"
                    command="knowledge_vectors"
                    note="外部 Skill、提示词候选、AI 资讯候选、能力画像被压缩成可检索文本。"
                  />
                  <ProcessBlock
                    title="2. 生成计划"
                    command=".collector-state/deepseek-growth-plan.json"
                    note="DeepSeek 输出 skillsShQueries、githubCodeQueries、githubRepoQueries 和 prompts.queries。"
                  />
                  <ProcessBlock
                    title="3. 采集器读取"
                    command="collect-resources.ts"
                    note="常驻任务下一轮自动合并这些 query，继续扩充 Skill、AI 资讯和提示词。"
                  />
                </div>
              </Panel>
            </div>
          )}

          {activePage === 'deploy' && (
            <Panel id="deployment-packages" title="部署包与版本迭代" icon={PackageCheck} description="上传新版后台部署包后自动生成 0.0.x 版本，启动部署任务，并在这里保留每次 Skill 知识库版本迭代历史。">
              <DeploymentPackagePanel initialVersions={deploymentVersions} />
            </Panel>
          )}

          {activePage === 'skills-sh' && (
          <Panel id="crawl-state" title="skills.sh 慢速爬取进度" icon={RefreshCw} description="读取本地 checkpoint 文件，展示模拟点击与滚动采集的进度。">
            <SkillsShLiveProgress initialData={skillsShLiveInitialData} />
          </Panel>
          )}

          {activePage === 'ai-news' && (
          <Panel id="ai-news" title="AI 资讯数据源与热点候选" icon={Newspaper} description="专门采集最新、最热门的 AI 资讯：新闻、技术文章、模型动态、产品更新和研究进展。">
            <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <MiniStatus label="AI 资讯采集源" value={`${formatNumber(aiNewsSourceRows.length)} 个`} />
                  <MiniStatus label="待审核资讯候选" value={formatNumber(aiNewsPendingCount)} />
                  <MiniStatus label="热点聚类" value={`${formatNumber(hotClusters.length)} 个`} />
                  <MiniStatus label="候选总源类" value={`${formatNumber(Number(aiNewsTotalCount))} 个`} />
                </div>
                <div className="rounded-md border border-zinc-800 bg-[#0b0f14] p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-zinc-100">最新/热门 AI 资讯采集</div>
                      <div className="mt-1 text-xs text-zinc-500">RSS 优先，候选进入审核队列，后续可发布到 AI 资讯栏目。</div>
                    </div>
                    <CollectorRunButton sourceSlug={officialNewsSource?.slug || 'ai-news-openai-rss'} label="采集 OpenAI" compact />
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <CommandBlock title="采集全部 AI 资讯" command="npm run collector:news" />
                    <CommandBlock title="查看资讯候选" command="npm run collector:candidates -- --type news --status pending --limit 50" />
                  </div>
                </div>
                <div className="max-h-[560px] overflow-auto rounded-md border border-zinc-800">
                  <table className="w-full min-w-[920px] text-left text-sm">
                    <thead className="bg-zinc-950/70 text-xs text-zinc-500">
                      <tr className="border-b border-zinc-800">
                        <th className="px-3 py-3">资讯源</th>
                        <th className="px-3 py-3">类型</th>
                        <th className="px-3 py-3">地区/语言</th>
                        <th className="px-3 py-3">状态</th>
                        <th className="px-3 py-3">候选</th>
                        <th className="px-3 py-3">频率</th>
                        <th className="px-3 py-3">入口</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiNewsSourceRows.map(source => (
                        <tr key={source.id} className="border-b border-zinc-900 align-top">
                          <td className="px-3 py-3">
                            <div className="font-medium text-zinc-100">{source.name}</div>
                            <div className="text-xs text-zinc-500">{source.slug}</div>
                          </td>
                          <td className="px-3 py-3 text-zinc-300">{source.category || source.type}</td>
                          <td className="px-3 py-3 text-zinc-400">{source.region || 'global'} / {source.language || 'multi'}</td>
                          <td className="px-3 py-3"><StatusBadge status={source.enabled ? source.lastStatus : 'disabled'} /></td>
                          <td className="px-3 py-3 text-cyan-200">{formatNumber(source._count.candidates)}</td>
                          <td className="px-3 py-3 text-zinc-400">{source.frequencyMins} 分钟</td>
                          <td className="px-3 py-3">
                            {source.url ? (
                              <a className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-100" href={source.url} target="_blank" rel="noreferrer">
                                RSS <ArrowUpRight className="h-3 w-3" />
                              </a>
                            ) : <span className="text-zinc-600">-</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <ConceptTile icon={Fingerprint} title="内容指纹" value="URL + 标题 + 摘要" note="用于识别重复内容和相似报道。" />
                  <ConceptTile icon={Flame} title="热点聚类" value="多源归并" note="同一事件会合并成内容主题。" />
                  <ConceptTile icon={ListChecks} title="榜单快照" value="GitHub Top 100" note="每日榜单和评分可保留快照。" />
                  <ConceptTile icon={Star} title="人工精选" value="审核置顶/推荐" note="运营可发布、忽略、合并或精选。" />
                </div>
                <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-100">
                    <Flame className="h-4 w-4 text-amber-300" />
                    热点聚类
                  </div>
                  <div className="space-y-2">
                    {hotClusters.map(cluster => (
                      <div key={cluster.id} className="rounded border border-zinc-800 bg-[#0b0f14] px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm text-zinc-200">{cluster.title}</span>
                          <span className="text-xs text-cyan-200">{formatNumber(cluster.heatScore)}</span>
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">候选 {formatNumber(cluster._count.candidates)} · {trim(cluster.tags, 70)}</div>
                      </div>
                    ))}
                    {hotClusters.length === 0 && (
                      <div className="rounded border border-zinc-800 bg-[#0b0f14] px-3 py-6 text-sm text-zinc-500">采集 AI 资讯后这里会出现热点主题。</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 max-h-[640px] overflow-auto rounded-md border border-zinc-800">
              <table className="w-full min-w-[1180px] text-left text-sm">
                <thead className="bg-zinc-950/70 text-xs text-zinc-500">
                  <tr className="border-b border-zinc-800">
                    <th className="px-3 py-3">Score</th>
                    <th className="px-3 py-3">候选内容</th>
                    <th className="px-3 py-3">来源</th>
                    <th className="px-3 py-3">分类</th>
                    <th className="px-3 py-3">热点</th>
                    <th className="px-3 py-3">内容指纹</th>
                    <th className="px-3 py-3">发布时间</th>
                    <th className="px-3 py-3">原文</th>
                  </tr>
                </thead>
                <tbody>
                  {newsCandidates.map(candidate => (
                    <tr key={candidate.id} className="border-b border-zinc-900 align-top">
                      <td className="px-3 py-3 text-cyan-200">{candidate.score}</td>
                      <td className="px-3 py-3">
                        <div className="max-w-[360px] font-medium text-zinc-100">{candidate.title}</div>
                        <div className="mt-1 max-w-[420px] text-xs leading-5 text-zinc-500">{trim(candidate.summaryZh || candidate.highlights, 150)}</div>
                      </td>
                      <td className="px-3 py-3 text-zinc-400">{candidate.sourceName}</td>
                      <td className="px-3 py-3 text-zinc-300">{candidate.category || 'AI 资讯'}</td>
                      <td className="px-3 py-3">
                        <div className="max-w-[180px] truncate text-zinc-300">{candidate.cluster?.title || '-'}</div>
                        <div className="mt-1 text-xs text-zinc-500">heat {formatNumber(candidate.cluster?.heatScore || 0)}</div>
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-zinc-500">{candidate.fingerprint.slice(0, 14)}</td>
                      <td className="px-3 py-3 text-zinc-500">{formatDate(candidate.publishedAt || candidate.createdAt)}</td>
                      <td className="px-3 py-3">
                        {candidate.sourceUrl ? (
                          <a className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-100" href={candidate.sourceUrl} target="_blank" rel="noreferrer">
                            打开 <ArrowUpRight className="h-3 w-3" />
                          </a>
                        ) : <span className="text-zinc-600">-</span>}
                      </td>
                    </tr>
                  ))}
                  {newsCandidates.length === 0 && (
                    <tr>
                      <td className="px-3 py-6 text-sm text-zinc-500" colSpan={8}>还没有 AI 资讯候选，运行 npm run collector:news 后会进入这里。</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
          )}

          {activePage === 'prompts' && (
          <Panel id="prompts" title="提示词源与行业 Prompt 采集" icon={FileText} description="采集 AiShort、ai-tishici README 目录和外部提示词网站，保留原始发布链接并按行业、场景、工具类型沉淀候选。">
            <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <MiniStatus label="提示词采集源" value={`${formatNumber(promptSourceRows.length)} 个`} />
                  <MiniStatus label="待审核提示词" value={formatNumber(promptLibraryPendingCount)} />
                  <MiniStatus label="常驻同步" value={promptDaemonStatus} />
                </div>
                <div className="rounded-md border border-cyan-400/20 bg-cyan-400/5 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-cyan-100">提示词常驻采集</div>
                      <div className="mt-1 text-xs text-zinc-400">{promptDaemonNote}，轮巡 {formatNumber(Number(promptTotalCount))} 个启用提示词源。</div>
                    </div>
                    <CollectorCommandRunButton commandId="prompt-library-daemon" label="确保常驻" compact />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <MiniStatus label="AiShort 接口总量" value={formatNumber(Number(promptCrawlerState.totalAvailable || 0))} />
                  <MiniStatus label="已见提示词 ID" value={formatNumber(Number(promptCrawlerState.seenCount || 0))} />
                  <MiniStatus label="上轮解析正文" value={formatNumber(Number(promptCrawlerState.collectedCount || 0))} />
                  <MiniStatus label="接口分页" value={formatNumber(Number(promptCrawlerState.apiPages || 0))} />
                  <MiniStatus label="详情批量请求" value={formatNumber(Number(promptCrawlerState.bulkRequests || 0))} />
                  <MiniStatus label="最近更新" value={formatDate(promptCrawlerState.updatedAt)} />
                </div>
                <div className="rounded-md border border-zinc-800 bg-[#0b0f14] p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
	                      <div className="text-sm font-medium text-zinc-100">多来源提示词采集</div>
	                      <div className="mt-1 text-xs text-zinc-500">总采集会依次执行 AiShort 接口、ai-tishici README 源目录，以及 PromptBase / FlowGPT / PromptingGuide / OpenArt 等外部提示词网站。AiShort 状态文件：{promptCrawlerConfig.stateFile || '.collector-state/aishort-prompts.json'}</div>
                      {promptCrawlerState.lastError ? (
                        <div className="mt-2 text-xs text-red-300">上次接口错误：{trim(String(promptCrawlerState.lastError), 160)}</div>
                      ) : null}
                    </div>
	                    <div className="flex flex-wrap items-center gap-2">
	                      <CollectorCommandRunButton commandId="prompt-library-daemon" label="常驻同步" compact />
	                      <CollectorCommandRunButton commandId="prompt-library" label="采集全部来源" compact />
	                      <CollectorCommandRunButton commandId="prompt-ai-tishici-directory" label="采集目录" compact />
	                      <CollectorRunButton sourceSlug="prompt-aishort-community" label="只采 AiShort" compact />
	                    </div>
	                  </div>
	                  <div className="grid gap-2 md:grid-cols-4">
	                    <CommandBlock title="采集全部提示词源" command="npm run collector:prompts" />
	                    <CommandBlock title="常驻采集提示词源" command="npm run collector:prompt-daemon" />
	                    <CommandBlock title="采集 ai-tishici 目录" command="npm run collector:source -- prompt-directory-ai-tishici-readme" />
	                    <CommandBlock title="多轮续爬提示词" command="npm run collector:batch-prompts -- --rounds 8" />
	                    <CommandBlock title="查看提示词候选" command="npm run collector:candidates -- --type prompt --status pending --limit 50" />
	                  </div>
	                </div>
	                {aiTishiciPromptSource ? (
	                  <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
	                    <div className="flex flex-wrap items-center justify-between gap-3">
	                      <div>
	                        <div className="text-sm font-medium text-zinc-100">ai-tishici README 源目录</div>
	                        <div className="mt-1 text-xs text-zinc-500">从 holmquistc407/ai-tishici README 拆出外部提示词网站：中文提示词库、提示词市场、绘图提示词工具和提示工程教程。</div>
	                      </div>
	                      <CollectorCommandRunButton commandId="prompt-ai-tishici-directory" label="采集目录" compact />
	                    </div>
	                  </div>
	                ) : null}
                {promptCrawlerModes.length > 0 && (
                  <div className="max-h-[460px] overflow-auto rounded-md border border-zinc-800">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="bg-zinc-950/70 text-xs text-zinc-500">
                        <tr className="border-b border-zinc-800">
                          <th className="px-3 py-3">采集模式</th>
                          <th className="px-3 py-3">关键词</th>
                          <th className="px-3 py-3">页数</th>
                          <th className="px-3 py-3">新增 ID</th>
                          <th className="px-3 py-3">解析正文</th>
                        </tr>
                      </thead>
                      <tbody>
                        {promptCrawlerModes.slice(0, 12).map((mode, index) => (
                          <tr key={`${mode.sort || 'mode'}-${mode.query || ''}-${index}`} className="border-b border-zinc-900">
                            <td className="px-3 py-3 font-mono text-xs text-zinc-200">{String(mode.sort || '-')}</td>
                            <td className="px-3 py-3 text-zinc-400">{String(mode.query || '全站')}</td>
                            <td className="px-3 py-3 text-zinc-300">{formatNumber(Number(mode.startPage || 1))} → {formatNumber(Number(mode.pages || 0))}/{formatNumber(Number(mode.pageCount || 0))}</td>
                            <td className="px-3 py-3 text-cyan-200">{formatNumber(Number(mode.newIds || 0))}</td>
                            <td className="px-3 py-3 text-emerald-200">{formatNumber(Number(mode.parsed || 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="max-h-[460px] overflow-auto rounded-md border border-zinc-800">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-zinc-950/70 text-xs text-zinc-500">
                      <tr className="border-b border-zinc-800">
                        <th className="px-3 py-3">提示词源</th>
                        <th className="px-3 py-3">状态</th>
	                        <th className="px-3 py-3">分类/解析器</th>
	                        <th className="px-3 py-3">候选</th>
                        <th className="px-3 py-3">频率</th>
                        <th className="px-3 py-3">入口</th>
                      </tr>
                    </thead>
                    <tbody>
	                      {promptSourceRows.map(source => {
	                        const rawConfig = parseJson<Record<string, any>>(source.config, {})
	                        return (
	                        <tr key={source.id} className="border-b border-zinc-900 align-top">
	                          <td className="px-3 py-3">
	                            <div className="font-medium text-zinc-100">{source.name}</div>
	                            <div className="text-xs text-zinc-500">{source.slug}</div>
	                          </td>
	                          <td className="px-3 py-3"><StatusBadge status={source.enabled ? source.lastStatus : 'disabled'} /></td>
	                          <td className="px-3 py-3">
	                            <div className="text-xs text-zinc-300">{source.category || '-'}</div>
	                            <div className="mt-1 font-mono text-[11px] text-zinc-500">{String(rawConfig.parser || 'generic-prompt-site')}</div>
	                          </td>
	                          <td className="px-3 py-3 text-cyan-200">{formatNumber(source._count.candidates)}</td>
	                          <td className="px-3 py-3 text-zinc-400">{source.frequencyMins} 分钟</td>
	                          <td className="px-3 py-3">
                            {source.url ? (
                              <a className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-100" href={source.url} target="_blank" rel="noreferrer">
                                打开 <ArrowUpRight className="h-3 w-3" />
                              </a>
                            ) : <span className="text-zinc-600">-</span>}
                          </td>
	                        </tr>
	                        )
	                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="max-h-[680px] overflow-auto rounded-md border border-zinc-800">
                <table className="w-full min-w-[1060px] text-left text-sm">
                  <thead className="bg-zinc-950/70 text-xs text-zinc-500">
                    <tr className="border-b border-zinc-800">
                      <th className="px-3 py-3">Score</th>
                      <th className="px-3 py-3">提示词</th>
                      <th className="px-3 py-3">行业分类</th>
                      <th className="px-3 py-3">作者</th>
                      <th className="px-3 py-3">点赞</th>
                      <th className="px-3 py-3">标签</th>
                      <th className="px-3 py-3">原文</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promptCandidates.map(candidate => {
                      const raw = parseJson<Record<string, any>>(candidate.rawData, {})
                      return (
                        <tr key={candidate.id} className="border-b border-zinc-900 align-top">
                          <td className="px-3 py-3 text-cyan-200">{candidate.score}</td>
                          <td className="px-3 py-3">
                            <div className="max-w-[260px] font-medium text-zinc-100">{candidate.title}</div>
                            <div className="mt-1 max-w-[420px] text-xs leading-5 text-zinc-500">{trim(candidate.summaryZh || candidate.highlights, 180)}</div>
                          </td>
                          <td className="px-3 py-3 text-zinc-300">{candidate.category || '通用提示词'}</td>
                          <td className="px-3 py-3 text-zinc-400">{candidate.author || raw.author || '-'}</td>
                          <td className="px-3 py-3 font-mono text-xs text-zinc-200">{formatNumber(Number(raw.votes || 0))}</td>
                          <td className="px-3 py-3"><TagList tags={splitList(candidate.tags).slice(0, 4)} /></td>
                          <td className="px-3 py-3">
                            {candidate.sourceUrl ? (
                              <a className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-100" href={candidate.sourceUrl} target="_blank" rel="noreferrer">
                                打开 <ArrowUpRight className="h-3 w-3" />
                              </a>
                            ) : <span className="text-zinc-600">-</span>}
                          </td>
                        </tr>
                      )
                    })}
                    {promptCandidates.length === 0 && (
                      <tr>
                        <td className="px-3 py-8 text-sm text-zinc-500" colSpan={7}>还没有提示词候选，运行 npm run collector:prompts 后会进入这里。</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Panel>
          )}

          {activePage === 'sources' && (
          <CollectorLiveSources initialData={liveSourcesInitialData} />
          )}

          {activePage === 'tools' && (
          <Panel id="tools" title="采集工具" icon={SlidersHorizontal} description="每个工具对应一个后端采集源，可以直接触发，也可以用命令做长时间批量跑。">
            <div className="grid gap-4 xl:grid-cols-5">
              <ToolCard
                icon={Newspaper}
                title="AI 资讯批量采集"
                source={officialNewsSource}
                sourceSlug="ai-news"
                count={aiNewsPendingCount}
                command="npm run collector:news"
                description="批量采集最新 AI 新闻、技术文章、模型动态、产品发布和研究进展，写入候选内容与热点聚类。"
              />
              <ToolCard
                icon={FileText}
                title="行业提示词库采集"
                source={aiShortPromptSource}
                sourceSlug="prompt-aishort-community"
                count={promptLibraryPendingCount}
                command="npm run collector:prompts"
                description="采集 AiShort 社区提示词，按教育、营销、办公、设计、研发等行业场景生成候选提示词库。"
              />
              <ToolCard
                icon={GitBranch}
                title="GitHub 全网 Skill 索引"
                source={githubGlobalIndex}
                count={githubGlobalIndexTotal}
                command="npm run collector:source -- github-global-skill-index"
                description="轮询 GitHub Code Search，发现具体 SKILL.md、skills 目录或源码路径，不把普通仓库首页当作 Skill 源头。"
                note={`Query ${formatNumber(Number(githubIndexState.nextQueryIndex || 0))}/${formatNumber(Number(githubIndexState.queryCount || 0))} · 上轮 ${formatNumber(Number(githubIndexState.collectedCount || 0))} · raw ${formatNumber(Number(githubIndexState.rawFetches || 0))}`}
              />
              <ToolCard
                icon={Search}
                title="Scrapling 风格爬虫 Skill"
                source={githubPythonCrawlerIndex}
                count={githubPythonCrawlerTotal}
                command="npm run collector:source -- github-python-crawler-skill-index"
                description="从 GitHub 采集 Scrapling、Scrapy、Playwright/Selenium scraping、Firecrawl、crawl4ai、BeautifulSoup/lxml/parsel 等真实爬虫工具链 Skill 源文件。"
                note={`Query ${formatNumber(Number(githubPythonCrawlerState.nextQueryIndex || 0))}/${formatNumber(Number(githubPythonCrawlerState.queryCount || 0))} · 上轮 ${formatNumber(Number(githubPythonCrawlerState.collectedCount || 0))} · raw ${formatNumber(Number(githubPythonCrawlerState.rawFetches || 0))} · ${formatDate(githubPythonCrawlerState.updatedAt)}`}
              />
              <ToolCard
                icon={ShieldCheck}
                title="Shannon 黑客技能库 Skill"
                source={githubCybersecurityIndex}
                count={githubCybersecurityTotal}
                command="npm run collector:source -- github-cybersecurity-skill-index"
                description="从 GitHub 采集 Shannon、AI pentester、offensive security、红蓝队、CTF、OSINT、逆向、取证和 malware analysis 类 Skill 元数据。"
                note={`Query ${formatNumber(Number(githubCybersecurityState.nextQueryIndex || 0))}/${formatNumber(Number(githubCybersecurityState.queryCount || 0))} · 上轮 ${formatNumber(Number(githubCybersecurityState.collectedCount || 0))} · raw ${formatNumber(Number(githubCybersecurityState.rawFetches || 0))} · ${formatDate(githubCybersecurityState.updatedAt)}`}
              />
              <ToolCard
                icon={Search}
                title="skills.sh GitHub 源扩采"
                source={skillsShGithub}
                count={skillsShGithubTotal}
                command="npm run collector:source -- skills-sh-github-sources"
                description="从 skills.sh 已发现的 source 仓库反查 GitHub tree、SKILL.md、skills 目录和 README 列表，把链接落到真实源仓库。"
              />
              <ToolCard
                icon={RefreshCw}
                title="skills.sh 慢速浏览器"
                source={skillsShSlow}
                count={skillsShBrowserTotal}
                command="npm run collector:source -- skills-sh-browser-slow"
                description={`Scrapling 动态浏览器，模拟滚动和可见按钮点击。每轮 ${formatNumber(Number(browserConfig.browserLimit || 80))} 条以内，断点续爬。`}
              />
              <ToolCard
                icon={Sparkles}
                title="skills.sh 公开页/API"
                source={skillsShApi}
                count={skillsShTotal}
                command="npm run collector:source -- skills-sh-all"
                description="优先走 API，未配置 token 时解析公开页和 Next 内嵌数据。适合补齐公开可见 Skill。"
              />
              <ToolCard
                icon={Search}
                title="skills.sh 搜索扩量"
                source={skillsShSearch}
                count={skillsShSearchTotal}
                command="npm run collector:source -- skills-sh-search-index"
                description="调用 skills.sh 公开搜索 API，按关键词分片慢速采集，每轮自动断点续跑并写入 GitHub 技能源头链接。"
              />
              <ToolCard
                icon={ListChecks}
                title="GitHub 指标补全"
                count={0}
                command="npm run collector:sync-github-stars -- --limit 100000 --repo-limit 5000 --concurrency 4"
                description="用 GitHub Token 快速补齐源仓库 star 和 fork，不拉 release，历史数据和仓库列表排序都会更新。"
              />
              <ToolCard
                icon={Database}
                title="同步到原技能库"
                commandId="sync-external-skills"
                count={publishedSkillCount}
                command="npm run collector:sync-skills -- --limit 50000 --repo-limit 5000"
                description="把 external_skills 里的 GitHub / skills.sh Skill 按源仓库自动聚合，写入原项目 skill_resources 技能库，并回填 publishedRef。"
                note={`当前 skill_resources ${formatNumber(publishedSkillCount)} 条`}
              />
              <ToolCard
                icon={Fingerprint}
                title="能力画像增强"
                count={Number(pythonCapabilityProfile?.skillCount || 0) + Number(cybersecurityCapabilityProfile?.skillCount || 0)}
                command="npm run collector:build-capabilities"
                description="从 Scrapling 风格爬虫和 Shannon 黑客技能库原始数据提炼关键词、热门仓库、GitHub 查询和安全策略，反哺专项采集器。"
                note={`Crawler ${formatNumber(Number(pythonCapabilityProfile?.skillCount || githubPythonCrawlerTotal || 0))} / Shannon ${formatNumber(Number(cybersecurityCapabilityProfile?.skillCount || githubCybersecurityTotal || 0))} · ${formatDate(toolCapabilityState.generatedAt)}`}
              />
            </div>
          </Panel>
          )}

          {activePage === 'runs' && (
          <section id="runs" className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Panel title="任务监控" icon={Activity} description="所有手动触发和后台采集都会写入这里。">
              <div className="space-y-3">
                {latestRuns.map(run => (
                  <RunCard key={run.id} run={run} />
                ))}
              </div>
            </Panel>

            <Panel title="失败与维护动作" icon={AlertTriangle} description="用于排查失败源、修复 stale running 任务和清理脏数据。">
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <CommandBlock title="修正超时任务" command="npm run collector:admin -- mark-stale-runs --minutes 10" />
                  <CommandBlock title="清理低质量 Skill" command="npm run collector:admin -- clean-low-quality-external-skills" />
                  <CommandBlock title="同步 GitHub Star" command="npm run collector:sync-github-stars -- --limit 100000 --repo-limit 5000 --concurrency 4" />
                  <CommandBlock title="同步到原技能库" command="npm run collector:sync-skills -- --limit 50000 --repo-limit 5000" />
                  <CommandBlock title="生成能力画像" command="npm run collector:build-capabilities" />
                  <CommandBlock title="同步源配置" command="npm run collector:seed-sources" />
                  <CommandBlock title="查看外部 Skill" command="npm run collector:external-skills -- --source skills-sh --limit 50" />
                  <CommandBlock title="查看 AI 资讯候选" command="npm run collector:candidates -- --type news --status pending --limit 50" />
                  <CommandBlock title="查看提示词候选" command="npm run collector:candidates -- --type prompt --status pending --limit 50" />
                </div>
                <div className="max-h-[520px] overflow-auto rounded-md border border-zinc-800">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-zinc-950/70 text-xs text-zinc-500">
                      <tr className="border-b border-zinc-800">
                        <th className="px-3 py-3">失败源</th>
                        <th className="px-3 py-3">失败次数</th>
                        <th className="px-3 py-3">最后错误</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failedSources.map(source => (
                        <tr key={source.id} className="border-b border-zinc-900">
                          <td className="px-3 py-3">
                            <div className="font-medium text-zinc-100">{source.name}</div>
                            <div className="text-xs text-zinc-500">{source.slug}</div>
                          </td>
                          <td className="px-3 py-3 text-red-200">{source.failCount}</td>
                          <td className="px-3 py-3 text-xs text-red-200">{trim(source.lastError, 160)}</td>
                        </tr>
                      ))}
                      {failedSources.length === 0 && (
                        <tr>
                          <td className="px-3 py-6 text-sm text-zinc-500" colSpan={3}>当前没有失败的数据源。</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </Panel>
          </section>
          )}

          {activePage === 'skills' && (
          <>
          <Panel id="skills" title="外部 Skill 原始库" icon={Database} description="这里展示采集到但尚未发布到社区 Skill 库的原始记录，按热度和质量排序。">
            <div className="mb-4 rounded-md border border-zinc-800 bg-[#0b0f14] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                  <PackageCheck className="h-4 w-4 text-cyan-300" />
                  Skill 知识库版本迭代
                </div>
                <Link className="inline-flex h-8 items-center gap-1 rounded-md border border-cyan-500/50 bg-cyan-400/10 px-2.5 text-xs font-medium text-cyan-100 hover:border-cyan-300" href={switchHref('deploy')}>
                  上传部署包
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {deploymentVersions.slice(0, 3).map(version => (
                  <div key={version.id} className="rounded border border-zinc-800 bg-zinc-950/70 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm text-cyan-200">{version.version}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusClass(version.status)}`}>{version.statusLabel || version.status}</span>
                    </div>
                    <div className="mt-1 truncate text-xs text-zinc-500">{version.title || version.packageName || '-'}</div>
                    <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-zinc-600">
                      <span>external {formatNumber(version.externalSkillCount)}</span>
                      <span>published {formatNumber(version.skillCount)}</span>
                    </div>
                  </div>
                ))}
                {deploymentVersions.length === 0 && (
                  <div className="rounded border border-zinc-800 bg-zinc-950/70 px-3 py-4 text-sm text-zinc-500 md:col-span-3">
                    暂无版本记录，上传第一个部署包后会生成 0.0.1。
                  </div>
                )}
              </div>
            </div>
            <div className="max-h-[680px] overflow-auto">
              <table className="w-full min-w-[1380px] text-left text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr className="border-b border-zinc-800">
                    <th className="py-3 pr-3">Score</th>
                    <th className="py-3 pr-3">Skill</th>
                    <th className="py-3 pr-3">来源</th>
                    <th className="py-3 pr-3">GitHub 源仓库</th>
                    <th className="py-3 pr-3">Stars / Forks</th>
                    <th className="py-3 pr-3">安装/下载</th>
                    <th className="py-3 pr-3">中文分类</th>
                    <th className="py-3 pr-3">标签</th>
                    <th className="py-3 pr-3">采集时间</th>
                    <th className="py-3">链接</th>
                  </tr>
                </thead>
                <tbody>
                  {externalSkills.map(skill => {
                    const github = githubInfoFromSkill(skill)
                    const classifier = classifierInfoFromSkill(skill)
                    const originalLink = github.sourceUrl || skill.githubUrl || skill.sourceUrl
                    return (
                      <tr key={skill.id} className="border-b border-zinc-900 align-top">
                        <td className="py-3 pr-3">
                          <span className="rounded bg-cyan-400/10 px-2 py-1 text-xs text-cyan-200">{skill.heatScore}</span>
                        </td>
                        <td className="py-3 pr-3">
                          <div className="max-w-[300px] font-medium text-zinc-100">{skill.name}</div>
                          <div className="mt-1 max-w-[360px] text-xs leading-5 text-zinc-500">{trim(skill.description, 130)}</div>
                        </td>
                        <td className="py-3 pr-3 text-zinc-400">{skill.sourceSlug}</td>
                        <td className="py-3 pr-3">
                          {github.repo ? (
                            <div className="max-w-[230px]">
                              <a className="inline-flex items-center gap-1 font-mono text-xs text-cyan-300 hover:text-cyan-100" href={github.repoUrl || `https://github.com/${github.repo}`} target="_blank" rel="noreferrer">
                                {github.repo}
                                <ArrowUpRight className="h-3 w-3" />
                              </a>
                              {github.skillPath && (
                                <div className="mt-1 truncate font-mono text-[11px] text-zinc-500" title={github.skillPath}>{github.skillPath}</div>
                              )}
                              {github.installGitUrl && (
                                <div className="mt-1 truncate font-mono text-[11px] text-emerald-300" title={github.installGitUrl}>{github.installGitUrl}</div>
                              )}
                            </div>
                          ) : <span className="text-zinc-600">待补全</span>}
                        </td>
                        <td className="py-3 pr-3">
                          <div className="font-mono text-xs text-zinc-200">{formatNumber(github.stars)} ★</div>
                          <div className="mt-1 font-mono text-[11px] text-zinc-500">{formatNumber(github.forks)} forks</div>
                          {github.stars === 0 && <div className="mt-1 text-[11px] text-amber-300">待 GitHub 同步</div>}
                        </td>
                        <td className="py-3 pr-3">
                          <div className="font-mono text-xs text-zinc-200">{formatNumber(github.downloads)}</div>
                          <div className="mt-1 text-[11px] text-zinc-500">skills.sh installs / release</div>
                        </td>
                        <td className="py-3 pr-3 text-zinc-300">
                          <div>{classifier.categoryZh}</div>
                          <div className="mt-1 font-mono text-[11px] text-cyan-300">conf {formatNumber(classifier.confidence)}</div>
                          <div className="mt-1 max-w-[220px] text-[11px] leading-4 text-zinc-500">{classifier.matchedKeywords.slice(0, 4).join(' / ') || '待回填解释'}</div>
                        </td>
                        <td className="py-3 pr-3">
                          <TagList tags={classifier.tagsZh.slice(0, 4)} />
                          {classifier.capabilityHints.length > 0 ? (
                            <div className="mt-1 text-[11px] text-emerald-300">能力池反哺</div>
                          ) : null}
                        </td>
                        <td className="py-3 pr-3 text-zinc-500">{formatDate(skill.collectedAt)}</td>
                        <td className="py-3">
                          {originalLink ? (
                            <a className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-100" href={originalLink} target="_blank" rel="noreferrer">
                              原始链接 <ArrowUpRight className="h-3 w-3" />
                            </a>
                          ) : <span className="text-zinc-600">-</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel id="review" title="待审核 Skill 候选" icon={ShieldCheck} description="运营可以从这里判断是否发布、忽略、合并或回填分类。">
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr className="border-b border-zinc-800">
                    <th className="py-3 pr-3">Score</th>
                    <th className="py-3 pr-3">Title</th>
                    <th className="py-3 pr-3">Source</th>
                    <th className="py-3 pr-3">Category</th>
                    <th className="py-3 pr-3">Related</th>
                    <th className="py-3 pr-3">Created</th>
                    <th className="py-3">URL</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map(candidate => (
                    <tr key={candidate.id} className="border-b border-zinc-900 align-top">
                      <td className="py-3 pr-3 text-cyan-200">{candidate.score}</td>
                      <td className="py-3 pr-3 font-medium text-zinc-100">{candidate.title}</td>
                      <td className="py-3 pr-3 text-zinc-400">{candidate.sourceName}</td>
                      <td className="py-3 pr-3 text-zinc-400">{candidate.category}</td>
                      <td className="py-3 pr-3 text-zinc-500">{trim(candidate.relatedSkills, 88)}</td>
                      <td className="py-3 pr-3 text-zinc-500">{formatDate(candidate.createdAt)}</td>
                      <td className="py-3">
                        {candidate.sourceUrl ? (
                          <a className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-100" href={candidate.sourceUrl} target="_blank" rel="noreferrer">
                            打开 <ArrowUpRight className="h-3 w-3" />
                          </a>
                        ) : <span className="text-zinc-600">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          </>
          )}
        </div>
      </div>
    </main>
  )
}

function StatCard({ icon: Icon, label, value, note, tone }: { icon: any; label: string; value: number; note: string; tone: 'cyan' | 'emerald' | 'amber' | 'red' | 'blue' | 'violet' }) {
  const tones = {
    cyan: 'text-cyan-200 bg-cyan-400/10',
    emerald: 'text-emerald-200 bg-emerald-400/10',
    amber: 'text-amber-200 bg-amber-400/10',
    red: 'text-red-200 bg-red-400/10',
    blue: 'text-blue-200 bg-blue-400/10',
    violet: 'text-violet-200 bg-violet-400/10',
  }
  return (
    <div className="rounded-md border border-zinc-800 bg-[#111820] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-zinc-400">{label}</span>
        <span className={`rounded-md p-2 ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold text-white">{formatNumber(value)}</div>
      <div className="mt-1 text-xs text-zinc-500">{note}</div>
    </div>
  )
}

function OverviewShortcut({ icon: Icon, title, href, metric, note }: { icon: any; title: string; href: string; metric: string; note: string }) {
  return (
    <Link href={href} className="group rounded-md border border-zinc-800 bg-[#10161d] p-4 transition-colors hover:border-cyan-400/60 hover:bg-[#121b24]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
            <Icon className="h-4 w-4 text-cyan-300" />
            {title}
          </div>
          <div className="mt-3 text-2xl font-semibold text-white">{metric}</div>
        </div>
        <ArrowUpRight className="h-4 w-4 text-zinc-600 transition-colors group-hover:text-cyan-200" />
      </div>
      <div className="mt-3 text-xs leading-5 text-zinc-500">{note}</div>
    </Link>
  )
}

function Panel({ id, title, icon: Icon, description, children }: { id?: string; title: string; icon: any; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-md border border-zinc-800 bg-[#10161d]">
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-cyan-300" />
          <h2 className="font-medium text-zinc-100">{title}</h2>
        </div>
        {description && <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function StatusBadge({ status }: { status?: string | null }) {
  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusClass(status)}`}>{status || 'idle'}</span>
}

function ProgressMetric({ label, value, total, note }: { label: string; value: number; total: number; note: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-zinc-100">{label}</div>
          <div className="mt-1 text-xs text-zinc-500">{note}</div>
        </div>
        <div className="text-sm text-cyan-200">{percent(value, total)}</div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full bg-cyan-300" style={{ width: percent(value, total) }} />
      </div>
      <div className="mt-3 text-2xl font-semibold text-white">{formatNumber(value)}</div>
    </div>
  )
}

function MiniStatus({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-[#0b0f14] px-3 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 font-medium text-zinc-100">{value}</div>
    </div>
  )
}

function QualityMeter({ label, value, total, percentLabel, note }: { label: string; value: number; total: number; percentLabel: string; note: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-[#0b0f14] p-3">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono text-cyan-200">{percentLabel}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full bg-cyan-300" style={{ width: percentLabel }} />
      </div>
      <div className="mt-2 font-mono text-lg text-zinc-100">{formatNumber(value)} / {formatNumber(total)}</div>
      <div className="mt-1 text-[11px] leading-4 text-zinc-500">{note}</div>
    </div>
  )
}

function SourceSummary({ totalCount, aiNewsCount, promptCount, skillsShCount, githubCount }: { totalCount: number; aiNewsCount: number; promptCount: number; skillsShCount: number; githubCount: number }) {
  return (
    <div className="grid gap-3 md:grid-cols-5">
      <MiniStatus label="当前启用源" value={`${totalCount} 个`} />
      <MiniStatus label="AI 资讯源" value={`${aiNewsCount} 个`} />
      <MiniStatus label="提示词源" value={`${promptCount} 个`} />
      <MiniStatus label="skills.sh 源" value={`${skillsShCount} 个`} />
      <MiniStatus label="GitHub 源" value={`${githubCount} 个`} />
    </div>
  )
}

function ConceptTile({ icon: Icon, title, value, note }: { icon: any; title: string; value: string; note: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
        <Icon className="h-4 w-4 text-cyan-300" />
        {title}
      </div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs leading-5 text-zinc-500">{note}</div>
    </div>
  )
}

function CapabilityActionPanel({ generatedAt, mode, notes }: { generatedAt?: string; mode: string; notes: string[] }) {
  const fallbackNotes = [
    '能力画像只用于采集关键词、来源追踪、分类解释和人工审核信号。',
    '安全类 Skill 只保存元数据，不执行外部目标扫描、漏洞利用或凭据采集。',
    '每条可入库 Skill 必须能追溯到 GitHub 源仓库或具体源文件。',
  ]
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
        <ShieldCheck className="h-4 w-4 text-cyan-300" />
        执行边界与画像状态
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <MiniStatus label="画像生成时间" value={formatDate(generatedAt)} />
        <MiniStatus label="执行模式" value={mode} />
        <MiniStatus label="画像文件" value=".collector-state/tool-capabilities.json" />
      </div>
      <div className="mt-3 space-y-2 text-xs leading-5 text-zinc-500">
        {(notes.length ? notes : fallbackNotes).slice(0, 5).map(note => (
          <p key={note}>{note}</p>
        ))}
      </div>
    </div>
  )
}

function CommandActionCard({ icon: Icon, title, commandId, command, note }: { icon: any; title: string; commandId: string; command: string; note: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-[#0b0f14] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
            <Icon className="h-4 w-4 text-cyan-300" />
            {title}
          </div>
          <div className="mt-2 truncate rounded border border-zinc-800 bg-zinc-950/70 px-2 py-1.5 font-mono text-[11px] text-zinc-400" title={command}>
            {command}
          </div>
          <div className="mt-2 text-xs leading-5 text-zinc-500">{note}</div>
        </div>
        <CollectorCommandRunButton commandId={commandId} label="启动" compact />
      </div>
    </div>
  )
}

function AutoProcessCard({ icon: Icon, title, status, command, note }: { icon: any; title: string; status: string; command: string; note: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-[#0b0f14] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
            <Icon className="h-4 w-4 text-cyan-300" />
            {title}
          </div>
          <div className="mt-2 truncate rounded border border-zinc-800 bg-zinc-950/70 px-2 py-1.5 font-mono text-[11px] text-zinc-400" title={command}>
            {command}
          </div>
          <div className="mt-2 text-xs leading-5 text-zinc-500">{note}</div>
        </div>
        <span className="shrink-0 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2 py-0.5 text-xs text-cyan-100">
          {status}
        </span>
      </div>
    </div>
  )
}

function CapabilityProfileCard({ title, profile, fallbackSkillCount }: { title: string; profile?: CapabilityProfile; fallbackSkillCount: number }) {
  const topKeywords = profile?.topKeywords || []
  const topRepos = profile?.topRepos || []
  const codeQueries = profile?.codeQueries || []
  const repoQueries = profile?.repoQueries || []
  const topicKeywords = profile?.topicKeywords || []
  return (
    <article className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-zinc-100">{title}</div>
          <div className="mt-1 text-xs text-zinc-500">{profile?.sourceSlug || '等待生成画像'}</div>
        </div>
        <StatusBadge status={profile ? 'success' : fallbackSkillCount > 0 ? 'idle' : 'disabled'} />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <MiniStatus label="Skill" value={formatNumber(Number(profile?.skillCount || fallbackSkillCount || 0))} />
        <MiniStatus label="有效 Skill" value={formatNumber(Number(profile?.activeSkillCount || 0))} />
        <MiniStatus label="仓库" value={formatNumber(Number(profile?.repoCount || 0))} />
        <MiniStatus label="关键词" value={formatNumber(Number(profile?.keywordCount || topKeywords.length || 0))} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-medium text-zinc-300">高频关键词</div>
          <TagList tags={topKeywords.slice(0, 10).map(item => item.value)} />
          {topKeywords.length === 0 && <div className="text-xs text-zinc-600">运行 npm run collector:build-capabilities 后生成。</div>}
        </div>
        <div>
          <div className="mb-2 text-xs font-medium text-zinc-300">Top GitHub 源仓库</div>
          <div className="space-y-1">
            {topRepos.slice(0, 5).map(repo => (
              <a key={repo.repo} className="flex items-center justify-between gap-3 rounded border border-zinc-800 bg-[#0b0f14] px-2 py-1.5 text-xs hover:border-cyan-500/50" href={repo.sourceUrl || `https://github.com/${repo.repo}`} target="_blank" rel="noreferrer">
                <span className="truncate font-mono text-cyan-300">{repo.repo}</span>
                <span className="shrink-0 text-zinc-500">{formatNumber(repo.stars)} stars</span>
              </a>
            ))}
            {topRepos.length === 0 && <div className="text-xs text-zinc-600">暂无仓库画像。</div>}
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <QueryPreview title="Code Query" rows={codeQueries.slice(0, 4)} />
        <QueryPreview title="Repo Query" rows={repoQueries.slice(0, 4)} />
        <QueryPreview title="分类关键词" rows={topicKeywords.slice(0, 8)} />
      </div>
      <div className="mt-4 rounded-md border border-zinc-800 bg-[#0b0f14] p-3 text-xs leading-5 text-zinc-400">
        {(profile?.toolHints || []).slice(0, 3).map(hint => (
          <p key={hint}>{hint}</p>
        ))}
        {!profile && <p>画像生成后，专项采集器会自动读取新增 codeQueries、repoQueries 和 topicKeywords。</p>}
      </div>
    </article>
  )
}

function CapabilityQueryMatrix({ title, profile }: { title: string; profile?: CapabilityProfile }) {
  const codeQueries = profile?.codeQueries || []
  const repoQueries = profile?.repoQueries || []
  const topicKeywords = profile?.topicKeywords || []
  const topRepos = profile?.topRepos || []
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium text-zinc-100">{title}</div>
          <div className="mt-1 text-xs text-zinc-500">{profile?.sourceSlug || '等待生成能力画像'}</div>
        </div>
        <StatusBadge status={profile ? 'success' : 'idle'} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <QueryPreview title={`Code Search · ${formatNumber(codeQueries.length)}`} rows={codeQueries.slice(0, 10)} />
        <QueryPreview title={`Repo Search · ${formatNumber(repoQueries.length)}`} rows={repoQueries.slice(0, 10)} />
        <QueryPreview title={`Topic Keywords · ${formatNumber(topicKeywords.length)}`} rows={topicKeywords.slice(0, 14)} />
        <div className="rounded-md border border-zinc-800 bg-[#0b0f14] p-3">
          <div className="mb-2 text-xs font-medium text-zinc-300">源仓库种子 · {formatNumber(topRepos.length)}</div>
          <div className="space-y-1">
            {topRepos.slice(0, 8).map(repo => (
              <a key={repo.repo} className="flex items-center justify-between gap-3 rounded border border-zinc-800 bg-zinc-950/70 px-2 py-1.5 text-xs hover:border-cyan-500/50" href={repo.sourceUrl || `https://github.com/${repo.repo}`} target="_blank" rel="noreferrer">
                <span className="truncate font-mono text-cyan-300">{repo.repo}</span>
                <span className="shrink-0 text-zinc-500">{formatNumber(repo.stars)} stars</span>
              </a>
            ))}
            {topRepos.length === 0 && <div className="text-xs text-zinc-600">等待生成</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

function DeepSeekPlanPanel({ plan }: { plan: any }) {
  if (!plan) {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
          <BrainCircuit className="h-4 w-4 text-cyan-300" />
          最近增长计划
        </div>
        <div className="mt-4 rounded-md border border-zinc-800 bg-[#0b0f14] px-3 py-8 text-sm text-zinc-500">
          还没有 DeepSeek 增长计划，先运行“构建知识库”，再运行“生成增长计划”。
        </div>
      </div>
    )
  }

  const skill = plan.skill || {}
  const news = plan.news || {}
  const prompts = plan.prompts || {}
  const commands = Array.isArray(plan.commands) ? plan.commands : []
  const notes = Array.isArray(plan.notes) ? plan.notes : []

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
            <BrainCircuit className="h-4 w-4 text-cyan-300" />
            最近增长计划
          </div>
          <div className="mt-1 text-xs text-zinc-500">{formatDate(plan.generatedAt)} · {plan.model || 'fallback'}</div>
        </div>
        <StatusBadge status={plan.ok ? 'success' : 'failed'} />
      </div>

      {plan.error ? (
        <div className="mt-3 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
          {plan.error}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <PlanColumn title="Skill 增长" goal={skill.goal} reason={skill.reason} rows={[
          ['skills.sh', skill.skillsShQueries],
          ['GitHub Code', skill.githubCodeQueries],
          ['GitHub Repo', skill.githubRepoQueries],
        ]} />
        <PlanColumn title="AI 资讯增长" goal={news.goal} reason={news.reason} rows={[
          ['Topics', news.topics],
          ['Sources', news.prioritySources],
        ]} />
        <PlanColumn title="提示词增长" goal={prompts.goal} reason={prompts.reason} rows={[
          ['Queries', prompts.queries],
          ['Sources', prompts.prioritySources],
        ]} />
      </div>

      <div className="mt-4 rounded-md border border-zinc-800 bg-[#0b0f14] p-3">
        <div className="mb-2 text-xs font-medium text-zinc-300">推荐命令</div>
        <div className="space-y-2">
          {commands.slice(0, 8).map((command: any) => (
            <div key={`${command.commandId}-${command.reason}`} className="flex items-start justify-between gap-3 rounded border border-zinc-800 bg-zinc-950/70 px-2 py-2">
              <div>
                <div className="font-mono text-xs text-cyan-200">{command.commandId}</div>
                <div className="mt-1 text-xs text-zinc-500">{command.reason}</div>
              </div>
              <CollectorCommandRunButton commandId={command.commandId} label="启动" compact />
            </div>
          ))}
          {commands.length === 0 && <div className="text-xs text-zinc-600">暂无推荐命令。</div>}
        </div>
      </div>

      {notes.length > 0 && (
        <div className="mt-4 space-y-1 text-xs leading-5 text-zinc-500">
          {notes.slice(0, 6).map((note: string) => <p key={note}>{note}</p>)}
        </div>
      )}
    </div>
  )
}

function PlanColumn({ title, goal, reason, rows }: { title: string; goal?: string; reason?: string; rows: Array<[string, any]> }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-[#0b0f14] p-3">
      <div className="text-sm font-medium text-zinc-100">{title}</div>
      <div className="mt-1 text-xs leading-5 text-zinc-500">{goal || '-'}</div>
      <div className="mt-3 space-y-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <div className="mb-1 text-[11px] text-zinc-500">{label}</div>
            <TagList tags={(Array.isArray(value) ? value : []).slice(0, 10).map(String)} />
          </div>
        ))}
      </div>
      {reason ? <div className="mt-3 text-xs leading-5 text-zinc-500">{reason}</div> : null}
    </div>
  )
}

function ProcessBlock({ title, command, note }: { title: string; command: string; note: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
      <div className="text-sm font-medium text-zinc-100">{title}</div>
      <div className="mt-2 rounded border border-zinc-800 bg-[#0b0f14] px-2 py-1.5 font-mono text-xs text-cyan-200">{command}</div>
      <div className="mt-3 text-xs leading-5 text-zinc-500">{note}</div>
    </div>
  )
}

function QueryPreview({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-[#0b0f14] p-3">
      <div className="mb-2 text-xs font-medium text-zinc-300">{title}</div>
      <div className="space-y-1">
        {rows.map(row => (
          <div key={row} className="truncate rounded border border-zinc-800 bg-zinc-950/70 px-2 py-1 font-mono text-[11px] text-zinc-400" title={row}>
            {row}
          </div>
        ))}
        {rows.length === 0 && <div className="text-xs text-zinc-600">等待生成</div>}
      </div>
    </div>
  )
}

function ToolCard({ icon: Icon, title, source, sourceSlug, commandId, count, command, description, note }: { icon: any; title: string; source?: any; sourceSlug?: string; commandId?: string; count: number; command: string; description: string; note?: string }) {
  return (
    <article className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-md bg-cyan-400/10 p-2 text-cyan-200">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium text-zinc-100">{title}</div>
            <div className="text-xs text-zinc-500">{source?.slug || 'maintenance'}</div>
          </div>
        </div>
        <StatusBadge status={source?.enabled ? source?.lastStatus : source ? 'disabled' : 'idle'} />
      </div>
      <p className="mt-3 min-h-[4rem] text-sm leading-5 text-zinc-400">{description}</p>
      {note ? <div className="mt-2 text-xs leading-5 text-zinc-500">{note}</div> : null}
      <div className="mt-3 rounded-md border border-zinc-800 bg-[#0b0f14] px-3 py-2 font-mono text-xs text-zinc-300">{command}</div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
        <span>{source ? `已入库 ${formatNumber(count)}` : '手动维护命令'}</span>
        {sourceSlug || source?.slug ? <CollectorRunButton sourceSlug={sourceSlug || source.slug} label="启动" compact /> : <span className="inline-flex items-center gap-1 text-zinc-400"><Play className="h-3 w-3" /> CLI</span>}
        {!sourceSlug && !source?.slug && commandId ? (
          <CollectorCommandRunButton commandId={commandId} label="启动" compact />
        ) : null}
      </div>
    </article>
  )
}

function RunCard({ run }: { run: any }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-zinc-100">{run.source?.name || run.scope}</div>
          <div className="mt-1 text-xs text-zinc-500">{formatDate(run.startedAt)}</div>
        </div>
        <StatusBadge status={run.status} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-zinc-400">
        <span>候选 {formatNumber(run.candidateCount)}</span>
        <span>发布 {formatNumber(run.publishedCount)}</span>
        <span>忽略 {formatNumber(run.ignoredCount)}</span>
      </div>
      {run.errorMessage && (
        <div className="mt-2 flex gap-2 text-xs text-red-200">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{trim(run.errorMessage, 120)}</span>
        </div>
      )}
    </div>
  )
}

function MetricBlock({ title, rows }: { title: string; rows: Array<{ label: string; value: number }> }) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-zinc-200">{title}</div>
      <div className="space-y-2">
        {rows.map(row => (
          <div key={row.label} className="flex items-center justify-between gap-4 rounded border border-zinc-800 bg-zinc-950/40 px-3 py-2">
            <span className="truncate text-sm text-zinc-300">{row.label}</span>
            <span className="text-sm font-medium text-cyan-200">{formatNumber(row.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CommandBlock({ title, command }: { title: string; command: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-100">
        <GitBranch className="h-4 w-4 text-zinc-500" />
        {title}
      </div>
      <div className="rounded border border-zinc-800 bg-[#0b0f14] px-2 py-2 font-mono text-xs leading-5 text-zinc-300">{command}</div>
    </div>
  )
}

function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return <span className="text-xs text-zinc-600">-</span>
  return (
    <div className="flex max-w-[260px] flex-wrap gap-1">
      {tags.map(tag => (
        <span key={tag} className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">{tag}</span>
      ))}
    </div>
  )
}
