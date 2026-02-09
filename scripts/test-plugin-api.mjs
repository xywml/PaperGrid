/**
 * PaperGrid 插件文章 API 集成测试脚本
 *
 * 前置条件：
 * 1. 服务已启动（默认 http://localhost:6066）
 * 2. 已配置 TEST_API_KEY，且具备 POST_READ/POST_CREATE/POST_UPDATE/POST_DELETE 权限
 *
 * 运行方式：
 * TEST_API_KEY=your_key node scripts/test-plugin-api.mjs
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:6066'
const API_KEY = process.env.TEST_API_KEY || ''

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
}

function colorize(text, color) {
  return `${colors[color] || ''}${text}${colors.reset}`
}

function logInfo(message) {
  console.log(colorize(message, 'blue'))
}

function logWarn(message) {
  console.log(colorize(message, 'yellow'))
}

function logSection(title) {
  console.log(`\n${'-'.repeat(72)}`)
  console.log(title)
  console.log('-'.repeat(72))
}

const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
}

function logCase(name, passed, detail = '') {
  const prefix = passed ? '[PASS]' : '[FAIL]'
  const text = `${prefix} ${name}`
  console.log(passed ? colorize(text, 'green') : colorize(text, 'red'))
  if (detail) {
    console.log(`       ${detail}`)
  }
  if (passed) {
    results.passed += 1
  } else {
    results.failed += 1
  }
}

function logSkip(name, detail = '') {
  const text = `[SKIP] ${name}`
  console.log(colorize(text, 'yellow'))
  if (detail) {
    console.log(`       ${detail}`)
  }
  results.skipped += 1
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function request(method, path, { body, apiKey, headers } = {}) {
  const url = `${BASE_URL}${path}`
  const requestHeaders = {
    'Content-Type': 'application/json',
    ...(headers || {}),
  }

  if (apiKey) {
    requestHeaders['x-api-key'] = apiKey
  }

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  const data = await response.json().catch(() => ({}))
  return {
    status: response.status,
    headers: response.headers,
    data,
  }
}

function randomSuffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function buildPostPayload(overrides = {}) {
  const suffix = randomSuffix()
  return {
    title: `API测试文章-${suffix}`,
    content: `# API 测试\n\n当前测试批次：${suffix}`,
    status: 'DRAFT',
    locale: 'zh',
    ...overrides,
  }
}

const state = {
  createdPostIds: new Set(),
  mainPostId: null,
}

async function runCase(name, fn) {
  try {
    const detail = await fn()
    logCase(name, true, detail)
  } catch (error) {
    logCase(name, false, error instanceof Error ? error.message : String(error))
  }
}

async function testAuthentication() {
  logSection('认证与鉴权')

  await runCase('未提供 API Key 应返回 401', async () => {
    const response = await request('GET', '/api/plugin/posts')
    assert(response.status === 401, `实际状态码: ${response.status}`)
    return `状态码: ${response.status}`
  })

  await runCase('无效 API Key 应返回 401', async () => {
    const response = await request('GET', '/api/plugin/posts', { apiKey: 'eak_invalid_key_for_test' })
    assert(response.status === 401, `实际状态码: ${response.status}`)
    return `状态码: ${response.status}`
  })

  await runCase('Authorization Bearer 模式可用', async () => {
    const response = await request('GET', '/api/plugin/posts', {
      headers: { Authorization: `Bearer ${API_KEY}` },
    })
    assert(response.status === 200, `实际状态码: ${response.status}`)
    return `状态码: ${response.status}`
  })
}

async function testListPosts() {
  logSection('列表查询 (GET /api/plugin/posts)')

  await runCase('获取文章列表成功', async () => {
    const response = await request('GET', '/api/plugin/posts', { apiKey: API_KEY })
    assert(response.status === 200, `实际状态码: ${response.status}`)
    assert(Array.isArray(response.data.posts), '返回字段 posts 不是数组')
    return `文章数量: ${response.data.posts.length}`
  })

  await runCase('分页 limit 上限生效', async () => {
    const response = await request('GET', '/api/plugin/posts?page=1&limit=999', { apiKey: API_KEY })
    assert(response.status === 200, `实际状态码: ${response.status}`)
    const count = Array.isArray(response.data.posts) ? response.data.posts.length : -1
    assert(count <= 50 && count >= 0, `返回数量异常: ${count}`)
    return `返回数量: ${count}`
  })

  await runCase('无效 status 应返回 400', async () => {
    const response = await request('GET', '/api/plugin/posts?status=INVALID', { apiKey: API_KEY })
    assert(response.status === 400, `实际状态码: ${response.status}`)
    return `错误信息: ${response.data.error || '无'}`
  })
}

async function testCreatePost() {
  logSection('创建文章 (POST /api/plugin/posts)')

  await runCase('创建基础文章成功', async () => {
    const payload = buildPostPayload()
    const response = await request('POST', '/api/plugin/posts', {
      apiKey: API_KEY,
      body: payload,
    })
    assert(response.status === 201, `实际状态码: ${response.status}`)
    assert(response.data.post?.id, '未返回 post.id')
    state.mainPostId = response.data.post.id
    state.createdPostIds.add(response.data.post.id)
    return `文章ID: ${response.data.post.id}`
  })

  await runCase('categoryId: null 可正常创建', async () => {
    const payload = buildPostPayload({ categoryId: null })
    const response = await request('POST', '/api/plugin/posts', {
      apiKey: API_KEY,
      body: payload,
    })
    assert(response.status === 201, `实际状态码: ${response.status}`)
    const postId = response.data.post?.id
    assert(postId, '未返回 post.id')
    state.createdPostIds.add(postId)
    assert(response.data.post?.category, 'categoryId 为 null 时未返回分类信息')
    return `文章ID: ${postId}`
  })

  await runCase('创建加密文章成功', async () => {
    const payload = buildPostPayload({
      isProtected: true,
      password: 'pass-1234',
    })
    const response = await request('POST', '/api/plugin/posts', {
      apiKey: API_KEY,
      body: payload,
    })
    assert(response.status === 201, `实际状态码: ${response.status}`)
    const postId = response.data.post?.id
    assert(postId, '未返回 post.id')
    state.createdPostIds.add(postId)
    assert(response.data.post?.isProtected === true, 'isProtected 未设置为 true')
    return `文章ID: ${postId}`
  })

  await runCase('缺少 title 应返回 400', async () => {
    const response = await request('POST', '/api/plugin/posts', {
      apiKey: API_KEY,
      body: { content: 'only content' },
    })
    assert(response.status === 400, `实际状态码: ${response.status}`)
    return `错误信息: ${response.data.error || '无'}`
  })

  await runCase('缺少 content 应返回 400', async () => {
    const response = await request('POST', '/api/plugin/posts', {
      apiKey: API_KEY,
      body: { title: 'only title' },
    })
    assert(response.status === 400, `实际状态码: ${response.status}`)
    return `错误信息: ${response.data.error || '无'}`
  })

  await runCase('无效 status 应返回 400', async () => {
    const response = await request('POST', '/api/plugin/posts', {
      apiKey: API_KEY,
      body: buildPostPayload({ status: 'INVALID_STATUS' }),
    })
    assert(response.status === 400, `实际状态码: ${response.status}`)
    return `错误信息: ${response.data.error || '无'}`
  })

  await runCase('isProtected 类型错误应返回 400', async () => {
    const response = await request('POST', '/api/plugin/posts', {
      apiKey: API_KEY,
      body: buildPostPayload({ isProtected: 'true' }),
    })
    assert(response.status === 400, `实际状态码: ${response.status}`)
    return `错误信息: ${response.data.error || '无'}`
  })

  await runCase('isProtected=true 且缺少密码应返回 400', async () => {
    const response = await request('POST', '/api/plugin/posts', {
      apiKey: API_KEY,
      body: buildPostPayload({ isProtected: true }),
    })
    assert(response.status === 400, `实际状态码: ${response.status}`)
    return `错误信息: ${response.data.error || '无'}`
  })

  await runCase('isProtected=false 且携带密码应返回 400', async () => {
    const response = await request('POST', '/api/plugin/posts', {
      apiKey: API_KEY,
      body: buildPostPayload({ isProtected: false, password: 'pass-1234' }),
    })
    assert(response.status === 400, `实际状态码: ${response.status}`)
    return `错误信息: ${response.data.error || '无'}`
  })

  await runCase('未声明 isProtected 但携带密码应返回 400', async () => {
    const response = await request('POST', '/api/plugin/posts', {
      apiKey: API_KEY,
      body: buildPostPayload({ password: 'pass-1234' }),
    })
    assert(response.status === 400, `实际状态码: ${response.status}`)
    return `错误信息: ${response.data.error || '无'}`
  })

  await runCase('categoryId 类型错误应返回 400', async () => {
    const response = await request('POST', '/api/plugin/posts', {
      apiKey: API_KEY,
      body: buildPostPayload({ categoryId: 12345 }),
    })
    assert(response.status === 400, `实际状态码: ${response.status}`)
    return `错误信息: ${response.data.error || '无'}`
  })

  await runCase('categoryId 不存在应返回 400', async () => {
    const response = await request('POST', '/api/plugin/posts', {
      apiKey: API_KEY,
      body: buildPostPayload({ categoryId: `not-exists-${randomSuffix()}` }),
    })
    assert(response.status === 400, `实际状态码: ${response.status}`)
    return `错误信息: ${response.data.error || '无'}`
  })

  await runCase('tags 非数组应返回 400', async () => {
    const response = await request('POST', '/api/plugin/posts', {
      apiKey: API_KEY,
      body: buildPostPayload({ tags: 'invalid' }),
    })
    assert(response.status === 400, `实际状态码: ${response.status}`)
    return `错误信息: ${response.data.error || '无'}`
  })

  await runCase('createdAt 非法格式应返回 400', async () => {
    const response = await request('POST', '/api/plugin/posts', {
      apiKey: API_KEY,
      body: buildPostPayload({ createdAt: 'invalid-date-format' }),
    })
    assert(response.status === 400, `实际状态码: ${response.status}`)
    return `错误信息: ${response.data.error || '无'}`
  })
}

async function testGetPost() {
  logSection('单篇查询 (GET /api/plugin/posts/:id)')

  if (!state.mainPostId) {
    logSkip('获取文章详情', '缺少主测试文章 ID')
    return
  }

  await runCase('获取已创建文章成功', async () => {
    const response = await request('GET', `/api/plugin/posts/${state.mainPostId}`, {
      apiKey: API_KEY,
    })
    assert(response.status === 200, `实际状态码: ${response.status}`)
    assert(response.data.post?.id === state.mainPostId, '返回文章 ID 不匹配')
    return `标题: ${response.data.post?.title || ''}`
  })

  await runCase('获取不存在文章返回 404', async () => {
    const response = await request('GET', `/api/plugin/posts/not-found-${randomSuffix()}`, {
      apiKey: API_KEY,
    })
    assert(response.status === 404, `实际状态码: ${response.status}`)
    return `错误信息: ${response.data.error || '无'}`
  })
}

async function testUpdatePost() {
  logSection('更新文章 (PATCH /api/plugin/posts/:id)')

  if (!state.mainPostId) {
    logSkip('更新文章测试', '缺少主测试文章 ID')
    return
  }

  await runCase('更新标题与状态成功', async () => {
    const response = await request('PATCH', `/api/plugin/posts/${state.mainPostId}`, {
      apiKey: API_KEY,
      body: {
        title: `已更新标题-${randomSuffix()}`,
        status: 'PUBLISHED',
      },
    })
    assert(response.status === 200, `实际状态码: ${response.status}`)
    assert(response.data.post?.status === 'PUBLISHED', '状态未更新为 PUBLISHED')
    return `新状态: ${response.data.post?.status}`
  })

  await runCase('categoryId: null 更新成功', async () => {
    const response = await request('PATCH', `/api/plugin/posts/${state.mainPostId}`, {
      apiKey: API_KEY,
      body: { categoryId: null },
    })
    assert(response.status === 200, `实际状态码: ${response.status}`)
    assert(response.data.post?.category === null, 'category 预期应为 null')
    return '分类字段已断开关联'
  })

  await runCase('启用加密但未提供密码应返回 400', async () => {
    const response = await request('PATCH', `/api/plugin/posts/${state.mainPostId}`, {
      apiKey: API_KEY,
      body: { isProtected: true },
    })
    assert(response.status === 400, `实际状态码: ${response.status}`)
    return `错误信息: ${response.data.error || '无'}`
  })

  await runCase('启用加密并提供密码成功', async () => {
    const response = await request('PATCH', `/api/plugin/posts/${state.mainPostId}`, {
      apiKey: API_KEY,
      body: {
        isProtected: true,
        password: 'updated-pass-123',
      },
    })
    assert(response.status === 200, `实际状态码: ${response.status}`)
    assert(response.data.post?.isProtected === true, 'isProtected 未设置为 true')
    return '密码保护已启用'
  })

  await runCase('关闭加密同时携带密码应返回 400', async () => {
    const response = await request('PATCH', `/api/plugin/posts/${state.mainPostId}`, {
      apiKey: API_KEY,
      body: {
        isProtected: false,
        password: 'should-fail',
      },
    })
    assert(response.status === 400, `实际状态码: ${response.status}`)
    return `错误信息: ${response.data.error || '无'}`
  })

  await runCase('关闭加密成功', async () => {
    const response = await request('PATCH', `/api/plugin/posts/${state.mainPostId}`, {
      apiKey: API_KEY,
      body: { isProtected: false },
    })
    assert(response.status === 200, `实际状态码: ${response.status}`)
    assert(response.data.post?.isProtected === false, 'isProtected 未设置为 false')
    return '密码保护已关闭'
  })

  await runCase('categoryId 类型错误应返回 400', async () => {
    const response = await request('PATCH', `/api/plugin/posts/${state.mainPostId}`, {
      apiKey: API_KEY,
      body: { categoryId: 1024 },
    })
    assert(response.status === 400, `实际状态码: ${response.status}`)
    return `错误信息: ${response.data.error || '无'}`
  })

  await runCase('无效 status 应返回 400', async () => {
    const response = await request('PATCH', `/api/plugin/posts/${state.mainPostId}`, {
      apiKey: API_KEY,
      body: { status: 'INVALID_STATUS' },
    })
    assert(response.status === 400, `实际状态码: ${response.status}`)
    return `错误信息: ${response.data.error || '无'}`
  })

  await runCase('更新不存在文章返回 404', async () => {
    const response = await request('PATCH', `/api/plugin/posts/not-found-${randomSuffix()}`, {
      apiKey: API_KEY,
      body: { title: 'x' },
    })
    assert(response.status === 404, `实际状态码: ${response.status}`)
    return `错误信息: ${response.data.error || '无'}`
  })
}

async function testDeletePost() {
  logSection('删除文章 (DELETE /api/plugin/posts/:id)')

  let deleteTargetId = null

  await runCase('创建待删除文章成功', async () => {
    const response = await request('POST', '/api/plugin/posts', {
      apiKey: API_KEY,
      body: buildPostPayload({ title: `待删除文章-${randomSuffix()}` }),
    })
    assert(response.status === 201, `实际状态码: ${response.status}`)
    deleteTargetId = response.data.post?.id
    assert(deleteTargetId, '未返回 post.id')
    state.createdPostIds.add(deleteTargetId)
    return `文章ID: ${deleteTargetId}`
  })

  if (!deleteTargetId) {
    logSkip('删除场景后续用例', '待删除文章创建失败')
    return
  }

  await runCase('删除文章成功', async () => {
    const response = await request('DELETE', `/api/plugin/posts/${deleteTargetId}`, {
      apiKey: API_KEY,
    })
    assert(response.status === 200, `实际状态码: ${response.status}`)
    state.createdPostIds.delete(deleteTargetId)
    return `响应信息: ${response.data.message || ''}`
  })

  await runCase('删除后再次查询返回 404', async () => {
    const response = await request('GET', `/api/plugin/posts/${deleteTargetId}`, {
      apiKey: API_KEY,
    })
    assert(response.status === 404, `实际状态码: ${response.status}`)
    return `错误信息: ${response.data.error || '无'}`
  })

  await runCase('再次删除同一文章返回 404', async () => {
    const response = await request('DELETE', `/api/plugin/posts/${deleteTargetId}`, {
      apiKey: API_KEY,
    })
    assert(response.status === 404, `实际状态码: ${response.status}`)
    return `错误信息: ${response.data.error || '无'}`
  })
}

async function cleanupTestData() {
  logSection('清理测试数据')

  if (state.createdPostIds.size === 0) {
    console.log('无需清理')
    return
  }

  let cleaned = 0
  for (const postId of state.createdPostIds) {
    try {
      const response = await request('DELETE', `/api/plugin/posts/${postId}`, {
        apiKey: API_KEY,
      })
      if (response.status === 200 || response.status === 404) {
        cleaned += 1
      }
    } catch (_error) {
      // 忽略单条清理失败，继续处理后续数据
    }
  }

  console.log(`清理完成，处理数量: ${cleaned}`)
}

function printSummary() {
  logSection('测试汇总')
  console.log(`通过: ${results.passed}`)
  console.log(`失败: ${results.failed}`)
  console.log(`跳过: ${results.skipped}`)
}

async function main() {
  console.log('PaperGrid 插件文章 API 测试开始')
  console.log(`目标地址: ${BASE_URL}`)

  if (!API_KEY || API_KEY.includes('your_api_key_here')) {
    console.error('错误：请先设置有效的 TEST_API_KEY')
    process.exit(1)
  }

  logInfo(`API Key 前缀: ${API_KEY.slice(0, 15)}...`)

  try {
    await testAuthentication()
    await testListPosts()
    await testCreatePost()
    await testGetPost()
    await testUpdatePost()
    await testDeletePost()
  } finally {
    await cleanupTestData()
    printSummary()
  }

  process.exitCode = results.failed > 0 ? 1 : 0
}

main().catch((error) => {
  console.error('执行失败：', error)
  process.exit(1)
})

