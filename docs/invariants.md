# Invariants

Les contraintes que Skanon ne transgresse pas. Elles découlent de contraintes vérifiées — de la plateforme GitHub, du stockage, du système —, pas de préférences. Les citer par leur numéro, en revue, en message de commit, en commentaire.

**En changer** se fait par une décision explicite : la proposer dans une demande de fusion qui modifie ce fichier, et, si elle touche au produit, par un cadrage dans [ssk-it/ssk-canon](https://github.com/ssk-it/ssk-canon). Jamais par contournement. Un invariant levé garde son numéro, marqué comme levé, avec la date et la raison.

`INV-1` à `INV-6` viennent de SSK Canon, dont Skanon hérite le format et la couche d'accès ; ils sont repris ici parce que leur raison n'a pas changé de plateforme.

## INV-1 — Un chemin de fichier ne se renomme jamais

Aucune API GitHub ne suit les renommages : un fichier déplacé dans un dépôt de projet perd tout son historique visible depuis l'application. Les règles vivent à plat dans `rules/`, les fonctionnalités à plat dans `features/`, et les dossiers de cadrage portent l'identifiant seul. Sans cette règle, le défaut est silencieux : la règle s'affiche, mais sa chronologie commence au renommage.

## INV-2 — L'histoire ne se stocke pas, elle se dérive

Aucun champ `historique:` dans un frontmatter. Git porte déjà l'histoire ; la dupliquer garantit sa divergence. Les champs `cree_par` et `modifie_par` sont un index de performance écrit par l'automatisation, jamais une source de vérité, jamais écrits par l'application.

## INV-3 — Déposer une pièce jointe avant de commiter ce qui la cite

Une pièce jointe est stockée sous l'empreinte SHA-256 de son contenu, puis seulement le Markdown qui la référence est commité. L'ordre inverse produit des pointeurs morts, que rien ne signale jusqu'à ce qu'un lecteur clique.

## INV-4 — Un objet stocké n'est ni modifié ni supprimé à la légère

L'adressage par contenu rend la cohérence entre Git et le stockage automatique, à condition que les objets soient immuables. Plusieurs cadrages partagent le même objet : le comptage de références pour la collecte est global au dépôt, jamais local à un cadrage.

## INV-5 — Le composant d'échange est le seul endroit où les autorisations s'appliquent

L'application GitHub a les mêmes droits pour tout le monde ; si le composant d'échange se contentait de relayer, tout porteur d'une identité écrirait dans n'importe quel projet. Un binaire distribué n'y change rien : la clé privée de l'application GitHub ne vit jamais sur le poste.

## INV-6 — Les appels à GitHub sont régulés par le client

Les limites secondaires de l'API — cent requêtes concurrentes, cinq cents écritures par heure — sont partagées par tous les utilisateurs d'une installation, et un composant sans état ne peut pas réguler. Deux files bornées dans la couche d'accès : six requêtes concurrentes vers l'API, vingt-quatre vers les contenus bruts, qui n'ont pas de quota.

## INV-7 — La lecture du format s'écrit une seule fois, dans `@ssk-it/canon-check`

Le découpage du frontmatter, les règles du format et leur vérification vivent dans la bibliothèque commune à l'application et à l'automatisation (RG-parseur-partage). Le cœur natif de l'application de bureau ne lit ni ne vérifie le format : il garde des secrets et parle au système. Sans cette règle, deux implémentations divergent, et un dépôt que l'application accepte est refusé par la vérification — ou l'inverse —, sans que ni l'une ni l'autre ne soit en faute.

## INV-8 — Un jeton ne quitte le poste que vers GitHub

Un jeton d'accès ne transite par aucun lien, aucune adresse, aucun journal, et ne s'affiche que par ses derniers caractères. Dans l'application de bureau, il ne s'écrit que dans le coffre que protège le système, jamais en clair sur le disque ; dans la version web, il vit dans le stockage local du navigateur — en clair, ou scellé par une passkey dont la clé ne quitte jamais le trousseau de l'utilisateur —, et l'interface dit lequel. Un projet qui exige la passkey ne voit jamais son jeton gardé en clair : sans elle, il ne vaut que pour l'onglet (RG-protection-du-jeton-par-projet, cadrage 2026-055).

## INV-9 — Un seul code d'interface pour les deux livrables

L'application de bureau et la version web sont construites depuis les mêmes sources. Ce qui diffère d'un système à l'autre passe par les ports de `src/plateforme/ports.ts` ; ce qui tient au livrable, par les extensions de `src/extension/`. Chaque livrable a sa racine de composition — `src/main.ts` pour le web, celle de l'application de bureau dans son dépôt —, seule à choisir ses adaptateurs et ses extensions. Sans cette règle, une vue testée dans l'une casse dans l'autre, et la comparaison des deux livrables ne mesure plus le même produit.

## INV-10 — Le code commun ne nomme aucune extension

L'interface commune déclare des points d'extension et rend ce qu'on y met ; elle ne sait pas qui les remplit. Aucun fichier de ce dépôt n'importe le code de l'application de bureau, ni ne nomme ce qu'elle vend — son service de mise à jour, sa licence, ses causes —, et aucune vue ne teste la présence d'une extension. Un point se nomme d'après l'endroit de l'interface, jamais d'après une fonctionnalité. Sans cette règle, le dépôt public porterait la logique commerciale qu'il n'a pas à porter, et chaque évolution de l'offre payante demanderait une fusion publique (ADR-extensions-commerciales). `src/couches.test.ts` la fait respecter.
