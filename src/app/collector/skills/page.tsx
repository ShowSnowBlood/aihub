import Link from 'next/link'
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  ChevronsUpDown,
  Database,
  Download,
  Filter,
  Github,
  Hash,
  History,
  Search,
  ShieldCheck,
  Star,
} from 'lucide-react'
import { prisma } from '@/lib/prisma'
import CollectorPageAutoRefresh from '../CollectorPageAutoRefresh'

export const metadata = {
  title: '所有 Skill | AI Hub Collector',
  description: '查看清洗后的 GitHub 可追溯 Skill 原始库。',
}

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams?: {
    q?: string
    source?: string
    category?: string
    status?: string
    sort?: string
    direction?: string
    page?: string
    pageSize?: string
    view?: string
  }
}

type SortKey = 'id' | 'score' | 'heat' | 'quality' | 'stars' | 'downloads' | 'collected' | 'updated'
type SortDirection = 'asc' | 'desc'
type ViewMode = 'repo' | 'skill'

type ExternalSkillRow = {
  id: number
  sourceSlug: string
  externalId: string | null
  name: string
  nameZh: string | null
  description: string | null
  descriptionZh: string | null
  categoryZh: string | null
  tagsZh: string | null
  status: string
  qualityScore: number
  heatScore: number
  stars: number
  forks: number
  downloads: number
  sourceUrl: string | null
  githubUrl: string | null
  homepageUrl: string | null
  downloadUrl: string | null
  rawData: string | null
  collectedAt: Date
  updatedAt: Date
}

type RepoSkillGroup = {
  key: string
  repo: string
  repoUrl: string
  installGitUrl: string
  representativeSourceUrl: string
  representativePath: string
  maxId: number
  skillCount: number
  sourceSlugs: string[]
  statuses: string[]
  categories: string[]
  tags: string[]
  samples: Array<{ id: number; name: string; path: string; href: string }>
  topSkill: ExternalSkillRow
  heatScore: number
  qualityScore: number
  stars: number
  forks: number
  downloads: number
  collectedAt: Date
  updatedAt: Date
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

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('zh-CN')
}

