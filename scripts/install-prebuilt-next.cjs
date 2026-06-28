#!/usr/bin/env node
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = process.cwd()
const prebuiltDir = path.join(projectRoot, '.next-deploy')
const targetDir = path.join(projectRoot, '.next')

function runNextBuild() {
  const result = spawnSync(
    process.execPath,
    [path.join('node_modules', 'next', 'dist', 'bin', 'next'), 'build', '--no-lint'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=4096`.trim(),
      },
      windowsHide: true,
    },
  )
  process.exit(result.status ?? 1)
}

if (!fs.existsSync(path.join(prebuiltDir, 'BUILD_ID'))) {
  runNextBuild()
}

console.log(`[deploy] installing prebuilt Next bundle from ${prebuiltDir}`)
fs.rmSync(targetDir, { recursive: true, force: true })
fs.cpSync(prebuiltDir, targetDir, { recursive: true })
console.log('[deploy] prebuilt Next bundle installed')
