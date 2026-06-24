import type { FeedbackComment, Reply, PluginConfig } from './types'

export interface PluginState {
  active: boolean
  userName: string | null
  comments: FeedbackComment[]
  replies: Map<string, Reply[]>
  selectedCommentId: string | null
  panelOpen: boolean
  filter: 'open' | 'resolved'
  config: PluginConfig
}

const listeners = new Set<(state: PluginState) => void>()

let state: PluginState = {
  active: false,
  userName: null,
  comments: [],
  replies: new Map(),
  selectedCommentId: null,
  panelOpen: false,
  filter: 'open',
  config: {} as PluginConfig,
}

export function getState(): PluginState {
  return state
}

export function setState(partial: Partial<PluginState>): void {
  state = { ...state, ...partial }
  listeners.forEach((fn) => fn(state))
}

export function subscribe(fn: (state: PluginState) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getUserName(): string | null {
  if (state.userName) return state.userName
  const stored = localStorage.getItem('ufp_user_name')
  if (stored) {
    setState({ userName: stored })
    return stored
  }
  return null
}

export function setUserName(name: string): void {
  localStorage.setItem('ufp_user_name', name)
  setState({ userName: name })
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.origin + u.pathname
  } catch {
    return url
  }
}
