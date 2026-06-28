import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { startCollectorJob } from '@/lib/collector-runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PACKAGE_DIR = path.join(process.cwd(), '.collector-state', 'deploy-packages')
const MAX_PACKAGE_BYTES = 1024 * 1024 * 1024

function formatVersionPatch(value: string) {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

async function nextVersion() {
  const latest = await prisma.skillLibraryVersion.findFirst({
    orderBy: { id: 'desc' },
    select: { version: true },
  })
  const parsed = latest ? formatVersionPatch(latest.version) : null
  if (!parsed) return '0.0.1'
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`
}

function safePackageExtension(fileName: string) {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.tar.gz')) return '.tar.gz'
  if (lower.endsWith('.tgz')) return '.tgz'
  if (lower.endsWith('.tar')) return '.tar'
  if (lower.endsWith('.zip')) return '.zip'
  return ''
}

function packageStatusLabel(status: string) {
  if (status === 'success') return '已部署'
  if (status === 'deploying') return '部署中'
  if (status === 'queued') return '排队中'
  if (status === 'failed') return '失败'
  return '已上传'
}

async function deploymentCounts() {
  const [skillCount, externalSkillCount, promptCount, newsCount] = await Promise.all([
    prisma.skillResource.count().catch(() => 0),
    prisma.externalSkill.count().catch(() => 0),
    prisma.collectionCandidate.count({ where: { type: 'prompt' } }).catch(() => 0),
    prisma.collectionCandidate.count({ where: { type: 'news' } }).catch(() => 0),
  ])
  return { skillCount, externalSkillCount, promptCount, newsCount }
}

function serializeVersion(row: any) {
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    status: row.status,
    statusLabel: packageStatusLabel(row.status),
    packageName: row.packageName,
    packageSize: row.packageSize,
    checksum: row.checksum,
    notes: row.notes,
    operator: row.operator,
    jobId: row.jobId,
    skillCount: row.skillCount,
    externalSkillCount: row.externalSkillCount,
    promptCount: row.promptCount,
    newsCount: row.newsCount,
    startedAt: row.startedAt?.toISOString?.() || row.startedAt || null,
    finishedAt: row.finishedAt?.toISOString?.() || row.finishedAt || null,
    createdAt: row.createdAt?.toISOString?.() || row.createdAt || null,
    updatedAt: row.updatedAt?.toISOString?.() || row.updatedAt || null,
  }
}

export async function GET() {
  const versions = await prisma.skillLibraryVersion.findMany({
    orderBy: { id: 'desc' },
    take: 20,
  })

  return NextResponse.json({
    ok: true,
    versions: versions.map(serializeVersion),
  })
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    const file = form.get('package')
    const title = String(form.get('title') || '').trim()
    const notes = String(form.get('notes') || '').trim()
    const operator = String(form.get('operator') || '').trim() || 'local-admin'

    if (!file || typeof file !== 'object' || !('arrayBuffer' in file) || !('name' in file) || !('size' in file)) {
      return NextResponse.json({ ok: false, error: '请选择 zip、tar 或 tar.gz 部署包。' }, { status: 400 })
    }

    const uploadedFile = file as File
    const extension = safePackageExtension(uploadedFile.name)
    if (!extension) {
      return NextResponse.json({ ok: false, error: '仅支持 .zip、.tar、.tgz、.tar.gz 部署包。' }, { status: 400 })
    }

    if (uploadedFile.size <= 0) {
      return NextResponse.json({ ok: false, error: '部署包为空。' }, { status: 400 })
    }
    if (uploadedFile.size > MAX_PACKAGE_BYTES) {
      return NextResponse.json({ ok: false, error: '部署包超过 1GB，建议拆分或在服务器命令行部署。' }, { status: 400 })
    }

    const version = await nextVersion()
    const arrayBuffer = await uploadedFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const checksum = createHash('sha256').update(buffer).digest('hex')
    const storedName = `aihub-${version}${extension}`
    const packagePath = path.join(PACKAGE_DIR, storedName)
    const relativePackagePath = path.relative(process.cwd(), packagePath).replace(/\\/g, '/')
    const counts = await deploymentCounts()

    await fs.mkdir(PACKAGE_DIR, { recursive: true })
    await fs.writeFile(packagePath, buffer)

    let row = await prisma.skillLibraryVersion.create({
      data: {
        version,
        title: title || `AIHub Collector ${version}`,
        status: 'queued',
        packageName: uploadedFile.name,
        packagePath: relativePackagePath,
        packageSize: buffer.length,
        checksum,
        notes,
        operator,
        ...counts,
      },
    })

    try {
      const job = await startCollectorJob('apply-latest-deploy-package')
      row = await prisma.skillLibraryVersion.update({
        where: { id: row.id },
        data: { jobId: job.id },
      })
    } catch (error) {
      row = await prisma.skillLibraryVersion.update({
        where: { id: row.id },
        data: {
          status: 'failed',
          notes: `${notes ? `${notes}\n` : ''}部署任务启动失败：${error instanceof Error ? error.message : '未知错误'}`,
          finishedAt: new Date(),
        },
      })
    }

    return NextResponse.json({
      ok: row.status !== 'failed',
      version: serializeVersion(row),
      message: row.status === 'failed'
        ? '部署包已保存，但自动部署任务启动失败。'
        : `已上传 ${version}，自动部署任务已进入队列。`,
    })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : '部署包上传失败。',
    }, { status: 500 })
  }
}
