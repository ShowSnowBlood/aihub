import { NextRequest, NextResponse } from 'next/server'
import {
  getDeepSeekConfigStatus,
  loadLocalDeepSeekConfig,
  removeLocalDeepSeekConfig,
  saveDeepSeekConfig,
  testDeepSeekConfig,
} from '@/lib/deepseek-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  loadLocalDeepSeekConfig()
  const check = await testDeepSeekConfig().catch(error => ({
    ok: false,
    status: 503,
    message: error instanceof Error ? error.message : 'DeepSeek 检测失败。',
  }))
  return NextResponse.json({
    config: getDeepSeekConfigStatus(),
    check,
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const token = typeof body.token === 'string' ? body.token : undefined
  const apiUrl = typeof body.apiUrl === 'string' ? body.apiUrl : undefined
  const model = typeof body.model === 'string' ? body.model : undefined

  try {
    await saveDeepSeekConfig({ token, apiUrl, model })
    const check = body.test === false ? null : await testDeepSeekConfig()
    return NextResponse.json({
      ok: true,
      config: getDeepSeekConfigStatus(),
      check,
    })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'DeepSeek 配置保存失败',
      config: getDeepSeekConfigStatus(),
    }, { status: 400 })
  }
}

export async function PATCH() {
  loadLocalDeepSeekConfig()
  const check = await testDeepSeekConfig().catch(error => ({
    ok: false,
    status: 503,
    message: error instanceof Error ? error.message : 'DeepSeek 检测暂时失败，请稍后重试。',
  }))

  return NextResponse.json({
    ok: check.ok,
    config: getDeepSeekConfigStatus(),
    check,
  }, { status: check.ok ? 200 : 400 })
}

export async function DELETE() {
  await removeLocalDeepSeekConfig()
  return NextResponse.json({
    ok: true,
    config: getDeepSeekConfigStatus(),
  })
}
