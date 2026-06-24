/**
 * S3 screenshot adapter — routes uploads through your own backend endpoint.
 *
 * AWS credentials MUST live on your server, never in browser code.
 * Your endpoint receives:  POST { commentId: string, imageData: string (base64) }
 * Your endpoint returns:   { url: string }  (the public S3 URL)
 *
 * Minimal Node/Express example:
 *
 *   const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
 *   const s3 = new S3Client({
 *     region: process.env.AWS_REGION,
 *     credentials: {
 *       accessKeyId: process.env.AWS_ACCESS_KEY_ID,
 *       secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
 *     },
 *   })
 *
 *   app.post('/upload-screenshot', async (req, res) => {
 *     const { commentId, imageData } = req.body
 *     const buffer = Buffer.from(imageData, 'base64')
 *     await s3.send(new PutObjectCommand({
 *       Bucket: process.env.S3_BUCKET,
 *       Key: `ufp/${commentId}.png`,
 *       Body: buffer,
 *       ContentType: 'image/png',
 *     }))
 *     res.json({ url: `https://${process.env.S3_BUCKET}.s3.amazonaws.com/ufp/${commentId}.png` })
 *   })
 */
import type { ScreenshotAdapter } from '../core/types'

export class S3ScreenshotAdapter implements ScreenshotAdapter {
  private endpoint: string
  private headers: Record<string, string>

  constructor(endpoint: string, headers: Record<string, string> = {}) {
    this.endpoint = endpoint
    this.headers = headers
  }

  async uploadScreenshot(commentId: string, dataUrl: string): Promise<string> {
    // Strip the data URL prefix — send only the base64 payload
    const imageData = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: JSON.stringify({ commentId, imageData }),
    })

    if (!response.ok) {
      throw new Error(
        `[ui-feedback-plugin] Screenshot upload failed: ${response.status} ${response.statusText}`
      )
    }

    const json = await response.json() as { url: string }
    if (!json?.url) {
      throw new Error('[ui-feedback-plugin] Upload endpoint did not return { url }')
    }
    return json.url
  }
}
