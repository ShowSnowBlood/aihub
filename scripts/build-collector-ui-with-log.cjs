#!/usr/bin/env node
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function writePublicBuildLog(text) {
  try {
    const publicDir = path.join(process.cwd(), 'public')
    fs.mkdirSync(publicDir, { recursive: true })
    fs.writeFileSync(path.join(publicDir, 'deploy-build-log.txt'), text.slice(Math.max(0, text.length - 20000)), 'utf8')
  } catch {
    // Best effort diagnostic only.
  }
}

async function appendDeployNotes(text) {
  try {
    const { PrismaClient } = require('@prisma/client')
    const prisma = new PrismaClient()
    const row = await prisma.skillLibraryVersion.findFirst({
      where: { status: { in: ['deploying', 'queued', 'failed'] } },
      orderBy: { id: 'desc' },
    })
    if (!row) {
      await prisma.$disconnect()
      return
    }
    const previous = row.notes || ''
    const clipped = text.slice(Math.max(0, text.length - 12000))
    await prisma.skillLibraryVersion.update({
      where: { id: row.id },
      data: {
        notes: `${previous}${previous ? '\n' : ''}Build failure log:\n${clipped}`,
      },
    })
    await prisma.$disconnect()
  } catch {
    // Build failure logging must never mask the real build exit code.
  }
}

async function main() {
  const result = spawnSync(
    process.execPath,
    [path.join('node_modules', 'next', 'dist', 'bin', 'next'), 'build', '--no-lint'],
    {
      stdio: 'pipe',
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=4096`.trim(),
      },
      windowsHide: true,
    },
  )

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) {
    const message = result.error.stack || result.error.message
    process.stderr.write(`${message}\n`)
    writePublicBuildLog(message)
    await appendDeployNotes(message)
    process.exit(1)
  }

  const status = result.status ?? 1
  if (status !== 0) {
    const output = [result.stdout || '', result.stderr || ''].join('\n').trim()
    writePublicBuildLog(output)
    await appendDeployNotes(output)
  }
  process.exit(status)
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`)
  process.exit(1)
})
