#!/usr/bin/env node
const { existsSync } = require('node:fs')
const fs = require('node:fs/promises')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  return process.argv[index + 1] || fallback
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function deploymentPackageAbsolutePath(value) {
  if (!value) return ''
  return path.isAbsolute(value) ? value : path.join(process.cwd(), value)
}

function runDeployStep(label, command, args, options = {}) {
  console.log(`[deploy] ${label}: ${command} ${args.join(' ')}`)
  const timeout = options.timeoutMs || 20 * 60 * 1000
  const isWindowsCommandShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)
  const child = isWindowsCommandShim
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', command, ...args], {
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        encoding: 'utf8',
        windowsHide: true,
        timeout,
      })
    : spawnSync(command, args, {
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        encoding: 'utf8',
        windowsHide: true,
        timeout,
      })

  if (child.stdout) console.log(child.stdout.trim())
  if (child.stderr) console.error(child.stderr.trim())
  if (child.error && options.optional) {
    console.warn(`[deploy] optional step ${label} did not finish cleanly: ${child.error.message}`)
  }
  if (child.error && !options.optional) {
    throw new Error(`${label} failed: ${child.error.message}`)
  }
  if (child.status !== 0 && !options.optional) {
    throw new Error(`${label} failed with exit code ${child.status}`)
  }
  return child.status || 0
}

async function extractDeployPackage(packagePath, extractDir) {
  await fs.rm(extractDir, { recursive: true, force: true })
  await fs.mkdir(extractDir, { recursive: true })
  const lower = packagePath.toLowerCase()
  if (lower.endsWith('.zip')) {
    if (process.platform === 'win32') {
      runDeployStep('extract zip', 'powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Expand-Archive -LiteralPath ${JSON.stringify(packagePath)} -DestinationPath ${JSON.stringify(extractDir)} -Force`,
      ])
    } else {
      runDeployStep('extract zip', 'unzip', ['-q', packagePath, '-d', extractDir])
    }
    return
  }
  if (lower.endsWith('.tar') || lower.endsWith('.tgz') || lower.endsWith('.tar.gz')) {
    runDeployStep('extract tar', 'tar', ['-xf', packagePath, '-C', extractDir])
    return
  }
  throw new Error('Unsupported deployment package format.')
}

async function detectDeployRoot(extractDir) {
  const entries = await fs.readdir(extractDir, { withFileTypes: true })
  const hasPackageJson = entries.some(entry => entry.isFile() && entry.name === 'package.json')
  const directories = entries.filter(entry => entry.isDirectory())
  if (!hasPackageJson && directories.length === 1) return path.join(extractDir, directories[0].name)
  return extractDir
}

function shouldSkipDeployPath(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  const first = parts[0] || ''
  if (!first) return false
  if ([
    '.git',
    '.next',
    '.collector-state',
    '.venv',
    '.venv-scrapling',
    'node_modules',
    'exports',
    'dev-server.combined.log',
    'dev-server.err.log',
    'dev-server.out.log',
  ].includes(first)) return true
  if (first === '.env' || first === '.env.local') return true
  if (/^\.env\./.test(first)) return true
  if (normalized.includes('/.collector-state/')) return true
  if (normalized.includes('/node_modules/')) return true
  return false
}

async function copyDeployTree(sourceRoot, targetRoot) {
  const resolvedTarget = path.resolve(targetRoot)

  async function walk(currentSource) {
    const relative = path.relative(sourceRoot, currentSource)
    if (relative && shouldSkipDeployPath(relative)) return
    const currentTarget = path.resolve(targetRoot, relative)
    if (currentTarget !== resolvedTarget && !currentTarget.startsWith(`${resolvedTarget}${path.sep}`)) {
      throw new Error(`Refusing to copy outside project root: ${currentTarget}`)
    }
    const stat = await fs.lstat(currentSource)
    if (stat.isSymbolicLink()) return
    if (stat.isDirectory()) {
      await fs.mkdir(currentTarget, { recursive: true })
      const entries = await fs.readdir(currentSource)
      for (const entry of entries) {
        await walk(path.join(currentSource, entry))
      }
      return
    }
    if (stat.isFile()) {
      await fs.mkdir(path.dirname(currentTarget), { recursive: true })
      await fs.copyFile(currentSource, currentTarget)
    }
  }

  await walk(sourceRoot)
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

async function applyLatestDeployPackage() {
  if (hasFlag('--help') || hasFlag('-h')) {
    console.log('Usage: npm run collector:deploy-latest -- [--version 0.0.x] [--dry-run]')
    return
  }

  const requestedVersion = arg('--version', '')
  const versionRow = requestedVersion
    ? await prisma.skillLibraryVersion.findUnique({ where: { version: requestedVersion } })
    : await prisma.skillLibraryVersion.findFirst({
        where: { status: { in: ['queued', 'uploaded', 'failed'] } },
        orderBy: { id: 'desc' },
      })

  if (!versionRow) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: 'No queued deployment package.' }, null, 2))
    return
  }

  if (hasFlag('--dry-run')) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      version: versionRow.version,
      status: versionRow.status,
      packagePath: versionRow.packagePath,
    }, null, 2))
    return
  }

  const packagePath = deploymentPackageAbsolutePath(versionRow.packagePath)
  if (!packagePath || !existsSync(packagePath)) {
    throw new Error(`Deployment package not found: ${versionRow.packagePath || '-'}`)
  }

  const startedAt = new Date()
  await prisma.skillLibraryVersion.update({
    where: { id: versionRow.id },
    data: { status: 'deploying', startedAt },
  })

  const tempRoot = path.join(process.cwd(), '.collector-state', 'deploy-work', `version-${versionRow.version.replace(/[^0-9a-z.-]/gi, '-')}`)
  try {
    await extractDeployPackage(packagePath, tempRoot)
    const sourceRoot = await detectDeployRoot(tempRoot)
    console.log(`[deploy] source root: ${sourceRoot}`)
    await copyDeployTree(sourceRoot, process.cwd())

    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx'
    runDeployStep('install dependencies', npmCommand, ['install'])
    runDeployStep('sync database schema', npxCommand, ['prisma', 'db', 'push', '--skip-generate'])
    runDeployStep('build collector UI', npmCommand, ['run', 'collector:build-ui'])

    if (existsSync(path.join(process.cwd(), 'ecosystem.config.cjs'))) {
      const pm2Command = process.platform === 'win32' ? 'pm2.cmd' : 'pm2'
      runDeployStep('reload pm2 services', pm2Command, ['startOrReload', 'ecosystem.config.cjs', '--update-env'], { optional: true, timeoutMs: 45_000 })
      runDeployStep('save pm2 process list', pm2Command, ['save'], { optional: true, timeoutMs: 20_000 })
    } else {
      console.log('[deploy] ecosystem.config.cjs not found; skipping PM2 reload.')
    }

    const counts = await deploymentCounts()
    const updated = await prisma.skillLibraryVersion.update({
      where: { id: versionRow.id },
      data: {
        status: 'success',
        finishedAt: new Date(),
        notes: versionRow.notes,
        ...counts,
      },
    })
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined)
    console.log(JSON.stringify({ ok: true, version: updated.version, status: updated.status, counts }, null, 2))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Deployment failed.'
    await prisma.skillLibraryVersion.update({
      where: { id: versionRow.id },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        notes: `${versionRow.notes ? `${versionRow.notes}\n` : ''}部署失败：${message}`,
      },
    }).catch(() => undefined)
    console.error(`[deploy] failed: ${message}`)
    throw error
  }
}

applyLatestDeployPackage()
  .catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : String(error))
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined)
  })
