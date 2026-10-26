<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { GithubError } from "../../core/github/github-client";
import { inject } from "../../core/injection";
import {
  LIBELLE_OPERATION,
  LIBELLE_STATUT_CADRAGE,
  LIBELLE_STATUT_DECISION,
  STATUTS_DECISION,
  type LienExterne as LienPorte,
  type NatureCible,
  type OperationImpact,
  type Referentiel,
  type StatutCadrage,
} from "../../core/model/model";
import {
  SECTIONS_CONNUES,
  estIllisible,
  extractEnonces,
  extractSection,
  extractSectionsAutres,
  splitFrontmatter,
} from "../../core/repo/frontmatter";
import { LiensService } from "../../core/repo/liens.service";
import {
  RedactionService,
  estSurSaBranche,
  serializeDecision,
  type DecisionEditable,
  type ImpactSaisi,
  type OptionEditable,
  type SourceCadrage,
} from "../../core/repo/redaction.service";
import { ReferentielStore } from "../../core/repo/referentiel.store";
import { VerificationService } from "../../core/repo/verification.service";
import { linkedSignal } from "../../core/signaux";
import UiBouton from "../../ui/UiBouton.vue";
import UiChamp from "../../ui/UiChamp.vue";
import UiIcone from "../../ui/UiIcone.vue";
import UiSelect from "../../ui/UiSelect.vue";

/**
 * Reprise d'un cadrage ouvert.
 *
 * Le cadrage est chargé depuis sa propre branche, où le travail en cours se trouve, et non depuis la branche principale qui ne le connaît pas encore.
 *
 * Le statut n'est volontairement pas modifiable ici : faire avancer un cadrage dans son cycle est une décision, pas une saisie, et mérite son propre parcours.
 */

const OPERATIONS: OperationImpact[] = ["cree", "modifie", "abroge", "touche"];

/**
 * Les natures qu'un impact peut viser, dans l'ordre où on les cherche à la relecture d'un fichier. Le même que dans le chargeur et le vérificateur.
 */
const NATURES_IMPACT = ["regle", "adr", "architecture"] as const;

const LIBELLE_NATURE: Record<NatureCible, string> = {
  regle: "Règle",
  adr: "Décision",
  architecture: "Document",
};

/** Opérations dont la propagation tire une écriture, donc un énoncé obligatoire. */
const A_ENONCE = new Set<OperationImpact>(["cree", "modifie"]);

/** Une décision en cours d'édition, et sa provenance dans le dépôt. */
interface DecisionSaisie extends DecisionEditable {
  /** Chemin du fichier existant, `null` pour une décision nouvelle. */
  readonly fichier: string | null;
  readonly sha: string | undefined;
  /** L'identifiant, qui donne son nom au fichier et ne se renomme jamais. */
  readonly id: string;
  /** Le texte tel qu'il est dans le dépôt, pour ne réécrire que ce qui change. */
  readonly texteEnregistre?: string;
}

const route = useRoute();
const id = computed(() => String(route.params["id"]));

const store = inject(ReferentielStore);
const liens = inject(LiensService);
const redaction = inject(RedactionService);
const verification = inject(VerificationService);

/**
 * Le référentiel de la branche éditée, quand elle en a un.
 *
 * Sert à vérifier ce qu'on écrit : un cadrage crée souvent le domaine et les règles qu'il déclare, absents de la branche principale. Les vérifier contre celle-ci les signalerait comme inconnus.
 */
const contexte = ref<Referentiel | null>(null);

/**
 * Les décisions du cadrage, telles qu'on les édite.
 *
 * Chacune garde le nom de son fichier et le SHA d'où elle vient : le premier ne se renomme jamais — un fichier déplacé perd son historique — et le second est le contrôle de concurrence de la plateforme.
 */
const decisions = ref<readonly DecisionSaisie[]>([]);
const decisionsSupprimees = ref<readonly string[]>([]);

const optionsStatutDecision = STATUTS_DECISION.map((s) => ({
  valeur: s,
  libelle: LIBELLE_STATUT_DECISION[s],
}));

