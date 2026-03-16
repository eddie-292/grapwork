/**
 * 自然语言时间表达式解析器
 * 支持格式: 30s, 5m, 2h, 1d, 30秒, 5分钟, 2小时, 1天
 */
import type { TimeUnitType, ParsedTimeExpression } from '@/types/loop'

// 时间单位到毫秒的转换
const UNIT_TO_MS: Record<TimeUnitType, number> = {
  s: 1000,           // 秒
  m: 60 * 1000,      // 分钟
  h: 60 * 60 * 1000, // 小时
  d: 24 * 60 * 60 * 1000, // 天
}

// 中文单位映射
const CHINESE_UNIT_MAP: Record<string, TimeUnitType> = {
  '秒': 's', '秒钟': 's',
  '分钟': 'm', '分': 'm',
  '小时': 'h', '时': 'h',
  '天': 'd', '日': 'd',
}

// 英文单位映射
const ENGLISH_UNIT_MAP: Record<string, TimeUnitType> = {
  'second': 's', 'seconds': 's',
  'minute': 'm', 'minutes': 'm',
  'hour': 'h', 'hours': 'h',
  'day': 'd', 'days': 'd',
}

// 最小间隔（1分钟）
const MIN_INTERVAL_MS = 60 * 1000

export class TimeExpressionParser {
  private static instance: TimeExpressionParser

  private constructor() {}

  static getInstance(): TimeExpressionParser {
    if (!TimeExpressionParser.instance) {
      TimeExpressionParser.instance = new TimeExpressionParser()
    }
    return TimeExpressionParser.instance
  }

  /**
   * 解析时间表达式
   * @param expression 时间表达式，如 "30s", "5m", "2h", "1d"
   */
  parse(expression: string): ParsedTimeExpression {
    const trimmed = expression.trim()

    if (!trimmed) {
      return this.createError('时间表达式不能为空')
    }

    const lowercased = trimmed.toLowerCase()

    // 标准格式: 数字 + 单位 (如 30s, 5m, 2h, 1d)
    const standardMatch = lowercased.match(/^(\d+(?:\.\d+)?)\s*([smhd])$/)
    if (standardMatch && standardMatch[1] && standardMatch[2]) {
      return this.createResult(
        parseFloat(standardMatch[1]),
        standardMatch[2] as TimeUnitType
      )
    }

    // 中文格式: 数字 + 中文单位 (如 30秒, 5分钟)
    const chineseMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(秒|秒钟|分钟|分|小时|时|天|日)$/)
    if (chineseMatch && chineseMatch[1] && chineseMatch[2]) {
      const unit = CHINESE_UNIT_MAP[chineseMatch[2]]
      if (unit) {
        return this.createResult(parseFloat(chineseMatch[1]), unit)
      }
    }

    // 英文完整格式 (如 30 seconds, 5 minutes)
    const englishMatch = lowercased.match(/^(\d+(?:\.\d+)?)\s*(second|minute|hour|day)s?$/)
    if (englishMatch && englishMatch[1] && englishMatch[2]) {
      const unit = ENGLISH_UNIT_MAP[englishMatch[2]]
      if (unit) {
        return this.createResult(parseFloat(englishMatch[1]), unit)
      }
    }

    // 解析失败
    return this.createError(
      `无法解析时间表达式: "${expression}"。支持格式: 30s, 5m, 2h, 1d (最小1分钟)`
    )
  }

  /**
   * 验证时间表达式是否有效
   */
  isValid(expression: string): boolean {
    return this.parse(expression).isValid
  }

  /**
   * 将表达式转换为毫秒数
   */
  toMilliseconds(expression: string): number {
    const result = this.parse(expression)
    return result.isValid ? result.milliseconds : 0
  }

  /**
   * 格式化毫秒数为可读字符串
   */
  formatMs(milliseconds: number): string {
    if (milliseconds < 1000) return `${milliseconds}ms`
    if (milliseconds < 60000) return `${Math.round(milliseconds / 1000)}s`
    if (milliseconds < 3600000) return `${Math.round(milliseconds / 60000)}m`
    if (milliseconds < 86400000) return `${Math.round(milliseconds / 3600000)}h`
    return `${Math.round(milliseconds / 86400000)}d`
  }

  /**
   * 获取下次执行时间的描述
   */
  getNextExecutionDescription(intervalMs: number): string {
    const now = Date.now()
    const nextTime = new Date(now + intervalMs)
    return `下次执行: ${nextTime.toLocaleString('zh-CN')}`
  }

  private createResult(value: number, unit: TimeUnitType): ParsedTimeExpression {
    const rawMs = value * UNIT_TO_MS[unit]

    // 验证最小间隔为 1 分钟 (60000ms)
    const milliseconds = Math.max(MIN_INTERVAL_MS, Math.round(rawMs))

    // 如果原始值小于1分钟，给出提示
    const wasAdjusted = rawMs < MIN_INTERVAL_MS

    return {
      value,
      unit,
      milliseconds,
      isValid: true,
      ...(wasAdjusted && { error: `间隔已调整为最小值1分钟 (原始: ${this.formatMs(rawMs)})` })
    }
  }

  private createError(message: string): ParsedTimeExpression {
    return {
      value: 0,
      unit: 's',
      milliseconds: 0,
      isValid: false,
      error: message
    }
  }
}

// 导出单例
export const timeParser = TimeExpressionParser.getInstance()
