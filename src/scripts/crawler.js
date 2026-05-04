/**
 * AI工具爬虫脚本
 * 抓取Product Hunt、GitHub等平台的AI工具数据
 */

const puppeteer = require('puppeteer')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

// 延迟函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const randomDelay = () => sleep(1000 + Math.random() * 2000)

/**
 * 抓取Product Hunt今日新品
 */
async function crawlProductHunt() {
  console.log('开始抓取 Product Hunt...')
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })
  
  try {
    const page = await browser.newPage()
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
    
    await page.goto('https://www.producthunt.com/topics/artificial-intelligence', {
      waitUntil: 'networkidle2',
      timeout: 60000
    })
    
    await randomDelay()
    
    // 提取产品数据
    const products = await page.evaluate(() => {
      const items = document.querySelectorAll('[data-test="post-item"]')
      return Array.from(items).slice(0, 10).map(item => {
        const nameEl = item.querySelector('h2, h3')
        const descEl = item.querySelector('p')
        const linkEl = item.querySelector('a[href^"/posts/"]')
        const voteEl = item.querySelector('[data-test="vote-button"]')
        
        return {
          name: nameEl?.textContent?.trim() || '',
          description: descEl?.textContent?.trim() || '',
          sourceUrl: linkEl ? `https://producthunt.com${linkEl.getAttribute('href')}` : '',
          upvotes: parseInt(voteEl?.textContent?.trim() || '0'),
          source: 'producthunt'
        }
      })
    })
    
    console.log(`抓取到 ${products.length} 个产品`)
    return products
    
  } catch (error) {
    console.error('Product Hunt 抓取失败:', error.message)
    return []
  } finally {
    await browser.close()
  }
}

/**
 * 抓取GitHub Trending
 */
async function crawlGitHubTrending() {
  console.log('开始抓取 GitHub Trending...')
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })
  
  try {
    const page = await browser.newPage()
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
    
    // 抓取AI相关趋势项目
    await page.goto('https://github.com/trending?l=python&since=daily', {
      waitUntil: 'networkidle2',
      timeout: 60000
    })
    
    await randomDelay()
    
    const repos = await page.evaluate(() => {
      const items = document.querySelectorAll('article.Box-row')
      return Array.from(items).slice(0, 10).map(item => {
        const nameEl = item.querySelector('h2 a')
        const descEl = item.querySelector('p')
        const starEl = item.querySelector('a[href$="stargazers"]')
        const langEl = item.querySelector('[itemprop="programmingLanguage"]')
        
        const fullName = nameEl?.textContent?.trim().replace(/\s+/g, '') || ''
        
        return {
          name: fullName.split('/')[1] || fullName,
          description: descEl?.textContent?.trim() || '',
          githubUrl: nameEl ? `https://github.com${nameEl.getAttribute('href')}` : '',
          stars: parseInt(starEl?.textContent?.replace(/,/g, '').trim() || '0'),
          language: langEl?.textContent?.trim() || '',
          source: 'github',
          pricingType: 'OPEN_SOURCE'
        }
      })
    })
    
    // 过滤AI相关项目
    const aiKeywords = ['ai', 'llm', 'gpt', 'chatbot', 'machine-learning', 'neural', 'stable-diffusion', 'langchain']
    const aiRepos = repos.filter(repo => 
      aiKeywords.some(keyword => 
        (repo.name + ' ' + repo.description).toLowerCase().includes(keyword)
      )
    )
    
    console.log(`抓取到 ${aiRepos.length} 个AI相关项目`)
    return aiRepos
    
  } catch (error) {
    console.error('GitHub Trending 抓取失败:', error.message)
    return []
  } finally {
    await browser.close()
  }
}

/**
 * 保存工具到数据库
 */
async function saveTools(tools) {
  console.log('保存数据到数据库...')
  
  for (const tool of tools) {
    try {
      // 生成slug
      const slug = tool.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      
      // 检查是否已存在
      const existing = await prisma.tool.findUnique({
        where: { slug }
      })
      
      if (existing) {
        console.log(`更新: ${tool.name}`)
        await prisma.tool.update({
          where: { slug },
          data: {
            stars: tool.stars || existing.stars,
            upvotes: tool.upvotes || existing.upvotes,
            updatedAt: new Date()
          }
        })
      } else {
        console.log(`新增: ${tool.name}`)
        await prisma.tool.create({
          data: {
            name: tool.name,
            slug,
            shortDesc: tool.description?.slice(0, 200),
            description: tool.description,
            websiteUrl: tool.source === 'producthunt' ? tool.sourceUrl : '',
            githubUrl: tool.githubUrl || '',
            source: tool.source,
            sourceUrl: tool.sourceUrl || tool.githubUrl || '',
            stars: tool.stars || 0,
            upvotes: tool.upvotes || 0,
            pricingType: tool.pricingType || 'FREEMIUM',
            tags: [],
            isActive: true,
            publishedAt: new Date()
          }
        })
      }
    } catch (error) {
      console.error(`保存失败 ${tool.name}:`, error.message)
    }
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('=== AI工具爬虫启动 ===')
  console.log('时间:', new Date().toISOString())
  
  try {
    // 抓取各平台数据
    const [phProducts, ghRepos] = await Promise.all([
      crawlProductHunt(),
      crawlGitHubTrending()
    ])
    
    // 合并并保存
    const allTools = [...phProducts, ...ghRepos]
    console.log(`\n共抓取 ${allTools.length} 个工具`)
    
    if (allTools.length > 0) {
      await saveTools(allTools)
    }
    
    console.log('\n=== 爬虫完成 ===')
    
  } catch (error) {
    console.error('爬虫执行失败:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// 执行
main()
