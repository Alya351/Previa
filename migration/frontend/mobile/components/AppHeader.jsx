import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { PREVIA_COLORS, PREVIA_RADIUS, PREVIA_TOUCH_TARGET } from '../theme';
import { IconBell, IconUser } from './Icons';

export const AppHeader = ({ unreadCount = 0, onNotificationsPress, onProfilePress, isDark = false }) => {
  return (
    <View style={[styles.header, isDark && styles.headerDark]}>
      <View style={styles.brandContainer}>
        <Image
          source={require('../assets/logo_previa_transparent.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Logo PREVIA"
        />
      </View>

      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[styles.iconButton, isDark && styles.iconButtonDark]}
          onPress={onNotificationsPress}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Consulter les alertes"
        >
          <IconBell size={20} color={isDark ? '#F3F4F6' : PREVIA_COLORS.navyText} />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.iconButton, isDark && styles.iconButtonDark]}
          onPress={onProfilePress}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Accéder au profil"
        >
          <IconUser size={20} color={isDark ? '#F3F4F6' : PREVIA_COLORS.navyText} />
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
    paddingVertical: 12,
    backgroundColor: PREVIA_COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerDark: {
    backgroundColor: PREVIA_COLORS.nearBlack,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 110,
    height: 36,
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    ...PREVIA_TOUCH_TARGET,
    borderRadius: PREVIA_RADIUS.md,
    backgroundColor: PREVIA_COLORS.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconButtonDark: {
    backgroundColor: '#1F242D',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: PREVIA_COLORS.redAlert, // #DB2323 STRICTEMENT réservé aux badges de notification
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: PREVIA_COLORS.white,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
});
