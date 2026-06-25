// AWS Cognito Identity Pool adapter — browser talks directly to S3, no backend required.
// Requires @aws-sdk/client-s3 and @aws-sdk/credential-providers (both in devDependencies).
//
// ── AWS SETUP ────────────────────────────────────────────────────────────────────
//
// 1. CREATE S3 BUCKET
//    - Keep "Block all public access" ON (we'll add a narrow public policy for screenshots).
//    - Enable versioning (optional, helpful for recovery).
//
// 2. CONFIGURE CORS (required for browser access)
//    Go to Bucket → Permissions → CORS and paste:
//    [
//      {
//        "AllowedOrigins": ["https://your-domain.com"],
//        "AllowedMethods": ["GET", "PUT", "HEAD"],
//        "AllowedHeaders": ["*"],
//        "ExposeHeaders": ["ETag"],
//        "MaxAgeSeconds": 3000
//      }
//    ]
//    Use "*" for AllowedOrigins during local dev, restrict to real domains in production.
//
// 3. ADD BUCKET POLICY (public read for screenshots only)
//    Go to Bucket → Permissions → Bucket policy and paste (replace YOUR_BUCKET):
//    {
//      "Version": "2012-10-17",
//      "Statement": [{
//        "Sid": "PublicReadScreenshots",
//        "Effect": "Allow",
//        "Principal": "*",
//        "Action": "s3:GetObject",
//        "Resource": "arn:aws:s3:::YOUR_BUCKET/ufp/*/screenshots/*"
//      }]
//    }
//    Comments and replies remain private (only accessible via Cognito credentials).
//
// 4. CREATE IAM POLICY (least privilege — see README for full JSON)
//    Allows:
//      - s3:PutObject on ufp/*/comments/*.json   (max 50 KB)
//      - s3:PutObject on ufp/replies/*/*.json    (max 50 KB)
//      - s3:PutObject on ufp/_index/*.json       (max 50 KB)
//      - s3:PutObject on ufp/*/screenshots/*.png (max 3 MB)
//      - s3:GetObject on ufp/*
//      - s3:ListBucket on the bucket with prefix ufp/*
//    NO s3:DeleteObject — soft delete is used instead.
//
// 5. CREATE IAM ROLE
//    - Trusted entity: Web Identity
//    - Identity provider: Amazon Cognito
//    - Attach the policy from step 4
//
// 6. CREATE COGNITO IDENTITY POOL
//    - Enable unauthenticated identities
//    - Unauthenticated role: the IAM role from step 5
//    - Authenticated role: none (or a different role)
//    - Copy the Identity Pool ID (format: us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
//
// 7. CONFIGURE THE PLUGIN
//    initFeedbackPlugin({
//      backend: {
//        provider: 'aws',
//        region: 'us-east-1',
//        bucket: 'your-bucket-name',
//        identityPoolId: 'us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
//      },
//      projectKey: 'my-project',
//    })
//
// ── DATA LAYOUT IN S3 ────────────────────────────────────────────────────────────
//
//   ufp/{projectKey}/{pageHash}/comments/{commentId}.json
//   ufp/{projectKey}/{pageHash}/screenshots/{commentId}.png  ← publicly readable
//   ufp/replies/{commentId}/{replyId}.json
//   ufp/_index/{commentId}.json  ← { "p": projectKey, "h": pageHash }
//
// ── SOFT DELETE ──────────────────────────────────────────────────────────────────
//   deleteComment overwrites the comment JSON with { ...comment, deleted: true }.
//   The file stays in S3 but is filtered out on read. No s3:DeleteObject needed.
//
// ── REAL-TIME ────────────────────────────────────────────────────────────────────
//   S3 has no push. subscribeToComments polls on a configurable interval (default 5s).

import type { FeedbackComment, Reply, DatabaseAdapter, ScreenshotAdapter, AWSProviderConfig } from '../core/types'
import type { S3Client as S3ClientType } from '@aws-sdk/client-s3'

export class AWSAdapter implements DatabaseAdapter, ScreenshotAdapter {
  private cfg: AWSProviderConfig
  private _s3: S3ClientType | null = null

  constructor(config: AWSProviderConfig) {
    this.cfg = config
  }

  private async s3(): Promise<S3ClientType> {
    if (this._s3) return this._s3
    const [{ S3Client }, { fromCognitoIdentityPool }] = await Promise.all([
      import('@aws-sdk/client-s3'),
      import('@aws-sdk/credential-provider-cognito-identity'),
    ])
    this._s3 = new S3Client({
      region: this.cfg.region,
      credentials: fromCognitoIdentityPool({
        identityPoolId: this.cfg.identityPoolId,
        clientConfig: { region: this.cfg.region },
      }),
    })
    return this._s3
  }

