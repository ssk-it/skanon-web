<script setup lang="ts">
import { ref, watchEffect } from "vue";
import { GithubError } from "../../core/github/github-client";
import { inject } from "../../core/injection";
import { AmorcageService } from "../../core/repo/amorcage.service";
import { AutomatisationService } from "../../core/repo/automatisation.service";
import { ReferentielStore } from "../../core/repo/referentiel.store";
import { DialogService } from "../../ui/dialog.service";
import UiBouton from "../../ui/UiBouton.vue";
import UiCaseACocher from "../../ui/UiCaseACocher.vue";
import UiChamp from "../../ui/UiChamp.vue";
import UiIcone from "../../ui/UiIcone.vue";
import AideAccesDepot from "./AideAccesDepot.vue";

/**
 * Chargement, erreur, dépôt vide. Isolé parce que chaque écran doit le gérer, et qu'un message d'erreur utile vaut mieux qu'un écran blanc.
 *
 * ```vue
 * <EtatVue v-if="store.etat() !== 'pret'" />
 * ```
 */
const store = inject(ReferentielStore);
const dialog = inject(DialogService);
const amorcageService = inject(AmorcageService);
const automatisation = inject(AutomatisationService);

function retry(): void {
  void store.loadReferentiel();
}

/** Le même dialogue que la barre, rechargeant le dépôt si le jeton a changé. */
function openTokenDialog(): void {
  void import("./TokenDialog.vue").then(async ({ default: TokenDialog }) => {
    const change = await dialog.open<boolean>(TokenDialog, {
      focus: "dialogue",
    });
    if (change) void store.loadReferentiel();
  });
}

const nomProjet = ref("");
const descriptionProjet = ref("");
const amorcage = ref(false);
/** Cochée d'emblée : un dépôt cadré sans automatisation ne tient pas ses promesses, et l'oubli ne se voit qu'à la première livraison incohérente. */
const avecAutomatisation = ref(true);
const erreurAmorcage = ref<string | null>(null);

// Le nom du dépôt sert de proposition : c'est ce que le rédacteur vient d'ouvrir, et le retaper à l'identique n'apprend rien à personne.
watchEffect(() => {
  if (store.depotVide() && !nomProjet.value) {
    nomProjet.value = store.depot().repo;
  }
});

async function amorcer(): Promise<void> {
  if (amorcage.value || !nomProjet.value.trim()) return;
  amorcage.value = true;
  erreurAmorcage.value = null;
  try {
    // Pas de description inventée : une phrase que personne n'a écrite est prise pour vraie par ceux qui la lisent ensuite, et se recopie.
    await amorcageService.amorcer({
      nom: nomProjet.value.trim(),
      description: descriptionProjet.value.trim(),
    });

    // Après l'amorçage, non pendant : le référentiel existe désormais, et si l'accès ne permet pas d'écrire les workflows, le dépôt reste amorcé — l'installation se reprend depuis les réglages.
    if (avecAutomatisation.value) {
      await automatisation.installer();
    }
  } catch (e) {
    erreurAmorcage.value =
      e instanceof GithubError || e instanceof Error
        ? e.message
        : "Le dépôt n’a pas pu être amorcé.";
  } finally {
    amorcage.value = false;
  }
}
</script>

<template>
  <div class="etat-vue">
    <div v-if="store.etat() === 'chargement'" class="etat">
      <p class="titre">Chargement du référentiel…</p>
      <p v-if="store.progression()" class="detail">
        {{ store.progression()?.charges }} /
        {{ store.progression()?.total }} fichiers
      </p>
    </div>
    <template v-else-if="store.etat() === 'erreur'">
      <div v-if="store.depotVide()" class="etat amorcage">
        <UiIcone nom="rocket_launch" />
        <p class="titre">Ce dépôt est vide</p>
        <p class="detail">
          Il n’a encore rien reçu. L’application peut y déposer la structure
          d’un référentiel — les répertoires, la configuration, et de quoi s’y
          retrouver.
        </p>

        <div class="champs">
          <UiChamp
            v-model="nomProjet"
            libelle="Nom du projet"
            name="nomProjet"
            :disabled="amorcage"
          />

          <UiChamp
            v-model="descriptionProjet"
            libelle="En une phrase"
            multiligne
            :rows="2"
            name="descriptionProjet"
            :disabled="amorcage"
          />
        </div>

        <UiCaseACocher v-model="avecAutomatisation" :disabled="amorcage">
          Installer l’automatisation
        </UiCaseACocher>
        <p class="detail note">
          Vérifie les cadrages avant leur livraison, et met à jour les règles
          une fois livrés. Demande un accès autorisé à écrire les workflows.
        </p>

        <p v-if="erreurAmorcage" class="detail echec">{{ erreurAmorcage }}</p>

        <UiBouton
          variante="filled"
          :disabled="amorcage || !nomProjet.trim()"
          @click="amorcer()"
        >
          {{ amorcage ? "Dépôt en cours…" : "Amorcer le référentiel" }}
        </UiBouton>
        <p class="detail note">
          Écrit directement sur la branche principale : il n’y a rien à relire
          dans un dépôt vide.
        </p>
      </div>
      <div v-else class="etat erreur">
        <UiIcone nom="error_outline" />
        <p class="titre">Le dépôt n’a pas pu être chargé</p>
        <p class="detail">{{ store.erreur() }}</p>
        <AideAccesDepot
          v-if="store.jetonSansAcces()"
          :depot="store.depot()"
          @remplacer="openTokenDialog()"
        />
        <UiBouton variante="filled" @click="retry()">Réessayer</UiBouton>
      </div>
    </template>
    <div v-else-if="store.etat() === 'vide'" class="etat">
      <p class="titre">Aucun dépôt ouvert</p>
    </div>
  </div>
</template>

<style scoped>
.etat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 72px 24px;
  text-align: center;
  color: var(--mat-sys-on-surface-variant);
}
.champs {
  display: flex;
  flex-direction: column;
  gap: 4px;
  /* L'écran est centré : des champs pleine page y flotteraient. */
  width: min(100%, 34rem);
  margin-top: 6px;
  text-align: left;
}
.echec {
  color: var(--pc-statut-relecture);
}
.note {
  font-size: 12.5px;
  opacity: 0.8;
}
.titre {
  margin: 0;
  font-size: 16px;
  color: var(--mat-sys-on-surface);
}
.detail {
  margin: 0;
  font-size: 14px;
  max-width: 52ch;
  line-height: 1.55;
}
.erreur .material-symbols-outlined {
  color: var(--mat-sys-error);
  width: 32px;
  height: 32px;
  font-size: 32px;
}
.ui-bouton {
  margin-top: 8px;
}
</style>
