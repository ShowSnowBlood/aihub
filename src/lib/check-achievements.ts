import { prisma } from './prisma'
import { getAchievement } from './achievements'
import { createNotification } from './notification'

/**
 * 检查并解锁用户的成就
 * 在关键操作（签到、评论、获赞等）后调用
 */
export async function checkAndUnlock(userId: number) {
  try {
    // 1. 获取用户数据
    const userResult = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT exp, level FROM users WHERE id = $1`,
      userId
    )
    if (!userResult.length) return
    const user = userResult[0]
    const exp = Number(user.exp || 0)
    const level = Number(user.level || 1)

    // 2. 获取已解锁的成就
    const unlockedResult = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT achievement_id FROM user_achievements WHERE user_id = $1`,
      userId
    )
    const unlocked = new Set(unlockedResult.map((r: any) => r.achievement_id))

    // 3. 获取用户统计数据
    const [
      signInStats,
      shareStats,
      lifeShareExists,
      commentCount,
    ] = await Promise.all([
      // 签到记录统计
      prisma.$queryRawUnsafe<Array<any>>(
        `SELECT COUNT(*) as total, COALESCE(MAX(streak), 0) as max_streak FROM user_sign_ins WHERE "userId" = $1`,
        userId
      ),
      // 分享统计
      prisma.$queryRawUnsafe<Array<any>>(
        `SELECT COUNT(*) as total, COALESCE(MAX(likes), 0) as max_likes, COALESCE(SUM(likes), 0) as total_likes FROM shares WHERE "userId" = $1 AND status = 'approved'`,
        userId
      ),
      // 生活圈动态
      prisma.$queryRawUnsafe<Array<any>>(
        `SELECT COUNT(*) as total FROM shares WHERE "userId" = $1 AND type IN ('life', 'tech_share', 'qa_help') AND status = 'approved'`,
        userId
      ),
      // 评论数
      prisma.$queryRawUnsafe<Array<any>>(
        `SELECT COUNT(*) as total FROM share_comments WHERE "userId" = $1 AND status = 'approved'`,
        userId
      ),
    ])

    const signInTotal = Number(signInStats[0]?.total || 0)
    const maxStreak = Number(signInStats[0]?.max_streak || 0)
    const shareTotal = Number(shareStats[0]?.total || 0)
    const maxLikes = Number(shareStats[0]?.max_likes || 0)
    const totalLikes = Number(shareStats[0]?.total_likes || 0)
    const lifeTotal = Number(lifeShareExists[0]?.total || 0)
    const commentsCount = Number(commentCount[0]?.total || 0)

    // 4. 检查每个成就
    const newlyUnlocked: string[] = []

    // 初来乍到：首次签到
    if (!unlocked.has('first_sign_in') && signInTotal >= 1) {
      newlyUnlocked.push('first_sign_in')
    }

    // 分享新手：首次分享通过审核
    if (!unlocked.has('first_share') && shareTotal >= 1) {
      newlyUnlocked.push('first_share')
    }

    // 分享达人：累计20个分享通过审核
    if (!unlocked.has('share_master') && shareTotal >= 20) {
      newlyUnlocked.push('share_master')
    }

    // 评论大师：累计50条评论
    if (!unlocked.has('comment_master') && commentsCount >= 50) {
      newlyUnlocked.push('comment_master')
    }

    // 人气之星：单条分享获赞≥20
    if (!unlocked.has('popular_star') && maxLikes >= 20) {
      newlyUnlocked.push('popular_star')
    }

    // 社区红人：获赞总数≥100
    if (!unlocked.has('community_star') && totalLikes >= 100) {
      newlyUnlocked.push('community_star')
    }

    // 签到王者：连续签到30天
    if (!unlocked.has('sign_in_king') && maxStreak >= 30) {
      newlyUnlocked.push('sign_in_king')
    }

    // 升级达人：达到Lv.5
    if (!unlocked.has('level_5') && level >= 5) {
      newlyUnlocked.push('level_5')
    }

    // 社区领袖：达到Lv.10
    if (!unlocked.has('level_10') && level >= 10) {
      newlyUnlocked.push('level_10')
    }

    // 第一个100：EXP达到100
    if (!unlocked.has('exp_100') && exp >= 100) {
      newlyUnlocked.push('exp_100')
    }

    // 探索者：发布生活圈动态
    if (!unlocked.has('life_explorer') && lifeTotal >= 1) {
      newlyUnlocked.push('life_explorer')
    }

    // 社交达人：给5个不同人的帖子点赞（需要点赞记录表暂缺，留空待实现）
    // like_giver 暂未实现检查

    // 5. 解锁新成就
    if (newlyUnlocked.length > 0) {
      for (const achievementId of newlyUnlocked) {
        try {
          await prisma.$queryRawUnsafe(
            `INSERT INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
            userId, achievementId
          )

          // 发送解锁通知
          const ach = getAchievement(achievementId)
          await createNotification({
            userId,
            type: 'system',
            title: `🏆 解锁成就：${ach?.name || achievementId}`,
            content: `恭喜你获得了「${ach?.name || achievementId}」成就！`,
            link: '/user-center',
          })
        } catch (e) {
          console.error(`[Achievement] 解锁 ${achievementId} 失败:`, e)
        }
      }
    }

    return newlyUnlocked
  } catch (error) {
    console.error('[Achievement] checkAndUnlock 失败:', error)
    return []
  }
}
