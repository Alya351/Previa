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
  IconPlay,
  IconActivity,
  IconCheck,
  IconX,
  IconPhone,
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

        {/* HERO CARD SAPPHIRE : STATUT DE PROTECTION UNIFIÉ */}
        <View style={[styles.heroCard, isDark && styles.heroCardDark]}>
          <View style={styles.heroGlowAccent} />
          
          <View style={styles.heroTopRow}>
            <View style={styles.heroStatusBadge}>
              <View style={styles.heroStatusDot} />
              <Text style={styles.heroStatusText}>SURVEILLANCE ACTIVE • 100% LOCAL</Text>
            </View>
            <Text style={styles.heroTimeText}>Poste 1</Text>
          </View>

          <View style={styles.heroContentRow}>
            <View style={styles.heroTextContainer}>
              <Text style={styles.heroTitle}>Bâtiment Principal</Text>
              <Text style={styles.heroSubtitle}>
                {totalCameras} caméra(s) en supervision direct • 0 menace détectée
              </Text>
            </View>
            <View style={styles.heroShieldCircle}>
              <IconShieldCheck size={28} color="#00F2FE" />
            </View>
          </View>

          {/* INDICATEURS ESSENTIELS DE TERRAIN */}
          <View style={styles.telemetryRow}>
            <View style={styles.telemetryChip}>
              <Text style={styles.telemetryValue}>{totalCameras}</Text>
              <Text style={styles.telemetryLabel}>Caméras</Text>
            </View>
            <View style={styles.telemetryDivider} />
            <View style={styles.telemetryChip}>
              <Text style={[styles.telemetryValue, unreadCount > 0 && styles.telemetryValueAlert]}>
                {unreadCount}
              </Text>
              <Text style={styles.telemetryLabel}>Incidents</Text>
            </View>
            <View style={styles.telemetryDivider} />
            <View style={styles.telemetryChip}>
              <Text style={[styles.telemetryValue, { color: '#10B981' }]}>Normal</Text>
              <Text style={styles.telemetryLabel}>État</Text>
            </View>
          </View>
        </View>

        {/* BOUTON D'URGENCE : GARDIENNERIE */}
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
          accessibilityLabel="Contacter la Gardiennerie"
        >
          <View style={styles.callGuardsLeft}>
            <View style={styles.callGuardsIconCircle}>
              <IconPhone size={22} color="#FFFFFF" />
            </View>
            <View style={styles.callGuardsTexts}>
              <Text style={styles.callGuardsTitle}>Gardiennerie</Text>
              <Text style={styles.callGuardsSubtitle}>Poste de sécurité</Text>
            </View>
          </View>
          <View style={styles.callGuardsPill}>
            <Text style={styles.callGuardsPillText}>APPELER</Text>
          </View>
        </TouchableOpacity>

        {/* APERÇU VIDÉO DIRECT RAPIDE */}
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
              <View style={styles.livePulsePill}>
                <View style={styles.livePulseDot} />
                <Text style={styles.livePulseText}>EN DIRECT</Text>
              </View>
            </View>

            <View style={styles.liveOverlayBottom}>
              <View style={styles.liveCamInfo}>
                <Text style={styles.liveCamTitle}>{nomCamPrincipale}</Text>
                <Text style={styles.liveCamSubtitle}>En direct</Text>
              </View>
              <View style={styles.livePlayButton}>
                <IconPlay size={14} color="#FFFFFF" />
              </View>
            </View>
          </View>
        </TouchableOpacity>

        {/* ACCÈS RAPIDE */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            ACCÈS RAPIDE
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.grid}>
            <HomeCardSkeleton />
            <HomeCardSkeleton />
            <HomeCardSkeleton />
            <HomeCardSkeleton />
          </View>
        ) : (
          <View style={styles.grid}>
            {/* CARTE 1 : CAMÉRAS */}
            <TouchableOpacity
              style={[styles.card, isDark && styles.cardDark]}
              onPress={() => onNavigate('direct')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Caméras, Voir le direct"
            >
              <View style={styles.cardHeaderRow}>
                <View style={[styles.iconCircle, { backgroundColor: '#009FE3' }]}>
                  <IconCamera size={22} color="#FFFFFF" />
                </View>
                <View style={styles.cardPillBadge}>
                  <Text style={styles.cardPillBadgeText}>{totalCameras} actives</Text>
                </View>
              </View>
              <Text style={[styles.cardTitle, isDark && styles.cardTitleDark]}>
                Caméras
              </Text>
              <Text style={[styles.cardSubtitle, isDark && styles.cardSubtitleDark]}>Visionner les flux</Text>
            </TouchableOpacity>

            {/* CARTE 2 : ALERTES */}
            <TouchableOpacity
              style={[styles.card, isDark && styles.cardDark]}
              onPress={() => onNavigate('alerts')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Alertes, Suivi en temps réel${unreadCount > 0 ? `, ${unreadCount} non lues` : ''}`}
            >
              <View style={styles.cardHeaderRow}>
                <View style={[styles.iconCircle, { backgroundColor: unreadCount > 0 ? '#DB2323' : '#014791' }]}>
                  <IconBell size={22} color="#FFFFFF" />
                </View>
                {unreadCount > 0 ? (
                  <View style={[styles.cardPillBadge, { backgroundColor: 'rgba(219, 35, 35, 0.12)' }]}>
                    <Text style={[styles.cardPillBadgeText, { color: '#DB2323', fontWeight: '800' }]}>
                      {unreadCount} critiques
                    </Text>
                  </View>
                ) : (
                  <View style={styles.cardPillBadge}>
                    <Text style={[styles.cardPillBadgeText, { color: '#10B981' }]}>Calme</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.cardTitle, isDark && styles.cardTitleDark]}>
                Alertes
              </Text>
              <Text style={[styles.cardSubtitle, isDark && styles.cardSubtitleDark]}>Alertes en cours</Text>
            </TouchableOpacity>

            {/* CARTE 3 : APPEL GARDIENNERIE */}
            <TouchableOpacity
              style={[styles.card, isDark && styles.cardDark, styles.cardGardien]}
              onPress={() => {
                const telClean = (numeroGardiennerie || '').replace(/\s+/g, '');
                if (telClean) {
                  Linking.openURL(`tel:${telClean}`).catch(() => {});
                }
              }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Contacter la gardiennerie"
            >
              <View style={styles.cardHeaderRow}>
                <View style={[styles.iconCircle, { backgroundColor: '#059669' }]}>
                  <IconPhone size={20} color="#FFFFFF" />
                </View>
                <View style={[styles.cardPillBadge, { backgroundColor: 'rgba(5, 150, 105, 0.12)' }]}>
                  <Text style={[styles.cardPillBadgeText, { color: '#059669', fontWeight: '800' }]}>Direct</Text>
                </View>
              </View>
              <Text style={[styles.cardTitle, isDark && styles.cardTitleDark]}>
                Gardiennerie
              </Text>
              <Text style={[styles.cardSubtitle, isDark && styles.cardSubtitleDark]}>
                Poste de sécurité
              </Text>
            </TouchableOpacity>

            {/* CARTE 4 : RAPPORTS & AUDIT */}
            <TouchableOpacity
              style={[styles.card, isDark && styles.cardDark]}
              onPress={() => setStatsModalOpen(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Journal d'activité"
            >
              <View style={styles.cardHeaderRow}>
                <View style={[styles.iconCircle, { backgroundColor: '#152E4C' }]}>
                  <IconFileText size={22} color="#FFFFFF" />
                </View>
                <View style={styles.cardPillBadge}>
                  <Text style={styles.cardPillBadgeText}>24h</Text>
                </View>
              </View>
              <Text style={[styles.cardTitle, isDark && styles.cardTitleDark]}>
                Journal
              </Text>
              <Text style={[styles.cardSubtitle, isDark && styles.cardSubtitleDark]}>Historique du site</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* SECTION DERNIÈRES DÉTECTIONS */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            RÉCENTES ALERTES
          </Text>
          <TouchableOpacity
            onPress={() => onNavigate('alerts')}
            activeOpacity={0.7}
            style={styles.sectionLinkBtn}
          >
            <Text style={styles.sectionLinkText}>Tout voir</Text>
            <IconChevronRight size={14} color={PREVIA_COLORS.bluePrimary} />
          </TouchableOpacity>
        </View>

        {alertesRecentes.length > 0 ? (
          alertesRecentes.map((alerte) => {
            const isCritique = alerte.severite === 'CRITIQUE' || alerte.type?.toLowerCase().includes('intrusion');

            return (
              <View key={alerte.id} style={[styles.recentAlertCard, isDark && styles.recentAlertCardDark]}>
                <View style={styles.recentAlertLeft}>
                  <View
                    style={[
                      styles.alertBadgeDot,
                      { backgroundColor: isCritique ? PREVIA_COLORS.redAlert : '#F59E0B' },
                    ]}
                  />
                  <View style={styles.recentAlertTexts}>
                    <Text style={[styles.recentAlertTitle, isDark && styles.recentAlertTitleDark]}>
                      {alerte.type || 'Anomalie détectée'}
                    </Text>
                    <Text style={[styles.recentAlertMeta, isDark && styles.recentAlertMetaDark]}>
                      {alerte.camera || 'Caméra'} • {alerte.date || 'Récemment'}
                    </Text>
                  </View>
                </View>

                {onVerifyAlert && (
                  <TouchableOpacity
                    style={styles.recentAlertVerifyBtn}
                    onPress={() => onVerifyAlert(alerte.id)}
                    activeOpacity={0.75}
                  >
                    <IconCheck size={14} color="#FFFFFF" />
                    <Text style={styles.recentAlertVerifyText}>Acquitter</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        ) : (
          <View style={[styles.emptySecuredCard, isDark && styles.emptySecuredCardDark]}>
            <View style={styles.emptySecuredIconWrap}>
              <IconShieldCheck size={26} color="#10B981" />
            </View>
            <View style={styles.emptySecuredTexts}>
              <Text style={[styles.emptySecuredTitle, isDark && styles.emptySecuredTitleDark]}>
                Site sécurisé
              </Text>
              <Text style={[styles.emptySecuredSub, isDark && styles.cardSubtitleDark]}>
                Aucun incident en cours
              </Text>
            </View>
          </View>
        )}

        {/* BOUTON D'ACTION PRINCIPAL PLEINE LARGEUR */}
        <TouchableOpacity
          style={styles.primaryCta}
          onPress={() => onNavigate('direct')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Lancer la ronde vidéo des caméras"
        >
          <Text style={styles.primaryCtaText}>Lancer la ronde</Text>
          <IconChevronRight size={18} color="#FFFFFF" />
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
              Toutes les détections automatiques et rondes sont enregistrées en temps réel.
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

  // HERO CARD SAPPHIRE
  heroCard: {
    backgroundColor: '#012852',
    borderRadius: PREVIA_RADIUS.card,
    padding: 18,
    marginBottom: 20,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#014791',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 159, 227, 0.25)',
  },
  heroGlowAccent: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(0, 159, 227, 0.2)',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  heroStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: PREVIA_RADIUS.pill,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  heroStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  heroStatusText: {
    color: '#6EE7B7',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroTimeText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 11,
    fontWeight: '600',
  },
  heroContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  heroTextContainer: {
    flex: 1,
    paddingRight: 10,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  heroSubtitle: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 12.5,
    fontWeight: '500',
  },
  heroShieldCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 159, 227, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.3)',
  },
  telemetryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(6, 26, 52, 0.6)',
    borderRadius: PREVIA_RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  telemetryChip: {
    alignItems: 'center',
    flex: 1,
  },
  telemetryValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  telemetryValueAlert: {
    color: '#FF6B6B',
  },
  telemetryLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 10.5,
    fontWeight: '600',
  },
  telemetryDivider: {
    width: 1,
    height: 22,
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
});
