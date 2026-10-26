<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { GithubClient, type RepoRef } from "./core/github/github-client";
import { IdentityService } from "./core/github/identity.service";
import { TokenService } from "./core/github/token.service";
import { inject } from "./core/injection";
import { PLATFORM } from "./platform/platform-token";
import { LinksService } from "./core/repo/links.service";
import { COMPOSITION } from "./extension/composer";
import type { Contribution } from "./extension/extension";
import { SpecificationStore } from "./core/repo/specification.store";
import { APPLICATION } from "./core/repo/title.strategy";
import { ThemeService } from "./core/ui/theme.service";
import { VersionService, isInputUrl } from "./core/ui/version.service";
import { INSTALLATION_FAILED_MESSAGE } from "./features/shared/version-causes";
import { INSTALLATION_FAILED } from "./platform/ports";
import { openSignIn } from "./features/shared/open-sign-in";
import ProjectSymbol from "./features/shared/ProjectSymbol.vue";
import { DialogService } from "./ui/dialog.service";
import UiProgressBar from "./ui/UiProgressBar.vue";
import UiButton from "./ui/UiButton.vue";
import UiDialogHost from "./ui/UiDialogHost.vue";
import UiIcon from "./ui/UiIcon.vue";

/**
 * The shell: the top bar, the status banners, the dialog host, the route's view and the bottom bar.
 */

/** Product name, as shown in the bar. */
const PRODUCT_NAME = APPLICATION;

const MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);

const store = inject(SpecificationStore);
const tokens = inject(TokenService);
const github = inject(GithubClient);
const identity = inject(IdentityService);
const theme = inject(ThemeService);
const links = inject(LinksService);
const dialog = inject(DialogService);
const version = inject(VersionService);
/** What the deliverable adds to the shell, without the shell knowing what it is (ADR-extensions-commerciales). */
const composition = inject(COMPOSITION);

function isVisible(contribution: Contribution): boolean {
  return contribution.visible?.() ?? true;
}
/** Where secrets live differs by target (INV-8): the vault banner says so. */
const platform = inject(PLATFORM);
const onDesktop = platform.target === "bureau";

/** The version this window runs; silent while it is not known, and if the platform cannot tell it. */
const currentVersion = ref<string | null>(null);
platform.loadVersion().then(
  (v) => (currentVersion.value = v),
  () => undefined,
);
const route = useRoute();
const router = useRouter();

