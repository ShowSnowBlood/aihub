import Link from 'next/link'
import { ArrowLeft, Github, ShieldCheck } from 'lucide-react'
import {
  getGithubConfigStatus,
  loadLocalGithubToken,
  testGithubToken,
} from '@/lib/collector-github-config'
import GithubConfigForm from './GithubConfigForm'

export const metadata = {
  title: 'GitHub 配置 | AI Hub Collector',
  description: '配置 GitHub Token，用于 AIHub 采集后台的 GitHub Skill 索引和榜单采集。',
}

export const dynamic = 'force-dynamic'

export default async function CollectorSettingsPage() {
  loadLocalGithubToken()
  const config = getGithubConfigStatus()
  const check = await testGithubToken().catch(error => ({
    ok: false,
    status: 503,
    message: error instanceof Error ? error.message : 'GitHub Token 检测暂时失败，可以在页面内重新检测。',
  }))

  return (
    <main className="min-h-screen bg-[#0b0f14] text-zinc-100">
      <header className="border-b border-zinc-800 bg-[#0f141b]">
        <div className="px-5 py-6 lg:px-8">
          <Link href="/collector" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-cyan-200">
            <ArrowLeft className="h-4 w-4" />
            返回采集后台
          </Link>

          <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-cyan-300">
                <Github className="h-4 w-4" />
                GitHub Collector Settings
                <span className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">Token 本地保存</span>
                <span className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">只读采集</span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">GitHub 采集配置</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                配置 GitHub Personal Access Token 后，GitHub Code Search、仓库扫描、skills.sh 源扩采会有更高限额和更稳定的结果。
              </p>
            </div>

            <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-xs leading-5 text-zinc-400">
              <div className="mb-1 flex items-center gap-2 text-zinc-200">
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
                安全边界
              </div>
              页面不会显示完整 token；删除按钮只删除本地 .env.local 中的配置。
            </div>
          </div>
        </div>
      </header>

      <div className="px-5 py-6 lg:px-8">
        <GithubConfigForm initialConfig={config} initialCheck={check} />
      </div>
    </main>
  )
}
