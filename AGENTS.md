# AGENTS.md — TripTrack Project Architecture & Guidelines

## 1. Stack & Toolchain Versions
- **Framework:** Expo SDK 54 (`~54.0.0`), React Native `0.81.5`, React `19.1.0`
- **Language & Runtime:** TypeScript `5.3.3`, Node.js 22 (Cloud Functions), OpenJDK 21 LTS (`21.0.12`)
- **Backend / Database:** Firebase Web SDK `10.12.2` (Auth, Firestore, Cloud Storage, Cloud Functions)
- **Navigation:** `@react-navigation/native` `^6.1.18`, `@react-navigation/native-stack` `^6.10.1`
- **Native Modules:** `expo-location` `~19.0.8`, `expo-task-manager` `~14.0.9`, `expo-notifications` `~0.32.17`, `react-native-maps` `1.20.1`, `expo-image-picker` `~17.0.11`, `expo-image-manipulator` `~14.0.8`, `expo-sharing` `~14.0.8`

## 2. Native Android Specifications
- **Package Name:** `com.triptrack.app`
- **minSdkVersion:** `31` (Android 12 minimum support)
- **targetSdkVersion:** `36` (Android 16 / Google Play Store requirement)
- **compileSdkVersion:** `36` (Android 16)
- **buildToolsVersion:** `36.0.0`
- **NDK Version:** `27.1.12297006` (r27b)
- **Edge-to-Edge:** `edgeToEdgeEnabled=true` in `android/gradle.properties`

## 3. Core Architecture & Features
- **Firebase Architecture:** Client uses Firebase Web SDK 10 (`firebase/app`, `firebase/auth`, `firebase/firestore`, `firebase/storage`). Backend utilizes Firebase Cloud Functions (Node.js 22).
- **Background Location & TaskManager:** TaskManager background location task registered via `expo-location` (`startLocationUpdatesAsync`). Sends low-power continuous location updates during active trips.
- **Automatic Stop Detection:** Distance and dwell-time calculation triggers stop creation. Stop photos require parent stop Firestore document to exist prior to Storage upload.
- **Offline Queue & Synchronization:** AsyncStorage persistent queue records offline stop/location updates and syncs sequentially upon network restoration.
- **Notifications Architecture:** Channels configured for high/low priority notifications. Requests `POST_NOTIFICATIONS` runtime permission on Android 13+ (API 33+); gracefully handles API 31–32 without `POST_NOTIFICATIONS`.
- **Trip Lifecycle:** Strict typed lifecycle (`planned`, `active`, `completed`). Requires parent trip `status == 'active'` for active trip writes (locations, manual/auto stops).

## 4. MVP Scope Freeze Constraints
- **Scope Status:** FROZEN. Steps 1–12 MVP complete.
- **Forbidden V2 Additions:** Do NOT add chat, emergency/SOS buttons, route deviation alerts, social feeds, public live tracking links, analytics tracking, or payment gateways.

## 5. Security & Rule Constraints
- **Firestore Rules (`firestore.rules`):** Enforces trip membership checks and requires `tripIsActive(tripId)` for active trip location and stop writes.
- **Storage Rules (`storage.rules`):** Enforces a strict **maximum 2-Firestore lookup limit** per write evaluation. `isStopOwner(tripId, stopId)` uses `firestore.get()` on the parent stop document to verify canonical ownership (`uid == request.auth.uid`).

## 6. Build & Verification Commands
- **TypeScript Verification:** `npx tsc --noEmit`
- **Android Prebuild:** `npx expo prebuild --platform android --clean`
- **Cloud Functions Build:** `cd functions && npm run build`
- **Android App Bundle (AAB):** `cd android && $env:JAVA_HOME = "C:\Users\Naeem\.jdks\jdk-21"; $env:ANDROID_HOME = "C:\Users\Naeem\Android\Sdk"; .\gradlew.bat bundleRelease`
- **Android Release APK:** `cd android && $env:JAVA_HOME = "C:\Users\Naeem\.jdks\jdk-21"; $env:ANDROID_HOME = "C:\Users\Naeem\Android\Sdk"; .\gradlew.bat assembleRelease`