function segmentsOf(path: string): string[] {
  return (path.split(/[?#]/)[0] ?? "").split("/").filter(Boolean);
}

/**
 * True when the address designates a project.
 *
 * On the picker screen, no repo is open: the tabs, the reload and the settings would have nothing to designate there. Derived from the address, the only one to know where we are — the browser's memory, for its part, keeps the last opened project even after one has left it. A project address carries at least `/organisation/depot`.
 */
const inProject = computed(() => segmentsOf(route.path).length >= 2);

/**
 * A link is active when the current address starts with its own, like `routerLinkActive`: the Fonctionnel tab stays lit on a rule's page. Vue's `RouterLink` only compares nested routes, and a project's views are siblings.
 */
function isActive(path: string): boolean {
  const link = segmentsOf(path);
  const current = segmentsOf(route.path);
  return link.every((s, i) => current[i] === s);
}

/**
 * Completes a pending sign-in.
 *
 * The specification is not loaded here: the address says which repo to open, and the route guard takes care of it. But identity settings live in the specification, hence the wait before handling the issuer's return.
 */
async function start(): Promise<void> {
  await store.waitReady();

  if (await identity.completeReturn()) {
    // The address still carries the code: leaving it would replay the return on the slightest reload, with an already consumed code.
    history.replaceState(null, "", location.pathname);
    if (!identity.error()) await store.loadSpecification();
  }
}
void start();

/**
 * The icon shows the current state, not the action to come.
 *
 * A button that shows where one is going reads backwards as soon as it has three states: the « soleil » icon would sometimes mean "we are in light mode", sometimes "switch to light mode". The label, for its part, carries the action.
 */
const themeIcon = computed(() => {
  switch (theme.theme()) {
    case "clair":
      return "light_mode";
    case "sombre":
      return "dark_mode";
    default:
      return "contrast";
  }
});

const themeLabel = computed(() => {
  switch (theme.theme()) {
    case "clair":
      return "Thème clair — cliquer pour le thème sombre";
    case "sombre":
      return "Thème sombre — cliquer pour suivre le système";
    default:
      return "Thème du système — cliquer pour le thème clair";
  }
});

/**
 * The project name is shown only if it adds something: when it is identical to the product name, repeating it only takes up space.
 */
const distinctProjectName = computed(() => {
  const name = store.specification().project.name?.trim();
  if (!name) return null;
  // the product name is written once, in the template: comparing it here keeps a renaming from leaving a duplicate in the bar
  return name.toLowerCase() === PRODUCT_NAME.toLowerCase() ? null : name;
});

const repoLabel = computed(() => {
  const d = store.repoRef();
  return `${d.owner}/${d.repo}`;
});

/**
 * The same view, in another repo.
 *
 * Switching project while browsing scopings must show the other project's scopings, not bring it back to its home. A detail view, on the other hand, falls back to its list: a scoping or rule identifier does not necessarily exist elsewhere, and leading to an empty page would be worse than promising nothing.
 */
function sameViewElsewhere(repoRef: RepoRef): string {
  const view = segmentsOf(route.fullPath)[2] ?? "referentiel";
  return `/${repoRef.owner}/${repoRef.repo}/${view}`;
}

/**
 * Dialogs are loaded when opened, not at startup: they carry the repo input and the token input, a weight the bar would impose on everyone for two buttons one does not always click.
 */
function openRepoDialog(): void {
  void import("./features/shared/RepoDialog.vue").then(
    async ({ default: RepoDialog }) => {
      const repoRef = await dialog.open<RepoRef>(RepoDialog, {
        focus: "dialogue",
      });
      if (repoRef) void router.push(sameViewElsewhere(repoRef));
    },
  );
}

/** The passkey banner takes over when the browser would not request it without a click. */
function unlockTokens(withoutGesture = false): void {
  const open = withoutGesture ? tokens.unlockWithoutGesture() : tokens.unlock();
  void open.then((issue) => {
    if (issue === "ouvert") void store.loadSpecification();
  });
}

function protectTokens(): void {
  void tokens.protect();
}

/** What the passkey banner has to say: tokens to open, a project that requires it, or a protection that did not succeed. */
const passkeyBanner = computed<"verrouille" | "exigee" | "en-clair" | null>(
  () => {
    if (tokens.locked()) return "verrouille";
    if (tokens.noAccess()) return null;
    if (tokens.form() === "session") return "exigee";
    const failure = tokens.passkeyFailure();
    if (
      tokens.form() === "en-clair" &&
      (failure === "annule" || failure === "impossible")
    )
      return "en-clair";
    return null;
  },
);

function openTokenDialog(): void {
  void openSignIn().then((change) => {
    if (change) void store.loadSpecification();
  });
}

/** The shortcut as it is pressed on this machine: ⌘ on Mac, Ctrl elsewhere. */
const searchShortcut = MAC ? "⌘K" : "Ctrl+K";

/** Avoids opening two palettes while the first one is still loading. */
let searchOpen = false;

function onKeydown(e: KeyboardEvent): void {
  const modifierKey = MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (!modifierKey || e.altKey || e.shiftKey || e.key.toLowerCase() !== "k")
    return;
  if (!inProject.value) return;
  // The browser reserves this shortcut for its own search bar: we take it back, since we are in a project where searching makes sense.
  e.preventDefault();
  openSearch();
}

/**
 * The search palette — RG-recherche-a-portee-de-clavier.
 *
 * Loaded when opened, like the other dialogs: not everyone searches, and the index it builds only costs whoever opens it. It does not open over another dialog: an input in progress would be hidden there without being abandoned.
 */
function openSearch(): void {
  if (searchOpen || dialog.openDialogs().length) return;
  searchOpen = true;
  const view = segmentsOf(route.fullPath)[2];
  void import("./features/search/SearchPalette.vue")
    .then(async ({ default: SearchPalette }) => {
      await dialog.open(SearchPalette, {
        data: { onPastState: view === "evolution" },
        width: "640px",
        maxWidth: "calc(100vw - 32px)",
        top: "12vh",
        className: "palette-recherche",
        label: "Rechercher dans le référentiel",
      });
      searchOpen = false;
    })
    .catch(() => (searchOpen = false));
}

/** Like `closeOnNavigation`: going back or forward in history closes open dialogs. */
function onHistory(): void {
  dialog.closeAll();
}

onMounted(() => {
  document.addEventListener("keydown", onKeydown);
  window.addEventListener("popstate", onHistory);
  if (tokens.locked()) unlockTokens(true);
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown);
  window.removeEventListener("popstate", onHistory);
});

/**
 * The quota deserves a warning before it runs out: once at zero, the application loads nothing more for an hour.
 */
const quotaLow = computed(() => {
  const remaining = github.quotaRemaining();
  return remaining !== null && !tokens.present() && remaining <= 15;
});

const tokenTitle = computed(() =>
  tokens.present()
    ? "Connecté à GitHub " + tokens.fingerprint()
    : quotaLow.value
      ? "Quota bientôt épuisé — se connecter"
      : "Se connecter à GitHub",
);

/** The date of a read, to the minute: enough to judge how old it is. */
function formatReadDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

const unconfirmed = computed(() => store.unconfirmed());

const progression = computed(() => {
  const p = store.progression();
  return p ? (p.loadedCount / p.total) * 100 : null;
});

function reloadSpecification(): void {
  void store.loadSpecification();
}

/** True on a page where reloading would wipe an input in progress. */
const onInput = computed(() => isInputUrl(route.fullPath));

function reloadVersion(): void {
  void version.reloadVersion();
}
</script>

<template>
  <header class="barre">
    <RouterLink class="marque" to="/">
      <!-- The chevron takes the bar's text colour; only the axis keeps its hue, to stay recognisable in both themes. -->
      <svg
        class="logo"
        viewBox="0 0 64 64"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="46" y="13" width="8" height="38" rx="4" fill="#00e0b8" />
        <path
          d="M13 17 L31 32 L13 47"
          fill="none"
          stroke="currentColor"
          stroke-width="8.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="nom">Skanon</span>
      <!-- Without an identity, nothing is added here: the organisation's avatar would not designate the project, and it is already in the repo button. -->
      <template v-if="distinctProjectName">
        <ProjectSymbol
          :repo-ref="store.repoRef()"
          :size="20"
          fallback="aucun"
          background="sombre"
        />
        <span class="projet">{{ distinctProjectName }}</span>
      </template>
    </RouterLink>

    <!--
      A project's views make no sense outside a project: on the picker screen, they would have no repo to lead to.

      « Fonctionnel » and « Architecture » are the specification's two entries, of equal rank: architecture is a kind it carries, not a side matter. Naming them « Référentiel » and « Architecture » would have taught the opposite to whoever reads this menu before anything else.

      Neither of them depends on what the repo carries: an entry that comes and goes with the open project makes it impossible to tell "this project describes nothing" from "the application cannot do that". Emptiness is handled in the page, which knows how to explain it.
    -->
    <nav v-if="inProject" class="onglets">
      <RouterLink
        :to="links.path('referentiel')"
        :class="{ actif: isActive(links.path('referentiel')) }"
        >Fonctionnel</RouterLink
      >
      <RouterLink
        :to="links.path('architecture')"
        :class="{ actif: isActive(links.path('architecture')) }"
        >Architecture</RouterLink
      >
      <RouterLink
        :to="links.path('cadrages')"
        :class="{ actif: isActive(links.path('cadrages')) }"
        >Cadrages</RouterLink
      >
      <RouterLink
        :to="links.path('evolution')"
        :class="{ actif: isActive(links.path('evolution')) }"
        >Évolution</RouterLink
      >
    </nav>

    <span class="separateur"></span>

    <template v-if="inProject">
      <!-- An icon, not a full-rank entry: search leads elsewhere, it is not a place (2026-042, decision 01). It remains the only door on a screen without a keyboard. -->
      <UiButton
        variant="icon"
        class="recherche"
        :title="'Rechercher (' + searchShortcut + ')'"
        aria-label="Rechercher dans le référentiel"
        aria-keyshortcuts="Meta+K Control+K"
        @click="openSearch()"
      >
        <UiIcon name="search" />
      </UiButton>
      <UiButton
        class="depot"
        title="Changer de dépôt"
        @click="openRepoDialog()"
      >
        <ProjectSymbol :repo-ref="store.repoRef()" :size="20" />
        <span class="libelle">{{ repoLabel }}</span>
      </UiButton>
      <!-- The application shows of the repo only what it can read: issues, pull requests and settings stay on GitHub. The link leads there in one click, in the browser, so as not to lose the current view. -->
      <UiButton
        variant="icon"
        :href="links.toGithub()"
        :title="'Ouvrir ' + repoLabel + ' sur GitHub'"
        :aria-label="'Ouvrir ' + repoLabel + ' sur GitHub'"
      >
        <UiIcon name="open_in_new" />
      </UiButton>
      <UiButton
        variant="icon"
        class="recharger"
        :disabled="store.state() === 'chargement'"
        title="Recharger depuis GitHub"
        aria-label="Recharger depuis GitHub"
        @click="reloadSpecification()"
      >
        <UiIcon name="refresh" />
      </UiButton>
    </template>

    <template v-for="action in composition.toolbarActions" :key="action.id">
      <UiButton
        v-if="isVisible(action)"
        variant="icon"
        :class="{ alerte: action.alert?.() }"
        :title="action.title()"
        :aria-label="action.label"
        @click="action.activate()"
      >
        <UiIcon :name="action.icon()" />
      </UiButton>
    </template>

    <UiButton
      variant="icon"
      :class="{ alerte: quotaLow }"
      :title="tokenTitle"
      :aria-label="
        tokens.present() ? 'Connecté à GitHub' : 'Se connecter à GitHub'
      "
      @click="openTokenDialog()"
    >
      <UiIcon :name="tokens.present() ? 'lock' : 'lock_open'" />
    </UiButton>

    <UiButton
      variant="icon"
      :title="themeLabel"
      :aria-label="themeLabel"
      @click="theme.toggle()"
    >
      <UiIcon :name="themeIcon" />
    </UiButton>

    <!-- RG-aide-a-portee: help is not a view of a project but a door, like the magnifier; it is present everywhere, home included. -->
    <UiButton
      variant="icon"
      to="/aide"
      :class="{ actif: isActive('/aide') }"
      title="Fonctionnement de Skanon"
      aria-label="Fonctionnement de Skanon"
    >
      <UiIcon name="help" />
    </UiButton>

    <!-- Settings belong to the project, not to browsing: their place is next to the repo, not among the specification's views. -->
    <UiButton
      v-if="inProject"
      variant="icon"
      :to="links.path('reglages')"
      :class="{ actif: isActive(links.path('reglages')) }"
      title="Réglages du projet"
      aria-label="Réglages du projet"
    >
      <UiIcon name="settings" />
    </UiButton>
  </header>

  <div
    v-if="quotaLow"
    class="bandeau-quota"
    :class="{ epuise: github.quotaRemaining() === 0 }"
  >
    <UiIcon :name="github.quotaRemaining() === 0 ? 'error_outline' : 'info'" />
    <p>
      <template v-if="github.quotaRemaining() === 0">
        Plus aucune requête GitHub disponible pour cette heure.
      </template>
      <template v-else>
        Il reste {{ github.quotaRemaining() }} requêtes GitHub pour cette heure.
      </template>
      <UiButton @click="openTokenDialog()">Se connecter</UiButton>
      pour lever la limite.
    </p>
  </div>

  <!-- RG-nouvelle-version-proposee, RG-version-perdue-signalee: the banner offers, it never reloads. It says what reloading would cost, since the author is the one who decides whether they can afford it. -->
  <div
    v-if="version.state() !== 'courante'"
    class="bandeau-quota bandeau-version"
    :class="{ perdue: version.state() === 'perdue' }"
    role="status"
  >
    <UiIcon
      :name="version.state() === 'perdue' ? 'error_outline' : 'system_update'"
    />
    <p>
      <template v-if="version.state() === 'perdue'">
        Cette version de Skanon n’est plus entièrement disponible : certaines
        pages pourraient ne plus s’ouvrir.
        <UiButton @click="reloadVersion()">Recharger</UiButton>
        pour passer à la version publiée.
      </template>
      <template v-else>
        Une nouvelle version de Skanon est prête.
        <UiButton @click="reloadVersion()">{{
          version.relaunches ? "Relancer" : "Recharger"
        }}</UiButton>
        pour l’utiliser.
      </template>
      <template v-if="version.cause() === INSTALLATION_FAILED">
        {{ INSTALLATION_FAILED_MESSAGE }} Réessayez, ou relancez Skanon
        vous-même.
      </template>
      <template v-if="onInput">
        Enregistrez d’abord : une saisie non enregistrée serait perdue.
      </template>
      <template v-if="tokens.source() === 'identite_tierce'">
        {{ version.relaunches ? "La relance" : "Le rechargement" }} mettra fin à
        l’accès obtenu par votre identité vérifiée.
      </template>
    </p>
  </div>

  <!-- RG-secret-conserve-localement: a vault that refuses leaves the secret valid for the session, and the application says so. -->
  <div
    v-if="tokens.vaultRefused()"
    class="bandeau-quota bandeau-coffre"
    role="status"
  >
    <UiIcon name="no_encryption" />
    <p>
      <template v-if="tokens.vaultRefused() === 'effacement'">
        {{
          onDesktop
            ? "Le coffre du système a refusé d’effacer votre jeton"
            : "Le navigateur a refusé d’effacer votre jeton"
        }}
        : il ne vaut plus pour cette session, mais sera retrouvé au lancement
        suivant.
      </template>
      <template v-else-if="tokens.vaultRefused() === 'ecriture'">
        {{
          onDesktop
            ? "Le coffre du système n’a pas gardé votre jeton"
            : "Le navigateur n’a pas gardé votre jeton"
        }}
        : il vaut pour cette session, et ne sera pas retrouvé au lancement
        suivant.
      </template>
    </p>
  </div>

  <!-- RG-secret-conserve-localement, RG-protection-du-jeton-par-projet: what the passkey protects, and what it costs when it is absent, is said without promising anything more. -->
  <div v-if="passkeyBanner" class="bandeau-quota bandeau-passkey" role="status">
    <UiIcon :name="passkeyBanner === 'verrouille' ? 'lock' : 'no_encryption'" />
    <p>
      <template v-if="passkeyBanner === 'verrouille'">
        Vos jetons sont protégés par une passkey.
        <UiButton @click="unlockTokens()">Déverrouiller</UiButton>
        pour vous en servir dans cet onglet.
        <template v-if="tokens.passkeyFailure() === 'illisible'">
          La passkey ne les ouvre plus :
          <UiButton @click="tokens.erase()">Oublier ces jetons</UiButton>
          puis saisissez de nouveau votre jeton.
        </template>
        <template v-else-if="tokens.passkeyFailure() === 'annule'">
          Le déverrouillage n’a pas abouti. Si la passkey a été supprimée de
          votre trousseau, ces jetons ne s’ouvriront plus :
          <UiButton @click="tokens.erase()">Oublier ces jetons</UiButton>
        </template>
      </template>
      <template v-else-if="passkeyBanner === 'exigee'">
        Ce projet exige que votre jeton soit protégé par une passkey : il n’est
        gardé que pour cet onglet.
        <UiButton @click="protectTokens()">Protéger par une passkey</UiButton>
        <template v-if="tokens.passkeyFailure() === 'impossible'">
          Ce navigateur ne sait pas créer une passkey qui protège le jeton :
          l’application de bureau, ou un navigateur récent, le garderont d’une
          ouverture à l’autre.
        </template>
        <template v-else-if="tokens.passkeyFailure() === 'annule'">
          La passkey n’a pas été créée.
        </template>
      </template>
      <template v-else>
        La passkey n’a pas été créée : votre jeton est gardé en clair dans ce
        navigateur.
        <UiButton @click="protectTokens()">Réessayer</UiButton>
        <UiButton @click="tokens.dismissPasskeyFailure()"
          >Le laisser en clair</UiButton
        >
      </template>
    </p>
  </div>

  <!-- The banners the deliverable contributes: it gives their text, the shell their form. -->
  <template v-for="bandeau in composition.banners" :key="bandeau.id">
    <div
      v-if="isVisible(bandeau) && bandeau.text()"
      class="bandeau-quota"
      :data-apport="bandeau.id"
      role="status"
    >
      <UiIcon :name="bandeau.icon" />
      <p>{{ bandeau.text() }}</p>
    </div>
  </template>

  <!-- RG-dernier-etat-connu: a state the repo has not confirmed can be read, not written, and is presented as such with its date and cause. -->
  <div
    v-if="inProject && unconfirmed"
    class="bandeau-quota non-confirme"
    role="status"
  >
    <UiIcon name="cloud_off" />
    <p>
      État lu le {{ formatReadDate(unconfirmed.readAt) }}, non confirmé :
      {{ unconfirmed.cause }} Les enregistrements sont indisponibles jusqu’à ce
      qu’il ait été relu.
      <UiButton @click="reloadSpecification()">Réessayer</UiButton>
    </p>
  </div>

  <UiProgressBar
    v-if="inProject && store.state() === 'chargement'"
    :value="progression"
  />

  <main class="contenu">
    <RouterView />
  </main>

  <!-- What one does not consult while working: the top bar is full (2026-041, 2026-054). -->
  <footer class="pied">
    <span v-if="currentVersion">{{ PRODUCT_NAME }} {{ currentVersion }}</span>
    <RouterLink to="/mentions-legales">Mentions légales</RouterLink>
  </footer>

  <UiDialogHost />
</template>

<style scoped>
/*
 * The bar carries the product colour rather than the background grey: it is the only element present on every screen, hence the only one that can stand for an identity.
 *
 * The background is a blue that holds from left to right, warmed on the last third by a touch of tertiary. The tertiary only comes in as a supplement and not in equal parts: mixed half and half with the primary container, the orange gave a pinkish grey that dirtied the bar instead of warming it. All hues come from the theme tokens, so dark mode follows without a single colour being redefined here.
 *
 * Dimensions and typography are those of `mat-toolbar`: 64 px high, 56 below 600 px wide, Material 3's "title large".
 */
.barre {
  display: flex;
  box-sizing: border-box;
  flex-direction: row;
  align-items: center;
  width: 100%;
  height: 64px;
  white-space: nowrap;
  font-family: Roboto, sans-serif;
  font-size: 1.375rem;
  line-height: 1.75rem;
  font-weight: 400;
  letter-spacing: 0;

  position: sticky;
  top: 0;
  z-index: 10;
  gap: 8px;

  /* Named so that the brand can raise it exactly; a guessed value would shift the block away from the screen edge. */
  --pc-barre-padding: 16px;
  padding: 0 16px 0 var(--pc-barre-padding);
  /* No border but a drop shadow: the border took the bar's last pixel, so the dark block stopped one pixel too early and let a light line through under the brand. The shadow sits outside the box and so bites into no background. */
  border: none;
  box-shadow: 0 1px 0
    color-mix(in srgb, var(--mat-sys-primary) 22%, transparent);
  background: linear-gradient(
    100deg,
    color-mix(
        in srgb,
        var(--mat-sys-primary-container) 88%,
        var(--mat-sys-primary)
      )
      0%,
    var(--mat-sys-primary-container) 45%,
    color-mix(
        in srgb,
        var(--mat-sys-primary-container) 88%,
        var(--mat-sys-tertiary)
      )
      100%
  );
  color: var(--mat-sys-on-primary-container);
  /* otherwise the last button overflows on the right when the repo name is long */
  overflow: hidden;

  /* The bar's icons inherit the on-primary-container text colour, otherwise they would stay at the neutral surface's colour. */
  .ui-bouton {
    color: inherit;
  }
}

@media (max-width: 599px) {
  .barre {
    height: 56px;
  }
}

/*
 * The brand keeps its dark background in both themes: it is a signature, and a signature that changes colour with the screen setting is no longer one. The chevron being drawn in `currentColor`, setting the background and the text is enough for the logo to follow.
 *
 * The block climbs over the bar's padding through negative margins, otherwise it would float in the middle of a light band instead of touching the edges. The height comes from `align-self: stretch`, not from a hard-coded `height` that would have to be kept in step with the bar's.
 */
.marque {
  display: flex;
  align-items: center;
  gap: 9px;
  text-decoration: none;
  min-width: 0;

  --marque-fond: #10233f;
  background: var(--marque-fond);
  color: #f2f6ff;
  align-self: stretch;
  margin: 0 12px 0 calc(-1 * var(--pc-barre-padding));
  padding: 0 18px 0 var(--pc-barre-padding);

  /* The block does not shrink: shrunk, it slid under its own text, which then overflowed in light onto the bar's blue. The tabs are the ones that give way, their overflow being already handled. */
  flex: none;
}

.logo {
  width: 22px;
  height: 22px;
  flex: none;
}

.nom {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.projet {
  font-size: 13px;
  color: color-mix(in srgb, #f2f6ff 72%, transparent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 22ch;
}

.onglets {
  display: flex;
  gap: 4px;

  /* The tabs never shrink: an invisible tab and an absent tab look too alike to accept the first after refusing the second. The repo name is what gives way — it is already truncated, and truncated it stays readable, whereas a clipped menu entry no longer says its name. Below 1080px there is no room left for anyone: the tabs take their own line, see the two-line bar rule further down. */
  flex: none;

  a {
    display: block;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 14px;
    white-space: nowrap;
    text-decoration: none;
    color: color-mix(
      in srgb,
      var(--mat-sys-on-primary-container) 80%,
      transparent
    );

    &:hover {
      background: color-mix(in srgb, var(--mat-sys-primary) 12%, transparent);
      color: var(--mat-sys-on-primary-container);
    }

    /* The current tab stands out through a pill drawn from the text colour, not through solid primary: on an already coloured bar, an opaque fill weighs heavy in light mode and vanishes in dark mode, whereas a hue drawn from the foreground keeps the same contrast in both themes. */
    &.actif {
      background: color-mix(
        in srgb,
        var(--mat-sys-on-primary-container) 14%,
        transparent
      );
      color: var(--mat-sys-on-primary-container);
      font-weight: 600;
      box-shadow: inset 0 0 0 1px
        color-mix(in srgb, var(--mat-sys-on-primary-container) 18%, transparent);
    }
  }
}

.separateur {
  flex: 1 1 auto;
}

.depot {
  font-family: var(--pc-mono);
  font-size: 12.5px;

  /* The first to give way when the bar fills up: what it carries can be found in the address, what a tab carries can be found nowhere. It gives way down to the project symbol, which remains alone to designate it. */
  flex: 0 1 auto;
  min-width: 56px;
  justify-content: flex-start;

  /* The symbol takes the margin Material only reserves for its icons, so as not to stick to the repo name. */
  .symbole-projet {
    margin-right: 8px;
  }
}

/* The repo name is truncated rather than pushing the button off screen: without this, the label would keep its width in a shrunk button, and overflow onto the magnifier and the GitHub link on either side. Outside the nesting: nested `:deep()` puts the scope on a descendant, not on `.depot`. */
.depot :deep(.ui-bouton__libelle) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contenu {
  /* `#app` is a column (`src/styles.css`): the automatic margin would cancel the stretching there, and the page would size itself to its text. */
  width: 100%;
  flex: 1 0 auto;
  padding: 28px 32px 80px;
  max-width: 1240px;
  margin: 0 auto;
}

/* Discreet, like what it carries: secondary text on the page background, below the content, never over it. */
.pied {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px 20px;
  padding: 12px 16px;
  border-top: 1px solid var(--mat-sys-outline-variant);
  font-size: 12px;
  color: var(--mat-sys-on-surface-variant);

  a {
    color: inherit;
  }
}

/*
 * Four entries, seven buttons, the brand and the repo need a little over a thousand pixels; below that, the tabs move to their own line, full width. The threshold sits above the sum, not at it: the brand grows by the project name when it differs from the repo.
 *
 * Squeezing them on the same line made them disappear entirely — a bar where the Architecture entry evaporates depending on screen width is no better than the one that hid it depending on the repo's content. A second line costs thirty pixels; that is the price of a menu that says the same thing everywhere.
 */
@media (max-width: 1080px) {
  .barre {
    flex-wrap: wrap;
    height: auto;
    /* the gap between items would also apply between lines, and would detach the tabs from the brand block */
    row-gap: 0;
  }

  /* Switched to `height: auto`, the bar would size itself to its buttons: the block is what keeps the first line at the height of the single-line bar, and the home page the same bar as on a wide screen. */
  .marque {
    min-height: 64px;
  }

  .onglets {
    /* after the buttons in visual order, hence alone on its line */
    order: 10;
    flex: 1 0 100%;
    margin-left: calc(-1 * var(--pc-barre-padding) + 4px);
    /* The bottom margin belongs to the tabs, not to the bar: set on the bar, it stayed on the home page, which has no tabs, and the brand block stopped above a light band. */
    margin-bottom: 6px;
  }
}

@media (max-width: 720px) {
  /* The project name gives way, its symbol stays in the brand. */
  .projet,
  .depot .libelle {
    display: none;
  }

  /* The symbol stays and the name gives way: it designates the project in less space than its name (RG-identite-affichee). The button shrinks to it, at the size of the neighbouring icon buttons. */
  .depot {
    min-width: 0;
    padding: 0 9px;

    .symbole-projet {
      margin-right: 0;
    }
  }

  /* On a narrow screen, the block tightens around the logo and the name rather than pushing the tabs off screen. */
  .marque {
    margin-right: 8px;
    padding-right: 12px;
    min-height: 0;
  }

  .barre {
    gap: 0;

    /* The buttons tighten to all fit on the first line: one of them sent alone to the next gave three bar lines, where the room gained by the tabs was taken back from the content. */
    .ui-bouton--icon {
      width: 38px;
      height: 38px;
      padding: 7px;
    }
  }

  .onglets {
    gap: 2px;

    a {
      padding: 5px 10px;
      font-size: 13px;
    }
  }
  .contenu {
    padding: 20px 16px 60px;
  }
}

/* On a phone, six buttons and the product name no longer fit on one line since search got its icon there: one of them went alone to the next. The logo stays, and still leads home; the name fades away, as it serves no action.
 *
 * Help adds a seventh (RG-aide-a-portee), and settings went off alone below 390 px: the reload gives way in turn. It is the only one with an equivalent on a phone — reloading the page rereads the tree, as it does —, whereas the GitHub link, the sign-in, the theme, the settings and help have no other door. */
@media (max-width: 430px) {
  .marque .nom,
  .recharger {
    display: none;
  }
}

/*
 * The padlock lights up when the quota nears zero: better to warn before the failure than to explain after.
 *
 * Inherited defect, ported as is: in SSK Canon, `.barre .mat-mdc-icon-button { color: inherit }` wins over this rule through its specificity, and the padlock never changes colour. Same specificity relationship here (`.barre .ui-bouton`).
 */
.alerte {
  color: var(--pc-statut-relecture);
}

.bandeau-quota {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 20px;
  background: var(--pc-statut-relecture-bg);
  border-bottom: 1px solid var(--pc-statut-relecture-bd);
  color: var(--pc-statut-relecture);

  p {
    margin: 0;
    font-size: 13.5px;
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
  > .material-symbols-outlined {
    flex: none;
    font-size: 19px;
    width: 19px;
    height: 19px;
  }
  .ui-bouton {
    color: inherit;
  }

  /* exhausted is no longer a warning but a finding: the tone changes */
  &.epuise {
    background: var(--pc-abroge-fond);
    border-bottom-color: var(--pc-abroge-bord);
    color: var(--pc-abroge-texte);
  }
}

/* A lost version is no longer an invitation but a defect: the tone changes. */
.bandeau-version.perdue {
  background: var(--pc-abroge-fond);
  border-bottom-color: var(--pc-abroge-bord);
  color: var(--pc-abroge-texte);
}

/* The displayed state is not wrong, it is dated: the tone is that of a finding. */
.bandeau-quota.non-confirme {
  background: var(--pc-abroge-fond);
  border-bottom-color: var(--pc-abroge-bord);
  color: var(--pc-abroge-texte);
}
</style>
