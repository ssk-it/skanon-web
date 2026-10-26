# Pratiques

## Les couches

| Couche                            | Peut importer                                                                | Ne peut pas importer                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/features/` (vues), `App.vue` | `core/`, `extension/`, `plateforme/ports.ts`, `plateforme/jeton.ts`, Vue     | une racine de composition, `plateforme/web*.ts`                                        |
| `src/core/`                       | `core/`, `plateforme/ports.ts`, `plateforme/jeton.ts`, `@ssk-it/canon-check` | Vue (hors `@vue/reactivity` dans `signaux.ts`), une racine de composition, `features/` |
| `src/extension/`                  | `core/injection.ts`, Vue                                                     | tout le reste                                                                          |
| `src/plateforme/web*.ts`          | `plateforme/ports.ts`, le navigateur                                         | `core/`, `features/`                                                                   |
| `src/web/`                        | `extension/`                                                                 | tout le reste                                                                          |
| `src/main.ts`                     | les adaptateurs du navigateur, `web/`, `demarrage.ts`                        | rien d'autre                                                                           |

`plateforme/jeton.ts` porte le jeton `PLATEFORME`, que le cœur et les vues demandent ; sa valeur par défaut, celle des tests, est la plateforme du navigateur. `src/couches.test.ts` lit les imports des sources et fait respecter le tableau : le cœur, les vues et le kit ne choisissent aucun adaptateur ; aucun fichier n'importe le cœur natif de l'application de bureau, ni ne nomme ce qu'elle vend.

Le sens des dépendances va toujours vers le cœur : une vue lit un service, un service lit un port, un adaptateur réalise un port.

## Ce qui tient au livrable : les extensions

Skanon se publie en deux dépôts (ADR-extensions-commerciales) : celui-ci, l'interface commune et la version web, en source disponible ; et l'application de bureau, privée, qui consomme ce dépôt comme un paquet épinglé ([developpement.md](developpement.md#le-paquet)). Ce dépôt ne sait pas ce qu'elle y ajoute.

**Système ou livrable.** Ce qui diffère d'un système à l'autre — où vivent les jetons, comment arrive un lien d'ouverture, ce que fait une relance — passe par les ports (ci-dessous), et ses textes restent dans l'interface commune. Ce qui tient au livrable — qui l'héberge, d'où viennent ses versions, sous quelle licence elles s'obtiennent, ce qu'il présente à l'éditeur, ce qu'il vend — passe par une extension de sa racine : `src/web/extension.ts` pour la version web ; l'application de bureau apporte les siennes depuis son dépôt.

**Une extension remplit des points d'extension** que déclare `src/extension/extension.ts`, et `composer()` (`src/extension/composer.ts`) les rassemble ; la coquille et les pages lisent le résultat sous `COMPOSITION`, sans savoir ce qu'elles rendent. Les points existants : `actionsDeBarre`, `bandeaux` (un texte, que la coquille met dans son style), `aide` par section, `mentions` (hébergeur, données, propriété). Une composition fausse — deux identifiants égaux, deux hébergeurs — lève dans `composer()`, donc au premier test.

**Ajouter un point d'extension**, quand une extension en a besoin et pas avant :

1. le nommer d'après l'endroit de l'interface, jamais d'après la fonctionnalité qui l'emploie — `sectionsDeReglages`, pas `reglagesDeLExport` ;
2. le déclarer dans `extension.ts`, le rassembler dans `composer()`, avec son test ;
3. l'éprouver dans le test de la vue qui le rend, par une extension factice ;
4. seulement ensuite, le remplir dans l'extension qui en avait besoin.

**Ce qu'un autre livrable emploie de ce dépôt est une API**, déclarée dans le champ `exports` de `package.json`. Y ajouter une entrée, c'est élargir le contrat du paquet : une décision, pas une commodité. En retirer une, ou changer ce qu'elle exporte, est une rupture, que le dépôt privé apprend par ses tests contre la dernière version publique avant de monter son épingle. Les services et adaptateurs propres à un livrable ne passent pas par la plateforme commune : sa racine les fournit sous leur propre jeton.

## La frontière avec le système

Skanon touche au système — un coffre de secrets, des liens d'ouverture, l'ouverture d'une adresse dans le navigateur — et vise trois systèmes. D’où une architecture hexagonale : ici les ports et l’adaptateur du navigateur, dans le dépôt de l’application de bureau son adaptateur et son cœur natif.

**Dans l'interface**, `src/plateforme/ports.ts` déclare ce que l'interface demande, dans le vocabulaire du produit : garder des jetons (`CoffreDeJetons`), ouvrir une adresse au dehors (`OuvreurExterne`), recevoir un lien d'ouverture (`RecepteurDeLiens`), apprendre qu'une version est prête ou pourquoi aucune ne l'est (`AnnonceurDeVersion`), sceller les jetons par une passkey (`ScellementDesJetons`, absent du bureau, dont le coffre du système suffit). `web.ts` les réalise avec le navigateur — le coffre et son scellement dans `web-coffre.ts` et `web-scellement.ts` — ; l'application de bureau, avec son cœur natif, dans son dépôt. La racine de composition de chaque livrable les choisit : `src/main.ts` pour le web.

**Le domaine ne nomme aucun système** : ni dans le code, ni dans les erreurs, ni dans les textes affichés. On dit « le coffre du système », jamais le nom du mécanisme d'un système.

## Les tests

**Test rouge d'abord.** Un test qui n'a jamais échoué n'a rien prouvé.

**Pendant le travail, des tests sans fenêtre :**

| Niveau     | Outil                                             | Ce qu'il éprouve                                          | Ce qu'il ne voit pas                |
| ---------- | ------------------------------------------------- | --------------------------------------------------------- | ----------------------------------- |
| Interface  | Vitest, jsdom (`*.test.ts`)                       | Services, stores, composants montés par `@vue/test-utils` | La mise en page                     |
| Navigateur | Vitest, WebKit sans tête (`*.navigateur.test.ts`) | Disposition, défilement, polices                          | Les barres de défilement classiques |

**Toute frontière externe** a trois cas au moins : la réponse attendue, l'absence, le refus — qui mènent à trois états distincts. La doublure HTTP (`src/core/http/http-testing.ts`) les produit : `flush(corps)`, `flush(null, { status: 404 })`, `error(…)` pour l'absence de réponse. La passkey se double par `FauxAuthentificateur` (`src/plateforme/authentificateur-testing.ts`), qui rend comme une vraie les mêmes 32 octets pour une passkey et un sel donnés ; le chiffrement, lui, est le vrai, celui de WebCrypto. L'appel à WebAuthn n'est éprouvé qu'en fin de chantier, dans un vrai navigateur.

## Les versions de l'application web

**Le service worker ne recharge jamais une page.** Une nouvelle version de Skanon s'installe à côté et attend ; seul le bouton du bandeau la fait servir, puis recharge (RG-nouvelle-version-proposee). La relève de SSK Canon ne recharge rien non plus : un onglet de l'ancienne application resté ouvert continue de lire ses fichiers sur l'hébergement, qui les garde à côté de ceux de Skanon. Un déploiement qui retirerait les fichiers de l'ancienne casserait ces onglets à la première vue qu'ils chargeraient.

**Une page n'est servie que par une version.** `index.html` vient du cache de la version qui sert la page, et ses scripts aussi : jamais un `index.html` du réseau avec des scripts du cache. Un fichier de `/assets/` que ni le cache ni l'hébergement ne sert signale la version perdue (RG-version-perdue-signalee) ; l'absence de réseau ne la signale pas.

## Les erreurs

Une erreur porte ce dont l'appelant a besoin pour décider sans lire le message : le statut HTTP (`HttpErrorResponse.status`, 0 pour l'absence de réponse), la nature de l'échec. **Un échec se distingue d'un vide** : un secret absent se lit `null`, un coffre indisponible est une erreur. Pas de `catch` muet, sauf là où l'échec est le comportement voulu, et le commentaire le dit. Un coffre qui refuse l'écriture laisse le secret valoir pour la session, mais l'adaptateur le dit (`EcritureCoffre`) et l'interface le montre : un jeton qui ne sera pas retrouvé au lancement suivant ne se découvre pas au lancement suivant.

**Une cause par refus** (RG-message-nomme-la-cause) : deux causes ne partagent aucun texte. Quand aucune version n'est annoncée, c'est le livrable qui formule la cause ; l'interface commune la reçoit opaque (`CauseSansVersion`), et ne formule que l'échec d'une installation, qu'elle constate elle-même.

## La mise en page

**Chaque bloc qui défile verticalement porte `scrollbar-gutter: stable`.** Avec des barres de défilement classiques — macOS avec une souris, Windows, Linux —, la barre n'apparaît que quand le contenu déborde, et prend sa largeur au contenu : tout ce que le bloc contient rétrécit, et sous un survol, le cycle apparition-disparition fait scintiller la vue (ssk-it/skift#73). Le défaut est invisible au trackpad comme dans un navigateur sans tête. Hors de la règle : un bloc qui ne défile qu'en largeur, et la page elle-même. `src/gouttiere.test.ts` la fait respecter : il lit les fichiers `.css`, les blocs `<style>` et les attributs `style="…"` des composants, et échoue sur tout bloc défilant sans gouttière — ceux du kit compris, dialogues, menus et listes de choix.

## Le cycle de livraison

Une copie liée par sujet, partie de `origin/main` ; une demande de fusion ; rebase sur `origin/main` et CI verte **sur la branche rebasée** avant la fusion. Un commit ne mêle pas un changement de forme et un changement de comportement ([clean-code.md](clean-code.md#refactoring)).
