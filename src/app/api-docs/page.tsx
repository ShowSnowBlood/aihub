'use client'

import { Code2, Zap, Shield, Globe, Copy, ChevronRight, Radio, Terminal, BookOpen } from 'lucide-react'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { useState, useEffect } from 'react'

function useBaseUrl() {
  const [baseUrl, setBaseUrl] = useState('http://localhost:3000')
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBaseUrl(window.location.origin)
    }
  }, [])
  return baseUrl
}

function GlitchHeading({ text, className = '' }: { text: string; className?: string }) {
  return (
    <h1
      className={`relative font-orbitron font-black uppercase tracking-wider ${className}`}
      data-text={text}
    >
      <span className="relative z-10">{text}</span>
      <span
        className="absolute top-0 left-0 -z-10 text-neon-magenta opacity-70"
        style={{ clipPath: 'polygon(0 0, 100% 0, 100% 45%, 0 45%)', transform: 'translateX(-2px)' }}
      >
        {text}
      </span>
      <span
        className="absolute top-0 left-0 -z-10 text-neon-cyan opacity-70"
        style={{ clipPath: 'polygon(0 55%, 100% 55%, 100% 100%, 0 100%)', transform: 'translateX(2px)' }}
      >
        {text}
      </span>
    </h1>
  )
}

interface EndpointProps {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  desc: string
  params?: { name: string; type: string; required?: boolean; desc: string }[]
  response: string
  example: string
}

function MethodBadge({ method }: { method: EndpointProps['method'] }) {
  const map = {
    GET: 'text-neon-green border-neon-green bg-neon-green/10',
    POST: 'text-neon-cyan border-neon-cyan bg-neon-cyan/10',
    PUT: 'text-neon-yellow border-neon-yellow bg-neon-yellow/10',
    DELETE: 'text-neon-magenta border-neon-magenta bg-neon-magenta/10',
  }
  return (
    <span className={`inline-block px-2 py-0.5 border text-xs font-orbitron font-bold tracking-widest clip-chamfer ${map[method]}`}>
      {method}
    </span>
  )
}

