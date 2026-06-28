import {
  BrainCircuit,
  Github,
  Server,
  Settings,
} from 'lucide-react'
import {
  getGithubConfigStatus,
  loadLocalGithubToken,
} from '@/lib/collector-github-config'
import {
  getDeepSeekConfigStatus,
  loadLocalDeepSeekConfig,
} from '@/lib/deepseek-config'
import CollectorSwitchNav from '../CollectorSwitchNav'
import DeepSeekConfigForm from './DeepSeekConfigForm'
import GithubConfigForm from './GithubConfigForm'

export const metadata = {
  title: '采集配置 | AI Hub Collector',
  description: '配置 GitHub Token 和 AI API，用于 Skill 全量索引、知识库增强和增长调度。',
}

export const dynamic = 'force-dynamic'

type SettingsPage = 'github' | 'ai-api'

type PageProps = {
  searchParams?: {
    page?: string
  }
}

const settingTabs: Array<{ page: SettingsPage; label: string; icon: any; description: string }> = [
  { page: 'github', label: 'GitHub', icon: Github, description: 'Token、Core/Search 额度和自动采集使用状态。' },
  { page: 'ai-api', label: 'AI API', icon: BrainCircuit, description: 'DeepSeek API 地址、模型和连接检测。' },
]

function normalizePage(value?: string): SettingsPage {
  return value === 'ai-api' ? 'ai-api' : 'github'
}

const githubCheck = {
  ok: false,
  status: 0,
  message: '页面已就绪，点击“刷新额度”再检测 GitHub Token。',
}

const deepSeekCheck = {
  ok: false,
  status: 0,
  message: '页面已就绪，点击“检测连接”再验证 AI API。',
}

export default async function CollectorSettingsPage({ searchParams = {} }: PageProps) {
  const activePage = normalizePage(searchParams.page)
  const activeMeta = settingTabs.find(item => item.page === activePage) || settingTabs[0]

  loadLocalGithubToken()
  loadLocalDeepSeekConfig()

  const githubConfig = getGithubConfigStatus()
  const deepSeekConfig = getDeepSeekConfigStatus()

  return (
    <main className="min-h-screen bg-[#0b0f14] pl-64 text-zinc-100">
      <aside className="fixed left-0 top-0 h-screen w-64 overflow-y-auto border-r border-zinc-800 bg-[#0c1117] px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-cyan-400/10 text-cyan-200">
            <Server className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold text-white">AIHub Collector</div>
            <div className="text-xs text-zinc-500">数据采集后台</div>
          </div>
        </div>

        <CollectorSwitchNav scope="collector" layout="sidebar" basePath="/collector" />

        <div className="mt-6 rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-xs leading-5 text-zinc-400">
          <div className="mb-2 flex items-center gap-2 text-cyan-200">
            <Settings className="h-3.5 w-3.5" />
            自动读取
          </div>
          Token 和 AI API 只写入本地配置，常驻采集器下一轮会自动读取，不需要手动启动。
        </div>
      </aside>

      <header className="border-b border-zinc-800 bg-[#0f141b]">
        <div className="px-5 py-6 lg:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-cyan-300">
                <Settings className="h-4 w-4" />
                Collector Settings
                <span className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">本地 .env.local</span>
                <span className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">自动读取配置</span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">{activeMeta.label} 配置</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                {activeMeta.description} 保存后，常驻采集、知识库构建和增长计划会自动读取最新配置。
              </p>
            </div>

            <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-xs leading-5 text-zinc-400">
              <div className="mb-1 flex items-center gap-2 text-zinc-200">
                <BrainCircuit className="h-4 w-4 text-cyan-300" />
                安全边界
              </div>
              页面不回显完整 token，AI API 只做公开数据理解、分类和采集计划，不执行绕过登录、验证码、限速或未授权访问。
            </div>
          </div>
        </div>
      </header>

      <div className="space-y-5 px-5 py-6 lg:px-8">
        <div className="sticky top-0 z-20 -mx-5 border-b border-zinc-800 bg-[#0b0f14]/95 px-5 py-3 backdrop-blur lg:-mx-8 lg:px-8">
          <CollectorSwitchNav scope="settings" layout="tabs" basePath="/collector/settings" />
        </div>

        {activePage === 'github' ? (
          <GithubConfigForm initialConfig={githubConfig} initialCheck={githubCheck} />
        ) : (
          <DeepSeekConfigForm initialConfig={deepSeekConfig} initialCheck={deepSeekCheck} />
        )}
      </div>
    </main>
  )
}
