<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { GithubClient } from "../../core/github/github-client";
import { IdentityService } from "../../core/github/identite.service";
import { TokenService, repoKeys } from "../../core/github/token.service";
import { inject } from "../../core/injection";
import { PLATFORM } from "../../plateforme/jeton";
import { GUARANTEES, ACCESS_MODE_LABEL } from "../../core/model/model";
import { SpecificationStore } from "../../core/repo/referentiel.store";
import { RepoConfig } from "../../core/repo/repo-config";
import UiButton from "../../ui/UiBouton.vue";
import UiCheckbox from "../../ui/UiCaseACocher.vue";
import UiTextField from "../../ui/UiChamp.vue";
import UiDialog from "../../ui/UiDialogue.vue";
import UiIcon from "../../ui/UiIcone.vue";
import UiSelect from "../../ui/UiSelect.vue";

// Où vit le jeton n'est pas le même selon la cible (INV-8) : le texte le dit, sans promettre plus que ce que fait chacune.
const onDesktop = inject(PLATFORM).target === "bureau";
import TokenHelp from "./AideJeton.vue";

/**
 * La connexion à GitHub : le jeton, sa portée, ce que le mode d'accès du projet garantit — ou, sous une identité tierce, la connexion auprès du fournisseur du projet. Se ferme sur `true` quand l'accès a changé et que le dépôt doit être relu.
 */
defineProps<{ data?: unknown }>();
const emit = defineEmits<{ close: [change?: boolean] }>();

const github = inject(GithubClient);
const tokens = inject(TokenService);
const store = inject(SpecificationStore);
const identity = inject(IdentityService);
const config = inject(RepoConfig);

/** Mode d'accès du projet, et ce qu'il garantit. */
const mode = computed(() => store.specification().settings.access);
const modeLabel = computed(() => ACCESS_MODE_LABEL[mode.value]);
const guarantees = computed(() => GUARANTEES[mode.value]);
const viaThirdPartyIdentity = computed(() => mode.value === "identite_tierce");
const who = computed(() => tokens.identity());

/** Conduit vers l'émetteur d'identité — la page est quittée. */
async function signIn(): Promise<void> {
  // Fermer avant de partir : au retour, l'application repart de zéro et un dialogue resté ouvert n'aurait plus de sens.
  emit("close", false);
  await identity.signIn();
}

/** Ce que ce navigateur sait de la passkey, su à l'ouverture : `null` d'ici là. */
const protectable = ref<boolean | null>(null);
onMounted(async () => {
  protectable.value = await tokens.canProtect();
});

/** Ce que la saisie propose par défaut : protéger. Le rédacteur peut s'en passer, sauf quand le projet l'exige (RG-protection-du-jeton-par-projet). */
const protect = ref(true);
const protecting = ref(false);

/** Ce que le dialogue dit de la protection du jeton, selon la cible, le projet et le navigateur. */
const protection = computed(() => {
  const form = tokens.form();
  if (form === "systeme" || protectable.value === null) return "aucune";
  if (tokens.locked()) return "verrouille";
  if (form === "scelle") return "scelle";
  if (!protectable.value)
    return tokens.protectionRequired() ? "impossible-exigee" : "impossible";
  return tokens.protectionRequired() ? "exigee" : "proposee";
});

/** Où le jeton saisi sera gardé, pour le dire sans promettre plus que ce que fait chaque forme (INV-8). */
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

/** Ouvre les jetons scellés ; part du clic, comme le navigateur l'exige. */
async function unlock(): Promise<void> {
  if ((await tokens.unlock()) === "ouvert") emit("close", true);
}

const input = ref("");
const viaApi = ref(github.contentsViaApi());
/**
 * Le message d'une saisie refusée. Validée à la soumission plutôt que par un validateur : le champ n'est en erreur que tant qu'un message l'y met.
 */
const error = ref<string | null>(null);

/** Les deux portées proposées, déduites du dépôt ouvert. */
const organizationKey = computed(() => repoKeys(config.repoRef()).organization);
const repoKey = computed(() => repoKeys(config.repoRef()).exact);

/** L'organisation par défaut : c'est la frontière que la plateforme emploie. */
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
 * Demande à la plateforme ce que ce jeton ouvre, avant de l'enregistrer.
 *
 * Un jeton restreint à une sélection de dépôts est refusé sans motif lisible quand on ouvre un dépôt qu'il ne couvre pas. Le montrer maintenant évite de chercher la cause ailleurs.
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
  // sans saisie mais avec un jeton déjà présent, on ne change que l'option
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
  // Une portée vide vaut « tous les autres dépôts » : c'est le jeton général, celui qui sert quand aucune portée ne correspond.
  // Le scellement part de ce clic, sans attente avant lui : le navigateur ne sollicite la passkey que depuis un geste.
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

/** Oublie tout accès, quelle qu'en soit la source. */
function signOut(): void {
  tokens.erase();
  // sans jeton, charger par l'API épuiserait le quota en un chargement
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

    <!-- RG-garanties-annoncees : un mode qui laisserait croire à une protection qu'il n'offre pas serait pire que son absence. -->
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
        <!-- RG-contenus-prives-au-repos : ce que le cache laisse sur le poste se dit, sans protection prétendue. -->
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

      <!-- RG-secret-conserve-localement : la passkey protège le jeton au repos, non dans la page ; le texte n'en promet pas plus. -->
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

      <!-- Dépliée tant que rien n'est enregistré : c'est le moment où l'on en a besoin. -->
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
/* Sans hauteur bornée, l'aide dépliée pousse les boutons hors de l'écran et le reste du formulaire devient inatteignable. */
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
    /* Le balisage avale l'espace entre un bloc conditionnel et ce qui le précède : la séparation vient donc du style. */
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
