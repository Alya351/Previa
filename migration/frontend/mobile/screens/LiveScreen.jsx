import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { PREVIA_COLORS, PREVIA_RADIUS, PREVIA_TOUCH_TARGET } from '../theme';
import { AppHeader } from '../components/AppHeader';
import { FluxCamera } from '../components/FluxCamera';
import { useFluxDirect } from '../lib/useFluxDirect';
import { useImageEnDirect } from '../api';
import { IconRadio, IconRefresh, IconPhone } from '../components/Icons';

export const LiveScreen = ({
  cameras = [],
  cameraChoisie,
  onSelectCamera,
  unreadCount = 0,
  onNavigate,
  isDark = false,
  numeroGardiennerie = '+226 75 29 13 28',
}) => {
  // Mode de flux : 'webrtc' (basse latence) ou 'jpeg' (vue de secours images fixes)
  const [modeSecours, setModeSecours] = useState(false);

  // Flux WebRTC (natif / web)
  const streamWebRTC = useFluxDirect(modeSecours ? null : cameraChoisie);
  // Flux de secours JPEG (1 image / seconde)
  const imageSecours = useImageEnDirect(cameraChoisie, 1000);

  const sourceImage = imageSecours ? { uri: imageSecours } : require('../assets/logo_previa_clean.png');

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
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
        {/* SÉLECTEUR DE CAMÉRA HORIZONTAL (Pas de mosaïque) */}
        <View style={styles.selectorSection}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            CAMÉRAS
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selectorRow}
          >
            {cameras.length === 0 ? (
              <View style={styles.camPillInactive}>
                <Text style={styles.camPillTextInactive}>Recherche des caméras…</Text>
              </View>
            ) : (
              cameras.map((cam) => {
                const isSelected = cam.id_camera === cameraChoisie;
                const nomCamera = cam.nom || cam.num || cam.id_camera;

                return (
                  <TouchableOpacity
                    key={cam.id_camera}
                    style={[
                      styles.camPill,
                      isSelected
                        ? styles.camPillActive
                        : [styles.camPillInactive, isDark && styles.camPillInactiveDark],
                    ]}
                    onPress={() => onSelectCamera(cam.id_camera)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`Caméra ${nomCamera}`}
                  >
                    <View style={[styles.dot, isSelected ? styles.dotActive : (isDark ? styles.dotInactiveDark : styles.dotInactive)]} />
                    <Text
                      style={[
                        styles.camPillText,
                        isSelected
                          ? styles.camPillTextActive
                          : [styles.camPillTextInactive, isDark && styles.camPillTextInactiveDark],
                      ]}
                      numberOfLines={1}
                    >
                      {nomCamera}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>

        {/* LECTEUR VIDÉO PLEIN ÉCRAN RATIO 16:9 */}
        <View style={[styles.videoCard, isDark && styles.videoCardDark]}>
          <View style={styles.videoViewport}>
            <FluxCamera
              stream={modeSecours ? null : streamWebRTC}
              imageSource={sourceImage}
              style={styles.videoStream}
            />

            {/* PASTILLE "LIVE" PULSANTE EN HAUT À GAUCHE */}
            <View style={styles.liveBadge}>
              <View style={styles.livePulseDot} />
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>

            {/* QUALITÉ VIDÉO */}
            <View style={styles.telemetryBadge}>
              <IconRadio size={12} color="#009FE3" />
              <Text style={styles.telemetryText}>
                {modeSecours ? 'Mode secours' : 'Direct HD'}
              </Text>
            </View>
          </View>

          {/* BARRE DE CONTRÔLE SOUS LE LECTEUR */}
          <View style={[styles.controlBar, isDark && styles.controlBarDark]}>
            <View style={styles.camInfo}>
              <Text style={[styles.camName, isDark && styles.camNameDark]}>
                {cameras.find((c) => c.id_camera === cameraChoisie)?.nom ||
                  cameras.find((c) => c.id_camera === cameraChoisie)?.num ||
                  (cameraChoisie ? `Caméra ${cameraChoisie.slice(0, 8)}` : 'Caméra sélectionnée')}
              </Text>
              <Text style={[styles.camProtocol, isDark && styles.camProtocolDark]}>
                {modeSecours ? 'Flux secours' : 'Flux direct'}
              </Text>
            </View>

            {/* BASCULE VUE DIRECT / SECOURS */}
            <TouchableOpacity
              style={[
                styles.switchModeButton,
                isDark && !modeSecours && styles.switchModeButtonDark,
                modeSecours && styles.switchModeButtonActive,
              ]}
              onPress={() => setModeSecours(!modeSecours)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Basculer le mode de flux"
            >
              <IconRefresh size={16} color={modeSecours ? '#FFFFFF' : (isDark ? '#38BDF8' : PREVIA_COLORS.bluePrimary)} />
              <Text style={[
                styles.switchModeText,
                isDark && !modeSecours && styles.switchModeTextDark,
                modeSecours && styles.switchModeTextActive,
              ]}>
                {modeSecours ? 'Direct' : 'Secours'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ACTIONS OPÉRATIONNELLES DE TERRAIN */}
        <View style={styles.liveActionsContainer}>
          {/* BOUTON D'APPEL DIRECT GARDIENNERIE */}
          <TouchableOpacity
            style={styles.callGuardsButton}
            onPress={() => {
              const telClean = (numeroGardiennerie || '').replace(/\s+/g, '');
              if (telClean) {
                Linking.openURL(`tel:${telClean}`).catch(() => {});
              }
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Contacter la gardiennerie au ${numeroGardiennerie || ''}`}
          >
            <IconPhone size={20} color="#FFFFFF" />
            <Text style={styles.callGuardsButtonText}>Contacter la Gardiennerie</Text>
          </TouchableOpacity>
        </View>
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
  selectorSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: PREVIA_COLORS.graySecondary,
    letterSpacing: 1.1,
    marginBottom: 10,
  },
  sectionTitleDark: {
    color: PREVIA_COLORS.darkTextSecondary,
  },
  selectorRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  camPill: {
    ...PREVIA_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: PREVIA_RADIUS.pill,
    gap: 8,
    borderWidth: 1,
  },
  camPillActive: {
    backgroundColor: PREVIA_COLORS.bluePrimary,
    borderColor: PREVIA_COLORS.bluePrimary,
  },
  camPillInactive: {
    backgroundColor: PREVIA_COLORS.white,
    borderColor: '#E5E7EB',
  },
  camPillInactiveDark: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: '#FFFFFF',
  },
  dotInactive: {
    backgroundColor: '#9CA3AF',
  },
  dotInactiveDark: {
    backgroundColor: '#64748B',
  },
  camPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  camPillTextActive: {
    color: '#FFFFFF',
  },
  camPillTextInactive: {
    color: PREVIA_COLORS.navyText,
  },
  camPillTextInactiveDark: {
    color: '#E2E8F0',
  },
  videoCard: {
    backgroundColor: PREVIA_COLORS.white,
    borderRadius: PREVIA_RADIUS.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 18,
    elevation: 3,
    shadowColor: '#152E4C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  videoCardDark: {
    backgroundColor: PREVIA_COLORS.darkSurface,
    borderColor: PREVIA_COLORS.darkBorder,
  },
  videoViewport: {
    width: '100%',
    aspectRatio: 16 / 9, // Ratio 16:9 plein écran
    backgroundColor: '#000000',
    position: 'relative',
  },
  videoStream: {
    width: '100%',
    height: '100%',
  },
  liveBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(17, 19, 22, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: PREVIA_RADIUS.sm,
  },
  livePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: PREVIA_COLORS.redAlert,
  },
  liveBadgeText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  telemetryBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(17, 19, 22, 0.85)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: PREVIA_RADIUS.sm,
  },
  telemetryText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  controlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: PREVIA_COLORS.white,
  },
  controlBarDark: {
    backgroundColor: PREVIA_COLORS.darkSurface,
  },
  camInfo: {
    flex: 1,
  },
  camName: {
    fontSize: 14,
    fontWeight: '700',
    color: PREVIA_COLORS.navyText,
  },
  camNameDark: {
    color: PREVIA_COLORS.darkTextPrimary,
  },
  camProtocol: {
    fontSize: 11.5,
    color: PREVIA_COLORS.graySecondary,
    marginTop: 2,
  },
  camProtocolDark: {
    color: '#D1D5DB',
  },
  switchModeButton: {
    ...PREVIA_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: PREVIA_RADIUS.button,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  switchModeButtonDark: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  switchModeButtonActive: {
    backgroundColor: PREVIA_COLORS.bluePrimary,
    borderColor: PREVIA_COLORS.bluePrimary,
  },
  switchModeText: {
    color: PREVIA_COLORS.bluePrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  switchModeTextDark: {
    color: '#38BDF8',
  },
  switchModeTextActive: {
    color: '#FFFFFF',
  },
  liveActionsContainer: {
    gap: 12,
    marginBottom: 24,
  },
  callGuardsButton: {
    ...PREVIA_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#059669',
    borderRadius: PREVIA_RADIUS.button,
    paddingVertical: 14,
    paddingHorizontal: 20,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  callGuardsButtonText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
