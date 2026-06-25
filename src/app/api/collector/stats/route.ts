import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const [
    sourceCount,
    enabledSourceCount,
    pendingCount,
    newsCount,
    promptCount,
    githubCount,
    skillCount,
    failedSources,
    latestRuns,
    clusters,
  ] = await Promise.all([
    prisma.collectionSource.count(),
    prisma.collectionSource.count({ where: { enabled: true } }),
    prisma.collectionCandidate.count({ where: { status: 'pending' } }),
    prisma.collectionCandidate.count({ where: { type: 'news' } }),
    prisma.collectionCandidate.count({ where: { type: 'prompt' } }),
    prisma.collectionCandidate.count({ where: { type: 'github' } }),
    prisma.collectionCandidate.count({ where: { type: 'skill' } }),
    prisma.collectionSource.findMany({
      where: { lastStatus: 'failed' },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
    prisma.collectionRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 8,
      include: {
        source: {
          select: {
            name: true,
            type: true,
          },
        },
      },
    }),
    prisma.collectionCluster.findMany({
      orderBy: { heatScore: 'desc' },
      take: 8,
    }),
  ])

  return NextResponse.json({
    stats: {
      sourceCount,
      enabledSourceCount,
      pendingCount,
      newsCount,
      promptCount,
      githubCount,
      skillCount,
    },
    failedSources,
    latestRuns,
    clusters,
  })
}
