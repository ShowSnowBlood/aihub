import Link from 'next/link'
import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Code2,
  Database,
  Layers3,
  Sparkles,
  Tags,
  Workflow,
} from 'lucide-react'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { prisma } from '@/lib/prisma'

export const metadata = {
  title: '热门 Skills 集合 | AI Hub',
  description: '沉淀本地技能库、公开技能仓库、优秀项目能力说明和运营录入中的可复用 Skills 候选。',
}

export const revalidate = 3600

const categoryIcons: Record<string, any> = {
  Research: BookOpen,
  RAG: Database,
  Engineering: Code2,
  Automation: Workflow,
  Design: Sparkles,
  Creative: Sparkles,
  Evaluation: CheckCircle2,
  Operations: Layers3,
}

function splitList(value?: string | null) {
  if (!value) return []
  return value
    .split(/,|\n/)
    .map(item => item.trim())
    .filter(Boolean)
}

function sourceLabel(sourceType: string) {
  const labels: Record<string, string> = {
    local: '本地技能库',
    manual: '运营录入',
    'project-capability': '项目能力',
    public: '公开仓库',
    'external-skill': '外部 Skill 仓库',
  }
  return labels[sourceType] || sourceType
}

export default async function SkillsPage() {
  const skills = await prisma.skillResource.findMany({
    where: { isActive: true },
    orderBy: [{ isFeatured: 'desc' }, { score: 'desc' }, { updatedAt: 'desc' }],
  })

  const categoryStats = await prisma.skillResource.groupBy({
    by: ['category'],
    where: { isActive: true },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  })

  const sourceStats = await prisma.skillResource.groupBy({
    by: ['sourceType'],
    where: { isActive: true },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  })

  const featured = skills.filter(skill => skill.isFeatured).slice(0, 4)

  return (
    <div className="min-h-screen bg-cyber-background">
      <Navbar />

      <section className="relative border-b border-cyber-border overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-neon-magenta/12 via-transparent to-neon-green/10" />
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,0,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,136,0.03) 1px, transparent 1px)',
            backgroundSize: '42px 42px',
          }}
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative">
              <Sparkles className="w-8 h-8 text-neon-magenta" />
              <Sparkles className="absolute inset-0 w-8 h-8 text-neon-cyan opacity-60 translate-x-[1px]" />
            </div>
            <span className="text-neon-magenta font-mono text-sm tracking-widest uppercase">Skill Library</span>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
            <div>
              <h1 className="text-4xl md:text-5xl font-orbitron font-black text-cyber-foreground mb-4 tracking-wide">
                热门 <span className="text-neon-magenta">Skills</span> 集合
              </h1>
              <p className="text-cyber-muted-foreground font-mono max-w-3xl">
                {'>'} 从本地技能库、公开项目能力和运营录入中沉淀可复用能力候选。
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:min-w-[420px]">
              {[
                { label: 'Skills', value: skills.length },
                { label: '分类', value: categoryStats.length },
                { label: '精选', value: featured.length },
              ].map(stat => (
                <div
                  key={stat.label}
                  className="bg-cyber-card/80 border border-cyber-border p-4"
                  style={{
                    clipPath:
                      'polygon(0 8px, 8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)',
                  }}
                >
                  <div className="text-2xl font-orbitron font-bold text-cyber-foreground">{stat.value}</div>
                  <div className="text-xs text-cyber-muted-foreground font-mono uppercase">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {featured.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-neon-yellow" />
              <h2 className="text-xl font-orbitron font-bold text-cyber-foreground">精选 Skills</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {featured.map(skill => (
                <SkillCard key={skill.id} skill={skill} compact />
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <aside className="lg:col-span-1 space-y-5">
            <Panel title="分类">
              <div className="space-y-2">
                {categoryStats.map(item => {
                  const Icon = categoryIcons[item.category] || Tags
                  return (
                    <div key={item.category} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 text-cyber-foreground">
                        <Icon className="w-4 h-4 text-neon-cyan" />
                        {item.category}
                      </span>
                      <span className="text-neon-cyan font-mono">{item._count.id}</span>
                    </div>
                  )
                })}
              </div>
            </Panel>

            <Panel title="来源">
              <div className="space-y-2">
                {sourceStats.map(item => (
                  <div key={item.sourceType} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-cyber-muted-foreground">{sourceLabel(item.sourceType)}</span>
                    <span className="text-neon-green font-mono">{item._count.id}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </aside>

          <section className="lg:col-span-3">
            <div className="flex items-center justify-between mb-5">
              <span className="text-cyber-muted-foreground font-mono">
                {'>'} 共 <strong className="text-neon-magenta">{skills.length}</strong> 个可复用能力候选
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {skills.map(skill => (
                <SkillCard key={skill.id} skill={skill} />
              ))}
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="bg-cyber-card border border-cyber-border overflow-hidden"
      style={{
        clipPath:
          'polygon(0 10px, 10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px))',
      }}
    >
      <div className="px-5 py-4 border-b border-cyber-border bg-cyber-muted/50">
        <h3 className="font-orbitron font-semibold text-cyber-foreground">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function SkillCard({ skill, compact = false }: { skill: any; compact?: boolean }) {
  const tags = splitList(skill.tags).slice(0, compact ? 3 : 5)
  const useCases = splitList(skill.useCases).slice(0, compact ? 2 : 3)
  const Icon = categoryIcons[skill.category] || Sparkles

  return (
    <article
      className="bg-cyber-card border border-cyber-border p-5 hover:border-neon-magenta/50 hover:shadow-[0_0_22px_rgba(255,0,255,0.12)] transition-all duration-300"
      style={{
        clipPath:
          'polygon(0 10px, 10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px))',
      }}
    >
      <div className="flex items-start gap-4">
        <div
          className="w-11 h-11 flex items-center justify-center flex-shrink-0 bg-neon-magenta/10 border border-neon-magenta/30"
          style={{
            clipPath:
              'polygon(0 6px, 6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%)',
          }}
        >
          <Icon className="w-5 h-5 text-neon-magenta" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-orbitron font-bold text-cyber-foreground line-clamp-1">
                {skill.name}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-mono">
                <span className="text-neon-cyan">{skill.category}</span>
                <span className="text-cyber-border">|</span>
                <span className="text-cyber-muted-foreground">{sourceLabel(skill.sourceType)}</span>
              </div>
            </div>
            <span className="px-2 py-1 text-xs border border-neon-green/40 text-neon-green font-mono">
              {skill.score}
            </span>
          </div>

          <p className={`mt-3 text-sm text-cyber-muted-foreground ${compact ? 'line-clamp-2' : 'line-clamp-3'}`}>
            {skill.description}
          </p>

          {!compact && useCases.length > 0 && (
            <div className="mt-3 space-y-1">
              {useCases.map(item => (
                <div key={item} className="flex items-start gap-2 text-xs text-cyber-muted-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-neon-green flex-shrink-0" />
                  <span className="line-clamp-1">{item}</span>
                </div>
              ))}
            </div>
          )}

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {tags.map(tag => (
                <span key={tag} className="px-2 py-1 text-xs border border-cyber-border text-cyber-muted-foreground font-mono">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {skill.sourceUrl && (
            <Link
              href={skill.sourceUrl.startsWith('http') ? skill.sourceUrl : '#'}
              className="mt-4 inline-flex items-center gap-1 text-xs text-neon-cyan hover:text-neon-magenta font-mono"
              target={skill.sourceUrl.startsWith('http') ? '_blank' : undefined}
            >
              查看来源
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}
