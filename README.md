# JnR

A mobile-friendly truth-or-dare party game built with Next.js App Router, TypeScript, MongoDB, and private Amazon S3 storage. Deploy to Vercel.

## Run locally

Use Node 24 (`nvm use`).

```sh
npm install
# On a fresh checkout only: cp .env.example .env.local
# Fill the environment values before continuing.
npm run setup:db
npm run dev
```

The existing local `.env.local` is configured with your JnR MongoDB cluster and AWS account. It is ignored by Git and must never be committed. A random host password has been generated there.

## Environment

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB cluster connection string, server only |
| `MONGODB_DB` | `jnr` |
| `AWS_REGION` | `us-east-1` for the provisioned bucket |
| `AWS_S3_BUCKET` | `jnr-party-media-c431a7417205` |
| `AWS_ACCESS_KEY_ID` | Server-side AWS credential |
| `AWS_SECRET_ACCESS_KEY` | Server-side AWS credential |
| `HOST_PASSWORD` | At least 12 characters; required for host exports |
| `APP_ORIGIN` | Exact deployed origin, e.g. `https://your-project.vercel.app`, no trailing slash |
| `NEXT_PUBLIC_GOOGLE_FORM_URL` | Optional link for additional photo uploads |
| `NEXT_PUBLIC_DRIVE_FOLDER_URL` | Optional backup album link |

Never prefix database, host, or AWS secrets with `NEXT_PUBLIC_`.

## Deploy to Vercel

1. Create your Git repository and push this project (do not include `.env.local`).
2. Import the repository into Vercel. Select Next.js; use the default install/build settings and Node 24.
3. Add the server environment variables listed above to Vercel, using the values from local `.env.local`. Add optional public links before building.
4. Deploy. Set `APP_ORIGIN` in local `.env.local` to the final Vercel origin.
5. Run `npm run setup:s3` locally. This configures CORS for localhost and that exact origin on the existing bucket. Run again if the domain changes. Preview deployment domains must be explicitly configured if you want uploads there.
6. Test using two devices, including an actual photo and video upload. Print the QR table card from Upload after deployment.

No Firebase, Netlify, Google sign-in, or guest accounts are required.

## Game

- 75 original cards: 40 truths and 35 dares.
- Maximum two completed truths, two completed dares, and one swap per guest session.
- Truths require a nonblank answer; dares require uploaded media. A swap asks for a sip of any drink, including water, and appears on the Wall. Draw another card after swapping.
- Photos up to 20 MB and videos up to 100 MB upload directly to S3 with short-lived signed POST policies. Original bytes are retained. MongoDB stores references, not media bytes.
- Private media is shown through signed links. HEIC/HEIF originals open as download links because browser support varies; videos depend on browser codec support.
- The Wall refreshes every eight seconds and shows the latest 100 entries, scanning up to 1,000 guests. This is designed for a single private party.
- Ranking sorts by completed dare count, then total elapsed seconds. The top three titles are Legend, Troublemaker, and Party Menace. Time starts when the card is drawn and includes upload time.
- Guest identity uses an HTTP-only cookie. Limits apply per browser session, not verified person; clearing cookies or switching browsers creates a new guest. The app is intended for guests who have the party link, and the Wall is visible to anyone with that link.

## Host / backup

Open `/#host` and enter `HOST_PASSWORD` to load all media or export JSON. Export includes object keys and temporary signed download links (one-hour validity). Reload to regenerate expired links. You can download the entire collection directly from the dedicated S3 bucket using AWS tools. The app does not automatically delete memories after the party. Unfinished uploads can remain in the bucket and can be removed manually after the event.

## AWS setup

`scripts/create-bucket.mjs` creates a dedicated bucket only when `AWS_S3_BUCKET` is absent. Otherwise it configures the existing named bucket. It enables all public-access blocks, bucket-owner-enforced ownership, AES-256 default encryption, and explicit CORS origins. Existing Bloodhound resources are not modified. Current credentials were copied from Bloodhound into the ignored local environment.

For deployment, AWS credentials need GetObject, PutObject, and HeadObject access (HeadObject uses the GetObject IAM action) to this bucket's objects. Running the setup script additionally requires bucket configuration permissions.

## Validation

```sh
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:integration
```

Integration tests start a temporary local MongoDB and production Next server, exercise validations, limits, Wall sync, host protection, real S3 upload/read and private-access checks, then run a mobile browser flow. They require the AWS environment; they create and remove a small test object in the dedicated bucket and do not write to the configured production MongoDB database. A screenshot is saved in ignored `work/`.

MongoDB setup creates the `players` collection and indexes in `jnr` without changing other databases. Concurrent game submissions use optimistic version checks to prevent double completion.
