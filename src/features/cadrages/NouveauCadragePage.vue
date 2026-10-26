<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { GithubError } from "../../core/github/github-client";
import { TokenService } from "../../core/github/token.service";
import { inject } from "../../core/injection";
import { LinksService } from "../../core/repo/liens.service";
import { AuthoringService } from "../../core/repo/redaction.service";
import { SpecificationStore } from "../../core/repo/referentiel.store";
import { PLATFORM } from "../../plateforme/jeton";
import UiButton from "../../ui/UiBouton.vue";
import UiTextField from "../../ui/UiChamp.vue";
import UiIcon from "../../ui/UiIcone.vue";
import ViewState from "../shared/EtatVue.vue";

/**
 * Ouverture d'un cadrage.
 *
 * Le formulaire ne demande que ce qu'un cadrage doit porter dès sa création : un titre, ce qu'il vise, et le parcours attendu. Les décisions, les impacts et les énoncés se rédigent ensuite, au fil de la relecture — les exiger d'emblée confondrait l'ouverture d'un sujet avec sa conclusion.
 */
const store = inject(SpecificationStore);
const links = inject(LinksService);
const authoring = inject(AuthoringService);
const tokens = inject(TokenService);
const opener = inject(PLATFORM).opener;
const router = useRouter();

const title = ref("");
const domains = ref("");
const goal = ref("");
const journey = ref("");

const sending = ref(false);
const error = ref<string | null>(null);

const knownDomains = computed(() => store.domains().map((d) => d.id));

/**
 * Ce qui manque encore, nommé plutôt que signalé par un bouton inerte.
 *
 * Un bouton désactivé sans explication laisse le rédacteur chercher lequel des quatre champs le bloque.
 */
const missing = computed(() => {
  const absent = [
    ["un titre", title.value],
    ["un objectif", goal.value],
    ["un parcours", journey.value],
  ]
    .filter(([, value]) => !value.trim())
    .map(([name]) => name);
  return absent.length ? absent.join(", ") : null;
});

async function create(): Promise<void> {
  if (sending.value || missing.value) return;

  sending.value = true;
  error.value = null;
  try {
    const cree = await authoring.createScoping({
      title: title.value,
      domains: domains.value
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean),
      goal: goal.value,
      journey: journey.value,
    });

    // Le cadrage vit sur sa branche, invisible du référentiel chargé : on renvoie vers la demande de fusion, qui est l'endroit où il se relit et se commente jusqu'à sa livraison. Par l'ouvreur de la plateforme : dans l'application de bureau, `window.open` ne mène nulle part.
    void opener.open(cree.url);
    await router.push(links.path("cadrages"));
  } catch (e) {
    error.value =
      e instanceof GithubError || e instanceof Error
        ? e.message
        : "La création du cadrage a échoué.";
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div class="nouveau-cadrage-page">
    <ViewState v-if="store.state() !== 'pret'" />
    <template v-else>
      <RouterLink class="retour" :to="links.path('cadrages')">
        <UiIcon name="arrow_back" /> Cadrages
      </RouterLink>

      <header class="entete">
        <p class="type">Nouveau cadrage</p>
        <h1>{{ authoring.nextId() }}</h1>
        <p class="sous-titre">
          L’identifiant est attribué à la création et ne changera plus, même si
          le titre est réécrit.
        </p>
      </header>

      <p v-if="!tokens.present()" class="avertissement">
        <UiIcon name="lock" />
        <span>
          Écrire dans le dépôt demande une connexion, avec un jeton autorisant
          l’écriture. Le jeton de lecture seule conseillé pour la consultation
          ne suffit pas ici.
        </span>
      </p>

      <form class="formulaire" @submit.prevent="create()">
        <UiTextField
          v-model="title"
          label="Titre"
          name="titre"
          hint="Ce que ce cadrage change, en une ligne."
          :disabled="sending"
        />

        <UiTextField
          v-model="domains"
          label="Domaines"
          name="domaines"
          :hint="`Séparés par des virgules. Connus : ${knownDomains.join(', ')}`"
          :disabled="sending"
        />

        <UiTextField
          v-model="goal"
          label="Objectif"
          multiline
          :rows="5"
          name="objectif"
          hint="Le problème à résoudre, et pourquoi il mérite d’être traité."
          :disabled="sending"
        />

        <UiTextField
          v-model="journey"
          label="Parcours utilisateur"
          multiline
          :rows="5"
          name="parcours"
          hint="Ce que fait l’utilisateur, étape par étape."
          :disabled="sending"
        />

        <p v-if="error" class="erreur">
          <UiIcon name="error_outline" /> <span>{{ error }}</span>
        </p>

        <p v-if="missing" class="incomplet">
          Il manque encore : {{ missing }}.
        </p>

        <div class="actions">
          <UiButton :to="links.path('cadrages')">Annuler</UiButton>
          <UiButton
            variant="filled"
            type="submit"
            :disabled="sending || !!missing"
          >
            {{ sending ? "Création…" : "Créer le cadrage" }}
          </UiButton>
        </div>
      </form>

      <p class="note">
        La création ouvre une branche
        <code>cadrage/{{ authoring.nextId() }}</code> et une demande de fusion.
        Rien n’entre dans le référentiel avant sa livraison.
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
