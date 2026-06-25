import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { loadLocalGithubToken } from '@/lib/collector-github-config'

export type CollectorJobStatus = 'running' | 'success' | 'failed' | 'stopped' | 'unknown'

export type CollectorCommandSpec = {
  id: string
  label: string
  group: '采集' | '维护' | '诊断'
  description: string
  npmArgs: string[]
}

export type CollectorJob = {
  id: string
  commandId: string
  label: string
  group: CollectorCommandSpec['group']
  status: CollectorJobStatus
  pid?: number
  platform: NodeJS.Platform
  cwd: string
  command: string
  args: string[]
  displayCommand?: string
  logFile: string
  startedAt: string
  finishedAt?: string
  exitCode?: number | null
  signal?: NodeJS.Signals | string | null
  error?: string
}

const JOB_ROOT = path.join(process.cwd(), '.collector-state', 'jobs')

export const collectorCommandSpecs: CollectorCommandSpec[] = [
  {
    id: 'collector-all',
    label: '全量采集',
    group: '采集',
    description: '按当前启用源执行一次完整采集，覆盖 AI 资讯、GitHub 与 skills.sh。',
    npmArgs: ['run', 'collector:run'],
  },
  {
    id: 'ai-news',
    label: 'AI 资讯采集',
    group: '采集',
    description: '采集最新 AI 资讯、模型动态、产品发布、技术文章、行业新闻和研究进展 RSS 候选。',
    npmArgs: ['run', 'collector:news'],
  },
  {
    id: 'prompt-library',
    label: '提示词库采集',
    group: '采集',
    description: '采集 AiShort 社区提示词，按行业、角色、场景沉淀可复用提示词候选。',
    npmArgs: ['run', 'collector:prompts'],
  },
  {
    id: 'prompt-library-batch',
    label: '提示词库续爬',
    group: '采集',
    description: '按断点多轮续爬 AiShort 接口，适合把当前可见提示词库逐步补齐。',
    npmArgs: ['run', 'collector:batch-prompts', '--', '--rounds', '8', '--delay-ms', '2500', '--stop-after-empty', '2'],
  },
  {
    id: 'github-index',
    label: 'GitHub Skill 索引',
    group: '采集',
    description: '通过 GitHub Code Search 发现具体 SKILL.md 文件。',
    npmArgs: ['run', 'collector:source', '--', 'github-global-skill-index'],
  },
  {
    id: 'github-python-crawler-skills',
    label: 'Python 爬虫 Skill',
    group: '采集',
    description: '采集 GitHub 上 Python 爬虫、网页解析、浏览器自动化和数据采集类 Skill。',
    npmArgs: ['run', 'collector:source', '--', 'github-python-crawler-skill-index'],
  },
  {
    id: 'github-cybersecurity-skills',
    label: '网络攻防 Skill',
    group: '采集',
    description: '采集 GitHub 上网络安全、渗透测试、安全审计、OSINT 和应急响应类 Skill 元数据。',
    npmArgs: ['run', 'collector:source', '--', 'github-cybersecurity-skill-index'],
  },
  {
    id: 'skills-sh-all',
    label: 'skills.sh 公开页/API',
    group: '采集',
    description: '采集 skills.sh 公开可见数据，配置 token 后可走 API。',
    npmArgs: ['run', 'collector:source', '--', 'skills-sh-all'],
  },
  {
    id: 'skills-sh-search-index',
    label: 'skills.sh 搜索扩量',
    group: '采集',
    description: '调用 skills.sh 公开搜索 API，按关键词分片慢速扩量采集。',
    npmArgs: ['run', 'collector:source', '--', 'skills-sh-search-index'],
  },
  {
    id: 'skills-sh-browser-slow',
    label: 'skills.sh 慢爬',
    group: '采集',
    description: '使用浏览器慢速滚动与点击采集 skills.sh。',
    npmArgs: ['run', 'collector:source', '--', 'skills-sh-browser-slow'],
  },
  {
    id: 'skills-sh-daemon',
    label: 'GitHub + skills.sh 常驻同步',
    group: '采集',
    description: '后台常驻循环同步 GitHub 全网 Skill 索引与 skills.sh 全链路，结束每轮后同步到本地 SkillResource。',
    npmArgs: [
      'run',
      'collector:skills-sh-daemon',
      '--',
      '--sources',
      'skills-sh-all,skills-sh-browser-slow,skills-sh-search-index,skills-sh-github-sources,github-global-skill-index,github-python-crawler-skill-index,github-cybersecurity-skill-index',
      '--cycle-delay-ms',
      '60000',
      '--source-delay-ms',
      '3000',
    ],
  },
  {
    id: 'sync-external-skills',
    label: '同步到原技能库',
    group: '维护',
    description: '把 external_skills 按 GitHub 源仓库聚合，同步写入原项目 skill_resources 技能库。',
    npmArgs: ['run', 'collector:sync-skills', '--', '--limit', '50000', '--repo-limit', '5000'],
  },
  {
    id: 'skills-sh-github-sources',
    label: 'skills.sh 源文件扩采',
    group: '采集',
    description: '把 skills.sh 线索映射到 GitHub 具体 SKILL.md 或目录。',
    npmArgs: ['run', 'collector:source', '--', 'skills-sh-github-sources'],
  },
  {
    id: 'batch-skills',
    label: '批量循环采集',
    group: '采集',
    description: '循环执行 GitHub 全网、Python 爬虫、网络攻防 Skill 索引与 skills.sh 源扩采。',
    npmArgs: ['run', 'collector:batch-skills', '--', '--rounds', '20', '--delay-ms', '3000'],
  },
  {
    id: 'seed-sources',
    label: '同步源配置',
    group: '维护',
    description: '把当前 GitHub / skills.sh 数据源配置同步到数据库。',
    npmArgs: ['run', 'collector:seed-sources'],
  },
  {
    id: 'mark-stale-runs',
    label: '修正超时任务',
    group: '维护',
    description: '把长时间卡在 running 的任务标记为超时失败。',
    npmArgs: ['run', 'collector:admin', '--', 'mark-stale-runs', '--minutes', '10'],
  },
  {
    id: 'backfill-skill-links',
    label: '回填原始链接',
    group: '维护',
    description: '把 skills.sh 历史链接回填为可追溯 GitHub/详情源。',
    npmArgs: ['run', 'collector:admin', '--', 'backfill-skill-source-links', '--source', 'skills-sh', '--limit', '50000'],
  },
  {
    id: 'enrich-github-skill-metadata',
    label: '同步 GitHub Star',
    group: '维护',
    description: '通过 GitHub Token 快速同步 GitHub/skills.sh Skill 源仓库 stars 和 forks，不拉 release，适合列表排序。',
    npmArgs: ['run', 'collector:sync-github-stars', '--', '--source', 'skills-sh', '--limit', '50000', '--repo-limit', '5000', '--concurrency', '4'],
  },
  {
    id: 'backfill-external-skill-metrics',
    label: '回填 Star/下载量',
    group: '维护',
    description: '把已有 Skill rawData 中的 stars、forks、下载量回填到数据库字段，支持全库排序。',
    npmArgs: ['run', 'collector:admin', '--', 'backfill-external-skill-metrics', '--limit', '200000'],
  },
  {
    id: 'build-tool-capability-profiles',
    label: '生成工具能力画像',
    group: '维护',
    description: '从 Python 爬虫和网络攻防 Skill 原始库提炼关键词、GitHub 查询、热门仓库、工具提示和安全策略，反哺下一轮采集。',
    npmArgs: ['run', 'collector:build-capabilities'],
  },
  {
    id: 'mark-topic-mismatch-skills',
    label: '清理专项偏题 Skill',
    group: '维护',
    description: '把 Python 爬虫/网络攻防专项源里不匹配主题关键词的 Skill 标记为 low_quality。',
    npmArgs: ['run', 'collector:admin', '--', 'mark-topic-mismatch-skills', '--limit', '100000'],
  },
  {
    id: 'mark-imprecise-sources',
    label: '标记不精确源',
    group: '维护',
    description: '把只有仓库首页、缺少具体发布点的 Skill 标记为 needs_source。',
    npmArgs: ['run', 'collector:admin', '--', 'mark-imprecise-skill-sources', '--limit', '100000'],
  },
  {
    id: 'purge-skills-without-github',
    label: '清理无 GitHub 源 Skill',
    group: '维护',
    description: '删除不能解析到 github.com/owner/repo 源仓库地址的外部 Skill，保留可追溯数据。',
    npmArgs: ['run', 'collector:admin', '--', 'purge-external-skills-without-github', '--limit', '300000'],
  },
  {
    id: 'mark-out-of-scope',
    label: '标记范围外源',
    group: '维护',
    description: '把非 GitHub / skills.sh 的历史 Skill 标记为 out_of_scope。',
    npmArgs: ['run', 'collector:admin', '--', 'mark-out-of-scope-skill-sources', '--limit', '300000'],
  },
  {
    id: 'reclassify-skills',
    label: '重算中文分类',
    group: '维护',
    description: '按当前规则重算 skills.sh/GitHub Skill 的中文分类和标签。',
    npmArgs: ['run', 'collector:admin', '--', 'reclassify-external-skills', '--source', 'skills-sh', '--limit', '10000'],
  },
  {
    id: 'collector-stats',
    label: '输出统计快照',
    group: '诊断',
    description: '在任务日志中输出当前候选、来源、任务统计。',
    npmArgs: ['run', 'collector:stats'],
  },
]

