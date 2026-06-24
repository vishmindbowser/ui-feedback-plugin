import type { FeedbackComment, Reply, DatabaseAdapter } from '../core/types'
import { getState, setState, subscribe } from '../core/state'
import { showCommentDetail } from './CommentDetailView'
import { formatRelativeTime, getInitials, escHtml } from './utils'

export function createCommentsPanel(
  shadow: ShadowRoot,
  adapter: DatabaseAdapter,
  onNewFeedback: () => void
): HTMLElement {
  const panel = document.createElement('div')
  panel.className = 'ufp-panel'

  panel.innerHTML = `
    <div class="ufp-panel-header">
      <span class="ufp-panel-title">Feedback</span>
      <div style="display:flex;gap:8px;align-items:center;">
        <button id="ufp-new-feedback" class="ufp-btn ufp-btn-primary" style="font-size:13px;padding:7px 14px;display:flex;align-items:center;gap:5px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New
        </button>
        <button class="ufp-btn-icon" id="ufp-panel-close" title="Close panel">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="ufp-filter-tabs">
      <button class="ufp-filter-tab active" data-filter="open">Open</button>
      <button class="ufp-filter-tab" data-filter="resolved">Resolved</button>
    </div>
    <div class="ufp-panel-list" id="ufp-comment-list"></div>
  `

  shadow.appendChild(panel)

  panel.querySelector('#ufp-panel-close')!.addEventListener('click', () => {
    setState({ panelOpen: false })
  })

  panel.querySelector('#ufp-new-feedback')!.addEventListener('click', () => {
    setState({ panelOpen: false })
    onNewFeedback()
  })

  panel.querySelectorAll('.ufp-filter-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      panel.querySelectorAll('.ufp-filter-tab').forEach((t) => t.classList.remove('active'))
      tab.classList.add('active')
      setState({ filter: (tab as HTMLElement).dataset.filter as 'open' | 'resolved' })
    })
  })

  const listEl = panel.querySelector('#ufp-comment-list') as HTMLElement

  // Cache is used ONLY for the reply-count badge shown in the panel list.
  // The detail view always fetches fresh replies.
  const repliesCache = new Map<string, Reply[]>()

  const render = async (comments: FeedbackComment[], filter: 'open' | 'resolved') => {
    const filtered = comments.filter((c) => (filter === 'open' ? !c.resolved : c.resolved))
    listEl.innerHTML = ''

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="ufp-panel-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span>No ${filter} comments yet</span>
          ${filter === 'open' ? '<span style="font-size:12px;color:#9ca3af;">Click <strong>New</strong> to add feedback</span>' : ''}
        </div>
      `
      return
    }

    for (const comment of filtered) {
      if (!repliesCache.has(comment.id)) {
        try {
          repliesCache.set(comment.id, await adapter.getReplies(comment.id))
        } catch {
          repliesCache.set(comment.id, [])
        }
      }
      listEl.appendChild(
        createCommentCard(comment, repliesCache, shadow, adapter, onNewFeedback)
      )
    }
  }

  subscribe(async (state) => {
    panel.classList.toggle('open', state.panelOpen)
    if (state.panelOpen) {
      await render(state.comments, state.filter)
    }
  })

  return panel
}

function createCommentCard(
  comment: FeedbackComment,
  repliesCache: Map<string, Reply[]>,
  shadow: ShadowRoot,
  adapter: DatabaseAdapter,
  onNewFeedback: () => void
): HTMLElement {
  const cachedReplies = repliesCache.get(comment.id) ?? []

  const card = document.createElement('div')
  card.className = 'ufp-comment-card'
  card.dataset.id = comment.id

  card.innerHTML = `
    <div class="ufp-comment-card-header">
      <div class="ufp-comment-meta">
        <div class="ufp-avatar">${getInitials(comment.authorName)}</div>
        <div>
          <div class="ufp-comment-author">${escHtml(comment.authorName)}</div>
          <div class="ufp-comment-time">${formatRelativeTime(comment.createdAt)}</div>
        </div>
      </div>
      ${comment.resolved ? '<span class="ufp-resolved-badge">Resolved</span>' : ''}
    </div>
    <img class="ufp-comment-thumbnail" src="${comment.screenshotUrl}" alt="Screenshot" loading="lazy" />
    <div class="ufp-comment-text">${escHtml(comment.text)}</div>
    <div class="ufp-comment-footer">
      <span class="ufp-reply-count">
        ${cachedReplies.length > 0
          ? `${cachedReplies.length} ${cachedReplies.length === 1 ? 'reply' : 'replies'}`
          : 'No replies yet — click to reply'}
      </span>
    </div>
  `

  card.addEventListener('click', async () => {
    // Always fetch fresh replies when opening the detail so nothing is stale
    let freshReplies: Reply[] = repliesCache.get(comment.id) ?? []
    try {
      freshReplies = await adapter.getReplies(comment.id)
      repliesCache.set(comment.id, freshReplies)
    } catch (err) {
      console.error('[ui-feedback-plugin] Failed to fetch replies:', err)
    }

    showCommentDetail(
      shadow,
      comment,
      freshReplies,
      adapter,
      (id) => {
        const state = getState()
        setState({ comments: state.comments.map((c) => c.id === id ? { ...c, resolved: true } : c) })
      },
      (id) => {
        const state = getState()
        setState({ comments: state.comments.map((c) => c.id === id ? { ...c, resolved: false } : c) })
      },
      (id) => {
        const state = getState()
        setState({ comments: state.comments.filter((c) => c.id !== id) })
        repliesCache.delete(id)
      },
      // When a reply is added in the detail view, update badge count immediately
      (reply) => {
        const existing = repliesCache.get(comment.id) ?? []
        repliesCache.set(comment.id, [...existing, reply])
        // Nudge state so the panel re-renders with the new reply count
        const state = getState()
        setState({ comments: [...state.comments] })
      }
    )
  })

  return card
}
