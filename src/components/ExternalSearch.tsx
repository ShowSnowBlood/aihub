'use client'

import { Search, ExternalLink, Loader2, X } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

interface ExternalSearchResult {
  query: string
  abstract?: {
    title: string
    text: string
    source: string
    url: string
    image: string | null
  }
  results?: Array<{ title: string; url: string; text: string | null }>
  related?: Array<{ text: string; url: string }>
  error?: string
}

interface ExternalSearchProps {
  initialQuery?: string
  onClose?: () => void
}

export default function ExternalSearch({ initialQuery = '', onClose }: ExternalSearchProps) {
  const [query, setQuery] = useState(initialQuery)
  const [result, setResult] = useState<ExternalSearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [doneInitial, setDoneInitial] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    if (initialQuery && !doneInitial) {
      setDoneInitial(true)
      fetcher(initialQuery)
    }
  }, [initialQuery])

  const fetcher = async (q: string) => {
    if (!q.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const query = q.trim()
      // 浏览器直调 Wikipedia API（支持 CORS，0 额度消耗）
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)

      const searchUrl = `https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5&utf8=1&origin=*`
      const searchRes = await fetch(searchUrl, { signal: controller.signal })
      clearTimeout(timeout)
      if (!searchRes.ok) throw new Error('搜索请求失败')

      const searchData = await searchRes.json()
      const searchResults = searchData?.query?.search || []

      const processed: ExternalSearchResult = { query }

      if (searchResults.length > 0) {
        const topId = searchResults[0].pageid
        const extractUrl = `https://zh.wikipedia.org/w/api.php?action=query&pageids=${topId}&prop=extracts|pageimages&exintro&explaintext&exsentences=5&pithumbsize=200&format=json&utf8=1&origin=*`
        const extractRes = await fetch(extractUrl)
        const extractData = await extractRes.json()
        const page = extractData?.query?.pages?.[topId]

        if (page) {
          processed.abstract = {
            title: page.title || query,
            text: page.extract?.replace(/<\/?[^>]+>/g, '').trim() || '',
            source: 'Wikipedia',
            url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
            image: page.thumbnail?.source || null,
          }
        }

        processed.results = searchResults.slice(0, 5).map((r: any) => ({
          title: r.title,
          url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(r.title)}`,
          text: r.snippet?.replace(/<\/?[^>]+>/g, '') || null,
        }))
      }

      setResult(processed)
    } catch {
      setResult({ query: q, error: '搜索失败，请稍后重试' })
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    if (!query.trim()) return
    fetcher(query.trim())
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
    if (e.key === 'Escape') onClose?.()
  }

  return (
    <div className="relative w-full max-w-2xl mx-4 bg-cyber-card border border-cyber-border shadow-[0_0_30px_rgba(0,212,255,0.15)] animate-in fade-in slide-in-from-top-4 duration-200">
      <div className="flex items-center gap-3 p-4 border-b border-cyber-border">
        <Search className="w-5 h-5 text-neon-cyan flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="搜索百科（Wikipedia）..."
          className="flex-1 bg-transparent border-none text-cyber-foreground font-mono text-sm outline-none placeholder:text-cyber-muted-foreground/50"
        />
        {loading && <Loader2 className="w-4 h-4 animate-spin text-neon-cyan" />}
        <button onClick={() => onClose?.()} className="text-cyber-muted-foreground hover:text-cyber-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 max-h-[60vh] overflow-y-auto space-y-4">
        {result && result.error ? (
          <p className="text-neon-magenta font-mono text-sm">{result.error}</p>
        ) : result ? (
          <>
            {result.abstract && (
              <div className="bg-cyber-muted/20 border border-neon-cyan/20 p-4">
                <div className="flex items-start gap-4">
                  {result.abstract.image && (
                    <img src={result.abstract.image} alt="" className="w-16 h-16 object-cover flex-shrink-0 border border-cyber-border" />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-orbitron font-bold text-neon-cyan mb-1">{result.abstract.title}</h3>
                    <p className="text-xs text-cyber-muted-foreground font-mono leading-relaxed">{result.abstract.text}</p>
                    {result.abstract.url && (
                      <a href={result.abstract.url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-2 text-[10px] text-neon-green hover:text-neon-cyan font-mono">
                        来源: {result.abstract.source}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {result.results && result.results.length > 0 && (
              <div>
                <p className="text-[10px] font-orbitron text-cyber-muted-foreground uppercase tracking-wider mb-2">精选结果</p>
                <div className="space-y-2">
                  {result.results.map((r, i) => (
                    <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                      className="block p-3 border border-cyber-border hover:border-neon-cyan/30 hover:bg-neon-cyan/5 transition-all font-mono text-sm group">
                      <span className="text-neon-cyan group-hover:text-neon-green transition-colors">{r.title}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {result.related && result.related.length > 0 && (
              <div>
                <p className="text-[10px] font-orbitron text-cyber-muted-foreground uppercase tracking-wider mb-2">相关话题</p>
                <div className="flex flex-wrap gap-2">
                  {result.related.map((r, i) => (
                    <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                      className="px-3 py-1.5 text-xs font-mono border border-cyber-border text-cyber-muted-foreground hover:text-neon-cyan hover:border-neon-cyan/50 transition-all"
                      style={{ clipPath: 'polygon(0 0, calc(100% - 3px) 0, 100% 3px, 100% 100%, 3px 100%, 0 calc(100% - 3px))' }}>
                      {r.text?.split(' - ')[0] || r.text}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {!result.abstract && !result.results && !result.related && (
              <p className="text-cyber-muted-foreground font-mono text-sm text-center py-8">未找到相关百科内容，换个词试试</p>
            )}
          </>
        ) : !loading && (
          <p className="text-cyber-muted-foreground/50 font-mono text-xs text-center">
            由 Wikipedia 提供百科搜索 · 完全免费 无限使用
          </p>
        )}
      </div>
    </div>
  )
}
