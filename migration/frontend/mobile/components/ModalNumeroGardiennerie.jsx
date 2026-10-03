import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { PREVIA_COLORS, PREVIA_RADIUS, PREVIA_TOUCH_TARGET } from '../theme';
import { IconPhone, IconX, IconCheck } from './Icons';

export const ModalNumeroGardiennerie = ({
  visible,
  onClose,
  currentNumber = '+226 75 29 13 28',
  onSave,
  isDark = false,
}) => {
  const [numero, setNumero] = useState(currentNumber);

  useEffect(() => {
    setNumero(currentNumber || '');
  }, [currentNumber, visible]);

  const handleEnregistrer = () => {
    const nettoye = numero.trim();
    if (nettoye.length > 0) {
      onSave(nettoye);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.backdrop}
      >
        <View style={[styles.card, isDark && styles.cardDark]}>
          {/* EN-TÊTE DE LA MODALE */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <IconPhone size={20} color="#FFFFFF" />
            </View>
            <View style={styles.headerTexts}>
              <Text style={[styles.title, isDark && styles.titleDark]}>
                Contact d'urgence
              </Text>
              <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
                Ligne directe paramétrable (sécurité, proches)
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              hitSlop={8}
            >
              <IconX size={20} color={isDark ? '#9CA3AF' : PREVIA_COLORS.graySecondary} />
            </TouchableOpacity>
          </View>

          {/* CHAMP DE SAISIE */}
          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>
              NUMÉRO DE TÉLÉPHONE D'URGENCE
            </Text>
            <TextInput
              style={[styles.input, isDark && styles.inputDark]}
              value={numero}
              onChangeText={setNumero}
              placeholder="+226 XX XX XX XX"
              placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
              keyboardType="phone-pad"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleEnregistrer}
            />
          </View>

          {/* ACTIONS */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.btnCancel, isDark && styles.btnCancelDark]}
              onPress={onClose}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Annuler"
            >
              <Text style={[styles.btnCancelText, isDark && styles.btnCancelTextDark]}>
                Annuler
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.btnSave}
              onPress={handleEnregistrer}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Enregistrer le numéro de la gardiennerie"
            >
              <IconCheck size={18} color="#FFFFFF" />
              <Text style={styles.btnSaveText}>Enregistrer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: PREVIA_COLORS.white,
    borderRadius: PREVIA_RADIUS.card,
    padding: 22,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    gap: 18,
  },
  cardDark: {
    backgroundColor: PREVIA_COLORS.darkSurface,
    borderColor: PREVIA_COLORS.darkBorder,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTexts: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: PREVIA_COLORS.navyText,
  },
  titleDark: {
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 12,
    color: PREVIA_COLORS.graySecondary,
    marginTop: 2,
  },
  subtitleDark: {
    color: '#9CA3AF',
  },
  closeBtn: {
    padding: 4,
  },
  inputContainer: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: PREVIA_COLORS.blueDeep,
    letterSpacing: 0.8,
  },
  inputLabelDark: {
    color: '#93C5FD',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: PREVIA_RADIUS.button,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '700',
    color: PREVIA_COLORS.navyText,
  },
  inputDark: {
    backgroundColor: '#111316',
    borderColor: '#334155',
    color: '#FFFFFF',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  btnCancel: {
    ...PREVIA_TOUCH_TARGET,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: PREVIA_RADIUS.button,
    backgroundColor: '#F1F5F9',
  },
  btnCancelDark: {
    backgroundColor: '#1E293B',
  },
  btnCancelText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: PREVIA_COLORS.graySecondary,
  },
  btnCancelTextDark: {
    color: '#D1D5DB',
  },
  btnSave: {
    ...PREVIA_TOUCH_TARGET,
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: PREVIA_RADIUS.button,
    backgroundColor: '#059669',
  },
  btnSaveText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
