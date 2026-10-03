import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
  Image,
} from 'react-native';
import { PREVIA_COLORS, PREVIA_RADIUS, PREVIA_TOUCH_TARGET } from '../theme';
import { AppHeader } from '../components/AppHeader';
import { IconUser, IconPhone, IconEdit } from '../components/Icons';

export const ProfileScreen = ({
  currentUser,
  serverStatus = 'operationnel', // 'operationnel' | 'degrade'
  onLogout,
  themeMode = 'light',
  onThemeChange,
  unreadCount = 0,
  onNavigate,
  isDark = false,
  numeroGardiennerie = '+226 75 29 13 28',
  onOpenEditNumero,
}) => {
  // Paramètre : activation des notifications push (Section 5.4)
  const [notificationsPush, setNotificationsPush] = useState(true);

  const handleToggleNotifications = (val) => {
    setNotificationsPush(val);
    // TODO: enregistrer le push token avec le backend (POST /utilisateurs/push-token)
  };

  const handleConfirmLogout = () => {
    Alert.alert(
      "Déconnexion",
      "Voulez-vous clôturer votre session sur cet appareil mobile ?",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Se déconnecter", style: "destructive", onPress: onLogout },
      ]
    );
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <AppHeader
        unreadCount={unreadCount}
        onNotificationsPress={() => onNavigate('alerts')}
        onProfilePress={() => {}}
        isDark={isDark}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* CARTE IDENTITÉ AGENT / OPÉRATEUR */}
        <View style={[styles.profileCard, isDark && styles.cardDark]}>
          <View style={styles.avatarWrap}>
            <IconUser size={30} color="#FFFFFF" />
          </View>
          <View style={styles.profileDetails}>
            <Text style={[styles.userName, isDark && styles.userNameDark]}>
              {currentUser ? `${currentUser.prenom} ${currentUser.nom}` : 'Opérateur Terrain'}
            </Text>
            <Text style={[styles.userRole, isDark && styles.textSecondaryDark]}>
              Rôle : {currentUser?.role === 'admin' ? 'Superviseur' : 'Agent de Sécurité'}
            </Text>
            <Text style={[styles.userSite, isDark && styles.userSiteDark]}>
              Site : {currentUser?.site || 'Site Principal PREVIA'}
            </Text>
          </View>
        </View>

        {/* ÉTAT DU SYSTÈME */}
        <View style={[styles.sectionCard, isDark && styles.cardDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            ÉTAT DU SYSTÈME
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, serverStatus === 'operationnel' ? styles.dotGreen : styles.dotAmber]} />
            <Text style={[styles.statusLabel, isDark && styles.textLight]}>
              {serverStatus === 'operationnel' ? 'Opérationnel' : 'Hors service'}
            </Text>
          </View>
          <Text style={[styles.statusDesc, isDark && styles.textSecondaryDark]}>
            {serverStatus === 'operationnel'
              ? 'Surveillance active et caméras connectées.'
              : 'Connexion interrompue. Vérifiez le réseau du site.'}
          </Text>
        </View>

        {/* PARAMÈTRES MOBILES */}
        <View style={[styles.sectionCard, isDark && styles.cardDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            PARAMÈTRES
          </Text>

          {/* NOTIFICATIONS PUSH */}
          <View style={[styles.settingRow, isDark && styles.settingRowDark]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingTitle, isDark && styles.textLight]}>
                Notifications d'alerte
              </Text>
              <Text style={[styles.settingDesc, isDark && styles.textSecondaryDark]}>
                Alerte immédiate en cas d'incident
              </Text>
            </View>
            <Switch
              value={notificationsPush}
              onValueChange={handleToggleNotifications}
              trackColor={{ false: '#D1D5DB', true: PREVIA_COLORS.bluePrimary }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* SÉLECTEUR DE THÈME (Clair / Sombre / Système) */}
          <View style={[styles.settingRow, isDark && styles.settingRowDark, { borderBottomWidth: 0, paddingTop: 16 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingTitle, isDark && styles.textLight]}>
                Affichage
              </Text>
              <Text style={[styles.settingDesc, isDark && styles.textSecondaryDark]}>
                Thème clair, sombre ou système
              </Text>
            </View>
          </View>

          <View style={styles.themeSelectorRow}>
            {['light', 'dark', 'system'].map((m) => {
              const isActive = themeMode === m;
              const label = m === 'light' ? 'Clair' : m === 'dark' ? 'Sombre' : 'Système';

              return (
                <TouchableOpacity
                  key={m}
                  style={[
                    styles.themePill,
                    isActive && styles.themePillActive,
                    isDark && !isActive && styles.themePillDark,
                  ]}
                  onPress={() => onThemeChange(m)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Thème ${label}`}
                >
                  <Text style={[
                    styles.themePillText,
                    isDark && styles.themePillTextDark,
                    isActive && styles.themePillTextActive,
                  ]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* CONTACT D'URGENCE */}
        <View style={[styles.sectionCard, isDark && styles.cardDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            CONTACT D'URGENCE
          </Text>
          <View style={styles.emergencyContactRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingTitle, isDark && styles.textLight]}>
                Numéro d'urgence principal
              </Text>
              <Text style={[styles.settingDesc, isDark && styles.textSecondaryDark]}>
                {numeroGardiennerie || 'Numéro non renseigné'}
              </Text>
            </View>
            <View style={styles.emergencyActionsRow}>
              {onOpenEditNumero && (
                <TouchableOpacity
                  style={[styles.editSmallBtn, isDark && styles.editSmallBtnDark]}
                  onPress={onOpenEditNumero}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Modifier le numéro de contact d'urgence"
                >
                  <IconEdit size={14} color={isDark ? '#E5E7EB' : PREVIA_COLORS.navyText} />
                  <Text style={[styles.editSmallBtnText, isDark && styles.textLight]}>Modifier</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.callSmallBtn}
                onPress={() => {
                  const telClean = (numeroGardiennerie || '').replace(/\s+/g, '');
                  if (telClean) {
                    Linking.openURL(`tel:${telClean}`).catch(() => {});
                  } else if (onOpenEditNumero) {
                    onOpenEditNumero();
                  }
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Appeler le contact d'urgence"
              >
                <IconPhone size={14} color="#FFFFFF" />
                <Text style={styles.callSmallBtnText}>Appeler</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* BOUTON DÉCONNEXION */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleConfirmLogout}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Déconnexion"
        >
          <Text style={styles.logoutButtonText}>Déconnexion</Text>
        </TouchableOpacity>

        {/* VERSION */}
        <Text style={[styles.versionText, isDark && styles.textSecondaryDark]}>
          PREVIA • v1.0
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PREVIA_COLORS.bgLight,
  },
  containerDark: {
    backgroundColor: PREVIA_COLORS.darkBackground,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PREVIA_COLORS.white,
    borderRadius: PREVIA_RADIUS.card,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    elevation: 2,
    shadowColor: '#152E4C',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    gap: 16,
  },
  cardDark: {
    backgroundColor: PREVIA_COLORS.darkSurface,
    borderColor: PREVIA_COLORS.darkBorder,
  },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: PREVIA_COLORS.bluePrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 17,
    fontWeight: '700',
    color: PREVIA_COLORS.navyText,
    marginBottom: 2,
  },
  userNameDark: {
    color: PREVIA_COLORS.darkTextPrimary,
  },
  userRole: {
    fontSize: 13,
    color: PREVIA_COLORS.graySecondary,
    marginBottom: 2,
  },
  userSite: {
    fontSize: 12,
    color: PREVIA_COLORS.blueDeep,
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: PREVIA_COLORS.white,
    borderRadius: PREVIA_RADIUS.card,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    elevation: 2,
    shadowColor: '#152E4C',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: PREVIA_COLORS.graySecondary,
    letterSpacing: 1.1,
    marginBottom: 12,
  },
  sectionTitleDark: {
    color: '#93C5FD',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotGreen: {
    backgroundColor: '#16A34A',
  },
  dotAmber: {
    backgroundColor: '#F59E0B',
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: PREVIA_COLORS.navyText,
  },
  textLight: {
    color: '#FFFFFF',
  },
  textSecondaryDark: {
    color: '#D1D5DB',
  },
  userSiteDark: {
    color: '#38BDF8',
  },
  statusDesc: {
    fontSize: 12,
    color: PREVIA_COLORS.graySecondary,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  settingRowDark: {
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  settingTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: PREVIA_COLORS.navyText,
    marginBottom: 2,
  },
  settingDesc: {
    fontSize: 11.5,
    color: PREVIA_COLORS.graySecondary,
  },
  themeSelectorRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  themePill: {
    ...PREVIA_TOUCH_TARGET,
    flex: 1,
    paddingVertical: 10,
    borderRadius: PREVIA_RADIUS.pill,
    backgroundColor: PREVIA_COLORS.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  themePillActive: {
    backgroundColor: PREVIA_COLORS.bluePrimary,
    borderColor: PREVIA_COLORS.bluePrimary,
  },
  themePillDark: {
    backgroundColor: '#262F3D',
    borderColor: '#3B485A',
  },
  themePillText: {
    fontSize: 13,
    fontWeight: '600',
    color: PREVIA_COLORS.navyText,
  },
  themePillTextDark: {
    color: '#E5E7EB',
  },
  themePillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  emergencyContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    gap: 12,
  },
  emergencyActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: PREVIA_RADIUS.button,
  },
  editSmallBtnDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  editSmallBtnText: {
    color: PREVIA_COLORS.navyText,
    fontSize: 12,
    fontWeight: '700',
  },
  callSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: PREVIA_RADIUS.button,
  },
  callSmallBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  logoutButton: {
    ...PREVIA_TOUCH_TARGET,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: PREVIA_RADIUS.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  logoutButtonText: {
    color: PREVIA_COLORS.redAlert, // #DB2323
    fontSize: 14.5,
    fontWeight: '700',
  },
  versionText: {
    textAlign: 'center',
    fontSize: 11.5,
    color: PREVIA_COLORS.graySecondary,
  },
});
