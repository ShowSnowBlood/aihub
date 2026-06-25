import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function textTokens(value: string) {
  return Array.from(new Set(
    value
      .toLowerCase()
      .match(/[a-z0-9+_.-]{2,}|[\u4e00-\u9fff]{2,}/g) || [],
  )).slice(0, 12)
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function githubRepoFromUrl(value?: string | null) {
  if (!value) return ''
  try {
    const url = new URL(value)
    if (!/^github\.com$/i.test(url.hostname)) return ''
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return ''
    return `${parts[0]}/${parts[1].replace(/\.git$/i, '')}`
  } catch {
    const match = value.match(/github\.com[:/]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:[/?#\s]|$)/i)
    return match ? `${match[1]}/${match[2].replace(/\.git$/i, '')}` : ''
  }
}

function githubMetadata(row: {
  sourceUrl?: string | null
  githubUrl?: string | null
  downloadUrl?: string | null
  homepageUrl?: string | null
  stars?: number | null
  forks?: number | null
  downloads?: number | null
  rawData?: string | null
}) {
  const raw = parseJson<Record<string, any>>(row.rawData, {})
  const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
  const repo = String(
    raw.originalRepo ||
    github.originalRepo ||
    raw.installRepo ||
    github.installRepo ||
    github.repo ||
    raw.repo ||
    raw.sourceRepo ||
    githubRepoFromUrl(row.githubUrl) ||
    githubRepoFromUrl(row.sourceUrl) ||
    githubRepoFromUrl(row.downloadUrl) ||
    githubRepoFromUrl(row.homepageUrl) ||
    githubRepoFromUrl(raw.repoUrl) ||
    githubRepoFromUrl(raw.githubUrl) ||
    '',
  )
  const repoUrl = repo ? `https://github.com/${repo}` : ''
  return {
    repo,
    repoUrl,
    installGitUrl: String(raw.installGitUrl || github.installGitUrl || (repo ? `${repoUrl}.git` : '')),
    skillPath: String(raw.skillMdPath || github.skillMdPath || github.skillPath || raw.file || ''),
    skillUrl: String(raw.skillMdUrl || github.skillMdUrl || row.githubUrl || row.sourceUrl || repoUrl),
    stars: Math.max(toNumber(row.stars), toNumber(github.stars), toNumber(raw.stars)),
    forks: Math.max(toNumber(row.forks), toNumber(github.forks), toNumber(raw.forks)),
    downloads: Math.max(toNumber(row.downloads), toNumber(github.releaseDownloads), toNumber(raw.installs), toNumber((raw.item || {}).installs)),
  }
}

function scoreText(text: string, tokens: string[], weight: number) {
  const lower = text.toLowerCase()
  return tokens.reduce((score, token) => score + (lower.includes(token) ? weight : 0), 0)
}

function buildWhere(tokens: string[]) {
  if (tokens.length === 0) return {}
  const terms = tokens.slice(0, 8)
  return {
    OR: terms.flatMap(token => [
      { name: { contains: token, mode: 'insensitive' as const } },
      { nameZh: { contains: token, mode: 'insensitive' as const } },
      { description: { contains: token, mode: 'insensitive' as const } },
      { descriptionZh: { contains: token, mode: 'insensitive' as const } },
      { categoryZh: { contains: token, mode: 'insensitive' as const } },
      { tagsZh: { contains: token, mode: 'insensitive' as const } },
      { tags: { contains: token, mode: 'insensitive' as const } },
      { useCases: { contains: token, mode: 'insensitive' as const } },
      { sourceSlug: { contains: token, mode: 'insensitive' as const } },
    ]),
  }
}

async function resolveSkills(query: string, limit: number) {
  const tokens = textTokens(query)
  const rows = await prisma.externalSkill.findMany({
    where: {
      status: { notIn: ['out_of_scope', 'low_quality', 'ignored', 'aggregated_source'] },
      ...buildWhere(tokens),
    },
    orderBy: [{ heatScore: 'desc' }, { qualityScore: 'desc' }, { stars: 'desc' }, { updatedAt: 'desc' }],
    take: Math.min(Math.max(limit * 25, 80), 500),
    select: {
      id: true,
      name: true,
      nameZh: true,
      description: true,
      descriptionZh: true,
      categoryZh: true,
      tags: true,
      tagsZh: true,
      useCases: true,
      sourceSlug: true,
      sourceUrl: true,
      githubUrl: true,
      homepageUrl: true,
      downloadUrl: true,
      qualityScore: true,
      heatScore: true,
      stars: true,
      forks: true,
      downloads: true,
      rawData: true,
      publishedRef: true,
      updatedAt: true,
    },
  })

  return rows
    .map(row => {
      const github = githubMetadata(row)
      const haystack = [
        row.name,
        row.nameZh,
        row.description,
        row.descriptionZh,
        row.categoryZh,
        row.tags,
        row.tagsZh,
        row.useCases,
        row.sourceSlug,
        github.repo,
      ].filter(Boolean).join(' ')
      const haystackLower = haystack.toLowerCase()
      const queryLower = query.toLowerCase()
      const exactPhrase = Boolean(queryLower && haystackLower.includes(queryLower))
      const semanticScore =
        scoreText(row.name || '', tokens, 24) +
        scoreText(row.nameZh || '', tokens, 24) +
        scoreText(row.categoryZh || '', tokens, 14) +
        scoreText(`${row.tags || ''} ${row.tagsZh || ''}`, tokens, 12) +
        scoreText(`${row.description || ''} ${row.descriptionZh || ''} ${row.useCases || ''}`, tokens, 8) +
        scoreText(`${row.sourceSlug || ''} ${github.repo}`, tokens, 10)
      const popularityScore = Math.floor(Math.log10(Math.max(1, row.stars || github.stars || 0) + 1) * 10)
      const score = Math.max(row.heatScore || 0, row.qualityScore || 0) + semanticScore + popularityScore
      const matchReasons = tokens
        .filter(token => haystackLower.includes(token))
        .slice(0, 8)
      return {
        id: row.id,
        name: row.nameZh || row.name,
        originalName: row.name,
        description: row.descriptionZh || row.description,
        category: row.categoryZh || '未分类',
        sourceSlug: row.sourceSlug,
        sourceUrl: row.sourceUrl,
        githubUrl: row.githubUrl || github.skillUrl || github.repoUrl,
        repo: github.repo,
        repoUrl: github.repoUrl,
        installGitUrl: github.installGitUrl,
        skillPath: github.skillPath,
        stars: Math.max(row.stars || 0, github.stars),
        forks: Math.max(row.forks || 0, github.forks),
        downloads: Math.max(row.downloads || 0, github.downloads),
        score,
        matchReasons,
        exactPhrase,
        publishedRef: row.publishedRef,
        updatedAt: row.updatedAt,
        invocation: {
          mode: 'metadata_reference',
          callable: Boolean(github.repo || row.sourceUrl || row.githubUrl),
          safety: 'Do not execute remote code automatically. Use the source, README or SKILL.md as a capability reference.',
          recommendedUse: '检索到相似功能后，读取 SKILL.md/README，把步骤、输入输出和依赖转成当前任务的执行计划。',
        },
      }
    })
    .filter(item => item.repo || item.sourceUrl || item.githubUrl)
    .filter(item => tokens.length < 2 || item.exactPhrase || item.matchReasons.length >= Math.min(2, tokens.length))
    .sort((a, b) => b.score - a.score || b.stars - a.stars || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ exactPhrase, ...item }) => item)
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const query = String(url.searchParams.get('q') || url.searchParams.get('query') || '').trim()
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 12), 30))
  const skills = await resolveSkills(query, limit)
  return NextResponse.json({
    ok: true,
    query,
    limit,
    count: skills.length,
    skills,
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const query = String(body.q || body.query || body.task || '').trim()
  const limit = Math.max(1, Math.min(Number(body.limit || 12), 30))
  const skills = await resolveSkills(query, limit)
  return NextResponse.json({
    ok: true,
    query,
    limit,
    count: skills.length,
    skills,
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}
