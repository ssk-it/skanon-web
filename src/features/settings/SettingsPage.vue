<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { GithubError } from "../../core/github/github-client";
import { LocaleService, useMessages } from "../../core/i18n/locale.service";
import { inject } from "../../core/injection";
import {
  GUARANTEES,
  ACCESS_MODE_LABEL,
  type CodeRepo,
  type AccessMode,
  type TokenProtection,
} from "../../core/model/model";
import { AutomationService } from "../../core/repo/automation.service";
import { SpecificationStore } from "../../core/repo/specification.store";
import { SettingsService } from "../../core/repo/settings.service";
import {
  installCommand,
  sampleConfiguration,
  sampleCodeRepos,
} from "../../core/repo/scoping-skill";
import ExternalLink from "../../ui/ExternalLink.vue";
import UiButton from "../../ui/UiButton.vue";
import UiTextField from "../../ui/UiTextField.vue";
import UiIcon from "../../ui/UiIcon.vue";
import CodeBlock from "../shared/CodeBlock.vue";
import ViewState from "../shared/ViewState.vue";
import { settingsMessages } from "./settings.messages";

/**
 * Project settings.
 *
 * They live in the repo, not in the browser: they hold for everyone working on the project. Changing them therefore follows the same path as any other change — a branch, a pull request — rather than taking effect without anyone having reviewed it.
 */

const MODES: AccessMode[] = ["jeton_personnel", "identite_tierce", "relais"];

/**
 * Modes the application can honour today.
 *
 * The others are shown with their guarantees, but cannot be chosen: a project declaring one would believe it applies a setting with no effect. The range is visible, and so is its progress.
 */
const IMPLEMENTED_MODES: ReadonlySet<AccessMode> = new Set<AccessMode>([
  "jeton_personnel",
  "identite_tierce",
]);

const store = inject(SpecificationStore);
const settings = inject(SettingsService);
const automation = inject(AutomationService);
const locale = inject(LocaleService);
const t = useMessages(settingsMessages);

const modes = MODES;
const modeLabel = (m: AccessMode) => ACCESS_MODE_LABEL[locale.language()][m];
/** The model's values are technical: what the user reads is not. */
const guarantees = (m: AccessMode) => t().guarantees(GUARANTEES[m]);
const implemented = (m: AccessMode) => IMPLEMENTED_MODES.has(m);

const access = ref<AccessMode>("jeton_personnel");
/** What the project requires of the personal token in the web version (RG-protection-du-jeton-par-projet). */
const tokenProtection = ref<TokenProtection>("proposee");
const issuer = ref("");
const client = ref("");
const exchange = ref("");

/**
 * True if the mode requires parameters that are missing.
 *
 * Offering incomplete settings would write a mode no one could use: refusal is better than discovery at the first sign-in.
 */
const incompleteIdentity = computed(
  () =>
    access.value === "identite_tierce" &&
    !(issuer.value.trim() && client.value.trim() && exchange.value.trim()),
);

const sending = ref(false);
/** A failure's own message, or `null` for the page's generic one — read at display time, so that it follows a language switch. */
const error = ref<{ message: string | null } | null>(null);
const proposed = ref<{ pullRequest: number; url: string } | null>(null);

/** What is loaded, to know whether the input departs from it. */
const initial = ref("");

const modified = computed(() => fingerprint() !== initial.value);

/** The code repos, as they are edited. */
const codeRepos = ref<readonly CodeRepo[]>([]);
const repoHelp = ref(false);

/** What the setting will write, shown in the tooltip. */
const codeReposPreview = computed(() =>
  sampleCodeRepos(codeRepos.value.filter((d) => d.repo.trim())),
);

/**
 * Flags a malformed name without preventing it from being typed.
 *
 * Blocking keystrokes would forbid composing the name character by character; the final check, for its part, rules out what is not of the expected form.
 */