const commandById = new Map(collectorCommandSpecs.map(command => [command.id, command]))

function jobPath(jobId: string) {
  return path.join(JOB_ROOT, `${jobId}.json`)
}

function spawnCommand(npmArgs: string[]) {
  if (process.platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', ['npm', ...npmArgs].join(' ')],
      displayCommand: `npm ${npmArgs.join(' ')}`,
    }
  }

  return {
    command: 'npm',
    args: npmArgs,
    displayCommand: `npm ${npmArgs.join(' ')}`,
  }
}

async function writeJob(job: CollectorJob) {
  await fs.mkdir(JOB_ROOT, { recursive: true })
  await fs.writeFile(jobPath(job.id), JSON.stringify(job, null, 2), 'utf8')
}

function readJobFile(filePath: string): CollectorJob | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as CollectorJob
  } catch {
    return null
  }
}

export async function listCollectorJobs(limit = 20) {
  await fs.mkdir(JOB_ROOT, { recursive: true })
  const files = await fs.readdir(JOB_ROOT).catch(() => [])
  const jobs = files
    .filter(file => file.endsWith('.json'))
    .map(file => readJobFile(path.join(JOB_ROOT, file)))
    .filter((job): job is CollectorJob => Boolean(job))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit)
  return jobs
}

export async function getCollectorJob(jobId: string) {
  return readJobFile(jobPath(jobId))
}

