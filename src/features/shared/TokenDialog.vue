<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { GithubClient } from "../../core/github/github-client";
import { IdentityService } from "../../core/github/identity.service";
import { TokenService, repoKeys } from "../../core/github/token.service";
import { LocaleService } from "../../core/i18n/locale.service";
import { inject } from "../../core/injection";
import { PLATFORM } from "../../platform/platform-token";
import { GUARANTEES, ACCESS_MODE_LABEL } from "../../core/model/model";
import { SpecificationStore } from "../../core/repo/specification.store";
import { RepoConfig } from "../../core/repo/repo-config";
import UiButton from "../../ui/UiButton.vue";
import UiCheckbox from "../../ui/UiCheckbox.vue";
import UiTextField from "../../ui/UiTextField.vue";
import UiDialog from "../../ui/UiDialog.vue";
import UiIcon from "../../ui/UiIcon.vue";
import UiSelect from "../../ui/UiSelect.vue";

// Where the token lives is not the same depending on the target (INV-8): the text says so, without promising more than what each one does.
const onDesktop = inject(PLATFORM).target === "bureau";
import RichText from "./RichText.vue";
import { tokenDialogMessages } from "./token-dialog.messages";
import TokenHelp from "./TokenHelp.vue";

/**
 * Sign-in to GitHub: the token, its scope, what the project's access mode guarantees — or, under a third-party identity, sign-in with the project's provider. Closes on `true` when access has changed and the repo must be read again.
 */
defineProps<{ data?: unknown }>();
const emit = defineEmits<{ close: [change?: boolean] }>();

const github = inject(GithubClient);
const tokens = inject(TokenService);
const store = inject(SpecificationStore);
const identity = inject(IdentityService);
const config = inject(RepoConfig);
const locale = inject(LocaleService);
const t = locale.messages(tokenDialogMessages);

/** The project's access mode, and what it guarantees. */
const mode = computed(() => store.specification().settings.access);
const modeLabel = computed(
  () => ACCESS_MODE_LABEL[locale.language()][mode.value],
);
const guarantees = computed(() => GUARANTEES[mode.value]);
const viaThirdPartyIdentity = computed(() => mode.value === "identite_tierce");
const who = computed(() => tokens.identity());

/** Leads to the identity issuer — the page is left. */
async function signIn(): Promise<void> {
  // Close before leaving: on return, the application starts from scratch and a dialog left open would no longer make sense.
  emit("close", false);
  await identity.signIn();
}

/** What this browser knows of the passkey, learnt on opening: `null` until then. */
const protectable = ref<boolean | null>(null);
onMounted(async () => {
  protectable.value = await tokens.canProtect();
});

/** What the input offers by default: protect, unless the author opted out in this browser. They may do without it, except when the project requires it (RG-protection-du-jeton-par-projet). */
const protect = ref(tokens.protectByDefault());

/** The author's preference, in this browser, to do without the passkey (2026-065, decision 03). */
const optedOut = ref(tokens.optedOut());
async function changeOptOut(value: boolean): Promise<void> {
  optedOut.value = value;
  await tokens.optOut(value);
  protect.value = tokens.protectByDefault();
}
const protecting = ref(false);

/** What the dialog says about token protection, depending on the target, the project and the browser. */
const protection = computed(() => {
  const form = tokens.form();
  if (form === "systeme" || protectable.value === null) return "aucune";
  if (tokens.locked()) return "verrouille";
  if (form === "scelle") return "scelle";
  if (!protectable.value)
    return tokens.protectionRequired() ? "impossible-exigee" : "impossible";
  return tokens.protectionRequired() ? "exigee" : "proposee";
});

/** Where the entered token will be kept, to say so without promising more than what each form does (INV-8). */
const whereKept = computed(() => {
  switch (tokens.form()) {
    case "systeme":
      return t().keptInKeychain;
    case "scelle":
      return t().keptSealed;
    case "session":
      return t().keptForTab;
    default:
      return t().keptInBrowser;
  }
});

/** Opens the sealed tokens; starts from the click, as the browser requires. */
async function unlock(): Promise<void> {
  if ((await tokens.unlock()) === "ouvert") emit("close", true);
}

const input = ref("");
const viaApi = ref(github.contentsViaApi());
/**
 * The message of a rejected input. Validated on submit rather than by a validator: the field is in error only while a message puts it there.
 */
const error = ref<string | null>(null);

/** The two scopes offered, deduced from the open repo. */
const organizationKey = computed(() => repoKeys(config.repoRef()).organization);
const repoKey = computed(() => repoKeys(config.repoRef()).exact);

