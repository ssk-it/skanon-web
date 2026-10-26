<script setup lang="ts">
import { computed, ref } from "vue";
import { LocaleService, useMessages } from "../../core/i18n/locale.service";
import { inject } from "../../core/injection";
import { LINK_TAG_LABEL, type CodeRepo } from "../../core/model/model";
import {
  AutomationService,
  WORKFLOW_PATHS,
} from "../../core/repo/automation.service";
import {
  BootstrapService,
  proposedNames,
  type NewProject,
} from "../../core/repo/bootstrap.service";
import { tagFromInput } from "../../core/repo/link-tag";
import { resolveNames, type RepoNames } from "../../core/repo/repo-names";
import { SpecificationStore } from "../../core/repo/specification.store";
import UiButton from "../../ui/UiButton.vue";
import UiCheckbox from "../../ui/UiCheckbox.vue";
import UiTextField from "../../ui/UiTextField.vue";
import { bootstrapWizardMessages } from "./bootstrap-wizard.messages";

/**
 * The assistant that bootstraps an empty repo (RG-amorcage-depot, RG-amorcage-explique, scoping 2026-062).
 *
 * The repo is already chosen — from the home page, or by opening it. Only the project name is required; every other step may be skipped, and skipping restores what it proposes, so that skipping everything gives the plain bootstrap. Each step explains the notion its question bears on, and only that one: an explanation given in advance is not retained.
 */
const store = inject(SpecificationStore);
const bootstrapService = inject(BootstrapService);
const automation = inject(AutomationService);
const locale = inject(LocaleService);
const t = useMessages(bootstrapWizardMessages);

const STEPS = ["project", "structure", "change", "links", "summary"] as const;
type Step = (typeof STEPS)[number];
const index = ref(0);
const step = computed<Step>(() => STEPS[index.value]);

// The repo name serves as a suggestion: it is what the author has just chosen, and retyping it identically teaches no one anything.
const projectName = ref(store.repoRef().repo);
const projectDescription = ref("");

/** `null` while untouched: the proposed names then follow the displayed language. */
const chosenNames = ref<RepoNames | null>(null);
const names = computed(
  () => chosenNames.value ?? proposedNames(locale.language()),
);
const nameAnomalies = computed(() => resolveNames(names.value).anomalies);
const FOLDER_KEYS = Object.keys(proposedNames("fr").dossiers) as Array<
  keyof RepoNames["dossiers"]
>;
const FILE_KEYS = Object.keys(proposedNames("fr").fichiers) as Array<
  keyof RepoNames["fichiers"]
>;

function setFolder(key: keyof RepoNames["dossiers"], value: string): void {
  chosenNames.value = {
    ...names.value,
    dossiers: { ...names.value.dossiers, [key]: value.trim() },
  };
}

function setFile(key: keyof RepoNames["fichiers"], value: string): void {
  chosenNames.value = {
    ...names.value,
    fichiers: { ...names.value.fichiers, [key]: value.trim() },
  };
}

/** Checked from the start: a framed repo without automation does not keep its promises, and the omission only shows at the first inconsistent delivery. */
const withAutomation = ref(true);

const codeReposText = ref("");
const codeRepoLines = computed(() =>
  codeReposText.value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean),
);
const invalidCodeRepos = computed(() =>
  codeRepoLines.value.filter((l) => !/^[^/\s]+\/[^/\s]+(\s|$)/.test(l)),
);
const codeRepos = computed<CodeRepo[]>(() =>
  codeRepoLines.value.map((l) => {
    const [repo, ...role] = l.split(/\s+/);
    return { repo, role: role.join(" ") };
  }),
);

const linkKindsText = ref("");
// A known kind's label gives its key, in the displayed language (RG-nature-lien-normalisee).
const linkTags = computed(() => [
  ...new Set(
    linkKindsText.value
      .split(",")
      .map((k) => tagFromInput(k, LINK_TAG_LABEL[locale.language()]))
      .filter(Boolean),
  ),
]);

