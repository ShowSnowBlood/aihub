const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const newsData = [
  {
    title: 'OpenAI 发布 GPT-5：多模态能力大幅提升',
    slug: 'openai-gpt5-release',
    summary: 'OpenAI 正式发布了 GPT-5 模型，在推理能力、代码生成和多模态理解方面都有显著提升。新版本支持更长的上下文窗口，能够处理高达 200 万字的输入。',
    content: 'OpenAI 今日正式发布了备受期待的 GPT-5 模型。据官方介绍，GPT-5 在多个关键领域实现了突破性进展...',
    sourceName: 'AI前线',
    sourceUrl: 'https://example.com/news/1',
    imageUrl: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&q=80',
    author: 'AI 编辑部',
    publishedAt: new Date('2026-04-14'),
  },
  {
    title: 'Google Gemini 2.0 正式上线，挑战 GPT-5',
    slug: 'google-gemini-2-release',
    summary: 'Google 推出了 Gemini 2.0 版本，在数学推理和代码能力测试中超越了 GPT-5。新版本还增加了实时视频理解功能，可以分析直播视频流。',
    content: 'Google DeepMind 团队今日发布了 Gemini 2.0，这是其迄今为止最强大的 AI 模型...',
    sourceName: '科技日报',
    sourceUrl: 'https://example.com/news/2',
    imageUrl: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&q=80',
    author: '科技观察',
    publishedAt: new Date('2026-04-13'),
  },
  {
    title: 'Claude 4 发布：Anthropic 强调 AI 安全性',
    slug: 'anthropic-claude-4-release',
    summary: 'Anthropic 发布 Claude 4，在保持强大能力的同时，大幅提升了 AI 的安全性和可控性。新版本引入了"宪法 AI" 2.0 技术。',
    content: 'Anthropic 今日发布了 Claude 4，这是该公司在 AI 安全领域的重要里程碑...',
    sourceName: 'AI 安全观察',
    sourceUrl: 'https://example.com/news/3',
    imageUrl: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&q=80',
    author: '安全研究员',
    publishedAt: new Date('2026-04-12'),
  },
  {
    title: 'Meta 开源 Llama 4：最强开源大模型',
    slug: 'meta-llama-4-open-source',
    summary: 'Meta 发布了 Llama 4 系列模型，并完全开源。405B 参数版本在多项基准测试中接近 GPT-5 水平，为开源社区带来重大利好。',
    content: 'Meta AI 研究团队今日发布了 Llama 4 系列，包括 8B、70B 和 405B 三个版本...',
    sourceName: '开源中国',
    sourceUrl: 'https://example.com/news/4',
    imageUrl: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800&q=80',
    author: '开源社区',
    publishedAt: new Date('2026-04-11'),
  },
  {
    title: 'Midjourney V7 发布：图像生成进入新纪元',
    slug: 'midjourney-v7-release',
    summary: 'Midjourney 发布 V7 版本，支持文本渲染、一致角色生成和 4K 分辨率输出。新版本在理解复杂提示词方面有了质的飞跃。',
    content: 'Midjourney 今日发布了 V7 版本，这是其图像生成技术的重大突破...',
    sourceName: 'AI 绘画圈',
    sourceUrl: 'https://example.com/news/5',
    imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80',
    author: '创意编辑',
    publishedAt: new Date('2026-04-10'),
  },
  {
    title: 'Stable Diffusion 4 开源：图像模型新标杆',
    slug: 'stable-diffusion-4-release',
    summary: 'Stability AI 发布 Stable Diffusion 4，采用全新架构，生成速度提升 3 倍，质量媲美 Midjourney V7，且完全开源可商用。',
    content: 'Stability AI 今日发布了 Stable Diffusion 4，这是开源图像生成模型的重要里程碑...',
    sourceName: 'AI 研究院',
    sourceUrl: 'https://example.com/news/6',
    imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80',
    author: '研究员',
    publishedAt: new Date('2026-04-09'),
  },
]

async function main() {
  console.log('开始插入新闻数据...')
  
  for (const news of newsData) {
    await prisma.news.upsert({
      where: { slug: news.slug },
      update: news,
      create: news,
    })
    console.log(`✓ 已插入: ${news.title}`)
  }
  
  console.log('\n新闻数据插入完成！')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