/** The default organisation: it is the boundary the platform uses. */
const scope = ref(repoKeys(config.repoRef()).organization);

const scopeOptions = computed(() => [
  {
    value: organizationKey.value,
    label: t().scopeOrganization(organizationKey.value),
  },
  { value: repoKey.value, label: t().scopeRepoOnly(repoKey.value) },
  { value: "", label: t().scopeOthers },
]);

const verifying = ref(false);
const verification = ref<{
  ok: boolean;
  message: string;
  repos: readonly string[];
} | null>(null);

function changeInput(value: string): void {
  input.value = value;
  error.value = null;
}

/**
 * Asks the platform what this token opens, before saving it.
 *
 * A token restricted to a selection of repos is refused without a readable reason when opening a repo it does not cover. Showing it now avoids looking for the cause elsewhere.
 */
async function check(): Promise<void> {
  const problem = TokenService.checkForm(input.value);
  if (problem) {
    error.value = problem;
    return;
  }
  verifying.value = true;
  verification.value = null;
  try {
    const repos = await github.tryToken(input.value.trim());
    const covers = repos.some(
      (d) => d.toLowerCase() === repoKeys(config.repoRef()).exact,
    );
    verification.value = {
      ok: true,
      message: covers
        ? t().coversOpen(repos.length)
        : t().missesOpen(repos.length),
      repos,
    };
  } catch (e) {
    verification.value = {
      ok: false,
      message: e instanceof Error ? e.message : t().notAccepted,
      repos: [],
    };
  } finally {
    verifying.value = false;
  }
}

function forget(key: string): void {
  tokens.forgetScope(key);
}

async function validate(): Promise<void> {
  // without input but with a token already present, only the option changes
  if (!input.value.trim() && tokens.present()) {
    github.useApiForContents(viaApi.value);
    emit("close", true);
    return;
  }

  const problem = TokenService.checkForm(input.value);
  if (problem) {
    error.value = problem;
    return;
  }
  // An empty scope means « all other repos »: it is the general token, the one used when no scope matches.
  // Sealing starts from this click, with no wait before it: the browser only prompts for the passkey from a gesture.
  if (
    protection.value === "exigee" ||
    (protection.value === "proposee" && protect.value)
  ) {
    protecting.value = true;
    await tokens.setProtected(scope.value, input.value);
    protecting.value = false;
  } else if (scope.value) {
    tokens.setForScope(scope.value, input.value);
  } else {
    tokens.set(input.value);
  }
  github.useApiForContents(viaApi.value);
  emit("close", true);
}

/** Forgets any access, whatever its source. */
function signOut(): void {
  tokens.erase();
  // without a token, loading through the API would exhaust the quota in a single load
  github.useApiForContents(false);
  emit("close", true);
}
</script>

