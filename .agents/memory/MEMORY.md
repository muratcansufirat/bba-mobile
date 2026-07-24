# Memory Index

- [Supabase auth in BBA mobile app](bba-supabase-auth.md) — real Supabase auth wired in; Google provider must be enabled in Supabase dashboard manually, agent has no API access to do it.
- [Expo keyboard behavior on web/canvas](expo-keyboard-web-canvas.md) — native `Keyboard` events never fire on react-native-web; canvas preview needs focus/blur-driven simulation to show keyboard-dependent UI changes.
- [Expo package version pinning with expo install](expo-package-version-pinning.md) — always use `npx expo install <pkg>` not `pnpm add <pkg>` for expo-* packages; raw add can pull SDK-incompatible majors causing "Cannot find native module" crashes.
- [BBA AI Provider Decision](bba-ai-provider.md) — AI sağlayıcısı yalnızca OpenAI; Anthropic/Replit-managed AI kesinlikle kullanılmayacak.
