import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return new Response('Missing id', { status: 400 })
  }

  await prisma.share.update({
    where: { id: parseInt(id) },
    data: { status: 'rejected' }
  })

  redirect('/admin')
}
