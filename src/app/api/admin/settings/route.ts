import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isDefaultAdmin } from '@/lib/admin-default'

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

    if (!payload.find((s) => s.key === 'ui.showDefaultAdminHint')) {
      payload.push({
        key: 'ui.showDefaultAdminHint',
        value: { enabled: true },
        group: 'ui',
        editable: true,
        secret: false,
        description: '登录页显示默认管理员账号',
      })
    }

    if (!payload.find((s) => s.key === 'ui.mobileReadingBackground')) {
      payload.push({
        key: 'ui.mobileReadingBackground',
        value: { style: 'grid' },
        group: 'ui',
        editable: true,
        secret: false,
        description: '移动端阅读背景样式',
      })
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
    const updates: Array<{ key: string; value: any }> = body.updates || []

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: '无更新内容' }, { status: 400 })
    }

    const results: Array<{ key: string; updated: boolean; reason?: string }> = []

    for (const u of updates) {
      const s = await prisma.setting.findUnique({ where: { key: u.key } })
      if (!s) {
        if (u.key === 'ui.showDefaultAdminHint' || u.key === 'ui.mobileReadingBackground') {
          await prisma.setting.create({
            data: {
              key: u.key,
              value: u.value,
              group: 'ui',
              editable: true,
              secret: false,
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

      await prisma.setting.update({ where: { key: u.key }, data: { value: u.value } })
      results.push({ key: u.key, updated: true })
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('更新设置失败:', error)
    return NextResponse.json({ error: '更新设置失败' }, { status: 500 })
  }
}
