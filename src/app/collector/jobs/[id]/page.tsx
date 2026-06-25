import JobDetailClient from './JobDetailClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: '采集任务详情 | AIHub Collector',
  description: '查看本地采集任务状态、日志、采集源和入库数据。',
}

export default function CollectorJobDetailPage({ params }: { params: { id: string } }) {
  return <JobDetailClient jobId={params.id} />
}
