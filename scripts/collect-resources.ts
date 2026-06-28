import { PrismaClient } from '@prisma/client'
import Parser from 'rss-parser'
import * as cheerio from 'cheerio'
import slugify from 'slugify'
import crypto from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import { classifySkill, semanticSkillTags } from '../src/lib/skill-classifier'
import { defaultCollectionSources, deprecatedCollectionSourceSlugs } from './collection-sources'

const prisma = new PrismaClient()
const rssParser = new Parser({
  timeout: 20000,
  headers: {
    'User-Agent': 'AIHub-Scrapling-Collector/1.0',
  },
})

loadLocalEnv()

type RawItem = {
  type: 'news' | 'github' | 'skill' | 'prompt'
  title: string
  sourceName?: string
  author?: string
  sourceUrl?: string
  canonicalUrl?: string
  publishedAt?: Date | null
  summary?: string
  language?: string | null
  region?: string | null
  category?: string | null
  tags?: string[]
  contentSnippet?: string
  rawData?: Record<string, unknown>
}

const SOURCE_TYPES = {
  rss: 'RSS',
  github: 'GitHub API',
  siteList: 'Site List',
  skillSiteList: 'Skill Site List',
  skillsShApi: 'Skills.sh API',
  skillsShSearch: 'Skills.sh Search API',
  skillsShBrowser: 'Skills.sh Browser',
  skillsShGithubSources: 'Skills.sh GitHub Sources',
  githubSkillIndex: 'GitHub Skill Index',
  localSkills: 'Local Skill Directory',
  githubSkillRepo: 'GitHub Skill Repo',
  manualSkills: 'Manual Skill Seeds',
  promptSite: 'Prompt Site',
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

function scraplingPythonPath() {
  const configured = process.env.SCRAPLING_PYTHON_PATH || process.env.PYTHON_PATH
  if (configured && existsSync(configured)) return configured

  const localVenv =
    process.platform === 'win32'
      ? path.join(process.cwd(), '.venv-scrapling', 'Scripts', 'python.exe')
      : path.join(process.cwd(), '.venv-scrapling', 'bin', 'python')
  if (existsSync(localVenv)) return localVenv

  return process.platform === 'win32' ? 'python' : 'python3'
}

const PROJECT_SKILL_PATHS = ['.agents/skills', '.codex/skills', 'skills', 'agent-skills']
const blockedSkillPathParts = [
  `${path.sep}.codex${path.sep}plugins${path.sep}cache${path.sep}`,
  `${path.sep}.codex${path.sep}skills${path.sep}.system${path.sep}`,
  `${path.sep}.codex${path.sep}skills${path.sep}system${path.sep}`,
]

function json(value: unknown) {
  return JSON.stringify(value ?? {})
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function cleanText(value = '') {
  return value
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

function normalizeTitle(title: string) {
  return cleanText(title)
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeUrl(url?: string | null) {
  if (!url) return null
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    ;['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref'].forEach(key => {
      parsed.searchParams.delete(key)
    })
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return url.trim()
  }
}

function safeDate(value?: string | Date | null) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function fingerprint(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function makeSlug(value: string, fallbackPrefix = 'candidate') {
  const slug = slugify(value, { lower: true, strict: true, locale: 'zh' })
  return slug || `${fallbackPrefix}-${fingerprint(value).slice(0, 10)}`
}

function contentFingerprint(item: RawItem) {
  const url = normalizeUrl(item.canonicalUrl || item.sourceUrl)
  if (url) return fingerprint(`${item.type}:url:${url}`)
  return fingerprint(`${item.type}:title:${normalizeTitle(item.title)}:${cleanText(item.summary || item.contentSnippet || '').slice(0, 220)}`)
}

const skillCategoryMap: Array<{ categoryZh: string; keywords: string[] }> = [
  { categoryZh: 'Scrapling 风格爬虫采集', keywords: ['scrapling', 'scrapy', 'web scraping', 'stealth scraping', 'adaptive scraping', 'playwright scraping', 'selenium scraping', 'beautifulsoup', 'bs4', 'lxml', 'parsel', 'firecrawl', 'crawl4ai', 'browser automation scraping', '爬虫', '采集', '抓取', '网页解析'] },
  { categoryZh: 'Shannon 黑客技能库', keywords: ['shannon', 'hacker skills', 'ai pentester', 'offensive security', 'penetration testing', 'pentest', 'web exploitation', 'red team', 'blue team', 'ctf', 'pwn', 'reverse engineering', 'malware analysis', 'osint', 'bug bounty', '渗透测试', '漏洞', '攻防', '红队', '蓝队', '威胁情报'] },
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

function semanticTags(tags: string[] = []) {
  return semanticSkillTags(tags.map(tag => cleanText(tag).trim()))
}

function semanticSkillText(item: RawItem, extraTags: string[] = []) {
  const tags = semanticTags([...(item.tags || []), ...extraTags])
  return `${item.title} ${item.summary || ''} ${item.contentSnippet || ''} ${tags.join(' ')} ${item.category || ''}`
}

function classifySkillForRawItem(item: RawItem, tags: string[] = [], source?: any) {
  const raw = item.rawData || {}
  const github = (raw as any).github && typeof (raw as any).github === 'object' ? (raw as any).github : {}
  return classifySkill({
    name: item.title,
    description: cleanText(item.summary || item.contentSnippet || ''),
    category: firstString(item.category, source?.category),
    tags: [...(item.tags || []), ...tags],
    sourceSlug: source?.slug,
    sourceUrl: item.sourceUrl,
    githubUrl: firstString((raw as any).githubUrl, (raw as any).github_url, github.url, github.repoUrl, item.canonicalUrl),
    repo: firstString(
      (raw as any).originalRepo,
      (raw as any).sourceRepo,
      (raw as any).repo,
      (raw as any).source,
      github.originalRepo,
      github.sourceRepo,
      github.repo,
    ),
    path: firstString((raw as any).skillMdPath, (raw as any).file, github.skillMdPath, github.skillPath),
    rawData: raw,
    capabilityKeywords: source?.slug ? topicKeywordsFromCapabilityState(source.slug).slice(0, 40) : [],
  }, firstString(source?.category, item.category, '通用 Agent Skill'))
}

function classifySkillZh(text: string, fallback = '通用 Agent Skill') {
  return classifySkill({ name: text }, fallback).categoryZh
}

function classifyPromptIndustry(text: string, fallback = '通用提示词') {
  const value = text.toLowerCase()
  const rules: Array<[string, string[]]> = [
    ['教育科研', ['论文', '研究', '实验', '学习', '课程', '老师', '学生', '教学', '考试', '知识点', '文献']],
    ['营销销售', ['营销', '销售', '转化', '私域', '社群', '小红书', '抖音', '广告', '文案', '品牌', 'seo', '增长']],
    ['写作办公', ['总结', '改写', '润色', '邮件', '汇报', '报告', '方案', '会议', '简历', 'ppt', 'word', 'excel']],
    ['设计绘图', ['生图', '绘图', '画面', '构图', '风格', '色调', '镜头', '海报', '插画', '国风', 'midjourney']],
    ['编程技术', ['代码', '编程', '开发', 'debug', 'api', '数据库', 'sql', '前端', '后端', 'python', 'javascript']],
    ['数据分析', ['数据', '分析', '指标', '报表', '图表', '统计', '可视化', '建模']],
    ['产品运营', ['产品', '需求', '用户', '运营', '竞品', '用户画像', '功能', '策略']],
    ['法律金融', ['合同', '法律', '合规', '金融', '投资', '财务', '税务', '审计', '风险']],
    ['客服电商', ['客服', '电商', '店铺', '商品', '评价', '售后', '订单', '直播']],
    ['视频媒体', ['视频', '脚本', '剪辑', '分镜', '口播', '短视频', '播客']],
  ]
  return rules.find(([, keywords]) => keywords.some(keyword => value.includes(keyword)))?.[0] || fallback
}

function categoryZhFor(item: RawItem, tags: string[]) {
  const category = firstString(item.category)
  if (category && /[\u4e00-\u9fff]/.test(category)) return category
  return classifySkillForRawItem(item, tags).categoryZh
}

function translateTagsZh(tags: string[]) {
  return classifySkill({ tags }).tagsZh
}

function tagsFor(item: RawItem) {
  const text = semanticSkillText(item).toLowerCase()
  const tags = new Set(semanticTags(item.tags || []))
  const keywordMap: Array<[string, string]> = [
    ['agent', 'Agent'],
    ['智能体', 'Agent'],
    ['rag', 'RAG'],
    ['retrieval', 'RAG'],
    ['knowledge', '知识库'],
    ['llm', 'LLM'],
    ['github', 'GitHub'],
    ['openai', 'OpenAI'],
    ['anthropic', 'Anthropic'],
    ['claude', 'Claude'],
    ['gemini', 'Gemini'],
    ['deepmind', 'DeepMind'],
    ['arxiv', '论文'],
    ['paper', '论文'],
    ['video', '视频生成'],
    ['image', '图像生成'],
    ['coding', 'AI 编程'],
    ['code', 'AI 编程'],
    ['workflow', '自动化'],
    ['automation', '自动化'],
    ['firecrawl', '采集'],
    ['crawler', '采集'],
    ['api', 'API'],
    ['mcp', 'MCP'],
    ['vector', '向量数据库'],
  ]
  for (const [keyword, tag] of keywordMap) {
    if (text.includes(keyword)) tags.add(tag)
  }
  if (item.type === 'skill') tags.add('Skill')
  if (item.type === 'prompt') tags.add('Prompt')
  return Array.from(tags).slice(0, 12)
}

function relatedSkillsFor(item: RawItem) {
  const tags = tagsFor(item)
  const related = new Set<string>()
  if (tags.includes('RAG') || tags.includes('知识库')) related.add('知识库检索问答')
  if (tags.includes('Agent')) related.add('Agent 模板生成')
  if (tags.includes('GitHub')) related.add('GitHub 项目解析')
  if (tags.includes('AI 编程')) related.add('代码仓库分析')
  if (tags.includes('自动化')) related.add('工作流自动化编排')
  if (tags.includes('采集')) related.add('浏览器自动化采集')
  if (tags.includes('API') || tags.includes('MCP')) related.add('API 调用与工具接入')
  if (tags.includes('论文')) related.add('论文速读与复现线索')
  if (item.type === 'news') related.add('长文中文摘要')
  if (item.type === 'prompt') related.add('提示词改写优化')
  if (related.size === 0) related.add('内容改写与分发')
  return Array.from(related)
}

function relatedAgentsFor(item: RawItem) {
  const tags = tagsFor(item)
  const agents = new Set<string>()
  if (tags.includes('RAG') || tags.includes('知识库')) agents.add('知识库问答 Agent')
  if (tags.includes('Agent')) agents.add('任务执行 Agent')
  if (tags.includes('GitHub') || tags.includes('AI 编程')) agents.add('开源项目解读 Agent')
  if (tags.includes('自动化') || tags.includes('采集')) agents.add('运营自动化 Agent')
  if (tags.includes('论文')) agents.add('论文研究 Agent')
  if (item.type === 'prompt') agents.add('提示词运营 Agent')
  if (agents.size === 0) agents.add('AI 情报分析 Agent')
  return Array.from(agents)
}

function scoreItem(item: RawItem, sourcePriority = 50) {
  const detail: Record<string, number> = {
    sourcePriority,
    freshness: 0,
    authority: 0,
    contentRichness: 0,
    socialSignal: 0,
    skillMatch: relatedSkillsFor(item).length * 8,
  }

  if (item.publishedAt) {
    const ageHours = Math.max(0, (Date.now() - item.publishedAt.getTime()) / 36e5)
    detail.freshness = Math.max(0, 40 - Math.floor(ageHours / 12))
  }

  const source = `${item.sourceName || ''} ${item.sourceUrl || ''}`.toLowerCase()
  if (source.includes('openai') || source.includes('anthropic') || source.includes('google') || source.includes('deepmind') || source.includes('github')) {
    detail.authority = 24
  } else if (source.includes('huggingface') || source.includes('arxiv') || source.includes('qbitai') || source.includes('jiqizhixin')) {
    detail.authority = 20
  } else if (source.includes('techcrunch') || source.includes('venturebeat') || source.includes('marktechpost')) {
    detail.authority = 16
  }

  if (item.type === 'skill' && (source.includes('manual') || source.includes('ai hub'))) detail.authority += 12
  if (item.type === 'prompt' && source.includes('aishort')) detail.authority += 18

  const contentLength = cleanText(`${item.summary || ''} ${item.contentSnippet || ''}`).length
  detail.contentRichness = Math.min(20, Math.floor(contentLength / 80))

  const stars = Number((item.rawData as any)?.stars || (item.rawData as any)?.github?.stars || 0)
  if (stars > 0) detail.socialSignal = Math.min(40, Math.floor(Math.log10(stars + 1) * 10))
  const releaseDownloads = toNumber((item.rawData as any)?.github?.releaseDownloads)
  if (releaseDownloads > 0) detail.socialSignal = Math.max(detail.socialSignal, Math.min(40, Math.floor(Math.log10(releaseDownloads + 1) * 10)))
  const installs = toNumber((item.rawData as any)?.installs)
  if (installs > 0) detail.socialSignal = Math.max(detail.socialSignal, Math.min(40, Math.floor(Math.log10(installs + 1) * 10)))
  const weeklyInstalls = Array.isArray((item.rawData as any)?.weeklyInstalls)
    ? (item.rawData as any).weeklyInstalls.reduce((sum: number, value: unknown) => sum + toNumber(value), 0)
    : toNumber((item.rawData as any)?.weeklyInstalls)
  if (weeklyInstalls > 0) detail.socialSignal = Math.max(detail.socialSignal, Math.min(40, Math.floor(Math.log10(weeklyInstalls + 1) * 10)))

  const total = Object.values(detail).reduce((sum, value) => sum + value, 0)
  return { score: Math.min(100, Math.round(total / 2)), detail }
}

function aiEnhance(item: RawItem) {
  const title = cleanText(item.title)
  const summary = cleanText(item.summary || item.contentSnippet || title)
  const tags = tagsFor(item)
  return {
    summaryZh: item.language === 'zh' ? summary : `自动摘要：${summary.slice(0, 220)}${summary.length > 220 ? '...' : ''}`,
    highlights: [
      `关注点：${tags.slice(0, 4).join(' / ') || item.category || 'AI'}`,
      `来源：${item.sourceName || '未知来源'}`,
      `适合进入：${item.type === 'github' ? 'GitHub AI Top 100 候选池' : item.type === 'skill' ? '热门 Skills 候选库' : item.type === 'prompt' ? '行业提示词库候选池' : 'AI 资讯候选池'}`,
    ].join('\n'),
    audience: item.type === 'github'
      ? '适合开发者、产品经理和正在做 Agent、RAG、LLM 应用选型的团队。'
      : item.type === 'skill'
        ? '适合社区运营、Agent 模板搭建者和需要沉淀复用能力模块的用户。'
        : item.type === 'prompt'
          ? '适合运营、销售、教育、设计、办公、研发等需要直接复用提示词的用户。'
          : '适合关注 AI 产品动态、技术路线和行业机会的读者。',
    relatedSkills: relatedSkillsFor(item).join(','),
    relatedAgents: relatedAgentsFor(item).join(','),
  }
}

export async function seedSources() {
  const activeSlugs = defaultCollectionSources.map(source => source.slug)
  await prisma.collectionSource.updateMany({
    where: { slug: { notIn: activeSlugs } },
    data: {
      enabled: false,
      lastStatus: 'disabled',
      lastError: 'Disabled: current source scope only keeps GitHub and skills.sh.',
    },
  })

  if (deprecatedCollectionSourceSlugs.length > 0) {
    await prisma.collectionSource.updateMany({
      where: { slug: { in: deprecatedCollectionSourceSlugs, notIn: activeSlugs } },
      data: {
        enabled: false,
        lastStatus: 'disabled',
        lastError: 'Deprecated: do not scan user Codex/system skills as community skills.',
      },
    })
  }

  let count = 0
  for (const source of defaultCollectionSources) {
    await prisma.collectionSource.upsert({
      where: { slug: source.slug },
      update: {
        name: source.name,
        type: source.type,
        target: source.target,
        url: source.url,
        enabled: source.enabled ?? true,
        priority: source.priority ?? 50,
        language: source.language,
        region: source.region,
        category: source.category,
        frequencyMins: source.frequencyMins ?? 1440,
        config: json(source.config || {}),
      },
      create: {
        name: source.name,
        slug: source.slug,
        type: source.type,
        target: source.target,
        url: source.url,
        enabled: source.enabled ?? true,
        priority: source.priority ?? 50,
        language: source.language,
        region: source.region,
        category: source.category,
        frequencyMins: source.frequencyMins ?? 1440,
        config: json(source.config || {}),
      },
    })
    count++
  }
  return count
}

async function collectRss(source: any): Promise<RawItem[]> {
  if (!source.url) return []
  const config = parseJson<Record<string, any>>(source.config, {})
  const limit = Math.min(Number(config.limit || 30), 80)
  const timeoutMs = Math.max(10000, Math.min(Number(config.timeoutMs || 45000), 90000))
  let feed: any
  try {
    const xml = await fetchPublicText(source.url, timeoutMs, 'rss')
    feed = await rssParser.parseString(xml)
  } catch (error) {
    if (!config.lenientXml) throw error
    const xml = await fetchPublicText(source.url, timeoutMs, 'rss')
    const itemMatches = Array.from(xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)).slice(0, limit)
    return itemMatches.map(match => {
      const block = match[0]
      const read = (tag: string) => {
        const tagMatch = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
        return cleanText((tagMatch?.[1] || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'))
      }
      const link = read('link') || read('guid')
      const publishedAt = safeDate(read('pubDate') || read('dc:date') || read('published'))
      const content = cleanText(read('description') || read('content:encoded'))
      return {
        type: 'news',
        title: read('title'),
        sourceName: source.name,
        sourceUrl: link,
        canonicalUrl: link,
        publishedAt,
        summary: content.slice(0, 420),
        language: source.language,
        region: source.region,
        category: source.category,
        tags: [source.category, source.region, source.language, 'AI 资讯'].filter(Boolean),
        contentSnippet: content.slice(0, 1600),
        rawData: { parser: 'lenient-rss', sourceUrl: source.url },
      } satisfies RawItem
    }).filter(item => item.title && item.sourceUrl)
  }
  return (feed.items || []).slice(0, limit).map((item: any) => {
    const content = cleanText((item as any)['content:encoded'] || item.content || item.summary || item.contentSnippet || '')
    const publishedAt = safeDate(item.isoDate || item.pubDate || (item as any).published || (item as any).updated)
    return {
      type: 'news',
      title: cleanText(item.title || ''),
      sourceName: source.name,
      author: authorString(item.creator || item.author),
      sourceUrl: item.link || item.guid,
      canonicalUrl: item.link || item.guid,
      publishedAt,
      summary: cleanText(item.contentSnippet || item.summary || content).slice(0, 420),
      language: source.language,
      region: source.region,
      category: source.category,
      tags: [source.category, source.region, source.language, 'AI 资讯'].filter(Boolean),
      contentSnippet: content.slice(0, 1600),
      rawData: item as any,
    } satisfies RawItem
  }).filter((item: RawItem) => item.title && item.sourceUrl)
}

function githubHeaders() {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'AIHub-Scrapling-Collector/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  return headers
}

async function collectGithub(source: any): Promise<RawItem[]> {
  const config = parseJson<Record<string, any>>(source.config, {})
  const query = config.query || `${config.topic ? `topic:${config.topic}` : 'ai'} stars:>${config.minStars || 100}`
  const direction = config.direction || source.category || 'AI'
  const url = new URL('https://api.github.com/search/repositories')
  url.searchParams.set('q', query)
  url.searchParams.set('sort', config.sort || 'stars')
  url.searchParams.set('order', config.order || 'desc')
  url.searchParams.set('per_page', String(Math.min(Number(config.perPage || 100), 100)))

  const response = await fetch(url, { headers: githubHeaders() })
  if (!response.ok) throw new Error(`GitHub API ${response.status}`)
  const data = await response.json()
  const repositories = []
  for (const repo of data.items || []) {
    repositories.push(await fetchGithubRepoInfo(repo.full_name, repo))
  }

  return repositories.filter(Boolean).map((repo: any) => ({
    type: 'github',
    title: repo.full_name,
    sourceName: 'GitHub',
    author: repo.owner?.login,
    sourceUrl: repo.html_url,
    canonicalUrl: repo.html_url,
    publishedAt: repo.updated_at ? new Date(repo.updated_at) : null,
    summary: repo.description || `${repo.full_name} open-source AI project`,
    language: repo.language || source.language,
    region: 'global',
    category: direction,
    tags: ['GitHub', direction, repo.language, ...(repo.topics || [])].filter(Boolean),
    contentSnippet: `${repo.full_name}: ${repo.description || ''}`,
    rawData: {
      repo: repo.full_name,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      language: repo.language,
      topics: repo.topics || [],
      updatedAt: repo.updated_at,
      homepage: repo.homepage,
      query,
    },
  } satisfies RawItem))
}

function resolveSiteUrl(baseUrl: string, href?: string) {
  if (!href) return undefined
  try {
    return new URL(href, baseUrl).toString()
  } catch {
    return href
  }
}

function parseBridgeOutput(output: string) {
  const text = output.trim()
  if (!text) throw new Error('Scrapling bridge returned empty output')
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1))
    }
    throw new Error(`Scrapling bridge returned non-JSON output: ${text.slice(0, 240)}`)
  }
}

function elapsedSeconds(startedAt: number) {
  return Math.max(0, Math.round((Date.now() - startedAt) / 1000))
}

async function runStreamingPython(
  pythonPath: string,
  args: string[],
  options: {
    label: string
    timeoutMs: number
    heartbeatMs?: number
  },
): Promise<{ status: number | null; signal: string | null; stdout: string; stderr: string; timedOut: boolean }> {
  const startedAt = Date.now()
  const child = spawn(pythonPath, args, {
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  let stdout = ''
  let stderr = ''
  let timedOut = false

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')

  child.stdout.on('data', chunk => {
    stdout += chunk
  })

  child.stderr.on('data', chunk => {
    stderr += chunk
    process.stderr.write(chunk)
  })

  const heartbeat = setInterval(() => {
    console.warn(`[${options.label}] still crawling elapsed=${elapsedSeconds(startedAt)}s pid=${child.pid || '-'}`)
  }, options.heartbeatMs || 10000)

  const timeout = setTimeout(() => {
    timedOut = true
    console.warn(`[${options.label}] timeout after ${elapsedSeconds(startedAt)}s; stopping crawler pid=${child.pid || '-'}`)
    if (child.pid && process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      child.kill('SIGTERM')
    }
  }, options.timeoutMs)

  return new Promise(resolve => {
    child.on('error', error => {
      stderr += error.message
    })

    child.on('close', (status, signal) => {
      clearInterval(heartbeat)
      clearTimeout(timeout)
      resolve({
        status,
        signal,
        stdout,
        stderr,
        timedOut,
      })
    })
  })
}

function acceptHeaderFor(kind: 'html' | 'rss' | 'json' = 'html') {
  if (kind === 'rss') return 'application/rss+xml,application/atom+xml,application/xml,text/xml,text/html;q=0.9,*/*;q=0.8'
  if (kind === 'json') return 'application/json,text/plain;q=0.9,*/*;q=0.8'
  return 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8'
}

async function fetchTextWithTimeout(url: string, timeoutMs = 30000, kind: 'html' | 'rss' | 'json' = 'html') {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: acceptHeaderFor(kind),
        'User-Agent': 'AIHub-Skill-Collector/1.0',
      },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.text()
  } finally {
    clearTimeout(timeout)
  }
}

function fetchTextWithNodeHttp(url: string, timeoutMs = 45000, kind: 'html' | 'rss' | 'json' = 'html') {
  return new Promise<string>((resolve, reject) => {
    const parsed = new URL(url)
    const requestImpl = parsed.protocol === 'http:' ? httpRequest : httpsRequest
    const req = requestImpl(parsed, {
      timeout: timeoutMs,
      headers: {
        Accept: acceptHeaderFor(kind),
        'Accept-Encoding': 'identity',
        'User-Agent': 'AIHub-Skill-Collector/1.0',
      },
    }, res => {
      if ((res.statusCode || 0) >= 300 && (res.statusCode || 0) < 400 && res.headers.location) {
        res.resume()
        fetchTextWithNodeHttp(new URL(res.headers.location, url).toString(), timeoutMs, kind).then(resolve, reject)
        return
      }
      if ((res.statusCode || 0) >= 400) {
        res.resume()
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }

      res.setEncoding('utf8')
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => resolve(body))
    })
    req.on('timeout', () => req.destroy(new Error(`Request timed out after ${timeoutMs}ms`)))
    req.on('error', reject)
    req.end()
  })
}

async function fetchPublicText(url: string, timeoutMs = 45000, kind: 'html' | 'rss' | 'json' = 'html') {
  try {
    return await fetchTextWithTimeout(url, Math.min(timeoutMs, 45000), kind)
  } catch (error) {
    console.warn(`[collector] fetch fallback for ${url}: ${(error as Error).message}`)
  }

  if (process.platform === 'win32') {
    try {
      return execFileSync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        [
          `$ProgressPreference='SilentlyContinue'`,
          `$headers=@{Accept=${JSON.stringify(acceptHeaderFor(kind))};'User-Agent'='AIHub-Skill-Collector/1.0'}`,
          `(Invoke-WebRequest -UseBasicParsing -Uri ${JSON.stringify(url)} -Headers $headers -TimeoutSec ${Math.max(5, Math.ceil(timeoutMs / 1000))}).Content`,
        ].join('; '),
      ], {
        encoding: 'utf8',
        timeout: timeoutMs + 5000,
        maxBuffer: 32 * 1024 * 1024,
      })
    } catch (error) {
      console.warn(`[collector] PowerShell fetch fallback for ${url}: ${(error as Error).message}`)
    }
  }

  return fetchTextWithNodeHttp(url, timeoutMs, kind)
}

