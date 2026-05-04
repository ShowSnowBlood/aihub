/**
 * Product Hunt 爬虫
 * 抓取今日热门产品并保存到数据库
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Product Hunt GraphQL API
const PRODUCT_HUNT_API = 'https://www.producthunt.com/frontend/graphql'

// 获取今日热门产品
async function fetchTodayProducts() {
  const query = `
    query {
      posts(featured: true, first: 20) {
        edges {
          node {
            id
            name
            tagline
            description
            url
            thumbnail {
              url
            }
            topics {
              edges {
                node {
                  name
                }
              }
            }
            votesCount
            commentsCount
            createdAt
            website
          }
        }
      }
    }
  `

  try {
    const response = await fetch(PRODUCT_HUNT_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ query }),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    return data.data?.posts?.edges || []
  } catch (error) {
    console.error('获取 Product Hunt 数据失败:', error)
    return []
  }
}

// 将 Product Hunt 数据转换为工具格式
function convertToTool(product: any) {
  const node = product.node
  const slug = node.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  
  // 判断分类
  let categoryName = 'AI工具'
  const topics = node.topics?.edges?.map((e: any) => e.node.name.toLowerCase()) || []
  
  if (topics.some((t: string) => t.includes('image') || t.includes('photo') || t.includes('art'))) {
    categoryName = 'AI绘画'
  } else if (topics.some((t: string) => t.includes('video'))) {
    categoryName = 'AI视频'
  } else if (topics.some((t: string) => t.includes('audio') || t.includes('voice') || t.includes('music'))) {
    categoryName = 'AI音频'
  } else if (topics.some((t: string) => t.includes('code') || t.includes('developer') || t.includes('programming'))) {
    categoryName = 'AI编程'
  } else if (topics.some((t: string) => t.includes('chat') || t.includes('assistant') || t.includes('bot'))) {
    categoryName = 'AI聊天'
  } else if (topics.some((t: string) => t.includes('search'))) {
    categoryName = 'AI搜索'
  }

  return {
    name: node.name,
    slug: slug,
    description: node.description || node.tagline,
    shortDesc: node.tagline,
    websiteUrl: node.website || node.url,
    logoUrl: node.thumbnail?.url || '',
    pricingType: 'FREEMIUM',
    tags: topics.slice(0, 5).join(','),
    source: 'producthunt',
    sourceUrl: node.url,
    upvotes: node.votesCount || 0,
    publishedAt: new Date(node.createdAt),
  }
}

// 保存到数据库
async function saveToDatabase(tools: any[]) {
  let saved = 0
  let updated = 0

  for (const toolData of tools) {
    try {
      // 查找或创建分类
      let category = await prisma.category.findFirst({
        where: { name: toolData.categoryName || 'AI工具' }
      })

      if (!category) {
        category = await prisma.category.create({
          data: {
            name: toolData.categoryName || 'AI工具',
            slug: (toolData.categoryName || 'ai-tools').toLowerCase().replace(/\s+/g, '-'),
          }
        })
      }

      // 检查是否已存在
      const existing = await prisma.tool.findUnique({
        where: { slug: toolData.slug }
      })

      if (existing) {
        // 更新
        await prisma.tool.update({
          where: { slug: toolData.slug },
          data: {
            upvotes: toolData.upvotes,
            updatedAt: new Date(),
          }
        })
        updated++
      } else {
        // 创建
        await prisma.tool.create({
          data: {
            ...toolData,
            categoryId: category.id,
          }
        })
        saved++
      }
    } catch (error) {
      console.error(`保存 ${toolData.name} 失败:`, error)
    }
  }

  return { saved, updated }
}

// 主函数
async function main() {
  console.log('🚀 开始抓取 Product Hunt 数据...')
  console.log('⏰', new Date().toLocaleString('zh-CN'))

  try {
    const products = await fetchTodayProducts()
    console.log(`📦 获取到 ${products.length} 个产品`)

    if (products.length === 0) {
      console.log('⚠️ 没有获取到数据，可能 API 受限')
      return
    }

    const tools = products.map(convertToTool)
    const { saved, updated } = await saveToDatabase(tools)

    console.log(`✅ 完成！新增: ${saved}, 更新: ${updated}`)
  } catch (error) {
    console.error('❌ 爬虫执行失败:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
}

export { fetchTodayProducts, saveToDatabase }
