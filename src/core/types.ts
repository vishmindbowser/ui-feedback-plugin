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
 * AWS backend — all data (comments, replies, screenshots) stored directly in S3.
 * No Firebase or Supabase needed.
 *
 * The browser obtains temporary, rotating AWS credentials from a Cognito Identity Pool.
 * No long-lived keys ever touch the browser. See src/adapters/aws.ts for AWS setup steps.
 */
export interface AWSProviderConfig {
  provider: 'aws'
  /** AWS region (e.g. 'us-east-1'). */
  region: string
  /** S3 bucket name. */
  bucket: string
  /**
   * Cognito Identity Pool ID (e.g. 'us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx').
   * Used to obtain temporary AWS credentials in the browser.
   */
  identityPoolId: string
  /**
   * How often (ms) to poll for new comments. S3 has no real-time push.
   * Default: 5000 (5 seconds).
   */
  pollInterval?: number
}

export type BackendConfig = FirebaseProviderConfig | SupabaseProviderConfig | AWSProviderConfig

export interface PluginConfig {
  /**
   * Storage backend. Pick one:
   * - `firebase`  — Firestore + Firebase Storage
   * - `supabase`  — Postgres + Supabase Storage
   * - `aws`       — Everything in AWS S3 via Cognito Identity Pool (no backend needed)
   */
  backend: BackendConfig
  /** Namespace comments by project (default: 'default'). */
  projectKey?: string
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  theme?: { primaryColor?: string }
}
