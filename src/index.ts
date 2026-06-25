import type {
  PluginConfig,
  DatabaseAdapter,
  ScreenshotAdapter,
  FeedbackComment,
  AnnotationData,
} from './core/types'
import { getState, setState, getUserName, normalizeUrl } from './core/state'
import { getStyles } from './ui/styles'
import { createFloatingTrigger } from './ui/FloatingTrigger'
import { showNameModal } from './ui/NameModal'
import { showAnnotationOverlay } from './ui/AnnotationOverlay'
import { createCommentsPanel } from './ui/CommentsPanel'
import { capturePageScreenshot } from './screenshot/capture'

const TAG = 'ui-feedback-plugin'

async function createAdapters(config: PluginConfig): Promise<{
  db: DatabaseAdapter
  screenshot: ScreenshotAdapter
}> {
  const { backend } = config

  if (backend.provider === 'firebase') {
    const { FirebaseAdapter } = await import('./adapters/firebase')
    const adapter = new FirebaseAdapter(backend)
    return { db: adapter, screenshot: adapter }
  }

  if (backend.provider === 'supabase') {
    const { SupabaseAdapter } = await import('./adapters/supabase')
    const adapter = new SupabaseAdapter(backend.url, backend.anonKey)
    return { db: adapter, screenshot: adapter }
  }

  if (backend.provider === 'aws') {
    const { AWSAdapter } = await import('./adapters/aws')
    const adapter = new AWSAdapter(backend)
    return { db: adapter, screenshot: adapter }
  }

  throw new Error('[ui-feedback-plugin] Unknown backend provider')
}

export function initFeedbackPlugin(config: PluginConfig): () => void {
  if (customElements.get(TAG)) {
    console.warn('[ui-feedback-plugin] Already initialized.')
    return () => {}
  }

  const primaryColor = config.theme?.primaryColor ?? '#6366f1'
  const projectKey   = config.projectKey ?? 'default'
  const position     = config.position ?? 'bottom-right'

  setState({ config })

  class FeedbackPlugin extends HTMLElement {
    private shadow!: ShadowRoot
    private db!: DatabaseAdapter
    private screenshot!: ScreenshotAdapter
    private unsubscribe: (() => void) | null = null

    constructor() {
      super()
      this.shadow = this.attachShadow({ mode: 'open' })
    }

    async connectedCallback() {
      const style = document.createElement('style')
      style.textContent = getStyles(primaryColor)
      this.shadow.appendChild(style)

      try {
        const adapters = await createAdapters(config)
        this.db = adapters.db
        this.screenshot = adapters.screenshot
      } catch (err) {
        console.error('[ui-feedback-plugin] Failed to initialise backend:', err)
        return
      }

      this.mount()
    }

    disconnectedCallback() {
      this.unsubscribe?.()
    }

    private mount() {
      const pageUrl = normalizeUrl(window.location.href)

      createCommentsPanel(this.shadow, this.db, () => this.startAnnotation())

      createFloatingTrigger(
        this.shadow,
        position,
        () => this.startAnnotation(),
        () => setState({ panelOpen: !getState().panelOpen })
      )

      this.unsubscribe = this.db.subscribeToComments(pageUrl, projectKey, (comments) => {
        setState({ comments })
      })
    }

    private async startAnnotation() {
      let userName = getUserName()
      if (!userName) {
        userName = await showNameModal(this.shadow)
        if (!userName) return
      }

      setState({ active: true, panelOpen: false })

      const result = await showAnnotationOverlay(this.shadow)

      if (!result) {
        setState({ active: false })
        return
      }

      setState({ active: false })

      this.showToast('Saving comment…', 'info')
      try {
        await this.saveComment(userName, result.text, result.shapes)
        this.showToast('Comment saved!', 'success')
      } catch (err) {
        console.error('[ui-feedback-plugin] Failed to save comment:', err)
        this.showToast('Failed to save — check the browser console for details.', 'error')
        return
      }

      setState({ panelOpen: true })
    }

    private async saveComment(
      authorName: string,
      text: string,
      shapes: AnnotationData['shapes']
    ) {
      const pageUrl = normalizeUrl(window.location.href)
      const annotation: AnnotationData = {
        shapes,
        pageWidth:  document.documentElement.scrollWidth,
        pageHeight: document.documentElement.scrollHeight,
      }

      this.style.visibility = 'hidden'
      let screenshotDataUrl: string
      try {
        screenshotDataUrl = await capturePageScreenshot()
      } finally {
        this.style.visibility = ''
      }

      const placeholder: Omit<FeedbackComment, 'id'> = {
        pageUrl,
        projectKey,
        authorName,
        text,
        screenshotUrl: '',
        annotation,
        resolved: false,
        createdAt: Date.now(),
      }

      const commentId = await this.db.addComment(placeholder)
      const screenshotUrl = await this.screenshot.uploadScreenshot(commentId, screenshotDataUrl)
      await this.db.updateComment(commentId, { screenshotUrl })
    }

    private showToast(message: string, type: 'info' | 'success' | 'error') {
      const existing = this.shadow.querySelector('.ufp-toast')
      existing?.remove()

      const colors = { info: '#6366f1', success: '#10b981', error: '#ef4444' }

      const toast = document.createElement('div')
      toast.className = 'ufp-toast'
      toast.style.cssText = `
        position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
        background:${colors[type]};color:white;padding:10px 20px;border-radius:8px;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
        font-size:13px;font-weight:500;z-index:2147483647;
        box-shadow:0 4px 12px rgba(0,0,0,0.2);pointer-events:none;
        max-width:360px;text-align:center;
      `
      toast.textContent = message
      this.shadow.appendChild(toast)
      setTimeout(() => toast.remove(), type === 'error' ? 6000 : 2500)
    }
  }

  customElements.define(TAG, FeedbackPlugin)

  const el = document.createElement(TAG)
  document.body.appendChild(el)

  return () => el.remove()
}

export type { PluginConfig }
