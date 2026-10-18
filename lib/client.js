/* dsh-messaging: zero-build browser bundle. */
window.__ModuleLoader__.load({
  id: 'dsh-messaging',
  factory: (require) => {
    const module = { exports: {} }
    const React = require('react')
    const h = React.createElement
    const { useEffect, useMemo, useSyncExternalStore } = React

    const VERSION = '1.0.0'
    const STORE_KEY = 'dsh-messaging:pins'
    const NODE_ATTR = 'data-chat-node-key'
    const TURN_ATTR = 'data-chat-turn'
    const BOOKMARK_PATH = 'M6 3h12v18l-6-4-6 4V3Z'
    const BOOKMARK_NS = 'http://www.w3.org/2000/svg'
    const listeners = new Set()
    const currentListeners = new Set()
    const current = { sessionId: '' }
    let pluginContext = null

    function safeStorage() {
      try { return window.localStorage } catch { return null }
    }
    function normalizeSessionId(value) {
      if (typeof value === 'string' && value.trim()) return value.trim()
      if (typeof value === 'number' && Number.isFinite(value)) return String(value)
      return ''
    }
    function sessionIdFromProps(props) {
      const p = props || {}
      return normalizeSessionId(p.sessionId ?? p.session?.id ?? p.session?.sessionId ?? p.id)
    }
    function excerpt(value, max = 240) {
      const text = String(value ?? '').replace(/\s+/g, ' ').trim()
      return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
    }
    function pinId(pin) { return `${normalizeSessionId(pin?.sessionId)}:${String(pin?.nodeKey || '')}` }
    function normalizePin(value) {
      if (!value || !normalizeSessionId(value.sessionId) || !String(value.nodeKey || '')) return null
      return {
        id: String(value.id || pinId(value)), sessionId: normalizeSessionId(value.sessionId),
        nodeKey: String(value.nodeKey), role: value.role === 'user' ? 'user' : 'assistant',
        text: excerpt(value.text || ''), turn: value.turn == null ? '' : String(value.turn),
        title: excerpt(value.title || '', 80), createdAt: Number(value.createdAt) || Date.now(),
      }
    }
    function loadPins() {
      try {
        const value = JSON.parse(safeStorage()?.getItem(STORE_KEY) || '[]')
        if (!Array.isArray(value)) return []
        const seen = new Set()
        return value.map(normalizePin).filter(Boolean).filter((p) => !seen.has(p.id) && seen.add(p.id))
      } catch { return [] }
    }
    let pins = loadPins()
    function emit() { for (const fn of [...listeners]) { try { fn() } catch {} } }
    function persist() {
      try { safeStorage()?.setItem(STORE_KEY, JSON.stringify(pins)) } catch {}
      emit()
    }
    function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) }
    function getPins() { return pins }
    function setCurrentSession(id) {
      const value = normalizeSessionId(id)
      if (value === current.sessionId) return
      current.sessionId = value
      for (const fn of [...currentListeners]) { try { fn() } catch {} }
    }
    function subscribeCurrent(fn) { currentListeners.add(fn); return () => currentListeners.delete(fn) }
    function getCurrent() { return current.sessionId }
    function sessionIdFromContext(ctx) {
      const candidates = [
        ctx?.sessionId, ctx?.session?.id, ctx?.session?.sessionId,
        ctx?.chat?.sessionId, ctx?.chat?.session?.id,
        ctx?.conversation?.sessionId, ctx?.conversation?.session?.id,
      ]
      for (const candidate of candidates) {
        const id = normalizeSessionId(candidate)
        if (id) return id
      }
      return ''
    }
    function sessionIdFromDOM(row) {
      try {
        let node = row
        while (node && node !== document.body) {
          const id = normalizeSessionId(node.getAttribute?.('data-session-id') || node.getAttribute?.('data-chat-session-id'))
          if (id) return id
          node = node.parentElement
        }
        const route = String(window.location?.hash || window.location?.pathname || '')
        const match = route.match(/(?:^|\/)(?:chat|conversation|session)\/([^/?#]+)/i)
        if (match) return normalizeSessionId(decodeURIComponent(match[1]))
      } catch {}
      return ''
    }
    function resolveSessionId(row) {
      return current.sessionId || sessionIdFromContext(pluginContext) || sessionIdFromDOM(row)
    }
    function isPinned(sessionId, nodeKey) {
      return pins.some((p) => p.sessionId === normalizeSessionId(sessionId) && p.nodeKey === String(nodeKey || ''))
    }
    function toggle(value) {
      const pin = normalizePin(value)
      if (!pin) return false
      const idx = pins.findIndex((p) => p.id === pin.id)
      if (idx >= 0) pins = pins.filter((_, i) => i !== idx)
      else pins = [...pins, pin]
      persist()
      return idx < 0
    }
    function roleForRow(row) {
      let el = row
      while (el && el !== document.body) {
        const kind = el.getAttribute?.('data-chat-flow-kind')
        if (kind) return String(kind).toLowerCase() === 'user' ? 'user' : 'assistant'
        el = el.parentElement
      }
      return 'assistant'
    }
    function rowText(row) {
      try {
        const clone = row.cloneNode(true)
        clone.querySelectorAll('pre,code,[data-messaging-button],button').forEach((node) => node.remove())
        const blocks = []
        const visit = (node) => {
          if (!node) return
          const children = node.children ? [...node.children] : []
          if (!children.length) {
            const text = String(node.textContent || '').replace(/\s+/g, ' ').trim()
            if (text) blocks.push(text)
            return
          }
          children.forEach(visit)
        }
        visit(clone)
        return excerpt(blocks.sort((a, b) => b.length - a.length)[0] || '', 160)
      } catch { return '' }
    }
    function rowForNodeKey(nodeKey) {
      try { return [...document.querySelectorAll(`[${NODE_ATTR}]`)].find((n) => n.getAttribute(NODE_ATTR) === nodeKey) || null } catch { return null }
    }
    function viewportHeight() {
      const height = Number(window.innerHeight || document.documentElement?.clientHeight || 0)
      return height > 0 ? height : 0
    }
    function rowInViewport(row) {
      try {
        const rect = row.getBoundingClientRect?.()
        const height = viewportHeight()
        return !!rect && height > 0 && rect.top >= 0 && rect.bottom <= height
      } catch { return false }
    }
    function scrollStyle(node) {
      try {
        const computed = window.getComputedStyle?.(node)
        return String(computed?.overflowY || node?.style?.overflowY || '').toLowerCase()
      } catch { return '' }
    }
    function scrollableAncestor(row) {
      let node = row?.parentElement || null
      while (node) {
        const overflowY = scrollStyle(node)
        if ((overflowY === 'auto' || overflowY === 'scroll') && Number(node.scrollHeight) > Number(node.clientHeight)) return node
        if (node === document.body || node === document.documentElement) break
        node = node.parentElement
      }
      return null
    }
    function scrollRowIntoView(row) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try { row.scrollIntoView?.({ behavior: 'smooth', block: 'center' }) } catch {}
        if (rowInViewport(row)) return true
        const container = scrollableAncestor(row)
        if (container) {
          try { container.scrollTop = Number(row.offsetTop || 0) - Number(container.clientHeight || 0) / 2 } catch {}
          if (rowInViewport(row)) return true
        }
      }
      return false
    }
    function clickableAncestor(node) {
      let currentNode = node
      while (currentNode && currentNode !== document.body) {
        try {
          const tag = String(currentNode.tagName || '').toLowerCase()
          const role = String(currentNode.getAttribute?.('role') || '').toLowerCase()
          if (typeof currentNode.click === 'function' && (tag === 'button' || tag === 'a' || role === 'button' || currentNode.onclick || currentNode === node)) return currentNode
        } catch {}
        currentNode = currentNode.parentElement
      }
      return null
    }
    function sessionSwitchTarget(sessionId) {
      const id = normalizeSessionId(sessionId)
      if (!id) return null
      const candidates = []
      const add = (node) => { if (node && !candidates.includes(node)) candidates.push(node) }
      for (const selector of ['[data-session-id]', '[data-chat-session-id]', 'button', 'a', '[role="button"]']) {
        try { document.querySelectorAll(selector).forEach(add) } catch {}
      }
      for (const node of candidates) {
        let marked = false
        try { marked = normalizeSessionId(node.getAttribute?.('data-session-id') || node.getAttribute?.('data-chat-session-id')) === id } catch {}
        if (!marked) continue
        const target = clickableAncestor(node)
        if (target) return target
      }
      for (const node of candidates) {
        try {
          if (String(node.textContent || '').includes(id)) {
            const target = clickableAncestor(node)
            if (target) return target
          }
        } catch {}
      }
      return null
    }
    function sessionOpener(ctx) {
      const candidates = []
      const add = (value) => { if (value && !candidates.includes(value)) candidates.push(value) }
      add(ctx?.uiWorkspace)
      add(ctx?.scope?.uiWorkspace)
      add(ctx?.root?.uiWorkspace)
      try { add(ctx?.get?.('uiWorkspace')) } catch {}
      for (const service of candidates) {
        if (typeof service.openSession === 'function') return service.openSession.bind(service)
      }
      return null
    }

    function wait(ms) {
      return new Promise((resolve) => window.setTimeout(resolve, ms))
    }

    async function jumpTo(pin, report) {
      const currentRow = rowForNodeKey(pin.nodeKey)
      if (currentRow) {
        report('当前页面直接命中')
        if (!scrollRowIntoView(currentRow)) {
          report('找到行但滚动失败')
          return false
        }
        try {
          currentRow.classList.add('dsh-messaging-highlight')
          window.setTimeout(() => { try { currentRow.classList.remove('dsh-messaging-highlight') } catch {} }, 2000)
        } catch {}
        return true
      }

      const here = getCurrent()
      const crossSession = here !== pin.sessionId
      let switched = false
      if (crossSession) {
        const openSession = sessionOpener(pluginContext)
        if (openSession) {
          try {
            await Promise.resolve(openSession(pin.sessionId))
          } catch (error) {
            report(`会话切换入口不可用：${error?.message || String(error)}`)
            return false
          }
          switched = true
        } else {
          const target = sessionSwitchTarget(pin.sessionId)
          if (!target) {
            report('会话切换入口不可用')
            try { console.warn('[dsh-messaging] uiWorkspace.openSession/session opener unavailable') } catch {}
            return false
          }
          try { target.click() } catch (error) {
            report(`会话切换入口不可用：${error?.message || String(error)}`)
            return false
          }
          await wait(300)
          switched = true
        }
        report('已切换会话，正在定位')
      } else {
        report('正在定位')
      }
      const deadline = Date.now() + 5000
      while (Date.now() < deadline) {
        const row = rowForNodeKey(pin.nodeKey)
        if (row) {
          if (!scrollRowIntoView(row)) {
            report('找到行但滚动失败')
            return false
          }
          try {
            row.classList.add('dsh-messaging-highlight')
            window.setTimeout(() => { try { row.classList.remove('dsh-messaging-highlight') } catch {} }, 2000)
          } catch {}
          report(switched ? '已切换会话后命中' : '当前页面直接命中')
          return true
        }
        await wait(150)
      }
      report('没找到行')
      return false
    }

    const css = `
      .dsh-messaging-button{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;margin-left:3px;border:0;border-radius:5px;background:transparent;color:var(--dsh-foreground,#222);cursor:pointer;font:inherit}
      .dsh-messaging-button:hover,.dsh-messaging-button[data-selected="1"]{background:#e7eef5;color:var(--dsh-foreground,#222)}
      .dsh-messaging-button[data-unavailable="1"]{color:#8a4b16;background:#fff4e5}
      .dsh-messaging-badge{display:inline-flex;align-items:center;gap:3px;color:var(--dsh-foreground,#222);font-size:12px;line-height:1}
      .dsh-messaging-overlay{position:fixed;right:10px;bottom:24px;z-index:2147483000;display:flex;flex-direction:column;align-items:center;gap:6px}
      .dsh-messaging-entry{width:30px;height:30px;border:1px solid var(--dsh-border,#d6d6d6);border-radius:15px;background:var(--dsh-background,#fff);color:var(--dsh-foreground,#222);box-shadow:0 1px 5px rgba(0,0,0,.12);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0}
      .dsh-messaging-panel{position:fixed;right:46px;top:50%;transform:translateY(-50%);width:360px;max-height:70vh;overflow:auto;border:1px solid var(--dsh-border,#d6d6d6);border-radius:12px;background:var(--dsh-background,#fff);box-shadow:0 8px 32px rgba(0,0,0,.18);color:var(--dsh-foreground,#222);padding:10px 12px;font-size:12px}
      .dsh-messaging-panel header{display:flex;justify-content:space-between;align-items:center;padding:0 0 8px;border-bottom:1px solid var(--dsh-border,#d6d6d6);font-weight:600}
      .dsh-messaging-close{border:0;background:transparent;color:inherit;cursor:pointer;font-size:18px;line-height:1;padding:0 2px}
      .dsh-messaging-status{padding:6px 0;color:var(--dsh-foreground,#222);line-height:1.45}
      .dsh-messaging-item{display:block;width:100%;padding:8px 0;border:0;border-bottom:1px solid var(--dsh-border,#d6d6d6);background:transparent;text-align:left;cursor:pointer;color:inherit}
      .dsh-messaging-item:hover{background:color-mix(in srgb,var(--dsh-foreground,#222) 5%,transparent)}.dsh-messaging-meta{display:flex;gap:7px;color:var(--dsh-foreground,#222);opacity:.68;font-size:11px}.dsh-messaging-text{margin-top:4px;font-size:12px;line-height:1.45;word-break:break-word}
      .dsh-messaging-empty{padding:16px 0;color:inherit;opacity:.68;text-align:center;font-size:12px}.dsh-messaging-highlight{outline:2px solid var(--dsh-foreground,#222)!important;outline-offset:3px;transition:outline-color .2s}
    `
    function ensureStyle() { try { if (document.getElementById('dsh-messaging-style')) return; const s = document.createElement('style'); s.id = 'dsh-messaging-style'; s.textContent = css; document.head.appendChild(s) } catch {} }

    class Boundary extends React.Component {
      constructor(props) { super(props); this.state = { failed: false } }
      static getDerivedStateFromError() { return { failed: true } }
      componentDidCatch() {}
      render() { return this.state.failed ? (this.props.fallback || null) : this.props.children }
    }

    function StableEntry({ onClick, open }) {
      ensureStyle()
      return h('button', { className: 'dsh-messaging-entry', type: 'button', title: open ? '关闭标记' : '打开标记', 'aria-label': open ? '关闭标记' : '打开标记', onClick }, pinIcon(15, open))
    }
    function pinIcon(size = 15, selected = false) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }, h('path', { d: BOOKMARK_PATH, fill: selected ? 'currentColor' : 'none' }))
    }
    function createBookmarkSvg(size = 15, selected = false) {
      const svg = document.createElementNS(BOOKMARK_NS, 'svg')
      svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size)); svg.setAttribute('viewBox', '0 0 24 24')
      svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.8')
      svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true')
      const path = document.createElementNS(BOOKMARK_NS, 'path')
      path.setAttribute('d', BOOKMARK_PATH); path.setAttribute('fill', selected ? 'currentColor' : 'none')
      svg.appendChild(path)
      return svg
    }
    function setBookmarkIcon(button, selected = false) {
      try {
        button.innerHTML = ''
        button.appendChild(createBookmarkSvg(15, selected))
      } catch {}
    }
    function PinPanelContent({ onClose }) {
      const snapshot = useSyncExternalStore(subscribe, getPins, getPins)
      const items = useMemo(() => [...snapshot].sort((a, b) => b.createdAt - a.createdAt), [snapshot])
      const [status, setStatus] = React.useState('')
      const onJump = async (item) => {
        setStatus('正在打开会话…')
        const found = await jumpTo(item, setStatus)
        if (found) onClose()
      }
      return h('section', { className: 'dsh-messaging-panel' },
        h('header', null, h('span', null, `消息标记 (${items.length})`), h('button', { className: 'dsh-messaging-close', type: 'button', onClick: onClose, 'aria-label': '关闭' }, '×')),
        status ? h('div', { className: 'dsh-messaging-status' }, status) : null,
        items.length ? items.map((item) => h('button', { className: 'dsh-messaging-item', type: 'button', key: item.id, onClick: () => onJump(item) },
          h('div', { className: 'dsh-messaging-meta' }, item.role === 'user' ? '我' : '助手', item.title || `会话 ${item.sessionId.slice(-6)}`, new Date(item.createdAt).toLocaleString('zh-CN')),
          h('div', { className: 'dsh-messaging-text' }, item.text || '(无文本摘录)'),
        )) : h('div', { className: 'dsh-messaging-empty' }, '还没有标记'),
      )
    }
    function PinPanel() {
      const [open, setOpen] = React.useState(false)
      return h('div', { className: 'dsh-messaging-overlay' },
        open && h(Boundary, { fallback: h('div', { className: 'dsh-messaging-panel' }, h('div', { className: 'dsh-messaging-empty' }, '标记面板暂时不可用')) },
          h(PinPanelContent, { onClose: () => setOpen(false) })),
        h(StableEntry, { open, onClick: () => setOpen((v) => !v) }),
      )
    }
    function SessionProbe(props) { try { setCurrentSession(sessionIdFromProps(props)) } catch {} return null }
    function SessionRowBadge(props) {
      try {
        const id = sessionIdFromProps(props)
        const snapshot = useSyncExternalStore(subscribe, getPins, getPins)
        const count = snapshot.filter((p) => p.sessionId === id).length
        return count ? h('span', { className: 'dsh-messaging-badge', title: `${count} 条标记`, 'aria-label': `${count} 条标记` }, pinIcon(15, true), count) : null
      } catch { return null }
    }

    let scanScheduled = false
    function installMessageButtons() {
      if (scanScheduled) return
      scanScheduled = true
      window.requestAnimationFrame(() => {
        scanScheduled = false
        try {
          document.querySelectorAll(`[${NODE_ATTR}]`).forEach((row) => {
            if (!row || row.querySelector('[data-messaging-button]')) return
            const key = row.getAttribute(NODE_ATTR)
            if (!key) return
            const buttons = [...row.querySelectorAll('button')]
            const official = buttons.find((b) => /copy|复制|like|dislike|赞|踩|more|更多/i.test(`${b.title || ''} ${b.getAttribute('aria-label') || ''}`))
            if (!official) return
            const actionRow = official.parentElement
            if (!actionRow) return
            const button = document.createElement('button')
            button.type = 'button'; button.className = 'dsh-messaging-button'; button.dataset.messagingButton = '1'
            setBookmarkIcon(button, false); button.title = '标记消息'; button.setAttribute('aria-label', '标记消息')
            const update = () => {
              const sessionId = resolveSessionId(row)
              const selected = isPinned(sessionId, key)
              setBookmarkIcon(button, selected)
              button.dataset.selected = selected ? '1' : '0'
              button.dataset.unavailable = sessionId ? '0' : '1'
              button.title = sessionId ? (selected ? '取消标记' : '标记消息') : '无法标记：未能读取当前会话 ID'
              button.setAttribute('aria-label', button.title)
              button.setAttribute('aria-disabled', sessionId ? 'false' : 'true')
            }
            button.addEventListener('click', (event) => {
              event.preventDefault(); event.stopPropagation()
              const sessionId = resolveSessionId(row)
              if (!sessionId) {
                button.dataset.unavailable = '1'
                button.title = '无法标记：未能读取当前会话 ID'
                button.setAttribute('aria-label', button.title)
                button.setAttribute('aria-disabled', 'true')
                button.textContent = '!'
                window.setTimeout(() => { setBookmarkIcon(button, false); update() }, 2400)
                return
              }
              toggle({ sessionId, nodeKey: key, role: roleForRow(row), text: rowText(row), turn: row.closest(`[${TURN_ATTR}]`)?.getAttribute(TURN_ATTR) || '', createdAt: Date.now() })
              update()
            })
            actionRow.appendChild(button); update()
          })
        } catch {}
      })
    }
    function startDomObserver() {
      try {
        installMessageButtons()
        const observer = new MutationObserver(installMessageButtons)
        observer.observe(document.body, { childList: true, subtree: true })
        return () => observer.disconnect()
      } catch { return () => {} }
    }

    const inject = ['slots']
    function register(ctx, slot, id, order, component) {
      try { ctx.slots.inject(slot, function* () { yield ctx.slots.register({ name: slot, id, order }, component) }) } catch (error) { try { console.warn('[dsh-messaging] slot unavailable', slot, error) } catch {} }
    }
    function apply(ctx) {
      pluginContext = ctx || null
      try { document.documentElement.setAttribute('data-messaging', VERSION) } catch {}
      try { console.info('[dsh-messaging] client applied', VERSION) } catch {}
      try { ensureStyle(); startDomObserver() } catch {}
      register(ctx, 'shell.overlay', 'messaging-overlay', 40, PinPanel)
      register(ctx, 'conversation.session.header.utilities', 'messaging-session-probe', 90, SessionProbe)
      register(ctx, 'sidebar.session.row.leading', 'messaging-session-badge', 30, SessionRowBadge)
      return () => {}
    }
    module.exports = { apply, inject }
    return module.exports
  },
})
