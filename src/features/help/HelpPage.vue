<script setup lang="ts">
import { computed } from "vue";
import { TokenService } from "../../core/github/token.service";
import { inject } from "../../core/injection";
import { COMPOSITION } from "../../extension/composer";
import { PLATFORM } from "../../platform/platform-token";
import UiIcon from "../../ui/UiIcon.vue";

/**
 * Le fonctionnement de Skanon, en une page : ce qu'il fait des jetons, ce qu'il garde sur le poste, comment il trouve les projets, à qui il parle.
 *
 * Une annonce, au sens de RG-secret-conserve-localement : chaque phrase doit rester vraie du code. Ce qui diffère d'une cible à l'autre est dit pour la cible où l'on se trouve, non pour les deux — le lecteur n'a pas à savoir laquelle il utilise pour comprendre ce qui le concerne (RG-aide-fidele).
 */
const onDesktop = inject(PLATFORM).target === "bureau";
/** Ce que le livrable dit de lui-même — son hébergement, ses mises à jour, sa licence —, que la page rend sans le connaître (ADR-extensions-commerciales). */
const help = inject(COMPOSITION).help;
/** Dans le navigateur, les jetons sont scellés par une passkey ou gardés en clair : l'aide dit ce qui est (RG-secret-conserve-localement). */
const sealedTokens = computed(() => inject(TokenService).form() === "scelle");
</script>

