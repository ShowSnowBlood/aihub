import { prisma } from '@/lib/prisma'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://aihub.vercel.app'

export async function GET() {
  // 获取所有活跃工具
  const tools = await prisma.tool.findMany({
    where: { isActive: true },
    select: { slug: true, updatedAt: true },
    take: 200,
  })

  // 获取所有新闻
  const newsList = await prisma.news.findMany({
    select: { slug: true, publishedAt: true },
    orderBy: { publishedAt: 'desc' },
    take: 100,
  })

  // 静态页面
  const staticPages = [
    { loc: '/', priority: '1.0', changefreq: 'daily' },
    { loc: '/tools', priority: '0.9', changefreq: 'daily' },
    { loc: '/trending', priority: '0.8', changefreq: 'daily' },
    { loc: '/news', priority: '0.7', changefreq: 'daily' },
    { loc: '/opensource', priority: '0.7', changefreq: 'weekly' },
    { loc: '/user-share', priority: '0.6', changefreq: 'daily' },
    { loc: '/about', priority: '0.5', changefreq: 'monthly' },
    { loc: '/login', priority: '0.3', changefreq: 'monthly' },
    { loc: '/submit', priority: '0.4', changefreq: 'monthly' },
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${staticPages.map(p => `  <url>
    <loc>${BASE_URL}${p.loc}</loc>
    <priority>${p.priority}</priority>
    <changefreq>${p.changefreq}</changefreq>
  </url>`).join('\n')}
  ${tools.map(t => `  <url>
    <loc>${BASE_URL}/tools/${t.slug}</loc>
    <lastmod>${t.updatedAt.toISOString().split('T')[0]}</lastmod>
    <priority>0.6</priority>
    <changefreq>weekly</changefreq>
  </url>`).join('\n')}
  ${newsList.map(n => `  <url>
    <loc>${BASE_URL}/news/${n.slug}</loc>
    <lastmod>${n.publishedAt ? new Date(n.publishedAt).toISOString().split('T')[0] : ''}</lastmod>
    <priority>0.5</priority>
    <changefreq>monthly</changefreq>
  </url>`).join('\n')}
</urlset>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
    },
  })
}
