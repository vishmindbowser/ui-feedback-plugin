/**
 * AWS S3 adapter — stores everything (comments, replies, screenshots) via your backend API.
 * AWS credentials live on YOUR server; this adapter only calls HTTP endpoints.
 *
 * ── Required API contract ─────────────────────────────────────────────────────
 *
 *   GET  {apiUrl}/comments?pageUrl=...&projectKey=...  → FeedbackComment[]
 *   POST {apiUrl}/comments                             → { id: string }
 *   PUT  {apiUrl}/comments/:id                        → 200
 *   DELETE {apiUrl}/comments/:id                      → 200
 *
 *   GET  {apiUrl}/replies?commentId=...               → Reply[]
 *   POST {apiUrl}/replies                             → { id: string }
 *
 *   POST {apiUrl}/screenshots                         → { url: string }
 *        body: { commentId: string, imageData: string (base64) }
 *
 * ── Minimal Node.js / Express reference server ────────────────────────────────
 *
 *   const express = require('express')
 *   const { S3Client, PutObjectCommand, GetObjectCommand,
 *           DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3')
 *   const { v4: uuidv4 } = require('uuid')
 *   const crypto = require('crypto')
 *
 *   const s3 = new S3Client({ region: process.env.AWS_REGION })
 *   const BUCKET = process.env.S3_BUCKET
 *   const app = express()
 *   app.use(express.json({ limit: '10mb' }))
 *
 *   const hashUrl = (url) => crypto.createHash('md5').update(url).digest('hex')
 *
 *   async function s3Get(key) {
 *     const r = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
 *     return JSON.parse(await r.Body.transformToString())
 *   }
 *   async function s3Put(key, data, contentType = 'application/json') {
 *     const body = typeof data === 'string' ? data : JSON.stringify(data)
 *     await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }))
 *   }
 *   async function s3List(prefix) {
 *     const r = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }))
 *     return r.Contents ?? []
 *   }
 *
 *   // Comments
 *   app.get('/ufp/comments', async (req, res) => {
 *     const { pageUrl, projectKey } = req.query
 *     const prefix = `comments/${projectKey}/${hashUrl(pageUrl)}/`
 *     const items = await s3List(prefix)
 *     const comments = await Promise.all(items.map(i => s3Get(i.Key)))
 *     res.json(comments.sort((a, b) => b.createdAt - a.createdAt))
 *   })
 *
 *   app.post('/ufp/comments', async (req, res) => {
 *     const comment = req.body
 *     const id = uuidv4()
 *     const key = `comments/${comment.projectKey}/${hashUrl(comment.pageUrl)}/${id}.json`
 *     await s3Put(key, { id, ...comment })
 *     res.json({ id })
 *   })
 *
 *   app.put('/ufp/comments/:id', async (req, res) => {
 *     // Requires you to store a separate index: id → s3 key
 *     // Simplest: scan prefix and find matching id
 *     const { id } = req.params
 *     const allPrefixes = await s3List('comments/')
 *     const match = allPrefixes.find(i => i.Key.endsWith(`/${id}.json`))
 *     if (!match) return res.status(404).end()
 *     const existing = await s3Get(match.Key)
 *     await s3Put(match.Key, { ...existing, ...req.body })
 *     res.status(200).end()
 *   })
 *
 *   app.delete('/ufp/comments/:id', async (req, res) => {
 *     const { id } = req.params
 *     const allItems = await s3List('comments/')
 *     const match = allItems.find(i => i.Key.endsWith(`/${id}.json`))
 *     if (match) await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: match.Key }))
 *     // Also delete replies
 *     const replies = await s3List(`replies/${id}/`)
 *     await Promise.all(replies.map(i => s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: i.Key }))))
 *     res.status(200).end()
 *   })
 *
 *   // Replies
 *   app.get('/ufp/replies', async (req, res) => {
 *     const { commentId } = req.query
 *     const items = await s3List(`replies/${commentId}/`)
 *     const replies = await Promise.all(items.map(i => s3Get(i.Key)))
 *     res.json(replies.sort((a, b) => a.createdAt - b.createdAt))
 *   })
 *
 *   app.post('/ufp/replies', async (req, res) => {
 *     const reply = req.body
 *     const id = uuidv4()
 *     await s3Put(`replies/${reply.commentId}/${id}.json`, { id, ...reply })
 *     res.json({ id })
 *   })
 *
 *   // Screenshots
 *   app.post('/ufp/screenshots', async (req, res) => {
 *     const { commentId, imageData } = req.body
 *     const buffer = Buffer.from(imageData, 'base64')
 *     const key = `screenshots/${commentId}.png`
 *     await s3.send(new PutObjectCommand({
 *       Bucket: BUCKET, Key: key, Body: buffer,
 *       ContentType: 'image/png',
 *     }))
 *     res.json({ url: `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}` })
 *   })
 *
 *   app.listen(3001, () => console.log('UFP S3 API running on :3001'))
 */
import type { FeedbackComment, Reply, DatabaseAdapter, ScreenshotAdapter } from '../core/types'

export class S3Adapter implements DatabaseAdapter, ScreenshotAdapter {
  private base: string
  private headers: Record<string, string>
  private pollInterval: number

  constructor(apiUrl: string, headers: Record<string, string> = {}, pollInterval = 5000) {
    this.base = apiUrl.replace(/\/$/, '')
    this.headers = headers
    this.pollInterval = pollInterval
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...this.headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      throw new Error(`[ui-feedback-plugin] S3 API ${method} ${path} → ${res.status} ${res.statusText}`)
    }
    // DELETE returns 200 with no body
    if (method === 'DELETE') return undefined as T
    return res.json() as Promise<T>
  }

  async addComment(comment: Omit<FeedbackComment, 'id'>): Promise<string> {
    const data = await this.req<{ id: string }>('POST', '/comments', comment)
    return data.id
  }

  async getComments(pageUrl: string, projectKey: string): Promise<FeedbackComment[]> {
    const params = new URLSearchParams({ pageUrl, projectKey })
    return this.req<FeedbackComment[]>('GET', `/comments?${params}`)
  }

  async updateComment(id: string, data: Partial<FeedbackComment>): Promise<void> {
    await this.req('PUT', `/comments/${id}`, data)
  }

  async deleteComment(id: string): Promise<void> {
    await this.req('DELETE', `/comments/${id}`)
  }

  async addReply(reply: Omit<Reply, 'id'>): Promise<string> {
    const data = await this.req<{ id: string }>('POST', '/replies', reply)
    return data.id
  }

  async getReplies(commentId: string): Promise<Reply[]> {
    return this.req<Reply[]>('GET', `/replies?commentId=${encodeURIComponent(commentId)}`)
  }

  subscribeToComments(
    pageUrl: string,
    projectKey: string,
    callback: (comments: FeedbackComment[]) => void
  ): () => void {
    let active = true

    const poll = async () => {
      if (!active) return
      try {
        const comments = await this.getComments(pageUrl, projectKey)
        if (active) callback(comments)
      } catch (err) {
        console.error('[ui-feedback-plugin] S3 poll error:', err)
      }
      if (active) setTimeout(poll, this.pollInterval)
    }

    poll()
    return () => { active = false }
  }

  async uploadScreenshot(commentId: string, dataUrl: string): Promise<string> {
    const imageData = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
    const data = await this.req<{ url: string }>('POST', '/screenshots', { commentId, imageData })
    return data.url
  }
}
