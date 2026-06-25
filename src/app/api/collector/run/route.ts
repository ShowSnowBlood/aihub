import { NextRequest, NextResponse } from 'next/server'
import {
  collectorCommandForSourceSlug,
  startCollectorJob,
} from '@/lib/collector-runner'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const sourceSlug = body.sourceSlug as string | undefined
  const commandId = collectorCommandForSourceSlug(sourceSlug)
  if (!commandId) {
    return NextResponse.json({
      ok: false,
      error: `未配置来源 ${sourceSlug} 的本地采集指令`,
    }, { status: 400 })
  }

  try {
    const job = await startCollectorJob(commandId)
    return NextResponse.json({
      ok: true,
      message: sourceSlug ? `已启动来源 ${sourceSlug}` : '已启动全量采集',
      job,
    })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : '采集任务启动失败',
    }, { status: 500 })
  }
}
