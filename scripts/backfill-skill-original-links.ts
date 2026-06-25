import { PrismaClient } from '@prisma/client'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const prisma = new PrismaClient()

loadLocalEnv()

function parseEnvValue(value: string) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function loadLocalEnv() {
  for (const fileName of ['.env.local', '.env']) {
    const filePath = path.join(process.cwd(), fileName)
    if (!existsSync(filePath)) continue

    const content = readFileSync(filePath, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (match && !process.env[match[1]]) process.env[match[1]] = parseEnvValue(match[2])
    }
  }
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function normalizeGithubRepoKey(value?: string | null) {
  if (!value) return ''
  const trimmed = value
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/^github\.com\//i, '')
    .replace(/^\/+|\/+$/g, '')
  const parts = trimmed.split(/[/?#]/).filter(Boolean)
  if (parts.length < 2) return ''
  const repoName = parts[1].replace(/\.git$/i, '')
  const repo = `${parts[0]}/${repoName}`
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) && !repo.includes('..') ? repo : ''
}

function githubRepoFromUrl(value?: string | null) {
  if (!value) return ''
  try {
    const url = new URL(value)
    if (!/^github\.com$/i.test(url.hostname)) return ''
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return ''
    return normalizeGithubRepoKey(`${parts[0]}/${parts[1]}`)
  } catch {
    return normalizeGithubRepoKey(value)
  }
}

function githubRepoUrl(repo?: string | null) {
  const key = normalizeGithubRepoKey(repo)
  return key ? `https://github.com/${key}` : ''
}

function githubCloneUrl(repo?: string | null) {
  const key = normalizeGithubRepoKey(repo)
  return key ? `https://github.com/${key}.git` : ''
}

function isGithubRepoHomeUrl(value?: string | null) {
  if (!value) return false
  try {
    const url = new URL(value)
    if (!/^github\.com$/i.test(url.hostname)) return false
    const parts = url.pathname.split('/').filter(Boolean)
    return parts.length === 2 && !url.hash
  } catch {
    return false
  }
}

function githubSkillPathFromUrl(value?: string | null) {
  if (!value) return ''
  try {
    const url = new URL(value)
    if (!/^github\.com$/i.test(url.hostname)) return ''
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    const marker = parts.findIndex(part => part === 'blob' || part === 'tree')
    if (marker < 0 || parts.length <= marker + 2) return ''
    return parts.slice(marker + 2).join('/')
  } catch {
    return ''
  }
}

function parseJson(value?: string | null) {
  try {
    return JSON.parse(value || '{}') as Record<string, any>
  } catch {
    return {}
  }
}

function preciseSkillUrl(raw: Record<string, any>, row: { sourceUrl?: string | null; githubUrl?: string | null }) {
  const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
  return firstString(
    raw.skillMdUrl,
    github.skillMdUrl,
    row.sourceUrl && row.sourceUrl.includes('github.com') && !isGithubRepoHomeUrl(row.sourceUrl) ? row.sourceUrl : '',
    row.githubUrl && row.githubUrl.includes('github.com') && !isGithubRepoHomeUrl(row.githubUrl) ? row.githubUrl : '',
    raw.githubUrl && !isGithubRepoHomeUrl(raw.githubUrl) ? raw.githubUrl : '',
    raw.github_url && !isGithubRepoHomeUrl(raw.github_url) ? raw.github_url : '',
    github.url && !isGithubRepoHomeUrl(github.url) ? github.url : '',
  )
}

function repoInfo(raw: Record<string, any>, row: { sourceUrl?: string | null; githubUrl?: string | null; downloadUrl?: string | null }) {
  const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
  const item = raw.item && typeof raw.item === 'object' ? raw.item : {}
  const originalRepo = normalizeGithubRepoKey(firstString(
    raw.originalRepo,
    github.originalRepo,
    githubRepoFromUrl(raw.originalGithubUrl),
    githubRepoFromUrl(github.originalGithubUrl),
  ))
  const sourceRepo = normalizeGithubRepoKey(firstString(
    raw.sourceRepo,
    github.sourceRepo,
    raw.repo,
    raw.source,
    item.source,
    github.repo,
    githubRepoFromUrl(row.sourceUrl),
    githubRepoFromUrl(row.githubUrl),
    githubRepoFromUrl(raw.githubUrl),
    githubRepoFromUrl(raw.repoUrl),
    githubRepoFromUrl(github.repoUrl),
  ))
  const installRepo = normalizeGithubRepoKey(firstString(
    raw.installRepo,
    github.installRepo,
    originalRepo,
    githubRepoFromUrl(row.downloadUrl),
    githubRepoFromUrl(raw.installGitUrl),
    githubRepoFromUrl(github.installGitUrl),
    sourceRepo,
  ))
  return { originalRepo, sourceRepo, installRepo }
}

const aggregateRepos = new Set([
  'agentspace-so/runcomfy-agent-skills',
  'agentspace-so/runcomfy-skills',
  'doany-ai/skills',
])

async function main() {
  let processed = 0
  let updated = 0
  let markedAggregate = 0
  let lastId = 0

  while (true) {
    const rows = await prisma.externalSkill.findMany({
      where: { id: { gt: lastId } },
      orderBy: { id: 'asc' },
      take: 1000,
      select: {
        id: true,
        rawData: true,
        sourceUrl: true,
        githubUrl: true,
        homepageUrl: true,
        downloadUrl: true,
        description: true,
        status: true,
      },
    })
    if (!rows.length) break

    for (const row of rows) {
      lastId = row.id
      processed += 1

      const raw = parseJson(row.rawData)
      const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
      const { originalRepo, sourceRepo, installRepo } = repoInfo(raw, row)
      const chosenRepo = installRepo || originalRepo || sourceRepo
      if (!chosenRepo) continue

      const skillMdUrl = preciseSkillUrl(raw, row)
      const skillMdPath = firstString(
        raw.skillMdPath,
        github.skillMdPath,
        github.skillPath,
        raw.file,
        githubSkillPathFromUrl(skillMdUrl),
      )
      const skillMdDescription = firstString(raw.skillMdDescription, github.skillMdDescription, row.description)
      const repoUrl = githubRepoUrl(chosenRepo)
      const installGitUrl = githubCloneUrl(chosenRepo)
      const aggregate = !originalRepo && sourceRepo && aggregateRepos.has(sourceRepo.toLowerCase())
      const nextRaw = {
        ...raw,
        sourceRepo: sourceRepo || undefined,
        originalRepo: originalRepo || raw.originalRepo || undefined,
        installRepo: chosenRepo,
        installGitUrl,
        skillMdUrl: skillMdUrl || undefined,
        skillMdPath: skillMdPath || undefined,
        skillMdDescription: skillMdDescription || undefined,
        repoUrl,
        githubUrl: originalRepo ? githubRepoUrl(originalRepo) : (raw.githubUrl || skillMdUrl || repoUrl),
        aggregateSource: aggregate ? true : raw.aggregateSource,
        aggregateSourceReason: aggregate ? 'known third-party skill mirror' : raw.aggregateSourceReason,
        github: {
          ...github,
          sourceRepo: sourceRepo || github.sourceRepo,
          originalRepo: originalRepo || github.originalRepo,
          installRepo: chosenRepo,
          installGitUrl,
          skillMdUrl: skillMdUrl || github.skillMdUrl,
          skillMdPath: skillMdPath || github.skillMdPath,
          skillMdDescription: skillMdDescription || github.skillMdDescription,
        },
      }

      await prisma.externalSkill.update({
        where: { id: row.id },
        data: {
          homepageUrl: repoUrl,
          downloadUrl: installGitUrl,
          githubUrl: originalRepo ? githubRepoUrl(originalRepo) : (row.githubUrl || repoUrl),
          sourceUrl: skillMdUrl || row.sourceUrl,
          status: aggregate ? 'aggregated_source' : row.status,
          rawData: JSON.stringify(nextRaw),
        },
      })
      updated += 1
      if (aggregate) markedAggregate += 1
    }
  }

  const withDownload = await prisma.externalSkill.count({ where: { downloadUrl: { not: null } } })
  const collected = await prisma.externalSkill.count({ where: { status: 'collected' } })
  const aggregates = await prisma.externalSkill.count({ where: { status: 'aggregated_source' } })
  console.log(JSON.stringify({ processed, updated, markedAggregate, withDownload, collected, aggregates }, null, 2))
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
