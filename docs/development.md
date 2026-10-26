# Development

## The source tree

```
src/                    The interface, shared by the web version and the desktop application (INV-9)
  main.ts               The web version's composition root: its adapters, its extensions
  startup.ts            Startup, which each root calls: platform, extensions, tokens, router
  extension/            The extension contract, and its composition (ADR-extensions-commerciales)
  web/                  The web version's extension: its host, its service worker, its licence
  platform/             The ports towards the system, and the browser adapter
  router.ts             The routes, all under /:owner/:repo/; their headings in router.messages.ts
  App.vue               The shell: the top bar, the banners, the dialog host
  styles.css            The style tokens: the Material 3 colours (--mat-sys-*), the product's (--pc-*)
  core/                 The core of the interface, without components
    signals.ts          signal(), computed(), effect() on Vue's reactivity
    injection.ts        inject() and provide(): one instance per service
    i18n/               The display language and the typed catalogues, French and English (RG-langue-choisie)
    http/               The HTTP client on fetch, and its test fake
  ui/                   The kit that stands in for Angular Material: buttons, fields, menus, dialogs
  features/             The views, one folder per domain
    shared/             What several views share: loading state, dialogs, Markdown
tools/pwa/              What only the web version publishes: manifest, icons, service worker, SSK Canon handover
public/                 The logo, copied as is into the deliverable
```

## Vocabulary

That of SSK Canon, which the interface takes over as is: **specification** (_référentiel_), **domain**, **feature**, **business rule** (`RG-…`), **scoping** (_cadrage_, `2026-047`), **decision**, **impact** (`cree`, `modifie`, `abroge`, `touche`), **status**. A **scoping repo** (_dépôt de projet_) holds a product's specification; a **code repo** implements it. The **target** is the system the interface runs on: `web` here, `bureau` in the desktop application, which builds this same code from its repo (see below). Each term, as the format writes it and as the code names it: [glossary.md](glossary.md).

## The package

This repo is also a package, `@ssk-it/skanon`, which the desktop application consumes from a private repo (ADR-extensions-commerciales). It pins it to a commit:

```json
"@ssk-it/skanon": "github:ssk-it/skanon-web#<commit>"
```

The package serves its sources as they are, `.ts` and `.vue`: whoever consumes it compiles them with its own. What it may import is its API, and nothing else: the `exports` field of `package.json` — the extension contract, the ports, injection, the interface kit, a few services and test fakes. Vue, `vue-router` and `@vue/reactivity` are peer dependencies: a single Vue instance, the consumer's. So is `@ssk-it/canon-check`, which the consumer declares and pins itself: pnpm refuses a dependency pulled from Git below the first level (`blockExoticSubdeps`). Finally, the consumer defines `VITE_TARGET` and `VITE_VERSION` in its Vite configuration, and their types (`src/env.d.ts`). Widening `exports` or changing one of its entries is a decision ([practices.md](practices.md#what-belongs-to-the-deliverable-extensions)).

## Running

```bash
pnpm dev:web
```

The interface alone, on port 1430, with the browser adapter.

## Everyday tasks

A single test file, then watch mode:

```bash
pnpm vitest run --project jsdom src/core/signals.test.ts
pnpm test:watch src/core/http
```

The jsdom tests' coverage, written to `coverage/` (`lcov.info` and an HTML report):

```bash
pnpm test:coverage
```

