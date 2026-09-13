import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, User, KeyRound, ArrowRight } from 'lucide-react';
import PreviaLogo from '../components/PreviaLogo';
import { API_BASE } from '../api.js';
import './admin.css';

// Connexion/amorçage RÉELS (voir /utilisateurs/connexion et
// /utilisateurs/amorcer côté backend) — remplace le
// `setTimeout(...onLoginSuccess())` fictif d'une première version basée
// sur la maquette /home/rakine/osc/web, qui acceptait n'importe quel
// email/mot de passe sans rien vérifier.
// `codeSecret` : champ AJOUTÉ (absent de la maquette d'origine) —
// /utilisateurs/amorcer l'exige pour créer le tout premier compte admin
// : un vrai code d'amorçage obtenu sur previa-SV, vérifié en ligne puis
// actif 1 an (voir Infrastructure/licence.py côté backend).
export default function Login({ onLoginSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [codeSecret, setCodeSecret] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErreur('');
    setSucces('');
    setIsLoading(true);
    try {
      if (isSignUp) {
        const [prenom, ...reste] = fullName.trim().split(' ');
        const nom = reste.join(' ') || prenom;
        const res = await fetch(`${API_BASE}/utilisateurs/amorcer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nom, prenom, email, mot_de_passe: password, code_secret: codeSecret }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.detail || `Erreur ${res.status}`);
        setIsSignUp(false);
        setErreur('');
        setPassword('');
        setSucces('Compte créé — tu peux te connecter maintenant.');
      } else {
        const res = await fetch(`${API_BASE}/utilisateurs/connexion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, mot_de_passe: password }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.detail || `Erreur ${res.status}`);
        sessionStorage.setItem('previa_connecte', 'oui');
        sessionStorage.setItem('previa_utilisateur_id', data.id);
        sessionStorage.setItem('previa_utilisateur_role', data.role);
        sessionStorage.setItem('previa_utilisateur_nom', `${data.prenom} ${data.nom}`);
        sessionStorage.setItem('previa_est_par_defaut', data.est_par_defaut ? 'oui' : 'non');
        onLoginSuccess();
      }
    } catch (err) {
      setErreur(err.message || 'Une erreur est survenue.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        background: '#eaf2fe',
        backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(2, 132, 199, 0.08) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(0, 180, 216, 0.08) 0%, transparent 40%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px'
      }}
    >
      <div
        style={{
          background: '#ffffff',
          width: '100%',
          maxWidth: '960px',
          minHeight: '560px',
          borderRadius: '28px',
          boxShadow: '0 25px 70px rgba(2, 132, 199, 0.15), 0 10px 30px rgba(0, 0, 0, 0.04)',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* LEFT SAPPHIRE HERO PANEL */}
        <div
          style={{
            flex: 1.1,
            background: 'linear-gradient(145deg, #075985 0%, #0284c7 55%, #00b4d8 100%)',
            color: '#ffffff',
            padding: '48px 40px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            zIndex: 1
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', margin: 'auto 0' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 500, opacity: 0.95, marginBottom: '24px' }}>
              Bienvenue sur
            </div>

            {/* SINGLE CLEAN LOGO BADGE */}
            <div style={{ marginBottom: '20px' }}>
              <PreviaLogo size="large" />
            </div>

            <p style={{ fontSize: '0.92rem', opacity: 0.9, maxWidth: '280px', lineHeight: 1.5, marginTop: '8px' }}>
              Surveillance intelligente par analyse comportementale
            </p>
          </div>

          <div style={{ fontSize: '0.8rem', opacity: 0.8, textAlign: 'center' }}>
            PREVIA OPERATIONS CENTER : PREVIA IA
          </div>

          {/* ORGANIC WAVE SEPARATOR */}
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '60px', pointerEvents: 'none' }}>
            <svg viewBox="0 0 100 500" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
              <path d="M0,0 C60,70 85,170 55,270 C25,370 65,440 0,500 L100,500 L100,0 Z" fill="#ffffff" />
            </svg>
          </div>
        </div>

        {/* RIGHT FORM PANEL */}
        <div style={{ flex: 1.2, padding: '48px 44px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ marginBottom: '28px' }}>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--ink-primary)', letterSpacing: '-0.02em' }}>
              {isSignUp ? 'Créer un compte' : 'Se connecter'}
            </h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--ink-muted)', marginTop: '4px' }}>
              {isSignUp ? 'Rejoignez la plateforme PREVIA' : 'Saisissez vos identifiants pour continuer'}
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {isSignUp && (
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--ink-secondary)', display: 'block', marginBottom: '6px' }}>
                  Nom complet
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-muted)' }} />
                  <input
                    type="text"
                    required
                    placeholder="Jean Dupont"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px 12px 42px', borderRadius: '10px', border: '1px solid var(--border-light)', background: '#f8fafc', color: 'var(--ink-primary)', colorScheme: 'light', fontSize: '0.9rem', outline: 'none' }}
                  />
                </div>
              </div>
            )}

            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--ink-secondary)', display: 'block', marginBottom: '6px' }}>
                Adresse e-mail
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-muted)' }} />
                <input
                  type="email"
                  required
                  placeholder="admin@previa.ai"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px 12px 42px', borderRadius: '10px', border: '1px solid var(--border-light)', background: '#f8fafc', color: 'var(--ink-primary)', colorScheme: 'light', fontSize: '0.9rem', outline: 'none' }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--ink-secondary)', display: 'block', marginBottom: '6px' }}>
                Mot de passe
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-muted)' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ width: '100%', padding: '12px 42px 12px 42px', borderRadius: '10px', border: '1px solid var(--border-light)', background: '#f8fafc', color: 'var(--ink-primary)', colorScheme: 'light', fontSize: '0.9rem', outline: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--ink-muted)', cursor: 'pointer' }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {isSignUp && (
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--ink-secondary)', display: 'block', marginBottom: '6px' }}>
                  Code d'amorçage
                </label>
                <div style={{ position: 'relative' }}>
                  <KeyRound size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-muted)' }} />
                  <input
                    type="text"
                    required
                    placeholder="Code à 8 caractères obtenu sur previa-sv"
                    value={codeSecret}
                    onChange={(e) => setCodeSecret(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px 12px 42px', borderRadius: '10px', border: '1px solid var(--border-light)', background: '#f8fafc', color: 'var(--ink-primary)', colorScheme: 'light', fontSize: '0.9rem', outline: 'none' }}
                  />
                </div>
                <p style={{ fontSize: '0.76rem', color: 'var(--ink-muted)', marginTop: '4px' }}>
                  Réservé à la création du tout premier compte administrateur — active aussi la licence de cette installation pour 1 an (voir Infrastructure/licence.py).
                </p>
              </div>
            )}

            {erreur && (
              <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: '10px', fontSize: '0.84rem', fontWeight: 600 }}>
                {erreur}
              </div>
            )}
            {succes && (
              <div style={{ background: '#dcfce7', color: '#15803d', padding: '10px 14px', borderRadius: '10px', fontSize: '0.84rem', fontWeight: 600 }}>
                {succes}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              style={{
                marginTop: '10px',
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '14px',
                borderRadius: '12px',
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 8px 20px rgba(2, 132, 199, 0.35)',
                opacity: isLoading ? 0.8 : 1
              }}
            >
              <span>{isLoading ? 'Connexion en cours...' : (isSignUp ? 'Créer mon compte' : 'Se connecter')}</span>
              <ArrowRight size={18} />
            </button>
          </form>

          <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.88rem', color: 'var(--ink-muted)' }}>
            <span>{isSignUp ? 'Vous avez déjà un compte ?' : "Vous n'avez pas de compte ?"} </span>
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              style={{ background: 'none', border: 'none', color: '#0284c7', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
            >
              {isSignUp ? 'Se connecter' : "S'inscrire"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
