'use client'

import { useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Database,
  FileText,
  Newspaper,
  Table2,
} from 'lucide-react'

export type CollectorCoreTablesData = {
  counts: {
    skills: number
    prompts: number
    news: number
  }
  skills: Array<{
    id: number
    sourceSlug: string
    name: string
    description?: string | null
    categoryZh?: string | null
    tagsZh?: string | null
    qualityScore?: number | null
    heatScore?: number | null
    stars?: number | null
    forks?: number | null
    downloads?: number | null
    sourceUrl?: string | null
    githubUrl?: string | null
    homepageUrl?: string | null
    downloadUrl?: string | null
    status?: string | null
    rawData?: string | null
    collectedAt?: string | Date | null
  }>
  prompts: Array<{
    id: number
    title: string
    sourceName?: string | null
    author?: string | null
    category?: string | null
    score?: number | null
    summaryZh?: string | null
    highlights?: string | null
    tags?: string | null
    sourceUrl?: string | null
    createdAt?: string | Date | null
    rawData?: string | null
  }>
  news: Array<{
    id: number
    title: string
    sourceName?: string | null
    category?: string | null
    score?: number | null
    summaryZh?: string | null
    highlights?: string | null
    tags?: string | null
    sourceUrl?: string | null
    publishedAt?: string | Date | null
    createdAt?: string | Date | null
    cluster?: {
      title?: string | null
      heatScore?: number | null
    } | null
  }>
}

type TableKey = 'skills' | 'prompts' | 'news'
type SortDirection = 'asc' | 'desc'

type SkillSortField = 'id' | 'score' | 'stars' | 'downloads'
type PromptSortField = 'id' | 'score' | 'createdAt'
type NewsSortField = 'id' | 'score' | 'publishedAt' | 'heatScore'

type SortState<T extends string> = {
  field: T
  direction: SortDirection
}

type SkillViewRow = CollectorCoreTablesData['skills'][number] & {
  repo: string
  repoUrl: string
  installGitUrl: string
  sourceLink: string
  skillPath: string
  parsedCategory: string
  parsedTags: string[]
  confidence: number
  matchedKeywords: string[]
}

function trim(value?: string | null, size = 100) {
  const text = String(value || '').trim()
  return text.length > size ? `${text.slice(0, size)}…` : text || '-'
}

function splitList(value?: string | null) {
  return String(value || '')
    .split(/[,\n;|]/)
    .map(item => item.trim())
    .filter(Boolean)
}

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
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
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatNumber(value: number | null | undefined) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n.toLocaleString('zh-CN') : '0'
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
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

function githubInfoFromSkill(skill: CollectorCoreTablesData['skills'][number]) {
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
  const sourceLink = firstString(
    raw.skillMdUrl,
    github.skillMdUrl,
    skill.sourceUrl && skill.sourceUrl.includes('github.com') && !isGithubRepoHomeUrl(skill.sourceUrl) ? skill.sourceUrl : '',
    skill.githubUrl && skill.githubUrl.includes('github.com') && !isGithubRepoHomeUrl(skill.githubUrl) ? skill.githubUrl : '',
    raw.githubUrl && !isGithubRepoHomeUrl(raw.githubUrl) ? raw.githubUrl : '',
  )
  const skillPath = firstString(raw.skillMdPath, github.skillMdPath, github.skillPath, raw.file, githubSkillPathFromUrl(sourceLink))
  return { repo, repoUrl, installGitUrl, sourceLink, skillPath }
}

function classifierInfoFromSkill(skill: CollectorCoreTablesData['skills'][number]) {
  const raw = parseJson<Record<string, any>>(skill.rawData, {})
  const classifier = raw.skillClassifier && typeof raw.skillClassifier === 'object' ? raw.skillClassifier : {}
  return {
    categoryZh: firstString(classifier.categoryZh, skill.categoryZh, '未分类'),
    tagsZh: Array.isArray(classifier.tagsZh) ? classifier.tagsZh.map(String) : splitList(skill.tagsZh),
    confidence: toNumber(classifier.confidence),
    matchedKeywords: Array.isArray(classifier.matchedKeywords) ? classifier.matchedKeywords.map(String) : [],
  }
}

