import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  Linking,
} from 'react-native';
import { PREVIA_COLORS, PREVIA_RADIUS, PREVIA_TOUCH_TARGET } from '../theme';
import { AppHeader } from '../components/AppHeader';
import { HomeCardSkeleton } from '../components/SkeletonLoader';
import { useImageEnDirect } from '../api';
import {
  IconCamera,
  IconBarChart,
  IconBell,
  IconFileText,
  IconChevronRight,
  IconAlertTriangle,
  IconShieldCheck,
  IconShieldAlert,
  IconPlay,
  IconActivity,
  IconCheck,
  IconX,
  IconPhone,
  IconMoreVertical,
  IconUser,
} from '../components/Icons';

export const HomeScreen = ({
  onNavigate,
  unreadCount = 0,
  isLoading = false,
  networkError = null,
  isDark = false,
  cameras = [],
  alerts = [],
  currentUser = null,
  onVerifyAlert,
  onRejectAlert,
  numeroGardiennerie = '+226 75 29 13 28',
  onOpenEditNumero,
}) => {
  const [statsModalOpen, setStatsModalOpen] = useState(false);

  // Première caméra active pour le flux d'aperçu direct
  const cameraPrincipale = cameras.length > 0 ? cameras[0] : null;
  const idCamPrincipale = cameraPrincipale?.id_camera || null;
  const nomCamPrincipale = cameraPrincipale?.nom || cameraPrincipale?.num || 'Entrée Principale';

  // Snapshot en direct (1 image / 2 secondes)
  const imageApercu = useImageEnDirect(idCamPrincipale, 2000);

  // 2 alertes récentes non traitées
  const alertesRecentes = alerts.filter(
    (al) => al.statut !== 'VERIFIE' && al.statut !== 'REJETE'
  ).slice(0, 2);

  const totalCameras = cameras.length > 0 ? cameras.length : 4;

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {/* EN-TÊTE FIXE */}
      <AppHeader
        unreadCount={unreadCount}
        onNotificationsPress={() => onNavigate('alerts')}
        onProfilePress={() => onNavigate('profile')}
        isDark={isDark}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* BANNIÈRE DISCRÈTE D'ERREUR RÉSEAU SI NÉCESSAIRE */}
        {networkError && (
          <View style={styles.networkErrorBanner}>
            <IconAlertTriangle size={18} color="#991B1B" />
            <Text style={styles.networkErrorText}>
              Réseau instable — données en cache
            </Text>
          </View>
        )}

        {/* CARTE HERO STATUS (Protection Active avec indicateur de sécurité) */}
        <View style={styles.heroStatusCard}>
          <View style={styles.heroStatusLeft}>
            <Text style={styles.heroStatusCategory}>SURVEILLANCE DU SITE</Text>
            <Text style={styles.heroStatusVal}>Protection Active</Text>
          </View>
          <View style={styles.heroStatusShieldWrap}>
            <IconShieldCheck size={22} color="#10B981" />
          </View>
        </View>

        {/* APERÇU VIDÉO DIRECT RAPIDE (Positionné avant l'historique) */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            DIRECT VIDÉO
          </Text>
          <TouchableOpacity
            onPress={() => onNavigate('direct')}
            activeOpacity={0.7}
            style={styles.sectionLinkBtn}
          >
            <Text style={styles.sectionLinkText}>Voir tout</Text>
            <IconChevronRight size={14} color={PREVIA_COLORS.bluePrimary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.livePeekCard, isDark && styles.livePeekCardDark]}
          onPress={() => onNavigate('direct')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Accéder au flux direct de la caméra ${nomCamPrincipale}`}
        >
          <View style={styles.livePeekViewport}>
            {imageApercu ? (
              <Image
                source={{ uri: imageApercu }}
                style={styles.livePeekImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.livePeekPlaceholder}>
                <Image
                  source={require('../assets/logo_previa_transparent.png')}
                  style={styles.placeholderLogo}
                  resizeMode="contain"
                />
                <Text style={styles.placeholderText}>Caméra prête</Text>
              </View>
            )}

            {/* OVERLAY CAMÉRA */}
            <View style={styles.liveOverlayTop}>
              {imageApercu ? (
                <View style={styles.livePulsePill}>
                  <View style={styles.livePulseDot} />
                  <Text style={styles.livePulseText}>EN DIRECT</Text>
                </View>
              ) : (
                <View style={[styles.livePulsePill, { backgroundColor: 'rgba(100, 116, 139, 0.85)' }]}>
                  <Text style={styles.livePulseText}>EN VEILLE</Text>
                </View>
              )}
            </View>

            <View style={styles.liveOverlayBottom}>
              <View style={styles.liveCamInfo}>
                <Text style={styles.liveCamTitle}>{nomCamPrincipale}</Text>
                <Text style={styles.liveCamSubtitle}>{imageApercu ? 'En direct' : 'Standby'}</Text>
              </View>
              <View style={styles.livePlayButton}>
                <IconPlay size={14} color="#FFFFFF" />
              </View>
            </View>
          </View>
        </TouchableOpacity>

        {/* SECTION : DERNIÈRES ALERTES (Recent transactions equivalent) */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            Dernières Alertes
          </Text>
          <TouchableOpacity
            onPress={() => onNavigate('alerts')}
            activeOpacity={0.7}
            style={styles.sectionLinkBtn}
          >
            <Text style={styles.sectionLinkText}>Voir tout</Text>
            <IconChevronRight size={14} color={PREVIA_COLORS.bluePrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.recentAlertsList}>
          {/* ITEM 1 : INTRUSION */}
          <TouchableOpacity
            style={styles.recentAlertCard}
            onPress={() => onNavigate('alerts')}
            activeOpacity={0.8}
          >
            <View style={styles.recentAlertLeft}>
              <View style={[styles.recentAlertIconWrap, { backgroundColor: '#FEE2E2' }]}>
                <IconShieldAlert size={20} color="#DC2626" />
              </View>
              <View>
                <Text style={styles.recentAlertTitle}>Intrusion Zone Sensible</Text>
                <Text style={styles.recentAlertSub}>FabLab ODC · 14:32</Text>
              </View>
            </View>
            <View style={[styles.recentAlertBadge, { backgroundColor: '#FEE2E2' }]}>
              <Text style={[styles.recentAlertBadgeText, { color: '#DC2626' }]}>Critique</Text>
            </View>
          </TouchableOpacity>

          {/* ITEM 2 : MOUVEMENT SUSPECT DE NUIT (Pas de Face ID sur mobile, réservé au Web) */}
          <TouchableOpacity
            style={styles.recentAlertCard}
            onPress={() => onNavigate('alerts')}
            activeOpacity={0.8}
          >
            <View style={styles.recentAlertLeft}>
              <View style={[styles.recentAlertIconWrap, { backgroundColor: '#FEF3C7' }]}>
                <IconAlertTriangle size={20} color="#D97706" />
              </View>
              <View>
                <Text style={styles.recentAlertTitle}>Mouvement Nocturne Suspect</Text>
                <Text style={styles.recentAlertSub}>École Du Code · 14:15</Text>
              </View>
            </View>
            <View style={[styles.recentAlertBadge, { backgroundColor: '#FEF3C7' }]}>
              <Text style={[styles.recentAlertBadgeText, { color: '#D97706' }]}>Anomalie</Text>
            </View>
          </TouchableOpacity>

          {/* ITEM 3 : SUSPECT */}
          <TouchableOpacity
            style={styles.recentAlertCard}
            onPress={() => onNavigate('alerts')}
            activeOpacity={0.8}
          >
            <View style={styles.recentAlertLeft}>
              <View style={[styles.recentAlertIconWrap, { backgroundColor: '#FEF3C7' }]}>
                <IconAlertTriangle size={20} color="#D97706" />
              </View>
              <View>
                <Text style={styles.recentAlertTitle}>Comportement : Rôdeur</Text>
                <Text style={styles.recentAlertSub}>Cour École · 13:58</Text>
              </View>
            </View>
            <View style={[styles.recentAlertBadge, { backgroundColor: '#FEF3C7' }]}>
              <Text style={[styles.recentAlertBadgeText, { color: '#D97706' }]}>Alerte</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* BOUTON D'URGENCE : CONTACT D'URGENCE */}
        <TouchableOpacity
          style={styles.callGuardsBanner}
          onPress={() => {
            const telClean = (numeroGardiennerie || '').replace(/\s+/g, '');
            if (telClean) {
              Linking.openURL(`tel:${telClean}`).catch(() => {});
            }
          }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Contacter le contact d'urgence"
        >
          <View style={styles.callGuardsLeft}>
            <View style={styles.callGuardsIconCircle}>
              <IconPhone size={22} color="#FFFFFF" />
            </View>
            <View style={styles.callGuardsTexts}>
              <Text style={styles.callGuardsTitle}>Contact d'urgence</Text>
            </View>
          </View>
          <View style={styles.callGuardsPill}>
            <Text style={styles.callGuardsPillText}>APPELER</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      {/* MODALE D'INFORMATIONS ANALYSES */}
      <Modal
        visible={statsModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setStatsModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isDark && styles.modalCardDark]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, isDark && styles.modalTitleDark]}>
                Journal du site
              </Text>
              <TouchableOpacity
                onPress={() => setStatsModalOpen(false)}
                style={styles.modalCloseBtn}
                accessibilityRole="button"
                accessibilityLabel="Fermer"
              >
                <IconX size={20} color={isDark ? '#F3F4F6' : PREVIA_COLORS.navyText} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalBodyText, isDark && styles.modalBodyTextDark]}>
              Toutes les détections automatiques de sécurité sont enregistrées en temps réel.
            </Text>

            <View style={styles.modalHighlightBox}>
              <Text style={styles.modalHighlightTitle}>Poste Central</Text>
              <Text style={styles.modalHighlightText}>
                Les rapports complets et l'historique détaillé sont disponibles sur le poste central.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.modalActionBtn}
              onPress={() => setStatsModalOpen(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.modalActionBtnText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
  },
  networkErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: PREVIA_RADIUS.md,
    marginBottom: 16,
  },
  networkErrorText: {
    flex: 1,
    color: '#991B1B',
    fontSize: 12.5,
    fontWeight: '600',
  },

  // HERO CARD SAPPHIRE ULTRA NETTE
  heroCard: {
    backgroundColor: '#01356B',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#014791',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  heroBgDecoWrapper: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  heroBgWave1: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#009FE3',
    opacity: 0.22,
  },
  heroBgWave2: {
    display: 'none',
  },
  heroCardDark: {
    backgroundColor: '#0B192C',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    zIndex: 2,
  },
  heroStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 159, 227, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: PREVIA_RADIUS.pill,
    borderWidth: 1,
    borderColor: 'rgba(0, 159, 227, 0.35)',
  },
  heroStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#22C55E',
  },
  heroStatusText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroPosteTag: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    opacity: 0.9,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 18,
    zIndex: 2,
  },
  heroTitleWrap: {
    flex: 1,
    paddingRight: 10,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  heroSubtitle: {
    color: '#E0F2FE',
    fontSize: 12.5,
    fontWeight: '500',
    lineHeight: 18,
  },
  heroShieldCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  telemetryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 26, 56, 0.65)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 2,
  },
  telemetryChip: {
    alignItems: 'center',
    flex: 1,
  },
  telemetryValue: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 2,
  },
  telemetryValueAlert: {
    color: '#F87171',
  },
  telemetryLabel: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '600',
  },
  telemetryDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  telemetryRowDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  telemetryChip: {
    alignItems: 'center',
    flex: 1,
  },
  telemetryValue: {
    color: PREVIA_COLORS.navyText,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 2,
  },
  telemetryValueDark: {
    color: '#FFFFFF',
  },
  telemetryValueAlert: {
    color: '#DC2626',
  },
  telemetryLabel: {
    color: PREVIA_COLORS.graySecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  telemetryDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
  },
  telemetryDividerDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },

  // BANDEAU D'APPEL DIRECT GARDIENNERIE
  callGuardsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#059669',
    borderRadius: PREVIA_RADIUS.card,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 20,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  callGuardsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  callGuardsIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callGuardsTexts: {
    flex: 1,
  },
  callGuardsTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  callGuardsSubtitle: {
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  callGuardsActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  callGuardsEditBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callGuardsPill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: PREVIA_RADIUS.pill,
  },
  callGuardsPillText: {
    color: '#059669',
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // SECTION HEADERS
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: PREVIA_COLORS.navyText,
    letterSpacing: 0.8,
  },
  sectionTitleDark: {
    color: '#93C5FD',
  },
  sectionLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  sectionLinkText: {
    color: PREVIA_COLORS.bluePrimary,
    fontSize: 12,
    fontWeight: '700',
  },

  // APERÇU DIRECT RAPIDE
  livePeekCard: {
    backgroundColor: PREVIA_COLORS.white,
    borderRadius: PREVIA_RADIUS.card,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  livePeekCardDark: {
    backgroundColor: PREVIA_COLORS.darkSurface,
    borderColor: PREVIA_COLORS.darkBorder,
  },
  livePeekViewport: {
    width: '100%',
    height: 190,
    backgroundColor: '#0A0F1A',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  livePeekImage: {
    width: '100%',
    height: '100%',
  },
  livePeekPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  placeholderLogo: {
    width: 120,
    height: 40,
    opacity: 0.6,
  },
  placeholderText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    fontWeight: '600',
  },
  liveOverlayTop: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  livePulsePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(219, 35, 35, 0.92)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: PREVIA_RADIUS.pill,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  livePulseText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  liveTelemetryHud: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: PREVIA_RADIUS.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  liveHudText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 10,
    fontWeight: '700',
  },
  liveOverlayBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(11, 19, 34, 0.85)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  liveCamInfo: {
    flex: 1,
  },
  liveCamTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  liveCamSubtitle: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 10.5,
    fontWeight: '500',
  },
  livePlayButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: PREVIA_COLORS.bluePrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },

  // GRILLE 2x2
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  card: {
    width: '48%',
    backgroundColor: PREVIA_COLORS.white,
    borderRadius: PREVIA_RADIUS.card,
    padding: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#EDF2F7',
  },
  cardDark: {
    backgroundColor: PREVIA_COLORS.darkSurface,
    borderColor: PREVIA_COLORS.darkBorder,
  },
  cardAlertActive: {
    backgroundColor: 'rgba(254, 242, 242, 0.65)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  cardGardien: {
    borderColor: 'rgba(5, 150, 105, 0.25)',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPillBadge: {
    backgroundColor: 'rgba(0, 159, 227, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: PREVIA_RADIUS.pill,
  },
  cardPillBadgeText: {
    color: PREVIA_COLORS.bluePrimary,
    fontSize: 10,
    fontWeight: '700',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: PREVIA_COLORS.navyText,
    marginBottom: 3,
  },
  cardTitleDark: {
    color: PREVIA_COLORS.darkTextPrimary,
  },
  cardSubtitle: {
    fontSize: 11.5,
    color: PREVIA_COLORS.graySecondary,
    fontWeight: '500',
  },
  cardSubtitleDark: {
    color: '#D1D5DB',
  },

  // DERNIÈRES DÉTECTIONS
  recentAlertCard: {
    backgroundColor: PREVIA_COLORS.white,
    borderRadius: PREVIA_RADIUS.md,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  recentAlertCardDark: {
    backgroundColor: PREVIA_COLORS.darkSurface,
    borderColor: PREVIA_COLORS.darkBorder,
  },
  recentAlertLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  alertBadgeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  recentAlertTexts: {
    flex: 1,
  },
  recentAlertTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: PREVIA_COLORS.navyText,
  },
  recentAlertTitleDark: {
    color: PREVIA_COLORS.darkTextPrimary,
  },
  recentAlertMeta: {
    fontSize: 11,
    color: PREVIA_COLORS.graySecondary,
    marginTop: 2,
  },
  recentAlertMetaDark: {
    color: '#D1D5DB',
  },
  recentAlertVerifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#16A34A',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: PREVIA_RADIUS.pill,
  },
  recentAlertVerifyText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  emptySecuredCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: PREVIA_RADIUS.card,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  emptySecuredCardDark: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  emptySecuredIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySecuredTexts: {
    flex: 1,
  },
  emptySecuredTitle: {
    color: '#065F46',
    fontSize: 13.5,
    fontWeight: '800',
  },
  emptySecuredTitleDark: {
    color: '#6EE7B7',
  },
  emptySecuredSub: {
    color: '#047857',
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 2,
  },

  // CTA PRINCIPAL
  primaryCta: {
    ...PREVIA_TOUCH_TARGET,
    backgroundColor: PREVIA_COLORS.bluePrimary,
    borderRadius: PREVIA_RADIUS.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 8,
    marginTop: 10,
    shadowColor: PREVIA_COLORS.bluePrimary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryCtaText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // MODALE
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: PREVIA_COLORS.white,
    borderRadius: PREVIA_RADIUS.card,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  modalCardDark: {
    backgroundColor: PREVIA_COLORS.darkSurface,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: PREVIA_COLORS.navyText,
  },
  modalTitleDark: {
    color: PREVIA_COLORS.darkTextPrimary,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalBodyText: {
    fontSize: 13.5,
    color: PREVIA_COLORS.graySecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  modalBodyTextDark: {
    color: PREVIA_COLORS.darkTextSecondary,
  },
  modalHighlightBox: {
    backgroundColor: 'rgba(0, 159, 227, 0.08)',
    borderRadius: PREVIA_RADIUS.md,
    padding: 12,
    marginBottom: 18,
    borderLeftWidth: 3,
    borderLeftColor: PREVIA_COLORS.bluePrimary,
  },
  modalHighlightTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: PREVIA_COLORS.bluePrimary,
    marginBottom: 4,
  },
  modalHighlightText: {
    fontSize: 12,
    color: PREVIA_COLORS.navyText,
    lineHeight: 18,
  },
  modalActionBtn: {
    ...PREVIA_TOUCH_TARGET,
    backgroundColor: PREVIA_COLORS.bluePrimary,
    borderRadius: PREVIA_RADIUS.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  modalActionBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
  },

  // HERO STATUS CARD (Inspiré de l'élégance du modèle iOS)
  heroStatusCard: {
    backgroundColor: '#F0F9FF',
    borderRadius: 26,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(2, 132, 199, 0.16)',
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  heroStatusLeft: {
    flex: 1,
  },
  heroStatusCategory: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  heroStatusVal: {
    fontSize: 25,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  heroStatusMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  heroStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  heroStatusPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  heroStatusMetaDot: {
    color: '#94A3B8',
    fontSize: 11,
  },
  heroStatusMetaGray: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  heroStatusShieldWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },

  // CAMERA GRID
  cameraGridRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 22,
  },
  cameraCardPrimary: {
    flex: 1,
    height: 136,
    borderRadius: 22,
    backgroundColor: PREVIA_COLORS.bluePrimary,
    padding: 14,
    justifyContent: 'space-between',
    shadowColor: PREVIA_COLORS.bluePrimary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  cameraCardSecondary: {
    flex: 1,
    height: 136,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    padding: 14,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cameraCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cameraIconCirclePrimary: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraIconCircleSecondary: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraCardTitlePrimary: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 16,
  },
  cameraCardSubPrimary: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 10.5,
    fontWeight: '500',
    marginTop: 2,
  },
  cameraLivePillPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 6,
  },
  cameraLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#34D399',
  },
  cameraLiveTextPrimary: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  cameraCardTitleSecondary: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 16,
  },
  cameraCardSubSecondary: {
    color: '#64748B',
    fontSize: 10.5,
    fontWeight: '500',
    marginTop: 2,
  },
  cameraLivePillSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 6,
  },
  cameraLiveTextSecondary: {
    color: '#475569',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  // RECENT ALERTS LIST
  recentAlertsList: {
    gap: 10,
    marginBottom: 24,
  },
  recentAlertCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 13,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
  },
  recentAlertLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    flex: 1,
  },
  recentAlertIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentAlertTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  recentAlertSub: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 1,
  },
  recentAlertBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  recentAlertBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
});
