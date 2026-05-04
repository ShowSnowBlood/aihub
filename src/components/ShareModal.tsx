'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { 
  X, Link2, Check, MessageCircle, ThumbsUp, Share2,
  Twitter, Copy, QrCode, MoreHorizontal,
  Send, AtSign, Hash, Image as ImageIcon, Smile,
  Search, TrendingUp, Clock, Filter, XCircle,
  ChevronDown, Trash2
} from 'lucide-react'

interface ShareModalProps {
  isOpen: boolean
  onClose: () => void
  toolName: string
  toolUrl: string
  toolDesc: string
}

interface Comment {
  id: number
  user: { name: string; avatar: string }
  content: string
  time: string
  timestamp: number
  likes: number
  replies: Comment[]
  isLiked?: boolean
  images?: string[]
}

type SortType = 'hot' | 'new' | 'top'

export default function ShareModal({ isOpen, onClose, toolName, toolUrl, toolDesc }: ShareModalProps) {
  const [activeTab, setActiveTab] = useState<'share' | 'discuss'>('share')
  const [copied, setCopied] = useState(false)
  const [comment, setComment] = useState('')
  const [comments, setComments] = useState<Comment[]>([])
  const [filteredComments, setFilteredComments] = useState<Comment[]>([])
  const [showEmoji, setShowEmoji] = useState(false)
  const [sortBy, setSortBy] = useState<SortType>('hot')
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [uploadedImages, setUploadedImages] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 加载本地存储的评论
  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem(`comments-${toolUrl}`)
      if (saved) {
        const parsed = JSON.parse(saved)
        setComments(parsed)
        setFilteredComments(parsed)
      }
    }
  }, [isOpen, toolUrl])

  // 排序和搜索评论
  useEffect(() => {
    let result = [...comments]
    
    // 搜索过滤
    if (searchQuery.trim()) {
      result = result.filter(c => 
        c.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.user.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    
    // 排序
    switch (sortBy) {
      case 'hot':
        result.sort((a, b) => b.likes - a.likes || b.timestamp - a.timestamp)
        break
      case 'new':
        result.sort((a, b) => b.timestamp - a.timestamp)
        break
      case 'top':
        result.sort((a, b) => b.likes - a.likes)
        break
    }
    
    setFilteredComments(result)
  }, [comments, sortBy, searchQuery])

  // 保存评论
  const saveComments = useCallback((newComments: Comment[]) => {
    localStorage.setItem(`comments-${toolUrl}`, JSON.stringify(newComments))
    setComments(newComments)
  }, [toolUrl])

  // 复制链接
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(toolUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const input = document.createElement('input')
      input.value = toolUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // 系统分享
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: toolName,
          text: toolDesc,
          url: toolUrl
        })
      } catch {}
    }
  }

  // 图片上传处理
  const handleImageUpload = (files: FileList | null) => {
    if (!files) return
    
    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (e) => {
          setUploadedImages(prev => [...prev, e.target?.result as string])
        }
        reader.readAsDataURL(file)
      }
    })
  }

  // 拖拽上传
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleImageUpload(e.dataTransfer.files)
  }

  // 移除上传的图片
  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index))
  }

  // 发表评论
  const handleSubmitComment = () => {
    if (!comment.trim() && uploadedImages.length === 0) return
    
    const newComment: Comment = {
      id: Date.now(),
      user: { name: '匿名用户', avatar: '👤' },
      content: comment,
      time: '刚刚',
      timestamp: Date.now(),
      likes: 0,
      replies: [],
      images: uploadedImages.length > 0 ? uploadedImages : undefined
    }
    
    saveComments([newComment, ...comments])
    setComment('')
    setUploadedImages([])
    setShowEmoji(false)
  }

  // 点赞评论
  const handleLike = (commentId: number) => {
    const newComments = comments.map(c => {
      if (c.id === commentId) {
        return {
          ...c,
          likes: c.isLiked ? c.likes - 1 : c.likes + 1,
          isLiked: !c.isLiked
        }
      }
      return c
    })
    saveComments(newComments)
  }

  // 删除评论
  const handleDelete = (commentId: number) => {
    const newComments = comments.filter(c => c.id !== commentId)
    saveComments(newComments)
  }

  // 插入表情
  const insertEmoji = (emoji: string) => {
    setComment(prev => prev + emoji)
    textareaRef.current?.focus()
  }

  // 插入话题
  const insertTopic = () => {
    setComment(prev => prev + '#话题#')
    textareaRef.current?.focus()
  }

  // 插入@用户
  const insertMention = () => {
    setComment(prev => prev + '@用户 ')
    textareaRef.current?.focus()
  }

  // 清空搜索
  const clearSearch = () => {
    setSearchQuery('')
    setShowSearch(false)
  }

  if (!isOpen) return null

  const emojis = ['😀', '😂', '🤔', '👍', '❤️', '🎉', '🔥', '👏', '💡', '⭐', '😍', '🤩', '😎', '🤯', '👀']

  const sharePlatforms = [
    { name: '微信', icon: MessageCircle, color: 'bg-green-500', action: () => {} },
    { name: '微博', icon: Share2, color: 'bg-red-500', action: () => {} },
    { name: 'Twitter', icon: Twitter, color: 'bg-blue-400', action: () => {} },
    { name: '复制链接', icon: copied ? Check : Link2, color: copied ? 'bg-green-500' : 'bg-gray-500', action: handleCopy },
    { name: '二维码', icon: QrCode, color: 'bg-purple-500', action: () => {} },
    { name: '更多', icon: MoreHorizontal, color: 'bg-gray-400', action: handleNativeShare },
  ]

  const sortOptions = [
    { key: 'hot' as SortType, label: '热门', icon: TrendingUp },
    { key: 'new' as SortType, label: '最新', icon: Clock },
    { key: 'top' as SortType, label: '点赞最多', icon: ThumbsUp },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div 
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab('share')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'share' 
                  ? 'bg-primary-50 text-primary-600' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Share2 className="w-4 h-4" />
              分享
            </button>
            <button
              onClick={() => setActiveTab('discuss')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'discuss' 
                  ? 'bg-primary-50 text-primary-600' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <MessageCircle className="w-4 h-4" />
              讨论
              {comments.length > 0 && (
                <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {comments.length}
                </span>
              )}
            </button>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[calc(90vh-140px)] overflow-y-auto">
          {activeTab === 'share' ? (
            <div className="p-6 space-y-6">
              <div className="bg-gradient-to-r from-primary-50 to-purple-50 rounded-xl p-4">
                <h3 className="font-semibold text-gray-900">{toolName}</h3>
                <p className="text-gray-600 text-sm mt-1 line-clamp-2">{toolDesc}</p>
                <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
                  <Link2 className="w-3 h-3" />
                  {toolUrl}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">分享到</h4>
                <div className="grid grid-cols-6 gap-3">
                  {sharePlatforms.map((platform) => (
                    <button
                      key={platform.name}
                      onClick={platform.action}
                      className="flex flex-col items-center gap-2 group"
                    >
                      <div className={`w-12 h-12 ${platform.color} rounded-xl flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform`}>
                        <platform.icon className="w-6 h-6" />
                      </div>
                      <span className="text-xs text-gray-600">{platform.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">链接</h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={toolUrl}
                    readOnly
                    className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600"
                  />
                  <button
                    onClick={handleCopy}
                    className={`px-6 py-3 rounded-xl font-medium transition-colors flex items-center gap-2 ${
                      copied 
                        ? 'bg-green-500 text-white' 
                        : 'bg-primary-600 text-white hover:bg-primary-700'
                    }`}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? '已复制' : '复制'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Comment Input */}
              <div 
                className={`bg-gray-50 rounded-xl p-4 transition-colors ${isDragging ? 'bg-blue-50 border-2 border-blue-400 border-dashed' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <textarea
                  ref={textareaRef}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={`分享你对 ${toolName} 的看法...`}
                  className="w-full h-24 bg-transparent resize-none outline-none text-gray-700 placeholder-gray-400"
                />
                
                {/* Uploaded Images Preview */}
                {uploadedImages.length > 0 && (
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {uploadedImages.map((img, index) => (
                      <div key={index} className="relative">
                        <img 
                          src={img} 
                          alt="Upload preview" 
                          className="w-20 h-20 object-cover rounded-lg"
                        />
                        <button
                          onClick={() => removeImage(index)}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Toolbar */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                  <div className="flex items-center gap-2">
                    <div
                      onClick={() => setShowEmoji(!showEmoji)}
                      className="p-2 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer select-none"
                      role="button"
                    >
                      <Smile className="w-5 h-5 text-gray-500" />
                    </div>
                    <button
                      onClick={insertTopic}
                      className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      <Hash className="w-5 h-5 text-gray-500" />
                    </button>
                    <button
                      onClick={insertMention}
                      className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      <AtSign className="w-5 h-5 text-gray-500" />
                    </button>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      <ImageIcon className="w-5 h-5 text-gray-500" />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleImageUpload(e.target.files)}
                      className="hidden"
                    />
                  </div>
                  
                  <button
                    onClick={handleSubmitComment}
                    disabled={!comment.trim() && uploadedImages.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    发布
                  </button>
                </div>

                {/* Emoji Picker */}
                {showEmoji && (
                  <div className="flex gap-2 mt-3 p-3 bg-white rounded-lg shadow-lg flex-wrap relative z-50">
                    {emojis.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => insertEmoji(emoji)}
                        className="text-2xl hover:scale-125 transition-transform"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

                {isDragging && (
                  <div className="absolute inset-0 bg-blue-50/90 flex items-center justify-center rounded-xl">
                    <p className="text-blue-600 font-medium">松开以上传图片</p>
                  </div>
                )}
              </div>

              {/* Comments Header with Sort & Search */}
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-gray-700">
                  全部讨论 {comments.length > 0 && `(${comments.length})`}
                </h4>
                
                <div className="flex items-center gap-2">
                  {/* Search */}
                  {showSearch ? (
                    <div className="flex items-center gap-2">
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="搜索评论..."
                        className="w-40 px-3 py-1.5 text-sm bg-gray-100 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
                        autoFocus
                      />
                      <button onClick={clearSearch} className="p-1 hover:bg-gray-100 rounded">
                        <XCircle className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowSearch(true)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <Search className="w-4 h-4 text-gray-500" />
                    </button>
                  )}

                  {/* Sort Dropdown */}
                  <div className="relative group">
                    <button className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                      {sortOptions.find(o => o.key === sortBy)?.label}
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-lg shadow-lg border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                      {sortOptions.map(option => (
                        <button
                          key={option.key}
                          onClick={() => setSortBy(option.key)}
                          className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 ${
                            sortBy === option.key ? 'text-primary-600 bg-primary-50' : 'text-gray-700'
                          }`}
                        >
                          <option.icon className="w-4 h-4" />
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Comments List */}
              <div className="space-y-4">
                {filteredComments.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>{searchQuery ? '没有找到匹配的评论' : '暂无讨论，来发表第一条评论吧'}</p>
                  </div>
                ) : (
                  filteredComments.map((item) => (
                    <div key={item.id} className="flex gap-3 p-4 bg-gray-50 rounded-xl group">
                      <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center text-xl flex-shrink-0">
                        {item.user.avatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{item.user.name}</span>
                          <span className="text-xs text-gray-400">{item.time}</span>
                        </div>
                        <p className="text-gray-700 mt-1 whitespace-pre-wrap">{item.content}</p>
                        
                        {/* Comment Images */}
                        {item.images && item.images.length > 0 && (
                          <div className="flex gap-2 mt-3 flex-wrap">
                            {item.images.map((img, idx) => (
                              <img 
                                key={idx}
                                src={img} 
                                alt="Comment image" 
                                className="w-24 h-24 object-cover rounded-lg hover:scale-105 transition-transform cursor-pointer"
                                onClick={() => window.open(img, '_blank')}
                              />
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-4 mt-3">
                          <button
                            onClick={() => handleLike(item.id)}
                            className={`flex items-center gap-1 text-sm transition-colors ${
                              item.isLiked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'
                            }`}
                          >
                            <ThumbsUp className={`w-4 h-4 ${item.isLiked ? 'fill-current' : ''}`} />
                            {item.likes > 0 ? item.likes : '点赞'}
                          </button>
                          <button className="flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600">
                            <MessageCircle className="w-4 h-4" />
                            回复
                          </button>
                          <button className="text-sm text-gray-400 hover:text-gray-600">
                            举报
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-sm text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
