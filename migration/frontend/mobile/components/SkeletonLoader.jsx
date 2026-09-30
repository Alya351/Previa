import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { PREVIA_RADIUS } from '../theme';

export const SkeletonBox = ({ width = '100%', height = 20, borderRadius = PREVIA_RADIUS.md, style }) => {
  const opacityAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacityAnim, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacityAnim]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width, height, borderRadius, opacity: opacityAnim },
        style,
      ]}
    />
  );
};

export const HomeCardSkeleton = () => (
  <View style={styles.cardSkeleton}>
    <SkeletonBox width={48} height={48} borderRadius={24} style={{ marginBottom: 12 }} />
    <SkeletonBox width="70%" height={16} borderRadius={8} style={{ marginBottom: 8 }} />
    <SkeletonBox width="50%" height={12} borderRadius={6} />
  </View>
);

export const AlertItemSkeleton = () => (
  <View style={styles.alertSkeleton}>
    <SkeletonBox width={56} height={56} borderRadius={12} style={{ marginRight: 12 }} />
    <View style={{ flex: 1, gap: 8 }}>
      <SkeletonBox width="80%" height={16} borderRadius={8} />
      <SkeletonBox width="60%" height={12} borderRadius={6} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: '#E2E8F0',
  },
  cardSkeleton: {
    backgroundColor: '#FFFFFF',
    borderRadius: PREVIA_RADIUS.card,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    width: '48%',
    minHeight: 140,
    justifyContent: 'center',
  },
  alertSkeleton: {
    backgroundColor: '#FFFFFF',
    borderRadius: PREVIA_RADIUS.card,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
});
