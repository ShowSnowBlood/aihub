import { NextResponse } from 'next/server'
import { listDeepSeekModels, loadLocalDeepSeekConfig } from '@/lib/deepseek-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/collector/deepseek-config/models
 * 从上游 DeepSeek /models 接口拉取可用模型列表，供配置表单下拉选择。
 */
export async function GET() {
  loadLocalDeepSeekConfig()
  const result = await listDeepSeekModels().catch(error => ({
    ok: false,
    models: [] as string[],
    error: error instanceof Error ? error.message : '获取模型失败。',
  }))

  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
