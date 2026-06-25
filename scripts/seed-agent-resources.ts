import { PrismaClient } from '@prisma/client'
import Parser from 'rss-parser'
import slugify from 'slugify'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const prisma = new PrismaClient()
const rssParser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'AIHub-Agent-Resource-Collector/1.0',
  },
})

type NewsSource = {
  name: string
  url: string
  language: 'zh' | 'en'
  limit?: number
}

type GithubRepo = {
  full_name: string
  name: string
  html_url: string
  homepage?: string | null
  description?: string | null
  stargazers_count: number
  forks_count?: number
  language?: string | null
  topics?: string[]
  updated_at?: string
}

type SkillSeed = {
  name: string
  description: string
  category: string
  sourceType: string
  sourceName?: string
  sourceUrl?: string
  tags: string[]
  useCases: string[]
  inputSpec?: string
  outputSpec?: string
  maturity?: string
  score?: number
  isFeatured?: boolean
}

const NEWS_SOURCES: NewsSource[] = [
  { name: 'OpenAI News', url: 'https://openai.com/news/rss.xml', language: 'en', limit: 12 },
  { name: 'Google AI Blog', url: 'https://blog.google/technology/ai/rss/', language: 'en', limit: 12 },
  { name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml', language: 'en', limit: 12 },
  { name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml', language: 'en', limit: 12 },
  { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', language: 'en', limit: 12 },
  { name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', language: 'en', limit: 12 },
  { name: 'MarkTechPost', url: 'https://www.marktechpost.com/feed/', language: 'en', limit: 12 },
  { name: 'The Gradient', url: 'https://thegradient.pub/rss/', language: 'en', limit: 10 },
  { name: 'Ahead of AI', url: 'https://magazine.sebastianraschka.com/feed', language: 'en', limit: 10 },
  { name: 'Last Week in AI', url: 'https://lastweekin.ai/feed', language: 'en', limit: 10 },
  { name: '量子位', url: 'https://www.qbitai.com/feed', language: 'zh', limit: 15 },
]

const GITHUB_QUERIES = [
  { query: 'topic:llm stars:>500', direction: 'LLM 应用', category: 'LLM 应用' },
  { query: 'topic:ai-agent stars:>100', direction: 'Agent', category: 'AI Agent' },
  { query: 'topic:agents stars:>100', direction: 'Agent', category: 'AI Agent' },
  { query: 'topic:rag stars:>100', direction: 'RAG', category: 'RAG' },
  { query: 'topic:generative-ai stars:>500', direction: '生成式 AI', category: '生成式 AI' },
  { query: 'topic:large-language-models stars:>500', direction: '模型服务', category: '模型服务' },
  { query: 'topic:ai-coding stars:>100', direction: 'AI 编程', category: 'AI 编程' },
  { query: 'topic:automation stars:>500 artificial-intelligence', direction: '自动化', category: '自动化' },
  { query: 'topic:vector-database stars:>100', direction: 'RAG', category: 'RAG' },
]

const GITHUB_CATEGORIES = [
  { name: 'AI Agent', slug: 'ai-agent', description: 'Agent 框架、多智能体协作和自主任务执行项目', icon: 'Bot', sortOrder: 201 },
  { name: 'RAG', slug: 'rag', description: '检索增强生成、知识库、向量检索和 Graph RAG 项目', icon: 'Database', sortOrder: 202 },
  { name: 'LLM 应用', slug: 'llm-apps', description: '聊天应用、LLM 应用框架和前端 AI SDK', icon: 'MessagesSquare', sortOrder: 203 },
  { name: '模型服务', slug: 'model-serving', description: '推理服务、模型部署、网关和本地运行时', icon: 'Server', sortOrder: 204 },
  { name: 'AI 编程', slug: 'ai-coding', description: '代码助手、软件工程 Agent 和开发者工具', icon: 'Code2', sortOrder: 205 },
  { name: '自动化', slug: 'automation-ai', description: 'AI 工作流、自动化编排和浏览器执行项目', icon: 'Workflow', sortOrder: 206 },
  { name: '生成式 AI', slug: 'generative-ai', description: '图像、视频、语音与多模态生成工具', icon: 'Sparkles', sortOrder: 207 },
]

const FALLBACK_REPOS = [
  ['langchain-ai/langchain', 'LLM 应用', 'LLM 应用'],
  ['ollama/ollama', '模型服务', '模型服务'],
  ['huggingface/transformers', '模型服务', '模型服务'],
  ['ggml-org/llama.cpp', '模型服务', '模型服务'],
  ['open-webui/open-webui', 'LLM 应用', 'LLM 应用'],
  ['AUTOMATIC1111/stable-diffusion-webui', '生成式 AI', '生成式 AI'],
  ['Comfy-Org/ComfyUI', '生成式 AI', '生成式 AI'],
  ['langgenius/dify', 'Agent', 'AI Agent'],
  ['run-llama/llama_index', 'RAG', 'RAG'],
  ['vllm-project/vllm', '模型服务', '模型服务'],
  ['FlowiseAI/Flowise', '自动化', '自动化'],
  ['lobehub/lobe-chat', 'LLM 应用', 'LLM 应用'],
  ['microsoft/autogen', 'Agent', 'AI Agent'],
  ['microsoft/semantic-kernel', 'Agent', 'AI Agent'],
  ['Significant-Gravitas/AutoGPT', 'Agent', 'AI Agent'],
  ['crewAIInc/crewAI', 'Agent', 'AI Agent'],
  ['camel-ai/camel', 'Agent', 'AI Agent'],
  ['aider-ai/aider', 'AI 编程', 'AI 编程'],
  ['continuedev/continue', 'AI 编程', 'AI 编程'],
  ['cline/cline', 'AI 编程', 'AI 编程'],
  ['TabbyML/tabby', 'AI 编程', 'AI 编程'],
  ['All-Hands-AI/OpenHands', 'AI 编程', 'AI 编程'],
  ['n8n-io/n8n', '自动化', '自动化'],
  ['activepieces/activepieces', '自动化', '自动化'],
  ['langflow-ai/langflow', '自动化', '自动化'],
  ['mendableai/firecrawl', '自动化', '自动化'],
  ['browser-use/browser-use', 'Agent', 'AI Agent'],
  ['infiniflow/ragflow', 'RAG', 'RAG'],
  ['HKUDS/LightRAG', 'RAG', 'RAG'],
  ['microsoft/graphrag', 'RAG', 'RAG'],
  ['deepset-ai/haystack', 'RAG', 'RAG'],
  ['chroma-core/chroma', 'RAG', 'RAG'],
  ['milvus-io/milvus', 'RAG', 'RAG'],
  ['qdrant/qdrant', 'RAG', 'RAG'],
  ['weaviate/weaviate', 'RAG', 'RAG'],
  ['BerriAI/litellm', '模型服务', '模型服务'],
  ['Portkey-AI/gateway', '模型服务', '模型服务'],
  ['huggingface/text-generation-inference', '模型服务', '模型服务'],
  ['sgl-project/sglang', '模型服务', '模型服务'],
  ['NVIDIA/TensorRT-LLM', '模型服务', '模型服务'],
  ['lm-sys/FastChat', '模型服务', '模型服务'],
  ['ChatGPTNextWeb/ChatGPT-Next-Web', 'LLM 应用', 'LLM 应用'],
  ['mckaywrigley/chatbot-ui', 'LLM 应用', 'LLM 应用'],
  ['Mintplex-Labs/anything-llm', 'RAG', 'RAG'],
  ['QuivrHQ/quivr', 'RAG', 'RAG'],
  ['khoj-ai/khoj', 'RAG', 'RAG'],
  ['vercel/ai', 'LLM 应用', 'LLM 应用'],
  ['CopilotKit/CopilotKit', 'LLM 应用', 'LLM 应用'],
  ['assistant-ui/assistant-ui', 'LLM 应用', 'LLM 应用'],
  ['stanfordnlp/dspy', 'LLM 应用', 'LLM 应用'],
  ['openai/openai-agents-python', 'Agent', 'AI Agent'],
  ['agno-agi/agno', 'Agent', 'AI Agent'],
  ['TransformerOptimus/SuperAGI', 'Agent', 'AI Agent'],
  ['OpenBMB/ChatDev', 'Agent', 'AI Agent'],
  ['e2b-dev/e2b', 'Agent', 'AI Agent'],
  ['modelcontextprotocol/servers', 'Agent', 'AI Agent'],
  ['modelcontextprotocol/python-sdk', 'Agent', 'AI Agent'],
  ['microsoft/ai-agents-for-beginners', 'Agent', 'AI Agent'],
  ['microsoft/generative-ai-for-beginners', 'LLM 应用', 'LLM 应用'],
  ['datawhalechina/llm-universe', 'RAG', 'RAG'],
  ['rasbt/LLMs-from-scratch', '模型服务', '模型服务'],
  ['karpathy/nanoGPT', '模型服务', '模型服务'],
  ['karpathy/llm.c', '模型服务', '模型服务'],
  ['Lightning-AI/litgpt', '模型服务', '模型服务'],
  ['unslothai/unsloth', '模型服务', '模型服务'],
  ['axolotl-ai-cloud/axolotl', '模型服务', '模型服务'],
  ['hiyouga/LLaMA-Factory', '模型服务', '模型服务'],
  ['open-mmlab/Amphion', '生成式 AI', '生成式 AI'],
  ['suno-ai/bark', '生成式 AI', '生成式 AI'],
  ['coqui-ai/TTS', '生成式 AI', '生成式 AI'],
  ['openai/whisper', '生成式 AI', '生成式 AI'],
  ['Stability-AI/generative-models', '生成式 AI', '生成式 AI'],
  ['CompVis/stable-diffusion', '生成式 AI', '生成式 AI'],
  ['TencentARC/GFPGAN', '生成式 AI', '生成式 AI'],
  ['lllyasviel/Fooocus', '生成式 AI', '生成式 AI'],
  ['AUTOMATIC1111/stable-diffusion-webui-extensions', '生成式 AI', '生成式 AI'],
  ['invoke-ai/InvokeAI', '生成式 AI', '生成式 AI'],
  ['PaddlePaddle/PaddleOCR', '生成式 AI', '生成式 AI'],
  ['microsoft/markitdown', 'RAG', 'RAG'],
  ['Unstructured-IO/unstructured', 'RAG', 'RAG'],
  ['jina-ai/reader', 'RAG', 'RAG'],
  ['jina-ai/jina', 'RAG', 'RAG'],
  ['getzep/zep', 'RAG', 'RAG'],
  ['mem0ai/mem0', 'Agent', 'AI Agent'],
  ['supermemoryai/supermemory', 'RAG', 'RAG'],
  ['openai/codex', 'AI 编程', 'AI 编程'],
  ['sourcegraph/cody', 'AI 编程', 'AI 编程'],
  ['RooVetGit/Roo-Code', 'AI 编程', 'AI 编程'],
  ['VoidEditor/void', 'AI 编程', 'AI 编程'],
  ['gpt-engineer-org/gpt-engineer', 'AI 编程', 'AI 编程'],
  ['Pythagora-io/gpt-pilot', 'AI 编程', 'AI 编程'],
  ['smol-ai/developer', 'AI 编程', 'AI 编程'],
  ['openinterpreter/open-interpreter', 'Agent', 'AI Agent'],
  ['openai/swarm', 'Agent', 'AI Agent'],
  ['yoheinakajima/babyagi', 'Agent', 'AI Agent'],
  ['SWE-agent/SWE-agent', 'AI 编程', 'AI 编程'],
  ['microsoft/promptflow', '自动化', '自动化'],
  ['dstackai/dstack', '模型服务', '模型服务'],
  ['bentoml/BentoML', '模型服务', '模型服务'],
  ['ray-project/ray', '模型服务', '模型服务'],
] as const

const CURATED_NEWS = [
  {
    title: 'Agent 产品进入控制与评测优先阶段，企业开始关注可审计执行链',
    slug: 'agent-control-evaluation-enterprise-audit-chain',
    summary: '2026 年的 AI Agent 竞争正在从单点能力转向可靠执行、权限隔离、任务回放和可审计日志。对企业团队来说，Agent 是否能被监控、暂停、回滚，比单次演示是否惊艳更关键。',
    content: 'Agent 产品从“能完成任务”进入“能被治理”的阶段。值得持续追踪的方向包括任务沙箱、工具权限、长期记忆边界、执行轨迹回放、自动化测试集和人工接管机制。这类信息适合沉淀为 Agent 模板库与企业落地清单。',
    sourceName: 'AI Hub 运营精选',
  },
  {
    title: 'RAG 项目从向量检索扩展到 Graph RAG、长上下文和评测闭环',
    slug: 'rag-graph-long-context-evaluation-loop',
    summary: 'RAG 不再只是“文档切片 + 向量库”。Graph RAG、结构化抽取、混合检索、引用校验和答案评测正在成为知识库产品的核心差异点。',
    content: '新一代 RAG 系统更强调端到端评测：检索召回率、引用可验证性、答案忠实度、知识更新延迟和低质量文档治理。站内可以围绕 LightRAG、GraphRAG、RAGFlow、LlamaIndex、Haystack 等项目形成持续榜单。',
    sourceName: 'AI Hub 运营精选',
  },
  {
    title: 'AI 编程工具从补全走向软件工程 Agent，仓库理解和任务执行成为主战场',
    slug: 'ai-coding-tools-software-engineering-agent',
    summary: '代码助手的竞争焦点正在从 IDE 补全转向仓库级理解、自动修复、测试生成、PR 审查和任务执行。开发者需要比较工具的上下文能力、终端执行能力和安全边界。',
    content: '值得关注的开源项目包括 Continue、Aider、OpenHands、Cline、Roo Code、SWE-agent 等。站内可以把它们解释为“代码编辑协作”“Issue 到 PR”“本地私有化”“浏览器/终端自动化”等不同能力线。',
    sourceName: 'AI Hub 运营精选',
  },
  {
    title: '模型服务栈持续分层：本地运行、推理加速、网关和成本治理分工更清晰',
    slug: 'model-serving-local-runtime-gateway-cost-governance',
    summary: 'LLM 落地开始形成更清晰的工程栈：Ollama/llama.cpp 负责本地运行，vLLM/SGLang/TGI 负责高吞吐推理，LiteLLM/Portkey 负责模型路由、审计和成本控制。',
    content: '模型服务类项目适合形成“部署难度、硬件要求、吞吐能力、模型兼容性、生产治理能力”的横向比较。对 Agent 社区来说，这类信息能帮助用户从玩具 Demo 走向可上线系统。',
    sourceName: 'AI Hub 运营精选',
  },
]

const CURATED_SKILLS: SkillSeed[] = [
  {
    name: 'Agent 产品调研',
    description: '围绕定位、目标用户、核心流程、竞品差异和落地风险产出一页式 Agent 产品调研。',
    category: 'Research',
    sourceType: 'manual',
    sourceName: '运营录入',
    tags: ['Agent', '产品', '竞品'],
    useCases: ['新项目立项', '竞品拆解', '产品路线图'],
    inputSpec: '产品方向、目标用户、已有资料链接',
    outputSpec: '定位摘要、竞品表、MVP 建议、风险清单',
    maturity: 'ready',
    score: 95,
    isFeatured: true,
  },
  {
    name: 'GitHub 项目解读',
    description: '把一个开源仓库拆成定位、核心能力、安装方式、适用场景、二开价值和风险提示。',
    category: 'Research',
    sourceType: 'manual',
    sourceName: '运营录入',
    tags: ['GitHub', '开源项目', '榜单'],
    useCases: ['开源项目详情页', '日报选题', '项目推荐'],
    inputSpec: 'GitHub 仓库链接或 README',
    outputSpec: '可读解读、标签、上榜理由、适用人群',
    maturity: 'ready',
    score: 94,
    isFeatured: true,
  },
  {
    name: 'RAG 知识库搭建',
    description: '从文档清洗、切片、索引、检索、引用、评测到上线监控生成完整 RAG 实施方案。',
    category: 'RAG',
    sourceType: 'manual',
    sourceName: '运营录入',
    tags: ['RAG', '知识库', '评测'],
    useCases: ['企业知识库', '课程资料问答', '客服检索'],
    inputSpec: '文档类型、目标问答场景、权限要求',
    outputSpec: '架构方案、数据流程、评测指标、工具选型',
    maturity: 'ready',
    score: 93,
    isFeatured: true,
  },
  {
    name: 'Prompt 评测集生成',
    description: '为提示词、Agent 或 RAG 系统生成覆盖常见路径、边界条件和失败样例的评测集。',
    category: 'Evaluation',
    sourceType: 'manual',
    sourceName: '运营录入',
    tags: ['Prompt', 'Eval', '质量控制'],
    useCases: ['上线前回归测试', '模型替换评估', '提示词优化'],
    inputSpec: '任务说明、成功标准、历史失败案例',
    outputSpec: '测试用例、评分标准、回归建议',
    maturity: 'ready',
    score: 92,
    isFeatured: true,
  },
  {
    name: '长文内容再创作',
    description: '把报告、论文、访谈或长视频转成摘要、公众号稿、短视频脚本和知识卡片。',
    category: 'Content',
    sourceType: 'manual',
    sourceName: '运营录入',
    tags: ['内容', '摘要', '新媒体'],
    useCases: ['资讯再加工', '课程内容拆解', '社群运营'],
    inputSpec: '原文、目标平台、受众画像、语气',
    outputSpec: '摘要、标题组、正文、分发素材',
    maturity: 'ready',
    score: 90,
  },
  {
    name: 'AI 工具入库审核',
    description: '对用户提交的 AI 工具进行分类、去重、定价判断、标签生成和风险标注。',
    category: 'Operations',
    sourceType: 'manual',
    sourceName: '运营录入',
    tags: ['工具库', '审核', '运营'],
    useCases: ['工具提交审核', '批量采集清洗', '分类治理'],
    inputSpec: '工具名称、官网、描述、GitHub 链接',
    outputSpec: '分类、标签、摘要、审核建议',
    maturity: 'ready',
    score: 91,
  },
  {
    name: 'MCP 工具接入设计',
    description: '为外部 API、数据库或本地工具设计 MCP server 的资源、工具和权限边界。',
    category: 'Engineering',
    sourceType: 'project-capability',
    sourceName: 'Model Context Protocol',
    sourceUrl: 'https://github.com/modelcontextprotocol/servers',
    tags: ['MCP', '工具调用', 'Agent'],
    useCases: ['Agent 工具扩展', '内部系统接入', '自动化工作台'],
    inputSpec: '目标系统 API、鉴权方式、可执行动作',
    outputSpec: 'MCP 工具清单、schema、权限和测试方案',
    maturity: 'candidate',
    score: 89,
  },
  {
    name: '自动化工作流编排',
    description: '把信息采集、清洗、模型处理和外部通知串成可复用工作流。',
    category: 'Automation',
    sourceType: 'project-capability',
    sourceName: 'n8n / Activepieces',
    sourceUrl: 'https://github.com/n8n-io/n8n',
    tags: ['Workflow', '自动化', '集成'],
    useCases: ['日报生成', '线索同步', '内容分发'],
    inputSpec: '触发器、数据源、处理步骤、目标渠道',
    outputSpec: '工作流结构、节点配置、异常处理',
    maturity: 'candidate',
    score: 88,
  },
  {
    name: '软件工程 Agent 任务拆解',
    description: '把需求拆成代码定位、修改计划、测试验证、提交说明和风险回滚。',
    category: 'Engineering',
    sourceType: 'project-capability',
    sourceName: 'OpenHands / SWE-agent',
    sourceUrl: 'https://github.com/All-Hands-AI/OpenHands',
    tags: ['AI 编程', '软件工程', 'Agent'],
    useCases: ['Issue 修复', '功能开发', '代码审查'],
    inputSpec: '需求描述、仓库路径、约束条件',
    outputSpec: '执行计划、代码修改、测试结果、变更说明',
    maturity: 'candidate',
    score: 90,
    isFeatured: true,
  },
  {
    name: '多模态素材生成',
    description: '为网站、课程和社群运营生成封面图、插图、视频脚本和视觉提示词。',
    category: 'Creative',
    sourceType: 'manual',
    sourceName: '运营录入',
    tags: ['图像生成', '视频', '运营素材'],
    useCases: ['资讯封面', '课程海报', '短视频分镜'],
    inputSpec: '主题、风格、尺寸、品牌约束',
    outputSpec: '提示词、素材清单、分镜脚本',
    maturity: 'candidate',
    score: 86,
  },
]

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

function hashText(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i++) hash = Math.imul(31, hash) + value.charCodeAt(i)
  return Math.abs(hash).toString(36)
}

function makeSlug(value: string, fallbackPrefix = 'item') {
  const slug = slugify(value, { lower: true, strict: true, locale: 'zh' })
  return slug || `${fallbackPrefix}-${hashText(value)}`
}

async function uniqueNewsSlug(base: string) {
  let slug = base
  let index = 2
  while (await prisma.news.findUnique({ where: { slug } })) {
    slug = `${base}-${index++}`
  }
  return slug
}

async function fetchText(url: string, timeoutMs = 15000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AIHub-Agent-Resource-Collector/1.0',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.text()
  } finally {
    clearTimeout(timeout)
  }
}

async function importNews() {
  let inserted = 0
  let updated = 0

  for (const source of NEWS_SOURCES) {
    try {
      const xml = await fetchText(source.url)
      const feed = await rssParser.parseString(xml)
      const items = (feed.items || []).slice(0, source.limit || 10)

      for (const item of items) {
        const title = cleanText(item.title || '')
        const link = item.link || item.guid || ''
        if (!title || !link) continue

        const rawContent = (item as any)['content:encoded'] || item.content || item.summary || item.contentSnippet || ''
        const content = cleanText(rawContent)
        const summary = cleanText(item.contentSnippet || item.summary || content).slice(0, 320)
        const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date()
        const existing = await prisma.news.findFirst({ where: { sourceUrl: link } })

        if (existing) {
          await prisma.news.update({
            where: { id: existing.id },
            data: {
              title,
              summary: summary || existing.summary,
              content: content || existing.content,
              sourceName: source.name,
              publishedAt,
              isAutoCrawled: true,
            },
          })
          updated++
        } else {
          const datePrefix = publishedAt.toISOString().slice(0, 10).replace(/-/g, '')
          const slug = await uniqueNewsSlug(makeSlug(`${datePrefix}-${title}`, 'news'))
          await prisma.news.create({
            data: {
              title,
              slug,
              summary: summary || title,
              content: content || summary || title,
              sourceName: source.name,
              sourceUrl: link,
              publishedAt,
              isAutoCrawled: true,
            },
          })
          inserted++
        }
      }
      console.log(`[news] ${source.name}: ${items.length} items processed`)
    } catch (error) {
      console.warn(`[news] ${source.name} skipped: ${(error as Error).message}`)
    }
  }

  const currentNewsCount = await prisma.news.count()
  if (currentNewsCount < 30) {
    for (const item of CURATED_NEWS) {
      await prisma.news.upsert({
        where: { slug: item.slug },
        update: {
          title: item.title,
          summary: item.summary,
          content: item.content,
          sourceName: item.sourceName,
          isAutoCrawled: false,
          publishedAt: new Date(),
        },
        create: {
          ...item,
          isAutoCrawled: false,
          publishedAt: new Date(),
        },
      })
      inserted++
    }
  }

  return { inserted, updated }
}

async function searchGithub(query: string): Promise<GithubRepo[]> {
  const url = new URL('https://api.github.com/search/repositories')
  url.searchParams.set('q', query)
  url.searchParams.set('sort', 'stars')
  url.searchParams.set('order', 'desc')
  url.searchParams.set('per_page', '100')

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'AIHub-Agent-Resource-Collector/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`

  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`GitHub search failed ${response.status}`)
  const data = await response.json()
  return (data.items || []) as GithubRepo[]
}

function fallbackRepos(): GithubRepo[] {
  return FALLBACK_REPOS.map(([fullName], index) => {
    const name = fullName.split('/')[1]
    return {
      full_name: fullName,
      name,
      html_url: `https://github.com/${fullName}`,
      homepage: null,
      description: `${fullName} 是 AI Hub 预置的开源 AI 项目候选，等待下一次 GitHub API 同步补齐实时数据。`,
      stargazers_count: 0,
      forks_count: 0,
      language: null,
      topics: ['ai', 'github-top-100'],
      updated_at: new Date().toISOString(),
    }
  })
}

function categorySlugByName(name: string) {
  return GITHUB_CATEGORIES.find(category => category.name === name)?.slug || 'llm-apps'
}

function directionForRepo(repo: GithubRepo, hints: Map<string, { direction: string; category: string }>) {
  const hinted = hints.get(repo.full_name.toLowerCase())
  if (hinted) return hinted

  const text = `${repo.full_name} ${repo.description || ''} ${(repo.topics || []).join(' ')}`.toLowerCase()
  if (text.includes('rag') || text.includes('retrieval') || text.includes('vector')) return { direction: 'RAG', category: 'RAG' }
  if (text.includes('agent') || text.includes('autogen') || text.includes('crew')) return { direction: 'Agent', category: 'AI Agent' }
  if (text.includes('coding') || text.includes('code') || text.includes('developer') || text.includes('swe')) return { direction: 'AI 编程', category: 'AI 编程' }
  if (text.includes('stable-diffusion') || text.includes('image') || text.includes('audio') || text.includes('voice')) return { direction: '生成式 AI', category: '生成式 AI' }
  if (text.includes('serving') || text.includes('inference') || text.includes('runtime') || text.includes('gateway')) return { direction: '模型服务', category: '模型服务' }
  if (text.includes('workflow') || text.includes('automation')) return { direction: '自动化', category: '自动化' }
  return { direction: 'LLM 应用', category: 'LLM 应用' }
}

function repoReason(repo: GithubRepo, direction: string, rank: number, estimated: boolean) {
  const topicText = (repo.topics || []).slice(0, 5).join(', ')
  const basis = estimated
    ? '预置候选排序，等待联网同步 GitHub stars'
    : `${repo.stargazers_count.toLocaleString()} stars`
  return `#${rank} 入选 ${direction} 方向，依据 ${basis}${topicText ? `、主题 ${topicText}` : ''} 和项目描述综合排序。适合用于项目选型、二次开发调研和 Agent 社区榜单解读。`
}

async function importGithubTop100() {
  for (const category of GITHUB_CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: category,
      create: category,
    })
  }

  const hints = new Map<string, { direction: string; category: string }>()
  for (const [fullName, direction, category] of FALLBACK_REPOS) {
    hints.set(fullName.toLowerCase(), { direction, category })
  }

  const repoMap = new Map<string, GithubRepo>()
  for (const config of GITHUB_QUERIES) {
    try {
      const repos = await searchGithub(config.query)
      for (const repo of repos) {
        const key = repo.full_name.toLowerCase()
        if (!repoMap.has(key)) repoMap.set(key, repo)
        hints.set(key, { direction: config.direction, category: config.category })
      }
      console.log(`[github] ${config.query}: ${repos.length} repos`)
    } catch (error) {
      console.warn(`[github] ${config.query} skipped: ${(error as Error).message}`)
    }
  }

  let repos = Array.from(repoMap.values())
  let estimated = false
  if (repos.length < 100) {
    estimated = repos.length === 0
    for (const repo of fallbackRepos()) {
      if (!repoMap.has(repo.full_name.toLowerCase())) repoMap.set(repo.full_name.toLowerCase(), repo)
    }
    repos = Array.from(repoMap.values())
  }

  repos = repos
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 100)

  let imported = 0
  for (let index = 0; index < repos.length; index++) {
    const repo = repos[index]
    const rank = index + 1
    const isEstimated = estimated || repo.stargazers_count === 0
    const { direction, category } = directionForRepo(repo, hints)
    const categoryRecord = await prisma.category.findUnique({ where: { slug: categorySlugByName(category) } })
    const tags = [
      'GitHub Top 100',
      direction,
      category,
      ...(repo.language ? [repo.language] : []),
      ...(repo.topics || []),
    ]
      .map(tag => tag.trim())
      .filter(Boolean)
      .filter((tag, i, arr) => arr.indexOf(tag) === i)
      .slice(0, 10)

    const meta = {
      rank,
      direction,
      reason: repoReason(repo, direction, rank, isEstimated),
      repo: repo.full_name,
      forks: repo.forks_count || 0,
      language: repo.language,
      topics: repo.topics || [],
      estimated,
      updatedAt: repo.updated_at,
    }

    const slug = makeSlug(`github-${repo.full_name.replace('/', '-')}`, 'github')
    await prisma.tool.upsert({
      where: { slug },
      update: {
        name: repo.full_name,
        description: repo.description || repo.full_name,
        shortDesc: repo.description || `${repo.full_name} open-source AI project`,
        websiteUrl: repo.homepage || repo.html_url,
        githubUrl: repo.html_url,
        categoryId: categoryRecord?.id,
        pricingType: 'OPEN_SOURCE',
        isOpenSource: true,
        tags: tags.join(','),
        features: JSON.stringify(meta),
        source: 'github-top-100',
        sourceUrl: repo.html_url,
        stars: repo.stargazers_count,
        upvotes: 1000 - rank,
        isFeatured: rank <= 20,
        isActive: true,
        status: 'approved',
        reviewedAt: new Date(),
        publishedAt: new Date(),
      },
      create: {
        name: repo.full_name,
        slug,
        description: repo.description || repo.full_name,
        shortDesc: repo.description || `${repo.full_name} open-source AI project`,
        websiteUrl: repo.homepage || repo.html_url,
        githubUrl: repo.html_url,
        categoryId: categoryRecord?.id,
        pricingType: 'OPEN_SOURCE',
        isOpenSource: true,
        tags: tags.join(','),
        features: JSON.stringify(meta),
        source: 'github-top-100',
        sourceUrl: repo.html_url,
        stars: repo.stargazers_count,
        upvotes: 1000 - rank,
        isFeatured: rank <= 20,
        isActive: true,
        status: 'approved',
        reviewedAt: new Date(),
        publishedAt: new Date(),
      },
    })
    imported++
  }

  return { imported, estimated }
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

