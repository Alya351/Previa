import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PREVIA_COLORS, PREVIA_RADIUS, PREVIA_TOUCH_TARGET } from '../theme';
import { IconHome, IconCamera, IconBell, IconUser } from './Icons';

export const BottomTabBar = ({ activeTab, onTabPress, unreadCount = 0 }) => {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 8);

  const tabs = [
    { key: 'home', label: 'Accueil', icon: IconHome },
    { key: 'direct', label: 'Direct', icon: IconCamera },
    { key: 'alerts', label: 'Alertes', icon: IconBell, badge: unreadCount },
    { key: 'profile', label: 'Profil', icon: IconUser },
  ];

  return (
    <View style={[styles.barContainer, { paddingBottom: bottomInset + 8 }]}>
      <View style={styles.tabTrack}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const IconComponent = tab.icon;

          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tabButton,
                isActive ? styles.tabButtonActive : styles.tabButtonInactive,
              ]}
              onPress={() => onTabPress(tab.key)}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${tab.label}${tab.badge && tab.badge > 0 ? `, ${tab.badge} nouvelles alertes` : ''}`}
            >
              <View style={styles.iconWrap}>
                <IconComponent
                  size={20}
                  color={isActive ? '#FFFFFF' : '#9CA3AF'}
                />
                {!isActive && tab.badge > 0 ? (
                  <View style={styles.badgeIndicator}>
                    <Text style={styles.badgeText}>
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </Text>
                  </View>
                ) : null}
              </View>

              {isActive && (
                <Text style={styles.activeLabel} numberOfLines={1}>
                  {tab.label}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  barContainer: {
    backgroundColor: PREVIA_COLORS.nearBlack, // Fond barre de navigation basse #111316
    paddingTop: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  tabTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tabButton: {
    ...PREVIA_TOUCH_TARGET, // Cible tactile minimale 44x44 pt
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: PREVIA_RADIUS.pill,
  },
  tabButtonActive: {
    backgroundColor: PREVIA_COLORS.bluePrimary, // Pilule #009FE3 avec libellé en blanc
    paddingHorizontal: 14,
    flex: 1.6,
  },
  tabButtonInactive: {
    flex: 1,
  },
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeLabel: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
    marginLeft: 6,
    letterSpacing: 0.1,
  },
  badgeIndicator: {
    position: 'absolute',
    top: -7,
    right: -10,
    backgroundColor: PREVIA_COLORS.redAlert,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: PREVIA_COLORS.nearBlack,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
  },
});
