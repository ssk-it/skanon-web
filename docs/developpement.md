# Développement

## L'arborescence

```
src/                    L'interface, commune à la version web et à l'application de bureau (INV-9)
  main.ts               La racine de composition de la version web : ses adaptateurs, ses extensions
  demarrage.ts          Le démarrage, que chaque racine appelle : plateforme, extensions, jetons, routeur
  extension/            Le contrat des extensions, et leur composition (ADR-extensions-commerciales)
  web/                  L'extension de la version web : son hébergeur, son service worker, sa licence
  plateforme/           Les ports vers le système, et l'adaptateur du navigateur
  routeur.ts            Les routes, toutes sous /:owner/:repo/
  App.vue               La coquille : la barre du haut, les bandeaux, l'hôte des dialogues
  styles.css            Les jetons de style : les couleurs de Material 3 (--mat-sys-*), celles du produit (--pc-*)
  core/                 Le cœur de l'interface, sans composant
    signaux.ts          signal(), computed(), effect() sur la réactivité de Vue
    injection.ts        inject() et provide() : une instance par service
    http/               Le client HTTP sur fetch, et sa doublure de test
  ui/                   Le kit qui tient lieu d'Angular Material : boutons, champs, menus, dialogues
  features/             Les vues, une par dossier de domaine
    shared/             Ce que plusieurs vues partagent : l'état de chargement, les dialogues, le Markdown
outils/pwa/             Ce que seule la version web publie : manifeste, icônes, service worker, relève de SSK Canon
outils/bascule/         L'épreuve de la relève de SSK Canon par Skanon
public/                 Le logo, copié tel quel dans le livrable
```

## Le vocabulaire

Celui de SSK Canon, que l'interface reprend tel quel : **référentiel**, **domaine**, **fonctionnalité**, **règle de gestion** (`RG-…`), **cadrage** (`2026-047`), **décision**, **impact** (`cree`, `modifie`, `abroge`, `touche`), **statut**. Un **dépôt de projet** porte le référentiel d'un produit ; un **dépôt de code** le réalise. La **cible** est le système où tourne l'interface : `web` ici, `bureau` dans l'application de bureau, qui construit ce même code depuis son dépôt (voir plus bas).

## Le paquet

Ce dépôt est aussi un paquet, `@ssk-it/skanon`, que l'application de bureau consomme depuis un dépôt privé (ADR-extensions-commerciales). Elle l'épingle à un commit :

```json
"@ssk-it/skanon": "github:ssk-it/skanon-web#<commit>"
```

Le paquet sert ses sources telles quelles, `.ts` et `.vue` : celui qui le consomme les compile avec les siennes. Ce qu'il peut importer est son API, et rien d'autre : le champ `exports` de `package.json` — le contrat d'extension, les ports, l'injection, le kit d'interface, quelques services et doublures de test. Vue, `vue-router` et `@vue/reactivity` sont des dépendances paires : une seule instance de Vue, la sienne. `@ssk-it/canon-check` aussi, que le consommateur déclare et épingle lui-même : pnpm refuse une dépendance tirée de Git sous le premier niveau (`blockExoticSubdeps`). Le consommateur définit enfin `VITE_CIBLE` et `VITE_VERSION` dans sa configuration de Vite, et leurs types (`src/env.d.ts`). Élargir `exports` ou en changer une entrée est une décision ([pratiques.md](pratiques.md#ce-qui-tient-au-livrable)).

## Lancer

```bash
pnpm dev:web
```

L'interface seule, sur le port 1430, avec l'adaptateur du navigateur.

## Les gestes courants

Un seul fichier de test, puis le mode veille :

```bash
pnpm vitest run --project jsdom src/core/signaux.test.ts
pnpm test:watch src/core/http
```

Les tests du navigateur sans tête (WebKit de Playwright) :

```bash
pnpm test:navigateur
```