function isMalformedRepo(repo: string): boolean {
  const v = repo.trim();
  return v.length > 0 && !/^[^/\s]+\/[^/\s]+$/.test(v);
}

function addCodeRepo(): void {
  codeRepos.value = [...codeRepos.value, { repo: "", role: "" }];
}

function updateCodeRepo(i: number, fields: Partial<CodeRepo>): void {
  codeRepos.value = codeRepos.value.map((x, n) =>
    n === i ? { ...x, ...fields } : x,
  );
}

function removeCodeRepo(i: number): void {
  codeRepos.value = codeRepos.value.filter((_, n) => n !== i);
}

const skillCommand = installCommand();
// Computed, not frozen: the specification loads after the component is built, and a value taken too early would show the generic example to a project that already declares its repos.
const configSkill = computed(() => sampleConfiguration(store.repoRef().repo));

/** What has just been copied, to acknowledge it. */
const copied = ref<string | null>(null);

async function copy(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = what;
    // The feedback fades: left displayed, it would suggest a state rather than an acknowledgement.
    setTimeout(() => (copied.value = null), 2000);
  } catch {
    // The clipboard may be refused — outside a secure context, or by the user. The text remains selectable by hand.
  }
}

const installation = ref(false);
const automationError = ref<{ message: string | null } | null>(null);

/**
 * Installs the missing workflows.
 *
 * Directly, without a pull request: these are tooling files, not the specification, and an automation waiting for a review protects nothing while it waits.
 */
async function installAutomation(): Promise<void> {
  if (installation.value) return;
  installation.value = true;
  automationError.value = null;
  try {
    await automation.install();
  } catch (e) {
    automationError.value = { message: e instanceof Error ? e.message : null };
  } finally {
    installation.value = false;
  }
}

// The question only arises once the repo is loaded, and it costs a call: ask it here rather than on every display of the page.
watchEffect(() => {
  if (store.state() === "pret" && automation.installed() === null) {
    void automation.check();
  }
});

watchEffect(() => {
  if (store.state() !== "pret") return;
  const r = store.specification().settings;
  access.value = r.access;
  tokenProtection.value = r.tokenProtection;
  issuer.value = r.identity?.issuer ?? "";
  client.value = r.identity?.client ?? "";
  exchange.value = r.identity?.exchange ?? "";
  codeRepos.value = [...store.specification().project.codeRepos];
  // captured after applying, so that « modifié » compares against the loaded state
  queueMicrotask(() => (initial.value = fingerprint()));
});

function chooseMode(m: AccessMode): void {
  if (!IMPLEMENTED_MODES.has(m)) return;
  access.value = m;
  proposed.value = null;
}

async function proposeSettings(): Promise<void> {
  if (sending.value || incompleteIdentity.value) return;
  sending.value = true;
  error.value = null;
  proposed.value = null;
  try {
    const p = await settings.proposeSettings({
      access: access.value,
      // Only the personal token is kept on the machine: another mode removes the requirement, which no longer applies.
      tokenProtection:
        access.value === "jeton_personnel" ? tokenProtection.value : "proposee",
      // Empty entries are dropped: a line added then left as is describes no repo.
      codeRepos: codeRepos.value
        .filter((d) => d.repo.trim())
        .map((d) => ({ repo: d.repo.trim(), role: d.role.trim() })),
      identity:
        access.value === "identite_tierce"
          ? {
              issuer: issuer.value.trim(),
              client: client.value.trim(),
              exchange: exchange.value.trim(),
            }
          : null,
    });
    proposed.value = p;
    initial.value = fingerprint();
  } catch (e) {
    error.value = {
      message:
        e instanceof GithubError || e instanceof Error ? e.message : null,
    };
  } finally {
    sending.value = false;
  }
}

/** Stable representation of the input, to detect a difference. */
function fingerprint(): string {
  const d = codeRepos.value.map((x) => `${x.repo}~${x.role}`).join(",");
  return `${access.value}#${tokenProtection.value}#${issuer.value}#${client.value}#${exchange.value}#${d}`;
}
</script>

