import { prisma } from './prisma';

export interface CreateNotificationParams {
  userId: number;
  type: 'like' | 'comment' | 'follow' | 'system';
  title: string;
  content?: string;
  link?: string;
  relatedUserId?: number;
}

/**
 * Create a notification for a user.
 */
export async function createNotification(params: CreateNotificationParams) {
  const { userId, type, title, content, link, relatedUserId } = params;

  try {
    await prisma.notification.create({
      data: { userId, type, title, content, link, relatedUserId },
    });
  } catch (error) {
    console.error('[Notification] Failed to create notification:', error);
  }
}

/**
 * Create notifications for multiple users at once.
 */
export async function createNotifications(
  paramsList: CreateNotificationParams[],
) {
  for (const params of paramsList) {
    await createNotification(params);
  }
}

/**
 * Get unread notification count for a user.
 */
export async function getUnreadCount(userId: number): Promise<number> {
  try {
    return await prisma.notification.count({
      where: { userId, isRead: false },
    });
  } catch (error) {
    console.error('[Notification] Failed to get unread count:', error);
    return 0;
  }
}

/**
 * Mark a single notification as read.
 */
export async function markAsRead(notificationId: number, userId: number) {
  try {
    await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
  } catch (error) {
    console.error('[Notification] Failed to mark as read:', error);
  }
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllAsRead(userId: number) {
  try {
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  } catch (error) {
    console.error('[Notification] Failed to mark all as read:', error);
  }
}

/**
 * Delete a single notification.
 */
export async function deleteNotification(notificationId: number, userId: number) {
  try {
    await prisma.notification.deleteMany({
      where: { id: notificationId, userId },
    });
  } catch (error) {
    console.error('[Notification] Failed to delete notification:', error);
  }
}

/**
 * Get paginated notifications for a user.
 */
export async function getNotifications(
  userId: number,
  page: number = 1,
  pageSize: number = 20,
) {
  const skip = (page - 1) * pageSize;

  try {
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.notification.count({ where: { userId } }),
    ]);

    return { notifications, total, page, pageSize };
  } catch (error) {
    console.error('[Notification] Failed to get notifications:', error);
    return { notifications: [], total: 0, page, pageSize };
  }
}
