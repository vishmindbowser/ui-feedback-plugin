# ui-feedback-plugin

A drop-in floating widget for collecting annotated UI feedback on web prototypes. Think Figma comments — but on any web page.

**Features**
- Draggable floating trigger button
- Freehand drawing + shapes (rectangle, circle, arrow)
- Full-page screenshots with annotations
- Comment threads with replies
- Open / Resolved filter
- Three fully independent backend options — no lock-in

---

## Installation

```bash
npm install @mindbowser_inc/ui-feedback-plugin
```

---

## Backends

Choose **one** backend. They are fully independent — switch any time by changing the `backend` config.

| Backend | Database | Screenshots | Real-time |
|---|---|---|---|
| **Firebase** | Firestore | Firebase Storage | Yes (onSnapshot) |
| **Supabase** | Postgres | Supabase Storage | Yes (Realtime) |
| **AWS** | JSON files in S3 | S3 | Polling (5 s default) |

---

## Firebase

Firestore stores comments and replies. Firebase Storage holds screenshots. No backend required — Firebase keys are public identifiers, secured by Security Rules.

### Quick start

```js
import { initFeedbackPlugin } from '@mindbowser_inc/ui-feedback-plugin'

initFeedbackPlugin({
  backend: {
    provider:          'firebase',
    apiKey:            'AIzaSy...',
    authDomain:        'your-project.firebaseapp.com',
    projectId:         'your-project',
    storageBucket:     'your-project.appspot.com',
    messagingSenderId: '123456789',
    appId:             '1:123456789:web:abc123',
  },
  projectKey: 'my-project',
})
```

> The Firebase `apiKey` is a **public identifier**, not a secret. Secure your data with [Firebase Security Rules](https://firebase.google.com/docs/rules).

### Firebase console setup

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a project.
2. **Firestore** → Create database → Start in test mode (then lock it down with rules below).
3. **Storage** → Get started → set rules below.
4. **Project Settings** → Your apps → Add a web app → copy the config values above.

### Recommended Security Rules

**Firestore** (`firestore.rules`):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /ufp_comments/{doc} {
      allow read, write: if true;  // Replace with auth checks for production
    }
    match /ufp_replies/{doc} {
      allow read, write: if true;
    }
  }
}
```

**Storage** (`storage.rules`):
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /ufp/{allPaths=**} {
      allow read, write: if true;  // Replace with auth checks for production
    }
  }
}
```

---

## Supabase

Postgres stores comments and replies. Supabase Storage holds screenshots. No backend required — the `anonKey` is a public key secured by Row Level Security.

### Quick start

```js
import { initFeedbackPlugin } from '@mindbowser_inc/ui-feedback-plugin'

initFeedbackPlugin({
  backend: {
    provider: 'supabase',
    url:      'https://xxxx.supabase.co',
    anonKey:  'eyJhbGci...',
  },
  projectKey: 'my-project',
})
```

