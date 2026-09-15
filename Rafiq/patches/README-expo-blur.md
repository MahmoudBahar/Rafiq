# [expo-blur][Android] Screen content disappears during the pop animation when wrapped in `BlurTargetView`

## Summary

On Android (new architecture), a native-stack screen whose content is wrapped in `BlurTargetView` loses all of its content on the first frame of the pop transition: an empty container slides out instead of the screen. Screens without `BlurTargetView` animate correctly.

## Environment

- expo 57 / expo-blur 57.0.3
- react-native 0.86.3, react-native-screens 4.26.2, expo-router 57.0.21
- New architecture (Fabric), Android 15/16, Samsung SM-S928B; also reproducible in an emulator
- Happens with `predictiveBackGestureEnabled` both true and false

## Reproduction

1. `npx create-expo-app` (SDK 57, expo-router stack).
2. Second screen:
   ```tsx
   import { BlurTargetView } from 'expo-blur';
   export default function Second() {
     const ref = useRef<View>(null);
     return (
       <BlurTargetView ref={ref} style={{ flex: 1 }}>
         <Text>Hello</Text>
       </BlurTargetView>
     );
   }
   ```
3. Push it, then go back (button, hardware back, or gesture).
4. Observe: "Hello" vanishes immediately; a blank page performs the slide-out animation.

## Cause

react-native-screens keeps the content of a dismissed screen alive during the animation by walking the view tree and calling `parent.startViewTransition(child)` on every level (`Screen.kt`, `startTransitionRecursive`).

`ExpoBlurTargetView` proxies `addView`, `removeViewAt`, `getChildCount`, `getChildAt` … to its inner `blurTargetView`, but not `startViewTransition` / `endViewTransition`. Android's `ViewGroup.startViewTransition(view)` only acts when `view.getParent() == this`, so the call on `ExpoBlurTargetView` is silently ignored for the proxied children, and when Fabric removes them they are dropped instead of being kept as disappearing children.

## Fix

Forward the two transition calls the same way the add/remove overrides do (`android/src/main/java/expo/modules/blur/ExpoBlurTargetView.kt`):

```kotlin
override fun startViewTransition(view: View) {
  if (view === blurTargetView) {
    super.startViewTransition(view)
    return
  }
  blurTargetView.startViewTransition(view)
}

override fun endViewTransition(view: View) {
  if (view === blurTargetView) {
    super.endViewTransition(view)
    return
  }
  blurTargetView.endViewTransition(view)
}
```

Verified with patch-package on the setup above: the popped screen keeps its content for the whole transition.

## Note for this repo

`expo-blur` ships a precompiled `.aar` (`local-maven-repo/`) that the Android build links by default, so a
source patch is ignored unless the module is built from source. `package.json` therefore sets
`expo.autolinking.android.buildFromSource: ["expo-blur"]`; keep that entry as long as the patch exists.
