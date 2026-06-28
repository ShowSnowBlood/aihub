export type SkillClassificationInput = {
  name?: string | null
  description?: string | null
  category?: string | null
  tags?: string[] | string | null
  sourceSlug?: string | null
  sourceUrl?: string | null
  githubUrl?: string | null
  repo?: string | null
  path?: string | null
  rawData?: unknown
  capabilityKeywords?: string[]
}

export type SkillClassificationResult = {
  categoryZh: string
  tagsZh: string[]
  confidence: number
  matchedKeywords: string[]
  scoreDetail: Record<string, number>
  capabilityHints: string[]
}

type Rule = {
  categoryZh: string
  tags: string[]
  weight: number
  keywords: string[]
  strong?: string[]
}

const noiseTags = new Set([
  'skill',
  'skills',
  'skills.sh',
  'github',
  'public-repo',
  'public-page',
  'community',
  'official',
  'external',
  'agent',
  'agents',
  '通用 agent skill',
  '外部 skill 市场',
])

const sourceCategoryHints: Array<[string, string]> = [
  ['github-python-crawler-skill-index', '爬虫采集与数据获取'],
  ['github-cybersecurity-skill-index', '安全审计与防护研究'],
]

const rules: Rule[] = [
  {
    categoryZh: '爬虫采集与数据获取',
    tags: ['爬虫', '数据采集', '网页解析'],
    weight: 28,
    strong: [
      'scrapling',
      'D4Vinci/Scrapling',
      'scrapy',
      'web scraping',
      'stealth scraping',
      'adaptive scraping',
      'browser automation scraping',
      'firecrawl',
      'crawl4ai',
      'beautifulsoup',
      'bs4',
      'lxml',
      'parsel',
    ],
    keywords: [
      'crawler',
      'scraper',
      'spider',
      'crawl',
      'data extraction',
      'extract data',
      'html parser',
      'xpath',
      'css selector',
      'playwright scraping',
      'selenium scraping',
      'proxy rotation',
      'anti bot',
      'anti-bot',
      '网页采集',
      '网页解析',
      '爬虫',
      '抓取',
      '采集',
    ],
  },
  {
    categoryZh: '安全审计与防护研究',
    tags: ['安全', '审计', '元数据研究'],
    weight: 27,
    strong: [
      'shannon',
      'hacker skills',
      'AI pentester',
      'penetration testing',
      'offensive security',
      'red team',
      'blue team',
      'ctf',
      'osint',
      'malware analysis',
      'reverse engineering',
    ],
    keywords: [
      'pentest',
      'vulnerability',
      'bug bounty',
      'bug hunter',
      'appsec',
      'owasp',
      'burp',
      'nmap',
      'metasploit',
      'forensics',
      'incident response',
      'threat intelligence',
      'secret scanning',
      'sast',
      'semgrep',
      '安全',
      '漏洞',
      '攻防',
      '渗透',
      '红队',
      '蓝队',
      '威胁情报',
      '代码审计',
    ],
  },
  {
    categoryZh: 'GitHub 仓库与开源项目分析',
    tags: ['GitHub', '开源项目', '仓库画像'],
    weight: 18,
    strong: ['github api', 'github search', 'github trending', 'star history', 'repository analysis'],
    keywords: ['github repo', 'repository', 'stars', 'forks', 'release', 'license', 'topic', 'commit', 'pull request', '仓库', '开源项目', '榜单', 'Star 增长'],
  },
  {
    categoryZh: 'Agent 工作流与工具调用',
    tags: ['Agent', '工作流', '工具调用'],
    weight: 22,
    strong: ['agent workflow', 'multi-agent', 'mcp server', 'tool use', 'function calling', 'autonomous agent'],
    keywords: ['agent', 'workflow', 'automation', 'mcp', 'tool calling', 'orchestration', 'autonomous', '智能体', '工作流', '自动化', '工具调用'],
  },
  {
    categoryZh: 'RAG 与知识库',
    tags: ['RAG', '知识库', '检索增强'],
    weight: 24,
    strong: ['rag', 'vector database', 'embedding', 'retrieval augmented generation'],
    keywords: ['retrieval', 'knowledge base', 'chunking', 'vector', 'pinecone', 'qdrant', 'milvus', 'weaviate', 'faiss', 'pgvector', '知识库', '向量', '检索增强', '召回'],
  },
  {
    categoryZh: '前端与界面工程',
    tags: ['前端', 'UI', '工程实现'],
    weight: 23,
    strong: ['react', 'next.js', 'nextjs', 'vue', 'svelte', 'tailwind', 'shadcn', 'frontend', 'ui component'],
    keywords: ['css', 'html', 'component', 'responsive', 'web app', 'dashboard', 'landing page', 'vite', 'storybook', '前端', '界面', '组件', '响应式', '后台界面'],
  },
  {
    categoryZh: '代码开发与工程自动化',
    tags: ['代码工程', '自动化', 'DevTools'],
    weight: 19,
    strong: ['code review', 'refactor', 'testing', 'ci/cd', 'devops', 'typescript', 'python', 'sdk'],
    keywords: ['code', 'unit test', 'e2e', 'deploy', 'api routes', 'cli', 'lint', 'debug', '代码', '编程', '测试', '部署', '重构'],
  },
  {
    categoryZh: '数据分析与表格处理',
    tags: ['数据分析', '表格', '可视化'],
    weight: 21,
    strong: ['spreadsheet', 'excel', 'csv', 'sql', 'pandas', 'dataframe'],
    keywords: ['analytics', 'chart', 'reporting', 'database', 'etl', 'bi', '数据分析', '表格', '报表', '图表', '统计'],
  },
  {
    categoryZh: '设计与多模态创作',
    tags: ['设计', '图像', '多模态'],
    weight: 22,
    strong: ['figma', 'midjourney', 'stable diffusion', 'image generation', 'canvas', 'three.js'],
    keywords: ['design', 'visual', 'image', 'video', 'audio', 'diagram', 'excalidraw', 'slides', 'ppt', 'poster', 'brand', 'logo', 'motion', '3d', 'ui/ux', '视觉', '图片', '视频', '海报', '品牌', '动效'],
  },
  {
    categoryZh: '内容写作与知识表达',
    tags: ['写作', '摘要', '内容'],
    weight: 17,
    strong: ['copywriting', 'summarization', 'technical writing', 'documentation'],
    keywords: ['write', 'content', 'copy', 'rewrite', 'summary', 'summarize', 'blog', 'newsletter', 'docs', 'proposal', '写作', '摘要', '改写', '文案', '文档'],
  },
  {
    categoryZh: '提示词与角色模板',
    tags: ['提示词', '模板', '角色'],
    weight: 18,
    strong: ['prompt engineering', 'system prompt', 'prompt library'],
    keywords: ['prompt', 'persona', 'roleplay', 'template', '提示词', '系统提示', '角色', '模板'],
  },
  {
    categoryZh: 'AI 资讯与研究跟踪',
    tags: ['AI 资讯', '研究进展', '模型动态'],
    weight: 17,
    strong: ['model release', 'research paper', 'arxiv', 'llm benchmark', 'ai news'],
    keywords: ['news', 'newsletter', 'paper', 'research', 'benchmark', 'model update', 'product update', '行业新闻', '模型动态', '研究进展', '技术文章', '产品发布'],
  },
  {
    categoryZh: '运维部署与云平台',
    tags: ['部署', '云平台', '运维'],
    weight: 16,
    strong: ['docker', 'kubernetes', 'terraform', 'vercel', 'cloudflare', 'aws', 'azure', 'gcp'],
    keywords: ['deploy', 'hosting', 'server', 'monitoring', 'observability', 'ci/cd', '运维', '部署', '云平台', '监控'],
  },
  {
    categoryZh: '产品运营与增长',
    tags: ['运营', '增长', '营销'],
    weight: 16,
    strong: ['seo', 'crm', 'marketing automation', 'growth'],
    keywords: ['marketing', 'sales', 'support', 'customer', 'social media', 'campaign', '运营', '增长', '客服', '销售', '营销', '私域'],
  },
  {
    categoryZh: '学习研究与课程',
    tags: ['学习', '研究', '课程'],
    weight: 15,
    strong: ['research assistant', 'literature review', 'course'],
    keywords: ['learn', 'education', 'tutorial', 'academic', 'study', 'teaching', '学习', '课程', '教程', '论文', '科研'],
  },
]

