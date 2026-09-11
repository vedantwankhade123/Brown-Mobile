import React, { useEffect, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
} from 'react-native';

export type BrownAlertButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive' | 'primary';
  onPress?: () => void;
};

export type BrownAlertPayload = {
  title: string;
  message?: string;
  buttons?: BrownAlertButton[];
};

type Listener = (payload: BrownAlertPayload | null) => void;

const listeners = new Set<Listener>();
let current: BrownAlertPayload | null = null;

function emit(payload: BrownAlertPayload | null) {
  current = payload;
  listeners.forEach((fn) => fn(payload));
}

/**
 * Drop-in replacement for React Native Alert.alert with Brown dark theme.
 * API mirrors Alert.alert(title, message?, buttons?).
 */
export function brownAlert(
  title: string,
  message?: string,
  buttons?: BrownAlertButton[]
): void {
  const normalized =
    buttons && buttons.length > 0
      ? buttons
      : [{ text: 'OK', style: 'primary' as const }];
  emit({ title, message, buttons: normalized });
}

/** Monkey-patch RN Alert.alert globally so existing call sites get dark theme. */
export function installBrownAlertPatch(): void {
  try {
    const RN = require('react-native');
    if (RN?.Alert) {
      RN.Alert.alert = brownAlert;
    }
  } catch {}
}

export const BrownAlertHost: React.FC = () => {
  const [payload, setPayload] = useState<BrownAlertPayload | null>(current);

  useEffect(() => {
    const listener: Listener = (next) => setPayload(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const close = useCallback(() => emit(null), []);

  const onButton = useCallback(
    (btn: BrownAlertButton) => {
      close();
      // Defer so modal unmounts before callback navigation/state updates
      setTimeout(() => {
        try {
          btn.onPress?.();
        } catch {}
      }, 40);
    },
    [close]
  );

  if (!payload) return null;

  const buttons = payload.buttons || [{ text: 'OK', style: 'primary' as const }];
  const hasCancel = buttons.some((b) => b.style === 'cancel');

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={hasCancel ? close : undefined}>
        <Pressable style={styles.card} onPress={(e: any) => e.stopPropagation?.()}>
          <Text style={styles.title}>{payload.title}</Text>
          {!!payload.message && <Text style={styles.message}>{payload.message}</Text>}

          <View style={[styles.actions, buttons.length > 2 && styles.actionsStacked]}>
            {buttons.map((btn, idx) => {
              const isPrimary =
                btn.style === 'primary' ||
                (!btn.style && idx === buttons.length - 1 && buttons.length === 1) ||
                (btn.style === 'default' && idx === buttons.length - 1 && !buttons.some((b) => b.style === 'primary'));
              const isCancel = btn.style === 'cancel';
              const isDestructive = btn.style === 'destructive';
              // Prefer last non-cancel as primary when none marked
              const treatAsPrimary =
                btn.style === 'primary' ||
                (isPrimary && !isCancel && !isDestructive) ||
                (btn.style !== 'cancel' &&
                  btn.style !== 'destructive' &&
                  idx === buttons.length - 1 &&
                  !buttons.some((b) => b.style === 'primary'));

              return (
                <TouchableOpacity
                  key={`${btn.text}-${idx}`}
                  style={[
                    styles.btn,
                    buttons.length > 2 && styles.btnFull,
                    treatAsPrimary && styles.btnPrimary,
                    isCancel && styles.btnCancel,
                    isDestructive && styles.btnDestructive,
                    !treatAsPrimary && !isCancel && !isDestructive && styles.btnSecondary,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => onButton(btn)}
                >
                  <Text
                    style={[
                      styles.btnText,
                      treatAsPrimary && styles.btnTextPrimary,
                      isCancel && styles.btnTextCancel,
                      isDestructive && styles.btnTextDestructive,
                    ]}
                  >
                    {btn.text.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#141416',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 16,
  },
  title: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 8,
  },
  message: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionsStacked: {
    flexDirection: 'column-reverse',
    alignItems: 'stretch',
  },
  btn: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnFull: {
    width: '100%',
  },
  btnPrimary: {
    backgroundColor: '#2563eb',
  },
  btnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  btnCancel: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  btnDestructive: {
    backgroundColor: 'rgba(239,68,68,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
  },
  btnText: {
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  btnTextPrimary: {
    color: '#ffffff',
  },
  btnTextCancel: {
    color: 'rgba(255,255,255,0.7)',
  },
  btnTextDestructive: {
    color: '#fca5a5',
  },
});
