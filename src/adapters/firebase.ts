import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  onSnapshot,
  type Firestore,
} from 'firebase/firestore'
import {
  getStorage,
  ref,
  uploadString,
  getDownloadURL,
  type FirebaseStorage,
} from 'firebase/storage'
import type {
  FeedbackComment,
  Reply,
  DatabaseAdapter,
  ScreenshotAdapter,
  FirebaseProviderConfig,
} from '../core/types'

export class FirebaseAdapter implements DatabaseAdapter, ScreenshotAdapter {
  private db: Firestore
  private storage: FirebaseStorage

  constructor(config: FirebaseProviderConfig) {
    // Destructure to strip the 'provider' discriminant before passing to Firebase SDK
    const { provider: _p, ...fbConfig } = config
    let app: FirebaseApp
    const existing = getApps().find((a) => a.name === 'ui-feedback-plugin')
    if (existing) {
      app = existing
    } else {
      app = initializeApp(fbConfig, 'ui-feedback-plugin')
    }
    this.db = getFirestore(app)
    this.storage = getStorage(app)
  }

  async addComment(comment: Omit<FeedbackComment, 'id'>): Promise<string> {
    const ref = await addDoc(collection(this.db, 'ufp_comments'), comment)
    return ref.id
  }

  async getComments(pageUrl: string, projectKey: string): Promise<FeedbackComment[]> {
    const q = query(
      collection(this.db, 'ufp_comments'),
      where('pageUrl', '==', pageUrl),
      where('projectKey', '==', projectKey)
    )
    const snap = await getDocs(q)
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeedbackComment))
    return docs.sort((a, b) => b.createdAt - a.createdAt)
  }

  async updateComment(id: string, data: Partial<FeedbackComment>): Promise<void> {
    await updateDoc(doc(this.db, 'ufp_comments', id), data as Record<string, unknown>)
  }

  async deleteComment(id: string): Promise<void> {
    await deleteDoc(doc(this.db, 'ufp_comments', id))
  }

  async addReply(reply: Omit<Reply, 'id'>): Promise<string> {
    const docRef = await addDoc(
      collection(this.db, 'ufp_comments', reply.commentId, 'replies'),
      reply
    )
    return docRef.id
  }

  async getReplies(commentId: string): Promise<Reply[]> {
    const snap = await getDocs(
      collection(this.db, 'ufp_comments', commentId, 'replies')
    )
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Reply))
    return docs.sort((a, b) => a.createdAt - b.createdAt)
  }

  subscribeToComments(
    pageUrl: string,
    projectKey: string,
    callback: (comments: FeedbackComment[]) => void
  ): () => void {
    const q = query(
      collection(this.db, 'ufp_comments'),
      where('pageUrl', '==', pageUrl),
      where('projectKey', '==', projectKey)
    )
    return onSnapshot(
      q,
      (snap) => {
        const comments = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as FeedbackComment))
          .sort((a, b) => b.createdAt - a.createdAt)
        callback(comments)
      },
      (error) => {
        console.error('[ui-feedback-plugin] Firestore listener error:', error)
      }
    )
  }

  async uploadScreenshot(commentId: string, dataUrl: string): Promise<string> {
    const storageRef = ref(this.storage, `ufp_screenshots/${commentId}.png`)
    await uploadString(storageRef, dataUrl, 'data_url')
    return getDownloadURL(storageRef)
  }
}
