import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  StatusBar,
  LogBox,
  useColorScheme,
  Platform,
  Text,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import { getTheme, PREVIA_COLORS } from './theme';
import { listerAlertes, mapAlerteApi, chargerVueEnsemble, nettoyerNomCamera } from './api';

// Composants et écrans modulaires
import { BottomTabBar } from './components/BottomTabBar';
import { HomeScreen } from './screens/HomeScreen';
import { LiveScreen } from './screens/LiveScreen';
import { AlertsScreen } from './screens/AlertsScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { LoginScreen } from './screens/LoginScreen';
import { ModalNumeroGardiennerie } from './components/ModalNumeroGardiennerie';

LogBox.ignoreLogs(['SafeAreaView has been deprecated']);

const NUMERO_GARDIENNERIE_DEFAUT = '+226 75 29 13 28';

function MainApplication() {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState('light'); // 'light' | 'dark' | 'system'
  const isDark = themeMode === 'system' ? systemColorScheme === 'dark' : themeMode === 'dark';
  const theme = getTheme(isDark ? 'dark' : 'light');

  // Numéro de la Gardiennerie (configurable par l'utilisateur)
  const [numeroGardiennerie, setNumeroGardiennerieState] = useState(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem('previa_numero_gardiennerie') || NUMERO_GARDIENNERIE_DEFAUT;
    }
    return NUMERO_GARDIENNERIE_DEFAUT;
  });

  const handleUpdateNumeroGardiennerie = (nouveauNumero) => {
    setNumeroGardiennerieState(nouveauNumero);
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('previa_numero_gardiennerie', nouveauNumero);
    }
  };

  const [modalNumeroOuvert, setModalNumeroOuvert] = useState(false);

  // Authentification et session opérateur
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  // Navigation par onglets (Section 4)
  const [activeTab, setActiveTab] = useState('home'); // 'home' | 'direct' | 'alerts' | 'profile'

  // Données temps réel
  const [alerts, setAlerts] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [cameraChoisie, setCameraChoisie] = useState(null);

  // États d'interface
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [networkError, setNetworkError] = useState(null);

  // Synchronisation backend
  const chargerDonnees = async () => {
    try {
      setNetworkError(null);
      const [alertesBrutes, vueEnsemble] = await Promise.all([
        listerAlertes().catch((err) => {
          throw err;
        }),
        chargerVueEnsemble().catch(() => ({ cameras: [] })),
      ]);

      const alertesMappees = (alertesBrutes || []).map(mapAlerteApi);
      setAlerts(alertesMappees);

      if (vueEnsemble?.cameras?.length > 0) {
        const camerasPropres = vueEnsemble.cameras.map((c) => ({
          ...c,
          nom: nettoyerNomCamera(c.nom || c.num || c.id_camera),
          num: nettoyerNomCamera(c.num || c.nom || c.id_camera),
        }));
        setCameras(camerasPropres);
        setCameraChoisie((prev) => prev || camerasPropres[0]?.id_camera || null);
      }
    } catch (err) {
      setNetworkError(err?.message || "Erreur de connexion au serveur");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    chargerDonnees();
    // Rafraîchissement automatique discret toutes les 5 secondes
    const interval = setInterval(chargerDonnees, 5000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    chargerDonnees();
  };

  // Validation au pouce (SF-MOB-03) : Acquittement d'une alerte
  const handleVerifyAlert = (idAlerte) => {
    // Mise à jour optimiste locale immédiate
    setAlerts((prev) =>
      prev.map((al) => (al.id === idAlerte ? { ...al, statut: 'VERIFIE', enCours: false } : al))
    );
    // TODO: endpoint à confirmer avec le backend (PATCH /alertes/{id}/acquitter)
  };

  // Validation au pouce (SF-MOB-03) : Rejet d'un faux positif
  const handleRejectAlert = (idAlerte) => {
    // Mise à jour optimiste locale immédiate
    setAlerts((prev) =>
      prev.map((al) => (al.id === idAlerte ? { ...al, statut: 'REJETE', enCours: false } : al))
    );
    // TODO: endpoint à confirmer avec le backend (PATCH /alertes/{id}/rejeter)
  };

  // Compteur d'alertes non traitées
  const unreadCount = alerts.filter(
    (al) => al.statut !== 'VERIFIE' && al.statut !== 'REJETE' && al.enCours
  ).length;

  if (!isAuthenticated) {
    return (
      <View style={styles.loginSafeArea}>
        <StatusBar barStyle="light-content" backgroundColor="#071d3a" />
        <LoginScreen
          onLogin={(utilisateur) => {
            setCurrentUser(utilisateur);
            setIsAuthenticated(true);
          }}
        />
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { backgroundColor: theme.colors.background },
      ]}
      edges={['top', 'left', 'right']}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />

      <View style={styles.screenContainer}>
        {/* ÉCRAN 1 : ACCUEIL */}
        {activeTab === 'home' && (
          <HomeScreen
            onNavigate={(targetTab) => setActiveTab(targetTab)}
            unreadCount={unreadCount}
            isLoading={isLoading}
            networkError={networkError}
            isDark={isDark}
            cameras={cameras}
            alerts={alerts}
            currentUser={currentUser}
            onVerifyAlert={handleVerifyAlert}
            onRejectAlert={handleRejectAlert}
            numeroGardiennerie={numeroGardiennerie}
            onOpenEditNumero={() => setModalNumeroOuvert(true)}
          />
        )}

        {/* ÉCRAN 2 : DIRECT */}
        {activeTab === 'direct' && (
          <LiveScreen
            cameras={cameras}
            cameraChoisie={cameraChoisie}
            onSelectCamera={setCameraChoisie}
            unreadCount={unreadCount}
            onNavigate={(targetTab) => setActiveTab(targetTab)}
            isDark={isDark}
            numeroGardiennerie={numeroGardiennerie}
          />
        )}

        {/* ÉCRAN 3 : ALERTES */}
        {activeTab === 'alerts' && (
          <AlertsScreen
            alerts={alerts}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            isLoading={isLoading}
            unreadCount={unreadCount}
            onNavigate={(targetTab) => setActiveTab(targetTab)}
            onVerifyAlert={handleVerifyAlert}
            onRejectAlert={handleRejectAlert}
            isDark={isDark}
            numeroGardiennerie={numeroGardiennerie}
          />
        )}

        {/* ÉCRAN 4 : PROFIL */}
        {activeTab === 'profile' && (
          <ProfileScreen
            currentUser={currentUser}
            serverStatus={networkError ? 'degrade' : 'operationnel'}
            onLogout={() => {
              setIsAuthenticated(false);
              setCurrentUser(null);
            }}
            themeMode={themeMode}
            onThemeChange={setThemeMode}
            unreadCount={unreadCount}
            onNavigate={(targetTab) => setActiveTab(targetTab)}
            isDark={isDark}
            numeroGardiennerie={numeroGardiennerie}
            onOpenEditNumero={() => setModalNumeroOuvert(true)}
          />
        )}
      </View>

      {/* MODALE D'ÉDITION DU NUMÉRO DE LA GARDIENNERIE */}
      <ModalNumeroGardiennerie
        visible={modalNumeroOuvert}
        onClose={() => setModalNumeroOuvert(false)}
        currentNumber={numeroGardiennerie}
        onSave={handleUpdateNumeroGardiennerie}
        isDark={isDark}
      />

      {/* BARRE DE NAVIGATION BASSE FIXE (Section 4) */}
      <BottomTabBar
        activeTab={activeTab}
        onTabPress={setActiveTab}
        unreadCount={unreadCount}
      />
    </SafeAreaView>
  );
}

