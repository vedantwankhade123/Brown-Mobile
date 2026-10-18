import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal as NativeModal, ModalProps, StyleSheet, View } from 'react-native';
import { animateOnce } from '../utils/motion';
import { useReducedMotion } from '../utils/useReducedMotion';

/** Keeps the last dialog content alive through dismissal, including cleared form targets. */
type AnimatedModalProps = ModalProps & {
  transition?: { enterDuration?: number; exitDuration?: number; distance?: number; scaleFrom?: number };
};
export const AnimatedModal: React.FC<AnimatedModalProps> = ({ visible = true, children, animationType, onDismiss, transition, ...props }) => {
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;
  const content = useRef<React.ReactNode>(children);
  const generation = useRef(0);
  const reduced = useReducedMotion();
  const enterDuration = transition?.enterDuration ?? 200;
  const exitDuration = transition?.exitDuration ?? 150;
  if (visible) content.current = children;

  useEffect(() => {
    if (!visible && !mounted) return;
    const token = ++generation.current;
    if (visible) setMounted(true);
    const duration = reduced ? 0 : visible ? enterDuration : exitDuration;
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0, duration,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
      useNativeDriver: true,
    });
    animateOnce(animation, duration, () => {
      if (token !== generation.current) return;
      progress.setValue(visible ? 1 : 0);
      if (!visible) { setMounted(false); onDismiss?.(); }
    });
    return () => { ++generation.current; animation.stop(); };
  }, [visible, reduced, progress, enterDuration, exitDuration]);

  if (!mounted && !visible) return null;
  const slide = animationType === 'slide';
  return <NativeModal {...props} visible transparent={props.transparent} animationType="none">
    <View style={[styles.fill, !props.transparent && styles.opaque]}>
    <Animated.View pointerEvents={visible ? 'auto' : 'none'} style={[styles.fill, {
      opacity: progress,
      transform: [
        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : transition?.distance ?? (slide ? 24 : 6), 0] }) },
        { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 1 : transition?.scaleFrom ?? 1, 1] }) },
      ],
    }]}>{visible ? children : content.current}</Animated.View>
    </View>
  </NativeModal>;
};
const styles = StyleSheet.create({ fill: { flex: 1 }, opaque: { backgroundColor: '#000000' } });