function skillCategory(text: string) {
  const value = text.toLowerCase()
  if (value.includes('rag') || value.includes('knowledge') || value.includes('pdf')) return 'RAG'
  if (value.includes('frontend') || value.includes('ui') || value.includes('design')) return 'Design'
  if (value.includes('image') || value.includes('video') || value.includes('visual')) return 'Creative'
  if (value.includes('spreadsheet') || value.includes('document') || value.includes('ppt') || value.includes('pdf')) return 'Office'
  if (value.includes('mcp') || value.includes('api') || value.includes('server')) return 'Engineering'
  if (value.includes('test') || value.includes('browser')) return 'Evaluation'
  if (value.includes('agent') || value.includes('automation')) return 'Automation'
  return 'General'
}

async function findSkillFiles(root: string, maxFiles = 180) {
  const results: string[] = []

  async function walk(dir: string, depth: number) {
    if (results.length >= maxFiles || depth > 8) return
    let entries: Array<{ name: string; isFile(): boolean; isDirectory(): boolean }>
    try {
      entries = (await fs.readdir(dir, { withFileTypes: true })) as unknown as Array<{
        name: string
        isFile(): boolean
        isDirectory(): boolean
      }>
    } catch {
      return
    }

    for (const entry of entries) {
      if (results.length >= maxFiles) return
      const current = path.join(dir, entry.name)
      if (entry.isFile() && entry.name === 'SKILL.md') {
        results.push(current)
      } else if (entry.isDirectory()) {
        if (['node_modules', '.git'].includes(entry.name)) continue
        await walk(current, depth + 1)
      }
    }
  }

  await walk(root, 0)
  return results
}

