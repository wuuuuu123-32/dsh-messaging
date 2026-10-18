import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
const registered = new Map()
const injected = new Map()
const observers = []
let now = 1000
let nextId = 1

class Element {
  constructor(attrs = {}, tagName = 'div') {
    this.attrs = { ...attrs }
    this.tagName = String(attrs.tagName || tagName).toUpperCase()
    this.dataset = {}
    this.listeners = {}
    this.parentElement = null
    this.children = []
    this.style = {}
    this.classList = { values: new Set(), add: (...names) => names.forEach((name) => this.classList.values.add(name)), remove: (...names) => names.forEach((name) => this.classList.values.delete(name)), contains: (name) => this.classList.values.has(name) }
    this._text = ''
    this._rect = { top: 0, bottom: 0 }
    this.offsetTop = 0
    this.clientHeight = 0
    this.scrollHeight = 0
    this._scrollTop = 0
  }
  get textContent() { return this._text || this.children.map((child) => child.textContent || '').join('') }
  set textContent(value) { this._text = String(value ?? ''); this.children = [] }
  set innerHTML(value) { if (value === '') this.children = [] }
  get innerHTML() { return '' }
  getAttribute(name) { return this.attrs[name] ?? null }
  setAttribute(name, value) { this.attrs[name] = String(value) }
  addEventListener(name, fn) { this.listeners[name] = fn }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child }
  click() { this.listeners.click?.({ preventDefault() {}, stopPropagation() {} }) }
  querySelector(selector) {
    if (selector === '[data-messaging-button]') {
      for (const child of this.children) {
        if (child.dataset?.messagingButton) return child
        const found = child.querySelector?.(selector)
        if (found) return found
      }
    }
    return null
  }
  querySelectorAll(selector) {
    if (selector === 'button') return this.officialButtons || []
    return []
  }
  closest(selector) { return selector === '[data-chat-turn]' ? null : null }
  getBoundingClientRect() { return { ...this._rect } }
  scrollIntoView() { this.scrollCalls = (this.scrollCalls || 0) + 1 }
}

function makeRow(nodeKey, sessionId, { visible = false, scrollable = false } = {}) {
  const parent = new Element({ 'data-session-id': sessionId })
  if (scrollable) {
    parent.style.overflowY = 'auto'
    parent.clientHeight = 400
    parent.scrollHeight = 1200
  }
  const row = new Element({ 'data-chat-node-key': nodeKey })
  row.offsetTop = 700
  row._rect = visible ? { top: 100, bottom: 250 } : { top: 950, bottom: 1100 }
  row.parentElement = parent
  const actionRow = new Element()
  const official = new Element({}, 'button')
  official.title = '复制'
  official.parentElement = actionRow
  actionRow.parentElement = row
  row.children.push(actionRow)
  row.officialButtons = [official]
  if (scrollable) {
    Object.defineProperty(parent, 'scrollTop', {
      get: () => parent._scrollTop,
      set: (value) => { parent._scrollTop = value; row._rect = { top: 100, bottom: 250 } },
    })
  }
  return { row, parent, actionRow }
}

const direct = makeRow('node-direct', 'session-a', { scrollable: true })
const cross = makeRow('node-cross', 'session-b', { visible: true })
const unmarked = makeRow('node-unmarked', 'session-c')
const rows = [direct.row, unmarked.row]
const sidebar = []
const document = {
  body: new Element({}, 'body'),
  head: new Element({}, 'head'),
  documentElement: new Element({}, 'html'),
  getElementById: () => null,
  createElement: (tag) => new Element({}, tag),
  createElementNS: (_namespace, tag) => new Element({}, tag),
  querySelectorAll: (selector) => {
    if (selector === '[data-chat-node-key]') return rows
    if (selector === '[data-session-id]' || selector === '[data-chat-session-id]') return sidebar
    if (selector === 'button') return sidebar.filter((node) => node.tagName === 'BUTTON')
    if (selector === 'a') return sidebar.filter((node) => node.tagName === 'A')
    if (selector === '[role="button"]') return sidebar.filter((node) => node.getAttribute('role') === 'button')
    return []
  },
}
const storage = {
  value: JSON.stringify([
    { sessionId: 'session-a', nodeKey: 'node-direct', text: 'direct', role: 'assistant', createdAt: 1 },
    { sessionId: 'session-b', nodeKey: 'node-cross', text: 'cross', role: 'assistant', createdAt: 2 },
    { sessionId: 'session-a', nodeKey: 'node-missing', text: 'missing', role: 'assistant', createdAt: 3 },
  ]),
  getItem: () => storage.value,
  setItem: (_key, value) => { storage.value = value },
}
const window = {
  innerHeight: 800,
  location: { pathname: '/chat/session-a', hash: '' },
  localStorage: storage,
  requestAnimationFrame: (fn) => fn(),
  setTimeout: (fn, ms = 0) => { now += Number(ms) || 0; fn(); return nextId++ },
  getComputedStyle: (node) => ({ overflowY: node.style?.overflowY || 'visible' }),
}
class MutationObserver {
  constructor(callback) { this.callback = callback; observers.push(this) }
  observe() {}
  disconnect() {}
}
const RealDate = Date
class FakeDate extends RealDate { static now() { return now } }

