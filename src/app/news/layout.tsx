import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AI资讯 | AI Hub',
  description: '每日更新最新AI行业资讯，涵盖大模型动态、AI应用落地、技术突破、政策解读等热点信息。第一时间掌握ChatGPT、Claude、Gemini等主流AI产品更新，了解人工智能领域的前沿趋势与发展方向。',
}

export default function NewsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
