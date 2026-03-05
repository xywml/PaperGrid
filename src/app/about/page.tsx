import { Card, CardContent } from '@/components/ui/card'
import type { Metadata } from 'next'
import { Badge } from '@/components/ui/badge'
import { Mail, Github, X, Tv, MapPin, Calendar, MessageSquareHeart } from 'lucide-react'
import { getSetting } from '@/lib/settings'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AboutAvatarTrigger } from '@/components/profile/about-avatar-trigger'
import { SectionHeadingAccent } from '@/components/layout/section-heading-accent'
import { isValidHref } from '@/lib/utils'

export const revalidate = 60

export const metadata: Metadata = {
  title: '关于我',
  description: '了解站点作者、技术栈和联系方式。',
  alternates: {
    canonical: '/about',
  },
}

export default async function AboutPage() {
  const [
    ownerName,
    defaultAvatarUrl,
    role,
    location,
    joinedYear,
    bio,
    techStack,
    hobbies,
    contactIntro,
    contactEmail,
    contactGithub,
    contactX,
    contactBilibili,
    contactQQ,
    showSocialGithub,
    showSocialX,
    showSocialBilibili,
    showSocialEmail,
    showSocialQQ,
  ] = await Promise.all([
    getSetting<string>('site.ownerName', '千叶'),
    getSetting<string>('site.defaultAvatarUrl', ''),
    getSetting<string>('profile.role', '全栈开发者'),
    getSetting<string>('profile.location', '中国'),
    getSetting<string>('profile.joinedYear', '2024'),
    getSetting<string>('profile.bio', ''),
    getSetting<string>('profile.techStack', ''),
    getSetting<string>('profile.hobbies', ''),
    getSetting<string>('profile.contactIntro', ''),
    getSetting<string>('profile.contactEmail', ''),
    getSetting<string>('profile.contactGithub', 'https://github.com/xywml/PaperGrid'),
    getSetting<string>('profile.contactX', ''),
    getSetting<string>('profile.contactBilibili', ''),
    getSetting<string>('profile.contactQQ', ''),
    getSetting<boolean>('profile.social.github.enabled', true),
    getSetting<boolean>('profile.social.x.enabled', true),
    getSetting<boolean>('profile.social.bilibili.enabled', true),
    getSetting<boolean>('profile.social.email.enabled', true),
    getSetting<boolean>('profile.social.qq.enabled', true),
  ])

  const canShowEmail = Boolean(contactEmail) && Boolean(showSocialEmail ?? true) && isValidHref(contactEmail)
  const canShowGithub = Boolean(contactGithub) && Boolean(showSocialGithub ?? true) && isValidHref(contactGithub)
  const canShowX = Boolean(contactX) && Boolean(showSocialX ?? true) && isValidHref(contactX)
  const canShowBilibili = Boolean(contactBilibili) && Boolean(showSocialBilibili ?? true) && isValidHref(contactBilibili)
  const canShowQQ = Boolean(contactQQ) && Boolean(showSocialQQ ?? true)
  const hasSocialLinks = canShowEmail || canShowGithub || canShowX || canShowBilibili || canShowQQ

  const bioParagraphs = (bio || '').split('\n').map((p) => p.trim()).filter(Boolean)
  const hobbyItems = (hobbies || '').split('\n').map((p) => p.trim()).filter(Boolean)
  const stackSections = (techStack || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, rest] = line.split(':')
      const items = (rest || title)
        .split(/,|，/)
        .map((i) => i.trim())
        .filter(Boolean)
      return {
        title: rest ? title.trim() : '技术栈',
        items,
      }
    })
  const fallbackBioParagraphs = [
    '你好!我是一名热爱技术的全栈开发者,专注于构建优雅、高效的 Web 应用程序。这个博客是我记录学习过程、分享技术心得和生活感悟的地方。',
    '我相信技术的力量可以改变世界,也相信持续学习是保持竞争力的关键。在这里,我会分享我在开发过程中遇到的问题、解决方案以及一些有趣的项目。',
  ]
  const fallbackHobbies = [
    '📚 阅读技术书籍和科幻小说',
    '🎮 玩独立游戏',
    '📷 摄影和旅行',
    '🎵 听音乐和学习新乐器',
    '☕ 咖啡探索',
  ]
  const effectiveBioParagraphs = bioParagraphs.length > 0 ? bioParagraphs : fallbackBioParagraphs
  const effectiveHobbies = hobbyItems.length > 0 ? hobbyItems : fallbackHobbies
  const effectiveStackSections = stackSections.length > 0 ? stackSections : [
    { title: '前端开发', items: ['React', 'Next.js', 'TypeScript', 'TailwindCSS', 'Vue.js'] },
    { title: '后端开发', items: ['Node.js', 'Python', 'PostgreSQL', 'MongoDB', 'Redis'] },
    { title: 'DevOps & 工具', items: ['Docker', 'Git', 'AWS', 'Linux', 'Nginx'] },
  ]

  return (
    <div className="min-h-screen">
      {/* 页面头部 */}
      <section className="py-12 sm:py-16 bg-transparent">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl font-serif font-bold tracking-tight text-gray-900 dark:text-white sm:text-6xl mb-4">
              关于我
            </h1>
            <SectionHeadingAccent />
            <p className="mt-4 max-w-2xl mx-auto text-lg text-gray-600 dark:text-gray-400">
              了解更多关于我的信息
            </p>
          </div>
        </div>
      </section>

      {/* 主要内容区 */}
      <section className="py-12">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-3">
            {/* 左侧个人信息 */}
            <div className="lg:col-span-1">
              <Card>
                <CardContent className="p-6">
                  <div className="flex flex-col items-center text-center">
                    {/* 头像 */}
                    <AboutAvatarTrigger>
                      <Avatar className="h-32 w-32 border-2 border-gray-900 dark:border-white mb-4 cursor-pointer">
                        <AvatarImage src={defaultAvatarUrl || undefined} />
                        <AvatarFallback className="bg-gray-50 dark:bg-gray-800 text-5xl font-serif font-bold text-gray-900 dark:text-white">
                          {(ownerName || '千叶').charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </AboutAvatarTrigger>

                    {/* 姓名 */}
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                      {ownerName || '千叶'}
                    </h2>

                    {/* 职位 */}
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      {role || '全栈开发者'}
                    </p>

                    {/* 位置和时间 */}
                    <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400 w-full">
                      <div className="flex items-center justify-center gap-2">
                        <MapPin className="h-4 w-4" />
                        <span>{location || '中国'}</span>
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <Calendar className="h-4 w-4" />
                        <span>加入于 {joinedYear || '2024'}</span>
                      </div>
                    </div>

                    {/* 社交链接 */}
                    {hasSocialLinks && (
                      <div className="mt-6 flex gap-3">
                        {canShowEmail && (
                          <a
                            href={`mailto:${contactEmail}`}
                            data-slot="button"
                            className="pg-hero-social-btn flex h-10 w-10 items-center justify-center rounded-full transition-colors"
                          >
                            <Mail className="h-5 w-5" />
                          </a>
                        )}
                        {canShowGithub && (
                          <a
                            href={contactGithub}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-slot="button"
                            className="pg-hero-social-btn flex h-10 w-10 items-center justify-center rounded-full transition-colors"
                          >
                            <Github className="h-5 w-5" />
                          </a>
                        )}
                        {canShowX && (
                          <a
                            href={contactX}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-slot="button"
                            className="pg-hero-social-btn flex h-10 w-10 items-center justify-center rounded-full transition-colors"
                          >
                            <X className="h-5 w-5" />
                          </a>
                        )}
                        {canShowBilibili && (
                          <a
                            href={contactBilibili}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-slot="button"
                            className="pg-hero-social-btn flex h-10 w-10 items-center justify-center rounded-full transition-colors"
                          >
                            <Tv className="h-5 w-5" />
                          </a>
                        )}
                        {canShowQQ && (
                          <a
                            href={`https://wpa.qq.com/msgrd?v=3&uin=${contactQQ}&site=qq&menu=yes`}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-slot="button"
                            className="pg-hero-social-btn flex h-10 w-10 items-center justify-center rounded-full transition-colors"
                          >
                            <MessageSquareHeart className="h-5 w-5" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 右侧详细介绍 */}
            <div className="lg:col-span-2 space-y-6">
              {/* 简介 */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                    个人简介
                  </h3>
                  <div className="prose prose-gray dark:prose-invert max-w-none">
                    {effectiveBioParagraphs.map((p, idx) => (
                      <p
                        key={idx}
                        className={`text-gray-700 dark:text-gray-300 leading-relaxed ${idx > 0 ? 'mt-4' : ''}`}
                      >
                        {p}
                      </p>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* 技能 */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                    技术栈
                  </h3>
                  <div className="space-y-4">
                    {effectiveStackSections.map((section, idx) => (
                      <div key={`${section.title}-${idx}`}>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          {section.title}
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {section.items.map((item, itemIdx) => (
                            <Badge
                              key={`${section.title}-${itemIdx}`}
                              variant="secondary"
                              className="pg-public-badge-secondary"
                            >
                              {item}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* 兴趣爱好 */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                    兴趣爱好
                  </h3>
                  <div className="prose prose-gray dark:prose-invert max-w-none">
                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                      除了编程,我还喜欢:
                    </p>
                    <ul className="mt-4 space-y-2 text-gray-700 dark:text-gray-300">
                      {effectiveHobbies.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* 联系方式 */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                    联系我
                  </h3>
                  <div className="prose prose-gray dark:prose-invert max-w-none">
                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                      {contactIntro || '如果你想与我交流技术问题、合作项目,或者只是打个招呼,欢迎通过以下方式联系我:'}
                    </p>
                    <div className="mt-4 space-y-2">
                      {canShowEmail && (
                        <p className="text-gray-700 dark:text-gray-300">
                          📧 Email: <a href={`mailto:${contactEmail}`} className="pg-about-contact-link">{contactEmail}</a>
                        </p>
                      )}
                      {canShowGithub && (
                        <p className="text-gray-700 dark:text-gray-300">
                          💻 GitHub: <a href={contactGithub} target="_blank" rel="noopener noreferrer" className="pg-about-contact-link">{contactGithub}</a>
                        </p>
                      )}
                      {canShowX && (
                        <p className="text-gray-700 dark:text-gray-300">
                          𝕏 X: <a href={contactX} target="_blank" rel="noopener noreferrer" className="pg-about-contact-link">{contactX}</a>
                        </p>
                      )}
                      {canShowBilibili && (
                        <p className="text-gray-700 dark:text-gray-300">
                          📺 Bilibili: <a href={contactBilibili} target="_blank" rel="noopener noreferrer" className="pg-about-contact-link">{contactBilibili}</a>
                        </p>
                      )}
                      {canShowQQ && (
                        <p className="text-gray-700 dark:text-gray-300">
                          💬 QQ: <a href={`https://wpa.qq.com/msgrd?v=3&uin=${contactQQ}&site=qq&menu=yes`} target="_blank" rel="noopener noreferrer" className="pg-about-contact-link">{contactQQ}</a>
                        </p>
                      )}
                    </div>
                    <p className="mt-4 text-gray-700 dark:text-gray-300">
                      感谢你的访问!
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