function formatDate(value?: Date | string | null) {
  if (!value) return '-'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
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

function githubCloneUrl(repo?: string | null) {
  const key = normalizeGithubRepo(repo)
  return key ? `https://github.com/${key}.git` : ''
}

function githubSkillInstallUrlFromSource(value?: string | null) {
  if (!value) return ''
  try {
    const url = new URL(value)
    if (/^raw\.githubusercontent\.com$/i.test(url.hostname)) {
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
      if (parts.length < 4) return ''
      const sourcePath = parts.slice(3).join('/')
      const skillDir = sourcePath.replace(/\/skill\.md$/i, '')
      if (!skillDir || skillDir === sourcePath) return ''
      return `https://github.com/${parts[0]}/${parts[1]}/tree/${encodeURIComponent(parts[2])}/${skillDir.split('/').map(encodeURIComponent).join('/')}`
    }
    if (!/^github\.com$/i.test(url.hostname)) return ''
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    const marker = parts.findIndex(part => part === 'blob' || part === 'tree')
    if (marker < 0 || parts.length <= marker + 2) return ''
    const sourcePath = parts.slice(marker + 2).join('/')
    const skillDir = sourcePath.replace(/\/skill\.md$/i, '')
    if (!skillDir || skillDir === sourcePath) return ''
    return `https://github.com/${parts[0]}/${parts[1]}/tree/${encodeURIComponent(parts[marker + 1])}/${skillDir.split('/').map(encodeURIComponent).join('/')}`
  } catch {
    return ''
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
  const preciseSourceUrl = firstString(
    raw.skillMdUrl,
    github.skillMdUrl,
    skill.sourceUrl && skill.sourceUrl.includes('github.com') && !isGithubRepoHomeUrl(skill.sourceUrl) ? skill.sourceUrl : '',
    skill.githubUrl && skill.githubUrl.includes('github.com') && !isGithubRepoHomeUrl(skill.githubUrl) ? skill.githubUrl : '',
    raw.githubUrl && !isGithubRepoHomeUrl(raw.githubUrl) ? raw.githubUrl : '',
    raw.github_url && !isGithubRepoHomeUrl(raw.github_url) ? raw.github_url : '',
    github.url && !isGithubRepoHomeUrl(github.url) ? github.url : '',
  )
  const repo = normalizeGithubRepo(firstString(
    githubRepoFromUrl(preciseSourceUrl),
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
  const sourceRepo = normalizeGithubRepo(firstString(
    githubRepoFromUrl(preciseSourceUrl),
    raw.sourceRepo,
    github.sourceRepo,
    raw.repo,
    raw.source,
    item.source,
    githubRepoFromUrl(skill.sourceUrl),
    githubRepoFromUrl(raw.skillMdUrl),
    githubRepoFromUrl(github.skillMdUrl),
  ))
  const repoUrl = firstString(
    raw.originalGithubUrl,
    github.originalGithubUrl,
    skill.homepageUrl,
    repo ? `https://github.com/${repo}` : '',
    raw.repoUrl,
    github.repoUrl,
  )
  const installRepo = normalizeGithubRepo(firstString(
    githubRepoFromUrl(preciseSourceUrl),
    raw.installRepo,
    github.installRepo,
    repo,
    githubRepoFromUrl(skill.downloadUrl),
    githubRepoFromUrl(raw.installGitUrl),
    githubRepoFromUrl(github.installGitUrl),
  ))
  const installGitUrl = firstString(
    githubSkillInstallUrlFromSource(preciseSourceUrl),
    githubCloneUrl(githubRepoFromUrl(preciseSourceUrl)),
    skill.downloadUrl,
    raw.installGitUrl,
    github.installGitUrl,
    githubCloneUrl(installRepo),
  )
  const skillPath = firstString(
    raw.skillMdPath,
    github.skillMdPath,
    github.skillPath,
    raw.file,
    githubSkillPathFromUrl(preciseSourceUrl),
    githubSkillPathFromUrl(skill.sourceUrl),
    githubSkillPathFromUrl(skill.githubUrl),
    githubSkillPathFromUrl(raw.githubUrl),
  )
  const skillMdDescription = firstString(raw.skillMdDescription, github.skillMdDescription)
  const skillMdRawUrl = firstString(raw.skillMdRawUrl, github.skillMdRawUrl)
  const stars = Math.max(toNumber(skill.stars), toNumber(github.stars ?? raw.stars))
  const forks = Math.max(toNumber(skill.forks), toNumber(github.forks ?? raw.forks))
  const releaseDownloads = toNumber(github.releaseDownloads)
  const installs = toNumber(raw.installs ?? item.installs)
  const downloads = Math.max(toNumber(skill.downloads), releaseDownloads, installs)
  return { repo, sourceRepo, repoUrl, installRepo, installGitUrl, preciseSourceUrl, skillPath, skillMdDescription, skillMdRawUrl, stars, forks, downloads }
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

function pageHref(params: Record<string, string | number | undefined>, page: number) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '' || key === 'page') continue
    search.set(key, String(value))
  }
  search.set('page', String(page))
  return `/collector/skills?${search.toString()}`
}

function listHref(params: Record<string, string | number | undefined>, overrides: Record<string, string | number | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries({ ...params, ...overrides })) {
    if (value === undefined || value === '' || key === 'page') continue
    search.set(key, String(value))
  }
  search.set('page', String(overrides.page || 1))
  return `/collector/skills?${search.toString()}`
}

function normalizeSort(value?: string): SortKey {
  if (['id', 'score', 'heat', 'quality', 'stars', 'downloads', 'collected', 'updated'].includes(String(value))) {
    return value as SortKey
  }
  return 'updated'
}

function normalizeDirection(value?: string): SortDirection {
  return value === 'asc' ? 'asc' : 'desc'
}

function normalizeView(value?: string): ViewMode {
  return value === 'repo' ? 'repo' : 'skill'
}

function dbOrderBy(sort: SortKey, direction: SortDirection) {
  if (sort === 'id') return [{ id: direction }]
  if (sort === 'heat') return [{ heatScore: direction }, { qualityScore: direction }, { id: 'desc' as const }]
  if (sort === 'quality') return [{ qualityScore: direction }, { heatScore: direction }, { id: 'desc' as const }]
  if (sort === 'stars') return [{ stars: direction }, { heatScore: 'desc' as const }, { id: 'desc' as const }]
  if (sort === 'downloads') return [{ downloads: direction }, { stars: 'desc' as const }, { id: 'desc' as const }]
  if (sort === 'collected') return [{ collectedAt: direction }, { id: 'desc' as const }]
  if (sort === 'updated') return [{ updatedAt: direction }, { id: 'desc' as const }]
  return [{ heatScore: direction }, { qualityScore: direction }, { collectedAt: direction }, { id: 'desc' as const }]
}

function compareNumber(a: number, b: number, direction: SortDirection) {
  return direction === 'asc' ? a - b : b - a
}

function sortLabel(sort: SortKey) {
  const labels: Record<SortKey, string> = {
    id: 'ID',
    score: '综合分',
    heat: '热度分',
    quality: '质量分',
    stars: 'Star',
    downloads: '安装/下载',
    collected: '采集时间',
    updated: '更新时间',
  }
  return labels[sort]
}

function dominantValues(values: string[], limit = 4) {
  const counts = new Map<string, number>()
  for (const value of values) {
    if (!value) continue
    counts.set(value, (counts.get(value) || 0) + 1)
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value]) => value)
}

function compareDate(a: Date, b: Date, direction: SortDirection) {
  const diff = a.getTime() - b.getTime()
  return direction === 'asc' ? diff : -diff
}

