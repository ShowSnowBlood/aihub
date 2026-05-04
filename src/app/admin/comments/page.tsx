'use client'

import { useState, useEffect } from 'react'
import { MessageSquare, Search, Trash2, RefreshCw, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface Comment {
  id: string
  content: string
  userId: number
  userName: string | null
  userAvatarUrl: string | null
  shareId: number
  shareContent: string | null
  toolName: string | null
  sourceType: 'tool' | 'share'
  createdAt: string
}

export default function AdminCommentsPage() {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  const fetchComments = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/comments?page=${page}&limit=10&search=${search}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      })
      const data = await res.json()
      console.log('Admin comments API response:', data)
      if (res.ok) {
        setComments(data.comments || [])
        setTotalPages(data.totalPages || 1)
        setTotal(data.total || 0)
      } else {
        console.error('API error:', data.error)
      }
    } catch (error) {
      console.error('获取评论失败:', error)
    } finally {
      setLoading(false)
    }
  }

  // 页面加载时获取数据
  useEffect(() => {
    console.log('Component mounted, fetching comments...')
    fetchComments()
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这条评论吗？')) return
    
    try {
      const res = await fetch(`/api/admin/comments?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchComments()
      }
    } catch (error) {
      console.error('删除评论失败:', error)
    }
  }

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-6 h-6 text-orange-600" />
              <h1 className="text-xl font-bold text-gray-900">评论管理</h1>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/admin"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                返回后台
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">总评论数</p>
              <p className="text-2xl font-bold text-gray-900">{total}</p>
            </div>
            <button
              onClick={fetchComments}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索评论内容..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
        </div>

        {/* Comments List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">加载中...</div>
          ) : comments.length === 0 ? (
            <div className="p-8 text-center text-gray-500">暂无评论</div>
          ) : (
            <div className="divide-y">
              {comments.map((comment) => (
                <div key={comment.id} className="p-6 hover:bg-gray-50">
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white font-medium shrink-0">
                      {comment.userName?.[0] || '匿'}
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900">
                          {comment.userName || '匿名用户'}
                        </span>
                        <span className="text-sm text-gray-500">
                          {formatTime(comment.createdAt)}
                        </span>
                      </div>
                      
                      <p className="text-gray-700 mb-2">{comment.content}</p>
                      
                      <div className="flex items-center gap-3 text-sm">
                        {comment.sourceType === 'share' ? (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                            用户分享评论
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">
                            AI工具评论
                          </span>
                        )}
                        {comment.toolName && (
                          <div className="flex items-center gap-2 text-gray-500">
                            <span>工具:</span>
                            <Link
                              href={`/tools/${comment.toolName}`}
                              className="text-orange-600 hover:underline flex items-center gap-1"
                            >
                              {comment.toolName}
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      title="删除评论"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              上一页
            </button>
            <span className="text-sm text-gray-600">
              第 {page} 页 / 共 {totalPages} 页
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