async function fetchPublicHtml(url: string, timeoutMs = 45000) {
  try {
    return await fetchPublicText(url, timeoutMs, 'html')
  } catch (error) {
    console.warn(`[skills.sh] fetch fallback for ${url}: ${(error as Error).message}`)
    return fetchTextWithNodeHttp(url, timeoutMs, 'html')
  }
}

async function collectSiteList(source: any): Promise<RawItem[]> {
  if (!source.url) return []
  const config = parseJson<Record<string, any>>(source.config, {})
  const pythonPath = scraplingPythonPath()
  const bridge = path.join(process.cwd(), 'scripts', 'scrapling_site_bridge.py')
  const result = spawnSync(pythonPath, [
    bridge,
    '--url',
    source.url,
    '--item-selector',
    String(config.itemSelector || 'article, .post, .item, li'),
    '--title-selector',
    String(config.titleSelector || 'h1, h2, h3, a'),
    '--link-selector',
    String(config.linkSelector || 'a'),
    '--summary-selector',
    String(config.summarySelector || 'p'),
    '--limit',
    String(config.limit || 20),
  ], { encoding: 'utf8' })

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'Scrapling bridge failed')
  }

  const parsed = parseBridgeOutput(result.stdout)
  if (!parsed.ok) throw new Error(parsed.error || 'Scrapling bridge failed')

  return (parsed.items || []).map((item: any) => {
    const url = resolveSiteUrl(source.url, item.url)
    return {
      type: source.target === 'github' ? 'github' : 'news',
      title: cleanText(item.title),
      sourceName: source.name,
      sourceUrl: url,
      canonicalUrl: url,
      publishedAt: null,
      summary: cleanText(item.summary).slice(0, 420),
      language: source.language,
      region: source.region,
      category: source.category,
      tags: [source.category, 'Scrapling'].filter(Boolean),
      contentSnippet: cleanText(item.summary).slice(0, 1200),
      rawData: { scraper: 'scrapling', item },
    } satisfies RawItem
  }).filter((item: RawItem) => item.title)
}

async function collectSkillSiteList(source: any): Promise<RawItem[]> {
  const items = await collectSiteList(source)
  return items.filter(item => isLikelySkillName(item.title)).map(item => ({
    ...item,
    type: 'skill',
    category: classifySkillZh(`${item.title} ${item.summary || ''} ${source.category || ''}`, source.category || '外部 Skill 市场'),
    tags: ['Skill', 'Scrapling', source.name, ...(item.tags || [])].filter(Boolean),
    rawData: {
      ...(item.rawData || {}),
      sourceKind: 'skill-site-list',
    },
  }))
}

function aiShortStatePath(config: Record<string, any>) {
  const stateFile = String(config.stateFile || '.collector-state/aishort-prompts.json')
  return path.isAbsolute(stateFile) ? stateFile : path.join(process.cwd(), stateFile)
}

function aiShortPromptUrl(baseUrl: string, id?: string | number | null) {
  const promptId = firstString(id)
  if (!promptId) return baseUrl
  return resolveSiteUrl(baseUrl, `/community-prompt?id=${encodeURIComponent(promptId)}`) || baseUrl
}

function aiShortPromptData(record: any) {
  if (!record || typeof record !== 'object') return {}
  if (record.attributes && typeof record.attributes === 'object') {
    return { id: record.id, ...record.attributes }
  }
  return record
}

function aiShortPromptToRawItem(record: any, source: any): RawItem | null {
  const data = aiShortPromptData(record)
  const id = firstString(data.id, record?.id)
  const title = cleanText(firstString(data.title, data.name)).slice(0, 260)
  const description = cleanText(firstString(data.description, data.prompt, data.content, data.text))
  const remark = cleanText(firstString(data.remark, data.notes, data.note))
  const promptText = description || remark
  if (!title || !promptText) return null

  const owner = data.owner || data.user || data.author || data.creator
  const author = authorString(owner)
  const detailUrl = aiShortPromptUrl(source.url || 'https://www.aishort.top/community-prompts', id)
  const upvotes = toNumber(data.upvotes)
  const downvotes = toNumber(data.downvotes)
  const votes = toNumber(data.upvoteDifference, upvotes - downvotes)
  const category = classifyPromptIndustry(`${title} ${description} ${remark}`, source.category || '通用提示词')
  const tags = Array.from(new Set(['Prompt', '提示词', 'AiShort', category, source.category].filter(Boolean))).slice(0, 12)
  const summarySource = remark && remark !== description ? `${remark}\n${description}` : description

  return {
    type: 'prompt',
    title,
    sourceName: source.name,
    author,
    sourceUrl: detailUrl,
    canonicalUrl: `aishort:prompt:${id || fingerprint(`${title}:${promptText}`).slice(0, 12)}`,
    publishedAt: safeDate(data.createdAt || data.updatedAt),
    summary: cleanText(summarySource).slice(0, 800),
    language: source.language || 'zh',
    region: source.region || 'cn',
    category,
    tags,
    contentSnippet: cleanText(summarySource).slice(0, 2400),
    rawData: {
      externalId: id,
      parser: 'aishort-api',
      sourceSite: 'aishort.top',
      votes,
      upvotes,
      downvotes,
      upvoteDifference: data.upvoteDifference,
      promptLength: data.promptLength,
      descriptionHash: data.descriptionHash,
      share: data.share,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      author,
      owner,
      detailUrl,
      apiRecord: data,
    },
  }
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number, init: RequestInit = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
        'User-Agent': 'AIHub-Prompt-Collector/1.0',
        Referer: 'https://www.aishort.top/community-prompts',
        ...(init.headers || {}),
      },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

function aiShortSorts(config: Record<string, any>) {
  const sorts = Array.isArray(config.sorts) && config.sorts.length > 0
    ? config.sorts
    : [
      { field: 'id', order: 'desc' },
      { field: 'upvoteDifference', order: 'desc' },
      { field: 'updatedAt', order: 'desc' },
    ]
  return sorts
    .map((sort: any) => ({
      field: firstString(sort?.field, sort).replace(/[^\w]/g, '') || 'id',
      order: /^asc$/i.test(firstString(sort?.order)) ? 'asc' : 'desc',
    }))
    .filter((sort: any) => sort.field)
}

function aiShortListUrl(apiBase: string, page: number, pageSize: number, sort: { field: string; order: string }, query?: string) {
  const url = new URL(`${apiBase.replace(/\/$/, '')}/userprompts`)
  url.searchParams.set('pagination[withCount]', 'true')
  url.searchParams.set('pagination[page]', String(page))
  url.searchParams.set('pagination[pageSize]', String(pageSize))
  url.searchParams.set('sort', `${sort.field}:${sort.order}`)
  if (query) {
    url.searchParams.set('filters[$or][0][description][$containsi]', query)
    url.searchParams.set('filters[$or][1][title][$containsi]', query)
    url.searchParams.set('filters[$or][2][remark][$containsi]', query)
  }
  return url.toString()
}

function aiShortListIds(payload: any) {
  const data = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []
  return data.map((item: any) => firstString(item?.id, item?.attributes?.id)).filter(Boolean)
}

function aiShortModeKey(sort: { field: string; order: string }, query?: string) {
  return `${sort.field}:${sort.order}|${query || ''}`
}

const crawlerStrictCoreTerms = [
  'scrapling',
  'd4vinci/scrapling',
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

const crawlerStrictAutomationTerms = [
  'playwright',
  'selenium',
  'browser automation',
  'httpx',
  'aiohttp',
]

const crawlerStrictContextTerms = [
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

const cybersecurityStrictTerms = [
  'shannon',
  'keygraphhq/shannon',
  'unicodeveloper/shannon',
  'hacker',
  'hacker skills',
  'ai pentester',
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

const strictTopicExclusions = [
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
]

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

function topicTextContains(text: string, keyword: string) {
  const normalized = keyword.trim().toLowerCase()
  return normalized ? text.includes(normalized) : false
}

function topicTextContainsAny(text: string, keywords: string[]) {
  return keywords.some(keyword => topicTextContains(text, keyword))
}

function rawItemTopicText(item: RawItem) {
  const raw = (item.rawData || {}) as Record<string, any>
  const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
  return cleanText([
    item.title,
    item.summary,
    item.contentSnippet,
    item.category,
    ...(item.tags || []),
    item.sourceUrl,
    item.canonicalUrl,
    raw.repo,
    raw.file,
    raw.repoUrl,
    raw.githubUrl,
    github.repo,
    github.skillPath,
    github.description,
    Array.isArray(github.topics) ? github.topics.join(' ') : '',
  ].filter(Boolean).join(' ')).toLowerCase()
}

function rawItemHasGithubSource(item: RawItem) {
  return Boolean(rawItemGithubRepoKey(item))
}

function rawItemGithubRepoKey(item: RawItem) {
  const raw = (item.rawData || {}) as Record<string, any>
  const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
  return normalizeGithubRepoKey(firstString(
    raw.installRepo,
    github.installRepo,
    github.repo ||
    raw.repo,
    raw.sourceRepo,
    raw.source,
    githubRepoFromUrl(String(item.sourceUrl || '')),
    githubRepoFromUrl(String(item.canonicalUrl || '')),
    githubRepoFromUrl(String(raw.repoUrl || '')),
    githubRepoFromUrl(String(raw.githubUrl || '')),
  ))
}

function isAggregateSkillRepoName(repo?: string | null) {
  const normalized = normalizeGithubRepoKey(repo)
  if (!normalized) return false
  const repoName = normalized.split('/')[1]?.toLowerCase() || normalized.toLowerCase()
  if (repoName === 'skills') return true
  if (repoName.endsWith('-skills') || repoName.endsWith('_skills')) return true
  return aggregateSkillRepoNameKeywords.some(keyword => repoName.includes(keyword))
}

function rawItemMatchesStrictTopic(item: RawItem, sourceSlug: string) {
  const haystack = rawItemTopicText(item)
  const repo = rawItemGithubRepoKey(item)
  if (!repo) return false
  if (isPlaceholderGithubRepo(repo)) return false
  if (isAggregateSkillRepoName(repo) || isAggregateSkillRepo(repo, item.rawData as Record<string, any>)) return false
  if (topicTextContainsAny(haystack, strictTopicExclusions)) return false
  if (sourceSlug === 'github-python-crawler-skill-index') {
    if (topicTextContainsAny(haystack, crawlerStrictCoreTerms)) return true
    return topicTextContainsAny(haystack, crawlerStrictAutomationTerms) && topicTextContainsAny(haystack, crawlerStrictContextTerms)
  }
  if (sourceSlug === 'github-cybersecurity-skill-index') {
    return topicTextContainsAny(haystack, cybersecurityStrictTerms)
  }
  return true
}

function rawItemMatchesTopicKeywords(item: RawItem, config: Record<string, any>) {
  const sourceSlug = String(config.sourceSlug || '')
  if (sourceSlug === 'github-python-crawler-skill-index' || sourceSlug === 'github-cybersecurity-skill-index') {
    return rawItemMatchesStrictTopic(item, sourceSlug)
  }

  const keywords = Array.isArray(config.topicKeywords)
    ? config.topicKeywords.map((keyword: unknown) => cleanText(String(keyword)).toLowerCase()).filter(Boolean)
    : []
  if (keywords.length === 0) return true

  const raw = item.rawData || {}
  const haystack = cleanText([
    item.title,
    item.summary,
    item.contentSnippet,
    item.category,
    ...(item.tags || []),
    (raw as any).repo,
    (raw as any).file,
    (raw as any).github?.skillPath,
    (raw as any).github?.description,
  ].filter(Boolean).join(' ')).toLowerCase()
  const matchCount = keywords.reduce((count: number, keyword: string) => count + (haystack.includes(keyword) ? 1 : 0), 0)
  return matchCount >= Math.max(1, Math.min(Number(config.minTopicKeywordMatches || 1), 5))
}

const TOOL_CAPABILITY_STATE_FILE = '.collector-state/tool-capabilities.json'
const DEEPSEEK_GROWTH_PLAN_FILE = '.collector-state/deepseek-growth-plan.json'

type ToolCapabilityProfileLite = {
  generatedAt?: string
  skillCount?: number
  repoCount?: number
  codeQueries?: string[]
  repoQueries?: string[]
  topicKeywords?: string[]
  topKeywords?: Array<{ value?: string; count?: number }>
  toolHints?: string[]
}

type ToolCapabilityStateLite = {
  generatedAt?: string
  profiles?: Record<string, ToolCapabilityProfileLite>
}

type DeepSeekGrowthPlanLite = {
  generatedAt?: string
  skill?: {
    skillsShQueries?: string[]
    githubCodeQueries?: string[]
    githubRepoQueries?: string[]
  }
  prompts?: {
    queries?: string[]
  }
  news?: {
    topics?: string[]
  }
}

let toolCapabilityStateCache: ToolCapabilityStateLite | null | undefined
let deepSeekGrowthPlanCache: DeepSeekGrowthPlanLite | null | undefined

function compactStringList(values: unknown[], limit = 500) {
  const seen = new Set<string>()
  const list: string[] = []
  for (const value of values) {
    if (typeof value !== 'string' && typeof value !== 'number') continue
    const trimmed = String(value).trim().replace(/\s+/g, ' ')
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) continue
    seen.add(key)
    list.push(trimmed)
    if (list.length >= limit) break
  }
  return list
}

function loadToolCapabilityState(): ToolCapabilityStateLite | null {
  if (toolCapabilityStateCache !== undefined) return toolCapabilityStateCache
  const statePath = path.join(process.cwd(), TOOL_CAPABILITY_STATE_FILE)
  if (!existsSync(statePath)) {
    toolCapabilityStateCache = null
    return toolCapabilityStateCache
  }
  try {
    toolCapabilityStateCache = JSON.parse(readFileSync(statePath, 'utf8')) as ToolCapabilityStateLite
    return toolCapabilityStateCache
  } catch {
    toolCapabilityStateCache = null
    return toolCapabilityStateCache
  }
}

function loadDeepSeekGrowthPlan(): DeepSeekGrowthPlanLite | null {
  if (deepSeekGrowthPlanCache !== undefined) return deepSeekGrowthPlanCache
  const statePath = path.join(process.cwd(), DEEPSEEK_GROWTH_PLAN_FILE)
  if (!existsSync(statePath)) {
    deepSeekGrowthPlanCache = null
    return deepSeekGrowthPlanCache
  }
  try {
    deepSeekGrowthPlanCache = JSON.parse(readFileSync(statePath, 'utf8')) as DeepSeekGrowthPlanLite
    return deepSeekGrowthPlanCache
  } catch {
    deepSeekGrowthPlanCache = null
    return deepSeekGrowthPlanCache
  }
}

function deepSeekSkillQueries(kind: 'skillsShQueries' | 'githubCodeQueries' | 'githubRepoQueries') {
  const plan = loadDeepSeekGrowthPlan()
  const values = plan?.skill?.[kind]
  return Array.isArray(values) ? compactStringList(values, 120) : []
}

function deepSeekPromptQueries() {
  const values = loadDeepSeekGrowthPlan()?.prompts?.queries
  return Array.isArray(values) ? compactStringList(values, 120) : []
}

function topicKeywordsFromCapabilityState(sourceSlug?: string | null) {
  const profile = loadToolCapabilityState()?.profiles?.[String(sourceSlug || '')]
  if (!profile) return []
  return compactStringList([
    ...(Array.isArray(profile.topicKeywords) ? profile.topicKeywords : []),
    ...(Array.isArray(profile.topKeywords) ? profile.topKeywords.map(item => item?.value || '') : []),
    ...(Array.isArray(profile.toolHints) ? profile.toolHints : []),
  ], 160)
}

function enhancedGithubSkillConfig(
  sourceSlug: string,
  config: Record<string, any>,
): { config: Record<string, any>; profile: ToolCapabilityProfileLite | null } {
  const profile = loadToolCapabilityState()?.profiles?.[sourceSlug]
  if (!profile) return { config, profile: null as ToolCapabilityProfileLite | null }

  const codeQueryLimit = Math.max(20, Math.min(Number(config.capabilityCodeQueryLimit || 220), 600))
  const repoQueryLimit = Math.max(10, Math.min(Number(config.capabilityRepoQueryLimit || 140), 400))
  const topicKeywordLimit = Math.max(20, Math.min(Number(config.capabilityTopicKeywordLimit || 160), 300))

  const nextConfig: Record<string, any> = {
    ...config,
    codeQueries: compactStringList([
      ...(Array.isArray(config.codeQueries) ? config.codeQueries : []),
      ...(Array.isArray(profile.codeQueries) ? profile.codeQueries : []),
      ...deepSeekSkillQueries('githubCodeQueries'),
    ], codeQueryLimit),
    repoQueries: compactStringList([
      ...(Array.isArray(config.repoQueries) ? config.repoQueries : []),
      ...(Array.isArray(profile.repoQueries) ? profile.repoQueries : []),
      ...deepSeekSkillQueries('githubRepoQueries'),
    ], repoQueryLimit),
    topicKeywords: compactStringList([
      ...(Array.isArray(config.topicKeywords) ? config.topicKeywords : []),
      ...(Array.isArray(profile.topicKeywords) ? profile.topicKeywords : []),
    ], topicKeywordLimit),
  }

  return { config: nextConfig, profile }
}

async function fetchAiShortPromptDetails(apiBase: string, ids: string[], timeoutMs: number) {
  if (ids.length === 0) return []
  const payload = await fetchJsonWithTimeout(`${apiBase.replace(/\/$/, '')}/userprompts/bulk`, timeoutMs, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: ids.map(id => Number.isFinite(Number(id)) ? Number(id) : id) }),
  })
  return Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : []
}

async function collectAiShortPromptsApi(source: any, config: Record<string, any>, timeoutMs: number): Promise<RawItem[]> {
  const apiBase = String(config.apiBase || 'https://api.newzone.top/api')
  const pageSize = Math.max(1, Math.min(Number(config.pageSize || 100), 100))
  const maxTotal = Math.max(1, Math.min(Number(config.maxTotal || config.limit || 5000), 50000))
  const maxPagesPerMode = Math.max(1, Math.min(Number(config.maxPagesPerMode || Math.ceil(maxTotal / pageSize)), 500))
  const queryMaxPages = Math.max(0, Math.min(Number(config.queryMaxPages || 0), 100))
  const bulkSize = Math.max(1, Math.min(Number(config.bulkSize || pageSize), 100))
  const requestDelayMs = Math.max(0, Math.min(Number(config.requestDelayMs || 0), 10000))
  const statePath = aiShortStatePath(config)
  const state = parseJson<Record<string, any>>(existsSync(statePath) ? readFileSync(statePath, 'utf8') : '', {})
  const seenIds = new Set<string>((Array.isArray(state.seenIds) ? state.seenIds : []).map((id: unknown) => String(id)))
  const runIds = new Set<string>()
  const items: RawItem[] = []
  const modeStats: Array<Record<string, unknown>> = []
  const cursors = (state.cursors && typeof state.cursors === 'object' ? state.cursors : {}) as Record<string, any>
  const nextCursors: Record<string, any> = { ...cursors }
  const sorts = aiShortSorts(config)
  const queries = compactStringList([
    ...(Array.isArray(config.queries) ? config.queries : []),
    ...deepSeekPromptQueries(),
  ], 260)
  let totalAvailable = toNumber(state.totalAvailable)
  let apiPages = 0
  let bulkRequests = 0
  let listRequests = 0

  async function collectPageMode(sort: { field: string; order: string }, pages: number, query?: string) {
    const modeKey = aiShortModeKey(sort, query)
    const cursor = cursors[modeKey] || {}
    let modeNewIds = 0
    let modeParsed = 0
    let lastPage = 0
    let pageCount = Math.max(toNumber(cursor.pageCount), pages)
    const startPage = Math.max(1, toNumber(cursor.nextPage, 1))

    for (let offset = 0; offset < pages; offset++) {
      if (items.length >= maxTotal) break
      let page = startPage + offset
      if (pageCount > 0 && page > pageCount) page = ((page - 1) % pageCount) + 1
      const listPayload = await fetchJsonWithTimeout(aiShortListUrl(apiBase, page, pageSize, sort, query), timeoutMs)
      listRequests++
      apiPages++
      lastPage = page
      const pagination = listPayload?.meta?.pagination || {}
      totalAvailable = Math.max(totalAvailable, toNumber(pagination.total))
      pageCount = Math.max(1, toNumber(pagination.pageCount, pageCount))
      const ids: string[] = aiShortListIds(listPayload)
      const freshIds = ids.filter((id: string) => !seenIds.has(id) && !runIds.has(id))
      ids.forEach((id: string) => seenIds.add(id))
      freshIds.forEach((id: string) => runIds.add(id))
      modeNewIds += freshIds.length

      for (let index = 0; index < freshIds.length && items.length < maxTotal; index += bulkSize) {
        const chunk = freshIds.slice(index, index + bulkSize)
        const details = await fetchAiShortPromptDetails(apiBase, chunk, timeoutMs)
        bulkRequests++
        for (const detail of details) {
          if (items.length >= maxTotal) break
          const item = aiShortPromptToRawItem(detail, source)
          if (!item) continue
          items.push(item)
          modeParsed++
        }
        if (requestDelayMs > 0) await sleep(requestDelayMs)
      }

      if (ids.length === 0 || page >= pageCount) break
      if (requestDelayMs > 0) await sleep(requestDelayMs)
    }

    nextCursors[modeKey] = {
      nextPage: pageCount > 0 ? (lastPage % pageCount) + 1 : 1,
      pageCount,
      query: query || '',
      sort: `${sort.field}:${sort.order}`,
      updatedAt: new Date().toISOString(),
    }

    modeStats.push({
      sort: `${sort.field}:${sort.order}`,
      query: query || '',
      startPage,
      pages: lastPage,
      pageCount,
      newIds: modeNewIds,
      parsed: modeParsed,
    })
  }

  for (const sort of sorts) {
    if (items.length >= maxTotal) break
    await collectPageMode(sort, maxPagesPerMode)
  }

  if (queryMaxPages > 0 && items.length < maxTotal) {
    const querySortCount = Math.max(1, Math.min(Number(config.querySortCount || 1), sorts.length))
    for (const query of queries) {
      if (items.length >= maxTotal) break
      for (const sort of sorts.slice(0, querySortCount)) {
        if (items.length >= maxTotal) break
        await collectPageMode(sort, queryMaxPages, query)
      }
    }
  }

  const stateSeenLimit = Math.max(1000, Math.min(Number(config.stateSeenLimit || 100000), 500000))
  await fs.mkdir(path.dirname(statePath), { recursive: true }).catch(() => undefined)
  await fs.writeFile(statePath, JSON.stringify({
    sourceSlug: source.slug,
    parser: 'aishort-api',
    apiBase,
    totalAvailable,
    collectedCount: items.length,
    seenCount: seenIds.size,
    apiPages,
    listRequests,
    bulkRequests,
    modes: modeStats,
    cursors: nextCursors,
    seenIds: Array.from(seenIds).slice(-stateSeenLimit),
    updatedAt: new Date().toISOString(),
    lastError: null,
  }, null, 2), 'utf8')

  console.log(JSON.stringify({
    stage: 'aishort-api',
    totalAvailable,
    collected: items.length,
    seenCount: seenIds.size,
    apiPages,
    bulkRequests,
  }))

  return items
}

