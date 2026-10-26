<script setup lang="ts">
import { inject } from "../../core/injection";
import { PLATEFORME } from "../../plateforme/jeton";
import LienExterne from "../../ui/LienExterne.vue";
import UiIcone from "../../ui/UiIcone.vue";

const auBureau = inject(PLATEFORME).cible === "bureau";

/**
 * Comment créer un jeton d'accès GitHub.
 *
 * Ce contenu vit dans l'application plutôt que dans un fichier du dépôt : il est lu au moment précis où l'on en a besoin, par quelqu'un qui n'ira pas chercher une documentation ailleurs.
 *
 * `collerOu` dit où coller le jeton créé : « ici » dans la connexion, ailleurs là où l'aide se lit sans champ de saisie.
 */
withDefaults(defineProps<{ collerOu?: string }>(), { collerOu: "ici" });
</script>

<template>
  <section class="aide-jeton aide">
    <h3>Créer un jeton</h3>

    <ol class="etapes">
      <li>
        Ouvrir
        <LienExterne
          href="https://github.com/settings/personal-access-tokens/new"
          >la page de création d’un jeton <UiIcone nom="open_in_new"
        /></LienExterne>
        sur GitHub.
      </li>
      <li>
        Donner un nom qui rappelle son usage — « Skanon » — et une date
        d’expiration. Un jeton qui n’expire jamais est un jeton qu’on oublie.
      </li>
      <li>
        Sous <strong>Repository access</strong>, choisir les dépôts à consulter.
        Se limiter à ceux-là plutôt que d’accorder l’accès à tout le compte.
      </li>
      <li>
        Sous <strong>Permissions → Repository permissions</strong>, accorder ce
        que l’usage demande — voir le tableau ci-dessous.
      </li>
      <li>
        Créer le jeton, le copier, et le coller {{ collerOu }}. GitHub ne
        l’affichera plus.
      </li>
    </ol>

    <table class="permissions">
      <thead>
        <tr>
          <th>Permission</th>
          <th>Pour consulter</th>
          <th>Pour rédiger</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Contents</strong></td>
          <td>Read-only</td>
          <td>Read and write</td>
        </tr>
        <tr>
          <td><strong>Issues</strong></td>
          <td>Read-only</td>
          <td>Read-only</td>
        </tr>
        <tr>
          <td><strong>Pull requests</strong></td>
          <td>—</td>
          <td>Read and write</td>
        </tr>
      </tbody>
    </table>

    <div class="note">
      <UiIcone nom="help_outline" />
      <div>
        <p>
          <strong>Pourquoi écrire demande les deux.</strong> Rédiger un cadrage
          crée une branche et y dépose un fichier — deux écritures dans le
          dépôt, que <strong>Contents</strong> autorise. La demande de fusion ne
          vient qu’ensuite, et c’est <strong>Pull requests</strong> qui l’ouvre.
          La première écrit dans le dépôt, la seconde demande à fusionner ce qui
          a été écrit.
        </p>
        <p>
          Rien n’entre pour autant dans la branche principale sans contrôle : la
          protection du dépôt exige que la vérification d’intégrité soit passée.
          Un jeton d’écriture ouvre un cadrage, il ne le livre pas seul.
        </p>
      </div>
    </div>

    <div class="note">
      <UiIcone nom="help_outline" />
      <div>
        <p>
          <strong>Pourquoi lire les issues.</strong> La roadmap d’un projet — ce
          qu’on envisage pour un domaine ou une fonctionnalité — vit dans les
          issues de son dépôt. Sans <strong>Issues</strong> en lecture, elle ne
          s’affiche pas ; l’accorder dès la création évite de recréer le jeton.
        </p>
      </div>
    </div>

    <div class="note">
      <UiIcone nom="shield" />
      <div>
        <p>
          <strong>N’accorder que ce dont on a besoin.</strong> Un jeton est
          conservé
          {{ auBureau ? "dans le coffre du système" : "par votre navigateur" }}
          : toute personne ayant accès à cette session peut le récupérer. En
          lecture seule, le pire qu’il permette est de lire ce que vous pouviez
          déjà lire.
        </p>
        <p>
          Pour consulter, s’en tenir à la lecture. N’accorder l’écriture que si
          vous rédigez, et la limiter aux dépôts concernés — un jeton d’écriture
          sur tout le compte fait courir un risque sans rapport avec l’usage.
        </p>
      </div>
    </div>

    <div class="note">
      <UiIcone nom="help_outline" />
      <div>
        <p>
          <strong>Un dépôt public a-t-il besoin d’un jeton ?</strong> Non pour
          le consulter. Mais sans jeton, GitHub limite l’application à 60
          requêtes par heure et par adresse — partagées avec tout autre usage
          depuis la même connexion. Un jeton porte cette limite à 5 000.
        </p>
        <p>
          Une exception : GitHub refuse <strong>l’historique</strong> à toute
          requête anonyme, même sur un dépôt public. Les cadrages restent
          lisibles sans jeton ; leurs dates et leurs auteurs n’apparaissent
          qu’une fois connecté.
        </p>
      </div>
    </div>

    <p class="revoquer">
      Un jeton se révoque à tout moment depuis
      <LienExterne href="https://github.com/settings/tokens"
        >les réglages GitHub <UiIcone nom="open_in_new" /></LienExterne
      >. Le révoquer suffit : rien à faire ici.
    </p>
  </section>
</template>

<style scoped>
/* Une ligne d'environ 75 caractères, celle de RG-mesure-de-lecture : le panneau qui l'accueille est plus large, et le tableau la suit. */
.aide {
  max-width: 75ch;
}
h3 {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 600;
}
.etapes {
  margin: 0 0 20px;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--mat-sys-on-surface-variant);
}
.etapes strong {
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
.permissions {
  width: 100%;
  margin: 16px 0;
  border-collapse: collapse;
  font-size: 13px;

  th,
  td {
    padding: 7px 10px;
    text-align: left;
    border-bottom: 1px solid var(--mat-sys-outline-variant);
  }
  th {
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--mat-sys-on-surface-variant);
  }
  /* Les deux colonnes d'usage ont la même largeur : les comparer d'un coup d'œil est tout l'intérêt du tableau. */
  th:not(:first-child),
  td:not(:first-child) {
    width: 30%;
  }
}
.note {
  display: flex;
  gap: 11px;
  align-items: flex-start;
  padding: 13px 15px;
  margin-bottom: 12px;
  border-radius: 8px;
  background: var(--mat-sys-surface-container);

  p {
    margin: 0;
    font-size: 13px;
    line-height: 1.55;
    color: var(--mat-sys-on-surface-variant);
  }
  p + p {
    margin-top: 8px;
  }
  strong {
    color: var(--mat-sys-on-surface);
  }
  > .material-symbols-outlined {
    flex: none;
    font-size: 19px;
    width: 19px;
    height: 19px;
    color: var(--mat-sys-on-surface-variant);
  }
}
.revoquer {
  margin: 16px 0 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--mat-sys-on-surface-variant);
}
</style>