function compareRepoGroups(a: RepoSkillGroup, b: RepoSkillGroup, sort: SortKey, direction: SortDirection) {
  if (sort === 'id') return compareNumber(a.maxId, b.maxId, direction) || a.repo.localeCompare(b.repo)
  if (sort === 'stars') return compareNumber(a.stars, b.stars, direction) || compareNumber(a.heatScore, b.heatScore, 'desc') || a.repo.localeCompare(b.repo)
  if (sort === 'downloads') return compareNumber(a.downloads, b.downloads, direction) || compareNumber(a.stars, b.stars, 'desc') || a.repo.localeCompare(b.repo)
  if (sort === 'collected') return compareDate(a.collectedAt, b.collectedAt, direction) || a.repo.localeCompare(b.repo)
  if (sort === 'updated') return compareDate(a.updatedAt, b.updatedAt, direction) || a.repo.localeCompare(b.repo)
  if (sort === 'quality') return compareNumber(a.qualityScore, b.qualityScore, direction) || compareNumber(a.skillCount, b.skillCount, 'desc') || a.repo.localeCompare(b.repo)
  if (sort === 'heat') return compareNumber(a.heatScore, b.heatScore, direction) || compareNumber(a.skillCount, b.skillCount, 'desc') || a.repo.localeCompare(b.repo)
  return compareNumber(a.heatScore, b.heatScore, direction) || compareNumber(a.skillCount, b.skillCount, 'desc') || compareNumber(a.stars, b.stars, 'desc') || a.repo.localeCompare(b.repo)
}

function repoGroupsFromSkills(skills: ExternalSkillRow[]) {
  const groups = new Map<string, RepoSkillGroup & {
    sourceSlugValues: string[]
    statusValues: string[]
    categoryValues: string[]
    tagValues: string[]
    seenSampleIds: Set<number>
  }>()

  for (const skill of skills) {
    const github = githubInfoFromSkill(skill)
    const repo = github.repo || `unknown/${skill.id}`
    const key = github.repo || `skill:${skill.id}`
    const score = Math.max(toNumber(skill.heatScore), toNumber(skill.qualityScore))
    const name = skill.nameZh || skill.name
    const existing = groups.get(key)
    const sample = {
      id: skill.id,
      name,
      path: github.skillPath || trim(skill.externalId || skill.sourceUrl || '', 72),
      href: github.preciseSourceUrl || github.repoUrl || skill.sourceUrl || skill.githubUrl || '',
    }

    if (!existing) {
      groups.set(key, {
        key,
        repo,
        repoUrl: github.repoUrl || (github.repo ? `https://github.com/${github.repo}` : firstString(skill.githubUrl, skill.sourceUrl)),
        installGitUrl: github.installGitUrl,
        representativeSourceUrl: github.preciseSourceUrl || skill.sourceUrl || skill.githubUrl || '',
        representativePath: github.skillPath || '',
        maxId: skill.id,
        skillCount: 1,
        sourceSlugs: [],
        statuses: [],
        categories: [],
        tags: [],
        samples: [sample],
        seenSampleIds: new Set([skill.id]),
        topSkill: skill,
        heatScore: toNumber(skill.heatScore),
        qualityScore: toNumber(skill.qualityScore),
        stars: github.stars,
        forks: github.forks,
        downloads: github.downloads,
        collectedAt: skill.collectedAt,
        updatedAt: skill.updatedAt,
        sourceSlugValues: [skill.sourceSlug],
        statusValues: [skill.status],
        categoryValues: [skill.categoryZh || '未分类'],
        tagValues: splitList(skill.tagsZh),
      })
      continue
    }

    existing.skillCount += 1
    existing.maxId = Math.max(existing.maxId, skill.id)
    existing.heatScore = Math.max(existing.heatScore, toNumber(skill.heatScore))
    existing.qualityScore = Math.max(existing.qualityScore, toNumber(skill.qualityScore))
    existing.stars = Math.max(existing.stars, github.stars)
    existing.forks = Math.max(existing.forks, github.forks)
    existing.downloads += github.downloads
    existing.collectedAt = skill.collectedAt > existing.collectedAt ? skill.collectedAt : existing.collectedAt
    existing.updatedAt = skill.updatedAt > existing.updatedAt ? skill.updatedAt : existing.updatedAt
    existing.sourceSlugValues.push(skill.sourceSlug)
    existing.statusValues.push(skill.status)
    existing.categoryValues.push(skill.categoryZh || '未分类')
    existing.tagValues.push(...splitList(skill.tagsZh))
    if (!existing.installGitUrl) existing.installGitUrl = github.installGitUrl

    if (score > Math.max(toNumber(existing.topSkill.heatScore), toNumber(existing.topSkill.qualityScore))) {
      existing.topSkill = skill
      existing.representativeSourceUrl = github.preciseSourceUrl || skill.sourceUrl || skill.githubUrl || existing.representativeSourceUrl
      existing.representativePath = github.skillPath || existing.representativePath
      existing.installGitUrl = github.installGitUrl || existing.installGitUrl
    }
    if (existing.samples.length < 5 && !existing.seenSampleIds.has(skill.id)) {
      existing.samples.push(sample)
      existing.seenSampleIds.add(skill.id)
    }
  }

  return Array.from(groups.values()).map(group => ({
    ...group,
    sourceSlugs: dominantValues(group.sourceSlugValues, 3),
    statuses: dominantValues(group.statusValues, 3),
    categories: dominantValues(group.categoryValues, 3),
    tags: dominantValues(group.tagValues, 5),
  }))
}

