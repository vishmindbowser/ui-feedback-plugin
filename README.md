# ui-feedback-plugin

A drop-in floating widget for collecting annotated UI feedback on web prototypes. Think Figma comments — but on any web page.

**Features**
- Draggable floating trigger button
- Freehand drawing + shapes (rectangle, circle, arrow)
- Full-page screenshots with annotations
- Comment threads with replies
- Open / Resolved filter
- Real-time sync across tabs
- Firebase **or** Supabase backend
- S3 screenshot storage via a backend proxy

---

## Installation

```bash
npm install @vishmindbowser/ui-feedback-plugin
```

---

## Quick start

### With Firebase

```js
import { initFeedbackPlugin } from '@vishmindbowser/ui-feedback-plugin'

initFeedbackPlugin({
  database: {
    provider: 'firebase',
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
  },
  projectKey: 'my-project',
})
```

> The Firebase API key is a **public identifier**, not a secret. Secure your data with [Firebase Security Rules](https://firebase.google.com/docs/rules).

### With Supabase

```js
import { initFeedbackPlugin } from '@vishmindbowser/ui-feedback-plugin'

initFeedbackPlugin({
  database: {
    provider: 'supabase',
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
  },
  projectKey: 'my-project',
})
```

> The Supabase `anonKey` is a **public key by design**. Secure your data with [Row Level Security (RLS)](https://supabase.com/docs/guides/auth/row-level-security) policies.

**Supabase setup** — run this SQL in your Supabase SQL editor:

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

Then create a **public** Storage bucket named `ufp-screenshots` and add these policies:

```sql
create policy "ufp_storage_insert" on storage.objects for insert to anon with check (bucket_id = 'ufp-screenshots');
create policy "ufp_storage_select" on storage.objects for select to anon using (bucket_id = 'ufp-screenshots');
create policy "ufp_storage_update" on storage.objects for update to anon using (bucket_id = 'ufp-screenshots');
```

---

## S3 screenshot storage

Store screenshots in S3 while keeping your database on Firebase or Supabase. **AWS credentials must never appear in frontend code** — provide a backend proxy endpoint instead.

```js
initFeedbackPlugin({
  database: {
    provider: 'supabase',
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
  },
  screenshots: {
    provider: 's3',
    uploadEndpoint: 'https://your-api.com/upload-screenshot',
    headers: { Authorization: 'Bearer your-internal-token' },
  },
  projectKey: 'my-project',
})
```

Your endpoint receives `POST { commentId: string, imageData: string }` (base64) and must return `{ url: string }`. See the [minimal Node/Express example](src/adapters/s3.ts).

---

## Configuration

```ts
initFeedbackPlugin({
  database: FirebaseProviderConfig | SupabaseProviderConfig   // required
  screenshots?: 'firebase' | 'supabase' | S3ScreenshotConfig // optional, defaults to same as database
  projectKey?: string        // namespace comments per project (default: 'default')
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'  // default: 'bottom-right'
  theme?: { primaryColor?: string }  // default: '#6366f1'
})
```

---

## Usage in plain HTML (UMD)

```html
<script src="https://unpkg.com/@vishmindbowser/ui-feedback-plugin/dist/ui-feedback-plugin.umd.js"></script>
<script>
  UIFeedbackPlugin.initFeedbackPlugin({
    database: { provider: 'supabase', url: '...', anonKey: '...' },
    projectKey: 'my-project',
  })
</script>
```

---

## License

MIT