  private async pageHash(url: string): Promise<string> {
    const data = new TextEncoder().encode(url)
    const buf = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16)
  }

  private async put(key: string, body: string | Uint8Array, contentType: string): Promise<void> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3')
    const client = await this.s3()
    await client.send(new PutObjectCommand({
      Bucket: this.cfg.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }))
  }

  private async getJson<T>(key: string): Promise<T> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3')
    const client = await this.s3()
    const res = await client.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }))
    const text = await res.Body!.transformToString()
    return JSON.parse(text) as T
  }

  private async listKeys(prefix: string): Promise<string[]> {
    const { ListObjectsV2Command } = await import('@aws-sdk/client-s3')
    const client = await this.s3()
    const keys: string[] = []
    let token: string | undefined
    do {
      const res = await client.send(new ListObjectsV2Command({
        Bucket: this.cfg.bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }))
      for (const obj of res.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key)
      }
      token = res.NextContinuationToken
    } while (token)
    return keys
  }

  private indexKey(id: string) {
    return `ufp/_index/${id}.json`
  }

  private async lookupComment(id: string): Promise<{ key: string }> {
    const { p, h } = await this.getJson<{ p: string; h: string }>(this.indexKey(id))
    return { key: `ufp/${p}/${h}/comments/${id}.json` }
  }

  async addComment(comment: Omit<FeedbackComment, 'id'>): Promise<string> {
    const hash = await this.pageHash(comment.pageUrl)
    const id = crypto.randomUUID()
    await Promise.all([
      this.put(
        `ufp/${comment.projectKey}/${hash}/comments/${id}.json`,
        JSON.stringify({ id, ...comment }),
        'application/json'
      ),
      this.put(
        this.indexKey(id),
        JSON.stringify({ p: comment.projectKey, h: hash }),
        'application/json'
      ),
    ])
    return id
  }

  async getComments(pageUrl: string, projectKey: string): Promise<FeedbackComment[]> {
    const hash = await this.pageHash(pageUrl)
    const keys = await this.listKeys(`ufp/${projectKey}/${hash}/comments/`)
    const rows = await Promise.all(
      keys.map(k =>
        this.getJson<FeedbackComment & { deleted?: boolean }>(k).catch(() => null)
      )
    )
    return rows
      .filter((r): r is FeedbackComment => r !== null && !r.deleted)
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  async updateComment(id: string, data: Partial<FeedbackComment>): Promise<void> {
    const { key } = await this.lookupComment(id)
    const existing = await this.getJson<FeedbackComment>(key)
    await this.put(key, JSON.stringify({ ...existing, ...data }), 'application/json')
  }

  async deleteComment(id: string): Promise<void> {
    const { key } = await this.lookupComment(id)
    const existing = await this.getJson<FeedbackComment>(key)
    // Soft delete — overwrite with deleted flag. No s3:DeleteObject permission needed.
    await this.put(key, JSON.stringify({ ...existing, deleted: true }), 'application/json')
  }

  async addReply(reply: Omit<Reply, 'id'>): Promise<string> {
    const id = crypto.randomUUID()
    await this.put(
      `ufp/replies/${reply.commentId}/${id}.json`,
      JSON.stringify({ id, ...reply }),
      'application/json'
    )
    return id
  }

  async getReplies(commentId: string): Promise<Reply[]> {
    const keys = await this.listKeys(`ufp/replies/${commentId}/`)
    const rows = await Promise.all(
      keys.map(k => this.getJson<Reply>(k).catch(() => null))
    )
    return rows
      .filter((r): r is Reply => r !== null)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  subscribeToComments(
    pageUrl: string,
    projectKey: string,
    callback: (comments: FeedbackComment[]) => void
  ): () => void {
    let active = true
    const interval = this.cfg.pollInterval ?? 5000

    const poll = async () => {
      if (!active) return
      try {
        const comments = await this.getComments(pageUrl, projectKey)
        if (active) callback(comments)
      } catch (err) {
        console.error('[ui-feedback-plugin] AWS poll error:', err)
      }
      if (active) setTimeout(poll, interval)
    }

    poll()
    return () => { active = false }
  }

  async uploadScreenshot(commentId: string, dataUrl: string): Promise<string> {
    const { p, h } = await this.getJson<{ p: string; h: string }>(this.indexKey(commentId))
    const key = `ufp/${p}/${h}/screenshots/${commentId}.png`

    const base64 = dataUrl.split(',')[1]
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

    await this.put(key, bytes, 'image/png')
    return `https://${this.cfg.bucket}.s3.${this.cfg.region}.amazonaws.com/${key}`
  }
}
