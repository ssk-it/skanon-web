<script lang="ts">
import {
  LIBELLE_OPERATION,
  LIBELLE_TAG_LIEN,
  type Decision,
  type Impact,
  type LienExterne as Lien,
  type OperationImpact,
  type Option,
} from "../../core/model/model";

const PARTICIPES: ReadonlyArray<[OperationImpact, string, string]> = [
  ["cree", "créée", "créées"],
  ["modifie", "modifiée", "modifiées"],
  ["abroge", "abrogée", "abrogées"],
  ["touche", "touchée", "touchées"],
];

/**
 * Ce qu'un cadrage change, par opération : « 3 règles créées · 7 touchées » — RG-en-tete-cadrage.
 *
 * Il dit d'un coup d'œil si le cadrage change le comportement du produit ou s'il le commente. Le nom ne figure qu'une fois, au premier compte : la suite se lit dans son élan. « Cibles » dès qu'une décision ou un document d'architecture s'y mêle, pour ne pas appeler règle ce qui n'en est pas une.
 */
export function formatDecompteImpacts(impacts: readonly Impact[]): string {
  const regles = impacts.every((i) => i.nature === "regle");
  const morceaux: string[] = [];
  for (const [operation, un, plusieurs] of PARTICIPES) {
    const n = impacts.filter((i) => i.operation === operation).length;
    if (!n) continue;
    const participe = n > 1 ? plusieurs : un;
    if (morceaux.length) {
      morceaux.push(`${n} ${participe}`);
    } else {
      const nom = regles
        ? n > 1
          ? "règles"
          : "règle"
        : n > 1
          ? "cibles"
          : "cible";
      morceaux.push(`${n} ${nom} ${participe}`);
    }
  }
  return morceaux.join(" · ");
}
</script>

<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { GithubError } from "../../core/github/github-client";
import { inject } from "../../core/injection";
import { LiensService } from "../../core/repo/liens.service";
import { RedactionService } from "../../core/repo/redaction.service";
import {
  afficherIdentifiant,
  extraireIdentifiantCadrage,
} from "../../core/repo/reference-cadrage";
import { ReferentielStore } from "../../core/repo/referentiel.store";
import { styleDomaine } from "../../core/ui/couleur-domaine";
import { DialogService } from "../../ui/dialog.service";
import LienExterne from "../../ui/LienExterne.vue";
import UiIcone from "../../ui/UiIcone.vue";
import UiMenu from "../../ui/UiMenu.vue";
import ConfirmationDialog from "../shared/ConfirmationDialog.vue";
import EtatVue from "../shared/EtatVue.vue";
import LienDialog from "../shared/LienDialog.vue";
import MarkdownRendu from "../shared/MarkdownRendu.vue";
import OperationChip from "../shared/OperationChip.vue";
import SommaireLateral, {
  type EntreeSommaire,
} from "../shared/SommaireLateral.vue";
import StatutChip from "../shared/StatutChip.vue";
import { extractJustification } from "./justification";

const route = useRoute();
const id = computed(() => String(route.params["id"]));

const store = inject(ReferentielStore);
const liens = inject(LiensService);
const dialog = inject(DialogService);
const redaction = inject(RedactionService);

/**
 * L'écriture en cours, désignée par l'adresse du lien qu'elle touche.
 *
 * Une adresse plutôt qu'un booléen : c'est elle qui dit lequel des chips s'estompe. `AJOUT` tient la place quand aucun lien n'existe encore.
 */
const AJOUT = "\u0000ajout";
const ecriture = ref<string | null>(null);
const erreurLien = ref<string | null>(null);
/** Ce qu'on vient d'écrire, tant que la relecture ne l'a pas ramené. */
const attendu = ref<{
  readonly arrive: (liens: readonly Lien[]) => boolean;
} | null>(null);

/** L'identifiant tel qu'il se donne à lire, préfixé si le projet en déclare un. */
function afficher(idCadrage: string): string {
  return afficherIdentifiant(idCadrage, store.referentiel().projet.prefixe);
}

/**
 * L'identifiant stocké derrière ce que porte l'adresse.
 *
 * L'adresse accepte les deux formes : nue, telle qu'elle a été posée dans les issues et les demandes de fusion, ou préfixée du projet. Un préfixe qui n'est pas le sien ne désigne rien ici — le cadrage ne sera pas trouvé, ce qui est le comportement voulu.
 */
const idResolu = computed(() =>
  extraireIdentifiantCadrage(id.value, store.referentiel().projet.prefixe),
);

const cadrage = computed(() => {
  const resolu = idResolu.value;
  // `null` dit une adresse qui ne désigne rien ici — un préfixe étranger, par exemple. Retomber sur la valeur brute trouverait le cadrage malgré tout, et ferait passer pour valide une adresse qui ne l'est pas.
  return resolu ? store.findCadrage(resolu) : null;
});

/**
 * Vrai tant que l'écriture n'est pas revenue du dépôt.
 *
 * Dérivé plutôt que posé une fois : les cadrages en branche sont lus après coup, sans bloquer le premier rendu, si bien que le lien peut arriver une seconde après le rechargement. Un drapeau posé à ce moment-là resterait affiché sous un lien pourtant visible.
 */
const ecritureRecente = computed(() => {
  const attente = attendu.value;
  const c = cadrage.value;
  return !!attente && !!c && !attente.arrive(c.liens);
});

/**
 * Saisit un lien et l'écrit dans le cadrage.
 *
 * Le référentiel est rechargé après coup plutôt que corrigé en mémoire : le lien peut avoir rejoint la branche du cadrage, que la vue courante ne lit pas. Modifier la mémoire l'y ferait apparaître alors qu'il vit ailleurs, puis disparaître au rechargement suivant.
 */
