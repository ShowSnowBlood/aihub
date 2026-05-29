import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '登录 / 注册 | AI Hub',
  description: '登录或注册AI Hub账号，加入AI工具社区。收藏你喜欢的AI工具、分享使用体验、参与讨论，与更多AI爱好者一起发现前沿人工智能产品。',
}

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
