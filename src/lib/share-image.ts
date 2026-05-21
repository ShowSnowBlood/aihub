/**
 * 分享图片工具函数
 * 
 * 将 base64 图片数据转换为代理 API URL，避免大图嵌入 HTML 导致页面体积暴增
 */

/**
 * 获取分享的第一张图片的原始 base64 data URI
 * 用于首屏内联展示，避免代理 API 请求延迟（~626ms）
 */
export function getFirstImageBase64(
  shareId: number | null | undefined,
  images: string[] | string | null | undefined
): string | null {
  if (!images || !shareId) return null
  
  let imgArray: string[]
  if (Array.isArray(images)) {
    imgArray = images
  } else {
    try {
      imgArray = JSON.parse(images)
    } catch {
      return null
    }
  }
  if (!Array.isArray(imgArray) || imgArray.length === 0) return null
  
  const firstImg = imgArray[0]
  if (firstImg && firstImg.startsWith('data:image/')) {
    return firstImg
  }
  return null
}

/**
 * 获取分享图片的代理 URL
 */
export function getShareImageUrl(shareId: number, index: number): string {
  return `/api/shares/image/${shareId}/${index}`
}

/**
 * 判断图片字符串是否是 base64 data URI
 */
export function isBase64Image(src: string): boolean {
  return src.startsWith('data:image/')
}

/**
 * 将图片数组中的 base64 替换为代理 URL
 * 仅当图片是 base64 格式时才替换，保留外部 URL
 */
export function getShareImages(
  shareId: number | null | undefined,
  images: string[] | string | null | undefined
): string[] {
  if (!images) return []
  
  let imgArray: string[]
  if (Array.isArray(images)) {
    imgArray = images
  } else {
    try {
      imgArray = JSON.parse(images)
    } catch {
      return []
    }
  }
  if (!Array.isArray(imgArray)) return []

  return imgArray.map((img, index) => {
    if (img && isBase64Image(img) && shareId) {
      return getShareImageUrl(shareId, index)
    }
    return img
  })
}