const canAdvance = computed(() => {
  switch (step.value) {
    case "project":
      return projectName.value.trim() !== "";
    case "structure":
      return nameAnomalies.value.length === 0;
    case "links":
      return invalidCodeRepos.value.length === 0;
    default:
      return true;
  }
});
// The name is the only required answer: its step cannot be skipped.
const skippable = computed(
  () => step.value !== "project" && step.value !== "summary",
);

function next(): void {
  if (canAdvance.value) index.value++;
}

function skip(): void {
  if (step.value === "structure") chosenNames.value = null;
  if (step.value === "change") withAutomation.value = true;
  if (step.value === "links") {
    codeReposText.value = "";
    linkKindsText.value = "";
  }
  index.value++;
}

const project = computed<NewProject>(() => ({
  name: projectName.value.trim(),
  // No invented description: a sentence no one wrote is taken as true by those who read it next, and gets copied.
  description: projectDescription.value.trim(),
  language: locale.language(),
  names: names.value,
  codeRepos: codeRepos.value,
  linkTags: linkTags.value,
}));

const plannedPaths = computed(() =>
  bootstrapService.plannedFiles(project.value).map((f) => f.path),
);

const creating = ref(false);
const failure = ref<string | null>(null);
const automationFailure = ref<string | null>(null);

async function create(): Promise<void> {
  if (creating.value) return;
  creating.value = true;
  failure.value = null;
  try {
    await bootstrapService.bootstrapProject(project.value);
  } catch (e) {
    failure.value = e instanceof Error ? e.message : t().failed;
    creating.value = false;
    return;
  }
  // After the structure, not during it: if the access does not allow writing the workflows, the repo stays bootstrapped, and the refusal stays on screen until the author opens the specification.
  if (withAutomation.value) {
    try {
      await automation.install();
      return;
    } catch (e) {
      automationFailure.value = e instanceof Error ? e.message : t().failed;
      creating.value = false;
      return;
    }
  }
  await store.loadSpecification();
}

function openSpecification(): void {
  void store.loadSpecification();
}
</script>

