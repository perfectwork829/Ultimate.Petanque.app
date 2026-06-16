# PPSS E2E Tests - Registration Flow

## Overview

This test suite validates the complete user registration and onboarding flow, ensuring that `selfPlayer` is correctly created and displayed across all pages of the application.

## Test Structure

```
__tests__/e2e/
├── auth-flow.test.ts          # Main registration flow tests
├── selfplayer-verification.test.ts  # Page-specific selfPlayer tests
└── README.md                  # This documentation
```

## Test Scenarios

### 1. Registration Flow (`SCENARIO_REGISTRATION`)
Tests the complete OTP-based registration:
- Email/password input validation
- OTP send and receive
- OTP verification
- Account creation

### 2. Onboarding Flow (`SCENARIO_ONBOARDING`)
Tests the 4-step profile setup:
- Username input
- Role selection (Tireur/Pointeur/Milieu)
- Level selection
- Club selection or creation

### 3. selfPlayer Display (`SCENARIO_SELFPLAYER_DISPLAY`)
Verifies selfPlayer appears correctly on:
- **Home page**: Profile card with name, role, avatar
- **Directory**: First position with "MOI" badge
- **New Match**: Auto-added to team with "Vous" badge
- **Profile**: Complete profile information
- **Player/me**: Full player card view

### 4. Tournament Match Flow (`SCENARIO_TOURNAMENT_MATCH`)
Tests selfPlayer in tournament context:
- Tournament creation
- Match creation with auto-linking
- Team composition persistence

## Running Tests

### Manual Testing

1. Use the checklist in `MANUAL_TEST_CHECKLIST` from `auth-flow.test.ts`
2. Follow each step and mark completion
3. Document any failures with screenshots

### Automated Testing (Maestro)

```bash
# Install Maestro
curl -Ls "https://get.maestro.mobile.dev" | bash

# Run tests
maestro test __tests__/e2e/maestro.yaml
```

### Programmatic Verification

```typescript
import { 
  verifySelfPlayer, 
  verifySelfPlayerInContext,
  generateTestReport 
} from './__tests__/e2e/auth-flow.test';

// After user completes registration
const result = await verifySelfPlayer(supabase, userId, expectedData);
console.log(result);
// { success: true, player: { ... } }

// Verify context state
const contextCheck = verifySelfPlayerInContext(players, selfPlayer, userId);
console.log(contextCheck);
// { success: true, results: { selfPlayerExists: true, ... } }
```

## Key Verification Points

### Database Layer
- `auth.users` record created
- `user_profiles` record created (via trigger)
- `players` record created (via trigger)
- All records linked by `user.id`

### Application Layer
- `AppContext.loadData()` fetches player records
- `selfPlayer` computed correctly via `useMemo`
- Fallback auto-creation if missing

### UI Layer
- Home: `displayName` resolves correctly
- Directory: `filteredPlayers` puts self first
- Match: `teamAPlayers` includes selfPlayer
- Profile: Data loaded from `user_profiles`

## Regression Tests

| ID | Issue | Fix Applied |
|----|-------|-------------|
| REG_001 | OTP input not appearing | State update before alert |
| REG_002 | selfPlayer missing | Auto-creation fallback |
| REG_003 | Username not updating | Local state sync |
| REG_004 | Android timer crash | useRef for callbacks |

## Test Report Generation

```typescript
import { generateTestReport } from './__tests__/e2e/auth-flow.test';

const report = generateTestReport({
  registration: true,
  onboarding: true,
  selfPlayerDisplay: {
    home: true,
    directory: true,
    matchNew: true,
    profile: true,
    playerMe: true,
  },
  dataPersistence: true,
});

console.log(report);
// {
//   timestamp: "2026-02-07T...",
//   status: "PASSED",
//   summary: { ... },
//   recommendation: "All tests passed..."
// }
```

## Troubleshooting

### selfPlayer Not Appearing

1. Check `auth.users` record exists
2. Verify trigger `handle_new_user` executed
3. Check `players` table for record with `id = user.id`
4. Verify `AppContext` loaded data successfully
5. Check `useMemo` dependency on `user?.id`

### OTP Not Working

1. Verify email is valid and deliverable
2. Check auth settings (OTP length: 4)
3. Verify OTP hasn't expired (3600s)
4. Check network connectivity

### Data Not Persisting

1. Check Supabase connection
2. Verify RLS policies allow access
3. Check for database errors in logs
4. Verify user session is active

## Contributing

When adding new features that affect the registration flow:

1. Add test cases to appropriate test file
2. Update `MANUAL_TEST_CHECKLIST`
3. Document any new verification points
4. Run full test suite before PR
