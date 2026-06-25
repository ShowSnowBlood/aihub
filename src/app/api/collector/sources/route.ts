import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const sourceWhere = {
  enabled: true,
  OR: [
    { slug: { contains: 'ai-news' } },
    { slug: { contains: 'prompt' } },
    { type: { contains: 'RSS' } },
    { type: { contains: 'Prompt' } },
    { slug: { contains: 'github' } },
    { slug: { contains: 'skills-sh' } },
    { type: { contains: 'GitHub' } },
    { type: { contains: 'Skills.sh' } },
    { url: { contains: 'skills.sh' } },
    { url: { contains: 'aishort.top' } },
  ],
}

const skillSourceWhere = {
  OR: [
    { sourceSlug: { contains: 'github' } },
    { sourceSlug: { contains: 'skills-sh' } },
  ],
}

export async function GET() {
  const [sources, sourceGroups, skillSourceGroups, categoryGroups] = await Promise.all([
    prisma.collectionSource.findMany({
      where: sourceWhere,
      orderBy: [{ target: 'asc' }, { priority: 'desc' }, { updatedAt: 'desc' }],
      include: {
        _count: {
          select: {
            candidates: true,
            runs: true,
            externalSkills: true,
          },
        },
      },
    }),
    prisma.collectionSource.groupBy({
      by: ['target', 'enabled'],
      where: sourceWhere,
      _count: { _all: true },
      orderBy: [{ target: 'asc' }, { enabled: 'desc' }],
    }),
    prisma.externalSkill.groupBy({
      by: ['sourceSlug'],
      where: skillSourceWhere,
      _count: { _all: true },
      orderBy: { _count: { sourceSlug: 'desc' } },
      take: 18,
    }),
    prisma.externalSkill.groupBy({
      by: ['categoryZh'],
      where: skillSourceWhere,
      _count: { _all: true },
      orderBy: { _count: { categoryZh: 'desc' } },
      take: 16,
    }),
  ])

  return NextResponse.json({
    ok: true,
    refreshedAt: new Date().toISOString(),
    data: {
      sources,
      sourceGroups,
      skillSourceGroups,
      categoryGroups,
    },
  })
}

export async function PATCH(request: NextRequest) {
  const body = await request.json()
  const id = Number(body.id)
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const source = await prisma.collectionSource.update({
    where: { id },
    data: {
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
      priority: typeof body.priority === 'number' ? body.priority : undefined,
      frequencyMins: typeof body.frequencyMins === 'number' ? body.frequencyMins : undefined,
      lastStatus: body.lastStatus,
    },
  })

  return NextResponse.json({ source })
}
