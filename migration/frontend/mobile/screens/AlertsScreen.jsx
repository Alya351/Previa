import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  Modal,
  Linking,
} from 'react-native';
import { PREVIA_COLORS, PREVIA_RADIUS, PREVIA_TOUCH_TARGET } from '../theme';
import { AppHeader } from '../components/AppHeader';
import { AlertItemSkeleton } from '../components/SkeletonLoader';
import { IconCheck, IconX, IconChevronRight, IconArrowLeft, IconPhone } from '../components/Icons';
import { urlImageAlerte } from '../api';

export const AlertsScreen = ({
  alerts = [],
  onRefresh,
  isRefreshing = false,
  isLoading = false,
  unreadCount = 0,
  onNavigate,
  onVerifyAlert,
  onRejectAlert,
  isDark = false,
  numeroGardiennerie = '+226 75 29 13 28',
}) => {
  const [filterMode, setFilterMode] = useState('toutes'); // 'toutes' | 'non_traitees'
  const [selectedAlert, setSelectedAlert] = useState(null);

  // Filtrage simple (Section 5.3)
  const filteredAlerts = alerts.filter((al) => {
    if (filterMode === 'non_traitees') {
      return al.statut !== 'VERIFIE' && al.statut !== 'REJETE';
    }
    return true;
  });

  // Calcul d'horodatage relatif ("il y a 3 min")
  const getRelativeTime = (timeString) => {
    return timeString || 'Récemment';
  };

  // Code couleur de sévérité strict (Section 5.3)
  const getSeverityBadge = (criticite) => {
    const isCritique = criticite === 'CRITIQUE';
    const isEleve = criticite === 'ELEVE' || criticite === 'ÉLEVÉ';

    if (isCritique) {
      return {
        label: 'Critique',
        color: PREVIA_COLORS.redAlert, // #DB2323
        bg: '#FEF2F2',
      };
    }
    if (isEleve) {
      return {
        label: 'Élevé',
        color: PREVIA_COLORS.severityHigh, // #F59E0B
        bg: '#FFFBEB',
      };
    }
    return {
      label: 'Informatif',
      color: PREVIA_COLORS.bluePrimary, // #009FE3
      bg: '#EFF6FF',
    };
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <AppHeader
        unreadCount={unreadCount}
        onNotificationsPress={() => {}}
        onProfilePress={() => onNavigate('profile')}
        isDark={isDark}
      />

      <View style={styles.contentWrap}>
        {/* FILTRE SIMPLE PAR STATUT (Toutes / Non traitées) */}
        <View style={[styles.filterBar, isDark && styles.filterBarDark]}>
          <TouchableOpacity
            style={[
              styles.filterPill,
              isDark && styles.filterPillDark,
              filterMode === 'toutes' && styles.filterPillActive,
            ]}
            onPress={() => setFilterMode('toutes')}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: filterMode === 'toutes' }}
          >
            <Text
              style={[
                styles.filterText,
                isDark && styles.filterTextDark,
                filterMode === 'toutes' && styles.filterTextActive,
              ]}
            >
              Toutes ({alerts.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterPill,
              isDark && styles.filterPillDark,
              filterMode === 'non_traitees' && styles.filterPillActive,
            ]}
            onPress={() => setFilterMode('non_traitees')}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: filterMode === 'non_traitees' }}
          >
            <Text
              style={[
                styles.filterText,
                isDark && styles.filterTextDark,
                filterMode === 'non_traitees' && styles.filterTextActive,
              ]}
            >
              À traiter ({alerts.filter(a => a.statut !== 'VERIFIE' && a.statut !== 'REJETE').length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* LISTE D'ALERTES / ÉTAT DE CHARGEMENT / VIDE */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              colors={[PREVIA_COLORS.bluePrimary]}
              tintColor={PREVIA_COLORS.bluePrimary}
            />
          }
        >
          {isLoading && alerts.length === 0 ? (
            <View>
              <AlertItemSkeleton />
              <AlertItemSkeleton />
              <AlertItemSkeleton />
            </View>
          ) : filteredAlerts.length === 0 ? (
            /* ÉTAT VIDE : Texte neutre et propre */
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyTitle, isDark && styles.emptyTitleDark]}>
                Aucune alerte
              </Text>
              <Text style={styles.emptySubtitle}>
                Tous les secteurs sont calmes.
              </Text>
            </View>
          ) : (
            filteredAlerts.map((al) => {
              const sev = getSeverityBadge(al.criticite);
              const estTraitee = al.statut === 'VERIFIE' || al.statut === 'REJETE';

              return (
                <TouchableOpacity
                  key={al.id}
                  style={[
                    styles.alertCard,
                    isDark && styles.alertCardDark,
                    estTraitee && styles.alertCardResolved,
                  ]}
                  onPress={() => setSelectedAlert(al)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Alerte ${al.title}, sévérité ${sev.label}, caméra ${al.camera}`}
                >
                  {/* VIGNETTE PHOTO DE L'INCIDENT */}
                  <Image
                    source={{ uri: urlImageAlerte(al.id) }}
                    style={styles.thumbnail}
                    defaultSource={require('../assets/cam1.jpg')}
                  />

                  {/* CORPS DE CARTE */}
                  <View style={styles.alertContent}>
                    <View style={styles.alertHeaderRow}>
                      <Text style={[styles.alertTitle, isDark && styles.alertTitleDark]} numberOfLines={1}>
                        {al.title}
                      </Text>
                      <View style={[styles.sevBadge, { backgroundColor: sev.bg }]}>
                        <Text style={[styles.sevBadgeText, { color: sev.color }]}>
                          {sev.label}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.alertMeta, isDark && styles.alertMetaDark]} numberOfLines={1}>
                      {al.camera} • {al.emplacement}
                    </Text>

                    <View style={styles.alertFooterRow}>
                      <Text style={[styles.alertTime, isDark && styles.alertTimeDark]}>
                        {getRelativeTime(al.time)}
                      </Text>
                      <Text style={[styles.alertStatusText, estTraitee && styles.statusResolved]}>
                        {al.statut === 'VERIFIE' ? 'Vérifié' : al.statut === 'REJETE' ? 'Rejeté' : 'Non traité'}
                      </Text>
                    </View>
                  </View>

                  <IconChevronRight size={18} color={isDark ? '#9CA3AF' : PREVIA_COLORS.graySecondary} />
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>

      {/* MODALE FICHE DÉTAIL D'ALERTE (LEVÉE DE DOUTE + VALIDATION AU POUCE SF-MOB-03) */}
      <Modal
        visible={!!selectedAlert}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setSelectedAlert(null)}
      >
        {selectedAlert && (
          <View style={[styles.modalScreen, isDark && styles.containerDark]}>
            {/* EN-TÊTE DE LA FICHE DÉTAIL */}
            <View style={[styles.modalTopNav, isDark && styles.modalTopNavDark]}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setSelectedAlert(null)}
                accessibilityRole="button"
                accessibilityLabel="Retour à la liste des alertes"
              >
                <IconArrowLeft size={22} color={isDark ? '#F3F4F6' : PREVIA_COLORS.navyText} />
                <Text style={[styles.backButtonText, isDark && styles.backButtonTextDark]}>
                  Alertes
                </Text>
              </TouchableOpacity>
              <Text style={[styles.modalNavTitle, isDark && styles.modalNavTitleDark]}>
                Fiche d'incident
              </Text>
              <View style={{ width: 44 }} />
            </View>

            <ScrollView contentContainerStyle={styles.detailScroll} showsVerticalScrollIndicator={false}>
              {/* PHOTO PLEINE TAILLE */}
              <View style={styles.photoContainer}>
                <Image
                  source={{ uri: urlImageAlerte(selectedAlert.id) }}
                  style={styles.fullPhoto}
                  resizeMode="cover"
                  defaultSource={require('../assets/cam1.jpg')}
                />
                <View style={styles.photoBadge}>
                  <Text style={styles.photoBadgeText}>
                    HORODATAGE : {selectedAlert.time} ({selectedAlert.date || "Aujourd'hui"})
                  </Text>
                </View>
              </View>

              {/* INFORMATIONS COMPLÈTES DE L'INCIDENT */}
              <View style={[styles.detailCard, isDark && styles.detailCardDark]}>
                <View style={styles.detailHeaderGroup}>
                  <Text style={[styles.detailTitle, isDark && styles.detailTitleDark]}>
                    {selectedAlert.title}
                  </Text>
                  <Text style={[styles.detailLocation, isDark && styles.detailLocationDark]}>
                    Lieu : {selectedAlert.camera} ({selectedAlert.emplacement})
                  </Text>
                </View>

                {/* CONSIGNE DE SÉCURITÉ */}
                <View style={[styles.aiGuidanceBox, isDark && styles.aiGuidanceBoxDark]}>
                  <Text style={[styles.aiGuidanceHeader, isDark && styles.aiGuidanceHeaderDark]}>
                    Consigne :
                  </Text>
                  <Text style={[styles.aiGuidanceBody, isDark && styles.aiGuidanceBodyDark]}>
                    Vérifier le secteur. En cas de doute, joindre le contact d'urgence.
                  </Text>
                </View>
              </View>

              {/* BOUTON D'APPEL DIRECT CONTACT D'URGENCE */}
              <TouchableOpacity
                style={styles.btnCallGuardsModal}
                onPress={() => {
                  const telClean = (numeroGardiennerie || '').replace(/\s+/g, '');
                  if (telClean) {
                    Linking.openURL(`tel:${telClean}`).catch(() => {});
                  }
                }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Contacter le contact d'urgence au ${numeroGardiennerie || ''}`}
              >
                <IconPhone size={20} color="#FFFFFF" />
                <Text style={styles.btnCallGuardsModalText}>Contact d'urgence</Text>
              </TouchableOpacity>

              {/* VALIDATION AU POUCE (SF-MOB-03) : DEUX BOUTONS LARGES ET BIEN SÉPARÉS */}
              <View style={styles.thumbActionContainer}>
                {/* BOUTON 1 : MARQUER COMME VÉRIFIÉ (VERT #16A34A) */}
                <TouchableOpacity
                  style={styles.btnVerify}
                  onPress={() => {
                    onVerifyAlert?.(selectedAlert.id);
                    setSelectedAlert(null);
                  }}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Valider l'incident"
                >
                  <IconCheck size={20} color="#FFFFFF" />
                  <Text style={styles.btnVerifyText}>Valider l'incident</Text>
                </TouchableOpacity>

                {/* BOUTON 2 : REJETER / FAUX POSITIF (GRIS NEUTRE #6B7280) */}
                <TouchableOpacity
                  style={styles.btnReject}
                  onPress={() => {
                    onRejectAlert?.(selectedAlert.id);
                    setSelectedAlert(null);
                  }}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Ignorer comme faux positif"
                >
                  <IconX size={20} color="#FFFFFF" />
                  <Text style={styles.btnRejectText}>Ignorer (Faux positif)</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        )}
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
  contentWrap: {
    flex: 1,
  },
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: PREVIA_COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterBarDark: {
    backgroundColor: PREVIA_COLORS.darkBackground,
    borderBottomColor: PREVIA_COLORS.darkBorder,
  },
  filterPill: {
    ...PREVIA_TOUCH_TARGET,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: PREVIA_RADIUS.pill,
    backgroundColor: PREVIA_COLORS.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillDark: {
    backgroundColor: '#262F3D',
  },
  filterPillActive: {
    backgroundColor: PREVIA_COLORS.bluePrimary,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: PREVIA_COLORS.navyText,
  },
  filterTextDark: {
    color: '#E5E7EB',
  },
  filterTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PREVIA_COLORS.white,
    borderRadius: PREVIA_RADIUS.card,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    elevation: 2,
    shadowColor: '#152E4C',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  alertCardDark: {
    backgroundColor: PREVIA_COLORS.darkSurface,
    borderColor: PREVIA_COLORS.darkBorder,
  },
  alertCardResolved: {
    opacity: 0.7,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: PREVIA_RADIUS.md,
    backgroundColor: '#000000',
    marginRight: 14,
  },
  alertContent: {
    flex: 1,
  },
  alertHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  alertTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: PREVIA_COLORS.navyText,
    flex: 1,
  },
  alertTitleDark: {
    color: PREVIA_COLORS.darkTextPrimary,
  },
  sevBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: PREVIA_RADIUS.sm,
  },
  sevBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  alertMeta: {
    fontSize: 12,
    color: PREVIA_COLORS.graySecondary,
    marginBottom: 6,
  },
  alertMetaDark: {
    color: '#D1D5DB', // High-contrast silver in dark mode
  },
  alertFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  alertTime: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  alertTimeDark: {
    color: '#D1D5DB', // High-contrast silver in dark mode
  },
  alertStatusText: {
    fontSize: 11,
    fontWeight: '600',
    color: PREVIA_COLORS.bluePrimary,
  },
  statusResolved: {
    color: PREVIA_COLORS.graySecondary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: PREVIA_COLORS.navyText,
    marginTop: 18,
    marginBottom: 6,
  },
  emptyTitleDark: {
    color: PREVIA_COLORS.darkTextPrimary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: PREVIA_COLORS.graySecondary,
    textAlign: 'center',
  },
  modalScreen: {
    flex: 1,
    backgroundColor: PREVIA_COLORS.bgLight,
  },
  modalTopNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: PREVIA_COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTopNavDark: {
    backgroundColor: PREVIA_COLORS.nearBlack,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  backButton: {
    ...PREVIA_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: PREVIA_COLORS.navyText,
  },
  backButtonTextDark: {
    color: '#F3F4F6',
  },
  modalNavTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: PREVIA_COLORS.navyText,
  },
  modalNavTitleDark: {
    color: '#F3F4F6',
  },
  detailScroll: {
    padding: 20,
    paddingBottom: 40,
  },
  photoContainer: {
    width: '100%',
    height: 240,
    borderRadius: PREVIA_RADIUS.card,
    overflow: 'hidden',
    backgroundColor: '#000000',
    marginBottom: 16,
    position: 'relative',
  },
  fullPhoto: {
    width: '100%',
    height: '100%',
  },
  photoBadge: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(17, 19, 22, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: PREVIA_RADIUS.sm,
  },
  photoBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  detailCard: {
    backgroundColor: PREVIA_COLORS.white,
    borderRadius: PREVIA_RADIUS.card,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 24,
  },
  detailCardDark: {
    backgroundColor: PREVIA_COLORS.darkSurface,
    borderColor: PREVIA_COLORS.darkBorder,
  },
  detailHeaderGroup: {
    marginBottom: 14,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: PREVIA_COLORS.navyText,
    marginBottom: 4,
  },
  detailTitleDark: {
    color: PREVIA_COLORS.darkTextPrimary,
  },
  detailLocation: {
    fontSize: 13,
    color: PREVIA_COLORS.graySecondary,
  },
  detailLocationDark: {
    color: '#D1D5DB',
  },
  aiGuidanceBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: PREVIA_RADIUS.md,
    padding: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  aiGuidanceBoxDark: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  aiGuidanceHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: PREVIA_COLORS.blueDeep,
    marginBottom: 4,
  },
  aiGuidanceHeaderDark: {
    color: '#60A5FA',
  },
  aiGuidanceBody: {
    fontSize: 12.5,
    color: PREVIA_COLORS.navyText,
    lineHeight: 18,
  },
  aiGuidanceBodyDark: {
    color: '#E2E8F0',
  },
  btnCallGuardsModal: {
    ...PREVIA_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#059669',
    borderRadius: PREVIA_RADIUS.button,
    paddingVertical: 16,
    marginBottom: 16,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  btnCallGuardsModalText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  thumbActionContainer: {
    gap: 14, // Deux boutons larges et BIEN SÉPARÉS (Section 5.3)
  },
  btnVerify: {
    ...PREVIA_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: PREVIA_COLORS.actionVerify, // Vert #16A34A
    borderRadius: PREVIA_RADIUS.button,
    paddingVertical: 18,
    elevation: 3,
  },
  btnVerifyText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  btnReject: {
    ...PREVIA_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: PREVIA_COLORS.actionReject, // Gris neutre #6B7280
    borderRadius: PREVIA_RADIUS.button,
    paddingVertical: 18,
  },
  btnRejectText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
