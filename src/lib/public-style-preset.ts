export const PUBLIC_STYLE_PRESETS = ['paper-grid', 'neo-brutal'] as const

export type PublicStylePreset = (typeof PUBLIC_STYLE_PRESETS)[number]

export const DEFAULT_PUBLIC_STYLE_PRESET: PublicStylePreset = 'paper-grid'

const PUBLIC_STYLE_PRESET_STYLESHEET: Record<PublicStylePreset, string> = {
  'paper-grid': '/styles/public-theme/paper-grid.css',
  'neo-brutal': '/styles/public-theme/neo-brutal.css',
}

export function normalizePublicStylePreset(raw?: string | null): PublicStylePreset {
  if (raw === 'soft-paper') return 'paper-grid'
  if (raw === 'editorial-serif') return 'paper-grid'
  if (raw === 'dot-matrix') return 'neo-brutal'
  return PUBLIC_STYLE_PRESETS.find((preset) => preset === raw) ?? DEFAULT_PUBLIC_STYLE_PRESET
}

export function getPublicStylePresetStylesheet(preset: PublicStylePreset): string {
  return PUBLIC_STYLE_PRESET_STYLESHEET[preset]
}
