import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { PREVIA_COLORS, PREVIA_RADIUS, PREVIA_TOUCH_TARGET } from '../theme';
import { IconBell, IconSearch } from './Icons';

export const AppHeader = ({
  unreadCount = 0,
  userName = 'Alya KIEMDE',
  onSearchPress,
  onNotificationsPress,
  isDark = false,
}) => {
  return (
    <View style={[styles.header, isDark && styles.headerDark]}>
      {/* BRAND & GREETING */}
      <View style={styles.brandContainer}>
        <View style={styles.logoPill}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoLetter}>P</Text>
          </View>
          <Text style={styles.brandName}>PREVIA</Text>
        </View>
        <Text style={styles.greetingLight}>Bonjour,</Text>
        <Text style={styles.greetingName}>{userName} !</Text>
      </View>

      {/* TOP RIGHT ACTIONS */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[styles.circularBtn, isDark && styles.circularBtnDark]}
          onPress={onSearchPress}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Rechercher"
        >
          <IconSearch size={18} color={isDark ? '#F3F4F6' : PREVIA_COLORS.navyText} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.circularBtn, isDark && styles.circularBtnDark]}
          onPress={onNotificationsPress}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Consulter les alertes"
        >
          <IconBell size={18} color={isDark ? '#F3F4F6' : PREVIA_COLORS.navyText} />
          {unreadCount > 0 && (
            <View style={styles.badgeDot} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: 'transparent',
  },
  headerDark: {
    backgroundColor: PREVIA_COLORS.nearBlack,
  },
  brandContainer: {
    flexDirection: 'column',
  },
  logoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  logoBadge: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: PREVIA_COLORS.bluePrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 11,
  },
  brandName: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: PREVIA_COLORS.blueDeep,
  },
  greetingLight: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
    lineHeight: 16,
  },
  greetingName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
    lineHeight: 24,
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  circularBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  circularBtnDark: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  badgeDot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: PREVIA_COLORS.redAlert,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
});
