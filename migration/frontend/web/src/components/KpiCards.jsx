import React from 'react';

export function KpiCards({ 
  activeCameras = 12, 
  detectedPersons = 248, 
  suspectBehaviors = 5, 
  uptimeRate = "99,8%",
  onNavigate 
}) {
  const cards = [
    {
      id: 'cam',
      tab: 'cameras',
      icon: (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="#0284c7">
          <path d="M4 6C2.9 6 2 6.9 2 8V16C2 17.1 2.9 18 4 18H14C15.1 18 16 17.1 16 16V13.8L20.3 17.5C20.9 18 22 17.6 22 16.7V7.3C22 6.4 20.9 6 20.3 6.5L16 10.2V8C16 6.9 15.1 6 14 6H4Z" />
        </svg>
      ),
      value: activeCameras,
      label: 'Caméras actives'
    },
    {
      id: 'persons',
      tab: 'personnes',
      icon: (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="#0284c7">
          <path d="M16 11C17.7 11 19 9.7 19 8C19 6.3 17.7 5 16 5C14.3 5 13 6.3 13 8C13 9.7 14.3 11 16 11ZM8 11C9.7 11 11 9.7 11 8C11 6.3 9.7 5 8 5C6.3 5 5 6.3 5 8C5 9.7 6.3 11 8 11ZM8 13C5.7 13 1 14.2 1 16.5V19H15V16.5C15 14.2 10.3 13 8 13ZM16 13C15.7 13 15.3 13 14.9 13.1C16.1 14 17 15.1 17 16.5V19H23V16.5C23 14.2 18.3 13 16 13Z" />
        </svg>
      ),
      value: detectedPersons,
      label: 'Personnes détectées'
    },
    {
      id: 'suspect',
      tab: 'alerts',
      icon: (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="#0284c7">
          <path d="M13.5 5.5C14.6 5.5 15.5 4.6 15.5 3.5C15.5 2.4 14.6 1.5 13.5 1.5C12.4 1.5 11.5 2.4 11.5 3.5C11.5 4.6 12.4 5.5 13.5 5.5ZM9.8 8.9L6 20H8.1L10.4 14.3L12.5 16.5V22H14.5V15.5L12.7 13.2L13.4 9.9C14.8 11.6 16.8 12.5 19 12.5V10.5C17.2 10.5 15.7 9.7 14.6 8.3L13.6 6.8C13.2 6.2 12.5 5.8 11.8 5.8C11.5 5.8 11.1 5.9 10.8 6.1L6 8.1V12.5H8V9.5L9.8 8.9Z" />
        </svg>
      ),
      value: suspectBehaviors,
      label: 'Comportements suspects'
    },
    {
      id: 'uptime',
      tab: 'reports',
      icon: (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15 15" />
        </svg>
      ),
      value: uptimeRate,
      label: 'Taux de disponibilité'
    }
  ];

  return (
    <div className="kpi-grid">
      {cards.map((card) => (
        <div 
          key={card.id} 
          className="kpi-card"
          onClick={() => onNavigate && onNavigate(card.tab)}
          style={{ cursor: onNavigate ? 'pointer' : 'default' }}
          title={`Cliquer pour afficher la vue ${card.label}`}
        >
          <div className="kpi-icon-wrapper">
            {card.icon}
          </div>
          <div className="kpi-content">
            <span className="kpi-value">{card.value}</span>
            <span className="kpi-label">{card.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default KpiCards;
