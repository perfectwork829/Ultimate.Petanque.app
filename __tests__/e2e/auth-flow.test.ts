/**
 * E2E Test Suite: Authentication & Registration Flow
 * 
 * This file documents and validates the complete user registration flow:
 * 1. OTP sending and verification
 * 2. Profile creation via onboarding
 * 3. selfPlayer creation and display across all pages
 * 
 * Run these tests manually or integrate with Detox/Maestro for automation.
 */

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

export const TEST_CONFIG = {
  // Test user credentials
  testUser: {
    email: 'test.ppss@example.com',
    password: 'Test123456',
    username: 'TestJoueur',
    role: 'Tireur' as const,
    level: 'Confirmé' as const,
    club: 'Test Club Lyon',
  },
  
  // Timeouts
  timeouts: {
    otpSend: 10000,
    otpVerify: 15000,
    navigation: 5000,
    dataLoad: 8000,
  },
  
  // Expected routes
  routes: {
    login: '/login',
    onboarding: '/onboarding',
    home: '/(tabs)',
    profile: '/profile',
    playerMe: '/player/me',
    directory: '/(tabs)/directory',
    matchNew: '/match/new',
  },
};

// ============================================================================
// TEST SCENARIOS
// ============================================================================

/**
 * SCENARIO 1: Complete Registration Flow
 * 
 * Prerequisites:
 * - Clean app state (no existing session)
 * - Valid email address for OTP
 * 
 * Steps:
 * 1. Open app → Should redirect to login page
 * 2. Switch to "Inscription" tab
 * 3. Enter email, password, confirm password
 * 4. Tap "Recevoir le code"
 * 5. Verify OTP input screen appears
 * 6. Enter valid OTP code
 * 7. Tap "Créer mon compte"
 * 8. Should redirect to onboarding
 */
export const SCENARIO_REGISTRATION = {
  id: 'REGISTRATION_FLOW',
  name: 'Complete Registration with OTP',
  steps: [
    {
      action: 'NAVIGATE',
      target: '/login',
      expected: 'Login screen displays with Connexion/Inscription tabs',
    },
    {
      action: 'TAP',
      target: 'Inscription tab',
      expected: 'Registration form appears',
    },
    {
      action: 'INPUT',
      target: 'Email field',
      value: TEST_CONFIG.testUser.email,
      expected: 'Email entered correctly',
    },
    {
      action: 'INPUT',
      target: 'Password field',
      value: TEST_CONFIG.testUser.password,
      expected: 'Password entered (hidden)',
    },
    {
      action: 'INPUT',
      target: 'Confirm password field',
      value: TEST_CONFIG.testUser.password,
      expected: 'Passwords match',
    },
    {
      action: 'TAP',
      target: 'Recevoir le code button',
      expected: 'Loading indicator, then OTP screen appears',
    },
    {
      action: 'VERIFY',
      target: 'OTP screen',
      expected: 'Shows "Vérifiez votre email" with 4-digit input',
    },
    {
      action: 'INPUT',
      target: 'OTP input',
      value: '1234', // Replace with actual OTP from email
      expected: 'OTP entered',
    },
    {
      action: 'TAP',
      target: 'Créer mon compte button',
      expected: 'Account created, redirect to onboarding',
    },
  ],
};

/**
 * SCENARIO 2: Onboarding Flow
 * 
 * Prerequisites:
 * - User just completed registration
 * - On onboarding screen
 * 
 * Steps:
 * 1. Enter username
 * 2. Select role
 * 3. Select level
 * 4. Select or create club
 * 5. Complete onboarding
 * 6. Redirect to home with selfPlayer created
 */
export const SCENARIO_ONBOARDING = {
  id: 'ONBOARDING_FLOW',
  name: 'Complete Onboarding Profile Setup',
  steps: [
    {
      action: 'VERIFY',
      target: 'Onboarding screen',
      expected: 'Step 1/4 - Username input visible',
    },
    {
      action: 'INPUT',
      target: 'Username input',
      value: TEST_CONFIG.testUser.username,
      expected: 'Name entered, checkmark appears',
    },
    {
      action: 'TAP',
      target: 'Continuer button',
      expected: 'Navigate to Step 2/4 - Role selection',
    },
    {
      action: 'TAP',
      target: `${TEST_CONFIG.testUser.role} option`,
      expected: 'Role selected with highlight',
    },
    {
      action: 'TAP',
      target: 'Continuer button',
      expected: 'Navigate to Step 3/4 - Level selection',
    },
    {
      action: 'TAP',
      target: `${TEST_CONFIG.testUser.level} option`,
      expected: 'Level selected with highlight',
    },
    {
      action: 'TAP',
      target: 'Continuer button',
      expected: 'Navigate to Step 4/4 - Club selection',
    },
    {
      action: 'TAP',
      target: 'Créer un nouveau club button',
      expected: 'Club creation form appears',
    },
    {
      action: 'INPUT',
      target: 'Club name input',
      value: TEST_CONFIG.testUser.club,
      expected: 'Club name entered',
    },
    {
      action: 'INPUT',
      target: 'Club city input',
      value: 'Lyon',
      expected: 'City entered',
    },
    {
      action: 'TAP',
      target: 'Commencer button',
      expected: 'Profile saved, redirect to home',
    },
  ],
};

