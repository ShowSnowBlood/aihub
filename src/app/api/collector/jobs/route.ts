import { NextRequest, NextResponse } from 'next/server'
import {
  collectorCommandSpecs,
  listCollectorJobs,
  startCollectorJob,
  stopCollectorJob,
} from '@/lib/collector-runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const jobs = await listCollectorJobs(30)
  return NextResponse.json({
    commands: collectorCommandSpecs,
    jobs,
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const commandId = typeof body.commandId === 'string' ? body.commandId : ''

  try {
    const job = await startCollectorJob(commandId)
    return NextResponse.json({ ok: true, job })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : '任务启动失败',
    }, { status: 400 })
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const jobId = typeof body.jobId === 'string' ? body.jobId : ''

  try {
    const job = await stopCollectorJob(jobId)
    return NextResponse.json({ ok: true, job })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : '任务停止失败',
    }, { status: 400 })
  }
}
