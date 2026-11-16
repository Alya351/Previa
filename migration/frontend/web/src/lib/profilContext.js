import { createContext, useContext } from 'react';

// Profil d'usage de l'installation (« particulier » ou « entreprise »),
// chargé une fois par pages/admin.jsx depuis GET /systeme/profil et
// distribué aux composants qui adaptent leurs textes ou leurs onglets.
// `profil` vaut null tant que le premier chargement n'a pas répondu.
export const ProfilContext = createContext({ profil: null, libelles: {} });

export function useProfil() {
  return useContext(ProfilContext);
}

// Nom de l'onglet où l'on ajoute pièces et caméras, selon le profil.
export function nomOngletConfiguration(profil) {
  return profil === 'particulier' ? 'Particuliers' : 'Organisation';
}
