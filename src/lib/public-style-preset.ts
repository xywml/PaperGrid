export const PUBLIC_STYLE_PRESETS = [
  'paper-grid',
  'neo-brutal',
  'terra-terminal',
  'schale-glass',
  'valley-ledger',
] as const

export type PublicStylePreset = (typeof PUBLIC_STYLE_PRESETS)[number]

export const DEFAULT_PUBLIC_STYLE_PRESET: PublicStylePreset = 'paper-grid'

const PUBLIC_STYLE_PRESET_STYLESHEET: Record<PublicStylePreset, string> = {
  'paper-grid': '/styles/public-theme/paper-grid.css',
  'neo-brutal': '/styles/public-theme/neo-brutal.css',
  'terra-terminal': '/styles/public-theme/terra-terminal.css',
  'schale-glass': '/styles/public-theme/schale-glass.css',
  'valley-ledger': '/styles/public-theme/valley-ledger.css',
}

export function normalizePublicStylePreset(raw?: string | null): PublicStylePreset {
  if (raw === 'soft-paper') return 'paper-grid'
  if (raw === 'editorial-serif') return 'paper-grid'
  if (raw === 'dot-matrix') return 'neo-brutal'
  if (raw === 'arknights-terminal') return 'terra-terminal'
  if (raw === 'blue-archive-glass') return 'schale-glass'
  if (raw === 'stardew-ledger') return 'valley-ledger'
  return PUBLIC_STYLE_PRESETS.find((preset) => preset === raw) ?? DEFAULT_PUBLIC_STYLE_PRESET
}

export function getPublicStylePresetStylesheet(preset: PublicStylePreset): string {
  return PUBLIC_STYLE_PRESET_STYLESHEET[preset]
}
