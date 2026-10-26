<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { GithubError } from "../../core/github/github-client";
import { inject } from "../../core/injection";
import {
  OPERATION_LABEL,
  SCOPING_STATUS_LABEL,
  DECISION_STATUS_LABEL,
  DECISION_STATUSES,
  type ExternalLink as LienPorte,
  type TargetKind,
  type ImpactOperation,
  type Specification,
  type ScopingStatus,
} from "../../core/model/model";
import {
  KNOWN_SECTIONS,
  isUnreadable,
  extractStatements,
  extractSection,
  extractOtherSections,
  splitFrontmatter,
} from "../../core/repo/frontmatter";
import { LinksService } from "../../core/repo/liens.service";
import {
  AuthoringService,
  isOnItsBranch,
  serializeDecision,
  type EditableDecision,
  type ImpactInput,
  type EditableOption,
  type ScopingSource,
} from "../../core/repo/redaction.service";
import { SpecificationStore } from "../../core/repo/referentiel.store";
import { VerificationService } from "../../core/repo/verification.service";
import { linkedSignal } from "../../core/signaux";
import UiButton from "../../ui/UiBouton.vue";
import UiTextField from "../../ui/UiChamp.vue";
import UiIcon from "../../ui/UiIcone.vue";
import UiSelect from "../../ui/UiSelect.vue";

/**
 * Reprise d'un cadrage ouvert.
 *
 * Le cadrage est chargé depuis sa propre branche, où le travail en cours se trouve, et non depuis la branche principale qui ne le connaît pas encore.
 *
 * Le statut n'est volontairement pas modifiable ici : faire avancer un cadrage dans son cycle est une décision, pas une saisie, et mérite son propre parcours.
 */

const OPERATIONS: ImpactOperation[] = ["cree", "modifie", "abroge", "touche"];

/**
 * Les natures qu'un impact peut viser, dans l'ordre où on les cherche à la relecture d'un fichier. Le même que dans le chargeur et le vérificateur.
 */
const IMPACT_KINDS = ["regle", "adr", "architecture"] as const;

const KIND_LABEL: Record<TargetKind, string> = {
  regle: "Règle",
  adr: "Décision",
  architecture: "Document",
};

/** Opérations dont la propagation tire une écriture, donc un énoncé obligatoire. */
const WITH_STATEMENT = new Set<ImpactOperation>(["cree", "modifie"]);

/** Une décision en cours d'édition, et sa provenance dans le dépôt. */
interface DecisionInput extends EditableDecision {
  /** Chemin du fichier existant, `null` pour une décision nouvelle. */
  readonly file: string | null;
  readonly sha: string | undefined;
  /** L'identifiant, qui donne son nom au fichier et ne se renomme jamais. */
  readonly id: string;
  /** Le texte tel qu'il est dans le dépôt, pour ne réécrire que ce qui change. */
  readonly savedText?: string;
}

const route = useRoute();
const id = computed(() => String(route.params["id"]));

const store = inject(SpecificationStore);
const links = inject(LinksService);
const authoring = inject(AuthoringService);
const verification = inject(VerificationService);

/**
 * Le référentiel de la branche éditée, quand elle en a un.
 *
 * Sert à vérifier ce qu'on écrit : un cadrage crée souvent le domaine et les règles qu'il déclare, absents de la branche principale. Les vérifier contre celle-ci les signalerait comme inconnus.
 */
const context = ref<Specification | null>(null);

/**
 * Les décisions du cadrage, telles qu'on les édite.
 *
 * Chacune garde le nom de son fichier et le SHA d'où elle vient : le premier ne se renomme jamais — un fichier déplacé perd son historique — et le second est le contrôle de concurrence de la plateforme.
 */
const decisions = ref<readonly DecisionInput[]>([]);
const deletedDecisions = ref<readonly string[]>([]);

const decisionStatusOptions = DECISION_STATUSES.map((s) => ({
  value: s,
  label: DECISION_STATUS_LABEL[s],
}));

function addDecision(): void {
  // Numérotée dans l'ordre d'apparition : c'est ce qui ordonne les fichiers, et l'ordre où les questions se sont posées se relit ainsi.
  const next = String(decisions.value.length + 1).padStart(2, "0");
  decisions.value = [
    ...decisions.value,
    {
      file: null,
      sha: undefined,
      id: `${next}-`,
      title: "",
      status: "ouverte",
      description: "",
      options: [],
      chosenOption: null,
      decision: "",
    },
  ];
}