function compareNumber(a: number, b: number, direction: SortDirection) {
  const diff = a - b
  return direction === 'asc' ? diff : -diff
}

function compareString(a: string, b: string, direction: SortDirection) {
  const diff = a.localeCompare(b, 'zh-Hans-CN')
  return direction === 'asc' ? diff : -diff
}

function compareDate(a: Date | string | null | undefined, b: Date | string | null | undefined, direction: SortDirection) {
  const aValue = a ? new Date(a).getTime() : 0
  const bValue = b ? new Date(b).getTime() : 0
  const diff = aValue - bValue
  return direction === 'asc' ? diff : -diff
}

function nextSortState<T extends string>(current: SortState<T>, field: T) {
  if (current.field === field) {
    return { field, direction: current.direction === 'asc' ? 'desc' : 'asc' as SortDirection }
  }
  return { field, direction: field === 'id' ? 'asc' : 'desc' as SortDirection }
}

function SortChip({
  label,
  active,
  direction,
  onClick,
}: {
  label: string
  active: boolean
  direction: SortDirection
  onClick: () => void
}) {
  const Icon = active ? (direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
        active
          ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100'
          : 'border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

function TabButton({
  active,
  icon: Icon,
  label,
  count,
  onClick,
}: {
  active: boolean
  icon: any
  label: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
        active
          ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-100'
          : 'border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100'
      }`}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      <span className={`rounded px-1.5 py-0.5 text-[11px] ${active ? 'bg-cyan-400/15 text-cyan-100' : 'bg-zinc-900 text-zinc-500'}`}>
        {formatNumber(count)}
      </span>
    </button>
  )
}

function LinkButton({ href, label }: { href?: string | null; label: string }) {
  if (!href) return <span className="text-zinc-600">-</span>
  return (
    <a className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-100" href={href} target="_blank" rel="noreferrer">
      {label}
      <ArrowUpRight className="h-3 w-3" />
    </a>
  )
}

export default function CollectorCoreTables({ initialData }: { initialData: CollectorCoreTablesData }) {
  const [activeTable, setActiveTable] = useState<TableKey>('skills')
  const [skillSort, setSkillSort] = useState<SortState<SkillSortField>>({ field: 'score', direction: 'desc' })
  const [promptSort, setPromptSort] = useState<SortState<PromptSortField>>({ field: 'score', direction: 'desc' })
  const [newsSort, setNewsSort] = useState<SortState<NewsSortField>>({ field: 'score', direction: 'desc' })

  const skillRows = useMemo<SkillViewRow[]>(() => initialData.skills.map(skill => {
    const github = githubInfoFromSkill(skill)
    const classifier = classifierInfoFromSkill(skill)
    return {
      ...skill,
      repo: github.repo,
      repoUrl: github.repoUrl,
      installGitUrl: github.installGitUrl,
      sourceLink: github.sourceLink,
      skillPath: github.skillPath,
      parsedCategory: classifier.categoryZh,
      parsedTags: classifier.tagsZh,
      confidence: classifier.confidence,
      matchedKeywords: classifier.matchedKeywords,
    }
  }), [initialData.skills])

  const sortedSkills = useMemo(() => {
    const rows = [...skillRows]
    rows.sort((a, b) => {
      switch (skillSort.field) {
        case 'id':
          return compareNumber(a.id, b.id, skillSort.direction)
        case 'score':
          return compareNumber(toNumber(a.heatScore), toNumber(b.heatScore), skillSort.direction)
        case 'stars':
          return compareNumber(toNumber(a.stars), toNumber(b.stars), skillSort.direction)
        case 'downloads':
          return compareNumber(toNumber(a.downloads), toNumber(b.downloads), skillSort.direction)
        default:
          return 0
      }
    })
    return rows
  }, [skillRows, skillSort])

  const sortedPrompts = useMemo(() => {
    const rows = [...initialData.prompts]
    rows.sort((a, b) => {
      switch (promptSort.field) {
        case 'id':
          return compareNumber(a.id, b.id, promptSort.direction)
        case 'score':
          return compareNumber(toNumber(a.score), toNumber(b.score), promptSort.direction)
        case 'createdAt':
          return compareDate(a.createdAt, b.createdAt, promptSort.direction)
        default:
          return 0
      }
    })
    return rows
  }, [initialData.prompts, promptSort])

  const sortedNews = useMemo(() => {
    const rows = [...initialData.news]
    rows.sort((a, b) => {
      switch (newsSort.field) {
        case 'id':
          return compareNumber(a.id, b.id, newsSort.direction)
        case 'score':
          return compareNumber(toNumber(a.score), toNumber(b.score), newsSort.direction)
        case 'publishedAt':
          return compareDate(a.publishedAt, b.publishedAt, newsSort.direction)
        case 'heatScore':
          return compareNumber(toNumber(a.cluster?.heatScore), toNumber(b.cluster?.heatScore), newsSort.direction)
        default:
          return 0
      }
    })
    return rows
  }, [initialData.news, newsSort])

  const activeSort = activeTable === 'skills' ? skillSort : activeTable === 'prompts' ? promptSort : newsSort

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
              <Table2 className="h-4 w-4 text-cyan-300" />
              三张核心表
            </div>
            <div className="mt-1 text-xs leading-5 text-zinc-500">
              Skill、提示词、AI 资讯分表查看，默认按 Score 排序，原始仓库和原文链接都保留在表里。
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded border border-zinc-800 bg-[#0b0f14] px-2 py-1 text-zinc-300">Skill {formatNumber(initialData.counts.skills)}</span>
            <span className="rounded border border-zinc-800 bg-[#0b0f14] px-2 py-1 text-zinc-300">提示词 {formatNumber(initialData.counts.prompts)}</span>
            <span className="rounded border border-zinc-800 bg-[#0b0f14] px-2 py-1 text-zinc-300">AI 资讯 {formatNumber(initialData.counts.news)}</span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <TabButton active={activeTable === 'skills'} icon={Database} label="Skill 表" count={initialData.counts.skills} onClick={() => setActiveTable('skills')} />
          <TabButton active={activeTable === 'prompts'} icon={FileText} label="提示词表" count={initialData.counts.prompts} onClick={() => setActiveTable('prompts')} />
          <TabButton active={activeTable === 'news'} icon={Newspaper} label="AI 资讯表" count={initialData.counts.news} onClick={() => setActiveTable('news')} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">排序</span>
          {activeTable === 'skills' && (
            <>
              <SortChip label="ID" active={skillSort.field === 'id'} direction={skillSort.direction} onClick={() => setSkillSort(nextSortState(skillSort, 'id'))} />
              <SortChip label="Score" active={skillSort.field === 'score'} direction={skillSort.direction} onClick={() => setSkillSort(nextSortState(skillSort, 'score'))} />
              <SortChip label="Stars" active={skillSort.field === 'stars'} direction={skillSort.direction} onClick={() => setSkillSort(nextSortState(skillSort, 'stars'))} />
              <SortChip label="下载" active={skillSort.field === 'downloads'} direction={skillSort.direction} onClick={() => setSkillSort(nextSortState(skillSort, 'downloads'))} />
            </>
          )}
          {activeTable === 'prompts' && (
            <>
              <SortChip label="ID" active={promptSort.field === 'id'} direction={promptSort.direction} onClick={() => setPromptSort(nextSortState(promptSort, 'id'))} />
              <SortChip label="Score" active={promptSort.field === 'score'} direction={promptSort.direction} onClick={() => setPromptSort(nextSortState(promptSort, 'score'))} />
              <SortChip label="时间" active={promptSort.field === 'createdAt'} direction={promptSort.direction} onClick={() => setPromptSort(nextSortState(promptSort, 'createdAt'))} />
            </>
          )}
          {activeTable === 'news' && (
            <>
              <SortChip label="ID" active={newsSort.field === 'id'} direction={newsSort.direction} onClick={() => setNewsSort(nextSortState(newsSort, 'id'))} />
              <SortChip label="Score" active={newsSort.field === 'score'} direction={newsSort.direction} onClick={() => setNewsSort(nextSortState(newsSort, 'score'))} />
              <SortChip label="发布时间" active={newsSort.field === 'publishedAt'} direction={newsSort.direction} onClick={() => setNewsSort(nextSortState(newsSort, 'publishedAt'))} />
              <SortChip label="热点" active={newsSort.field === 'heatScore'} direction={newsSort.direction} onClick={() => setNewsSort(nextSortState(newsSort, 'heatScore'))} />
            </>
          )}
        </div>
      </div>

      {activeTable === 'skills' && (
        <div className="overflow-auto rounded-md border border-zinc-800">
          <table className="w-full min-w-[1500px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-zinc-950/80 text-xs text-zinc-500 backdrop-blur">
              <tr className="border-b border-zinc-800">
                <th className="px-3 py-3">ID</th>
                <th className="px-3 py-3">Skill</th>
                <th className="px-3 py-3">来源</th>
                <th className="px-3 py-3">Repo</th>
                <th className="px-3 py-3">Score</th>
                <th className="px-3 py-3">Stars</th>
                <th className="px-3 py-3">下载</th>
                <th className="px-3 py-3">分类</th>
                <th className="px-3 py-3">标签</th>
                <th className="px-3 py-3">原始链接</th>
              </tr>
            </thead>
            <tbody>
              {sortedSkills.map(skill => (
                <tr key={skill.id} className="border-b border-zinc-900 align-top">
                  <td className="px-3 py-3 font-mono text-xs text-zinc-500">#{skill.id}</td>
                  <td className="px-3 py-3">
                    <div className="max-w-[260px] font-medium text-zinc-100">{skill.name}</div>
                    <div className="mt-1 max-w-[360px] text-xs leading-5 text-zinc-500">{trim(skill.description, 120)}</div>
                  </td>
                  <td className="px-3 py-3 text-zinc-400">
                    <div>{skill.sourceSlug}</div>
                    <div className="mt-1 text-[11px] text-zinc-600">{skill.status || '-'}</div>
                  </td>
                  <td className="px-3 py-3">
                    {skill.repo ? (
                      <div className="max-w-[260px] space-y-1">
                        <a className="inline-flex items-center gap-1 font-mono text-xs text-cyan-300 hover:text-cyan-100" href={skill.repoUrl || `https://github.com/${skill.repo}`} target="_blank" rel="noreferrer">
                          {skill.repo}
                          <ArrowUpRight className="h-3 w-3" />
                        </a>
                        {skill.skillPath ? <div className="truncate font-mono text-[11px] text-zinc-500" title={skill.skillPath}>{skill.skillPath}</div> : null}
                        {skill.installGitUrl ? <div className="truncate font-mono text-[11px] text-emerald-300" title={skill.installGitUrl}>{skill.installGitUrl}</div> : null}
                      </div>
                    ) : (
                      <span className="text-zinc-600">待补全</span>
                    )}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-cyan-200">{formatNumber(toNumber(skill.heatScore))}</td>
                  <td className="px-3 py-3 font-mono text-xs text-zinc-200">{formatNumber(toNumber(skill.stars))}</td>
                  <td className="px-3 py-3 font-mono text-xs text-zinc-200">{formatNumber(toNumber(skill.downloads))}</td>
                  <td className="px-3 py-3 text-zinc-300">
                    <div>{skill.parsedCategory}</div>
                    <div className="mt-1 text-[11px] text-zinc-500">conf {formatNumber(skill.confidence)}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex max-w-[260px] flex-wrap gap-1">
                      {skill.parsedTags.slice(0, 4).map(tag => (
                        <span key={tag} className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">{tag}</span>
                      ))}
                      {skill.parsedTags.length === 0 && <span className="text-xs text-zinc-600">-</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <LinkButton href={skill.sourceLink || skill.repoUrl || skill.githubUrl || skill.homepageUrl} label="打开" />
                  </td>
                </tr>
              ))}
              {sortedSkills.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-sm text-zinc-500" colSpan={10}>没有可展示的 Skill 记录。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTable === 'prompts' && (
        <div className="overflow-auto rounded-md border border-zinc-800">
          <table className="w-full min-w-[1320px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-zinc-950/80 text-xs text-zinc-500 backdrop-blur">
              <tr className="border-b border-zinc-800">
                <th className="px-3 py-3">ID</th>
                <th className="px-3 py-3">Prompt</th>
                <th className="px-3 py-3">来源</th>
                <th className="px-3 py-3">分类</th>
                <th className="px-3 py-3">Score</th>
                <th className="px-3 py-3">标签</th>
                <th className="px-3 py-3">发布时间</th>
                <th className="px-3 py-3">原文</th>
              </tr>
            </thead>
            <tbody>
              {sortedPrompts.map(prompt => (
                <tr key={prompt.id} className="border-b border-zinc-900 align-top">
                  <td className="px-3 py-3 font-mono text-xs text-zinc-500">#{prompt.id}</td>
                  <td className="px-3 py-3">
                    <div className="max-w-[300px] font-medium text-zinc-100">{prompt.title}</div>
                    <div className="mt-1 max-w-[460px] text-xs leading-5 text-zinc-500">{trim(prompt.summaryZh || prompt.highlights, 170)}</div>
                  </td>
                  <td className="px-3 py-3 text-zinc-400">
                    <div className="max-w-[220px] truncate">{prompt.sourceName || '-'}</div>
                    <div className="mt-1 text-[11px] text-zinc-600">{prompt.author || '-'}</div>
                  </td>
                  <td className="px-3 py-3 text-zinc-300">{prompt.category || '通用提示词'}</td>
                  <td className="px-3 py-3 font-mono text-xs text-cyan-200">{formatNumber(toNumber(prompt.score))}</td>
                  <td className="px-3 py-3">
                    <div className="flex max-w-[260px] flex-wrap gap-1">
                      {splitList(prompt.tags).slice(0, 4).map(tag => (
                        <span key={tag} className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">{tag}</span>
                      ))}
                      {splitList(prompt.tags).length === 0 && <span className="text-xs text-zinc-600">-</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-zinc-500">{formatDate(prompt.createdAt)}</td>
                  <td className="px-3 py-3">
                    <LinkButton href={prompt.sourceUrl} label="打开" />
                  </td>
                </tr>
              ))}
              {sortedPrompts.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-sm text-zinc-500" colSpan={8}>没有提示词候选。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTable === 'news' && (
        <div className="overflow-auto rounded-md border border-zinc-800">
          <table className="w-full min-w-[1360px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-zinc-950/80 text-xs text-zinc-500 backdrop-blur">
              <tr className="border-b border-zinc-800">
                <th className="px-3 py-3">ID</th>
                <th className="px-3 py-3">AI 资讯</th>
                <th className="px-3 py-3">来源</th>
                <th className="px-3 py-3">分类</th>
                <th className="px-3 py-3">Score</th>
                <th className="px-3 py-3">热点</th>
                <th className="px-3 py-3">发布时间</th>
                <th className="px-3 py-3">原文</th>
              </tr>
            </thead>
            <tbody>
              {sortedNews.map(news => (
                <tr key={news.id} className="border-b border-zinc-900 align-top">
                  <td className="px-3 py-3 font-mono text-xs text-zinc-500">#{news.id}</td>
                  <td className="px-3 py-3">
                    <div className="max-w-[320px] font-medium text-zinc-100">{news.title}</div>
                    <div className="mt-1 max-w-[480px] text-xs leading-5 text-zinc-500">{trim(news.summaryZh || news.highlights, 170)}</div>
                  </td>
                  <td className="px-3 py-3 text-zinc-400">{news.sourceName || '-'}</td>
                  <td className="px-3 py-3 text-zinc-300">{news.category || 'AI 资讯'}</td>
                  <td className="px-3 py-3 font-mono text-xs text-cyan-200">{formatNumber(toNumber(news.score))}</td>
                  <td className="px-3 py-3">
                    <div className="max-w-[220px] truncate text-zinc-300">{news.cluster?.title || '-'}</div>
                    <div className="mt-1 text-xs text-zinc-500">heat {formatNumber(toNumber(news.cluster?.heatScore))}</div>
                  </td>
                  <td className="px-3 py-3 text-zinc-500">{formatDate(news.publishedAt || news.createdAt)}</td>
                  <td className="px-3 py-3">
                    <LinkButton href={news.sourceUrl} label="打开" />
                  </td>
                </tr>
              ))}
              {sortedNews.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-sm text-zinc-500" colSpan={8}>没有 AI 资讯候选。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs leading-5 text-zinc-500">
        当前核心表按采集结果实时读取，Skill 以 GitHub 源仓库为主，提示词和 AI 资讯保留原始发布地址。
      </div>
    </section>
  )
}
