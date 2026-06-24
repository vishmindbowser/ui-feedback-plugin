export async function capturePageScreenshot(): Promise<string> {
  try {
    const html2canvas = await loadHtml2Canvas()
    return await captureWithHtml2Canvas(html2canvas)
  } catch {
    return captureViewportFallback()
  }
}

async function loadHtml2Canvas(): Promise<typeof import('html2canvas').default> {
  const mod = await import('html2canvas')
  return mod.default
}

async function captureWithHtml2Canvas(
  html2canvas: typeof import('html2canvas').default
): Promise<string> {
  const scrollX = window.scrollX
  const scrollY = window.scrollY

  // Scroll to top so full page renders from the start
  window.scrollTo(0, 0)

  try {
    const canvas = await html2canvas(document.body, {
      allowTaint: true,
      useCORS: true,
      logging: false,
      scale: Math.min(window.devicePixelRatio, 2),
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      windowWidth: document.documentElement.scrollWidth,
      windowHeight: document.documentElement.scrollHeight,
      x: 0,
      y: 0,
      ignoreElements: (el) => {
        // Skip the feedback widget itself
        return (el as HTMLElement).tagName === 'UI-FEEDBACK-PLUGIN'
      },
    })
    return canvas.toDataURL('image/png')
  } finally {
    window.scrollTo(scrollX, scrollY)
  }
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
