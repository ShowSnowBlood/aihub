import { existsSync, readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { PrismaClient } from '@prisma/client'
import { deepSeekChat, getDeepSeekConfigStatus, loadLocalDeepSeekConfig } from '@/lib/deepseek-config'
import { getKnowledgeVectorStats, searchKnowledgeVectors } from '@/lib/knowledge-vector'

export const DEEPSEEK_GROWTH_PLAN_FILE = '.collector-state/deepseek-growth-plan.json'

export type DeepSeekGrowthPlan = {
  ok: boolean
  generatedAt: string
  model?: string
  knowledgeStats?: any
  skill: {
    goal: string
    skillsShQueries: string[]
    githubCodeQueries: string[]
    githubRepoQueries: string[]
    prioritySources: string[]
    reason: string
  }
  news: {
    goal: string
    topics: string[]
    prioritySources: string[]
    reason: string
  }
  prompts: {
    goal: string
    queries: string[]
    prioritySources: string[]
    reason: string
  }
  commands: Array<{
    commandId: string
    reason: string
  }>
  notes: string[]
  error?: string
}

type CapabilityStateForPlan = {
  generatedAt?: string
  profiles?: Record<string, any>
}

const ALLOWED_COMMAND_IDS = new Set([
  'build-tool-capability-profiles',
  'build-knowledge-vectors',
  'deepseek-growth-plan',
  'skills-sh-daemon',
  'prompt-library-daemon',
  'ai-news',
  'prompt-library',
  'skills-sh-search-index',
  'skills-sh-github-sources',
  'github-index',
  'github-full-skill-index',
  'github-python-crawler-skills',
  'github-cybersecurity-skills',
  'sync-external-skills',
  'optimize-skill-data',
  'enrich-github-skill-metadata',
  'reclassify-skills',
])

function planPath() {
  return path.join(process.cwd(), DEEPSEEK_GROWTH_PLAN_FILE)
}

function compactString(value: unknown, fallback = '') {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return fallback
}

function compactList(value: unknown, limit = 30) {
  const source = Array.isArray(value) ? value : []
  const seen = new Set<string>()
  const rows: string[] = []
  for (const item of source) {
    const text = compactString(item).replace(/\s+/g, ' ')
    const key = text.toLowerCase()
    if (!text || seen.has(key)) continue
    seen.add(key)
    rows.push(text)
    if (rows.length >= limit) break
  }
  return rows
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    const match = value.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0]) as T
      } catch {
        return fallback
      }
    }
    return fallback
  }
}

function readCapabilityState(): CapabilityStateForPlan | null {
  const filePath = path.join(process.cwd(), '.collector-state/tool-capabilities.json')
  if (!existsSync(filePath)) return null
  return parseJson<CapabilityStateForPlan | null>(readFileSync(filePath, 'utf8'), null)
}

export function readDeepSeekGrowthPlan(): DeepSeekGrowthPlan | null {
  const filePath = planPath()
  if (!existsSync(filePath)) return null
  return parseJson(readFileSync(filePath, 'utf8'), null)
}

export async function writeDeepSeekGrowthPlan(plan: DeepSeekGrowthPlan) {
  const filePath = planPath()
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(plan, null, 2), 'utf8')
}

function sanitizePlan(input: any, fallbackStats: any, model?: string): DeepSeekGrowthPlan {
  const commands = (Array.isArray(input?.commands) ? input.commands : [])
    .map((command: any) => ({
      commandId: compactString(command?.commandId),
      reason: compactString(command?.reason, 'DeepSeek 推荐执行'),
    }))
    .filter((command: any) => ALLOWED_COMMAND_IDS.has(command.commandId))
    .slice(0, 10)

  const plan: DeepSeekGrowthPlan = {
    ok: true,
    generatedAt: new Date().toISOString(),
    model,
    knowledgeStats: fallbackStats,
    skill: {
      goal: compactString(input?.skill?.goal, '扩大 GitHub 原始 Skill 与 skills.sh 源仓库覆盖'),
      skillsShQueries: compactList(input?.skill?.skillsShQueries, 60),
      githubCodeQueries: compactList(input?.skill?.githubCodeQueries, 80),
      githubRepoQueries: compactList(input?.skill?.githubRepoQueries, 60),
      prioritySources: compactList(input?.skill?.prioritySources, 20),
      reason: compactString(input?.skill?.reason, '结合能力画像和现有 Skill 缺口扩展采集查询。'),
    },
    news: {
      goal: compactString(input?.news?.goal, '补齐最新 AI 模型、产品、研究与工具更新'),
      topics: compactList(input?.news?.topics, 40),
      prioritySources: compactList(input?.news?.prioritySources, 20),
      reason: compactString(input?.news?.reason, '按近期热点和高可信来源补齐资讯候选。'),
    },
    prompts: {
      goal: compactString(input?.prompts?.goal, '扩展行业提示词和可复用提示词模板'),
      queries: compactList(input?.prompts?.queries, 60),
      prioritySources: compactList(input?.prompts?.prioritySources, 20),
      reason: compactString(input?.prompts?.reason, '按行业、岗位和模型使用场景扩展提示词采集。'),
    },
    commands,
    notes: compactList(input?.notes, 12),
  }

  if (plan.commands.length === 0) {
    plan.commands = [
      { commandId: 'build-knowledge-vectors', reason: '先刷新 DeepSeek 可检索知识库。' },
      { commandId: 'skills-sh-daemon', reason: '保持 GitHub + skills.sh 常驻同步。' },
      { commandId: 'prompt-library-daemon', reason: '保持提示词常驻同步。' },
      { commandId: 'ai-news', reason: '刷新 AI 资讯候选。' },
    ]
  }

  return plan
}

