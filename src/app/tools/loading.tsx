import ToolCardSkeleton from '@/components/ToolCardSkeleton'

export default function ToolsLoading() {
  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Header Skeleton */}
      <div className="bg-[#12121a] border-b border-[#2a2a3a]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="h-8 bg-[#2a2a3a] rounded w-32 mb-2 animate-pulse" />
          <div className="h-4 bg-[#2a2a3a] rounded w-48 animate-pulse" />
          <div className="mt-6">
            <div className="h-12 bg-[#2a2a3a] rounded animate-pulse" />
          </div>
        </div>
      </div>

      {/* Category Filter Skeleton */}
      <div className="bg-[#12121a] border-b border-[#2a2a3a]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex gap-2 overflow-x-auto">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-9 bg-[#2a2a3a] rounded w-20 flex-shrink-0 animate-pulse" />
            ))}
          </div>
        </div>
      </div>

      {/* Tools Grid Skeleton */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="h-5 bg-[#2a2a3a] rounded w-32 animate-pulse" />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <ToolCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
