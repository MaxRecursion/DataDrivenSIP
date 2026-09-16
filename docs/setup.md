# One-time setup: GitHub Actions and Cloudflare

Both parts are done. This is now a record of how the project is wired, plus the one piece
of tidying still outstanding.

## 1. GitHub Actions can push commits — done

The nightly data job commits refreshed NAV data back to `main` with the built-in
`GITHUB_TOKEN`, which needs write permission. Confirmed set under Settings → Actions →
General → Workflow permissions.

One thing to avoid: don't add a branch protection rule or ruleset on `main` that requires
pull requests. The nightly job pushes to `main` directly. If you ever want protection, tell
me first and I'll adjust the job.

## 2. Cloudflare — done, on Workers rather than Pages

The site is deployed by **Cloudflare Workers Builds** from this repo:

- **Project:** `sip-date-planner`
- **Production:** <https://sip-date-planner.kulkarniakshay1989.workers.dev>
- **Previews:** `*-sip-date-planner.kulkarniakshay1989.workers.dev`, one per branch

The plan originally called for Cloudflare Pages, because Pages returns a real 404 for a
missing file in a subdirectory. Cloudflare's dashboard now steers Git imports to Workers,
and Workers is where their investment goes, so the project pivoted (PLAN.md D20). The one
behaviour we lose is handled in code: fund data is fetched from a path that carries the
data version, and the client checks the content type before parsing.

`wrangler.jsonc` in the repo root defines the deployment. It has no `main`, so no server
code runs; it only serves the files in `dist`.

### Still to do: delete the stray Worker

An earlier attempt created a second Worker called **`datadrivensip`**, still connected to
this repo. It has no config to build from, so it fails on every pull request and adds a red
check. Delete it:

1. Go to <https://dash.cloudflare.com> → **Workers & Pages**.
2. Open **datadrivensip** → **Settings** → scroll to the bottom → **Delete**.

Nothing depends on it. `sip-date-planner` is the live project.

### Checking the deployment from the terminal

`wrangler` is signed in, so the dashboard isn't needed for day-to-day checks:

```bash
pnpm exec wrangler deployments list
```

To serve the production build locally with the same routing Cloudflare uses:

```bash
pnpm build && pnpm exec wrangler dev
```