function createElement(type, props, ...children) {
  return { type, props: { ...(props || {}), children: children.length === 1 ? children[0] : children } }
}
const statusHistory = []
const React = {
  createElement,
  Component: class {},
  useMemo: (fn) => fn(),
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  useState: (initial) => initial === '' ? [initial, (value) => statusHistory.push(value)] : [true, () => {}],
}
const context = { window, document, MutationObserver, console, Date: FakeDate }
window.__ModuleLoader__ = { load: ({ id, factory }) => { assert.equal(id, 'dsh-messaging'); context.plugin = factory((name) => name === 'react' ? React : (() => { throw new Error(`unexpected require: ${name}`) })()) } }
vm.runInNewContext(source, context, { filename: 'lib/client.js' })
assert.equal(typeof context.plugin.apply, 'function')

const slots = {
  inject(name, factory) { injected.set(name, factory) },
  register(options, component) { registered.set(options.name, { options, component }); return options },
}
context.plugin.apply({ slots })
assert.equal(document.documentElement.getAttribute('data-messaging'), '1.0.0')
for (const name of ['shell.overlay', 'conversation.session.header.utilities', 'sidebar.session.row.leading']) {
  assert.ok(injected.has(name), `inject registered for ${name}`)
  const registration = injected.get(name)()
  const result = registration.next()
  assert.equal(result.done, false)
  assert.equal(result.value.name, name)
  assert.ok(registered.has(name), `slot component registered for ${name}`)
}

const probe = registered.get('conversation.session.header.utilities').component
probe({ sessionId: 'session-a' })
const overlay = registered.get('shell.overlay').component()
const overlayChildren = Array.isArray(overlay.props.children) ? overlay.props.children : [overlay.props.children]
const entryNode = overlayChildren.at(-1)
const entryButton = entryNode.type(entryNode.props)
assert.equal(entryButton.type, 'button')
assert.equal(entryButton.props.className, 'dsh-messaging-entry')
assert.equal(entryButton.props.children.type, 'svg')
assert.equal(entryButton.props.children.props.children.props.d, 'M6 3h12v18l-6-4-6 4V3Z')

const directButton = direct.actionRow.children[0]
assert.equal(direct.actionRow.children.length, 1, 'message action receives one button')
assert.equal(directButton.children[0].tagName, 'SVG', 'message button uses SVG bookmark')
assert.equal(directButton.children[0].children[0].getAttribute('fill'), 'currentColor', 'marked message uses filled bookmark')
assert.equal(directButton.getAttribute('aria-disabled'), 'false', 'ancestor data-session-id is a session fallback')
assert.equal(unmarked.actionRow.children[0].children[0].children[0].getAttribute('fill'), 'none', 'unmarked message uses outline bookmark')
observers[0].callback()
assert.equal(direct.actionRow.children.length, 1, 'rescanning does not duplicate the button')

const badge = registered.get('sidebar.session.row.leading').component({ sessionId: 'session-a' })
assert.equal(badge.type, 'span')
assert.equal(badge.props.children[0].type, 'svg', 'sidebar badge uses SVG bookmark')
assert.equal(badge.props.children[0].props.children.props.fill, 'currentColor', 'marked sidebar badge is filled')

function panelItems() {
  const panelElement = overlayChildren[0].props.children
  const panel = panelElement.type(panelElement.props)
  const values = Array.isArray(panel.props.children) ? panel.props.children : [panel.props.children]
  return values.flatMap((value) => Array.isArray(value) ? value : [value]).filter((value) => value?.props?.className === 'dsh-messaging-item')
}

probe({})
statusHistory.length = 0
await panelItems().find((item) => item.props.children[1].props.children === 'direct').props.onClick()
assert.ok(direct.row.scrollCalls >= 1, 'same-session jump calls scrollIntoView')
assert.ok(direct.parent._scrollTop > 0, 'same-session jump centers through scrollable ancestor')
assert.ok(statusHistory.includes('当前页面直接命中'), 'empty current-session probe still directly locates a row already in the DOM')

const sessionTarget = new Element({ 'data-session-id': 'session-b' }, 'button')
sessionTarget.textContent = 'session-b'
sessionTarget.click = () => { probe({ sessionId: 'session-b' }); rows.push(cross.row) }
sidebar.push(sessionTarget)
statusHistory.length = 0
await panelItems().find((item) => item.props.children[1].props.children === 'cross').props.onClick()
assert.ok(statusHistory.includes('已切换会话，正在定位'), 'cross-session jump reports post-switch locating state')
assert.ok(statusHistory.includes('已切换会话后命中'), 'cross-session jump reports a successful post-switch hit')
assert.ok(cross.row.scrollCalls >= 1, 'cross-session jump locates the row after DOM fallback click')

probe({ sessionId: 'session-a' })
rows.splice(0, rows.length, direct.row)
statusHistory.length = 0
await panelItems().find((item) => item.props.children[1].props.children === 'missing').props.onClick()
assert.ok(statusHistory.includes('没找到行'), 'missing row reports a visible timeout state')

console.log('client: bundle、统一书签 SVG、重复扫描、同会话定位、跨会话 DOM 兜底和缺失行状态通过')
