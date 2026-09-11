# Modèles — téléchargement

Ce dossier (`migration/models/`) contient tous les modèles IA utilisés par le
backend (YOLO, InsightFace, SegFormer, OSNet, reconnaissance de genre...) —
environ **1,8 Go**, volontairement **non suivi par git** (voir `.gitignore` à
la racine du projet : `*.pt`, `*.onnx`, et ces dossiers de modèles sont trop
lourds pour un dépôt git de toute façon).

Pour partager le projet à quelqu'un (ou le redéployer ailleurs), ces modèles
doivent être récupérés séparément et placés ici, avant de lancer le backend.

## Installation automatique (recommandé)

Depuis `migration/` :

```
python3 telecharger_modeles.py
```

Télécharge `models.zip` depuis Google Drive et l'extrait directement au bon
endroit. Sans effet si les modèles sont déjà présents (relancer plusieurs
fois ne fait rien de mal).

## Lien de téléchargement (installation manuelle)

```
https://drive.google.com/file/d/16bxJLlp2b2Prjsw9s_04Rr-FuZXAfIeP/view?usp=sharing
```

1. Télécharger `models.zip` depuis ce lien
2. Extraire son contenu directement dans `migration/models/` (ce dossier),
   de façon à obtenir `migration/models/insightface/`,
   `migration/models/yolo11x-pose.pt`, etc. — pas un sous-dossier
   `migration/models/models/`
3. Vérifier que la structure correspond à celle attendue par le backend
   (`MODELS_DIR` dans `on_voit_qui.py`/`on_voit_quoi.py` pointe vers ce
   dossier)
