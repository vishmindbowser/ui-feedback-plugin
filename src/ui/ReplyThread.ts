import type { Reply, DatabaseAdapter } from '../core/types'
import { getUserName, setUserName } from '../core/state'
import { formatRelativeTime, getInitials, escHtml } from './utils'

export function createReplyThread(
  commentId: string,
  initialReplies: Reply[],
  adapter: DatabaseAdapter,
  onReplyAdded: (reply: Reply) => void
): HTMLElement {
  let replies = [...initialReplies]

  const container = document.createElement('div')
  container.className = 'ufp-replies'

  const renderReplies = (list: Reply[]) => {
    const existing = container.querySelector('.ufp-replies-list')
    if (existing) existing.remove()

    const listEl = document.createElement('div')
    listEl.className = 'ufp-replies-list'
    listEl.style.cssText = 'display:flex;flex-direction:column;gap:12px;'

    if (list.length > 0) {
      const title = document.createElement('div')
      title.className = 'ufp-replies-title'
      title.textContent = `${list.length} ${list.length === 1 ? 'Reply' : 'Replies'}`
      listEl.appendChild(title)

      list.forEach((reply) => {
        const replyEl = document.createElement('div')
        replyEl.className = 'ufp-reply'
        replyEl.innerHTML = `
          <div class="ufp-reply-meta">
            <div class="ufp-avatar" style="width:22px;height:22px;font-size:10px;">${getInitials(reply.authorName)}</div>
            <span class="ufp-reply-author">${escHtml(reply.authorName)}</span>
            <span class="ufp-reply-time">${formatRelativeTime(reply.createdAt)}</span>
          </div>
          <div class="ufp-reply-text">${escHtml(reply.text)}</div>
        `
        listEl.appendChild(replyEl)
      })
    }

    container.insertBefore(listEl, container.querySelector('.ufp-reply-input-area'))
  }

  // Reply input
  const inputArea = document.createElement('div')
  inputArea.className = 'ufp-reply-input-area'

  const savedName = getUserName()
  inputArea.innerHTML = `
    <div class="ufp-reply-name-row">
      <span class="ufp-reply-name-label">Replying as:</span>
      <input
        class="ufp-input"
        id="ufp-reply-name"
        type="text"
        placeholder="Your name"
        value="${escHtml(savedName ?? '')}"
        style="flex:1;"
      />
    </div>
    <textarea
      class="ufp-textarea"
      id="ufp-reply-text"
      placeholder="Write a reply…"
      rows="2"
      style="min-height:60px;"
    ></textarea>
    <div class="ufp-btn-row">
      <button class="ufp-btn ufp-btn-primary" id="ufp-reply-submit" disabled style="font-size:13px;padding:7px 14px;">Reply</button>
    </div>
  `

  const nameInput  = inputArea.querySelector('#ufp-reply-name')   as HTMLInputElement
  const textInput  = inputArea.querySelector('#ufp-reply-text')   as HTMLTextAreaElement
  const submitBtn  = inputArea.querySelector('#ufp-reply-submit') as HTMLButtonElement

  const validate = () => {
    submitBtn.disabled =
      nameInput.value.trim().length === 0 || textInput.value.trim().length === 0
  }
  nameInput.addEventListener('input', validate)
  textInput.addEventListener('input', validate)

  submitBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim()
    const text = textInput.value.trim()
    if (!name || !text) return

    submitBtn.disabled  = true
    submitBtn.textContent = 'Sending…'
    setUserName(name)

    const reply: Omit<Reply, 'id'> = {
      commentId,
      authorName: name,
      text,
      createdAt: Date.now(),
    }

    try {
      const id = await adapter.addReply(reply)
      const fullReply: Reply = { id, ...reply }

      textInput.value       = ''
      submitBtn.textContent = 'Reply'
      // Keep button disabled until user types again (validate fires on input)
      submitBtn.disabled    = true

      // Update local list immediately (don't wait for next getReplies)
      replies = [...replies, fullReply]
      renderReplies(replies)

      onReplyAdded(fullReply)
    } catch (err) {
      console.error('[ui-feedback-plugin] Failed to save reply:', err)
      submitBtn.disabled    = false
      submitBtn.textContent = 'Reply'
    }
  })

  container.appendChild(inputArea)
  renderReplies(replies)

  // Exposed so CommentDetailView can inject a reply from outside
  ;(container as any).addReply = (reply: Reply) => {
    replies = [...replies, reply]
    renderReplies(replies)
  }

  return container
}
