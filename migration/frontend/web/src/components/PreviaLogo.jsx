import React from 'react';

export function PreviaLogo({ size = 'medium', className = '', style = {} }) {
  let imgHeight = '38px';
  let padding = '8px 20px';
  let radius = '9999px';

  if (size === 'small') {
    imgHeight = '24px';
    padding = '5px 12px';
    radius = '9999px';
  } else if (size === 'large') {
    imgHeight = '48px';
    padding = '12px 28px';
    radius = '9999px';
  } else if (size === 'xlarge') {
    imgHeight = '58px';
    padding = '14px 34px';
    radius = '9999px';
  }

  return (
    <div 
      className={`previa-logo-pill ${className}`}
      style={{
        background: '#ffffff',
        padding: padding,
        borderRadius: radius,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.12)',
        userSelect: 'none',
        margin: '0 auto',
        ...style
      }}
    >
      <img 
        src="/logo_previa_transparent.png" 
        alt="PREVIA" 
        style={{
          height: imgHeight,
          width: 'auto',
          maxWidth: '100%',
          objectFit: 'contain',
          display: 'block'
        }}
      />
    </div>
  );
}

export default PreviaLogo;
