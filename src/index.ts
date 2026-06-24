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

async function createDatabaseAdapter(config: PluginConfig): Promise<DatabaseAdapter> {
  const db = config.database
  if (db.provider === 'firebase') {
    const { FirebaseAdapter } = await import('./adapters/firebase')
    return new FirebaseAdapter(db)
  }
  if (db.provider === 'supabase') {
    const { SupabaseAdapter } = await import('./adapters/supabase')
    return new SupabaseAdapter(db.url, db.anonKey)
  }
  throw new Error('[ui-feedback-plugin] Unknown database provider')
}

async function createScreenshotAdapter(
  config: PluginConfig,
  dbAdapter: DatabaseAdapter
): Promise<ScreenshotAdapter> {
  const sc = config.screenshots

  // No screenshots config — reuse db adapter (Firebase + Supabase both support screenshots)
  if (!sc) {
    return dbAdapter as unknown as ScreenshotAdapter
  }

  if (sc.provider === 's3') {
    const { S3ScreenshotAdapter } = await import('./adapters/s3')
    return new S3ScreenshotAdapter(sc.uploadEndpoint, sc.headers)
  }

  // 'firebase' / 'supabase' — reuse same provider as database
  if (sc.provider === 'firebase') {
    if (config.database.provider !== 'firebase') {
      throw new Error('[ui-feedback-plugin] screenshots.provider "firebase" requires database.provider "firebase"')
    }
    return dbAdapter as unknown as ScreenshotAdapter
  }

  if (sc.provider === 'supabase') {
    if (config.database.provider !== 'supabase') {
      throw new Error('[ui-feedback-plugin] screenshots.provider "supabase" requires database.provider "supabase"')
    }
    return dbAdapter as unknown as ScreenshotAdapter
  }

  throw new Error('[ui-feedback-plugin] Unknown screenshot storage provider')
}

export function initFeedbackPlugin(config: PluginConfig): () => void {
  if (customElements.get(TAG)) {
    console.warn('[ui-feedback-plugin] Already initialized.')
    return () => {}
  }

  const primaryColor  = config.theme?.primaryColor ?? '#6366f1'
  const projectKey    = config.projectKey ?? 'default'
  const position      = config.position ?? 'bottom-right'

  setState({ config })

  class FeedbackPlugin extends HTMLElement {
    private shadow!: ShadowRoot
    private dbAdapter!: DatabaseAdapter
    private screenshotAdapter!: ScreenshotAdapter
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
        this.dbAdapter = await createDatabaseAdapter(config)
        this.screenshotAdapter = await createScreenshotAdapter(config, this.dbAdapter)
      } catch (err) {
        console.error('[ui-feedback-plugin] Failed to initialize adapters:', err)
        return
      }

      this.mount()
    }

    disconnectedCallback() {
      this.unsubscribe?.()
    }

    private mount() {
      const pageUrl = normalizeUrl(window.location.href)

      createCommentsPanel(this.shadow, this.dbAdapter, () => this.startAnnotation())

      createFloatingTrigger(
        this.shadow,
        position,
        () => this.startAnnotation(),
        () => setState({ panelOpen: !getState().panelOpen })
      )

      this.unsubscribe = this.dbAdapter.subscribeToComments(pageUrl, projectKey, (comments) => {
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

      const commentId = await this.dbAdapter.addComment(placeholder)
      const screenshotUrl = await this.screenshotAdapter.uploadScreenshot(commentId, screenshotDataUrl)
      await this.dbAdapter.updateComment(commentId, { screenshotUrl })
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
