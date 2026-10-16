export const HUB_SHORTCUT = 'CommandOrControl+Shift+Space'
export const BOSS_SHORTCUT = 'CommandOrControl+Shift+H'

export function webShortcut(event: { ctrlKey: boolean; shiftKey: boolean; code: string }): 'hub' | 'boss' | null {
  if (!event.ctrlKey || !event.shiftKey) return null
  if (event.code === 'Space') return 'hub'
  if (event.code === 'KeyH') return 'boss'
  return null
}