async function importLocalSkills() {
  const roots = [
    path.join(process.cwd(), '.agents', 'skills'),
    path.join(process.cwd(), '.codex', 'skills'),
    path.join(process.cwd(), 'skills'),
    path.join(process.cwd(), 'agent-skills'),
  ]

  const files = (await Promise.all(roots.map(root => findSkillFiles(root)))).flat()
  let imported = 0

  for (const file of files) {
    try {
      const markdown = await fs.readFile(file, 'utf8')
      const frontMatter = parseFrontMatter(markdown)
      const name = frontMatter.name || path.basename(path.dirname(file))
      const description = frontMatter.description || cleanText(markdown.replace(/^---[\s\S]*?---/, '')).slice(0, 260)
      const category = skillCategory(`${name} ${description}`)
      const slug = makeSlug(`local-${name}`, 'skill')
      const relativeSource = path.relative(process.cwd(), file).replace(/\\/g, '/')

      await prisma.skillResource.upsert({
        where: { slug },
        update: {
          name,
          description,
          category,
          sourceType: 'local',
          sourceName: 'Project local skills',
          sourceUrl: relativeSource,
          tags: [category, 'local-skill', name].join(','),
          useCases: description,
          maturity: 'ready',
          score: 80,
          isActive: true,
        },
        create: {
          name,
          slug,
          description,
          category,
          sourceType: 'local',
          sourceName: 'Project local skills',
          sourceUrl: relativeSource,
          tags: [category, 'local-skill', name].join(','),
          useCases: description,
          maturity: 'ready',
          score: 80,
          isActive: true,
        },
      })
      imported++
    } catch {
      // Ignore unreadable local skill files.
    }
  }

  return imported
}