async function ajouterLien(): Promise<void> {
  const lien = await saisirLien();
  if (!lien) return;
  await ecrire(
    AJOUT,
    () => redaction.ajouterLien(id.value, lien),
    (liste) => liste.some((l) => l.url === lien.url),
    "Le lien n’a pas pu être ajouté.",
  );
}

/** Corrige un lien existant, son adresse comprise. */
async function modifierLien(actuel: Lien): Promise<void> {
  const lien = await saisirLien(actuel);
  if (!lien) return;
  await ecrire(
    actuel.url,
    () => redaction.modifierLien(id.value, actuel.url, lien),
    // La relecture est arrivée quand le lien s'y trouve tel qu'il a été saisi — comparer la seule adresse manquerait la correction d'un nom.
    (liste) =>
      liste.some(
        (l) => l.url === lien.url && l.nom === lien.nom && l.tag === lien.tag,
      ),
    "Le lien n’a pas pu être modifié.",
  );
}

/**
 * Détache un lien, après confirmation.
 *
 * L'écriture commite dans le dépôt et l'application ne sait pas la défaire : retrouver l'adresse demanderait de passer par l'historique GitHub.
 */
async function supprimerLien(lien: Lien): Promise<void> {
  if (ecriture.value) return;
  const confirme = await dialog.open<boolean>(ConfirmationDialog, {
    focus: "dialogue",
    data: {
      titre: "Supprimer ce lien ?",
      message: `« ${formatLibelle(lien)} » ne sera plus rattaché à ce cadrage. La ressource, elle, n’est pas touchée.`,
      action: "Supprimer",
    },
  });
  if (!confirme) return;

  await ecrire(
    lien.url,
    () => redaction.supprimerLien(id.value, lien.url),
    (liste) => !liste.some((l) => l.url === lien.url),
    "Le lien n’a pas pu être supprimé.",
  );
}

/** Ouvre l'écran de saisie, garni du lien à corriger le cas échéant. */
async function saisirLien(initial?: Lien): Promise<Lien | undefined> {
  if (ecriture.value) return undefined;
  return dialog.open<Lien>(LienDialog, {
    focus: "dialogue",
    data: initial ?? null,
  });
}

/**
 * Écrit, puis relit — le corps commun aux trois opérations.
 *
 * `arrive` dit à quoi se reconnaît la relecture réussie ; il est posé avant le rechargement parce qu'un cadrage en branche n'est relu qu'en second, et le dire vaut mieux que de laisser conclure à un échec — l'écriture, elle, a bien eu lieu.
 */
async function ecrire(
  cible: string,
  operation: () => Promise<void>,
  arrive: (liste: readonly Lien[]) => boolean,
  echec: string,
): Promise<void> {
  ecriture.value = cible;
  erreurLien.value = null;
  attendu.value = null;
  try {
    await operation();
    attendu.value = { arrive };
    await store.loadReferentiel();
  } catch (e) {
    erreurLien.value =
      e instanceof GithubError || e instanceof Error ? e.message : echec;
  } finally {
    ecriture.value = null;
  }
}

/** Le nom saisi, ou la nature du lien pour ceux écrits avant qu'il existe. */
function formatLibelle(l: Lien): string {
  return l.nom.trim() || formatLibelleTag(l.tag);
}

function formatLibelleTag(tag: string): string {
  return LIBELLE_TAG_LIEN[tag] ?? tag;
}

/** L'ensemble du dépôt : une teinte se calcule par rapport aux autres. */
const idsDomaines = computed(() => store.domaines().map((d) => d.id));

/**
 * Où mène une cible, selon sa nature.
 *
 * Un impact d'architecture pointait vers la page des règles : le lien menait à une règle inexistante, silencieusement.
 */
function lienCible(impact: Impact): string {
  switch (impact.nature) {
    case "adr":
      return liens.chemin("architecture", "decision", impact.cible);
    case "architecture":
      return liens.chemin("architecture", "document", impact.cible);
    default:
      return liens.chemin("referentiel", "regle", impact.cible);
  }
}

/**
 * Une décision annulée a beau porter une option retenue dans son frontmatter, elle n'a plus rien tranché : la garder au récapitulatif ferait passer pour acquis un choix révoqué.
 */
const tranchees = computed(() => {
  const c = cadrage.value;
  if (!c) return [];
  return c.decisions
    .filter((d) => d.statut !== "annulee" && d.optionRetenue)
    .map((decision) => {
      const option =
        decision.options.find((o) => o.id === decision.optionRetenue) ?? null;
      return {
        decision,
        option,
        justification: option ? extractJustification(option.corps) : "",
      };
    });
});

const impacts = computed(() => {
  const c = cadrage.value;
  return c ? store.listCiblesByCadrage(c) : [];
});

/** Les impacts qui changent leur cible, dans l'ordre déclaré. */
const impactsChangeants = computed(() =>
  impacts.value.filter((i) => i.impact.operation !== "touche"),
);

/** Ceux qui ne font que la mentionner, présentés à part. */
const impactsTouches = computed(() =>
  impacts.value.filter((i) => i.impact.operation === "touche"),
);

/**
 * Les deux blocs d'impacts, sous un seul gabarit de fiche : le `ng-template` que SSK Canon instanciait deux fois. Le bloc de ce qui change n'a ni ancre ni intitulé ; il se rend dans un `div` sans classe, sans effet sur la mise en page.
 */
const blocsImpacts = computed(() => {
  const blocs: {
    cle: string;
    id?: string;
    classe?: string;
    titre?: string;
    impacts: typeof impacts.value;
  }[] = [{ cle: "changeants", impacts: impactsChangeants.value }];
  const n = impactsTouches.value.length;
  if (n) {
    blocs.push({
      cle: "touches",
      id: "impacts-touches",
      classe: "impacts-touches",
      titre: formatTouches(n),
      impacts: impactsTouches.value,
    });
  }
  return blocs;
});

