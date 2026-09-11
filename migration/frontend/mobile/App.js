import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
  StatusBar,
  Linking,
  Alert,
  Platform,
  TextInput,
  LogBox,
  Modal,
  Switch
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets, initialWindowMetrics } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Rect, Line, Polyline, Polygon, Defs, LinearGradient, Stop, G } from 'react-native-svg';
import { useAudioPlayer } from 'expo-audio';
import { seConnecter, chargerVueEnsemble, listerAlertes, mapAlerteApi, useImageEnDirect, urlImageAlerte, arreterAlarme, reactiverAlarme } from './api';
import { useFluxDirect } from './lib/useFluxDirect';
import { FluxCamera } from './components/FluxCamera';

LogBox.ignoreLogs(['SafeAreaView has been deprecated']);

// Adresse mDNS (voir docker/mdns_previa.py côté serveur) plutôt qu'une
// IP dérivée de API_BASE : celle-ci change à chaque réseau, previa.local
// non — et c'est justement le but de tout ce chantier mDNS (voir la
// conversation). Le bouton "Plateforme web" ouvre la racine du site : la
// page se charge, l'auth guard du web renvoie vers /login si pas
// connecté, puis vers le tableau de bord une fois connecté — même
// comportement que si on tapait l'URL soi-même dans un navigateur.
// Marche nativement sur iOS/macOS/Linux (résolution `.local` gérée par
// l'OS) ; sur un téléphone Android sans Bonjour installé, ce lien peut
// ne pas s'ouvrir (le navigateur du téléphone ne résout pas `.local`
// tout seul, contrairement à notre app qui, elle, passe par
// react-native-zeroconf — voir api.js) : limite connue, pas encore de
// contournement pour un lien ouvert dans un navigateur externe.
const URL_PLATEFORME_WEB = 'https://previa.local:5173/';

const { width } = Dimensions.get('window');

