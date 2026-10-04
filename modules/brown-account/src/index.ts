import { requireNativeModule } from 'expo-modules-core';
export default requireNativeModule<{ purgePrivateStorage(): Promise<void> }>('BrownAccount');
