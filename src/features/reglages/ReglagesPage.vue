<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { GithubError } from "../../core/github/github-client";
import { inject } from "../../core/injection";
import {
  GARANTIES,
  LIBELLE_MODE_ACCES,
  type DepotCode,
  type ModeAcces,
  type ProtectionDuJeton,
} from "../../core/model/model";
import { AutomatisationService } from "../../core/repo/automatisation.service";
import { ReferentielStore } from "../../core/repo/referentiel.store";
import { ReglagesService } from "../../core/repo/reglages.service";
import {
  commandeInstallation,
  configurationExemple,
  exempleDepotsCode,
} from "../../core/repo/skill-cadrage";
import LienExterne from "../../ui/LienExterne.vue";
import UiBouton from "../../ui/UiBouton.vue";
import UiChamp from "../../ui/UiChamp.vue";
import UiIcone from "../../ui/UiIcone.vue";
import BlocCode from "../shared/BlocCode.vue";
import EtatVue from "../shared/EtatVue.vue";

/**
 * Réglages du projet.
 *
 * Ils vivent dans le dépôt, non dans le navigateur : ils valent pour tous ceux qui travaillent sur le projet. Les modifier suit donc le même chemin que n'importe quel changement — une branche, une demande de fusion — plutôt que de prendre effet sans que personne l'ait relu.
 */

const MODES: ModeAcces[] = ["jeton_personnel", "identite_tierce", "relais"];

/**
 * Modes que l'application sait honorer aujourd'hui.
 *
 * Les autres sont montrés avec leurs garanties, mais ne se choisissent pas : un projet qui en déclarerait un croirait appliquer un réglage sans effet. La gamme se voit, son avancement aussi.
 */
const MODES_REALISES: ReadonlySet<ModeAcces> = new Set<ModeAcces>([
  "jeton_personnel",
  "identite_tierce",
]);

const store = inject(ReferentielStore);
const reglages = inject(ReglagesService);
const automatisation = inject(AutomatisationService);

const modes = MODES;
const libelleMode = (m: ModeAcces) => LIBELLE_MODE_ACCES[m];
const garanties = (m: ModeAcces) => GARANTIES[m];
const realise = (m: ModeAcces) => MODES_REALISES.has(m);
/** Les valeurs du modèle sont techniques : ce que lit l'utilisateur ne l'est pas. */
const libellePortee = (m: ModeAcces) =>
  GARANTIES[m].portee === "chemin" ? "chemin" : "dépôt";

const acces = ref<ModeAcces>("jeton_personnel");
/** Ce que le projet demande du jeton personnel dans la version web (RG-protection-du-jeton-par-projet). */
const protectionDuJeton = ref<ProtectionDuJeton>("proposee");
const emetteur = ref("");
const client = ref("");
const echange = ref("");

/**
 * Vrai si le mode demande des paramètres qui manquent.
 *
 * Proposer des réglages incomplets écrirait un mode que personne ne pourrait employer : le refus vaut mieux que la découverte à la première connexion.
 */
const identiteIncomplete = computed(
  () =>
    acces.value === "identite_tierce" &&
    !(emetteur.value.trim() && client.value.trim() && echange.value.trim()),
);

const envoi = ref(false);
const erreur = ref<string | null>(null);
const propose = ref<{ pullRequest: number; url: string } | null>(null);

/** Ce qui est chargé, pour savoir si la saisie s'en écarte. */
const initial = ref("");

const modifie = computed(() => empreinte() !== initial.value);

/** Les dépôts de code, tels qu'on les édite. */
const depotsCode = ref<readonly DepotCode[]>([]);
const aideDepots = ref(false);

/** Ce que le réglage écrira, montré dans l'infobulle. */
const apercuDepotsCode = computed(() =>
  exempleDepotsCode(depotsCode.value.filter((d) => d.repo.trim())),
);

/**
 * Signale un nom mal formé sans l'empêcher de le saisir.
 *
 * Bloquer la frappe interdirait de composer le nom caractère par caractère ; la vérification finale, elle, écarte ce qui n'est pas de la forme attendue.
 */
