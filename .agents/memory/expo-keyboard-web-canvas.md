---
name: Expo keyboard behavior on web/canvas
description: Why keyboard-dependent UI (tab bar hiding, KeyboardAvoidingView) appears to "not work" when tested in the Replit canvas preview.
---

React Native's native `Keyboard` module events (`keyboardWillShow/Hide`, `keyboardDidShow/Hide`) never fire on web / react-native-web. The Replit canvas preview for Expo apps renders the web build, so any feature driven purely by these native listeners is invisible there even when correct on iOS/Android.

**Why:** the user tests visually through the canvas iframe, which is a web renderer, not a real device/simulator; there is no on-screen keyboard to trigger native events.

**How to apply:** for any UI behavior that should react to keyboard open/close (e.g. hiding a tab bar), centralize the state in a shared context that:
- Uses native `Keyboard` listeners on iOS/Android.
- On `Platform.OS === "web"`, exposes `onFocus`/`onBlur`-driven handlers that simulate keyboard-open/closed state, wired onto the relevant `TextInput`s.

This lets the same behavior be verified in the web canvas preview, not just on-device. Also: don't manually add keyboard height offsets on Android inside `KeyboardAvoidingView`/manual state — Android's `adjustResize` already shrinks the window, so manual compensation causes double-compression (dead space, content not returning to normal size). Manual height offset should be iOS-only.
