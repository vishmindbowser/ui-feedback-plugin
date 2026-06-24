# ui-feedback-plugin

A drop-in floating widget for collecting annotated UI feedback on web prototypes. Think Figma comments — but on any web page.

**Features**
- Draggable floating trigger button
- Freehand drawing + shapes (rectangle, circle, arrow)
- Full-page screenshots with annotations
- Comment threads with replies
- Open / Resolved filter
- Three fully independent backend options

---

## Installation

```bash
npm install @mindbowser_inc/ui-feedback-plugin
```

---

## Backends

Choose **one** backend. They are fully independent — no mixing required.

| Backend | Database | Screenshot storage | Real-time |
|---|---|---|---|
| **Firebase** | Firestore | Firebase Storage | Yes (onSnapshot) |
| **Supabase** | Postgres | Supabase Storage | Yes (Realtime) |
| **AWS S3** | JSON files in S3 | S3 | Polling (5s default) |

---

## Firebase

Firestore stores comments and replies. Firebase Storage holds screenshots.

```js
import { initFeedbackPlugin } from '@mindbowser_inc/ui-feedback-plugin'

initFeedbackPlugin({
  backend: {
    provider: 'firebase',
    apiKey:            process.env.FIREBASE_API_KEY,
    authDomain:        process.env.FIREBASE_AUTH_DOMAIN,
    projectId:         process.env.FIREBASE_PROJECT_ID,
    storageBucket:     process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId:             process.env.FIREBASE_APP_ID,
  },
  projectKey: 'my-project',
})
```

> The Firebase API key is a **public identifier**, not a secret. Secure your data with [Firebase Security Rules](https://firebase.google.com/docs/rules).

---

## Supabase

Postgres stores comments and replies. Supabase Storage holds screenshots.

```js
import { initFeedbackPlugin } from '@mindbowser_inc/ui-feedback-plugin'

initFeedbackPlugin({
  backend: {
    provider: 'supabase',
    url:     process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
  },
  projectKey: 'my-project',
})
```

> The Supabase `anonKey` is a **public key by design**. Secure your data with [Row Level Security (RLS)](https://supabase.com/docs/guides/auth/row-level-security).

**Required SQL** — run this in your Supabase SQL editor once:

```sql
create table if not exists ufp_comments (
  id uuid primary key default gen_random_uuid(),
  page_url text not null,
  project_key text not null default 'default',
  author_name text not null,
  text text not null,
  screenshot_url text default '',
  annotation jsonb not null default '{}',
  resolved boolean default false,
  created_at bigint not null
);
create table if not exists ufp_replies (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references ufp_comments(id) on delete cascade,
  author_name text not null,
  text text not null,
  created_at bigint not null
);
alter table ufp_comments enable row level security;
alter table ufp_replies enable row level security;
create policy "ufp_comments_all" on ufp_comments for all using (true) with check (true);
create policy "ufp_replies_all" on ufp_replies for all using (true) with check (true);
grant select, insert, update, delete on ufp_comments to anon;
grant select, insert, update, delete on ufp_replies to anon;
alter publication supabase_realtime add table ufp_comments;
```

Then in **Storage**, create a public bucket named `ufp-screenshots` and add:

```sql
create policy "ufp_storage_insert" on storage.objects for insert to anon with check (bucket_id = 'ufp-screenshots');
create policy "ufp_storage_select" on storage.objects for select to anon using (bucket_id = 'ufp-screenshots');
create policy "ufp_storage_update" on storage.objects for update to anon using (bucket_id = 'ufp-screenshots');
```

---

## AWS S3

Everything — comments, replies, and screenshots — lives in S3 as JSON/image files. No Firebase or Supabase needed.

**AWS credentials must never appear in frontend code.** This adapter calls your own backend API, which holds the credentials and talks to S3.

```js
import { initFeedbackPlugin } from '@mindbowser_inc/ui-feedback-plugin'

initFeedbackPlugin({
  backend: {
    provider:     's3',
    apiUrl:       'https://your-api.com/ufp',   // your backend base URL
    headers:      { Authorization: 'Bearer your-internal-token' },
    pollInterval: 5000,  // ms between comment refreshes (default: 5000)
  },
  projectKey: 'my-project',
})
```

**Your backend must expose these endpoints:**

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/comments?pageUrl=...&projectKey=...` | — | `FeedbackComment[]` |
| POST | `/comments` | `FeedbackComment` (no id) | `{ id: string }` |
| PUT | `/comments/:id` | `Partial<FeedbackComment>` | `200` |
| DELETE | `/comments/:id` | — | `200` |
| GET | `/replies?commentId=...` | — | `Reply[]` |
| POST | `/replies` | `Reply` (no id) | `{ id: string }` |
| POST | `/screenshots` | `{ commentId, imageData }` (base64) | `{ url: string }` |

A full Node.js/Express reference server is included as comments inside [`src/adapters/s3.ts`](src/adapters/s3.ts).

---

## Configuration

```ts
initFeedbackPlugin({
  backend:    FirebaseProviderConfig | SupabaseProviderConfig | S3ProviderConfig  // required
  projectKey?: string          // namespace comments per project (default: 'default')
  position?:  'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  theme?:     { primaryColor?: string }   // default: '#6366f1'
})
```

---

## Plain HTML (UMD / CDN)

```html
<script src="https://unpkg.com/@mindbowser_inc/ui-feedback-plugin/dist/ui-feedback-plugin.umd.js"></script>
<script>
  UIFeedbackPlugin.initFeedbackPlugin({
    backend: { provider: 'supabase', url: '...', anonKey: '...' },
    projectKey: 'my-project',
  })
</script>
```

---

## License

MIT
