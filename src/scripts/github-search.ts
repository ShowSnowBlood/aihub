import { readFileSync } from 'fs'
import { resolve } from 'path'
import https from 'https'

const envPath = resolve(process.cwd(), '.env')
const envContent = readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIndex = trimmed.indexOf('=')
  if (eqIndex > 0) {
    const key = trimmed.slice(0, eqIndex).trim()
    const val = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}

function githubGraphQL(query: string, variables: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables })
    const req = https.request('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'AI-Hub-Crawler/1.0',
      },
      timeout: 30000,
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch { reject(new Error('JSON parse error')) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    req.write(body)
    req.end()
  })
}

// Multi-keyword search queries covering different AI domains
const QUERIES = [
  'AI OR artificial-intelligence OR machine-learning created:>',
  'llm OR large-language-model OR chatgpt OR gpt-4 created:>',
  'ai-agent OR autonomous-agent OR langchain created:>',
  'stable-diffusion OR text-to-image OR text-to-video created:>',
  'copilot OR code-assist OR rag OR embedding created:>',
]
const DAYS = 90
const PER_PAGE = 100

const GQL_QUERY = "query($searchQuery:String!){search(query:$searchQuery,type:REPOSITORY,first:" + PER_PAGE + "){nodes{...on Repository{name description url homepageUrl createdAt stargazerCount repositoryTopics(first:5){nodes{topic{name}}}owner{login}}}}}"

interface GitHubTool {
  name: string
  description: string
  githubUrl: string
  websiteUrl: string
  stars: number
  publishedAt: string
  source: string
  sourceUrl: string
  tags: string
  isOpenSource: boolean
}

async function searchGitHubTools(): Promise<GitHubTool[]> {
  const allTools: GitHubTool[] = []
  const seen = new Set<string>()
  const ago = new Date(Date.now() - DAYS * 86400000).toISOString()

  for (let i = 0; i < QUERIES.length; i++) {
    const q = `${QUERIES[i]}${ago} sort:stars-desc`
    console.log(`GitHub ${i+1}/${QUERIES.length}: "${q.slice(0,60)}..."`)
    if (i > 0) await new Promise(r => setTimeout(r, 2000))

    try {
      const result = await githubGraphQL(GQL_QUERY, { searchQuery: q })
      if (result.errors) {
        console.log(`  Error: ${result.errors[0]?.message}`)
        continue
      }
      const repos = result.data?.search?.nodes || []
      let newCount = 0
      for (const repo of repos) {
        if (!repo.name) continue
        const days = repo.createdAt ? Math.floor((Date.now() - new Date(repo.createdAt).getTime()) / 86400000) : 999
        if (days > DAYS) continue
        const slug = `${repo.owner?.login || 'u'}/${repo.name}`
        if (seen.has(slug)) continue
        seen.add(slug)
        const topics = repo.repositoryTopics?.nodes?.map((t: any) => t.topic?.name).filter(Boolean) || []
        const tags = topics.length > 0 ? topics.slice(0, 3).join(',') : 'AI'
        allTools.push({
          name: repo.name,
          description: repo.description || '',
          githubUrl: repo.url,
          websiteUrl: repo.homepageUrl || '',
          stars: repo.stargazerCount || 0,
          publishedAt: repo.createdAt,
          source: `github-${i}`,
          sourceUrl: repo.url,
          tags,
          isOpenSource: true,
        })
        newCount++
      }
      console.log(`  ${repos.length} fetched, ${newCount} new`)
    } catch (e: any) {
      console.log(`  Error: ${e.message}`)
    }
  }

  console.log(`GitHub total: ${allTools.length} tools, ${seen.size} unique repos`)
  return allTools
}

export { searchGitHubTools, type GitHubTool }

// Standalone run
searchGitHubTools().then(t => console.log(`__GITHUB_RESULTS__=${JSON.stringify(t)}=__END__`)).catch(console.error)