function ajouterDecision(): void {
  // Numérotée dans l'ordre d'apparition : c'est ce qui ordonne les fichiers, et l'ordre où les questions se sont posées se relit ainsi.
  const suivant = String(decisions.value.length + 1).padStart(2, "0");
  decisions.value = [
    ...decisions.value,
    {
      fichier: null,
      sha: undefined,
      id: `${suivant}-`,
      titre: "",
      statut: "ouverte",
      description: "",
      options: [],
      optionRetenue: null,
      decision: "",
    },
  ];
}

function majDecision(i: number, champs: Partial<DecisionSaisie>): void {
  decisions.value = decisions.value.map((x, n) =>
    n === i ? { ...x, ...champs } : x,
  );
}

function retirerDecision(i: number): void {
  const cible = decisions.value[i];
  // Un fichier déjà enregistré doit être retiré du dépôt, non seulement de l'écran : sans cela, il réapparaîtrait au rechargement.
  if (cible?.fichier) {
    decisionsSupprimees.value = [...decisionsSupprimees.value, cible.fichier];
  }
  decisions.value = decisions.value.filter((_, n) => n !== i);
}

function ajouterOption(i: number): void {
  majDecision(i, {
    options: [...decisions.value[i].options, { id: "", corps: "" }],
  });
}

function majOption(
  i: number,
  j: number,
  champs: Partial<OptionEditable>,
): void {
  const d = decisions.value[i];
  const options = d.options.map((o, n) => (n === j ? { ...o, ...champs } : o));

  // Renommer l'option retenue doit la garder retenue : sans cela, corriger une faute de frappe déferait le choix sans rien dire.
  const ancien = d.options[j]?.id.trim();
  const retenue =
    champs.id !== undefined && ancien && d.optionRetenue === ancien
      ? champs.id.trim() || null
      : d.optionRetenue;

  majDecision(i, { options, optionRetenue: retenue });
}

function retirerOption(i: number, j: number): void {
  const d = decisions.value[i];
  const partante = d.options[j]?.id.trim();
  majDecision(i, {
    options: d.options.filter((_, n) => n !== j),
    optionRetenue: d.optionRetenue === partante ? null : d.optionRetenue,
  });
}

/** Désigne l'option retenue, ou la libère si elle l'était déjà. */
function basculerRetenue(i: number, idOption: string): void {
  const propre = idOption.trim();
  if (!propre) return;
  const d = decisions.value[i];
  majDecision(i, {
    optionRetenue: d.optionRetenue === propre ? null : propre,
  });
}

function estRetenue(d: DecisionSaisie, idOption: string): boolean {
  return idOption.trim() === d.optionRetenue;
}

/** La branche principale, pour dire si le cadrage vit ailleurs. */
const branchePrincipale = ref("");

/** Les sections que l'éditeur ne présente pas, conservées telles quelles. */
const sectionsInconnues = ref("");

/**
 * Les liens externes, conservés tels qu'ils étaient.
 *
 * L'éditeur ne les présente pas — ils se saisissent depuis la fiche — mais la sérialisation reconstruit tout le frontmatter : ne pas les relire les effacerait au premier enregistrement.
 */
const liensPortes = ref<readonly LienPorte[]>([]);

const optionsNature = NATURES_IMPACT.map((n) => ({
  valeur: n as NatureCible,
  libelle: LIBELLE_NATURE[n],
}));
const optionsOperation = OPERATIONS.map((op) => ({
  valeur: op,
  libelle: LIBELLE_OPERATION[op],
}));
const libelleNature = (n: NatureCible) => LIBELLE_NATURE[n];
const demandeEnonce = (op: OperationImpact) => A_ENONCE.has(op);

const titre = ref("");
const domaines = ref("");
const objectif = ref("");
const parcours = ref("");
const impacts = ref<ImpactSaisi[]>([]);

/**
 * Le statut tel que le dépôt l'établit — RG-statuts-cadrage.
 *
 * Lu sur le cadrage que le store a déduit de sa demande de fusion, et non dans le fichier, qui ne le porte plus. Il suit le store quand les branches finissent d'arriver ; une bascule réussie l'emporte jusqu'à la relecture suivante.
 */