/** « 7 règles touchées », ou « cibles » si une décision s'y mêle. */
function formatTouches(n: number): string {
  const regles = impactsTouches.value.every((i) => i.impact.nature === "regle");
  const nom = regles
    ? n > 1
      ? "règles"
      : "règle"
    : n > 1
      ? "cibles"
      : "cible";
  return `${n} ${nom} ${n > 1 ? "touchées" : "touchée"}`;
}

/**
 * Les éléments repliés, par ancre.
 *
 * L'ensemble retient les repliés et non les dépliés : la fiche s'ouvre entière, si bien que l'ensemble vide est déjà le bon état. Retenir les dépliés obligerait à le remplir au chargement, puis à le refaire à chaque cadrage ouvert.
 */
const replies = ref<ReadonlySet<string>>(new Set());

function isReplie(ancre: string): boolean {
  return replies.value.has(ancre);
}

function toggleRepli(ancre: string): void {
  const suivant = new Set(replies.value);
  if (!suivant.delete(ancre)) suivant.add(ancre);
  replies.value = suivant;
}

/** L'option retenue, pour la résumer quand la décision est repliée. */
function findOptionRetenue(decision: Decision): Option | null {
  return decision.options.find((o) => o.id === decision.optionRetenue) ?? null;
}

/**
 * Le sommaire reprend la structure réelle du cadrage : les sections, mais aussi chaque décision et chaque impact nommément. C'est ce qu'on cherche en revenant sur une fiche — « où était la décision sur le stockage ? » — et une liste de cinq sections n'y répondrait pas.
 */
const sommaire = computed<EntreeSommaire[]>(() => {
  const c = cadrage.value;
  if (!c) return [];
  const entrees: EntreeSommaire[] = [];

  if (c.objectif)
    entrees.push({ id: "objectif", libelle: "Objectif", niveau: 0 });
  if (c.parcours) {
    entrees.push({
      id: "parcours",
      libelle: "Parcours utilisateur",
      niveau: 0,
    });
  }

  if (c.decisions.length) {
    entrees.push({ id: "decisions", libelle: "Décisions", niveau: 0 });
    for (const d of c.decisions) {
      entrees.push({
        id: `decision-${d.id}`,
        libelle: d.titre,
        niveau: 1,
        marque: d.statut === "annulee" ? "annulée" : undefined,
      });
    }
  }

  if (c.impacts.length) {
    entrees.push({ id: "impacts", libelle: "Impacts", niveau: 0 });
    for (const i of c.impacts.filter((i) => i.operation !== "touche")) {
      entrees.push({
        id: `impact-${i.cible}`,
        libelle: i.cible,
        niveau: 1,
        marque: LIBELLE_OPERATION[i.operation],
      });
    }
    // Une entrée pour tous : listés au même rang que les créations, ils noyaient ce que le cadrage change — RG-sommaire-fiche-longue.
    const touches = c.impacts.filter((i) => i.operation === "touche").length;
    if (touches) {
      entrees.push({
        id: "impacts-touches",
        libelle: formatTouches(touches),
        niveau: 1,
      });
    }
  }

  if (c.divers.length) {
    entrees.push({ id: "divers", libelle: "Divers", niveau: 0 });
    for (const [i, section] of c.divers.entries()) {
      entrees.push({ id: `divers-${i}`, libelle: section.titre, niveau: 1 });
    }
  }

  if (c.piecesJointes.length) {
    entrees.push({
      id: "pieces-jointes",
      libelle: "Pièces jointes",
      niveau: 0,
    });
  }

  return entrees;
});

/** Même comportement que le sommaire : rejoindre sans polluer l'historique. */
function scrollToDecision(evenement: Event, idDecision: string): void {
  const cible = document.getElementById(`decision-${idDecision}`);
  if (!cible) return;
  evenement.preventDefault();

  // Atterrir sur une décision repliée ne montrerait pas ce qu'on vient lire. Le dépli ne rend qu'au tour suivant : défiler avant viserait la hauteur repliée, et la fiche s'arrêterait trop bas.
  if (isReplie(`decision-${idDecision}`)) {
    toggleRepli(`decision-${idDecision}`);
    queueMicrotask(() => scrollTo(cible));
    return;
  }
  scrollTo(cible);
}

function scrollTo(cible: HTMLElement): void {
  const doux = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  cible.scrollIntoView({ behavior: doux ? "smooth" : "auto", block: "start" });
  cible.setAttribute("tabindex", "-1");
  cible.focus({ preventScroll: true });
}

function buildMessageRegleAbsente(): string {
  return "Cette règle n’existe pas dans le référentiel courant.";
}

/**
 * Un cadrage porte l'énoncé au moment de sa livraison. Signaler l'écart évite qu'un lecteur prenne une différence légitime pour une incohérence.
 */
function isDivergent(porte: string, courant: string | undefined): boolean {
  if (!courant) return false;
  return porte.trim() !== courant.trim();
}

function formatTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

// Le pipe `date` d'Angular en locale fr, au format `'longDate'`.
const DATE_LONGUE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

function formatDate(iso: string): string {
  return DATE_LONGUE.format(new Date(iso));
}
</script>