Un service du cœur se demande par `inject`, et se substitue dans un test par `provide` :

```ts
import { inject } from "../injection";
import { HttpClient } from "../http/http";

export class GithubClient {
  private readonly http = inject(HttpClient);
}
```

```ts
const http = provideHttpTesting();
const attente = inject(GithubClient).loadArbre(depot);
http
  .expectOne((r) => r.url.includes("/git/trees/"))
  .flush({ sha: "abc", tree: [] });
await attente;
```

Une requête n'est enregistrée qu'au moment où le client l'émet : si l'appelant attend une promesse avant — une file, un cache consulté d'abord —, `await settle()` laisse passer les microtâches.

### Ajouter une vue

Un composant `src/features/<domaine>/<Nom>Page.vue`, une route dans `src/routeur.ts` sous `/:owner/:repo/`, chargée paresseusement (`component: () => import(…)`). Le titre de la page porte le projet et l'élément consulté.

La vue se bâtit avec le kit de `src/ui/` — `UiBouton`, `UiIcone`, `UiChamp`, `UiSelect`, `UiCaseACocher`, `UiAutocompletion`, `UiMenu`, `UiSpinner`, `UiBarreProgression` —, dont chaque composant dit son usage en tête de fichier. Les couleurs sont les variables `--mat-sys-*` et `--pc-*` de `src/styles.css`, sous les noms qu'elles avaient dans SSK Canon. Un lien vers une adresse extérieure passe par `LienExterne` : un `target="_blank"` ne s'ouvre pas dans une vue web intégrée, comme celle de l'application de bureau. Le chargement, l'erreur et le dépôt vide sont l'affaire d'`EtatVue`, de `src/features/shared/`.

### Ouvrir un dialogue

Un dialogue est un composant qui reçoit `data` en prop, émet `fermer(résultat)`, et prend sa structure — titre, contenu qui défile, actions — d'`UiDialogue`. `DialogService` l'ouvre et rend une promesse : le résultat émis, ou `undefined` si le dialogue est fermé par Échap ou par un clic sur le fond. `UiDialogHote`, monté une fois dans `App.vue`, l'affiche et y piège le focus.

```vue
<script setup lang="ts">
const props = defineProps<{ data: { nom: string } }>();
const emit = defineEmits<{ fermer: [confirme?: boolean] }>();
</script>

<template>
  <UiDialogue :titre="`Supprimer ${props.data.nom} ?`">
    <p>Ce qui sera perdu.</p>
    <template #actions>
      <UiBouton @click="emit('fermer', false)">Annuler</UiBouton>
      <UiBouton variante="filled" @click="emit('fermer', true)"
        >Supprimer</UiBouton
      >
    </template>
  </UiDialogue>
</template>
```

```ts
const confirme = await inject(DialogService).open<boolean>(SupprimerDialog, {
  data: { nom: "RG-limite" },
});
```

## La version web installable

La version web (`pnpm build:web`) est une application installable, qui prend la place de SSK Canon à la même adresse chez ceux qui l'avaient installée depuis Chrome. Le greffon `outils/pwa/pwa.ts`, branché sur le build de `vite.config.ts`, y ajoute :

- **le manifeste** `/manifest.webmanifest` et ses icônes, repris de SSK Canon sous le nom de Skanon. L'adresse, le `scope`, le `start_url` et le `protocol_handlers` (`web+canon` → `/ouvrir?lien=%s`) ne changent pas : c'est à eux que Chrome reconnaît l'application installée, et il la met à jour au lieu de la perdre. Les balises `manifest`, `apple-touch-icon` et `theme-color` s'ajoutent à `index.html` ;
- **le service worker** `/sw.js` (`outils/pwa/sw.js`). Il précharge à l'installation tout ce que publie la version — scripts, feuilles, polices, `index.html`, icônes —, sert ensuite chaque fichier de son cache, et `index.html` pour toute navigation de l'application. Le greffon y inscrit la liste des fichiers et l'empreinte de la version : une nouvelle version change le script, et le navigateur l'installe à côté de l'ancienne, qui sert la page jusqu'à ce que le rédacteur recharge depuis le bandeau (RG-nouvelle-version-proposee) ;
- **la relève** `/ngsw-worker.js` (`outils/pwa/ngsw-worker.js`). Les navigateurs où SSK Canon est installée ont une inscription dont le script porte ce nom, et le revérifient à chaque navigation : ils installent la relève, qui efface les caches d'Angular (`ngsw:*`) et désinscrit l'inscription. La navigation suivante reçoit Skanon, qui inscrit `/sw.js`.

