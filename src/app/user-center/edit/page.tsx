'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  User, Mail, MapPin, Link as LinkIcon, 
  ArrowLeft, Save, Loader2, Camera, X
} from 'lucide-react'
import Navbar from '@/components/Navbar'
import { getAvatarInitial } from '@/lib/utils'
import Footer from '@/components/Footer'

interface UserData {
  id: number
  username: string
  email: string
  avatarUrl: string | null
  bio: string | null
  location: string | null
  website: string | null
}

export default function EditProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    bio: '',
    location: '',
    website: '',
    avatarUrl: ''
  })

  useEffect(() => {
    const savedUser = localStorage.getItem('user')
    if (savedUser) {
      const parsed = JSON.parse(savedUser)
      setUser(parsed)
      setFormData({
        username: parsed.username || '',
        email: parsed.email || '',
        bio: parsed.bio || '',
        location: parsed.location || '',
        website: parsed.website || '',
        avatarUrl: parsed.avatarUrl || ''
      })
      if (parsed.avatarUrl) {
        setPreviewUrl(parsed.avatarUrl)
      }
    }
    setLoading(false)
  }, [])

  // 头像上传处理
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setMessage({ type: 'error', text: '只支持 JPG/PNG/GIF/WebP 格式' })
      return
    }

    // 验证文件大小
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: '头像文件不能超过 2MB' })
      return
    }

    setUploading(true)
    setMessage({ type: '', text: '' })

    try {
      const formDataUpload = new FormData()
      formDataUpload.append('avatar', file)
      formDataUpload.append('userId', String(user.id))

      const res = await fetch('/api/user/avatar', {
        method: 'POST',
        body: formDataUpload,
      })

      if (res.ok) {
        const data = await res.json()
        setFormData(prev => ({ ...prev, avatarUrl: data.avatarUrl }))
        setPreviewUrl(data.avatarUrl)
        setMessage({ type: 'success', text: '头像上传成功！' })
        setTimeout(() => setMessage({ type: '', text: '' }), 2000)
      } else {
        const error = await res.json()
        setMessage({ type: 'error', text: error.error || '上传失败' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误，请重试' })
    } finally {
      setUploading(false)
      // 重置 input 以便可以再次选择同一文件
      e.target.value = ''
    }
  }

  // 删除头像
  const handleRemoveAvatar = async () => {
    if (!user) return
    
    try {
      const res = await fetch(`/api/user/avatar?userId=${user.id}`, {
        method: 'DELETE'
      })
      
      if (res.ok) {
        setFormData(prev => ({ ...prev, avatarUrl: '' }))
        setPreviewUrl(null)
        setMessage({ type: 'success', text: '头像已移除' })
        setTimeout(() => setMessage({ type: '', text: '' }), 2000)
      }
    } catch (error) {
      console.error('删除头像失败:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    
    setSaving(true)
    setMessage({ type: '', text: '' })
    
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          ...formData
        })
      })
      
      if (res.ok) {
        const data = await res.json()
        // 更新 localStorage
        const updatedUser = { ...user, ...formData }
        localStorage.setItem('user', JSON.stringify(updatedUser))
        setMessage({ type: 'success', text: '资料更新成功！' })
        
        // 延迟跳转
        setTimeout(() => {
          router.push('/user-center')
        }, 1500)
      } else {
        const error = await res.json()
        setMessage({ type: 'error', text: error.error || '更新失败' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误，请重试' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cyber-background">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="text-center py-20 text-cyber-foreground/60">加载中...</div>
        </div>
        <Footer />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-cyber-background">
        <Navbar />
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <div 
            className="p-8 border border-cyber-border bg-cyber-surface/50"
            style={{ clipPath: 'polygon(0 8px, 8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px))' }}
          >
            <User className="w-16 h-16 text-neon-cyan/40 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-cyber-foreground mb-2">请先登录</h2>
            <p className="text-cyber-foreground/50 mb-6">登录后编辑你的资料</p>
            <Link
              href="/login"
              className="inline-block bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50 px-8 py-3 font-mono hover:bg-neon-cyan/30 transition-colors"
              style={{ clipPath: 'polygon(0 6px, 6px 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0 calc(100% - 6px))' }}
            >
              去登录
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cyber-background">
      <Navbar />
      
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* 返回按钮 */}
        <Link
          href="/user-center"
          className="inline-flex items-center gap-2 text-cyber-foreground/60 hover:text-neon-cyan mb-6 transition-colors font-mono"
        >
          <ArrowLeft className="w-4 h-4" />
          返回个人中心
        </Link>

        <div 
          className="border border-cyber-border bg-cyber-surface/30 p-6 md:p-8"
          style={{ clipPath: 'polygon(0 12px, 12px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 12px 100%, 0 calc(100% - 12px))' }}
        >
          <h1 className="text-2xl font-bold text-cyber-foreground mb-6 font-mono">
            <span className="text-neon-cyan">&gt;</span> 编辑资料
          </h1>
          
          {message.text && (
            <div className={`mb-6 p-4 border ${
              message.type === 'success' 
                ? 'border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan' 
                : 'border-red-500/50 bg-red-500/10 text-red-400'
            }`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 头像 - 可上传自定义 */}
            <div className="flex items-center gap-5">
              <div className="relative group">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="头像"
                    className="w-20 h-20 object-cover"
                    style={{ 
                      clipPath: 'polygon(0 8px, 8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px))'
                    }}
                  />
                ) : (
                  <div 
                    className="w-20 h-20 flex items-center justify-center text-cyber-background text-2xl font-bold"
                    style={{ 
                      background: 'linear-gradient(135deg, #00d4ff 0%, #7b2cbf 100%)',
                      clipPath: 'polygon(0 8px, 8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px))'
                    }}
                  >
                    {getAvatarInitial(formData.username)}
                  </div>
                )}
                
                {/* 上传按钮覆盖层 */}
                <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-sm"
                  style={{ 
                    clipPath: 'polygon(0 8px, 8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px))'
                  }}>
                  {uploading ? (
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white animate-spin rounded-full" />
                  ) : (
                    <Camera className="w-5 h-5 text-white" />
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={handleAvatarChange}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              </div>
              
              <div>
                <p className="text-sm text-cyber-foreground/80 mb-1 font-mono">点击头像更换</p>
                <p className="text-xs text-cyber-foreground/40 mb-1">支持 JPG/PNG/GIF/WebP，最大 2MB</p>
                {previewUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="inline-flex items-center gap-1 text-xs text-neon-red hover:bg-neon-red/10 px-2 py-1 transition-colors mt-1"
                  >
                    <X className="w-3 h-3" />
                    移除头像
                  </button>
                )}
              </div>
            </div>

            {/* 用户名 */}
            <div>
              <label className="block text-sm font-medium text-cyber-foreground/80 mb-2 font-mono">
                用户名
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-cyber-foreground/40" />
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 bg-cyber-background border border-cyber-border text-cyber-foreground placeholder-cyber-foreground/30 focus:outline-none focus:border-neon-cyan transition-colors"
                  placeholder="请输入用户名"
                  required
                />
              </div>
            </div>

            {/* 邮箱 */}
            <div>
              <label className="block text-sm font-medium text-cyber-foreground/80 mb-2 font-mono">
                邮箱
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-cyber-foreground/40" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 bg-cyber-background border border-cyber-border text-cyber-foreground placeholder-cyber-foreground/30 focus:outline-none focus:border-neon-cyan transition-colors"
                  placeholder="请输入邮箱"
                />
              </div>
            </div>

            {/* 个人简介 */}
            <div>
              <label className="block text-sm font-medium text-cyber-foreground/80 mb-2 font-mono">
                个人简介
              </label>
              <textarea
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                rows={3}
                className="w-full px-4 py-3 bg-cyber-background border border-cyber-border text-cyber-foreground placeholder-cyber-foreground/30 focus:outline-none focus:border-neon-cyan transition-colors resize-none"
                placeholder="介绍一下你自己..."
                maxLength={200}
              />
              <p className="text-xs text-cyber-foreground/40 mt-1 text-right">
                {formData.bio?.length || 0}/200
              </p>
            </div>

            {/* 所在地 */}
            <div>
              <label className="block text-sm font-medium text-cyber-foreground/80 mb-2 font-mono">
                所在地
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-cyber-foreground/40" />
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 bg-cyber-background border border-cyber-border text-cyber-foreground placeholder-cyber-foreground/30 focus:outline-none focus:border-neon-cyan transition-colors"
                  placeholder="例如：北京"
                />
              </div>
            </div>

            {/* 个人网站 */}
            <div>
              <label className="block text-sm font-medium text-cyber-foreground/80 mb-2 font-mono">
                个人网站
              </label>
              <div className="relative">
                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-cyber-foreground/40" />
                <input
                  type="url"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 bg-cyber-background border border-cyber-border text-cyber-foreground placeholder-cyber-foreground/30 focus:outline-none focus:border-neon-cyan transition-colors"
                  placeholder="https://your-website.com"
                />
              </div>
            </div>

            {/* 按钮 */}
            <div className="flex gap-4 pt-4">
              <Link
                href="/user-center"
                className="flex-1 py-3 border border-cyber-border text-cyber-foreground font-mono hover:border-neon-cyan hover:text-neon-cyan transition-colors text-center"
                style={{ clipPath: 'polygon(0 6px, 6px 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0 calc(100% - 6px))' }}
              >
                取消
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-3 bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50 font-mono hover:bg-neon-cyan/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ clipPath: 'polygon(0 6px, 6px 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0 calc(100% - 6px))' }}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    保存修改
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      <Footer />
    </div>
  )
}
