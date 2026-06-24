import { setUserName } from '../core/state'

export function showNameModal(shadow: ShadowRoot): Promise<string> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div')
    backdrop.className = 'ufp-modal-backdrop'

    backdrop.innerHTML = `
      <div class="ufp-modal" role="dialog" aria-modal="true" aria-labelledby="ufp-modal-title">
        <h2 id="ufp-modal-title">Welcome to Feedback Mode</h2>
        <p>Enter your name so others can see who left the comment.</p>
        <input
          class="ufp-input"
          id="ufp-name-input"
          type="text"
          placeholder="Your name"
          maxlength="60"
          autocomplete="off"
        />
        <div class="ufp-btn-row">
          <button class="ufp-btn ufp-btn-primary" id="ufp-name-submit" disabled>Continue</button>
        </div>
      </div>
    `

    shadow.appendChild(backdrop)

    const input = backdrop.querySelector('#ufp-name-input') as HTMLInputElement
    const submitBtn = backdrop.querySelector('#ufp-name-submit') as HTMLButtonElement

    input.addEventListener('input', () => {
      submitBtn.disabled = input.value.trim().length === 0
    })

    const submit = () => {
      const name = input.value.trim()
      if (!name) return
      setUserName(name)
      backdrop.remove()
      resolve(name)
    }

    submitBtn.addEventListener('click', submit)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit()
    })

    requestAnimationFrame(() => input.focus())
  })
}