<template>
  <UiDialog
    class="token-dialog"
    :title="viaThirdPartyIdentity ? t().signIn : t().signInGithub"
  >
    <p v-if="!viaThirdPartyIdentity" class="aide">{{ t().whyToken }}</p>

    <!-- RG-garanties-annoncees: a mode that would suggest a protection it does not offer would be worse than its absence. -->
    <div class="garanties">
      <p class="mode"><RichText :parts="t().mode(modeLabel)" /></p>
      <ul>
        <li>
          <RichText
            :parts="
              guarantees.scope === 'chemin' ? t().scopePath : t().scopeRepo
            "
          />
        </li>
        <li>
          <RichText
            :parts="
              guarantees.authorVerified
                ? t().authorVerified
                : t().authorDeclared
            "
          />
        </li>
        <!-- RG-contenus-prives-au-repos: what the cache leaves on the machine is said, without claiming protection. -->
        <li>
          <template v-if="viaThirdPartyIdentity">{{
            t().privateInTab
          }}</template>
          <RichText
            v-else
            :parts="
              tokens.form() === 'scelle'
                ? t().privateSealed
                : t().privateClear(onDesktop)
            "
          />
        </li>
      </ul>
    </div>

    <div v-if="!viaThirdPartyIdentity" class="conseil">
      <UiIcon name="lock" />
      <p><RichText :parts="t().readOnlyAdvice(whereKept)" /></p>
    </div>

    <div v-if="viaThirdPartyIdentity" class="identite">
      <template v-if="who">
        <p class="connecte">
          {{ t().signedInAs }}<strong>{{ who.name }}</strong>
          <span v-if="who.email" class="courriel">{{ who.email }}</span>
        </p>
        <p class="portee">
          {{ t().accessibleProjects }}
          {{ (tokens.repos() ?? []).join(", ") || t().noProject }}
        </p>
        <UiButton variant="outlined" @click="signOut()">{{
          t().signOut
        }}</UiButton>
      </template>
      <template v-else>
        <p class="invite">{{ t().ownProvider }}</p>
        <p v-if="identity.error()" class="echec">
          <UiIcon name="error_outline" /> <span>{{ identity.error() }}</span>
        </p>
        <UiButton
          variant="filled"
          :disabled="identity.inProgress()"
          @click="signIn()"
        >
          {{ identity.inProgress() ? t().signingIn : t().doSignIn }}
        </UiButton>
      </template>
    </div>
    <div v-else-if="protection === 'verrouille'" class="protection verrou">
      <p>{{ t().locked }}</p>
      <p v-if="tokens.passkeyFailure() === 'illisible'" class="echec">
        <UiIcon name="error_outline" />
        <span>{{ t().passkeyUnreadable }}</span>
      </p>
      <div class="gestes">
        <UiButton variant="filled" @click="unlock()">{{ t().unlock }}</UiButton>
        <UiButton @click="signOut()">{{ t().forgetTokens }}</UiButton>
      </div>
    </div>
    <template v-else>
      <!-- A password field, which the author's password manager may fill (RG-accessibilite-aa); 2026-055 decision 01 only rejected Skanon keeping the token there itself. -->
      <UiTextField
        :model-value="input"
        class="champ"
        :label="t().tokenLabel"
        type="password"
        placeholder="ghp_…"
        autocomplete="on"
        spellcheck="false"
        data-focus-initial
        :error="error"
        :hint="t().tokenHint(whereKept)"
        @update:model-value="changeInput"
        @keyup.enter="validate()"
      />

      <UiSelect
        v-model="scope"
        class="champ"
        :label="t().scopeLabel"
        :options="scopeOptions"
        :hint="t().scopeHint"
      />

      <!-- RG-secret-conserve-localement: the passkey protects the token at rest, not in the page; the text promises no more. -->
      <div v-if="protection !== 'aucune'" class="protection">
        <template v-if="protection === 'proposee'">
          <UiCheckbox v-model="protect">{{ t().protect }}</UiCheckbox>
          <p class="option-aide">{{ t().protectHelp }}</p>
        </template>
        <p v-else-if="protection === 'exigee'">
          {{ t().protectionRequired }}
        </p>
        <p v-else-if="protection === 'scelle'">{{ t().protectionSealed }}</p>
        <p v-else-if="protection === 'impossible-exigee'">
          {{ t().protectionImpossibleRequired }}
        </p>
        <p v-else>{{ t().protectionImpossible }}</p>
      </div>

      <!-- 2026-065 decision 03, RG-protection-du-jeton-par-projet: the author's preference, which yields to a project that requires the passkey, and says so. -->
      <div
        v-if="protection !== 'aucune' && protectable"
        class="preference-passkey"
      >
        <UiCheckbox
          :model-value="optedOut"
          @update:model-value="changeOptOut"
          >{{ t().optOut }}</UiCheckbox
        >
        <p class="option-aide">
          {{
            tokens.protectionRequired() ? t().optOutRequired : t().optOutHelp
          }}
        </p>
      </div>

      <div
        v-if="verification"
        class="verification"
        :class="{ echec: !verification.ok }"
      >
        <p class="resume">
          <UiIcon :name="verification.ok ? 'check_circle' : 'error_outline'" />
          <span>{{ verification.message }}</span>
        </p>
        <template v-if="verification.repos.length">
          <ul class="ouverts">
            <li v-for="d in verification.repos.slice(0, 8)" :key="d">
              {{ d }}
            </li>
          </ul>
          <p v-if="verification.repos.length > 8" class="reste">
            {{ t().others(verification.repos.length - 8) }}
          </p>
        </template>
      </div>

      <UiButton
        v-if="input.trim()"
        class="verifier"
        :disabled="verifying"
        @click="check()"
      >
        {{ verifying ? t().verifying : t().verify }}
      </UiButton>

      <!-- Expanded as long as nothing is saved: that is the moment one needs it. -->
      <details class="guide" :open="tokens.noAccess()">
        <summary>{{ t().howToCreate }}</summary>
        <TokenHelp />
      </details>

      <details v-if="tokens.scopes().length" class="guide">
        <summary>{{ t().savedTokens(tokens.scopes().length) }}</summary>
        <ul class="portees">
          <li v-for="p in tokens.scopes()" :key="p.key">
            <span class="cle">{{ p.key }}</span>
            <span class="fin">…{{ p.token.slice(-4) }}</span>
            <UiButton
              variant="icon"
              :aria-label="t().removeToken"
              @click="forget(p.key)"
            >
              <UiIcon name="close" />
            </UiButton>
          </li>
        </ul>
      </details>

      <UiCheckbox v-model="viaApi" class="option">{{ t().viaApi }}</UiCheckbox>
      <p class="option-aide">{{ t().viaApiHelp }}</p>
    </template>

    <template #actions>
      <UiButton v-if="tokens.present()" class="deco" @click="signOut()">{{
        t().signOut
      }}</UiButton>
      <span class="espace"></span>
      <UiButton @click="emit('close')">{{ t().cancel }}</UiButton>
      <UiButton
        variant="filled"
        :disabled="protecting || protection === 'verrouille'"
        @click="validate()"
        >{{ protecting ? t().protecting : t().save }}</UiButton
      >
    </template>
  </UiDialog>
