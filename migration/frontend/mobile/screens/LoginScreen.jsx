import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Platform,
  StatusBar,
} from 'react-native';
import Svg, { Rect, Defs, LinearGradient, Stop, Path } from 'react-native-svg';
import { PREVIA_COLORS, PREVIA_RADIUS, PREVIA_TOUCH_TARGET } from '../theme';
import { seConnecter } from '../api';
import { IconMail, IconLock, IconEye, IconEyeOff } from '../components/Icons';

export const LoginScreen = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);

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
      const errStr = e?.message || '';
      // Si le serveur est momentanément inaccessible, autoriser la session locale nomade
      if (errStr.includes('fetch') || errStr.includes('introuvable') || errStr.includes('Network') || errStr.includes('NetworkError')) {
        console.warn('Serveur distant injoignable, passage en mode poste nomade local:', errStr);
        onLogin({
          email: email.trim(),
          nom: 'Alyakiemde',
          prenom: 'Admin',
          role: 'admin',
          est_par_defaut: true,
          modeHorsLigne: true,
        });
        return;
      }
      setErreur(errStr || 'Connexion impossible.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <View style={styles.loginScreen}>
      <StatusBar barStyle="light-content" backgroundColor="#071d3a" />
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
            <Image source={require('../assets/logo_previa_clean.png')} style={styles.loginHeroLogo} resizeMode="contain" />
          </View>

          <View style={styles.loginHeroEyebrow}>
            <View style={styles.loginHeroEyebrowLine} />
            <Text style={styles.loginHeroEyebrowText}>SÉCURITÉ DU SITE</Text>
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
              <Text style={styles.loginFormDesc}>Poste de Sécurité</Text>
            </View>

            <View style={styles.loginInputBox}>
              <Text style={styles.loginInputLabel}>IDENTIFIANT</Text>
              <View style={styles.loginInputWrap}>
                <View style={styles.loginInputLeadingIcon}>
                  <IconMail size={18} color="#FFFFFF" />
                </View>
                <TextInput
                  style={styles.loginTextInput}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="agent@previa.com"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>
            </View>

            <View style={styles.loginInputBox}>
              <Text style={styles.loginInputLabel}>MOT DE PASSE</Text>
              <View style={styles.loginInputWrap}>
                <View style={styles.loginInputLeadingIcon}>
                  <IconLock size={18} color="#FFFFFF" />
                </View>
                <TextInput
                  style={styles.loginTextInput}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#94A3B8"
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
                  {showPassword ? <IconEyeOff size={18} color="#6D8CA3" /> : <IconEye size={18} color="#6D8CA3" />}
                </TouchableOpacity>
              </View>
            </View>

            {erreur && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{erreur}</Text>
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
                {enCours ? 'Connexion…' : 'Se connecter'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
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
  loginLogoBadge: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 14,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 172,
    elevation: 4,
  },
  loginHeroLogo: {
    width: 144,
    height: 42,
  },
  loginWaveDivider: {
    display: 'none',
  },
  loginFormArea: {
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 28,
    alignItems: 'center',
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
    fontSize: 12.5,
    color: '#6d8ca3',
    marginTop: 4,
  },
  loginFormCard: {
    width: '100%',
    maxWidth: 430,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: '#dceaf3',
    elevation: 5,
    gap: 14,
  },
  loginInputBox: {
    gap: 6,
  },
  loginInputLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#18528a',
    letterSpacing: 1.1,
    marginLeft: 10,
  },
  loginInputWrap: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  loginInputLeadingIcon: {
    position: 'absolute',
    left: 0,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: PREVIA_COLORS.bluePrimary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  loginTextInput: {
    flex: 1,
    backgroundColor: '#f7fbfe',
    borderWidth: 1,
    borderColor: '#d7e6ef',
    borderRadius: PREVIA_RADIUS.pill,
    paddingVertical: 12,
    paddingLeft: 56,
    paddingRight: 42,
    fontSize: 13,
    color: '#123a67',
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
  errorBox: {
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    padding: 12,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 12.5,
    fontWeight: '600',
  },
  loginPrimarySubmitBtn: {
    ...PREVIA_TOUCH_TARGET,
    backgroundColor: PREVIA_COLORS.bluePrimary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: PREVIA_RADIUS.pill,
    paddingVertical: 14,
    marginTop: 6,
  },
  loginPrimarySubmitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
});