function EndpointCard({ method, path, desc, params, response, example }: EndpointProps) {
  return (
    <div className="relative border border-cyber-border clip-chamfer bg-cyber-card/40 overflow-hidden group hover:border-neon-cyan/50 transition-colors duration-300">
      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-neon-cyan opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-neon-cyan opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-cyber-border bg-cyber-card/60">
        <MethodBadge method={method} />
        <code className="text-neon-cyan font-mono text-sm font-bold">{path}</code>
        <span className="text-cyber-muted-foreground text-sm font-mono hidden md:block">{desc}</span>
      </div>

      <div className="p-5 grid md:grid-cols-2 gap-6">
        {/* Left */}
        <div>
          <p className="text-cyber-muted-foreground text-sm font-mono mb-4 md:hidden">{desc}</p>

          {params && params.length > 0 && (
            <>
              <h4 className="text-xs font-orbitron text-neon-cyan uppercase tracking-widest mb-3">
                <ChevronRight className="inline w-3 h-3" /> 请求参数
              </h4>
              <div className="space-y-2">
                {params.map((p) => (
                  <div key={p.name} className="flex items-start gap-3 text-sm font-mono">
                    <span className="text-neon-green min-w-[80px]">{p.name}</span>
                    <span className="text-neon-yellow/70 min-w-[50px]">{p.type}</span>
                    <span className={`text-xs px-1.5 py-0.5 min-w-[40px] text-center clip-chamfer ${p.required ? 'border border-neon-magenta/50 text-neon-magenta/70' : 'border border-cyber-border text-cyber-muted-foreground'}`}>
                      {p.required ? '必填' : '可选'}
                    </span>
                    <span className="text-cyber-muted-foreground">{p.desc}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <h4 className="text-xs font-orbitron text-neon-cyan uppercase tracking-widest mb-2 mt-5">
            <ChevronRight className="inline w-3 h-3" /> 响应说明
          </h4>
          <p className="text-cyber-muted-foreground text-sm font-mono leading-relaxed">{response}</p>
        </div>

        {/* Right: Code example */}
        <div>
          <h4 className="text-xs font-orbitron text-neon-cyan uppercase tracking-widest mb-2">
            <ChevronRight className="inline w-3 h-3" /> 示例
          </h4>
          <div className="relative bg-cyber-background/80 border border-cyber-border p-4 rounded overflow-x-auto">
            <pre className="text-xs text-neon-green/90 font-mono whitespace-pre">{example}</pre>
          </div>
        </div>
      </div>
    </div>
  )
}

const endpoints: EndpointProps[] = [
  {
    method: 'GET',
    path: '/api/tools',
    desc: '获取工具列表',
    params: [
      { name: 'page', type: 'number', desc: '页码，默认 1' },
      { name: 'limit', type: 'number', desc: '每页数量，默认 20，最大 100' },
      { name: 'category', type: 'string', desc: '分类 slug 过滤' },
      { name: 'q', type: 'string', desc: '关键词搜索' },
      { name: 'pricing', type: 'string', desc: 'FREE / FREEMIUM / PAID' },
    ],
    response: '返回工具列表数组，包含 id、name、slug、description、websiteUrl、pricingType、category 等字段。',
    example: `GET /api/tools?page=1&limit=10&category=text-ai

{
  "data": [
    {
      "id": 1,
      "name": "ChatGPT",
      "slug": "chatgpt",
      "pricingType": "FREEMIUM",
      "category": { "name": "文本生成", "slug": "text-ai" }
    }
  ],
  "total": 500,
  "page": 1
}`,
  },
  {
    method: 'GET',
    path: '/api/tools/:slug',
    desc: '获取工具详情',
    params: [
      { name: 'slug', type: 'string', required: true, desc: '工具唯一标识符' },
    ],
    response: '返回单个工具的完整信息，包含描述、标签、功能特性、官网链接等全量字段。',
    example: `GET /api/tools/chatgpt

{
  "id": 1,
  "name": "ChatGPT",
  "slug": "chatgpt",
  "description": "OpenAI 旗下对话式 AI...",
  "websiteUrl": "https://chat.openai.com",
  "tags": ["对话", "写作", "编程"],
  "upvotes": 1024,
  "viewCount": 99999
}`,
  },
  {
    method: 'GET',
    path: '/api/categories',
    desc: '获取所有分类',
    response: '返回所有工具分类列表，包含 id、name、slug、description、icon 及工具数量统计。',
    example: `GET /api/categories

[
  {
    "id": 1,
    "name": "文本生成",
    "slug": "text-ai",
    "icon": "✍️",
    "_count": { "tools": 128 }
  }
]`,
  },
  {
    method: 'GET',
    path: '/api/news',
    desc: '获取 AI 资讯列表',
    params: [
      { name: 'page', type: 'number', desc: '页码，默认 1' },
      { name: 'limit', type: 'number', desc: '每页数量，默认 20' },
    ],
    response: '返回最新 AI 资讯列表，包含标题、摘要、来源、发布时间等字段，按发布时间倒序排列。',
    example: `GET /api/news?limit=5

{
  "data": [
    {
      "id": 1,
      "title": "GPT-5 正式发布...",
      "slug": "gpt-5-release",
      "summary": "...",
      "sourceUrl": "https://...",
      "publishedAt": "2026-04-15T08:00:00Z"
    }
  ]
}`,
  },
]

export default function ApiDocsPage() {
  const baseUrl = useBaseUrl()

  return (
    <div className="min-h-screen bg-cyber-background text-cyber-foreground">
      <Navbar />

      {/* Hero */}
      <section className="relative pt-28 pb-16 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neon-cyan to-transparent opacity-60" />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 border border-neon-cyan/40 clip-chamfer bg-neon-cyan/5 mb-8">
            <Code2 className="w-3 h-3 text-neon-cyan" />
            <span className="text-xs font-orbitron text-neon-cyan tracking-widest uppercase">API DOCS</span>
          </div>

          <GlitchHeading text="开放 API" className="text-4xl md:text-5xl text-cyber-foreground mb-6" />

          <p className="text-lg text-cyber-muted-foreground font-mono leading-relaxed max-w-2xl mx-auto mb-8">
            免费获取 AI Hub 工具数据库，构建你自己的 AI 应用。<br />
            RESTful API，JSON 响应，无需注册，开箱即用。
          </p>

          {/* Feature badges */}
          <div className="flex flex-wrap justify-center gap-3">
            {[
              { icon: Zap, text: '免费使用', color: 'text-neon-green border-neon-green/40 bg-neon-green/5' },
              { icon: Shield, text: '无需 API Key', color: 'text-neon-cyan border-neon-cyan/40 bg-neon-cyan/5' },
              { icon: Globe, text: 'RESTful JSON', color: 'text-neon-magenta border-neon-magenta/40 bg-neon-magenta/5' },
              { icon: BookOpen, text: '500+ 工具数据', color: 'text-neon-yellow border-neon-yellow/40 bg-neon-yellow/5' },
            ].map(({ icon: Icon, text, color }) => (
              <div key={text} className={`inline-flex items-center gap-2 px-4 py-1.5 border clip-chamfer text-xs font-mono ${color}`}>
                <Icon className="w-3 h-3" />
                {text}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Base URL */}
      <section className="py-8 border-t border-cyber-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative p-5 border border-neon-green/30 clip-chamfer bg-cyber-card/30 flex items-center gap-4">
            <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-neon-green" />
            <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-neon-green" />
            <Terminal className="w-5 h-5 text-neon-green flex-shrink-0" />
            <div>
              <div className="text-xs font-orbitron text-neon-green uppercase tracking-widest mb-1">Base URL</div>
              <code className="font-mono text-sm text-cyber-foreground">{baseUrl}</code>
            </div>
            <div className="ml-auto">
              <div className="inline-flex items-center gap-1 text-xs font-mono text-cyber-muted-foreground border border-cyber-border px-2 py-1 clip-chamfer">
                <Radio className="w-3 h-3 text-neon-green animate-pulse" />
                在线
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Rate Limit Info */}
      <section className="pb-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: '请求频率', value: '60 次 / 分钟', color: 'border-neon-cyan text-neon-cyan' },
              { label: '单次最大', value: '100 条数据', color: 'border-neon-green text-neon-green' },
              { label: '协议', value: 'MIT 开放协议', color: 'border-neon-magenta text-neon-magenta' },
            ].map((item) => (
              <div key={item.label} className={`p-4 border clip-chamfer bg-cyber-card/30 ${item.color}`}>
                <div className={`text-lg font-orbitron font-black ${item.color.split(' ')[1]}`}>{item.value}</div>
                <div className="text-xs font-mono text-cyber-muted-foreground mt-1 uppercase tracking-wider">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Endpoints */}
      <section className="py-10 border-t border-cyber-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10">
            <h2 className="font-orbitron font-bold text-xl uppercase tracking-wider text-cyber-foreground mb-2">
              <span className="text-neon-cyan">{'>'}</span> 接口列表
            </h2>
            <div className="w-16 h-px bg-gradient-to-r from-neon-cyan to-transparent" />
          </div>

          <div className="space-y-6">
            {endpoints.map((ep) => (
              <EndpointCard key={ep.path} {...ep} />
            ))}
          </div>
        </div>
      </section>

      {/* Quick start */}
      <section className="py-16 border-t border-cyber-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h2 className="font-orbitron font-bold text-xl uppercase tracking-wider text-cyber-foreground mb-2">
              <span className="text-neon-green">{'>'}</span> 快速开始
            </h2>
            <div className="w-16 h-px bg-gradient-to-r from-neon-green to-transparent" />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="relative border border-cyber-border clip-chamfer bg-cyber-card/40 p-6">
              <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-neon-cyan" />
              <h3 className="font-orbitron font-bold text-sm uppercase tracking-wide text-neon-cyan mb-4">JavaScript / Fetch</h3>
              <div className="bg-cyber-background/80 border border-cyber-border p-4 rounded overflow-x-auto">
                <pre className="text-xs text-neon-green/90 font-mono whitespace-pre">{`const res = await fetch(
  '${baseUrl}/api/tools?limit=10'
)
const { data } = await res.json()
console.log(data)`}</pre>
              </div>
            </div>

            <div className="relative border border-cyber-border clip-chamfer bg-cyber-card/40 p-6">
              <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-neon-magenta" />
              <h3 className="font-orbitron font-bold text-sm uppercase tracking-wide text-neon-magenta mb-4">Python / requests</h3>
              <div className="bg-cyber-background/80 border border-cyber-border p-4 rounded overflow-x-auto">
                <pre className="text-xs text-neon-green/90 font-mono whitespace-pre">{`import requests

r = requests.get(
  '${baseUrl}/api/tools',
  params={'limit': 10}
)
data = r.json()['data']
print(data)`}</pre>
              </div>
            </div>
          </div>

          <div className="mt-8 p-5 border border-neon-yellow/30 clip-chamfer bg-neon-yellow/5">
            <p className="text-xs font-mono text-neon-yellow/80">
              ⚠ 当前 API 为公测版本，接口结构可能调整。建议关注 GitHub 了解更新。
              如果 API 对你有帮助，欢迎在 GitHub 上给项目点个 Star ⭐
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
