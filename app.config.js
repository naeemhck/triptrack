const fs = require('fs');

module.exports = ({ config }) => {
  const androidKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY;
  const iosKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY;
  const localGoogleServicesFile = './google-services.json';
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ||
    (fs.existsSync(localGoogleServicesFile) ? localGoogleServicesFile : undefined);

  return {
    ...config,
    plugins: [...(config.plugins || []), '@sentry/react-native'],
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
      ...(androidKey ? { config: { googleMaps: { apiKey: androidKey } } } : {}),
    },
    ios: {
      ...config.ios,
      ...(iosKey ? { config: { googleMapsApiKey: iosKey } } : {}),
    },
  };
};
