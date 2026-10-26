<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { GithubClient, type RefDepot } from "./core/github/github-client";
import { IdentiteService } from "./core/github/identite.service";
import { TokenService } from "./core/github/token.service";
import { inject } from "./core/injection";
import { PLATEFORME } from "./plateforme/jeton";
import { LiensService } from "./core/repo/liens.service";
import { COMPOSITION } from "./extension/composer";
import type { Contribution } from "./extension/extension";
import { ReferentielStore } from "./core/repo/referentiel.store";
import { APPLICATION } from "./core/repo/titre.strategy";
import { ThemeService } from "./core/ui/theme.service";
import { VersionService, estUrlDeSaisie } from "./core/ui/version.service";
import { MESSAGE_INSTALLATION_ECHOUEE } from "./features/shared/causes-version";
import { INSTALLATION_ECHOUEE } from "./plateforme/ports";
import { ouvrirConnexion } from "./features/shared/ouvrir-connexion";
import SymboleProjet from "./features/shared/SymboleProjet.vue";
import { DialogService } from "./ui/dialog.service";
import UiBarreProgression from "./ui/UiBarreProgression.vue";
import UiBouton from "./ui/UiBouton.vue";
import UiDialogHote from "./ui/UiDialogHote.vue";
import UiIcone from "./ui/UiIcone.vue";

/**
 * La coquille : la barre du haut, les bandeaux d'état, l'hôte des dialogues, la vue de la route et la barre du bas.
 */

/** Nom du produit, tel qu'affiché dans la barre. */
const NOM_PRODUIT = APPLICATION;

const MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);

const store = inject(ReferentielStore);
const tokens = inject(TokenService);
const github = inject(GithubClient);
const identite = inject(IdentiteService);
const theme = inject(ThemeService);
const liens = inject(LiensService);
const dialog = inject(DialogService);
const version = inject(VersionService);
/** Ce que le livrable ajoute à la coquille, sans qu'elle sache ce que c'est (ADR-extensions-commerciales). */
const composition = inject(COMPOSITION);

function estVisible(apport: Contribution): boolean {
  return apport.visible?.() ?? true;
}
/** Où vivent les secrets n'est pas le même selon la cible (INV-8) : le bandeau du coffre le dit. */
const plateforme = inject(PLATEFORME);
const auBureau = plateforme.cible === "bureau";

/** La version que cette fenêtre exécute ; tue tant qu'elle n'est pas connue, et si la plateforme ne sait pas la dire. */
const versionCourante = ref<string | null>(null);
plateforme.loadVersion().then(
  (v) => (versionCourante.value = v),
  () => undefined,
);
const route = useRoute();
const router = useRouter();