<template>
  <EtatVue v-if="store.etat() !== 'pret'" />
  <div v-else-if="cadrage" class="mise-en-page">
    <aside class="rail">
      <SommaireLateral :entrees="sommaire" :titre="cadrage.id" />
    </aside>

    <div class="fiche">
      <RouterLink class="retour" :to="liens.chemin('cadrages')">
        <UiIcone nom="arrow_back" /> Cadrages
      </RouterLink>

      <header class="fiche-entete">
        <h1>{{ cadrage.titre }}</h1>

        <!-- Le titre dit de quoi il s'agit ; ce qui suit dit à quoi on a affaire. Les intitulés portent la distinction, qu'une rangée de pastilles côte à côte laissait deviner. -->
        <dl class="identite">
          <dt>Cadrage</dt>
          <dd class="ligne-type">
            <span class="cid">{{ afficher(cadrage.id) }}</span>
            <StatutChip :statut="cadrage.statut" />
            <!-- Un cadrage livré ne se reprend plus : ses impacts sont propagés, et le rouvrir ferait diverger le référentiel de ses cadrages. -->
            <RouterLink
              v-if="cadrage.statut !== 'livree'"
              class="editer"
              :to="liens.chemin('cadrages', cadrage.id, 'editer')"
            >
              <UiIcone nom="edit" /> Reprendre
            </RouterLink>
          </dd>

          <template v-if="cadrage.domaines.length">
            <dt>Domaines</dt>
            <dd class="meta">
              <RouterLink
                v-for="d in cadrage.domaines"
                :key="d"
                class="pastille"
                :style="styleDomaine(d, idsDomaines)"
                :to="liens.chemin('referentiel', 'domaine', d)"
              >
                {{ store.findDomaine(d)?.nom ?? d }}
              </RouterLink>
            </dd>
          </template>

          <template v-if="formatDecompteImpacts(cadrage.impacts)">
            <dt>Impacts</dt>
            <dd class="decompte">
              {{ formatDecompteImpacts(cadrage.impacts) }}
            </dd>
          </template>

          <!-- Livré et sans lien, il n'y a rien à montrer : l'intitulé resterait seul en face d'une case vide. Non livré, le bouton d'ajout occupe toujours la rangée. -->
          <template v-if="cadrage.liens.length || cadrage.statut !== 'livree'">
            <dt>Ressources</dt>
            <dd class="liens">
              <!-- Un cadrage en cours se discute sur sa demande de fusion : c'est le premier lien qu'on y cherche. -->
              <LienExterne
                v-if="cadrage.provenance?.pullRequest"
                class="lien demande"
                :href="liens.versGithub('pull', cadrage.provenance.pullRequest)"
              >
                <UiIcone nom="call_split" />
                Demande de fusion #{{ cadrage.provenance.pullRequest }}
              </LienExterne>
              <!-- Sans demande de fusion, un cadrage commencé se trouve sur sa branche : c'est elle qu'on ouvre. -->
              <LienExterne
                v-else-if="cadrage.provenance"
                class="lien demande"
                :href="
                  liens.versGithub(
                    'tree',
                    ...cadrage.provenance.branche.split('/'),
                  )
                "
              >
                <UiIcone nom="call_split" />
                Branche {{ cadrage.provenance.branche }}
              </LienExterne>
              <!-- Ouvrir reste le geste direct : le menu ne s'ouvre que sur demande, et l'ancre garde la surface du chip. -->
              <span
                v-for="l in cadrage.liens"
                :key="l.url"
                class="bloc-lien"
                :class="{ occupe: ecriture === l.url }"
              >
                <LienExterne
                  class="lien"
                  :href="l.url"
                  :title="formatLibelleTag(l.tag)"
                >
                  <UiIcone nom="open_in_new" />
                  {{ formatLibelle(l) }}
                </LienExterne>
                <UiMenu
                  v-if="cadrage.statut !== 'livree'"
                  :actions="[
                    {
                      libelle: 'Modifier',
                      icone: 'edit',
                      action: () => void modifierLien(l),
                    },
                    {
                      libelle: 'Supprimer',
                      icone: 'link_off',
                      action: () => void supprimerLien(l),
                    },
                  ]"
                >
                  <template #declencheur="{ attributs }">
                    <button
                      type="button"
                      class="menu-lien"
                      v-bind="attributs"
                      :disabled="!!ecriture"
                      :aria-label="'Actions sur le lien ' + formatLibelle(l)"
                    >
                      <UiIcone nom="more_vert" />
                    </button>
                  </template>
                </UiMenu>
              </span>
              <!-- Un cadrage livré ne se reprend plus : lui ajouter un lien écrirait dans le référentiel hors de tout cadrage. -->
              <button
                v-if="cadrage.statut !== 'livree'"
                type="button"
                class="lien ajout"
                :disabled="!!ecriture"
                @click="ajouterLien()"
              >
                <UiIcone
                  :nom="ecriture === AJOUT ? 'hourglass_empty' : 'add_link'"
                />
                {{ ecriture === AJOUT ? "Ajout…" : "Ajouter un lien" }}
              </button>
            </dd>
          </template>
        </dl>

        <!-- RG-branches-survivantes-signalees : une branche qui porte encore ce cadrage livré est sans effet, mais on la reprendrait en croyant travailler sur un cadrage en cours. Le dire, sans rien interdire. -->
        <p
          v-if="cadrage.branchesSurvivantes?.length"
          class="branches-survivantes"
          role="note"
        >
          <UiIcone nom="info" />
          <span v-if="cadrage.branchesSurvivantes.length === 1">
            La branche
            <LienExterne
              :href="
                liens.versGithub(
                  'tree',
                  ...cadrage.branchesSurvivantes[0].split('/'),
                )
              "
              ><code>{{ cadrage.branchesSurvivantes[0] }}</code></LienExterne
            >
            porte encore ce cadrage, déjà livré. Elle est sans effet — la
            branche principale l’emporte — et n’a sans doute pas été supprimée
            après la fusion.
          </span>
          <span v-else>
            Les branches
            <template v-for="(b, i) in cadrage.branchesSurvivantes" :key="b">
              {{ i ? ", " : "" }}
              <LienExterne :href="liens.versGithub('tree', ...b.split('/'))"
                ><code>{{ b }}</code></LienExterne
              >
            </template>
            portent encore ce cadrage, déjà livré. Elles sont sans effet — la
            branche principale l’emporte — et n’ont sans doute pas été
            supprimées après la fusion.
          </span>
        </p>

        <p v-if="erreurLien" class="echec-lien">
          <UiIcone nom="error_outline" /> <span>{{ erreurLien }}</span>
        </p>
        <p v-else-if="ecritureRecente" class="attente-lien">
          <UiIcone nom="schedule" />
          <span>
            La modification est enregistrée. Elle apparaîtra ici dès que la
            branche du cadrage aura été relue.
          </span>
        </p>
      </header>

      <section v-if="cadrage.objectif" id="objectif" class="bloc">
        <h2 class="section">Objectif</h2>
        <MarkdownRendu class="md" :texte="cadrage.objectif" />
      </section>

      <section v-if="cadrage.parcours" id="parcours" class="bloc">
        <h2 class="section">Parcours utilisateur</h2>
        <MarkdownRendu class="md" :texte="cadrage.parcours" />
      </section>

      <section v-if="cadrage.decisions.length" id="decisions" class="bloc">
        <h2 class="section">Décisions</h2>
        <div class="decisions">
          <article
            v-for="d in cadrage.decisions"
            :id="'decision-' + d.id"
            :key="d.id"
            class="decision"
            :class="{ annulee: d.statut === 'annulee' }"
          >
            <button
              type="button"
              class="entete bascule"
              :aria-expanded="!isReplie('decision-' + d.id)"
              :aria-controls="'corps-decision-' + d.id"
              @click="toggleRepli('decision-' + d.id)"
            >
              <UiIcone
                class="chevron"
                :nom="
                  isReplie('decision-' + d.id) ? 'chevron_right' : 'expand_more'
                "
              />
              <h3>{{ d.titre }}</h3>
              <span v-if="d.statut === 'annulee'" class="d-statut annulee"
                >annulée</span
              >
              <span v-else-if="d.optionRetenue" class="d-statut retenue"
                >tranchée</span
              >
              <span v-else class="d-statut ouverte">ouverte</span>
            </button>

            <template v-if="isReplie('decision-' + d.id)">
              <!-- Repliée, la décision garde ce qu'elle a tranché : le reste est du raisonnement, celle-ci est la réponse. -->
              <p v-if="findOptionRetenue(d)" class="d-resume">
                <UiIcone nom="check" />
                {{ findOptionRetenue(d)?.titre }}
              </p>
            </template>
            <div v-else :id="'corps-decision-' + d.id" class="d-corps">
              <MarkdownRendu
                v-if="d.description"
                class="md d-description"
                :texte="d.description"
              />

              <ul v-if="d.options.length" class="options">
                <li
                  v-for="o in d.options"
                  :key="o.id"
                  :class="{ retenue: o.retenue }"
                >
                  <div class="o-entete">
                    <span class="o-titre">{{ o.titre }}</span>
                    <span v-if="o.retenue" class="o-marque">retenue</span>
                  </div>
                  <MarkdownRendu class="md o-corps" :texte="o.corps" />
                </li>
              </ul>
              <MarkdownRendu v-else class="md" :texte="d.corps" />
            </div>
          </article>
        </div>
      </section>

      <section v-if="cadrage.impacts.length" id="impacts" class="bloc">
        <h2 class="section">Impacts sur les règles de gestion</h2>
        <!-- RG-sommaire-fiche-longue : ce qui ne change rien à sa cible vient après ce qui change, réuni sous un intitulé qui le compte. Le sommaire y mène d'une seule entrée. -->
        <div
          v-for="b in blocsImpacts"
          :id="b.id"
          :key="b.cle"
          :class="b.classe"
        >
          <h3 v-if="b.titre" class="sous-section">{{ b.titre }}</h3>
          <div class="impacts">
            <article
              v-for="i in b.impacts"
              :id="'impact-' + i.impact.cible"
              :key="i.impact.cible"
              class="impact"
            >
              <div class="i-entete">
                <!-- La bascule est un bouton à part, et non l'entête entière : celle-ci porte déjà un lien vers la règle, qu'un bouton englobant rendrait inatteignable. -->
                <button
                  type="button"
                  class="i-bascule"
                  :aria-expanded="!isReplie('impact-' + i.impact.cible)"
                  :aria-controls="'corps-impact-' + i.impact.cible"
                  :aria-label="'Détail de ' + i.impact.cible"
                  @click="toggleRepli('impact-' + i.impact.cible)"
                >
                  <UiIcone
                    class="chevron"
                    :nom="
                      isReplie('impact-' + i.impact.cible)
                        ? 'chevron_right'
                        : 'expand_more'
                    "
                  />
                </button>
                <OperationChip :operation="i.impact.operation" />
                <RouterLink
                  v-if="i.cible"
                  class="i-regle"
                  :to="lienCible(i.impact)"
                >
                  {{ i.impact.cible }}
                </RouterLink>
                <span
                  v-else
                  class="i-regle absente"
                  :title="buildMessageRegleAbsente()"
                >
                  {{ i.impact.cible }}
                </span>
                <span v-if="i.cible?.statut === 'abroge'" class="marque-abrogee"
                  >abrogée</span
                >
              </div>

              <div
                v-if="!isReplie('impact-' + i.impact.cible)"
                :id="'corps-impact-' + i.impact.cible"
              >
                <template v-if="i.enonce">
                  <MarkdownRendu class="md i-enonce" :texte="i.enonce" />
                  <p
                    v-if="
                      isDivergent(
                        i.enonce,
                        i.cible && 'enonce' in i.cible
                          ? i.cible.enonce
                          : undefined,
                      )
                    "
                    class="i-divergence"
                  >
                    <UiIcone nom="history" />
                    L’énoncé courant diffère : il a été modifié par un cadrage
                    ultérieur. Ce texte est celui porté par le présent cadrage.
                  </p>
                </template>
                <p v-else-if="i.impact.operation === 'touche'" class="i-touche">
                  Ce cadrage la concerne sans la modifier. La mention sert de
                  signal de relecture.
                </p>
                <p v-else-if="!i.cible" class="i-attente">
                  Cette cible n’existe pas encore dans le référentiel : elle
                  sera créée à la livraison du cadrage.
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <!-- Ce que le gabarit ne présente pas ailleurs se lit ici plutôt que nulle part. Le titre d'origine est conservé : c'est lui qui dit de quoi la section parle, « Divers » ne fait que les rassembler. -->
      <section v-if="cadrage.divers.length" id="divers" class="bloc">
        <h2 class="section">Divers</h2>
        <div class="divers">
          <article
            v-for="(s, index) in cadrage.divers"
            :id="'divers-' + index"
            :key="index"
            class="libre"
          >
            <header class="entete">
              <h3>{{ s.titre }}</h3>
            </header>
            <MarkdownRendu class="md" :texte="s.corps" />
          </article>
        </div>
      </section>

      <section
        v-if="cadrage.piecesJointes.length"
        id="pieces-jointes"
        class="bloc"
      >
        <h2 class="section">Pièces jointes</h2>
        <ul class="pj">
          <li v-for="p in cadrage.piecesJointes" :key="p.sha256">
            <UiIcone nom="attach_file" />
            <div class="pj-corps">
              <span class="pj-nom">{{ p.nom }}</span>
              <span class="pj-meta">
                {{ formatTaille(p.taille) }} · {{ p.type }}
                <template v-if="p.ajouteLe">
                  · {{ formatDate(p.ajouteLe) }}
                </template>
              </span>
              <code class="pj-hash">{{ p.sha256.slice(0, 16) }}…</code>
            </div>
          </li>
        </ul>
        <p class="pj-note">
          Le téléchargement des pièces jointes viendra avec la mise en place du
          stockage objet.
        </p>
      </section>
    </div>

    <!-- Ce qui a été tranché est ce qu'on vient revérifier le plus souvent sur un cadrage relu. Le récapitulatif le tient sous les yeux pendant qu'on parcourt le reste de la fiche ; le raisonnement, lui, reste à sa place dans la section Décisions. -->
    <aside v-if="tranchees.length" class="rail-tranchees">
      <div class="panneau">
        <p class="p-titre">Décisions tranchées</p>
        <ul class="p-liste">
          <li v-for="t in tranchees" :key="t.decision.id">
            <a
              class="p-lien"
              :href="'#decision-' + t.decision.id"
              @click="scrollToDecision($event, t.decision.id)"
            >
              <span class="p-decision">{{ t.decision.titre }}</span>
              <span class="p-option">
                <UiIcone nom="check" />
                {{ t.option?.titre ?? t.decision.optionRetenue }}
              </span>
              <span v-if="t.justification" class="p-justification">{{
                t.justification
              }}</span>
            </a>
          </li>
        </ul>
      </div>
    </aside>
  </div>
  <!-- Un cadrage en cours vit sur sa branche, lue après la principale : le dire introuvable d'ici là annoncerait absent ce qui arrive. -->
  <p v-else-if="store.branchesEnChargement()" class="vide">
    Lecture des cadrages en cours…
  </p>
  <p v-else class="vide">Cadrage introuvable : {{ id }}</p>
