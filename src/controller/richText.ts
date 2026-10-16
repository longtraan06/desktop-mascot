export type RichPart =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'break' }

const TOKEN = /\*\*([^*\n]+)\*\*|`([^`\n]+)`|\n/g

export function parseRichText(source: string): RichPart[] {
  const parts: RichPart[] = []
  let last = 0
  for (const match of source.matchAll(TOKEN)) {
    const index = match.index ?? 0
    if (index > last) parts.push({ kind: 'text', text: source.slice(last, index) })
    if (match[0] === '\n') parts.push({ kind: 'break' })
    else if (match[1] != null) parts.push({ kind: 'strong', text: match[1] })
    else if (match[2] != null) parts.push({ kind: 'code', text: match[2] })
    last = index + match[0].length
  }
  if (last < source.length) parts.push({ kind: 'text', text: source.slice(last) })
  return parts
}