const statut = linkedSignal<StatutCadrage>(
  () => store.findCadrage(id.value)?.statut ?? "brouillon",
);
const transition = ref(false);
const basculeEchouee = ref(false);

const source = ref<SourceCadrage | null>(null);
const chargement = ref(true);
const erreurChargement = ref<string | null>(null);
const envoi = ref(false);
const erreur = ref<string | null>(null);
const enregistre = ref(false);

/**
 * Statuts vers lesquels ce cadrage peut aller.
 *
 * Vides si le cadrage ne vit pas sur sa propre branche : son statut décrit alors ce qui est déjà dans le référentiel, et le changer sans passer par une demande de fusion contournerait la vérification.
 *
 * « Sa propre branche » se reconnaît à ce qu'elle n'est pas la principale, et non à son nom — voir RG-branche-par-cadrage. Le test portait sur le préfixe « cadrage/ », que pas une branche réelle ne porte : toutes suivent « cadrage-<id> », et les boutons étaient donc absents partout.
 */
const transitions = computed(() =>
  redaction.transitionsPossibles(
    statut(),
    estSurSaBranche(source.value?.branche, branchePrincipale.value),
  ),
);

const libelleStatut = (s: StatutCadrage) => LIBELLE_STATUT_CADRAGE[s];

function domainesSaisis(): string[] {
  return domaines.value
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
}

/**
 * Ce qui empêcherait la livraison, tel que la vérification finale le dira.
 *
 * Les règles viennent du même module que l'Action exécute avant chaque livraison : ce qui est signalé ici est exactement ce qui bloquerait là-bas, sans qu'aucune règle n'existe en double.
 */
const problemes = computed(() => {
  const manquants = [
    ["un titre", titre.value],
    ["un objectif", objectif.value],
    ["un parcours", parcours.value],
  ]
    .filter(([, v]) => !v.trim())
    .map(([nom]) => `Il manque ${nom}.`);

  // Les impacts sans règle désignée sont écartés avant la vérification : elle les rapporterait sous un identifiant vide, illisible pour le rédacteur.
  const designes = impacts.value.filter((i) => i.cible.trim());
  const sansRegle = impacts.value.length - designes.length;

  const { erreurs } = verification.verifierCadrage(
    {
      id: id.value,
      titre: titre.value,
      domaines: domainesSaisis(),
      impacts: designes.map((i) => ({
        cible: i.cible.trim(),
        nature: i.nature ?? "regle",
        operation: i.operation,
      })),
      enonces: new Map(
        designes
          .filter((i) => i.enonce.trim())
          .map((i) => [i.cible.trim(), i.enonce.trim()]),
      ),
    },
    // Le référentiel de la branche éditée : c'est là que vivent le domaine et les règles que ce cadrage crée.
    contexte.value ?? undefined,
  );

  return [
    ...manquants,
    ...(sansRegle ? [`${sansRegle} impact(s) ne désignent aucune règle.`] : []),
    ...erreurs,
  ];
});

/** Le cadrage déjà porté par le formulaire, pour ne pas le relire pour rien. */
let chargeId: string | null = null;

watch(
  [id, () => store.etat()],
  ([idCourant, etat]) => {
    if (etat !== "pret") return;
    // La surveillance porte sur l'état du magasin : sans ce garde, tout rechargement du référentiel — celui qui suit un enregistrement, comme le bouton de la barre — relirait le cadrage et écraserait la saisie en cours.
    if (chargeId === idCourant) return;
    chargeId = idCourant;
    void charger(idCourant);
  },
  { immediate: true },
);

function ajouterImpact(): void {
  impacts.value = [
    ...impacts.value,
    { cible: "", nature: "regle", operation: "modifie", enonce: "" },
  ];
  enregistre.value = false;
}

function retirerImpact(index: number): void {
  impacts.value = impacts.value.filter((_, i) => i !== index);
  enregistre.value = false;
}

