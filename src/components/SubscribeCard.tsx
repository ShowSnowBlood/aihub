'use client'

import { useState } from 'react'
import { Mail, Check, Loader2 } from 'lucide-react'

export default function SubscribeCard() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setStatus('loading')
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() })
      })
      const data = await res.json()

      if (res.ok) {
        setStatus('success')
        setMessage(data.alreadySubscribed ? '该邮箱已订阅' : data.message)
        if (!data.alreadySubscribed) setEmail('')
      } else {
        setStatus('error')
        setMessage(data.error || '订阅失败')
      }
    } catch {
      setStatus('error')
      setMessage('网络错误，请稍后重试')
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* 渐变背景 */}
      <div className="bg-gradient-to-br from-neon-cyan/15 via-neon-magenta/10 to-neon-cyan/15 border border-cyber-border rounded-xl p-5">
        {status === 'success' ? (
          <div className="text-center py-3">
            <div className="w-11 h-11 mx-auto mb-2.5 rounded-full bg-neon-green/20 flex items-center justify-center">
              <Check className="w-5 h-5 text-neon-green" />
            </div>
            <h3 className="font-orbitron font-semibold text-neon-green text-sm mb-1">订阅成功！</h3>
            <p className="text-cyber-muted-foreground text-xs font-mono">{message}</p>
            <button 
              onClick={() => { setStatus('idle'); setEmail(''); setMessage('') }}
              className="mt-2 text-xs text-neon-cyan hover:underline font-mono"
            >
              继续订阅其他邮箱
            </button>
          </div>
        ) : (
          <>
            <h3 className="font-orbitron font-semibold text-cyber-foreground mb-1.5 text-sm">订阅AI周刊</h3>
            <p className="text-cyber-muted-foreground text-xs mb-3 font-mono">每周精选AI行业动态，直达邮箱</p>
            <form onSubmit={handleSubmit}>
              <div className="relative mb-2.5">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neon-cyan" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); status === 'error' && setStatus('idle') }}
                  placeholder="输入邮箱地址"
                  required
                  disabled={status === 'loading'}
                  className="w-full pl-8 pr-3 py-2 bg-cyber-background border border-cyber-border rounded-lg text-cyber-foreground placeholder:text-cyber-muted-foreground focus:border-neon-cyan focus:outline-none transition-colors font-mono text-xs disabled:opacity-50"
                />
              </div>
              {status === 'error' && (
                <p className="text-neon-red text-xs mb-2 font-mono">{message}</p>
              )}
              <button 
                type="submit"
                disabled={status === 'loading'}
                className="w-full py-2 bg-neon-green/20 text-neon-green border border-neon-green/50 rounded-lg font-mono uppercase tracking-wider text-xs hover:bg-neon-green hover:text-cyber-background hover:border-neon-green transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {status === 'loading' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    订阅中...
                  </>
                ) : '订阅'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
