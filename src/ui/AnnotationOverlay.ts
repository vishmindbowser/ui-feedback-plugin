import type { DrawingTool, AnnotationShape, SVGRect, SVGCircle, SVGArrow, Point } from '../core/types'
import { renderShapeToSVG, ANNOTATION_COLOR, STROKE_WIDTH } from '../drawing/renderer'

export interface AnnotationResult {
  shapes: AnnotationShape[]
  text: string
  anchorX: number
  anchorY: number
}

// Where a stroke is pinned: normal page content, or a fixed element near the top/bottom of the viewport.
type Anchor = 'top' | 'bottom' | null

// The screenshot covers only the visible viewport, so a stroke on a fixed/sticky element is already
// in screenshot coordinates (viewport coordinates), while strokes on page content are stored in page
// coordinates and shifted by the scroll offset on submit.
function detectFixedAnchor(clientX: number, clientY: number, host: Element): Anchor {
  if (window.scrollX === 0 && window.scrollY === 0) return null
  const vw = window.innerWidth, vh = window.innerHeight
  const hit = document.elementsFromPoint(clientX, clientY).find((el) => el !== host)
  for (let el: Element | null = hit ?? null; el && el !== document.documentElement; el = el.parentElement) {
    const cs = getComputedStyle(el)
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue
    const r = el.getBoundingClientRect()
    // Full-screen fixed wrappers (backgrounds, app shells) are not "a fixed element" for this purpose.
    if (r.width >= vw * 0.9 && r.height >= vh * 0.9) continue
    if (cs.position === 'sticky') {
      // Only a sticky element that is currently stuck near the top behaves like a fixed header.
      if (r.top < vh * 0.25) return 'top'
      continue
    }
    // Computed top/bottom are resolved to pixels, so decide by which viewport edge the element sits closer to.
    return vh - r.bottom < r.top ? 'bottom' : 'top'
  }
  return null
}

