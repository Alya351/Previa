import React from 'react';
import {
  Home,
  Cctv,
  FileVideo,
  Bell,
  FileText,
  Building2,
  Users,
  Router,
  X
} from 'lucide-react';
import PreviaLogo from './PreviaLogo';

// `showOrganisation` : item de menu en plus par rapport au design
// d'origine — fonctionnalité présente dans l'ancien migration/admin
// (defaultAdmin.jsx : comptes/bâtiments/pièces/caméras) mais absente de
// cette interface, réservée au compte admin par défaut (voir App.jsx).
export function Sidebar({
  currentTab, onSelectTab, isCollapsed = false, isMobileOpen = false, onCloseMobile, unreadAlerts = 3, showOrganisation = false,
  joursRestantsLicence = null,
}) {
  const menuItems = [
    { id: 'dashboard', label: 'Tableau de bord', icon: Home },
    { id: 'cameras', label: 'Caméras', icon: Cctv },
    { id: 'personnes', label: 'Personnel & Face ID', icon: Users },
    { id: 'events', label: 'Historique', icon: FileVideo },
    { id: 'alerts', label: 'Alertes', icon: Bell, badge: unreadAlerts },
    { id: 'reports', label: 'Rapports', icon: FileText },
    ...(showOrganisation ? [
      { id: 'organisation', label: 'Organisation', icon: Building2 },
      { id: 'configAlerte', label: 'Boîtiers d\'alarme', icon: Router },
    ] : []),
  ];

  return (
    <>
      {isMobileOpen && (
        <div
          className="mobile-sidebar-backdrop"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-top">
          {/* MOBILE CLOSE BUTTON */}
          <div className="mobile-sidebar-header">
            <button
              className="mobile-sidebar-close-btn"
              onClick={onCloseMobile}
              aria-label="Fermer le menu"
            >
              <X size={20} />
            </button>
          </div>

          {/* CENTERED & ENLARGED ORIGINAL PREVIA LOGO */}
          <div 
            className="sidebar-logo"
            onClick={() => {
              onSelectTab('dashboard');
              if (onCloseMobile) onCloseMobile();
            }}
            title="PREVIA Operations Center"
            style={{ 
              cursor: 'pointer', 
              marginBottom: '32px', 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              width: '100%' 
            }}
          >
            <PreviaLogo size={isCollapsed ? "small" : "medium"} />
          </div>

          {/* NAVIGATION LINKS */}
          <nav className="sidebar-nav">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;

              return (
                <button
                  key={item.id}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    onSelectTab(item.id);
                    if (onCloseMobile) onCloseMobile();
                  }}
                  title={item.label}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="nav-icon" size={19} strokeWidth={isActive ? 2.4 : 1.8} aria-hidden="true" />
                  {!isCollapsed && (
                    <>
                      <span className="nav-label">{item.label}</span>
                      {item.badge && item.badge > 0 && !isActive && (
                        <span className="nav-badge" aria-label={`${item.badge} notifications non lues`}>{item.badge}</span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </nav>

        {/* Licence de cette installation (voir Infrastructure/licence.py
            côté backend, LicenceDisabledScreen dans admin.jsx) -- demandée
            "visible dans le frontend du docker" ; discrète, pas un menu en
            soi. Placée ICI (dans .sidebar-top, pas en 3e enfant flex de
            .sidebar) pour rester au-dessus de .sidebar-bottom-waves,
            positionnée en `absolute; bottom:0` et qui la recouvrirait sinon.
            `null` tant que jamais chargé/pas de date d'expiration. */}
        {!isCollapsed && joursRestantsLicence != null && (
          <div
            title="Jours restants avant expiration du code d'amorçage"
            style={{
              fontSize: '0.72rem', fontWeight: 600, textAlign: 'center',
              color: joursRestantsLicence <= 30 ? '#fca5a5' : 'rgba(255,255,255,0.55)',
              marginTop: '18px',
            }}
          >
            Licence : {joursRestantsLicence} j restants
          </div>
        )}
      </div>

      {/* FLUID BLUE WAVES DECOR IN BOTTOM CORNER */}
      <div className="sidebar-bottom-waves">
        <svg 
          viewBox="0 0 250 110" 
          fill="none" 
          preserveAspectRatio="none" 
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          <defs>
            <linearGradient id="sideWaveTopGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0891b2" stopOpacity="0.85" />
              <stop offset="50%" stopColor="#0284c7" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#0369a1" stopOpacity="0.9" />
            </linearGradient>
            <linearGradient id="sideWaveBottomGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0284c7" />
              <stop offset="60%" stopColor="#0369a1" />
              <stop offset="100%" stopColor="#0077b6" />
            </linearGradient>
          </defs>
          
          <path 
            d="M0 48C45 28 110 65 175 42C210 30 235 15 250 8V110H0V48Z" 
            fill="url(#sideWaveTopGrad)" 
          />
          
          <path 
            d="M0 72C50 52 115 85 180 62C215 50 235 38 250 30V110H0V72Z" 
            fill="url(#sideWaveBottomGrad)" 
          />
        </svg>
      </div>
    </aside>
    </>
  );
}

export default Sidebar;
