import crypto from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

export type KnowledgeVectorStats = {
  total: number
  byScope: Array<{ scope: string; count: number }>
  bySourceType: Array<{ sourceType: string; count: number }>
  updatedAt: string | null
}

export type KnowledgeBuildResult = {
  ok: true
  scanned: {
    skills: number
    prompts: number
    news: number
    capabilityProfiles: number
  }
  upserted: number
  stats: KnowledgeVectorStats
}

export type KnowledgeSearchHit = {
  id: number
  scope: string
  sourceType: string
  sourceId: string | null
  sourceSlug: string | null
  title: string
  url: string | null
  text: string
  keywords: string | null
  score: number
  matchScore: number
}

type PrismaLike = PrismaClient

const TOOL_CAPABILITY_STATE_FILE = '.collector-state/tool-capabilities.json'
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'into',
  'skill',
  'skills',
  'agent',
  'github',
  'readme',
  'source',
  'data',
  'prompt',
  'news',
  'ai',
  'llm',
  'model',
  'tools',
  'tool',
])

function hash(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function cleanText(value?: string | null) {
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

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function splitList(value?: string | null) {
  if (!value) return []
  return value.split(/,|\n/).map(item => item.trim()).filter(Boolean)
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function tokens(value: string, limit = 40) {
  const seen = new Set<string>()
  const output: string[] = []
  const lower = value.toLowerCase()
  for (const token of lower.match(/[a-z0-9][a-z0-9_.\-+#]{1,40}|[\u4e00-\u9fff]{2,8}/g) || []) {
    const normalized = token.replace(/^[-_.]+|[-_.]+$/g, '')
    if (!normalized || normalized.length < 2 || STOP_WORDS.has(normalized) || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= limit) break
  }
  return output
}

function metadata(value: Record<string, unknown>) {
  return JSON.stringify(value)
}

async function upsertKnowledge(
  prisma: PrismaLike,
  input: {
    scope: string
    sourceType: string
    sourceId?: string | null
    sourceSlug?: string | null
    title: string
    url?: string | null
    text: string
    keywords?: string[]
    metadata?: Record<string, unknown>
    score?: number
  },
) {
  const title = cleanText(input.title).slice(0, 240)
  const text = cleanText(input.text).slice(0, 8000)
  if (!title || !text) return false
  const keywordList = input.keywords?.length ? input.keywords : tokens(`${title} ${text}`, 40)
  const fingerprint = hash(`${input.scope}:${input.sourceType}:${input.sourceId || input.url || title}`)
  await prisma.knowledgeVector.upsert({
    where: { fingerprint },
    update: {
      scope: input.scope,
      sourceType: input.sourceType,
      sourceId: input.sourceId || null,
      sourceSlug: input.sourceSlug || null,
      title,
      url: input.url || null,
      text,
      keywords: keywordList.join(','),
      metadata: metadata(input.metadata || {}),
      score: input.score || 0,
    },
    create: {
      scope: input.scope,
      sourceType: input.sourceType,
      sourceId: input.sourceId || null,
      sourceSlug: input.sourceSlug || null,
      title,
      url: input.url || null,
      text,
      keywords: keywordList.join(','),
      metadata: metadata(input.metadata || {}),
      fingerprint,
      score: input.score || 0,
    },
  })
  return true
}

function readToolCapabilityState() {
  const filePath = path.join(process.cwd(), TOOL_CAPABILITY_STATE_FILE)
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as any
  } catch {
    return null
  }
}

export async function getKnowledgeVectorStats(prisma: PrismaLike): Promise<KnowledgeVectorStats> {
  const [total, byScope, bySourceType, latest] = await Promise.all([
    prisma.knowledgeVector.count(),
    prisma.knowledgeVector.groupBy({
      by: ['scope'],
      _count: { _all: true },
      orderBy: { _count: { scope: 'desc' } },
      take: 20,
    }),
    prisma.knowledgeVector.groupBy({
      by: ['sourceType'],
      _count: { _all: true },
      orderBy: { _count: { sourceType: 'desc' } },
      take: 20,
    }),
    prisma.knowledgeVector.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    }),
  ])

  return {
    total,
    byScope: byScope.map(item => ({ scope: item.scope, count: item._count._all })),
    bySourceType: bySourceType.map(item => ({ sourceType: item.sourceType, count: item._count._all })),
    updatedAt: latest?.updatedAt?.toISOString() || null,
  }
}

export async function buildKnowledgeVectors(prisma: PrismaLike, options: { limit?: number } = {}): Promise<KnowledgeBuildResult> {
  const limit = Math.max(100, Math.min(options.limit || 30000, 200000))
  let upserted = 0

  const [skills, prompts, news] = await Promise.all([
    prisma.externalSkill.findMany({
      where: {
        status: { notIn: ['low_quality', 'out_of_scope', 'aggregated_source'] },
      },
      orderBy: [{ heatScore: 'desc' }, { qualityScore: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        sourceSlug: true,
        name: true,
        nameZh: true,
        description: true,
        descriptionZh: true,
        categoryZh: true,
        tagsZh: true,
        useCases: true,
        sourceUrl: true,
        githubUrl: true,
        homepageUrl: true,
        rawData: true,
        qualityScore: true,
        heatScore: true,
        stars: true,
        forks: true,
        downloads: true,
      },
    }),
    prisma.collectionCandidate.findMany({
      where: { type: 'prompt' },
      orderBy: [{ score: 'desc' }, { updatedAt: 'desc' }],
      take: Math.floor(limit / 2),
      select: {
        id: true,
        title: true,
        sourceName: true,
        category: true,
        sourceUrl: true,
        summary: true,
        summaryZh: true,
        highlights: true,
        tags: true,
        contentSnippet: true,
        score: true,
        rawData: true,
        source: { select: { slug: true } },
      },
    }),
    prisma.collectionCandidate.findMany({
      where: { type: 'news' },
      orderBy: [{ score: 'desc' }, { publishedAt: 'desc' }, { updatedAt: 'desc' }],
      take: Math.floor(limit / 2),
      select: {
        id: true,
        title: true,
        sourceName: true,
        category: true,
        sourceUrl: true,
        summary: true,
        summaryZh: true,
        highlights: true,
        tags: true,
        contentSnippet: true,
        score: true,
        rawData: true,
        source: { select: { slug: true } },
      },
    }),
  ])

  for (const skill of skills) {
    const raw = parseJson<Record<string, any>>(skill.rawData, {})
    const classifier = raw.skillClassifier && typeof raw.skillClassifier === 'object' ? raw.skillClassifier : {}
    const title = firstString(skill.nameZh, skill.name)
    const text = [
      title,
      skill.descriptionZh,
      skill.description,
      skill.categoryZh,
      skill.tagsZh,
      skill.useCases,
      raw.github?.description,
      raw.github?.topics?.join?.(','),
    ].filter(Boolean).join('\n')
    const ok = await upsertKnowledge(prisma, {
      scope: 'skill',
      sourceType: 'external_skill',
      sourceId: String(skill.id),
      sourceSlug: skill.sourceSlug,
      title,
      url: firstString(skill.githubUrl, skill.sourceUrl, skill.homepageUrl),
      text,
      keywords: [
        ...splitList(skill.tagsZh),
        ...splitList(skill.categoryZh),
        ...(Array.isArray(classifier.tagsZh) ? classifier.tagsZh.map(String) : []),
        ...(Array.isArray(classifier.matchedKeywords) ? classifier.matchedKeywords.map(String) : []),
      ],
      metadata: {
        stars: skill.stars,
        forks: skill.forks,
        downloads: skill.downloads,
        heatScore: skill.heatScore,
        qualityScore: skill.qualityScore,
      },
      score: Math.max(skill.heatScore || 0, skill.qualityScore || 0),
    })
    if (ok) upserted++
  }

  for (const prompt of prompts) {
    const ok = await upsertKnowledge(prisma, {
      scope: 'prompt',
      sourceType: 'collection_candidate',
      sourceId: String(prompt.id),
      sourceSlug: prompt.source?.slug || null,
      title: prompt.title,
      url: prompt.sourceUrl,
      text: [
        prompt.title,
        prompt.summaryZh,
        prompt.summary,
        prompt.highlights,
        prompt.contentSnippet,
        prompt.category,
        prompt.tags,
      ].filter(Boolean).join('\n'),
      keywords: [...splitList(prompt.tags), ...splitList(prompt.category)],
      metadata: { sourceName: prompt.sourceName, score: prompt.score },
      score: prompt.score,
    })
    if (ok) upserted++
  }

  for (const item of news) {
    const ok = await upsertKnowledge(prisma, {
      scope: 'ai-news',
      sourceType: 'collection_candidate',
      sourceId: String(item.id),
      sourceSlug: item.source?.slug || null,
      title: item.title,
      url: item.sourceUrl,
      text: [
        item.title,
        item.summaryZh,
        item.summary,
        item.highlights,
        item.contentSnippet,
        item.category,
        item.tags,
      ].filter(Boolean).join('\n'),
      keywords: [...splitList(item.tags), ...splitList(item.category)],
      metadata: { sourceName: item.sourceName, score: item.score },
      score: item.score,
    })
    if (ok) upserted++
  }

  const capabilityState = readToolCapabilityState()
  const profiles = capabilityState?.profiles && typeof capabilityState.profiles === 'object' ? capabilityState.profiles : {}
  let capabilityProfiles = 0
  for (const [sourceSlug, profile] of Object.entries(profiles) as Array<[string, any]>) {
    capabilityProfiles++
    const topKeywords = Array.isArray(profile.topKeywords) ? profile.topKeywords.map((item: any) => item.value || '').filter(Boolean) : []
    const topRepos = Array.isArray(profile.topRepos) ? profile.topRepos.map((item: any) => item.repo || '').filter(Boolean) : []
    const ok = await upsertKnowledge(prisma, {
      scope: 'capability',
      sourceType: 'tool_capability_profile',
      sourceId: sourceSlug,
      sourceSlug,
      title: profile.label || sourceSlug,
      url: null,
      text: [
        profile.label,
        sourceSlug,
        ...(Array.isArray(profile.codeQueries) ? profile.codeQueries : []),
        ...(Array.isArray(profile.repoQueries) ? profile.repoQueries : []),
        ...(Array.isArray(profile.topicKeywords) ? profile.topicKeywords : []),
        ...(Array.isArray(profile.toolHints) ? profile.toolHints : []),
        topKeywords.join(','),
        topRepos.join(','),
      ].filter(Boolean).join('\n'),
      keywords: [...topKeywords, ...(Array.isArray(profile.topicKeywords) ? profile.topicKeywords : [])],
      metadata: {
        skillCount: profile.skillCount,
        activeSkillCount: profile.activeSkillCount,
        repoCount: profile.repoCount,
        queryCount: profile.queryCount,
        generatedAt: profile.generatedAt,
      },
      score: Math.min(100, Number(profile.activeSkillCount || profile.skillCount || 0)),
    })
    if (ok) upserted++
  }

  const stats = await getKnowledgeVectorStats(prisma)
  return {
    ok: true,
    scanned: {
      skills: skills.length,
      prompts: prompts.length,
      news: news.length,
      capabilityProfiles,
    },
    upserted,
    stats,
  }
}

export async function searchKnowledgeVectors(prisma: PrismaLike, query: string, options: { scope?: string; limit?: number } = {}) {
  const queryTokens = tokens(query, 30)
  if (queryTokens.length === 0) return [] as KnowledgeSearchHit[]
  const limit = Math.max(1, Math.min(options.limit || 20, 100))
  const rows = await prisma.knowledgeVector.findMany({
    where: {
      ...(options.scope ? { scope: options.scope } : {}),
      OR: queryTokens.slice(0, 8).flatMap(token => [
        { title: { contains: token, mode: 'insensitive' as const } },
        { text: { contains: token, mode: 'insensitive' as const } },
        { keywords: { contains: token, mode: 'insensitive' as const } },
      ]),
    },
    orderBy: [{ score: 'desc' }, { updatedAt: 'desc' }],
    take: Math.max(limit * 4, 40),
  })

  return rows
    .map(row => {
      const haystack = `${row.title} ${row.keywords || ''} ${row.text}`.toLowerCase()
      const matchScore = queryTokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0)
      return {
        id: row.id,
        scope: row.scope,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        sourceSlug: row.sourceSlug,
        title: row.title,
        url: row.url,
        text: row.text,
        keywords: row.keywords,
        score: row.score,
        matchScore,
      }
    })
    .filter(row => row.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore || b.score - a.score)
    .slice(0, limit)
}
