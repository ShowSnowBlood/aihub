module.exports = {
  apps: [
    {
      name: 'aihub-collector-ui',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '900M',
    },
    {
      name: 'aihub-skills-daemon',
      script: process.platform === 'win32' ? 'npm.cmd' : 'npm',
      args: 'run collector:skills-sh-daemon -- --sources skills-sh-all,skills-sh-browser-slow,skills-sh-search-index,skills-sh-github-sources,github-global-skill-index,github-python-crawler-skill-index,github-cybersecurity-skill-index --cycle-delay-ms 60000 --source-delay-ms 3000',
      cwd: __dirname,
      autorestart: true,
      restart_delay: 10000,
      max_memory_restart: '900M',
    },
    {
      name: 'aihub-prompt-daemon',
      script: process.platform === 'win32' ? 'npm.cmd' : 'npm',
      args: 'run collector:prompt-daemon -- --sources prompt-aishort-community,prompt-directory-ai-tishici-readme,prompt-best-chinese-prompt,prompt-fresns-cn,prompt-perfect-jina,prompt-vibes,promptbase-marketplace,prompthunt-community,snackprompt-community,flowgpt-prompts,imiprompt-midjourney,prompt-krwoo-image,moonvy-ops-prompt,publicprompts-art,promptingguide-ai-zh,learningprompt-wiki,krea-ai-home,openart-ai,promptfolder-midjourney-helper --cycle-delay-ms 90000 --source-delay-ms 2000 --max-cycles 0',
      cwd: __dirname,
      autorestart: true,
      restart_delay: 10000,
      max_memory_restart: '700M',
    },
  ],
}
