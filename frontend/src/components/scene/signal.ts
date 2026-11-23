/**
 * A small channel from the UI to the 3D scene, so pages can react to events (a keystroke in the
 * demo, a key derivation starting) without importing three.js. The scene subscribes when it has
 * loaded; with no scene, signals are simply dropped.
 */
export type SceneMode = 'idle' | 'deriving' | 'open' | 'error';

type Listener = (
  event: { kind: 'pulse'; strength: number } | { kind: 'mode'; mode: SceneMode },
) => void;

const listeners = new Set<Listener>();

export function subscribeScene(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A short outward burst of the point cloud. strength 0 to 1. */
export function pulseScene(strength = 0.5) {
  for (const l of listeners) l({ kind: 'pulse', strength });
}

export function setSceneMode(mode: SceneMode) {
  for (const l of listeners) l({ kind: 'mode', mode });
}