</template>

<style scoped>
/* Without a bounded height, the expanded help pushes the buttons off screen and the rest of the form becomes unreachable. */
.token-dialog :deep(.ui-dialogue__contenu) {
  max-height: min(70vh, 620px);
}
.aide {
  margin: 0 0 16px;
  color: var(--mat-sys-on-surface-variant);
  font-size: 14px;
  line-height: 1.55;
  max-width: 75ch;
}
.garanties {
  margin: 0 0 16px;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid var(--mat-sys-outline-variant);
  font-size: 13px;
  line-height: 1.55;

  .mode {
    margin: 0 0 6px;
    color: var(--mat-sys-on-surface-variant);
  }
  ul {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    color: var(--mat-sys-on-surface-variant);
  }
}
.identite {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 8px;

  p {
    margin: 0;
    line-height: 1.55;
  }
  .invite {
    color: var(--mat-sys-on-surface-variant);
  }
  .courriel {
    /* Markup swallows the space between a conditional block and what precedes it: the separation therefore comes from the style. */
    &::before {
      content: " · ";
    }
    margin-left: 6px;
    font-size: 13px;
    color: var(--mat-sys-on-surface-variant);
  }
  .portee {
    font-size: 13px;
    color: var(--mat-sys-on-surface-variant);
  }
  .echec {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 13.5px;
    color: var(--pc-statut-relecture);

    .material-symbols-outlined {
      font-size: 19px;
      width: 19px;
      height: 19px;
      flex: none;
    }
  }
}
.conseil {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  margin-bottom: 20px;
  border-radius: 8px;
  background: var(--mat-sys-surface-container);

  p {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
  }
  .material-symbols-outlined {
    flex: none;
    font-size: 20px;
    width: 20px;
    height: 20px;
    color: var(--mat-sys-on-surface-variant);
  }
}
.verification {
  margin: 4px 0 10px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--mat-sys-outline-variant);
  font-size: 13px;

  &.echec {
    border-color: var(--mat-sys-error);
    color: var(--mat-sys-error);
  }
  .resume {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
  }
  .material-symbols-outlined {
    font-size: 18px;
    width: 18px;
    height: 18px;
  }
  .ouverts {
    margin: 8px 0 0;
    padding-left: 26px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    line-height: 1.7;
    color: var(--mat-sys-on-surface-variant);
  }
  .reste {
    margin: 4px 0 0 26px;
    font-size: 12px;
    color: var(--mat-sys-on-surface-variant);
  }
}
.verifier {
  margin-bottom: 12px;
}
.portees {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;

  li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 2px 0;
  }
  .cle {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12.5px;
  }
  .fin {
    margin-left: auto;
    font-size: 12px;
    color: var(--mat-sys-on-surface-variant);
  }
}
.champ {
  width: 100%;
  min-width: 360px;
}
.guide {
  margin: 0 0 18px;

  summary {
    cursor: pointer;
    font-size: 13.5px;
    color: var(--mat-sys-primary);
    padding: 4px 0;
  }
  summary:focus-visible {
    outline: 2px solid var(--mat-sys-primary);
    outline-offset: 2px;
    border-radius: 3px;
  }
  .aide-jeton {
    display: block;
    margin-top: 12px;
  }
}
.option {
  display: flex;
  margin-top: 4px;
}
.option-aide {
  margin: 2px 0 0 34px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--mat-sys-on-surface-variant);
  max-width: 46ch;
}
.protection {
  margin: 4px 0 12px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--mat-sys-on-surface-variant);
  max-width: 75ch;

  p {
    margin: 0 0 6px;
  }
  .gestes {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
  .echec {
    display: flex;
    gap: 6px;
    color: var(--mat-sys-error);
  }
}
.espace {
  flex: 1 1 auto;
}
.deco {
  color: var(--mat-sys-error);
}
</style>