<template>
  <div class="reglages-page">
    <ViewState v-if="store.state() !== 'pret'" />
    <template v-else>
      <header class="entete">
        <h1>{{ t().title }}</h1>
        <p class="sous-titre">{{ t().subtitle }}</p>
      </header>

      <section class="bloc">
        <h2 class="section">{{ t().accessMode }}</h2>
        <p class="explication">{{ t().accessModeHelp }}</p>

        <div class="modes">
          <label
            v-for="m of modes"
            :key="m"
            class="mode"
            :class="{ indisponible: !implemented(m) }"
          >
            <input
              type="radio"
              name="acces"
              :value="m"
              :checked="access === m"
              :disabled="!implemented(m) || sending"
              @change="chooseMode(m)"
            />
            <span class="mode-corps">
              <span class="mode-tete">
                <strong>{{ modeLabel(m) }}</strong>
                <span v-if="!implemented(m)" class="a-venir">{{
                  t().notYetAvailable
                }}</span>
              </span>
              <span class="mode-garanties">{{ guarantees(m) }}</span>
            </span>
          </label>
        </div>

        <!-- RG-protection-du-jeton-par-projet, RG-garanties-annoncees: each way of keeping the token says what it protects and what it leaves exposed, and the requirement does not pass itself off as GitHub's. -->
        <div v-if="access === 'jeton_personnel'" class="protection-du-jeton">
          <h3 class="sous-section">{{ t().tokenProtection }}</h3>
          <p class="explication">{{ t().tokenProtectionHelp }}</p>

          <div class="modes">
            <label class="mode">
              <input
                v-model="tokenProtection"
                type="radio"
                name="protection"
                value="proposee"
                :disabled="sending"
                @change="proposed = null"
              />
              <span class="mode-corps">
                <span class="mode-tete"
                  ><strong>{{ t().offered }}</strong></span
                >
                <span class="mode-garanties">{{ t().offeredHelp }}</span>
              </span>
            </label>
            <label class="mode">
              <input
                v-model="tokenProtection"
                type="radio"
                name="protection"
                value="exigee"
                :disabled="sending"
                @change="proposed = null"
              />
              <span class="mode-corps">
                <span class="mode-tete"
                  ><strong>{{ t().required }}</strong></span
                >
                <span class="mode-garanties">{{ t().requiredHelp }}</span>
              </span>
            </label>
          </div>

          <dl class="formes">
            <template v-for="f of t().forms" :key="f.term">
              <dt>{{ f.term }}</dt>
              <dd>{{ f.description }}</dd>
            </template>
          </dl>

          <p class="explication">{{ t().tokenInClear }}</p>
          <p class="explication">{{ t().skanonRequirement }}</p>
        </div>

        <div v-if="access === 'identite_tierce'" class="identite">
          <p class="explication">{{ t().identityHelp }}</p>

          <UiTextField
            v-model="issuer"
            :label="t().issuer"
            name="emetteur"
            :disabled="sending"
            :placeholder="t().issuerPlaceholder"
            :hint="t().issuerHint"
          />

          <UiTextField
            v-model="client"
            :label="t().client"
            name="client"
            :disabled="sending"
            :placeholder="t().clientPlaceholder"
            :hint="t().clientHint"
          />

          <UiTextField
            v-model="exchange"
            :label="t().exchange"
            name="echange"
            :disabled="sending"
            :placeholder="t().exchangePlaceholder"
            :hint="t().exchangeHint"
          />

          <p v-if="incompleteIdentity" class="manque">
            {{ t().incompleteIdentity }}
          </p>
        </div>
      </section>

      <section v-if="automation.installed() === false" class="bloc">
        <h2 class="section">{{ t().automation }}</h2>
        <p class="explication">{{ t().automationHelp }}</p>
        <p v-if="automationError" class="erreur">
          <UiIcon name="error_outline" />
          <span>{{ automationError.message ?? t().automationFailed }}</span>
        </p>
        <UiButton
          variant="filled"
          :disabled="installation"
          @click="installAutomation()"
        >
          {{ installation ? t().installing : t().installAutomation }}
        </UiButton>
      </section>

      <section class="bloc">
        <div class="section-tete">
          <h2 class="section">{{ t().codeRepos }}</h2>
          <UiButton
            variant="icon"
            class="aide-bouton"
            :aria-expanded="repoHelp"
            :aria-label="t().whatThisWrites"
            @click="repoHelp = !repoHelp"
          >
            <UiIcon name="help_outline" />
          </UiButton>
        </div>
        <p class="explication">{{ t().codeReposHelp }}</p>

        <div v-if="repoHelp" class="infobulle" role="note">
          <p>
            {{ t().writesTo.before }} <code>ssk-canon.yml</code
            >{{ t().writesTo.after }}
          </p>
          <CodeBlock :text="codeReposPreview" language="yaml" />
        </div>

        <p v-if="!codeRepos.length" class="vide">{{ t().noCodeRepo }}</p>

        <div v-for="(d, i) of codeRepos" :key="i" class="depot-ligne">
          <UiTextField
            class="depot-repo"
            :model-value="d.repo"
            :label="t().repo"
            :name="'repo' + i"
            :placeholder="t().repoPlaceholder"
            :disabled="sending"
            @update:model-value="updateCodeRepo(i, { repo: $event })"
          >
            <template v-if="isMalformedRepo(d.repo)" #indice>
              <span class="ui-champ__indice alerte">{{
                t().repoExpected
              }}</span>
            </template>
          </UiTextField>

          <UiTextField
            class="depot-role"
            :model-value="d.role"
            :label="t().role"
            :name="'role' + i"
            :placeholder="t().rolePlaceholder"
            :disabled="sending"
            @update:model-value="updateCodeRepo(i, { role: $event })"
          />

          <UiButton
            variant="icon"
            :disabled="sending"
            :aria-label="t().removeRepo"
            @click="removeCodeRepo(i)"
          >
            <UiIcon name="close" />
          </UiButton>
        </div>

        <UiButton :disabled="sending" @click="addCodeRepo()">
          <UiIcon name="add" /> {{ t().addRepo }}
        </UiButton>
      </section>

      <section class="bloc">
        <h2 class="section">{{ t().fromCodeRepo }}</h2>
        <p class="explication">{{ t().fromCodeRepoHelp }}</p>

        <p class="etape">{{ t().installStep }}</p>
        <CodeBlock :text="skillCommand" language="bash" />
        <UiButton @click="copy(skillCommand, 'commande')">
          <UiIcon :name="copied === 'commande' ? 'check' : 'content_copy'" />
          {{ copied === "commande" ? t().copied : t().copy }}
        </UiButton>

        <p class="etape">
          {{ t().configStep.before }}
          <code>~/.claude/cadrage-canon.json</code>{{ t().configStep.after }}
        </p>
        <CodeBlock :text="configSkill" language="json" />
        <UiButton @click="copy(configSkill, 'config')">
          <UiIcon :name="copied === 'config' ? 'check' : 'content_copy'" />
          {{ copied === "config" ? t().copied : t().copy }}
        </UiButton>

        <p class="explication">{{ t().nothingInCodeRepos }}</p>
      </section>

      <p v-if="error" class="erreur">
        <UiIcon name="error_outline" />
        <span>{{ error.message ?? t().settingsFailed }}</span>
      </p>

      <p v-if="proposed" class="succes">
        <UiIcon name="check_circle" />
        <span>
          {{ t().proposed.before }}
          <ExternalLink :href="proposed.url">{{
            t().proposed.link(proposed.pullRequest)
          }}</ExternalLink
          >{{ t().proposed.after }}
        </span>
      </p>

      <div class="actions">
        <UiButton
          variant="filled"
          :disabled="sending || !modified || incompleteIdentity"
          @click="proposeSettings()"
        >
          {{ sending ? t().sending : t().propose }}
        </UiButton>
      </div>

      <p class="note">
        {{ t().note }}
      </p>
    </template>
  </div>
