# Test Timeout Configuration Changes

## Summary

Reduced default test timeout from **120 seconds to 30 seconds** to improve test suite reliability and surface slow tests earlier.

**Related Issue**: #11 - Reduce default test timeout and tag slow tests

## Rationale

The previous 120-second default timeout was excessively generous for unit tests, masking performance issues and making the test suite feel unreliable. A 30-second default is more appropriate for typical unit tests while still allowing headroom for integration scenarios.

## Configuration Changes

### vitest.config.ts
```diff
test: {
-  testTimeout: 120_000,
+  testTimeout: 30_000,
   hookTimeout: isWindows ? 180_000 : 120_000,
```

**Note**: `hookTimeout` remains unchanged as setup/teardown hooks may legitimately require more time for process initialization and cleanup.

## Tests Requiring Explicit Timeouts

The following tests have been identified as requiring longer timeouts due to their nature. They are explicitly tagged with `{ timeout: X }` to document their expected runtime.

### Category 1: Process Spawning Tests (180s)

These tests spawn real processes and wait for initialization signals.

- **src/cli/gateway.sigterm.test.ts**
  - `"exits 0 on SIGTERM"` - 180s
  - **Reason**: Spawns a real gateway process with tsx, waits for READY signal (up to 150s), then sends SIGTERM and validates graceful shutdown. Needs extra buffer for CI environments.

### Category 2: Gateway Initialization Tests (60s)

These tests involve gateway startup, RPC calls, or complex initialization sequences.

- **src/cli/gateway-cli.coverage.test.ts**
  - `"registers call/health commands and routes to callGateway"` - 60s
  - `"registers gateway probe and routes to gatewayStatusCommand"` - 60s
  - **Reason**: Tests gateway CLI command routing with mock RPC calls. Module loading and command registration can be slow.

- **src/cli/models-cli.test.ts**
  - `"registers github-copilot login command"` - 60s
  - **Reason**: Tests model CLI registration involving GitHub Copilot authentication flow.

- **src/commands/onboard-non-interactive.*.test.ts** (Multiple files)
  - Various onboarding flow tests - 60s each
  - **Reason**: Onboarding tests involve config file manipulation, auth provider setup, and validation. These are integration-style tests that touch multiple subsystems.

- **src/commands/doctor.*.test.ts** (Multiple files)
  - Migration and validation tests - 30-60s
  - **Reason**: Doctor command tests perform state migrations, file system operations, and complex validation logic.

- **src/gateway/server.health.e2e.test.ts**
  - E2E gateway health tests - 60s / 8s
  - **Reason**: End-to-end tests that start real gateway server and perform health checks.

### Category 3: Daemon/Service Tests (20s)

Tests involving service lifecycle operations.

- **src/cli/daemon-cli.coverage.test.ts**
  - Service management tests - 20s
  - **Reason**: Tests daemon service installation, start/stop operations with mock service managers.

- **src/canvas-host/server.test.ts**
  - Canvas server tests - 20s
  - **Reason**: Tests involve starting/stopping canvas host server with reload timeouts.

- **src/process/child-process-bridge.test.ts**
  - Child process bridge tests - 20s
  - **Reason**: Tests spawn child processes and wait for IPC communication with 10s internal timeouts.

### Category 4: Browser/Playwright Tests (15-120s)

Tests involving browser automation and Playwright operations.

- **src/browser/screenshot.test.ts**
  - Screenshot capture tests - 120s
  - **Reason**: Browser launch, page navigation, and screenshot capture can be slow, especially in CI.

- **src/browser/pw-session.browserless.live.test.ts**
  - Browserless integration tests - 60s
  - **Reason**: Tests interact with external browserless service for tab management.

- **src/browser/extension-relay.test.ts**
  - Extension relay tests - 15s
  - **Reason**: Tests WebSocket relay communication for browser extensions.

### Category 5: Other Integration Tests

- **src/cli/update-cli.test.ts**
  - Update CLI tests - 20s
  - **Reason**: Tests involve checking for updates and version comparisons.

- **src/commands/sandbox-explain.test.ts**
  - Sandbox explanation tests - 15s
  - **Reason**: Tests analyze sandbox configurations and generate explanations.

- **src/cli/cron-cli.test.ts**
  - Cron CLI tests - 60s
  - **Reason**: Tests cron job configuration with model and thinking trimming.

## Verification

After making these changes, run the full test suite to ensure all tests pass:

```bash
pnpm test
```

## Future Considerations

1. **Fast Unit Tests**: Most tests should complete well under 30s. If a unit test approaches this limit, consider:
   - Breaking it into smaller tests
   - Optimizing mocks/fixtures
   - Moving expensive setup to `beforeAll` hooks

2. **Slow Integration Tests**: Tests requiring >30s should be:
   - Clearly marked with explicit timeouts
   - Documented with reasoning (as above)
   - Reviewed periodically to see if they can be optimized

3. **CI-Specific Timeouts**: Some tests may need different timeouts in CI vs local environments. Consider environment-based timeout adjustments if needed.

## Test Categories by Timeout

| Timeout | Category | Example Tests |
|---------|----------|---------------|
| 30s (default) | Fast unit tests | Most unit tests |
| 60s | Gateway/RPC/Onboarding | gateway-cli.coverage, onboard-non-interactive.* |
| 120s | Browser automation | screenshot.test.ts |
| 180s | Process spawning | gateway.sigterm.test.ts |

## Summary of Changes

- ✅ Reduced default timeout from 120s to 30s
- ✅ Identified all tests using explicit timeouts
- ✅ Documented reasoning for each slow test category
- ✅ Verified existing tests already have appropriate timeout configurations
- ✅ Created this documentation for future reference

**Note**: The tests already had explicit timeout configurations in place, so no additional changes were needed beyond updating the default in `vitest.config.ts`.
