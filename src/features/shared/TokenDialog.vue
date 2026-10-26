<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { GithubClient } from "../../core/github/github-client";
import { IdentiteService } from "../../core/github/identite.service";
import { TokenService, clesDepot } from "../../core/github/token.service";
import { inject } from "../../core/injection";
import { PLATEFORME } from "../../plateforme/jeton";
import { GARANTIES, LIBELLE_MODE_ACCES } from "../../core/model/model";
import { ReferentielStore } from "../../core/repo/referentiel.store";
import { RepoConfig } from "../../core/repo/repo-config";
import UiBouton from "../../ui/UiBouton.vue";
import UiCaseACocher from "../../ui/UiCaseACocher.vue";
import UiChamp from "../../ui/UiChamp.vue";
import UiDialogue from "../../ui/UiDialogue.vue";
import UiIcone from "../../ui/UiIcone.vue";
import UiSelect from "../../ui/UiSelect.vue";

// Où vit le jeton n'est pas le même selon la cible (INV-8) : le texte le dit, sans promettre plus que ce que fait chacune.
const auBureau = inject(PLATEFORME).cible === "bureau";
import AideJeton from "./AideJeton.vue";

/**
 * La connexion à GitHub : le jeton, sa portée, ce que le mode d'accès du projet garantit — ou, sous une identité tierce, la connexion auprès du fournisseur du projet. Se ferme sur `true` quand l'accès a changé et que le dépôt doit être relu.
 */
defineProps<{ data?: unknown }>();
const emit = defineEmits<{ fermer: [change?: boolean] }>();

const github = inject(GithubClient);
const tokens = inject(TokenService);
const store = inject(ReferentielStore);
const identite = inject(IdentiteService);
const config = inject(RepoConfig);

/** Mode d'accès du projet, et ce qu'il garantit. */
const mode = computed(() => store.referentiel().reglages.acces);
const libelleMode = computed(() => LIBELLE_MODE_ACCES[mode.value]);
const garanties = computed(() => GARANTIES[mode.value]);
const parIdentiteTierce = computed(() => mode.value === "identite_tierce");
const qui = computed(() => tokens.identite());

/** Conduit vers l'émetteur d'identité — la page est quittée. */
async function connecter(): Promise<void> {
  // Fermer avant de partir : au retour, l'application repart de zéro et un dialogue resté ouvert n'aurait plus de sens.
  emit("fermer", false);
  await identite.connecter();
}

/** Ce que ce navigateur sait de la passkey, su à l'ouverture : `null` d'ici là. */
const protegeable = ref<boolean | null>(null);
onMounted(async () => {
  protegeable.value = await tokens.peutProteger();
});

/** Ce que la saisie propose par défaut : protéger. Le rédacteur peut s'en passer, sauf quand le projet l'exige (RG-protection-du-jeton-par-projet). */
const proteger = ref(true);
const enProtection = ref(false);

/** Ce que le dialogue dit de la protection du jeton, selon la cible, le projet et le navigateur. */
const protection = computed(() => {
  const forme = tokens.forme();
  if (forme === "systeme" || protegeable.value === null) return "aucune";
  if (tokens.verrouille()) return "verrouille";
  if (forme === "scelle") return "scelle";
  if (!protegeable.value)
    return tokens.protectionExigee() ? "impossible-exigee" : "impossible";
  return tokens.protectionExigee() ? "exigee" : "proposee";
});

