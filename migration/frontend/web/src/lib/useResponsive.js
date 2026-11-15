import { useState, useEffect } from 'react';

/**
 * Hook universel de détection et calcul de la taille des appareils.
 * Écoute les redimensionnements d'écran (resize) et changements d'orientation (tablette/smartphone).
 * Fournit des métriques précises pour adapter le layout à 100%.
 */
export function useResponsive() {
  const getSnapshot = () => {
    if (typeof window === 'undefined') {
      return {
        width: 1200,
        height: 800,
        isSmallMobile: false,
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        isWide: false,
        isTouch: false,
        kpiColumns: 4,
        camColumns: 3,
        orientation: 'landscape',
      };
    }

    const w = window.innerWidth;
    const h = window.innerHeight;
    const isTouch = 'ontouchstart' in window || (navigator.maxTouchPoints > 0);

    return {
      width: w,
      height: h,
      isSmallMobile: w < 480,
      isMobile: w < 768,
      isTablet: w >= 768 && w < 1024,
      isDesktop: w >= 1024,
      isWide: w >= 1600,
      isTouch,
      kpiColumns: w < 480 ? 1 : (w < 1100 ? 2 : 4),
      camColumns: w < 640 ? 1 : (w < 1200 ? 2 : 3),
      orientation: w > h ? 'landscape' : 'portrait',
    };
  };

  const [state, setState] = useState(getSnapshot);

  useEffect(() => {
    let timeoutId = null;

    const handleResize = () => {
      // Débounce léger pour fluidité et 60 FPS sans lag
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setState(getSnapshot());
      }, 50);
    };

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('orientationchange', handleResize, { passive: true });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return state;
}
