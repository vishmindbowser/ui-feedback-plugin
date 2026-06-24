import { getState, subscribe } from '../core/state'

type Position = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'

const POSITION_STYLES: Record<Position, Partial<CSSStyleDeclaration>> = {
  'bottom-right': { bottom: '24px', right: '24px' },
  'bottom-left':  { bottom: '24px', left:  '24px' },
  'top-right':    { top:    '24px', right: '24px' },
  'top-left':     { top:    '24px', left:  '24px' },
}

const BG        = '#6366f1'
const BG_HOVER  = '#4f46e5'
const BG_PANEL_ACTIVE = '#4338ca'

export function createFloatingTrigger(
  shadow: ShadowRoot,
  position: Position,
  onStartAnnotation: () => void,
  onTogglePanel: () => void
): HTMLElement {
  const wrapper = document.createElement('div')
  Object.assign(wrapper.style, {
    position: 'fixed',
    zIndex: '2147483647',
    display: 'flex',
    alignItems: 'stretch',
    borderRadius: '28px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.28), 0 1px 4px rgba(0,0,0,0.16)',
    overflow: 'hidden',
    userSelect: 'none',
    ...POSITION_STYLES[position],
  })

  // ── Annotate button ──────────────────────────────────────────────────────
  const annotateBtn = document.createElement('button')
  annotateBtn.id = 'ufp-btn-annotate'
  annotateBtn.title = 'Add feedback annotation'
  applyBtnBase(annotateBtn)
  annotateBtn.style.padding = '10px 16px 10px 14px'
  annotateBtn.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="flex-shrink:0">
      <path d="M12 20h9"/>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
    <span id="ufp-annotate-label" style="font-size:14px;font-weight:600;">Feedback</span>
  `

  // ── Separator ────────────────────────────────────────────────────────────
  const sep = document.createElement('div')
  sep.style.cssText = 'width:1px;background:rgba(255,255,255,0.3);flex-shrink:0;'

  // ── Panel button ─────────────────────────────────────────────────────────
  const panelBtn = document.createElement('button')
  panelBtn.id = 'ufp-btn-panel'
  panelBtn.title = 'View all comments'
  applyBtnBase(panelBtn)
  panelBtn.style.padding = '10px 14px'
  panelBtn.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="flex-shrink:0">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
    <span id="ufp-panel-count" style="font-size:13px;font-weight:600;min-width:8px;text-align:center;"></span>
  `

  wrapper.appendChild(annotateBtn)
  wrapper.appendChild(sep)
  wrapper.appendChild(panelBtn)
  shadow.appendChild(wrapper)

  const annotateLabel = wrapper.querySelector('#ufp-annotate-label') as HTMLSpanElement
  const panelCount    = wrapper.querySelector('#ufp-panel-count')    as HTMLSpanElement

  // ── Click handlers ───────────────────────────────────────────────────────
  annotateBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    if ((wrapper as any)._dragged) return
    const state = getState()
    if (state.active) return
    if (state.panelOpen) {
      onTogglePanel()
      setTimeout(onStartAnnotation, 220)
    } else {
      onStartAnnotation()
    }
  })

  panelBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    if ((wrapper as any)._dragged) return
    if (getState().active) return
    onTogglePanel()
  })

  // ── Hover effects ─────────────────────────────────────────────────────────
  addHover(annotateBtn, () => getState().panelOpen ? BG : BG, BG_HOVER)
  addHover(panelBtn,    () => getState().panelOpen ? BG_PANEL_ACTIVE : BG, BG_HOVER)

  // ── State subscription ───────────────────────────────────────────────────
  subscribe((state) => {
    const openCount = state.comments.filter((c) => !c.resolved).length
    panelCount.textContent = openCount > 0 ? String(openCount) : ''

    if (state.active) {
      annotateLabel.textContent = 'Drawing…'
      annotateBtn.style.opacity = '0.65'
      panelBtn.style.opacity    = '0.65'
      annotateBtn.style.pointerEvents = 'none'
      panelBtn.style.pointerEvents    = 'none'
    } else {
      annotateLabel.textContent = 'Feedback'
      annotateBtn.style.opacity = '1'
      panelBtn.style.opacity    = '1'
      annotateBtn.style.pointerEvents = 'auto'
      panelBtn.style.pointerEvents    = 'auto'
    }

    // Tint panel button when panel is open to signal active state
    panelBtn.style.background = state.panelOpen ? BG_PANEL_ACTIVE : BG
  })

  // ── Drag ─────────────────────────────────────────────────────────────────
  makeDraggable(wrapper)

  return wrapper
}

function applyBtnBase(btn: HTMLButtonElement) {
  Object.assign(btn.style, {
    display:     'flex',
    alignItems:  'center',
    gap:         '7px',
    background:  BG,
    color:       '#ffffff',
    border:      'none',
    cursor:      'pointer',
    fontFamily:  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    lineHeight:  '1',
    transition:  'background 0.12s',
  })
}

function addHover(btn: HTMLButtonElement, getNormal: () => string, hoverColor: string) {
  btn.addEventListener('mouseenter', () => { btn.style.background = hoverColor })
  btn.addEventListener('mouseleave', () => { btn.style.background = getNormal() })
}

function makeDraggable(el: HTMLElement) {
  let startX = 0, startY = 0, initLeft = 0, initTop = 0

  el.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return
    startX = e.clientX; startY = e.clientY
    const rect = el.getBoundingClientRect()
    initLeft = rect.left; initTop = rect.top
    ;(el as any)._dragged = false

    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (!((el as any)._dragged) && Math.sqrt(dx * dx + dy * dy) < 5) return
      ;(el as any)._dragged = true
      el.style.left   = `${Math.max(0, Math.min(window.innerWidth  - el.offsetWidth,  initLeft + dx))}px`
      el.style.top    = `${Math.max(0, Math.min(window.innerHeight - el.offsetHeight, initTop  + dy))}px`
      el.style.right  = 'auto'
      el.style.bottom = 'auto'
    }

    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup',   onUp)
      // Reset after click event has fired
      requestAnimationFrame(() => { (el as any)._dragged = false })
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup',   onUp)
  })
}