function updateDecision(i: number, fields: Partial<DecisionInput>): void {
  decisions.value = decisions.value.map((x, n) =>
    n === i ? { ...x, ...fields } : x,
  );
}

function removeDecision(i: number): void {
  const target = decisions.value[i];
  // Un fichier déjà enregistré doit être retiré du dépôt, non seulement de l'écran : sans cela, il réapparaîtrait au rechargement.
  if (target?.file) {
    deletedDecisions.value = [...deletedDecisions.value, target.file];
  }
  decisions.value = decisions.value.filter((_, n) => n !== i);
}

function addOption(i: number): void {
  updateDecision(i, {
    options: [...decisions.value[i].options, { id: "", body: "" }],
  });
}

function updateOption(
  i: number,
  j: number,
  fields: Partial<EditableOption>,
): void {
  const d = decisions.value[i];
  const options = d.options.map((o, n) => (n === j ? { ...o, ...fields } : o));

  // Renommer l'option retenue doit la garder retenue : sans cela, corriger une faute de frappe déferait le choix sans rien dire.
  const previousValue = d.options[j]?.id.trim();
  const chosen =
    fields.id !== undefined && previousValue && d.chosenOption === previousValue
      ? fields.id.trim() || null
      : d.chosenOption;

  updateDecision(i, { options, chosenOption: chosen });
}

function removeOption(i: number, j: number): void {
  const d = decisions.value[i];
  const leaving = d.options[j]?.id.trim();
  updateDecision(i, {
    options: d.options.filter((_, n) => n !== j),
    chosenOption: d.chosenOption === leaving ? null : d.chosenOption,
  });
}

/** Désigne l'option retenue, ou la libère si elle l'était déjà. */
function toggleChosen(i: number, idOption: string): void {
  const own = idOption.trim();
  if (!own) return;
  const d = decisions.value[i];
  updateDecision(i, {
    chosenOption: d.chosenOption === own ? null : own,
  });
}

function isChosen(d: DecisionInput, idOption: string): boolean {
  return idOption.trim() === d.chosenOption;
}

/** La branche principale, pour dire si le cadrage vit ailleurs. */
const mainBranch = ref("");

/** Les sections que l'éditeur ne présente pas, conservées telles quelles. */
const unknownSections = ref("");

/**
 * Les liens externes, conservés tels qu'ils étaient.
 *
 * L'éditeur ne les présente pas — ils se saisissent depuis la fiche — mais la sérialisation reconstruit tout le frontmatter : ne pas les relire les effacerait au premier enregistrement.
 */
const carriedLinks = ref<readonly LienPorte[]>([]);

const kindOptions = IMPACT_KINDS.map((n) => ({
  value: n as TargetKind,
  label: KIND_LABEL[n],
}));
const operationOptions = OPERATIONS.map((op) => ({
  value: op,
  label: OPERATION_LABEL[op],
}));
const kindLabel = (n: TargetKind) => KIND_LABEL[n];
const requiresStatement = (op: ImpactOperation) => WITH_STATEMENT.has(op);

const title = ref("");
const domains = ref("");
const goal = ref("");
const journey = ref("");
const impacts = ref<ImpactInput[]>([]);

/**
 * Le statut tel que le dépôt l'établit — RG-statuts-cadrage.
 *
 * Lu sur le cadrage que le store a déduit de sa demande de fusion, et non dans le fichier, qui ne le porte plus. Il suit le store quand les branches finissent d'arriver ; une bascule réussie l'emporte jusqu'à la relecture suivante.
 */
const status = linkedSignal<ScopingStatus>(
  () => store.findScoping(id.value)?.status ?? "brouillon",
);
const transition = ref(false);
const toggleFailed = ref(false);

const source = ref<ScopingSource | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);
const sending = ref(false);
const error = ref<string | null>(null);
const saved = ref(false);

/**
 * Statuts vers lesquels ce cadrage peut aller.
 *
 * Vides si le cadrage ne vit pas sur sa propre branche : son statut décrit alors ce qui est déjà dans le référentiel, et le changer sans passer par une demande de fusion contournerait la vérification.
 *
 * « Sa propre branche » se reconnaît à ce qu'elle n'est pas la principale, et non à son nom — voir RG-branche-par-cadrage. Le test portait sur le préfixe « cadrage/ », que pas une branche réelle ne porte : toutes suivent « cadrage-<id> », et les boutons étaient donc absents partout.
 */
const transitions = computed(() =>
  authoring.possibleTransitions(
    status(),
    isOnItsBranch(source.value?.branch, mainBranch.value),
  ),
);

