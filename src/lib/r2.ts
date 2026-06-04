import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || ''
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || ''
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || ''
const R2_BUCKET = process.env.R2_BUCKET || 'aihub-images'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || `https://${R2_BUCKET}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`

// S3 兼容客户端（指向 Cloudflare R2）
let r2Client: S3Client | null = null

function getR2Client(): S3Client {
  if (!r2Client) {
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  }
  return r2Client
}

/**
 * 上传图片到 R2
 */
export async function uploadImage(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const client = getR2Client()
  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  )
  return `https://${R2_BUCKET}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`
}

/**
 * 从 base64 data URI 提取 buffer 和 mimeType
 */
export function parseBase64Image(dataUri: string): { buffer: Buffer; mimeType: string } | null {
  const match = dataUri.match(/^data:image\/(\w+);base64,(.+)$/)
  if (!match) return null
  const mimeType = `image/${match[1]}`
  const buffer = Buffer.from(match[2], 'base64')
  return { buffer, mimeType }
}

/**
 * 从图片 URL 判断是否是 R2 图片
 */
export function isR2Image(url: string): boolean {
  return url.includes('.r2.cloudflarestorage.com') || url.includes(R2_BUCKET)
}

// 检查环境变量是否配置
export function isR2Configured(): boolean {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY)
}
