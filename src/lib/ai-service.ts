/**
 * AI 服务接口 - 支持多种 AI 提供商
 * 可接入: QClaw、OpenAI、Claude、本地模型等
 */

export interface AIReplyRequest {
  content: string        // 用户发布的内容
  contentType: 'share' | 'share_comment' | 'comment' | 'tool'
  authorName: string     // 作者昵称
  context?: string       // 上下文（如工具描述、帖子主题等）
}

export interface AIReplyResponse {
  reply: string          // AI 回复内容
  confidence: number     // 置信度 0-1
  emotion?: 'positive' | 'neutral' | 'encouraging' | 'humorous' | 'professional'
}

export interface AIServiceConfig {
  provider: 'qclaw' | 'openai' | 'claude' | 'local' | 'mock'
  apiKey?: string
  apiUrl?: string
  model?: string
  temperature?: number
}

// 默认配置
const defaultConfig: AIServiceConfig = {
  provider: (process.env.AI_PROVIDER as any) || 'mock',
  apiKey: process.env.AI_API_KEY,
  apiUrl: process.env.AI_API_URL,
  model: process.env.AI_MODEL || 'default',
  temperature: 0.7
}

/**
 * 生成回复提示词
 */
function generatePrompt(request: AIReplyRequest): string {
  const { content, contentType, authorName, context } = request
  
  const basePrompt = `你是 AI Hub 社区的智能助手，性格友好、幽默、专业。
你的任务是对用户发布的内容进行简短、有趣的回复，活跃社区氛围。

规则：
1. 回复要简短（20-50字），不要太长
2. 语气要友好、鼓励、略带幽默
3. 根据内容类型调整风格
4. 可以偶尔使用 emoji
5. 不要重复用户的话
6. 回复要自然，像真人一样

作者：${authorName}
内容类型：${contentType === 'share' ? '分享' : contentType === 'share_comment' ? '评论' : '内容'}
${context ? `上下文：${context}` : ''}
用户内容：${content}

请给出一句简短、有趣的回复：`

  return basePrompt
}

/**
 * Mock AI 服务（本地简单回复，无需外部 API）
 * 用于测试或作为 fallback
 */
async function mockAIReply(request: AIReplyRequest): Promise<AIReplyResponse> {
  const { content, contentType, authorName } = request
  
  // 简单的关键词匹配回复模板
  const templates = {
    share: [
      `@${authorName} 分享得很棒！👍 期待更多好内容~`,
      `这个分享有用！收藏了~ 🎯`,
      `@${authorName} 感谢分享，学到了！✨`,
      `不错不错，正是我需要的 😄`,
      `@${authorName} 的分享总是那么及时 👏`,
      `已收藏，感谢整理！📌`,
      `这个角度很新颖，受教了 🤔`,
      `@${authorName} 继续加油，期待更多！💪`
    ],
    share_comment: [
      `@${authorName} 说得很对！👍`,
      `这个观点我赞同 ✨`,
      `@${authorName} 补充得很好 😄`,
      `确实如此，学习了 🤝`,
      `说得太对了，给你点赞 👏`,
      `这个评论很有价值 💎`
    ],
    comment: [
      `感谢反馈！🙏`,
      `说得有道理，我们会参考 🤔`,
      `这个建议很好 👍`,
      `@${authorName} 的意见收到！✅`
    ],
    tool: [
      `这个工具看起来不错！🛠️`,
      `已加入收藏夹，谢谢推荐 📌`,
      `正好需要这个，感谢分享 🎯`,
      `@${authorName} 推荐的都是精品 👏`
    ]
  }
  
  const typeTemplates = templates[contentType] || templates.share
  const randomReply = typeTemplates[Math.floor(Math.random() * typeTemplates.length)]
  
  // 模拟延迟
  await new Promise(resolve => setTimeout(resolve, 100))
  
  return {
    reply: randomReply,
    confidence: 0.8,
    emotion: 'positive'
  }
}

/**
 * QClaw AI 服务
 * 接入 QClaw API 进行智能回复
 */
async function qclawAIReply(request: AIReplyRequest, config: AIServiceConfig): Promise<AIReplyResponse> {
  const prompt = generatePrompt(request)
  
  try {
    const response = await fetch(config.apiUrl || 'https://api.qclaw.com/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model || 'qclaw-default',
        messages: [
          { role: 'system', content: '你是 AI Hub 社区的智能助手，性格友好幽默。' },
          { role: 'user', content: prompt }
        ],
        temperature: config.temperature || 0.7,
        max_tokens: 100
      })
    })
    
    if (!response.ok) {
      throw new Error(`QClaw API error: ${response.status}`)
    }
    
    const data = await response.json()
    const reply = data.choices?.[0]?.message?.content?.trim() || 
                  data.response?.trim() || 
                  data.text?.trim()
    
    if (!reply) {
      throw new Error('Empty response from QClaw')
    }
    
    return {
      reply,
      confidence: 0.9,
      emotion: 'positive'
    }
  } catch (error) {
    console.error('QClaw API failed, falling back to mock:', error)
    // QClaw 失败时回退到 mock
    return mockAIReply(request)
  }
}

/**
 * OpenAI 兼容接口（支持 OpenAI、Claude、本地模型等）
 */
async function openaiCompatibleReply(request: AIReplyRequest, config: AIServiceConfig): Promise<AIReplyResponse> {
  const prompt = generatePrompt(request)
  
  try {
    const response = await fetch(config.apiUrl || 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: '你是 AI Hub 社区的智能助手，性格友好幽默，回复简短有趣。' },
          { role: 'user', content: prompt }
        ],
        temperature: config.temperature || 0.7,
        max_tokens: 100
      })
    })
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    
    const data = await response.json()
    const reply = data.choices?.[0]?.message?.content?.trim()
    
    if (!reply) {
      throw new Error('Empty response')
    }
    
    return {
      reply,
      confidence: 0.9,
      emotion: 'positive'
    }
  } catch (error) {
    console.error('OpenAI API failed, falling back to mock:', error)
    return mockAIReply(request)
  }
}

/**
 * 主 AI 回复函数
 * 根据配置自动选择合适的 AI 服务
 */
export async function generateAIReply(
  request: AIReplyRequest,
  config?: Partial<AIServiceConfig>
): Promise<AIReplyResponse> {
  const finalConfig = { ...defaultConfig, ...config }
  
  switch (finalConfig.provider) {
    case 'qclaw':
      return qclawAIReply(request, finalConfig)
    case 'openai':
    case 'claude':
    case 'local':
      return openaiCompatibleReply(request, finalConfig)
    case 'mock':
    default:
      return mockAIReply(request)
  }
}

/**
 * 判断是否应该回复（避免每条都回复，显得太假）
 */
export function shouldAIReply(): boolean {
  // 70% 的概率会回复，30% 的概率跳过（更自然）
  return Math.random() > 0.3
}

/**
 * 判断是否应该点赞（避免每条都点赞）
 */
export function shouldAILike(): boolean {
  // 90% 的概率会点赞
  return Math.random() > 0.1
}