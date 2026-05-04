import Link from 'next/link'
import { Home, Search, AlertTriangle } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-cyber-background flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* 错误码 */}
        <div className="text-center mb-8">
          <div className="relative inline-block">
            <div className="text-[120px] font-orbitron font-black text-transparent bg-clip-text bg-gradient-to-r from-neon-magenta to-neon-cyan select-none leading-none"
              style={{ textShadow: '0 0 40px rgba(255,0,255,0.3)' }}>
              404
            </div>
            <div className="absolute -top-2 -right-2 w-4 h-4 bg-neon-magenta animate-pulse" 
              style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} />
          </div>
          <h1 className="text-2xl font-orbitron font-bold text-cyber-foreground mt-4">
            页面未找到
          </h1>
          <p className="text-cyber-muted-foreground font-mono text-sm mt-2">
            {'>'} 你访问的页面不存在或已被移除
          </p>
        </div>

        {/* 提示卡片 */}
        <div className="bg-cyber-card border border-cyber-border p-6 relative mb-6"
          style={{ clipPath: 'polygon(0 16px, 16px 0, calc(100% - 16px) 0, 100% 16px, 100% calc(100% - 16px), calc(100% - 16px) 100%, 16px 100%, 0 calc(100% - 16px))' }}>
          
          {/* Corner accents */}
          <div className="absolute top-0 left-0 w-5 h-5 border-l-2 border-t-2 border-neon-magenta" />
          <div className="absolute top-0 right-0 w-5 h-5 border-r-2 border-t-2 border-neon-magenta" />
          <div className="absolute bottom-0 left-0 w-5 h-5 border-l-2 border-b-2 border-neon-magenta" />
          <div className="absolute bottom-0 right-0 w-5 h-5 border-r-2 border-b-2 border-neon-magenta" />

          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-neon-magenta/10 border border-neon-magenta/30 flex items-center justify-center flex-shrink-0"
              style={{ clipPath: 'polygon(0 5px, 5px 0, calc(100% - 5px) 0, 100% 5px, 100% calc(100% - 5px), calc(100% - 5px) 100%, 5px 100%, 0 calc(100% - 5px))' }}>
              <AlertTriangle className="w-5 h-5 text-neon-magenta" />
            </div>
            <div>
              <p className="text-sm text-cyber-muted-foreground font-mono">
                可能的原因：
              </p>
              <ul className="text-sm text-cyber-muted-foreground font-mono mt-2 space-y-1 list-disc list-inside">
                <li>链接地址拼写有误</li>
                <li>页面已被删除或下架</li>
                <li>你没有访问该页面的权限</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3">
          <Link
            href="/"
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-[#00ff88] to-[#00d4ff] text-[#0a0a0f] font-orbitron font-bold text-sm hover:shadow-[0_0_24px_rgba(0,255,136,0.35)] transition-all tracking-wider"
            style={{ clipPath: 'polygon(0 8px, 8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px))' }}
          >
            <Home className="w-4 h-4" />
            回到首页
          </Link>
          <Link
            href="/tools"
            className="flex-1 flex items-center justify-center gap-2 py-3 border border-cyber-border text-cyber-foreground hover:border-neon-cyan hover:text-neon-cyan transition-all font-mono text-sm"
            style={{ clipPath: 'polygon(0 8px, 8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px))' }}
          >
            <Search className="w-4 h-4" />
            浏览工具
          </Link>
        </div>
      </div>
    </div>
  )
}