function segmentsDe(chemin: string): string[] {
  return (chemin.split(/[?#]/)[0] ?? "").split("/").filter(Boolean);
}

/**
 * Vrai quand l'adresse désigne un projet.
 *
 * Sur l'écran de choix, aucun dépôt n'est ouvert : les onglets, le rechargement et les réglages n'y auraient rien à désigner. Dérivé de l'adresse, seule à savoir où l'on est — la mémoire du navigateur, elle, garde le dernier projet ouvert même quand on l'a quitté. Une adresse de projet porte au moins `/organisation/depot`.
 */
const dansProjet = computed(() => segmentsDe(route.path).length >= 2);

/**
 * Un lien est actif quand l'adresse courante commence par la sienne, comme `routerLinkActive` : l'onglet Fonctionnel reste allumé sur la fiche d'une règle. Le `RouterLink` de Vue ne compare que les routes imbriquées, et les vues d'un projet sont sœurs.
 */
function estActif(chemin: string): boolean {
  const lien = segmentsDe(chemin);
  const courant = segmentsDe(route.path);
  return lien.every((s, i) => courant[i] === s);
}

/**
 * Termine une connexion en attente.
 *
 * Le référentiel n'est pas chargé ici : c'est l'adresse qui dit quel dépôt ouvrir, et le garde de route s'en charge. Mais les réglages d'identité vivent dans le référentiel, d'où l'attente avant de traiter le retour de l'émetteur.
 */
async function demarrer(): Promise<void> {
  await store.waitReady();

  if (await identite.terminerRetour()) {
    // L'adresse porte encore le code : le laisser ferait rejouer le retour au moindre rechargement, avec un code déjà consommé.
    history.replaceState(null, "", location.pathname);
    if (!identite.erreur()) await store.loadReferentiel();
  }
}
void demarrer();

/**
 * L'icône dit l'état courant, non l'action à venir.
 *
 * Un bouton qui montre où l'on va se lit à l'envers dès qu'il a trois états : l'icône « soleil » signifierait tantôt « on est en clair », tantôt « passer en clair ». Le libellé, lui, porte l'action.
 */
const themeIcone = computed(() => {
  switch (theme.theme()) {
    case "clair":
      return "light_mode";
    case "sombre":
      return "dark_mode";
    default:
      return "contrast";
  }
});

const themeLibelle = computed(() => {
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
 * Le nom du projet n'est affiché que s'il apporte quelque chose : quand il est identique au nom du produit, le répéter ne fait qu'occuper de la place.
 */
const nomProjetDistinct = computed(() => {
  const nom = store.referentiel().projet.nom?.trim();
  if (!nom) return null;
  // le nom du produit est écrit une fois, dans le gabarit : le comparer ici évite qu'un renommage laisse un doublon dans la barre
  return nom.toLowerCase() === NOM_PRODUIT.toLowerCase() ? null : nom;
});

const depotLibelle = computed(() => {
  const d = store.depot();
  return `${d.owner}/${d.repo}`;
});

/**
 * La même vue, dans un autre dépôt.
 *
 * Changer de projet en consultant les cadrages doit montrer les cadrages de l'autre projet, non le ramener à son accueil. Une vue de détail retombe en revanche sur sa liste : un identifiant de cadrage ou de règle n'existe pas forcément ailleurs, et mener à une page vide serait pire que ne rien promettre.
 */
function memeVueAilleurs(depot: RefDepot): string {
  const vue = segmentsDe(route.fullPath)[2] ?? "referentiel";
  return `/${depot.owner}/${depot.repo}/${vue}`;
}

/**
 * Les dialogues sont chargés à l'ouverture, non au démarrage : ils portent la saisie du dépôt et celle du jeton, un poids que la barre imposerait à tout le monde pour deux boutons qu'on ne clique pas toujours.
 */
function openDepotDialog(): void {
  void import("./features/shared/DepotDialog.vue").then(
    async ({ default: DepotDialog }) => {
      const depot = await dialog.open<RefDepot>(DepotDialog, {
        focus: "dialogue",
      });
      if (depot) void router.push(memeVueAilleurs(depot));
    },
  );
}

/** Le bandeau de la passkey reprend la main quand le navigateur n'a pas voulu la solliciter sans clic. */
function deverrouillerJetons(sansGeste = false): void {
  const ouvrir = sansGeste
    ? tokens.deverrouillerSansGeste()
    : tokens.deverrouiller();
  void ouvrir.then((issue) => {
    if (issue === "ouvert") void store.loadReferentiel();
  });
}

function protegerJetons(): void {
  void tokens.proteger();
}

/** Ce que le bandeau de la passkey a à dire : des jetons à ouvrir, un projet qui l'exige, ou une protection qui n'a pas abouti. */
const bandeauPasskey = computed<"verrouille" | "exigee" | "en-clair" | null>(
  () => {
    if (tokens.verrouille()) return "verrouille";
    if (tokens.aucunAcces()) return null;
    if (tokens.forme() === "session") return "exigee";
    const echec = tokens.echecPasskey();
    if (
      tokens.forme() === "en-clair" &&
      (echec === "annule" || echec === "impossible")
    )
      return "en-clair";
    return null;
  },
);

function openTokenDialog(): void {
  void ouvrirConnexion().then((change) => {
    if (change) void store.loadReferentiel();
  });
}

/** Le raccourci tel qu'on le presse sur ce poste : ⌘ sur Mac, Ctrl ailleurs. */
const raccourciRecherche = MAC ? "⌘K" : "Ctrl+K";

/** Évite d'ouvrir deux palettes pendant que la première se charge encore. */
let rechercheOuverte = false;

function onKeydown(e: KeyboardEvent): void {
  const modificateur = MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (!modificateur || e.altKey || e.shiftKey || e.key.toLowerCase() !== "k")
    return;
  if (!dansProjet.value) return;
  // Le navigateur réserve ce raccourci à sa propre barre de recherche : on le reprend, puisqu'on est dans un projet où chercher a un sens.
  e.preventDefault();
  openRecherche();
}

/**
 * La palette de recherche — RG-recherche-a-portee-de-clavier.
 *
 * Chargée à l'ouverture, comme les autres dialogues : tout le monde ne cherche pas, et l'index qu'elle construit ne coûte qu'à qui l'ouvre. Elle ne s'ouvre pas par-dessus un autre dialogue : une saisie en cours y serait masquée sans être abandonnée.
 */
function openRecherche(): void {
  if (rechercheOuverte || dialog.ouverts().length) return;
  rechercheOuverte = true;
  const vue = segmentsDe(route.fullPath)[2];
  void import("./features/recherche/PaletteRecherche.vue")
    .then(async ({ default: PaletteRecherche }) => {
      await dialog.open(PaletteRecherche, {
        data: { surEtatPasse: vue === "evolution" },
        largeur: "640px",
        largeurMax: "calc(100vw - 32px)",
        haut: "12vh",
        classe: "palette-recherche",
        libelle: "Rechercher dans le référentiel",
      });
      rechercheOuverte = false;
    })
    .catch(() => (rechercheOuverte = false));
}

/** Comme `closeOnNavigation` : reculer ou avancer dans l'historique ferme les dialogues ouverts. */
function surHistorique(): void {
  dialog.closeAll();
}

onMounted(() => {
  document.addEventListener("keydown", onKeydown);
  window.addEventListener("popstate", surHistorique);
  if (tokens.verrouille()) deverrouillerJetons(true);
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown);
  window.removeEventListener("popstate", surHistorique);
});

/**
 * Le quota mérite d'être signalé avant d'être épuisé : une fois à zéro, l'application ne charge plus rien pendant une heure.
 */
const quotaBas = computed(() => {
  const restant = github.quotaRestant();
  return restant !== null && !tokens.present() && restant <= 15;
});

const titreJeton = computed(() =>
  tokens.present()
    ? "Connecté à GitHub " + tokens.empreinte()
    : quotaBas.value
      ? "Quota bientôt épuisé — se connecter"
      : "Se connecter à GitHub",
);

/** La date d'une lecture, à la minute : assez pour juger de son ancienneté. */
function formatDateLecture(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

const nonConfirme = computed(() => store.nonConfirme());

const progression = computed(() => {
  const p = store.progression();
  return p ? (p.charges / p.total) * 100 : null;
});

function reloadReferentiel(): void {
  void store.loadReferentiel();
}

/** Vrai sur une page où le rechargement effacerait une saisie en cours. */
const surSaisie = computed(() => estUrlDeSaisie(route.fullPath));

function reloadVersion(): void {
  void version.reloadVersion();
}
</script>

<template>
  <header class="barre">
    <RouterLink class="marque" to="/">
      <!-- Le chevron prend la couleur du texte de la barre ; seul l'axe garde sa teinte, pour rester identifiable sur les deux thèmes. -->
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
      <!-- Sans identité, rien ne s'ajoute ici : l'avatar de l'organisation ne désignerait pas le projet, et il est déjà dans le bouton du dépôt. -->
      <template v-if="nomProjetDistinct">
        <SymboleProjet
          :depot="store.depot()"
          :taille="20"
          repli="aucun"
          fond="sombre"
        />
        <span class="projet">{{ nomProjetDistinct }}</span>
      </template>
    </RouterLink>

    <!--
      Les vues d'un projet n'ont pas de sens hors d'un projet : sur l'écran de choix, elles n'auraient aucun dépôt où mener.

      « Fonctionnel » et « Architecture » sont les deux entrées du référentiel, de même rang : l'architecture est une nature qu'il porte, non un à-côté. Les nommer « Référentiel » et « Architecture » aurait enseigné l'inverse à qui lit ce menu avant toute autre chose.

      Aucune des deux n'est conditionnée à ce que le dépôt porte : une entrée qui va et vient selon le projet ouvert empêche de distinguer « ce projet ne décrit rien » de « l'application ne sait pas faire ça ». Le vide se traite dans la page, qui sait l'expliquer.
    -->
    <nav v-if="dansProjet" class="onglets">
      <RouterLink
        :to="liens.chemin('referentiel')"
        :class="{ actif: estActif(liens.chemin('referentiel')) }"
        >Fonctionnel</RouterLink
      >
      <RouterLink
        :to="liens.chemin('architecture')"
        :class="{ actif: estActif(liens.chemin('architecture')) }"
        >Architecture</RouterLink
      >
      <RouterLink
        :to="liens.chemin('cadrages')"
        :class="{ actif: estActif(liens.chemin('cadrages')) }"
        >Cadrages</RouterLink
      >
      <RouterLink
        :to="liens.chemin('evolution')"
        :class="{ actif: estActif(liens.chemin('evolution')) }"
        >Évolution</RouterLink
      >
    </nav>

    <span class="separateur"></span>

    <template v-if="dansProjet">
      <!-- Une icône, non une entrée de plein rang : la recherche mène ailleurs, elle n'est pas un lieu (2026-042, décision 01). Elle reste la seule porte sur un écran sans clavier. -->
      <UiBouton
        variante="icon"
        class="recherche"
        :title="'Rechercher (' + raccourciRecherche + ')'"
        aria-label="Rechercher dans le référentiel"
        aria-keyshortcuts="Meta+K Control+K"
        @click="openRecherche()"
      >
        <UiIcone nom="search" />
      </UiBouton>
      <UiBouton
        class="depot"
        title="Changer de dépôt"
        @click="openDepotDialog()"
      >
        <SymboleProjet :depot="store.depot()" :taille="20" />
        <span class="libelle">{{ depotLibelle }}</span>
      </UiBouton>
      <!-- L'application ne montre du dépôt que ce qu'elle sait lire : issues, pull requests et réglages restent sur GitHub. Le lien y mène en un clic, dans le navigateur, pour ne pas faire perdre la vue courante. -->
      <UiBouton
        variante="icon"
        :href="liens.versGithub()"
        :title="'Ouvrir ' + depotLibelle + ' sur GitHub'"
        :aria-label="'Ouvrir ' + depotLibelle + ' sur GitHub'"
      >
        <UiIcone nom="open_in_new" />
      </UiBouton>
      <UiBouton
        variante="icon"
        class="recharger"
        :disabled="store.etat() === 'chargement'"
        title="Recharger depuis GitHub"
        aria-label="Recharger depuis GitHub"
        @click="reloadReferentiel()"
      >
        <UiIcone nom="refresh" />
      </UiBouton>
    </template>

    <template v-for="action in composition.actionsDeBarre" :key="action.id">
      <UiBouton
        v-if="estVisible(action)"
        variante="icon"
        :class="{ alerte: action.alerte?.() }"
        :title="action.titre()"
        :aria-label="action.libelle"
        @click="action.activer()"
      >
        <UiIcone :nom="action.icone()" />
      </UiBouton>
    </template>

    <UiBouton
      variante="icon"
      :class="{ alerte: quotaBas }"
      :title="titreJeton"
      :aria-label="
        tokens.present() ? 'Connecté à GitHub' : 'Se connecter à GitHub'
      "
      @click="openTokenDialog()"
    >
      <UiIcone :nom="tokens.present() ? 'lock' : 'lock_open'" />
    </UiBouton>

    <UiBouton
      variante="icon"
      :title="themeLibelle"
      :aria-label="themeLibelle"
      @click="theme.basculer()"
    >
      <UiIcone :nom="themeIcone" />
    </UiBouton>

    <!-- RG-aide-a-portee : l'aide n'est pas une vue d'un projet mais une porte, comme la loupe ; elle est présente partout, accueil compris. -->
    <UiBouton
      variante="icon"
      to="/aide"
      :class="{ actif: estActif('/aide') }"
      title="Fonctionnement de Skanon"
      aria-label="Fonctionnement de Skanon"
    >
      <UiIcone nom="help" />
    </UiBouton>

    <!-- Les réglages tiennent au projet, non à la consultation : leur place est auprès du dépôt, non parmi les vues du référentiel. -->
    <UiBouton
      v-if="dansProjet"
      variante="icon"
      :to="liens.chemin('reglages')"
      :class="{ actif: estActif(liens.chemin('reglages')) }"
      title="Réglages du projet"
      aria-label="Réglages du projet"
    >
      <UiIcone nom="settings" />
    </UiBouton>
  </header>

  <div
    v-if="quotaBas"
    class="bandeau-quota"
    :class="{ epuise: github.quotaRestant() === 0 }"
  >
    <UiIcone :nom="github.quotaRestant() === 0 ? 'error_outline' : 'info'" />
    <p>
      <template v-if="github.quotaRestant() === 0">
        Plus aucune requête GitHub disponible pour cette heure.
      </template>
      <template v-else>
        Il reste {{ github.quotaRestant() }} requêtes GitHub pour cette heure.
      </template>
      <UiBouton @click="openTokenDialog()">Se connecter</UiBouton>
      pour lever la limite.
    </p>
  </div>

  <!-- RG-nouvelle-version-proposee, RG-version-perdue-signalee : le bandeau propose, il ne recharge jamais. Il dit ce que le rechargement coûterait, puisque c'est le rédacteur qui décide s'il peut se le permettre. -->
  <div
    v-if="version.etat() !== 'courante'"
    class="bandeau-quota bandeau-version"
    :class="{ perdue: version.etat() === 'perdue' }"
    role="status"
  >
    <UiIcone
      :nom="version.etat() === 'perdue' ? 'error_outline' : 'system_update'"
    />
    <p>
      <template v-if="version.etat() === 'perdue'">
        Cette version de Skanon n’est plus entièrement disponible : certaines
        pages pourraient ne plus s’ouvrir.
        <UiBouton @click="reloadVersion()">Recharger</UiBouton>
        pour passer à la version publiée.
      </template>
      <template v-else>
        Une nouvelle version de Skanon est prête.
        <UiBouton @click="reloadVersion()">{{
          version.relance ? "Relancer" : "Recharger"
        }}</UiBouton>
        pour l’utiliser.
      </template>
      <template v-if="version.cause() === INSTALLATION_ECHOUEE">
        {{ MESSAGE_INSTALLATION_ECHOUEE }} Réessayez, ou relancez Skanon
        vous-même.
      </template>
      <template v-if="surSaisie">
        Enregistrez d’abord : une saisie non enregistrée serait perdue.
      </template>
      <template v-if="tokens.source() === 'identite_tierce'">
        {{ version.relance ? "La relance" : "Le rechargement" }} mettra fin à
        l’accès obtenu par votre identité vérifiée.
      </template>
    </p>
  </div>

  <!-- RG-secret-conserve-localement : un coffre qui refuse laisse le secret valoir pour la session, et l'application le dit. -->
  <div
    v-if="tokens.coffreRefuse()"
    class="bandeau-quota bandeau-coffre"
    role="status"
  >
    <UiIcone nom="no_encryption" />
    <p>
      <template v-if="tokens.coffreRefuse() === 'effacement'">
        {{
          auBureau
            ? "Le coffre du système a refusé d’effacer votre jeton"
            : "Le navigateur a refusé d’effacer votre jeton"
        }}
        : il ne vaut plus pour cette session, mais sera retrouvé au lancement
        suivant.
      </template>
      <template v-else-if="tokens.coffreRefuse() === 'ecriture'">
        {{
          auBureau
            ? "Le coffre du système n’a pas gardé votre jeton"
            : "Le navigateur n’a pas gardé votre jeton"
        }}
        : il vaut pour cette session, et ne sera pas retrouvé au lancement
        suivant.
      </template>
    </p>
  </div>

  <!-- RG-secret-conserve-localement, RG-protection-du-jeton-par-projet : ce que la passkey protège, et ce qu'il en coûte quand elle n'est pas là, se dit sans rien promettre de plus. -->
  <div
    v-if="bandeauPasskey"
    class="bandeau-quota bandeau-passkey"
    role="status"
  >
    <UiIcone
      :nom="bandeauPasskey === 'verrouille' ? 'lock' : 'no_encryption'"
    />
    <p>
      <template v-if="bandeauPasskey === 'verrouille'">
        Vos jetons sont protégés par une passkey.
        <UiBouton @click="deverrouillerJetons()">Déverrouiller</UiBouton>
        pour vous en servir dans cet onglet.
        <template v-if="tokens.echecPasskey() === 'illisible'">
          La passkey ne les ouvre plus :
          <UiBouton @click="tokens.effacer()">Oublier ces jetons</UiBouton>
          puis saisissez de nouveau votre jeton.
        </template>
        <template v-else-if="tokens.echecPasskey() === 'annule'">
          Le déverrouillage n’a pas abouti. Si la passkey a été supprimée de
          votre trousseau, ces jetons ne s’ouvriront plus :
          <UiBouton @click="tokens.effacer()">Oublier ces jetons</UiBouton>
        </template>
      </template>
      <template v-else-if="bandeauPasskey === 'exigee'">
        Ce projet exige que votre jeton soit protégé par une passkey : il n’est
        gardé que pour cet onglet.
        <UiBouton @click="protegerJetons()">Protéger par une passkey</UiBouton>
        <template v-if="tokens.echecPasskey() === 'impossible'">
          Ce navigateur ne sait pas créer une passkey qui protège le jeton :
          l’application de bureau, ou un navigateur récent, le garderont d’une
          ouverture à l’autre.
        </template>
        <template v-else-if="tokens.echecPasskey() === 'annule'">
          La passkey n’a pas été créée.
        </template>
      </template>
      <template v-else>
        La passkey n’a pas été créée : votre jeton est gardé en clair dans ce
        navigateur.
        <UiBouton @click="protegerJetons()">Réessayer</UiBouton>
        <UiBouton @click="tokens.ignorerEchecPasskey()"
          >Le laisser en clair</UiBouton
        >
      </template>
    </p>
  </div>

  <!-- Les bandeaux que le livrable apporte : il en donne le texte, la coquille la forme. -->
  <template v-for="bandeau in composition.bandeaux" :key="bandeau.id">
    <div
      v-if="estVisible(bandeau) && bandeau.texte()"
      class="bandeau-quota"
      :data-apport="bandeau.id"
      role="status"
    >
      <UiIcone :nom="bandeau.icone" />
      <p>{{ bandeau.texte() }}</p>
    </div>
  </template>

  <!-- RG-dernier-etat-connu : un état que le dépôt n'a pas confirmé se lit, ne s'écrit pas, et se dit tel avec sa date et sa cause. -->
  <div
    v-if="dansProjet && nonConfirme"
    class="bandeau-quota non-confirme"
    role="status"
  >
    <UiIcone nom="cloud_off" />
    <p>
      État lu le {{ formatDateLecture(nonConfirme.lu) }}, non confirmé :
      {{ nonConfirme.cause }} Les enregistrements sont indisponibles jusqu’à ce
      qu’il ait été relu.
      <UiBouton @click="reloadReferentiel()">Réessayer</UiBouton>
    </p>
  </div>

  <UiBarreProgression
    v-if="dansProjet && store.etat() === 'chargement'"
    :valeur="progression"
  />

  <main class="contenu">
    <RouterView />
  </main>

  <!-- Ce qu'on ne consulte pas en travaillant : la barre du haut est pleine (2026-041, 2026-054). -->
  <footer class="pied">
    <span v-if="versionCourante">{{ NOM_PRODUIT }} {{ versionCourante }}</span>
    <RouterLink to="/mentions-legales">Mentions légales</RouterLink>
  </footer>

  <UiDialogHote />
</template>

<style scoped>
/*
 * La barre porte la couleur du produit plutôt que le gris du fond : c'est le seul élément présent sur tous les écrans, donc le seul qui puisse tenir lieu d'identité.
 *
 * Le fond est un bleu qui se soutient de gauche à droite, réchauffé sur le dernier tiers par une touche de tertiaire. Le tertiaire n'entre qu'en appoint et non à parts égales : mélangé de moitié au conteneur primaire, l'orange donnait un gris rosé qui salissait la barre au lieu de la réchauffer. Toutes les teintes viennent des tokens du thème, si bien que le sombre suit sans qu'une seule couleur soit redéfinie ici.
 *
 * Les dimensions et la typographie sont celles de `mat-toolbar` : 64 px de haut, 56 sous 600 px de large, le « title large » de Material 3.
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

  /* Nommé pour que la marque puisse le remonter exactement ; une valeur devinée décalerait le pavé du bord de l'écran. */
  --pc-barre-padding: 16px;
  padding: 0 16px 0 var(--pc-barre-padding);
  /* Pas de bordure mais une ombre portée : la bordure occupait le dernier pixel de la barre, si bien que le pavé sombre s'arrêtait un pixel trop tôt et laissait passer un liseré clair sous la marque. L'ombre se pose en dehors de la boîte et ne mord donc sur aucun fond. */
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
  /* sans quoi le dernier bouton déborde à droite quand le nom du dépôt est long */
  overflow: hidden;

  /* Les icônes de la barre héritent du texte sur conteneur primaire, faute de quoi elles resteraient à la couleur de la surface neutre. */
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
 * La marque garde son fond sombre dans les deux thèmes : c'est une signature, et une signature qui change de couleur avec le réglage de l'écran n'en est plus une. Le chevron étant dessiné en `currentColor`, il suffit de fixer le fond et le texte pour que le logo suive.
 *
 * Le pavé remonte le padding de la barre par des marges négatives, faute de quoi il flotterait au milieu d'une bande claire au lieu de toucher les bords. La hauteur vient de `align-self: stretch`, non d'un `height` en dur qui devrait être tenu d'accord avec celle de la barre.
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

  /* Le pavé ne se comprime pas : rétréci, il passait sous son propre texte, qui débordait alors en clair sur le bleu de la barre. Ce sont les onglets qui cèdent la place, eux dont le débordement est déjà géré. */
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

  /* Les onglets ne se compriment jamais : un onglet invisible et un onglet absent se ressemblent trop pour qu'on accepte le premier après avoir refusé le second. C'est le nom du dépôt qui cède — il se tronque déjà, et tronqué il reste lisible, là où une entrée de menu rognée ne dit plus son nom. Sous 1080px il n'y a plus de place pour personne : les onglets prennent leur propre ligne, voir la règle de barre sur deux lignes plus bas. */
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

    /* L'onglet courant se détache par une pastille tirée de la couleur du texte, non par le primaire plein : sur une barre déjà colorée, un aplat opaque pèse en clair et disparaît en sombre, là où une teinte tirée du premier plan garde le même écart dans les deux thèmes. */
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

  /* Le premier à céder quand la barre se remplit : ce qu'il porte se retrouve dans l'adresse, ce que porte un onglet ne se retrouve nulle part. Il cède jusqu'au symbole du projet, qui reste seul à le désigner. */
  flex: 0 1 auto;
  min-width: 56px;
  justify-content: flex-start;

  /* Le symbole prend la marge que Material ne réserve qu'à ses icônes, pour ne pas coller au nom du dépôt. */
  .symbole-projet {
    margin-right: 8px;
  }
}

/* Le nom du dépôt se tronque plutôt que de pousser le bouton hors de l'écran : sans cela, le libellé garderait sa largeur dans un bouton rétréci, et déborderait sur la loupe et le lien GitHub de part et d'autre. Hors de l'imbrication : `:deep()` imbriqué place la portée sur un descendant, non sur `.depot`. */
.depot :deep(.ui-bouton__libelle) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contenu {
  /* `#app` est une colonne (`src/styles.css`) : la marge automatique y annulerait l'étirement, et la page se réglerait sur son texte. */
  width: 100%;
  flex: 1 0 auto;
  padding: 28px 32px 80px;
  max-width: 1240px;
  margin: 0 auto;
}

/* Discrète, comme ce qu'elle porte : du texte secondaire sur le fond de la page, sous le contenu, jamais par-dessus. */
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
 * Quatre entrées, sept boutons, la marque et le dépôt demandent un peu plus de mille pixels ; en deçà, les onglets passent sur leur ligne, en pleine largeur. La borne se tient au-dessus de la somme, non à sa hauteur : la marque s'allonge du nom du projet quand il diffère du dépôt.
 *
 * Les comprimer sur la même ligne les faisait disparaître entièrement — une barre où l'entrée Architecture s'évapore selon la largeur de l'écran ne vaut pas mieux que celle qui la cachait selon le contenu du dépôt. Une seconde ligne coûte trente pixels ; c'est le prix d'un menu qui dit la même chose partout.
 */
@media (max-width: 1080px) {
  .barre {
    flex-wrap: wrap;
    height: auto;
    /* l'écart entre éléments vaudrait aussi entre les lignes, et décollerait les onglets du pavé de la marque */
    row-gap: 0;
  }

  /* Passée à `height: auto`, la barre se réglerait sur ses boutons : c'est le pavé qui garde à la première ligne la hauteur de la barre d'un seul tenant, et l'accueil la même barre qu'en écran large. */
  .marque {
    min-height: 64px;
  }

  .onglets {
    /* après les boutons dans l'ordre visuel, donc seule sur sa ligne */
    order: 10;
    flex: 1 0 100%;
    margin-left: calc(-1 * var(--pc-barre-padding) + 4px);
    /* La marge du bas tient aux onglets, non à la barre : posée sur la barre, elle restait sur l'accueil, qui n'a pas d'onglets, et le pavé de la marque s'arrêtait au-dessus d'une bande claire. */
    margin-bottom: 6px;
  }
}

@media (max-width: 720px) {
  /* Le nom du projet cède, son symbole reste dans la marque. */
  .projet,
  .depot .libelle {
    display: none;
  }

  /* Le symbole reste et le nom cède : il désigne le projet en moins de place que son nom (RG-identite-affichee). Le bouton se réduit à lui, à la taille des boutons d'icône voisins. */
  .depot {
    min-width: 0;
    padding: 0 9px;

    .symbole-projet {
      margin-right: 0;
    }
  }

  /* Sur écran étroit, le pavé se resserre sur le logo et le nom plutôt que de pousser les onglets hors de l'écran. */
  .marque {
    margin-right: 8px;
    padding-right: 12px;
    min-height: 0;
  }

  .barre {
    gap: 0;

    /* Les boutons se resserrent pour tenir tous sur la première ligne : l'un d'eux renvoyé seul sur la suivante donnait trois lignes de barre, où la place gagnée par les onglets était reprise au contenu. */
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

/* Sur un téléphone, six boutons et le nom du produit ne tiennent plus sur une ligne depuis que la recherche y a son icône : l'un d'eux partait seul sur la suivante. Le logo reste, et mène toujours à l'accueil ; le nom s'efface, lui qui ne sert à rien faire.
 *
 * L'aide en ajoute un septième (RG-aide-a-portee), et les réglages repartaient seuls sous 390 px : le rechargement cède à son tour. Il est le seul à avoir un équivalent sur un téléphone — recharger la page relit l'arborescence, comme lui —, là où le lien vers GitHub, la connexion, le thème, les réglages et l'aide n'ont aucune autre porte. */
@media (max-width: 430px) {
  .marque .nom,
  .recharger {
    display: none;
  }
}

/*
 * Le cadenas s'allume quand le quota approche de zéro : mieux vaut prévenir avant l'échec qu'expliquer après.
 *
 * Défaut hérité, porté tel quel : dans SSK Canon, `.barre .mat-mdc-icon-button { color: inherit }` l'emporte sur cette règle par sa spécificité, et le cadenas ne change jamais de couleur. Même rapport de spécificité ici (`.barre .ui-bouton`).
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

  /* épuisé n'est plus un avertissement mais un constat : le ton change */
  &.epuise {
    background: var(--pc-abroge-fond);
    border-bottom-color: var(--pc-abroge-bord);
    color: var(--pc-abroge-texte);
  }
}

/* Une version perdue n'est plus une invitation mais un défaut : le ton change. */
.bandeau-version.perdue {
  background: var(--pc-abroge-fond);
  border-bottom-color: var(--pc-abroge-bord);
  color: var(--pc-abroge-texte);
}

/* L'état affiché n'est pas faux, il est daté : le ton est celui d'un constat. */
.bandeau-quota.non-confirme {
  background: var(--pc-abroge-fond);
  border-bottom-color: var(--pc-abroge-bord);
  color: var(--pc-abroge-texte);
}
</style>
