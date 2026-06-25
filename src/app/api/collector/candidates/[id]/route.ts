import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  const body = await request.json()
  if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const candidate = await prisma.collectionCandidate.update({
    where: { id },
    data: {
      title: body.title,
      summary: body.summary,
      summaryZh: body.summaryZh,
      tags: Array.isArray(body.tags) ? body.tags.join(',') : body.tags,
      category: body.category,
      relatedSkills: Array.isArray(body.relatedSkills) ? body.relatedSkills.join(',') : body.relatedSkills,
      relatedAgents: Array.isArray(body.relatedAgents) ? body.relatedAgents.join(',') : body.relatedAgents,
      reviewNote: body.reviewNote,
    },
  })

  return NextResponse.json({ candidate })
}