export default function App() {
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === 'web' && width > 520;

  const appContent = (
    <SafeAreaProvider initialMetrics={initialWindowMetrics || undefined}>
      <MainApplication />
    </SafeAreaProvider>
  );

  if (isWebDesktop) {
    return (
      <View style={styles.webContainer}>
        {/* Barre supérieure discrète d'information de l'environnement */}
        <View style={styles.webInfoBar}>
          <View style={styles.webBrandRow}>
            <View style={styles.webLiveDot} />
            <Text style={styles.webBrandTitle}>PREVIA MOBILE • POSTE NOMADE</Text>
          </View>
          <Text style={styles.webBrandHint}>Simulateur 412×870</Text>
        </View>

        {/* Chassis smartphone ergonomique */}
        <View style={styles.phoneChassis}>
          {/* Bezel supérieur intégré */}
          <View style={styles.phoneTopBezel}>
            <View style={styles.phoneSpeaker} />
            <View style={styles.phoneCameraLens} />
          </View>

          {/* Écran du smartphone */}
          <View style={styles.phoneScreen}>
            {appContent}
          </View>

          {/* Bezel inférieur avec barre tactile */}
          <View style={styles.phoneBottomBezel}>
            <View style={styles.phoneHomeBar} />
          </View>
        </View>
      </View>
    );
  }

  return appContent;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  loginSafeArea: {
    flex: 1,
    backgroundColor: '#071d3a',
  },
  screenContainer: {
    flex: 1,
  },

  // STYLES DE LA SIMULATION SMARTPHONE SUR NAVIGATEUR DESKTOP
  webContainer: {
    flex: 1,
    backgroundColor: '#070D18',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    minHeight: '100vh',
  },
  webInfoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 420,
    marginBottom: 10,
    paddingHorizontal: 8,
  },
  webBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  webLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00E5FF',
  },
  webBrandTitle: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  webBrandHint: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '500',
  },
  phoneChassis: {
    width: 412,
    height: 870,
    maxHeight: '94vh',
    backgroundColor: '#111827',
    borderRadius: 44,
    borderWidth: 6,
    borderColor: '#1E293B',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 25 },
    shadowOpacity: 0.7,
    shadowRadius: 50,
    elevation: 25,
  },
  phoneTopBezel: {
    height: 24,
    backgroundColor: '#0F172A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    zIndex: 10,
  },
  phoneSpeaker: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#334155',
  },
  phoneCameraLens: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0284C7',
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  phoneScreen: {
    flex: 1,
    backgroundColor: '#111316',
    overflow: 'hidden',
  },
  phoneBottomBezel: {
    height: 16,
    backgroundColor: '#111316',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  phoneHomeBar: {
    width: 100,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
});
