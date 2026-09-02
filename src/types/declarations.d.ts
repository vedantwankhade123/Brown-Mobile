// Ambient type definitions for React, React Native, and Expo modules

declare namespace React {
  export type PropsWithChildren<P = {}> = P & { children?: any; key?: any };
  export interface FC<P = {}> {
    (props: PropsWithChildren<P>, context?: any): any;
  }
  export function useState<T>(initialState: T | (() => T)): [T, (newState: T | ((prev: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  export function useRef<T>(initialValue?: T): { current: T };
  export const Component: any;
  export type ReactNode = any;
  export type ReactElement = any;
}

declare module 'react' {
  export = React;
}

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
  interface Element extends React.ReactElement {}
}

declare module 'react-native' {
  export const View: any;
  export const Text: any;
  export const StyleSheet: {
    create<T extends Record<string, any>>(styles: T): T;
  };
  export const TouchableOpacity: any;
  export const TextInput: any;
  export const FlatList: any;
  export type FlatList<T = any> = any;
  export const ScrollView: any;
  export const SafeAreaView: any;
  export const StatusBar: any;
  export const Switch: any;
  export const ActivityIndicator: any;
  export const Animated: any;
  export const Image: any;
  export const Modal: any;
  export const KeyboardAvoidingView: any;
  export const Platform: { OS: 'ios' | 'android' | 'windows' | 'macos' | 'web' };
  export const Alert: {
    alert: (title: string, message?: string, buttons?: any[]) => void;
  };
  export const ProgressBarAndroid: any;
}

declare module '@react-native-async-storage/async-storage' {
  const AsyncStorage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
    clear(): Promise<void>;
  };
  export default AsyncStorage;
}

declare module 'expo' {
  export function registerRootComponent(component: any): void;
}

declare module 'expo-file-system' {
  export function getFreeDiskStorageAsync(): Promise<number>;
  export function getTotalDiskCapacityAsync(): Promise<number>;
}

declare module 'expo-secure-store' {
  export function setItemAsync(key: string, value: string): Promise<void>;
  export function getItemAsync(key: string): Promise<string | null>;
  export function deleteItemAsync(key: string): Promise<void>;
}

declare module 'expo-sqlite' {
  export function openDatabaseSync(dbName: string): any;
  export function openDatabaseAsync(dbName: string): Promise<any>;
}

declare module 'expo-speech' {
  export function speak(text: string, options?: any): void;
  export function stop(): void;
}

declare module 'expo-av' {
  export const Audio: {
    setAudioModeAsync(mode: any): Promise<void>;
    Sound: {
      createAsync(
        source: any,
        initialStatus?: any,
        onPlaybackStatusUpdate?: (status: any) => void
      ): Promise<{ sound: any; status: any }>;
    };
  };
}

declare module '@react-native-voice/voice' {
  const Voice: {
    default: any;
    onSpeechResults: any;
    onSpeechPartialResults: any;
    start(locale: string): Promise<void>;
    stop(): Promise<void>;
  };
  export default Voice;
}

declare module 'llama.rn' {
  export function initLlama(options: any): Promise<any>;
}
