import { describe, expect, it } from 'vitest'
import { parseRichText } from './richText'

describe('parseRichText', () => {
  it('giữ HTML như chữ, không biến thành thẻ', () => {
    const parts = parseRichText('<img src=x onerror=alert(1)>')
    expect(parts).toEqual([{ kind: 'text', text: '<img src=x onerror=alert(1)>' }])
    expect(parts.some((part) => part.kind !== 'text' && part.kind !== 'strong' && part.kind !== 'code' && part.kind !== 'break')).toBe(false)
  })

  it('in đậm, code và xuống dòng', () => {
    expect(parseRichText('Xin **chào** `bot`\nxong')).toEqual([
      { kind: 'text', text: 'Xin ' },
      { kind: 'strong', text: 'chào' },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'bot' },
      { kind: 'break' },
      { kind: 'text', text: 'xong' }
    ])
  })
})
