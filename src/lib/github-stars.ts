/**
 * 从 GitHub URL 获取仓库 star 数
 */
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''

export async function getGitHubStars(githubUrl: string | null | undefined): Promise<number> {
  if (!githubUrl) return 0
  
  // 从 URL 提取 owner/repo
  const match = githubUrl.match(/github\.com\/([^/]+)\/([^/#?]+)/)
  if (!match) return 0
  
  const [, owner, repo] = match
  
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'AI-Hub/1.0',
    }
    if (GITHUB_TOKEN) headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`
    
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers })
    if (!res.ok) {
      console.warn(`GitHub API ${res.status} for ${owner}/${repo}`)
      return 0
    }
    const data = await res.json()
    return data.stargazers_count || 0
  } catch (e) {
    console.warn(`获取 GitHub stars 失败 [${githubUrl}]:`, e)
    return 0
  }
}
