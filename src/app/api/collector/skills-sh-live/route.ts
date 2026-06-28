import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { listCollectorJobs, readCollectorJobLog } from '@/lib/collector-runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type BrowserState = {
  seen?: string[]
  lastSeenCount?: number
  lastRunAt?: string
  nextUrlIndex?: number
  nextUrlIndexUpdatedAt?: string
  discoveredPages?: Array<Record<string, any>>
  pages?: Record<string, any>
  runs?: Array<Record<string, any>>
  totals?: {
    totalSkills?: number
    allTimeTotal?: number
  }
  liveStats?: {
    totalSkills?: number
    allTimeTotal?: number
    fetchedAt?: string
  }
}

type GithubSourceState = {
  repoCount?: number
  nextRepoIndex?: number
  collectedCount?: number
}

type GithubIndexState = {
  nextQueryIndex?: number
  queryCount?: number
  processedQueries?: number
  collectedCount?: number
  rawFetches?: number
  usedFallback?: boolean
  updatedAt?: string
}

type SkillsShSearchState = {
  nextQueryIndex?: number
  queryCount?: number
  processedQueries?: number
  collectedCount?: number
  rateLimited?: boolean
  failures?: Array<{ query?: string; error?: string }>
  updatedAt?: string
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T
  } catch {
    return fallback
  }
}

function statePath(config: Record<string, any>, key: string, fallback: string) {
  const configured = String(config[key] || fallback)
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured)
}

function statePages(state: BrowserState) {
  return Object.entries(state.pages || {})
    .map(([url, data]) => ({ url, ...(data || {}) }))
    .sort((a, b) => Number(b.freshCount || 0) - Number(a.freshCount || 0))
    .slice(0, 12)
}

function formatDaemonNote(job: any) {
  if (!job) return '等待自动启动'
  return `常驻运行 · pid ${job.pid || '-'}`
}

function parseDaemonEvents(log: string) {
  const events = log
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('{') && line.endsWith('}'))
    .map(line => {
      try {
        return JSON.parse(line) as Record<string, any>
      } catch {
        return null
      }
    })
    .filter(Boolean) as Array<Record<string, any>>

  const latestCycle = [...events].reverse().find(event => event.event === 'cycle-start' || event.event === 'cycle-finished')
  const currentSource = [...events].reverse().find(event => event.event === 'source-start' || event.event === 'source-finished')
  const latestSync = [...events].reverse().find(event => event.event === 'sync-skill-library')
  const latestFinishedSources = events
    .filter(event => event.event === 'source-finished')
    .slice(-8)
    .map(event => ({
      cycle: Number(event.cycle || 0),
      source: String(event.source || ''),
      saved: Number(event.saved || 0),
      elapsedSeconds: Number(event.elapsedSeconds || 0),
    }))

  return {
    cycle: Number(latestCycle?.cycle || 0),
    cycleEvent: String(latestCycle?.event || ''),
    currentSource: currentSource ? String(currentSource.source || '') : '',
    currentSourceEvent: currentSource ? String(currentSource.event || '') : '',
    latestFinishedSources,
    latestSync: latestSync ? {
      scannedExternalSkills: Number(latestSync.scannedExternalSkills || 0),
      repos: Number(latestSync.repos || 0),
      synced: Number(latestSync.synced || 0),
      created: Number(latestSync.created || 0),
      updated: Number(latestSync.updated || 0),
      linkedExternalSkills: Number(latestSync.linkedExternalSkills || 0),
    } : null,
  }
}

const usableExternalSkillWhere = {
  AND: [
    {
      OR: [
        { sourceSlug: { contains: 'skills-sh' } },
        { sourceSlug: { contains: 'github' } },
      ],
    },
    {
      status: {
        notIn: ['ignored', 'low_quality', 'out_of_scope', 'needs_source', 'aggregated_source'],
      },
    },
  ],
}

