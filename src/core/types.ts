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

/** Handles comments and replies. */
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

/** Handles screenshot uploads. */
export interface ScreenshotAdapter {
  uploadScreenshot(commentId: string, dataUrl: string): Promise<string>
}

// ── Backend provider configs ──────────────────────────────────────────────────

/**
 * Firebase backend — Firestore for comments/replies, Firebase Storage for screenshots.
 * The API key is a public identifier, not a secret. Secure data with Firebase Security Rules.
 */
export interface FirebaseProviderConfig {
  provider: 'firebase'
  apiKey: string
  authDomain: string
  projectId: string
  /** Required for screenshot storage. */
  storageBucket?: string
  messagingSenderId?: string
  appId?: string
}

/**
 * Supabase backend — Postgres for comments/replies, Supabase Storage for screenshots.
 * The anonKey is a public key by design. Secure data with Row Level Security (RLS) policies.
 * See src/adapters/supabase.ts for the required SQL setup.
 */
export interface SupabaseProviderConfig {
  provider: 'supabase'
  url: string
  anonKey: string
}

/**
 * AWS S3 backend — all data (comments, replies, screenshots) stored in S3.
 * No Firebase or Supabase needed.
 *
 * AWS credentials MUST stay on your server — this adapter calls your backend API,
 * which in turn reads/writes S3. See src/adapters/s3.ts for the required API contract
 * and a full Node.js/Express reference implementation.
 */
export interface S3ProviderConfig {
  provider: 's3'
  /** Base URL of your backend API (e.g. https://your-api.com/ufp). No trailing slash. */
  apiUrl: string
  /** Optional headers sent with every request (e.g. { Authorization: 'Bearer token' }). */
  headers?: Record<string, string>
  /**
   * How often (ms) to poll for new comments. S3 has no real-time push.
   * Default: 5000 (5 seconds).
   */
  pollInterval?: number
}

export type BackendConfig = FirebaseProviderConfig | SupabaseProviderConfig | S3ProviderConfig

export interface PluginConfig {
  /**
   * Storage backend. Pick one:
   * - `firebase`  — Firestore + Firebase Storage
   * - `supabase`  — Postgres + Supabase Storage
   * - `s3`        — Everything in AWS S3 via your backend API (no Firebase/Supabase needed)
   */
  backend: BackendConfig
  /** Namespace comments by project (default: 'default'). */
  projectKey?: string
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  theme?: { primaryColor?: string }
}
