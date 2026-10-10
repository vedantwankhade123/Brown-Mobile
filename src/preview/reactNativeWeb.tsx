import React from 'react';
import { Text as NativeText, TextInput as NativeTextInput } from 'react-native-web';
export * from 'react-native-web';

// Android uses Roboto by default; preserve explicit component fonts, including code.
export const Text = React.forwardRef<any, any>(({ style, ...props }, ref) =>
  <NativeText {...props} ref={ref} style={[{ fontFamily: 'Roboto' }, style]} />);
export const TextInput = React.forwardRef<any, any>(({ style, ...props }, ref) =>
  <NativeTextInput {...props} ref={ref} style={[{ fontFamily: 'Roboto' }, style]} />);
