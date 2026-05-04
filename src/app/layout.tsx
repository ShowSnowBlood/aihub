import type { Metadata } from 'next'
import './globals.css'
import BackToTop from '@/components/BackToTop'

export const metadata: Metadata = {
  title: 'AI Hub - 全球AI工具聚合平台',
  description: '发现最新最热的AI工具、开源项目和AI资讯',
  icons: {
    icon: '/favicon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className="bg-[#0a0a0f]">
      <body className="min-h-screen bg-[#0a0a0f] text-cyber-foreground font-mono relative transition-colors duration-300">
        {/* Grid Background Pattern - Hidden in light mode */}
        <div className="fixed inset-0 grid-pattern pointer-events-none dark-only" />
        
        {/* Circuit Pattern Overlay - Hidden in light mode */}
        <div className="fixed inset-0 circuit-pattern pointer-events-none opacity-50 dark-only" />
        
        {/* Scanline Overlay - Hidden in light mode */}
        <div className="scanlines dark-only" />
        
        {/* Light mode subtle background pattern */}
        <div className="fixed inset-0 light-only pointer-events-none opacity-30" 
          style={{
            backgroundImage: 'linear-gradient(rgba(0,184,148,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,184,148,0.05) 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }} 
        />
        
        {/* Main Content */}
        <div className="relative z-10">
          {children}
        </div>
        
        <BackToTop />
      </body>
    </html>
  )
}
