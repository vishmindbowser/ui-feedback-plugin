import type { FeedbackComment, Reply, DatabaseAdapter } from '../core/types'
import { setState } from '../core/state'
import { renderAnnotationToSVG } from '../drawing/renderer'
import { createReplyThread } from './ReplyThread'
import { formatRelativeTime, getInitials, escHtml } from './utils'

export function showCommentDetail(
  shadow: ShadowRoot,
  comment: FeedbackComment,
  replies: Reply[],
  adapter: DatabaseAdapter,
  onResolve: (id: string) => void,
  onReopen: (id: string) => void,
  onDelete: (id: string) => void,
  onReplyAdded?: (reply: Reply) => void
): void {
  const detail = document.createElement('div')
  detail.className = 'ufp-detail'

  detail.innerHTML = `
    <div class="ufp-detail-image-area">
      <div class="ufp-detail-image-wrap">
        <img class="ufp-detail-screenshot" src="${comment.screenshotUrl}" alt="Page screenshot" />
        <svg class="ufp-detail-annotation-svg" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <marker id="ufp-detail-arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" />
            </marker>
          </defs>
        </svg>
      </div>
    </div>
    <div class="ufp-detail-sidebar">
      <div class="ufp-detail-header">
        <button id="ufp-detail-back" style="
          display:flex;align-items:center;gap:6px;
          background:none;border:none;cursor:pointer;
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
          font-size:13px;font-weight:600;color:#6b7280;padding:4px 0;
        ">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back to comments
        </button>
        ${comment.resolved ? '<span class="ufp-resolved-badge">Resolved</span>' : ''}
      </div>
      <div class="ufp-detail-body">
        <div class="ufp-detail-comment">
          <div class="ufp-comment-meta">
            <div class="ufp-avatar">${getInitials(comment.authorName)}</div>
            <div>
              <div class="ufp-comment-author">${escHtml(comment.authorName)}</div>
              <div class="ufp-comment-time">${formatRelativeTime(comment.createdAt)}</div>
            </div>
          </div>
          <div class="ufp-detail-comment-text">${escHtml(comment.text)}</div>
          <div class="ufp-detail-actions" id="ufp-detail-actions"></div>
        </div>
        <div id="ufp-detail-replies"></div>
      </div>
    </div>
  `

  shadow.appendChild(detail)

  detail.querySelector('#ufp-detail-back')!.addEventListener('click', () => {
    detail.remove()
    setState({ panelOpen: true })
  })

  // Action buttons
  const actionsEl = detail.querySelector('#ufp-detail-actions') as HTMLElement

  if (!comment.resolved) {
    const resolveBtn = document.createElement('button')
    resolveBtn.className = 'ufp-btn ufp-btn-primary'
    resolveBtn.style.fontSize = '13px'
    resolveBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
        style="vertical-align:middle;margin-right:4px"><polyline points="20 6 9 17 4 12"/></svg>
      Mark Resolved
    `
    resolveBtn.addEventListener('click', async () => {
      resolveBtn.disabled = true
      resolveBtn.textContent = 'Resolving…'
      await adapter.updateComment(comment.id, { resolved: true })
      onResolve(comment.id)
      detail.remove()
      setState({ panelOpen: true })
    })
    actionsEl.appendChild(resolveBtn)
  } else {
    const reopenBtn = document.createElement('button')
    reopenBtn.className = 'ufp-btn ufp-btn-ghost'
    reopenBtn.style.fontSize = '13px'
    reopenBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
        style="vertical-align:middle;margin-right:4px"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
      Reopen
    `
    reopenBtn.addEventListener('click', async () => {
      reopenBtn.disabled = true
      reopenBtn.textContent = 'Reopening…'
      await adapter.updateComment(comment.id, { resolved: false })
      onReopen(comment.id)
      detail.remove()
      setState({ panelOpen: true })
    })
    actionsEl.appendChild(reopenBtn)
  }

  const deleteBtn = document.createElement('button')
  deleteBtn.className = 'ufp-btn ufp-btn-ghost'
  deleteBtn.style.fontSize = '13px'
  deleteBtn.textContent = 'Delete'
  deleteBtn.addEventListener('click', async () => {
    if (!confirm('Delete this comment and all its replies?')) return
    deleteBtn.disabled = true
    await adapter.deleteComment(comment.id)
    onDelete(comment.id)
    detail.remove()
    setState({ panelOpen: true })
  })
  actionsEl.appendChild(deleteBtn)

  // Reply thread
  const repliesContainer = detail.querySelector('#ufp-detail-replies') as HTMLElement
  const replyThread = createReplyThread(comment.id, replies, adapter, (newReply) => {
    // Update the thread UI in place
    ;(replyThread as any).addReply?.(newReply)
    // Notify the panel so it can update the badge count
    onReplyAdded?.(newReply)
  })
  repliesContainer.appendChild(replyThread)

  // Render annotation over screenshot after image loads
  const img = detail.querySelector('.ufp-detail-screenshot') as HTMLImageElement
  const annotationSvg = detail.querySelector('.ufp-detail-annotation-svg') as SVGSVGElement

  const renderAnnotation = () => {
    const w = img.clientWidth
    const h = img.clientHeight
    annotationSvg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    renderAnnotationToSVG(annotationSvg, comment.annotation, w, h)
    annotationSvg.querySelectorAll('[marker-end]').forEach((el) => {
      el.setAttribute('marker-end', 'url(#ufp-detail-arrowhead)')
    })
  }

  if (img.complete && img.naturalWidth > 0) {
    renderAnnotation()
  } else {
    img.addEventListener('load', renderAnnotation)
  }
}
