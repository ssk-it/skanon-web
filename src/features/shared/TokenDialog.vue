<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { GithubClient } from "../../core/github/github-client";
import { IdentityService } from "../../core/github/identity.service";
import { TokenService, repoKeys } from "../../core/github/token.service";
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

/** The project's access mode, and what it guarantees. */
const mode = computed(() => store.specification().settings.access);
const modeLabel = computed(() => ACCESS_MODE_LABEL[mode.value]);
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

/** What the input offers by default: protect. The author may do without it, except when the project requires it (RG-protection-du-jeton-par-projet). */
const protect = ref(true);
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
      return "dans le coffre du système";
    case "scelle":
      return "dans ce navigateur, sous une passkey";
    case "session":
      return "pour cet onglet seulement";
    default:
      return "dans ce navigateur";
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
    label: `l’organisation ${organizationKey.value}`,
  },
  { value: repoKey.value, label: `ce dépôt seul — ${repoKey.value}` },
  { value: "", label: "tous les autres dépôts" },
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
        ? `${repos.length} dépôt(s), dont celui qui est ouvert.`
        : `${repos.length} dépôt(s) — mais pas celui qui est ouvert.`,
      repos,
    };
  } catch (e) {
    verification.value = {
      ok: false,
      message: e instanceof Error ? e.message : "Ce jeton n’a pas été accepté.",
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
    :title="viaThirdPartyIdentity ? 'Connexion' : 'Connexion à GitHub'"
  >
    <p v-if="!viaThirdPartyIdentity" class="aide">
      Sans connexion, GitHub limite l’application à 60 requêtes par heure et par
      adresse. Un jeton personnel porte cette limite à 5 000, donne accès aux
      dépôts privés, et débloque l’historique des règles — dates, auteurs et
      pull requests, que GitHub refuse aux requêtes anonymes.
    </p>

    <!-- RG-garanties-annoncees: a mode that would suggest a protection it does not offer would be worse than its absence. -->
    <div class="garanties">
      <p class="mode">
        Ce projet emploie le mode <strong>{{ modeLabel }}</strong
        >.
      </p>
      <ul>
        <li>
          <template v-if="guarantees.scope === 'chemin'">
            L’autorisation descend jusqu’au <strong>chemin</strong> : un
            rédacteur n’écrit que là où le projet l’y autorise.
          </template>
          <template v-else>
            L’autorisation s’arrête au <strong>dépôt</strong> : un rédacteur
            autorisé peut écrire partout dans ce projet.
          </template>
        </li>
        <li>
          <template v-if="guarantees.authorVerified">
            L’auteur d’un enregistrement est <strong>vérifié</strong> depuis
            l’identité connectée.
          </template>
          <template v-else>
            L’auteur d’un enregistrement est <strong>déclaré</strong> par
            l’application, non vérifié à la source.
          </template>
        </li>
        <!-- RG-contenus-prives-au-repos: what the cache leaves on the machine is said, without claiming protection. -->
        <li>
          <template v-if="viaThirdPartyIdentity">
            Les contenus d’un dépôt privé restent dans cet onglet le temps de la
            session, comme l’accès qui les a lus.
          </template>
          <template v-else-if="tokens.form() === 'scelle'">
            Les contenus d’un dépôt privé sont
            <strong>scellés comme le jeton</strong>, et effacés quand il est
            oublié.
          </template>
          <template v-else>
            Les contenus d’un dépôt privé sont
            <strong>conservés en clair</strong>
            {{
              onDesktop
                ? "par l’application"
                : "par ce navigateur, comme le jeton,"
            }}
            et effacés quand le jeton est oublié.
          </template>
        </li>
      </ul>
    </div>

    <div v-if="!viaThirdPartyIdentity" class="conseil">
      <UiIcon name="lock" />
      <p>
        Un jeton en <strong>lecture seule</strong> suffit pour consulter.
        Rédiger un cadrage demande l’écriture — voir le tableau des permissions.
        Le jeton est conservé {{ whereKept }}, et n’est envoyé qu’à GitHub.
      </p>
    </div>

    <div v-if="viaThirdPartyIdentity" class="identite">
      <template v-if="who">
        <p class="connecte">
          Connecté en tant que <strong>{{ who.name }}</strong>
          <span v-if="who.email" class="courriel">{{ who.email }}</span>
        </p>
        <p class="portee">
          Projets accessibles :
          {{ (tokens.repos() ?? []).join(", ") || "aucun" }}
        </p>
        <UiButton variant="outlined" @click="signOut()"
          >Se déconnecter</UiButton
        >
      </template>
      <template v-else>
        <p class="invite">
          Ce projet fait vérifier les identités auprès de son propre
          fournisseur. Aucun compte GitHub n’est nécessaire.
        </p>
        <p v-if="identity.error()" class="echec">
          <UiIcon name="error_outline" /> <span>{{ identity.error() }}</span>
        </p>
        <UiButton
          variant="filled"
          :disabled="identity.inProgress()"
          @click="signIn()"
        >
          {{ identity.inProgress() ? "Connexion…" : "Se connecter" }}
        </UiButton>
      </template>
    </div>
    <div v-else-if="protection === 'verrouille'" class="protection verrou">
      <p>
        Vos jetons sont protégés par une passkey. Déverrouillez-les pour vous en
        servir, en ajouter ou en retirer un.
      </p>
      <p v-if="tokens.passkeyFailure() === 'illisible'" class="echec">
        <UiIcon name="error_outline" />
        <span
          >La passkey ne les ouvre plus : oubliez-les, puis saisissez de nouveau
          votre jeton.</span
        >
      </p>
      <div class="gestes">
        <UiButton variant="filled" @click="unlock()">Déverrouiller</UiButton>
        <UiButton @click="signOut()">Oublier ces jetons</UiButton>
      </div>
    </div>
    <template v-else>
      <UiTextField
        :model-value="input"
        class="champ"
        label="Jeton d’accès personnel"
        type="password"
        placeholder="ghp_…"
        autocomplete="off"
        spellcheck="false"
        data-focus-initial
        :error="error"
        :hint="`Envoyé à GitHub seul, et conservé ${whereKept}.`"
        @update:model-value="changeInput"
        @keyup.enter="validate()"
      />

      <UiSelect
        v-model="scope"
        class="champ"
        label="Ce jeton vaut pour"
        :options="scopeOptions"
        hint="Un jeton par organisation : celui d’une autre ne s’en trouve pas écrasé."
      />

      <!-- RG-secret-conserve-localement: the passkey protects the token at rest, not in the page; the text promises no more. -->
      <div v-if="protection !== 'aucune'" class="protection">
        <template v-if="protection === 'proposee'">
          <UiCheckbox v-model="protect">
            Protéger ce jeton par une passkey
          </UiCheckbox>
          <p class="option-aide">
            Touch ID, ou le code de l’appareil, l’ouvrira dans chaque onglet.
            Seul son chiffré reste dans ce navigateur : un programme qui lit le
            profil ne le trouve pas. Un script sur la page, onglet déverrouillé,
            le lirait toujours.
          </p>
        </template>
        <p v-else-if="protection === 'exigee'">
          Ce projet exige que le jeton soit protégé par une passkey : Touch ID,
          ou le code de l’appareil, vous sera demandé à l’enregistrement, puis
          dans chaque onglet.
        </p>
        <p v-else-if="protection === 'scelle'">
          Vos jetons sont protégés par une passkey : celui-ci le sera aussi.
        </p>
        <p v-else-if="protection === 'impossible-exigee'">
          Ce projet exige une passkey, que ce navigateur ne sait pas créer : le
          jeton ne sera gardé que pour cet onglet. L’application de bureau, ou
          un navigateur récent, le garderont d’une ouverture à l’autre.
        </p>
        <p v-else>
          Ce navigateur ne sait pas protéger le jeton par une passkey : il le
          gardera en clair.
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
            … et {{ verification.repos.length - 8 }} autres
          </p>
        </template>
      </div>

      <UiButton
        v-if="input.trim()"
        class="verifier"
        :disabled="verifying"
        @click="check()"
      >
        {{ verifying ? "Vérification…" : "Vérifier ce que le jeton ouvre" }}
      </UiButton>

      <!-- Expanded as long as nothing is saved: that is the moment one needs it. -->
      <details class="guide" :open="tokens.noAccess()">
        <summary>Comment créer un jeton ?</summary>
        <TokenHelp />
      </details>

      <details v-if="tokens.scopes().length" class="guide">
        <summary>Jetons enregistrés ({{ tokens.scopes().length }})</summary>
        <ul class="portees">
          <li v-for="p in tokens.scopes()" :key="p.key">
            <span class="cle">{{ p.key }}</span>
            <span class="fin">…{{ p.token.slice(-4) }}</span>
            <UiButton
              variant="icon"
              aria-label="Retirer ce jeton"
              @click="forget(p.key)"
            >
              <UiIcon name="close" />
            </UiButton>
          </li>
        </ul>
      </details>

      <UiCheckbox v-model="viaApi" class="option">
        Charger les contenus par l’API
      </UiCheckbox>
      <p class="option-aide">
        Un appel compté par fichier, là où le canal par défaut n’en compte
        aucun. Les fichiers sont lus au commit dans les deux cas : ce qui vient
        d’être poussé apparaît au prochain chargement. Un dépôt privé passe par
        l’API de lui-même.
      </p>
    </template>

    <template #actions>
      <UiButton v-if="tokens.present()" class="deco" @click="signOut()"
        >Se déconnecter</UiButton
      >
      <span class="espace"></span>
      <UiButton @click="emit('close')">Annuler</UiButton>
      <UiButton
        variant="filled"
        :disabled="protecting || protection === 'verrouille'"
        @click="validate()"
        >{{ protecting ? "Protection…" : "Enregistrer" }}</UiButton
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
