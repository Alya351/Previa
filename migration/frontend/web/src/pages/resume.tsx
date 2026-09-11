import { Link } from 'react-router-dom';
import { API_BASE } from '../api.js';
import logoPrevia from '../assets/logo_previa_clean.png';
import { Icone } from '../lib/icones.jsx';
import './resume.css';

// Page "Liens & accès rapides" — remplace le bouton "Flux Caméra" qui
// traînait dans la barre latérale de admin.jsx : plutôt qu'un seul lien
// perdu là-bas, un point d'entrée unique qui regroupe TOUS les accès du
// système (pages du frontend + documentation de l'API backend), pour
// naviguer sans connaître les URL par cœur.
//
// Pas de garde de connexion ici (comme /camera) : sert aussi de point de
// départ avant même d'être connecté (ex. lien direct vers /login).
//
// Premier fichier .tsx du projet (le reste est en .jsx, sans tsconfig
// dédié) — Vite (via @vitejs/plugin-react, esbuild dessous) transpile le
// TSX à la volée sans étape de type-check séparée, donc ça marche tel
// quel ; pas de vraies annotations de type ajoutées ici pour rester
// cohérent avec le reste du code, qui n'en a pas.

type Lien = {
  titre: string;
  description: string;
  href: string;
  externe?: boolean;
  groupe: string;
};

const LIENS: Lien[] = [
  {
    groupe: 'Postes de travail',
    titre: 'Connexion',
    description: "Page de connexion (et création du tout premier compte admin, code secret requis).",
    href: '/login',
  },
  {
    groupe: 'Postes de travail',
    titre: 'Tableau de bord',
    description: 'Surveillance, caméras, alertes, analyses, événements, rapports, configuration — et Organisation pour le compte admin par défaut.',
    href: '/admin',
  },
  {
    groupe: 'Terrain',
    titre: 'Flux Caméra & Analyse IA',
    description: "Capture vidéo en direct depuis l'appareil (téléphone, poste fixe) et envoi à l'IA.",
    href: '/camera',
  },
  {
    groupe: 'Documentation API',
    titre: 'Swagger (/docs)',
    description: 'Documentation interactive de toutes les routes du backend.',
    href: `${API_BASE}/docs`,
    externe: true,
  },
  {
    groupe: 'Documentation API',
    titre: 'ReDoc (/redoc)',
    description: 'Documentation de référence, lecture continue.',
    href: `${API_BASE}/redoc`,
    externe: true,
  },
];

const GROUPES = Array.from(new Set(LIENS.map((l) => l.groupe)));

export default function Resume() {
  return (
    <div className="rs-page">
      <header className="rs-header">
        <div className="rs-header-brand">
          <img src={logoPrevia} alt="Previa" />
          <span>Liens & accès rapides</span>
        </div>
        <Link className="rs-lien-retour" to="/admin"><Icone.flecheGauche width={14} height={14} /> Retour au dashboard</Link>
      </header>

      <div className="rs-corps">
        {GROUPES.map((groupe) => (
          <section key={groupe} className="rs-groupe">
            <h2>{groupe}</h2>
            <div className="rs-grille">
              {LIENS.filter((l) => l.groupe === groupe).map((lien) =>
                lien.externe ? (
                  <a key={lien.titre} className="rs-carte" href={lien.href} target="_blank" rel="noreferrer">
                    <strong>{lien.titre}</strong>
                    <p>{lien.description}</p>
                    <span className="rs-carte-flèche"><Icone.flecheDiagonale width={14} height={14} /></span>
                  </a>
                ) : (
                  <Link key={lien.titre} className="rs-carte" to={lien.href}>
                    <strong>{lien.titre}</strong>
                    <p>{lien.description}</p>
                    <span className="rs-carte-flèche"><Icone.flecheDroite width={14} height={14} /></span>
                  </Link>
                )
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
