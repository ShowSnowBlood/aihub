import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const { email, username, password } = await request.json()

    if (!password) {
      return NextResponse.json(
        { error: '密码不能为空' },
        { status: 400 }
      )
    }

    if (!email && !username) {
      return NextResponse.json(
        { error: '请输入邮箱或用户名' },
        { status: 400 }
      )
    }

    // 查找用户（支持邮箱或用户名）
    let user = null
    if (email) {
      user = await prisma.user.findUnique({ where: { email } })
    }
    if (!user && username) {
      user = await prisma.user.findUnique({ where: { username } })
    }

    if (!user) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      )
    }

    // 验证密码（支持明文和bcrypt）
    let isValid = false
    if (user.password.startsWith('$2')) {
      // bcrypt 加密密码
      isValid = await bcrypt.compare(password, user.password)
    } else {
      // 明文密码
      isValid = user.password === password
    }

    if (!isValid) {
      return NextResponse.json(
        { error: '密码错误' },
        { status: 401 }
      )
    }

    // 返回用户信息（不包含密码）
    const { password: _, ...userWithoutPassword } = user

    return NextResponse.json({
      message: '登录成功',
      user: userWithoutPassword
    })
  } catch (error) {
    console.error('登录错误:', error)
    return NextResponse.json(
      { error: '登录失败，请稍后重试' },
      { status: 500 }
    )
  }
}
