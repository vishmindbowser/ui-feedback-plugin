import type {
  FeedbackComment,
  Reply,
  DatabaseAdapter,
  ScreenshotAdapter,
} from '../core/types'

export class LocalAdapter implements DatabaseAdapter, ScreenshotAdapter {
  private listeners: Set<(comments: FeedbackComment[]) => void> = new Set()

  private getCommentsFromStorage(): FeedbackComment[] {
    const data = sessionStorage.getItem('ufp_comments')
    return data ? JSON.parse(data) : []
  }

  private saveCommentsToStorage(comments: FeedbackComment[]) {
    sessionStorage.setItem('ufp_comments', JSON.stringify(comments))
    this.notifyListeners()
  }

  private getRepliesFromStorage(): Reply[] {
    const data = sessionStorage.getItem('ufp_replies')
    return data ? JSON.parse(data) : []
  }

  private saveRepliesToStorage(replies: Reply[]) {
    sessionStorage.setItem('ufp_replies', JSON.stringify(replies))
  }

  private notifyListeners() {
    const comments = this.getCommentsFromStorage()
    for (const listener of this.listeners) {
      listener(comments)
    }
  }

  async addComment(comment: Omit<FeedbackComment, 'id'>): Promise<string> {
    const comments = this.getCommentsFromStorage()
    const id = Math.random().toString(36).substring(2, 9)
    const newComment: FeedbackComment = { ...comment, id }
    comments.push(newComment)
    this.saveCommentsToStorage(comments)
    return id
  }

  async getComments(pageUrl: string, projectKey: string): Promise<FeedbackComment[]> {
    const comments = this.getCommentsFromStorage()
    return comments.filter(c => c.pageUrl === pageUrl && c.projectKey === projectKey)
  }

  async updateComment(id: string, data: Partial<FeedbackComment>): Promise<void> {
    const comments = this.getCommentsFromStorage()
    const index = comments.findIndex(c => c.id === id)
    if (index !== -1) {
      comments[index] = { ...comments[index], ...data }
      this.saveCommentsToStorage(comments)
    }
  }

  async deleteComment(id: string): Promise<void> {
    const comments = this.getCommentsFromStorage()
    const filtered = comments.filter(c => c.id !== id)
    this.saveCommentsToStorage(filtered)

    const replies = this.getRepliesFromStorage()
    const filteredReplies = replies.filter(r => r.commentId !== id)
    this.saveRepliesToStorage(filteredReplies)
  }

  async addReply(reply: Omit<Reply, 'id'>): Promise<string> {
    const replies = this.getRepliesFromStorage()
    const id = Math.random().toString(36).substring(2, 9)
    const newReply: Reply = { ...reply, id }
    replies.push(newReply)
    this.saveRepliesToStorage(replies)
    return id
  }

  async getReplies(commentId: string): Promise<Reply[]> {
    const replies = this.getRepliesFromStorage()
    return replies.filter(r => r.commentId === commentId)
  }

  subscribeToComments(
    pageUrl: string,
    projectKey: string,
    callback: (comments: FeedbackComment[]) => void
  ): () => void {
    const wrapper = (comments: FeedbackComment[]) => {
      callback(comments.filter(c => c.pageUrl === pageUrl && c.projectKey === projectKey))
    }
    this.listeners.add(wrapper)
    wrapper(this.getCommentsFromStorage())

    return () => {
      this.listeners.delete(wrapper)
    }
  }

  async uploadScreenshot(commentId: string, dataUrl: string): Promise<string> {
    // Return base64 URL directly, which gets stored in the comment's screenshotUrl.
    return dataUrl
  }
}