async function importCuratedSkills() {
  let imported = 0
  for (const item of CURATED_SKILLS) {
    const slug = makeSlug(`curated-${item.name}`, 'skill')
    await prisma.skillResource.upsert({
      where: { slug },
      update: {
        name: item.name,
        description: item.description,
        category: item.category,
        sourceType: item.sourceType,
        sourceName: item.sourceName,
        sourceUrl: item.sourceUrl,
        tags: item.tags.join(','),
        useCases: item.useCases.join('\n'),
        inputSpec: item.inputSpec,
        outputSpec: item.outputSpec,
        maturity: item.maturity || 'candidate',
        score: item.score || 70,
        isFeatured: item.isFeatured || false,
        isActive: true,
      },
      create: {
        name: item.name,
        slug,
        description: item.description,
        category: item.category,
        sourceType: item.sourceType,
        sourceName: item.sourceName,
        sourceUrl: item.sourceUrl,
        tags: item.tags.join(','),
        useCases: item.useCases.join('\n'),
        inputSpec: item.inputSpec,
        outputSpec: item.outputSpec,
        maturity: item.maturity || 'candidate',
        score: item.score || 70,
        isFeatured: item.isFeatured || false,
        isActive: true,
      },
    })
    imported++
  }
  return imported
}

async function main() {
  console.log('Collecting AI news, GitHub Top 100 projects, and skill resources...')

  const news = await importNews()
  console.log(`[done] news inserted=${news.inserted}, updated=${news.updated}`)

  const github = await importGithubTop100()
  console.log(`[done] github top projects imported=${github.imported}, estimated=${github.estimated}`)

  const localSkills = await importLocalSkills()
  const curatedSkills = await importCuratedSkills()
  console.log(`[done] skills local=${localSkills}, curated=${curatedSkills}`)

  const totals = {
    news: await prisma.news.count(),
    githubTop100: await prisma.tool.count({ where: { source: 'github-top-100', isOpenSource: true, isActive: true } }),
    skills: await prisma.skillResource.count({ where: { isActive: true } }),
  }
  console.log(`[totals] ${JSON.stringify(totals)}`)
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
