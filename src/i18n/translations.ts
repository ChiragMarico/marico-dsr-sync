/**
 * Translations for all supported languages. Every language object mirrors the
 * keys of `en` exactly. {x} placeholders and leading symbols are preserved.
 * Wording is kept simple and spoken-style for low-literacy field users.
 */
import { en } from './strings';

export const hi = {
  // ── Language ──
  chooseLanguage: 'अपनी भाषा चुनें',
  languageName: 'हिंदी',

  // ── Login ──
  loginSubtitle: 'दिन शुरू करने के लिए लॉग इन करें',
  dsrId: 'DSR ID',
  pin: 'PIN',
  logIn: 'लॉग इन करें',
  wrongIdPin: 'ID या PIN गलत है। फिर से कोशिश करें।',
  noInternet: 'इंटरनेट नहीं है। कनेक्ट करके फिर कोशिश करें।',
  serverIssue: 'सर्वर में दिक्कत — एक मिनट बाद फिर कोशिश करें।',
  tooManyTries: 'बहुत बार कोशिश की। {s}s रुकें।',

  // ── Tabs ──
  tabField: 'फील्ड',
  tabOutlets: 'दुकानें',
  tabSettings: 'सेटिंग',

  // ── Nav titles ──
  navSetup: 'सेटअप',
  navTodaysVisits: 'आज की विज़िट',

  // ── Home ──
  onDuty: 'स्टेटस: ऑनलाइन',
  offDuty: 'स्टेटस: ऑफलाइन',
  trackingVisits: 'विज़िट दर्ज हो रही हैं',
  tapToBegin: 'दिन शुरू करने के लिए टैप करें',
  since: 'से',
  recording: 'रिकॉर्ड हो रहा है',
  nearestOutlet: 'सबसे पास की दुकान',
  today: 'आज',
  outletsVisited: '{n} दुकानें देखीं',
  myOutlets: 'मेरी दुकानें',
  startMyDay: 'दिन शुरू करें',
  endMyDay: 'दिन खत्म करें',
  forceRecord: 'यहाँ रिकॉर्ड करें',
  stopRecording: 'रिकॉर्ड बंद करें',
  dayBegun: 'आपका दिन शुरू हो गया',
  dayWrapped: 'आज का काम पूरा हो गया',
  recordingStartsIn: '{s}s में रिकॉर्ड शुरू होगा',
  recordingStopsIn: '{s}s में रिकॉर्ड बंद होगा',
  arrivingAt: '{name} पर पहुँच रहे हैं',
  leavingOutlet: '{name} से जा रहे हैं',
  locationOffBanner: 'लोकेशन बंद है — विज़िट नहीं पकड़ी जाएँगी। ठीक करने के लिए टैप करें।',
  weakSignalBanner:
    'लोकेशन सिग्नल कमज़ोर है (±{m} m) — यहाँ विज़िट नहीं पकड़ी जा सकती। खिड़की या दरवाज़े के पास जाएँ, या “यहाँ रिकॉर्ड करें” दबाएँ।',
  micSilentNotifTitle: '⚠️ आवाज़ रिकॉर्ड नहीं हो रही',
  micSilentNotifBody: 'Sync खोलें और इस विज़िट में स्क्रीन पर रखें। सुपरवाइज़र को बताएँ।',
  micSilentBanner: 'कोई आवाज़ रिकॉर्ड नहीं हो रही। ऐप खोलकर विज़िट के दौरान स्क्रीन पर रखें, और सुपरवाइज़र को बताएँ।',
  micBusyBanner: 'रिकॉर्ड शुरू नहीं हुआ — माइक व्यस्त हो सकता है (क्या आप कॉल पर हैं?)। विज़िट फिर भी दर्ज है।',
  noOutletsTitle: 'कोई दुकान नहीं',
  noOutletsBody: 'आपको कोई दुकान नहीं दी गई। अपने सुपरवाइज़र से बात करें।',
  couldNotStart: 'शुरू नहीं हो पाया',
  stopRecordingQ: 'रिकॉर्ड बंद करें?',
  yes: 'हाँ',
  no: 'नहीं',
  yesStop: 'हाँ, बंद करें',
  noNearbyOutlet: 'पास में कोई दुकान नहीं',
  recordingStarted: 'रिकॉर्ड शुरू हो गया',
  outletFallback: 'दुकान',

  // ── Outlets ──
  kpiTotal: 'कुल',
  dayMon: 'सोम',
  dayTue: 'मंगल',
  dayWed: 'बुध',
  dayThu: 'गुरु',
  dayFri: 'शुक्र',
  daySat: 'शनि',
  daySun: 'रवि',
  noOutletsForDay: 'इस दिन के लिए कोई दुकान तय नहीं है।',
  outletsCount: '{total} दुकानें',
  visitedCount: '✓ {n} देखीं',
  pendingCount: '⏳ {n} बाकी',
  startDayForDistances: 'दूरी देखने के लिए दिन शुरू करें (फील्ड टैब)।',
  visited: 'देखी',
  pending: 'बाकी',
  noOutletsAssigned: 'कोई दुकान नहीं दी गई।',

  // ── Onboarding: common ──
  next: 'आगे',
  done: 'हो गया — आगे',
  openSettings: 'सेटिंग खोलें',
  iveDoneThis: 'मैंने कर लिया',

  // consent
  obWelcomeTitle: 'स्वागत है',
  obWelcomeBody:
    'यह ऐप ड्यूटी के दौरान दुकानों पर आपकी बातचीत रिकॉर्ड करता है, Marico की क्वालिटी और ट्रेनिंग के लिए। आपकी रिकॉर्डिंग सुरक्षित रूप से अपलोड होती हैं।',
  obAgree: 'मैं समझता हूँ और सहमत हूँ',

  // mic
  obMicTitle: 'माइक',
  obMicBody: 'दुकानों पर बातचीत रिकॉर्ड करने के लिए माइक चाहिए।',
  obMicStatus: 'माइक की अनुमति',
  obAllowMic: 'माइक की अनुमति दें',

  // location
  obLocTitle: 'लोकेशन — हमेशा अनुमति दें',
  obLocBody: 'स्क्रीन बंद होने पर भी विज़िट पकड़ी जाएँ, इसलिए “हमेशा अनुमति दें” चुनें।',
  obLocStatus: 'लोकेशन (हमेशा)',
  obAllowLoc: 'लोकेशन की अनुमति दें',
  obLocAllTime: 'हमेशा अनुमति दें',
  obLocStep2Body: 'बस हो गया। सेटिंग खोलें, Permissions → Location पर जाएँ और “हमेशा अनुमति दें” चुनें।',
  obLocOpenSettings: 'लोकेशन सेटिंग खोलें',
  obGpsOff: 'GPS बंद है — फोन सेटिंग में लोकेशन चालू करें।',

  // notifications
  obNotifTitle: 'नोटिफिकेशन',
  obNotifBody: 'काम के दौरान ड्यूटी और रिकॉर्डिंग की स्थिति दिखाने के लिए।',
  obNotifStatus: 'नोटिफिकेशन',
  obAllowNotif: 'नोटिफिकेशन की अनुमति दें',

  // battery
  obBatteryTitle: 'ऐप चालू रखें',
  obBatteryBody: 'नीचे बटन दबाएँ — फोन पूछेगा कि ऐप को बैकग्राउंड में चलने दें। Allow चुनें।',
  obBatteryOneTap: 'बैकग्राउंड में चलने दें',
  obBatteryDone: 'बैकग्राउंड में चलने की अनुमति दी',
  obAutostartBody: 'अगर आपके फोन में “Autostart” है, तो इस ऐप के लिए इसे ON करें ताकि यह बंद न हो।',
  obOpenAutostart: 'Autostart सेटिंग खोलें',

  // bluetooth
  obBtTitle: 'Bluetooth माइक',
  obBtBody:
    'दिए गए Bluetooth माइक को फोन की Bluetooth सेटिंग में जोड़ें (pair करें)। जुड़ने के बाद ऐप उसे अपने आप इस्तेमाल करता है। बैटरी खत्म होने पर ऐप फोन के माइक पर आ जाता है।',

  // voice enrollment
  veTitle: 'अपनी आवाज़ रिकॉर्ड करें',
  veBody: 'नीचे लिखा वाक्य ज़ोर से पढ़ें। इससे ऐप आपकी आवाज़ पहचानना सीखता है, ताकि रिकॉर्डिंग में यह बता सके कि कौन आप हैं।',
  veScript: 'अपना नाम बोलें, फिर करीब 30 सेकंड अपने काम के बारे में बताएँ — आप कौन सा इलाका देखते हैं, किन दुकानों पर जाते हैं, दुकानदारों से क्या कहते हैं। आराम से, अपने शब्दों में बोलें।',
  veStart: 'रिकॉर्ड शुरू करें',
  veRecording: 'अब बोलें — बोलते रहें',
  veSecondsLeft: '{s} सेकंड बाकी',
  veUploading: 'सेव हो रहा है…',
  veSuccess: '✓ आपकी आवाज़ सेव हो गई',
  veFailed: 'आवाज़ सेव नहीं हुई: {e}',
  veRetry: 'फिर कोशिश करें',
  veWhy: 'सिर्फ़ एक बार। दोबारा नहीं पूछा जाएगा।',

  // test
  obTestTitle: 'टेस्ट रिकॉर्डिंग',
  obTestBody: '10 सेकंड का टेस्ट जो सर्वर पर अपलोड होता है, ताकि पहले दिन से पहले सब ठीक है यह पक्का हो जाए।',
  obTestSuccess: '✓ हो गया — अपलोड हुआ',
  obTestFail: 'अपलोड नहीं हुआ — नेटवर्क देखें और फिर कोशिश करें।',
  obTestRecording: 'रिकॉर्ड हो रहा है…',
  obStartTest: 'टेस्ट शुरू करें',
  obFinish: 'पूरा करें',

  // ── Forced update (blocking) ──
  fuTitle: 'अपडेट ज़रूरी है',
  fuBody: 'विज़िट रिकॉर्ड करते रहने के लिए Sync का नया वर्ज़न चाहिए। जारी रखने के लिए इसे इंस्टॉल करें।',
  fuYourVersion: 'आपका वर्ज़न: {v}',
  fuNeeded: 'ज़रूरी: {v}',
  fuDownload: 'अपडेट डाउनलोड करें',
  fuDownloading: 'डाउनलोड हो रहा है…',
  fuAllowInstall: 'अपडेट इंस्टॉल करने दें',
  fuAllowInstallBody: 'एक बार का काम: “इस स्रोत से अनुमति दें” चालू करें, फिर दोबारा अपडेट दबाएँ।',
  fuHelp: 'डाउनलोड के बाद फाइल पर टैप करके इंस्टॉल करें। मदद चाहिए तो सुपरवाइज़र से पूछें।',

  // ── Voiceprints (admin) ──
  vpTitle: 'वॉइसप्रिंट',
  vpEnrolled: '{n} दर्ज',
  vpNone: 'अभी कोई वॉइसप्रिंट नहीं।\nसेटअप में वॉइस एनरोलमेंट पूरा करें।',
  vpRecorded: '{d} को रिकॉर्ड',

  // ── Settings ──
  checkUpdates: 'अपडेट देखें',
  recordings: 'रिकॉर्डिंग',
  refreshOutlets: 'दुकानें अपडेट करें',
  redoSetup: 'सेटअप फिर से करें',
  openPhoneSettings: 'फोन सेटिंग खोलें',
  changeLanguage: 'भाषा बदलें',
  version: 'वर्ज़न',
  upToDate: 'सब अपडेट है',
  updateAvailable: 'अपडेट उपलब्ध: {v}',
  logOut: 'लॉग आउट',
  logOutQ: 'लॉग आउट करें?',
  logOutBody: 'अगर आप ड्यूटी पर हैं तो पहले दिन खत्म करें।',
  cancel: 'रद्द करें',

  // ── Settings: update / sync alerts ──
  updUnavailableTitle: 'अपडेट उपलब्ध नहीं',
  updUnavailableBody: 'ओवर-द-एयर अपडेट सिर्फ इंस्टॉल किए गए ऐप में चलते हैं।',
  updReadyTitle: 'अपडेट तैयार है',
  updReadyBody: 'नया वर्ज़न लगाने के लिए Restart दबाएँ।',
  later: 'बाद में',
  restartNow: 'अभी रीस्टार्ट करें',
  upToDateBody: 'आपके पास पहले से नया वर्ज़न है।',
  updCheckFailTitle: 'जाँच नहीं हो पाई',
  checkNetBody: 'अपना इंटरनेट देखें और फिर कोशिश करें।',
  doneTitle: 'हो गया',
  outletsSynced: '{n} दुकानें अपडेट हुईं',
  failedTitle: 'नहीं हो पाया',

  // ── Visit history ──
  vhVisitsN: '{v} विज़िट',
  vhUploadedN: '✓ {u} अपलोड हुईं',
  vhPendingN: '⏳ {p} बाकी',
  vhEmpty: 'आज अभी कोई विज़िट नहीं',
  uploaded: 'अपलोड हुई',
  recOngoing: 'चल रही है',
  recManual: 'मैनुअल',

  // ── Recordings ──
  recLoadFail: 'रिकॉर्डिंग लोड नहीं हुईं',
  recPlayFail: 'यह रिकॉर्डिंग नहीं चली',
  recDeleteSomeFail: 'कुछ रिकॉर्डिंग नहीं हटाई जा सकीं',
  recDeleteOneQ: 'रिकॉर्डिंग हटाएँ?',
  delete: 'हटाएँ',
  recDeleteAllQ: 'सभी रिकॉर्डिंग हटाएँ?',
  recDeleteAllBody: '{n} रिकॉर्डिंग क्लाउड से हटा दी जाएँगी।',
  deleteAll: 'सभी हटाएँ',
  recCountHeader: 'क्लाउड में {n} रिकॉर्डिंग',
  recEmpty: 'अभी कोई रिकॉर्डिंग अपलोड नहीं हुई।\nएक विज़िट रिकॉर्ड करें, फिर नीचे खींचकर रिफ्रेश करें।',
  recPlay: 'चलाएँ',
  recPause: 'रोकें',
  recResume: 'फिर चलाएँ',
} as const;