</template>

<style scoped>
.mise-en-page {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
}
.rail {
  display: none;
}
/* RG-mesure-de-lecture : la colonne entière est bornée, titre compris. Borner le seul texte le repliait sous un titre pleine largeur. */
.fiche {
  min-width: 0;
  max-width: var(--pc-mesure);
}
.rail-tranchees {
  display: none;
}

/* Le sommaire n'apparaît que là où il ne coûte rien à la lecture. En dessous de cette largeur, la fiche reprend toute la place. */
@media (min-width: 1100px) {
  .mise-en-page {
    grid-template-columns: 244px minmax(0, var(--pc-mesure));
    column-gap: 44px;
    /* surtout pas align-items: start — la colonne se rétracterait à la hauteur de son contenu, et le sommaire collant n'aurait plus rien pour le retenir pendant le défilement */
    align-items: stretch;
  }
  .rail {
    display: block;
  }
}

/* La troisième colonne n'arrive qu'une fois les deux autres servies : en dessous, elle prendrait sa largeur sur le corps de la fiche, qui porte le texte long. */
@media (min-width: 1440px) {
  .mise-en-page {
    grid-template-columns: 244px minmax(0, var(--pc-mesure)) 280px;
  }
  .rail-tranchees {
    display: block;
  }
}

/* les ancres ne doivent pas atterrir sous la barre collante */
.bloc,
.decision,
.impact,
.impacts-touches {
  scroll-margin-top: 88px;
}
.bloc:focus,
.decision:focus,
.impact:focus {
  outline: none;
}