// ==================== ICONS SVG VECTORIELLES ====================
const IconShieldCheck = ({ size = 18, color = "#019ee3" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <Polyline points="9 12 11 14 15 10" />
  </Svg>
);

const IconLock = ({ size = 18, color = "#94a3b8" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </Svg>
);

const IconFingerprint = ({ size = 20, color = "#019ee3" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
    <Path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
    <Path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
    <Path d="M2 12a10 10 0 0 1 18-6" />
    <Path d="M2 16h.01" />
    <Path d="M21.8 16c.2-2 .131-5.354 0-6" />
    <Path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
    <Path d="M8.65 22c.21-.66.45-1.32.57-2" />
    <Path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
  </Svg>
);

const IconEyeOff = ({ size = 18, color = "#94a3b8" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <Line x1="1" y1="1" x2="23" y2="23" />
  </Svg>
);

const IconArrowRight = ({ size = 18, color = "#ffffff" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <Line x1="5" y1="12" x2="19" y2="12" />
    <Polyline points="12 5 19 12 12 19" />
  </Svg>
);

const IconMail = ({ size = 18, color = "#94a3b8" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Rect width="20" height="16" x="2" y="4" rx="2" ry="2" />
    <Path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </Svg>
);

// ==================== COMPOSANT PAGE DE CONNEXION INSPIRÉE DU WEB ====================
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);

  // Pas d'inscription : un compte (admin ou user) est créé par un admin
  // (POST /utilisateurs/users, action réservée) — jamais par la
  // personne elle-même depuis cet écran, voir README/api.js.
  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      setErreur('Adresse e-mail et mot de passe requis.');
      return;
    }
    setErreur(null);
    setEnCours(true);
    try {
      const utilisateur = await seConnecter(email.trim(), password);
      onLogin(utilisateur);
    } catch (e) {
      setErreur(e.message || 'Connexion impossible.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <View style={styles.loginScreen}>
      <ScrollView contentContainerStyle={styles.loginScrollContent} showsVerticalScrollIndicator={false} bounces={false}>
        <Svg style={styles.loginBackgroundSvg} viewBox="0 0 500 900" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="loginBackgroundGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#1e5da0" />
              <Stop offset="48%" stopColor="#0d3666" />
              <Stop offset="100%" stopColor="#061a34" />
            </LinearGradient>
          </Defs>
          <Rect width="500" height="900" fill="url(#loginBackgroundGradient)" />
        </Svg>

        <View style={styles.loginSapphireHero}>
          <View style={styles.loginLogoBadge}>
            <Image source={require('./assets/logo_previa_clean.png')} style={styles.loginHeroLogo} resizeMode="contain" />
          </View>

          <View style={styles.loginHeroEyebrow}>
            <View style={styles.loginHeroEyebrowLine} />
            <Text style={styles.loginHeroEyebrowText}>SURVEILLANCE INTELLIGENTE</Text>
            <View style={styles.loginHeroEyebrowLine} />
          </View>

          <View style={styles.loginWaveDivider}>
            <Svg viewBox="0 0 500 50" preserveAspectRatio="none" style={{ width: '100%', height: 26 }}>
              <Path d="M0,0 C150,45 350,45 500,0 L500,50 L0,50 Z" fill="#edf7fd" />
            </Svg>
          </View>
        </View>

        {/* ZONE FORMULAIRE */}
        <View style={styles.loginFormArea}>
          <View style={styles.loginFormCard}>
            <View style={styles.loginFormHeader}>
              <Text style={styles.loginFormTitle}>Connexion</Text>
            </View>
            <View style={styles.loginInputBox}>
              <Text style={styles.loginInputLabel}>Adresse e-mail</Text>
              <View style={styles.loginInputWrap}>
                <View style={styles.loginInputLeadingIcon}>
                    <IconMail size={18} color="#ffffff" />
                </View>
                <TextInput
                  style={styles.loginTextInput}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="admin@previa.ai"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>
            </View>

            <View style={styles.loginInputBox}>
              <Text style={styles.loginInputLabel}>Mot de passe</Text>
              <View style={styles.loginInputWrap}>
                <View style={styles.loginInputLeadingIcon}>
                    <IconLock size={18} color="#ffffff" />
                </View>
                <TextInput
                  style={styles.loginTextInput}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#94a3b8"
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit}
                />
                <TouchableOpacity
                  style={styles.loginEyeBtn}
                  onPress={() => setShowPassword(!showPassword)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  hitSlop={8}
                >
                  {showPassword ? <IconEyeOff size={18} color="#6d8ca3" /> : <IconEye size={18} color="#6d8ca3" />}
                </TouchableOpacity>
              </View>
            </View>

            {erreur && (
              <View style={{ backgroundColor: '#fee2e2', borderRadius: 10, padding: 12, marginBottom: 4 }}>
                <Text style={{ color: '#dc2626', fontSize: 13, fontWeight: '600' }}>{erreur}</Text>
              </View>
            )}

            {/* BOUTON D'ACTION PRINCIPAL */}
            <TouchableOpacity
              style={[styles.loginPrimarySubmitBtn, enCours && { opacity: 0.7 }]}
              onPress={handleSubmit}
              activeOpacity={0.85}
              disabled={enCours}
              accessibilityRole="button"
              accessibilityLabel="Se connecter"
            >
              <Text style={styles.loginPrimarySubmitBtnText}>
                {enCours ? 'Connexion…' : "Se connecter"}
              </Text>
              <IconArrowRight size={18} color="#ffffff" />
            </TouchableOpacity>

          </View>
        </View>
      </ScrollView>
    </View>
  );
}


const IconBell = ({ size = 20, color = "#0f172a" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </Svg>
);

const IconEye = ({ size = 20, color = "#d97706" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <Circle cx="12" cy="12" r="3" />
  </Svg>
);

const IconPhone = ({ size = 18, color = "#ffffff" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </Svg>
);

const IconCheck = ({ size = 18, color = "#16a34a" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="20 6 9 17 4 12" />
  </Svg>
);

const IconRunner = ({ size = 20, color = "#dc2626" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="14" cy="4" r="2" />
    <Path d="M7 21l3-4 2-2 3 2 4 4" />
    <Path d="M12 12l2-4 3 2 2-1" />
    <Path d="M9 13l-3 3-3-1" />
  </Svg>
);

const IconBriefcase = ({ size = 18, color = "#009fe3" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
    <Path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </Svg>
);

const IconChevronRight = ({ size = 18, color = "#94a3b8" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="9 18 15 12 9 6" />
  </Svg>
);

const IconArrowLeft = ({ size = 20, color = "#0f172a" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <Line x1="19" y1="12" x2="5" y2="12" />
    <Polyline points="12 19 5 12 12 5" />
  </Svg>
);

const IconMoreHorizontal = ({ size = 20, color = "#0f172a" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="12" r="1.5" />
    <Circle cx="19" cy="12" r="1.5" />
    <Circle cx="5" cy="12" r="1.5" />
  </Svg>
);

const IconCalendar = ({ size = 15, color = "#64748b" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <Line x1="16" y1="2" x2="16" y2="6" />
    <Line x1="8" y1="2" x2="8" y2="6" />
    <Line x1="3" y1="10" x2="21" y2="10" />
  </Svg>
);

const IconClock = ({ size = 15, color = "#64748b" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="12" r="10" />
    <Polyline points="12 6 12 12 16 14" />
  </Svg>
);

const IconCamera = ({ size = 17, color = "#64748b" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <Circle cx="12" cy="13" r="4" />
  </Svg>
);

const IconMapPin = ({ size = 17, color = "#64748b" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <Circle cx="12" cy="10" r="3" />
  </Svg>
);

const IconMaximize = ({ size = 16, color = "#ffffff" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </Svg>
);

const IconSun = ({ size = 17, color = "#64748b" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="12" r="5" />
    <Line x1="12" y1="1" x2="12" y2="3" />
    <Line x1="12" y1="21" x2="12" y2="23" />
    <Line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <Line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <Line x1="1" y1="12" x2="3" y2="12" />
    <Line x1="21" y1="12" x2="23" y2="12" />
  </Svg>
);

const IconVolume2 = ({ size = 17, color = "#64748b" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <Path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
  </Svg>
);

const IconSquare = ({ size = 14, color = "#ffffff" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="2">
    <Rect x="5" y="5" width="14" height="14" rx="2" />
  </Svg>
);

const IconLayoutGrid = ({ size = 20, color = "#94a3b8" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Rect x="3" y="3" width="7" height="7" rx="1.5" />
    <Rect x="14" y="3" width="7" height="7" rx="1.5" />
    <Rect x="14" y="14" width="7" height="7" rx="1.5" />
    <Rect x="3" y="14" width="7" height="7" rx="1.5" />
  </Svg>
);

const IconUser = ({ size = 20, color = "#94a3b8" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <Circle cx="12" cy="7" r="4" />
  </Svg>
);

const IconMonitor = ({ size = 22, color = "#ffffff" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
    <Line x1="8" y1="21" x2="16" y2="21" />
    <Line x1="12" y1="17" x2="12" y2="21" />
  </Svg>
);

const IconExternalLink = ({ size = 18, color = "#ffffff" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <Polyline points="15 3 21 3 21 9" />
    <Line x1="10" y1="14" x2="21" y2="3" />
  </Svg>
);

const IconSettings = ({ size = 20, color = "#64748b" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="12" r="3" />
    <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Svg>
);

const IconInfo = ({ size = 20, color = "#64748b" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="12" r="10" />
    <Line x1="12" y1="16" x2="12" y2="12" />
    <Line x1="12" y1="8" x2="12.01" y2="8" />
  </Svg>
);

const IconLogOut = ({ size = 20, color = "#dc2626" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <Polyline points="16 17 21 12 16 7" />
    <Line x1="21" y1="12" x2="9" y2="12" />
  </Svg>
);

const IconMic = ({ size = 18, color = "#019ee3" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <Path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <Line x1="12" y1="19" x2="12" y2="23" />
    <Line x1="8" y1="23" x2="16" y2="23" />
  </Svg>
);

const IconCameraSnapshot = ({ size = 18, color = "#0f172a" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <Circle cx="12" cy="13" r="4" />
  </Svg>
);

const IconPower = ({ size = 18, color = "#dc2626" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
    <Line x1="12" y1="2" x2="12" y2="12" />
  </Svg>
);

const IconX = ({ size = 18, color = "#64748b" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <Line x1="18" y1="6" x2="6" y2="18" />
    <Line x1="6" y1="6" x2="18" y2="18" />
  </Svg>
);

// ==================== COMPOSANT LOGO OFFICIEL PREVIA ====================
const PreviaHeaderLogo = () => (
  <View style={styles.logoContainer}>
    <Image 
      source={require('./assets/logo_previa_transparent.png')} 
      style={styles.headerLogoImg} 
      resizeMode="contain" 
    />
  </View>
);

// ==================== EN-TÊTE PREVIA ====================
const AppWaveHeader = ({ unreadCount = 0, onOpenNotifications, onOpenProfile }) => (
  <View style={styles.appWaveHeader}>
    <View style={styles.waveHeaderOverlay}>
      <View style={styles.waveHeaderBrand}>
        <Image
          source={require('./assets/logo_previa_transparent.png')}
          style={styles.waveHeaderLogo}
          resizeMode="contain"
          accessibilityLabel="Previa"
        />
      </View>
      <View style={styles.waveHeaderActions}>
        <TouchableOpacity 
          style={styles.waveHeaderIconBtn} 
          onPress={onOpenNotifications} 
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
        >
          <IconBell size={22} color="#087fb5" />
          {unreadCount > 0 && (
            <View style={styles.waveBellBadge}>
              <Text style={styles.waveBellBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.waveHeaderIconBtn} 
          onPress={onOpenProfile} 
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Profil"
        >
          <IconUser size={22} color="#087fb5" />
        </TouchableOpacity>
      </View>
    </View>
  </View>
);

// ==================== DONNÉES ====================
// Repli quand aucune vraie alerte n'est encore arrivée (voir GET
// /alertes côté api.js) — évite un `alerts[0]` undefined plutôt que
// d'inventer une fausse alerte comme avant (voir MainApp,
// currentDetailAlert).
const PLACEHOLDER_ALERT = {
  id: 'aucune',
  idCamera: null,
  title: 'Aucune alerte',
  criticite: '',
  criticiteColor: '#94a3b8',
  camera: '—',
  emplacement: 'Aucune caméra en alerte pour le moment',
  time: '--:--',
  date: '',
  fullTime: '--:--:--',
  iconType: 'briefcase',
  enCours: false,
  alarmLumiere: false,
  sirene: false,
};

function MainApp() {
  const insets = useSafeAreaInsets();
  // Sur Android, la barre de boutons système mesure entre 48 et 64dp. On garantit une marge minimale.
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 48 : 16);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('alerte'); // 'alerte' | 'plateforme' | 'profil'
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [alerts, setAlerts] = useState([]);
  // Toutes les caméras réelles (voir GET /vue-ensemble) — utilisées pour
  // le sélecteur du "Moniteur en direct" (onglet Plateforme), qui n'est
  // rattaché à aucune alerte précise. `cameraChoisie` = id sélectionné ;
  // reste `null` tant qu'aucune caméra n'a encore été chargée, puis se
  // fixe sur la première trouvée UNE SEULE fois (l'utilisateur peut
  // ensuite changer librement sans que le polling de 5s ne le lui
  // remette à zéro).
  const [camerasDisponibles, setCamerasDisponibles] = useState([]);
  const [cameraChoisie, setCameraChoisie] = useState(null);

  // Nouveaux états interactifs
  const [unreadCount, setUnreadCount] = useState(3);
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  // Modales interactives (profil, réglages, déconnexion)
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [settingsModal, setSettingsModal] = useState(null); // 'about' | null
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [settingSound, setSettingSound] = useState(true);

  // Son d'alarme réel (voir assets/alerte.wav) — le réglage "Son de
  // l'alarme" (Profil > Paramètres) commande vraiment la lecture.
  const lecteurAlerte = useAudioPlayer(require('./assets/alerte.wav'));
  // null = pas encore chargé une première fois. Sert à ne sonner que
  // pour une VRAIE nouveauté (nouvel id d'alerte jamais vu), pas à
  // chaque relecture des mêmes alertes toutes les 5s — sauf au tout
  // premier chargement, où l'on sonne s'il y a déjà une alerte active
  // (on vient d'ouvrir l'app sur un incident en cours, il faut le
  // signaler).
  const idsAlertesConnuesRef = useRef(null);

  // Alertes réelles (voir api.js/mapAlerteApi) — chargées à la connexion
  // puis rafraîchies toutes les 5s, comme le tableau de bord web
  // (INTERVALLE_MS dans admin.jsx).
  useEffect(() => {
    if (!isAuthenticated) { idsAlertesConnuesRef.current = null; return; }
    let annule = false;
    const charger = () => {
      listerAlertes()
        .then((brut) => {
          if (annule) return;
          const mappees = brut.map(mapAlerteApi);
          setAlerts(mappees);

          const dejaChargeUneFois = idsAlertesConnuesRef.current !== null;
          const nouvelleAlerte = dejaChargeUneFois
            ? mappees.some((a) => !idsAlertesConnuesRef.current.has(a.id))
            : mappees.length > 0;
          if (nouvelleAlerte && settingSound) {
            // `loop = true` : sonne EN CONTINU tant que personne n'a
            // appuyé sur "Arrêter l'alerte" (voir handleStopAlert) — pas
            // juste une fois, sinon une alerte non vue reste silencieuse
            // au bout de 2s.
            try { lecteurAlerte.loop = true; lecteurAlerte.seekTo(0); lecteurAlerte.play(); } catch (e) { /* lecteur pas encore prêt, pas grave */ }
          }
          idsAlertesConnuesRef.current = new Set(mappees.map((a) => a.id));
        })
        .catch(() => {});
      chargerVueEnsemble()
        .then((v) => {
          if (annule || !v.cameras) return;
          setCamerasDisponibles(v.cameras);
          setCameraChoisie((actuelle) => actuelle || v.cameras[0]?.id_camera || null);
        })
        .catch(() => {});
    };
    charger();
    const id = setInterval(charger, 5000);
    return () => { annule = true; clearInterval(id); };
  }, [isAuthenticated, settingSound]);

  const currentDetailAlert = selectedAlert || alerts[0] || PLACEHOLDER_ALERT;

  // Vraie vidéo WebRTC (voir lib/useFluxDirect.js, Infrastructure/
  // signalisation_webrtc.py côté backend) — même protocole que le web,
  // via react-native-webrtc. Retombe sur useImageEnDirect (fetch ~1x/s,
  // voir api.js) tant que la connexion n'est pas établie (caméra pas
  // encore en train d'émettre, négociation en cours...). Le détail
  // d'alerte n'en a PLUS besoin (voir plus bas, urlImageAlerte —
  // instantané au moment de l'alerte, pas le live) : seul le "Moniteur
  // en direct" (onglet Plateforme) reste en vrai direct, sur la caméra
  // choisie via le sélecteur.
  const streamMoniteurEnDirect = useFluxDirect(cameraChoisie);
  const imageMoniteurEnDirect = useImageEnDirect(cameraChoisie);

  // Repli si l'instantané d'une alerte n'existe pas (404 — voir
  // api.js/urlImageAlerte) : réinitialisé à chaque alerte affichée pour
  // retenter le chargement plutôt que de rester bloqué sur l'échec
  // d'une alerte précédente.
  const [imageAlerteIntrouvable, setImageAlerteIntrouvable] = useState(false);
  useEffect(() => { setImageAlerteIntrouvable(false); }, [currentDetailAlert.id]);

  const sourceFluxCamera = (dataUri) =>
    dataUri ? { uri: dataUri } : require('./assets/logo_previa_clean.png');

  const handleStopAlert = () => {
    try { lecteurAlerte.pause(); } catch (e) { /* pas grave */ }
    // Vraie commande backend maintenant (voir api.js/arreterAlarme) —
    // un ESP32 réel (migration/arduino/esp.ino) coupe la lampe et la
    // sirène au prochain polling. Ne bloque pas l'UI sur le réseau :
    // l'affichage local change tout de suite, la requête part en
    // parallèle.
    arreterAlarme().catch(() => { /* réseau indisponible, pas grave — l'ESP32 gardera son dernier état connu */ });
    setAlerts(prev => prev.map(a => a.id === currentDetailAlert.id ? { ...a, enCours: false, alarmLumiere: false, sirene: false } : a));
    if (selectedAlert) {
      setSelectedAlert(prev => ({ ...prev, enCours: false, alarmLumiere: false, sirene: false }));
    }
  };

  const handleRearmAlert = () => {
    if (settingSound) {
      try { lecteurAlerte.loop = true; lecteurAlerte.seekTo(0); lecteurAlerte.play(); } catch (e) { /* pas grave */ }
    }
    reactiverAlarme().catch(() => { /* réseau indisponible, pas grave */ });
    setAlerts(prev => prev.map(a => a.id === currentDetailAlert.id ? { ...a, enCours: true, alarmLumiere: true, sirene: true } : a));
    if (selectedAlert) {
      setSelectedAlert(prev => ({ ...prev, enCours: true, alarmLumiere: true, sirene: true }));
    }
  };

  const handleCallGuard = () => {
    Linking.openURL("tel:+22675291328").catch(() => {});
  };

  const handleBellPress = () => {
    setUnreadCount(0);
    setActiveTab('alerte');
    setSelectedAlert(null);
  };

  const handleAccountPress = () => {
    setAccountModalOpen(true);
  };

  const handleAboutPress = () => {
    setSettingsModal('about');
  };

  const handleOptionsPress = () => {
    Alert.alert(
      "Options de l'incident",
      undefined,
      [
        { 
          text: "Appeler la gardiennerie", 
          onPress: handleCallGuard 
        },
        { 
          text: "Signaler une fausse alerte", 
          onPress: () => { 
            handleStopAlert(); 
            setSelectedAlert(null);
          } 
        },
        { text: "Annuler", style: "cancel" }
      ]
    );
  };

  const renderAlertIcon = (type) => {
    switch (type) {
      case 'runner':
        return (
          <View style={[styles.alertIconBox, styles.iconRed]}>
            <IconRunner size={18} color="#dc2626" />
          </View>
        );
      case 'eye':
        return (
          <View style={[styles.alertIconBox, styles.iconAmber]}>
            <IconEye size={18} color="#d97706" />
          </View>
        );
      case 'briefcase':
      default:
        return (
          <View style={[styles.alertIconBox, styles.iconBlue]}>
            <IconBriefcase size={18} color="#009fe3" />
          </View>
        );
    }
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: '#071d3a', paddingBottom: bottomInset }]}> 
        <StatusBar barStyle="light-content" backgroundColor="#071d3a" />
        <LoginScreen onLogin={(utilisateur) => { setCurrentUser(utilisateur); setIsAuthenticated(true); }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f6fb" />
      <AppWaveHeader
        unreadCount={unreadCount}
        onOpenNotifications={handleBellPress}
        onOpenProfile={() => setActiveTab('profil')}
      />

      {/* ==================== ÉCRAN 1 : ACCUEIL DES ALERTES ==================== */}
      {activeTab === 'alerte' && !selectedAlert && (
        <View style={styles.tabScreenWrapper}>
          <ScrollView 
            style={styles.scrollContainer} 
            contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset + 100 }]} 
            showsVerticalScrollIndicator={false}
          >

          {/* SECTION : INCIDENT EN COURS ÉPURÉE */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Incident en cours</Text>
              {currentDetailAlert.enCours ? (
                <View style={styles.liveIncidentPill}>
                  <View style={styles.livePulseDotRed} />
                  <Text style={styles.liveIncidentText}>1 ACTIF</Text>
                </View>
              ) : (
                <View style={styles.secureIncidentPill}>
                  <Text style={styles.secureIncidentText}>SITE SÉCURISÉ</Text>
                </View>
              )}
            </View>

            {currentDetailAlert.enCours ? (
              <View style={styles.activeIncidentCard}>
                <View style={styles.incidentCardBody}>
                  <View style={styles.incidentTitleRow}>
                    <View style={styles.incidentTitleGroup}>
                      <Text style={styles.incidentHeadline}>{currentDetailAlert.title}</Text>
                      <Text style={styles.incidentTimeSub}>{currentDetailAlert.time}</Text>
                    </View>
                    <View style={[styles.critBadge, { backgroundColor: currentDetailAlert.criticiteColor }]}>
                      <Text style={styles.critBadgeText}>{currentDetailAlert.criticite}</Text>
                    </View>
                  </View>

                  {/* BOUTONS D'ACTION */}
                  <View style={{ gap: 8, marginTop: 4 }}>
                    <TouchableOpacity style={styles.btnStopAlert} onPress={handleStopAlert} activeOpacity={0.85}>
                      <IconSquare size={13} color="#ffffff" />
                      <Text style={styles.btnStopAlertText}>Arrêter l'alerte</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.btnCallGuard} onPress={handleCallGuard} activeOpacity={0.85}>
                      <IconPhone size={14} color="#ffffff" />
                      <Text style={styles.btnCallGuardText}>Appeler la gardiennerie</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.incidentResolvedCard}>
                <View style={styles.resolvedIconCircle}>
                  <IconCheck size={22} color="#16a34a" />
                </View>
                <View style={styles.resolvedContent}>
                  <Text style={styles.resolvedTitle}>Site sous contrôle</Text>
                  <Text style={styles.resolvedSub}>Dissuasion éteinte, surveillance active.</Text>
                </View>
                <TouchableOpacity style={styles.btnRearmSmall} onPress={handleRearmAlert}>
                  <Text style={styles.btnRearmSmallText}>Réarmer</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* SECTION : ALERTES RÉCENTES DANS UN GROUPE ÉPURÉ */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Alertes récentes</Text>
              <TouchableOpacity onPress={() => setShowAllAlerts(prev => !prev)} activeOpacity={0.7}>
                <Text style={styles.sectionLink}>{showAllAlerts ? "Réduire" : "Voir tout"}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.alertsGroupCard}>
              {(showAllAlerts ? alerts : alerts.slice(0, 2)).map((al, idx) => (
                <TouchableOpacity 
                  key={al.id} 
                  style={[styles.alertItemRow, idx === (showAllAlerts ? alerts.length - 1 : 1) && { borderBottomWidth: 0 }]}
                  onPress={() => setSelectedAlert(al)}
                  activeOpacity={0.7}
                >
                  {renderAlertIcon(al.iconType)}

                  <View style={styles.alertRowCenter}>
                    <View style={styles.alertTitleRow}>
                      <Text style={styles.alertTitle}>{al.title}</Text>
                      <View style={[styles.critBadge, { backgroundColor: al.criticiteColor }]}>
                        <Text style={styles.critBadgeText}>{al.criticite}</Text>
                      </View>
                    </View>
                    <Text style={styles.alertMeta} numberOfLines={1}>{al.camera}, {al.emplacement}</Text>
                  </View>

                  <View style={styles.alertRowRight}>
                    <Text style={styles.alertTimeInline}>{al.time}</Text>
                    <IconChevronRight size={16} color="#cbd5e1" />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
        </View>
      )}

      {/* ==================== ÉCRAN 2 : DÉTAIL DE L'ALERTE ==================== */}
      {activeTab === 'alerte' && selectedAlert && (
        <ScrollView 
          style={styles.scrollContainer} 
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset + 100 }]} 
          showsVerticalScrollIndicator={false}
        >
          {/* DETAIL TOP NAV */}
          <View style={styles.detailNavRow}>
            <TouchableOpacity style={styles.detailBackBtn} onPress={() => setSelectedAlert(null)} activeOpacity={0.75}>
              <IconArrowLeft size={20} color="#0f172a" />
            </TouchableOpacity>
            <Text style={styles.detailScreenTitle}>Détail de l'alerte</Text>
            <TouchableOpacity style={styles.detailBackBtn} onPress={handleOptionsPress} activeOpacity={0.75}>
              <IconMoreHorizontal size={20} color="#0f172a" />
            </TouchableOpacity>
          </View>

          {/* ALERT HEADER CARD */}
          <View style={styles.detailHeaderCard}>
            <View style={styles.detailIconCircle}>
              <IconRunner size={22} color="#ffffff" />
            </View>
            <View style={styles.detailHeaderInfo}>
              <View style={styles.detailBadgeRow}>
                <Text style={styles.detailCritText}>{currentDetailAlert.criticite}</Text>
                <View style={currentDetailAlert.enCours ? styles.badgeEnCours : styles.badgeResolue}>
                  <Text style={styles.badgeEnCoursText}>
                    {currentDetailAlert.enCours ? "EN COURS" : "RÉSOLUE"}
                  </Text>
                </View>
              </View>
              <Text style={styles.detailAlertTitle}>{currentDetailAlert.title}</Text>
              <Text style={styles.detailAlertLoc}>{currentDetailAlert.camera}, {currentDetailAlert.emplacement}</Text>
              <View style={styles.detailTsRow}>
                <View style={styles.detailTsItem}>
                  <IconCalendar size={14} color="#64748b" />
                  <Text style={styles.detailTsText}>{currentDetailAlert.date}</Text>
                </View>
                <View style={styles.detailTsItem}>
                  <IconClock size={14} color="#64748b" />
                  <Text style={styles.detailTsText}>{currentDetailAlert.fullTime}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* INSTANTANÉ AU MOMENT DE L'ALERTE — pas le live (voir
              api.js, urlImageAlerte) : ce qui a déclenché CETTE alerte,
              pas ce que montre la caméra maintenant, potentiellement
              sans rapport si on consulte une alerte ancienne. */}
          <View style={styles.detailVideoCard}>
            {imageAlerteIntrouvable ? (
              <View style={[styles.detailVideoImg, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' }]}>
                <IconCamera size={28} color="#64748b" />
                <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>Aucun instantané disponible</Text>
              </View>
            ) : (
              <Image
                source={{ uri: urlImageAlerte(currentDetailAlert.id) }}
                style={styles.detailVideoImg}
                onError={() => setImageAlerteIntrouvable(true)}
              />
            )}
            <View style={styles.videoBadgeLive}>
              <Text style={styles.liveText}>Instantané · {currentDetailAlert.fullTime}</Text>
            </View>
          </View>

          {/* INFORMATIONS */}
          <View style={styles.detailSection}>
            <Text style={styles.detailBlockTitle}>Informations</Text>
            <View style={styles.detailCard}>
              <View style={styles.detailInfoRow}>
                <View style={styles.infoLabelGroup}>
                  <IconCamera size={16} color="#64748b" />
                  <Text style={styles.infoLabelText}>Caméra</Text>
                </View>
                <Text style={styles.infoValStrong}>{currentDetailAlert.camera}</Text>
              </View>

              <View style={styles.detailInfoRow}>
                <View style={styles.infoLabelGroup}>
                  <IconMapPin size={16} color="#64748b" />
                  <Text style={styles.infoLabelText}>Emplacement</Text>
                </View>
                <Text style={styles.infoValText}>{currentDetailAlert.emplacement}</Text>
              </View>

              <View style={styles.detailInfoRow}>
                <View style={styles.infoLabelGroup}>
                  <IconRunner size={16} color="#64748b" />
                  <Text style={styles.infoLabelText}>Comportement</Text>
                </View>
                <Text style={styles.infoValText}>{currentDetailAlert.title}</Text>
              </View>

              <View style={[styles.detailInfoRow, { borderBottomWidth: 0 }]}>
                <View style={styles.infoLabelGroup}>
                  <IconBell size={16} color="#64748b" />
                  <Text style={styles.infoLabelText}>Niveau de criticité</Text>
                </View>
                <View style={[styles.critPill, { backgroundColor: currentDetailAlert.criticiteColor }]}>
                  <Text style={styles.critPillText}>Critique</Text>
                </View>
              </View>
            </View>
          </View>

          {/* ÉQUIPEMENTS ACTIVÉS */}
          <View style={styles.detailSection}>
            <Text style={styles.detailBlockTitle}>Équipements activés</Text>
            <View style={styles.detailCard}>
              <View style={styles.detailInfoRow}>
                <View style={styles.infoLabelGroup}>
                  <IconSun size={17} color="#64748b" />
                  <Text style={styles.infoLabelText}>Alarme & Lumière</Text>
                </View>
                <View style={styles.statusGroup}>
                  <View style={[styles.statusDot, currentDetailAlert.alarmLumiere ? styles.dotActive : styles.dotInactive]} />
                  <Text style={currentDetailAlert.alarmLumiere ? styles.statusActiveText : styles.statusInactiveText}>
                    {currentDetailAlert.alarmLumiere ? 'Active' : 'Désactivée'}
                  </Text>
                </View>
              </View>

              <View style={[styles.detailInfoRow, { borderBottomWidth: 0 }]}>
                <View style={styles.infoLabelGroup}>
                  <IconVolume2 size={17} color="#64748b" />
                  <Text style={styles.infoLabelText}>Sirène</Text>
                </View>
                <View style={styles.statusGroup}>
                  <View style={[styles.statusDot, currentDetailAlert.sirene ? styles.dotActive : styles.dotInactive]} />
                  <Text style={currentDetailAlert.sirene ? styles.statusActiveText : styles.statusInactiveText}>
                    {currentDetailAlert.sirene ? 'Active' : 'Désactivée'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* BOUTONS D'ACTION */}
          <View style={styles.actionContainer}>
            {currentDetailAlert.enCours ? (
              <View style={{ gap: 8, width: '100%' }}>
                <TouchableOpacity style={styles.btnStopAlert} onPress={handleStopAlert} activeOpacity={0.85}>
                  <IconSquare size={14} color="#ffffff" />
                  <Text style={styles.btnStopAlertText}>Arrêter l'alerte</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnCallGuard} onPress={handleCallGuard} activeOpacity={0.85}>
                  <IconPhone size={16} color="#ffffff" />
                  <Text style={styles.btnCallGuardText}>Appeler la gardiennerie</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 8, width: '100%' }}>
                <TouchableOpacity style={styles.btnRearmAlert} onPress={handleRearmAlert} activeOpacity={0.85}>
                  <IconCheck size={18} color="#ffffff" />
                  <Text style={styles.btnStopAlertText}>Réarmer la surveillance</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnCallGuardSecondary} onPress={handleCallGuard} activeOpacity={0.85}>
                  <IconPhone size={15} color="#009fe3" />
                  <Text style={styles.btnCallGuardSecondaryText}>Appeler la gardiennerie</Text>
                </TouchableOpacity>
              </View>
            )}

            {!currentDetailAlert.enCours && (
              <View style={styles.actionSubRow}>
                <IconCheck size={14} color="#16a34a" />
                <Text style={styles.actionSubText}>
                  Surveillance active, tout est calme.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* ==================== ÉCRAN 3 : TAB PLATEFORME ==================== */}
      {activeTab === 'plateforme' && (
        <View style={styles.tabScreenWrapper}>
          <ScrollView 
            style={styles.scrollContainer} 
            contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset + 100 }]} 
            showsVerticalScrollIndicator={false}
          >

          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Moniteur en direct</Text>

            {camerasDisponibles.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 10 }}
                contentContainerStyle={{ gap: 8, paddingRight: 4 }}
              >
                {camerasDisponibles.map((cam) => {
                  const choisie = cam.id_camera === cameraChoisie;
                  return (
                    <TouchableOpacity
                      key={cam.id_camera}
                      onPress={() => setCameraChoisie(cam.id_camera)}
                      activeOpacity={0.8}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 14,
                        borderRadius: 20,
                        backgroundColor: choisie ? '#009fe3' : '#f1f5f9',
                        borderWidth: 1,
                        borderColor: choisie ? '#009fe3' : '#e2e8f0',
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: choisie ? '#ffffff' : '#334155' }}>
                        {cam.num || cam.id_camera}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <View style={styles.detailVideoCard}>
              <FluxCamera stream={streamMoniteurEnDirect} imageSource={sourceFluxCamera(imageMoniteurEnDirect)} style={styles.detailVideoImg} />
              <View style={styles.videoBadgeLive}>
                <View style={styles.livePulseDot} />
                <Text style={styles.liveText}>EN DIRECT (HD)</Text>
              </View>
            </View>

          </View>

          <View style={styles.sectionContainer}>
            <TouchableOpacity 
              style={styles.webPlatformCard} 
              onPress={() => URL_PLATEFORME_WEB && Linking.openURL(URL_PLATEFORME_WEB)}
              activeOpacity={0.85}
            >
              <View style={styles.webIconCircle}>
                <IconMonitor size={24} color="#ffffff" />
              </View>
              <View style={styles.webTextContainer}>
                <Text style={styles.webTitle}>Plateforme web</Text>
                <Text style={styles.webSubtitle}>Accéder à la plateforme complète</Text>
              </View>
              <IconExternalLink size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </ScrollView>
        </View>
      )}

      {/* ==================== ÉCRAN 4 : TAB PROFIL ==================== */}
      {activeTab === 'profil' && (
        <View style={styles.tabScreenWrapper}>
          <ScrollView 
            style={styles.scrollContainer} 
            contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset + 100 }]} 
            showsVerticalScrollIndicator={false}
          >

          {/* CARTE UTILISATEUR */}
          <TouchableOpacity style={styles.agentCard} onPress={handleAccountPress} activeOpacity={0.8}>
            <View style={styles.avatarCircle}>
              <IconUser size={28} color="#019ee3" />
            </View>
            <View style={styles.agentInfo}>
              <Text style={styles.agentName}>{currentUser ? `${currentUser.prenom} ${currentUser.nom}` : 'Responsable Sécurité'}</Text>
              <Text style={styles.agentEmail}>{currentUser?.email || ''}</Text>
            </View>
            <IconChevronRight size={20} color="#94a3b8" />
          </TouchableOpacity>

          {/* BANNIÈRE WEB */}
          <View style={styles.sectionContainer}>
            <TouchableOpacity 
              style={styles.webPlatformCard} 
              onPress={() => URL_PLATEFORME_WEB && Linking.openURL(URL_PLATEFORME_WEB)}
              activeOpacity={0.85}
            >
              <View style={styles.webIconCircle}>
                <IconMonitor size={24} color="#ffffff" />
              </View>
              <View style={styles.webTextContainer}>
                <Text style={styles.webTitle}>Plateforme web</Text>
                <Text style={styles.webSubtitle}>Accéder à la plateforme complète</Text>
              </View>
              <IconExternalLink size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* PARAMÈTRES */}
          <View style={styles.sectionContainer}>
            <Text style={styles.settingsTitle}>PARAMÈTRES</Text>
            <View style={styles.settingsCard}>
              <View style={styles.settingsRow}>
                <View style={styles.settingsRowLeft}>
                  <IconBell size={20} color="#64748b" />
                  <Text style={styles.settingsRowText}>Son de l'alarme</Text>
                </View>
                <Switch
                  value={settingSound}
                  onValueChange={setSettingSound}
                  trackColor={{ false: '#cbd5e1', true: '#bae6fd' }}
                  thumbColor={settingSound ? '#0284c7' : '#f8fafc'}
                />
              </View>

              <TouchableOpacity
                style={[styles.settingsRow, { borderBottomWidth: 0 }]}
                onPress={() => setSettingsModal('about')}
                activeOpacity={0.7}
              >
                <View style={styles.settingsRowLeft}>
                  <IconInfo size={20} color="#64748b" />
                  <Text style={styles.settingsRowText}>À propos de Previa</Text>
                </View>
                <IconChevronRight size={18} color="#94a3b8" />
              </TouchableOpacity>
            </View>
          </View>

          {/* DÉCONNEXION */}
          <View style={styles.sectionContainer}>
            <TouchableOpacity 
              style={styles.logoutBtn} 
              onPress={() => setLogoutConfirmOpen(true)}
              activeOpacity={0.8}
            >
              <IconLogOut size={20} color="#dc2626" />
              <Text style={styles.logoutText}>Déconnexion</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        </View>
      )}

      {/* ==================== BARRE DE NAVIGATION FLOTTANTE ==================== */}
      <View style={[styles.floatingNavWrapper, { paddingBottom: bottomInset + 8 }]}>
        <View style={styles.floatingNavBar}>
          {/* TAB 1 : ALERTE */}
          <TouchableOpacity
            style={[styles.floatingTab, activeTab === 'alerte' && styles.floatingTabActive]}
            onPress={() => {
              setActiveTab('alerte');
              setSelectedAlert(null);
            }}
            activeOpacity={0.8}
          >
            <View style={styles.tabIconWrap}>
              <IconBell size={20} color={activeTab === 'alerte' ? "#ffffff" : "#94a3b8"} />
              {activeTab !== 'alerte' && unreadCount > 0 && <View style={styles.tabRedDot} />}
            </View>
            <Text style={[styles.tabLabel, activeTab === 'alerte' && styles.tabLabelActive]}>Alerte</Text>
          </TouchableOpacity>

          {/* TAB 2 : PLATEFORME */}
          <TouchableOpacity
            style={[styles.floatingTab, activeTab === 'plateforme' && styles.floatingTabActive]}
            onPress={() => {
              setActiveTab('plateforme');
              setSelectedAlert(null);
            }}
            activeOpacity={0.8}
          >
            <IconLayoutGrid size={20} color={activeTab === 'plateforme' ? "#ffffff" : "#94a3b8"} />
            <Text style={[styles.tabLabel, activeTab === 'plateforme' && styles.tabLabelActive]}>Plateforme</Text>
          </TouchableOpacity>

          {/* TAB 3 : PROFIL */}
          <TouchableOpacity
            style={[styles.floatingTab, activeTab === 'profil' && styles.floatingTabActive]}
            onPress={() => {
              setActiveTab('profil');
              setSelectedAlert(null);
            }}
            activeOpacity={0.8}
          >
            <IconUser size={20} color={activeTab === 'profil' ? "#ffffff" : "#94a3b8"} />
            <Text style={[styles.tabLabel, activeTab === 'profil' && styles.tabLabelActive]}>Profil</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ========================================================================= */}
      {/* MODALE 1 : MON COMPTE                                                     */}
      {/* ========================================================================= */}
      <Modal
        visible={accountModalOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setAccountModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalBackdropTouch} 
            activeOpacity={1} 
            onPress={() => setAccountModalOpen(false)} 
          />
          <View style={[styles.modalSheet, { paddingBottom: bottomInset + 16 }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Mon compte</Text>
              <TouchableOpacity 
                style={styles.modalCloseBtn} 
                onPress={() => setAccountModalOpen(false)}
              >
                <IconX size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.modalNotifItem}>
                <View style={[styles.avatarCircle, { backgroundColor: '#e0f2fe', width: 44, height: 44, borderRadius: 22 }]}>
                  <IconUser size={24} color="#009fe3" />
                </View>
                <View style={styles.modalNotifBody}>
                  <Text style={styles.modalNotifTitle}>{currentUser ? `${currentUser.prenom} ${currentUser.nom}` : 'Responsable Sécurité'}</Text>
                  <Text style={[styles.modalNotifDesc, { color: '#009fe3', fontWeight: '600' }]}>{currentUser?.email || ''}</Text>
                </View>
                <View style={styles.modalStatusPill}>
                  <Text style={styles.modalStatusPillText}>CONNECTÉ</Text>
                </View>
              </View>

              <View style={styles.modalNotifItem}>
                <View style={styles.modalNotifBody}>
                  <Text style={styles.modalNotifTitle}>Statut de la session</Text>
                  <Text style={styles.modalNotifDesc}>Session active et sécurisée sur cet appareil</Text>
                </View>
              </View>

              <View style={styles.modalNotifItem}>
                <View style={styles.modalNotifBody}>
                  <Text style={styles.modalNotifTitle}>Accès & autorisations</Text>
                  <Text style={styles.modalNotifDesc}>Accès complet à la surveillance, aux caméras et aux alertes</Text>
                </View>
              </View>

              <TouchableOpacity 
                style={styles.modalPrimaryBtn} 
                onPress={() => setAccountModalOpen(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.modalPrimaryBtnText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODALE : À PROPOS DE PREVIA                                               */}
      {/* ========================================================================= */}
      <Modal
        visible={settingsModal === 'about'}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSettingsModal(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalBackdropTouch} 
            activeOpacity={1} 
            onPress={() => setSettingsModal(null)} 
          />
          <View style={[styles.modalSheet, { paddingBottom: bottomInset + 16 }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>À propos de Previa</Text>
              <TouchableOpacity 
                style={styles.modalCloseBtn} 
                onPress={() => setSettingsModal(null)}
              >
                <IconX size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.aboutCenter}>
                <Text style={styles.aboutTitle}>PREVIA Sécurité</Text>
                <View style={styles.aboutVersionBadge}>
                  <Text style={styles.aboutVersionText}>Version 2.4</Text>
                </View>
                <Text style={styles.aboutDesc}>
                  Surveillance et alertes de sécurité en temps réel.
                </Text>
              </View>

              <View style={styles.aboutInfoBox}>
                <View style={styles.aboutInfoRow}>
                  <Text style={styles.aboutInfoLabel}>Statut</Text>
                  <Text style={styles.aboutInfoValGreen}>Connecté et sécurisé</Text>
                </View>
                <View style={[styles.aboutInfoRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.aboutInfoLabel}>Assistance</Text>
                  <Text style={styles.aboutInfoVal}>support@previa.ai</Text>
                </View>
              </View>

              <TouchableOpacity 
                style={styles.modalPrimaryBtn} 
                onPress={() => setSettingsModal(null)}
                activeOpacity={0.85}
              >
                <Text style={styles.modalPrimaryBtnText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODALE 4 : CONFIRMER LA DÉCONNEXION                                        */}
      {/* ========================================================================= */}
      <Modal
        visible={logoutConfirmOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setLogoutConfirmOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalBackdropTouch} 
            activeOpacity={1} 
            onPress={() => setLogoutConfirmOpen(false)} 
          />
          <View style={[styles.modalSheet, { paddingBottom: bottomInset + 16 }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Confirmer la déconnexion</Text>
              <TouchableOpacity 
                style={styles.modalCloseBtn} 
                onPress={() => setLogoutConfirmOpen(false)}
              >
                <IconX size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.modalSubtitle}>
                Voulez-vous vraiment clôturer votre session sécurisée sur cet appareil ?
              </Text>

              <TouchableOpacity 
                style={styles.modalDangerBtn} 
                onPress={() => {
                  setLogoutConfirmOpen(false);
                  setIsAuthenticated(false);
                  setCurrentUser(null);
                }}
                activeOpacity={0.85}
              >
                <IconLogOut size={18} color="#ffffff" />
                <Text style={styles.modalDangerBtnText}>Se déconnecter</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.modalSecondaryBtn} 
                onPress={() => setLogoutConfirmOpen(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.modalSecondaryBtnText}>Annuler</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <MainApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f4f8fb',
    paddingTop: Platform.OS === 'android' ? Math.max(StatusBar.currentHeight || 0, 16) : 0,
  },
  tabScreenWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
  },
  scrollContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'android' ? 140 : 120,
  },
  appWaveHeader: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    marginTop: width <= 500 ? -26 : 0,
    height: 60,
    backgroundColor: '#f4f8fb',
    borderBottomWidth: 1,
    borderBottomColor: '#e1edf3',
    zIndex: 10,
  },
  waveHeaderOverlay: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  waveHeaderBrand: {
    justifyContent: 'center',
  },
  waveHeaderLogo: {
    width: 116,
    height: 30,
  },
  waveHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto',
    zIndex: 1,
  },
  waveHeaderIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveBellBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveBellBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  headerBrandWrap: {
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  logoContainer: {
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerLogoImg: {
    width: 120,
    height: 28,
  },
  logoTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  logoSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    marginTop: -2,
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerAgentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 20,
    paddingVertical: 4,
    paddingLeft: 5,
    paddingRight: 10,
  },
  agentAvatarWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentAvatarMicro: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#019ee3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentOnlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#16a34a',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  agentChipName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: 0.2,
  },
  bellBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: '#dc2626',
    minWidth: 17,
    height: 17,
    borderRadius: 8.5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    paddingHorizontal: 3,
  },
  bellBadgeText: {
    color: '#ffffff',
    fontSize: 9.5,
    fontWeight: '800',
  },
  sectionContainer: {
    marginBottom: 22,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#019ee3',
  },
  liveIncidentPill: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  livePulseDotRed: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#dc2626',
  },
  liveIncidentText: {
    color: '#dc2626',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  secureIncidentPill: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  secureIncidentText: {
    color: '#16a34a',
    fontSize: 9.5,
    fontWeight: '800',
  },
  activeIncidentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f4caca',
    elevation: 3,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  incidentCardTop: {
    width: '100%',
    height: 180,
    backgroundColor: '#0b1329',
    position: 'relative',
  },
  incidentCardImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  incidentCamTag: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  incidentCamTagText: {
    color: '#ffffff',
    fontSize: 10.5,
    fontWeight: '700',
  },
  incidentAiTag: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(1, 158, 227, 0.4)',
  },
  incidentAiTagText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  incidentLiveTag: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#dc2626',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  incidentLiveTagText: {
    color: '#ffffff',
    fontSize: 9.5,
    fontWeight: '800',
  },
  incidentCardBody: {
    padding: 18,
    gap: 10,
  },
  incidentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  incidentHeadline: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  incidentDesc: {
    fontSize: 11.5,
    color: '#64748b',
    lineHeight: 17,
    fontWeight: '500',
  },
  incidentActuatorsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actuatorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  chipSiren: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  chipSirenText: {
    color: '#dc2626',
    fontSize: 11,
    fontWeight: '700',
  },
  chipLight: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  chipLightText: {
    color: '#b45309',
    fontSize: 11,
    fontWeight: '700',
  },
  incidentActionsGroup: {
    gap: 8,
    marginTop: 4,
  },
  btnViewDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  btnViewDetailText: {
    color: '#019ee3',
    fontSize: 12.5,
    fontWeight: '700',
  },
  incidentResolvedCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: '#dcfce7',
    elevation: 2,
  },
  resolvedIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resolvedContent: {
    flex: 1,
  },
  resolvedTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  resolvedSub: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 2,
  },
  btnRearmSmall: {
    backgroundColor: '#019ee3',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  btnRearmSmallText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '700',
  },
  alertsGroupCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5edf2',
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  alertItemRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  alertIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconRed: { backgroundColor: '#fee2e2' },
  iconAmber: { backgroundColor: '#fef3c7' },
  iconBlue: { backgroundColor: '#e0f2fe' },
  alertRowCenter: {
    flex: 1,
  },
  alertTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  critBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  critBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  alertMeta: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 2,
  },
  alertRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertTimeInline: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  incidentTitleGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  incidentTimeSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
  },
  detailNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  detailBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  detailScreenTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  detailHeaderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    gap: 14,
    marginBottom: 16,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e5edf2',
  },
  detailIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailHeaderInfo: {
    flex: 1,
  },
  detailBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  detailCritText: {
    color: '#dc2626',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  badgeEnCours: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeResolue: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeEnCoursText: {
    color: '#ffffff',
    fontSize: 9.5,
    fontWeight: '800',
  },
  detailAlertTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  detailAlertLoc: {
    fontSize: 11.5,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 2,
  },
  detailTsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  detailTsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailTsText: {
    fontSize: 10.5,
    color: '#64748b',
    fontWeight: '600',
  },
  detailVideoCard: {
    width: '100%',
    height: 214,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000000',
    marginBottom: 16,
    position: 'relative',
  },
  detailVideoImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  videoBadgeLive: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#dc2626',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff',
  },
  liveText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  videoFullscreenBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailSection: {
    marginBottom: 14,
  },
  detailBlockTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#087c9e',
    marginBottom: 8,
  },
  detailCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#e5edf2',
    elevation: 1,
  },
  detailInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  infoLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoLabelText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  infoValStrong: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  infoValText: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '600',
  },
  critPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  critPillText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  statusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  dotActive: { backgroundColor: '#16a34a' },
  dotInactive: { backgroundColor: '#94a3b8' },
  statusActiveText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16a34a',
  },
  statusInactiveText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  actionContainer: {
    marginTop: 6,
    marginBottom: 20,
    gap: 8,
  },
  btnStopAlert: {
    backgroundColor: '#dc2626',
    borderRadius: 11,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    elevation: 3,
  },
  btnCallGuard: {
    backgroundColor: '#0284c7',
    borderRadius: 11,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    elevation: 3,
  },
  btnCallGuardText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  btnCallGuardSecondary: {
    backgroundColor: '#f0f9ff',
    borderColor: '#bae6fd',
    borderWidth: 1,
    borderRadius: 11,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnCallGuardSecondaryText: {
    color: '#0369a1',
    fontSize: 14,
    fontWeight: '700',
  },
  btnRearmAlert: {
    backgroundColor: '#16a34a',
    borderRadius: 11,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    elevation: 3,
  },
  btnStopAlertText: {
    color: '#ffffff',
    fontSize: 14.5,
    fontWeight: '800',
  },
  actionSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  actionSubText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  tacticalDock: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 10,
  },
  dockBtn: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 11,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#dbe7ed',
  },
  dockBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a',
  },
  webPlatformCard: {
    backgroundColor: '#009fe3',
    borderRadius: 14,
    padding: 19,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    elevation: 4,
  },
  webIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webTextContainer: {
    flex: 1,
  },
  webTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 2,
  },
  webSubtitle: {
    fontSize: 11,
    color: '#ffffff',
    opacity: 0.9,
    fontWeight: '500',
  },
  agentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5edf2',
    elevation: 2,
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentInfo: {
    flex: 1,
  },
  agentName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  agentEmail: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  settingsTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  settingsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5edf2',
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  settingsRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingsRowText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  logoutBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fee2e2',
    borderRadius: 11,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#dc2626',
  },
  floatingNavWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    alignItems: 'center',
    zIndex: 99,
  },
  floatingNavBar: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#111316',
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  floatingTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 28,
  },
  floatingTabActive: {
    flex: 1.3,
    flexDirection: 'row',
    backgroundColor: '#009fe3',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  tabIconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabRedDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#dc2626',
    borderWidth: 1.5,
    borderColor: '#0b1329',
  },
  tabLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 2,
  },
  tabLabelActive: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 0,
  },
  // --- LOGIN SCREEN STYLES INSPIRÉS DU WEB ---
  loginScreen: {
    flex: 1,
    backgroundColor: '#071d3a',
    position: 'relative',
  },
  loginBackgroundSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  loginScrollContent: {
    minHeight: '100%',
    paddingBottom: 30,
  },
  loginSapphireHero: {
    backgroundColor: 'transparent',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 18 : 38,
    paddingBottom: 22,
    paddingHorizontal: 20,
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
  },
  loginHeroEyebrow: {
    width: '100%',
    maxWidth: 290,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  loginHeroEyebrowLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  loginHeroEyebrowText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  loginWelcomeTitle: {
    display: 'none',
    color: '#ffffff',
    letterSpacing: 3,
    marginBottom: 18,
  },
  loginLogoBadge: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 14,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 172,
    shadowColor: '#0878aa',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 4,
  },
  loginHeroLogo: {
    width: 144,
    height: 42,
  },
  loginHeroSubtitle: {
    fontSize: 12,
    color: '#d9efff',
    opacity: 1,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 18,
    fontWeight: '500',
  },
  loginWaveDivider: {
    display: 'none',
  },
  loginFormArea: {
    paddingHorizontal: 34,
    paddingTop: 22,
    paddingBottom: 28,
    alignItems: 'center',
    marginTop: 0,
    zIndex: 1,
  },
  loginFormHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  loginFormTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: '#123a67',
  },
  loginFormDesc: {
    fontSize: 13,
    color: '#6d8ca3',
    marginTop: 4,
    textAlign: 'center',
  },
  loginFormCard: {
    width: '100%',
    gap: 14,
    maxWidth: 430,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: '#dceaf3',
    shadowColor: '#061a34',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 5,
  },
  loginSecurityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eefaff',
    borderWidth: 1,
    borderColor: '#d5f2fb',
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 10,
    marginBottom: 4,
  },
  loginSecurityIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  loginSecurityCopy: {
    flex: 1,
  },
  loginSecurityTitle: {
    color: '#0d6789',
    fontSize: 11.5,
    fontWeight: '800',
  },
  loginSecurityText: {
    color: '#6a8a99',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  loginSecurityDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  loginInputBox: {
    gap: 6,
  },
  loginInputLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#18528a',
    letterSpacing: 1.2,
    marginLeft: 12,
    marginBottom: 2,
  },
  loginInputWrap: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  loginInputLeadingIcon: {
    position: 'absolute',
    left: 0,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#31a9f5',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  loginTextInput: {
    flex: 1,
    backgroundColor: '#f7fbfe',
    borderWidth: 1,
    borderColor: '#d7e6ef',
    borderRadius: 30,
    paddingVertical: 14,
    paddingLeft: 60,
    paddingRight: 42,
    fontSize: 13,
    color: '#123a67',
    letterSpacing: 0.4,
  },
  loginEyeBtn: {
    position: 'absolute',
    right: 4,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  authTabSwitch: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 18,
    width: '100%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  authTabBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  authTabBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  authTabBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#64748b',
  },
  authTabBtnTextActive: {
    color: '#0f172a',
  },
  authSwitchLinkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
  },
  authSwitchLinkText: {
    fontSize: 13.5,
    color: '#607d91',
  },
  authLinkBold: {
    color: '#1760b4',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  loginPrimarySubmitBtn: {
    backgroundColor: '#31a9f5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 30,
    marginTop: 8,
    shadowColor: '#007bb5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 4,
  },
  loginPrimarySubmitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  loginFooterSecurity: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24,
    paddingBottom: 8,
  },
  loginFooterBrand: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  loginFooterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  loginFooterBadgeText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  loginBottomMeta: {
    marginTop: 24,
  },
  loginBottomRule: {
    display: 'none',
  },
  loginBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  loginBottomText: {
    color: '#6d8ca3',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  loginBottomStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  loginModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginTop: 18,
  },
  loginModeText: {
    color: '#bfe5fb',
    fontSize: 12,
    fontWeight: '600',
    paddingVertical: 8,
  },
  loginModeTextActive: {
    color: '#ffffff',
    textDecorationLine: 'underline',
    textDecorationColor: '#ffffff',
  },

  // ==================== MODALES NATIVES SLIDE-UP ====================
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalBackdropTouch: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    paddingTop: 16,
    gap: 14,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
    marginBottom: 4,
  },
  modalNotifItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  modalNotifBody: {
    flex: 1,
  },
  modalNotifTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 2,
  },
  modalNotifDesc: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
  },
  modalStatusPill: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  modalStatusPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
    letterSpacing: 0.5,
  },
  modalSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  modalPrimaryBtn: {
    backgroundColor: '#019ee3',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  modalPrimaryBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  modalDangerBtn: {
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modalDangerBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  modalSecondaryBtn: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryBtnText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '600',
  },
  aboutCenter: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  aboutTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 0.5,
  },
  aboutVersionBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
    marginBottom: 8,
  },
  aboutVersionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284c7',
  },
  aboutDesc: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  aboutInfoBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  aboutInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  aboutInfoLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  aboutInfoValGreen: {
    fontSize: 13,
    color: '#16a34a',
    fontWeight: '700',
  },
  aboutInfoVal: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
  },
});