/** Où le jeton saisi sera gardé, pour le dire sans promettre plus que ce que fait chaque forme (INV-8). */
const ouGarde = computed(() => {
  switch (tokens.forme()) {
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
async function deverrouiller(): Promise<void> {
  if ((await tokens.deverrouiller()) === "ouvert") emit("fermer", true);
}

const saisie = ref("");
const parApi = ref(github.contenusParApi());
/**
 * Le message d'une saisie refusée. Validée à la soumission plutôt que par un validateur : le champ n'est en erreur que tant qu'un message l'y met.
 */
const erreur = ref<string | null>(null);

/** Les deux portées proposées, déduites du dépôt ouvert. */
const cleOrganisation = computed(() => clesDepot(config.depot()).organisation);
const cleDepot = computed(() => clesDepot(config.depot()).exacte);

/** L'organisation par défaut : c'est la frontière que la plateforme emploie. */
const portee = ref(clesDepot(config.depot()).organisation);

const optionsPortee = computed(() => [
  {
    valeur: cleOrganisation.value,
    libelle: `l’organisation ${cleOrganisation.value}`,
  },
  { valeur: cleDepot.value, libelle: `ce dépôt seul — ${cleDepot.value}` },
  { valeur: "", libelle: "tous les autres dépôts" },
]);

const enVerification = ref(false);
const verification = ref<{
  ok: boolean;
  message: string;
  depots: readonly string[];
} | null>(null);

function changerSaisie(valeur: string): void {
  saisie.value = valeur;
  erreur.value = null;
}

/**
 * Demande à la plateforme ce que ce jeton ouvre, avant de l'enregistrer.
 *
 * Un jeton restreint à une sélection de dépôts est refusé sans motif lisible quand on ouvre un dépôt qu'il ne couvre pas. Le montrer maintenant évite de chercher la cause ailleurs.
 */
async function verifier(): Promise<void> {
  const probleme = TokenService.verifierForme(saisie.value);
  if (probleme) {
    erreur.value = probleme;
    return;
  }
  enVerification.value = true;
  verification.value = null;
  try {
    const depots = await github.essayerJeton(saisie.value.trim());
    const couvre = depots.some(
      (d) => d.toLowerCase() === clesDepot(config.depot()).exacte,
    );
    verification.value = {
      ok: true,
      message: couvre
        ? `${depots.length} dépôt(s), dont celui qui est ouvert.`
        : `${depots.length} dépôt(s) — mais pas celui qui est ouvert.`,
      depots,
    };
  } catch (e) {
    verification.value = {
      ok: false,
      message: e instanceof Error ? e.message : "Ce jeton n’a pas été accepté.",
      depots: [],
    };
  } finally {
    enVerification.value = false;
  }
}

function oublier(cle: string): void {
  tokens.oublierPortee(cle);
}

async function valider(): Promise<void> {
  // sans saisie mais avec un jeton déjà présent, on ne change que l'option
  if (!saisie.value.trim() && tokens.present()) {
    github.useApiForContenus(parApi.value);
    emit("fermer", true);
    return;
  }

  const probleme = TokenService.verifierForme(saisie.value);
  if (probleme) {
    erreur.value = probleme;
    return;
  }
  // Une portée vide vaut « tous les autres dépôts » : c'est le jeton général, celui qui sert quand aucune portée ne correspond.
  // Le scellement part de ce clic, sans attente avant lui : le navigateur ne sollicite la passkey que depuis un geste.
  if (
    protection.value === "exigee" ||
    (protection.value === "proposee" && proteger.value)
  ) {
    enProtection.value = true;
    await tokens.definirProtege(portee.value, saisie.value);
    enProtection.value = false;
  } else if (portee.value) {
    tokens.definirPourPortee(portee.value, saisie.value);
  } else {
    tokens.definir(saisie.value);
  }
  github.useApiForContenus(parApi.value);
  emit("fermer", true);
}

/** Oublie tout accès, quelle qu'en soit la source. */
function deconnecter(): void {
  tokens.effacer();
  // sans jeton, charger par l'API épuiserait le quota en un chargement
  github.useApiForContenus(false);
  emit("fermer", true);
}
</script>

<template>
  <UiDialogue
    class="token-dialog"
    :titre="parIdentiteTierce ? 'Connexion' : 'Connexion à GitHub'"
  >
    <p v-if="!parIdentiteTierce" class="aide">
      Sans connexion, GitHub limite l’application à 60 requêtes par heure et par
      adresse. Un jeton personnel porte cette limite à 5 000, donne accès aux
      dépôts privés, et débloque l’historique des règles — dates, auteurs et
      pull requests, que GitHub refuse aux requêtes anonymes.
    </p>

    <!-- RG-garanties-annoncees : un mode qui laisserait croire à une protection qu'il n'offre pas serait pire que son absence. -->
    <div class="garanties">
      <p class="mode">
        Ce projet emploie le mode <strong>{{ libelleMode }}</strong
        >.
      </p>
      <ul>
        <li>
          <template v-if="garanties.portee === 'chemin'">
            L’autorisation descend jusqu’au <strong>chemin</strong> : un
            rédacteur n’écrit que là où le projet l’y autorise.
          </template>
          <template v-else>
            L’autorisation s’arrête au <strong>dépôt</strong> : un rédacteur
            autorisé peut écrire partout dans ce projet.
          </template>
        </li>
        <li>
          <template v-if="garanties.auteurVerifie">
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
          <template v-if="parIdentiteTierce">
            Les contenus d’un dépôt privé restent dans cet onglet le temps de la
            session, comme l’accès qui les a lus.
          </template>
          <template v-else-if="tokens.forme() === 'scelle'">
            Les contenus d’un dépôt privé sont
            <strong>scellés comme le jeton</strong>, et effacés quand il est
            oublié.
          </template>
          <template v-else>
            Les contenus d’un dépôt privé sont
            <strong>conservés en clair</strong>
            {{
              auBureau
                ? "par l’application"
                : "par ce navigateur, comme le jeton,"
            }}
            et effacés quand le jeton est oublié.
          </template>
        </li>
      </ul>
    </div>

    <div v-if="!parIdentiteTierce" class="conseil">
      <UiIcone nom="lock" />
      <p>
        Un jeton en <strong>lecture seule</strong> suffit pour consulter.
        Rédiger un cadrage demande l’écriture — voir le tableau des permissions.
        Le jeton est conservé {{ ouGarde }}, et n’est envoyé qu’à GitHub.
      </p>
    </div>

    <div v-if="parIdentiteTierce" class="identite">
      <template v-if="qui">
        <p class="connecte">
          Connecté en tant que <strong>{{ qui.nom }}</strong>
          <span v-if="qui.courriel" class="courriel">{{ qui.courriel }}</span>
        </p>
        <p class="portee">
          Projets accessibles :
          {{ (tokens.depots() ?? []).join(", ") || "aucun" }}
        </p>
        <UiBouton variante="outlined" @click="deconnecter()"
          >Se déconnecter</UiBouton
        >
      </template>
      <template v-else>
        <p class="invite">
          Ce projet fait vérifier les identités auprès de son propre
          fournisseur. Aucun compte GitHub n’est nécessaire.
        </p>
        <p v-if="identite.erreur()" class="echec">
          <UiIcone nom="error_outline" /> <span>{{ identite.erreur() }}</span>
        </p>
        <UiBouton
          variante="filled"
          :disabled="identite.enCours()"
          @click="connecter()"
        >
          {{ identite.enCours() ? "Connexion…" : "Se connecter" }}
        </UiBouton>
      </template>
    </div>
    <div v-else-if="protection === 'verrouille'" class="protection verrou">
      <p>
        Vos jetons sont protégés par une passkey. Déverrouillez-les pour vous en
        servir, en ajouter ou en retirer un.
      </p>
      <p v-if="tokens.echecPasskey() === 'illisible'" class="echec">
        <UiIcone nom="error_outline" />
        <span
          >La passkey ne les ouvre plus : oubliez-les, puis saisissez de nouveau
          votre jeton.</span
        >
      </p>
      <div class="gestes">
        <UiBouton variante="filled" @click="deverrouiller()"
          >Déverrouiller</UiBouton
        >
        <UiBouton @click="deconnecter()">Oublier ces jetons</UiBouton>
      </div>
    </div>
    <template v-else>
      <UiChamp
        :model-value="saisie"
        class="champ"
        libelle="Jeton d’accès personnel"
        type="password"
        placeholder="ghp_…"
        autocomplete="off"
        spellcheck="false"
        data-focus-initial
        :erreur="erreur"
        :indice="`Envoyé à GitHub seul, et conservé ${ouGarde}.`"
        @update:model-value="changerSaisie"
        @keyup.enter="valider()"
      />

      <UiSelect
        v-model="portee"
        class="champ"
        libelle="Ce jeton vaut pour"
        :options="optionsPortee"
        indice="Un jeton par organisation : celui d’une autre ne s’en trouve pas écrasé."
      />

      <!-- RG-secret-conserve-localement : la passkey protège le jeton au repos, non dans la page ; le texte n'en promet pas plus. -->
      <div v-if="protection !== 'aucune'" class="protection">
        <template v-if="protection === 'proposee'">
          <UiCaseACocher v-model="proteger">
            Protéger ce jeton par une passkey
          </UiCaseACocher>
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
          <UiIcone :nom="verification.ok ? 'check_circle' : 'error_outline'" />
          <span>{{ verification.message }}</span>
        </p>
        <template v-if="verification.depots.length">
          <ul class="ouverts">
            <li v-for="d in verification.depots.slice(0, 8)" :key="d">
              {{ d }}
            </li>
          </ul>
          <p v-if="verification.depots.length > 8" class="reste">
            … et {{ verification.depots.length - 8 }} autres
          </p>
        </template>
      </div>

      <UiBouton
        v-if="saisie.trim()"
        class="verifier"
        :disabled="enVerification"
        @click="verifier()"
      >
        {{
          enVerification ? "Vérification…" : "Vérifier ce que le jeton ouvre"
        }}
      </UiBouton>

      <!-- Dépliée tant que rien n'est enregistré : c'est le moment où l'on en a besoin. -->
      <details class="guide" :open="tokens.aucunAcces()">
        <summary>Comment créer un jeton ?</summary>
        <AideJeton />
      </details>

      <details v-if="tokens.portees().length" class="guide">
        <summary>Jetons enregistrés ({{ tokens.portees().length }})</summary>
        <ul class="portees">
          <li v-for="p in tokens.portees()" :key="p.cle">
            <span class="cle">{{ p.cle }}</span>
            <span class="fin">…{{ p.jeton.slice(-4) }}</span>
            <UiBouton
              variante="icon"
              aria-label="Retirer ce jeton"
              @click="oublier(p.cle)"
            >
              <UiIcone nom="close" />
            </UiBouton>
          </li>
        </ul>
      </details>

      <UiCaseACocher v-model="parApi" class="option">
        Charger les contenus par l’API
      </UiCaseACocher>
      <p class="option-aide">
        Un appel compté par fichier, là où le canal par défaut n’en compte
        aucun. Les fichiers sont lus au commit dans les deux cas : ce qui vient
        d’être poussé apparaît au prochain chargement. Un dépôt privé passe par
        l’API de lui-même.
      </p>
    </template>

    <template #actions>
      <UiBouton v-if="tokens.present()" class="deco" @click="deconnecter()"
        >Se déconnecter</UiBouton
      >
      <span class="espace"></span>
      <UiBouton @click="emit('fermer')">Annuler</UiBouton>
      <UiBouton
        variante="filled"
        :disabled="enProtection || protection === 'verrouille'"
        @click="valider()"
        >{{ enProtection ? "Protection…" : "Enregistrer" }}</UiBouton
      >
    </template>
  </UiDialogue>
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
