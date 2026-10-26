# Deploying the web version

The web version is a static site: files, no server code. It is uploaded to Scaleway Object Storage and served from there, at the address SSK Canon had: https://ssk-canon.s3-website.fr-par.scw.cloud/. It replaces the Angular PWA in the same bucket (scoping 2026-051 of the `ssk-it/ssk-canon` specification).

`.github/workflows/deployment.yml` runs on every merge to `main`, and by hand through `workflow_dispatch` on `main`. It has two jobs:

- **Build**, with no secret: installs the dependencies and runs `pnpm build:web`, then hands `dist-web/` over as an artifact.
- **Deploy**, under the `production` environment: downloads the artifact and uploads it with the AWS CLI of the runner image. No code of the repo or of its dependencies runs where the credentials are.

Both run on GitHub's runners, like the checks: the repo is public, and ssk-it's own machines take no job from it.

The site has no version number: the bar at the bottom shows the commit built, from `GITHUB_SHA`, which `vite.config.ts` writes in at build time (`VITE_VERSION`).

The desktop application does not go through here: it is built and published from its private repo.

## What holds a deployment back

The `production` environment:

- **accepts the `main` branch only** — a run started on another branch never gets the credentials;
- **waits for a reviewer's approval** before the deploy job starts — a merge is not a deployment until someone says so;
- **lets no administrator bypass** these rules.

The workflow takes no input naming another reference: it would check out code the environment never approved, under its secrets. Rolling back is a revert on `main`, then an approved deployment.

## Configuration

Carried by the `production` environment, never by the repo itself.

| Name             | Type     | Content                                 |
| ---------------- | -------- | --------------------------------------- |
| `SCW_ACCESS_KEY` | secret   | Access key of the IAM application       |
| `SCW_SECRET_KEY` | secret   | Secret key, shown only once by Scaleway |
| `SCW_BUCKET`     | variable | `ssk-canon`                             |
| `SCW_REGION`     | variable | `fr-par`                                |

**The setup is done by the maintainers, outside this repo.** The key belongs to the Scaleway IAM application `skanon-deploiement` — not a user, so that it is tied to nobody who could leave the organisation —, whose policy grants nothing but reading, writing and deleting objects in the bucket's project. Its secret goes straight into the `production` environment, never shown.

**A Scaleway IAM permission covers a whole project**, never a single bucket: the deployment key acts on every object of the `ssk-it` project. Only a bucket policy would narrow it, and the setup writes none — see below.

Renewing the key means creating a new one, replacing both secrets of the environment, then revoking the old key in the console.

## The bucket

A static website, whose index document and error document both point to `index.html`: the application's routes (`/ssk-it/ssk-canon/cadrages/2026-051`) do not exist as files, and must return the index. The error document is served with a 404 status: the browser shows the application, an indexing robot sees a missing page.

**Public read-only, and nothing else.** A policy allowing writes would let someone replace a script with hostile code, served under the application's address, that would read the token in every user's storage. The policy grants only `s3:GetObject`; `s3:ListBucket` is not in it, since listing reveals the files of previous versions.

**Nothing confidential goes into the bundle.** The token is typed by the user and stays in their browser. Publishing the bundle amounts to publishing the code of the interface, as for any web application.

**No security headers**: a bare bucket returns only what is stored per object — no content security policy, no HSTS. Sanitising Markdown with `dompurify` is therefore the only barrier against hostile content from a repo.

**The bucket policy is never written by the deployment setup.** It also serves the specification's pages: on 20 October 2026, a statement added for the deployment application, its principal written as a string where Scaleway writes an array, made the bucket unevaluable — 500 on every request, two hours without a site — and a policy put back without the owner then locked the owner's own console out. Any bucket policy starts with the statement Scaleway puts there itself, the owner with full access, and is tried on a test bucket first.

## Three cache policies

A single one would break them all.

- **Hashed files** — all of `assets/`: their name carries the fingerprint of their content, and a changed content arrives under another name. Immutable, cached for a year.
- **Images with a stable name** — icons, logos. A replaced logo must show: one day, then revalidation.
- **Entry points** — `index.html`, the manifest, the service workers. They decide which version loads; cached, they would freeze browsers on the old one despite a successful deployment, with nothing to tell. Never cached, and **uploaded last**: until they are, the previous version is served whole.

Nothing is deleted: `sync --delete` would remove files of a version still requested by an open tab. Cleaning up old files is the job of a lifecycle rule on the bucket.

## Taking over from the old PWA

Some writers installed SSK Canon from Chrome. Its service worker serves the application from its cache, and would have served it forever had nothing taken over. Two gestures do, at every deployment, harmless once done:

- **`ngsw.json` is removed from the bucket** — the deployment's only deletion. Angular's service worker reads this file to know which version to serve; once it answers 404, it unregisters itself.
- **Skanon uploads an `ngsw-worker.js`**, at the address of the script that existing registrations check again on every navigation ([development.md](development.md#the-installable-web-version)).

The manifest keeps the address, the scope and the start address of SSK Canon's: Chrome holds the application installed as the same one, and renames it Skanon instead of losing it.