function majImpact(index: number, champ: Partial<ImpactSaisi>): void {
  impacts.value = impacts.value.map((i, n) =>
    n === index ? { ...i, ...champ } : i,
  );
  enregistre.value = false;
}

/**
 * Fait passer le cadrage à un autre statut.
 *
 * Rien n'est tenté tant que le cadrage n'est pas cohérent : un statut avancé sur un cadrage que la vérification refuserait ne ferait que déplacer le problème plus près de la livraison.
 */
async function allerVers(vers: StatutCadrage): Promise<void> {
  if (
    transition.value ||
    envoi.value ||
    problemes.value.length ||
    !source.value
  )
    return;

  transition.value = true;
  erreur.value = null;
  basculeEchouee.value = false;
  try {
    // Rien n'est écrit dans le fichier : le statut vit sur la demande de fusion, et c'est elle que la bascule change. La source reste donc valide, contrairement à ce qui se passait quand le statut y était écrit.
    const resultat = await redaction.changerStatut(id.value, vers);
    // La demande porte le statut : si elle n'a pas basculé, rien n'a changé.
    if (!resultat.basculeEchouee) statut.set(vers);
    basculeEchouee.value = resultat.basculeEchouee;
  } catch (e) {
    erreur.value =
      e instanceof GithubError || e instanceof Error
        ? e.message
        : "Le changement de statut a échoué.";
  } finally {
    transition.value = false;
  }
}

async function charger(idCharge: string): Promise<void> {
  chargement.value = true;
  erreurChargement.value = null;
  try {
    const lu = await redaction.loadPourEdition(idCharge);
    if (id.value !== idCharge) return;

    const parse = splitFrontmatter(lu.contenu);
    if (!parse) throw new Error("Ce cadrage n’a pas de frontmatter.");
    if (estIllisible(parse)) throw new Error(parse.erreur);

    const data = parse.data as Record<string, unknown>;
    const enonces = extractEnonces(parse.body);

    source.value = lu.source;
    contexte.value = lu.contexte;
    branchePrincipale.value = lu.branchePrincipale;

    // Depuis la branche du cadrage : une décision écrite en même temps que lui n'existe nulle part ailleurs.
    try {
      const lues = await redaction.loadDecisions(idCharge, lu.source.branche);
      decisions.value = lues.map((l) => {
        const idDecision = (l.fichier.split("/").pop() ?? "").replace(
          /\.md$/,
          "",
        );
        return {
          ...l.decision,
          fichier: l.fichier,
          sha: l.sha,
          id: idDecision,
          // Ce que produirait une réécriture à l'identique : le comparer évite d'enregistrer une décision que personne n'a touchée.
          texteEnregistre: serializeDecision(idDecision, l.decision),
        };
      });
    } catch {
      // Ne pas empêcher d'éditer le cadrage : les décisions rejoindront l'écran au prochain chargement.
      decisions.value = [];
    }
    titre.value = String(data["titre"] ?? "");
    domaines.value = ((data["domaines"] as string[]) ?? []).join(", ");
    objectif.value = extractSection(parse.body, "Objectif");
    // Ce que l'éditeur ne sait pas présenter doit lui survivre : sans cela, réenregistrer effacerait des sections que quelqu'un a écrites.
    sectionsInconnues.value = extractSectionsAutres(
      parse.body,
      SECTIONS_CONNUES,
    );
    parcours.value = extractSection(parse.body, "Parcours utilisateur");
    liensPortes.value = (
      (data["liens"] as Array<Record<string, unknown>>) ?? []
    )
      .filter((l) => !!l && typeof l === "object")
      .map((l) => ({
        tag: String(l["tag"] ?? ""),
        url: String(l["url"] ?? ""),
        nom: String(l["nom"] ?? ""),
      }))
      .filter((l) => l.url);
    impacts.value = ((data["impacts"] as Array<Record<string, unknown>>) ?? [])
      .filter((i) => !!i && typeof i === "object")
      .map((i) => {
        const nature =
          NATURES_IMPACT.find((n) => i[n] !== undefined) ?? "regle";
        const brut = i[nature];
        const cible = typeof brut === "string" ? brut : "";
        return {
          cible,
          nature,
          operation: i["operation"] as OperationImpact,
          enonce: enonces.get(cible) ?? "",
        };
      });
  } catch (e) {
    // Oublier ce qui a échoué : un rechargement du référentiel doit pouvoir retenter la lecture, sinon l'écran reste en erreur jusqu'à la navigation.
    chargeId = null;
    erreurChargement.value =
      e instanceof GithubError || e instanceof Error
        ? e.message
        : "Le cadrage n’a pas pu être chargé.";
  } finally {
    chargement.value = false;
  }
}

