import './src/duty/locationTask'; // registers the background location task at load
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, AppStateStatus, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { COLORS } from './src/constants';
import { C } from './src/ui/theme';
import { RootStackParamList, TabParamList } from './src/navigation';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import OutletsScreen from './src/screens/OutletsScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import VisitHistoryScreen from './src/screens/VisitHistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import DevToolsScreen from './src/screens/DevToolsScreen';
import RecordingsScreen from './src/screens/RecordingsScreen';
import { loadSession } from './src/storage/session';
import { clearOutletCache } from './src/storage/outletCache';
import { Session } from './src/types';
import { setupNotifications } from './src/duty/notifications';
import { dutyController } from './src/duty/dutyController';
import { configureUpload, kickUploads } from './src/upload/worker';
import { clearDutyState, loadDutyState } from './src/duty/dutyState';
import { logEvent } from './src/logs/daylog';
import { initLang, useT } from './src/i18n';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TAB_ICON: Record<string, string> = { Field: '📍', Outlets: '🏪', Settings: '⚙️' };

function MainTabs({ session, onLoggedOut }: { session: Session; onLoggedOut: () => void }) {
  const { t } = useT();
  const TAB_LABEL: Record<string, string> = {
    Field: t('tabField'),
    Outlets: t('tabOutlets'),
    Settings: t('tabSettings'),
  };
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: C.cobalt,
        tabBarInactiveTintColor: C.low,
        tabBarLabelStyle: { fontSize: 18, fontWeight: '700', marginTop: 2 },
        tabBarStyle: { height: 84, paddingBottom: 14, paddingTop: 10, borderTopColor: C.line },
        tabBarLabel: TAB_LABEL[route.name] ?? route.name,
        tabBarIcon: ({ color }) => (
          <Text style={{ fontSize: 24, color }}>{TAB_ICON[route.name] ?? '•'}</Text>
        ),
      })}
    >
      <Tab.Screen name="Field">
        {(props) => <HomeScreen {...props} session={session} />}
      </Tab.Screen>
      <Tab.Screen name="Outlets">
        {(props) => <OutletsScreen {...props} session={session} />}
      </Tab.Screen>
      <Tab.Screen name="Settings">
        {(props) => <SettingsScreen {...props} session={session} onLoggedOut={onLoggedOut} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

function configureUploadAuth(session: Session) {
  configureUpload({
    getAuth: () => ({ dsrId: session.dsr.id, token: session.token }),
    refreshToken: async () => null,
    onAuthFailure: () => {},
  });
}

export default function App() {
  const { t } = useT();
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const appState = useRef(AppState.currentState);

  // ── boot ──
  useEffect(() => {
    (async () => {
      await initLang();
      await setupNotifications();
      const s = await loadSession();
      if (s) {
        configureUploadAuth(s);
        await runWatchdog(s);
        kickUploads();
      }
      setSession(s);
      setBooting(false);
    })();
  }, []);

  // ── foreground handling (watchdog + queue kick) ──
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        dutyController.onAppForeground();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

  const onLoggedIn = useCallback(async (s: Session) => {
    // Fresh start on every login: no cached outlets, no in-memory state from a
    // previous DSR. The outlet list is always downloaded live from S3.
    await dutyController.reset();
    await clearOutletCache();
    configureUploadAuth(s);
    setSession(s);
  }, []);

  const onLoggedOut = useCallback(() => setSession(null), []);

  if (booting) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: COLORS.bg }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      {session ? (
        <Stack.Navigator>
          <Stack.Screen name="Tabs" options={{ headerShown: false }}>
            {() => <MainTabs session={session} onLoggedOut={onLoggedOut} />}
          </Stack.Screen>
          <Stack.Screen
            name="Onboarding"
            options={{ title: t('navSetup'), headerBackVisible: true }}
          >
            {(props) => (
              <OnboardingScreen {...props} session={session} onDone={() => {}} />
            )}
          </Stack.Screen>
          <Stack.Screen name="VisitHistory" options={{ title: t('navTodaysVisits') }}>
            {(props) => <VisitHistoryScreen {...props} session={session} />}
          </Stack.Screen>
          <Stack.Screen name="DevTools" options={{ title: 'Developer / Testing' }}>
            {(props) => <DevToolsScreen {...props} session={session} />}
          </Stack.Screen>
          <Stack.Screen name="Recordings" options={{ title: t('recordings') }}>
            {(props) => <RecordingsScreen {...props} />}
          </Stack.Screen>
        </Stack.Navigator>
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Home">
            {() => <LoginScreen onLoggedIn={onLoggedIn} />}
          </Stack.Screen>
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}

/**
 * Watchdog (PRD §7.3): if we persisted "on duty" but the location service is
 * no longer running, the OEM killed it. Log service_killed, clear the flag,
 * and tell the DSR to resume.
 */
async function runWatchdog(session: Session): Promise<void> {
  const persisted = await loadDutyState();
  if (!persisted?.onDuty) return;
  const running = await dutyController.isServiceRunning();
  if (running) return;
  await logEvent(session.dsr.id, persisted.date, 'service_killed');
  await clearDutyState();
  Alert.alert(
    'Duty was interrupted',
    'The phone stopped the app. Please tap Start Duty again.',
  );
}
