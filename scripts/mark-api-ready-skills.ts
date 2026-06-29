import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type SkillRow = {
  id: number
  name: string
  slug: string
  sourceUrl: string | null
  githubUrl: string | null
  rawData: string | null
}

function arg(name: string, fallback?: string) {
  const index = process.argv.indexOf(name)
  if (index < 0) return fallback
  return process.argv[index + 1] || fallback
}

function toInt(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : fallback
}

function parseJson(value?: string | null) {
  try {
    return JSON.parse(value || '{}') as Record<string, any>
  } catch {
    return {}
  }
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function cleanText(value?: string | null) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isGeneratedFallbackMarkdown(value: string) {
  const head = value.slice(0, 1200)
  return /^---\s*[\s\S]{0,260}\bname:\s*external-/i.test(head) ||
    (/^---\s*[\s\S]{0,800}\bsource:\s*https:\/\/github\.com\//i.test(head) && /来自\s+[\w.-]+\/[\w.-]+\s+的公开\s+Skill/i.test(head))
}

function storedMarkdown(raw: Record<string, any>) {
  const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
  const markdown = firstString(
    raw.skillMarkdown,
    raw.skill_markdown,
    raw.skillMdMarkdown,
    raw.markdown,
    github.skillMarkdown,
    github.skill_markdown,
    github.skillMdMarkdown,
  )
  if (!markdown || isGeneratedFallbackMarkdown(markdown)) return ''
  return markdown
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

function isLikelySkillMarkdown(row: SkillRow, raw: Record<string, any>, markdown: string) {
  if (!markdown) return false
  const github = raw.github && typeof raw.github === 'object' ? raw.github : {}
  const source = firstString(raw.skillMdUrl, github.skillMdUrl, row.sourceUrl, row.githubUrl)
  const sourcePath = githubSkillPathFromUrl(source)
  const sourceIsSkillMd = /(^|\/)skill\.md$/i.test(sourcePath) || /(^|\/)skill\.md([?#].*)?$/i.test(source)
  if (!sourceIsSkillMd) return false
  return /^---\s*[\s\S]{0,1200}\bname\s*:/i.test(markdown) &&
    /^---\s*[\s\S]{0,1200}\bdescription\s*:/i.test(markdown)
}

function frontMatterDescription(markdown: string) {
  const match = markdown.match(/^---\s*([\s\S]*?)\s*---/)
  if (!match) return ''
  const description = match[1].match(/^description\s*:\s*(.+)$/im)?.[1] || ''
  return cleanText(description.replace(/^["']|["']$/g, ''))
}

async function main() {
  const batchSize = toInt(arg('--batch-size'), 300)
  const maxRows = toInt(arg('--limit'), Number.MAX_SAFE_INTEGER)
  const now = new Date().toISOString()
  let cursor = 0
  let scanned = 0
  let ready = 0
  let updated = 0
  let disabled = 0

  while (scanned < maxRows) {
    const rows = await prisma.externalSkill.findMany({
      where: {
        id: { gt: cursor },
        status: {
          notIn: ['ignored', 'low_quality', 'out_of_scope', 'needs_source', 'aggregated_source'],
        },
        AND: [
          {
            OR: [
              { rawData: { contains: 'skillMarkdown' } },
              { rawData: { contains: 'skill_markdown' } },
              { rawData: { contains: 'skillMdMarkdown' } },
              { rawData: { contains: '"markdown"' } },
              { rawData: { contains: '"apiReady":true' } },
            ],
          },
          {
            OR: [
              { sourceUrl: { contains: 'SKILL.md' } },
              { sourceUrl: { contains: 'skill.md' } },
              { githubUrl: { contains: 'SKILL.md' } },
              { githubUrl: { contains: 'skill.md' } },
              { rawData: { contains: 'SKILL.md' } },
              { rawData: { contains: 'skill.md' } },
            ],
          },
        ],
      },
      orderBy: { id: 'asc' },
      take: Math.min(batchSize, maxRows - scanned),
      select: {
        id: true,
        name: true,
        slug: true,
        sourceUrl: true,
        githubUrl: true,
        rawData: true,
      },
    })

    if (!rows.length) break
    cursor = rows[rows.length - 1].id

    for (const row of rows as SkillRow[]) {
      scanned += 1
      const raw = parseJson(row.rawData)
      const markdown = storedMarkdown(raw)
      const isReady = isLikelySkillMarkdown(row, raw, markdown) && Boolean(frontMatterDescription(markdown))
      if (isReady) ready += 1

      if (raw.apiReady === isReady && (isReady ? raw.apiReadyVersion === 1 : true)) continue

      await prisma.externalSkill.update({
        where: { id: row.id },
        data: {
          rawData: JSON.stringify({
            ...raw,
            apiReady: isReady,
            apiReadyVersion: 1,
            apiReadyVerifiedAt: isReady ? now : raw.apiReadyVerifiedAt,
          }),
        },
      })
      if (isReady) updated += 1
      else disabled += 1
    }

    if (scanned % (batchSize * 10) === 0) {
      console.log(JSON.stringify({ stage: 'mark-api-ready-skills', scanned, ready, updated, disabled, cursor }))
    }
  }

  console.log(JSON.stringify({ ok: true, scanned, ready, updated, disabled, cursor }))
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
