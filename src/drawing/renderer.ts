import type { AnnotationShape, AnnotationData, Point } from '../core/types'

const ANNOTATION_COLOR = '#6366f1'
const STROKE_WIDTH = 3

export function renderShapeToSVG(shape: AnnotationShape, scaleX = 1, scaleY = 1): SVGElement {
  switch (shape.type) {
    case 'pen': {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', pointsToPath(shape.points, scaleX, scaleY))
      path.setAttribute('stroke', shape.color)
      path.setAttribute('stroke-width', String(shape.width * Math.min(scaleX, scaleY)))
      path.setAttribute('fill', 'none')
      path.setAttribute('stroke-linecap', 'round')
      path.setAttribute('stroke-linejoin', 'round')
      return path
    }
    case 'rect': {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      rect.setAttribute('x', String(shape.x * scaleX))
      rect.setAttribute('y', String(shape.y * scaleY))
      rect.setAttribute('width', String(shape.width * scaleX))
      rect.setAttribute('height', String(shape.height * scaleY))
      rect.setAttribute('stroke', shape.color)
      rect.setAttribute('stroke-width', String(shape.strokeWidth * Math.min(scaleX, scaleY)))
      rect.setAttribute('fill', 'none')
      rect.setAttribute('rx', '3')
      return rect
    }
    case 'circle': {
      const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse')
      ellipse.setAttribute('cx', String(shape.cx * scaleX))
      ellipse.setAttribute('cy', String(shape.cy * scaleY))
      ellipse.setAttribute('rx', String(shape.rx * scaleX))
      ellipse.setAttribute('ry', String(shape.ry * scaleY))
      ellipse.setAttribute('stroke', shape.color)
      ellipse.setAttribute('stroke-width', String(shape.strokeWidth * Math.min(scaleX, scaleY)))
      ellipse.setAttribute('fill', 'none')
      return ellipse
    }
    case 'arrow': {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      line.setAttribute('x1', String(shape.x1 * scaleX))
      line.setAttribute('y1', String(shape.y1 * scaleY))
      line.setAttribute('x2', String(shape.x2 * scaleX))
      line.setAttribute('y2', String(shape.y2 * scaleY))
      line.setAttribute('stroke', shape.color)
      line.setAttribute('stroke-width', String(shape.width * Math.min(scaleX, scaleY)))
      line.setAttribute('marker-end', 'url(#ufp-arrowhead)')
      g.appendChild(line)
      return g
    }
  }
}

export function renderAnnotationToSVG(
  svgEl: SVGSVGElement,
  annotation: AnnotationData,
  displayWidth: number,
  displayHeight: number
): void {
  const scaleX = displayWidth / annotation.pageWidth
  const scaleY = displayHeight / annotation.pageHeight

  svgEl.innerHTML = ''

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
  defs.innerHTML = `
    <marker id="ufp-arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="${ANNOTATION_COLOR}" />
    </marker>
  `
  svgEl.appendChild(defs)

  annotation.shapes.forEach((shape) => {
    svgEl.appendChild(renderShapeToSVG(shape, scaleX, scaleY))
  })
}

function pointsToPath(points: Point[], scaleX: number, scaleY: number): string {
  if (points.length === 0) return ''
  if (points.length === 1) {
    const p = points[0]
    return `M ${p.x * scaleX} ${p.y * scaleY}`
  }
  let d = `M ${points[0].x * scaleX} ${points[0].y * scaleY}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x * scaleX} ${points[i].y * scaleY}`
  }
  return d
}

export function getBoundingBox(shapes: AnnotationShape[]): {
  x: number; y: number; width: number; height: number
} {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  shapes.forEach((shape) => {
    switch (shape.type) {
      case 'pen':
        shape.points.forEach((p) => {
          minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
          maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
        })
        break
      case 'rect':
        minX = Math.min(minX, shape.x); minY = Math.min(minY, shape.y)
        maxX = Math.max(maxX, shape.x + shape.width); maxY = Math.max(maxY, shape.y + shape.height)
        break
      case 'circle':
        minX = Math.min(minX, shape.cx - shape.rx); minY = Math.min(minY, shape.cy - shape.ry)
        maxX = Math.max(maxX, shape.cx + shape.rx); maxY = Math.max(maxY, shape.cy + shape.ry)
        break
      case 'arrow':
        minX = Math.min(minX, shape.x1, shape.x2); minY = Math.min(minY, shape.y1, shape.y2)
        maxX = Math.max(maxX, shape.x1, shape.x2); maxY = Math.max(maxY, shape.y1, shape.y2)
        break
    }
  })

  const pad = 16
  return {
    x: Math.max(0, minX - pad),
    y: Math.max(0, minY - pad),
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  }
}

export { ANNOTATION_COLOR, STROKE_WIDTH }