function repoMalForme(repo: string): boolean {
  const v = repo.trim();
  return v.length > 0 && !/^[^/\s]+\/[^/\s]+$/.test(v);
}

function ajouterDepotCode(): void {
  depotsCode.value = [...depotsCode.value, { repo: "", role: "" }];
}

function majDepotCode(i: number, champs: Partial<DepotCode>): void {
  depotsCode.value = depotsCode.value.map((x, n) =>
    n === i ? { ...x, ...champs } : x,
  );
}

function retirerDepotCode(i: number): void {
  depotsCode.value = depotsCode.value.filter((_, n) => n !== i);
}

const commandeSkill = commandeInstallation();
// Calculés, non figés : le référentiel se charge après la construction du composant, et une valeur prise trop tôt afficherait l'exemple générique à un projet qui déclare déjà ses dépôts.
const configSkill = computed(() => configurationExemple(store.depot().repo));

/** Ce qui vient d'être copié, pour le dire en retour. */
const copie = ref<string | null>(null);

async function copier(texte: string, quoi: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(texte);
    copie.value = quoi;
    // Le retour s'efface : laissé affiché, il ferait croire à un état plutôt qu'à un accusé de réception.
    setTimeout(() => (copie.value = null), 2000);
  } catch {
    // Le presse-papiers peut être refusé — hors contexte sécurisé, ou par l'utilisateur. Le texte reste sélectionnable à la main.
  }
}

const installation = ref(false);
const erreurAutomatisation = ref<string | null>(null);

/**
 * Installe les workflows manquants.
 *
 * Directement, sans demande de fusion : ce sont des fichiers d'outillage, non du référentiel, et une automatisation qui attend une relecture ne protège rien pendant qu'elle attend.
 */
async function installerAutomatisation(): Promise<void> {
  if (installation.value) return;
  installation.value = true;
  erreurAutomatisation.value = null;
  try {
    await automatisation.installer();
  } catch (e) {
    erreurAutomatisation.value =
      e instanceof Error
        ? e.message
        : "L’automatisation n’a pas pu être installée.";
  } finally {
    installation.value = false;
  }
}

// La question ne se pose qu'une fois le dépôt chargé, et elle coûte un appel : la poser ici plutôt qu'à chaque affichage de la page.
watchEffect(() => {
  if (store.etat() === "pret" && automatisation.installee() === null) {
    void automatisation.verifier();
  }
});

watchEffect(() => {
  if (store.etat() !== "pret") return;
  const r = store.referentiel().reglages;
  acces.value = r.acces;
  protectionDuJeton.value = r.protectionDuJeton;
  emetteur.value = r.identite?.emetteur ?? "";
  client.value = r.identite?.client ?? "";
  echange.value = r.identite?.echange ?? "";
  depotsCode.value = [...store.referentiel().projet.depotsCode];
  // capturé après application, pour que « modifié » compare bien à l'état chargé
  queueMicrotask(() => (initial.value = empreinte()));
});

function choisirMode(m: ModeAcces): void {
  if (!MODES_REALISES.has(m)) return;
  acces.value = m;
  propose.value = null;
}

async function proposer(): Promise<void> {
  if (envoi.value || identiteIncomplete.value) return;
  envoi.value = true;
  erreur.value = null;
  propose.value = null;
  try {
    const p = await reglages.proposerReglages({
      acces: acces.value,
      // Seul le jeton personnel se garde sur le poste : un autre mode retire l'exigence, devenue sans objet.
      protectionDuJeton:
        acces.value === "jeton_personnel"
          ? protectionDuJeton.value
          : "proposee",
      // Les entrées vides sont écartées : une ligne ajoutée puis laissée telle quelle ne décrit aucun dépôt.
      depotsCode: depotsCode.value
        .filter((d) => d.repo.trim())
        .map((d) => ({ repo: d.repo.trim(), role: d.role.trim() })),
      identite:
        acces.value === "identite_tierce"
          ? {
              emetteur: emetteur.value.trim(),
              client: client.value.trim(),
              echange: echange.value.trim(),
            }
          : null,
    });
    propose.value = p;
    initial.value = empreinte();
  } catch (e) {
    erreur.value =
      e instanceof GithubError || e instanceof Error
        ? e.message
        : "Les réglages n’ont pas pu être proposés.";
  } finally {
    envoi.value = false;
  }
}

