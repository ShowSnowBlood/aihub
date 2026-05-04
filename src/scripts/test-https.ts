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
      headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'AI-Hub-Crawler/1.0' },
      timeout: 30000,
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        console.log('RAW RESP:', data.slice(0, 300))
        try { resolve(JSON.parse(data)) } catch { reject(new Error('JSON parse error')) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    req.write(body); req.end()
  })
}

async function main() {
  const ago90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const ago30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const gqlFull = "query($searchQuery:String!){search(query:$searchQuery,type:REPOSITORY,first:100){nodes{...on Repository{name description url homepageUrl createdAt stargazerCount repositoryTopics(first:5){nodes{topic{name}}}owner{login}}}}}"

  // Test 1: 30 days, simple query, first:5 (known to work)
  console.log('=== TEST 1: 30d, simple, first:5 ===')
  const q1 = `AI OR artificial-intelligence created:>${ago30} sort:stars-desc`
  const gql1 = "query($searchQuery:String!){search(query:$searchQuery,type:REPOSITORY,first:5){nodes{...on Repository{name stargazerCount}}}}"
  const r1 = await githubGraphQL(gql1, { searchQuery: q1 })
  console.log('Result:', r1.data?.search?.nodes?.length)

  await new Promise(r => setTimeout(r, 1000))

  // Test 2: 30 days, simple query, full fields, first:5
  console.log('\n=== TEST 2: 30d, full fields, first:5 ===')
  const q2 = `AI OR artificial-intelligence created:>${ago30} sort:stars-desc`
  const r2 = await githubGraphQL(gqlFull, { searchQuery: q2 })
  console.log('Result:', r2.data?.search?.nodes?.length)

  await new Promise(r => setTimeout(r, 1000))

  // Test 3: 30 days, multi-keyword, full fields, first:5
  console.log('\n=== TEST 3: 30d, multi-kw, full, first:5 ===')
  const q3 = `AI OR artificial-intelligence OR machine-learning created:>${ago30} sort:stars-desc`
  const gql3 = "query($searchQuery:String!){search(query:$searchQuery,type:REPOSITORY,first:5){nodes{...on Repository{name description url homepageUrl createdAt stargazerCount repositoryTopics(first:5){nodes{topic{name}}}owner{login}}}}}"
  const r3 = await githubGraphQL(gql3, { searchQuery: q3 })
  console.log('Result:', r3.data?.search?.nodes?.length)

  await new Promise(r => setTimeout(r, 1000))

  // Test 4: same as test 3 but first:100
  console.log('\n=== TEST 4: 30d, multi-kw, full, first:100 ===')
  const q4 = `AI OR artificial-intelligence OR machine-learning created:>${ago30} sort:stars-desc`
  const r4 = await githubGraphQL(gqlFull, { searchQuery: q4 })
  console.log('Result:', r4.data?.search?.nodes?.length)

  await new Promise(r => setTimeout(r, 1000))

  // Test 5: 90 days, multi-keyword, full fields, first:100
  console.log('\n=== TEST 5: 90d, multi-kw, full, first:100 ===')
  const q5 = `AI OR artificial-intelligence OR machine-learning created:>${ago90} sort:stars-desc`
  const r5 = await githubGraphQL(gqlFull, { searchQuery: q5 })
  console.log('Result:', r5.data?.search?.nodes?.length)
}

main()
