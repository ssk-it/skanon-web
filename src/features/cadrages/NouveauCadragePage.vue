<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { GithubError } from "../../core/github/github-client";
import { TokenService } from "../../core/github/token.service";
import { inject } from "../../core/injection";
import { LiensService } from "../../core/repo/liens.service";
import { RedactionService } from "../../core/repo/redaction.service";
import { ReferentielStore } from "../../core/repo/referentiel.store";
import { PLATEFORME } from "../../plateforme/jeton";
import UiBouton from "../../ui/UiBouton.vue";
import UiChamp from "../../ui/UiChamp.vue";
import UiIcone from "../../ui/UiIcone.vue";
import EtatVue from "../shared/EtatVue.vue";

/**
 * Ouverture d'un cadrage.
 *
 * Le formulaire ne demande que ce qu'un cadrage doit porter dès sa création : un titre, ce qu'il vise, et le parcours attendu. Les décisions, les impacts et les énoncés se rédigent ensuite, au fil de la relecture — les exiger d'emblée confondrait l'ouverture d'un sujet avec sa conclusion.
 */
const store = inject(ReferentielStore);
const liens = inject(LiensService);
const redaction = inject(RedactionService);
const tokens = inject(TokenService);
const ouvreur = inject(PLATEFORME).ouvreur;
const router = useRouter();

const titre = ref("");
const domaines = ref("");
const objectif = ref("");
const parcours = ref("");

const envoi = ref(false);
const erreur = ref<string | null>(null);

const domainesConnus = computed(() => store.domaines().map((d) => d.id));

/**
 * Ce qui manque encore, nommé plutôt que signalé par un bouton inerte.
 *
 * Un bouton désactivé sans explication laisse le rédacteur chercher lequel des quatre champs le bloque.
 */
const manquant = computed(() => {
  const absents = [
    ["un titre", titre.value],
    ["un objectif", objectif.value],
    ["un parcours", parcours.value],
  ]
    .filter(([, valeur]) => !valeur.trim())
    .map(([nom]) => nom);
  return absents.length ? absents.join(", ") : null;
});

async function creer(): Promise<void> {
  if (envoi.value || manquant.value) return;

  envoi.value = true;
  erreur.value = null;
  try {
    const cree = await redaction.createCadrage({
      titre: titre.value,
      domaines: domaines.value
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean),
      objectif: objectif.value,
      parcours: parcours.value,
    });

    // Le cadrage vit sur sa branche, invisible du référentiel chargé : on renvoie vers la demande de fusion, qui est l'endroit où il se relit et se commente jusqu'à sa livraison. Par l'ouvreur de la plateforme : dans l'application de bureau, `window.open` ne mène nulle part.
    void ouvreur.open(cree.url);
    await router.push(liens.chemin("cadrages"));
  } catch (e) {
    erreur.value =
      e instanceof GithubError || e instanceof Error
        ? e.message
        : "La création du cadrage a échoué.";
  } finally {
    envoi.value = false;
  }
}
</script>

<template>
  <div class="nouveau-cadrage-page">
    <EtatVue v-if="store.etat() !== 'pret'" />
    <template v-else>
      <RouterLink class="retour" :to="liens.chemin('cadrages')">
        <UiIcone nom="arrow_back" /> Cadrages
      </RouterLink>

      <header class="entete">
        <p class="type">Nouveau cadrage</p>
        <h1>{{ redaction.prochainId() }}</h1>
        <p class="sous-titre">
          L’identifiant est attribué à la création et ne changera plus, même si
          le titre est réécrit.
        </p>
      </header>

      <p v-if="!tokens.present()" class="avertissement">
        <UiIcone nom="lock" />
        <span>
          Écrire dans le dépôt demande une connexion, avec un jeton autorisant
          l’écriture. Le jeton de lecture seule conseillé pour la consultation
          ne suffit pas ici.
        </span>
      </p>

      <form class="formulaire" @submit.prevent="creer()">
        <UiChamp
          v-model="titre"
          libelle="Titre"
          name="titre"
          indice="Ce que ce cadrage change, en une ligne."
          :disabled="envoi"
        />

        <UiChamp
          v-model="domaines"
          libelle="Domaines"
          name="domaines"
          :indice="`Séparés par des virgules. Connus : ${domainesConnus.join(', ')}`"
          :disabled="envoi"
        />

        <UiChamp
          v-model="objectif"
          libelle="Objectif"
          multiligne
          :rows="5"
          name="objectif"
          indice="Le problème à résoudre, et pourquoi il mérite d’être traité."
          :disabled="envoi"
        />

        <UiChamp
          v-model="parcours"
          libelle="Parcours utilisateur"
          multiligne
          :rows="5"
          name="parcours"
          indice="Ce que fait l’utilisateur, étape par étape."
          :disabled="envoi"
        />

        <p v-if="erreur" class="erreur">
          <UiIcone nom="error_outline" /> <span>{{ erreur }}</span>
        </p>

        <p v-if="manquant" class="incomplet">
          Il manque encore : {{ manquant }}.
        </p>

        <div class="actions">
          <UiBouton :to="liens.chemin('cadrages')">Annuler</UiBouton>
          <UiBouton
            variante="filled"
            type="submit"
            :disabled="envoi || !!manquant"
          >
            {{ envoi ? "Création…" : "Créer le cadrage" }}
          </UiBouton>
        </div>
      </form>

      <p class="note">
        La création ouvre une branche
        <code>cadrage/{{ redaction.prochainId() }}</code> et une demande de
        fusion. Rien n’entre dans le référentiel avant sa livraison.
      </p>
    </template>
  </div>
</template>

<style scoped>
.nouveau-cadrage-page {
  display: block;
  max-width: 70ch;
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
}
.formulaire {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.avertissement,
.erreur {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0 0 18px;
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
.erreur {
  margin: 6px 0 0;
}
.incomplet {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--mat-sys-on-surface-variant);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}
.note {
  margin-top: 22px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--mat-sys-on-surface-variant);

  code {
    font-family: var(--pc-font-mono, monospace);
    font-size: 12.5px;
  }
}
</style>
