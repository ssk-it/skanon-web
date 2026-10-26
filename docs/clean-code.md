# Code propre

Ce document gouverne l'intérieur d'une unité. Les frontières entre couches vivent dans [pratiques.md](pratiques.md#les-couches), le nommage dans [conventions.md](conventions.md).

## Lisibilité

**Un nom dit l'intention, et porte son unité.** `delaiSecondes`, `quotaRestant` ; jamais `tmp`, `data2`. Une valeur littérale qui décide de quelque chose se nomme : les deux files de `GithubClient` ne s'écrivent pas `new RateLimiter(6)` sans le commentaire qui dit pourquoi six.

**Un effet de bord se voit depuis l'appel.** Le verbe le dit : `load` lit, `save` écrit, `find` rend `null`, `get` lève ([conventions.md](conventions.md#méthodes-et-fonctions)). Un `findCadrage` qui créerait le dossier absent est le défaut le plus coûteux, parce que personne ne relit le corps d'un accesseur.

**Pas de drapeau booléen.** `ouvrir(true)` ne dit rien sur le site d'appel. Deux fonctions, ou une valeur nommée — `CoffreDeJetons` a trois méthodes plutôt qu'une `ecrire(jetons, effacer?)`.

**Sortir tôt plutôt qu'imbriquer.** `CoffreDuSysteme.saveJetons` traite le cas vide en tête, puis écrit.

## Conception

**Une seule raison de changer.** `plateforme/web.ts` change quand le navigateur change ; `core/` quand le produit change. Un service qui ferait les deux — lire un dépôt et ranger un jeton dans le stockage local — se découpe.

**Dépendre d'une abstraction.** Un service demande `inject(HttpClient)`, jamais `fetch` : c'est ce qui permet à un test de répondre par la doublure, et à la cible de changer de transport sans réécrire le service.

**Ne pas généraliser avant le troisième cas.** Hors de la frontière avec le système, où le second cas — la doublure — existe dès le premier jour.

## Refactoring

**Le changement de forme ne se mêle jamais au changement de comportement.** Deux commits : d'abord la forme, tests inchangés ; puis le comportement. Le signe qu'on a mélangé : il a fallu changer un test dans un commit qui ne prétendait rien changer.

**Le portage depuis SSK Canon est un changement de forme.** Un service porté garde ses tests, traduits sans en changer les attentes ; un défaut découvert en chemin se corrige dans un commit à part, qui le dit.

**La dette se nomme** par un commentaire `// Dette :` qui dit la raison et ce qui la lèvera.

## Ce que l'outillage fait respecter

La configuration fait foi : `eslint.config.js` et `tsconfig.json`. Tout avertissement est bloquant en CI.

| Règle                                                        | Outil      | Pourquoi                                                 |
| ------------------------------------------------------------ | ---------- | -------------------------------------------------------- |
| Jeu `strict` de typescript-eslint, `flat/recommended` de Vue | ESLint     | Les pièges connus du langage et des gabarits             |
| `no-console`                                                 | ESLint     | Une trace oubliée finit dans la console de l'utilisateur |
| `strict`, `noUnusedLocals`, `noUnusedParameters`             | TypeScript | Le reste d'un chantier interrompu                        |

Les seuils de complexité de l'interface — `complexity`, `max-depth`, `max-params` — se poseront sur le code porté, juste au-dessus de ce qu'il fait déjà, puis se resserreront. Aucun n'est configuré aujourd'hui.

Toute exception porte sa raison sur la ligne qui la déclare.
