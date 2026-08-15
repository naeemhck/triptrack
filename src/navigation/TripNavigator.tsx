import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TripListScreen } from '../screens/main/TripListScreen';
import { CreateTripScreen } from '../screens/main/CreateTripScreen';
import { JoinTripScreen } from '../screens/main/JoinTripScreen';
import { TripDetailScreen } from '../screens/main/TripDetailScreen';
import { CreateStopScreen } from '../screens/main/CreateStopScreen';
import { TripHistoryScreen } from '../screens/main/TripHistoryScreen';
import { TripSettingsScreen } from '../screens/main/TripSettingsScreen';
import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator();

export const TripNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      initialRouteName="TripList"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="TripList" component={TripListScreen} />
      <Stack.Screen name="TripHistory" component={TripHistoryScreen} />
      <Stack.Screen name="CreateTrip" component={CreateTripScreen} />
      <Stack.Screen name="JoinTrip" component={JoinTripScreen} />
      <Stack.Screen name="TripDetail" component={TripDetailScreen} />
      <Stack.Screen name="TripSettings" component={TripSettingsScreen} />
      <Stack.Screen name="CreateStop" component={CreateStopScreen} />
    </Stack.Navigator>
  );
};