async function collectAiShortPromptsFromHtml(source: any): Promise<RawItem[]> {
  if (!source.url) return []
  const config = parseJson<Record<string, any>>(source.config, {})
  const limit = Math.min(Number(config.limit || 80), 200)
  const timeoutMs = Math.max(10000, Math.min(Number(config.timeoutMs || 45000), 90000))
  const html = await fetchPublicHtml(source.url, timeoutMs)
  const $ = cheerio.load(html)
  const items: RawItem[] = []
  const seen = new Set<string>()

  $('a[href^="/community-prompt?id="], a[href*="/community-prompt?id="]').each((_, link) => {
    if (items.length >= limit) return false
    const anchor = $(link)
    const detailPath = firstString(anchor.attr('href'))
    const sourceUrl = resolveSiteUrl(source.url, detailPath) || source.url
    const id = new URL(sourceUrl).searchParams.get('id') || detailPath.match(/id=(\d+)/)?.[1] || ''
    const card = anchor.closest('.ant-card')
    if (!card.length) return

    const title = cleanText(anchor.text())
    const author = cleanText(card.find('[aria-label="user"]').parent().text())
    const promptText = cleanText(
      card.find('.ant-card-body div.ant-typography.ant-typography-ellipsis-multiple-line')
        .filter((__, node) => cleanText($(node).text()) !== title)
        .last()
        .text(),
    )
    const voteText = cleanText(card.find('[aria-label="up"]').closest('button').text())
    const votes = toNumber(voteText)
    const key = id || normalizeUrl(sourceUrl) || `${title}:${promptText.slice(0, 80)}`
    if (!title || !promptText || seen.has(key)) return
    seen.add(key)

    const category = classifyPromptIndustry(`${title} ${promptText}`)
    const tags = Array.from(new Set(['Prompt', '提示词', category, source.category].filter(Boolean))).slice(0, 12)
    items.push({
      type: 'prompt',
      title,
      sourceName: source.name,
      author,
      sourceUrl,
      canonicalUrl: `aishort:prompt:${id || fingerprint(key).slice(0, 10)}`,
      publishedAt: null,
      summary: promptText.slice(0, 800),
      language: source.language || 'zh',
      region: source.region || 'cn',
      category,
      tags,
      contentSnippet: promptText.slice(0, 2400),
      rawData: {
        externalId: id,
        parser: 'aishort-community-prompts',
        sourceSite: 'aishort.top',
        votes,
        author,
        detailPath,
      },
    })
  })

  return items
}

async function collectAiShortPrompts(source: any): Promise<RawItem[]> {
  if (!source.url) return []
  const config = parseJson<Record<string, any>>(source.config, {})
  const timeoutMs = Math.max(10000, Math.min(Number(config.timeoutMs || 45000), 90000))

  if (config.apiBase !== false) {
    try {
      return await collectAiShortPromptsApi(source, config, timeoutMs)
    } catch (error) {
      const message = (error as Error).message
      console.warn(`[aishort] API collector failed, using public-page fallback: ${message}`)
      const statePath = aiShortStatePath(config)
      await fs.mkdir(path.dirname(statePath), { recursive: true }).catch(() => undefined)
      await fs.writeFile(statePath, JSON.stringify({
        parser: 'aishort-api',
        updatedAt: new Date().toISOString(),
        lastError: message,
      }, null, 2), 'utf8').catch(() => undefined)
    }
  }

  return collectAiShortPromptsFromHtml(source)
}

function promptSourceHost(value?: string | null) {
  if (!value) return ''
  try {
    return new URL(value).hostname.replace(/^www\./i, '')
  } catch {
    return ''
  }
}

function cleanMarkdownText(value = '') {
  return cleanText(value
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_>#|]/g, ' ')
    .replace(/^\s*[-+]\s+/gm, ' ')
  )
}

function promptConfigTags(config: Record<string, any>, source: any, extra: string[] = []) {
  const configured = Array.isArray(config.tags) ? config.tags.map((tag: unknown) => firstString(tag)).filter(Boolean) : []
  return Array.from(new Set([
    'Prompt',
    '提示词',
    source.category,
    ...configured,
    ...extra,
  ].filter(Boolean))).slice(0, 14)
}

function classifyPromptSourceCategory(text: string, fallback = '通用提示词源') {
  const value = text.toLowerCase()
  if (/promptbase|flowgpt|snack|hunt|market|community|社区|市场/.test(value)) return '提示词市场社区'
  if (/midjourney|stable diffusion|dall|image|art|绘图|绘画|生图|视觉|krea|openart/.test(value)) return '绘图提示词工具'
  if (/guide|tutorial|course|learning|wiki|教程|指南|工程|学习/.test(value)) return '提示工程教程'
  if (/generator|optimizer|perfect|helper|生成器|优化|改写/.test(value)) return '提示词生成与优化'
  if (/中文|chinese|chatgpt|fresns|k-render/.test(value)) return '中文提示词库'
  return fallback
}

function promptSiteOverviewItem(source: any, config: Record<string, any>, summary = ''): RawItem | null {
  if (!source.url) return null
  const host = promptSourceHost(source.url)
  const category = classifyPromptSourceCategory(`${source.name} ${source.category} ${host} ${summary}`, source.category || '通用提示词源')
  const overviewSummary = cleanText(firstString(
    config.overviewSummary,
    summary,
    `${source.name} 是从 ai-tishici README 同步的提示词源，可作为后续行业提示词、Prompt 教程或绘图提示词采集入口。`,
  )).slice(0, 800)

  return {
    type: 'prompt',
    title: `${source.name} 提示词源入口`,
    sourceName: source.name,
    author: firstString(config.sourceRepo),
    sourceUrl: source.url,
    canonicalUrl: `prompt-source:${source.slug}:${normalizeUrl(source.url) || source.url}`,
    publishedAt: null,
    summary: overviewSummary,
    language: source.language || 'multi',
    region: source.region || 'global',
    category,
    tags: promptConfigTags(config, source, [category, host, firstString(config.sourceKind)]),
    contentSnippet: overviewSummary,
    rawData: {
      parser: firstString(config.parser, 'generic-prompt-site'),
      sourceKind: firstString(config.sourceKind, 'prompt-source'),
      sourceSite: host,
      sourceRepo: firstString(config.sourceRepo),
      sourceRepoUrl: firstString(config.sourceRepoUrl),
      isOverview: true,
    },
  }
}

