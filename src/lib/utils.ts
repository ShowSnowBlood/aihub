import { type ClassValue, clsx } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return inputs.filter(Boolean).join(' ')
}

export function getAvatarInitial(str: string | null | undefined): string {
  if (!str) return '?'
  const firstChar = str.charAt(0)
  // 如果是英文字母，返回大写
  if (/[a-z]/.test(firstChar)) return firstChar.toUpperCase()
  // 非英文字母（中文、数字、符号等）直接返回第一个字符
  return firstChar
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}
