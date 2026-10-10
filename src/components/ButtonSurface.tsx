import React, { useId, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity as NativeTouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';

/** The desktop static button gradient, rendered natively without changing touch targets. */
export const ButtonSurface: React.FC<{ radius?: number; soft?: boolean; light?: boolean }> = ({ radius = 9999, soft = false, light = false }) => {
  const id = `button-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [size, setSize] = useState({ width: 80, height: 44 });
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden', backgroundColor: light ? '#393939' : '#0f1111' }]} onLayout={(event: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
  }}>
    <Svg style={StyleSheet.absoluteFill} width={size.width} height={size.height}><Defs><RadialGradient id={id} gradientUnits="userSpaceOnUse" cx={size.width * 0.8} cy={-size.height * 0.5} r={soft ? size.width * 1.8 : 80} rx={soft ? size.width * 1.8 : 80} ry={soft ? size.height * 1.8 : 80} fx={size.width * 0.8} fy={-size.height * 0.5}><Stop offset="0" stopColor="#777777" /><Stop offset="1" stopColor={light ? '#393939' : '#0f1111'} /></RadialGradient></Defs><Rect width="100%" height="100%" fill={`url(#${id})`} /></Svg>
  </View>;
};
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
  return <NativeTouchableOpacity {...props} ref={ref} style={[style, { backgroundColor: brownSurface === 'light' ? '#393939' : '#0f1111', borderRadius: flat?.borderRadius ?? 9999 }, props.disabled && { opacity: 0.45 }]}><ButtonSurface radius={flat?.borderRadius ?? 9999} soft={brownSurface === 'soft' || brownSurface === 'light'} light={brownSurface === 'light'} /><View pointerEvents="box-none" style={{ zIndex: 1, alignSelf: 'stretch', minWidth: 0, flexGrow: flat?.flexDirection === 'row' ? 1 : undefined, flexBasis: flat?.flexDirection === 'row' ? 0 : undefined, flexShrink: 1, flexDirection: flat?.flexDirection, alignItems: flat?.alignItems, justifyContent: flat?.justifyContent, gap: flat?.gap }}>{readableChildren(children)}</View></NativeTouchableOpacity>;
});
BrownButton.displayName = 'BrownButton';