/**
 * SCENARIO 3: selfPlayer Display Verification
 * 
 * Prerequisites:
 * - User completed registration and onboarding
 * - On home screen
 * 
 * Verifies selfPlayer appears correctly on:
 * 1. Home page header
 * 2. Directory (first position with "MOI" badge)
 * 3. Match creation (auto-added to team with "Vous" badge)
 * 4. Profile page
 * 5. Player card page (/player/me)
 */
export const SCENARIO_SELFPLAYER_DISPLAY = {
  id: 'SELFPLAYER_DISPLAY',
  name: 'Verify selfPlayer Display Across Pages',
  checks: [
    {
      page: 'Home',
      route: '/(tabs)',
      verifications: [
        { element: 'Profile card', expected: `Shows "${TEST_CONFIG.testUser.username}"` },
        { element: 'Profile avatar', expected: 'Shows first letter of username' },
        { element: 'Profile role', expected: `Shows "${TEST_CONFIG.testUser.role}"` },
      ],
    },
    {
      page: 'Directory',
      route: '/(tabs)/directory',
      verifications: [
        { element: 'First player card', expected: `Is "${TEST_CONFIG.testUser.username}"` },
        { element: 'MOI badge', expected: 'Visible next to name' },
        { element: 'Card styling', expected: 'Has primary border and background tint' },
      ],
    },
    {
      page: 'New Match',
      route: '/match/new',
      verifications: [
        { element: 'Mon équipe section', expected: `Shows "${TEST_CONFIG.testUser.username}"` },
        { element: 'Vous badge', expected: 'Visible next to player name in chip' },
        { element: 'Player picker modal', expected: 'Shows "MOI" card at top when opened' },
      ],
    },
    {
      page: 'Profile',
      route: '/profile',
      verifications: [
        { element: 'Hero name', expected: `Shows "${TEST_CONFIG.testUser.username}"` },
        { element: 'Role badge', expected: `Shows "${TEST_CONFIG.testUser.role}"` },
        { element: 'Level badge', expected: `Shows "${TEST_CONFIG.testUser.level}"` },
        { element: 'Club text', expected: `Shows "${TEST_CONFIG.testUser.club}"` },
      ],
    },
    {
      page: 'Player Card (Me)',
      route: '/player/me',
      verifications: [
        { element: 'Player name', expected: `Shows "${TEST_CONFIG.testUser.username}"` },
        { element: 'Role display', expected: `Shows "${TEST_CONFIG.testUser.role}"` },
        { element: 'Level display', expected: `Shows "${TEST_CONFIG.testUser.level}"` },
        { element: 'Statistics section', expected: 'Shows 0 matches played initially' },
      ],
    },
  ],
};

/**
 * SCENARIO 4: Tournament Match Flow with selfPlayer
 * 
 * Verifies selfPlayer is automatically included in team composition
 * when creating matches through the tournament flow.
 */
export const SCENARIO_TOURNAMENT_MATCH = {
  id: 'TOURNAMENT_MATCH_SELFPLAYER',
  name: 'selfPlayer Auto-added in Tournament Match',
  steps: [
    {
      action: 'NAVIGATE',
      target: '/tournament/new',
      expected: 'Tournament creation screen',
    },
    {
      action: 'INPUT',
      target: 'Tournament name',
      value: 'Test Tournament',
      expected: 'Name entered',
    },
    {
      action: 'COMPLETE',
      target: 'Tournament creation',
      expected: 'Tournament created, navigate to detail',
    },
    {
      action: 'TAP',
      target: 'Nouveau Match button',
      expected: 'Navigate to match creation with tournament linked',
    },
    {
      action: 'VERIFY',
      target: 'Mon équipe section',
      expected: `"${TEST_CONFIG.testUser.username}" auto-added with "Vous" badge`,
    },
  ],
};

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Simulates the registration flow for testing purposes
 */
export async function simulateRegistration(supabase: any, testEmail: string, testPassword: string) {
  console.log('[TEST] Starting registration simulation...');
  
  // Step 1: Send OTP
  console.log('[TEST] Sending OTP to:', testEmail);
  const { error: otpError } = await supabase.auth.signInWithOtp({ email: testEmail });
  
  if (otpError) {
    console.error('[TEST] OTP send failed:', otpError.message);
    return { success: false, error: otpError.message, step: 'OTP_SEND' };
  }
  
  console.log('[TEST] OTP sent successfully');
  return { success: true, step: 'OTP_SENT', message: 'Check email for OTP code' };
}

/**
 * Verifies selfPlayer exists and has correct data
 */
