'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition } from 'react'
import type { MouseEvent } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Activity,
  BrainCircuit,
  Database,
  FileText,
  Fingerprint,
  Gauge,
  Github,
  Globe2,
  PackageCheck,
  RefreshCw,
  Search,
  Server,
  SlidersHorizontal,
  Table2,
  Terminal,
  Newspaper,
  type LucideIcon,
} from 'lucide-react'

type CollectorScope = 'collector' | 'settings'
type CollectorLayout = 'sidebar' | 'tabs'

type SwitchItem = {
  page: string
  label: string
  icon: LucideIcon
}

type QuickLink = {
  href: string
  label: string
  icon: LucideIcon
}

type Props = {
  scope: CollectorScope
  layout: CollectorLayout
  basePath: string
}

const collectorPages: SwitchItem[] = [
  { page: 'overview', label: '总览', icon: Gauge },
  { page: 'core', label: '核心表', icon: Table2 },
  { page: 'command', label: '本地控制台', icon: Terminal },
  { page: 'skills-sh', label: 'skills.sh', icon: RefreshCw },
  { page: 'ai-news', label: 'AI 资讯', icon: Newspaper },
  { page: 'prompts', label: '提示词库', icon: FileText },
  { page: 'sources', label: '数据源', icon: Globe2 },
  { page: 'tools', label: '采集工具', icon: SlidersHorizontal },
  { page: 'runs', label: '任务监控', icon: Activity },
  { page: 'skills', label: 'Skill 原始库', icon: Database },
  { page: 'capabilities', label: '能力画像', icon: Fingerprint },
  { page: 'deepseek', label: 'DeepSeek 增强', icon: BrainCircuit },
  { page: 'deploy', label: '部署包', icon: PackageCheck },
]

const settingsPages: SwitchItem[] = [
  { page: 'github', label: 'GitHub', icon: Github },
  { page: 'ai-api', label: 'AI API', icon: BrainCircuit },
]

const collectorQuickLinks: QuickLink[] = [
  { href: '/collector/settings', label: '采集配置', icon: Github },
  { href: '/skills', label: '所有 Skill', icon: Database },
]

function normalizePage(scope: CollectorScope, value: string | null) {
  if (scope === 'settings') return value === 'ai-api' ? 'ai-api' : 'github'
  return collectorPages.some(item => item.page === value) ? value as string : 'overview'
}

function buildHref(basePath: string, page: string) {
  return `${basePath}?page=${page}`
}

export default function CollectorSwitchNav({ scope, layout, basePath }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pendingPage, setPendingPage] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const items = scope === 'settings' ? settingsPages : collectorPages
  const currentPage = normalizePage(scope, searchParams.get('page'))
  const isSettingsShell = scope === 'collector' && layout === 'sidebar' && pathname.startsWith('/collector/settings')
  const displayedPage = pendingPage || (isSettingsShell ? '' : currentPage)
  const quickLinks = scope === 'collector' && layout === 'sidebar' ? collectorQuickLinks : []

  const itemHrefs = useMemo(() => items.map(item => buildHref(basePath, item.page)), [basePath, items])
  const quickLinkHrefs = useMemo(() => quickLinks.map(item => item.href), [quickLinks])
  const isNavigating = Boolean(pendingPage && pendingPage !== currentPage)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      itemHrefs.forEach(href => {
        void router.prefetch(href)
      })
      quickLinkHrefs.forEach(href => {
        void router.prefetch(href)
      })
    }, 180)

    return () => window.clearTimeout(timer)
  }, [quickLinkHrefs, itemHrefs, router])

  useEffect(() => {
    if (pendingPage && pendingPage === currentPage) {
      setPendingPage(null)
    }
  }, [currentPage, pendingPage])

  const handleNavigate = (event: MouseEvent<HTMLAnchorElement>, page: string, href: string) => {
    if (page === currentPage && pathname === basePath) return
    if (event.defaultPrevented) return
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    setPendingPage(page)
    startTransition(() => {
      router.push(href)
    })
  }

  if (layout === 'sidebar') {
    return (
      <nav className="mt-8 space-y-1">
        {items.map(item => {
          const href = buildHref(basePath, item.page)
          const active = displayedPage === item.page
          const pending = isNavigating && pendingPage === item.page
          return (
            <Link
              key={item.page}
              href={href}
              aria-current={active ? 'page' : undefined}
              onClick={event => handleNavigate(event, item.page, href)}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${active ? 'border border-cyan-400/40 bg-cyan-400/10 text-cyan-100' : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'} ${pending ? 'ring-1 ring-cyan-400/25' : ''}`}
            >
              <item.icon className={`h-4 w-4 ${active ? 'text-cyan-200' : 'text-zinc-500'} ${pending ? 'animate-spin' : ''}`} />
              {item.label}
            </Link>
          )
        })}
        {quickLinks.length > 0 && <div className="my-3 border-t border-zinc-800" />}
        {quickLinks.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
          >
            <item.icon className="h-4 w-4 text-zinc-500" />
            {item.label}
          </Link>
        ))}
        {isNavigating && (
          <div className="pt-1 text-[11px] text-cyan-200/80">正在切换…</div>
        )}
      </nav>
    )
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {items.map(item => {
        const href = buildHref(basePath, item.page)
        const active = displayedPage === item.page
        const pending = isNavigating && pendingPage === item.page
        return (
          <Link
            key={item.page}
            href={href}
            aria-current={active ? 'page' : undefined}
            onClick={event => handleNavigate(event, item.page, href)}
            className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-sm transition-all ${active ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-100' : 'border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100'} ${pending ? 'ring-1 ring-cyan-400/30' : ''}`}
          >
            <item.icon className={`h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
            {item.label}
          </Link>
        )
      })}
      {isNavigating && (
        <div className="ml-2 flex items-center text-[11px] text-cyan-200/80">
          <Server className="mr-1 h-3.5 w-3.5 animate-pulse" />
          正在切换
        </div>
      )}
    </div>
  )
}
