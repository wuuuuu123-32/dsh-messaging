export const STORAGE_PREFIX = 'dsh-messaging:'

export function normalizeSessionId(value) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

export function sessionIdFromProps(props = {}) {
  return normalizeSessionId(
    props.sessionId ?? props.session?.id ?? props.session?.sessionId ?? props.id,
  )
}

export function detectMessageRole(nodeOrKind) {
  const kind = typeof nodeOrKind === 'string'
    ? nodeOrKind
    : nodeOrKind?.getAttribute?.('data-chat-flow-kind')
  return String(kind || '').toLowerCase() === 'user' ? 'user' : 'assistant'
}

export function messageKey(node) {
  return typeof node?.getAttribute === 'function'
    ? (node.getAttribute('data-chat-node-key') || '')
    : ''
}

export function excerpt(value, max = 96) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

export function pinId(pin) {
  return `${normalizeSessionId(pin?.sessionId)}:${String(pin?.nodeKey || '')}`
}

export function normalizePin(value) {
  if (!value || !normalizeSessionId(value.sessionId) || !String(value.nodeKey || '')) return null
  const pin = {
    id: String(value.id || pinId(value)),
    sessionId: normalizeSessionId(value.sessionId),
    nodeKey: String(value.nodeKey),
    role: value.role === 'user' ? 'user' : 'assistant',
    text: excerpt(value.text || '', 240),
    turn: value.turn == null ? '' : String(value.turn),
    createdAt: Number.isFinite(Number(value.createdAt)) ? Number(value.createdAt) : Date.now(),
  }
  return pin
}

export function readPins(storage, key = `${STORAGE_PREFIX}pins`) {
  try {
    const raw = storage?.getItem?.(key)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    const seen = new Set()
    return parsed.map(normalizePin).filter(Boolean).filter((pin) => {
      if (seen.has(pin.id)) return false
      seen.add(pin.id)
      return true
    })
  } catch {
    return []
  }
}

export function writePins(storage, pins, key = `${STORAGE_PREFIX}pins`) {
  const clean = (Array.isArray(pins) ? pins : []).map(normalizePin).filter(Boolean)
  try {
    storage?.setItem?.(key, JSON.stringify(clean))
    return clean
  } catch {
    return clean
  }
}

export function togglePin(pins, value) {
  const pin = normalizePin(value)
  if (!pin) return { pins: Array.isArray(pins) ? pins : [], selected: false }
  const list = Array.isArray(pins) ? pins : []
  const index = list.findIndex((item) => String(item?.id || pinId(item)) === pin.id)
  if (index >= 0) return { pins: list.filter((_, i) => i !== index), selected: false }
  return { pins: [...list, pin], selected: true }
}

export function pinsForSession(pins, sessionId) {
  const id = normalizeSessionId(sessionId)
  return (Array.isArray(pins) ? pins : []).filter((pin) => pin.sessionId === id)
}

export function formatPinTime(timestamp, locale = 'zh-CN') {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(timestamp))
  } catch {
    return ''
  }
}
