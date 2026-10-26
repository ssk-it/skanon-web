<script setup lang="ts">
import { computed } from "vue";
import { TokenService } from "../../core/github/token.service";
import { inject } from "../../core/injection";
import ExternalLink from "../../ui/ExternalLink.vue";
import UiButton from "../../ui/UiButton.vue";
import UiIcon from "../../ui/UiIcon.vue";

/**
 * Comment donner à un jeton l'accès au dépôt qu'il n'ouvre pas.
 *
 * Montré là où l'échec se constate plutôt que dans l'aide à la création : celui qui le lit a déjà un jeton, et c'est ce jeton-là qu'il faut corriger. Le corriger sur la plateforme garde sa valeur — rien à ressaisir ici, sauf lorsque le dépôt appartient à un autre propriétaire que celui du jeton.
 */
const props = defineProps<{ repoRef: { owner: string; repo: string } }>();

/** Demande d'ouvrir la saisie d'un jeton. */
const emit = defineEmits<{ replace: [] }>();

const tokens = inject(TokenService);

const fullName = computed(() => `${props.repoRef.owner}/${props.repoRef.repo}`);

/**
 * Un jeton classique n'a ni sélection de dépôts ni propriétaire : les étapes d'un jeton à portée fine n'y trouveraient rien à régler.
 */
const classic = computed(() => tokens.value()?.startsWith("ghp_") ?? false);
</script>

<template>
  <section class="aide-acces-depot aide">
    <h3>Donner au jeton l’accès à {{ fullName }}</h3>

    <template v-if="classic">
      <p class="intro">
        Le jeton enregistré est un jeton classique : il ouvre d’emblée tous les
        dépôts auxquels votre compte GitHub a accès.
      </p>
      <ol class="etapes">
        <li>
          Vérifier que votre compte GitHub voit bien
          <strong>{{ fullName }}</strong> en l’ouvrant sur github.com. Sinon,
          demander l’accès à un administrateur de
          <strong>{{ repoRef.owner }}</strong
          >.
        </li>
        <li>
          Si <strong>{{ repoRef.owner }}</strong> impose une authentification
          unique, ouvrir
          <ExternalLink href="https://github.com/settings/tokens"
            >la page des jetons classiques
            <UiIcon name="open_in_new" /></ExternalLink
          >, puis <strong>Configure SSO</strong> en regard du jeton, et
          <strong>Authorize</strong> pour cette organisation.
        </li>
        <li>Revenir ici et réessayer.</li>
      </ol>
    </template>
    <template v-else>
      <ol class="etapes">
        <li>
          Ouvrir
          <ExternalLink
            href="https://github.com/settings/personal-access-tokens"
            >la page des jetons d’accès <UiIcon name="open_in_new"
          /></ExternalLink>
          sur GitHub, et cliquer sur le jeton utilisé ici — « Skanon » s’il a
          été nommé comme le conseille l’aide à la création. S’il est marqué
          <strong>Expired</strong>, en créer un nouveau.
        </li>
        <li>
          Vérifier son <strong>Resource owner</strong> : ce doit être
          <strong>{{ repoRef.owner }}</strong
          >. Un jeton ne couvre qu’un seul propriétaire, qui ne se change plus
          après la création. Si c’en est un autre, créer un nouveau jeton pour
          <strong>{{ repoRef.owner }}</strong>
          et le déclarer ici pour cette organisation : l’ancien reste valable
          pour ses propres dépôts.
        </li>
        <li>
          Cliquer sur <strong>Edit</strong>. Sous
          <strong>Repository access</strong>, si
          <strong>Only select repositories</strong> est coché, ajouter
          <strong>{{ fullName }}</strong> à la liste. Ne pas basculer sur
          <strong>All repositories</strong> pour autant : le jeton ouvrirait
          tout le reste.
        </li>
        <li>
          Sous <strong>Permissions → Repository permissions</strong>, vérifier
          que <strong>Contents</strong> est au moins en
          <strong>Read-only</strong> — en <strong>Read and write</strong>, avec
          <strong>Pull requests</strong>, pour rédiger —, et
          <strong>Issues</strong> en <strong>Read-only</strong>, pour la
          roadmap.
        </li>
        <li>
          Cliquer sur <strong>Update</strong> en bas de page, puis revenir ici
          et réessayer. Le jeton garde sa valeur : rien à ressaisir.
        </li>
      </ol>

      <div class="note">
        <UiIcon name="schedule" />
        <p>
          Si <strong>{{ repoRef.owner }}</strong> soumet les jetons à
          approbation, la page des jetons l’indique par
          <strong>Pending</strong> en regard de l’organisation. Le jeton n’ouvre
          rien avant qu’un de ses administrateurs l’ait approuvé.
        </p>
      </div>
    </template>

    <UiButton @click="emit('replace')">
      <UiIcon name="key" />
      Enregistrer un autre jeton
    </UiButton>
  </section>
</template>

<style scoped>
.aide {
  max-width: 62ch;
  padding: 16px 18px;
  border-radius: 8px;
  background: var(--mat-sys-surface-container);
  text-align: left;
}
h3 {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
  color: var(--mat-sys-on-surface);
}
.intro {
  margin: 0 0 10px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--mat-sys-on-surface-variant);
}
.etapes {
  margin: 0 0 14px;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--mat-sys-on-surface-variant);
}
strong {
  color: var(--mat-sys-on-surface);
  font-weight: 600;
}
.etapes li::marker {
  color: var(--mat-sys-outline);
}
a {
  color: var(--mat-sys-primary);
  text-decoration: none;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
  .material-symbols-outlined {
    font-size: 13px;
    width: 13px;
    height: 13px;
    vertical-align: -1px;
  }
}
.note {
  display: flex;
  gap: 11px;
  align-items: flex-start;
  margin-bottom: 8px;

  p {
    margin: 0;
    font-size: 13px;
    line-height: 1.55;
    color: var(--mat-sys-on-surface-variant);
  }
  > .material-symbols-outlined {
    flex: none;
    font-size: 19px;
    width: 19px;
    height: 19px;
    color: var(--mat-sys-on-surface-variant);
  }
}
</style>