async function enregistrer(): Promise<void> {
  const origine = source.value;
  if (envoi.value || problemes.value.length || !origine) return;

  envoi.value = true;
  erreur.value = null;
  enregistre.value = false;
  try {
    const apres = await redaction.saveCadrage(
      id.value,
      origine,
      {
        titre: titre.value,
        domaines: domainesSaisis(),
        objectif: objectif.value,
        parcours: parcours.value,
        impacts: impacts.value,
        liens: liensPortes.value,
        sectionsInconnues: sectionsInconnues.value,
      },
      contexte.value ?? undefined,
    );
    // Le SHA rendu par l'écriture est celui sur lequel la suivante se fonde : l'appliquer évite un rechargement, et la course qu'il introduisait.
    source.value = apres;

    // Les décisions après le cadrage : elles vivent dans son répertoire, qui doit exister. Une par enregistrement, le SHA rendu servant au suivant. Seules celles qui ont changé : réécrire les autres produirait des enregistrements sans objet et toucherait des fichiers que personne n'a modifiés, ce qui rend l'historique illisible.
    const ecrites: DecisionSaisie[] = [];
    for (const d of decisions.value) {
      const idDecision = d.id.trim();
      if (!idDecision) continue;

      const texte = serializeDecision(idDecision, d);
      if (d.fichier && texte === d.texteEnregistre) {
        ecrites.push(d);
        continue;
      }

      const sha = await redaction.saveDecision(
        id.value,
        idDecision,
        origine.branche,
        d,
        d.sha,
      );
      ecrites.push({
        ...d,
        fichier: `cadrages/${id.value}/decisions/${idDecision}.md`,
        sha,
        texteEnregistre: texte,
      });
    }
    decisions.value = ecrites;

    for (const chemin of decisionsSupprimees.value) {
      await redaction.supprimerDecision(origine.branche, chemin);
    }
    decisionsSupprimees.value = [];

    enregistre.value = true;

    // La vue lecture n'affiche que ce que le magasin porte : sans ce rechargement, revenir au cadrage montrerait l'état d'avant l'enregistrement jusqu'à ce que quelqu'un recharge à la main. Les contenus étant lus au commit, ce qui revient est bien ce qu'on vient d'écrire.
    void store.loadReferentiel();
  } catch (e) {
    erreur.value =
      e instanceof GithubError || e instanceof Error
        ? e.message
        : "L’enregistrement a échoué.";
  } finally {
    envoi.value = false;
  }
}
</script>