export const mr = {
  // ── Language ──
  chooseLanguage: 'तुमची भाषा निवडा',
  languageName: 'मराठी',

  // ── Login ──
  loginSubtitle: 'दिवस सुरू करण्यासाठी लॉग इन करा',
  dsrId: 'DSR ID',
  pin: 'PIN',
  logIn: 'लॉग इन करा',
  wrongIdPin: 'ID किंवा PIN चुकीचा आहे. पुन्हा प्रयत्न करा.',
  noInternet: 'इंटरनेट नाही. कनेक्ट करून पुन्हा प्रयत्न करा.',
  serverIssue: 'सर्व्हरमध्ये अडचण — एका मिनिटाने पुन्हा प्रयत्न करा.',
  tooManyTries: 'खूप वेळा प्रयत्न केला. {s}s थांबा.',

  // ── Tabs ──
  tabField: 'फील्ड',
  tabOutlets: 'दुकाने',
  tabSettings: 'सेटिंग',

  // ── Nav titles ──
  navSetup: 'सेटअप',
  navTodaysVisits: 'आजच्या भेटी',

  // ── Home ──
  onDuty: 'स्टेटस: ऑनलाइन',
  offDuty: 'स्टेटस: ऑफलाइन',
  trackingVisits: 'भेटी नोंदवल्या जात आहेत',
  tapToBegin: 'दिवस सुरू करण्यासाठी टॅप करा',
  since: 'पासून',
  recording: 'रेकॉर्ड होत आहे',
  nearestOutlet: 'सर्वात जवळची दुकान',
  today: 'आज',
  outletsVisited: '{n} दुकाने पाहिली',
  myOutlets: 'माझी दुकाने',
  startMyDay: 'दिवस सुरू करा',
  endMyDay: 'दिवस संपवा',
  forceRecord: 'इथे रेकॉर्ड करा',
  stopRecording: 'रेकॉर्ड थांबवा',
  dayBegun: 'तुमचा दिवस सुरू झाला',
  dayWrapped: 'आजचे काम पूर्ण झाले',
  recordingStartsIn: '{s}s मध्ये रेकॉर्ड सुरू होईल',
  recordingStopsIn: '{s}s मध्ये रेकॉर्ड थांबेल',
  arrivingAt: '{name} वर पोहोचत आहात',
  leavingOutlet: '{name} सोडत आहात',
  locationOffBanner: 'लोकेशन बंद आहे — भेटी ओळखल्या जाणार नाहीत. ठीक करण्यासाठी टॅप करा.',
  weakSignalBanner:
    'लोकेशन सिग्नल कमकुवत आहे (±{m} m) — इथे भेटी ओळखता येत नाहीत. खिडकी किंवा दाराजवळ जा, किंवा “इथे रेकॉर्ड करा” दाबा.',
  micSilentNotifTitle: '⚠️ आवाज रेकॉर्ड होत नाही',
  micSilentNotifBody: 'Sync उघडा आणि या भेटीत स्क्रीनवर ठेवा. सुपरवायझरला सांगा.',
  micSilentBanner: 'कोणताही आवाज रेकॉर्ड होत नाही. अ‍ॅप उघडून भेटीदरम्यान स्क्रीनवर ठेवा, आणि सुपरवायझरला सांगा.',
  micBusyBanner: 'रेकॉर्ड सुरू झाले नाही — माइक व्यस्त असू शकतो (तुम्ही कॉलवर आहात का?). भेट तरीही नोंदवली आहे.',
  noOutletsTitle: 'दुकाने नाहीत',
  noOutletsBody: 'तुम्हाला कोणतीही दुकाने दिलेली नाहीत. तुमच्या सुपरवायझरशी बोला.',
  couldNotStart: 'सुरू होऊ शकले नाही',
  stopRecordingQ: 'रेकॉर्ड थांबवायचे?',
  yes: 'होय',
  no: 'नाही',
  yesStop: 'होय, थांबवा',
  noNearbyOutlet: 'जवळ कोणतीही दुकान नाही',
  recordingStarted: 'रेकॉर्ड सुरू झाले',
  outletFallback: 'दुकान',

  // ── Outlets ──
  kpiTotal: 'एकूण',
  dayMon: 'सोम',
  dayTue: 'मंगळ',
  dayWed: 'बुध',
  dayThu: 'गुरु',
  dayFri: 'शुक्र',
  daySat: 'शनि',
  daySun: 'रवि',
  noOutletsForDay: 'या दिवसासाठी कोणतीही दुकाने नियोजित नाहीत.',
  outletsCount: '{total} दुकाने',
  visitedCount: '✓ {n} पाहिली',
  pendingCount: '⏳ {n} बाकी',
  startDayForDistances: 'अंतर पाहण्यासाठी दिवस सुरू करा (फील्ड टॅब).',
  visited: 'पाहिली',
  pending: 'बाकी',
  noOutletsAssigned: 'कोणतीही दुकाने दिलेली नाहीत.',

  // ── Onboarding: common ──
  next: 'पुढे',
  done: 'झाले — पुढे',
  openSettings: 'सेटिंग उघडा',
  iveDoneThis: 'मी हे केले',

  // consent
  obWelcomeTitle: 'स्वागत आहे',
  obWelcomeBody:
    'हे अ‍ॅप ड्युटीदरम्यान दुकानांवर तुमचे संभाषण रेकॉर्ड करते, Marico च्या गुणवत्ता आणि प्रशिक्षणासाठी. तुमच्या रेकॉर्डिंग सुरक्षितपणे अपलोड होतात.',
  obAgree: 'मला समजले आणि मी सहमत आहे',

  // mic
  obMicTitle: 'माइक',
  obMicBody: 'दुकानांवर संभाषण रेकॉर्ड करण्यासाठी माइक हवा.',
  obMicStatus: 'माइकची परवानगी',
  obAllowMic: 'माइकला परवानगी द्या',

  // location
  obLocTitle: 'लोकेशन — नेहमी परवानगी द्या',
  obLocBody: 'स्क्रीन बंद असतानाही भेटी ओळखल्या जाव्यात म्हणून “नेहमी परवानगी द्या” निवडा.',
  obLocStatus: 'लोकेशन (नेहमी)',
  obAllowLoc: 'लोकेशनला परवानगी द्या',
  obLocAllTime: 'नेहमी परवानगी द्या',
  obLocStep2Body: 'जवळजवळ झाले. सेटिंग उघडा, Permissions → Location वर जा आणि “नेहमी परवानगी द्या” निवडा.',
  obLocOpenSettings: 'लोकेशन सेटिंग उघडा',
  obGpsOff: 'GPS बंद आहे — फोन सेटिंगमध्ये लोकेशन चालू करा.',

  // notifications
  obNotifTitle: 'नोटिफिकेशन',
  obNotifBody: 'काम करताना ड्युटी आणि रेकॉर्डिंगची स्थिती दाखवण्यासाठी.',
  obNotifStatus: 'नोटिफिकेशन',
  obAllowNotif: 'नोटिफिकेशनला परवानगी द्या',

  // battery
  obBatteryTitle: 'अ‍ॅप चालू ठेवा',
  obBatteryBody: 'खालचे बटण दाबा — फोन विचारेल की अ‍ॅपला बॅकग्राउंडमध्ये चालू द्यायचे. Allow निवडा.',
  obBatteryOneTap: 'बॅकग्राउंडमध्ये चालू द्या',
  obBatteryDone: 'बॅकग्राउंडमध्ये चालण्याची परवानगी दिली',
  obAutostartBody: 'तुमच्या फोनमध्ये “Autostart” असेल, तर या अ‍ॅपसाठी ते ON करा म्हणजे ते बंद होणार नाही.',
  obOpenAutostart: 'Autostart सेटिंग उघडा',

  // bluetooth
  obBtTitle: 'Bluetooth माइक',
  obBtBody:
    'दिलेला Bluetooth माइक तुमच्या फोनच्या Bluetooth सेटिंगमध्ये जोडा (pair करा). जोडल्यावर अ‍ॅप तो आपोआप वापरतो. बॅटरी संपली तर अ‍ॅप फोनच्या माइकवर येतो.',

  // voice enrollment
  veTitle: 'तुमचा आवाज रेकॉर्ड करा',
  veBody: 'खाली दिलेले वाक्य मोठ्याने वाचा. यामुळे अ‍ॅप तुमचा आवाज ओळखायला शिकते, म्हणजे रेकॉर्डिंगमध्ये कोण तुम्ही आहात हे कळते.',
  veScript: 'तुमचे नाव सांगा, मग सुमारे 30 सेकंद तुमच्या कामाबद्दल बोला — तुम्ही कोणता भाग बघता, कोणत्या दुकानांना जाता, दुकानदारांना काय सांगता. सहज, तुमच्या शब्दांत बोला.',
  veStart: 'रेकॉर्ड सुरू करा',
  veRecording: 'आता बोला — बोलत राहा',
  veSecondsLeft: '{s} सेकंद बाकी',
  veUploading: 'सेव्ह होत आहे…',
  veSuccess: '✓ तुमचा आवाज सेव्ह झाला',
  veFailed: 'आवाज सेव्ह झाला नाही: {e}',
  veRetry: 'पुन्हा प्रयत्न करा',
  veWhy: 'फक्त एकदाच. पुन्हा विचारले जाणार नाही.',

  // test
  obTestTitle: 'टेस्ट रेकॉर्डिंग',
  obTestBody: '10 सेकंदांची टेस्ट जी सर्व्हरवर अपलोड होते, म्हणजे पहिल्या दिवसाआधी सर्व ठीक आहे हे पक्के होते.',
  obTestSuccess: '✓ झाले — अपलोड झाले',
  obTestFail: 'अपलोड झाले नाही — नेटवर्क तपासा आणि पुन्हा प्रयत्न करा.',
  obTestRecording: 'रेकॉर्ड होत आहे…',
  obStartTest: 'टेस्ट सुरू करा',
  obFinish: 'पूर्ण करा',

  // ── Forced update (blocking) ──
  fuTitle: 'अपडेट आवश्यक आहे',
  fuBody: 'भेटी रेकॉर्ड करत राहण्यासाठी Sync ची नवीन आवृत्ती हवी. पुढे जाण्यासाठी ती इन्स्टॉल करा.',
  fuYourVersion: 'तुमची आवृत्ती: {v}',
  fuNeeded: 'आवश्यक: {v}',
  fuDownload: 'अपडेट डाउनलोड करा',
  fuDownloading: 'डाउनलोड होत आहे…',
  fuAllowInstall: 'अपडेट इंस्टॉल करू द्या',
  fuAllowInstallBody: 'एकदाच करायचे: “या स्रोताला परवानगी द्या” चालू करा, मग पुन्हा अपडेट दाबा.',
  fuHelp: 'डाउनलोड झाल्यावर फाइलवर टॅप करून इन्स्टॉल करा. मदत हवी असल्यास सुपरवायझरला विचारा.',

  // ── Voiceprints (admin) ──
  vpTitle: 'व्हॉइसप्रिंट',
  vpEnrolled: '{n} नोंदवले',
  vpNone: 'अजून कोणतेही व्हॉइसप्रिंट नाहीत.\nसेटअपमध्ये व्हॉइस एनरोलमेंट पूर्ण करा.',
  vpRecorded: '{d} रोजी रेकॉर्ड',

  // ── Settings ──
  checkUpdates: 'अपडेट तपासा',
  recordings: 'रेकॉर्डिंग',
  refreshOutlets: 'दुकाने अपडेट करा',
  redoSetup: 'सेटअप पुन्हा करा',
  openPhoneSettings: 'फोन सेटिंग उघडा',
  changeLanguage: 'भाषा बदला',
  version: 'व्हर्जन',
  upToDate: 'सर्व अपडेट आहे',
  updateAvailable: 'अपडेट उपलब्ध: {v}',
  logOut: 'लॉग आउट',
  logOutQ: 'लॉग आउट करायचे?',
  logOutBody: 'तुम्ही ड्युटीवर असाल तर आधी दिवस संपवा.',
  cancel: 'रद्द करा',

  // ── Settings: update / sync alerts ──
  updUnavailableTitle: 'अपडेट उपलब्ध नाही',
  updUnavailableBody: 'ओव्हर-द-एअर अपडेट फक्त इन्स्टॉल केलेल्या अ‍ॅपमध्ये चालतात.',
  updReadyTitle: 'अपडेट तयार आहे',
  updReadyBody: 'नवीन व्हर्जन लावण्यासाठी Restart दाबा.',
  later: 'नंतर',
  restartNow: 'आता रीस्टार्ट करा',
  upToDateBody: 'तुमच्याकडे आधीच नवीन व्हर्जन आहे.',
  updCheckFailTitle: 'तपासता आले नाही',
  checkNetBody: 'तुमचे इंटरनेट तपासा आणि पुन्हा प्रयत्न करा.',
  doneTitle: 'झाले',
  outletsSynced: '{n} दुकाने अपडेट झाली',
  failedTitle: 'झाले नाही',

  // ── Visit history ──
  vhVisitsN: '{v} भेटी',
  vhUploadedN: '✓ {u} अपलोड झाल्या',
  vhPendingN: '⏳ {p} बाकी',
  vhEmpty: 'आज अजून कोणतीही भेट नाही',
  uploaded: 'अपलोड झाली',
  recOngoing: 'सुरू आहे',
  recManual: 'मॅन्युअल',

  // ── Recordings ──
  recLoadFail: 'रेकॉर्डिंग लोड झाल्या नाहीत',
  recPlayFail: 'ही रेकॉर्डिंग चालली नाही',
  recDeleteSomeFail: 'काही रेकॉर्डिंग हटवता आल्या नाहीत',
  recDeleteOneQ: 'रेकॉर्डिंग हटवायची?',
  delete: 'हटवा',
  recDeleteAllQ: 'सर्व रेकॉर्डिंग हटवायच्या?',
  recDeleteAllBody: '{n} रेकॉर्डिंग क्लाउडमधून हटवल्या जातील.',
  deleteAll: 'सर्व हटवा',
  recCountHeader: 'क्लाउडमध्ये {n} रेकॉर्डिंग',
  recEmpty: 'अजून कोणतीही रेकॉर्डिंग अपलोड झाली नाही.\nएक भेट रेकॉर्ड करा, मग खाली ओढून रिफ्रेश करा.',
  recPlay: 'चालवा',
  recPause: 'थांबवा',
  recResume: 'पुन्हा चालवा',
} as const;

