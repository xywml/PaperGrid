import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isDefaultAdmin } from '@/lib/admin-default'
import {
  DEFAULT_PUBLIC_STYLE_PRESET,
  normalizePublicStylePreset,
} from '@/lib/public-style-preset'
import { normalizeMobileReadingBackground } from '@/lib/reading-style'

type AutoCreateSettingConfig = {
  value: Prisma.JsonValue
  group: string
  editable: boolean
  secret: boolean
  description: string
}

const AUTO_CREATE_SETTINGS: Record<string, AutoCreateSettingConfig> = {
  'ui.mobileReadingBackground': {
    value: { style: 'grid' },
    group: 'ui',
    editable: true,
    secret: false,
    description: '移动端阅读背景样式',
  },
  'ui.publicStylePreset': {
    value: { preset: DEFAULT_PUBLIC_STYLE_PRESET },
    group: 'ui',
    editable: true,
    secret: false,
    description: '前台风格预设',
  },
  'email.reply.enabled': {
    value: { enabled: true },
    group: 'email',
    editable: true,
    secret: false,
    description: '回复评论邮件通知开关',
  },
  'email.reply.requireApproved': {
    value: { enabled: true },
    group: 'email',
    editable: true,
    secret: false,
    description: '仅在评论通过审核后发送回复通知',
  },
  'email.reply.unsubscribeEnabled': {
    value: { enabled: true },
    group: 'email',
    editable: true,
    secret: false,
    description: '允许收件人通过链接退订回复通知',
  },
  'profile.contactX': {
    value: { text: '' },
    group: 'profile',
    editable: true,
    secret: false,
    description: 'X (Twitter) 地址',
  },
  'profile.contactBilibili': {
    value: { text: '' },
    group: 'profile',
    editable: true,
    secret: false,
    description: 'Bilibili 地址',
  },
  'profile.social.github.enabled': {
    value: { enabled: true },
    group: 'profile',
    editable: true,
    secret: false,
    description: '显示 GitHub 社交链接',
  },
  'profile.social.x.enabled': {
    value: { enabled: true },
    group: 'profile',
    editable: true,
    secret: false,
    description: '显示 X 社交链接',
  },
  'profile.social.bilibili.enabled': {
    value: { enabled: true },
    group: 'profile',
    editable: true,
    secret: false,
    description: '显示 Bilibili 社交链接',
  },
  'profile.social.email.enabled': {
    value: { enabled: true },
    group: 'profile',
    editable: true,
    secret: false,
    description: '显示邮箱社交链接',
  },
  'profile.social.qq.enabled': {
    value: { enabled: true },
    group: 'profile',
    editable: true,
    secret: false,
    description: '显示 QQ 社交链接',
  },
  'site.footer_mps': {
    value: { value: '' },
    group: 'site',
    editable: true,
    secret: false,
    description: '公安备案信息',
  },
}

function normalizeSettingUpdateValue(key: string, value: Prisma.InputJsonValue): Prisma.InputJsonValue {
  const readStringValue = (preferredFields: readonly string[]): string | null => {
    if (typeof value === 'string') return value
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null

    const record = value as Record<string, unknown>
    for (const field of preferredFields) {
      const raw = record[field]
      if (typeof raw === 'string') return raw
    }

    const entries = Object.entries(record)
    if (entries.length === 1 && typeof entries[0][1] === 'string') {
      return entries[0][1]
    }

    return null
  }

  if (key === 'ui.publicStylePreset') {
    const rawPreset = readStringValue(['preset', 'value', 'text', 'style'])
    return { preset: normalizePublicStylePreset(rawPreset) }
  }

  if (key === 'ui.mobileReadingBackground') {
    const rawStyle = readStringValue(['style', 'value', 'text'])
    return { style: normalizeMobileReadingBackground(rawStyle) }
  }

  return value
}

// GET /api/admin/settings - 返回所有设置
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const settings = await prisma.setting.findMany({ orderBy: { group: 'asc' } })
    const defaultAdmin = await isDefaultAdmin()

    // 转换为前端易用格式
    const payload = settings.map((s) => {
      const value = s.key === 'admin.initialSetup'
        ? { enabled: defaultAdmin }
        : (s.secret ? null : s.value)
      return {
        key: s.key,
        // 对 secret 值进行屏蔽
        value,
        group: s.group,
        editable: s.editable,
        secret: s.secret,
        description: s.description,
      }
    })

    if (!payload.find((s) => s.key === 'admin.initialSetup')) {
      payload.unshift({
        key: 'admin.initialSetup',
        value: { enabled: defaultAdmin },
        group: 'admin',
        editable: true,
        secret: false,
        description: '默认管理员账号提示',
      })
    }

    for (const [key, config] of Object.entries(AUTO_CREATE_SETTINGS)) {
      if (!payload.find((s) => s.key === key)) {
        payload.push({
          key,
          value: config.value,
          group: config.group,
          editable: config.editable,
          secret: config.secret,
          description: config.description,
        })
      }
    }

    return NextResponse.json({ settings: payload })
  } catch (error) {
    console.error('获取设置失败:', error)
    return NextResponse.json({ error: '获取设置失败' }, { status: 500 })
  }
}

// PATCH /api/admin/settings - 批量更新设置
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const body = await request.json()
    const updates: Array<{ key: string; value: Prisma.InputJsonValue }> = body.updates || []

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: '无更新内容' }, { status: 400 })
    }

    const results: Array<{ key: string; updated: boolean; reason?: string }> = []

    for (const u of updates) {
      const normalizedValue = normalizeSettingUpdateValue(u.key, u.value)
      const s = await prisma.setting.findUnique({ where: { key: u.key } })
      if (!s) {
        const createConfig = AUTO_CREATE_SETTINGS[u.key]
        if (createConfig) {
          await prisma.setting.create({
            data: {
              key: u.key,
              value: normalizedValue,
              group: createConfig.group,
              editable: createConfig.editable,
              secret: createConfig.secret,
              description: createConfig.description,
            },
          })
          results.push({ key: u.key, updated: true })
          continue
        }
        results.push({ key: u.key, updated: false, reason: '不存在' })
        continue
      }
      if (!s.editable || s.secret) {
        results.push({ key: u.key, updated: false, reason: '不可编辑或敏感项' })
        continue
      }

      await prisma.setting.update({ where: { key: u.key }, data: { value: normalizedValue } })
      results.push({ key: u.key, updated: true })
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('更新设置失败:', error)
    return NextResponse.json({ error: '更新设置失败' }, { status: 500 })
  }
}
