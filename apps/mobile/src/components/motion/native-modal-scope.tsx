import { createContext, use, type ReactNode } from 'react';

/**
 * A native Modal owns a separate Android root outside the app's gesture root,
 * so a `GestureDetector` inside it never receives a touch, and nesting a second
 * `GestureHandlerRootView` crashes Fabric (RAPP-82). Inside this scope the
 * shared press controls render the platform `Pressable`, so a sheet's content
 * uses `PressableScale` and `PressableDepth` like any screen and still works on
 * Android. `AppSheet` opens the scope; content never opens it by hand.
 */
const NativeModalContext = createContext(false);

export function NativeModalScope({ children }: { readonly children: ReactNode }) {
  return <NativeModalContext value>{children}</NativeModalContext>;
}

export function useIsInNativeModal(): boolean {
  return use(NativeModalContext);
}