<template>
  <section class="assistant">
    <h2 class="titre">{{ t().title }}</h2>
    <ol class="etapes">
      <li class="faite">{{ t().steps.repo }}</li>
      <li
        v-for="(s, i) of STEPS"
        :key="s"
        :class="{ faite: i < index, courante: i === index }"
        :aria-current="i === index ? 'step' : undefined"
      >
        {{ t().steps[s] }}
      </li>
    </ol>

    <div v-if="step === 'project'" class="etape">
      <p class="explication">{{ t().projectIntro }}</p>
      <UiTextField
        v-model="projectName"
        :label="t().projectName"
        name="nomProjet"
      />
      <UiTextField
        v-model="projectDescription"
        :label="t().projectDescription"
        :hint="t().descriptionHint"
        multiline
        :rows="2"
        name="descriptionProjet"
      />
    </div>

    <div v-else-if="step === 'structure'" class="etape">
      <p class="explication">{{ t().structureIntro }}</p>
      <p class="explication">{{ t().structureRules }}</p>
      <details class="noms" :open="chosenNames !== null">
        <summary>{{ t().nameFolders }}</summary>
        <p class="note">{{ t().nameFoldersIntro }}</p>
        <div class="grille">
          <UiTextField
            v-for="k of FOLDER_KEYS"
            :key="k"
            :model-value="names.dossiers[k]"
            :label="t().folders[k]"
            :name="`dossier-${k}`"
            @update:model-value="setFolder(k, $event)"
          />
          <UiTextField
            v-for="k of FILE_KEYS"
            :key="k"
            :model-value="names.fichiers[k]"
            :label="t().files[k]"
            :name="`fichier-${k}`"
            @update:model-value="setFile(k, $event)"
          />
        </div>
        <ul v-if="nameAnomalies.length" class="anomalies echec">
          <li v-for="a of nameAnomalies" :key="a">{{ a }}</li>
        </ul>
      </details>
    </div>

    <div v-else-if="step === 'change'" class="etape">
      <p class="explication">{{ t().changeIntro }}</p>
      <p class="explication">{{ t().changePropagation }}</p>
      <UiCheckbox v-model="withAutomation">
        {{ t().installAutomation }}
      </UiCheckbox>
      <p class="note">{{ t().automationDetail }}</p>
    </div>

    <div v-else-if="step === 'links'" class="etape">
      <p class="explication">{{ t().linksIntro }}</p>
      <UiTextField
        v-model="codeReposText"
        :label="t().codeRepos"
        :hint="t().codeReposHint"
        :error="
          invalidCodeRepos.length
            ? invalidCodeRepos.map((l) => t().codeRepoInvalid(l)).join(' ')
            : null
        "
        multiline
        :rows="3"
        name="depotsCode"
      />
      <p class="explication">{{ t().linkKindsIntro }}</p>
      <UiTextField
        v-model="linkKindsText"
        :label="t().linkKinds"
        :hint="t().linkKindsHint"
        name="naturesLien"
      />
    </div>

    <div v-else class="etape">
      <p class="explication">{{ t().summaryIntro }}</p>
      <p class="note">{{ t().structureCommit }}</p>
      <ul class="fichiers">
        <li v-for="p of plannedPaths" :key="p">
          <code>{{ p }}</code>
        </li>
      </ul>
      <template v-if="withAutomation">
        <p class="note">{{ t().automationCommit }}</p>
        <ul class="fichiers">
          <li v-for="p of WORKFLOW_PATHS" :key="p">
            <code>{{ p }}</code>
          </li>
        </ul>
      </template>
      <p v-if="failure" class="echec">{{ failure }}</p>
      <template v-if="automationFailure">
        <p class="echec">{{ automationFailure }}</p>
        <p class="note">{{ t().automationLater }}</p>
      </template>
    </div>

    <div class="actions">
      <UiButton
        v-if="index > 0 && !automationFailure"
        :disabled="creating"
        @click="index--"
      >
        {{ t().previous }}
      </UiButton>
      <UiButton v-if="skippable" @click="skip()">{{ t().skip }}</UiButton>
      <UiButton
        v-if="step !== 'summary'"
        variant="filled"
        :disabled="!canAdvance"
        @click="next()"
      >
        {{ t().next }}
      </UiButton>
      <UiButton
        v-else-if="automationFailure"
        variant="filled"
        @click="openSpecification()"
      >
        {{ t().open }}
      </UiButton>
      <UiButton v-else variant="filled" :disabled="creating" @click="create()">
        {{ creating ? t().creating : t().create }}
      </UiButton>
    </div>
  </section>
</template>

<style scoped>
.assistant {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(100%, 40rem);
  text-align: left;
}
.titre {
  margin: 0;
  font-size: 18px;
  color: var(--mat-sys-on-surface);
}
.etapes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: etape;
  font-size: 13px;
  color: var(--mat-sys-on-surface-variant);
}
.etapes li {
  counter-increment: etape;
}
.etapes li::before {
  content: counter(etape) ". ";
}
.etapes .faite {
  opacity: 0.7;
}
.etapes .courante {
  font-weight: 600;
  color: var(--mat-sys-primary);
}
.etape {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.etape .ui-champ {
  width: 100%;
}
.explication {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--mat-sys-on-surface);
}
.note {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--mat-sys-on-surface-variant);
}
.noms summary {
  cursor: pointer;
  font-size: 14px;
  color: var(--mat-sys-primary);
}
.grille {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  gap: 0 12px;
  margin-top: 8px;
}
.anomalies {
  margin: 4px 0 0;
  padding-left: 18px;
  font-size: 13px;
}
.fichiers {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
}
.echec {
  margin: 0;
  color: var(--mat-sys-error);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
