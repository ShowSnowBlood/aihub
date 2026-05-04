import { Search, Inbox, FileQuestion } from 'lucide-react'

interface EmptyStateProps {
  type?: 'search' | 'data' | 'error'
  title?: string
  description?: string
  action?: React.ReactNode
}

const icons = {
  search: Search,
  data: Inbox,
  error: FileQuestion,
}

const defaults = {
  search: {
    title: '没有找到相关工具',
    description: '换个关键词试试，或者浏览全部工具',
  },
  data: {
    title: '暂无数据',
    description: '该分类下暂时没有工具，去看看其他分类吧',
  },
  error: {
    title: '出错了',
    description: '请稍后重试',
  },
}

export default function EmptyState({
  type = 'data',
  title,
  description,
  action,
}: EmptyStateProps) {
  const Icon = icons[type]
  const defaultText = defaults[type]

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Icon className="w-10 h-10 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {title || defaultText.title}
      </h3>
      <p className="text-gray-500 max-w-sm mb-6">
        {description || defaultText.description}
      </p>
      {action}
    </div>
  )
}
