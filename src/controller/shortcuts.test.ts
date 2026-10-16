import { describe, expect, it } from 'vitest'
import { webShortcut } from './shortcuts'

describe('webShortcut', () => {
  it('Ctrl+Shift+Space mở hub', () => {
    expect(webShortcut({ ctrlKey: true, shiftKey: true, code: 'Space' })).toBe('hub')
  })

  it('Ctrl+Shift+H là boss key trên web dev', () => {
    expect(webShortcut({ ctrlKey: true, shiftKey: true, code: 'KeyH' })).toBe('boss')
  })

  it('thiếu modifier thì không ăn', () => {
    expect(webShortcut({ ctrlKey: true, shiftKey: false, code: 'KeyH' })).toBeNull()
    expect(webShortcut({ ctrlKey: false, shiftKey: true, code: 'Space' })).toBeNull()
  })
})
