export type RootStackParamList = {
  Tabs: undefined;
  Home: undefined;
  Outlets: undefined;
  Onboarding: { mode: 'first-run' | 'repair' } | undefined;
  VisitHistory: undefined;
  Settings: undefined;
  DevTools: undefined;
  Recordings: undefined;
};

export type TabParamList = {
  Field: undefined;
  Outlets: undefined;
  Settings: undefined;
};

/**
 * Loose screen props — works across the stack + tab navigators without
 * fighting nested-navigator generics. The generic is kept only for readability
 * at call sites; navigation/route are intentionally untyped here.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type Props<T extends string = string> = {
  navigation: any;
  route: any;
};