export async function GET() {
  try {
    const since5m = new Date(Date.now() - 5 * 60 * 1000)
    const since30m = new Date(Date.now() - 30 * 60 * 1000)
    const sourceSlugs = [
      'skills-sh-browser-slow',
      'skills-sh-all',
      'skills-sh-search-index',
      'skills-sh-github-sources',
      'github-global-skill-index',
      'github-python-crawler-skill-index',
      'github-cybersecurity-skill-index',
    ]
    const [
      sources,
      skillSourceGroups,
      jobs,
      skillResourceTotal,
      linkedExternalSkillTotal,
      externalSkillTotal,
      externalCreated5m,
      externalUpdated5m,
      externalCreated30m,
      externalUpdated30m,
      skillResourceUpdated5m,
      skillResourceUpdated30m,
    ] = await Promise.all([
      prisma.collectionSource.findMany({
        where: { slug: { in: sourceSlugs } },
        select: {
          slug: true,
          enabled: true,
          config: true,
          lastStatus: true,
        },
      }),
      prisma.externalSkill.groupBy({
        by: ['sourceSlug'],
        where: usableExternalSkillWhere,
        _count: { _all: true },
      }),
      listCollectorJobs(12),
      prisma.skillResource.count({ where: { sourceType: 'external-skill', isActive: true } }),
      prisma.externalSkill.count({ where: { ...usableExternalSkillWhere, publishedRef: { not: null } } }),
      prisma.externalSkill.count({ where: usableExternalSkillWhere }),
      prisma.externalSkill.count({ where: { ...usableExternalSkillWhere, collectedAt: { gte: since5m } } }),
      prisma.externalSkill.count({ where: { ...usableExternalSkillWhere, updatedAt: { gte: since5m } } }),
      prisma.externalSkill.count({ where: { ...usableExternalSkillWhere, collectedAt: { gte: since30m } } }),
      prisma.externalSkill.count({ where: { ...usableExternalSkillWhere, updatedAt: { gte: since30m } } }),
      prisma.skillResource.count({ where: { updatedAt: { gte: since5m } } }),
      prisma.skillResource.count({ where: { updatedAt: { gte: since30m } } }),
    ])

    const sourceBySlug = new Map(sources.map(source => [source.slug, source]))
    const countFor = (slug: string) => skillSourceGroups.find(item => item.sourceSlug === slug)?._count._all || 0
    const skillsShSlow = sourceBySlug.get('skills-sh-browser-slow')
    const skillsShSearch = sourceBySlug.get('skills-sh-search-index')
    const skillsShGithub = sourceBySlug.get('skills-sh-github-sources')
    const githubGlobalIndex = sourceBySlug.get('github-global-skill-index')
    const githubPythonCrawlerIndex = sourceBySlug.get('github-python-crawler-skill-index')
    const githubCybersecurityIndex = sourceBySlug.get('github-cybersecurity-skill-index')
    const browserConfig = parseJson<Record<string, any>>(skillsShSlow?.config, {})
    const searchConfig = parseJson<Record<string, any>>(skillsShSearch?.config, {})
    const githubSourceConfig = parseJson<Record<string, any>>(skillsShGithub?.config, {})
    const githubIndexConfig = parseJson<Record<string, any>>(githubGlobalIndex?.config, {})
    const githubPythonCrawlerConfig = parseJson<Record<string, any>>(githubPythonCrawlerIndex?.config, {})
    const githubCybersecurityConfig = parseJson<Record<string, any>>(githubCybersecurityIndex?.config, {})

    const browserState = readJsonFile<BrowserState>(
      statePath(browserConfig, 'stateFile', '.collector-state/skills-sh-browser.json'),
      {},
    )
    const githubSourceState = readJsonFile<GithubSourceState>(
      statePath(githubSourceConfig, 'githubStateFile', '.collector-state/skills-sh-github-sources.json'),
      {},
    )
    const githubIndexState = readJsonFile<GithubIndexState>(
      statePath(githubIndexConfig, 'indexStateFile', '.collector-state/github-skill-index.json'),
      {},
    )
    const githubPythonCrawlerState = readJsonFile<GithubIndexState>(
      statePath(githubPythonCrawlerConfig, 'indexStateFile', '.collector-state/github-python-crawler-skill-index.json'),
      {},
    )
    const githubCybersecurityState = readJsonFile<GithubIndexState>(
      statePath(githubCybersecurityConfig, 'indexStateFile', '.collector-state/github-cybersecurity-skill-index.json'),
      {},
    )
    const skillsShSearchState = readJsonFile<SkillsShSearchState>(
      statePath(searchConfig, 'stateFile', '.collector-state/skills-sh-search-index.json'),
      {},
    )
    const browserLastRun = browserState.runs?.[browserState.runs.length - 1]
    const browserSeenCount = Array.isArray(browserState.seen)
      ? browserState.seen.length
      : Number(browserState.lastSeenCount || 0)
    const publicVisibleTotal = Number(browserState.totals?.totalSkills || browserState.liveStats?.totalSkills || browserLastRun?.totalSkills || 0)
    const installSignalTotal = Number(browserState.totals?.allTimeTotal || browserState.liveStats?.allTimeTotal || browserLastRun?.allTimeTotal || 0)
    const targetTotal = Number(publicVisibleTotal || browserConfig.totalTarget || 80000)
    const skillsShStatsSyncedAt = browserState.liveStats?.fetchedAt || browserState.lastRunAt || browserLastRun?.finishedAt || browserLastRun?.startedAt || null
    const daemonJob = jobs
      .filter(job => job.commandId === 'skills-sh-daemon' && job.status === 'running')
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
    const daemonLog = daemonJob ? await readCollectorJobLog(daemonJob, 28000) : ''
    const daemonEvents = parseDaemonEvents(daemonLog)
    const promptDaemonJob = jobs
      .filter(job => job.commandId === 'prompt-library-daemon' && job.status === 'running')
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
    const promptDaemonLog = promptDaemonJob ? await readCollectorJobLog(promptDaemonJob, 28000) : ''
    const promptDaemonEvents = parseDaemonEvents(promptDaemonLog)

    return NextResponse.json({
      ok: true,
      refreshedAt: new Date().toISOString(),
      data: {
        browserSeenCount,
        publicVisibleTotal,
        installSignalTotal,
        targetTotal,
        skillsShStatsSyncedAt,
        skillsShStatsMode: skillsShStatsSyncedAt ? '本地实时' : '本地缓存',
        skillsShBrowserTotal: countFor('skills-sh-browser-slow'),
        skillsShTotal: countFor('skills-sh-all'),
        skillsShSearchTotal: countFor('skills-sh-search-index'),
        skillsShGithubTotal: countFor('skills-sh-github-sources'),
        githubGlobalIndexTotal: countFor('github-global-skill-index'),
        githubPythonCrawlerTotal: countFor('github-python-crawler-skill-index'),
        githubCybersecurityTotal: countFor('github-cybersecurity-skill-index'),
        skillResourceTotal,
        linkedExternalSkillTotal,
        externalSkillTotal,
        recentActivity: {
          externalCreated5m,
          externalUpdated5m,
          externalCreated30m,
          externalUpdated30m,
          skillResourceUpdated5m,
          skillResourceUpdated30m,
        },
        skillsShSearchState: {
          nextQueryIndex: Number(skillsShSearchState.nextQueryIndex || 0),
          queryCount: Number(skillsShSearchState.queryCount || 0),
          processedQueries: Number(skillsShSearchState.processedQueries || 0),
          collectedCount: Number(skillsShSearchState.collectedCount || 0),
          rateLimited: Boolean(skillsShSearchState.rateLimited),
          updatedAt: skillsShSearchState.updatedAt || null,
          failures: Array.isArray(skillsShSearchState.failures) ? skillsShSearchState.failures.slice(-3) : [],
        },
        githubSourceState: {
          repoCount: Number(githubSourceState.repoCount || 0),
          nextRepoIndex: Number(githubSourceState.nextRepoIndex || 0),
          collectedCount: Number(githubSourceState.collectedCount || 0),
        },
        githubIndexState: {
          nextQueryIndex: Number(githubIndexState.nextQueryIndex || 0),
          queryCount: Number(githubIndexState.queryCount || 0),
          processedQueries: Number(githubIndexState.processedQueries || 0),
          collectedCount: Number(githubIndexState.collectedCount || 0),
          rawFetches: Number(githubIndexState.rawFetches || 0),
          usedFallback: Boolean(githubIndexState.usedFallback),
          updatedAt: githubIndexState.updatedAt || null,
        },
        githubPythonCrawlerState: {
          nextQueryIndex: Number(githubPythonCrawlerState.nextQueryIndex || 0),
          queryCount: Number(githubPythonCrawlerState.queryCount || 0),
          processedQueries: Number(githubPythonCrawlerState.processedQueries || 0),
          collectedCount: Number(githubPythonCrawlerState.collectedCount || 0),
          rawFetches: Number(githubPythonCrawlerState.rawFetches || 0),
          usedFallback: Boolean(githubPythonCrawlerState.usedFallback),
          updatedAt: githubPythonCrawlerState.updatedAt || null,
        },
        githubCybersecurityState: {
          nextQueryIndex: Number(githubCybersecurityState.nextQueryIndex || 0),
          queryCount: Number(githubCybersecurityState.queryCount || 0),
          processedQueries: Number(githubCybersecurityState.processedQueries || 0),
          collectedCount: Number(githubCybersecurityState.collectedCount || 0),
          rawFetches: Number(githubCybersecurityState.rawFetches || 0),
          usedFallback: Boolean(githubCybersecurityState.usedFallback),
          updatedAt: githubCybersecurityState.updatedAt || null,
        },
        skillsShDaemonStatus: daemonJob ? 'running' : 'starting',
        skillsShDaemonNote: formatDaemonNote(daemonJob),
        skillsShDaemonPid: daemonJob?.pid || null,
        skillsShDaemonStartedAt: daemonJob?.startedAt || null,
        promptDaemonStatus: promptDaemonJob ? 'running' : 'starting',
        promptDaemonNote: formatDaemonNote(promptDaemonJob),
        promptDaemonPid: promptDaemonJob?.pid || null,
        promptDaemonStartedAt: promptDaemonJob?.startedAt || null,
        promptDaemonEvents,
        daemonEvents,
        skillsShSourceStatus: skillsShSlow?.enabled ? skillsShSlow?.lastStatus || 'idle' : 'disabled',
        browserConfig: {
          stateFile: browserConfig.stateFile || '.collector-state/skills-sh-browser.json',
          browserLimit: Number(browserConfig.browserLimit || 80),
          scrollSteps: Number(browserConfig.scrollSteps || 10),
          delayMs: Number(browserConfig.delayMs || 1000),
          maxClicks: Number(browserConfig.maxClicks || 20),
          maxPagesPerRun: Number(browserConfig.maxPagesPerRun || 0),
          rotatePages: browserConfig.rotatePages !== false,
          includeSeen: Boolean(browserConfig.includeSeen),
        },
        browserRotation: {
          nextUrlIndex: Number(browserState.nextUrlIndex || 0),
          nextUrlIndexUpdatedAt: browserState.nextUrlIndexUpdatedAt || null,
          discoveredPageCount: Array.isArray(browserState.discoveredPages) ? browserState.discoveredPages.length : 0,
          lastRunAt: browserState.lastRunAt || null,
          lastRun: browserLastRun ? {
            url: browserLastRun.url || null,
            totalParsed: Number(browserLastRun.totalParsed || 0),
            emittedCount: Number(browserLastRun.emittedCount || 0),
            freshCount: Number(browserLastRun.freshCount || 0),
            replayCount: Number(browserLastRun.replayCount || 0),
            seenCount: Number(browserLastRun.seenCount || 0),
            startedAt: browserLastRun.startedAt || null,
            finishedAt: browserLastRun.finishedAt || null,
          } : null,
        },
        browserPages: statePages(browserState),
      },
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      refreshedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : '实时状态读取失败',
    }, { status: 500 })
  }
}
