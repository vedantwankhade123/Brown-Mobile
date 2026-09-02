import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  TextInput,
  SafeAreaView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { CloseIcon, QrCodeIcon, CheckIcon } from './Icons';

interface QRScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScan: (scannedCode: string) => void;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  visible,
  onClose,
  onScan,
}) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    if (visible) {
      setScanned(false);
      setManualCode('');
      if (!permission?.granted) {
        requestPermission();
      }
    }
  }, [visible]);

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned || !data) return;
    setScanned(true);
    onScan(data.trim());
    onClose();
  };

  const handleManualSubmit = () => {
    const clean = manualCode.trim();
    if (clean) {
      setScanned(true);
      onScan(clean);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <QrCodeIcon size={22} color="#ffffff" />
            <Text style={styles.headerTitle}>Scan Desktop QR Code</Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            activeOpacity={0.7}
            accessibilityLabel="Close scanner"
          >
            <CloseIcon size={20} color="#a1a1aa" />
          </TouchableOpacity>
        </View>

        {/* Camera Scanner or Permission Fallback */}
        <View style={styles.cameraContainer}>
          {!permission ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color="#3b82f6" />
              <Text style={styles.statusText}>Requesting camera permission…</Text>
            </View>
          ) : !permission.granted ? (
            <View style={styles.centerBox}>
              <Text style={styles.permissionTitle}>Camera Access Needed</Text>
              <Text style={styles.permissionDesc}>
                Allow camera permission to scan the pairing QR code on your desktop Brown app.
              </Text>
              <TouchableOpacity
                style={styles.permissionBtn}
                onPress={requestPermission}
                activeOpacity={0.8}
              >
                <Text style={styles.permissionBtnText}>Grant Permission</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.cameraWrapper}>
              <CameraView
                style={styles.cameraFill}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: ['qr'],
                }}
                onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
              />

              {/* Aiming Reticle Overlay */}
              <View style={styles.overlay}>
                <View style={styles.scanFrame}>
                  {/* Four Corner Accents */}
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                </View>
                <Text style={styles.overlayHint}>
                  Align the QR code from Brown Desktop inside the frame
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Manual Code Input fallback at the bottom */}
        <View style={styles.bottomSection}>
          <Text style={styles.manualLabel}>Or enter pair code manually:</Text>
          <View style={styles.manualInputRow}>
            <TextInput
              style={styles.manualInput}
              value={manualCode}
              onChangeText={(t: string) => setManualCode(t.toUpperCase())}
              placeholder="e.g. 7842 or BROWN-WIN-..."
              placeholderTextColor="#71717a"
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[
                styles.manualSubmitBtn,
                !manualCode.trim() && styles.manualSubmitBtnDisabled,
              ]}
              onPress={handleManualSubmit}
              disabled={!manualCode.trim()}
              activeOpacity={0.7}
            >
              <Text style={styles.manualSubmitText}>Connect</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#121214',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  cameraWrapper: {
    flex: 1,
    position: 'relative',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  statusText: {
    color: '#9ca3af',
    fontSize: 14,
    marginTop: 12,
  },
  permissionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  permissionDesc: {
    color: '#9ca3af',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  permissionBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 10,
  },
  permissionBtnText: {
    color: '#ffffff',
    fontSize: 14.5,
    fontWeight: '600',
  },
  cameraFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  scanFrame: {
    width: 240,
    height: 240,
    position: 'relative',
    backgroundColor: 'transparent',
  },
  corner: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderColor: '#60a5fa',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3.5,
    borderLeftWidth: 3.5,
    borderTopLeftRadius: 6,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3.5,
    borderRightWidth: 3.5,
    borderTopRightRadius: 6,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3.5,
    borderLeftWidth: 3.5,
    borderBottomLeftRadius: 6,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3.5,
    borderRightWidth: 3.5,
    borderBottomRightRadius: 6,
  },
  overlayHint: {
    color: '#f3f4f6',
    fontSize: 13.5,
    fontWeight: '500',
    marginTop: 24,
    textAlign: 'center',
    paddingHorizontal: 32,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bottomSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 18,
    backgroundColor: '#121214',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  manualLabel: {
    color: '#9ca3af',
    fontSize: 12.5,
    fontWeight: '500',
    marginBottom: 8,
  },
  manualInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  manualInput: {
    flex: 1,
    height: 42,
    backgroundColor: '#1c1c1f',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    paddingHorizontal: 14,
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  manualSubmitBtn: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualSubmitBtnDisabled: {
    opacity: 0.4,
  },
  manualSubmitText: {
    color: '#000000',
    fontSize: 13.5,
    fontWeight: '600',
  },
});
