import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useTrips } from '../../context/TripContext';
import { colors } from '../../theme/colors';
import { TripNotificationPreferences } from '../../types/notifications';
import { getTripNotificationPreferences, updateTripNotificationPreferences } from '../../services/supabase/notificationPreferences';

interface Props { route: any; navigation: any; }
type PreferenceKey = keyof TripNotificationPreferences;

const settings: Array<{ key: PreferenceKey; title: string; description: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string }> = [
  { key:'warningEnabled', title:'Falling behind warning', description:'Notify me when a member reaches 200 m behind.', icon:'warning-outline', color:colors.warning },
  { key:'criticalEnabled', title:'Critical separation', description:'Notify me when a member reaches 500 m behind.', icon:'alert-circle-outline', color:colors.critical },
  { key:'stopEnabled', title:'New trip stops', description:'Notify me when another member adds a stop.', icon:'flag-outline', color:colors.mapAccent },
  { key:'staleEnabled', title:'Delayed member locations', description:'Notify me when a shared location becomes stale.', icon:'time-outline', color:colors.link },
];

export const TripSettingsScreen = ({ route, navigation }: Props) => {
  const { tripId } = route.params || {};
  const { trips } = useTrips();
  const trip = trips.find((item) => item.id === tripId);
  const [preferences, setPreferences] = useState<TripNotificationPreferences | null>(null);
  const [savingKey, setSavingKey] = useState<PreferenceKey | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    if (!tripId) return;
    setLoadError(null);
    try {
      const [next, permission] = await Promise.all([
        getTripNotificationPreferences(tripId), Notifications.getPermissionsAsync(),
      ]);
      setPreferences(next);
      setPermissionGranted(permission.granted);
    } catch {
      setLoadError('TripTrack could not load notification settings.');
    }
  };

  useEffect(() => { void load(); }, [tripId]);

  const toggle = async (key: PreferenceKey, enabled: boolean) => {
    if (!preferences || savingKey) return;
    const previous = preferences;
    setPreferences({ ...preferences, [key]: enabled });
    setSavingKey(key);
    try {
      const saved = await updateTripNotificationPreferences(tripId, { [key]: enabled });
      setPreferences(saved);
    } catch {
      setPreferences(previous);
      Alert.alert('Setting not saved', 'Check your connection and try again.');
    } finally {
      setSavingKey(null);
    }
  };

  if (!trip) return <SafeAreaView style={styles.safeArea}><View style={styles.center}><Text style={styles.error}>Trip not found or access has ended.</Text><TouchableOpacity style={styles.retry} onPress={()=>navigation.goBack()}><Text style={styles.retryText}>Go back</Text></TouchableOpacity></View></SafeAreaView>;

  return <SafeAreaView style={styles.safeArea} edges={['top','left','right','bottom']}>
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}><TouchableOpacity style={styles.back} onPress={()=>navigation.goBack()} accessibilityLabel="Back to trip"><Ionicons name="arrow-back" size={21} color={colors.textSecondary}/></TouchableOpacity><View style={styles.headerText}><Text style={styles.title}>Trip Settings</Text><Text style={styles.tripName} numberOfLines={1}>{trip.name}</Text></View></View>

      {!permissionGranted ? <TouchableOpacity style={styles.permissionNotice} onPress={()=>Linking.openSettings()}><Ionicons name="notifications-off-outline" size={21} color={colors.warning}/><View style={styles.noticeText}><Text style={styles.noticeTitle}>Device notifications are off</Text><Text style={styles.noticeDescription}>These preferences will be saved, but Android must also allow TripTrack notifications.</Text></View><Ionicons name="open-outline" size={18} color={colors.link}/></TouchableOpacity> : null}

      <Text style={styles.sectionTitle}>Push notifications</Text>
      <Text style={styles.sectionDescription}>Choose what you receive for this trip. Separation status remains visible in the app.</Text>
      {loadError ? <View style={styles.center}><Text style={styles.error}>{loadError}</Text><TouchableOpacity style={styles.retry} onPress={()=>void load()}><Text style={styles.retryText}>Retry</Text></TouchableOpacity></View> : !preferences ? <ActivityIndicator color={colors.primaryAction} style={styles.loader}/> : <View style={styles.list}>{settings.map((item)=><View key={item.key} style={styles.row}><View style={[styles.iconBox,{backgroundColor:`${item.color}1F`}]}><Ionicons name={item.icon} size={22} color={item.color}/></View><View style={styles.copy}><Text style={styles.rowTitle}>{item.title}</Text><Text style={styles.rowDescription}>{item.description}</Text></View>{savingKey===item.key?<ActivityIndicator color={colors.primaryAction}/>:<Switch value={preferences[item.key]} disabled={savingKey!==null} onValueChange={(value)=>void toggle(item.key,value)} trackColor={{false:colors.border,true:colors.primaryDark}} thumbColor={preferences[item.key]?colors.primaryLight:colors.inactive}/>}</View>)}</View>}
    </ScrollView>
  </SafeAreaView>;
};

const styles=StyleSheet.create({safeArea:{flex:1,backgroundColor:colors.background},container:{paddingHorizontal:20,paddingTop:12,paddingBottom:32},header:{flexDirection:'row',alignItems:'center',gap:12,marginBottom:24},back:{width:44,height:44,borderRadius:8,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.border},headerText:{flex:1},title:{fontSize:22,fontWeight:'800',color:colors.textPrimary},tripName:{fontSize:13,color:colors.textSecondary,marginTop:2},permissionNotice:{minHeight:76,flexDirection:'row',alignItems:'center',gap:12,padding:14,borderRadius:8,borderWidth:1,borderColor:colors.warning,backgroundColor:'rgba(251,191,36,0.08)',marginBottom:24},noticeText:{flex:1},noticeTitle:{fontSize:14,fontWeight:'700',color:colors.textPrimary},noticeDescription:{fontSize:12,lineHeight:17,color:colors.textSecondary,marginTop:3},sectionTitle:{fontSize:16,fontWeight:'800',color:colors.textPrimary},sectionDescription:{fontSize:13,lineHeight:19,color:colors.textSecondary,marginTop:5,marginBottom:14},list:{borderWidth:1,borderColor:colors.border,borderRadius:8,overflow:'hidden'},row:{minHeight:88,flexDirection:'row',alignItems:'center',gap:12,padding:13,backgroundColor:colors.surface,borderBottomWidth:1,borderBottomColor:colors.border},iconBox:{width:40,height:40,borderRadius:8,alignItems:'center',justifyContent:'center'},copy:{flex:1},rowTitle:{fontSize:14,fontWeight:'700',color:colors.textPrimary},rowDescription:{fontSize:12,lineHeight:17,color:colors.textSecondary,marginTop:3},loader:{marginTop:32},center:{alignItems:'center',paddingVertical:30},error:{fontSize:13,color:colors.critical,textAlign:'center'},retry:{minHeight:44,paddingHorizontal:18,alignItems:'center',justifyContent:'center',marginTop:10},retryText:{color:colors.link,fontWeight:'700'}});