Headless browser tests (Playwright's WebKit):

```bash
pnpm test:browser
```

A core service is requested through `inject`, and substituted in a test through `provide`:

```ts
import { inject } from "../injection";
import { HttpClient } from "../http/http";

export class GithubClient {
  private readonly http = inject(HttpClient);
}
```

```ts
const http = provideHttpTesting();
const pending = inject(GithubClient).loadTree(repoRef);
http
  .expectOne((r) => r.url.includes("/git/trees/"))
  .flush({ sha: "abc", tree: [] });
await pending;
```

A request is only registered when the client emits it: if the caller awaits a promise first — a queue, a cache consulted first —, `await settle()` lets the microtasks through.

### Adding a view

A component `src/features/<domain>/<Name>Page.vue`, a route in `src/router.ts` under `/:owner/:repo/`, lazy-loaded (`component: () => import(…)`), its heading in each language in `src/router.messages.ts`. The page title carries the project and the item being viewed. Its texts go in a catalogue next to it, `<name>.messages.ts`, in French and English ([conventions.md](conventions.md#interface)).

The view is built with the kit of `src/ui/` — `UiButton`, `UiIcon`, `UiTextField`, `UiSelect`, `UiCheckbox`, `UiAutocomplete`, `UiMenu`, `UiSpinner`, `UiProgressBar` —, each component stating its use at the top of its file. Colours are the `--mat-sys-*` and `--pc-*` variables of `src/styles.css`, under the names they had in SSK Canon. A link to an outside address goes through `ExternalLink`: a `target="_blank"` does not open in an embedded web view, such as the desktop application's. Loading, error and empty repo are handled by `ViewState`, in `src/features/shared/`; an empty repo leads to the bootstrap assistant, `BootstrapWizard`, which the home page also reaches through `CreateSpecification`.

### Opening a dialog

A dialog is a component that receives `data` as a prop, emits `close(result)`, and takes its structure — title, scrolling content, actions — from `UiDialog`. `DialogService` opens it and returns a promise: the emitted result, or `undefined` if the dialog is closed by Escape or by a click on the backdrop. `UiDialogHost`, mounted once in `App.vue`, displays it and traps focus in it.

```vue
<script setup lang="ts">
const props = defineProps<{ data: { name: string } }>();
const emit = defineEmits<{ close: [confirmed?: boolean] }>();
</script>

<template>
  <UiDialog :title="`Supprimer ${props.data.name} ?`">
    <p>Ce qui sera perdu.</p>
    <template #actions>
      <UiButton @click="emit('close', false)">Annuler</UiButton>
      <UiButton variant="filled" @click="emit('close', true)"
        >Supprimer</UiButton
      >
    </template>
  </UiDialog>
</template>
```

```ts
const confirmed = await inject(DialogService).open<boolean>(DeleteDialog, {
  data: { name: "RG-limite" },
});
```

## The installable web version

The web version (`pnpm build:web`) is an installable application, which takes SSK Canon's place at the same address for those who had installed it from Chrome. The `tools/pwa/pwa.ts` plugin, wired into the build in `vite.config.ts`, adds:

- **the manifest** `/manifest.webmanifest` and its icons, taken over from SSK Canon under the name Skanon. The address, the `scope`, the `start_url` and the `protocol_handlers` (`web+canon` → `/ouvrir?lien=%s`) do not change: they are how Chrome recognises the installed application, and it updates it instead of losing it. The `manifest`, `apple-touch-icon` and `theme-color` tags are added to `index.html`;
- **the service worker** `/sw.js` (`tools/pwa/sw.js`). On installation it precaches everything the version publishes — scripts, stylesheets, fonts, `index.html`, icons —, then serves each file from its cache, and `index.html` for every navigation within the application. The plugin writes into it the list of files and the version's fingerprint: a new version changes the script, and the browser installs it next to the old one, which serves the page until the author reloads from the banner (RG-nouvelle-version-proposee);
- **the handover** `/ngsw-worker.js` (`tools/pwa/ngsw-worker.js`). Browsers where SSK Canon is installed have a registration whose script bears this name, and recheck it on every navigation: they install the handover, which clears Angular's caches (`ngsw:*`) and unregisters the registration. The next navigation receives Skanon, which registers `/sw.js`.

The service worker is registered only by the built web version (`src/platform/web.ts`): not by the development server, nor the tests, nor the desktop application. Versions are announced through the `VersionAnnouncer` port of `src/platform/ports.ts`, which `VersionService` (`src/core/ui/version.service.ts`) listens to and the banner of `App.vue` displays; the desktop application provides its own announcer.

## Tooling pitfalls

- **Under pnpm's global store**, `node_modules` leads outside the repo, and Vite's server refuses to serve a file from there: a font goes missing with no visible error. `server.fs.allow` in `vite.config.ts` opens it.
- **`data:` images** are refused by a `default-src 'self'` content security policy, the desktop application's: `assetsInlineLimit: 0` always emits them as files.
- **The handover takes two loads.** The first is still served by Angular's service worker, from its cache; it is after that load that the browser rechecks the registered script and installs the handover. An author who had the application open therefore sees Skanon on the second load.

## Checks

`.github/workflows/controles.yml`, on every pull request, on GitHub's runners: the repo is public, and the code of a pull request coming from a fork must not run on any ssk-it machine. The interface job runs the tests with coverage and hands it to SonarCloud (`sonar-project.properties`), when the `SONAR_TOKEN` secret is there — never for a pull request from a fork; SonarCloud's automatic analysis is off, since it cannot coexist with this one. The browser job runs in Playwright's image, `mcr.microsoft.com/playwright:v<version>-noble`: its tag follows the `playwright` version of `package.json`, and is bumped with it.

## What must be green before a pull request

In this order, fastest first:

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
pnpm test:browser && pnpm build:web
```

Fix locally with `pnpm lint --fix`, then `pnpm format` — lint then format, otherwise the formatter rejects what lint rewrote.
