import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DAILY_COMMENT_LIMIT = 15
const DAILY_LIKE_LIMIT = 15

// 获取或创建用户当日限制记录
export async function getUserDailyLimit(userId: number, date: string) {
  let record = await prisma.userDailyLimit.findUnique({
    where: {
      userId_date: {
        userId,
        date
      }
    }
  })

  if (!record) {
    record = await prisma.userDailyLimit.create({
      data: {
        userId,
        date,
        commentCount: 0,
        likeCount: 0
      }
    })
  }

  return record
}

// 检查用户是否还可以评论
export async function canComment(userId: number): Promise<{ allowed: boolean; remaining: number }> {
  const today = new Date().toISOString().split('T')[0]
  const record = await getUserDailyLimit(userId, today)
  
  const remaining = DAILY_COMMENT_LIMIT - record.commentCount
  return {
    allowed: remaining > 0,
    remaining: Math.max(0, remaining)
  }
}

// 检查用户是否还可以点赞
export async function canLike(userId: number): Promise<{ allowed: boolean; remaining: number }> {
  const today = new Date().toISOString().split('T')[0]
  const record = await getUserDailyLimit(userId, today)
  
  const remaining = DAILY_LIKE_LIMIT - record.likeCount
  return {
    allowed: remaining > 0,
    remaining: Math.max(0, remaining)
  }
}

// 增加评论次数
export async function incrementCommentCount(userId: number): Promise<void> {
  const today = new Date().toISOString().split('T')[0]
  
  await prisma.userDailyLimit.upsert({
    where: {
      userId_date: {
        userId,
        date: today
      }
    },
    update: {
      commentCount: {
        increment: 1
      }
    },
    create: {
      userId,
      date: today,
      commentCount: 1,
      likeCount: 0
    }
  })
}

// 增加点赞次数
export async function incrementLikeCount(userId: number): Promise<void> {
  const today = new Date().toISOString().split('T')[0]
  
  await prisma.userDailyLimit.upsert({
    where: {
      userId_date: {
        userId,
        date: today
      }
    },
    update: {
      likeCount: {
        increment: 1
      }
    },
    create: {
      userId,
      date: today,
      commentCount: 0,
      likeCount: 1
    }
  })
}

// 获取用户今日剩余次数
export async function getUserDailyStats(userId: number) {
  const today = new Date().toISOString().split('T')[0]
  const record = await getUserDailyLimit(userId, today)
  
  return {
    commentUsed: record.commentCount,
    commentRemaining: Math.max(0, DAILY_COMMENT_LIMIT - record.commentCount),
    commentLimit: DAILY_COMMENT_LIMIT,
    likeUsed: record.likeCount,
    likeRemaining: Math.max(0, DAILY_LIKE_LIMIT - record.likeCount),
    likeLimit: DAILY_LIKE_LIMIT
  }
}
