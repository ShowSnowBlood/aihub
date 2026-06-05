import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET() {
  const logs: string[] = []
  
  try {
    // 建表
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "user_achievements" (
        "id" SERIAL PRIMARY KEY,
        "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "achievement_id" VARCHAR(50) NOT NULL,
        "unlocked_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE("user_id", "achievement_id")
      )
    `)
    logs.push('✅ user_achievements 表已创建')

    // 建索引
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "user_achievements_user_id_idx" ON "user_achievements" ("user_id")
    `)
    logs.push('✅ 索引已创建')
  } catch (error: any) {
    logs.push(`❌ 错误: ${error.message}`)
  }

  return NextResponse.json({ success: true, logs })
}