.retour {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13.5px;
  color: var(--mat-sys-on-surface-variant);
  text-decoration: none;
  margin-bottom: 18px;

  &:hover {
    color: var(--mat-sys-primary);
  }
  .material-symbols-outlined {
    font-size: 18px;
    width: 18px;
    height: 18px;
  }
}
.impacts-touches {
  margin-top: 28px;
}
.sous-section {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--mat-sys-on-surface-variant);
}
.decompte {
  margin: 0;
  font-size: 14px;
}

/* Nom propre, et non .entete : celui-ci sert aussi aux décisions et aux sections libres, dont la règle écraserait celle-ci. */
.fiche-entete {
  margin-bottom: 40px;
  padding: 22px 24px;
  border-radius: 12px;
  border: 1px solid var(--mat-sys-outline-variant);
  background: var(--mat-sys-surface-container-low);
}
/* Deux colonnes : l'intitulé au plus juste, la valeur prend le reste. Les intitulés alignés donnent un bord de lecture que des pastilles mises bout à bout n'offraient pas. */
.identite {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 10px 18px;
  margin: 0;
}
/* Aligné en haut, et non centré : une rangée de liens qui se replie sur trois lignes laisserait sinon son intitulé flotter à mi-hauteur. Le décalage l'amène sur la première ligne de chips. */
.identite dt {
  padding-top: 5px;
  font-size: 12px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
.identite dd {
  margin: 0;
  min-width: 0;
}
.ligne-type {
  display: flex;
  align-items: center;
  gap: 10px;
}
.editer {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  font-size: 13px;
  color: var(--mat-sys-primary);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
  .material-symbols-outlined {
    font-size: 16px;
    width: 16px;
    height: 16px;
  }
}
.cid {
  font-family: var(--pc-mono);
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--mat-sys-on-surface-variant);
}
/* Pas de max-width : la colonne borne déjà la ligne, et brider à 30ch cassait un titre ordinaire en quatre lignes. */
h1 {
  margin: 0 0 16px;
  font-size: 28px;
  font-weight: 400;
  line-height: 1.2;
  letter-spacing: -0.015em;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
/* Même teinte que dans la liste : un domaine doit se reconnaître d'un écran à l'autre, sans quoi la couleur n'est qu'une décoration. */
.pastille {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--pc-domaine-bg);
  color: var(--pc-domaine);
  border: 1px solid color-mix(in srgb, var(--pc-domaine) 22%, transparent);
  text-decoration: none;

  &:hover {
    border-color: var(--pc-domaine);
  }
}
.liens {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
/* Le chip et son menu ne font qu'un cadre : deux bordures côte à côte se liraient comme deux liens. */
.bloc-lien {
  display: inline-flex;
  align-items: stretch;
  border-radius: 5px;
  border: 1px solid var(--mat-sys-outline-variant);

  &:hover,
  &:focus-within {
    border-color: var(--mat-sys-primary);
  }
  &.occupe {
    opacity: 0.6;
  }
  .lien {
    border: none;
    padding-right: 4px;
  }
}
/* Discret au repos, il ne se montre qu'au survol ou au focus clavier — mais garde sa place, sinon la rangée se réagencerait sous le curseur. */
.menu-lien {
  display: inline-flex;
  align-items: center;
  padding: 0 4px 0 0;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--mat-sys-on-surface-variant);
  opacity: 0;

  &:disabled {
    cursor: default;
  }
  .material-symbols-outlined {
    font-size: 16px;
    width: 16px;
    height: 16px;
  }
}
.bloc-lien:hover .menu-lien,
.menu-lien:focus-visible,
.menu-lien[aria-expanded="true"] {
  opacity: 1;
}
.lien {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  padding: 4px 11px;
  border-radius: 5px;
  border: 1px solid var(--mat-sys-outline-variant);
  color: var(--mat-sys-on-surface-variant);
  text-decoration: none;

  &:hover {
    border-color: var(--mat-sys-primary);
    color: var(--mat-sys-primary);
  }
  .material-symbols-outlined {
    font-size: 15px;
    width: 15px;
    height: 15px;
  }
}
/* Le bouton reprend la forme des liens qu'il complète : il appartient à la même rangée, et s'en distinguer le ferait lire comme un ailleurs. */
.lien.ajout {
  font-family: inherit;
  font-size: 13px;
  line-height: inherit;
  background: none;
  cursor: pointer;
  border-style: dashed;

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
}
.branches-survivantes {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 10px 0 0;
  padding: 9px 12px;
  border-radius: 6px;
  font-size: 13px;
  max-width: 68ch;
  line-height: 1.5;
  color: var(--mat-sys-on-surface-variant);
  background: var(--mat-sys-surface-container);
}
.branches-survivantes .material-symbols-outlined {
  flex: none;
  font-size: 18px;
}
.attente-lien {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 10px 0 0;
  padding: 9px 12px;
  border-radius: 6px;
  font-size: 13px;
  max-width: 68ch;
  line-height: 1.5;
  color: var(--mat-sys-on-surface-variant);
  background: var(--mat-sys-surface-container);
  .material-symbols-outlined {
    font-size: 17px;
    width: 17px;
    height: 17px;
    flex: none;
  }
}
.echec-lien {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 10px 0 0;
  padding: 9px 12px;
  border-radius: 6px;
  font-size: 13px;
  max-width: 68ch;
  color: var(--pc-abroge-texte);
  background: var(--pc-abroge-fond);
  .material-symbols-outlined {
    font-size: 17px;
    width: 17px;
    height: 17px;
    flex: none;
  }
}
.bloc {
  margin-bottom: 44px;
}
.section {
  margin: 0 0 14px;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
.decisions,
.divers {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
/* Une section libre porte un titre venu du cadrage, non du gabarit : l'encadré des décisions est ce qui le distingue des niveaux 3 que le Markdown rend au-dessous. */
.decision,
.libre {
  padding: 20px 22px;
  border-radius: 10px;
  border: 1px solid var(--mat-sys-outline-variant);
  background: var(--mat-sys-surface-container-low);
}
.decision.annulee {
  opacity: 0.72;
}
.entete {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 10px;
}
.entete h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.35;
}
/* Plus grand que les niveaux 3 que le Markdown rend au-dessous : sans cet écart, une sous-section se lit comme la sœur de la section qui la porte. */
.libre h3 {
  font-size: 18px;
}
/* Un bouton pleine largeur, qui doit continuer de se lire comme un titre. L'alignement repasse au fil : le space-between de .entete tiendrait le chevron à l'autre bout de la carte, loin du titre qu'il commande. C'est h3 qui repousse le statut, par sa marge. */
.bascule {
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.bascule h3 {
  margin-right: auto;
}
.bascule:hover h3 {
  color: var(--mat-sys-primary);
}
.bascule:focus-visible {
  outline: 2px solid var(--mat-sys-primary);
  outline-offset: 4px;
  border-radius: 4px;
}
.chevron {
  flex: none;
  font-size: 20px;
  width: 20px;
  height: 20px;
  color: var(--mat-sys-on-surface-variant);
}
.d-corps {
  margin-top: 10px;
}
/* Repliée, la décision se résume à ce qu'elle a tranché. Aligné sur le titre au-dessus, chevron déduit, pour que la ligne se lise comme sa suite et non comme un élément de plus. */
.d-resume {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 0 30px;
  font-family: var(--pc-mono);
  font-size: 12.5px;
  color: var(--pc-statut-validee);

  .material-symbols-outlined {
    font-size: 16px;
    width: 16px;
    height: 16px;
  }
}
.d-statut {
  font-family: var(--pc-mono);
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 3px;
  white-space: nowrap;
}
.d-statut.retenue {
  color: var(--pc-statut-validee);
  background: var(--pc-statut-validee-bg);
}
.d-statut.annulee {
  color: var(--pc-abroge-texte);
  background: var(--pc-abroge-fond);
}
.d-statut.ouverte {
  color: var(--pc-statut-relecture);
  background: var(--pc-statut-relecture-bg);
}
.d-description {
  font-size: 14px;
  margin-bottom: 14px;
}
.options {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.options li {
  padding: 13px 16px;
  border-radius: 8px;
  border: 1px solid var(--mat-sys-outline-variant);
  background: var(--mat-sys-surface);
}
.options li.retenue {
  border-color: var(--pc-statut-validee-bd);
  background: var(--pc-statut-validee-bg);
}
.o-entete {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.o-titre {
  font-family: var(--pc-mono);
  font-size: 13px;
  font-weight: 500;
}
.o-marque {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 3px;
  color: var(--pc-statut-validee);
  background: var(--mat-sys-surface);
  border: 1px solid var(--pc-statut-validee-bd);
}
.o-corps {
  font-size: 13.5px;
}
.impacts {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.impact {
  padding: 16px 18px;
  border-radius: 10px;
  border: 1px solid var(--mat-sys-outline-variant);
}
.i-entete {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.i-bascule {
  display: inline-flex;
  align-items: center;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;

  &:hover .chevron {
    color: var(--mat-sys-primary);
  }
  &:focus-visible {
    outline: 2px solid var(--mat-sys-primary);
    outline-offset: 2px;
    border-radius: 4px;
  }
}
.i-regle {
  font-family: var(--pc-mono);
  font-size: 13.5px;
  color: var(--mat-sys-primary);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}
.i-regle.absente {
  color: var(--mat-sys-on-surface-variant);
  cursor: help;
  border-bottom: 1px dashed var(--mat-sys-outline);
}
.marque-abrogee {
  font-family: var(--pc-mono);
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 3px;
  background: var(--pc-abroge-fond);
  color: var(--pc-abroge-texte);
}
.i-enonce {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--mat-sys-outline-variant);
  font-size: 14px;
}
.i-divergence,
.i-touche,
.i-attente {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 12px 0 0;
  padding: 10px 13px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
  max-width: 68ch;
}
.i-divergence {
  background: var(--pc-statut-relecture-bg);
  border: 1px solid var(--pc-statut-relecture-bd);
  color: var(--pc-statut-relecture);
  .material-symbols-outlined {
    font-size: 17px;
    width: 17px;
    height: 17px;
    flex: none;
  }
}
.i-touche,
.i-attente {
  margin-top: 10px;
  background: var(--mat-sys-surface-container);
  color: var(--mat-sys-on-surface-variant);
}
.pj {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pj li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid var(--mat-sys-outline-variant);
}
.pj-corps {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.pj-nom {
  font-size: 14px;
}
.pj-meta {
  font-size: 12px;
  color: var(--mat-sys-on-surface-variant);
}
.pj-hash {
  font-family: var(--pc-mono);
  font-size: 11px;
  color: var(--mat-sys-on-surface-variant);
}
.pj-note {
  margin: 0;
  font-size: 13px;
  color: var(--mat-sys-on-surface-variant);
}
.rail-tranchees .panneau {
  position: sticky;
  top: 84px;
  max-height: calc(100vh - 108px);
  overflow-y: auto;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid var(--pc-statut-validee-bd);
  background: var(--pc-statut-validee-bg);
}
.p-titre {
  margin: 0 0 10px;
  font-family: var(--pc-mono);
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
.p-liste {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.p-lien {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 7px 9px;
  border-radius: 6px;
  text-decoration: none;
  color: inherit;

  &:hover {
    background: var(--mat-sys-surface);
  }
  &:focus-visible {
    outline: 2px solid var(--mat-sys-primary);
    outline-offset: -2px;
  }
}
.p-decision {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--mat-sys-on-surface);
}
.p-justification {
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--mat-sys-on-surface-variant);
}
.p-option {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: var(--pc-mono);
  font-size: 12px;
  line-height: 1.3;
  color: var(--pc-statut-validee);

  .material-symbols-outlined {
    font-size: 14px;
    width: 14px;
    height: 14px;
    flex: none;
  }
}
.vide {
  color: var(--mat-sys-on-surface-variant);
}
</style>