function normalize(value: unknown) {
  return String(value || '').toLowerCase().replace(/[_/.-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseJson(value: unknown): Record<string, any> {
  if (!value) return {}
  if (typeof value === 'object') return value as Record<string, any>
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function splitSkillTags(tags?: string[] | string | null) {
  if (Array.isArray(tags)) return tags
  return String(tags || '')
    .split(/,|\n/)
    .map(item => item.trim())
    .filter(Boolean)
}

export function semanticSkillTags(tags: string[] = []) {
  return tags
    .map(tag => tag.trim())
    .filter(tag => tag && !noiseTags.has(tag.toLowerCase()))
}

function collectRawText(raw: Record<string, any>) {
  const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
  const item = raw.item && typeof raw.item === 'object' ? raw.item : {}
  return [
    raw.repo,
    raw.source,
    raw.skillId,
    raw.file,
    raw.skillMdPath,
    raw.skillMdDescription,
    raw.searchQuery,
    raw.indexQuery,
    raw.parser,
    github.repo,
    github.description,
    github.language,
    github.skillPath,
    Array.isArray(github.topics) ? github.topics.join(' ') : '',
    item.source,
    item.skillId,
    item.description,
  ].filter(Boolean).join(' ')
}

function skillText(input: SkillClassificationInput) {
  const raw = parseJson(input.rawData)
  const tags = semanticSkillTags(splitSkillTags(input.tags))
  const baseText = normalize([
    input.name,
    input.description,
    input.category,
    tags.join(' '),
    input.sourceSlug,
    input.sourceUrl,
    input.githubUrl,
    input.repo,
    input.path,
    collectRawText(raw),
  ].filter(Boolean).join(' '))
  const matchedCapabilityKeywords = (input.capabilityKeywords || [])
    .filter(keyword => keywordMatches(baseText, keyword))
  return normalize([
    baseText,
    matchedCapabilityKeywords.join(' '),
  ].filter(Boolean).join(' '))
}

function keywordMatches(text: string, keyword: string) {
  const normalized = normalize(keyword)
  if (!normalized) return false
  if (/^[a-z0-9+#. -]+$/.test(normalized)) {
    return new RegExp(`(^|[^a-z0-9+#])${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9+#]|$)`, 'i').test(text)
  }
  return text.includes(normalized)
}

export function classifySkill(input: SkillClassificationInput, fallback = '通用 Agent Skill'): SkillClassificationResult {
  const text = skillText(input)
  const sourceHint = sourceCategoryHints.find(([slug]) => String(input.sourceSlug || '').includes(slug))?.[1]
  const scores = new Map<string, number>()
  const matched = new Map<string, Set<string>>()

  for (const rule of rules) {
    let score = 0
    for (const keyword of rule.keywords) {
      if (!keywordMatches(text, keyword)) continue
      score += rule.weight
      if (!matched.has(rule.categoryZh)) matched.set(rule.categoryZh, new Set())
      matched.get(rule.categoryZh)?.add(keyword)
    }
    for (const keyword of rule.strong || []) {
      if (!keywordMatches(text, keyword)) continue
      score += rule.weight * 2
      if (!matched.has(rule.categoryZh)) matched.set(rule.categoryZh, new Set())
      matched.get(rule.categoryZh)?.add(keyword)
    }
    if (sourceHint === rule.categoryZh && score > 0) score += 35
    if (score) scores.set(rule.categoryZh, score)
  }

  const best = Array.from(scores.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  const categoryZh = best?.[0] || fallback
  const bestScore = best?.[1] || 0
  const rule = rules.find(item => item.categoryZh === categoryZh)
  const matchedKeywords = Array.from(matched.get(categoryZh) || []).slice(0, 12)
  const tags = new Set<string>(rule?.tags || [])

  if (text.includes('github')) tags.add('GitHub')
  if (keywordMatches(text, 'api')) tags.add('API')
  if (keywordMatches(text, 'mcp')) tags.add('MCP')
  if (keywordMatches(text, 'llm')) tags.add('LLM')
  if (keywordMatches(text, 'openai')) tags.add('OpenAI')
  if (keywordMatches(text, 'claude')) tags.add('Claude')
  if (sourceHint) tags.add('能力池反哺')

  return {
    categoryZh,
    tagsZh: Array.from(tags).slice(0, 10),
    confidence: Math.min(100, Math.round(bestScore)),
    matchedKeywords,
    scoreDetail: Object.fromEntries(Array.from(scores.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8)),
    capabilityHints: sourceHint ? [sourceHint] : [],
  }
}
