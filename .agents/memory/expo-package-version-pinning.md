---
name: Expo package version pinning
description: Why expo-* packages must be installed via `expo install`, not `pnpm add`, in this Expo SDK 54 project.
---

Installing an `expo-*` package (e.g. `expo-auth-session`) with a plain `pnpm add` resolves the latest npm major version, which can target a much newer Expo SDK than the project uses. The mismatched native module (e.g. bundled crypto/AES native code) won't exist in the installed Expo Go client or native runtime, producing runtime errors like "Cannot find native module 'ExpoCryptoAES'" — this only surfaces at runtime, not at typecheck/build time.

**Why:** `pnpm add expo-auth-session` pulled v57 (built for a newer SDK) into a project running Expo SDK ~54, silently installing an incompatible native dependency (`expo-crypto`/`expo-application` also mismatched transitively).

**How to apply:** For any `expo-*` package, use `npx expo install <pkg>` (or `pnpm exec expo install <pkg>`) so the version matches `expo-doctor`'s SDK compatibility table. After installing, run `npx expo-doctor` and restart the workflow with Expo/Metro caches cleared (`.expo`, `node_modules/.cache`) if a stale version was previously loaded.
