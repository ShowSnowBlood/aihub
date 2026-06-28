import { NextRequest, NextResponse } from 'next/server'
import {
  getGithubConfigStatus,
  loadLocalGithubToken,
  removeLocalGithubToken,
  saveGithubToken,
  testGithubToken,
} from '@/lib/collector-github-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  loadLocalGithubToken()
  const check = await testGithubToken().catch(error => ({
    ok: false,
    status: 503,
    message: error instanceof Error ? error.message : 'GitHub Token 检测失败。',
  }))
  return NextResponse.json({
    config: getGithubConfigStatus(),
    check,
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const token = typeof body.token === 'string' ? body.token : ''

  try {
    await saveGithubToken(token)
    const check = body.test === false ? null : await testGithubToken()

    return NextResponse.json({
      ok: true,
      config: getGithubConfigStatus(),
      check,
    })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'GitHub 配置保存失败',
      config: getGithubConfigStatus(),
    }, { status: 400 })
  }
}

export async function PATCH() {
  loadLocalGithubToken()
  const check = await testGithubToken().catch(error => ({
    ok: false,
    status: 503,
    message: error instanceof Error ? error.message : 'GitHub Token 检测暂时失败，请稍后重试。',
  }))

  return NextResponse.json({
    ok: check.ok,
    config: getGithubConfigStatus(),
    check,
  }, { status: check.ok ? 200 : 400 })
}

export async function DELETE() {
  await removeLocalGithubToken()

  return NextResponse.json({
    ok: true,
    config: getGithubConfigStatus(),
  })
}
