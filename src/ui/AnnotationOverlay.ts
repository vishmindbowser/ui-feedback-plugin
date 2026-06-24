import type { DrawingTool, AnnotationShape, SVGRect, SVGCircle, SVGArrow, Point } from '../core/types'
import { renderShapeToSVG, ANNOTATION_COLOR, STROKE_WIDTH } from '../drawing/renderer'

export interface AnnotationResult {
  shapes: AnnotationShape[]
  text: string
  anchorX: number
  anchorY: number
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

    // Overlay — captures pointer events for drawing
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483645;cursor:crosshair;background:rgba(99,102,241,0.04);'

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

    function cleanup() {
      overlay.remove()
      toolbar.remove()
      commentPopup?.remove()
    }

    function redraw() {
      const defs = svg.querySelector('defs')!
      svg.innerHTML = ''
      svg.appendChild(defs)
      shapes.forEach((s) => svg.appendChild(renderShapeToSVG(s)))
    }

    function getAnchor() {
      let sumX = 0, sumY = 0, count = 0
      shapes.forEach((s) => {
        if (s.type === 'pen' && s.points.length) {
          const p = s.points[s.points.length - 1]; sumX += p.x; sumY += p.y; count++
        } else if (s.type === 'rect') { sumX += s.x + s.width; sumY += s.y + s.height; count++ }
        else if (s.type === 'circle') { sumX += s.cx; sumY += s.cy; count++ }
        else if (s.type === 'arrow') { sumX += s.x2; sumY += s.y2; count++ }
      })
      return {
        anchorX: count > 0 ? sumX / count - window.scrollX : window.innerWidth / 2,
        anchorY: count > 0 ? sumY / count - window.scrollY : window.innerHeight / 2,
      }
    }

    // After a shape is committed: freeze drawing, auto-show comment popup
    function onShapeCommitted() {
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
        resolve({ shapes: [...shapes], text, ...anchor })
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
        }
        shapes.pop()
        redraw()
      }
    )

    shadow.appendChild(overlay)

    // ── Drawing event listeners ────────────────────────────────────────────

    overlay.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) return
      overlay.setPointerCapture(e.pointerId)
      drawing = true
      startX = e.clientX + window.scrollX
      startY = e.clientY + window.scrollY
      if (currentTool === 'pen') currentStroke = [{ x: startX, y: startY }]
    })

    overlay.addEventListener('pointermove', (e: PointerEvent) => {
      if (!drawing) return
      const cx = e.clientX + window.scrollX
      const cy = e.clientY + window.scrollY
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

      if (previewEl) svg.appendChild(previewEl)
    })

    overlay.addEventListener('pointerup', (e: PointerEvent) => {
      if (!drawing) return
      drawing = false
      if (previewEl) { previewEl.remove(); previewEl = null }

      const cx = e.clientX + window.scrollX
      const cy = e.clientY + window.scrollY
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
        redraw()
        onShapeCommitted()
      }
    })
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