export const te = {
  // ── Language ──
  chooseLanguage: 'మీ భాషను ఎంచుకోండి',
  languageName: 'తెలుగు',

  // ── Login ──
  loginSubtitle: 'మీ రోజు మొదలుపెట్టడానికి లాగిన్ చేయండి',
  dsrId: 'DSR ID',
  pin: 'PIN',
  logIn: 'లాగిన్ చేయండి',
  wrongIdPin: 'ID లేదా PIN తప్పు. మళ్ళీ ప్రయత్నించండి.',
  noInternet: 'ఇంటర్నెట్ లేదు. కనెక్ట్ చేసి మళ్ళీ ప్రయత్నించండి.',
  serverIssue: 'సర్వర్ సమస్య — ఒక నిమిషం తర్వాత మళ్ళీ ప్రయత్నించండి.',
  tooManyTries: 'చాలాసార్లు ప్రయత్నించారు. {s}s ఆగండి.',

  // ── Tabs ──
  tabField: 'ఫీల్డ్',
  tabOutlets: 'దుకాణాలు',
  tabSettings: 'సెట్టింగ్‌లు',

  // ── Nav titles ──
  navSetup: 'సెటప్',
  navTodaysVisits: 'ఈరోజు సందర్శనలు',

  // ── Home ──
  onDuty: 'స్టేటస్: ఆన్‌లైన్',
  offDuty: 'స్టేటస్: ఆఫ్‌లైన్',
  trackingVisits: 'సందర్శనలు నమోదవుతున్నాయి',
  tapToBegin: 'రోజు మొదలుపెట్టడానికి ట్యాప్ చేయండి',
  since: 'నుండి',
  recording: 'రికార్డ్ అవుతోంది',
  nearestOutlet: 'దగ్గరి దుకాణం',
  today: 'ఈరోజు',
  outletsVisited: '{n} దుకాణాలు చూశారు',
  myOutlets: 'నా దుకాణాలు',
  startMyDay: 'రోజు మొదలుపెట్టు',
  endMyDay: 'రోజు ముగించు',
  forceRecord: 'ఇక్కడ రికార్డ్ చేయండి',
  stopRecording: 'రికార్డ్ ఆపండి',
  dayBegun: 'మీ రోజు మొదలైంది',
  dayWrapped: 'ఈరోజు పని పూర్తయింది',
  recordingStartsIn: '{s}s లో రికార్డ్ మొదలవుతుంది',
  recordingStopsIn: '{s}s లో రికార్డ్ ఆగుతుంది',
  arrivingAt: '{name} కి చేరుకుంటున్నారు',
  leavingOutlet: '{name} నుండి వెళ్తున్నారు',
  locationOffBanner: 'లొకేషన్ ఆఫ్ ఉంది — సందర్శనలు గుర్తించబడవు. సరిచేయడానికి ట్యాప్ చేయండి.',
  weakSignalBanner:
    'లొకేషన్ సిగ్నల్ బలహీనంగా ఉంది (±{m} m) — ఇక్కడ సందర్శనలు గుర్తించలేము. కిటికీ లేదా తలుపు దగ్గరకు వెళ్ళండి, లేదా “ఇక్కడ రికార్డ్ చేయండి” నొక్కండి.',
  micSilentNotifTitle: '⚠️ శబ్దం రికార్డ్ కావడం లేదు',
  micSilentNotifBody: 'Sync తెరిచి ఈ సందర్శనలో స్క్రీన్‌పై ఉంచండి. సూపర్‌వైజర్‌కి చెప్పండి.',
  micSilentBanner: 'ఎలాంటి శబ్దం రికార్డ్ కావడం లేదు. యాప్ తెరిచి సందర్శన సమయంలో స్క్రీన్‌పై ఉంచండి, సూపర్‌వైజర్‌కి చెప్పండి.',
  micBusyBanner: 'రికార్డ్ మొదలవలేదు — మైక్ బిజీగా ఉండవచ్చు (మీరు కాల్‌లో ఉన్నారా?). సందర్శన అయినా నమోదైంది.',
  noOutletsTitle: 'దుకాణాలు లేవు',
  noOutletsBody: 'మీకు ఏ దుకాణాలు ఇవ్వలేదు. మీ సూపర్‌వైజర్‌ని సంప్రదించండి.',
  couldNotStart: 'మొదలవలేదు',
  stopRecordingQ: 'రికార్డ్ ఆపాలా?',
  yes: 'అవును',
  no: 'కాదు',
  yesStop: 'అవును, ఆపండి',
  noNearbyOutlet: 'దగ్గరలో దుకాణం లేదు',
  recordingStarted: 'రికార్డ్ మొదలైంది',
  outletFallback: 'దుకాణం',

  // ── Outlets ──
  kpiTotal: 'మొత్తం',
  dayMon: 'సోమ',
  dayTue: 'మంగళ',
  dayWed: 'బుధ',
  dayThu: 'గురు',
  dayFri: 'శుక్ర',
  daySat: 'శని',
  daySun: 'ఆది',
  noOutletsForDay: 'ఈ రోజుకు దుకాణాలు ప్లాన్ చేయలేదు.',
  outletsCount: '{total} దుకాణాలు',
  visitedCount: '✓ {n} చూశారు',
  pendingCount: '⏳ {n} మిగిలి',
  startDayForDistances: 'దూరం చూడటానికి రోజు మొదలుపెట్టండి (ఫీల్డ్ ట్యాబ్).',
  visited: 'చూశారు',
  pending: 'మిగిలి',
  noOutletsAssigned: 'ఏ దుకాణాలు ఇవ్వలేదు.',

  // ── Onboarding: common ──
  next: 'తర్వాత',
  done: 'అయింది — తర్వాత',
  openSettings: 'సెట్టింగ్‌లు తెరవండి',
  iveDoneThis: 'నేను చేశాను',

  // consent
  obWelcomeTitle: 'స్వాగతం',
  obWelcomeBody:
    'ఈ యాప్ డ్యూటీలో దుకాణాల వద్ద మీ సంభాషణలను రికార్డ్ చేస్తుంది, Marico నాణ్యత మరియు శిక్షణ కోసం. మీ రికార్డింగ్‌లు సురక్షితంగా అప్‌లోడ్ అవుతాయి.',
  obAgree: 'నేను అర్థం చేసుకున్నాను, అంగీకరిస్తున్నాను',

  // mic
  obMicTitle: 'మైక్',
  obMicBody: 'దుకాణాల వద్ద సంభాషణలు రికార్డ్ చేయడానికి మైక్ కావాలి.',
  obMicStatus: 'మైక్ అనుమతి',
  obAllowMic: 'మైక్‌ను అనుమతించండి',

  // location
  obLocTitle: 'లొకేషన్ — ఎల్లప్పుడూ అనుమతించండి',
  obLocBody: 'స్క్రీన్ ఆఫ్ అయినా సందర్శనలు గుర్తించడానికి “ఎల్లప్పుడూ అనుమతించు” ఎంచుకోండి.',
  obLocStatus: 'లొకేషన్ (ఎల్లప్పుడూ)',
  obAllowLoc: 'లొకేషన్‌ను అనుమతించండి',
  obLocAllTime: 'ఎల్లప్పుడూ అనుమతించు',
  obLocStep2Body: 'దాదాపు అయిపోయింది. సెట్టింగ్‌లు తెరిచి, Permissions → Location కి వెళ్ళి “ఎల్లప్పుడూ అనుమతించు” ఎంచుకోండి.',
  obLocOpenSettings: 'లొకేషన్ సెట్టింగ్‌లు తెరవండి',
  obGpsOff: 'GPS ఆఫ్ ఉంది — ఫోన్ సెట్టింగ్‌లలో లొకేషన్ ఆన్ చేయండి.',

  // notifications
  obNotifTitle: 'నోటిఫికేషన్‌లు',
  obNotifBody: 'మీరు పని చేస్తున్నప్పుడు డ్యూటీ, రికార్డింగ్ స్థితి చూపించడానికి.',
  obNotifStatus: 'నోటిఫికేషన్‌లు',
  obAllowNotif: 'నోటిఫికేషన్‌లను అనుమతించండి',

  // battery
  obBatteryTitle: 'యాప్‌ను నడుస్తూ ఉంచండి',
  obBatteryBody: 'కింది బటన్ నొక్కండి — యాప్‌ను బ్యాక్‌గ్రౌండ్‌లో నడవనివ్వమని ఫోన్ అడుగుతుంది. Allow ఎంచుకోండి.',
  obBatteryOneTap: 'బ్యాక్‌గ్రౌండ్‌లో నడవనివ్వండి',
  obBatteryDone: 'బ్యాక్‌గ్రౌండ్‌లో నడవడానికి అనుమతి ఇచ్చారు',
  obAutostartBody: 'మీ ఫోన్‌లో “Autostart” ఉంటే, ఈ యాప్ కోసం దాన్ని ON చేయండి, అప్పుడు అది ఆగదు.',
  obOpenAutostart: 'Autostart సెట్టింగ్‌లు తెరవండి',

  // bluetooth
  obBtTitle: 'Bluetooth మైక్',
  obBtBody:
    'ఇచ్చిన Bluetooth మైక్‌ను మీ ఫోన్ Bluetooth సెట్టింగ్‌లలో pair చేయండి. pair అయ్యాక యాప్ దాన్ని దానంతట అదే వాడుతుంది. బ్యాటరీ అయిపోతే యాప్ ఫోన్ మైక్‌కు మారుతుంది.',

  // voice enrollment
  veTitle: 'మీ గొంతును రికార్డ్ చేయండి',
  veBody: 'కింద ఉన్న వాక్యాన్ని బిగ్గరగా చదవండి. దీనివల్ల యాప్ మీ గొంతును గుర్తించడం నేర్చుకుంటుంది, రికార్డింగ్‌లో ఎవరు మీరో చెప్పగలుగుతుంది.',
  veScript: 'మీ పేరు చెప్పి, సుమారు 30 సెకన్లు మీ పని గురించి మాట్లాడండి — మీరు ఏ ప్రాంతం చూస్తారు, ఏ దుకాణాలకు వెళ్తారు, దుకాణదారులతో ఏం చెబుతారు. సహజంగా, మీ సొంత మాటల్లో మాట్లాడండి.',
  veStart: 'రికార్డ్ మొదలుపెట్టండి',
  veRecording: 'ఇప్పుడు మాట్లాడండి — మాట్లాడుతూ ఉండండి',
  veSecondsLeft: '{s} సెకన్లు మిగిలాయి',
  veUploading: 'సేవ్ అవుతోంది…',
  veSuccess: '✓ మీ గొంతు సేవ్ అయింది',
  veFailed: 'గొంతు సేవ్ కాలేదు: {e}',
  veRetry: 'మళ్ళీ ప్రయత్నించండి',
  veWhy: 'ఒకసారి మాత్రమే. మళ్ళీ అడగరు.',

  // test
  obTestTitle: 'టెస్ట్ రికార్డింగ్',
  obTestBody: '10 సెకన్ల టెస్ట్ సర్వర్‌కు అప్‌లోడ్ అవుతుంది, మొదటి రోజుకు ముందు అంతా సరిగ్గా పనిచేస్తుందని నిర్ధారించడానికి.',
  obTestSuccess: '✓ అయింది — అప్‌లోడ్ అయింది',
  obTestFail: 'అప్‌లోడ్ కాలేదు — నెట్‌వర్క్ చూసి మళ్ళీ ప్రయత్నించండి.',
  obTestRecording: 'రికార్డ్ అవుతోంది…',
  obStartTest: 'టెస్ట్ మొదలుపెట్టండి',
  obFinish: 'ముగించు',

  // ── Forced update (blocking) ──
  fuTitle: 'అప్‌డేట్ అవసరం',
  fuBody: 'మీ సందర్శనలు రికార్డ్ చేస్తూ ఉండటానికి Sync కొత్త వెర్షన్ కావాలి. కొనసాగడానికి దాన్ని ఇన్‌స్టాల్ చేయండి.',
  fuYourVersion: 'మీ వెర్షన్: {v}',
  fuNeeded: 'అవసరం: {v}',
  fuDownload: 'అప్‌డేట్ డౌన్‌లోడ్ చేయండి',
  fuDownloading: 'డౌన్‌లోడ్ అవుతోంది…',
  fuAllowInstall: 'అప్‌డేట్‌లు ఇన్‌స్టాల్ చేయనివ్వండి',
  fuAllowInstallBody: 'ఒక్కసారి చేయాల్సిన పని: “ఈ మూలాన్ని అనుమతించు” ఆన్ చేసి, మళ్లీ అప్‌డేట్ నొక్కండి.',
  fuHelp: 'డౌన్‌లోడ్ అయ్యాక ఫైల్‌పై ట్యాప్ చేసి ఇన్‌స్టాల్ చేయండి. సహాయం కావాలంటే సూపర్‌వైజర్‌ని అడగండి.',

  // ── Voiceprints (admin) ──
  vpTitle: 'వాయిస్‌ప్రింట్‌లు',
  vpEnrolled: '{n} నమోదయ్యాయి',
  vpNone: 'ఇంకా వాయిస్‌ప్రింట్‌లు లేవు.\nసెటప్‌లో వాయిస్ ఎన్‌రోల్‌మెంట్ పూర్తి చేయండి.',
  vpRecorded: '{d}న రికార్డ్',

  // ── Settings ──
  checkUpdates: 'అప్‌డేట్‌ల కోసం చూడండి',
  recordings: 'రికార్డింగ్‌లు',
  refreshOutlets: 'దుకాణాలు రిఫ్రెష్ చేయండి',
  redoSetup: 'సెటప్ మళ్ళీ చేయండి',
  openPhoneSettings: 'ఫోన్ సెట్టింగ్‌లు తెరవండి',
  changeLanguage: 'భాష మార్చండి',
  version: 'వెర్షన్',
  upToDate: 'అప్‌డేట్‌గా ఉంది',
  updateAvailable: 'అప్‌డేట్ అందుబాటులో: {v}',
  logOut: 'లాగ్ అవుట్',
  logOutQ: 'లాగ్ అవుట్ చేయాలా?',
  logOutBody: 'మీరు డ్యూటీలో ఉంటే ముందు రోజు ముగించండి.',
  cancel: 'రద్దు చేయండి',

  // ── Settings: update / sync alerts ──
  updUnavailableTitle: 'అప్‌డేట్‌లు అందుబాటులో లేవు',
  updUnavailableBody: 'ఓవర్-ది-ఎయిర్ అప్‌డేట్‌లు ఇన్‌స్టాల్ చేసిన యాప్‌లో మాత్రమే పనిచేస్తాయి.',
  updReadyTitle: 'అప్‌డేట్ సిద్ధంగా ఉంది',
  updReadyBody: 'కొత్త వెర్షన్ వేయడానికి Restart నొక్కండి.',
  later: 'తర్వాత',
  restartNow: 'ఇప్పుడు రీస్టార్ట్ చేయండి',
  upToDateBody: 'మీ దగ్గర ఇప్పటికే కొత్త వెర్షన్ ఉంది.',
  updCheckFailTitle: 'చెక్ చేయలేకపోయాం',
  checkNetBody: 'మీ ఇంటర్నెట్ చూసి మళ్ళీ ప్రయత్నించండి.',
  doneTitle: 'అయింది',
  outletsSynced: '{n} దుకాణాలు అప్‌డేట్ అయ్యాయి',
  failedTitle: 'కాలేదు',

  // ── Visit history ──
  vhVisitsN: '{v} సందర్శనలు',
  vhUploadedN: '✓ {u} అప్‌లోడ్ అయ్యాయి',
  vhPendingN: '⏳ {p} మిగిలి',
  vhEmpty: 'ఈరోజు ఇంకా సందర్శనలు లేవు',
  uploaded: 'అప్‌లోడ్ అయింది',
  recOngoing: 'జరుగుతోంది',
  recManual: 'మాన్యువల్',

  // ── Recordings ──
  recLoadFail: 'రికార్డింగ్‌లు లోడ్ కాలేదు',
  recPlayFail: 'ఈ రికార్డింగ్ ప్లే కాలేదు',
  recDeleteSomeFail: 'కొన్ని రికార్డింగ్‌లు తొలగించలేకపోయాం',
  recDeleteOneQ: 'రికార్డింగ్ తొలగించాలా?',
  delete: 'తొలగించు',
  recDeleteAllQ: 'అన్ని రికార్డింగ్‌లు తొలగించాలా?',
  recDeleteAllBody: '{n} రికార్డింగ్‌లు క్లౌడ్ నుండి తొలగించబడతాయి.',
  deleteAll: 'అన్నీ తొలగించు',
  recCountHeader: 'క్లౌడ్‌లో {n} రికార్డింగ్‌లు',
  recEmpty: 'ఇంకా రికార్డింగ్‌లు అప్‌లోడ్ కాలేదు.\nఒక సందర్శన రికార్డ్ చేసి, కిందకు లాగి రిఫ్రెష్ చేయండి.',
  recPlay: 'ప్లే',
  recPause: 'ఆపు',
  recResume: 'మళ్ళీ ప్లే',
} as const;

export const translations = { en, hi, mr, te };
export type Lang = keyof typeof translations;
