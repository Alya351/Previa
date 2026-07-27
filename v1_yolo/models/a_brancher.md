# Modèles en attente d'intégration

Rien en attente pour le moment.

- `ppe-yolov8s.pt` et `clothing-yolov8s-seg.pt` → branchés dans `MODELS_INFO`
  (rôles "L'Inspecteur" et "Le Couturier").
- `gender-yolov8n-cls.pt` → branché dans `person_memory.py` (pas un rôle
  `MODELS_INFO`, c'est un classifieur appliqué au crop de chaque personne).

Voir `README.md` pour le détail de chacun, et la section "La fusion
personne" pour comment ils sont combinés (identité, signalement, genre,
présence prolongée).

Le prochain candidat est le modèle cagoule/cache-nez, à entraîner via
`../../finetuning/finetuning_balaclava.ipynb` (voir `../docs/GUIDE_FINETUNING.md`).
Une fois entraîné et vérifié, il viendra ici avant d'être ajouté à la chaîne.
