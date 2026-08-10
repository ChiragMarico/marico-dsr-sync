/**
 * oemBattery.ts
 *
 * OEM-specific battery / autostart whitelisting guides for the Marico DSR app.
 *
 * WHY THIS EXISTS
 * ---------------
 * DSRs (field sales reps) run this app in an all-day foreground service. Many
 * budget Android OEMs (Xiaomi/MIUI/HyperOS, Vivo/Funtouch, Oppo-Realme-OnePlus/ColorOS,
 * Samsung/OneUI) ship aggressive, non-standard battery managers that silently kill
 * background/foreground services and block autostart. If we don't guide the DSR to
 * whitelist the app during onboarding, the service dies and data stops syncing.
 *
 * This module maps a device manufacturer/brand to a concrete, step-by-step guide the
 * onboarding screen can render. Steps are bilingual (Hindi first, then English) and
 * written for a low-literacy audience: one concrete tap-action per line.
 *
 * Content is adapted from the community knowledge at https://dontkillmyapp.com.
 * Menu paths differ slightly across OEM firmware versions, so steps are phrased to be
 * findable even if a label is worded a bit differently on a given device.
 *
 * NOTE ON settingsIntent:
 * Only broadly-reliable Android intents are used. The safe, universal one is
 * `android.settings.APPLICATION_DETAILS_SETTINGS`, which opens THIS app's own
 * "App info" page (from there the user reaches Battery/Permissions). We deliberately do
 * NOT hardcode OEM-private intents (e.g. MIUI autostart Activities) because they are
 * undocumented, vary by firmware, and throw ActivityNotFoundException when absent.
 *
 * This file is intentionally self-contained (no imports) so it can be unit-tested and
 * type-checked in isolation.
 */

/** A single manufacturer-family whitelisting guide. */
export interface OemBatteryGuide {
  /** manufacturer keys this guide matches, lowercase (from expo-device Device.manufacturer / brand) */
  match: string[];
  /** short label shown as heading, e.g. "Xiaomi / Redmi (MIUI)" */
  label: string;
  /** ordered steps, each a bilingual Hindi + English line (Hindi first). Keep each step to one concrete action. */
  steps: string[];
  /** optional Android settings intent action to deep-link, if a reliable one exists (else undefined) */
  settingsIntent?: string;
}

/** Universal, always-available intent that opens this app's own "App info" details page. */
const APP_DETAILS_INTENT = 'android.settings.APPLICATION_DETAILS_SETTINGS';

/**
 * All guides, in match-priority order. The LAST entry is the stock-Android fallback
 * (match: []) and is always returned when nothing else matches.
 */
export const OEM_GUIDES: OemBatteryGuide[] = [
  // ----------------------------------------------------------------------------
  // Xiaomi / Redmi / POCO  (MIUI / HyperOS)
  // ----------------------------------------------------------------------------
  {
    match: ['xiaomi', 'redmi', 'poco', 'mi '],
    label: 'Xiaomi / Redmi / POCO (MIUI / HyperOS)',
    steps: [
      'Open Settings → Apps → Manage apps → tap Marico DSR',
      'Turn the Autostart toggle ON (green)',
      'On the same screen tap Battery saver → choose "No restrictions"',
      'Open the "Security" app → Permissions → Autostart → turn Marico DSR ON',
      'In Recent apps, swipe the Marico DSR card down and tap the lock icon so it is not cleared',
    ],
    settingsIntent: APP_DETAILS_INTENT,
  },

  // ----------------------------------------------------------------------------
  // Vivo / iQOO  (Funtouch OS / OriginOS)
  // ----------------------------------------------------------------------------
  {
    match: ['vivo', 'iqoo'],
    label: 'Vivo / iQOO (Funtouch OS / OriginOS)',
    steps: [
      'Open Settings → Battery',
      'Tap "High background power consumption" → allow Marico DSR in the list',
      'Go back to Settings → "More settings" → Permission management / Applications',
      'Open Autostart → turn Marico DSR ON',
      'In Settings → Battery → Background power consumption management, set Marico DSR to "Allow background running"',
    ],
    settingsIntent: APP_DETAILS_INTENT,
  },

  // ----------------------------------------------------------------------------
  // Oppo / Realme / OnePlus  (ColorOS)
  // ----------------------------------------------------------------------------
  {
    match: ['oppo', 'realme', 'oneplus'],
    label: 'Oppo / Realme / OnePlus (ColorOS)',
    steps: [
      'Open Settings → Battery',
      'Tap "App Battery Management" (or Power consumption) → select Marico DSR',
      'Turn ON "Allow background activity"',
      'Turn ON "Allow auto launch"',
      'In Settings → Apps → Marico DSR → Battery usage, choose "Don\'t optimize" / Unrestricted instead of "Optimize"',
    ],
    settingsIntent: APP_DETAILS_INTENT,
  },

  // ----------------------------------------------------------------------------
  // Samsung  (OneUI)
  // ----------------------------------------------------------------------------
  {
    match: ['samsung'],
    label: 'Samsung (One UI)',
    steps: [
      'Open Settings → Apps → Marico DSR',
      'Tap Battery → choose "Unrestricted"',
      'Go back to Settings → Battery (or Battery and device care → Battery)',
      'Open "Background usage limits" → make sure Marico DSR is NOT in "Sleeping apps" or "Deep sleeping apps"; remove it if it is',
      'On the same screen open "Never sleeping apps" → add Marico DSR (tap +)',
    ],
    settingsIntent: APP_DETAILS_INTENT,
  },

  // ----------------------------------------------------------------------------
  // Stock Android fallback (Pixel / Motorola / Nokia / generic AOSP)
  // MUST be the last entry. match: [] => always the final fallback.
  // ----------------------------------------------------------------------------
  {
    match: [],
    label: 'Android (General)',
    steps: [
      'Open Settings → Apps → Marico DSR',
      'Tap Battery → choose "Unrestricted"',
      'If the app still stops, go to Settings → Battery → turn OFF "Adaptive Battery"',
      'Open Recent apps and do NOT swipe away the Marico DSR card',
    ],
    settingsIntent: APP_DETAILS_INTENT,
  },
];

/**
 * Return the best-matching guide for a device.
 *
 * Matching is case-insensitive substring: we lowercase the manufacturer and brand and,
 * for each guide (in OEM_GUIDES order), check whether any of the guide's `match` tokens
 * appears within the manufacturer string first, then within the brand string.
 *
 * The stock fallback (last entry, `match: []`) never matches via the token loop (empty
 * array), so it is returned explicitly when nothing else hits. This function never
 * returns undefined.
 *
 * @param manufacturer e.g. expo-device Device.manufacturer ("Xiaomi", "samsung", null)
 * @param brand        e.g. expo-device Device.brand ("Redmi", "iQOO"), optional
 */
export function guideForManufacturer(
  manufacturer: string | null | undefined,
  brand?: string | null,
): OemBatteryGuide {
  const mfr = (manufacturer ?? '').toLowerCase();
  const brnd = (brand ?? '').toLowerCase();

  for (const guide of OEM_GUIDES) {
    if (guide.match.length === 0) {
      // Stock fallback: skip during the matching pass; handled explicitly below.
      continue;
    }
    const hitByManufacturer = mfr !== '' && guide.match.some((token) => mfr.includes(token));
    const hitByBrand = brnd !== '' && guide.match.some((token) => brnd.includes(token));
    if (hitByManufacturer || hitByBrand) {
      return guide;
    }
  }

  // Stock Android fallback (guaranteed to be the last entry with match: []).
  const fallback = OEM_GUIDES[OEM_GUIDES.length - 1];
  return fallback;
}
