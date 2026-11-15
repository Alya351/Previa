import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { PREVIA_COLORS } from '../theme';
import {
  IconArrowLeft,
  IconFileText,
  IconUser,
  IconLock,
  IconCheck,
  IconAlertTriangle,
  IconChevronRight,
  IconChevronDown,
  IconPhone,
  IconCamera,
} from '../components/Icons';

export const ActivityScreen = ({ onNavigate, isDark = false, totalEvents = 132 }) => {
  const [selectedPeriod, setSelectedPeriod] = useState('Ce mois');

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {/* TOP HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.circularBtn}
          onPress={() => onNavigate('home')}
          activeOpacity={0.75}
        >
          <IconArrowLeft size={20} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Activité & Sécurité</Text>
        <TouchableOpacity
          style={styles.circularBtn}
          onPress={() => {}}
          activeOpacity={0.75}
        >
          <IconFileText size={18} color="#0F172A" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO DONUT CHART CARD */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View>
              <Text style={styles.chartSub}>Total Événements</Text>
              <Text style={styles.chartVal}>{totalEvents} Analyses</Text>
            </View>
            <View style={styles.periodPill}>
              <Text style={styles.periodText}>{selectedPeriod}</Text>
            </View>
          </View>

          {/* SVG DONUT CHART */}
          <View style={styles.donutContainer}>
            <Svg width={180} height={180} viewBox="0 0 100 100">
              {/* Background Track */}
              <Circle cx="50" cy="50" r="38" stroke="#E2E8F0" strokeWidth="12" fill="none" />
              {/* Segment 1: Navy (#014791 - 55% Détections conformes) */}
              <Circle
                cx="50" cy="50" r="38"
                stroke="#014791" strokeWidth="12"
                strokeDasharray="131 239" strokeDashoffset="0"
                fill="none" strokeLinecap="round"
                transform="rotate(-90 50 50)"
              />
              {/* Segment 2: Sapphire (#0284c7 - 25% Mouvement normal) */}
              <Circle
                cx="50" cy="50" r="38"
                stroke="#0284C7" strokeWidth="12"
                strokeDasharray="60 239" strokeDashoffset="-135"
                fill="none" strokeLinecap="round"
                transform="rotate(-90 50 50)"
              />
              {/* Segment 3: Cyan (#00b4d8 - 12% Véhicules) */}
              <Circle
                cx="50" cy="50" r="38"
                stroke="#00B4D8" strokeWidth="12"
                strokeDasharray="28 239" strokeDashoffset="-198"
                fill="none" strokeLinecap="round"
                transform="rotate(-90 50 50)"
              />
              {/* Segment 4: Red Alert (#ef4444 - 8% Alertes) */}
              <Circle
                cx="50" cy="50" r="38"
                stroke="#EF4444" strokeWidth="12"
                strokeDasharray="19 239" strokeDashoffset="-229"
                fill="none" strokeLinecap="round"
                transform="rotate(-90 50 50)"
              />
            </Svg>

            {/* DONUT CENTER TEXT */}
            <View style={styles.donutCenter}>
              <Text style={styles.donutCenterVal}>99.2%</Text>
              <Text style={styles.donutCenterLabel}>Taux Conforme</Text>
            </View>
          </View>

          {/* LEGEND PILLS */}
          <View style={styles.legendGrid}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#0284C7' }]} />
              <Text style={styles.legendText}>Vérifiées (75%)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#00B4D8' }]} />
              <Text style={styles.legendText}>Résolues (18%)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
              <Text style={styles.legendText}>En cours (7%)</Text>
            </View>
          </View>
        </View>

        {/* SECTION : ACTIONS DE RÉACTION RAPIDE (Tableau Mobile : Réagir, Couper alarme, Appeler) */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Commandes Immédiates</Text>
            <TouchableOpacity><Text style={styles.linkText}>1 tap</Text></TouchableOpacity>
          </View>

          <View style={styles.quickGrid}>
            <TouchableOpacity style={styles.quickCard} activeOpacity={0.8}>
              <View style={[styles.quickIconWrap, { backgroundColor: '#FEE2E2' }]}>
                <IconAlertTriangle size={20} color="#DC2626" />
              </View>
              <Text style={styles.quickTitle}>Couper / Sirène</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickCard} activeOpacity={0.8}>
              <View style={[styles.quickIconWrap, { backgroundColor: '#ECFDF5' }]}>
                <IconPhone size={20} color="#059669" />
              </View>
              <Text style={styles.quickTitle}>Appeler Gardien</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickCard} activeOpacity={0.8} onPress={() => onNavigate('direct')}>
              <View style={[styles.quickIconWrap, { backgroundColor: '#E0F2FE' }]}>
                <IconCamera size={20} color="#0284C7" />
              </View>
              <Text style={styles.quickTitle}>Direct Caméra</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* SECTION : HISTORIQUE RECENT */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Historique Récent</Text>
            <TouchableOpacity><Text style={styles.linkText}>Voir tout</Text></TouchableOpacity>
          </View>

          <View style={styles.historyList}>
            <View style={styles.historyCard}>
              <View style={styles.historyLeft}>
                <View style={[styles.historyIcon, { backgroundColor: '#F1F5F9' }]}>
                  <IconCheck size={18} color="#10B981" />
                </View>
                <View>
                  <Text style={styles.historyTitle}>Audit de conformité IA</Text>
                  <Text style={styles.historySub}>Auto-check système · 12:00</Text>
                </View>
              </View>
              <Text style={styles.historyBadgeGreen}>100% OK</Text>
            </View>

            <View style={styles.historyCard}>
              <View style={styles.historyLeft}>
                <View style={[styles.historyIcon, { backgroundColor: '#F0FDF4' }]}>
                  <IconCheck size={18} color="#16A34A" />
                </View>
                <View>
                  <Text style={styles.historyTitle}>Synchronisation Edge RTSP</Text>
                  <Text style={styles.historySub}>Flux 2 caméras · 11:30</Text>
                </View>
              </View>
              <Text style={styles.historyBadgeGreen}>Fluide</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  containerDark: {
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  chartCard: {
    backgroundColor: '#F0F9FF',
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(2, 132, 199, 0.15)',
    marginBottom: 24,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  chartSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  chartVal: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  periodPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
  },
  periodText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  donutContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  donutCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenterVal: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  donutCenterLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(2, 132, 199, 0.12)',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '45%',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  sectionWrap: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  linkText: {
    fontSize: 12,
    fontWeight: '700',
    color: PREVIA_COLORS.bluePrimary,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  quickCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
  },
  quickIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
  },
  historyList: {
    gap: 10,
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  historyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  historySub: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
  historyBadgeGreen: {
    fontSize: 11,
    fontWeight: '800',
    color: '#10B981',
  },
});
