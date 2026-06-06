'use client'

import { Search, ExternalLink, Loader2, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

interface ExternalSearchResult {
  query: string
  abstract?: {
    id: number
    title: string
    text: string
    fullText?: string
    source: string
    url: string
    image: string | null
  }
  results?: Array<{ id: number; title: string; url: string; text: string | null }>
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
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [expandedText, setExpandedText] = useState<string>('')
  const [expanding, setExpanding] = useState(false)
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
    setExpandedId(null)
    setExpandedText('')
    try {
      const query = q.trim()
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      const res = await fetch(`/api/search/external?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!res.ok) throw new Error('搜索请求失败')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data)
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

  // 展开阅读全文（站内，不走外链）
  const expandArticle = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpanding(true)
    setExpandedId(id)
    try {
      const res = await fetch(`/api/search/external/article?id=${id}`)
      const data = await res.json()
      setExpandedText(data.text || '暂无内容')
    } catch {
      setExpandedText('加载失败')
    } finally {
      setExpanding(false)
    }
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
            {/* 百科摘要 */}
            {result.abstract && (
              <div className="bg-cyber-muted/20 border border-neon-cyan/20 p-4">
                <div className="flex items-start gap-4">
                  {result.abstract.image && (
                    <img src={result.abstract.image} alt="" className="w-16 h-16 object-cover flex-shrink-0 border border-cyber-border rounded"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-orbitron font-bold text-neon-cyan mb-1">{result.abstract.title}</h3>
                    <p className="text-xs text-cyber-muted-foreground font-mono leading-relaxed">{result.abstract.text}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <button
                        onClick={() => expandArticle(result.abstract!.id)}
                        className="inline-flex items-center gap-1 text-[10px] text-neon-green hover:text-neon-cyan font-mono transition-colors"
                      >
                        {expanding && expandedId === result.abstract.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : expandedId === result.abstract.id ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                        {expandedId === result.abstract.id ? '收起全文' : '展开全文'}
                      </button>
                      <span className="text-[10px] text-cyber-muted-foreground/50 font-mono">
                        来源: Wikipedia
                      </span>
                    </div>
                  </div>
                </div>
                {/* 展开的全文 */}
                {expandedId === result.abstract.id && (
                  <div className="mt-4 pt-4 border-t border-cyber-border/50">
                    <div className="text-xs text-cyber-muted-foreground font-mono leading-relaxed whitespace-pre-line max-h-80 overflow-y-auto">
                      {expandedText}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 更多结果 */}
            {result.results && result.results.length > 0 && (
              <div>
                <p className="text-[10px] font-orbitron text-cyber-muted-foreground uppercase tracking-wider mb-2">更多结果</p>
                <div className="space-y-2">
                  {result.results.map((r, i) => (
                    <div key={i}>
                      <button
                        onClick={() => expandArticle(r.id)}
                        className="w-full text-left p-3 border border-cyber-border hover:border-neon-cyan/30 hover:bg-neon-cyan/5 transition-all font-mono text-sm group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-neon-cyan group-hover:text-neon-green transition-colors">{r.title}</span>
                          {expandedId === r.id ? (
                            <ChevronUp className="w-3.5 h-3.5 text-cyber-muted-foreground flex-shrink-0" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-cyber-muted-foreground flex-shrink-0" />
                          )}
                        </div>
                        {r.text && (
                          <p className="text-xs text-cyber-muted-foreground/60 mt-1">{r.text}</p>
                        )}
                      </button>
                      {expandedId === r.id && (
                        <div className="p-3 border-x border-b border-neon-cyan/20 bg-cyber-muted/10">
                          {expanding ? (
                            <div className="flex items-center gap-2 text-xs text-cyber-muted-foreground font-mono">
                              <Loader2 className="w-3 h-3 animate-spin text-neon-cyan" />
                              加载中...
                            </div>
                          ) : (
                            <div className="text-xs text-cyber-muted-foreground font-mono leading-relaxed whitespace-pre-line max-h-60 overflow-y-auto">
                              {expandedText}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
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
