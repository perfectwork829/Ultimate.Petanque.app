# Maestro E2E Tests — Ultimate Petanque

## Overview

This directory contains automated E2E test flows using [Maestro](https://maestro.mobile.dev/), a YAML-based UI testing framework for mobile apps. Maestro runs on real devices and emulators without modifying app code.

## Prerequisites

### 1. Install Maestro CLI

```bash
# macOS / Linux
curl -Ls "https://get.maestro.mobile.dev" | bash

# Verify installation
maestro --version
```

### 2. Build a Test APK

```bash
# Build a preview APK for testing
eas build --profile preview --platform android

# Download and install on emulator/device
adb install app-preview.apk
```

### 3. For iOS Testing

```bash
# Build a development client
eas build --profile development --platform ios

# Or use Expo Go for basic testing
```

## Running Tests

### Run All Flows

```bash
maestro test .maestro/
```

### Run a Single Flow

```bash
maestro test .maestro/flows/01-login-flow.yaml
maestro test .maestro/flows/02-tab-navigation.yaml
maestro test .maestro/flows/03-match-creation.yaml
maestro test .maestro/flows/04-cross-player-sharing.yaml
maestro test .maestro/flows/05-iap-flow.yaml
```

### Record with Video

```bash
maestro record .maestro/flows/01-login-flow.yaml
```

### Interactive Studio

```bash
maestro studio
```

## Test Flows

| # | Flow | Description | Duration |
|---|---|---|---|
| 01 | **Login** | OTP registration, password login, session persistence, logout, re-login | ~45s |
| 02 | **Tab Navigation** | 4 main tabs, directory sub-tabs, deep page navigation, state preservation | ~30s |
| 03 | **Match Creation** | New match setup, team configuration, end-by-end scoring, save, verify in history | ~60s |
| 04 | **Cross-Player Sharing** | Share code generation, QR display, share hub navigation, invitations | ~40s |
| 05 | **IAP Flow** | Product display, promo code validation, restore purchases, purchase UI | ~35s |

## CI Integration

### GitHub Actions

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  maestro:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Build APK
        run: eas build --profile preview --platform android --non-interactive
      
      - name: Run Maestro Tests
        uses: mobile-dev-inc/action-maestro-cloud@v1
        with:
          api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
          app-file: app-preview.apk
          workspace: .maestro/
```

### Maestro Cloud

For cloud-based testing on multiple devices:

```bash
# Upload and run on Maestro Cloud
maestro cloud --api-key YOUR_KEY .maestro/ app-preview.apk
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `TEST_EMAIL` | `e2e-test@ultimatepetanque.app` | Test account email |
| `TEST_PASSWORD` | `Test123456` | Test account password |
| `TEST_OTP` | `1234` | OTP code (sandbox) |
| `TEST_PLAYER_NAME` | `E2E Test Player` | Test player name |
| `TEST_OPPONENT_NAME` | `Opponent Bot` | Test opponent name |

Override in CLI:

```bash
maestro test -e TEST_EMAIL=custom@email.com .maestro/flows/01-login-flow.yaml
```

## Troubleshooting

### Common Issues

1. **App not found**: Ensure the APK is installed and the `appId` matches `com.ultimatepetanque.app`
2. **Element not visible**: Check if the app language matches the text patterns (FR/EN)
3. **Timeout errors**: Increase `timeout` values for slow devices or network-dependent operations
4. **IAP flow fails**: Purchase flows require sandbox testing environment (TestFlight / Play Console internal testing)

### Debug Mode

```bash
# Run with verbose logging
maestro test --debug-output .maestro/flows/01-login-flow.yaml

# Take screenshots at each step
maestro test --format junit .maestro/flows/01-login-flow.yaml
```

## Notes

- Flows use regex patterns (`.*text.*`) to handle FR/EN bilingual UI
- Element IDs (`id: "..."`) require `testID` props in React Native components
- For full cross-player sharing testing, use two separate accounts on two devices
- IAP testing requires Apple/Google sandbox environment with test accounts
