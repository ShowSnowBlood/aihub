import { prisma } from '@/lib/prisma'

function makeSlug(value: string, fallbackPrefix = 'item') {
  const base = value
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
  return base || `${fallbackPrefix}-${Date.now().toString(36)}`
}

function splitList(value?: string | null) {
  if (!value) return []
  return value
    .split(/,|\n/)
    .map(item => item.trim())
    .filter(Boolean)
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

async function uniqueSlug(table: 'news' | 'tool' | 'skill', base: string) {
  let slug = base
  let index = 2

  while (true) {
    const existing =
      table === 'news'
        ? await prisma.news.findUnique({ where: { slug } })
        : table === 'tool'
          ? await prisma.tool.findUnique({ where: { slug } })
          : await prisma.skillResource.findUnique({ where: { slug } })
    if (!existing) return slug
    slug = `${base}-${index++}`
  }
}

async function categoryForGithub(name?: string | null) {
  if (!name) return null
  const slug = makeSlug(name, 'category')
  return prisma.category.upsert({
    where: { slug },
    update: {
      name,
      description: `${name} related AI projects`,
      icon: name.includes('RAG') ? 'Database' : name.includes('Agent') ? 'Bot' : 'Github',
    },
    create: {
      name,
      slug,
      description: `${name} related AI projects`,
      icon: name.includes('RAG') ? 'Database' : name.includes('Agent') ? 'Bot' : 'Github',
      sortOrder: 300,
    },
  })
}

export async function publishCollectionCandidate(candidateId: number, operator = 'local-admin') {
  const candidate = await prisma.collectionCandidate.findUnique({
    where: { id: candidateId },
  })

  if (!candidate) throw new Error('Candidate not found')
  if (candidate.status === 'published') return candidate

  let publishedRef = ''

  if (candidate.type === 'news') {
    const slug = await uniqueSlug('news', makeSlug(candidate.title, 'news'))
    const news = await prisma.news.create({
      data: {
        title: candidate.title,
        slug,
        summary: candidate.summary,
        summaryZh: candidate.summaryZh,
        content: candidate.contentSnippet || candidate.summary || candidate.title,
        sourceName: candidate.sourceName,
        sourceUrl: candidate.canonicalUrl || candidate.sourceUrl,
        author: candidate.author,
        publishedAt: candidate.publishedAt,
        isAutoCrawled: true,
      },
    })
    publishedRef = `news:${news.id}`
  } else if (candidate.type === 'github') {
    const raw = parseJson<Record<string, any>>(candidate.rawData, {})
    const category = await categoryForGithub(candidate.category)
    const slug = await uniqueSlug('tool', makeSlug(`github-${candidate.title}`, 'github'))
    const tags = splitList(candidate.tags)
    const tool = await prisma.tool.create({
      data: {
        name: candidate.title,
        slug,
        description: candidate.summary || candidate.contentSnippet,
        shortDesc: candidate.summary || candidate.title,
        websiteUrl: raw.homepage || candidate.canonicalUrl || candidate.sourceUrl,
        githubUrl: candidate.canonicalUrl || candidate.sourceUrl,
        categoryId: category?.id,
        pricingType: 'OPEN_SOURCE',
        isOpenSource: true,
        tags: tags.join(','),
        features: JSON.stringify({
          reason: candidate.highlights,
          direction: candidate.category,
          relatedSkills: candidate.relatedSkills,
          scoreDetail: candidate.scoreDetail,
        }),
        source: 'collector-github',
        sourceUrl: candidate.canonicalUrl || candidate.sourceUrl,
        stars: Number(raw.stars || 0),
        upvotes: candidate.score,
        isFeatured: candidate.score >= 80,
        isActive: true,
        status: 'approved',
        reviewedAt: new Date(),
        publishedAt: new Date(),
      },
    })
    publishedRef = `tool:${tool.id}`
  } else if (candidate.type === 'skill') {
    const slug = await uniqueSlug('skill', makeSlug(candidate.title, 'skill'))
    const skill = await prisma.skillResource.create({
      data: {
        name: candidate.title,
        slug,
        description: candidate.summary || candidate.contentSnippet,
        category: candidate.category || 'General',
        sourceType: candidate.sourceName?.includes('Project')
          ? 'project'
          : candidate.sourceName?.includes('Manual')
            ? 'manual'
            : 'collector',
        sourceName: candidate.sourceName,
        sourceUrl: candidate.canonicalUrl || candidate.sourceUrl,
        tags: candidate.tags,
        useCases: candidate.highlights,
        inputSpec: '由采集候选生成，发布后可由运营补充输入规范。',
        outputSpec: '由采集候选生成，发布后可由运营补充输出规范。',
        maturity: candidate.score >= 80 ? 'ready' : 'candidate',
        score: candidate.score,
        isFeatured: candidate.score >= 80,
        isActive: true,
      },
    })
    publishedRef = `skill:${skill.id}`
  }

  const updated = await prisma.collectionCandidate.update({
    where: { id: candidateId },
    data: {
      status: 'published',
      reviewedAt: new Date(),
      publishedRef,
    },
  })

  await prisma.collectionReviewAction.create({
    data: {
      candidateId,
      action: 'publish',
      operator,
      afterData: JSON.stringify({ publishedRef }),
    },
  })

  return updated
}

export async function updateCandidateStatus(candidateId: number, status: string, note?: string, operator = 'local-admin') {
  const updated = await prisma.collectionCandidate.update({
    where: { id: candidateId },
    data: {
      status,
      reviewNote: note,
      reviewedAt: new Date(),
    },
  })

  await prisma.collectionReviewAction.create({
    data: {
      candidateId,
      action: status,
      note,
      operator,
    },
  })

  return updated
}