function fallbackQueriesFromCapabilities(capabilityState: any) {
  const profiles = capabilityState?.profiles && typeof capabilityState.profiles === 'object' ? Object.values(capabilityState.profiles) as any[] : []
  return {
    codeQueries: compactList(profiles.flatMap(profile => profile?.codeQueries || []), 40),
    repoQueries: compactList(profiles.flatMap(profile => profile?.repoQueries || []), 30),
    topicKeywords: compactList(profiles.flatMap(profile => profile?.topicKeywords || []), 40),
  }
}

export async function generateDeepSeekGrowthPlan(prisma: PrismaClient): Promise<DeepSeekGrowthPlan> {
  loadLocalDeepSeekConfig()
  const configStatus = getDeepSeekConfigStatus()
  const knowledgeStats = await getKnowledgeVectorStats(prisma)
  const capabilityState = readCapabilityState()
  const capabilityQueries = fallbackQueriesFromCapabilities(capabilityState)

  if (!configStatus.configured) {
    const plan: DeepSeekGrowthPlan = {
      ok: false,
      generatedAt: new Date().toISOString(),
      knowledgeStats,
      skill: {
        goal: '等待配置 DeepSeek API Key 后由模型生成增长策略',
        skillsShQueries: capabilityQueries.topicKeywords.slice(0, 20),
        githubCodeQueries: capabilityQueries.codeQueries.slice(0, 30),
        githubRepoQueries: capabilityQueries.repoQueries.slice(0, 20),
        prioritySources: ['github-global-skill-index', 'skills-sh-search-index', 'skills-sh-github-sources'],
        reason: '当前未配置 DeepSeek，暂用能力画像中的查询词。配置后会生成更精细的扩采计划。',
      },
      news: {
        goal: '等待 DeepSeek 生成 AI 资讯主题',
        topics: ['frontier models', 'AI agents', 'RAG', 'AI coding', 'model releases'],
        prioritySources: ['ai-news-openai-rss'],
        reason: '未配置 DeepSeek，使用默认 AI 资讯主题。',
      },
      prompts: {
        goal: '等待 DeepSeek 生成提示词扩采词',
        queries: ['行业提示词', 'AI 绘图提示词', '编程提示词', '运营提示词', '教育提示词'],
        prioritySources: ['prompt-aishort-community', 'prompt-directory-ai-tishici-readme'],
        reason: '未配置 DeepSeek，使用默认提示词扩采词。',
      },
      commands: [
        { commandId: 'build-knowledge-vectors', reason: '先刷新本地知识库。' },
        { commandId: 'skills-sh-daemon', reason: '保持 Skill 常驻采集。' },
        { commandId: 'prompt-library-daemon', reason: '保持提示词常驻采集。' },
      ],
      notes: ['DeepSeek API Key 未配置，增长计划处于降级模式。'],
      error: 'DEEPSEEK_API_KEY 未配置',
    }
    await writeDeepSeekGrowthPlan(plan)
    return plan
  }

  const [
    skillCounts,
    candidateCounts,
    recentSources,
    skillHits,
    newsHits,
    promptHits,
  ] = await Promise.all([
    prisma.externalSkill.groupBy({
      by: ['sourceSlug'],
      _count: { _all: true },
      orderBy: { _count: { sourceSlug: 'desc' } },
      take: 20,
    }),
    prisma.collectionCandidate.groupBy({
      by: ['type', 'status'],
      _count: { _all: true },
      orderBy: { _count: { type: 'desc' } },
      take: 30,
    }),
    prisma.collectionSource.findMany({
      where: { enabled: true },
      orderBy: [{ target: 'asc' }, { priority: 'desc' }],
      take: 60,
      select: {
        slug: true,
        name: true,
        type: true,
        target: true,
        category: true,
        lastStatus: true,
        lastError: true,
        failCount: true,
      },
    }),
    searchKnowledgeVectors(prisma, 'skill github source SKILL.md crawler scraping agent rag automation', { scope: 'skill', limit: 12 }),
    searchKnowledgeVectors(prisma, 'AI news model release agent product update research paper benchmark', { scope: 'ai-news', limit: 10 }),
    searchKnowledgeVectors(prisma, 'prompt library industry workflow image coding education marketing', { scope: 'prompt', limit: 10 }),
  ])

  const context = {
    now: new Date().toISOString(),
    safety: {
      mode: 'public-metadata-only',
      rules: [
        '只采公开可见内容。',
        '不绕过登录、付费、验证码、风控或站点限制。',
        '安全能力画像只用于检索词、分类和审核建议，不执行外部目标扫描或漏洞利用。',
        'Skill 必须尽量追溯到原始 GitHub 仓库或具体 SKILL.md/目录。',
      ],
    },
    knowledgeStats,
    skillCounts,
    candidateCounts,
    sources: recentSources,
    capabilitySummary: capabilityState ? {
      generatedAt: capabilityState.generatedAt,
      profiles: Object.entries(capabilityState.profiles || {}).map(([sourceSlug, profile]: any) => ({
        sourceSlug,
        label: profile.label,
        skillCount: profile.skillCount,
        activeSkillCount: profile.activeSkillCount,
        repoCount: profile.repoCount,
        codeQueries: (profile.codeQueries || []).slice(0, 20),
        repoQueries: (profile.repoQueries || []).slice(0, 20),
        topicKeywords: (profile.topicKeywords || []).slice(0, 30),
        topRepos: (profile.topRepos || []).slice(0, 12),
      })),
    } : null,
    retrievedKnowledge: {
      skills: skillHits.map(hit => ({ title: hit.title, source: hit.sourceSlug, score: hit.score, keywords: hit.keywords, url: hit.url })),
      news: newsHits.map(hit => ({ title: hit.title, source: hit.sourceSlug, score: hit.score, keywords: hit.keywords, url: hit.url })),
      prompts: promptHits.map(hit => ({ title: hit.title, source: hit.sourceSlug, score: hit.score, keywords: hit.keywords, url: hit.url })),
    },
    allowedCommandIds: Array.from(ALLOWED_COMMAND_IDS),
  }

  const response = await deepSeekChat({
    responseFormat: 'json_object',
    temperature: 0.15,
    maxTokens: 2600,
    messages: [
      {
        role: 'system',
        content: [
          '你是 AIHub Collector 的增长调度器。',
          '你负责理解能力画像、知识库和采集状态，输出下一轮采集增长计划。',
          '只输出 JSON，不要输出 Markdown。',
          '必须遵守 public-metadata-only 安全边界，不能建议绕过登录、验证码、限速、付费墙、风控，也不能建议攻击外部目标。',
          'commands 只能使用 allowedCommandIds 里的 commandId。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: JSON.stringify({
          task: '生成 Skill、AI 资讯、AI 提示词三类数据增长计划，并给出可执行采集命令。',
          requiredSchema: {
            skill: {
              goal: 'string',
              skillsShQueries: ['string'],
              githubCodeQueries: ['string'],
              githubRepoQueries: ['string'],
              prioritySources: ['string'],
              reason: 'string',
            },
            news: {
              goal: 'string',
              topics: ['string'],
              prioritySources: ['string'],
              reason: 'string',
            },
            prompts: {
              goal: 'string',
              queries: ['string'],
              prioritySources: ['string'],
              reason: 'string',
            },
            commands: [{ commandId: 'string', reason: 'string' }],
            notes: ['string'],
          },
          context,
        }),
      },
    ],
  })

  const rawPlan = parseJson<Record<string, any>>(response.content, {})
  const plan = sanitizePlan(rawPlan, knowledgeStats, response.model)
  await writeDeepSeekGrowthPlan(plan)
  return plan
}
