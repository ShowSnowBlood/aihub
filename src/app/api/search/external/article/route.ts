import { NextRequest, NextResponse } from 'next/server'

// GET /api/search/external/article?id=12345
// 获取 Wikipedia 文章全文（通过 Vercel 代理，解决被墙问题）
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  const title = request.nextUrl.searchParams.get('title')

  if (!id && !title) {
    return NextResponse.json({ error: '缺少 id 或 title 参数' }, { status: 400 })
  }

  try {
    let pageId = id
    if (!pageId && title) {
      // 通过标题查询 pageid
      const searchUrl = `https://zh.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&format=json&utf8=1`
      const searchRes = await fetch(searchUrl, {
        headers: { 'User-Agent': 'AIHub/1.0 (https://ai999999.top)' },
      })
      const searchData = await searchRes.json()
      const pages = searchData?.query?.pages || {}
      pageId = Object.keys(pages)[0]
    }

    const extractUrl = `https://zh.wikipedia.org/w/api.php?action=query&pageids=${pageId}&prop=extracts|pageimages&explaintext&pithumbsize=400&format=json&utf=1`
    const res = await fetch(extractUrl, {
      headers: { 'User-Agent': 'AIHub/1.0 (https://ai999999.top)' },
    })

    if (!res.ok) {
      return NextResponse.json({ error: '获取文章失败' }, { status: 502 })
    }

    const data = await res.json()
    const page = data?.query?.pages?.[pageId as string]

    if (!page) {
      return NextResponse.json({ error: '文章不存在' }, { status: 404 })
    }

    return NextResponse.json({
      title: page.title,
      text: page.extract?.replace(/<\/?[^>]+>/g, '').trim() || '暂无内容',
      image: page.thumbnail?.source ? (page.thumbnail.source.startsWith('//') ? 'https:' + page.thumbnail.source : page.thumbnail.source) : null,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=7200, stale-while-revalidate=14400' }
    })
  } catch (error: any) {
    console.error('获取文章失败:', error.message)
    return NextResponse.json({ error: '获取文章失败' }, { status: 500 })
  }
}