<template>
  <div class="editer-cadrage-page">
    <RouterLink class="retour" :to="liens.chemin('cadrages')">
      <UiIcone nom="arrow_back" /> Cadrages
    </RouterLink>

    <header class="entete">
      <p class="type">Reprendre un cadrage</p>
      <h1>{{ id }}</h1>
      <!-- Toujours sa branche : un cadrage que la principale porte est livré, et ne se charge pas ici (RG-cadrage-livre-immuable). -->
      <p v-if="source" class="sous-titre">
        Chargé depuis <code>{{ source.branche }}</code
        >. Les écritures y restent jusqu’à la livraison.
      </p>
    </header>

    <template v-if="!chargement && !erreurChargement && transitions.length">
      <section class="cycle">
        <div class="cycle-etat">
          <span class="cycle-libelle">Statut</span>
          <strong>{{ libelleStatut(statut()) }}</strong>
        </div>
        <div class="cycle-actions">
          <UiBouton
            v-for="vers of transitions"
            :key="vers"
            variante="outlined"
            :disabled="transition || envoi || problemes.length > 0"
            @click="allerVers(vers)"
          >
            {{ libelleStatut(vers) }}
          </UiBouton>
        </div>
      </section>
      <p v-if="problemes.length" class="cycle-bloque">
        Le cadrage doit être cohérent avant de changer de statut.
      </p>
      <p v-if="basculeEchouee" class="cycle-bloque">
        La demande de fusion n’a pas basculé : le statut n’a pas changé.
        Réessayer, ou basculer la demande sur la plateforme.
      </p>
    </template>

    <p v-if="chargement" class="attente">Chargement du cadrage…</p>
    <p v-else-if="erreurChargement" class="erreur">
      <UiIcone nom="error_outline" /> <span>{{ erreurChargement }}</span>
    </p>
    <form v-else class="formulaire" @submit.prevent="enregistrer()">
      <UiChamp v-model="titre" libelle="Titre" name="titre" :disabled="envoi" />

      <UiChamp
        v-model="domaines"
        libelle="Domaines"
        name="domaines"
        indice="Séparés par des virgules."
        :disabled="envoi"
      />

      <UiChamp
        v-model="objectif"
        libelle="Objectif"
        multiligne
        :rows="5"
        name="objectif"
        :disabled="envoi"
      />

      <UiChamp
        v-model="parcours"
        libelle="Parcours utilisateur"
        multiligne
        :rows="5"
        name="parcours"
        :disabled="envoi"
      />

      <section class="impacts">
        <div class="impacts-tete">
          <h2 class="section">Impacts sur les règles</h2>
          <UiBouton :disabled="envoi" @click="ajouterImpact()">
            <UiIcone nom="add" /> Ajouter
          </UiBouton>
        </div>

        <p v-if="!impacts.length" class="vide">
          Aucun impact déclaré. Un cadrage peut n’en porter aucun tant qu’il n’a
          pas conclu ce qu’il change.
        </p>

        <div v-for="(i, index) of impacts" :key="index" class="impact">
          <div class="impact-tete">
            <UiSelect
              class="nature"
              :model-value="i.nature ?? 'regle'"
              libelle="Nature"
              :options="optionsNature"
              :name="'nature' + index"
              :disabled="envoi"
              @update:model-value="majImpact(index, { nature: $event })"
            />

            <UiChamp
              class="regle"
              :model-value="i.cible"
              :libelle="libelleNature(i.nature ?? 'regle')"
              :name="'cible' + index"
              :disabled="envoi"
              @update:model-value="majImpact(index, { cible: $event })"
            />

            <UiSelect
              class="operation"
              :model-value="i.operation"
              libelle="Opération"
              :options="optionsOperation"
              :name="'op' + index"
              :disabled="envoi"
              @update:model-value="majImpact(index, { operation: $event })"
            />

            <UiBouton
              variante="icon"
              :disabled="envoi"
              aria-label="Retirer cet impact"
              @click="retirerImpact(index)"
            >
              <UiIcone nom="close" />
            </UiBouton>
          </div>

          <UiChamp
            v-if="demandeEnonce(i.operation)"
            class="enonce"
            :model-value="i.enonce"
            libelle="Énoncé de la règle"
            multiligne
            :rows="4"
            :name="'enonce' + index"
            indice="Le texte de la règle après ce cadrage. C’est lui que la propagation écrira au référentiel."
            :disabled="envoi"
            @update:model-value="majImpact(index, { enonce: $event })"
          />
        </div>
      </section>

      <section class="impacts">
        <div class="impacts-tete">
          <h2 class="section">Décisions</h2>
          <UiBouton :disabled="envoi" @click="ajouterDecision()">
            <UiIcone nom="add" /> Ajouter
          </UiBouton>
        </div>

        <p v-if="!decisions.length" class="vide">
          Aucune décision. Ce qui a le plus de valeur six mois plus tard, ce
          sont les options écartées et le motif qui a tranché.
        </p>

        <div v-for="(d, iD) of decisions" :key="iD" class="impact decision">
          <div class="impact-tete">
            <UiChamp
              class="regle"
              :model-value="d.titre"
              libelle="La question posée"
              :name="'dtitre' + iD"
              :disabled="envoi"
              @update:model-value="majDecision(iD, { titre: $event })"
            />

            <UiSelect
              class="operation"
              :model-value="d.statut"
              libelle="Statut"
              :options="optionsStatutDecision"
              :name="'dstatut' + iD"
              :disabled="envoi"
              @update:model-value="majDecision(iD, { statut: $event })"
            />

            <UiBouton
              variante="icon"
              :disabled="envoi"
              aria-label="Retirer cette décision"
              @click="retirerDecision(iD)"
            >
              <UiIcone nom="close" />
            </UiBouton>
          </div>

          <UiChamp
            class="enonce"
            :model-value="d.description"
            libelle="Ce qui rendait la question ouverte"
            multiligne
            :rows="3"
            :name="'ddesc' + iD"
            :disabled="envoi"
            @update:model-value="majDecision(iD, { description: $event })"
          />

          <div class="options-tete">
            <h3>Options</h3>
            <UiBouton :disabled="envoi" @click="ajouterOption(iD)">
              <UiIcone nom="add" /> Option
            </UiBouton>
          </div>

          <div
            v-for="(o, iO) of d.options"
            :key="iO"
            class="option"
            :class="{ retenue: estRetenue(d, o.id) }"
          >
            <button
              type="button"
              class="marque"
              :disabled="envoi || !o.id.trim()"
              :aria-pressed="estRetenue(d, o.id)"
              :title="
                estRetenue(d, o.id)
                  ? 'Option retenue — cliquer pour ne plus la retenir'
                  : 'Désigner comme retenue'
              "
              @click="basculerRetenue(iD, o.id)"
            >
              <UiIcone
                :nom="
                  estRetenue(d, o.id)
                    ? 'radio_button_checked'
                    : 'radio_button_unchecked'
                "
              />
            </button>

            <div class="option-champs">
              <UiChamp
                :model-value="o.id"
                libelle="Nom de l’option"
                :name="'oid' + iD + '-' + iO"
                indice="En minuscules, avec des tirets — il ne se renomme plus."
                :disabled="envoi"
                @update:model-value="majOption(iD, iO, { id: $event })"
              />

              <UiChamp
                :model-value="o.corps"
                libelle="Ce qu’elle propose, pour et contre"
                multiligne
                :rows="3"
                :name="'ocorps' + iD + '-' + iO"
                :disabled="envoi"
                @update:model-value="majOption(iD, iO, { corps: $event })"
              />
            </div>

            <UiBouton
              variante="icon"
              :disabled="envoi"
              aria-label="Retirer cette option"
              @click="retirerOption(iD, iO)"
            >
              <UiIcone nom="close" />
            </UiBouton>
          </div>

          <UiChamp
            class="enonce"
            :model-value="d.decision"
            libelle="Ce qui a tranché"
            multiligne
            :rows="3"
            :name="'dtranche' + iD"
            indice="Le critère qui a fait pencher, non la liste des avantages."
            :disabled="envoi"
            @update:model-value="majDecision(iD, { decision: $event })"
          />
        </div>
      </section>

      <ul v-if="problemes.length" class="problemes">
        <li v-for="p of problemes" :key="p">{{ p }}</li>
      </ul>

      <p v-if="erreur" class="erreur">
        <UiIcone nom="error_outline" /> <span>{{ erreur }}</span>
      </p>

      <p v-if="enregistre" class="succes">
        <UiIcone nom="check_circle" />
        <span>Cadrage enregistré sur sa branche.</span>
      </p>

      <div class="actions">
        <UiBouton :to="liens.chemin('cadrages')">Fermer</UiBouton>
        <UiBouton
          variante="filled"
          type="submit"
          :disabled="envoi || problemes.length > 0"
        >
          {{ envoi ? "Enregistrement…" : "Enregistrer" }}
        </UiBouton>
      </div>
    </form>
  </div>