</template>

<style scoped>
.reglages-page {
  display: block;
  max-width: 74ch;
}
.entete {
  margin-bottom: 22px;
}
h1 {
  margin: 0 0 6px;
  font-size: 26px;
  font-weight: 600;
}
.sous-titre {
  margin: 0;
  line-height: 1.55;
  color: var(--mat-sys-on-surface-variant);
}
.bloc {
  margin-bottom: 26px;
}
.section {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
.section-tete {
  display: flex;
  align-items: center;
  gap: 2px;

  .section {
    margin-bottom: 0;
  }
}
.aide-bouton {
  width: 30px;
  height: 30px;
  padding: 6px;
  color: var(--mat-sys-on-surface-variant);

  .material-symbols-outlined {
    font-size: 17px;
    width: 17px;
    height: 17px;
  }
}
/* The content stays selectable: it is text to copy, not a message to read and dismiss. */
.infobulle {
  margin: 2px 0 14px;
  padding: 11px 13px;
  border-radius: 8px;
  border: 1px solid var(--mat-sys-outline-variant);
  background: var(--mat-sys-surface-container-low);

  p {
    margin: 0 0 8px;
    font-size: 13px;
    color: var(--mat-sys-on-surface-variant);
  }
}
.depot-ligne {
  display: flex;
  align-items: flex-start;
  gap: 10px;

  .ui-bouton {
    margin-top: 8px;
  }
}
.depot-ligne :deep(.depot-repo) {
  flex: 1 1 auto;
}
.depot-ligne :deep(.depot-role) {
  flex: 1 1 40%;
}
.vide {
  margin: 4px 0 12px;
  font-size: 13px;
  font-style: italic;
  color: var(--mat-sys-on-surface-variant);
}
.alerte {
  color: var(--mat-sys-error);
}
.etape {
  margin: 14px 0 6px;
  font-size: 13.5px;
  font-weight: 500;
}
.commande {
  margin: 0 0 6px;
  padding: 11px 13px;
  border-radius: 8px;
  background: var(--mat-sys-surface-container-high);
  color: var(--mat-sys-on-surface);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  line-height: 1.65;
  white-space: pre;
  overflow-x: auto;
}
.explication {
  margin: 6px 0 12px;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--mat-sys-on-surface-variant);
}
.modes {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mode {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 11px 12px;
  border-radius: 8px;
  cursor: pointer;

  &:hover {
    background: var(--mat-sys-surface-container);
  }
  /* What cannot be chosen must not look like it can: the cursor and the opacity say so before the click finds out. */
  &.indisponible {
    cursor: default;
    opacity: 0.62;
  }
  &.indisponible:hover {
    background: none;
  }

  input {
    margin-top: 3px;
  }
}
.mode-corps {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mode-tete {
  display: flex;
  align-items: baseline;
  gap: 9px;
}
.a-venir {
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
.mode-garanties {
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--mat-sys-on-surface-variant);
}
.protection-du-jeton {
  margin-top: 20px;
}
.sous-section {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
}
.formes {
  margin: 12px 0;
  font-size: 13px;
  line-height: 1.55;

  dt {
    font-weight: 600;
  }
  dd {
    margin: 0 0 8px;
    color: var(--mat-sys-on-surface-variant);
    max-width: 75ch;
  }
}
.identite {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 14px;
  padding: 14px 16px 4px;
  border-radius: 9px;
  background: var(--mat-sys-surface-container);

  .explication {
    margin: 0 0 10px;
  }
}
.manque {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--pc-statut-relecture);
}
.erreur,
.succes {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0 0 16px;
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
  a {
    color: inherit;
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
}
.note {
  margin-top: 20px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--mat-sys-on-surface-variant);
}
</style>
