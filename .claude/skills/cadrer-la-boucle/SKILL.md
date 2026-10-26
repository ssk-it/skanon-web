---
name: cadrer-la-boucle
description: À la fin d'une boucle de travail sur Skanon — un lot de décisions prises, une phase terminée, un choix technique tranché — demander à l'utilisateur si cette boucle doit être reportée dans le dépôt de cadrage ssk-it/ssk-canon. Se déclenche quand du travail vient d'aboutir et que des décisions ont été prises, pas au milieu d'une tâche.
---

# Cadrer la boucle qui vient de se terminer

Skanon est un outil de cadrage : `ssk-it/ssk-canon` est son propre
référentiel, décrit dans son propre format. Chaque décision structurante prise
pendant le développement doit y être consignée comme un cadrage — sinon l'outil
ne tient pas la promesse qu'il fait à ses utilisateurs.

C'est facile à oublier : le travail est fait, les tests passent, on passe à la
suite. Cette skill existe pour que la question soit posée.

## Quand se déclencher

À la **fin d'une boucle de travail**, c'est-à-dire quand :

- une phase de la feuille de route est terminée ;
- un choix technique a été tranché, surtout s'il repose sur une mesure ou un
  fait vérifié ;
- une hypothèse s'est révélée fausse et a changé la conception ;
- une option a été explicitement écartée avec un motif.

**Ne pas se déclencher** au milieu d'une tâche, ni pour une correction de bug
sans conséquence sur le comportement attendu, ni pour un travail de pure forme.

## Ce qu'il faut faire

1. **Récapituler les décisions** prises pendant la boucle, en une ligne chacune.
   Distinguer ce qui relève d'une décision — un choix entre options, avec un
   motif — de ce qui relève de l'exécution.

2. **Demander à l'utilisateur** si cette boucle doit être reportée dans
   `ssk-it/ssk-canon`, en proposant une forme concrète :
   - un **nouveau cadrage** si la boucle a produit un ensemble cohérent de
     décisions ;
   - des **décisions ajoutées à un cadrage existant** si elles complètent un
     sujet déjà ouvert ;
   - des **règles modifiées** si le comportement attendu a changé ;
   - **rien**, si la boucle n'a produit que de l'exécution.

   Poser la question, ne pas décider seul : c'est l'utilisateur qui sait si un
   choix mérite d'être consigné pour la durée.

   Pour proposer la bonne forme, appliquer d'abord le skill
   `consulter-referentiel`, en lui passant le récapitulatif : un cadrage encore
   en cours ou une règle existante sur le même sujet appelle un complément ou
   une modification, pas un nouveau cadrage qui les doublerait.

3. **Si la réponse est oui**, invoquer la skill `cadrage-canon`, qui écrit
   dans `ssk-it/ssk-canon` en préparant une copie liée — ne jamais écrire à la
   main dans un clone. Le format qu'elle applique :
   - identifiant `<année>-<séquence sur 3 chiffres>`, jamais réutilisé ;
   - objectif, parcours utilisateur, impacts déclarés ;
   - une section `## Énoncés` portant le texte de chaque règle créée ou
     modifiée, sous un titre de niveau 3 nommant la règle ;
   - les décisions dans `decisions/`, avec **les options écartées et leur
     motif** — c'est ce qui a le plus de valeur six mois plus tard ;
   - le statut correspondant à l'état réel du travail.

4. **Vérifier l'intégrité** avant de conclure, depuis la copie liée que
   `cadrage-canon` a préparée :

   ```bash
   node actions/src/check.mjs <copie-liee>
   ```

5. **Reporter aussi dans `docs/decisions.md`** si la décision touche
   l'architecture du produit lui-même. Les deux ne font pas doublon :
   `docs/` s'adresse à un développeur qui reprend le code, `ssk-it/ssk-canon`
   décrit le comportement du produit.

   `example-repo/` n'est pas une cible : c'est un jeu de test, pas le
   référentiel de Skanon.

## Les pièges du format

- Un impact `cree` ou `modifie` **doit** avoir son énoncé, sinon la
  vérification échoue.
- Un cadrage porte l'énoncé **au moment de sa livraison**, pas l'état courant :
  ne pas réécrire les énoncés des cadrages anciens.
- Les champs `cree_par` et `modifie_par` sont dérivés des impacts des cadrages
  livrés. La vérification les recalcule : les renseigner à la main de façon
  incohérente fait échouer le contrôle.
- Une règle créée par un cadrage non livré n'existe pas encore dans `rules/` —
  c'est normal et toléré.
