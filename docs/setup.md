# One-time setup: GitHub Actions and Cloudflare Pages

Two things only the repo owner can do. Together they take about ten minutes. Button
labels in the Cloudflare dashboard change from time to time, so if one doesn't match
exactly, look for the closest equivalent.

## 1. Let GitHub Actions push commits

The nightly data job commits refreshed NAV data back to `main` using the built-in
`GITHUB_TOKEN`. By default that token can only read. You can do this step now.

1. Open <https://github.com/MaxRecursion/DataDrivenSIP/settings/actions>.
2. Scroll down to **Workflow permissions**.
3. Select **Read and write permissions**.
4. Leave **Allow GitHub Actions to create and approve pull requests** unticked. The app
   doesn't need it.
5. Click **Save**.

One thing to avoid: don't add a branch protection rule or ruleset on `main` that requires
pull requests. The nightly job pushes to `main` directly. If you ever want protection,
tell me first and I'll adjust the job.

## 2. Connect Cloudflare Pages

Cloudflare builds the site from this repo and gives every pull request its own preview
URL.

**When to do it:** after I post the Phase 1 pull request link. Connecting starts a build
of `main` straight away. Until Phase 1 is merged, `main` has no app, so that first build
fails. The failure is harmless, but waiting avoids the confusion.

**You need** a free Cloudflare account. Sign up at <https://dash.cloudflare.com/sign-up>
if you don't have one.

### It must be a Pages project, not a Worker

Cloudflare's dashboard now pushes Git imports towards **Workers**, so it's easy to end up
with a Worker by mistake. A Worker's URL looks like
`yourproject.youraccount.workers.dev`; a Pages URL looks like `yourproject.pages.dev`.

The difference matters here. When a visitor opens a fund code that doesn't exist:

- **Pages** returns a real 404, because the build writes `dist/data/404.html`, and the app
  shows "not covered".
- **Workers static assets** ignores that file, returns the page shell with a 200, and
  attaches the one-year immutable cache header. The visitor's browser then caches HTML at
  a JSON URL for a year.

This was tested during Phase 0. If you already created a Worker, leave it or delete it, but
create the Pages project separately.

### Create the project

1. Go to <https://dash.cloudflare.com> and open **Workers & Pages** in the left sidebar.
   It may sit under **Compute**.
2. Click **Create application** and look for a **Pages** tab or a "Looking to deploy Pages?"
   link, then choose **Connect to Git** (sometimes **Import an existing Git repository**).
   If the Pages option is hidden, go straight to
   <https://dash.cloudflare.com/?to=/:account/pages/new/provider/github>.
   Stop if the flow is about to create a Worker: the final screen should say Pages, and the
   resulting URL should end in `.pages.dev`.
3. Click **Connect GitHub**, or **+ Add account** if you've connected GitHub before. GitHub
   opens the **Cloudflare Workers and Pages** app page.
   - Choose the **MaxRecursion** account.
   - Under **Repository access**, pick **Only select repositories** and select
     **DataDrivenSIP**.
   - Click **Install & Authorize**.
4. Back in Cloudflare, select **MaxRecursion / DataDrivenSIP** and click **Begin setup**.
5. Fill in the build settings exactly like this:

   | Field | Value |
   |---|---|
   | Project name | `sip-date-planner` (the site becomes `sip-date-planner.pages.dev`; pick another name if it's taken) |
   | Production branch | `main` |
   | Framework preset | `None` |
   | Build command | `pnpm build` |
   | Build output directory | `dist` |
   | Root directory (under Advanced) | leave empty |
   | Environment variables | none — don't add any |

6. Click **Save and Deploy**.

You don't need to set a Node or pnpm version. The repo pins both: Node through
`.node-version`, pnpm through `packageManager` in `package.json`.

### Check two settings

In the project, open **Settings → Builds**:

- **Branch control:** production branch `main`. **Preview branch:** **All non-production
  branches**, which is the default. Automatic deployments should be enabled.
- **Build system version:** the latest (v3).

### Tell me

Reply with the `*.pages.dev` URL. On the Phase 1 pull request you'll then see a
**Cloudflare Pages** check with a preview link. I'll use it to verify routing, cache
headers and the data 404 behaviour against real Cloudflare.

### If something goes wrong

- **The repo isn't listed in step 4.** Open <https://github.com/settings/installations>,
  click **Configure** next to **Cloudflare Workers and Pages**, add **DataDrivenSIP** under
  repository access, then reload the Cloudflare page.
- **A build fails.** Open the failed deployment in Cloudflare, copy the build log, and send
  it to me. The first build of `main`, before Phase 1 merges, is expected to fail.
