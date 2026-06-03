/**
 * 全局中间件
 * 功能1：API 请求频率限制（60次/分钟）
 * 功能2：安全响应头（兜底保护，next.config.js 的 headers 对所有路由生效）
 */
import { NextRequest, NextResponse } from 'next/server'

// 安全响应头（兜底 - 如果 next.config.js 的 headers() 在某些边缘情况不生效）
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
}

// CORS 头（限制为本站域名，阻止外部网站跨域调用）
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://ai999999.top',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// 内存限流
const requestCounts = new Map<string, { count: number; expiresAt: number }>()

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // === API 请求限流 ===
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // === CORS：处理 OPTIONS 预检请求 ===
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: { ...CORS_HEADERS, ...SECURITY_HEADERS } })
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || '127.0.0.1'

  const now = Date.now()
  const windowMs = 60_000

  // HF Space 和前端页面放宽限制
  const userAgent = request.headers.get('user-agent') || ''
  const isHF = userAgent.includes('HuggingFace') || request.headers.get('origin')?.includes('hf.space')
  const isBrowser = userAgent.includes('Mozilla') || userAgent.includes('Chrome') || userAgent.includes('Safari')

  // 非浏览器/HF的API请求（可能是爬虫或脚本）：10次/分钟
  // 浏览器/HF请求：60次/分钟
  const maxRequests = (isBrowser || isHF) ? 60 : 10

  // 对可疑 User-Agent 直接拦截（空/常见爬虫）
  const dangerousUA = ['curl', 'wget', 'python-requests', 'Go-http-client', 'fasthttp', 'Scrapy', 'okhttp']
  const isSuspicious = !isBrowser && !isHF && (
    !userAgent || 
    userAgent.length < 10 ||
    dangerousUA.some(ua => userAgent.toLowerCase().includes(ua.toLowerCase()))
  )

  if (isSuspicious) {
    console.warn(`⚠️ 拦截可疑请求: ${ip} - UA: ${userAgent.substring(0, 50)}`)
    return new NextResponse(
      JSON.stringify({ error: '请求被拒绝' }),
      { status: 403, headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS } }
    )
  }

  const record = requestCounts.get(ip)

  if (!record || record.expiresAt < now) {
    requestCounts.set(ip, { count: 1, expiresAt: now + windowMs })
    return NextResponse.next()
  }

  record.count++

  if (record.count > maxRequests) {
    return new NextResponse(
      JSON.stringify({ error: '请求过于频繁，请稍后再试' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '60',
          ...SECURITY_HEADERS,
        }
      }
    )
  }

  const response = NextResponse.next()
  // 对 API 响应追加 CORS + 安全头
  for (const [key, value] of Object.entries({ ...CORS_HEADERS, ...SECURITY_HEADERS })) {
    response.headers.set(key, value)
  }
  return response
}

export const config = {
  matcher: '/api/:path*',
}
