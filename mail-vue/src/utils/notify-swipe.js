import { nextTick } from 'vue'

/** 弹层默认展示 5 秒后向右滑出 */
export const NOTIFY_AUTO_DISMISS_MS = 5000

const TYPE_ICON = {
    success: '✓',
    warning: '!',
    error: '×',
    info: 'i',
    '': 'i'
}

function ensureStyles() {
    if (document.getElementById('cm-toast-style')) return
    const style = document.createElement('style')
    style.id = 'cm-toast-style'
    style.textContent = `
.cm-toast-root {
  position: fixed;
  top: calc(72px + env(safe-area-inset-top, 0px));
  right: 24px;
  z-index: 4000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(340px, calc(100vw - 32px));
  pointer-events: none;
}
.cm-toast {
  pointer-events: auto;
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255,255,255,.97);
  color: #1f2329;
  border: 1px solid rgba(15,23,42,.08);
  box-shadow: 0 14px 36px rgba(15,23,42,.16);
  backdrop-filter: blur(12px);
  cursor: grab;
  user-select: none;
  touch-action: pan-y;
  opacity: 0;
  transform: translateX(-16px);
  animation: cm-toast-in .28s cubic-bezier(.32,.72,0,1) forwards;
}
html.dark .cm-toast {
  background: rgba(28,33,40,.96);
  color: #f2f4f8;
  border-color: rgba(255,255,255,.08);
}
.cm-toast.is-leaving {
  animation: cm-toast-out .25s ease forwards !important;
}
.cm-toast-icon {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #fff;
  background: #2b7fff;
}
.cm-toast-warning .cm-toast-icon { background: #f59e0b; }
.cm-toast-success .cm-toast-icon { background: #22c55e; }
.cm-toast-error .cm-toast-icon { background: #ef4444; }
.cm-toast-title { font-weight: 700; font-size: 14px; margin-bottom: 2px; }
.cm-toast-body { font-size: 12px; opacity: .9; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
.cm-toast-body p { margin: 0 0 4px; }
.cm-toast-body br { line-height: 1.45; }
@keyframes cm-toast-in {
  from { opacity: 0; transform: translateX(-24px) scale(.96); }
  to { opacity: 1; transform: translateX(0) scale(1); }
}
@keyframes cm-toast-out {
  from { opacity: 1; transform: translateX(0); }
  to { opacity: 0; transform: translateX(120%); }
}
.cm-toast:active { cursor: grabbing; }
`
    document.head.appendChild(style)
}

function getRoot() {
    let root = document.querySelector('.cm-toast-root')
    if (!root) {
        root = document.createElement('div')
        root.className = 'cm-toast-root'
        document.body.appendChild(root)
    }
    return root
}

function dismissToast(el, onClose) {
    if (!el || el.__cmClosed) return
    el.__cmClosed = true
    if (el.__cmTimer) {
        clearTimeout(el.__cmTimer)
        el.__cmTimer = null
    }
    el.classList.add('is-leaving')
    el.style.transform = 'translateX(120%)'
    el.style.opacity = '0'
    window.setTimeout(() => {
        el.remove()
        try { onClose?.() } catch { /* noop */ }
    }, 240)
}

function bindGesture(el, onClose, onClick) {
    let startX = 0
    let deltaX = 0
    let dragging = false
    let pointerId = null
    let suppressClick = false
    const threshold = 72

    const arm = () => {
        if (el.__cmTimer) clearTimeout(el.__cmTimer)
        el.__cmTimer = window.setTimeout(() => dismissToast(el, onClose), NOTIFY_AUTO_DISMISS_MS)
    }

    el.addEventListener('pointerdown', (e) => {
        if (e.button != null && e.button !== 0) return
        dragging = true
        pointerId = e.pointerId
        startX = e.clientX
        deltaX = 0
        suppressClick = false
        if (el.__cmTimer) {
            clearTimeout(el.__cmTimer)
            el.__cmTimer = null
        }
        el.style.animation = 'none'
        el.style.transition = 'none'
        try { el.setPointerCapture?.(pointerId) } catch { /* noop */ }
    })

    el.addEventListener('pointermove', (e) => {
        if (!dragging) return
        if (pointerId != null && e.pointerId !== pointerId) return
        deltaX = e.clientX - startX
        if (Math.abs(deltaX) > 6) suppressClick = true
        if (deltaX <= 0) {
            el.style.transform = 'translateX(0)'
            el.style.opacity = '1'
            return
        }
        el.style.transform = `translateX(${deltaX}px)`
        el.style.opacity = String(Math.max(0, 1 - deltaX / 220))
    })

    const onUp = (e) => {
        if (!dragging) return
        if (pointerId != null && e.pointerId !== pointerId) return
        dragging = false
        try { el.releasePointerCapture?.(pointerId) } catch { /* noop */ }
        pointerId = null
        if (deltaX >= threshold) {
            suppressClick = true
            dismissToast(el, onClose)
            return
        }
        el.style.transition = 'transform .18s ease, opacity .18s ease'
        el.style.transform = 'translateX(0)'
        el.style.opacity = '1'
        arm()
    }

    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('click', (e) => {
        if (suppressClick) {
            suppressClick = false
            e.preventDefault()
            e.stopPropagation()
            return
        }
        try { onClick?.() } catch { /* noop */ }
    })

    arm()
    return { dismiss: () => dismissToast(el, onClose) }
}

function looksLikeHtml(text) {
    return /<\/?[a-z][\s\S]*>/i.test(String(text || ''))
}

function setToastBody(body, message, html) {
    const raw = String(message ?? '')
    // 管理员公告/登录文案可能带 HTML；避免整段当成源码显示
    if (html || looksLikeHtml(raw)) {
        // 去掉仅用于布局的空 div 包装，减少多余节点
        const cleaned = raw
            .replace(/^\s*<div[^>]*>/i, '')
            .replace(/<\/div>\s*$/i, '')
        body.innerHTML = cleaned
    } else {
        body.textContent = raw
    }
}

/**
 * 自定义通知：不使用 Element Notification
 * - 无右上角 X
 * - 5 秒后向右滑出
 * - 可按住向右拖动关闭
 * - 支持 HTML 正文（与系统公告一致）
 */
export function notifySwipe(options = {}) {
    const {
        title = '',
        message = '',
        type = '',
        html = false,
        onClick,
        onClose
    } = options

    ensureStyles()
    const root = getRoot()
    const el = document.createElement('div')
    const typeClass = type ? ` cm-toast-${type}` : ''
    el.className = `cm-toast${typeClass}`
    el.innerHTML = `
      <div class="cm-toast-icon">${TYPE_ICON[type] || 'i'}</div>
      <div class="cm-toast-main">
        <div class="cm-toast-title"></div>
        <div class="cm-toast-body"></div>
      </div>
    `
    el.querySelector('.cm-toast-title').textContent = String(title || '')
    const body = el.querySelector('.cm-toast-body')
    setToastBody(body, message, html)
    root.appendChild(el)

    const handle = bindGesture(el, onClose, onClick)

    nextTick(() => {
        el.style.animation = 'none'
        el.style.opacity = '1'
        el.style.transform = 'translateX(0)'
    })

    return {
        close: () => handle?.dismiss?.(),
        el
    }
}

export default notifySwipe