function parsePromptDirectoryMarkdown(source: any, markdown: string, config: Record<string, any>): RawItem[] {
  const lines = markdown.split(/\r?\n/)
  const items: RawItem[] = []
  const seen = new Set<string>()
  let section = source.category || '提示词源目录'

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const sectionMatch = line.match(/^##\s+(?:\d+[.、]\s*)?(.+?)\s*$/)
    if (sectionMatch) {
      section = cleanMarkdownText(sectionMatch[1]).replace(/\s*#.*$/, '').trim() || section
      continue
    }

    const linkMatch = line.match(/^###\s+\[([^\]]+)]\((https?:\/\/[^)\s]+)\)/)
    if (!linkMatch) continue
    const [, rawTitle, rawUrl] = linkMatch
    if (/github\.com\/user-attachments\//i.test(rawUrl)) continue
    const sourceUrl = normalizeUrl(rawUrl) || rawUrl
    if (seen.has(sourceUrl)) continue
    seen.add(sourceUrl)

    const blockLines: string[] = []
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      if (/^#{2,3}\s+/.test(lines[cursor])) break
      if (/^---+\s*$/.test(lines[cursor])) break
      blockLines.push(lines[cursor])
    }
    const block = blockLines.join('\n')
    const keywordsLine = blockLines.find(item => /关键词|关键字|keywords?/i.test(item)) || ''
    const highlightLine = blockLines.find(item => /亮点|特点|highlights?/i.test(item)) || ''
    const title = cleanMarkdownText(rawTitle).slice(0, 220)
    const host = promptSourceHost(sourceUrl)
    const summary = cleanMarkdownText(highlightLine || block || `${title} - ${host}`).slice(0, 800)
    const keywords = cleanMarkdownText(keywordsLine).split(/[、,，\s]+/).map(item => cleanText(item)).filter(item => item && !/关键词|关键字|keywords?/i.test(item)).slice(0, 12)
    const category = classifyPromptSourceCategory(`${section} ${title} ${host} ${keywords.join(' ')}`, source.category || '提示词源目录')
    const key = `${source.slug}:${sourceUrl}`

    items.push({
      type: 'prompt',
      title,
      sourceName: source.name,
      author: firstString(config.sourceRepo),
      sourceUrl,
      canonicalUrl: `prompt-directory:${fingerprint(key).slice(0, 16)}`,
      publishedAt: null,
      summary,
      language: source.language || 'multi',
      region: source.region || 'global',
      category,
      tags: promptConfigTags(config, source, [category, section, host, ...keywords]),
      contentSnippet: cleanMarkdownText(block).slice(0, 2200) || summary,
      rawData: {
        parser: 'prompt-directory-markdown',
        sourceKind: firstString(config.sourceKind, 'prompt-source-directory'),
        sourceSite: host,
        directoryCategory: section,
        directorySourceUrl: source.url,
        sourceRepo: firstString(config.sourceRepo),
        sourceRepoUrl: firstString(config.sourceRepoUrl),
        keywords,
      },
    })
  }

  return items
}

async function collectPromptDirectoryMarkdown(source: any): Promise<RawItem[]> {
  if (!source.url) return []
  const config = parseJson<Record<string, any>>(source.config, {})
  const timeoutMs = Math.max(10000, Math.min(Number(config.timeoutMs || 45000), 90000))
  const markdown = await fetchPublicText(source.url, timeoutMs, 'html')
  const limit = Math.max(1, Math.min(Number(config.limit || 80), 300))
  return parsePromptDirectoryMarkdown(source, markdown, config).slice(0, limit)
}

function promptItemFromHtmlElement($: cheerio.CheerioAPI, element: any, source: any, config: Record<string, any>, metaDescription: string, index: number): RawItem | null {
  const node = $(element)
  const anchor = node.is('a[href]') ? node : node.find('a[href]').first()
  const href = firstString(anchor.attr('href'), node.attr('href'), node.attr('data-href'))
  const sourceUrl = resolveSiteUrl(source.url, href) || source.url
  if (!sourceUrl || /^(javascript|mailto|tel):/i.test(sourceUrl)) return null
  if (/#(login|signup|pricing|privacy|terms|contact|about)$/i.test(sourceUrl)) return null

  const title = cleanText(firstString(
    node.find('h1,h2,h3,h4,[class*="title"],[class*="name"]').first().text(),
    anchor.text(),
    node.attr('aria-label'),
    node.attr('title'),
  )).slice(0, 220)
  if (!title || title.length < 3) return null
  if (/^(home|login|sign up|pricing|docs|blog|about|contact|privacy|terms|twitter|github)$/i.test(title)) return null

  const summary = cleanText(firstString(
    node.find('p,[class*="desc"],[class*="summary"],[class*="subtitle"],[class*="content"]').first().text(),
    node.text(),
    metaDescription,
  )).slice(0, 800)
  if (!summary || summary.length < 8) return null

  const host = promptSourceHost(sourceUrl || source.url)
  const category = classifyPromptSourceCategory(`${source.name} ${source.category} ${title} ${summary} ${host}`, source.category || '通用提示词源')

  return {
    type: 'prompt',
    title,
    sourceName: source.name,
    author: firstString(config.sourceRepo),
    sourceUrl,
    canonicalUrl: `prompt-site:${source.slug}:${normalizeUrl(sourceUrl) || fingerprint(`${title}:${index}`).slice(0, 12)}`,
    publishedAt: null,
    summary,
    language: source.language || 'multi',
    region: source.region || 'global',
    category,
    tags: promptConfigTags(config, source, [category, host, firstString(config.sourceKind)]),
    contentSnippet: summary,
    rawData: {
      parser: firstString(config.parser, 'generic-prompt-site'),
      sourceKind: firstString(config.sourceKind, 'prompt-site'),
      sourceSite: host,
      sourceRepo: firstString(config.sourceRepo),
      sourceRepoUrl: firstString(config.sourceRepoUrl),
      itemIndex: index,
    },
  }
}

async function collectGenericPromptSite(source: any): Promise<RawItem[]> {
  if (!source.url) return []
  const config = parseJson<Record<string, any>>(source.config, {})
  const timeoutMs = Math.max(10000, Math.min(Number(config.timeoutMs || 45000), 90000))
  const limit = Math.max(1, Math.min(Number(config.limit || 40), 120))

  if (config.rawReadmeUrl) {
    try {
      const markdown = await fetchPublicText(String(config.rawReadmeUrl), timeoutMs, 'html')
      const markdownItems = parsePromptDirectoryMarkdown(source, markdown, { ...config, parser: 'generic-prompt-readme' })
      if (markdownItems.length > 0) return markdownItems.slice(0, limit)
    } catch (error) {
      console.warn(`[prompt] README parser failed for ${source.slug}: ${(error as Error).message}`)
    }
  }

  const html = await fetchPublicHtml(source.url, timeoutMs)
  const $ = cheerio.load(html)
  $('script,style,noscript,svg').remove()
  const metaDescription = cleanText(firstString(
    $('meta[name="description"]').attr('content'),
    $('meta[property="og:description"]').attr('content'),
    $('title').text(),
  ))
  const selector = firstString(config.itemSelector, 'article, [class*="prompt"], [class*="card"], [class*="item"], main li, main a[href]')
  const items: RawItem[] = []
  const seen = new Set<string>()

  $(selector).each((index, element) => {
    if (items.length >= limit) return false
    const item = promptItemFromHtmlElement($, element, source, config, metaDescription, index)
    if (!item) return
    const key = normalizeUrl(item.sourceUrl) || `${item.title}:${item.summary}`
    if (seen.has(key)) return
    seen.add(key)
    items.push(item)
  })

  const overview = promptSiteOverviewItem(source, config, metaDescription)
  if (overview && !seen.has(normalizeUrl(overview.sourceUrl) || overview.title)) items.unshift(overview)
  return items.slice(0, limit)
}

async function collectPromptSite(source: any): Promise<RawItem[]> {
  const config = parseJson<Record<string, any>>(source.config, {})
  const parser = firstString(config.parser).toLowerCase()
  if (parser === 'aishort-community-prompts' || source.slug === 'prompt-aishort-community') return collectAiShortPrompts(source)
  if (parser === 'prompt-directory-markdown') return collectPromptDirectoryMarkdown(source)
  return collectGenericPromptSite(source)
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function authorString(value: unknown): string {
  if (typeof value === 'string') return cleanText(value)
  if (Array.isArray(value)) return value.map(authorString).find(Boolean) || ''
  if (value && typeof value === 'object') {
    const record = value as Record<string, any>
    return firstString(
      record.name,
      Array.isArray(record.name) ? record.name[0] : '',
      record.title,
      Array.isArray(record.title) ? record.title[0] : '',
      record.email,
      record.url,
    )
  }
  return ''
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function isGithubRepoKey(value?: string | null) {
  if (!value) return false
  const trimmed = value.trim().replace(/^\/+|\/+$/g, '')
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed)) return false
  if (trimmed.includes('..')) return false
  return true
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

function githubSkillTreeUrl(repo?: string | null, skillId?: string | null) {
  const key = normalizeGithubRepoKey(repo)
  const skillPath = String(skillId || '').trim().replace(/^\/+|\/+$/g, '')
  if (!key || !skillPath) return githubRepoUrl(key)
  const encodedPath = skillPath
    .split('/')
    .filter(Boolean)
    .map(part => encodeURIComponent(part))
    .join('/')
  return `https://github.com/${key}/tree/HEAD/skills/${encodedPath}`
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

function hasPreciseSkillSource(item: RawItem) {
  if (item.type !== 'skill') return true
  const raw = item.rawData || {}
  const sourceUrl = firstString(item.sourceUrl)
  if (!isPreciseSkillSourceUrl(sourceUrl)) return false
  const parser = firstString((raw as any).parser, (raw as any).collectorLabels?.parser)
  const sourcePrecision = firstString((raw as any).sourcePrecision, (raw as any).github?.sourcePrecision)
  if (sourcePrecision === 'readme-anchor') return false
  if (parser === 'markdown-list' && sourceUrl.includes('github.com') && !isConcreteGithubSkillSourceUrl(sourceUrl)) return false
  if (parser.includes('source-hint') && isGithubRepoHomeUrl(sourceUrl)) return false
  return true
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

const aggregateSkillRepoBlocklist = new Set([
  'agentspace-so/runcomfy-agent-skills',
  'agentspace-so/runcomfy-skills',
  'doany-ai/skills',
])

const aggregateSkillDescriptionKeywords = [
  'mirror',
  'mirrored',
  'unofficial',
  'third-party',
  'community collection',
  'curated collection',
  'collection of',
  'registry',
  'marketplace',
  'catalog',
  'awesome',
  'directory',
  'index of',
  '合集',
  '镜像',
  '搬运',
  '整理',
]

function githubReposFromText(text: string, currentRepo?: string | null) {
  const current = normalizeGithubRepoKey(currentRepo).toLowerCase()
  const repos: string[] = []
  const seen = new Set<string>()
  const pattern = /https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    const repo = normalizeGithubRepoKey(`${match[1]}/${match[2]}`)
    const key = repo.toLowerCase()
    if (!repo || key === current || seen.has(key)) continue
    if (['features', 'topics', 'marketplace', 'collections', 'trending', 'login', 'signup'].includes(match[1].toLowerCase())) continue
    seen.add(key)
    repos.push(repo)
  }
  return repos
}

function originalGithubFromText(text: string, currentRepo?: string | null) {
  const repo = githubReposFromText(text, currentRepo)[0]
  return repo ? { repo, url: githubRepoUrl(repo) } : null
}

function rawOriginalGithubRepo(raw: Record<string, any>) {
  return normalizeGithubRepoKey(firstString(
    raw.originalRepo,
    raw.originalGithubRepo,
    raw.sourceProjectRepo,
    raw.upstreamRepo,
    raw.github?.originalRepo,
    raw.github?.installRepo,
    githubRepoFromUrl(raw.originalGithubUrl),
    githubRepoFromUrl(raw.sourceProjectUrl),
    githubRepoFromUrl(raw.upstreamUrl),
    githubRepoFromUrl(raw.github?.originalGithubUrl),
    githubRepoFromUrl(raw.frontMatter?.homepage),
  ))
}

function rawSourceGithubRepo(raw: Record<string, any>, fallbackUrl?: string | null) {
  const nestedItem = raw.item && typeof raw.item === 'object' ? raw.item : {}
  const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
  return normalizeGithubRepoKey(firstString(
    raw.sourceRepo,
    raw.repo,
    raw.source,
    github.sourceRepo,
    github.repo,
    nestedItem.source,
    githubRepoFromUrl(fallbackUrl),
    githubRepoFromUrl(raw.githubUrl),
    githubRepoFromUrl(raw.github_url),
    githubRepoFromUrl(raw.repoUrl),
    githubRepoFromUrl(raw.repo_url),
    githubRepoFromUrl(github.repoUrl),
    githubRepoFromUrl(github.url),
    githubRepoFromUrl(nestedItem.githubUrl),
    githubRepoFromUrl(nestedItem.github_url),
    githubRepoFromUrl(nestedItem.html_url),
  ))
}

function rawSkillMdUrl(raw: Record<string, any>, fallbackUrl?: string | null) {
  const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
  return firstString(
    raw.skillMdUrl,
    raw.skillMdURL,
    raw.skillUrl,
    raw.githubUrl && !isGithubRepoHomeUrl(raw.githubUrl) ? raw.githubUrl : '',
    raw.github_url && !isGithubRepoHomeUrl(raw.github_url) ? raw.github_url : '',
    github.skillMdUrl,
    github.url && !isGithubRepoHomeUrl(github.url) ? github.url : '',
    fallbackUrl && fallbackUrl.includes('github.com') && !isGithubRepoHomeUrl(fallbackUrl) ? fallbackUrl : '',
  )
}

function rawInstallGithubRepo(raw: Record<string, any>, fallbackUrl?: string | null) {
  return normalizeGithubRepoKey(firstString(
    raw.installRepo,
    rawOriginalGithubRepo(raw),
    githubRepoFromUrl(raw.installGitUrl),
    githubRepoFromUrl(raw.github?.installGitUrl),
    rawSourceGithubRepo(raw, fallbackUrl),
  ))
}

function aggregateSkillRepoReason(repo?: string | null, raw?: Record<string, any> | null, groupSize = 0) {
  const key = normalizeGithubRepoKey(repo).toLowerCase()
  if (!key) return ''
  if (aggregateSkillRepoBlocklist.has(key)) return 'known third-party skill mirror'

  const [owner = '', repoName = ''] = key.split('/')
  if (repoName.includes('runcomfy') && !owner.startsWith('runcomfy')) {
    return 'repo name references RunComfy but owner is not the original RunComfy org'
  }

  const github = raw?.github && typeof raw.github === 'object' ? raw.github : {}
  const text = [
    repoName,
    github.description,
    raw?.description,
    raw?.repoDescription,
    raw?.frontMatter?.description,
  ].filter(Boolean).join(' ').toLowerCase()
  if (aggregateSkillDescriptionKeywords.some(keyword => text.includes(keyword))) {
    return 'repository metadata looks like an aggregate or mirror'
  }

  if (groupSize >= 30 && /(^|[-_])(awesome|collection|catalog|registry|marketplace|directory|index|mirror)([-_]|$)/i.test(repoName)) {
    return 'large skill set in collection-like repository'
  }

  return ''
}

function isAggregateSkillRepo(repo?: string | null, raw?: Record<string, any> | null, groupSize = 0) {
  return Boolean(aggregateSkillRepoReason(repo, raw, groupSize))
}

function githubRepoForSkillItem(item: RawItem) {
  if (item.type !== 'skill') return ''
  const raw = item.rawData || {}
  const nestedItem = (raw as any).item && typeof (raw as any).item === 'object' ? (raw as any).item : {}
  const repo = normalizeGithubRepoKey(firstString(
    rawOriginalGithubRepo(raw as Record<string, any>),
    githubRepoFromUrl(item.sourceUrl),
    githubRepoFromUrl(item.canonicalUrl),
    githubRepoFromUrl((raw as any).githubUrl),
    githubRepoFromUrl((raw as any).github_url),
    githubRepoFromUrl((raw as any).repoUrl),
    githubRepoFromUrl((raw as any).github?.repoUrl),
    (raw as any).github?.repo,
    (raw as any).repo,
    (raw as any).source,
    nestedItem.source,
  ))
  return isPlaceholderGithubRepo(repo) ? '' : repo
}

function githubMetricsForSkillItem(item: RawItem) {
  const raw = item.rawData || {}
  const nestedItem = (raw as any).item && typeof (raw as any).item === 'object' ? (raw as any).item : {}
  const github = (raw as any).github && typeof (raw as any).github === 'object' ? (raw as any).github : {}
  const stars = toNumber(github.stars ?? (raw as any).stars)
  const forks = toNumber(github.forks ?? (raw as any).forks)
  const releaseDownloads = toNumber(github.releaseDownloads)
  const installs = toNumber((raw as any).installs ?? nestedItem.installs)
  const weeklyInstalls = Array.isArray((raw as any).weeklyInstalls)
    ? (raw as any).weeklyInstalls.reduce((sum: number, value: unknown) => sum + toNumber(value), 0)
    : toNumber((raw as any).weeklyInstalls)
  const downloads = Math.max(releaseDownloads, installs, weeklyInstalls)
  return { stars, forks, downloads }
}

function hasGithubRepoSource(item: RawItem) {
  if (item.type !== 'skill') return true
  return Boolean(githubRepoForSkillItem(item))
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

function skillsShSourceInfo(item: any) {
  const parsedOfficial = parseOfficialSkillsUrl(firstString(item.url, item.detailUrl, item.sourceUrl, item.source_url))
  const sourceKey = normalizeGithubRepoKey(firstString(item.source, item.publisher, item.author, item.owner, parsedOfficial?.sourceKey))
  const skillKey = firstString(item.skillId, item.skill_id, item.slug, item.id, item.name, parsedOfficial?.skillKey)
  const marketplaceUrl = firstString(
    skillsShMarketplaceUrl(sourceKey, skillKey),
    parsedOfficial?.marketplaceUrl,
  )
  const githubUrl = firstString(item.githubUrl, item.github_url, githubSkillTreeUrl(sourceKey, skillKey))
  return { sourceKey, skillKey, marketplaceUrl, githubUrl, repoUrl: githubRepoUrl(sourceKey) }
}

function itemListFromApiPayload(payload: any) {
  if (Array.isArray(payload)) return payload
  for (const key of ['skills', 'data', 'items', 'results', 'records']) {
    if (Array.isArray(payload?.[key])) return payload[key]
  }
  if (Array.isArray(payload?.data?.items)) return payload.data.items
  if (Array.isArray(payload?.data?.skills)) return payload.data.skills
  return []
}

function nextPageFromApiPayload(payload: any, page: number) {
  return payload?.nextPage || payload?.next_page || payload?.pagination?.nextPage || payload?.meta?.nextPage || page + 1
}

function jsonFieldFromText(text: string, key: string) {
  const pattern = new RegExp(`"${key}"\\s*:\\s*("(?:\\\\.|[^"\\\\])*"|true|false|null|-?\\d+(?:\\.\\d+)?|\\[[^\\]]*\\])`, 's')
  const match = text.match(pattern)
  if (!match) return undefined
  try {
    return JSON.parse(match[1])
  } catch {
    return match[1].replace(/^"|"$/g, '')
  }
}

function parseSkillsShFlightItems(html: string, limit: number) {
  const items: any[] = []
  const seen = new Set<string>()
  const meta: Record<string, number> = {}

  for (const key of ['totalSkills', 'allTimeTotal']) {
    const match = html.match(new RegExp(`\\\\?"${key}\\\\?"\\s*:\\s*(\\d+)`))
    if (match) meta[key] = Number(match[1])
  }

  const objectPattern = /\{[^{}]{0,900}?"source"\s*:\s*"((?:\\.|[^"\\]){2,220})"[^{}]{0,900}?"skillId"\s*:\s*"((?:\\.|[^"\\]){1,220})"[^{}]{0,900}?"name"\s*:\s*"((?:\\.|[^"\\]){1,260})"[^{}]{0,1800}?\}/g
  let match: RegExpExecArray | null
  while ((match = objectPattern.exec(html))) {
    if (items.length >= limit) break
    const objectText = match[0]
    let candidate: any = null
    try {
      candidate = JSON.parse(objectText)
    } catch {
      const parseString = (value: string) => {
        try {
          return JSON.parse(`"${value}"`)
        } catch {
          return value
        }
      }
      candidate = {
        source: parseString(match[1]),
        skillId: parseString(match[2]),
        name: parseString(match[3]),
        description: jsonFieldFromText(objectText, 'description'),
        installs: jsonFieldFromText(objectText, 'installs'),
        weeklyInstalls: jsonFieldFromText(objectText, 'weeklyInstalls'),
        isOfficial: jsonFieldFromText(objectText, 'isOfficial'),
        url: jsonFieldFromText(objectText, 'url'),
      }
    }

    const sourceKey = normalizeGithubRepoKey(firstString(candidate?.source))
    const skillKey = firstString(candidate?.skillId)
    const name = cleanText(firstString(candidate?.name))
    if (!sourceKey || !skillKey || !name) continue

    const key = `${sourceKey.toLowerCase()}/${skillKey.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push({
      ...candidate,
      source: sourceKey,
      skillId: skillKey,
      name,
      detailUrl: skillsShMarketplaceUrl(sourceKey, skillKey),
      githubUrl: githubSkillTreeUrl(sourceKey, skillKey),
      repoUrl: githubRepoUrl(sourceKey),
      parser: 'skills-sh-next-flight',
    })
  }

  return { items, meta }
}

function normalizeSkillsShItem(item: any, source: any): RawItem | null {
  const rawSourceKey = firstString(item.source, item.publisher, item.author, item.owner)
  const sourceInfo = skillsShSourceInfo({ ...item, source: rawSourceKey })
  const sourceKey = sourceInfo.sourceKey || rawSourceKey
  const skillKey = firstString(item.skillId, item.skill_id, item.slug, item.id, item.name)
  const id = sourceKey && skillKey ? `${sourceKey}/${skillKey}` : firstString(item.id, item.skill_id, item.skillId, item.slug, item.name)
  const title = cleanText(firstString(item.name, item.title, item.slug, item.id))
  const description = cleanText(firstString(item.description, item.summary, item.readme, item.prompt, item.content)).slice(0, 800)
  if (!title || title.length < 2) return null

  const rawUrlCandidates = [
    item.html_url,
    item.github_url,
    item.githubUrl,
    item.sourceUrl,
    item.source_url,
    item.url,
    item.detailUrl,
  ].map(value => firstString(value)).filter(Boolean)
  const nonMarketplaceUrl = rawUrlCandidates.find(url => !parseOfficialSkillsUrl(url) && !/officialskills\.sh/i.test(url))
  const marketplaceUrl = firstString(sourceInfo.marketplaceUrl, rawUrlCandidates.find(url => /officialskills\.sh/i.test(url)))
  const sourceUrl = firstString(
    item.html_url,
    item.github_url,
    item.githubUrl,
    sourceInfo.githubUrl,
    nonMarketplaceUrl,
    id ? `${source.url || 'https://www.skills.sh'}/skills/${encodeURIComponent(id)}` : source.url,
  )
  const tags = Array.isArray(item.tags) ? item.tags.map(String) : Array.isArray(item.keywords) ? item.keywords.map(String) : []
  const semanticText = `${title} ${description} ${semanticTags(tags).join(' ')} ${item.category || ''}`
  const category = classifySkillZh(semanticText, firstString(item.category, source.category, '外部 Skill 市场'))

  return {
    type: 'skill',
    title,
    sourceName: source.name,
    sourceUrl,
    canonicalUrl: id ? `skills.sh:${id}` : sourceUrl,
    summary: description || title,
    language: firstString(item.language, source.language) || 'multi',
    region: source.region,
    category,
    tags: Array.from(new Set(['Skill', ...semanticTags(tags), category].filter(Boolean))).slice(0, 12),
    contentSnippet: description || title,
    rawData: {
      externalId: id,
      source: sourceKey,
      skillId: skillKey,
      githubUrl: sourceInfo.githubUrl || undefined,
      repoUrl: sourceInfo.repoUrl || undefined,
      marketplaceUrl: marketplaceUrl || undefined,
      officialskillsUrl: marketplaceUrl || undefined,
      installs: toNumber(item.installs),
      weeklyInstalls: toNumber(item.weeklyInstalls),
      isOfficial: item.isOfficial === true || item.isOfficial === 'true',
      collectorLabels: {
        market: 'skills.sh',
        parser: item.parser || 'skills-sh-api',
      },
      item,
      parser: item.parser || 'skills-sh-api',
    },
  }
}

function skillsShPublicPages(config: Record<string, any>) {
  const configured = Array.isArray(config.publicPages) ? config.publicPages.map(String) : []
  const defaults = [
    'https://www.skills.sh/',
    'https://www.skills.sh/trending',
    'https://www.skills.sh/hot',
    'https://www.skills.sh/official',
    'https://www.skills.sh/topic/react',
    'https://www.skills.sh/topic/nextjs',
    'https://www.skills.sh/topic/design',
    'https://www.skills.sh/topic/mobile',
    'https://www.skills.sh/topic/python',
    'https://www.skills.sh/topic/agent',
    'https://www.skills.sh/topic/data',
    'https://www.skills.sh/topic/automation',
  ]
  return Array.from(new Set((configured.length ? configured : defaults).filter(Boolean)))
}

async function collectSkillsShPublic(source: any): Promise<RawItem[]> {
  const config = parseJson<Record<string, any>>(source.config, {})
  const pythonPath = scraplingPythonPath()
  const bridge = path.join(process.cwd(), 'scripts', 'scrapling_site_bridge.py')
  const pages = skillsShPublicPages(config)
  const pageLimit = Math.min(Number(config.publicPageLimit || 250), 500)
  const maxTotal = Math.min(Number(config.publicMaxTotal || config.maxTotal || 2500), 10000)
  const preferNative = config.nativePublicFetch !== false
  const items: RawItem[] = []
  const seen = new Set<string>()
  const failures: string[] = []
  let metadata: Record<string, unknown> = {}

  for (const pageUrl of pages) {
    if (items.length >= maxTotal) break
    if (preferNative) {
      try {
        const html = await fetchPublicHtml(pageUrl, Math.max(15000, Number(config.publicFetchTimeoutMs || 45000)))
        const parsedPage = parseSkillsShFlightItems(html, Math.min(pageLimit, maxTotal - items.length))
        metadata = { ...metadata, ...(parsedPage.meta || {}), nativePublicFetch: true }

        for (const raw of parsedPage.items) {
          const normalized = normalizeSkillsShItem({
            ...raw,
            description: raw.description || `skills.sh 公开榜单技能，来源仓库 ${raw.source}，安装量 ${toNumber(raw.installs)}。`,
            tags: ['skills.sh', raw.source, raw.isOfficial ? 'official' : 'community'].filter(Boolean),
            parser: raw.parser || 'skills-sh-next-flight',
          }, source)
          if (!normalized) continue

          const key = normalizeUrl(normalized.canonicalUrl || normalized.sourceUrl) || normalizeTitle(normalized.title)
          if (!key || seen.has(key)) continue
          seen.add(key)
          normalized.rawData = {
            ...(normalized.rawData || {}),
            pageUrl,
            publicMeta: metadata,
          }
          items.push(normalized)
          if (items.length >= maxTotal) break
        }

        if (parsedPage.items.length > 0) {
          console.warn(`[skills.sh] native public parsed ${parsedPage.items.length} items from ${pageUrl}; total=${items.length}.`)
          continue
        }
        failures.push(`${pageUrl}: native public parser found 0 skills`)
      } catch (error) {
        failures.push(`${pageUrl}: native public fetch failed: ${(error as Error).message}`)
      }
    }

    const result = spawnSync(pythonPath, [
      bridge,
      '--url',
      pageUrl,
      '--limit',
      String(pageLimit),
      '--skills-sh-public',
    ], {
      encoding: 'utf8',
      timeout: 60000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })

    if (result.status !== 0) {
      failures.push(`${pageUrl}: ${result.stderr || result.stdout || 'Scrapling bridge failed'}`)
      continue
    }

    const parsed = parseBridgeOutput(result.stdout)
    if (!parsed.ok) {
      failures.push(`${pageUrl}: ${parsed.error || 'Scrapling bridge failed'}`)
      continue
    }

    metadata = { ...metadata, ...(parsed.meta || {}) }
    for (const raw of parsed.items || []) {
      if (raw.parser !== 'skills-sh-flight') continue
      const normalized = normalizeSkillsShItem({
        ...raw,
        name: raw.name || raw.title,
        description: raw.summary,
        url: raw.detailUrl || raw.url,
        tags: ['skills.sh', raw.source, raw.isOfficial ? 'official' : 'community'].filter(Boolean),
        parser: raw.parser,
      }, source)
      if (!normalized) continue

      const key = normalizeUrl(normalized.canonicalUrl || normalized.sourceUrl) || normalizeTitle(normalized.title)
      if (!key || seen.has(key)) continue
      seen.add(key)
      normalized.rawData = {
        ...(normalized.rawData || {}),
        pageUrl,
        publicMeta: metadata,
      }
      items.push(normalized)
      if (items.length >= maxTotal) break
    }
  }

  if (items.length === 0 && failures.length > 0) {
    throw new Error(`skills.sh public Scrapling crawl failed: ${failures.slice(0, 3).join(' | ')}`)
  }

  const detailEnrichLimit = Math.min(Number(config.detailEnrichLimit || 0), items.length)
  if (detailEnrichLimit > 0) {
    return enrichSkillsShDetails(items, source, detailEnrichLimit)
  }

  return items
}

async function collectSkillsShBrowser(source: any): Promise<RawItem[]> {
  const config = parseJson<Record<string, any>>(source.config, {})
  const pythonPath = scraplingPythonPath()
  const crawler = path.join(process.cwd(), 'scripts', 'skills_sh_browser_crawler.py')
  const limit = Math.min(Number(config.browserLimit || config.limit || 500), 5000)
  const scrollSteps = Math.min(Number(config.scrollSteps || 40), 2000)
  const delayMs = Math.max(250, Math.min(Number(config.delayMs || 900), 10000))
  const stateFile = String(config.stateFile || '.collector-state/skills-sh-browser.json')
  const includeSeen = Boolean(config.includeSeen)
  const stopOnEmittedLimit = includeSeen && config.stopOnEmittedLimit === true
  const maxClicks = Math.max(0, Math.min(Number(config.maxClicks || 24), 200))
  const clickDelayMs = Math.max(100, Math.min(Number(config.clickDelayMs || 600), 5000))
  const discoverPageLimit = Math.max(20, Math.min(Number(config.discoverPageLimit || 500), 2000))
  const perPageTimeoutMs = Math.max(
    60000,
    Math.min(Number(config.browserTimeoutMs || Math.max(90000, scrollSteps * delayMs + 60000)), 300000),
  )
  const initialSeenCount = readBrowserStateSeenCount(stateFile)
  const configuredUrls = Array.isArray(config.browserPages) && config.browserPages.length
    ? config.browserPages.map(String)
    : [source.url || 'https://www.skills.sh/']
  const discoveredUrls = config.useDiscoveredPages === false
    ? []
    : browserStateDiscoveredPages(stateFile, Math.min(Number(config.discoveredPageScanLimit || 80), 500))
  const allUrls = Array.from(new Set([...configuredUrls, ...discoveredUrls]))
  const rotatePages = config.rotatePages !== false
  const maxPagesPerRun = Math.max(1, Math.min(Number(config.maxPagesPerRun || allUrls.length || 1), allUrls.length || 1))
  const nextUrlIndex = rotatePages ? readBrowserStateNextUrlIndex(stateFile, allUrls.length) : 0
  const urls = rotatePages ? rotateArray(allUrls, nextUrlIndex).slice(0, maxPagesPerRun) : allUrls
  const items: RawItem[] = []
  const seen = new Set<string>()
  const failures: string[] = []

  console.warn(
    `[skills.sh browser] start source=${source.slug} pages=${urls.length}/${allUrls.length} nextUrlIndex=${nextUrlIndex} limit=${limit} scrollSteps=${scrollSteps} seenBefore=${initialSeenCount} includeSeen=${includeSeen} stopOnEmittedLimit=${stopOnEmittedLimit} state=${stateFile}`,
  )

  for (let urlIndex = 0; urlIndex < urls.length; urlIndex++) {
    const url = urls[urlIndex]
    if (stopOnEmittedLimit && items.length >= limit) break
    const remaining = stopOnEmittedLimit ? limit - items.length : limit
    const seenBeforePage = readBrowserStateSeenCount(stateFile)
    console.warn(`[skills.sh browser] page ${urlIndex + 1}/${urls.length} start url=${url} remaining=${remaining} seenBeforePage=${seenBeforePage}`)

    const result = await runStreamingPython(pythonPath, [
      crawler,
      '--url',
      url,
      '--limit',
      String(remaining),
      '--scroll-steps',
      String(scrollSteps),
      '--delay-ms',
      String(delayMs),
      '--timeout-ms',
      String(perPageTimeoutMs),
      '--state-file',
      stateFile,
      '--max-clicks',
      String(maxClicks),
      '--click-delay-ms',
      String(clickDelayMs),
      '--discover-page-limit',
      String(discoverPageLimit),
      ...(config.clickLoadMore === false ? [] : ['--click-load-more']),
      ...(includeSeen ? ['--include-seen'] : []),
      ...(config.headful ? ['--headful'] : []),
    ], {
      label: `skills.sh browser ${urlIndex + 1}/${urls.length}`,
      timeoutMs: perPageTimeoutMs + 15000,
      heartbeatMs: 10000,
    })

    if (result.status !== 0) {
      const reason = result.timedOut
        ? `timeout after ${Math.round((perPageTimeoutMs + 15000) / 1000)}s`
        : (result.stderr || result.stdout || 'skills.sh browser crawler failed')
      failures.push(`${url}: ${reason}`)
      console.warn(`[skills.sh browser] page ${urlIndex + 1}/${urls.length} failed url=${url} reason=${String(reason).slice(0, 300)}`)
      continue
    }

    let parsed: any
    try {
      parsed = parseBridgeOutput(result.stdout)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push(`${url}: ${message}`)
      console.warn(`[skills.sh browser] page ${urlIndex + 1}/${urls.length} failed url=${url} reason=${message}`)
      continue
    }

    if (!parsed.ok) {
      failures.push(`${url}: ${parsed.error || 'skills.sh browser crawler failed'}`)
      console.warn(`[skills.sh browser] page ${urlIndex + 1}/${urls.length} failed url=${url} reason=${parsed.error || 'unknown error'}`)
      continue
    }

    const parsedItems = Array.isArray(parsed.items) ? parsed.items : []
    let emitted = 0
    let freshAccepted = 0
    let replayAccepted = 0
    let skippedDuplicateInRun = 0
    let skippedInvalid = 0

    for (const raw of parsedItems) {
      const normalized = normalizeSkillsShItem({
        ...raw,
        name: raw.name || raw.title,
        description: raw.summary,
        url: raw.detailUrl || raw.url,
        tags: [raw.source, raw.isOfficial ? 'official' : 'community'].filter(Boolean),
        parser: raw.parser || 'skills-sh-browser',
      }, source)
      if (!normalized) {
        skippedInvalid++
        continue
      }
      const key = normalizeUrl(normalized.canonicalUrl || normalized.sourceUrl) || normalizeTitle(normalized.title)
      if (!key || seen.has(key)) {
        skippedDuplicateInRun++
        continue
      }
      seen.add(key)
      normalized.rawData = {
        ...(normalized.rawData || {}),
        browserMeta: parsed.meta || {},
        browserState: {
          stateFile,
          seenBeforeRun: initialSeenCount,
          seenAfterPage: parsed.meta?.seenCount,
          pageUrl: url,
        },
      }
      items.push(normalized)
      emitted++
      const wasReplay = Boolean(raw.alreadySeen)
      if (wasReplay) replayAccepted++
      else freshAccepted++
      if (stopOnEmittedLimit && items.length >= limit) break
    }

    const meta = parsed.meta || {}
    const totalParsed = Number(meta.totalParsed ?? parsedItems.length)
    const emittedCount = Number(meta.emittedCount ?? parsedItems.length)
    const freshCount = Number(meta.freshCount ?? parsedItems.length)
    const replayCount = Number(meta.replayCount ?? Math.max(0, emittedCount - freshCount))
    const seenAfterPage = Number(meta.seenCount ?? readBrowserStateSeenCount(stateFile))
    console.warn(
      `[skills.sh browser] page ${urlIndex + 1}/${urls.length} done url=${url} parsed=${totalParsed} emitted=${emittedCount} fresh=${freshCount} replay=${replayCount} acceptedFresh=${freshAccepted} acceptedReplay=${replayAccepted} skippedRunDuplicate=${skippedDuplicateInRun} skippedInvalid=${skippedInvalid} seenAfterPage=${seenAfterPage} discovered=${meta.discoveredPageCount ?? 0} savedThisRun=${items.length}`,
    )
    if (freshCount === 0 || emitted === 0) {
      console.warn(
        `[skills.sh browser] page ${urlIndex + 1}/${urls.length} no new unique skills; continuing to later discovered pages. includeSeen only refreshes existing rows and does not grow checkpoint.`,
      )
    }
  }

  if (items.length === 0 && failures.length > 0) {
    throw new Error(`skills.sh browser crawl failed: ${failures.slice(0, 3).join(' | ')}`)
  }
  if (rotatePages && allUrls.length > 0) {
    await writeBrowserStateNextUrlIndex(stateFile, (nextUrlIndex + urls.length) % allUrls.length)
  }
  console.warn(`[skills.sh browser] finished accepted=${items.length} failures=${failures.length} seenBefore=${initialSeenCount} seenAfter=${readBrowserStateSeenCount(stateFile)}`)
  return items
}

function rotateArray<T>(items: T[], startIndex: number) {
  if (!items.length) return items
  const safeIndex = ((startIndex % items.length) + items.length) % items.length
  return [...items.slice(safeIndex), ...items.slice(0, safeIndex)]
}

function readBrowserStateNextUrlIndex(stateFile: string, total: number) {
  if (total <= 0) return 0
  try {
    const filePath = path.isAbsolute(stateFile) ? stateFile : path.join(process.cwd(), stateFile)
    if (!existsSync(filePath)) return 0
    const state = parseJson<Record<string, any>>(readFileSync(filePath, 'utf8'), {})
    const index = Number(state.nextUrlIndex || 0)
    return Number.isFinite(index) ? ((index % total) + total) % total : 0
  } catch {
    return 0
  }
}

async function writeBrowserStateNextUrlIndex(stateFile: string, nextUrlIndex: number) {
  try {
    const filePath = path.isAbsolute(stateFile) ? stateFile : path.join(process.cwd(), stateFile)
    const state = parseJson<Record<string, any>>(existsSync(filePath) ? readFileSync(filePath, 'utf8') : '', {})
    state.nextUrlIndex = nextUrlIndex
    state.nextUrlIndexUpdatedAt = new Date().toISOString()
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf8')
  } catch {
    return
  }
}

function readBrowserStateSeenCount(stateFile: string) {
  try {
    const filePath = path.isAbsolute(stateFile) ? stateFile : path.join(process.cwd(), stateFile)
    if (!existsSync(filePath)) return 0
    const state = parseJson<Record<string, any>>(readFileSync(filePath, 'utf8'), {})
    return Array.isArray(state.seen) ? state.seen.length : Number(state.lastSeenCount || 0)
  } catch {
    return 0
  }
}

function browserStateDiscoveredPages(stateFile: string, limit: number) {
  try {
    const filePath = path.isAbsolute(stateFile) ? stateFile : path.join(process.cwd(), stateFile)
    if (!existsSync(filePath)) return []
    const state = parseJson<Record<string, any>>(readFileSync(filePath, 'utf8'), {})
    const pages = Array.isArray(state.discoveredPages) ? state.discoveredPages : []
    return pages
      .map((item: any) => String(item?.url || ''))
      .filter((url: string) => /^https:\/\/www\.skills\.sh\//.test(url))
      .slice(0, limit)
  } catch {
    return []
  }
}

async function enrichSkillsShDetails(items: RawItem[], source: any, limit: number): Promise<RawItem[]> {
  const pythonPath = scraplingPythonPath()
  const bridge = path.join(process.cwd(), 'scripts', 'scrapling_site_bridge.py')
  let enriched = 0

  for (const item of items.slice(0, limit)) {
    if (!item.sourceUrl || !/^https?:\/\//i.test(item.sourceUrl)) continue
    const result = spawnSync(pythonPath, [
      bridge,
      '--url',
      item.sourceUrl,
      '--limit',
      '12',
    ], {
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })

    if (result.status !== 0) continue

    let parsed: any
    try {
      parsed = parseBridgeOutput(result.stdout)
    } catch {
      continue
    }
    if (!parsed.ok) continue

    const detail = (parsed.items || []).find((candidate: any) => {
      const title = cleanText(candidate.title || '')
      const summary = cleanText(candidate.summary || '')
      return summary.length >= 12 && title.toLowerCase() !== 'officialskills.sh'
    })
    if (!detail) continue

    const summary = cleanText(detail.summary).slice(0, 1000)
    item.summary = summary
    item.contentSnippet = summary
    item.category = classifySkillZh(`${item.title} ${summary} ${(item.tags || []).join(' ')}`, item.category || source.category || '外部 Skill 市场')
    item.tags = Array.from(new Set(['Skill', 'skills.sh', item.category, ...(item.tags || [])].filter(Boolean))).slice(0, 12)
    item.rawData = {
      ...(item.rawData || {}),
      detailParser: detail.parser,
      detailItem: detail,
    }
    enriched++
  }

  console.warn(`[skills.sh] enriched ${enriched}/${limit} public detail pages with Scrapling.`)
  return items
}

async function collectSkillsShApi(source: any): Promise<RawItem[]> {
  const config = parseJson<Record<string, any>>(source.config, {})
  const tokenEnv = String(config.authEnv || 'SKILLS_SH_TOKEN')
  const token = process.env[tokenEnv]
  if (config.requiresAuth && !token) {
    if (config.publicFallback !== false) {
      console.warn(`[skills.sh] ${tokenEnv} is not set; using Scrapling public-page fallback instead of the full 847156 API crawl.`)
      return collectSkillsShPublic(source)
    }
    throw new Error(`skills.sh full API requires ${tokenEnv}; set it to continue the 847156 full crawl.`)
  }

  const apiBase = String(config.apiBase || 'https://www.skills.sh/api/v1').replace(/\/$/, '')
  const listEndpoint = String(config.listEndpoint || '/skills')
  const pageParam = String(config.pageParam || 'page')
  const pageSizeParam = String(config.pageSizeParam || 'limit')
  const pageSize = Math.min(Number(config.pageSize || 100), 500)
  const maxTotal = Math.min(Number(config.maxTotal || 1000), 847156)
  const state = parseJson<Record<string, any>>(source.lastError?.startsWith('{') ? source.lastError : '', {})
  let page = Number(config.pageStart || state.nextPage || 1)
  const items: RawItem[] = []

  while (items.length < maxTotal) {
    const url = new URL(`${apiBase}${listEndpoint}`)
    url.searchParams.set(pageParam, String(page))
    url.searchParams.set(pageSizeParam, String(pageSize))
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'AIHub-Skill-Collector/1.0',
    }
    if (token) headers.Authorization = `Bearer ${token}`

    const response = await fetch(url, { headers })
    if (response.status === 401 || response.status === 403) {
      throw new Error(`skills.sh API authorization failed (${response.status}); ${tokenEnv} is required for full crawl.`)
    }
    if (!response.ok) throw new Error(`skills.sh API ${response.status}`)

    const payload = await response.json()
    const list = itemListFromApiPayload(payload)
    if (list.length === 0) break

    for (const raw of list) {
      const item = normalizeSkillsShItem(raw, source)
      if (item) items.push(item)
      if (items.length >= maxTotal) break
    }

    const nextPage = nextPageFromApiPayload(payload, page)
    if (!nextPage || Number(nextPage) === page || list.length < pageSize) break
    page = Number(nextPage)
  }

  return items
}

async function fetchSkillsShSearch(query: string, limit: number, endpoint = 'https://www.skills.sh/api/search') {
  const url = new URL(endpoint)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', String(limit))
  const text = await fetchPublicHtml(url.toString(), 45000)
  const payload = JSON.parse(text)
  const list = Array.isArray(payload?.skills) ? payload.skills : []
  return list.map((item: any) => ({
    ...item,
    parser: 'skills-sh-search-api',
    searchQuery: query,
    searchType: payload?.searchType,
  }))
}

async function collectSkillsShSearch(source: any): Promise<RawItem[]> {
  const config = parseJson<Record<string, any>>(source.config, {})
  const queries = compactStringList([
    ...(Array.isArray(config.queries) ? config.queries : []),
    ...deepSeekSkillQueries('skillsShQueries'),
  ], 360)
  const stateFile = String(config.stateFile || '.collector-state/skills-sh-search-index.json')
  const statePath = path.isAbsolute(stateFile) ? stateFile : path.join(process.cwd(), stateFile)
  const state = parseJson<Record<string, any>>(existsSync(statePath) ? readFileSync(statePath, 'utf8') : '', {})
  const endpoint = String(config.endpoint || 'https://www.skills.sh/api/search')
  const perQueryLimit = Math.max(20, Math.min(Number(config.perQueryLimit || 300), 1000))
  const queryBatchSize = Math.max(1, Math.min(Number(config.queryBatchSize || 20), Math.max(1, queries.length)))
  const maxTotal = Math.max(1, Math.min(Number(config.maxTotal || 5000), 50000))
  const delayMs = Math.max(0, Math.min(Number(config.delayMs || 1200), 60000))
  const retryDelayMs = Math.max(0, Math.min(Number(config.retryDelayMs || 15000), 120000))
  const startIndex = Math.max(0, Number(state.nextQueryIndex || 0)) % Math.max(1, queries.length)
  const batchQueries = [
    ...queries.slice(startIndex, startIndex + queryBatchSize),
    ...queries.slice(0, Math.max(0, startIndex + queryBatchSize - queries.length)),
  ].slice(0, Math.min(queryBatchSize, queries.length))
  const items: RawItem[] = []
  const seen = new Set<string>()
  const failures: Array<{ query: string; error: string }> = []
  let processedQueries = 0
  let rateLimited = false

  for (const query of batchQueries) {
    if (items.length >= maxTotal) break
    processedQueries++
    try {
      let rawItems: any[]
      try {
        rawItems = await fetchSkillsShSearch(query, perQueryLimit, endpoint)
      } catch (error) {
        const message = (error as Error).message
        if (!/429|Too Many Requests/i.test(message)) throw error
        rateLimited = true
        if (retryDelayMs > 0) await sleep(retryDelayMs)
        rawItems = await fetchSkillsShSearch(query, perQueryLimit, endpoint)
      }

      for (const raw of rawItems) {
        const normalized = normalizeSkillsShItem({
          ...raw,
          description: raw.description || `${raw.name || raw.skillId} 来自 ${raw.source} 的公开 Skill，安装量 ${toNumber(raw.installs)}。`,
          tags: ['skills.sh', 'search-api', query, raw.source].filter(Boolean),
          parser: raw.parser || 'skills-sh-search-api',
        }, source)
        if (!normalized) continue
        const key = normalizeUrl(normalized.canonicalUrl || normalized.sourceUrl) || normalizeTitle(normalized.title)
        if (!key || seen.has(key)) continue
        seen.add(key)
        normalized.rawData = {
          ...(normalized.rawData || {}),
          searchQuery: query,
          stateFile,
        }
        items.push(normalized)
        if (items.length >= maxTotal) break
      }

      console.warn(`[skills.sh-search] ${query}: raw=${rawItems.length}, uniqueTotal=${items.length}`)
    } catch (error) {
      failures.push({ query, error: (error as Error).message })
      console.warn(`[skills.sh-search] ${query} skipped: ${(error as Error).message}`)
      if (/429|Too Many Requests/i.test((error as Error).message)) {
        rateLimited = true
        break
      }
    }

    if (delayMs > 0) await sleep(delayMs)
  }

  await fs.mkdir(path.dirname(statePath), { recursive: true }).catch(() => undefined)
  await fs.writeFile(statePath, JSON.stringify({
    nextQueryIndex: (startIndex + processedQueries) % Math.max(1, queries.length),
    queryCount: queries.length,
    processedQueries,
    collectedCount: items.length,
    rateLimited,
    failures: failures.slice(-20),
    updatedAt: new Date().toISOString(),
  }, null, 2), 'utf8')

  return items
}

function parseFrontMatter(markdown: string) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const data: Record<string, string> = {}
  if (!match) return data
  for (const line of match[1].split(/\r?\n/)) {
    const index = line.indexOf(':')
    if (index === -1) continue
    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, '')
    data[key] = value
  }
  return data
}

function expandPath(value: string) {
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2))
  if (value.startsWith('.')) return path.resolve(process.cwd(), value)
  if (!path.isAbsolute(value)) return path.resolve(process.cwd(), value)
  return value
}

function isInsideProject(filePath: string) {
  const relative = path.relative(process.cwd(), filePath)
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function isBlockedSkillPath(filePath: string) {
  const normalized = path.resolve(filePath)
  return blockedSkillPathParts.some(part => normalized.includes(part))
}

async function findSkillFiles(root: string, maxFiles = 200) {
  const results: string[] = []
  async function walk(dir: string, depth: number) {
    if (results.length >= maxFiles || depth > 8) return
    let entries: Array<{ name: string; isFile(): boolean; isDirectory(): boolean }>
    try {
      entries = (await fs.readdir(dir, { withFileTypes: true })) as any
    } catch {
      return
    }
    for (const entry of entries) {
      if (results.length >= maxFiles) return
      const current = path.join(dir, entry.name)
      if (entry.isFile() && entry.name === 'SKILL.md') {
        results.push(current)
      } else if (entry.isDirectory() && !['node_modules', '.git', '.next', '.venv-scrapling'].includes(entry.name)) {
        await walk(current, depth + 1)
      }
    }
  }
  await walk(root, 0)
  return results
}

function skillCategory(text: string, fallback = 'Skill') {
  const value = text.toLowerCase()
  if (value.includes('rag') || value.includes('knowledge') || value.includes('知识库')) return 'RAG'
  if (value.includes('search') || value.includes('research') || value.includes('检索') || value.includes('调研')) return 'Research'
  if (value.includes('github') || value.includes('repo') || value.includes('开源')) return 'GitHub'
  if (value.includes('content') || value.includes('write') || value.includes('摘要') || value.includes('写作')) return 'Content'
  if (value.includes('mcp') || value.includes('api') || value.includes('server') || value.includes('代码')) return 'Engineering'
  if (value.includes('eval') || value.includes('test') || value.includes('评测')) return 'Evaluation'
  if (value.includes('agent') || value.includes('automation') || value.includes('workflow') || value.includes('自动化')) return 'Automation'
  if (value.includes('data') || value.includes('file') || value.includes('文件') || value.includes('数据')) return 'Data'
  return fallback
}

async function collectLocalSkills(source: any): Promise<RawItem[]> {
  const config = parseJson<Record<string, any>>(source.config, {})
  const configuredPaths = Array.isArray(config.paths) ? config.paths : PROJECT_SKILL_PATHS
  const allowExternal = config.allowExternal === true
  const roots = configuredPaths
    .map((item: string) => expandPath(item))
    .filter((item: string) => allowExternal || isInsideProject(item))
    .filter((item: string) => !isBlockedSkillPath(item))

  const files = (await Promise.all(roots.map((item: string) => findSkillFiles(item)))).flat()
  const items: RawItem[] = []

  for (const file of files) {
    if (!allowExternal && !isInsideProject(file)) continue
    if (isBlockedSkillPath(file)) continue

    const markdown = await fs.readFile(file, 'utf8').catch(() => '')
    if (!markdown) continue
    const frontMatter = parseFrontMatter(markdown)
    const name = cleanText(frontMatter.name || path.basename(path.dirname(file)))
    const description = cleanText(frontMatter.description || markdown.replace(/^---[\s\S]*?---/, '')).slice(0, 420)
    if (!name || !description) continue

    const relativeSource = path.relative(process.cwd(), file).replace(/\\/g, '/')
    const category = skillCategory(`${name} ${description}`, source.category || '项目技能库')
    items.push({
      type: 'skill',
      title: name,
      sourceName: source.name,
      sourceUrl: relativeSource,
      canonicalUrl: relativeSource,
      summary: description,
      language: 'multi',
      region: 'local',
      category,
      tags: ['Skill', 'project-skill', category, frontMatter.name].filter(Boolean),
      contentSnippet: description,
      rawData: {
        file: relativeSource,
        frontMatter,
      },
    })
  }

  return items
}

function cleanSkillName(value = '') {
  const markdownLink = value.match(/^\[([^\]]{2,140})\]\((https?:\/\/[^)\s]+)\)/)
  const raw = markdownLink ? markdownLink[1] : value
  return cleanText(raw)
    .replace(/^#+\s*/, '')
    .replace(/^`|`$/g, '')
    .replace(/^\*\*|\*\*$/g, '')
    .replace(/^\[|\]$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isLikelySkillName(name: string) {
  const value = name.toLowerCase()
  if (name.length < 2 || name.length > 80) return false
  if (name.startsWith('@')) return false
  if (/^\d{4}-\d{2}-\d{2}$/.test(name)) return false
  if (/^\d+(\.\d+)*$/.test(name)) return false
  if (/^[a-z]+:$/i.test(name)) return false
  if (/^https?:\/\//i.test(name)) return false
  if (/[\\/][^\\/]+\.(toml|json|ya?ml|md|txt|js|ts|tsx|jsx|py|sh)$/i.test(name)) return false
  if (/^\.?[a-z0-9_-]+\.(toml|json|ya?ml|md|txt|js|ts|tsx|jsx|py|sh)$/i.test(name)) return false
  if (name.includes('](https')) return false
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
  ].includes(value)) return false
  if (/^(view all|learn more|read more|get started|copy|download|sign in|sign up)\b/i.test(name)) return false
  if (/ command reference$/i.test(name)) return false
  if (value.includes('badge') || value.includes('star history') || value.includes('sponsor')) return false
  return true
}

function githubBlobUrl(repo: string, branch: string, filePath: string) {
  return `https://github.com/${repo}/blob/${encodeURIComponent(branch)}/${filePath.split('/').map(encodeURIComponent).join('/')}`
}

function githubTreeUrl(repo: string, branch: string, dirPath: string) {
  return `https://github.com/${repo}/tree/${encodeURIComponent(branch)}/${dirPath.split('/').map(encodeURIComponent).join('/')}`
}

function githubCloneUrl(repo?: string | null) {
  const key = normalizeGithubRepoKey(repo)
  return key ? `https://github.com/${key}.git` : ''
}

function githubRawFileUrl(repo: string, branch: string, filePath: string) {
  return `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch)}/${filePath.split('/').map(encodeURIComponent).join('/')}`
}

function githubAnchorUrl(repo: string, headingOrName: string) {
  const anchor = headingOrName
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s-]/g, '')
    .replace(/\s+/g, '-')
  return `https://github.com/${repo}${anchor ? `#${anchor}` : ''}`
}

function resolveGithubLink(repo: string, branch: string, href?: string) {
  if (!href) return undefined
  if (/^https?:\/\//i.test(href)) return href
  if (href.startsWith('#')) return `https://github.com/${repo}${href}`
  return `https://github.com/${repo}/blob/${encodeURIComponent(branch)}/${href.replace(/^\.\//, '')}`
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

function githubMetadataForSkill(repo: string, repoInfo: any, branch?: string, skillPath?: string): Record<string, any> {
  const metadata = githubMetadataFromRepoResult(repoInfo) as Record<string, any>
  return {
    ...metadata,
    repo: metadata.repo || normalizeGithubRepoKey(repo),
    repoUrl: metadata.repoUrl || githubRepoUrl(repo),
    defaultBranch: metadata.defaultBranch || branch,
    skillPath: skillPath || undefined,
  }
}

function slugToken(value?: string | null) {
  return cleanText(String(value || ''))
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function skillsShHintToRawItem(
  repo: string,
  branch: string,
  hint: { skillId: string; name?: string; description?: string; sourceUrl?: string; marketplaceUrl?: string; installs?: number; weeklyInstalls?: number },
  source: any,
  treeItems: any[],
  repoInfo?: any,
) {
  const skillId = slugToken(hint.skillId)
  if (!skillId) return null
  const title = cleanText(hint.name || hint.skillId)
  const description = cleanText(hint.description || `来自 ${repo} 的 skills.sh 技能索引，已映射到 GitHub 源仓库。`).slice(0, 520)
  const entries = treeItems
    .filter((item: any) => item.type === 'blob' || item.type === 'tree')
    .map((item: any) => ({ path: String(item.path || ''), type: String(item.type || '') }))
    .filter((item: { path: string; type: string }) => item.path)
  const normalizedEntry = entries.find(item => {
    const filePath = item.path
    const lower = filePath.toLowerCase()
    const parts = lower.split('/')
    if (parts.includes(skillId)) return true
    if (lower.endsWith(`/${skillId}.md`)) return true
    if (lower.endsWith(`/${skillId}/skill.md`)) return true
    return lower.includes(`/${skillId}/`) && lower.endsWith('.md')
  })
  const normalizedPath = normalizedEntry?.path || ''
  const sourceUrl = normalizedEntry
    ? normalizedEntry.type === 'tree'
      ? githubTreeUrl(repo, branch, normalizedPath)
      : githubBlobUrl(repo, branch, normalizedPath)
    : ''
  if (!sourceUrl) return null
  const installRepo = normalizeGithubRepoKey(repo)
  const isBlobSource = normalizedEntry?.type === 'blob'
  const category = classifySkillZh(`${title} ${description} ${repo} ${normalizedPath || ''}`, source.category || '通用 Agent Skill')

  return {
    type: 'skill',
    title,
    sourceName: source.name,
    sourceUrl,
    canonicalUrl: `${repo}:skills-sh:${hint.skillId}`,
    summary: description,
    language: source.language,
    region: source.region,
    category,
    tags: ['Skill', 'GitHub', 'skills.sh-source', repo, category].filter(Boolean).slice(0, 10),
    contentSnippet: description,
    rawData: {
      repo,
      branch,
      skillId: hint.skillId,
      file: normalizedPath || undefined,
      sourceRepo: repo,
      installRepo,
      installGitUrl: githubCloneUrl(installRepo),
      skillMdUrl: sourceUrl,
      skillMdRawUrl: isBlobSource && normalizedPath ? githubRawFileUrl(repo, branch, normalizedPath) : undefined,
      skillMdPath: normalizedPath || undefined,
      skillMdDescription: description,
      githubUrl: sourceUrl,
      repoUrl: githubRepoUrl(repo),
      sourceRepoUrl: githubRepoUrl(repo),
      github: {
        ...githubMetadataForSkill(repo, repoInfo, branch, normalizedPath),
        sourceRepo: repo,
        installRepo,
        installGitUrl: githubCloneUrl(installRepo),
        skillMdUrl: sourceUrl,
        skillMdRawUrl: isBlobSource && normalizedPath ? githubRawFileUrl(repo, branch, normalizedPath) : undefined,
        skillMdDescription: description,
      },
      stars: toNumber(repoInfo?.stargazers_count),
      forks: toNumber(repoInfo?.forks_count),
      marketplaceUrl: hint.marketplaceUrl,
      installs: hint.installs,
      weeklyInstalls: hint.weeklyInstalls,
      sourcePrecision: 'file',
      parser: 'skills-sh-github-tree-match',
    },
  } satisfies RawItem
}

function parseMarkdownSkillCandidates(markdown: string, repo: string, branch: string, source: any, limit: number, repoInfo?: any): RawItem[] {
  const items: RawItem[] = []
  const seen = new Set<string>()
  let heading = ''

  for (const rawLine of markdown.split(/\r?\n/)) {
    const headingMatch = rawLine.match(/^#{1,4}\s+(.+)$/)
    if (headingMatch) {
      heading = cleanSkillName(headingMatch[1])
      continue
    }

    const bullet = rawLine.match(/^\s*(?:[-*+]|\d+\.)\s+(.+)$/)
    if (!bullet) continue

    const body = bullet[1].trim()
    if (!body || body.startsWith('![')) continue

    let name = ''
    let link: string | undefined
    let desc = ''

    const linked = body.match(/^\[([^\]]{2,140})\]\((https?:\/\/[^)\s]+)\)\s*(?:[-:：|]\s*)?(.*)$/)
    const bold = body.match(/^\*\*([^*]{2,90})\*\*\s*(?:[-:：|]\s*)?(.*)$/)
    const code = body.match(/^`([^`]{2,90})`\s*(?:[-:：|]\s*)?(.*)$/)
    const colon = body.match(/^([^:：|]{2,80})\s*[:：|]\s*(.+)$/)
    const dash = body.match(/^(.{2,80}?)\s+-\s+(.+)$/)

    if (linked) {
      name = linked[1]
      link = linked[2]
      desc = linked[3]
    } else if (bold) {
      name = bold[1]
      desc = bold[2]
    } else if (code) {
      name = code[1]
      desc = code[2]
    } else if (colon) {
      name = colon[1]
      desc = colon[2]
    } else if (dash) {
      name = dash[1]
      desc = dash[2]
    }

    name = cleanSkillName(name)
    desc = cleanText(desc)
    if (!isLikelySkillName(name)) continue

    const key = normalizeTitle(name)
    if (!key || seen.has(key)) continue
    seen.add(key)

    const category = skillCategory(`${heading} ${name} ${desc}`, source.category || '公开 Skill 仓库')
    const summary = desc || `来自 ${repo} 的可复用 Agent 能力候选，所属主题：${heading || category}。`
    const sourceUrl = resolveGithubLink(repo, branch, link) || githubAnchorUrl(repo, heading || name)
    if (!isPreciseSkillSourceUrl(sourceUrl)) continue
    const skillPath = githubSkillPathFromUrl(sourceUrl)
    const stars = toNumber(repoInfo?.stargazers_count)
    const forks = toNumber(repoInfo?.forks_count)
    const original = originalGithubFromText(`${link || ''}\n${body}\n${desc}`, repo)
    const sourceRepo = normalizeGithubRepoKey(repo)
    const originalRepo = original?.repo || ''
    const installRepo = originalRepo || sourceRepo
    const preciseSkillMdUrl = sourceUrl.includes('github.com') && !isGithubRepoHomeUrl(sourceUrl) ? sourceUrl : ''
    const githubBaseInfo = originalRepo && originalRepo.toLowerCase() !== sourceRepo.toLowerCase() ? null : repoInfo
    items.push({
      type: 'skill',
      title: name,
      sourceName: source.name,
      sourceUrl,
      canonicalUrl: `${repo}:${name}`,
      summary: summary.slice(0, 420),
      language: source.language,
      region: source.region,
      category,
      tags: ['Skill', 'public-repo', repo, category, heading].filter(Boolean).slice(0, 8),
      contentSnippet: summary.slice(0, 1200),
      rawData: {
        repo,
        branch,
        heading,
        link,
        sourceRepo,
        originalRepo: originalRepo || undefined,
        originalGithubUrl: original?.url,
        installRepo,
        installGitUrl: githubCloneUrl(installRepo),
        skillMdUrl: preciseSkillMdUrl || undefined,
        skillMdPath: skillPath || undefined,
        skillMdDescription: summary.slice(0, 1200),
        githubUrl: sourceUrl.includes('github.com') ? sourceUrl : undefined,
        repoUrl: githubRepoUrl(installRepo),
        sourceRepoUrl: githubRepoUrl(sourceRepo),
        github: {
          ...githubMetadataForSkill(installRepo, githubBaseInfo, branch, skillPath),
          sourceRepo,
          originalRepo: originalRepo || undefined,
          installRepo,
          installGitUrl: githubCloneUrl(installRepo),
          skillMdUrl: preciseSkillMdUrl || undefined,
          skillMdDescription: summary.slice(0, 1200),
        },
        stars,
        forks,
        sourcePrecision: link ? 'linked-readme-item' : 'readme-anchor',
        parser: 'markdown-list',
      },
    })

    if (items.length >= limit) break
  }

  return items
}

async function fetchGithubJson(url: string, retries = 2) {
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
    await new Promise(resolve => setTimeout(resolve, 900 * (attempt + 1)))
  }
  throw lastError instanceof Error ? lastError : new Error(`GitHub fetch failed: ${url}`)
}

async function fetchRawText(url: string, timeoutMs = 20000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AIHub-Scrapling-Collector/1.0',
        Accept: 'text/plain, text/markdown, */*',
      },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
    return await response.text()
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchGithubFileText(repo: string, branch: string, filePath: string, timeoutMs = 20000) {
  const apiUrl = new URL(`https://api.github.com/repos/${repo}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}`)
  if (branch && branch !== 'HEAD') apiUrl.searchParams.set('ref', branch)

  try {
    const data = await fetchGithubJson(apiUrl.toString(), 1)
    const content = typeof data?.content === 'string' ? data.content : ''
    const encoding = typeof data?.encoding === 'string' ? data.encoding.toLowerCase() : ''
    if (content && encoding === 'base64') {
      return Buffer.from(content.replace(/\s+/g, ''), 'base64').toString('utf8')
    }
    if (content) return content
  } catch (error) {
    console.warn(`[github-core] contents fallback ${repo}/${filePath}: ${(error as Error).message}`)
  }

  return fetchRawText(githubRawUrl(repo, branch, filePath), timeoutMs)
}

function githubRawUrl(repo: string, branch: string, filePath: string) {
  return githubRawFileUrl(repo, branch, filePath)
}

function isMarkdownSkillPath(filePath: string) {
  const lower = filePath.toLowerCase()
  if (!lower.endsWith('.md')) return false
  if (/(^|\/)(license|contributing|security|code_of_conduct|changelog)\.md$/i.test(lower)) return false
  if (/(^|\/)skill\.md$/i.test(lower)) return true
  if (/(^|\/)skills?\//i.test(lower)) return true
  if (/(^|\/)agent-skills?\//i.test(lower)) return true
  if (/(^|\/)claude-skills?\//i.test(lower)) return true
  if (/(^|\/)prompts?\//i.test(lower) && lower.includes('skill')) return true
  if (/(^|\/)plugins?\//i.test(lower) && lower.includes('skill')) return true
  return lower.includes('skill') && !/(^|\/)readme\.md$/i.test(lower)
}

function titleFromMarkdown(markdown: string, filePath: string) {
  const frontMatter = parseFrontMatter(markdown)
  const h1 = markdown.match(/^#\s+(.+)$/m)?.[1]
  return cleanSkillName(frontMatter.name || h1 || path.basename(path.dirname(filePath)) || path.basename(filePath, '.md'))
}

function descriptionFromMarkdown(markdown: string) {
  const frontMatter = parseFrontMatter(markdown)
  if (frontMatter.description) return cleanText(frontMatter.description).slice(0, 520)

  const body = markdown
    .replace(/^---[\s\S]*?---/, '')
    .replace(/^#.+$/gm, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
  const firstParagraph = body
    .split(/\n{2,}/)
    .map(item => cleanText(item))
    .find(item => item.length >= 20)
  return cleanText(firstParagraph || body).slice(0, 520)
}

function markdownSkillMetadata(repo: string, branch: string, filePath: string, markdown: string, repoInfo?: any) {
  const frontMatter = parseFrontMatter(markdown)
  const original = originalGithubFromText(`${markdown}\n${frontMatter.homepage || ''}\n${frontMatter.repository || ''}\n${frontMatter.source || ''}`, repo)
  const sourceRepo = normalizeGithubRepoKey(repo)
  const originalRepo = original?.repo || ''
  const installRepo = originalRepo || sourceRepo
  const skillMdUrl = githubBlobUrl(repo, branch, filePath)
  const githubBaseInfo = originalRepo && originalRepo.toLowerCase() !== sourceRepo.toLowerCase() ? null : repoInfo
  return {
    sourceRepo,
    originalRepo: originalRepo || undefined,
    originalGithubUrl: original?.url || undefined,
    installRepo,
    installGitUrl: githubCloneUrl(installRepo),
    skillMdUrl,
    skillMdRawUrl: githubRawFileUrl(repo, branch, filePath),
    skillMdPath: filePath,
    skillMdDescription: descriptionFromMarkdown(markdown),
    repoUrl: githubRepoUrl(installRepo),
    sourceRepoUrl: githubRepoUrl(sourceRepo),
    githubUrl: original?.url || skillMdUrl,
    github: {
      ...githubMetadataForSkill(originalRepo || sourceRepo, githubBaseInfo, branch, filePath),
      sourceRepo,
      originalRepo: originalRepo || undefined,
      installRepo,
      installGitUrl: githubCloneUrl(installRepo),
      skillMdUrl,
      skillMdRawUrl: githubRawFileUrl(repo, branch, filePath),
      skillPath: filePath,
    },
  }
}

function rawItemFromSkillMarkdown(repo: string, branch: string, filePath: string, markdown: string, source: any, repoInfo?: any): RawItem | null {
  const frontMatter = parseFrontMatter(markdown)
  const title = titleFromMarkdown(markdown, filePath)
  const description = descriptionFromMarkdown(markdown)
  if (!isLikelySkillName(title) || !description) return null

  const category = skillCategory(`${title} ${description} ${filePath}`, source.category || '公开 Skill 仓库')
  const sourceUrl = githubBlobUrl(repo, branch, filePath)
  const stars = toNumber(repoInfo?.stargazers_count)
  const forks = toNumber(repoInfo?.forks_count)
  const metadata = markdownSkillMetadata(repo, branch, filePath, markdown, repoInfo)
  return {
    type: 'skill',
    title,
    sourceName: source.name,
    sourceUrl,
    canonicalUrl: `${repo}:${filePath}`,
    summary: description,
    language: source.language,
    region: source.region,
    category,
    tags: ['Skill', 'GitHub', 'public-repo', repo, category, frontMatter.name].filter(Boolean).slice(0, 10),
    contentSnippet: description,
    rawData: {
      repo,
      branch,
      file: filePath,
      frontMatter,
      sourceRepo: metadata.sourceRepo,
      originalRepo: metadata.originalRepo,
      originalGithubUrl: metadata.originalGithubUrl,
      installRepo: metadata.installRepo,
      installGitUrl: metadata.installGitUrl,
      skillMdUrl: metadata.skillMdUrl,
      skillMdRawUrl: metadata.skillMdRawUrl,
      skillMdPath: metadata.skillMdPath,
      skillMdDescription: metadata.skillMdDescription,
      githubUrl: metadata.githubUrl,
      repoUrl: metadata.repoUrl,
      sourceRepoUrl: metadata.sourceRepoUrl,
      github: metadata.github,
      stars,
      forks,
      parser: /(^|\/)skill\.md$/i.test(filePath) ? 'skill-md' : 'skill-markdown',
    },
  }
}

function githubMetadataFromRepoResult(repo: any) {
  if (!repo) return {}
  return {
    repo: normalizeGithubRepoKey(repo.full_name || ''),
    repoUrl: repo.html_url,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner?.login,
    description: repo.description,
    stars: toNumber(repo.stargazers_count),
    forks: toNumber(repo.forks_count),
    watchers: toNumber(repo.watchers_count),
    openIssues: toNumber(repo.open_issues_count),
    language: repo.language,
    topics: Array.isArray(repo.topics) ? repo.topics : [],
    license: repo.license?.spdx_id || repo.license?.name || null,
    defaultBranch: repo.default_branch,
    homepage: repo.homepage || null,
    pushedAt: repo.pushed_at,
    updatedAt: repo.updated_at,
    createdAt: repo.created_at,
    archived: Boolean(repo.archived),
    disabled: Boolean(repo.disabled),
  }
}

const githubRepoInfoCache = new Map<string, Promise<any | null>>()

async function fetchGithubRepoInfo(repo: string, fallback?: any) {
  const key = normalizeGithubRepoKey(repo)
  if (!key) return fallback || null

  const cacheKey = key.toLowerCase()
  if (!githubRepoInfoCache.has(cacheKey)) {
    githubRepoInfoCache.set(cacheKey, fetchGithubJson(`https://api.github.com/repos/${key}`)
      .catch(error => {
        console.warn(`[github-core] repo metadata fallback ${key}: ${(error as Error).message}`)
        return fallback || null
      }))
  }

  return (await githubRepoInfoCache.get(cacheKey)) || fallback || null
}

async function discoverSkillRepos(searchQueries: string[], repoSearchLimit: number) {
  const repos: string[] = []
  const seen = new Set<string>()

  for (const query of searchQueries) {
    const url = new URL('https://api.github.com/search/repositories')
    url.searchParams.set('q', query)
    url.searchParams.set('sort', 'stars')
    url.searchParams.set('order', 'desc')
    url.searchParams.set('per_page', String(Math.min(repoSearchLimit, 100)))

    try {
      const data = await fetchGithubJson(url.toString())
      for (const repo of data.items || []) {
        const fullName = String(repo.full_name || '')
        const key = fullName.toLowerCase()
        if (!fullName || seen.has(key)) continue
        seen.add(key)
        repos.push(fullName)
      }
    } catch (error) {
      console.warn(`[skill-search] ${query} skipped: ${(error as Error).message}`)
    }
  }

  return repos
}

type SkillSourceHint = {
  repo: string
  skillId: string
  name?: string
  description?: string
  sourceUrl?: string
  marketplaceUrl?: string
  installs?: number
  weeklyInstalls?: number
}

function addSkillSourceHint(hints: Map<string, SkillSourceHint>, hint: Partial<SkillSourceHint>) {
  const repo = normalizeGithubRepoKey(hint.repo || '')
  const skillId = firstString(hint.skillId)
  if (!repo || !skillId) return
  const key = `${repo.toLowerCase()}/${skillId.toLowerCase()}`
  const existing = hints.get(key)
  hints.set(key, {
    repo,
    skillId,
    name: firstString(existing?.name, hint.name),
    description: firstString(existing?.description, hint.description),
    sourceUrl: firstString(existing?.sourceUrl, hint.sourceUrl, githubRepoUrl(repo)),
    marketplaceUrl: firstString(existing?.marketplaceUrl, hint.marketplaceUrl, skillsShMarketplaceUrl(repo, skillId)),
    installs: Math.max(toNumber(existing?.installs), toNumber(hint.installs)),
    weeklyInstalls: Math.max(toNumber(existing?.weeklyInstalls), toNumber(hint.weeklyInstalls)),
  })
}

function hintsFromSkillsShStateFile(stateFile: string, limit: number) {
  const hints = new Map<string, SkillSourceHint>()
  try {
    const filePath = path.isAbsolute(stateFile) ? stateFile : path.join(process.cwd(), stateFile)
    if (!existsSync(filePath)) return hints
    const state = parseJson<Record<string, any>>(readFileSync(filePath, 'utf8'), {})
    const seen = Array.isArray(state.seen) ? state.seen.map(String) : []
    for (const value of seen.slice(0, limit)) {
      const parts = value.split('/').filter(Boolean)
      if (parts.length < 3) continue
      const repo = `${parts[0]}/${parts[1]}`
      const skillId = parts.slice(2).join('/')
      addSkillSourceHint(hints, {
        repo,
        skillId,
        sourceUrl: githubRepoUrl(repo),
        marketplaceUrl: skillsShMarketplaceUrl(repo, skillId),
      })
    }
  } catch {
    return hints
  }
  return hints
}

async function loadSkillsShSourceHints(config: Record<string, any>) {
  const limit = Math.min(Number(config.sourceHintLimit || 20000), 100000)
  const hints = new Map<string, SkillSourceHint>()
  const stateFile = String(config.sourceStateFile || config.stateFile || '.collector-state/skills-sh-browser.json')

  for (const hint of Array.from(hintsFromSkillsShStateFile(stateFile, limit).values())) {
    addSkillSourceHint(hints, hint)
  }

  if (config.useCollectedSources === false) return Array.from(hints.values())

  const externalRows = await prisma.externalSkill.findMany({
    where: {
      OR: [
        { sourceSlug: { contains: 'skills-sh', mode: 'insensitive' } },
        { sourceUrl: { contains: 'officialskills.sh', mode: 'insensitive' } },
      ],
    },
    orderBy: [{ heatScore: 'desc' }, { collectedAt: 'desc' }],
    take: limit,
    select: {
      name: true,
      description: true,
      sourceUrl: true,
      githubUrl: true,
      rawData: true,
    },
  })

  for (const row of externalRows) {
    const raw = parseJson<Record<string, any>>(row.rawData, {})
    const item = raw.item && typeof raw.item === 'object' ? raw.item : {}
    const official = parseOfficialSkillsUrl(firstString(row.sourceUrl, raw.officialskillsUrl, raw.marketplaceUrl))
    const sourceInfo = skillsShSourceInfo({
      source: raw.source || item.source || official?.sourceKey,
      skillId: raw.skillId || item.skillId || official?.skillKey,
      sourceUrl: row.sourceUrl,
      githubUrl: row.githubUrl || raw.githubUrl,
    })
    addSkillSourceHint(hints, {
      repo: sourceInfo.sourceKey,
      skillId: sourceInfo.skillKey,
      name: row.name,
      description: row.description || item.description || item.summary,
      sourceUrl: row.githubUrl || sourceInfo.githubUrl,
      marketplaceUrl: sourceInfo.marketplaceUrl || raw.marketplaceUrl || raw.officialskillsUrl,
      installs: toNumber(raw.installs || item.installs),
      weeklyInstalls: toNumber(raw.weeklyInstalls || item.weeklyInstalls),
    })
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
    orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      title: true,
      summary: true,
      sourceUrl: true,
      canonicalUrl: true,
      rawData: true,
    },
  })

  for (const row of candidateRows) {
    const raw = parseJson<Record<string, any>>(row.rawData, {})
    const item = raw.item && typeof raw.item === 'object' ? raw.item : {}
    const official = parseOfficialSkillsUrl(firstString(row.sourceUrl, raw.officialskillsUrl, raw.marketplaceUrl))
    const canonical = String(row.canonicalUrl || '').replace(/^skills\.sh:/, '')
    const canonicalParts = canonical.split('/').filter(Boolean)
    const sourceInfo = skillsShSourceInfo({
      source: raw.source || item.source || official?.sourceKey || (canonicalParts.length >= 2 ? `${canonicalParts[0]}/${canonicalParts[1]}` : ''),
      skillId: raw.skillId || item.skillId || official?.skillKey || canonicalParts.slice(2).join('/'),
      sourceUrl: row.sourceUrl,
      githubUrl: raw.githubUrl,
    })
    addSkillSourceHint(hints, {
      repo: sourceInfo.sourceKey,
      skillId: sourceInfo.skillKey,
      name: row.title,
      description: row.summary || item.description || item.summary,
      sourceUrl: sourceInfo.githubUrl,
      marketplaceUrl: sourceInfo.marketplaceUrl || raw.marketplaceUrl || raw.officialskillsUrl,
      installs: toNumber(raw.installs || item.installs),
      weeklyInstalls: toNumber(raw.weeklyInstalls || item.weeklyInstalls),
    })
  }

  return Array.from(hints.values())
}

async function collectGithubSkillRepo(source: any): Promise<RawItem[]> {
  const config = parseJson<Record<string, any>>(source.config, {})
  const explicitRepos = Array.isArray(config.repos) ? config.repos.map(String) : []
  const searchQueries = Array.isArray(config.searchQueries) ? config.searchQueries.map(String) : []
  const repoSearchLimit = Math.min(Number(config.repoSearchLimit || 10), 50)
  const discoveredRepos = searchQueries.length > 0 ? await discoverSkillRepos(searchQueries, repoSearchLimit) : []
  const maxRepos = Math.min(Number(config.maxRepos || 40), 200)
  const maxTotal = Math.min(Number(config.maxTotal || 1000), 5000)
  const limitPerRepo = Math.min(Number(config.limitPerRepo || 300), 2000)
  const repos = Array.from(new Set([...explicitRepos, ...discoveredRepos].map(repo => repo.trim()).filter(Boolean))).slice(0, maxRepos)
  const allItems: RawItem[] = []
  const globalSeen = new Set<string>()

  for (const repo of repos) {
    if (allItems.length >= maxTotal) break
    try {
      const repoInfo = await fetchGithubRepoInfo(repo)
      if (!repoInfo) throw new Error(`GitHub repo metadata unavailable: ${repo}`)
      const branch = repoInfo.default_branch || 'main'
      const repoItems: RawItem[] = []

      const readme = await fetchGithubFileText(repo, branch, 'README.md').catch(() => '')
      if (readme) {
        repoItems.push(...parseMarkdownSkillCandidates(readme, repo, branch, source, limitPerRepo, repoInfo))
      }

      const tree = await fetchGithubJson(`https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`).catch(() => null)
      const treeItems = Array.isArray(tree?.tree) ? tree.tree : []
      const skillFiles = treeItems
        .filter((item: any) => item.type === 'blob' && isMarkdownSkillPath(String(item.path || '')))
        .sort((a: any, b: any) => {
          const aSkill = /(^|\/)skill\.md$/i.test(a.path) ? 0 : 1
          const bSkill = /(^|\/)skill\.md$/i.test(b.path) ? 0 : 1
          return aSkill - bSkill || String(a.path).localeCompare(String(b.path))
        })
        .slice(0, Math.max(0, limitPerRepo - repoItems.length))

      for (const file of skillFiles) {
        if (repoItems.length >= limitPerRepo || allItems.length + repoItems.length >= maxTotal) break
        const markdown = await fetchGithubFileText(repo, branch, file.path).catch(() => '')
        if (!markdown) continue
        const parsed = rawItemFromSkillMarkdown(repo, branch, file.path, markdown, source, repoInfo)
        if (parsed) repoItems.push(parsed)
      }

      const seen = new Set<string>()
      for (const item of repoItems) {
        const key = `${normalizeTitle(item.title)}:${normalizeUrl(item.canonicalUrl || item.sourceUrl) || item.sourceUrl || ''}`
        if (!key || seen.has(key) || globalSeen.has(key)) continue
        seen.add(key)
        globalSeen.add(key)
        allItems.push(item)
        if (allItems.length >= maxTotal) break
      }
    } catch (error) {
      console.warn(`[skill-repo] ${repo} skipped: ${(error as Error).message}`)
    }
  }

  return allItems
}

async function collectSkillsShGithubSources(source: any): Promise<RawItem[]> {
  const config = parseJson<Record<string, any>>(source.config, {})
  const hints = await loadSkillsShSourceHints(config)
  const explicitRepos = Array.isArray(config.repos) ? config.repos.map(String) : []
  const maxRepos = Math.min(Number(config.maxRepos || 120), 1000)
  const maxTotal = Math.min(Number(config.maxTotal || 5000), 50000)
  const limitPerRepo = Math.min(Number(config.limitPerRepo || 800), 5000)
  const hintLimitPerRepo = Math.min(Number(config.hintLimitPerRepo || limitPerRepo), 5000)
  const repoBatchSize = Math.max(1, Math.min(Number(config.repoBatchSize || 8), 100))
  const stateFile = String(config.githubStateFile || '.collector-state/skills-sh-github-sources.json')
  const statePath = path.isAbsolute(stateFile) ? stateFile : path.join(process.cwd(), stateFile)
  const state = parseJson<Record<string, any>>(existsSync(statePath) ? readFileSync(statePath, 'utf8') : '', {})
  const allRepos = Array.from(new Set([
    ...explicitRepos,
    ...hints.map(hint => hint.repo),
  ].map(repo => normalizeGithubRepoKey(repo)).filter(Boolean))).slice(0, maxRepos)
  const startIndex = Math.max(0, Number(state.nextRepoIndex || 0)) % Math.max(1, allRepos.length)
  const repos = [
    ...allRepos.slice(startIndex, startIndex + repoBatchSize),
    ...allRepos.slice(0, Math.max(0, startIndex + repoBatchSize - allRepos.length)),
  ].slice(0, Math.min(repoBatchSize, allRepos.length))
  const hintsByRepo = new Map<string, SkillSourceHint[]>()

  for (const hint of hints) {
    const key = normalizeGithubRepoKey(hint.repo).toLowerCase()
    if (!key) continue
    const list = hintsByRepo.get(key) || []
    list.push(hint)
    hintsByRepo.set(key, list)
  }

  const allItems: RawItem[] = []
  const globalSeen = new Set<string>()
  let processedRepos = 0
  let lastRepo = ''

  for (const repo of repos) {
    if (allItems.length >= maxTotal) break
    processedRepos++
    lastRepo = repo
    try {
      const repoItems: RawItem[] = []
      const repoHints = (hintsByRepo.get(repo.toLowerCase()) || []).slice(0, hintLimitPerRepo)
      const repoInfo = await fetchGithubRepoInfo(repo)
      const branch = repoInfo?.default_branch || 'HEAD'

      const tree = await fetchGithubJson(`https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`).catch(() => null)
      const treeItems = Array.isArray(tree?.tree) ? tree.tree : []

      for (const hint of repoHints) {
        if (repoItems.length >= limitPerRepo || allItems.length + repoItems.length >= maxTotal) break
        const parsed = skillsShHintToRawItem(repo, branch, hint, source, treeItems, repoInfo)
        if (parsed) repoItems.push(parsed)
      }

      const canFetchReadme = Boolean(repoInfo) || config.readmeFallbackWithoutApi === true
      if (canFetchReadme && repoItems.length < limitPerRepo && allItems.length + repoItems.length < maxTotal) {
        const readme = await fetchGithubFileText(repo, branch, 'README.md').catch(() => '')
        if (readme) {
          repoItems.push(...parseMarkdownSkillCandidates(readme, repo, branch, source, limitPerRepo - repoItems.length, repoInfo))
        }
      }

      const skillFiles = treeItems
        .filter((item: any) => item.type === 'blob' && isMarkdownSkillPath(String(item.path || '')))
        .sort((a: any, b: any) => {
          const aSkill = /(^|\/)skill\.md$/i.test(a.path) ? 0 : 1
          const bSkill = /(^|\/)skill\.md$/i.test(b.path) ? 0 : 1
          return aSkill - bSkill || String(a.path).localeCompare(String(b.path))
        })
        .slice(0, Math.max(0, limitPerRepo - repoItems.length))

      for (const file of skillFiles) {
        if (repoItems.length >= limitPerRepo || allItems.length + repoItems.length >= maxTotal) break
        const markdown = await fetchGithubFileText(repo, branch, file.path).catch(() => '')
        if (!markdown) continue
        const parsed = rawItemFromSkillMarkdown(repo, branch, file.path, markdown, source, repoInfo)
        if (parsed) repoItems.push(parsed)
      }

      const seen = new Set<string>()
      for (const item of repoItems) {
        const key = `${normalizeTitle(item.title)}:${normalizeUrl(item.canonicalUrl || item.sourceUrl) || item.sourceUrl || ''}`
        if (!key || seen.has(key) || globalSeen.has(key)) continue
        seen.add(key)
        globalSeen.add(key)
        allItems.push(item)
        if (allItems.length >= maxTotal) break
      }

      console.warn(`[skills.sh-github] ${repo}: hints=${repoHints.length}, collected=${repoItems.length}, total=${allItems.length}`)
    } catch (error) {
      console.warn(`[skills.sh-github] ${repo} skipped: ${(error as Error).message}`)
    }
  }

  if (allRepos.length > 0) {
    await fs.mkdir(path.dirname(statePath), { recursive: true }).catch(() => undefined)
    await fs.writeFile(statePath, JSON.stringify({
      nextRepoIndex: (startIndex + processedRepos) % allRepos.length,
      lastRepo,
      repoCount: allRepos.length,
      processedRepos,
      collectedCount: allItems.length,
      updatedAt: new Date().toISOString(),
    }, null, 2), 'utf8')
  }

  return allItems
}

async function collectGithubSkillIndex(source: any): Promise<RawItem[]> {
  const baseConfig = parseJson<Record<string, any>>(source.config, {})
  const enhanced = enhancedGithubSkillConfig(source.slug, baseConfig)
  const profile = enhanced.profile
  const config: Record<string, any> = { ...enhanced.config, sourceSlug: source.slug }
  const codeQueries = Array.isArray(config.codeQueries) ? config.codeQueries.map(String) : [
    'filename:SKILL.md',
    'path:skills filename:SKILL.md',
    'path:agent-skills filename:SKILL.md',
    'path:.agents filename:SKILL.md',
    'path:.codex filename:SKILL.md',
    '"name:" "description:" filename:SKILL.md',
  ]
  const repoQueries = Array.isArray(config.repoQueries) ? config.repoQueries.map(String) : []
  const stateFile = String(config.indexStateFile || '.collector-state/github-skill-index.json')
  const statePath = path.isAbsolute(stateFile) ? stateFile : path.join(process.cwd(), stateFile)
  const state = parseJson<Record<string, any>>(existsSync(statePath) ? readFileSync(statePath, 'utf8') : '', {})
  const maxTotal = Math.min(Number(config.maxTotal || 120), 1000)
  const perPage = Math.min(Number(config.perPage || 30), 100)
  const queryBatchSize = Math.max(1, Math.min(Number(config.queryBatchSize || 2), codeQueries.length))
  const pageLimitPerQuery = Math.max(1, Math.min(Number(config.pageLimitPerQuery || 1), 10))
  const rawFetchTimeoutMs = Math.max(3000, Math.min(Number(config.rawFetchTimeoutMs || 12000), 30000))
  const maxRawFetches = Math.max(1, Math.min(Number(config.maxRawFetches || maxTotal * 2), 1000))
  const maxConsecutiveEmptyRaw = Math.max(3, Math.min(Number(config.maxConsecutiveEmptyRaw || 12), 200))
  const startQueryIndex = Math.max(0, Number(state.nextQueryIndex || 0)) % Math.max(1, codeQueries.length)
  const seenFileLimit = Math.max(1000, Math.min(Number(config.seenFileLimit || 50000), 200000))
  const seenFiles = new Set<string>((Array.isArray(state.seenFiles) ? state.seenFiles : []).map((item: unknown) => String(item)))
  const queries = [
    ...codeQueries.slice(startQueryIndex, startQueryIndex + queryBatchSize),
    ...codeQueries.slice(0, Math.max(0, startQueryIndex + queryBatchSize - codeQueries.length)),
  ].slice(0, Math.min(queryBatchSize, codeQueries.length))
  const items: RawItem[] = []
  const seen = new Set<string>()
  let processedQueries = 0
  let usedFallback = false
  let rawFetches = 0
  let consecutiveEmptyRaw = 0
  let fallbackRepos: string[] = []

  for (const query of queries) {
    processedQueries++
    if (items.length >= maxTotal) break
    for (let page = 1; page <= pageLimitPerQuery; page++) {
      if (items.length >= maxTotal) break
      const url = new URL('https://api.github.com/search/code')
      url.searchParams.set('q', query)
      url.searchParams.set('per_page', String(perPage))
      url.searchParams.set('page', String(page))

      let payload: any
      try {
        payload = await fetchGithubJson(url.toString())
      } catch (error) {
        usedFallback = true
        console.warn(`[github-skill-index] code search fallback for "${query}": ${(error as Error).message}`)
        break
      }

      for (const result of payload.items || []) {
        if (items.length >= maxTotal) break
        if (rawFetches >= maxRawFetches) break
        if (consecutiveEmptyRaw >= maxConsecutiveEmptyRaw) break
        const repo = normalizeGithubRepoKey(result.repository?.full_name || '')
        const filePath = String(result.path || '')
        if (!repo || !filePath || !isMarkdownSkillPath(filePath)) continue
        const key = `${repo}:${filePath}`
        if (seen.has(key) || seenFiles.has(key)) continue
        seen.add(key)
        seenFiles.add(key)
        const repoInfo = await fetchGithubRepoInfo(repo, result.repository)
        const branch = repoInfo?.default_branch || result.repository?.default_branch || 'HEAD'
        rawFetches++
        const markdown = await fetchGithubFileText(repo, branch, filePath, rawFetchTimeoutMs).catch(() => '')
        if (!markdown) {
          consecutiveEmptyRaw++
          continue
        }
        const parsed = rawItemFromSkillMarkdown(repo, branch, filePath, markdown, source, result.repository)
        if (parsed) {
          if (!rawItemMatchesTopicKeywords(parsed, config)) {
            consecutiveEmptyRaw++
            continue
          }
          consecutiveEmptyRaw = 0
          const github = githubMetadataForSkill(repo, repoInfo || result.repository, branch, filePath)
          parsed.rawData = {
            ...(parsed.rawData || {}),
            githubUrl: parsed.sourceUrl,
            repoUrl: github.repoUrl,
            github,
            stars: github.stars,
            forks: github.forks,
            indexQuery: query,
            parser: 'github-code-search',
          }
          items.push(parsed)
        } else {
          consecutiveEmptyRaw++
        }
      }
      if (rawFetches >= maxRawFetches || consecutiveEmptyRaw >= maxConsecutiveEmptyRaw) break
    }
  }

  if ((usedFallback || items.length === 0) && config.allowRepoFallback === true && repoQueries.length > 0 && items.length < maxTotal) {
    const repoLimit = Math.min(Number(config.repoSearchLimit || 12), 50)
    const repos = await discoverSkillRepos(repoQueries, repoLimit)
    fallbackRepos = repos
    const fallbackSource = {
      ...source,
      config: json({
        repos,
        maxRepos: Math.min(Number(config.fallbackMaxRepos || 12), repos.length),
        maxTotal: maxTotal - items.length,
        limitPerRepo: Math.min(Number(config.fallbackLimitPerRepo || 40), 200),
      }),
    }
  const fallbackItems = await collectGithubSkillRepo(fallbackSource)
    for (const item of fallbackItems) {
      if (!rawItemMatchesTopicKeywords(item, config)) continue
      const key = `${normalizeTitle(item.title)}:${normalizeUrl(item.canonicalUrl || item.sourceUrl) || item.sourceUrl || ''}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push(item)
      if (items.length >= maxTotal) break
    }
  }

  if (codeQueries.length > 0) {
    await fs.mkdir(path.dirname(statePath), { recursive: true }).catch(() => undefined)
    await fs.writeFile(statePath, JSON.stringify({
      nextQueryIndex: (startQueryIndex + processedQueries) % codeQueries.length,
      queryCount: codeQueries.length,
      capabilityProfileUsed: Boolean(profile),
      capabilityProfileGeneratedAt: profile?.generatedAt,
      capabilityProfileSkills: profile?.skillCount,
      capabilityProfileRepos: profile?.repoCount,
      processedQueries,
      collectedCount: items.length,
      rawFetches,
      consecutiveEmptyRaw,
      fallbackRepos,
      usedFallback,
      seenFileCount: seenFiles.size,
      seenFiles: Array.from(seenFiles).slice(-seenFileLimit),
      updatedAt: new Date().toISOString(),
    }, null, 2), 'utf8')
  }

  return items
}

async function collectManualItems(source: any): Promise<RawItem[]> {
  const config = parseJson<Record<string, any>>(source.config, {})
  return (config.items || []).map((item: any) => ({
    type: 'skill',
    title: item.name,
    sourceName: source.name,
    sourceUrl: item.sourceUrl,
    canonicalUrl: item.sourceUrl || `manual-skill:${item.name}`,
    summary: item.description,
    language: source.language,
    region: source.region,
    category: item.category || source.category,
    tags: item.tags || ['Skill'],
    contentSnippet: item.description,
    rawData: item,
  } satisfies RawItem))
}

async function findDuplicate(item: RawItem, fp: string) {
  const byFingerprint = await prisma.collectionCandidate.findUnique({ where: { fingerprint: fp } })
  if (byFingerprint) return byFingerprint

  const normalizedTitle = normalizeTitle(item.title)
  if (!normalizedTitle) return null
  return prisma.collectionCandidate.findFirst({
    where: {
      type: item.type,
      normalizedTitle,
    },
  })
}

async function clusterFor(item: RawItem, tags: string[]) {
  const key = `${item.type}-${tags[0] || item.category || 'general'}-${normalizeTitle(item.title).split(' ').slice(0, 4).join('-')}`
  const slug = makeSlug(key, 'cluster')
  return prisma.collectionCluster.upsert({
    where: { slug },
    update: {
      heatScore: { increment: 1 },
      tags: tags.join(','),
      updatedAt: new Date(),
    },
    create: {
      title: tags[0] || item.category || item.title,
      slug,
      summary: `自动聚类：${tags.slice(0, 3).join(' / ') || item.type}`,
      tags: tags.join(','),
      heatScore: 1,
    },
  })
}

async function saveCandidate(item: RawItem, source: any, runId: number) {
  if (!hasPreciseSkillSource(item)) return null
  if (item.type === 'skill') {
    const raw = item.rawData || {}
    const originalRepo = rawOriginalGithubRepo(raw as Record<string, any>)
    const sourceRepo = rawSourceGithubRepo(raw as Record<string, any>, item.sourceUrl)
    if (!originalRepo && aggregateSkillRepoReason(sourceRepo, raw as Record<string, any>)) return null
  }
  const normalizedTitle = normalizeTitle(item.title)
  const fp = contentFingerprint(item)
  const duplicate = await findDuplicate(item, fp)
  const tags = tagsFor(item)
  const cluster = await clusterFor(item, tags)
  const { score, detail } = scoreItem(item, source.priority)
  const enhanced = aiEnhance(item)
  const canonicalUrl = normalizeUrl(item.canonicalUrl || item.sourceUrl)
  const slug = makeSlug(`${item.type}-${item.title}-${fp.slice(0, 8)}`, 'candidate')

  const data = {
    sourceId: source.id,
    runId,
    clusterId: cluster.id,
    type: item.type,
    status: duplicate ? 'merged' : 'pending',
    title: cleanText(item.title).slice(0, 260),
    normalizedTitle,
    sourceName: item.sourceName || source.name,
    author: item.author,
    language: item.language || source.language,
    region: item.region || source.region,
    category: item.category || source.category,
    sourceUrl: item.sourceUrl,
    canonicalUrl,
    publishedAt: item.publishedAt || undefined,
    summary: cleanText(item.summary || item.contentSnippet || '').slice(0, 800),
    summaryZh: enhanced.summaryZh,
    highlights: enhanced.highlights,
    audience: enhanced.audience,
    relatedSkills: enhanced.relatedSkills,
    relatedAgents: enhanced.relatedAgents,
    tags: tags.join(','),
    contentSnippet: cleanText(item.contentSnippet || item.summary || '').slice(0, 2000),
    rawData: json(item.rawData || {}),
    fingerprint: fp,
    score,
    scoreDetail: json(detail),
    duplicateOfId: duplicate && duplicate.fingerprint !== fp ? duplicate.id : undefined,
  }

  if (duplicate?.fingerprint === fp) {
    return prisma.collectionCandidate.update({
      where: { id: duplicate.id },
      data: {
        ...data,
        status: duplicate.status === 'published' ? 'published' : duplicate.status === 'ignored' ? 'ignored' : duplicate.status,
        duplicateOfId: duplicate.duplicateOfId,
        publishedRef: duplicate.publishedRef,
        reviewedAt: duplicate.reviewedAt,
        reviewNote: duplicate.reviewNote,
        updatedAt: new Date(),
      },
    })
  }

  if (duplicate) {
    return prisma.collectionCandidate.create({
      data: {
        ...data,
        slug,
        status: 'merged',
      },
    })
  }

  return prisma.collectionCandidate.create({
    data: {
      ...data,
      slug,
    },
  })
}

async function saveExternalSkill(item: RawItem, source: any) {
  if (!hasPreciseSkillSource(item)) return null
  if (!hasGithubRepoSource(item)) return null
  const tags = tagsFor(item)
  const raw = item.rawData || {}
  const externalId = firstString((raw as any).externalId, (raw as any).id, (raw as any).item?.id, item.canonicalUrl, item.sourceUrl)
  const classification = classifySkillForRawItem(item, tags, source)
  const categoryZh = classification.categoryZh
  const tagsZh = classification.tagsZh
  const fp = fingerprint(`external-skill:${source.slug}:${externalId || normalizeTitle(item.title)}`)
  const sourceUrl = normalizeUrl(item.sourceUrl) || item.sourceUrl
  const score = scoreItem(item, source.priority).score
  const metrics = githubMetricsForSkillItem(item)
  const originalRepo = rawOriginalGithubRepo(raw as Record<string, any>)
  const sourceRepo = rawSourceGithubRepo(raw as Record<string, any>, item.sourceUrl)
  const installRepo = rawInstallGithubRepo(raw as Record<string, any>, item.sourceUrl)
  const installGitUrl = firstString((raw as any).installGitUrl, (raw as any).github?.installGitUrl, githubCloneUrl(installRepo))
  const skillMdUrl = rawSkillMdUrl(raw as Record<string, any>, sourceUrl)
  const skillMdDescription = cleanText(firstString((raw as any).skillMdDescription, (raw as any).github?.skillMdDescription, item.summary, item.contentSnippet)).slice(0, 1200)
  const repoUrl = githubRepoUrl(installRepo || sourceRepo)
  const githubUrl = firstString(
    originalRepo ? githubRepoUrl(originalRepo) : '',
    repoUrl,
    sourceUrl?.includes('github.com') ? sourceUrl : '',
    (raw as any).githubUrl,
    (raw as any).github_url,
    (raw as any).item?.github_url,
    (raw as any).github?.repoUrl,
    (raw as any).repoUrl,
  )
  const aggregateReason = !originalRepo ? aggregateSkillRepoReason(sourceRepo, raw as Record<string, any>) : ''
  const status = aggregateReason ? 'aggregated_source' : 'collected'
  const storedRaw = {
    ...raw,
    sourceRepo,
    originalRepo: originalRepo || undefined,
    installRepo: installRepo || undefined,
    installGitUrl: installGitUrl || undefined,
    skillMdUrl: skillMdUrl || undefined,
    skillMdDescription: skillMdDescription || undefined,
    repoUrl: repoUrl || undefined,
    githubUrl,
    aggregateSource: aggregateReason ? true : undefined,
    aggregateSourceReason: aggregateReason || undefined,
    originalSourceRequired: aggregateReason ? true : undefined,
    skillClassifier: {
      version: 1,
      categoryZh: classification.categoryZh,
      tagsZh: classification.tagsZh,
      confidence: classification.confidence,
      matchedKeywords: classification.matchedKeywords,
      scoreDetail: classification.scoreDetail,
      capabilityHints: classification.capabilityHints,
      classifiedAt: new Date().toISOString(),
    },
  }
  const existingByExternalId = externalId
    ? await prisma.externalSkill.findFirst({ where: { sourceSlug: source.slug, externalId } })
    : null

  if (existingByExternalId && existingByExternalId.fingerprint !== fp) {
    await prisma.externalSkill.update({
      where: { id: existingByExternalId.id },
      data: { fingerprint: fp },
    }).catch(() => undefined)
  }

  await prisma.externalSkill.upsert({
    where: { fingerprint: fp },
    update: {
      sourceId: source.id,
      sourceSlug: source.slug,
      externalId: externalId || undefined,
      name: cleanText(item.title).slice(0, 260),
      nameZh: cleanText(item.title).slice(0, 260),
      description: cleanText(item.summary || item.contentSnippet || '').slice(0, 1200),
      descriptionZh: item.language === 'zh'
        ? cleanText(item.summary || item.contentSnippet || '').slice(0, 1200)
        : `自动汉化摘要：${cleanText(item.summary || item.contentSnippet || item.title).slice(0, 500)}`,
      category: item.category,
      categoryZh,
      tags: tags.join(','),
      tagsZh: tagsZh.join(','),
      useCases: relatedSkillsFor(item).join('\n'),
      sourceUrl,
      githubUrl,
      homepageUrl: repoUrl || undefined,
      downloadUrl: installGitUrl || undefined,
      language: item.language || source.language,
      region: item.region || source.region,
      status,
      qualityScore: score,
      heatScore: score,
      stars: metrics.stars,
      forks: metrics.forks,
      downloads: metrics.downloads,
      rawData: json(storedRaw),
      collectedAt: new Date(),
    },
    create: {
      sourceId: source.id,
      sourceSlug: source.slug,
      externalId: externalId || undefined,
      name: cleanText(item.title).slice(0, 260),
      nameZh: cleanText(item.title).slice(0, 260),
      slug: makeSlug(`external-${source.slug}-${item.title}-${fp.slice(0, 8)}`, 'external-skill'),
      description: cleanText(item.summary || item.contentSnippet || '').slice(0, 1200),
      descriptionZh: item.language === 'zh'
        ? cleanText(item.summary || item.contentSnippet || '').slice(0, 1200)
        : `自动汉化摘要：${cleanText(item.summary || item.contentSnippet || item.title).slice(0, 500)}`,
      category: item.category,
      categoryZh,
      tags: tags.join(','),
      tagsZh: tagsZh.join(','),
      useCases: relatedSkillsFor(item).join('\n'),
      sourceUrl,
      githubUrl,
      homepageUrl: repoUrl || undefined,
      downloadUrl: installGitUrl || undefined,
      language: item.language || source.language,
      region: item.region || source.region,
      status,
      qualityScore: score,
      heatScore: score,
      stars: metrics.stars,
      forks: metrics.forks,
      downloads: metrics.downloads,
      rawData: json(storedRaw),
      fingerprint: fp,
    },
  })
}

async function saveExternalSkillsOnly(items: RawItem[], source: any) {
  let saved = 0
  for (const item of items) {
    if (!item.title || item.type !== 'skill') continue
    if (!hasPreciseSkillSource(item)) continue
    await saveExternalSkill(item, source)
    saved++
    if (saved % 500 === 0) {
      console.log(JSON.stringify({ stage: 'external-skills-save', saved }))
    }
  }
  return saved
}

type ExternalSkillSyncRow = {
  id: number
  sourceSlug: string
  name: string
  nameZh: string | null
  description: string | null
  descriptionZh: string | null
  categoryZh: string | null
  tags: string | null
  tagsZh: string | null
  useCases: string | null
  sourceUrl: string | null
  githubUrl: string | null
  status: string
  qualityScore: number
  heatScore: number
  stars: number
  forks: number
  downloads: number
  rawData: string | null
  collectedAt: Date
  updatedAt: Date
}

function splitStoredList(value?: string | null) {
  if (!value) return []
  return value
    .split(/,|\n/)
    .map(item => cleanText(item))
    .filter(Boolean)
}

function topValues(values: string[], limit = 8) {
  const counts = new Map<string, { value: string; count: number }>()
  for (const value of values.map(item => cleanText(item)).filter(Boolean)) {
    const key = value.toLowerCase()
    const existing = counts.get(key)
    counts.set(key, { value: existing?.value || value, count: (existing?.count || 0) + 1 })
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .map(item => item.value)
    .slice(0, limit)
}

function externalSkillRepoFromRow(row: ExternalSkillSyncRow) {
  const original = externalSkillOriginalRepoFromRow(row)
  if (original) return original
  return externalSkillSourceRepoFromRow(row)
}

function externalSkillOriginalRepoFromRow(row: ExternalSkillSyncRow) {
  const raw = parseJson<Record<string, any>>(row.rawData, {})
  return rawOriginalGithubRepo(raw)
}

function externalSkillSourceRepoFromRow(row: ExternalSkillSyncRow) {
  const raw = parseJson<Record<string, any>>(row.rawData, {})
  const nestedItem = raw.item && typeof raw.item === 'object' ? raw.item : {}
  const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
  return normalizeGithubRepoKey(firstString(
    raw.sourceRepo,
    githubRepoFromUrl(row.githubUrl),
    githubRepoFromUrl(row.sourceUrl),
    githubRepoFromUrl(raw.githubUrl),
    githubRepoFromUrl(raw.github_url),
    githubRepoFromUrl(raw.repoUrl),
    githubRepoFromUrl(raw.repo_url),
    githubRepoFromUrl(github.repoUrl),
    githubRepoFromUrl(github.url),
    github.repo,
    raw.repo,
    raw.source,
    nestedItem.source,
    githubRepoFromUrl(nestedItem.githubUrl),
    githubRepoFromUrl(nestedItem.github_url),
    githubRepoFromUrl(nestedItem.html_url),
  ))
}

function externalSkillPathFromRow(row: ExternalSkillSyncRow) {
  const raw = parseJson<Record<string, any>>(row.rawData, {})
  const nestedItem = raw.item && typeof raw.item === 'object' ? raw.item : {}
  const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
  return firstString(
    githubSkillPathFromUrl(row.githubUrl),
    githubSkillPathFromUrl(row.sourceUrl),
    githubSkillPathFromUrl(raw.githubUrl),
    githubSkillPathFromUrl(raw.github_url),
    githubSkillPathFromUrl(github.url),
    github.skillPath,
    raw.skillPath,
    raw.path,
    nestedItem.path,
    nestedItem.skillId,
    raw.skillId,
  )
}

function externalSkillSourceUrlFromRow(row: ExternalSkillSyncRow, repo: string) {
  const raw = parseJson<Record<string, any>>(row.rawData, {})
  const nestedItem = raw.item && typeof raw.item === 'object' ? raw.item : {}
  return firstString(
    row.githubUrl,
    row.sourceUrl,
    raw.githubUrl,
    raw.github_url,
    raw.repoUrl,
    raw.github?.repoUrl,
    nestedItem.githubUrl,
    nestedItem.github_url,
    githubRepoUrl(repo),
  )
}

function externalSkillScore(row: ExternalSkillSyncRow) {
  const socialScore = Math.max(
    row.stars > 0 ? Math.floor(Math.log10(row.stars + 1) * 18) : 0,
    row.downloads > 0 ? Math.floor(Math.log10(row.downloads + 1) * 14) : 0,
  )
  return Math.min(100, Math.max(row.heatScore || 0, row.qualityScore || 0, socialScore))
}

async function markExternalSkillsSynced(ids: number[], publishedRef: string) {
  const chunkSize = 1000
  let linked = 0
  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize)
    if (chunk.length === 0) continue
    const result = await prisma.externalSkill.updateMany({
      where: { id: { in: chunk } },
      data: { publishedRef },
    })
    linked += result.count
  }
  return linked
}

async function markExternalSkillsAggregated(ids: number[]) {
  const chunkSize = 1000
  let updated = 0
  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize)
    if (chunk.length === 0) continue
    const result = await prisma.externalSkill.updateMany({
      where: { id: { in: chunk } },
      data: {
        status: 'aggregated_source',
        publishedRef: null,
      },
    })
    updated += result.count
  }
  return updated
}

async function deactivateAggregatedSkillResources(repos: string[]) {
  let deactivated = 0
  for (const repo of Array.from(new Set(repos.map(item => normalizeGithubRepoKey(item)).filter(Boolean)))) {
    const result = await prisma.skillResource.updateMany({
      where: {
        sourceType: 'external-skill',
        sourceUrl: githubRepoUrl(repo),
        isActive: true,
      },
      data: {
        isActive: false,
        isFeatured: false,
      },
    })
    deactivated += result.count
  }
  return deactivated
}

export async function syncExternalSkillsToSkillResources(options: { limit?: number; repoLimit?: number } = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || cliArg('--limit', '50000')), 300000))
  const repoLimit = Math.max(1, Math.min(Number(options.repoLimit || cliArg('--repo-limit', '5000')), 50000))
  const rows = await prisma.externalSkill.findMany({
    where: {
      status: { notIn: ['ignored', 'low_quality', 'out_of_scope', 'needs_source', 'aggregated_source'] },
      OR: [
        { sourceSlug: { contains: 'github', mode: 'insensitive' } },
        { sourceSlug: { contains: 'skills-sh', mode: 'insensitive' } },
        { sourceUrl: { contains: 'github.com', mode: 'insensitive' } },
        { githubUrl: { contains: 'github.com', mode: 'insensitive' } },
      ],
    },
    orderBy: [
      { heatScore: 'desc' },
      { stars: 'desc' },
      { downloads: 'desc' },
      { collectedAt: 'desc' },
    ],
    take: limit,
    select: {
      id: true,
      sourceSlug: true,
      name: true,
      nameZh: true,
      description: true,
      descriptionZh: true,
      categoryZh: true,
      tags: true,
      tagsZh: true,
      useCases: true,
      sourceUrl: true,
      githubUrl: true,
      status: true,
      qualityScore: true,
      heatScore: true,
      stars: true,
      forks: true,
      downloads: true,
      rawData: true,
      collectedAt: true,
      updatedAt: true,
    },
  })

  const groups = new Map<string, ExternalSkillSyncRow[]>()
  const aggregatedRowIds: number[] = []
  const aggregatedRepos: string[] = []
  for (const row of rows) {
    const sourceRepo = externalSkillSourceRepoFromRow(row)
    const originalRepo = externalSkillOriginalRepoFromRow(row)
    const raw = parseJson<Record<string, any>>(row.rawData, {})
    const aggregateReason = !originalRepo ? aggregateSkillRepoReason(sourceRepo, raw) : ''
    if (aggregateReason) {
      aggregatedRowIds.push(row.id)
      if (sourceRepo) aggregatedRepos.push(sourceRepo)
      continue
    }
    const repo = originalRepo || sourceRepo
    if (!repo) continue
    const key = repo.toLowerCase()
    const list = groups.get(key) || []
    list.push(row)
    groups.set(key, list)
  }
  const markedAggregatedSources = await markExternalSkillsAggregated(aggregatedRowIds)
  const deactivatedAggregatedResources = await deactivateAggregatedSkillResources(aggregatedRepos)

  const rankedGroups = Array.from(groups.entries())
    .map(([key, list]) => {
      const repo = externalSkillRepoFromRow(list[0])
      const score = Math.max(...list.map(externalSkillScore), 0)
      const stars = Math.max(...list.map(item => item.stars || 0), 0)
      const downloads = list.reduce((sum, item) => sum + (item.downloads || 0), 0)
      const updatedAt = list.reduce((latest, item) => latest > item.updatedAt ? latest : item.updatedAt, list[0].updatedAt)
      return { key, repo, list, score, stars, downloads, updatedAt }
    })
    .sort((a, b) => b.score - a.score || b.stars - a.stars || b.downloads - a.downloads || b.list.length - a.list.length)
    .slice(0, repoLimit)

  let synced = 0
  let linkedExternalSkills = 0
  let created = 0
  let updated = 0

  for (const group of rankedGroups) {
    const repo = group.repo
    if (!repo) continue
    const sourceUrl = githubRepoUrl(repo)
    const top = group.list
      .slice()
      .sort((a, b) => externalSkillScore(b) - externalSkillScore(a) || (b.stars || 0) - (a.stars || 0) || b.updatedAt.getTime() - a.updatedAt.getTime())[0]
    const category = topValues(group.list.map(item => item.categoryZh || ''), 1)[0] || '通用 Agent Skill'
    const tags = topValues([
      'GitHub',
      'skills.sh',
      ...group.list.flatMap(item => [...splitStoredList(item.tagsZh), ...splitStoredList(item.tags)]),
      category,
      repo.split('/')[0],
    ], 12)
    const samples = group.list
      .slice()
      .sort((a, b) => externalSkillScore(b) - externalSkillScore(a))
      .slice(0, 12)
      .map(item => {
        const pathText = externalSkillPathFromRow(item)
        const link = externalSkillSourceUrlFromRow(item, repo)
        return cleanText(`${item.nameZh || item.name}${pathText ? ` - ${pathText}` : ''}${link ? ` (${link})` : ''}`)
      })
      .filter(Boolean)
    const description = cleanText(firstString(top.descriptionZh, top.description, top.nameZh, top.name))
    const score = Math.min(100, Math.max(
      group.score,
      Math.floor(Math.log10(group.stars + 1) * 18),
      Math.floor(Math.log10(group.downloads + 1) * 12),
      Math.min(20, group.list.length),
    ))
    const slug = makeSlug(`external-github-skill-${repo}`, 'external-skill')
    const existing = await prisma.skillResource.findUnique({ where: { slug }, select: { id: true } })
    const data = {
      name: repo,
      description: [
        description || `${repo} 的 GitHub Skill 仓库。`,
        `自动同步：该仓库下已采集 ${group.list.length} 个可追溯 Skill 条目。`,
        `指标：${group.stars.toLocaleString('en-US')} stars / ${group.downloads.toLocaleString('en-US')} downloads。`,
      ].join('\n'),
      category,
      sourceType: 'external-skill',
      sourceName: topValues(group.list.map(item => item.sourceSlug), 3).join(', ') || 'GitHub / skills.sh',
      sourceUrl,
      tags: tags.join(','),
      useCases: samples.join('\n'),
      inputSpec: `GitHub repository: ${repo}`,
      outputSpec: `Open ${sourceUrl} to inspect the original repository and mapped SKILL.md / skills directory entries.`,
      maturity: score >= 80 ? 'ready' : 'candidate',
      score,
      isFeatured: score >= 90 || group.stars >= 1000 || group.downloads >= 10000,
      isActive: true,
    }

    const skill = await prisma.skillResource.upsert({
      where: { slug },
      update: data,
      create: { ...data, slug },
    })

    synced++
    if (existing) updated++
    else created++
    linkedExternalSkills += await markExternalSkillsSynced(group.list.map(item => item.id), `skill:${skill.id}`)
  }

  return {
    scannedExternalSkills: rows.length,
    repos: groups.size,
    synced,
    created,
    updated,
    linkedExternalSkills,
    skippedAggregatedSources: aggregatedRowIds.length,
    markedAggregatedSources,
    deactivatedAggregatedResources,
  }
}

async function collectSource(source: any) {
  const run = await prisma.collectionRun.create({
    data: {
      sourceId: source.id,
      scope: 'source',
      status: 'running',
    },
  })

  try {
    let items: RawItem[] = []
    if (source.type === SOURCE_TYPES.rss) items = await collectRss(source)
    else if (source.type === SOURCE_TYPES.github) items = await collectGithub(source)
    else if (source.type === SOURCE_TYPES.siteList || source.type.includes('站点列表')) items = await collectSiteList(source)
    else if (source.type === SOURCE_TYPES.skillSiteList) items = await collectSkillSiteList(source)
    else if (source.type === SOURCE_TYPES.skillsShApi) items = await collectSkillsShApi(source)
    else if (source.type === SOURCE_TYPES.skillsShSearch) items = await collectSkillsShSearch(source)
    else if (source.type === SOURCE_TYPES.skillsShBrowser) items = await collectSkillsShBrowser(source)
    else if (source.type === SOURCE_TYPES.skillsShGithubSources) items = await collectSkillsShGithubSources(source)
    else if (source.type === SOURCE_TYPES.githubSkillIndex) items = await collectGithubSkillIndex(source)
    else if (source.type === SOURCE_TYPES.localSkills || source.type.includes('本地技能')) items = await collectLocalSkills(source)
    else if (source.type === SOURCE_TYPES.githubSkillRepo) items = await collectGithubSkillRepo(source)
    else if (source.type === SOURCE_TYPES.manualSkills || source.type.includes('人工录入')) items = await collectManualItems(source)
    else if (source.type === SOURCE_TYPES.promptSite) items = await collectPromptSite(source)

    let saved = 0
    for (const item of items) {
      if (!item.title) continue
      if (!hasPreciseSkillSource(item)) continue
      if (item.type === 'skill') await saveExternalSkill(item, source)
      const candidate = await saveCandidate(item, source, run.id)
      if (!candidate) continue
      saved++
    }

    await prisma.collectionRun.update({
      where: { id: run.id },
      data: {
        status: 'success',
        finishedAt: new Date(),
        candidateCount: saved,
      },
    })
    await prisma.collectionSource.update({
      where: { id: source.id },
      data: {
        lastRunAt: new Date(),
        lastSuccessAt: new Date(),
        lastStatus: 'success',
        lastError: null,
        failCount: 0,
      },
    })
    return { source: source.slug, saved }
  } catch (error) {
    const message = (error as Error).message
    await prisma.collectionRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        errorMessage: message,
      },
    })
    await prisma.collectionSource.update({
      where: { id: source.id },
      data: {
        lastRunAt: new Date(),
        lastStatus: 'failed',
        lastError: message,
        failCount: { increment: 1 },
      },
    })
    console.warn(`[failed] ${source.slug}: ${message}`)
    return { source: source.slug, saved: 0, error: message }
  }
}

export async function importSkillsShPublicExternal() {
  await seedSources()
  const source = await prisma.collectionSource.findUnique({ where: { slug: 'skills-sh-all' } })
  if (!source) throw new Error('skills-sh-all source is not configured')

  const run = await prisma.collectionRun.create({
    data: {
      sourceId: source.id,
      scope: 'external-skill-import',
      status: 'running',
      log: 'skills-sh-public-external',
    },
  })

  try {
    const items = await collectSkillsShPublic(source)
    const saved = await saveExternalSkillsOnly(items, source)
    await prisma.collectionRun.update({
      where: { id: run.id },
      data: {
        status: 'success',
        finishedAt: new Date(),
        candidateCount: saved,
        log: json({ source: source.slug, parsed: items.length, saved }),
      },
    })
    await prisma.collectionSource.update({
      where: { id: source.id },
      data: {
        lastRunAt: new Date(),
        lastSuccessAt: new Date(),
        lastStatus: 'success',
        lastError: null,
        failCount: 0,
      },
    })
    return { source: source.slug, parsed: items.length, saved }
  } catch (error) {
    const message = (error as Error).message
    await prisma.collectionRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        errorMessage: message,
      },
    })
    throw error
  }
}

export async function runCollector(options: { sourceSlug?: string; target?: 'news' | 'github' | 'skill' | 'prompt'; all?: boolean } = {}) {
  await seedSources()
  const sources = await prisma.collectionSource.findMany({
    where: {
      enabled: true,
      ...(options.sourceSlug ? { slug: options.sourceSlug } : {}),
      ...(options.target ? { target: options.target } : {}),
    },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
  })

  const batchRun = await prisma.collectionRun.create({
    data: {
      scope: options.sourceSlug ? 'manual-source' : options.target ? `${options.target}-only` : 'all',
      status: 'running',
      log: `sources=${sources.length}`,
    },
  })

  const results = []
  for (const source of sources) {
    results.push(await collectSource(source))
  }

  const total = results.reduce((sum, item) => sum + item.saved, 0)
  await prisma.collectionRun.update({
    where: { id: batchRun.id },
    data: {
      status: results.some(item => item.error) ? 'partial' : 'success',
      finishedAt: new Date(),
      candidateCount: total,
      log: json(results),
    },
  })

  let skillLibrarySync: any = null
  const shouldSyncSkillLibrary = sources.some(source => source.target === 'skill')
  const skipSync = ['1', 'true', 'yes'].includes(String(cliArg('--skip-sync', '')).toLowerCase())
  if (shouldSyncSkillLibrary && !skipSync) {
    try {
      skillLibrarySync = await syncExternalSkillsToSkillResources({
        limit: Number(cliArg('--sync-limit', '50000')),
        repoLimit: Number(cliArg('--sync-repo-limit', '5000')),
      })
    } catch (error) {
      skillLibrarySync = {
        ok: false,
        error: error instanceof Error ? error.message : 'sync failed',
      }
      console.warn(`[skill-library-sync] ${skillLibrarySync.error}`)
    }
  }

  return {
    sources: sources.length,
    candidates: total,
    skillLibrarySync,
    results,
  }
}

function cliArg(name: string, fallback?: string) {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  return process.argv[index + 1] || fallback
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

let daemonStopRequested = false
let activeDaemonName = 'collector-daemon'

function requestDaemonStop(signal: string) {
  daemonStopRequested = true
  console.warn(`[${activeDaemonName}] ${signal} received; stopping after current source.`)
}

function setupDaemonSignals(name = 'collector-daemon') {
  activeDaemonName = name
  process.once('SIGINT', () => requestDaemonStop('SIGINT'))
  process.once('SIGTERM', () => requestDaemonStop('SIGTERM'))
}

async function daemonSleep(ms: number) {
  const step = 1000
  let elapsed = 0
  while (!daemonStopRequested && elapsed < ms) {
    const next = Math.min(step, ms - elapsed)
    await sleep(next)
    elapsed += next
  }
}

export async function runSkillIndexBatch() {
  await seedSources()
  const rounds = Math.max(1, Math.min(Number(cliArg('--rounds', '5')), 200))
  const delayMs = Math.max(0, Math.min(Number(cliArg('--delay-ms', '2000')), 60000))
  const sourceSlugs = (cliArg('--sources', 'github-global-skill-index,skills-sh-github-sources,github-python-crawler-skill-index,github-cybersecurity-skill-index') || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  const sources = await prisma.collectionSource.findMany({
    where: {
      enabled: true,
      slug: { in: sourceSlugs },
    },
    orderBy: [{ priority: 'desc' }, { slug: 'asc' }],
  })
  const results: Array<{ round: number; source: string; saved: number; error?: string }> = []

  for (let round = 1; round <= rounds; round++) {
    for (const source of sources) {
      const result = await collectSource(source)
      results.push({ round, ...result })
      console.log(JSON.stringify({ round, ...result }))
      if (delayMs > 0) await sleep(delayMs)
    }
  }

  return {
    rounds,
    sources: sources.map(source => source.slug),
    candidates: results.reduce((sum, item) => sum + item.saved, 0),
    results,
  }
}

export async function runSkillsShDaemon() {
  setupDaemonSignals('skills.sh-daemon')
  await seedSources()
  const maxCycles = Math.max(0, Math.min(Number(cliArg('--max-cycles', '0')), 100000))
  const sourceDelayMs = Math.max(0, Math.min(Number(cliArg('--source-delay-ms', '3000')), 300000))
  const cycleDelayMs = Math.max(5000, Math.min(Number(cliArg('--cycle-delay-ms', '60000')), 3600000))
  const defaultSources = [
    'skills-sh-all',
    'skills-sh-browser-slow',
    'skills-sh-search-index',
    'skills-sh-github-sources',
    'github-global-skill-index',
    'github-python-crawler-skill-index',
    'github-cybersecurity-skill-index',
  ].join(',')
  const sourceSlugs = (cliArg('--sources', defaultSources) || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  const results: Array<{ cycle: number; source: string; saved: number; error?: string }> = []
  let cycle = 0

  console.log(JSON.stringify({
    daemon: 'github-skills-and-skills.sh',
    event: 'start',
    sources: sourceSlugs,
    maxCycles: maxCycles || 'infinite',
    sourceDelayMs,
    cycleDelayMs,
    startedAt: new Date().toISOString(),
  }))

  while (!daemonStopRequested && (maxCycles === 0 || cycle < maxCycles)) {
    cycle++
    const sources = await prisma.collectionSource.findMany({
      where: {
        enabled: true,
        slug: { in: sourceSlugs },
      },
      orderBy: [{ priority: 'desc' }, { slug: 'asc' }],
    })

    console.log(JSON.stringify({
      daemon: 'github-skills-and-skills.sh',
      event: 'cycle-start',
      cycle,
      sources: sources.map(source => source.slug),
      startedAt: new Date().toISOString(),
    }))

    for (const source of sources) {
      if (daemonStopRequested) break
      const startedAt = Date.now()
      console.log(JSON.stringify({
        daemon: 'github-skills-and-skills.sh',
        event: 'source-start',
        cycle,
        source: source.slug,
        startedAt: new Date().toISOString(),
      }))

      const result = await collectSource(source)
      results.push({ cycle, ...result })
      console.log(JSON.stringify({
        daemon: 'github-skills-and-skills.sh',
        event: 'source-finished',
        cycle,
        elapsedSeconds: elapsedSeconds(startedAt),
        ...result,
      }))

      if (sourceDelayMs > 0 && !daemonStopRequested) await daemonSleep(sourceDelayMs)
    }

    let skillLibrarySync: any = null
    if (!daemonStopRequested) {
      try {
        skillLibrarySync = await syncExternalSkillsToSkillResources({
          limit: Number(cliArg('--sync-limit', '50000')),
          repoLimit: Number(cliArg('--sync-repo-limit', '5000')),
        })
        console.log(JSON.stringify({
          daemon: 'github-skills-and-skills.sh',
          event: 'sync-skill-library',
          cycle,
          ...skillLibrarySync,
        }))
      } catch (error) {
        console.warn(JSON.stringify({
          daemon: 'github-skills-and-skills.sh',
          event: 'sync-skill-library-failed',
          cycle,
          error: error instanceof Error ? error.message : 'sync failed',
        }))
      }
    }

    console.log(JSON.stringify({
      daemon: 'github-skills-and-skills.sh',
      event: 'cycle-finished',
      cycle,
      saved: results.filter(item => item.cycle === cycle).reduce((sum, item) => sum + item.saved, 0),
      skillLibrarySync,
      finishedAt: new Date().toISOString(),
      nextCycleDelayMs: maxCycles > 0 && cycle >= maxCycles ? 0 : cycleDelayMs,
    }))

    if (maxCycles > 0 && cycle >= maxCycles) break
    if (!daemonStopRequested) await daemonSleep(cycleDelayMs)
  }

  return {
    cycles: cycle,
    sources: sourceSlugs,
    stopped: daemonStopRequested,
    candidates: results.reduce((sum, item) => sum + item.saved, 0),
    results,
  }
}

export async function runPromptBatch() {
  await seedSources()
  const rounds = Math.max(1, Math.min(Number(cliArg('--rounds', '8')), 100))
  const delayMs = Math.max(0, Math.min(Number(cliArg('--delay-ms', '2500')), 60000))
  const stopAfterEmpty = Math.max(1, Math.min(Number(cliArg('--stop-after-empty', '2')), 20))
  const source = await prisma.collectionSource.findUnique({ where: { slug: 'prompt-aishort-community' } })
  if (!source || !source.enabled) throw new Error('prompt-aishort-community source is not enabled')

  const results = []
  let emptyRounds = 0
  for (let round = 1; round <= rounds; round++) {
    const result = await collectSource(source)
    results.push({ round, ...result })
    console.log(JSON.stringify({ round, ...result }))
    if (result.saved <= 0) emptyRounds++
    else emptyRounds = 0
    if (emptyRounds >= stopAfterEmpty) break
    if (delayMs > 0 && round < rounds) await sleep(delayMs)
  }

  return {
    rounds: results.length,
    source: source.slug,
    candidates: results.reduce((sum, item) => sum + item.saved, 0),
    results,
  }
}

export async function runPromptLibraryDaemon() {
  setupDaemonSignals('prompt-daemon')
  await seedSources()
  const maxCycles = Math.max(0, Math.min(Number(cliArg('--max-cycles', '0')), 100000))
  const sourceDelayMs = Math.max(0, Math.min(Number(cliArg('--source-delay-ms', '3000')), 300000))
  const cycleDelayMs = Math.max(10000, Math.min(Number(cliArg('--cycle-delay-ms', '180000')), 3600000))
  const sourceSlugs = (cliArg('--sources', '') || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  const results: Array<{ cycle: number; source: string; saved: number; error?: string }> = []
  let cycle = 0

  console.log(JSON.stringify({
    daemon: 'prompt-library',
    event: 'start',
    sources: sourceSlugs.length ? sourceSlugs : 'all-enabled-prompt-sources',
    maxCycles: maxCycles || 'infinite',
    sourceDelayMs,
    cycleDelayMs,
    startedAt: new Date().toISOString(),
  }))

  while (!daemonStopRequested && (maxCycles === 0 || cycle < maxCycles)) {
    cycle++
    const sources = await prisma.collectionSource.findMany({
      where: {
        enabled: true,
        target: 'prompt',
        ...(sourceSlugs.length ? { slug: { in: sourceSlugs } } : {}),
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    })

    console.log(JSON.stringify({
      daemon: 'prompt-library',
      event: 'cycle-start',
      cycle,
      sources: sources.map(source => source.slug),
      startedAt: new Date().toISOString(),
    }))

    for (const source of sources) {
      if (daemonStopRequested) break
      const startedAt = Date.now()
      console.log(JSON.stringify({
        daemon: 'prompt-library',
        event: 'source-start',
        cycle,
        source: source.slug,
        startedAt: new Date().toISOString(),
      }))

      try {
        const result = await collectSource(source)
        results.push({ cycle, ...result })
        console.log(JSON.stringify({
          daemon: 'prompt-library',
          event: 'source-finished',
          cycle,
          elapsedSeconds: elapsedSeconds(startedAt),
          ...result,
        }))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'prompt source failed'
        results.push({ cycle, source: source.slug, saved: 0, error: message })
        console.warn(JSON.stringify({
          daemon: 'prompt-library',
          event: 'source-failed',
          cycle,
          source: source.slug,
          elapsedSeconds: elapsedSeconds(startedAt),
          error: message,
        }))
      }

      if (sourceDelayMs > 0 && !daemonStopRequested) await daemonSleep(sourceDelayMs)
    }

    console.log(JSON.stringify({
      daemon: 'prompt-library',
      event: 'cycle-finished',
      cycle,
      saved: results.filter(item => item.cycle === cycle).reduce((sum, item) => sum + item.saved, 0),
      finishedAt: new Date().toISOString(),
      nextCycleDelayMs: maxCycles > 0 && cycle >= maxCycles ? 0 : cycleDelayMs,
    }))

    if (maxCycles > 0 && cycle >= maxCycles) break
    if (!daemonStopRequested) await daemonSleep(cycleDelayMs)
  }

  return {
    cycles: cycle,
    sources: sourceSlugs.length ? sourceSlugs : ['all-enabled-prompt-sources'],
    stopped: daemonStopRequested,
    candidates: results.reduce((sum, item) => sum + item.saved, 0),
    results,
  }
}

async function main() {
  const command = process.argv[2] || 'all'
  if (command === 'seed-sources') {
    const count = await seedSources()
    console.log(JSON.stringify({ ok: true, sources: count }))
    return
  }

  if (command === 'batch-skills') {
    const result = await runSkillIndexBatch()
    console.log(JSON.stringify({ ok: true, ...result }, null, 2))
    return
  }

  if (command === 'skills-sh-daemon') {
    const result = await runSkillsShDaemon()
    console.log(JSON.stringify({ ok: true, ...result }, null, 2))
    return
  }

  if (command === 'sync-external-skills') {
    const result = await syncExternalSkillsToSkillResources()
    console.log(JSON.stringify({ ok: true, ...result }, null, 2))
    return
  }

  if (command === 'batch-prompts') {
    const result = await runPromptBatch()
    console.log(JSON.stringify({ ok: true, ...result }, null, 2))
    return
  }

  if (command === 'prompt-daemon') {
    const result = await runPromptLibraryDaemon()
    console.log(JSON.stringify({ ok: true, ...result }, null, 2))
    return
  }

  if (command === 'skills-sh-public-external') {
    const result = await importSkillsShPublicExternal()
    console.log(JSON.stringify({ ok: true, ...result }, null, 2))
    return
  }

  if (command === 'news') {
    const result = await runCollector({ target: 'news' })
    console.log(JSON.stringify({ ok: true, ...result }, null, 2))
    return
  }

  if (command === 'prompts') {
    const result = await runCollector({ target: 'prompt' })
    console.log(JSON.stringify({ ok: true, ...result }, null, 2))
    return
  }

  const sourceSlug = command === 'source' ? process.argv[3] : undefined
  const result = await runCollector({ sourceSlug, all: !sourceSlug })
  console.log(JSON.stringify({ ok: true, ...result }, null, 2))
}

if (require.main === module) {
  main()
    .catch(error => {
      console.error(error)
      process.exitCode = 1
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