function translateShape(shape: AnnotationShape, dx: number, dy: number): AnnotationShape {
  if (!dx && !dy) return shape
  switch (shape.type) {
    case 'pen': return { ...shape, points: shape.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
    case 'rect': return { ...shape, x: shape.x + dx, y: shape.y + dy }
    case 'circle': return { ...shape, cx: shape.cx + dx, cy: shape.cy + dy }
    case 'arrow': return { ...shape, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy }
  }
}

export function showAnnotationOverlay(shadow: ShadowRoot): Promise<AnnotationResult | null> {
  return new Promise((resolve) => {
    let currentTool: DrawingTool = 'pen'
    const shapes: AnnotationShape[] = []
    let drawing = false
    let startX = 0
    let startY = 0
    let currentStroke: Point[] = []
    let previewEl: SVGElement | null = null
    let commentPopup: HTMLElement | null = null
    let frozen = false
    let suppressClicksUntil = 0
    const anchors: Anchor[] = []
    let currentAnchor: Anchor = null
    // Offset from viewport to stroke coordinates: fixed-element strokes are kept in viewport coordinates.
    const scrollOffset = () => (currentAnchor ? { x: 0, y: 0 } : { x: window.scrollX, y: window.scrollY })

    // Overlay — captures pointer events for drawing
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483645;cursor:crosshair;background:rgba(99,102,241,0.04);touch-action:none;user-select:none;-webkit-user-select:none;'

    // SVG lives inside the overlay so shapes stay visible as long as overlay is alive
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;'
    // Use same marker ID as renderer.ts expects: "ufp-arrowhead"
    svg.innerHTML = `
      <defs>
        <marker id="ufp-arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="${ANNOTATION_COLOR}" />
        </marker>
      </defs>
    `
    overlay.appendChild(svg)

    // Shapes are stored in page coordinates, but the overlay is position:fixed. Every shape lives
    // in this layer, which is shifted by the scroll offset so strokes appear under the cursor
    // wherever the page is scrolled (and stay anchored to the page if the user scrolls mid-draw).
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    svg.appendChild(layer)
    // Strokes on fixed elements live here, not shifted by scroll
    const fixedLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    svg.appendChild(fixedLayer)
    const syncLayer = () => layer.setAttribute('transform', `translate(${-window.scrollX} ${-window.scrollY})`)
    syncLayer()
    window.addEventListener('scroll', syncLayer, { passive: true })

    function cleanup() {
      window.removeEventListener('scroll', syncLayer)
      for (const t of POINTER_EVENTS) window.removeEventListener(t, onWindowEvent, true)
      for (const t of BLOCKED_EVENTS) window.removeEventListener(t, onBlockedEvent, true)
      overlay.remove()
      toolbar.remove()
      commentPopup?.remove()
    }

    function redraw() {
      layer.innerHTML = ''
      fixedLayer.innerHTML = ''
      shapes.forEach((s, i) => (anchors[i] ? fixedLayer : layer).appendChild(renderShapeToSVG(s)))
    }

    function getAnchor() {
      let sumX = 0, sumY = 0, count = 0
      // Sum in viewport coordinates: fixed-element strokes are already there, others are page coordinates.
      shapes.forEach((s, i) => {
        const ox = anchors[i] ? 0 : window.scrollX, oy = anchors[i] ? 0 : window.scrollY
        if (s.type === 'pen' && s.points.length) {
          const p = s.points[s.points.length - 1]; sumX += p.x - ox; sumY += p.y - oy; count++
        } else if (s.type === 'rect') { sumX += s.x + s.width - ox; sumY += s.y + s.height - oy; count++ }
        else if (s.type === 'circle') { sumX += s.cx - ox; sumY += s.cy - oy; count++ }
        else if (s.type === 'arrow') { sumX += s.x2 - ox; sumY += s.y2 - oy; count++ }
      })
      return {
        anchorX: count > 0 ? sumX / count : window.innerWidth / 2,
        anchorY: count > 0 ? sumY / count : window.innerHeight / 2,
      }
    }

    // After a shape is committed: freeze drawing, auto-show comment popup
    function onShapeCommitted() {
      frozen = true
      drawing = false
      overlay.style.pointerEvents = 'none'
      toolbar.style.pointerEvents = 'none'
      showCommentPopup()
    }

    function showCommentPopup() {
      if (commentPopup) commentPopup.remove()

      const { anchorX, anchorY } = getAnchor()
      const W = 300, MARGIN = 12
      let left = anchorX + MARGIN
      let top = anchorY + MARGIN
      if (left + W > window.innerWidth - MARGIN) left = anchorX - W - MARGIN
      if (left < MARGIN) left = MARGIN
      if (top + 210 > window.innerHeight - MARGIN) top = window.innerHeight - 210 - MARGIN
      if (top < MARGIN) top = MARGIN

      commentPopup = document.createElement('div')
      commentPopup.style.cssText = `
        position:fixed;left:${left}px;top:${top}px;z-index:2147483647;
        background:#fff;border-radius:12px;padding:16px;width:${W}px;
        box-shadow:0 4px 24px rgba(0,0,0,0.18);
        display:flex;flex-direction:column;gap:10px;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
      `
      commentPopup.innerHTML = `
        <div style="font-size:13px;font-weight:600;color:#374151;">Add your comment</div>
        <textarea id="ufp-inline-text" placeholder="Describe your feedback…" rows="3"
          style="width:100%;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:8px;
                 font-size:13px;font-family:inherit;color:#111827;resize:none;
                 min-height:72px;outline:none;box-sizing:border-box;"></textarea>
        <div style="display:flex;gap:6px;justify-content:flex-end;align-items:center;">
          <button id="ufp-popup-cancel"
            style="padding:7px 12px;border-radius:8px;font-size:13px;font-weight:500;
                   font-family:inherit;cursor:pointer;background:transparent;
                   border:1.5px solid #e5e7eb;color:#6b7280;">Cancel</button>
          <button id="ufp-popup-submit" disabled
            style="padding:7px 14px;border-radius:8px;font-size:13px;font-weight:600;
                   font-family:inherit;cursor:pointer;background:#6366f1;border:none;
                   color:#fff;opacity:0.45;transition:opacity 0.15s;">Submit</button>
        </div>
      `
      shadow.appendChild(commentPopup)

      const textarea = commentPopup.querySelector('#ufp-inline-text') as HTMLTextAreaElement
      const submitBtn = commentPopup.querySelector('#ufp-popup-submit') as HTMLButtonElement
      const cancelBtn = commentPopup.querySelector('#ufp-popup-cancel') as HTMLButtonElement

      textarea.addEventListener('input', () => {
        const ok = textarea.value.trim().length > 0
        submitBtn.disabled = !ok
        submitBtn.style.opacity = ok ? '1' : '0.45'
      })

      submitBtn.addEventListener('click', () => {
        const text = textarea.value.trim()
        if (!text) return
        const anchor = getAnchor()
        cleanup()
        // The screenshot is the visible viewport: convert page-coordinate strokes to viewport coordinates
        // (fixed-element strokes already are).
        const viewportShapes = shapes.map((sh, i) =>
          anchors[i] ? sh : translateShape(sh, -window.scrollX, -window.scrollY))
        resolve({ shapes: viewportShapes, text, ...anchor })
      })

      cancelBtn.addEventListener('click', () => {
        cleanup()
        resolve(null)
      })

      requestAnimationFrame(() => textarea.focus())
    }

    const toolbar = createToolbar(
      shadow,
      (tool) => { currentTool = tool },
      () => { cleanup(); resolve(null) },
      () => {
        if (shapes.length === 0) return
        if (commentPopup) {
          commentPopup.remove()
          commentPopup = null
          overlay.style.pointerEvents = 'auto'
          toolbar.style.pointerEvents = 'auto'
          frozen = false
        }
        shapes.pop()
        anchors.pop()
        redraw()
      }
    )

    shadow.appendChild(overlay)

    // ── Drawing event listeners ────────────────────────────────────────────

    // Drawing is driven by capture-phase listeners on window rather than by the overlay's own
    // hit-testing. Host pages can have elements that sit above the overlay (top-layer dialogs,
    // animated cards, elements with their own pointer handling); capturing on window gets the
    // event first no matter what is under the cursor, and we stop it reaching the page.
    const POINTER_EVENTS = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const
    const BLOCKED_EVENTS = ['mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'touchstart', 'touchmove', 'contextmenu', 'dragstart', 'selectstart'] as const

    // True when the event belongs to the plugin's own UI (toolbar, comment popup, trigger, panel).
    function isOwnUi(e: Event): boolean {
      const path = e.composedPath()
      return path.includes(shadow.host) && !path.includes(overlay)
    }

    function onBlockedEvent(e: Event) {
      if (isOwnUi(e)) return
      // The click that follows a finished gesture would otherwise activate whatever is under the cursor.
      if (frozen && performance.now() > suppressClicksUntil) return
      e.preventDefault()
      e.stopPropagation()
    }

    function onWindowEvent(e: Event) {
      if (frozen || isOwnUi(e)) return
      e.stopPropagation()
      const pe = e as PointerEvent
      if (e.type === 'pointerdown') onPointerDown(pe)
      else if (e.type === 'pointermove') onPointerMove(pe)
      else if (e.type === 'pointerup') onPointerUp(pe)
      else if (e.type === 'pointercancel') { drawing = false; if (previewEl) { previewEl.remove(); previewEl = null } }
    }

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return
      e.preventDefault()
      // Capture to the overlay (not e.target, which is the shadow host when seen from window)
      try { overlay.setPointerCapture(e.pointerId) } catch { /* ignore */ }
      drawing = true
      currentAnchor = detectFixedAnchor(e.clientX, e.clientY, shadow.host)
      startX = e.clientX + scrollOffset().x
      startY = e.clientY + scrollOffset().y
      if (currentTool === 'pen') currentStroke = [{ x: startX, y: startY }]
    }

    function onPointerMove(e: PointerEvent) {
      if (!drawing) return
      const cx = e.clientX + scrollOffset().x
      const cy = e.clientY + scrollOffset().y
      if (previewEl) previewEl.remove()

      if (currentTool === 'pen') {
        currentStroke.push({ x: cx, y: cy })
        previewEl = renderShapeToSVG({ type: 'pen', points: [...currentStroke], color: ANNOTATION_COLOR, width: STROKE_WIDTH })
      } else if (currentTool === 'rect') {
        const r: SVGRect = { type: 'rect', x: Math.min(startX, cx), y: Math.min(startY, cy), width: Math.abs(cx - startX), height: Math.abs(cy - startY), color: ANNOTATION_COLOR, strokeWidth: STROKE_WIDTH }
        previewEl = renderShapeToSVG(r)
      } else if (currentTool === 'circle') {
        const rx = Math.abs(cx - startX) / 2, ry = Math.abs(cy - startY) / 2
        const c: SVGCircle = { type: 'circle', cx: Math.min(startX, cx) + rx, cy: Math.min(startY, cy) + ry, rx, ry, color: ANNOTATION_COLOR, strokeWidth: STROKE_WIDTH }
        previewEl = renderShapeToSVG(c)
      } else if (currentTool === 'arrow') {
        const a: SVGArrow = { type: 'arrow', x1: startX, y1: startY, x2: cx, y2: cy, color: ANNOTATION_COLOR, width: STROKE_WIDTH }
        previewEl = renderShapeToSVG(a)
      }

      if (previewEl) (currentAnchor ? fixedLayer : layer).appendChild(previewEl)
    }

    function onPointerUp(e: PointerEvent) {
      if (!drawing) return
      suppressClicksUntil = performance.now() + 400
      drawing = false
      if (previewEl) { previewEl.remove(); previewEl = null }

      const cx = e.clientX + scrollOffset().x
      const cy = e.clientY + scrollOffset().y
      let committed = false

      if (currentTool === 'pen' && currentStroke.length > 1) {
        shapes.push({ type: 'pen', points: [...currentStroke], color: ANNOTATION_COLOR, width: STROKE_WIDTH })
        currentStroke = []
        committed = true
      } else if (currentTool === 'rect') {
        const w = Math.abs(cx - startX), h = Math.abs(cy - startY)
        if (w > 4 && h > 4) {
          shapes.push({ type: 'rect', x: Math.min(startX, cx), y: Math.min(startY, cy), width: w, height: h, color: ANNOTATION_COLOR, strokeWidth: STROKE_WIDTH })
          committed = true
        }
      } else if (currentTool === 'circle') {
        const rx = Math.abs(cx - startX) / 2, ry = Math.abs(cy - startY) / 2
        if (rx > 4 && ry > 4) {
          shapes.push({ type: 'circle', cx: Math.min(startX, cx) + rx, cy: Math.min(startY, cy) + ry, rx, ry, color: ANNOTATION_COLOR, strokeWidth: STROKE_WIDTH })
          committed = true
        }
      } else if (currentTool === 'arrow') {
        const dist = Math.sqrt((cx - startX) ** 2 + (cy - startY) ** 2)
        if (dist > 10) {
          shapes.push({ type: 'arrow', x1: startX, y1: startY, x2: cx, y2: cy, color: ANNOTATION_COLOR, width: STROKE_WIDTH })
          committed = true
        }
      }

      if (committed) {
        anchors.push(currentAnchor)
        redraw()
        onShapeCommitted()
      }
    }

    for (const t of POINTER_EVENTS) window.addEventListener(t, onWindowEvent, { capture: true, passive: false })
    for (const t of BLOCKED_EVENTS) window.addEventListener(t, onBlockedEvent, { capture: true, passive: false })
  })
}

function createToolbar(
  shadow: ShadowRoot,
  onToolChange: (t: DrawingTool) => void,
  onCancel: () => void,
  onUndo: () => void
): HTMLElement {
  const toolbar = document.createElement('div')
  toolbar.className = 'ufp-toolbar'
  toolbar.innerHTML = `
    <span class="ufp-toolbar-label">Draw to annotate</span>
    <div class="ufp-toolbar-sep"></div>
    <button class="ufp-btn-icon active" data-tool="pen" title="Pen">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
    </button>
    <button class="ufp-btn-icon" data-tool="rect" title="Rectangle">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
    </button>
    <button class="ufp-btn-icon" data-tool="circle" title="Circle">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
    </button>
    <button class="ufp-btn-icon" data-tool="arrow" title="Arrow">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
      </svg>
    </button>
    <div class="ufp-toolbar-sep"></div>
    <button class="ufp-btn-icon" id="ufp-undo-btn" title="Undo last stroke">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
      </svg>
    </button>
    <div class="ufp-toolbar-sep"></div>
    <button class="ufp-btn ufp-btn-ghost" id="ufp-cancel-btn">Cancel</button>
  `

  toolbar.querySelectorAll('[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      toolbar.querySelectorAll('[data-tool]').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      onToolChange((btn as HTMLElement).dataset.tool as DrawingTool)
    })
  })

  toolbar.querySelector('#ufp-undo-btn')!.addEventListener('click', onUndo)
  toolbar.querySelector('#ufp-cancel-btn')!.addEventListener('click', onCancel)

  shadow.appendChild(toolbar)
  return toolbar
}
