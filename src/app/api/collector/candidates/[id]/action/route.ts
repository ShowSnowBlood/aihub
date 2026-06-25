import { NextRequest, NextResponse } from 'next/server'
import { publishCollectionCandidate, updateCandidateStatus } from '@/lib/collection'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  const body = await request.json()
  const action = body.action

  if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  if (action === 'publish') {
    const candidate = await publishCollectionCandidate(id)
    return NextResponse.json({ candidate })
  }

  if (['ignored', 'low_quality', 'returned', 'merged', 'pending'].includes(action)) {
    const candidate = await updateCandidateStatus(id, action, body.note)
    return NextResponse.json({ candidate })
  }

  return NextResponse.json({ error: 'unsupported action' }, { status: 400 })
}
