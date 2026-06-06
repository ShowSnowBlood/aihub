import { NextRequest, NextResponse } from 'next/server'

// GET /api/search/external?q=搜索词
// 代理 Wikipedia API（免费、无限制、境内可访问、百科结果）
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')
  if (!q || !q.trim()) {
    return NextResponse.json({ results: [] })
  }

  try {
    const query = q.trim()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 7000)

    // 第一步：搜索 Wikipedia 文章
    const searchUrl = `https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5&utf8=1`
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'AIHub/1.0 (https://ai999999.top)' },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!searchRes.ok) {
      return NextResponse.json({ error: '搜索失败' }, { status: 502 })
    }

    const searchData = await searchRes.json()
    const searchResults = searchData?.query?.search || []

    const result: any = {
      query,
      source: 'Wikipedia',
    }

    // 第二步：如果有结果，获取第一个的摘要
    if (searchResults.length > 0) {
      const topId = searchResults[0].pageid
      const extractUrl = `https://zh.wikipedia.org/w/api.php?action=query&pageids=${topId}&prop=extracts|pageimages&exintro&explaintext&exsentences=5&pithumbsize=200&format=json&utf8=1`
      
      const extractRes = await fetch(extractUrl, {
        headers: { 'User-Agent': 'AIHub/1.0 (https://ai999999.top)' },
      })
      const extractData = await extractRes.json()
      const page = extractData?.query?.pages?.[topId]

      if (page) {
        result.abstract = {
          id: topId,
          title: page.title || query,
          text: page.extract?.replace(/<\/?[^>]+>/g, '').trim() || searchResults[0].snippet?.replace(/<\/?[^>]+>/g, '') || '',
          source: 'Wikipedia',
          url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
          image: page.thumbnail?.source ? (page.thumbnail.source.startsWith('//') ? 'https:' + page.thumbnail.source : page.thumbnail.source) : null,
        }

        // 同时获取全文（用于站内展开阅读）
        try {
          const fullUrl = `https://zh.wikipedia.org/w/api.php?action=query&pageids=${topId}&prop=extracts&explaintext&format=json&utf8=1`
          const fullRes = await fetch(fullUrl, {
            headers: { 'User-Agent': 'AIHub/1.0 (https://ai999999.top)' },
          })
          const fullData = await fullRes.json()
          const fullPage = fullData?.query?.pages?.[topId]
          if (fullPage?.extract) {
            result.abstract.fullText = fullPage.extract.replace(/<\/?[^>]+>/g, '').trim()
          }
        } catch {
          // 全文获取失败不影响主结果
        }
      }

      // 更多结果
      result.results = searchResults.slice(0, 5).map((r: any) => ({
        id: r.pageid,
        title: r.title,
        url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(r.title)}`,
        text: r.snippet?.replace(/<\/?[^>]+>/g, '') || null,
      }))
    }

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' }
    })
  } catch (error: any) {
    console.error('外部搜索失败:', error.message)
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: '搜索超时，请稍后重试' }, { status: 504 })
    }
    return NextResponse.json({ error: '搜索服务暂时不可用' }, { status: 500 })
  }
}