</template>

<style scoped>
.editer-cadrage-page {
  display: block;
  max-width: 78ch;
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
.type {
  margin: 0 0 2px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
h1 {
  margin: 0 0 6px;
  font-family: var(--pc-font-mono, monospace);
  font-size: 26px;
  font-weight: 600;
}
.sous-titre {
  margin: 0 0 20px;
  line-height: 1.55;
  color: var(--mat-sys-on-surface-variant);

  code {
    font-family: var(--pc-font-mono, monospace);
    font-size: 12.5px;
  }
}
.cycle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 18px;
  padding: 12px 16px;
  border-radius: 10px;
  background: var(--mat-sys-surface-container);
}
.cycle-etat {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.cycle-libelle {
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
.cycle-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.cycle-bloque {
  margin: -10px 0 18px;
  font-size: 13px;
  line-height: 1.5;
  max-width: 66ch;
  color: var(--mat-sys-on-surface-variant);
}
.formulaire {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.section {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
.impacts {
  margin-top: 14px;
}
.impacts-tete {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.impact {
  padding: 12px 14px 2px;
  margin-bottom: 10px;
  border-radius: 9px;
  background: var(--mat-sys-surface-container);
}
.impact-tete {
  display: flex;
  align-items: flex-start;
  gap: 10px;

  .nature {
    width: 140px;
    flex: 0 0 auto;
  }
  .regle {
    flex: 1 1 auto;
  }
  /* Assez large pour que le plus long libellé tienne sans être tronqué. */
  .operation {
    flex: 0 0 170px;
  }
  .ui-bouton {
    margin-top: 8px;
  }
}
.options-tete {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 4px 0 2px;

  h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--mat-sys-on-surface-variant);
  }
}

/* Une option : la marque de sélection, les champs, le retrait. Alignés sur une ligne, la marque en tête parce que c'est ce qu'on cherche du regard quand on veut savoir ce qui a été retenu. */
.option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px 2px;
  border-radius: 8px;
  border: 1px solid transparent;

  &.retenue {
    border-color: var(--mat-sys-primary);
    background: color-mix(in srgb, var(--mat-sys-primary) 5%, transparent);
  }
  > button {
    margin-top: 8px;
  }
}
.option-champs {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: minmax(0, 200px) minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}
/* La marque de sélection : un bouton, non une case, parce qu'une seule option est retenue et qu'on peut aussi n'en retenir aucune. */
.marque {
  margin-top: 8px;
  border: none;
  background: none;
  padding: 4px;
  cursor: pointer;
  color: var(--mat-sys-on-surface-variant);
  line-height: 0;

  &:disabled {
    opacity: 0.3;
    cursor: default;
  }
}
.option.retenue .marque {
  color: var(--mat-sys-primary);
}
.decision .option-champs .ui-champ {
  margin-bottom: 4px;
}

@media (max-width: 720px) {
  .option-champs {
    grid-template-columns: minmax(0, 1fr);
  }
}
.enonce {
  width: 100%;
}
.vide {
  margin: 0 0 12px;
  max-width: 62ch;
  line-height: 1.55;
  color: var(--mat-sys-on-surface-variant);
}
.problemes {
  margin: 10px 0 0;
  padding: 11px 13px 11px 30px;
  border-radius: 8px;
  font-size: 13.5px;
  line-height: 1.6;
  background: var(--pc-statut-relecture-bg);
  border: 1px solid var(--pc-statut-relecture-bd);
  color: var(--pc-statut-relecture);
}
.attente {
  color: var(--mat-sys-on-surface-variant);
}
.erreur,
.succes {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 10px 0 0;
  padding: 11px 13px;
  border-radius: 8px;
  font-size: 13.5px;
  line-height: 1.5;
  background: var(--pc-statut-relecture-bg);
  border: 1px solid var(--pc-statut-relecture-bd);
  color: var(--pc-statut-relecture);

  .material-symbols-outlined {
    font-size: 19px;
    width: 19px;
    height: 19px;
    flex: none;
  }
}
.succes {
  background: var(--pc-op-cree-bg, #e6f4ea);
  border-color: transparent;
  color: var(--pc-op-cree, #17663a);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}
</style>