export async function verifySelfPlayer(
  supabase: any, 
  userId: string, 
  expectedData: typeof TEST_CONFIG.testUser
) {
  console.log('[TEST] Verifying selfPlayer for user:', userId);
  
  // Check players table
  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('*')
    .eq('id', userId)
    .single();
    
  if (playerError || !player) {
    console.error('[TEST] selfPlayer not found in players table');
    return { 
      success: false, 
      error: 'selfPlayer not found', 
      details: playerError?.message 
    };
  }
  
  // Verify data matches
  const checks = [
    { field: 'name', expected: expectedData.username, actual: player.name },
    { field: 'role', expected: expectedData.role, actual: player.role },
    { field: 'level', expected: expectedData.level, actual: player.level },
  ];
  
  const failures = checks.filter(c => c.expected !== c.actual);
  
  if (failures.length > 0) {
    console.error('[TEST] selfPlayer data mismatch:', failures);
    return { success: false, error: 'Data mismatch', failures };
  }
  
  console.log('[TEST] selfPlayer verified successfully');
  return { success: true, player };
}

/**
 * Checks if selfPlayer appears correctly in the UI context
 */
export function verifySelfPlayerInContext(
  players: any[], 
  selfPlayer: any | null, 
  userId: string
) {
  const results = {
    selfPlayerExists: !!selfPlayer,
    selfPlayerIdMatch: selfPlayer?.id === userId,
    selfPlayerInList: players.some(p => p.id === userId),
    selfPlayerFirst: players[0]?.id === userId,
  };
  
  const allPassed = Object.values(results).every(v => v === true);
  
  return {
    success: allPassed,
    results,
    message: allPassed 
      ? 'selfPlayer correctly configured in context' 
      : 'selfPlayer configuration issues detected',
  };
}

// ============================================================================
// MANUAL TEST CHECKLIST
// ============================================================================

export const MANUAL_TEST_CHECKLIST = `
# PPSS E2E Test Checklist - Registration Flow

## Prerequisites
- [ ] Clean app install or cleared data
- [ ] Valid test email address
- [ ] Network connection available

## 1. Registration (5-10 min)
- [ ] App opens to login screen
- [ ] Can switch between Connexion/Inscription tabs
- [ ] Email validation works (shows error for invalid format)
- [ ] Password validation works (min 6 characters)
- [ ] Password confirmation validation works
- [ ] "Recevoir le code" button triggers OTP send
- [ ] OTP input screen appears after sending
- [ ] Can go back to modify email
- [ ] Valid OTP creates account
- [ ] Invalid OTP shows error

## 2. Onboarding (3-5 min)
- [ ] Redirects to onboarding after registration
- [ ] Step 1: Username input with validation
- [ ] Step 2: Role selection (Tireur/Pointeur/Milieu)
- [ ] Step 3: Level selection (4 options)
- [ ] Step 4: Club selection or creation
- [ ] Progress bar updates correctly
- [ ] Can navigate back between steps
- [ ] "Commencer" completes onboarding

## 3. selfPlayer Display (5 min)
- [ ] Home: Profile card shows username
- [ ] Home: Avatar shows first letter
- [ ] Directory: selfPlayer first in list
- [ ] Directory: "MOI" badge visible
- [ ] Directory: Card has special styling
- [ ] New Match: selfPlayer in "Mon équipe"
- [ ] New Match: "Vous" badge on player chip
- [ ] Profile: All info displayed correctly
- [ ] Player/me: Complete player card

## 4. Data Persistence (2 min)
- [ ] Close and reopen app
- [ ] Still logged in
- [ ] selfPlayer still displays correctly
- [ ] All pages show correct data

## Test Results
Date: _____________
Tester: ___________
Device: ___________
OS Version: _______
App Version: ______

Pass: [ ] Yes [ ] No
Notes: ____________________________________
`;

// ============================================================================
// EXPORT TEST REPORT GENERATOR
// ============================================================================

export function generateTestReport(results: {
  registration: boolean;
  onboarding: boolean;
  selfPlayerDisplay: Record<string, boolean>;
  dataPersistence: boolean;
}) {
  const timestamp = new Date().toISOString();
  const allPassed = results.registration && 
                    results.onboarding && 
                    Object.values(results.selfPlayerDisplay).every(v => v) &&
                    results.dataPersistence;
                    
  return {
    timestamp,
    status: allPassed ? 'PASSED' : 'FAILED',
    summary: {
      registration: results.registration ? '✅' : '❌',
      onboarding: results.onboarding ? '✅' : '❌',
      selfPlayerDisplay: Object.entries(results.selfPlayerDisplay)
        .map(([page, passed]) => `${page}: ${passed ? '✅' : '❌'}`)
        .join(', '),
      dataPersistence: results.dataPersistence ? '✅' : '❌',
    },
    recommendation: allPassed 
      ? 'All tests passed. Registration flow is working correctly.'
      : 'Some tests failed. Review the detailed results and fix issues.',
  };
}
