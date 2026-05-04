export default function ToolCardSkeleton() {
  return (
    <div className="card p-5 animate-pulse bg-[#12121a] border border-[#2a2a3a]">
      <div className="flex items-start gap-4">
        {/* Logo Skeleton */}
        <div className="w-14 h-14 rounded-xl bg-[#2a2a3a] flex-shrink-0" />
        
        {/* Content Skeleton */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="h-5 bg-[#2a2a3a] rounded w-24 mb-1" />
              <div className="h-3 bg-[#2a2a3a] rounded w-16" />
            </div>
            <div className="h-5 bg-[#2a2a3a] rounded w-14" />
          </div>
          
          <div className="h-4 bg-[#2a2a3a] rounded w-full mt-2" />
          <div className="h-4 bg-[#2a2a3a] rounded w-3/4 mt-1" />
          
          <div className="flex gap-1 mt-3">
            <div className="h-4 bg-[#2a2a3a] rounded w-12" />
            <div className="h-4 bg-[#2a2a3a] rounded w-14" />
          </div>
          
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#2a2a3a]">
            <div className="flex gap-4">
              <div className="h-4 bg-[#2a2a3a] rounded w-16" />
              <div className="h-4 bg-[#2a2a3a] rounded w-16" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
