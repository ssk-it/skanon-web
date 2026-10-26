<script setup lang="ts">
import { computed, ref } from "vue";
import type { RefDepot } from "../../core/github/github-client";
import { TokenService } from "../../core/github/token.service";
import { inject } from "../../core/injection";
import { DepotsConnusService } from "../../core/repo/depots-connus.service";
import { RepoConfig, memeDepot } from "../../core/repo/repo-config";
import UiBouton from "../../ui/UiBouton.vue";
import UiChamp from "../../ui/UiChamp.vue";
import UiDialogue from "../../ui/UiDialogue.vue";
import UiIcone from "../../ui/UiIcone.vue";
import UiSpinner from "../../ui/UiSpinner.vue";
import AvatarOrganisation from "./AvatarOrganisation.vue";
import SymboleProjet from "./SymboleProjet.vue";

/**
 * Le choix du dépôt de projet à ouvrir : ceux qui portent un référentiel, les autres que le jeton ouvre, ou une saisie libre. Se ferme sur le dépôt choisi, ou sans réponse.
 */
defineProps<{ data?: unknown }>();
const emit = defineEmits<{ fermer: [depot?: RefDepot] }>();

const config = inject(RepoConfig);
const connus = inject(DepotsConnusService);
const tokens = inject(TokenService);

const saisie = ref(`${config.depot().owner}/${config.depot().repo}`);
const erreur = ref<string | null>(null);

const cadres = computed(() =>
  // Un récent est proposé même si le contrôle n'a pas encore répondu : il a déjà été ouvert, donc il porte un référentiel.
  connus.depots().filter((d) => d.cadre || d.recent),
);
const autres = computed(() =>
  connus.depots().filter((d) => !d.cadre && !d.recent),
);

void connus.rafraichir();

function estOuvert(depot: RefDepot): boolean {
  return memeDepot(depot, config.depot());
}

function choisir(depot: RefDepot): void {
  emit("fermer", depot);
}

function oublier(depot: RefDepot): void {
  config.oublier(depot);
  void connus.rafraichir();
}

function validateDepot(): void {
  const depot = RepoConfig.parseDepot(saisie.value);
  if (!depot) {
    erreur.value = "Format attendu : organisation/depot";
    return;
  }
  emit("fermer", depot);
}
</script>

<!--
  Défaut hérité, porté tel quel (CLAUDE.md, « Porter sans changer ») : dans SSK Canon, le `mat-error` de la saisie ne s'affiche jamais — Material ne le montre que pour un champ invalide, et aucun validateur ne l'est. Une saisie mal formée efface donc l'indication sans rien dire. Ici aussi : le message est tenu dans `erreur`, et seule l'indication disparaît.
-->
<template>
  <UiDialogue titre="Ouvrir un dépôt de projet">
    <template v-if="cadres.length">
      <p class="titre-liste">Dépôts cadrés</p>
      <ul class="depots">
        <li v-for="d in cadres" :key="d.depot.owner + '/' + d.depot.repo">
          <button type="button" class="depot" @click="choisir(d.depot)">
            <SymboleProjet :depot="d.depot" />
            <span class="nom">{{ d.depot.owner }}/{{ d.depot.repo }}</span>
            <span v-if="estOuvert(d.depot)" class="marque">ouvert</span>
            <span v-else-if="d.recent" class="marque">déjà ouvert</span>
          </button>
          <UiBouton
            v-if="d.recent"
            variante="icon"
            class="oublier"
            aria-label="Retirer de la liste"
            @click="oublier(d.depot)"
          >
            <UiIcone nom="close" />
          </UiBouton>
        </li>
      </ul>
    </template>

    <details v-if="autres.length" class="autres">
      <summary>Autres dépôts autorisés ({{ autres.length }})</summary>
      <ul class="depots">
        <li v-for="d in autres" :key="d.depot.owner + '/' + d.depot.repo">
          <button type="button" class="depot" @click="choisir(d.depot)">
            <AvatarOrganisation :owner="d.depot.owner" />
            <span class="nom">{{ d.depot.owner }}/{{ d.depot.repo }}</span>
          </button>
        </li>
      </ul>
      <p class="aide">
        Ceux-ci ne portent pas encore de référentiel. En ouvrir un propose de
        l’amorcer.
      </p>
    </details>

    <p v-if="connus.enCours()" class="attente">
      <UiSpinner :diametre="16" />
      <span>Recherche des dépôts autorisés…</span>
    </p>

    <p v-if="connus.erreur()" class="echec">
      <UiIcone nom="error_outline" /> <span>{{ connus.erreur() }}</span>
    </p>

    <p v-if="!tokens.present() && !connus.enCours()" class="aide">
      Sans connexion, seuls les dépôts publics sont lisibles, et l’application
      ne peut pas dire lesquels vous sont autorisés.
    </p>

    <UiChamp
      v-model="saisie"
      class="champ"
      libelle="Ou saisir un dépôt"
      placeholder="organisation/depot"
      autocomplete="off"
      data-focus-initial
      :indice="erreur ? null : 'Un nom court, ou une URL GitHub complète'"
      @keyup.enter="validateDepot()"
    />

    <template #actions>
      <UiBouton @click="emit('fermer')">Annuler</UiBouton>
      <UiBouton variante="filled" @click="validateDepot()">Ouvrir</UiBouton>
    </template>
  </UiDialogue>
</template>

<style scoped>
.aide {
  margin: 10px 0 0;
  color: var(--mat-sys-on-surface-variant);
  font-size: 13px;
  line-height: 1.5;
  max-width: 46ch;
}
.titre-liste {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
.depots {
  list-style: none;
  margin: 0 0 14px;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.depots li {
  display: flex;
  align-items: center;
  gap: 2px;
}
.depot {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.depot:hover,
.depot:focus-visible {
  background: var(--mat-sys-surface-container-high);
}
.depot .material-symbols-outlined {
  font-size: 18px;
  width: 18px;
  height: 18px;
  color: var(--mat-sys-on-surface-variant);
}
.nom {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
}
.marque {
  margin-left: auto;
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
.oublier {
  opacity: 0.45;
}
.oublier:hover {
  opacity: 1;
}
.autres {
  margin-bottom: 12px;
}
.autres summary {
  cursor: pointer;
  font-size: 13px;
  color: var(--mat-sys-on-surface-variant);
  padding: 4px 0;
}
.attente,
.echec {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
  font-size: 13px;
  color: var(--mat-sys-on-surface-variant);
}
.echec {
  color: var(--mat-sys-error);
}
.echec .material-symbols-outlined {
  font-size: 18px;
  width: 18px;
  height: 18px;
}
.champ {
  width: 100%;
  min-width: 340px;
  margin-top: 6px;
}
</style>