export default async function CollectorSkillsPage({ searchParams = {} }: PageProps) {
  const q = String(searchParams.q || '').trim()
  const source = String(searchParams.source || '').trim()
  const category = String(searchParams.category || '').trim()
  const status = String(searchParams.status || 'all').trim()
  const sort = normalizeSort(searchParams.sort)
  const direction = normalizeDirection(searchParams.direction)
  const view = normalizeView(searchParams.view)
  const page = Math.max(1, Number(searchParams.page || 1) || 1)
  const pageSize = Math.min(100, Math.max(20, Number(searchParams.pageSize || 50) || 50))
  const since5m = new Date(Date.now() - 5 * 60 * 1000)
  const since30m = new Date(Date.now() - 30 * 60 * 1000)

  const where: any = {}
  if (source) where.sourceSlug = source
  if (category) where.categoryZh = category
  if (status && status !== 'all') where.status = status
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { nameZh: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { descriptionZh: { contains: q, mode: 'insensitive' } },
      { categoryZh: { contains: q, mode: 'insensitive' } },
      { tagsZh: { contains: q, mode: 'insensitive' } },
      { sourceSlug: { contains: q, mode: 'insensitive' } },
      { sourceUrl: { contains: q, mode: 'insensitive' } },
      { githubUrl: { contains: q, mode: 'insensitive' } },
      { rawData: { contains: q, mode: 'insensitive' } },
    ]
  }

  const skillSelect = {
    id: true,
    sourceSlug: true,
    externalId: true,
    name: true,
    nameZh: true,
    description: true,
    descriptionZh: true,
    categoryZh: true,
    tagsZh: true,
    status: true,
    qualityScore: true,
    heatScore: true,
    stars: true,
    forks: true,
    downloads: true,
    sourceUrl: true,
    githubUrl: true,
    homepageUrl: true,
    downloadUrl: true,
    rawData: true,
    collectedAt: true,
    updatedAt: true,
  } as const

  const totalSkillRows = await prisma.externalSkill.count({ where })
  const fetchedSkills = view === 'skill'
    ? await prisma.externalSkill.findMany({
      where,
      orderBy: dbOrderBy(sort, direction),
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: skillSelect,
    })
    : []
  const repoSourceSkills = view === 'repo'
    ? await prisma.externalSkill.findMany({
      where,
      orderBy: dbOrderBy(sort, direction),
      take: 50000,
      select: skillSelect,
    })
    : []
  const sourceGroups = await prisma.externalSkill.groupBy({
    by: ['sourceSlug'],
    _count: { _all: true },
    orderBy: { _count: { sourceSlug: 'desc' } },
    take: 80,
  })
  const categoryGroups = await prisma.externalSkill.groupBy({
    by: ['categoryZh'],
    _count: { _all: true },
    orderBy: { _count: { categoryZh: 'desc' } },
    take: 80,
  })
  const statusGroups = await prisma.externalSkill.groupBy({
    by: ['status'],
    _count: { _all: true },
    orderBy: { _count: { status: 'desc' } },
  })
  const statusCountMap = new Map(statusGroups.map(item => [item.status, Number(item._count._all || 0)]))
  const collectedSkillRows = statusCountMap.get('collected') || 0
  const otherSkillRows = Math.max(0, totalSkillRows - collectedSkillRows)
  const [recentCreated5m, recentUpdated5m, recentCreated30m, recentUpdated30m, latestSkillAggregate] = await Promise.all([
    prisma.externalSkill.count({ where: { ...where, collectedAt: { gte: since5m } } }),
    prisma.externalSkill.count({ where: { ...where, updatedAt: { gte: since5m } } }),
    prisma.externalSkill.count({ where: { ...where, collectedAt: { gte: since30m } } }),
    prisma.externalSkill.count({ where: { ...where, updatedAt: { gte: since30m } } }),
    prisma.externalSkill.aggregate({ where, _max: { id: true } }),
  ])
  const latestSkillId = Number(latestSkillAggregate._max.id || 0)
  const versionRows = await prisma.skillLibraryVersion.findMany({
    orderBy: { id: 'desc' },
    take: 6,
  })

  const repoGroups = view === 'repo'
    ? repoGroupsFromSkills(repoSourceSkills as ExternalSkillRow[]).sort((a, b) => compareRepoGroups(a, b, sort, direction))
    : []
  const total = view === 'repo' ? repoGroups.length : totalSkillRows
  const sortedSkills = fetchedSkills as ExternalSkillRow[]
  const pagedRepoGroups = repoGroups.slice((page - 1) * pageSize, page * pageSize)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const params = { q, source, category, status, sort, direction, pageSize, view }
  const firstIndex = total === 0 ? 0 : (page - 1) * pageSize + 1
  const lastIndex = Math.min(total, page * pageSize)

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
                <Database className="h-4 w-4" />
                Skill Source Registry
                <span className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">GitHub 可追溯</span>
                <span className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">external_skills</span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">所有 Skill 列表</h1>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-zinc-400">
                这里只查看清洗后的 Skill 原始库，默认展示全部状态。每条记录都需要能解析到 GitHub 仓库地址；没有 GitHub 源仓库的数据会被清理命令移除。
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[620px]">
              <Metric
                label={view === 'repo' ? '仓库聚合数' : '全量 Skill 明细'}
                value={formatNumber(total)}
                note={view === 'repo' ? '同仓库自动合并' : '全量状态，增长看这里'}
              />
              <Metric label="collected" value={formatNumber(collectedSkillRows)} note="主入库状态" />
              <Metric label="其他状态" value={formatNumber(otherSkillRows)} note="aggregated / low_quality / out_of_scope" />
              <Metric label="5 分钟新增" value={`+${formatNumber(recentCreated5m)}`} note={`更新 ${formatNumber(recentUpdated5m)}`} />
              <Metric label="30 分钟新增" value={`+${formatNumber(recentCreated30m)}`} note={`更新 ${formatNumber(recentUpdated30m)}`} />
              <Metric label="最新 Skill ID" value={`#${formatNumber(latestSkillId)}`} note="数据库最大 ID" />
            </div>
          </div>
        </div>
      </header>

      <section className="border-b border-zinc-800 bg-[#0b0f14] px-5 py-4 lg:px-8">
        <div className="mb-4 rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                <History className="h-4 w-4 text-cyan-300" />
                Skill 知识库版本更新历史
              </div>
              <div className="mt-1 text-xs leading-5 text-zinc-500">
                每次上传新版部署包都会生成一次 0.0.x 迭代，并记录当时 Skill、提示词和 AI 资讯数据快照。
              </div>
            </div>
            <Link className="inline-flex h-8 items-center gap-1 rounded-md border border-cyan-500/50 bg-cyan-400/10 px-2.5 text-xs font-medium text-cyan-100 hover:border-cyan-300" href="/collector?page=deploy">
              上传部署包
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-3">
            {versionRows.map(version => (
              <div key={version.id} className="rounded-md border border-zinc-800 bg-[#0b0f14] px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-sm text-cyan-200">{version.version}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${version.status === 'success' ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' : version.status === 'failed' ? 'border-red-400/40 bg-red-400/10 text-red-200' : version.status === 'deploying' ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200' : 'border-amber-400/40 bg-amber-400/10 text-amber-200'}`}>
                    {version.status === 'success' ? '已部署' : version.status === 'failed' ? '失败' : version.status === 'deploying' ? '部署中' : '排队'}
                  </span>
                </div>
                <div className="mt-2 truncate text-xs text-zinc-400">{version.title || version.packageName || '-'}</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-zinc-500">
                  <span>external {formatNumber(version.externalSkillCount)}</span>
                  <span>published {formatNumber(version.skillCount)}</span>
                  <span>prompt {formatNumber(version.promptCount)}</span>
                  <span>news {formatNumber(version.newsCount)}</span>
                </div>
                <div className="mt-2 text-[11px] text-zinc-600">{formatDate(version.createdAt)}</div>
              </div>
            ))}
            {versionRows.length === 0 && (
              <div className="rounded-md border border-zinc-800 bg-[#0b0f14] px-3 py-6 text-sm text-zinc-500 lg:col-span-3">
                还没有版本记录，去“部署包”页面上传第一个版本后会生成 0.0.1。
              </div>
            )}
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-xs text-zinc-400">
          <div className="flex flex-wrap items-center gap-2">
            <CollectorPageAutoRefresh intervalMs={5000} />
            <span>
              当前为 {view === 'repo' ? '仓库聚合模式' : 'Skill 明细模式'}：{view === 'repo' ? '页面行数只在发现新的 GitHub 仓库时增加，采集到同仓库的新 Skill 会合并进这一行。' : '每一条 external_skills 记录都会单独显示，默认是全量状态。'}
            </span>
          </div>
          {view === 'repo' ? (
            <Link className="inline-flex h-8 items-center gap-1 rounded-md border border-cyan-500/50 bg-cyan-400/10 px-2.5 text-xs font-medium text-cyan-100 hover:border-cyan-300" href={listHref(params, { view: 'skill', page: 1 })}>
              查看全部 Skill 明细
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          ) : (
            <Link className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-700 px-2.5 text-xs text-zinc-300 hover:border-cyan-400 hover:text-cyan-100" href={listHref(params, { view: 'repo', page: 1 })}>
              切回仓库聚合
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          )}
        </div>
        <form className="grid gap-3 xl:grid-cols-[1.4fr_0.8fr_0.9fr_0.9fr_0.7fr_0.75fr_0.65fr_0.55fr_auto]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              name="q"
              defaultValue={q}
              placeholder="搜索名称、描述、标签、仓库、源地址"
              className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 pl-9 pr-3 text-sm text-zinc-100 outline-none focus:border-cyan-400"
            />
          </label>
          <Select name="source" value={source} placeholder="全部来源" rows={sourceGroups.map(item => ({
            label: `${item.sourceSlug} (${item._count._all})`,
            value: item.sourceSlug,
          }))} />
          <Select name="view" value={view} placeholder="展示模式" rows={[
            { label: 'Skill 明细', value: 'skill' },
            { label: '仓库聚合', value: 'repo' },
          ]} />
          <Select name="category" value={category} placeholder="全部分类" rows={categoryGroups.map(item => ({
            label: `${item.categoryZh || '未分类'} (${item._count._all})`,
            value: item.categoryZh || '',
          })).filter(item => item.value)} />
          <Select name="status" value={status} placeholder="全部状态" rows={[
            { label: '全部状态', value: 'all' },
            ...statusGroups.map(item => ({ label: `${item.status} (${item._count._all})`, value: item.status })),
          ]} />
          <Select name="sort" value={sort} placeholder="排序字段" rows={[
            { label: '综合分', value: 'score' },
            { label: 'ID', value: 'id' },
            { label: '热度分', value: 'heat' },
            { label: '质量分', value: 'quality' },
            { label: 'Star', value: 'stars' },
            { label: '安装/下载', value: 'downloads' },
            { label: '采集时间', value: 'collected' },
            { label: '更新时间', value: 'updated' },
          ]} />
          <Select name="direction" value={direction} placeholder="方向" rows={[
            { label: '降序', value: 'desc' },
            { label: '升序', value: 'asc' },
          ]} />
          <Select name="pageSize" value={String(pageSize)} placeholder="每页" rows={[
            { label: '20 条', value: '20' },
            { label: '50 条', value: '50' },
            { label: '100 条', value: '100' },
          ]} />
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-cyan-500/50 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-100 hover:border-cyan-300 hover:bg-cyan-400/15">
            <Filter className="h-4 w-4" />
            筛选
          </button>
        </form>
      </section>

      <section className="px-5 py-5 lg:px-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-400">
          <div>
            显示 {formatNumber(firstIndex)}-{formatNumber(lastIndex)} / {formatNumber(total)} · {view === 'repo' ? '仓库已自动聚合' : 'Skill 明细'} · 当前按 {sortLabel(sort)} {direction === 'asc' ? '升序' : '降序'} 排序
          </div>
          <div className="flex items-center gap-2">
            <PageLink disabled={page <= 1} href={pageHref(params, page - 1)} label="上一页" />
            <span className="rounded border border-zinc-800 px-3 py-1 text-xs text-zinc-300">
              {formatNumber(page)} / {formatNumber(totalPages)}
            </span>
            <PageLink disabled={page >= totalPages} href={pageHref(params, page + 1)} label="下一页" />
          </div>
        </div>

        {view === 'repo' && (
        <div className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950/30">
          <table className="w-full min-w-[1380px] text-left text-sm">
            <thead className="bg-zinc-950 text-xs text-zinc-500">
              <tr className="border-b border-zinc-800">
                <th className="px-3 py-3">仓库</th>
                <th className="px-3 py-3">
                  <SortHeader label="Score" field="score" icon={ChevronsUpDown} sort={sort} direction={direction} params={params} />
                </th>
                <th className="px-3 py-3">整合 Skill</th>
                <th className="px-3 py-3">来源</th>
                <th className="px-3 py-3">
                  <SortHeader label="Stars / Forks" field="stars" icon={Star} sort={sort} direction={direction} params={params} />
                </th>
                <th className="px-3 py-3">
                  <SortHeader label="安装/下载" field="downloads" icon={Download} sort={sort} direction={direction} params={params} />
                </th>
                <th className="px-3 py-3">分类</th>
                <th className="px-3 py-3">标签</th>
                <th className="px-3 py-3">状态</th>
                <th className="px-3 py-3">
                  <SortHeader label="更新时间" field="updated" icon={ChevronsUpDown} sort={sort} direction={direction} params={params} />
                </th>
              </tr>
            </thead>
            <tbody>
              {pagedRepoGroups.map(group => (
                <tr key={group.key} className="border-b border-zinc-900 align-top">
                  <td className="px-3 py-4">
                    {group.repoUrl ? (
                      <a className="inline-flex items-center gap-1 font-mono text-sm font-medium text-cyan-300 hover:text-cyan-100" href={group.repoUrl} target="_blank" rel="noreferrer">
                        <Github className="h-3.5 w-3.5" />
                        {group.repo}
                        <ArrowUpRight className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="font-mono text-sm text-zinc-300">{group.repo}</span>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Link
                        className="inline-flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-100 hover:border-cyan-300"
                        href={listHref(params, { view: 'skill', q: group.repo, page: 1 })}
                      >
                        查看 {formatNumber(group.skillCount)} 条明细
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                      {group.representativeSourceUrl && (
                        <a className="inline-flex items-center gap-1 rounded border border-zinc-800 px-2 py-1 text-[11px] text-zinc-300 hover:border-cyan-500/50 hover:text-cyan-100" href={group.representativeSourceUrl} target="_blank" rel="noreferrer">
                          代表文件
                          <ArrowUpRight className="h-3 w-3" />
                        </a>
                      )}
                      {group.installGitUrl && (
                        <a className="inline-flex items-center gap-1 rounded border border-zinc-800 px-2 py-1 font-mono text-[11px] text-emerald-200 hover:border-emerald-400/60 hover:text-emerald-100" href={group.installGitUrl.replace(/\.git$/i, '')} target="_blank" rel="noreferrer">
                          安装 Git
                          <ArrowUpRight className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <div className="rounded bg-cyan-400/10 px-2 py-1 text-center font-mono text-xs text-cyan-200">
                      {formatNumber(group.heatScore || group.qualityScore)}
                    </div>
                    <div className="mt-1 text-center font-mono text-[11px] text-zinc-600">max</div>
                  </td>
                  <td className="px-3 py-4">
                    <div className="font-medium text-zinc-100">{formatNumber(group.skillCount)} 个 Skill 已整合</div>
                    <div className="mt-1 max-w-[420px] text-xs leading-5 text-zinc-500">{trim(group.topSkill.descriptionZh || group.topSkill.description || group.topSkill.name, 150)}</div>
                    <div className="mt-2 flex max-w-[520px] flex-wrap gap-1.5">
                      {group.samples.map(sample => (
                        sample.href ? (
                          <a key={sample.id} className="max-w-[220px] truncate rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-300 hover:border-cyan-500/50 hover:text-cyan-100" href={sample.href} target="_blank" rel="noreferrer">
                            {sample.name}
                          </a>
                        ) : (
                          <span key={sample.id} className="max-w-[220px] truncate rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-400">{sample.name}</span>
                        )
                      ))}
                      {group.skillCount > group.samples.length && (
                        <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[11px] text-zinc-500">+{formatNumber(group.skillCount - group.samples.length)}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <div className="space-y-1">
                      {group.sourceSlugs.map(sourceSlug => (
                        <div key={sourceSlug} className="font-mono text-xs text-zinc-300">{sourceSlug}</div>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <div className="font-mono text-xs text-zinc-200">{formatNumber(group.stars)} ★</div>
                    <div className="mt-1 font-mono text-[11px] text-zinc-500">{formatNumber(group.forks)} forks</div>
                  </td>
                  <td className="px-3 py-4">
                    <div className="font-mono text-xs text-zinc-200">{formatNumber(group.downloads)}</div>
                    <div className="mt-1 text-[11px] text-zinc-500">skills.sh installs / release</div>
                  </td>
                  <td className="px-3 py-4 text-zinc-300">
                    <div className="space-y-1">
                      {group.categories.map(item => <div key={item}>{item}</div>)}
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex max-w-[240px] flex-wrap gap-1">
                      {group.tags.map(tag => (
                        <span key={tag} className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-400">{tag}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex flex-wrap gap-1">
                      {group.statuses.map(statusItem => (
                        <span key={statusItem} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300">{statusItem}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-4 text-xs text-zinc-500">
                    <div>{formatDate(group.collectedAt)}</div>
                    <div className="mt-1 text-zinc-600">更新 {formatDate(group.updatedAt)}</div>
                  </td>
                </tr>
              ))}
              {pagedRepoGroups.length === 0 && (
                <tr>
                  <td className="px-3 py-10 text-center text-sm text-zinc-500" colSpan={10}>
                    没有匹配的仓库。可以清空筛选条件再看全量列表。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}

        {view === 'skill' && (
        <div className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950/30">
          <table className="w-full min-w-[1640px] text-left text-sm">
            <thead className="bg-zinc-950 text-xs text-zinc-500">
              <tr className="border-b border-zinc-800">
                <th className="px-3 py-3">
                  <SortHeader label="ID" field="id" icon={Hash} sort={sort} direction={direction} params={params} />
                </th>
                <th className="px-3 py-3">
                  <SortHeader label="Score" field="score" icon={ChevronsUpDown} sort={sort} direction={direction} params={params} />
                </th>
                <th className="px-3 py-3">Skill</th>
                <th className="px-3 py-3">来源</th>
                <th className="px-3 py-3">GitHub 仓库</th>
                <th className="px-3 py-3">源文件位置</th>
                <th className="px-3 py-3">
                  <SortHeader label="Stars / Forks" field="stars" icon={Star} sort={sort} direction={direction} params={params} />
                </th>
                <th className="px-3 py-3">
                  <SortHeader label="安装/下载" field="downloads" icon={Download} sort={sort} direction={direction} params={params} />
                </th>
                <th className="px-3 py-3">分类依据</th>
                <th className="px-3 py-3">标签</th>
                <th className="px-3 py-3">状态</th>
                <th className="px-3 py-3">
                  <SortHeader label="采集时间" field="collected" icon={ChevronsUpDown} sort={sort} direction={direction} params={params} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedSkills.map(skill => {
                const github = githubInfoFromSkill(skill)
                const classifier = classifierInfoFromSkill(skill)
                return (
                  <tr key={skill.id} className="border-b border-zinc-900 align-top">
                    <td className="px-3 py-3 font-mono text-xs text-zinc-500">#{skill.id}</td>
                    <td className="px-3 py-3">
                      <div className="rounded bg-cyan-400/10 px-2 py-1 text-center font-mono text-xs text-cyan-200">
                        {formatNumber(skill.heatScore || skill.qualityScore)}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="max-w-[340px] font-medium text-zinc-100">{skill.nameZh || skill.name}</div>
                      <div className="mt-1 max-w-[420px] text-xs leading-5 text-zinc-500">{trim(skill.descriptionZh || skill.description, 150)}</div>
                      {skill.externalId && <div className="mt-1 font-mono text-[11px] text-zinc-600">{trim(skill.externalId, 80)}</div>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-zinc-300">{skill.sourceSlug}</div>
                      <div className="mt-1 text-xs text-zinc-600">{skill.status}</div>
                    </td>
                    <td className="px-3 py-3">
                      {github.repo ? (
                        <div className="space-y-1">
                          <a className="inline-flex items-center gap-1 font-mono text-xs text-cyan-300 hover:text-cyan-100" href={github.repoUrl || `https://github.com/${github.repo}`} target="_blank" rel="noreferrer">
                            <Github className="h-3 w-3" />
                            {github.repo}
                            <ArrowUpRight className="h-3 w-3" />
                          </a>
                          {github.installGitUrl && (
                            <a className="block max-w-[260px] truncate font-mono text-[11px] text-emerald-300 hover:text-emerald-100" href={github.repoUrl || `https://github.com/${github.repo}`} target="_blank" rel="noreferrer">
                              {github.installGitUrl}
                            </a>
                          )}
                          {github.sourceRepo && github.sourceRepo.toLowerCase() !== github.repo.toLowerCase() && (
                            <div className="max-w-[260px] truncate font-mono text-[11px] text-zinc-600">source: {github.sourceRepo}</div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-red-300">
                          <ShieldCheck className="h-3 w-3" />
                          缺少 GitHub 源
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="space-y-1">
                        {github.preciseSourceUrl ? (
                          <a className="inline-flex max-w-[260px] items-center gap-1 text-xs text-cyan-300 hover:text-cyan-100" href={github.preciseSourceUrl} target="_blank" rel="noreferrer">
                            <span className="truncate">{github.skillPath || trim(github.preciseSourceUrl, 48)}</span>
                            <ArrowUpRight className="h-3 w-3 shrink-0" />
                          </a>
                        ) : (
                          <span className="text-xs text-zinc-600">仓库级来源</span>
                        )}
                        {github.skillMdDescription && (
                          <div className="max-w-[320px] text-[11px] leading-4 text-zinc-500">{trim(github.skillMdDescription, 120)}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-mono text-xs text-zinc-200">{formatNumber(github.stars)} ★</div>
                      <div className="mt-1 font-mono text-[11px] text-zinc-500">{formatNumber(github.forks)} forks</div>
                      {github.stars === 0 && <div className="mt-1 text-[11px] text-amber-300">待 GitHub 同步</div>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-mono text-xs text-zinc-200">{formatNumber(github.downloads)}</div>
                      <div className="mt-1 text-[11px] text-zinc-500">skills.sh installs / release</div>
                    </td>
                    <td className="px-3 py-3 text-zinc-300">
                      <div>{classifier.categoryZh}</div>
                      <div className="mt-1 font-mono text-[11px] text-cyan-300">confidence {formatNumber(classifier.confidence)}</div>
                      <div className="mt-1 max-w-[240px] text-[11px] leading-4 text-zinc-500">{classifier.matchedKeywords.slice(0, 5).join(' / ') || '待运行 reclassify 回填解释'}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex max-w-[240px] flex-wrap gap-1">
                        {classifier.tagsZh.slice(0, 4).map((tag: string) => (
                          <span key={tag} className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-400">{tag}</span>
                        ))}
                      </div>
                      {classifier.capabilityHints.length > 0 ? (
                        <div className="mt-1 text-[11px] text-emerald-300">能力池反哺</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300">{skill.status}</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-500">
                      <div>{formatDate(skill.collectedAt)}</div>
                      <div className="mt-1 text-zinc-600">更新 {formatDate(skill.updatedAt)}</div>
                    </td>
                  </tr>
                )
              })}
              {sortedSkills.length === 0 && (
                <tr>
                  <td className="px-3 py-10 text-center text-sm text-zinc-500" colSpan={12}>
                    没有匹配的 Skill。可以清空筛选条件再看全量列表。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}
      </section>
    </main>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-4 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
      {note ? <div className="mt-1 text-[11px] text-zinc-600">{note}</div> : null}
    </div>
  )
}

function Select({ name, value, placeholder, rows }: { name: string; value: string; placeholder: string; rows: Array<{ label: string; value: string }> }) {
  return (
    <select
      name={name}
      defaultValue={value}
      className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-cyan-400"
    >
      <option value="">{placeholder}</option>
      {rows.map(row => (
        <option key={`${name}-${row.value}`} value={row.value}>
          {row.label}
        </option>
      ))}
    </select>
  )
}

function SortHeader({
  label,
  field,
  icon: Icon,
  sort,
  direction,
  params,
}: {
  label: string
  field: SortKey
  icon: any
  sort: SortKey
  direction: SortDirection
  params: Record<string, string | number | undefined>
}) {
  const active = sort === field
  const nextDirection: SortDirection = active && direction === 'desc' ? 'asc' : 'desc'
  const DirectionIcon = active ? (direction === 'desc' ? ArrowDown : ArrowUp) : Icon
  return (
    <Link
      href={listHref(params, { sort: field, direction: nextDirection, page: 1 })}
      className={`inline-flex items-center gap-1.5 rounded px-2 py-1 hover:bg-zinc-900 hover:text-cyan-200 ${active ? 'text-cyan-200' : 'text-zinc-500'}`}
    >
      <DirectionIcon className="h-3.5 w-3.5" />
      {label}
    </Link>
  )
}

function PageLink({ href, label, disabled }: { href: string; label: string; disabled?: boolean }) {
  if (disabled) {
    return <span className="rounded border border-zinc-800 px-3 py-1 text-xs text-zinc-700">{label}</span>
  }
  return (
    <Link className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-cyan-400 hover:text-cyan-100" href={href}>
      {label}
    </Link>
  )
}

