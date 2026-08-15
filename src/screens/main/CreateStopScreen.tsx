import React, { useState } from 'react';
import * as Crypto from 'expo-crypto';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Camera, MapView, PointAnnotation } from '@maplibre/maplibre-react-native';
import { useAuth } from '../../context/AuthContext';
import { TripStop } from '../../types/location';
import { enqueueStop, enqueueStopPhoto, processPendingSyncQueue } from '../../services/offlineSyncQueue';
import { colors } from '../../theme/colors';

const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

interface CreateStopScreenProps {
  route: any;
  navigation: any;
}

export const CreateStopScreen: React.FC<CreateStopScreenProps> = ({ route, navigation }) => {
  const { tripId, initialLat, initialLng } = route.params || {};
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  
  // Interactive coordinates for pin fine-tuning
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: initialLat || 37.7749,
    lng: initialLng || -122.4194,
  });

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Request photo library permission explicitly & pick image
  const handlePickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          'Photo Permission Denied',
          'Photo library access is required to attach a photo to this stop. You can still mark the stop without a photo.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const sourceUri = result.assets[0].uri;
        // Explicitly re-encode bytes to JPEG format via ImageManipulator
        const manipulated = await ImageManipulator.manipulateAsync(
          sourceUri,
          [],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );
        setImageUri(manipulated.uri);
      }
    } catch (err) {
      console.error('Error picking photo:', err);
      Alert.alert('Error', 'Could not open photo picker.');
    }
  };

  const submitStop = async () => {
    if (!name.trim()) {
      setErrorMsg('Please enter a stop title (e.g. Cafe, Viewpoint, Hotel).');
      return;
    }
    if (!tripId) {
      setErrorMsg('Trip ID missing.');
      return;
    }

    setErrorMsg(null);
    setSubmitting(true);

    try {
      if (!user?.uid) throw new Error('User must be signed in to mark a stop.');

      const now = Date.now();
      const stableStopId = Crypto.randomUUID();

      const newStop: TripStop = {
        id: stableStopId,
        uid: user.uid,
        displayName: user.name || 'Traveler',
        lat: coords.lat,
        lng: coords.lng,
        name: name.trim(),
        note: note.trim() || undefined,
        photoUrl: undefined,
        autoDetected: false,
        type: 'manual',
        createdAt: now,
        notificationSent: false,
      };

      // Write-Ahead Queue: Enqueue manual stop locally first
      await enqueueStop(tripId, user.uid, newStop, 'manual_stop');

      if (imageUri) {
        try {
          // Enqueue separate durable stop_photo upload
          await enqueueStopPhoto(tripId, user.uid, stableStopId, imageUri);
        } catch (photoErr: any) {
          Alert.alert(
            'Photo Queue Limit',
            "Photo can't be queued until pending uploads sync. The stop will be created without the photo attachment."
          );
        }
      }

      // Trigger queue worker to attempt remote sync
      processPendingSyncQueue(user.uid);

      navigation.goBack();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to mark stop.');
      setSubmitting(false);
    }
  };

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (/^\d{1,3}$/.test(trimmed)) {
      Alert.alert('Use this stop name?', `“${trimmed}” may be hard to recognize later.`, [
        { text: 'Edit', style: 'cancel' }, { text: 'Use name', onPress: () => void submitStop() },
      ]);
      return;
    }
    void submitStop();
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

          {/* Top Bar Navigation */}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>← Cancel</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Ionicons name="flag-outline" size={34} color={colors.primaryAction} />
            <Text style={styles.title}>Mark a Stop</Text>
            <Text style={styles.subtitle}>Notify your trip group about a hotel, cafe, or viewpoint</Text>
          </View>

          <View style={styles.card}>
            {errorMsg ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            {/* Stop Name Field */}
            <Text style={styles.inputLabel}>Stop name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Coffee break, Viewpoint, Fuel stop"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
              maxLength={80}
            />

            {/* Stop Note Field */}
            <Text style={styles.inputLabel}>Notes & Recommendations (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="e.g. Parking available behind the building. Great espresso!"
              placeholderTextColor={colors.textMuted}
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
            />

            {/* Interactive Location Fine-Tuning Mini Map */}
            <Text style={styles.inputLabel}>Location Pin (Drag pin to adjust)</Text>
            <View style={styles.miniMapContainer}>
              <MapView
                style={styles.miniMap}
                mapStyle={OPENFREEMAP_STYLE_URL}
                attributionEnabled
                logoEnabled={false}
              >
                <Camera centerCoordinate={[coords.lng, coords.lat]} zoomLevel={15} />
                <PointAnnotation
                  id="stop-location"
                  draggable
                  coordinate={[coords.lng, coords.lat]}
                  onDragEnd={(e) => {
                    const [lng, lat] = e.geometry.coordinates;
                    setCoords({ lat, lng });
                  }}
                >
                  <View style={styles.mapPin} />
                </PointAnnotation>
              </MapView>
              <Text style={styles.coordsText}>
                Lat: {coords.lat.toFixed(5)}, Lng: {coords.lng.toFixed(5)}
              </Text>
            </View>

            {/* Optional Photo Attachment Section */}
            <Text style={styles.inputLabel}>Attach Photo (Optional)</Text>
            {imageUri ? (
              <View style={styles.imagePreviewContainer}>
                <Image source={{ uri: imageUri }} style={styles.imagePreview} />
                <TouchableOpacity
                  style={styles.removeImageBtn}
                  onPress={() => setImageUri(null)}
                >
                  <Text style={styles.removeImageBtnText}>✕ Remove</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.photoPickerBtn} onPress={handlePickPhoto}>
                <Text style={styles.photoPickerIcon}>📷</Text>
                <Text style={styles.photoPickerText}>Select Photo from Library</Text>
              </TouchableOpacity>
            )}

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.primaryButton, submitting && styles.disabledButton]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <View style={styles.submittingRow}>
                  <ActivityIndicator color="#FFF" />
                  <Text style={styles.submittingText}>Uploading & Marking Stop...</Text>
                </View>
              ) : (
                <Text style={styles.primaryButtonText}>Mark Stop & Notify Group 🚩</Text>
              )}
            </TouchableOpacity>

          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.surface,
    marginBottom: 16,
  },
  backBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  headerIcon: {
    fontSize: 36,
    marginBottom: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  miniMapContainer: {
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    borderColor: colors.border,
    borderWidth: 1,
    position: 'relative',
  },
  miniMap: {
    ...StyleSheet.absoluteFillObject,
  },
  mapPin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F59E0B',
    borderColor: '#FFFFFF',
    borderWidth: 3,
  },
  coordsText: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    color: colors.primaryLight,
    fontSize: 10,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  photoPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    paddingVertical: 14,
    borderColor: colors.border,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: 24,
  },
  photoPickerIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  photoPickerText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  imagePreviewContainer: {
    position: 'relative',
    marginBottom: 24,
  },
  imagePreview: {
    width: '100%',
    height: 180,
    borderRadius: 12,
  },
  removeImageBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  removeImageBtnText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  submittingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  submittingText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 10,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
  },
});
