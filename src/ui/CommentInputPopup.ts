import { getUserName } from '../core/state'

interface PopupResult {
  text: string
}

export function showCommentInputPopup(
  shadow: ShadowRoot,
  anchorX: number,
  anchorY: number
): Promise<PopupResult | null> {
  return new Promise((resolve) => {
    const popup = document.createElement('div')
    popup.className = 'ufp-comment-popup'

    const userName = getUserName() ?? ''

    popup.innerHTML = `
      <h3>Add Comment</h3>
      <textarea
        class="ufp-textarea"
        id="ufp-comment-text"
        placeholder="Describe your feedback…"
        rows="3"
        autofocus
      ></textarea>
      <div class="ufp-btn-row">
        <button class="ufp-btn ufp-btn-ghost" id="ufp-popup-cancel">Cancel</button>
        <button class="ufp-btn ufp-btn-primary" id="ufp-popup-submit" disabled>Submit</button>
      </div>
    `

    positionPopup(popup, anchorX, anchorY)
    shadow.appendChild(popup)

    const textarea = popup.querySelector('#ufp-comment-text') as HTMLTextAreaElement
    const submitBtn = popup.querySelector('#ufp-popup-submit') as HTMLButtonElement
    const cancelBtn = popup.querySelector('#ufp-popup-cancel') as HTMLButtonElement

    textarea.addEventListener('input', () => {
      submitBtn.disabled = textarea.value.trim().length === 0
    })

    submitBtn.addEventListener('click', () => {
      const text = textarea.value.trim()
      if (!text) return
      popup.remove()
      resolve({ text })
    })

    cancelBtn.addEventListener('click', () => {
      popup.remove()
      resolve(null)
    })

    requestAnimationFrame(() => textarea.focus())
  })
}

function positionPopup(popup: HTMLElement, anchorX: number, anchorY: number): void {
  const W = 320
  const MARGIN = 12
  const vw = window.innerWidth
  const vh = window.innerHeight

  let left = anchorX + MARGIN
  let top = anchorY + MARGIN

  if (left + W > vw - MARGIN) left = anchorX - W - MARGIN
  if (left < MARGIN) left = MARGIN
  if (top + 220 > vh - MARGIN) top = vh - 220 - MARGIN
  if (top < MARGIN) top = MARGIN

  popup.style.cssText = `
    position: fixed;
    left: ${left}px;
    top: ${top}px;
    z-index: 2147483647;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.18);
    padding: 16px;
    width: ${W}px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  `
}
