import './src/duty/locationTask'; // registers the background location task at load
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, AppStateStatus, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
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
import VoiceprintsScreen from './src/screens/VoiceprintsScreen';
import { loadSession } from './src/storage/session';
import { clearOutletCache } from './src/storage/outletCache';
import { Session } from './src/types';
import { setupNotifications } from './src/duty/notifications';
import { dutyController } from './src/duty/dutyController';
import { configureUpload, kickUploads } from './src/upload/worker';
import { clearDutyState, loadDutyState } from './src/duty/dutyState';
import { logEvent } from './src/logs/daylog';
import { checkForUpdate, UpdateStatus } from './src/update/updateCheck';
import { ForcedUpdateScreen } from './src/screens/ForcedUpdateScreen';
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

/**
 * Fetch and apply an over-the-air update, explicitly.
 *
 * expo-updates checks on launch by default, but it only DOWNLOADS in the
 * background and applies on some later launch — so a rep who force-closes the
 * app before the ~3 MB finishes never gets it. In the field that meant updates
 * effectively never landed unless someone opened Settings and tapped the
 * button by hand, which is not something to ask of 2,392 low-literacy users.
 *
 * This waits for the download, then reloads immediately — but ONLY when it is
 * safe to do so. Reloading restarts the JS engine, which would abort an active
 * recording and lose a visit, so anything mid-duty is left alone and the update
 * applies at the next launch instead.
 */
async function applyUpdateIfSafe(): Promise<boolean> {
  if (!Updates.isEnabled) return false; // dev client / Expo Go
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return false;
    await Updates.fetchUpdateAsync();

    // Never interrupt a rep who is working — a reload would kill the recording.
    if (dutyController.isOnDuty() || dutyController.getState().recording) return false;

    await Updates.reloadAsync();
    return true;
  } catch {
    return false; // offline, or the update server is unreachable — try again later
  }
}

export default function App() {
  const { t } = useT();
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  // Native-version gate. Only ever set when the server positively reports the
  // installed build is unsupported; every failure path reports "up to date".
  const [forced, setForced] = useState<UpdateStatus | null>(null);
  const appState = useRef(AppState.currentState);

  // ── boot ──
  useEffect(() => {
    (async () => {
      await initLang();

      // Pull any pending OTA update first. If one applies, reloadAsync() never
      // returns — the app restarts on the new bundle — so nothing below runs.
      await applyUpdateIfSafe();

      // Runs before anything else so an unsupported build never reaches the
      // login screen. Fails open — a network blip must not brick the fleet.
      const up = await checkForUpdate();
      if (up.forceUpdate) setForced(up);
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
        // A second chance to pick up an update — reps often background the app
        // rather than closing it, so launch alone is not enough opportunity.
        void applyUpdateIfSafe();
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

  // Blocks the entire app — there is deliberately no way past this screen,
  // because an OTA cannot fix a native change.
  if (forced) {
    return (
      <>
        <StatusBar style="dark" />
        <ForcedUpdateScreen status={forced} />
      </>
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
          <Stack.Screen name="Voiceprints" options={{ title: t('vpTitle') }}>
            {(props) => <VoiceprintsScreen {...props} />}
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
