import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity as NativeTouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Matches desktop --brown-composer-action-surface at every button size.
export const buttonSurfaceColors = ['#5b5b5b', '#343434'] as const;
export const ButtonSurface: React.FC<{ radius?: number }> = ({ radius = 9999 }) => (
  <View
    pointerEvents="none"
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
    style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}
  >
    <LinearGradient
      pointerEvents="none"
      colors={buttonSurfaceColors}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
  </View>
);
function readableChildren(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, child => {
    if (!React.isValidElement<any>(child)) return child;
    const props = child.props, next: any = {};
    if (child.type === Text) {
      const color = StyleSheet.flatten(props.style)?.color;
      if (!color || /^#(?:000(?:000)?|111(?:111)?|1[0-9a-f]{5}|2[0-9a-f]{5})$/i.test(String(color))) next.style = [props.style, { color: '#f4f4f5' }];
    }
    if (/^#(?:000(?:000)?|111(?:111)?)$/i.test(String(props.color || ''))) next.color = '#f4f4f5';
    if (props.children) next.children = readableChildren(props.children);
    return React.cloneElement(child, next);
  });
}
type BrownButtonProps = { brownSurface?: boolean | 'soft' | 'light'; style?: StyleProp<ViewStyle>; children?: React.ReactNode; disabled?: boolean; [key: string]: any };
export const BrownButton = React.forwardRef<React.ElementRef<typeof NativeTouchableOpacity>, BrownButtonProps>(({ brownSurface = false, style, children, ...props }, ref) => {
  const flat = StyleSheet.flatten(style) as ViewStyle | undefined;
  if (!brownSurface) return <NativeTouchableOpacity {...props} ref={ref} style={style}>{children}</NativeTouchableOpacity>;
  return <NativeTouchableOpacity {...props} ref={ref} style={[style, { backgroundColor: buttonSurfaceColors[1], borderRadius: flat?.borderRadius ?? 9999 }]}><ButtonSurface radius={flat?.borderRadius ?? 9999} /><View pointerEvents="box-none" style={{ zIndex: 1, opacity: props.disabled ? 0.45 : 1, alignSelf: 'stretch', minWidth: 0, flexGrow: flat?.flexDirection === 'row' ? 1 : undefined, flexBasis: flat?.flexDirection === 'row' ? 0 : undefined, flexShrink: 1, flexDirection: flat?.flexDirection, alignItems: flat?.alignItems, justifyContent: flat?.justifyContent, gap: flat?.gap }}>{readableChildren(children)}</View></NativeTouchableOpacity>;
});
BrownButton.displayName = 'BrownButton';
