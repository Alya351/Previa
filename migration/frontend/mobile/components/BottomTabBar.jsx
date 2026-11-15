import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PREVIA_COLORS, PREVIA_RADIUS, PREVIA_TOUCH_TARGET } from '../theme';
import { IconHome, IconCamera, IconScan, IconBarChart, IconUser } from './Icons';

export const BottomTabBar = ({ activeTab, onTabPress, onScanPress, unreadCount = 0 }) => {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 10);

  const leftTabs = [
    { key: 'home', label: 'Accueil', icon: IconHome },
    { key: 'direct', label: 'Caméras', icon: IconCamera },
  ];

  const rightTabs = [
    { key: 'activity', label: 'Activité', icon: IconBarChart, badge: unreadCount },
    { key: 'profile', label: 'Profil', icon: IconUser },
  ];

  const renderTab = (tab) => {
    const isActive = activeTab === tab.key;
    const IconComponent = tab.icon;

    return (
      <TouchableOpacity
        key={tab.key}
        style={styles.tabButton}
        onPress={() => onTabPress(tab.key)}
        activeOpacity={0.75}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
      >
        <View style={styles.iconWrap}>
          <IconComponent
            size={22}
            color={isActive ? PREVIA_COLORS.bluePrimary : '#94A3B8'}
          />
          {tab.badge > 0 ? (
            <View style={styles.badgeIndicator}>
              <Text style={styles.badgeText}>
                {tab.badge > 99 ? '99+' : tab.badge}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
          {tab.label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.barContainer, { paddingBottom: bottomInset }]}>
      <View style={styles.tabTrack}>
        {/* ONGLETS GAUCHE */}
        <View style={styles.tabsSide}>
          {leftTabs.map(renderTab)}
        </View>

        {/* BOUTON CENTRAL SURÉLEVÉ (SCANNER FACE ID / IA) */}
        <View style={styles.centerFabContainer}>
          <TouchableOpacity
            style={styles.centerFab}
            onPress={onScanPress || (() => onTabPress('direct'))}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Scanner Face ID et Détection IA"
          >
            <IconScan size={26} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* ONGLETS DROITE */}
        <View style={styles.tabsSide}>
          {rightTabs.map(renderTab)}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  barContainer: {
    backgroundColor: '#FFFFFF',
    paddingTop: 8,
    paddingHorizontal: 16,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderTopColor: 'rgba(2, 132, 199, 0.08)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 12,
  },
  tabTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  tabsSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'space-around',
  },
  tabButton: {
    ...PREVIA_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    minWidth: 56,
  },
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 4,
  },
  tabLabelActive: {
    color: PREVIA_COLORS.bluePrimary,
    fontWeight: '800',
  },
  centerFabContainer: {
    position: 'relative',
    top: -22,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  centerFab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: PREVIA_COLORS.bluePrimary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: PREVIA_COLORS.bluePrimary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  badgeIndicator: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: PREVIA_COLORS.redAlert,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
});

