import { PrismaClient } from '@prisma/client'

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL || ''
  // Supabase Pooler 限制：每个实例最多3个连接，防止 Vercel 多实例撑爆 200 上限
  if (url.includes('connection_limit')) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}connection_limit=3`
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasourceUrl: getDatabaseUrl(),
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