function isPidAlive(pid?: number) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function findRunningCollectorJob(commandId: string) {
  const jobs = await listCollectorJobs(200)
  for (const job of jobs) {
    if (job.commandId !== commandId || job.status !== 'running') continue
    if (!job.pid || isPidAlive(job.pid)) return job

    const staleJob = { ...job, status: 'failed' as CollectorJobStatus, finishedAt: new Date().toISOString(), error: 'Process is no longer alive.' }
    await fs.appendFile(job.logFile, `\n[runner:stale] pid ${job.pid} is no longer alive at ${staleJob.finishedAt}\n`).catch(() => undefined)
    await writeJob(staleJob)
  }
  return null
}

export async function ensureCollectorJobRunning(commandId: string) {
  const running = await findRunningCollectorJob(commandId)
  if (running) return { job: running, started: false }
  const job = await startCollectorJob(commandId)
  return { job, started: true }
}

export async function readCollectorJobLog(job: CollectorJob, maxChars = 20000) {
  if (!existsSync(job.logFile)) return ''
  const content = await fs.readFile(job.logFile, 'utf8').catch(() => '')
  if (content.length <= maxChars) return content
  return content.slice(content.length - maxChars)
}

export async function startCollectorJob(commandId: string) {
  const spec = commandById.get(commandId)
  if (!spec) throw new Error(`未知采集指令：${commandId}`)

  loadLocalGithubToken()
  await fs.mkdir(JOB_ROOT, { recursive: true })

  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
  const logFile = path.join(JOB_ROOT, `${id}.log`)
  const { command, args, displayCommand } = spawnCommand(spec.npmArgs)

  const job: CollectorJob = {
    id,
    commandId: spec.id,
    label: spec.label,
    group: spec.group,
    status: 'running',
    platform: process.platform,
    cwd: process.cwd(),
    command,
    args,
    displayCommand,
    logFile,
    startedAt: new Date().toISOString(),
  }

  await fs.writeFile(logFile, [
    `[job] ${job.label}`,
    `[id] ${job.id}`,
    `[cwd] ${job.cwd}`,
    `[platform] ${job.platform}`,
    `[command] ${displayCommand}`,
    '',
  ].join('\n'), 'utf8')
  await writeJob(job)

  let child
  try {
    child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    job.status = 'failed'
    job.error = error instanceof Error ? error.message : '启动任务失败'
    job.finishedAt = new Date().toISOString()
    await fs.appendFile(logFile, `\n[runner:error] ${job.error}\n`).catch(() => undefined)
    await writeJob(job)
    throw error
  }

  job.pid = child.pid
  await writeJob(job)

  const append = async (chunk: Buffer | string) => {
    await fs.appendFile(logFile, chunk).catch(() => undefined)
  }

  child.stdout?.on('data', chunk => void append(chunk))
  child.stderr?.on('data', chunk => void append(chunk))
  child.on('error', async error => {
    job.status = 'failed'
    job.error = error.message
    job.finishedAt = new Date().toISOString()
    await append(`\n[runner:error] ${error.message}\n`)
    await writeJob(job)
  })
  child.on('close', async (code, signal) => {
    const latestJob = await getCollectorJob(job.id)
    if (latestJob?.status === 'stopped') {
      job.status = 'stopped'
      job.finishedAt = latestJob.finishedAt || new Date().toISOString()
    } else {
      job.status = code === 0 ? 'success' : 'failed'
      job.finishedAt = new Date().toISOString()
    }
    job.exitCode = code
    job.signal = signal
    await append(`\n[runner:exit] code=${code ?? ''} signal=${signal ?? ''}\n`)
    await writeJob(job)
  })

  return job
}

