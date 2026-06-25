import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || undefined
  const type = searchParams.get('type') || undefined
  const limit = Math.min(Number(searchParams.get('limit') || 50), 100)

  const candidates = await prisma.collectionCandidate.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
    },
    include: {
      source: {
        select: {
          name: true,
          type: true,
          priority: true,
        },
      },
      cluster: {
        select: {
          title: true,
          heatScore: true,
        },
      },
    },
    orderBy: [{ score: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })

  return NextResponse.json({ candidates })
}
