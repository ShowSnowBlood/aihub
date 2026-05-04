import { prisma } from '../src/lib/prisma'

const news = [
  {
    title: 'OpenAI发布GPT-5预览版，多模态能力大幅提升',
    slug: 'openai-gpt5-preview',
    summary: '新一代模型在图像理解、视频生成方面取得突破性进展，支持更长的上下文窗口和更准确的推理能力',
    content: `OpenAI近日正式对外发布GPT-5预览版，这是继GPT-4之后最重要的模型迭代。

**主要改进**

GPT-5在多模态能力上有了质的飞跃，不仅能处理文字和图像，还能够理解视频内容。在标准测试中，GPT-5在多项基准测试上超越了前代模型。

**上下文窗口扩展**

新版本支持高达20万token的上下文窗口，这意味着可以一次性处理超过15万字的长文本。

**可用性**

目前GPT-5预览版已向ChatGPT Plus和Pro用户开放，API接口预计下个月正式上线。`,
    sourceName: 'AI Hub',
    sourceUrl: '',
    publishedAt: new Date('2024-01-15'),
    viewCount: 12500,
    isAutoCrawled: false
  },
  {
    title: 'Google Gemini 2.0正式开源，性能超越GPT-4',
    slug: 'google-gemini2-open-source',
    summary: 'Google宣布开源最新大语言模型，社区反响热烈，开发者可以在本地部署和微调',
    content: `Google AI近日宣布将Gemini 2.0系列模型正式开源，这一举动震惊了整个AI社区。

**开源详情**

Gemini 2.0 Nano和Gemini 2.0 Flash两个版本现已在Hugging Face上公开。

**性能表现**

根据Google发布的基准测试结果，Gemini 2.0 Flash在多项任务上超越了GPT-4 Turbo。

**商业使用**

开源版本采用Apache 2.0许可证，允许商业使用。`,
    sourceName: 'GitHub',
    sourceUrl: 'https://github.com',
    publishedAt: new Date('2024-01-14'),
    viewCount: 8900,
    isAutoCrawled: true
  },
  {
    title: '2024年AI工具使用报告：ChatGPT仍居榜首',
    slug: '2024-ai-tools-report',
    summary: '年度调查显示，AI工具渗透率持续上升，企业级应用增长显著，编程助手类产品增速最快',
    content: `近日，知名研究机构发布了《2024年全球AI工具使用报告》，对全球超过10万名用户进行了调研。

**核心发现**

1. ChatGPT以67%的使用率继续领跑市场
2. AI编程助手增速最快，同比增长230%
3. 企业采购AI工具的预算同比增加了150%

**趋势预测**

报告预测，2025年全球AI工具市场规模将突破1000亿美元。`,
    sourceName: 'AI Hub',
    sourceUrl: '',
    publishedAt: new Date('2024-01-13'),
    viewCount: 6700,
    isAutoCrawled: false
  },
  {
    title: 'Midjourney V7发布，图像生成质量再创新高',
    slug: 'midjourney-v7-release',
    summary: '新版本在细节表现、文字渲染和风格一致性方面都有显著提升，支持更高分辨率输出',
    content: `Midjourney正式发布V7版本，这是该AI图像生成工具的又一次重大更新。

**主要特性**

- 文字渲染准确率提升80%
- 支持4K分辨率输出
- 风格一致性大幅改善
- 生成速度提升30%`,
    sourceName: 'Product Hunt',
    sourceUrl: 'https://producthunt.com',
    publishedAt: new Date('2024-01-12'),
    viewCount: 5400,
    isAutoCrawled: true
  },
  {
    title: 'Anthropic发布Claude 3，上下文窗口达20万token',
    slug: 'anthropic-claude3-release',
    summary: 'Claude 3系列模型在推理、数学和编程任务上表现优异，企业级API已开放申请',
    content: `Anthropic正式发布Claude 3系列模型，包括Claude 3 Haiku、Sonnet和Opus三个版本。

**模型特点**

- Haiku：最快响应，适合简单任务
- Sonnet：平衡性能与速度
- Opus：最强推理能力

**上下文窗口**

所有版本均支持20万token上下文窗口，可处理长文档分析。`,
    sourceName: 'Anthropic Blog',
    sourceUrl: 'https://anthropic.com',
    publishedAt: new Date('2024-01-11'),
    viewCount: 11200,
    isAutoCrawled: true
  },
  {
    title: 'Stable Diffusion 3开源，生成质量接近DALL-E 3',
    slug: 'stable-diffusion-3-open-source',
    summary: 'Stability AI发布最新版本，在文字渲染和复杂场景生成方面有重大突破',
    content: `Stability AI正式开源Stable Diffusion 3，这是目前最强的开源图像生成模型。

**技术突破**

- 采用新的扩散架构
- 文字渲染能力大幅提升
- 多主体场景生成更准确

**开源协议**

模型采用开放许可，可商业使用。`,
    sourceName: 'GitHub',
    sourceUrl: 'https://github.com',
    publishedAt: new Date('2024-01-10'),
    viewCount: 9800,
    isAutoCrawled: true
  }
]

async function main() {
  for (const item of news) {
    await prisma.news.upsert({
      where: { slug: item.slug },
      update: {},
      create: item
    })
  }
  console.log('Inserted', news.length, 'news articles')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