> The Supabase `anonKey` is a **public key by design**. Secure your data with [Row Level Security (RLS)](https://supabase.com/docs/guides/auth/row-level-security).

### Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor** and run the SQL below.
3. Go to **Storage** → New bucket → name it `ufp-screenshots` → set it to **Public**.
4. Run the storage policy SQL below.
5. Find your URL and anon key in **Project Settings → API**.

**Database SQL** (run once in SQL Editor):
```sql
create table if not exists ufp_comments (
  id           uuid    primary key default gen_random_uuid(),
  page_url     text    not null,
  project_key  text    not null default 'default',
  author_name  text    not null,
  text         text    not null,
  screenshot_url text  default '',
  annotation   jsonb   not null default '{}',
  resolved     boolean default false,
  created_at   bigint  not null
);

create table if not exists ufp_replies (
  id          uuid primary key default gen_random_uuid(),
  comment_id  uuid not null references ufp_comments(id) on delete cascade,
  author_name text not null,
  text        text not null,
  created_at  bigint not null
);

-- Enable Row Level Security
alter table ufp_comments enable row level security;
alter table ufp_replies   enable row level security;

-- Allow all operations (restrict per your auth strategy in production)
create policy "ufp_comments_all" on ufp_comments for all using (true) with check (true);
create policy "ufp_replies_all"  on ufp_replies  for all using (true) with check (true);

-- Grant table access to the anon role (RLS policies alone are not enough)
grant select, insert, update, delete on ufp_comments to anon;
grant select, insert, update, delete on ufp_replies  to anon;

-- Enable real-time for comments
alter publication supabase_realtime add table ufp_comments;
```

**Storage policy SQL** (run after creating the `ufp-screenshots` bucket):
```sql
create policy "ufp_storage_insert" on storage.objects
  for insert to anon with check (bucket_id = 'ufp-screenshots');

create policy "ufp_storage_select" on storage.objects
  for select to anon using (bucket_id = 'ufp-screenshots');

create policy "ufp_storage_update" on storage.objects
  for update to anon using (bucket_id = 'ufp-screenshots');
```

---

## AWS (Cognito Identity Pool)

Everything — comments, replies, and screenshots — is stored directly in S3 as JSON and PNG files. No backend server required. No Firebase or Supabase needed.

The browser obtains **temporary, rotating credentials** from a Cognito Identity Pool. No long-lived AWS keys ever touch the browser. The IAM role follows the least-privilege principle (file-type restrictions, size limits, no delete permission).

### Quick start

```js
import { initFeedbackPlugin } from '@mindbowser_inc/ui-feedback-plugin'

initFeedbackPlugin({
  backend: {
    provider:       'aws',
    region:         'us-east-1',
    bucket:         'your-bucket-name',
    identityPoolId: 'us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    pollInterval:   5000,  // optional, default 5000 ms
  },
  projectKey: 'my-project',
})
```

### AWS setup (step by step)

#### Step 1 — Create an S3 bucket

1. Open the [S3 console](https://s3.console.aws.amazon.com/s3).
2. Click **Create bucket**.
3. Choose a name and region (remember these — you'll need them in the plugin config).
4. Leave **Block all public access** ON (you'll open just the screenshots prefix below).
5. Enable **Versioning** (optional, but useful for recovery).
6. Create the bucket.

#### Step 2 — Configure CORS

Go to your bucket → **Permissions** → **Cross-origin resource sharing (CORS)** → Edit, and paste:

```json
[
  {
    "AllowedOrigins": ["https://your-domain.com"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

> Use `"*"` for `AllowedOrigins` during local development. Restrict to real domains in production.

#### Step 3 — Bucket policy (public read for screenshots only)

Go to bucket → **Permissions** → **Bucket policy** → Edit, and paste (replace `YOUR_BUCKET`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadScreenshots",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::YOUR_BUCKET/ufp/*/screenshots/*"
    }
  ]
}
```

This makes only screenshots publicly readable so they can display in `<img>` tags. Comments and reply JSON files remain private.

#### Step 4 — Create an IAM policy

Go to **IAM** → **Policies** → **Create policy** → JSON tab, and paste (replace `YOUR_BUCKET`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "WriteJsonFiles",
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::YOUR_BUCKET/ufp/*",
      "Condition": {
        "StringLike": {
          "s3:RequestObjectKey": [
            "ufp/*/comments/*.json",
            "ufp/replies/*/*.json",
            "ufp/_index/*.json"
          ]
        },
        "NumericLessThanEquals": {
          "s3:content-length": "51200"
        }
      }
    },
    {
      "Sid": "WriteScreenshots",
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::YOUR_BUCKET/ufp/*",
      "Condition": {
        "StringLike": {
          "s3:RequestObjectKey": "ufp/*/screenshots/*.png"
        },
        "NumericLessThanEquals": {
          "s3:content-length": "3145728"
        }
      }
    },
    {
      "Sid": "ReadFiles",
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::YOUR_BUCKET/ufp/*"
    },
    {
      "Sid": "ListFiles",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::YOUR_BUCKET",
      "Condition": {
        "StringLike": {
          "s3:prefix": "ufp/*"
        }
      }
    }
  ]
}
```

What this enforces:
- Only `.json` files under the correct paths can be written (no arbitrary uploads)
- JSON files are capped at **50 KB** per file
- Screenshot `.png` files are capped at **3 MB** per file
- All access is scoped to the `ufp/` prefix
- **`s3:DeleteObject` is absent** — the browser can never delete files (soft delete is used instead)

Name the policy (e.g. `ufp-plugin-policy`) and save it.

#### Step 5 — Create an IAM role

1. Go to **IAM** → **Roles** → **Create role**.
2. Trusted entity type: **Web identity**.
3. Identity provider: **Amazon Cognito**.
4. Leave the audience field blank for now (Cognito will configure it).
5. Click **Next**, attach the policy you created in Step 4.
6. Name the role (e.g. `ufp-plugin-cognito-unauth`) and create it.

#### Step 6 — Create a Cognito Identity Pool

1. Go to **Cognito** → **Identity pools** → **Create identity pool**.
2. **User access**: check **Guest access** (unauthenticated identities).
3. **Guest role**: select **Use an existing IAM role** → choose the role from Step 5.
4. Give the pool a name (e.g. `ufp-plugin-pool`) and create it.
5. On the pool detail page, copy the **Identity pool ID** — it looks like `us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`.

#### Step 7 — Configure the plugin

```js
initFeedbackPlugin({
  backend: {
    provider:       'aws',
    region:         'us-east-1',          // same region as your bucket and Identity Pool
    bucket:         'your-bucket-name',
    identityPoolId: 'us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  },
  projectKey: 'my-project',
})
```

### How data is stored

```
your-bucket/
  ufp/
    {projectKey}/
      {sha256(pageUrl)[0..15]}/
        comments/
          {commentId}.json     ← comment data
        screenshots/
          {commentId}.png      ← publicly readable
    replies/
      {commentId}/
        {replyId}.json         ← reply data
    _index/
      {commentId}.json         ← { "p": projectKey, "h": pageHash }
```

### Limitations

| Limitation | Detail |
|---|---|
| No real-time | New comments from other users appear after the next poll (default 5 s) |
| Soft delete only | Deleted comments are hidden but remain in S3 (good for audit trail) |
| N+1 reads | Loading comments = 1 LIST + N GET requests (fine for typical 10–30 comments) |
| CORS required | Your bucket must whitelist the domains the plugin runs on |

---

## Configuration reference

```ts
initFeedbackPlugin({
  backend:     FirebaseProviderConfig | SupabaseProviderConfig | AWSProviderConfig  // required
  projectKey?: string           // namespace comments per project (default: 'default')
  position?:  'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  theme?:     { primaryColor?: string }   // default: '#6366f1'
})
```

---

## Plain HTML / CDN (UMD)

No build step needed — load directly from a CDN:

```html
<script src="https://unpkg.com/@mindbowser_inc/ui-feedback-plugin/dist/ui-feedback-plugin.umd.js"></script>
<script>
  UIFeedbackPlugin.initFeedbackPlugin({
    backend: {
      provider: 'supabase',
      url:      'https://xxxx.supabase.co',
      anonKey:  'eyJhbGci...',
    },
    projectKey: 'my-project',
  })
</script>
```

Replace the `backend` block with any of the three provider configs shown above.

---

## Local development

```bash
git clone https://github.com/vishmindbowser/ui-feedback-plugin.git
cd ui-feedback-plugin
npm install
cp .env.local.example .env.local   # fill in your credentials
npm run dev
```

Set `VITE_PROVIDER` in `.env.local` to `supabase`, `firebase`, or `aws` to switch backends.

---

## License

MIT
