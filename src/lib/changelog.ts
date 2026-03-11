export type ChangelogItem = {
  version: string
  date: string
  highlights: string[]
}

export const CHANGELOG: ChangelogItem[] = [
  {
    version: 'v1.0.27',
    date: '2026-03-11',
    highlights: [
      '性能优化。',
    ],
  },
  {
    version: 'v1.0.25',
    date: '2026-03-06',
    highlights: [
      '封面视觉效果优化。',
    ],
  },
  {
    version: 'v1.0.23',
    date: '2026-03-06',
    highlights: [
      'SEO优化。',
    ],
  },
  {
    version: 'v1.0.22',
    date: '2026-03-05',
    highlights: [
      '安全性更新。',
    ],
  },
  {
    version: 'v1.0.21',
    date: '2026-02-28',
    highlights: [
        '新增后台样式管理，可一键切换前台预设主题。',
    ],
  },
  {
    version: 'v1.0.12',
    date: '2026-02-25',
    highlights: [
      '新增智能AI助手。',
    ],
  },
  {
    version: 'v1.0.8',
    date: '2026-02-14',
    highlights: [
      '备份迁移功能上线。',
    ],
  },
]
