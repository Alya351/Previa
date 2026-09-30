import React, { useEffect } from 'react';
import { Trash2, AlertTriangle, ShieldAlert, X } from 'lucide-react';

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirmation de suppression",
  message = "Êtes-vous sûr de vouloir effectuer cette action ?",
  confirmText = "Supprimer définitivement",
  cancelText = "Annuler",
  dangerLevel = "danger", // 'danger' | 'warning'
  itemDetails = null, // { type, time, cam, desc }
  loading = false,
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const isCritical = dangerLevel === 'danger';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '20px',
        animation: 'previaFadeIn 0.2s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <style>{`
        @keyframes previaFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes previaModalScale {
          from { opacity: 0; transform: scale(0.94) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '24px',
          maxWidth: '480px',
          width: '100%',
          overflow: 'hidden',
          boxShadow: '0 25px 60px -12px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.05)',
          animation: 'previaModalScale 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          position: 'relative',
        }}
      >
        {/* Header decoratif avec dégradé subtil */}
        <div
          style={{
            height: '6px',
            background: isCritical
              ? 'linear-gradient(90deg, #dc2626, #ef4444, #f87171)'
              : 'linear-gradient(90deg, #d97706, #f59e0b, #fbbf24)',
          }}
        />

        <div style={{ padding: '28px 28px 24px' }}>
          {/* En-tête : Icône + Bouton Fermer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                backgroundColor: isCritical ? '#fee2e2' : '#fef3c7',
                border: isCritical ? '2px solid #fecaca' : '2px solid #fde68a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isCritical ? '0 8px 20px rgba(220, 38, 38, 0.15)' : '0 8px 20px rgba(217, 119, 6, 0.15)',
              }}
            >
              {isCritical ? (
                <Trash2 size={28} color="#dc2626" />
              ) : (
                <AlertTriangle size={28} color="#d97706" />
              )}
            </div>

            <button
              onClick={onClose}
              disabled={loading}
              style={{
                background: '#f1f5f9',
                border: 'none',
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#64748b',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#e2e8f0';
                e.currentTarget.style.color = '#0f172a';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#f1f5f9';
                e.currentTarget.style.color = '#64748b';
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Titre & Message */}
          <h3
            style={{
              fontSize: '1.25rem',
              fontWeight: 800,
              color: '#0f172a',
              margin: '0 0 8px',
              letterSpacing: '-0.02em',
            }}
          >
            {title}
          </h3>

          <p
            style={{
              fontSize: '0.92rem',
              color: '#475569',
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            {message}
          </p>

          {/* Fiche de détail de l'incident (si fourni) */}
          {itemDetails && (
            <div
              style={{
                marginTop: '16px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              {itemDetails.type && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Incident</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#dc2626' }}>{itemDetails.type}</span>
                </div>
              )}
              {itemDetails.cam && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Caméra</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>{itemDetails.cam}</span>
                </div>
              )}
              {itemDetails.time && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Horodatage</span>
                  <span style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 600 }}>{itemDetails.time}</span>
                </div>
              )}
              {itemDetails.desc && (
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0', fontStyle: 'italic', borderTop: '1px dashed #cbd5e1', paddingTop: '6px' }}>
                  « {itemDetails.desc} »
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              marginTop: '24px',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                flex: 1,
                padding: '12px 18px',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#334155',
                fontSize: '0.9rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f8fafc';
                e.currentTarget.style.borderColor = '#94a3b8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#ffffff';
                e.currentTarget.style.borderColor = '#cbd5e1';
              }}
            >
              {cancelText}
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              style={{
                flex: 1.3,
                padding: '12px 18px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: isCritical ? '#dc2626' : '#d97706',
                backgroundImage: isCritical
                  ? 'linear-gradient(180deg, #ef4444 0%, #dc2626 100%)'
                  : 'linear-gradient(180deg, #f59e0b 0%, #d97706 100%)',
                color: '#ffffff',
                fontSize: '0.9rem',
                fontWeight: 800,
                cursor: loading ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: isCritical
                  ? '0 4px 14px rgba(220, 38, 38, 0.35)'
                  : '0 4px 14px rgba(217, 119, 6, 0.35)',
                transition: 'all 0.15s ease',
                opacity: loading ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!loading) e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                if (!loading) e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <Trash2 size={16} />
              {loading ? "Suppression en cours..." : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