<template>
  <article class="aide-page">
    <header class="entete">
      <h1>Fonctionnement de Skanon</h1>
      <p class="sous-titre">
        Skanon lit et écrit le référentiel d’un projet directement dans son
        dépôt GitHub. Il n’a pas de serveur qui garde vos données : ce qu’il
        sait, il le tient de GitHub, et le garde sur ce poste.
      </p>
    </header>

    <section>
      <h2><UiIcon name="key" />Jetons</h2>
      <ul>
        <li>
          Un dépôt public se lit sans connexion. Se connecter lève la limite
          d’appels de GitHub (60 par heure sans jeton, 5 000 avec), ouvre les
          dépôts privés, et permet d’écrire.
        </li>
        <li v-if="onDesktop">
          Le jeton est rangé dans le coffre du système — le Trousseau sur macOS,
          le gestionnaire d’identifiants sur Windows. Si le coffre refuse de le
          garder, il ne vaut que pour la session, et un bandeau le dit.
        </li>
        <template v-else-if="sealedTokens">
          <li>
            Vos jetons sont protégés par une passkey : ce navigateur n’en garde
            que le chiffré, que Touch ID ou le code de l’appareil ouvrent dans
            chaque onglet. Un programme qui lit le profil du navigateur ne les
            trouve pas. Une extension ou un script qui s’exécute sur cette page,
            onglet déverrouillé, pourrait toujours les lire.
          </li>
          <li>
            Si la passkey disparaît de votre trousseau, les jetons ne s’ouvrent
            plus : on les oublie, et on saisit de nouveau son jeton.
          </li>
        </template>
        <template v-else>
          <li>
            Le jeton est gardé dans ce navigateur, en clair : une extension ou
            un script qui s’exécute sur cette page pourrait le lire, comme un
            programme qui lit le profil du navigateur.
          </li>
          <li>
            Il peut être protégé par une passkey, à sa saisie : ce navigateur
            n’en garde alors que le chiffré, que Touch ID ou le code de
            l’appareil ouvrent dans chaque onglet. Un script sur la page, onglet
            déverrouillé, le lirait toujours.
          </li>
          <li>
            Un projet peut exiger cette protection : sans passkey, le jeton ne
            vaut alors que pour l’onglet.
          </li>
        </template>
        <li v-if="!onDesktop">
          Dans tous les cas, préférez un jeton limité aux dépôts utiles, en
          lecture seule si vous ne faites que lire, et qui expire.
        </li>
        <li>
          Il n’est envoyé qu’à <code>api.github.com</code>. Seuls ses quatre
          derniers caractères s’affichent.
        </li>
        <li>
          Un jeton peut valoir pour une organisation ou pour un seul dépôt : le
          plus précis l’emporte, puis le jeton général.
        </li>
        <li>
          Quand un projet le prévoit, on peut aussi entrer par son identité
          vérifiée. L’accès obtenu ne vit qu’en mémoire, pour une heure environ,
          et prend fin au rechargement.
        </li>
        <li>
          Se déconnecter efface les jetons, l’accès temporaire, et les contenus
          privés gardés en cache.
        </li>
        <li v-for="phrase in help.jetons" :key="phrase">{{ phrase }}</li>
      </ul>
    </section>

    <section>
      <h2><UiIcon name="cached" />Mise en cache</h2>
      <ul>
        <li>
          Les fichiers lus sont gardés sur ce poste, sous leur empreinte : un
          fichier inchangé n’est jamais redemandé, quelle que soit la branche.
          Ce cache est une copie, jamais une source.
        </li>
        <li>
          Chaque ouverture relit l’arborescence du dépôt — un seul appel compté
          — pour savoir ce qui a changé. Les fichiers sont lus au commit, donc
          tels qu’ils sont à cet instant.
        </li>
        <li>
          Les fichiers publics passent par
          <code>raw.githubusercontent.com</code>, qui ne compte pas dans la
          limite d’appels. Ceux d’un dépôt privé passent par l’API, un appel par
          fichier manquant.
        </li>
        <li>
          Quand GitHub ne répond pas — hors ligne, limite atteinte, panne —, le
          dernier état lu s’affiche, avec sa date et la cause. Rien ne
          s’enregistre tant qu’il n’a pas été relu.
        </li>
        <li>
          Ce qu’aucune branche ne cite plus est retiré. Les contenus privés
          durent autant que l’accès qui les a lus ; ceux qu’une identité
          vérifiée a lus ne sont pas gardés du tout.
        </li>
        <li v-if="!onDesktop && sealedTokens">
          Les contenus privés sont gardés sous la même clé que les jetons, et ne
          se lisent qu’une fois l’onglet déverrouillé.
        </li>
        <li>
          Les douze derniers projets ouverts sont retenus, pour l’accueil.
        </li>
        <li v-for="phrase in help.cache" :key="phrase">{{ phrase }}</li>
      </ul>
    </section>

    <section>
      <h2><UiIcon name="travel_explore" />Découverte des projets</h2>
      <ul>
        <li>
          L’accueil montre d’abord les projets déjà ouverts sur ce poste, sans
          attendre le réseau.
        </li>
        <li>
          Chaque jeton connu demande ensuite à GitHub les dépôts qu’il autorise
          (jusqu’à 500 par jeton). Chacun est éprouvé par la lecture de son
          <code>ssk-canon.yml</code> : un dépôt qui en a un porte un
          référentiel.
        </li>
        <li>
          Les projets qui portent un référentiel viennent en premier, par
          organisation. Les autres restent sous « Autres dépôts autorisés ».
        </li>
        <li>
          Sans jeton, rien n’est découvert : on ouvre un projet par son adresse,
          et il est retenu ensuite.
        </li>
      </ul>
    </section>

    <section>
      <h2><UiIcon name="lan" />Communications extérieures</h2>
      <ul>
        <li>
          <code>api.github.com</code> — lecture, écriture et découverte, avec
          votre jeton.
        </li>
        <li>
          <code>raw.githubusercontent.com</code> — les fichiers publics, sans
          jeton.
        </li>
        <li>
          <code>avatars.githubusercontent.com</code> — l’avatar des
          organisations, sans jeton.
        </li>
        <li>
          L’émetteur d’identité et le service d’échange qu’un projet déclare —
          seulement pour ce projet, et seulement si l’on entre par son identité
          vérifiée.
        </li>
        <li v-for="phrase in help.communications" :key="phrase">
          {{ phrase }}
        </li>
        <li>
          Aucune mesure d’audience, aucun rapport d’erreur. Les polices sont
          embarquées. Un lien externe s’ouvre dans votre navigateur.
        </li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
.aide-page {
  max-width: 760px;
}

h1 {
  margin: 0 0 6px;
  font-size: 26px;
  font-weight: 600;
}

.sous-titre {
  margin: 0 0 8px;
  line-height: 1.55;
  color: var(--mat-sys-on-surface-variant);
}

section {
  margin-top: 26px;
}

h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 10px;
  font-size: 17px;
  font-weight: 600;

  .material-symbols-outlined {
    font-size: 20px;
    width: 20px;
    height: 20px;
    color: var(--mat-sys-on-surface-variant);
  }
}

ul {
  margin: 0;
  padding-left: 1.3em;
  line-height: 1.6;
}

li + li {
  margin-top: 0.4em;
}

code {
  font-family: var(--pc-mono);
  font-size: 0.87em;
  background: var(--mat-sys-surface-container);
  padding: 1px 5px;
  border-radius: 3px;
}
</style>