const statusLabel = (s: ScopingStatus) => SCOPING_STATUS_LABEL[s];

function enteredDomains(): string[] {
  return domains.value
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
}

/**
 * Ce qui empêcherait la livraison, tel que la vérification finale le dira.
 *
 * Les règles viennent du même module que l'Action exécute avant chaque livraison : ce qui est signalé ici est exactement ce qui bloquerait là-bas, sans qu'aucune règle n'existe en double.
 */
const problems = computed(() => {
  const missing = [
    ["un titre", title.value],
    ["un objectif", goal.value],
    ["un parcours", journey.value],
  ]
    .filter(([, v]) => !v.trim())
    .map(([name]) => `Il manque ${name}.`);

  // Les impacts sans règle désignée sont écartés avant la vérification : elle les rapporterait sous un identifiant vide, illisible pour le rédacteur.
  const designated = impacts.value.filter((i) => i.target.trim());
  const withoutRule = impacts.value.length - designated.length;

  const { errors } = verification.checkScoping(
    {
      id: id.value,
      title: title.value,
      domains: enteredDomains(),
      impacts: designated.map((i) => ({
        target: i.target.trim(),
        kind: i.kind ?? "regle",
        operation: i.operation,
      })),
      statements: new Map(
        designated
          .filter((i) => i.statement.trim())
          .map((i) => [i.target.trim(), i.statement.trim()]),
      ),
    },
    // Le référentiel de la branche éditée : c'est là que vivent le domaine et les règles que ce cadrage crée.
    context.value ?? undefined,
  );

  return [
    ...missing,
    ...(withoutRule
      ? [`${withoutRule} impact(s) ne désignent aucune règle.`]
      : []),
    ...errors,
  ];
});

/** Le cadrage déjà porté par le formulaire, pour ne pas le relire pour rien. */
let loadId: string | null = null;

watch(
  [id, () => store.state()],
  ([currentId, state]) => {
    if (state !== "pret") return;
    // La surveillance porte sur l'état du magasin : sans ce garde, tout rechargement du référentiel — celui qui suit un enregistrement, comme le bouton de la barre — relirait le cadrage et écraserait la saisie en cours.
    if (loadId === currentId) return;
    loadId = currentId;
    void load(currentId);
  },
  { immediate: true },
);

function addImpact(): void {
  impacts.value = [
    ...impacts.value,
    { target: "", kind: "regle", operation: "modifie", statement: "" },
  ];
  saved.value = false;
}

function removeImpact(index: number): void {
  impacts.value = impacts.value.filter((_, i) => i !== index);
  saved.value = false;
}

function updateImpact(index: number, field: Partial<ImpactInput>): void {
  impacts.value = impacts.value.map((i, n) =>
    n === index ? { ...i, ...field } : i,
  );
  saved.value = false;
}

/**
 * Fait passer le cadrage à un autre statut.
 *
 * Rien n'est tenté tant que le cadrage n'est pas cohérent : un statut avancé sur un cadrage que la vérification refuserait ne ferait que déplacer le problème plus près de la livraison.
 */
async function goToward(to: ScopingStatus): Promise<void> {
  if (
    transition.value ||
    sending.value ||
    problems.value.length ||
    !source.value
  )
    return;

  transition.value = true;
  error.value = null;
  toggleFailed.value = false;
  try {
    // Rien n'est écrit dans le fichier : le statut vit sur la demande de fusion, et c'est elle que la bascule change. La source reste donc valide, contrairement à ce qui se passait quand le statut y était écrit.
    const result = await authoring.changeStatus(id.value, to);
    // La demande porte le statut : si elle n'a pas basculé, rien n'a changé.
    if (!result.toggleFailed) status.set(to);
    toggleFailed.value = result.toggleFailed;
  } catch (e) {
    error.value =
      e instanceof GithubError || e instanceof Error
        ? e.message
        : "Le changement de statut a échoué.";
  } finally {
    transition.value = false;
  }
}

