import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// 转义 XML 特殊字符
function escapeXml(str: string): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const now = new Date().toUTCString()

  // 获取最新 AI 资讯
  const newsList = await prisma.news.findMany({
    orderBy: { publishedAt: 'desc' },
    take: 20,
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      sourceUrl: true,
      sourceName: true,
      publishedAt: true,
      createdAt: true,
    },
  })

  // 获取最新工具
  const tools = await prisma.tool.findMany({
    where: { status: 'approved', isActive: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      name: true,
      slug: true,
      shortDesc: true,
      description: true,
      createdAt: true,
    },
  })

  const newsItems = newsList
    .map((item) => {
      const link = item.sourceUrl || `${siteUrl}/news`
      const pubDate = (item.publishedAt || item.createdAt).toUTCString()
      const desc = escapeXml(item.summary || '')
      const title = escapeXml(item.title)
      return `    <item>
      <title>${title}</title>
      <link>${link}</link>
      <description>${desc}</description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">${siteUrl}/news#${item.slug}</guid>
    </item>`
    })
    .join('\n')

  const toolItems = tools
    .map((tool) => {
      const link = `${siteUrl}/tools/${tool.slug}`
      const pubDate = tool.createdAt.toUTCString()
      const desc = escapeXml(tool.shortDesc || tool.description || '')
      const title = escapeXml(tool.name)
      return `    <item>
      <title>${title}</title>
      <link>${link}</link>
      <description>${desc}</description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="true">${link}</guid>
      <category>AI工具</category>
    </item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AI Hub - AI工具与资讯</title>
    <link>${siteUrl}</link>
    <description>发现全球最新最热的AI工具、开源项目和AI资讯</description>
    <language>zh-CN</language>
    <lastBuildDate>${now}</lastBuildDate>
    <managingEditor>noreply@aihub.dev (AI Hub)</managingEditor>
    <atom:link href="${siteUrl}/api/rss.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>${siteUrl}/favicon.ico</url>
      <title>AI Hub</title>
      <link>${siteUrl}</link>
    </image>
${newsItems}
${toolItems}
  </channel>
</rss>`

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