/** Représentation stable de la saisie, pour détecter un écart. */
function empreinte(): string {
  const d = depotsCode.value.map((x) => `${x.repo}~${x.role}`).join(",");
  return `${acces.value}#${protectionDuJeton.value}#${emetteur.value}#${client.value}#${echange.value}#${d}`;
}
</script>

<template>
  <div class="reglages-page">
    <EtatVue v-if="store.etat() !== 'pret'" />
    <template v-else>
      <header class="entete">
        <h1>Réglages du projet</h1>
        <p class="sous-titre">
          Ce que l’application s’autorise à faire sur ce projet. Ces réglages
          vivent dans le dépôt et valent pour tous ceux qui y travaillent.
        </p>
      </header>

      <section class="bloc">
        <h2 class="section">Mode d’accès</h2>
        <p class="explication">
          Comment les rédacteurs obtiennent l’accès au dépôt. Les modes
          s’empilent : chacun lève un obstacle que le précédent laissait.
          Changer de mode ne demande de reprendre ni le référentiel ni les
          cadrages.
        </p>

        <div class="modes">
          <label
            v-for="m of modes"
            :key="m"
            class="mode"
            :class="{ indisponible: !realise(m) }"
          >
            <input
              type="radio"
              name="acces"
              :value="m"
              :checked="acces === m"
              :disabled="!realise(m) || envoi"
              @change="choisirMode(m)"
            />
            <span class="mode-corps">
              <span class="mode-tete">
                <strong>{{ libelleMode(m) }}</strong>
                <span v-if="!realise(m)" class="a-venir"
                  >pas encore réalisé</span
                >
              </span>
              <span class="mode-garanties">
                Autorisation jusqu’au {{ libellePortee(m) }} · auteur
                {{ garanties(m).auteurVerifie ? "vérifié" : "déclaré" }} ·
                {{
                  garanties(m).compteRequis
                    ? "compte GitHub requis"
                    : "aucun compte GitHub requis"
                }}
              </span>
            </span>
          </label>
        </div>

        <!-- RG-protection-du-jeton-par-projet, RG-garanties-annoncees : chaque façon de garder le jeton dit ce qu'elle protège et ce qu'elle laisse, et l'exigence ne se fait pas passer pour celle de GitHub. -->
        <div v-if="acces === 'jeton_personnel'" class="protection-du-jeton">
          <h3 class="sous-section">Protection du jeton dans la version web</h3>
          <p class="explication">
            Sur le bureau, le jeton est toujours gardé dans le coffre du
            système. Dans la version web, ce projet peut exiger qu’il soit
            protégé par une passkey : Touch ID, ou le code de l’appareil,
            l’ouvre alors dans chaque onglet.
          </p>

          <div class="modes">
            <label class="mode">
              <input
                v-model="protectionDuJeton"
                type="radio"
                name="protection"
                value="proposee"
                :disabled="envoi"
                @change="propose = null"
              />
              <span class="mode-corps">
                <span class="mode-tete"><strong>Proposée</strong></span>
                <span class="mode-garanties">
                  Chaque rédacteur choisit. Sans passkey, son jeton reste en
                  clair dans son navigateur.
                </span>
              </span>
            </label>
            <label class="mode">
              <input
                v-model="protectionDuJeton"
                type="radio"
                name="protection"
                value="exigee"
                :disabled="envoi"
                @change="propose = null"
              />
              <span class="mode-corps">
                <span class="mode-tete"><strong>Exigée</strong></span>
                <span class="mode-garanties">
                  Un jeton qui ouvre ce projet n’est jamais gardé en clair :
                  sans passkey, il ne vaut que pour l’onglet.
                </span>
              </span>
            </label>
          </div>

          <dl class="formes">
            <dt>En clair, dans le navigateur</dt>
            <dd>
              Un programme qui lit le profil du navigateur, une sauvegarde du
              disque ou quelqu’un devant la session ouverte lisent le jeton.
            </dd>
            <dt>Sous passkey, dans le navigateur</dt>
            <dd>
              Ils ne trouvent qu’un chiffré, que seuls Touch ID ou le code de
              l’appareil ouvrent. Un script ou une extension sur la page lit
              toujours le jeton tant que l’onglet est déverrouillé.
            </dd>
            <dt>Dans le coffre du système, sur le bureau</dt>
            <dd>
              Le jeton est hors du profil du navigateur, et le coffre ne le
              remet qu’à Skanon.
            </dd>
            <dt>Pour la session seulement</dt>
            <dd>
              Avec une identité tierce, ou sans passkey sur un projet qui
              l’exige : rien ne reste sur le poste, et il faut se reconnecter,
              ou ressaisir le jeton, à chaque ouverture.
            </dd>
          </dl>

          <p class="explication">
            Dans tous les cas, le jeton passe en clair dans l’application à
            chaque requête vers GitHub. Ce qui le protège vraiment, c’est sa
            portée — les dépôts et les droits qu’il ouvre —, sa durée de vie, et
            sa révocation le jour où il n’a plus lieu d’être.
          </p>
          <p class="explication">
            L’exigence est celle de Skanon, non de GitHub : un rédacteur peut se
            servir du même jeton dans un autre outil. Ce que GitHub sait
            imposer, c’est l’approbation des jetons par l’organisation, leur
            portée et leur durée de vie maximale.
          </p>
        </div>

        <div v-if="acces === 'identite_tierce'" class="identite">
          <p class="explication">
            Où les identités sont vérifiées. Rien de secret ici : ce sont les
            valeurs que porte toute application s’exécutant dans un navigateur.
          </p>

          <UiChamp
            v-model="emetteur"
            libelle="Émetteur d’identité"
            name="emetteur"
            :disabled="envoi"
            placeholder="https://identite.exemple.fr/realms/mon-projet"
            indice="Racine du domaine, jusqu’au projet inclus."
          />

          <UiChamp
            v-model="client"
            libelle="Identifiant du client"
            name="client"
            :disabled="envoi"
            placeholder="mon-application"
            indice="Client public déclaré chez cet émetteur, sans secret."
          />

          <UiChamp
            v-model="echange"
            libelle="Adresse de l’échange"
            name="echange"
            :disabled="envoi"
            placeholder="https://echange.exemple.fr"
            indice="Composant qui échange une identité contre un accès."
          />

          <p v-if="identiteIncomplete" class="manque">
            Ce mode demande les trois valeurs. Sans elles, personne ne pourra se
            connecter.
          </p>
        </div>
      </section>

      <section v-if="automatisation.installee() === false" class="bloc">
        <h2 class="section">Automatisation</h2>
        <p class="explication">
          Ce dépôt n’a pas ses workflows. Rien ne vérifie donc qu’un cadrage est
          cohérent avant sa livraison, et les règles ne sont pas mises à jour
          quand il est livré — le référentiel cesse d’être la projection des
          cadrages livrés.
        </p>
        <p v-if="erreurAutomatisation" class="erreur">
          <UiIcone nom="error_outline" />
          <span>{{ erreurAutomatisation }}</span>
        </p>
        <UiBouton
          variante="filled"
          :disabled="installation"
          @click="installerAutomatisation()"
        >
          {{ installation ? "Installation…" : "Installer l’automatisation" }}
        </UiBouton>
      </section>

      <section class="bloc">
        <div class="section-tete">
          <h2 class="section">Dépôts de code</h2>
          <UiBouton
            variante="icon"
            class="aide-bouton"
            :aria-expanded="aideDepots"
            aria-label="Ce que ce réglage écrit"
            @click="aideDepots = !aideDepots"
          >
            <UiIcone nom="help_outline" />
          </UiBouton>
        </div>
        <p class="explication">
          Les dépôts que ce projet réalise. Le lien est déclaré ici, du côté qui
          a autorité : c’est ce qui permet de rédiger un cadrage depuis un dépôt
          de code sans rien y configurer.
        </p>

        <div v-if="aideDepots" class="infobulle" role="note">
          <p>Ce réglage écrit dans <code>ssk-canon.yml</code> :</p>
          <BlocCode :texte="apercuDepotsCode" langage="yaml" />
        </div>

        <p v-if="!depotsCode.length" class="vide">
          Aucun dépôt déclaré. Un dépôt de code qui invoque le skill de cadrage
          ne se rattache alors à rien.
        </p>

        <div v-for="(d, i) of depotsCode" :key="i" class="depot-ligne">
          <UiChamp
            class="depot-repo"
            :model-value="d.repo"
            libelle="Dépôt"
            :name="'repo' + i"
            placeholder="organisation/depot"
            :disabled="envoi"
            @update:model-value="majDepotCode(i, { repo: $event })"
          >
            <template v-if="repoMalForme(d.repo)" #indice>
              <span class="ui-champ__indice alerte"
                >Attendu : organisation/depot</span
              >
            </template>
          </UiChamp>

          <UiChamp
            class="depot-role"
            :model-value="d.role"
            libelle="Ce qu’il porte"
            :name="'role' + i"
            placeholder="Application web"
            :disabled="envoi"
            @update:model-value="majDepotCode(i, { role: $event })"
          />

          <UiBouton
            variante="icon"
            :disabled="envoi"
            aria-label="Retirer ce dépôt"
            @click="retirerDepotCode(i)"
          >
            <UiIcone nom="close" />
          </UiBouton>
        </div>

        <UiBouton :disabled="envoi" @click="ajouterDepotCode()">
          <UiIcone nom="add" /> Ajouter un dépôt
        </UiBouton>
      </section>

      <section class="bloc">
        <h2 class="section">Rédiger depuis un dépôt de code</h2>
        <p class="explication">
          Un skill permet de rédiger un cadrage sans quitter le dépôt de code
          sur lequel on travaille. Il trouve seul le référentiel du projet, à
          condition que celui-ci déclare ses dépôts de code — voir plus bas.
        </p>

        <p class="etape">1. L’installer, une fois par machine :</p>
        <BlocCode :texte="commandeSkill" langage="bash" />
        <UiBouton @click="copier(commandeSkill, 'commande')">
          <UiIcone :nom="copie === 'commande' ? 'check' : 'content_copy'" />
          {{ copie === "commande" ? "Copié" : "Copier" }}
        </UiBouton>

        <p class="etape">
          2. Dire où les référentiels sont clonés, dans
          <code>~/.claude/cadrage-canon.json</code> :
        </p>
        <BlocCode :texte="configSkill" langage="json" />
        <UiBouton @click="copier(configSkill, 'config')">
          <UiIcone :nom="copie === 'config' ? 'check' : 'content_copy'" />
          {{ copie === "config" ? "Copié" : "Copier" }}
        </UiBouton>

        <p class="explication">
          Rien n’est à configurer dans les dépôts de code : le skill reconnaît
          celui d’où on l’invoque, et cherche le projet qui le déclare — d’où le
          réglage ci-dessus.
        </p>
      </section>

      <p v-if="erreur" class="erreur">
        <UiIcone nom="error_outline" /> <span>{{ erreur }}</span>
      </p>

      <p v-if="propose" class="succes">
        <UiIcone nom="check_circle" />
        <span>
          Réglages proposés dans la
          <LienExterne :href="propose.url"
            >demande #{{ propose.pullRequest }}</LienExterne
          >. Ils prendront effet à sa fusion.
        </span>
      </p>

      <div class="actions">
        <UiBouton
          variante="filled"
          :disabled="envoi || !modifie || identiteIncomplete"
          @click="proposer()"
        >
          {{ envoi ? "Envoi…" : "Proposer ces réglages" }}
        </UiBouton>
      </div>

      <p class="note">
        Les réglages sont modifiés par une demande de fusion, comme tout ce qui
        vit dans le dépôt. Rien ne change tant qu’elle n’est pas fusionnée.
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
/* Le contenu reste sélectionnable : c'est du texte qu'on recopie, non un message qu'on lit et qu'on ferme. */
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
  /* Ce qui n'est pas choisissable ne doit pas en avoir l'air : le curseur et l'opacité le disent avant que le clic ne l'apprenne. */
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
