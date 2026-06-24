export type DrawingTool = 'pen' | 'rect' | 'circle' | 'arrow'

export interface Point { x: number; y: number }

export interface SVGStroke  { type: 'pen';    points: Point[]; color: string; width: number }
export interface SVGRect    { type: 'rect';   x: number; y: number; width: number; height: number; color: string; strokeWidth: number }
export interface SVGCircle  { type: 'circle'; cx: number; cy: number; rx: number; ry: number; color: string; strokeWidth: number }
export interface SVGArrow   { type: 'arrow';  x1: number; y1: number; x2: number; y2: number; color: string; width: number }

export type AnnotationShape = SVGStroke | SVGRect | SVGCircle | SVGArrow

export interface AnnotationData {
  shapes: AnnotationShape[]
  pageWidth: number
  pageHeight: number
}

export interface Reply {
  id: string
  commentId: string
  authorName: string
  text: string
  createdAt: number
}

export interface FeedbackComment {
  id: string
  pageUrl: string
  projectKey: string
  authorName: string
  text: string
  screenshotUrl: string
  annotation: AnnotationData
  resolved: boolean
  createdAt: number
}

// ── Adapter interfaces ────────────────────────────────────────────────────────

/** Handles comments and replies (database layer). */
export interface DatabaseAdapter {
  addComment(comment: Omit<FeedbackComment, 'id'>): Promise<string>
  getComments(pageUrl: string, projectKey: string): Promise<FeedbackComment[]>
  updateComment(id: string, data: Partial<FeedbackComment>): Promise<void>
  deleteComment(id: string): Promise<void>
  addReply(reply: Omit<Reply, 'id'>): Promise<string>
  getReplies(commentId: string): Promise<Reply[]>
  subscribeToComments(
    pageUrl: string,
    projectKey: string,
    callback: (comments: FeedbackComment[]) => void
  ): () => void
}

/** Handles screenshot uploads (storage layer). */
export interface ScreenshotAdapter {
  uploadScreenshot(commentId: string, dataUrl: string): Promise<string>
}

// ── Config ────────────────────────────────────────────────────────────────────

export interface FirebaseProviderConfig {
  provider: 'firebase'
  /**
   * Firebase API key. This is a public identifier — not a secret.
   * Secure your data with Firebase Security Rules.
   * Store in an environment variable (VITE_FIREBASE_API_KEY, REACT_APP_FIREBASE_API_KEY, etc.)
   */
  apiKey: string
  authDomain: string
  projectId: string
  /** Required when using Firebase Storage for screenshots. */
  storageBucket?: string
  messagingSenderId?: string
  appId?: string
}

export interface SupabaseProviderConfig {
  provider: 'supabase'
  url: string
  /**
   * Supabase anon key. This is a public key — not a secret.
   * Secure your data with Supabase Row Level Security (RLS) policies.
   * Store in an environment variable.
   */
  anonKey: string
}

/**
 * S3 screenshot storage via a backend proxy endpoint.
 * NEVER pass AWS credentials to the frontend — your backend holds those.
 * Your endpoint receives { commentId, imageData } and returns { url }.
 */
export interface S3ScreenshotConfig {
  provider: 's3'
  /** Your backend endpoint that accepts the screenshot and returns { url: string } */
  uploadEndpoint: string
  /** Optional headers (e.g. an authorization token for your own backend) */
  headers?: Record<string, string>
}

export type DatabaseConfig = FirebaseProviderConfig | SupabaseProviderConfig

/**
 * Controls where screenshots are stored.
 * - `'firebase'` / `'supabase'`: reuse the same provider configured in `database`
 * - `'s3'`: forward screenshots to your own backend proxy (AWS credentials stay on your server)
 */
export type ScreenshotConfig =
  | { provider: 'firebase' }
  | { provider: 'supabase' }
  | S3ScreenshotConfig

export interface PluginConfig {
  /** Database provider for storing comments and replies. */
  database: DatabaseConfig
  /**
   * Screenshot storage provider.
   * Defaults to the same provider as `database`.
   * Use `s3` to keep screenshots off Firebase/Supabase.
   */
  screenshots?: ScreenshotConfig
  /** Namespace comments by project. Use this when multiple prototypes share a backend. */
  projectKey?: string
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  theme?: { primaryColor?: string }
}
