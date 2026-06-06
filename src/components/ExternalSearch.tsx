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
      doSearch(initialQuery)
    }
  }, [initialQuery])

  const doSearch = async (q: string) => {
    if (!q.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/search/external?q=${encodeURIComponent(q.trim())}`)
      const data = await res.json()
      setResult(data)
    } catch {
      setResult({ query: q, error: '搜索失败' })
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    if (!query.trim()) return
    doSearch(query.trim())
  }

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/search/external?q=${encodeURIComponent(query.trim())}`)
      const data = await res.json()
      setResult(data)
    } catch {
      setResult({ query, error: '搜索失败' })
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
    if (e.key === 'Escape') onClose?.()
  }

  return (
    <div className="relative w-full max-w-2xl mx-4 bg-cyber-card border border-cyber-border shadow-[0_0_30px_rgba(0,212,255,0.15)] animate-in fade-in slide-in-from-top-4 duration-200">
      {/* 搜索框 */}
      <div className="flex items-center gap-3 p-4 border-b border-cyber-border">
        <Search className="w-5 h-5 text-neon-cyan flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="搜索全网（DuckDuckGo即时百科）..."
          className="flex-1 bg-transparent border-none text-cyber-foreground font-mono text-sm outline-none placeholder:text-cyber-muted-foreground/50"
        />
        {loading && <Loader2 className="w-4 h-4 animate-spin text-neon-cyan" />}
        <button onClick={() => onClose?.()} className="text-cyber-muted-foreground hover:text-cyber-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

            {/* 结果区 */}
            {result && (
              <div className="p-4 max-h-[60vh] overflow-y-auto space-y-4">
                {result.error ? (
                  <p className="text-neon-magenta font-mono text-sm">{result.error}</p>
                ) : (
                  <>
                    {/* 百科摘要（核心功能） */}
                    {result.abstract && (
                      <div className="bg-cyber-muted/20 border border-neon-cyan/20 p-4">
                        <div className="flex items-start gap-4">
                          {result.abstract.image && (
                            <img src={result.abstract.image} alt="" className="w-16 h-16 object-cover flex-shrink-0 border border-cyber-border" />
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-orbitron font-bold text-neon-cyan mb-1">
                              {result.abstract.title}
                            </h3>
                            <p className="text-xs text-cyber-muted-foreground font-mono leading-relaxed">
                              {result.abstract.text}
                            </p>
                            <a
                              href={result.abstract.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 mt-2 text-[10px] text-neon-green hover:text-neon-cyan font-mono"
                            >
                              来源: {result.abstract.source}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 精选结果 */}
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

                    {/* 相关话题 */}
                    {result.related && result.related.length > 0 && (
                      <div>
                        <p className="text-[10px] font-orbitron text-cyber-muted-foreground uppercase tracking-wider mb-2">相关话题</p>
                        <div className="flex flex-wrap gap-2">
                          {result.related.map((r, i) => (
                            <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                              className="px-3 py-1.5 text-xs font-mono border border-cyber-border text-cyber-muted-foreground hover:text-neon-cyan hover:border-neon-cyan/50 transition-all"
                              style={{ clipPath: 'polygon(0 0, calc(100% - 3px) 0, 100% 3px, 100% 100%, 3px 100%, 0 calc(100% - 3px))' }}
                            >
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
                )}
    </div>
  )
}
