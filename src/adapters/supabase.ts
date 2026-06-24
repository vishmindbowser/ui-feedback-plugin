/**
 * Supabase adapter — requires @supabase/supabase-js v2.
 *
 * Run this SQL in your Supabase project before use:
 *
 *   create table if not exists ufp_comments (
 *     id uuid primary key default gen_random_uuid(),
 *     page_url text not null,
 *     project_key text not null default 'default',
 *     author_name text not null,
 *     text text not null,
 *     screenshot_url text default '',
 *     annotation jsonb not null default '{}',
 *     resolved boolean default false,
 *     created_at bigint not null
 *   );
 *
 *   create table if not exists ufp_replies (
 *     id uuid primary key default gen_random_uuid(),
 *     comment_id uuid not null references ufp_comments(id) on delete cascade,
 *     author_name text not null,
 *     text text not null,
 *     created_at bigint not null
 *   );
 *
 *   alter table ufp_comments enable row level security;
 *   alter table ufp_replies enable row level security;
 *   -- Restrict these policies for production!
 *   create policy "ufp_comments_all" on ufp_comments for all using (true) with check (true);
 *   create policy "ufp_replies_all" on ufp_replies for all using (true) with check (true);
 *
 *   -- Enable real-time (run in SQL editor):
 *   alter publication supabase_realtime add table ufp_comments;
 *
 *   -- Create storage bucket for screenshots (Supabase dashboard → Storage → New bucket):
 *   --   Name: ufp-screenshots, Public: true
 */
import type {
  FeedbackComment,
  Reply,
  DatabaseAdapter,
  ScreenshotAdapter,
  AnnotationData,
} from '../core/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SBClient = any

function fromCommentRow(row: Record<string, unknown>): FeedbackComment {
  return {
    id:            row.id as string,
    pageUrl:       row.page_url as string,
    projectKey:    row.project_key as string,
    authorName:    row.author_name as string,
    text:          row.text as string,
    screenshotUrl: (row.screenshot_url as string) ?? '',
    annotation:    row.annotation as AnnotationData,
    resolved:      row.resolved as boolean,
    createdAt:     row.created_at as number,
  }
}

function toCommentRow(comment: Omit<FeedbackComment, 'id'>): Record<string, unknown> {
  return {
    page_url:       comment.pageUrl,
    project_key:    comment.projectKey,
    author_name:    comment.authorName,
    text:           comment.text,
    screenshot_url: comment.screenshotUrl,
    annotation:     comment.annotation,
    resolved:       comment.resolved,
    created_at:     comment.createdAt,
  }
}

function fromReplyRow(row: Record<string, unknown>): Reply {
  return {
    id:         row.id as string,
    commentId:  row.comment_id as string,
    authorName: row.author_name as string,
    text:       row.text as string,
    createdAt:  row.created_at as number,
  }
}

function toReplyRow(reply: Omit<Reply, 'id'>): Record<string, unknown> {
  return {
    comment_id:  reply.commentId,
    author_name: reply.authorName,
    text:        reply.text,
    created_at:  reply.createdAt,
  }
}

export class SupabaseAdapter implements DatabaseAdapter, ScreenshotAdapter {
  private client: SBClient

  constructor(url: string, anonKey: string) {
    // Dynamic import so @supabase/supabase-js is optional at bundle time
    // The constructor is intentionally sync — client is created lazily in _getClient()
    this._url = url
    this._key = anonKey
  }

  private _url: string
  private _key: string
  private _client: SBClient | null = null

  private async _getClient(): Promise<SBClient> {
    if (this._client) return this._client
    try {
      const { createClient } = await import('@supabase/supabase-js')
      this._client = createClient(this._url, this._key)
      return this._client
    } catch {
      throw new Error(
        '[ui-feedback-plugin] @supabase/supabase-js is not installed. Run: npm install @supabase/supabase-js'
      )
    }
  }

  async addComment(comment: Omit<FeedbackComment, 'id'>): Promise<string> {
    const sb = await this._getClient()
    const { data, error } = await sb
      .from('ufp_comments')
      .insert(toCommentRow(comment))
      .select('id')
      .single()
    if (error) throw error
    return data.id as string
  }

  async getComments(pageUrl: string, projectKey: string): Promise<FeedbackComment[]> {
    const sb = await this._getClient()
    const { data, error } = await sb
      .from('ufp_comments')
      .select('*')
      .eq('page_url', pageUrl)
      .eq('project_key', projectKey)
    if (error) throw error
    const rows = (data ?? []) as Record<string, unknown>[]
    return rows.map(fromCommentRow).sort((a, b) => b.createdAt - a.createdAt)
  }

  async updateComment(id: string, fields: Partial<FeedbackComment>): Promise<void> {
    const sb = await this._getClient()
    // Map camelCase fields to snake_case before sending
    const mapped: Record<string, unknown> = {}
    if (fields.resolved     !== undefined) mapped.resolved      = fields.resolved
    if (fields.screenshotUrl !== undefined) mapped.screenshot_url = fields.screenshotUrl
    if (fields.text          !== undefined) mapped.text           = fields.text
    if (fields.annotation    !== undefined) mapped.annotation     = fields.annotation
    const { error } = await sb.from('ufp_comments').update(mapped).eq('id', id)
    if (error) throw error
  }

  async deleteComment(id: string): Promise<void> {
    const sb = await this._getClient()
    const { error } = await sb.from('ufp_comments').delete().eq('id', id)
    if (error) throw error
  }

  async addReply(reply: Omit<Reply, 'id'>): Promise<string> {
    const sb = await this._getClient()
    const { data, error } = await sb
      .from('ufp_replies')
      .insert(toReplyRow(reply))
      .select('id')
      .single()
    if (error) throw error
    return data.id as string
  }

  async getReplies(commentId: string): Promise<Reply[]> {
    const sb = await this._getClient()
    const { data, error } = await sb
      .from('ufp_replies')
      .select('*')
      .eq('comment_id', commentId)
    if (error) throw error
    const rows = (data ?? []) as Record<string, unknown>[]
    return rows.map(fromReplyRow).sort((a, b) => a.createdAt - b.createdAt)
  }

  subscribeToComments(
    pageUrl: string,
    projectKey: string,
    callback: (comments: FeedbackComment[]) => void
  ): () => void {
    let channel: SBClient | null = null
    let active = true

    const refetch = async () => {
      if (!active) return
      try {
        const comments = await this.getComments(pageUrl, projectKey)
        if (active) callback(comments)
      } catch (err) {
        console.error('[ui-feedback-plugin] Supabase fetch error:', err)
      }
    }

    // Initial fetch
    refetch()

    // Set up real-time after getting the client
    this._getClient().then((sb) => {
      if (!active) return
      channel = sb
        .channel('ufp-comments')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ufp_comments' }, () => {
          refetch()
        })
        .subscribe()
    }).catch(console.error)

    return () => {
      active = false
      if (channel) {
        this._getClient().then((sb) => sb.removeChannel(channel)).catch(() => {})
      }
    }
  }

  async uploadScreenshot(commentId: string, dataUrl: string): Promise<string> {
    const sb = await this._getClient()

    // Convert data URL to Blob
    const [header, base64] = dataUrl.split(',')
    const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png'
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: mime })

    const path = `${commentId}.png`
    const { error } = await sb.storage
      .from('ufp-screenshots')
      .upload(path, blob, { contentType: 'image/png', upsert: true })

    if (error) throw error

    const { data } = sb.storage.from('ufp-screenshots').getPublicUrl(path)
    return data.publicUrl as string
  }
}
