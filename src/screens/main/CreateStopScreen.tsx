import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useAuth } from '../../context/AuthContext';
import { useTrips } from '../../context/TripContext';
import { TripStop } from '../../types/location';
import { enqueueStop, enqueueStopPhoto, processPendingSyncQueue } from '../../services/offlineSyncQueue';
import { colors } from '../../theme/colors';

interface CreateStopScreenProps {
  route: any;
  navigation: any;
}

export const CreateStopScreen: React.FC<CreateStopScreenProps> = ({ route, navigation }) => {
  const { tripId, initialLat, initialLng } = route.params || {};
  const { user } = useAuth();
  const { createTripStop } = useTrips();

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

  const handleSubmit = async () => {
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
      const stableStopId = `stop_manual_${now}_${Math.random().toString(36).substring(2, 6)}`;

      const newStop: TripStop = {
        id: stableStopId,
        uid: user.uid,
        displayName: user.name || 'Traveler',
        lat: coords.lat,
        lng: coords.lng,
        name: name.trim(),
        note: note.trim() || undefined,
        photoUrl: imageUri || undefined,
        autoDetected: false,
        type: 'manual',
        createdAt: now,
        notificationSent: false,
      };

      // Write-Ahead Queue: Enqueue manual stop locally first
      await enqueueStop(tripId, user.uid, newStop, 'manual_stop', imageUri || undefined);

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

  return (
    <SafeAreaView style={styles.safeArea}>
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
            <Text style={styles.headerIcon}>🚩</Text>
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
            <Text style={styles.inputLabel}>Stop Title *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Sunset Viewpoint / Blue Bottle Cafe"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
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
                provider={PROVIDER_GOOGLE}
                style={styles.miniMap}
                region={{
                  latitude: coords.lat,
                  longitude: coords.lng,
                  latitudeDelta: 0.008,
                  longitudeDelta: 0.008,
                }}
              >
                <Marker
                  draggable
                  coordinate={{ latitude: coords.lat, longitude: coords.lng }}
                  onDragEnd={(e) => {
                    const newCoords = e.nativeEvent.coordinate;
                    setCoords({ lat: newCoords.latitude, lng: newCoords.longitude });
                  }}
                  pinColor="#F59E0B"
                />
              </MapView>
              <Text style={styles.coordsText}>
                📍 Lat: {coords.lat.toFixed(5)}, Lng: {coords.lng.toFixed(5)}
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
