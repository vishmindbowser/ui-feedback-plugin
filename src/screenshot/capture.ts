import type { AnnotationData } from '../core/types'

export async function capturePageScreenshot(): Promise<string> {
  try {
    const html2canvas = await loadHtml2Canvas()
    return await captureWithHtml2Canvas(html2canvas)
  } catch (err) {
    console.error('[ui-feedback-plugin] capturePageScreenshot failed:', err)
    return captureViewportFallback()
  }
}

async function loadHtml2Canvas(): Promise<typeof import('html2canvas-pro').default> {
  const mod = await import('html2canvas-pro')
  return mod.default
}

async function captureWithHtml2Canvas(
  html2canvas: typeof import('html2canvas-pro').default
): Promise<string> {
  // Capture only what is currently visible: the viewport at the current scroll position.
  const width = document.documentElement.clientWidth
  const height = window.innerHeight

  const canvas = await html2canvas(document.body, {
    allowTaint: false,
    useCORS: true,
    logging: false,
    scale: Math.min(window.devicePixelRatio, 2),
    x: window.scrollX,
    y: window.scrollY,
    width,
    height,
    windowWidth: width,
    windowHeight: height,
    ignoreElements: (el) => {
      // Skip the feedback widget itself
      return (el as HTMLElement).tagName === 'UI-FEEDBACK-PLUGIN'
    },
  })
  return canvas.toDataURL('image/png')
}

function captureViewportFallback(): string {
  // Fallback: return a placeholder data URL indicating screenshot unavailable
  const canvas = document.createElement('canvas')
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#f3f4f6'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#9ca3af'
  ctx.font = '16px -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Screenshot unavailable', canvas.width / 2, canvas.height / 2)
  return canvas.toDataURL('image/png')
}

/**
 * Draws the annotation shapes onto the screenshot so the stored PNG is self-contained.
 * Shape coordinates are in the screenshot's CSS-pixel space (pageWidth x pageHeight); the image is scaled by (image width / pageWidth).
 */
export async function drawAnnotationsOnScreenshot(
  dataUrl: string,
  annotation: AnnotationData
): Promise<string> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('screenshot failed to load'))
      el.src = dataUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)

    const sx = canvas.width / annotation.pageWidth
    const sy = canvas.height / annotation.pageHeight
    const sw = Math.min(sx, sy)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const shape of annotation.shapes) {
      ctx.strokeStyle = shape.color
      ctx.fillStyle = shape.color
      ctx.beginPath()
      switch (shape.type) {
        case 'pen': {
          ctx.lineWidth = shape.width * sw
          shape.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * sx, p.y * sy) : ctx.lineTo(p.x * sx, p.y * sy)))
          ctx.stroke()
          break
        }
        case 'rect': {
          ctx.lineWidth = shape.strokeWidth * sw
          ctx.roundRect(shape.x * sx, shape.y * sy, shape.width * sx, shape.height * sy, 3 * sw)
          ctx.stroke()
          break
        }
        case 'circle': {
          ctx.lineWidth = shape.strokeWidth * sw
          ctx.ellipse(shape.cx * sx, shape.cy * sy, shape.rx * sx, shape.ry * sy, 0, 0, Math.PI * 2)
          ctx.stroke()
          break
        }
        case 'arrow': {
          const w = shape.width * sw
          const x1 = shape.x1 * sx, y1 = shape.y1 * sy, x2 = shape.x2 * sx, y2 = shape.y2 * sy
          ctx.lineWidth = w
          ctx.lineCap = 'butt'
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.stroke()
          ctx.lineCap = 'round'
          // Same arrowhead geometry as the SVG marker (10x7 in stroke-width units, tip 1 unit past the end)
          const len = Math.hypot(x2 - x1, y2 - y1) || 1
          const dx = (x2 - x1) / len, dy = (y2 - y1) / len
          const tipX = x2 + dx * w, tipY = y2 + dy * w
          const bx = tipX - dx * 10 * w, by = tipY - dy * 10 * w
          ctx.beginPath()
          ctx.moveTo(tipX, tipY)
          ctx.lineTo(bx - dy * 3.5 * w, by + dx * 3.5 * w)
          ctx.lineTo(bx + dy * 3.5 * w, by - dx * 3.5 * w)
          ctx.closePath()
          ctx.fill()
          break
        }
      }
    }
    return canvas.toDataURL('image/png')
  } catch (err) {
    console.error('[ui-feedback-plugin] drawAnnotationsOnScreenshot failed:', err)
    return dataUrl
  }
}
