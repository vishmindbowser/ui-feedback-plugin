# UI Feedback Plugin — Team Integration Guide

## What is this?

`@mindbowser_inc/ui-feedback-plugin` is an internal npm package that adds a floating feedback widget to any web prototype. It lets reviewers annotate the UI directly — drawing shapes, adding comments, attaching screenshots, and threading replies — without leaving the browser.

Think of it as Figma comments, but embedded in our own web prototypes.

**Why we built it instead of using a third-party tool:**
- Full control over where feedback data lives (our own database/storage, not a vendor's)
- Works on any web page with a single script tag or npm import
- No per-seat licensing cost
- Feedback data stays within our infrastructure

---

## How it works

```
Browser (prototype page)
  └── <ui-feedback-plugin> (Web Component, Shadow DOM)
        ├── Floating trigger button (draggable)
        ├── Annotation overlay (draw rectangles, arrows, freehand)
        ├── Screenshot capture (full-page, html2canvas-pro)
        └── Comments panel (threads, replies, resolve/reopen)
              │
              ▼
        Backend adapter (lazy-loaded, ~12 KB base)
              │
    ┌─────────┴──────────┐
    │                    │
  Firebase           Supabase           AWS S3
  (Firestore +       (Postgres +        (JSON files +
  Firebase           Supabase           PNG files,
  Storage)           Storage)           Cognito auth)
```

Each backend is loaded as a separate chunk — only the one you configure is downloaded. Firebase and Supabase provide real-time updates; AWS uses polling (5-second default).

---

## Backend Options

| | Firebase | Supabase | AWS (Cognito + S3) |
|---|---|---|---|
| **Database** | Firestore | Postgres | JSON files in S3 |
| **Screenshots** | Firebase Storage | Supabase Storage | PNG files in S3 |
| **Real-time** | Yes (WebSocket) | Yes (WebSocket) | Polling (5 s) |
| **Auth model** | Firebase SDK + Security Rules | anon key + RLS policies | Cognito Identity Pool (temp credentials) |
| **Backend server needed** | No | No | No |
| **Best for** | Teams already on Firebase | Teams already on Supabase | Teams on AWS / no Supabase or Firebase |

---

---

# DEVOPS: What to Set Up

Pick the backend that matches your infrastructure. Hand developers the values marked **→ give to developers** below.

---

## Option A — Firebase

### Step 1: Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → name it (e.g. `mindbowser-feedback`)
3. Disable Google Analytics (not needed) → **Create project**

### Step 2: Set up Firestore

1. Left sidebar → **Firestore Database** → **Create database**
2. Select **Start in production mode** → choose a region → **Enable**
3. Go to **Rules** tab and replace the default rule:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /ufp_comments/{doc} {
      allow read, write: if true;
    }
    match /ufp_replies/{doc} {
      allow read, write: if true;
    }
  }
}
```

> For production, replace `if true` with an auth condition (e.g. `if request.auth != null`). For internal prototype review with known users, `if true` is acceptable.

### Step 3: Set up Firebase Storage

1. Left sidebar → **Storage** → **Get started**
2. Accept default rules for now → choose same region → **Done**
3. Go to **Rules** tab and replace:

```js
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /ufp/{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```

### Step 4: Get the web config

1. Left sidebar → **Project Settings** (gear icon) → **General**
2. Scroll to **Your apps** → click **Add app** → choose Web (`</>`)
3. Register the app → copy the config object

**→ Give developers these values:**

```
FIREBASE_API_KEY=AIzaSy...
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your-project
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789
FIREBASE_APP_ID=1:123456789:web:abc
```

> The Firebase API key is a **public identifier**, not a secret. It is safe to put in frontend code. Security is enforced by Firestore and Storage Rules, not by keeping the key secret.

---

## Option B — Supabase

### Step 1: Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Choose an organisation, name, database password, and region → **Create new project**

### Step 2: Run the database SQL

Go to **SQL Editor** → click **New query** → paste and run:

```sql
-- Tables
create table if not exists ufp_comments (
  id             uuid    primary key default gen_random_uuid(),
  page_url       text    not null,
  project_key    text    not null default 'default',
  author_name    text    not null,
  text           text    not null,
  screenshot_url text    default '',
  annotation     jsonb   not null default '{}',
  resolved       boolean default false,
  created_at     bigint  not null
);

create table if not exists ufp_replies (
  id          uuid   primary key default gen_random_uuid(),
  comment_id  uuid   not null references ufp_comments(id) on delete cascade,
  author_name text   not null,
  text        text   not null,
  created_at  bigint not null
);

-- Row Level Security (RLS)
alter table ufp_comments enable row level security;
alter table ufp_replies   enable row level security;

create policy "ufp_comments_all" on ufp_comments for all using (true) with check (true);
create policy "ufp_replies_all"  on ufp_replies  for all using (true) with check (true);

-- Grants (RLS policies alone are not enough — table-level grants are also required)
grant select, insert, update, delete on ufp_comments to anon;
grant select, insert, update, delete on ufp_replies  to anon;

-- Real-time (enables live comment updates)
alter publication supabase_realtime add table ufp_comments;
```

### Step 3: Create the storage bucket

1. Left sidebar → **Storage** → **New bucket**
2. Name: `ufp-screenshots`
3. Toggle **Public bucket** ON → **Save**
4. Go to **Policies** (inside Storage) → **New policy** → **For full customization**

Add these three policies for the `ufp-screenshots` bucket:

```sql
-- Allow uploads
create policy "ufp_storage_insert" on storage.objects
  for insert to anon with check (bucket_id = 'ufp-screenshots');

-- Allow reads (needed to display screenshots)
create policy "ufp_storage_select" on storage.objects
  for select to anon using (bucket_id = 'ufp-screenshots');

-- Allow overwrites
create policy "ufp_storage_update" on storage.objects
  for update to anon using (bucket_id = 'ufp-screenshots');
```

### Step 4: Get the API keys

Left sidebar → **Project Settings** → **API**

**→ Give developers these values:**

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
```

> The `anon` key is a **public key by design** in Supabase. It's safe to include in frontend code. Security is enforced by Row Level Security policies, not by hiding the key.

---

## Option C — AWS (Cognito Identity Pool + S3)

This is the most infrastructure-heavy option but requires no third-party service. The browser obtains **temporary, short-lived credentials** from Cognito and talks to S3 directly — no backend server is needed, and no long-lived AWS keys ever reach the browser.

### Step 1: Create an S3 bucket

1. Open [S3 console](https://s3.console.aws.amazon.com/s3) → **Create bucket**
2. Choose a name (e.g. `mindbowser-ufp`) and region
3. Keep **Block all public access** ON — you'll open only the screenshots prefix below
4. Enable **Versioning** (recommended — allows recovery if a file is accidentally overwritten)
5. Create the bucket

### Step 2: Configure CORS on the bucket

Go to bucket → **Permissions** → **Cross-origin resource sharing (CORS)** → **Edit** → paste:

```json
[
  {
    "AllowedOrigins": ["https://your-prototype-domain.com"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

> Add each domain where the plugin will run to `AllowedOrigins`. Use `"*"` in a dev/staging environment if needed.

### Step 3: Add bucket policy (public read for screenshots only)

Go to bucket → **Permissions** → **Bucket policy** → **Edit** → paste (replace `YOUR_BUCKET`):

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

This makes only screenshot images publicly accessible (so they can render in `<img>` tags). All comment and reply JSON files remain private and are only accessible via Cognito credentials.

### Step 4: Create an IAM policy

Go to **IAM** → **Policies** → **Create policy** → **JSON** tab → paste (replace `YOUR_BUCKET`):

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

**What this enforces (per CTO requirement):**
- Only `.json` and `.png` files can be written — no other file types
- JSON files capped at **50 KB** (comment data is never larger than a few KB)
- Screenshot files capped at **3 MB**
- All access is restricted to the `ufp/` prefix — no other bucket paths are accessible
- **`s3:DeleteObject` is intentionally absent** — the plugin can never delete files. Deleted comments are soft-deleted (overwritten with a `deleted: true` flag). This provides an audit trail.

Name the policy (e.g. `ufp-plugin-policy`) and save.

### Step 5: Create an IAM role

1. Go to **IAM** → **Roles** → **Create role**
2. Trusted entity: **Web identity**
3. Identity provider: **Amazon Cognito**
4. Leave the audience/condition fields blank for now (Cognito sets these)
5. Click **Next** → attach the policy from Step 4
6. Name the role (e.g. `ufp-plugin-cognito-unauth`) → **Create role**

### Step 6: Create a Cognito Identity Pool

1. Go to **Amazon Cognito** → **Identity pools** → **Create identity pool**
2. Under **User access**, check **Guest access** (unauthenticated identities)
3. Under **Guest role**, choose **Use an existing IAM role** → select the role from Step 5
4. Give the pool a name (e.g. `ufp-plugin-pool`) → **Create**
5. On the pool detail page, find and copy the **Identity pool ID** (format: `us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

### Step 7: Verify

Test that the bucket and Cognito pool are working before handing off to devs. You can do a quick sanity check using the [AWS CLI](https://docs.aws.amazon.com/cli/):

```bash
# Confirm the bucket exists
aws s3 ls s3://your-bucket-name/ufp/ --region us-east-1
```

**→ Give developers these values:**

```
AWS_REGION=us-east-1
AWS_BUCKET=your-bucket-name
AWS_IDENTITY_POOL_ID=us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

> These values are **safe to include in frontend code**. The Identity Pool ID is a public identifier — security is enforced by the IAM policy attached to the Cognito role, not by keeping the ID secret.

---

---

# DEVELOPERS: How to Integrate

## Installation

```bash
npm install @mindbowser_inc/ui-feedback-plugin
```

## Basic usage

Call `initFeedbackPlugin` once on page load. Pass the credentials that DevOps provides.

```js
import { initFeedbackPlugin } from '@mindbowser_inc/ui-feedback-plugin'

initFeedbackPlugin({
  backend: { /* see examples below */ },
  projectKey: 'your-project-name',   // namespaces comments — use the project/prototype name
  position: 'bottom-right',          // optional, default: 'bottom-right'
  theme: { primaryColor: '#6366f1' } // optional
})
```

`projectKey` keeps comments from different prototypes separate even if they share the same backend. Use a short, slug-like value (e.g. `'onboarding-v2'`, `'dashboard-redesign'`).

---

## Integrating with Firebase

DevOps will give you six values. Use them like this:

```js
initFeedbackPlugin({
  backend: {
    provider:          'firebase',
    apiKey:            'AIzaSy...',
    authDomain:        'your-project.firebaseapp.com',
    projectId:         'your-project',
    storageBucket:     'your-project.appspot.com',
    messagingSenderId: '123456789',
    appId:             '1:123456789:web:abc',
  },
  projectKey: 'my-prototype',
})
```

**Storing credentials safely:**

Never hard-code credentials in source files. Use environment variables:

```bash
# .env.local (gitignored)
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc
```

```js
// In your code (Vite)
initFeedbackPlugin({
  backend: {
    provider:          'firebase',
    apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  },
  projectKey: 'my-prototype',
})
```

```js
// In your code (Create React App / Webpack)
initFeedbackPlugin({
  backend: {
    provider:          'firebase',
    apiKey:            process.env.REACT_APP_FIREBASE_API_KEY,
    // ... etc
  },
})
```

---

## Integrating with Supabase

DevOps will give you two values. Use them like this:

```js
initFeedbackPlugin({
  backend: {
    provider: 'supabase',
    url:      'https://xxxx.supabase.co',
    anonKey:  'eyJhbGci...',
  },
  projectKey: 'my-prototype',
})
```

**With environment variables (recommended):**

```bash
# .env.local
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

```js
initFeedbackPlugin({
  backend: {
    provider: 'supabase',
    url:      import.meta.env.VITE_SUPABASE_URL,
    anonKey:  import.meta.env.VITE_SUPABASE_ANON_KEY,
  },
  projectKey: 'my-prototype',
})
```

---

## Integrating with AWS

DevOps will give you three values. Use them like this:

```js
initFeedbackPlugin({
  backend: {
    provider:       'aws',
    region:         'us-east-1',
    bucket:         'your-bucket-name',
    identityPoolId: 'us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  },
  projectKey: 'my-prototype',
})
```

**With environment variables (recommended):**

```bash
# .env.local
VITE_AWS_REGION=us-east-1
VITE_AWS_BUCKET=your-bucket-name
VITE_AWS_IDENTITY_POOL_ID=us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

```js
initFeedbackPlugin({
  backend: {
    provider:       'aws',
    region:         import.meta.env.VITE_AWS_REGION,
    bucket:         import.meta.env.VITE_AWS_BUCKET,
    identityPoolId: import.meta.env.VITE_AWS_IDENTITY_POOL_ID,
  },
  projectKey: 'my-prototype',
})
```

> Note: Comments from other users appear within 5 seconds (polling). There is no real-time WebSocket connection for the AWS backend.

---

## Plain HTML (no bundler)

If you are not using a build tool, load the plugin from a CDN:

```html
<!DOCTYPE html>
<html>
<head>...</head>
<body>
  <!-- your prototype content -->

  <script src="https://unpkg.com/@mindbowser_inc/ui-feedback-plugin/dist/ui-feedback-plugin.umd.js"></script>
  <script>
    UIFeedbackPlugin.initFeedbackPlugin({
      backend: {
        provider: 'supabase',
        url:      'https://xxxx.supabase.co',
        anonKey:  'eyJhbGci...',
      },
      projectKey: 'my-prototype',
    })
  </script>
</body>
</html>
```

Replace the `backend` block with whichever provider DevOps has configured.

---

## All configuration options

```ts
initFeedbackPlugin({
  // Required — choose one backend
  backend: FirebaseConfig | SupabaseConfig | AWSConfig,

  // Optional — namespace comments per prototype (default: 'default')
  // Use a short slug: 'dashboard-v2', 'onboarding-flow', etc.
  projectKey?: string,

  // Optional — where the trigger button appears (default: 'bottom-right')
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left',

  // Optional — accent color for the widget UI (default: '#6366f1' indigo)
  theme?: { primaryColor?: string },
})
```

---

## Credential checklist for developers

Before going live, confirm:

- [ ] Credentials are in `.env.local` (or equivalent), not in source files
- [ ] `.env.local` is in `.gitignore`
- [ ] CI/CD has the environment variables set as secrets (not in the repo)
- [ ] `projectKey` is set to the specific prototype name (not `'default'`)

---

## FAQ

**Q: Will feedback from different prototypes get mixed together?**
No. The `projectKey` you pass separates comments by project. Always set a unique value per prototype.

**Q: Can multiple people leave feedback at the same time?**
Yes. With Firebase and Supabase backends, comments from other users appear in real time. With the AWS backend, they appear within 5 seconds (polling interval).

**Q: How are screenshots stored? Are they secure?**
Screenshots are stored alongside comments in whichever backend is configured. With AWS, only screenshot images are publicly readable (so they can render in the browser) — all comment and reply data is private and only accessible via short-lived Cognito credentials.

**Q: Can I use this on a prototype hosted on localhost?**
Yes for all backends. For AWS, add `http://localhost:3000` (or your local port) to the S3 CORS `AllowedOrigins` list.

**Q: How do I remove the widget from a page?**
`initFeedbackPlugin` returns a cleanup function:
```js
const cleanup = initFeedbackPlugin({ ... })
// Later:
cleanup() // removes the widget from the DOM
```

---

## Support

For issues or questions, contact the team that owns the `ui-feedback-plugin` repository:
[github.com/vishmindbowser/ui-feedback-plugin](https://github.com/vishmindbowser/ui-feedback-plugin)
