export type HardCaseColor = 'white' | 'black' | 'clear'

const HARD_CASE_COLOR_SUFFIX: Record<string, HardCaseColor> = {
  '-hard-case-white': 'white',
  '-hard-case-black': 'black',
  '-hard-case-clear': 'clear',
}

/** variant 末尾の `-hard-case-{white|black|clear}` からケース色を推定。該当なしは null。 */
export function parseHardCaseColorFromVariant(variant: string | null | undefined): HardCaseColor | null {
  const normalized = (variant ?? '').trim().toLowerCase()
  if (!normalized) return null

  for (const [suffix, color] of Object.entries(HARD_CASE_COLOR_SUFFIX)) {
    if (normalized.endsWith(suffix)) return color
  }
  return null
}