export async function stopCollectorJob(jobId: string) {
  const job = await getCollectorJob(jobId)
  if (!job) throw new Error('任务不存在')
  if (job.status !== 'running') return job
  if (!job.pid) {
    job.status = 'stopped'
    job.finishedAt = new Date().toISOString()
    await fs.appendFile(job.logFile, `\n[runner:stop] no pid, marked stopped at ${job.finishedAt}\n`).catch(() => undefined)
    await writeJob(job)
    return job
  }

  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(job.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    } else {
      process.kill(job.pid, 'SIGTERM')
    }
    job.status = 'stopped'
    job.finishedAt = new Date().toISOString()
    await fs.appendFile(job.logFile, `\n[runner:stop] requested at ${job.finishedAt}\n`).catch(() => undefined)
    await writeJob(job)
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : '停止任务失败')
  }

  return job
}

export function collectorCommandForSourceSlug(sourceSlug?: string) {
  if (!sourceSlug) return 'collector-all'
  if (sourceSlug === 'ai-news' || sourceSlug.startsWith('ai-news-')) return 'ai-news'
  if (sourceSlug === 'prompt-library' || sourceSlug.startsWith('prompt-')) return 'prompt-library'
  const map: Record<string, string> = {
    'github-global-skill-index': 'github-index',
    'github-python-crawler-skill-index': 'github-python-crawler-skills',
    'github-cybersecurity-skill-index': 'github-cybersecurity-skills',
    'skills-sh-all': 'skills-sh-all',
    'skills-sh-search-index': 'skills-sh-search-index',
    'skills-sh-browser-slow': 'skills-sh-browser-slow',
    'skills-sh-github-sources': 'skills-sh-github-sources',
  }
  return map[sourceSlug] || ''
}

export function collectorSourceSlugForCommand(commandId?: string) {
  const map: Record<string, string> = {
    'ai-news': 'ai-news',
    'prompt-library': 'prompt-aishort-community',
    'github-index': 'github-global-skill-index',
    'github-python-crawler-skills': 'github-python-crawler-skill-index',
    'github-cybersecurity-skills': 'github-cybersecurity-skill-index',
    'skills-sh-all': 'skills-sh-all',
    'skills-sh-search-index': 'skills-sh-search-index',
    'skills-sh-browser-slow': 'skills-sh-browser-slow',
    'skills-sh-github-sources': 'skills-sh-github-sources',
  }
  return commandId ? map[commandId] || '' : ''
}
