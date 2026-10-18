import assert from 'node:assert/strict'
import {
  detectMessageRole, excerpt, normalizePin, readPins, writePins, togglePin,
  pinsForSession, sessionIdFromProps,
} from '../lib/model.mjs'

const storage = new Map()
const store = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }

assert.equal(detectMessageRole('user'), 'user')
assert.equal(detectMessageRole('turn-process'), 'assistant')
assert.equal(excerpt('  多行\n 文本  '), '多行 文本')
assert.equal(excerpt('abcdef', 4), 'abc…')
assert.equal(sessionIdFromProps({ session: { id: 42 } }), '42')

let pins = []
const first = normalizePin({ sessionId: 's1', nodeKey: 'n1', role: 'user', text: '你好', createdAt: 1 })
assert.ok(first)
let result = togglePin(pins, first)
assert.equal(result.selected, true)
pins = result.pins
result = togglePin(pins, first)
assert.equal(result.selected, false)
pins = result.pins
assert.equal(pins.length, 0)
result = togglePin(pins, first)
assert.equal(result.selected, true)
pins = result.pins
assert.equal(pinsForSession(pins, 's1').length, 1)
writePins(store, pins)
assert.deepEqual(readPins(store).map((p) => p.id), [first.id])
assert.deepEqual(readPins({ getItem: () => '{bad json' }), [])
console.log('model: 行类型、摘录、标记读写、幂等切换、持久化往返通过')
