# Pour l'agent

Skanon : l'interface Vue 3 de SSK Canon et sa version web statique, en source disponible (FSL-1.1-ALv2). Ce dépôt est aussi le paquet `@ssk-it/skanon`, que l'application de bureau consomme depuis un dépôt privé : rien de ce qui la concerne en propre n'y entre ([docs/pratiques.md](docs/pratiques.md#ce-qui-tient-au-livrable--les-extensions)).

## Que lire, et quand

| Avant de…                                                     | Lire                                                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Cadrer ou développer une évolution fonctionnelle              | Le référentiel [ssk-it/ssk-canon](https://github.com/ssk-it/ssk-canon), par le skill `consulter-referentiel` |
| Toucher au code                                               | [docs/developpement.md](docs/developpement.md)                                                               |
| Toucher à la lecture du format, aux jetons, aux appels GitHub | [docs/invariants.md](docs/invariants.md) — **obligatoire**                                                   |
| Parler au système, créer un module ou un test                 | [docs/pratiques.md](docs/pratiques.md)                                                                       |
| Écrire une fonction                                           | [docs/clean-code.md](docs/clean-code.md)                                                                     |
| Nommer quoi que ce soit                                       | [docs/conventions.md](docs/conventions.md)                                                                   |

L'index complet : [docs/README.md](docs/README.md).

## Comportement attendu

**Vérifier plutôt que supposer.** Ne jamais annoncer qu'une chose fonctionne sans l'avoir exécutée.

**Test rouge d'abord.** Un test qui n'a jamais échoué n'a rien prouvé.

**Porter sans changer.** Un service ou une vue portés depuis `ssk-it/ssk-canon-pwa` gardent leur comportement et leurs tests ; un défaut découvert se corrige à part, et se signale.

**Ne pas contourner un invariant.** Les citer par leur numéro (`INV-1`…`INV-10`) ; s'il gêne, le dire.

**Ne rien lancer qui ouvre une fenêtre pendant le travail** : les tests du navigateur tournent sans tête. Un navigateur visible, en fin de chantier, avec l'accord de l'utilisateur, ou à sa demande.

**Le dépôt est public.** Aucun nom de client, aucun chemin de machine, aucun secret, ni dans le code, ni dans les tests, ni dans un message de commit : des noms fictifs dans les tests.

**pnpm, jamais npm.**

**Ne pas committer sur `main`.** Une copie liée par sujet, une demande de fusion.

**Cadrer la boucle qui se termine.** Quand une phase aboutit ou qu'un choix technique est tranché, invoquer le skill `cadrer-la-boucle` : il demande si les décisions prises doivent être reportées dans `ssk-it/ssk-canon`. Un outil de cadrage qui ne cadre pas ses propres décisions ne tient pas sa promesse.

**Tenir la documentation à jour** dans le même changement que le code : une commande citée dans `docs/` existe dans `package.json`, un renvoi pointe vers un fichier réel.

**Échanges en français**, vocabulaire du domaine en français, mécanique en anglais ([docs/conventions.md](docs/conventions.md)).
