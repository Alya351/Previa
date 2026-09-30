import React, { useState, useEffect, useRef } from 'react';
import { Bell, User, LogOut, Radio, Trash2, X } from 'lucide-react';
import { supprimerAlerte, supprimerToutesAlertes } from '../api.js';

// `notifications` et `utilisateur` : branchés sur les vraies données
// (GET /alertes et le compte connecté, voir sessionStorage dans
// pages/admin.jsx) — remplace les 3 notifications et le profil "OP"
// fictifs d'origine.
export function HeaderDecor({ onNavigate, onLogout, onRefresh, unreadCount = 3, notifications = [], utilisateur }) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  const notifRef = useRef(null);
  const profileRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfile(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleGoToAlerts = () => {
    setHasUnread(false);
    setShowNotifications(false);
    if (onNavigate) {
      onNavigate('alerts');
    }
  };

  const handleDeleteNotification = async (e, id) => {
    e.stopPropagation();
    try {
      await supprimerAlerte(id);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearAllNotifications = async (e) => {
    e.stopPropagation();
    try {
      await supprimerToutesAlertes();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUserLogout = () => {
    setShowProfile(false);
    if (onLogout) {
      onLogout();
    }
  };

  return (
    <div className="top-wave-header-container">
      {/* EXACT DUAL-LAYER ORGANIC WAVE MATCHING THE REFERENCE IMAGE */}
      <svg 
        className="top-wave-svg" 
        viewBox="0 0 420 80" 
        fill="none" 
        preserveAspectRatio="none" 
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="topCyanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00b4d8" />
            <stop offset="50%" stopColor="#0284c7" />
            <stop offset="100%" stopColor="#0096c7" />
          </linearGradient>
          <linearGradient id="topBlueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0084d8" />
            <stop offset="50%" stopColor="#0077b6" />
            <stop offset="100%" stopColor="#0064a8" />
          </linearGradient>
        </defs>

        {/* Lower Cyan Wave Accent */}
        <path 
          d="M 0 0 C 45 0, 90 12, 135 28 C 190 48, 255 72, 335 72 C 370 72, 400 68, 420 64 V 0 H 0 Z" 
          fill="url(#topCyanGrad)" 
        />
        
        {/* Main Royal Blue Wave */}
        <path 
          d="M 45 0 C 95 0, 140 12, 185 26 C 240 44, 295 62, 355 62 C 385 62, 405 58, 420 54 V 0 H 45 Z" 
          fill="url(#topBlueGrad)" 
        />
      </svg>

      {/* TOP RIGHT ACTION BUTTONS WITH PURE WHITE ICONS */}
      <div className="top-header-actions">
        {/* NOTIFICATIONS DROPDOWN */}
        <div ref={notifRef} style={{ position: 'relative' }}>
          <button 
            className="wave-icon-btn" 
            onClick={() => {
              const next = !showNotifications;
              setShowNotifications(next);
              if (next) {
                setHasUnread(false);
              }
              setShowProfile(false);
            }} 
            title="Notifications et Alertes en direct"
            aria-label="Notifications"
          >
            <Bell size={21} strokeWidth={2.4} fill="#ffffff" />
            {hasUnread && notifications.length > 0 && (
              <span className="wave-badge-dot" />
            )}
          </button>

          {showNotifications && (
            <div className="wave-dropdown-panel" style={{ width: '340px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--ink-primary)' }}>
                  Notifications ({notifications.length})
                </span>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {notifications.length > 0 && (
                    <button 
                      onClick={handleClearAllNotifications}
                      style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                      title="Effacer toutes les notifications"
                    >
                      <Trash2 size={12} />
                      Effacer
                    </button>
                  )}
                  <button 
                    onClick={handleGoToAlerts}
                    style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Voir tout
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '360px', overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--ink-muted)', fontSize: '0.82rem' }}>
                    Aucune notification active
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div 
                      key={n.id}
                      onClick={handleGoToAlerts}
                      style={{
                        background: '#f8fafc',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        borderLeft: `4px solid ${n.type === 'critical' ? '#ef4444' : (n.type === 'warning' ? '#f59e0b' : '#0284c7')}`,
                        transition: 'background 0.15s ease',
                        position: 'relative'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--ink-primary)', flex: 1 }}>{n.title}</div>
                        <button
                          onClick={(e) => handleDeleteNotification(e, n.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center',
                            borderRadius: '4px'
                          }}
                          title="Supprimer cette notification"
                          onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                          onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--ink-muted)', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{n.cam}</span>
                        <span>{n.time}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>


        {/* USER PROFILE DROPDOWN */}
        <div ref={profileRef} style={{ position: 'relative' }}>
          <button 
            className="wave-icon-btn" 
            onClick={() => {
              setShowProfile(!showProfile);
              setShowNotifications(false);
            }} 
            title="Profil Opérateur"
            aria-label="Profil"
          >
            <User size={22} strokeWidth={2.4} fill="#ffffff" />
          </button>

          {showProfile && (
            <div className="wave-dropdown-panel" style={{ width: '260px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid var(--border-light)' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#0284c7', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                  {(utilisateur?.nom || 'OP').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--ink-primary)' }}>{utilisateur?.nom || 'Opérateur Sécurité'}</div>
                  <div style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 600 }}>{utilisateur?.role === 'admin' ? 'Admin' : 'Utilisateur'} · Poste Actif</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <button
                  onClick={handleUserLogout}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#fee2e2',
                    color: '#ef4444',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    width: '100%',
                    textAlign: 'left'
                  }}
                >
                  <LogOut size={16} />
                  Se déconnecter
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default HeaderDecor;
