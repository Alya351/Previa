import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, RotateCcw, CheckCircle2 } from 'lucide-react';
import { reinitialiserSysteme } from '../api.js';

// Page de réinitialisation complète -- voir /systeme/reboot côté
// backend (Infrastructure/reboot.py). VOLONTAIREMENT accessible sans
// connexion (pas de RequireAuth dans App.jsx) : pensée pour le cas où
// justement plus personne ne peut se connecter (mot de passe perdu,
// admin par défaut supprimé par erreur...) -- il faut pouvoir repartir
// de zéro sans dépendre d'un compte existant.
//
// Double confirmation DANS la page (pas window.confirm(), pour rester
// dans le style visuel du reste de l'appli) avant le moindre appel
// réseau -- l'action est irréversible, efface tout.
export default function Reboot() {
  const navigate = useNavigate();
  const [etape, setEtape] = useState('avertissement'); // avertissement | confirmation | en_cours | fait | erreur
  const [erreur, setErreur] = useState('');

  async function confirmerReboot() {
    setEtape('en_cours');
    setErreur('');
    try {
      await reinitialiserSysteme();
      setEtape('fait');
      setTimeout(() => navigate('/login', { replace: true }), 4000);
    } catch (err) {
      setErreur(err.message || 'Une erreur est survenue.');
      setEtape('erreur');
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh', width: '100vw', background: '#eaf2fe',
        backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(2, 132, 199, 0.08) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(0, 180, 216, 0.08) 0%, transparent 40%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
      }}
    >
      <div
        style={{
          background: '#ffffff', width: '100%', maxWidth: '460px', borderRadius: '24px',
          boxShadow: '0 25px 70px rgba(2, 132, 199, 0.15), 0 10px 30px rgba(0, 0, 0, 0.04)',
          padding: '44px 38px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        }}
      >
        {etape === 'fait' ? (
          <>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', background: '#dcfce7',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
            }}>
              <CheckCircle2 size={30} color="#15803d" />
            </div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--ink-primary)', margin: 0 }}>
              Système réinitialisé
            </h2>
            <p style={{ fontSize: '0.92rem', color: 'var(--ink-muted)', marginTop: 10, lineHeight: 1.55 }}>
              Toutes les données ont été effacées. Redirection vers la connexion...
            </p>
          </>
        ) : (
          <>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', background: '#fee2e2',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
            }}>
              <AlertTriangle size={30} color="#dc2626" />
            </div>

            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--ink-primary)', margin: 0 }}>
              Réinitialiser le système
            </h2>
            <p style={{ fontSize: '0.92rem', color: 'var(--ink-muted)', marginTop: 10, lineHeight: 1.55 }}>
              Efface définitivement TOUTES les données de cette installation :
              comptes, bâtiments, pièces, caméras, alertes, profils et licence.
              Action <strong>irréversible</strong>. Au prochain lancement, tout
              repart de zéro -- création du tout premier compte administrateur,
              nouveau code d'amorçage requis.
            </p>

            {etape === 'erreur' && (
              <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: '10px', fontSize: '0.84rem', fontWeight: 600, marginTop: 16, width: '100%' }}>
                {erreur}
              </div>
            )}

            {etape === 'confirmation' && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '12px 14px', borderRadius: '10px', fontSize: '0.86rem', fontWeight: 700, marginTop: 18, width: '100%' }}>
                Es-tu absolument sûr ? Il n'y a pas de retour en arrière possible.
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, width: '100%', marginTop: 20 }}>
              {(etape === 'confirmation') && (
                <button
                  type="button"
                  onClick={() => setEtape('avertissement')}
                  style={{
                    flex: 1, background: '#f1f5f9', color: 'var(--ink-secondary)', border: 'none',
                    padding: '13px', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  Annuler
                </button>
              )}
              <button
                type="button"
                disabled={etape === 'en_cours'}
                onClick={() => (etape === 'confirmation' ? confirmerReboot() : setEtape('confirmation'))}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)', color: '#ffffff', border: 'none',
                  padding: '13px', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
                  opacity: etape === 'en_cours' ? 0.7 : 1, boxShadow: '0 8px 20px rgba(185, 28, 28, 0.3)',
                }}
              >
                <RotateCcw size={16} />
                {etape === 'en_cours'
                  ? 'Réinitialisation...'
                  : etape === 'confirmation'
                  ? 'Oui, tout effacer'
                  : 'Réinitialiser le système'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