async function load(loadedId: string): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    const readAt = await authoring.loadForEditing(loadedId);
    if (id.value !== loadedId) return;

    const parse = splitFrontmatter(readAt.content);
    if (!parse) throw new Error("Ce cadrage n’a pas de frontmatter.");
    if (isUnreadable(parse)) throw new Error(parse.error);

    const data = parse.data as Record<string, unknown>;
    const statements = extractStatements(parse.body);

    source.value = readAt.source;
    context.value = readAt.context;
    mainBranch.value = readAt.mainBranch;

    // Depuis la branche du cadrage : une décision écrite en même temps que lui n'existe nulle part ailleurs.
    try {
      const read = await authoring.loadDecisions(
        loadedId,
        readAt.source.branch,
      );
      decisions.value = read.map((l) => {
        const idDecision = (l.file.split("/").pop() ?? "").replace(/\.md$/, "");
        return {
          ...l.decision,
          file: l.file,
          sha: l.sha,
          id: idDecision,
          // Ce que produirait une réécriture à l'identique : le comparer évite d'enregistrer une décision que personne n'a touchée.
          savedText: serializeDecision(idDecision, l.decision),
        };
      });
    } catch {
      // Ne pas empêcher d'éditer le cadrage : les décisions rejoindront l'écran au prochain chargement.
      decisions.value = [];
    }
    title.value = String(data["titre"] ?? "");
    domains.value = ((data["domaines"] as string[]) ?? []).join(", ");
    goal.value = extractSection(parse.body, "Objectif");
    // Ce que l'éditeur ne sait pas présenter doit lui survivre : sans cela, réenregistrer effacerait des sections que quelqu'un a écrites.
    unknownSections.value = extractOtherSections(parse.body, KNOWN_SECTIONS);
    journey.value = extractSection(parse.body, "Parcours utilisateur");
    carriedLinks.value = (
      (data["liens"] as Array<Record<string, unknown>>) ?? []
    )
      .filter((l) => !!l && typeof l === "object")
      .map((l) => ({
        tag: String(l["tag"] ?? ""),
        url: String(l["url"] ?? ""),
        name: String(l["nom"] ?? ""),
      }))
      .filter((l) => l.url);
    impacts.value = ((data["impacts"] as Array<Record<string, unknown>>) ?? [])
      .filter((i) => !!i && typeof i === "object")
      .map((i) => {
        const kind = IMPACT_KINDS.find((n) => i[n] !== undefined) ?? "regle";
        const raw = i[kind];
        const target = typeof raw === "string" ? raw : "";
        return {
          target: target,
          kind: kind,
          operation: i["operation"] as ImpactOperation,
          statement: statements.get(target) ?? "",
        };
      });
  } catch (e) {
    // Oublier ce qui a échoué : un rechargement du référentiel doit pouvoir retenter la lecture, sinon l'écran reste en erreur jusqu'à la navigation.
    loadId = null;
    loadError.value =
      e instanceof GithubError || e instanceof Error
        ? e.message
        : "Le cadrage n’a pas pu être chargé.";
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  const origin = source.value;
  if (sending.value || problems.value.length || !origin) return;

  sending.value = true;
  error.value = null;
  saved.value = false;
  try {
    const after = await authoring.saveScoping(
      id.value,
      origin,
      {
        title: title.value,
        domains: enteredDomains(),
        goal: goal.value,
        journey: journey.value,
        impacts: impacts.value,
        links: carriedLinks.value,
        unknownSections: unknownSections.value,
      },
      context.value ?? undefined,
    );
    // Le SHA rendu par l'écriture est celui sur lequel la suivante se fonde : l'appliquer évite un rechargement, et la course qu'il introduisait.
    source.value = after;

    // Les décisions après le cadrage : elles vivent dans son répertoire, qui doit exister. Une par enregistrement, le SHA rendu servant au suivant. Seules celles qui ont changé : réécrire les autres produirait des enregistrements sans objet et toucherait des fichiers que personne n'a modifiés, ce qui rend l'historique illisible.
    const written: DecisionInput[] = [];
    for (const d of decisions.value) {
      const idDecision = d.id.trim();
      if (!idDecision) continue;

      const text = serializeDecision(idDecision, d);
      if (d.file && text === d.savedText) {
        written.push(d);
        continue;
      }

      const sha = await authoring.saveDecision(
        id.value,
        idDecision,
        origin.branch,
        d,
        d.sha,
      );
      written.push({
        ...d,
        file: `cadrages/${id.value}/decisions/${idDecision}.md`,
        sha,
        savedText: text,
      });
    }
    decisions.value = written;

    for (const path of deletedDecisions.value) {
      await authoring.deleteDecision(origin.branch, path);
    }
    deletedDecisions.value = [];

    saved.value = true;

    // La vue lecture n'affiche que ce que le magasin porte : sans ce rechargement, revenir au cadrage montrerait l'état d'avant l'enregistrement jusqu'à ce que quelqu'un recharge à la main. Les contenus étant lus au commit, ce qui revient est bien ce qu'on vient d'écrire.
    void store.loadSpecification();
  } catch (e) {
    error.value =
      e instanceof GithubError || e instanceof Error
        ? e.message
        : "L’enregistrement a échoué.";
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div class="editer-cadrage-page">
    <RouterLink class="retour" :to="links.path('cadrages')">
      <UiIcon name="arrow_back" /> Cadrages
    </RouterLink>

    <header class="entete">
      <p class="type">Reprendre un cadrage</p>
      <h1>{{ id }}</h1>
      <!-- Toujours sa branche : un cadrage que la principale porte est livré, et ne se charge pas ici (RG-cadrage-livre-immuable). -->
      <p v-if="source" class="sous-titre">
        Chargé depuis <code>{{ source.branch }}</code
        >. Les écritures y restent jusqu’à la livraison.
      </p>
    </header>

    <template v-if="!loading && !loadError && transitions.length">
      <section class="cycle">
        <div class="cycle-etat">
          <span class="cycle-libelle">Statut</span>
          <strong>{{ statusLabel(status()) }}</strong>
        </div>
        <div class="cycle-actions">
          <UiButton
            v-for="vers of transitions"
            :key="vers"
            variant="outlined"
            :disabled="transition || sending || problems.length > 0"
            @click="goToward(vers)"
          >
            {{ statusLabel(vers) }}
          </UiButton>
        </div>
      </section>
      <p v-if="problems.length" class="cycle-bloque">
        Le cadrage doit être cohérent avant de changer de statut.
      </p>
      <p v-if="toggleFailed" class="cycle-bloque">
        La demande de fusion n’a pas basculé : le statut n’a pas changé.
        Réessayer, ou basculer la demande sur la plateforme.
      </p>
    </template>

    <p v-if="loading" class="attente">Chargement du cadrage…</p>
    <p v-else-if="loadError" class="erreur">
      <UiIcon name="error_outline" /> <span>{{ loadError }}</span>
    </p>
    <form v-else class="formulaire" @submit.prevent="save()">
      <UiTextField
        v-model="title"
        label="Titre"
        name="titre"
        :disabled="sending"
      />

      <UiTextField
        v-model="domains"
        label="Domaines"
        name="domaines"
        hint="Séparés par des virgules."
        :disabled="sending"
      />

      <UiTextField
        v-model="goal"
        label="Objectif"
        multiline
        :rows="5"
        name="objectif"
        :disabled="sending"
      />

      <UiTextField
        v-model="journey"
        label="Parcours utilisateur"
        multiline
        :rows="5"
        name="parcours"
        :disabled="sending"
      />

      <section class="impacts">
        <div class="impacts-tete">
          <h2 class="section">Impacts sur les règles</h2>
          <UiButton :disabled="sending" @click="addImpact()">
            <UiIcon name="add" /> Ajouter
          </UiButton>
        </div>

        <p v-if="!impacts.length" class="vide">
          Aucun impact déclaré. Un cadrage peut n’en porter aucun tant qu’il n’a
          pas conclu ce qu’il change.
        </p>

        <div v-for="(i, index) of impacts" :key="index" class="impact">
          <div class="impact-tete">
            <UiSelect
              class="nature"
              :model-value="i.kind ?? 'regle'"
              label="Nature"
              :options="kindOptions"
              :name="'nature' + index"
              :disabled="sending"
              @update:model-value="updateImpact(index, { kind: $event })"
            />

            <UiTextField
              class="regle"
              :model-value="i.target"
              :label="kindLabel(i.kind ?? 'regle')"
              :name="'cible' + index"
              :disabled="sending"
              @update:model-value="updateImpact(index, { target: $event })"
            />

            <UiSelect
              class="operation"
              :model-value="i.operation"
              label="Opération"
              :options="operationOptions"
              :name="'op' + index"
              :disabled="sending"
              @update:model-value="updateImpact(index, { operation: $event })"
            />

            <UiButton
              variant="icon"
              :disabled="sending"
              aria-label="Retirer cet impact"
              @click="removeImpact(index)"
            >
              <UiIcon name="close" />
            </UiButton>
          </div>

          <UiTextField
            v-if="requiresStatement(i.operation)"
            class="enonce"
            :model-value="i.statement"
            label="Énoncé de la règle"
            multiline
            :rows="4"
            :name="'enonce' + index"
            hint="Le texte de la règle après ce cadrage. C’est lui que la propagation écrira au référentiel."
            :disabled="sending"
            @update:model-value="updateImpact(index, { statement: $event })"
          />
        </div>
      </section>

      <section class="impacts">
        <div class="impacts-tete">
          <h2 class="section">Décisions</h2>
          <UiButton :disabled="sending" @click="addDecision()">
            <UiIcon name="add" /> Ajouter
          </UiButton>
        </div>

        <p v-if="!decisions.length" class="vide">
          Aucune décision. Ce qui a le plus de valeur six mois plus tard, ce
          sont les options écartées et le motif qui a tranché.
        </p>

        <div v-for="(d, iD) of decisions" :key="iD" class="impact decision">
          <div class="impact-tete">
            <UiTextField
              class="regle"
              :model-value="d.title"
              label="La question posée"
              :name="'dtitre' + iD"
              :disabled="sending"
              @update:model-value="updateDecision(iD, { title: $event })"
            />

            <UiSelect
              class="operation"
              :model-value="d.status"
              label="Statut"
              :options="decisionStatusOptions"
              :name="'dstatut' + iD"
              :disabled="sending"
              @update:model-value="updateDecision(iD, { status: $event })"
            />

            <UiButton
              variant="icon"
              :disabled="sending"
              aria-label="Retirer cette décision"
              @click="removeDecision(iD)"
            >
              <UiIcon name="close" />
            </UiButton>
          </div>

          <UiTextField
            class="enonce"
            :model-value="d.description"
            label="Ce qui rendait la question ouverte"
            multiline
            :rows="3"
            :name="'ddesc' + iD"
            :disabled="sending"
            @update:model-value="updateDecision(iD, { description: $event })"
          />

          <div class="options-tete">
            <h3>Options</h3>
            <UiButton :disabled="sending" @click="addOption(iD)">
              <UiIcon name="add" /> Option
            </UiButton>
          </div>

          <div
            v-for="(o, iO) of d.options"
            :key="iO"
            class="option"
            :class="{ retenue: isChosen(d, o.id) }"
          >
            <button
              type="button"
              class="marque"
              :disabled="sending || !o.id.trim()"
              :aria-pressed="isChosen(d, o.id)"
              :title="
                isChosen(d, o.id)
                  ? 'Option retenue — cliquer pour ne plus la retenir'
                  : 'Désigner comme retenue'
              "
              @click="toggleChosen(iD, o.id)"
            >
              <UiIcon
                :name="
                  isChosen(d, o.id)
                    ? 'radio_button_checked'
                    : 'radio_button_unchecked'
                "
              />
            </button>

            <div class="option-champs">
              <UiTextField
                :model-value="o.id"
                label="Nom de l’option"
                :name="'oid' + iD + '-' + iO"
                hint="En minuscules, avec des tirets — il ne se renomme plus."
                :disabled="sending"
                @update:model-value="updateOption(iD, iO, { id: $event })"
              />

              <UiTextField
                :model-value="o.body"
                label="Ce qu’elle propose, pour et contre"
                multiline
                :rows="3"
                :name="'ocorps' + iD + '-' + iO"
                :disabled="sending"
                @update:model-value="updateOption(iD, iO, { body: $event })"
              />
            </div>

            <UiButton
              variant="icon"
              :disabled="sending"
              aria-label="Retirer cette option"
              @click="removeOption(iD, iO)"
            >
              <UiIcon name="close" />
            </UiButton>
          </div>

          <UiTextField
            class="enonce"
            :model-value="d.decision"
            label="Ce qui a tranché"
            multiline
            :rows="3"
            :name="'dtranche' + iD"
            hint="Le critère qui a fait pencher, non la liste des avantages."
            :disabled="sending"
            @update:model-value="updateDecision(iD, { decision: $event })"
          />
        </div>
      </section>

      <ul v-if="problems.length" class="problemes">
        <li v-for="p of problems" :key="p">{{ p }}</li>
      </ul>

      <p v-if="error" class="erreur">
        <UiIcon name="error_outline" /> <span>{{ error }}</span>
      </p>

      <p v-if="saved" class="succes">
        <UiIcon name="check_circle" />
        <span>Cadrage enregistré sur sa branche.</span>
      </p>

      <div class="actions">
        <UiButton :to="links.path('cadrages')">Fermer</UiButton>
        <UiButton
          variant="filled"
          type="submit"
          :disabled="sending || problems.length > 0"
        >
          {{ sending ? "Enregistrement…" : "Enregistrer" }}
        </UiButton>
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
