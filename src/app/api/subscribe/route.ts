import { NextRequest, NextResponse } from 'next/server'
// 动态导入确保获取最新的 Prisma Client
let prisma: any
try {
  const { PrismaClient: PC } = require('@prisma/client')
  prisma = new PC()
} catch (e) {
  // fallback to default import
  const mod = require('@/lib/prisma')
  prisma = mod.prisma || mod.default || mod
}

// POST - 订阅
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: '请输入邮箱地址' }, { status: 400 })
    }

    // 简单邮箱格式校验
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 })
    }

    // 检查是否已订阅
    const existing = await prisma.subscriber.findUnique({
      where: { email }
    })

    if (existing) {
      if (existing.status === 'active') {
        return NextResponse.json({ message: '该邮箱已订阅', alreadySubscribed: true })
      }
      await prisma.subscriber.update({
        where: { email },
        data: { status: 'active' }
      })
      return NextResponse.json({ message: '订阅成功！欢迎回来' })
    }

    await prisma.subscriber.create({
      data: { email }
    })

    return NextResponse.json({ message: '订阅成功！每周AI精选将发送到你的邮箱' })
  } catch (error) {
    console.error('Subscribe error:', error)
    return NextResponse.json({ error: '订阅失败，请稍后重试' }, { status: 500 })
  }
}

// DELETE - 取消订阅
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email')

    if (!email) {
      return NextResponse.json({ error: '请提供邮箱地址' }, { status: 400 })
    }

    const subscriber = await prisma.subscriber.findUnique({
      where: { email }
    })

    if (!subscriber) {
      return NextResponse.json({ error: '该邮箱未订阅' }, { status: 404 })
    }

    await prisma.subscriber.update({
      where: { email },
      data: { status: 'unsubscribed' }
    })

    return NextResponse.json({ message: '已取消订阅' })
  } catch (error) {
    console.error('Unsubscribe error:', error)
    return NextResponse.json({ error: '操作失败' }, { status: 500 })
  }
}
