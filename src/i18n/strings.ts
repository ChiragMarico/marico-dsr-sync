/**
 * English source strings (the keys). Other languages mirror these keys exactly.
 * {x} placeholders are interpolated by t(). Keep values short — field UI.
 */
export const en = {
  // ── Language ──
  chooseLanguage: 'Choose Your Language',
  languageName: 'English',

  // ── Login ──
  loginSubtitle: 'Log in to start your day',
  dsrId: 'DSR ID',
  pin: 'PIN',
  logIn: 'Log In',
  wrongIdPin: 'Wrong ID or PIN. Please try again.',
  noInternet: 'No internet. Connect and retry.',
  serverIssue: 'Server issue — try again in a minute.',
  tooManyTries: 'Too many tries. Please wait {s}s.',

  // ── Tabs ──
  tabField: 'Field',
  tabOutlets: 'Outlets',
  tabSettings: 'Settings',

  // ── Nav titles ──
  navSetup: 'Setup',
  navTodaysVisits: 'Today’s Visits',

  // ── Home ──
  onDuty: 'Status: Online',
  offDuty: 'Status: Offline',
  trackingVisits: 'Tracking visits',
  tapToBegin: 'Tap to begin your day',
  since: 'since',
  recording: 'Recording',
  nearestOutlet: 'Nearest outlet',
  today: 'Today',
  outletsVisited: '{n} outlets visited',
  myOutlets: 'My Outlets',
  startMyDay: 'Start My Day',
  endMyDay: 'End My Day',
  forceRecord: 'Record Here',
  stopRecording: 'Stop Recording',
  dayBegun: 'Your field day has begun',
  dayWrapped: 'Today’s work has been wrapped up',
  recordingStartsIn: 'Recording starts in {s}s',
  recordingStopsIn: 'Recording stops in {s}s',
  arrivingAt: 'Arriving at {name}',
  leavingOutlet: 'Leaving {name}',
  locationOffBanner: 'Location is off — visits won’t be detected. Tap to fix.',
  weakSignalBanner:
    'Location signal is weak (±{m} m) — visits can’t be detected here. Move near a window or door, or tap “Record here”.',
  micBusyBanner: 'Recording could not start — the mic may be busy (are you on a call?). The visit is still logged.',
  noOutletsTitle: 'No outlets',
  noOutletsBody: 'No outlets assigned to you. Contact your supervisor.',
  couldNotStart: 'Could not start',
  stopRecordingQ: 'Stop recording?',
  yes: 'Yes',
  no: 'No',
  yesStop: 'Yes, Stop',
  noNearbyOutlet: 'No nearby outlet',
  recordingStarted: 'Recording started',
  outletFallback: 'outlet',

  // ── Outlets ──
  kpiTotal: 'Total',
  dayMon: 'Mon',
  dayTue: 'Tue',
  dayWed: 'Wed',
  dayThu: 'Thu',
  dayFri: 'Fri',
  daySat: 'Sat',
  daySun: 'Sun',
  noOutletsForDay: 'No outlets planned for this day.',
  outletsCount: '{total} outlets',
  visitedCount: '✓ {n} visited',
  pendingCount: '⏳ {n} pending',
  startDayForDistances: 'Start your day (Field tab) to see live distances.',
  visited: 'Visited',
  pending: 'Pending',
  noOutletsAssigned: 'No outlets assigned.',

  // ── Onboarding: common ──
  next: 'Next',
  done: 'Done — Next',
  openSettings: 'Open Settings',
  iveDoneThis: 'I’ve Done This',

  // consent
  obWelcomeTitle: 'Welcome',
  obWelcomeBody:
    'This app records your conversations at outlets during duty, for Marico quality and training. Your recordings upload securely.',
  obAgree: 'I Understand & Agree',

  // mic
  obMicTitle: 'Microphone',
  obMicBody: 'We need the microphone to record conversations at outlets.',
  obMicStatus: 'Microphone access',
  obAllowMic: 'Allow Microphone',

  // location
  obLocTitle: 'Location — Allow All the Time',
  obLocBody: 'So visits are detected even with the screen off, choose “Allow all the time”.',
  obLocStatus: 'Location (all the time)',
  obAllowLoc: 'Allow Location',
  obLocAllTime: 'Allow All the Time',
  obLocStep2Body: 'Almost done. Open the settings page, tap Permissions → Location, and choose “Allow all the time”.',
  obLocOpenSettings: 'Open Location Settings',
  obGpsOff: 'GPS is off — turn on Location in phone settings.',

  // notifications
  obNotifTitle: 'Notifications',
  obNotifBody: 'To show duty and recording status while you work.',
  obNotifStatus: 'Notifications',
  obAllowNotif: 'Allow Notifications',

  // battery
  obBatteryTitle: 'Keep the App Running',
  obBatteryBody: 'Tap the button below — the phone will ask to let the app run in the background. Choose Allow.',
  obBatteryOneTap: 'Allow Background Running',
  obBatteryDone: 'Background Running Allowed',
  obAutostartBody: 'If your phone has “Autostart”, turn it ON for this app so it isn’t stopped.',
  obOpenAutostart: 'Open Autostart Settings',

  // bluetooth
  obBtTitle: 'Bluetooth Mic',
  obBtBody:
    'Pair the provided Bluetooth mic in your phone’s Bluetooth settings. Once paired, the app uses it automatically. If it runs out of battery, the app falls back to the phone mic.',

  // voice enrollment (replaces the old silent test recording)
  veTitle: 'Record Your Voice',
  veBody: 'Read the sentence below out loud. This teaches the app your voice, so it can tell which speaker is you in your visit recordings.',
  veScript: 'Say your name, then talk about your work for about 30 seconds — which area you cover, which shops you visit, what you tell shopkeepers. Speak normally, in your own words.',
  veStart: 'Start Recording',
  veRecording: 'Speak now — keep talking',
  veSecondsLeft: '{s} seconds left',
  veUploading: 'Saving…',
  veSuccess: '✓ Your voice has been saved',
  veFailed: 'Could not save your voice: {e}',
  veRetry: 'Try Again',
  veWhy: 'Recorded once. You will not be asked again.',

  // test
  obTestTitle: 'Test Recording',
  obTestBody: 'A 10-second test that uploads to the server, to prove everything works before day one.',
  obTestSuccess: '✓ Success — uploaded',
  obTestFail: 'Upload failed — check network and try again.',
  obTestRecording: 'Recording…',
  obStartTest: 'Start Test',
  obFinish: 'Finish',

  // ── Forced update (blocking) ──
  fuTitle: 'Update Required',
  fuBody: 'A new version of Sync is needed to keep recording your visits. Please install it to continue.',
  fuYourVersion: 'Your version: {v}',
  fuNeeded: 'Required: {v}',
  fuDownload: 'Download Update',
  fuHelp: 'After downloading, tap the file to install. Ask your supervisor if you need help.',

  // ── Voiceprints (admin) ──
  vpTitle: 'Voiceprints',
  vpEnrolled: '{n} enrolled',
  vpNone: 'No voiceprints yet.\nComplete voice enrollment in Setup.',
  vpRecorded: 'Recorded {d}',

  // ── Settings ──
  checkUpdates: 'Check for Updates',
  recordings: 'Recordings',
  refreshOutlets: 'Refresh Outlets',
  redoSetup: 'Redo Setup',
  openPhoneSettings: 'Open Phone Settings',
  changeLanguage: 'Change Language',
  version: 'Version',
  upToDate: 'Up to date',
  updateAvailable: 'Update available: {v}',
  logOut: 'Log Out',
  logOutQ: 'Log out?',
  logOutBody: 'End your day first if you are on duty.',
  cancel: 'Cancel',

  // ── Settings: update / sync alerts ──
  updUnavailableTitle: 'Updates unavailable',
  updUnavailableBody: 'Over-the-air updates work in the installed app only.',
  updReadyTitle: 'Update ready',
  updReadyBody: 'Tap Restart to apply the latest version.',
  later: 'Later',
  restartNow: 'Restart Now',
  upToDateBody: 'You already have the latest version.',
  updCheckFailTitle: 'Could not check',
  checkNetBody: 'Check your internet and try again.',
  doneTitle: 'Done',
  outletsSynced: '{n} outlets synced',
  failedTitle: 'Failed',

  // ── Visit history ──
  vhVisitsN: '{v} visits',
  vhUploadedN: '✓ {u} uploaded',
  vhPendingN: '⏳ {p} pending',
  vhEmpty: 'No visits today yet',
  uploaded: 'Uploaded',
  recOngoing: 'ongoing',
  recManual: 'manual',

  // ── Recordings ──
  recLoadFail: 'Could not load recordings',
  recPlayFail: 'Could not play this recording',
  recDeleteSomeFail: 'Some recordings could not be deleted',
  recDeleteOneQ: 'Delete recording?',
  delete: 'Delete',
  recDeleteAllQ: 'Delete all recordings?',
  recDeleteAllBody: '{n} recordings will be removed from the cloud.',
  deleteAll: 'Delete All',
  recCountHeader: '{n} recordings in cloud storage',
  recEmpty: 'No recordings uploaded yet.\nRecord a visit, then pull down to refresh.',
  recPlay: 'Play',
  recPause: 'Pause',
  recResume: 'Resume',
};

export type StringKey = keyof typeof en;