Le service worker n'est inscrit que par la version web construite (`src/plateforme/web.ts`) : ni le serveur de développement, ni les tests, ni l'application de bureau. Les versions s'annoncent par le port `AnnonceurDeVersion` de `src/plateforme/ports.ts`, que `VersionService` (`src/core/ui/version.service.ts`) écoute et que le bandeau de `App.vue` affiche ; l'application de bureau fournit son propre annonceur.

### Éprouver la relève

```bash
pnpm build:web
node outils/bascule/eprouver-releve.mjs
```

Dans Chromium sans tête, sans fenêtre : l'épreuve sert le build de SSK Canon, attend que son service worker contrôle la page et ait rempli ses caches, puis sert à la même origine `dist-web/` déposé par-dessus l'ancien build, sans `ngsw.json` — ce que fait le déploiement. Elle recharge jusqu'à trois fois, et vérifie que Skanon s'affiche, que le service worker de Skanon contrôle la page, que les caches d'Angular ont disparu, et que la page reste servie hors ligne, une vue jamais ouverte comprise. Le build de SSK Canon est attendu dans `../ssk-canon-pwa-mesures/app/dist/app/browser/`, ou sous `--ancienne <dossier>`.

`--sans-releve` (sans le `/ngsw-worker.js` de Skanon) et `--garder-ngsw-json` (l'ancien `ngsw.json` toujours servi) retirent chacun l'un des deux mécanismes qui délogent le service worker d'Angular : chacun seul suffit, les deux ensemble font échouer l'épreuve — c'est ainsi qu'on vérifie qu'elle voit le défaut.

## Les pièges d'outillage

- **Sous le magasin global de pnpm**, `node_modules` mène hors du dépôt, et le serveur de Vite refuse d'y servir un fichier : une police manque sans erreur visible. `server.fs.allow` de `vite.config.ts` l'ouvre.
- **Les images en `data:`** sont refusées par une politique de sécurité du contenu `default-src 'self'`, celle de l'application de bureau : `assetsInlineLimit: 0` les émet toujours en fichier.
- **Le service worker d'Angular ne remplit ses caches qu'à sa première requête**, non à son installation : une épreuve qui bascule l'hébergement sitôt qu'il contrôle la page le voit chercher `index.html` sur le nouvel hébergement, et croit à une relève qui n'a pas eu lieu. `eprouver-releve.mjs` attend que `index.html` soit dans son cache.
- **La relève prend deux chargements.** Le premier est encore servi par le service worker d'Angular, depuis son cache ; c'est après lui que le navigateur revérifie le script inscrit et installe la relève. Un rédacteur qui avait l'application ouverte voit donc Skanon au deuxième chargement.

## Les contrôles

`.github/workflows/controles.yml`, à chaque demande de fusion, sur les runners de GitHub : le dépôt est public, et le code d'une demande venue d'un fork ne doit tourner sur aucune machine de ssk-it.

## Ce qui doit être vert avant une demande de fusion

Dans cet ordre, le plus rapide d'abord :

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
pnpm test:navigateur && pnpm build:web
```

Corriger localement par `pnpm lint --fix`, puis `pnpm format` — lint puis format, sans quoi le formateur refuse ce que le lint a réécrit.
