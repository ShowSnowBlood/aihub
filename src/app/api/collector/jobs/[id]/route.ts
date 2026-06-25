import { NextResponse } from 'next/server'
import {
  collectorSourceSlugForCommand,
  getCollectorJob,
  readCollectorJobLog,
} from '@/lib/collector-runner'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const job = await getCollectorJob(params.id)
  if (!job) {
    return NextResponse.json({ ok: false, error: '任务不存在' }, { status: 404 })
  }

  const log = await readCollectorJobLog(job)
  const sourceSlug = collectorSourceSlugForCommand(job.commandId)
  const since = new Date(job.startedAt)
  const finishedAt = job.finishedAt ? new Date(job.finishedAt) : new Date()
  const source = sourceSlug && sourceSlug !== 'ai-news'
    ? await prisma.collectionSource.findUnique({
      where: { slug: sourceSlug },
      include: { _count: { select: { candidates: true, runs: true, externalSkills: true } } },
    }).catch(() => null)
    : null

  const sourceWhere = sourceSlug === 'ai-news'
    ? {
      source: {
        is: {
          OR: [
            { slug: { contains: 'ai-news' } },
            { type: { contains: 'RSS' } },
          ],
        },
      },
    }
    : sourceSlug
      ? { source: { is: { slug: sourceSlug } } }
      : {}

  const runWhere = sourceSlug === 'ai-news'
    ? {
      source: {
        is: {
          OR: [
            { slug: { contains: 'ai-news' } },
            { type: { contains: 'RSS' } },
          ],
        },
      },
      startedAt: { gte: since },
    }
    : sourceSlug
      ? { source: { is: { slug: sourceSlug } }, startedAt: { gte: since } }
      : { startedAt: { gte: since } }

  const candidateWhere: any = {
    updatedAt: { gte: since, lte: finishedAt },
    ...sourceWhere,
  }
  const externalSkillWhere: any = {
    collectedAt: { gte: since, lte: finishedAt },
    ...(sourceSlug && sourceSlug !== 'ai-news' ? { sourceSlug } : {}),
  }

  const runs = await prisma.collectionRun.findMany({
    where: runWhere as any,
    orderBy: { startedAt: 'desc' },
    take: 12,
    include: {
      source: {
        select: {
          slug: true,
          name: true,
          target: true,
          type: true,
        },
      },
    },
  }).catch(() => [])
  const candidateGroups = await prisma.collectionCandidate.groupBy({
    by: ['type', 'status'],
    where: candidateWhere,
    _count: { _all: true },
    orderBy: [{ type: 'asc' }, { status: 'asc' }],
  }).catch(() => [])
  const candidates = await prisma.collectionCandidate.findMany({
    where: candidateWhere,
    orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
    take: 40,
    select: {
      id: true,
      type: true,
      status: true,
      title: true,
      sourceName: true,
      category: true,
      score: true,
      sourceUrl: true,
      createdAt: true,
      summaryZh: true,
    },
  }).catch(() => [])
  const externalSkillGroups = await prisma.externalSkill.groupBy({
    by: ['sourceSlug', 'status'],
    where: externalSkillWhere,
    _count: { _all: true },
    orderBy: [{ sourceSlug: 'asc' }, { status: 'asc' }],
  }).catch(() => [])
  const externalSkills = await prisma.externalSkill.findMany({
    where: externalSkillWhere,
    orderBy: [{ heatScore: 'desc' }, { qualityScore: 'desc' }, { collectedAt: 'desc' }],
    take: 40,
    select: {
      id: true,
      sourceSlug: true,
      name: true,
      description: true,
      categoryZh: true,
      status: true,
      qualityScore: true,
      heatScore: true,
      stars: true,
      forks: true,
      downloads: true,
      sourceUrl: true,
      githubUrl: true,
      rawData: true,
      collectedAt: true,
    },
  }).catch(() => [])

  return NextResponse.json({
    ok: true,
    job,
    log,
    insight: {
      sourceSlug,
      source,
      runs,
      candidateGroups,
      candidates,
      externalSkillGroups,
      externalSkills,
    },
  })
}
