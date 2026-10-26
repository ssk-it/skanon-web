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
import { LinksService } from "../../core/repo/links.service";
import {
  AuthoringService,
  isOnItsBranch,
  serializeDecision,
  type EditableDecision,
  type ImpactInput,
  type EditableOption,
  type ScopingSource,
} from "../../core/repo/authoring.service";
import { SpecificationStore } from "../../core/repo/specification.store";
import { VerificationService } from "../../core/repo/verification.service";
import { linkedSignal } from "../../core/signals";
import UiButton from "../../ui/UiButton.vue";
import UiTextField from "../../ui/UiTextField.vue";
import UiIcon from "../../ui/UiIcon.vue";
import UiSelect from "../../ui/UiSelect.vue";

/**
 * Resuming an open scoping.
 *
 * The scoping is loaded from its own branch, where the work in progress lives, and not from the main branch, which does not know it yet.
 *
 * The status is deliberately not editable here: moving a scoping through its cycle is a decision, not data entry, and deserves its own journey.
 */

const OPERATIONS: ImpactOperation[] = ["cree", "modifie", "abroge", "touche"];

/**
 * The kinds an impact can target, in the order they are looked up when re-reading a file. The same as in the loader and the checker.
 */
const IMPACT_KINDS = ["regle", "adr", "architecture"] as const;

const KIND_LABEL: Record<TargetKind, string> = {
  regle: "Règle",
  adr: "Décision",
  architecture: "Document",
};

/** Operations from which propagation derives a write, hence a mandatory statement. */
const WITH_STATEMENT = new Set<ImpactOperation>(["cree", "modifie"]);

/** A decision being edited, and its provenance in the repo. */
interface DecisionInput extends EditableDecision {
  /** Path of the existing file, `null` for a new decision. */
  readonly file: string | null;
  readonly sha: string | undefined;
  /** The identifier, which names the file and is never renamed. */
  readonly id: string;
  /** The text as it is in the repo, so as to rewrite only what changes. */
  readonly savedText?: string;
}

const route = useRoute();
const id = computed(() => String(route.params["id"]));

const store = inject(SpecificationStore);
const links = inject(LinksService);
const authoring = inject(AuthoringService);
const verification = inject(VerificationService);

/**
 * The specification of the edited branch, when it has one.
 *
 * Used to check what is written: a scoping often creates the domain and the rules it declares, absent from the main branch. Checking them against the latter would flag them as unknown.
 */
const context = ref<Specification | null>(null);

/**
 * The scoping's decisions, as they are edited.
 *
 * Each keeps the name of its file and the SHA it comes from: the first is never renamed — a moved file loses its history — and the second is the platform's concurrency control.
 */
const decisions = ref<readonly DecisionInput[]>([]);
const deletedDecisions = ref<readonly string[]>([]);

const decisionStatusOptions = DECISION_STATUSES.map((s) => ({
  value: s,
  label: DECISION_STATUS_LABEL[s],
}));

function addDecision(): void {
  // Numbered in order of appearance: that is what orders the files, and the order in which the questions arose can thus be read back.
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
  // An already saved file must be removed from the repo, not only from the screen: otherwise it would reappear on reload.
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

  // Renaming the chosen option must keep it chosen: otherwise, fixing a typo would silently undo the choice.
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

/** Marks the option as chosen, or releases it if it already was. */
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

/** The main branch, to tell whether the scoping lives elsewhere. */
const mainBranch = ref("");

/** The sections the editor does not present, kept as they are. */
const unknownSections = ref("");

/**
 * External links, kept as they were.
 *
 * The editor does not present them — they are entered from the scoping page — but serialisation rebuilds the whole frontmatter: not reading them back would erase them on the first save.
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
 * The status as the repo establishes it — RG-statuts-cadrage.
 *
 * Read on the scoping the store derived from its pull request, and not in the file, which no longer carries it. It follows the store when the branches finish arriving; a successful toggle prevails until the next re-read.
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
 * Statuses this scoping can move to.
 *
 * Empty if the scoping does not live on its own branch: its status then describes what is already in the specification, and changing it without going through a pull request would bypass the check.
 *
 * "Its own branch" is recognised by not being the main one, and not by its name — see RG-branche-par-cadrage. The test used to look for the « cadrage/ » prefix, which no real branch carries: they all follow « cadrage-<id> », and the buttons were therefore missing everywhere.
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
 * What would block delivery, as the final check will report it.
 *
 * The rules come from the same module the Action runs before each delivery: what is flagged here is exactly what would block there, with no rule existing twice.
 */
const problems = computed(() => {
  const missing = [
    ["un titre", title.value],
    ["un objectif", goal.value],
    ["un parcours", journey.value],
  ]
    .filter(([, v]) => !v.trim())
    .map(([name]) => `Il manque ${name}.`);

  // Impacts with no designated rule are set aside before the check: it would report them under an empty identifier, unreadable for the author.
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
    // The specification of the edited branch: that is where the domain and rules this scoping creates live.
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

/** The scoping already held by the form, so as not to re-read it for nothing. */
let loadId: string | null = null;

watch(
  [id, () => store.state()],
  ([currentId, state]) => {
    if (state !== "pret") return;
    // The watcher is on the store's state: without this guard, any reload of the specification — the one that follows a save, like the top-bar button — would re-read the scoping and overwrite the input in progress.
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
 * Moves the scoping to another status.
 *
 * Nothing is attempted while the scoping is not consistent: an advanced status on a scoping the check would reject would only move the problem closer to delivery.
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
    // Nothing is written in the file: the status lives on the pull request, and that is what the toggle changes. The source therefore stays valid, unlike what happened when the status was written there.
    const result = await authoring.changeStatus(id.value, to);
    // The pull request carries the status: if it did not toggle, nothing changed.
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

    // From the scoping's branch: a decision written at the same time as it exists nowhere else.
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
          // What an identical rewrite would produce: comparing against it avoids saving a decision nobody touched.
          savedText: serializeDecision(idDecision, l.decision),
        };
      });
    } catch {
      // Do not prevent editing the scoping: the decisions will reach the screen on the next load.
      decisions.value = [];
    }
    title.value = String(data["titre"] ?? "");
    domains.value = ((data["domaines"] as string[]) ?? []).join(", ");
    goal.value = extractSection(parse.body, "Objectif");
    // What the editor cannot present must survive it: otherwise, saving again would erase sections someone wrote.
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
    // Forget what failed: a reload of the specification must be able to retry the read, otherwise the screen stays in error until navigation.
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
    // The SHA returned by the write is the one the next write builds on: applying it avoids a reload, and the race it introduced.
    source.value = after;

    // The decisions after the scoping: they live in its directory, which must exist. One per commit, the returned SHA serving the next one. Only those that changed: rewriting the others would produce pointless commits and touch files nobody modified, which makes the history unreadable.
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

    // The read view shows only what the store holds: without this reload, going back to the scoping would show the state before the save until someone reloads by hand. Contents being read at the commit, what comes back is indeed what was just written.
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
      <!-- Always its branch: a scoping the main branch holds is delivered, and is not loaded here (RG-cadrage-livre-immuable). -->
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
  /* Wide enough for the longest label to fit without being truncated. */
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

/* An option: the selection mark, the fields, the removal. Aligned on one line, the mark first because it is what the eye looks for when wanting to know what was chosen. */
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
/* The selection mark: a button, not a checkbox, because only one option is chosen and one may also choose none. */
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
