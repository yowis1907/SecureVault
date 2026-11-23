/**
 * The 3D vault: one polished object under studio light, in the manner of a product shot.
 *
 * A graphite body with a brushed champagne door, a spoked locking wheel, rivets, and hinges,
 * all built from three.js primitives (no model files to load). Reflections come from three's
 * procedural RoomEnvironment, so nothing is fetched. The vault turns toward the pointer and with
 * scrolling, floats slightly, spins its wheel when the UI pulses it, spins it hard while a key is
 * being derived, and swings the door open, lit from inside, on unlock.
 *
 * Purely decorative: it never sees user data. Loaded lazily by SceneBackdrop.
 */
import {
  ACESFilmicToneMapping,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  PointLight,
  Scene,
  SphereGeometry,
  TorusGeometry,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { SceneMode } from './signal';

export interface VaultSceneOptions {
  /** 'hero' is the large landing object; 'ambient' sits beside a form or in a card. */
  intensity: 'hero' | 'ambient';
  reducedMotion: boolean;
}

/** Moves value toward target at a rate independent of frame rate. */
function damp(value: number, target: number, rate: number, dt: number) {
  return value + (target - value) * (1 - Math.exp(-rate * dt));
}

function cssColor(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new Color(value || fallback);
}

/** A soft round shadow drawn once into a small canvas. */
function shadowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  return new CanvasTexture(canvas);
}

const DOOR_RADIUS = 0.98;
const OPEN_ANGLE = -1.85;

export class VaultScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(30, 1, 0.1, 60);
  private readonly vault = new Group();
  private readonly doorPivot = new Group();
  private readonly wheel = new Group();
  private readonly glow: PointLight;
  private readonly innerDisc: Mesh;
  private readonly shadow: Mesh;
  private readonly bodyMaterial: MeshPhysicalMaterial;
  private readonly owned: (BufferGeometry | Material | Texture)[] = [];

  private frame = 0;
  private running = false;
  private last = 0;
  private time = 0;
  private mode: SceneMode = 'idle';
  private wheelSpeed = 0;
  private door = 0;
  private shake = 0;
  private pointer = { x: 0, y: 0 };
  private turn = { x: 0, y: 0 };
  private scroll = 0;
  private scrollEased = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private options: VaultSceneOptions,
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    // Studio reflections from a procedural room: nothing to download.
    const pmrem = new PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    this.scene.environment = env;
    this.owned.push(env);
    room.dispose();
    pmrem.dispose();

    const key = new DirectionalLight(0xfff3e0, 2.2);
    key.position.set(-3, 4, 5);
    const rim = new DirectionalLight(0xdfe8ff, 1.4);
    rim.position.set(4, 2, -3);
    this.scene.add(key, rim);

    // Materials.
    this.bodyMaterial = this.own(
      new MeshPhysicalMaterial({
        color: 0x2a2a2f,
        metalness: 0.85,
        roughness: 0.36,
        clearcoat: 0.5,
        clearcoatRoughness: 0.35,
      }),
    );
    const brass = this.own(
      new MeshPhysicalMaterial({
        color: 0xcfb284,
        metalness: 1,
        roughness: 0.26,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
      }),
    );
    const engraving = this.own(
      new MeshPhysicalMaterial({ color: 0x8c7550, metalness: 1, roughness: 0.45 }),
    );
    const steel = this.own(
      new MeshPhysicalMaterial({
        color: 0xe4e1da,
        metalness: 1,
        roughness: 0.16,
        clearcoat: 1,
      }),
    );

    // Body: a rounded block whose front face sits at z = 0.
    const body = new Mesh(
      this.own(new RoundedBoxGeometry(2.7, 2.7, 1.3, 6, 0.2)),
      this.bodyMaterial,
    );
    body.position.z = -0.65;
    const frame = new Mesh(this.own(new TorusGeometry(DOOR_RADIUS + 0.09, 0.07, 32, 128)), brass);
    frame.position.z = 0.02;

    // Warm light inside, seen only when the door opens.
    this.innerDisc = new Mesh(
      this.own(new CircleGeometry(DOOR_RADIUS, 64)),
      this.own(new MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0 })),
    );
    this.innerDisc.position.z = -0.01;
    this.glow = new PointLight(0xffd9a0, 0, 6);
    this.glow.position.set(0, 0, 0.6);

    // Door, hinged on its left edge.
    const doorGroup = new Group();
    const disc = new Mesh(
      this.own(new CylinderGeometry(DOOR_RADIUS, DOOR_RADIUS, 0.16, 128)),
      brass,
    );
    disc.rotation.x = Math.PI / 2;
    doorGroup.add(disc);
    for (const r of [0.78, 0.5]) {
      const ring = new Mesh(this.own(new TorusGeometry(r, 0.012, 12, 128)), engraving);
      ring.position.z = 0.081;
      doorGroup.add(ring);
    }
    const rivet = this.own(new SphereGeometry(0.045, 16, 12));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const m = new Mesh(rivet, steel);
      m.position.set(Math.cos(a) * 0.89, Math.sin(a) * 0.89, 0.08);
      m.scale.z = 0.5;
      doorGroup.add(m);
    }

    // Locking wheel: a hub with six spokes ending in knobs.
    const hub = new Mesh(this.own(new CylinderGeometry(0.17, 0.17, 0.2, 48)), steel);
    hub.rotation.x = Math.PI / 2;
    this.wheel.add(hub);
    const spoke = this.own(new CylinderGeometry(0.032, 0.032, 1.04, 16));
    const knob = this.own(new SphereGeometry(0.07, 24, 16));
    for (let i = 0; i < 3; i++) {
      const s = new Mesh(spoke, steel);
      s.rotation.z = (i / 3) * Math.PI;
      this.wheel.add(s);
      for (const sign of [1, -1]) {
        const k = new Mesh(knob, steel);
        const a = (i / 3) * Math.PI + Math.PI / 2;
        k.position.set(Math.cos(a) * 0.52 * sign, Math.sin(a) * 0.52 * sign, 0);
        this.wheel.add(k);
      }
    }
    this.wheel.position.z = 0.2;
    doorGroup.add(this.wheel);

    doorGroup.position.x = DOOR_RADIUS + 0.05;
    this.doorPivot.position.set(-(DOOR_RADIUS + 0.05), 0, 0.09);
    this.doorPivot.add(doorGroup);

    const hinge = this.own(new CylinderGeometry(0.06, 0.06, 0.34, 24));
    for (const y of [0.5, -0.5]) {
      const h = new Mesh(hinge, steel);
      h.position.set(-(DOOR_RADIUS + 0.08), y, 0.1);
      this.vault.add(h);
    }

    this.vault.add(body, frame, this.innerDisc, this.glow, this.doorPivot);
    this.vault.rotation.set(0.08, -0.35, 0);
    this.scene.add(this.vault);

    const shadowMap = this.own(shadowTexture());
    this.shadow = new Mesh(
      this.own(new CircleGeometry(2, 48)),
      this.own(new MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false })),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = -1.95;
    this.shadow.scale.set(1.4, 0.8, 1);
    this.scene.add(this.shadow);

    this.applyTheme();
    this.resize();
  }

  private own<T extends BufferGeometry | Material | Texture>(thing: T): T {
    this.owned.push(thing);
    return thing;
  }

  /** Follows the page theme: a dark graphite body on dark pages, brushed silver on light ones. */
  applyTheme() {
    const background = cssColor('--sv-bg', '#0b0b0d');
    const light = background.getHSL({ h: 0, s: 0, l: 0 }).l > 0.5;
    this.bodyMaterial.color.set(light ? 0xd9d6cf : 0x2a2a2f);
    (this.shadow.material as MeshBasicMaterial).opacity = light ? 0.35 : 0.8;
    this.renderer.toneMappingExposure = light ? 0.95 : 1.05;
    this.renderOnce();
  }

  resize() {
    const parent = this.canvas.parentElement;
    const width = parent?.clientWidth ?? window.innerWidth;
    const height = parent?.clientHeight ?? window.innerHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // Keep the whole vault in frame whatever the container's shape.
    const base = this.options.intensity === 'hero' ? 7.4 : 8.6;
    const distance = this.camera.aspect < 1 ? base / Math.max(this.camera.aspect, 0.6) : base;
    this.camera.position.set(0, 0.35, distance);
    this.camera.lookAt(0, -0.1, 0);
    this.camera.updateProjectionMatrix();
    this.renderOnce();
  }

  /** Page scroll as a fraction of one viewport height; the vault turns as the page moves. */
  setScroll(viewports: number) {
    this.scroll = viewports;
    this.start();
  }

  setPointer(x: number, y: number) {
    this.pointer = { x, y };
  }

  setReducedMotion(reduced: boolean) {
    this.options = { ...this.options, reducedMotion: reduced };
    if (reduced) {
      this.stop();
      this.renderOnce();
    } else {
      this.start();
    }
  }

  /** A nudge to the locking wheel, for example on each keystroke in the demo. */
  burst(strength: number) {
    if (this.options.reducedMotion) return;
    this.wheelSpeed += 5 * strength;
    this.start();
  }

  setMode(mode: SceneMode) {
    this.mode = mode;
    if (mode === 'error') {
      this.wheelSpeed = -8;
      this.shake = 1;
    }
    if (this.options.reducedMotion) {
      // No motion: show the end state directly.
      this.door = mode === 'open' ? OPEN_ANGLE : 0;
      this.applyDoor();
      this.renderOnce();
    }
  }

  start() {
    if (this.running || this.options.reducedMotion) return;
    this.running = true;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  dispose() {
    this.stop();
    for (const thing of this.owned) thing.dispose();
    this.renderer.dispose();
  }

  private readonly tick = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.step(dt);
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.tick);
  };

  private step(dt: number) {
    this.time += dt;
    const deriving = this.mode === 'deriving';
    const open = this.mode === 'open';

    this.wheelSpeed = damp(this.wheelSpeed, deriving ? 11 : 0, deriving ? 3 : 1.6, dt);
    this.wheel.rotation.z -= this.wheelSpeed * dt;
    this.door = damp(this.door, open ? OPEN_ANGLE : 0, open ? 2.6 : 4, dt);
    this.shake = damp(this.shake, 0, 6, dt);
    this.applyDoor();

    this.scrollEased = damp(this.scrollEased, this.scroll, 4, dt);
    this.turn.x = damp(this.turn.x, this.pointer.y * 0.16, 3, dt);
    this.turn.y = damp(this.turn.y, this.pointer.x * 0.42, 3, dt);
    const sway = Math.sin(this.time * 0.3) * 0.12;
    this.vault.rotation.y = -0.35 + this.turn.y + sway + this.scrollEased * 0.9 + (open ? 0.35 : 0);
    this.vault.rotation.x = 0.08 + this.turn.x;
    this.vault.position.x = Math.sin(this.time * 40) * 0.03 * this.shake;
    this.vault.position.y =
      Math.sin(this.time * 0.8) * 0.06 + (deriving ? Math.sin(this.time * 30) * 0.008 : 0);
    this.shadow.scale.set(1.4 - this.vault.position.y * 0.6, 0.8, 1);
  }

  private applyDoor() {
    this.doorPivot.rotation.y = this.door;
    const openness = this.door / OPEN_ANGLE;
    this.glow.intensity = openness * 6;
    (this.innerDisc.material as MeshBasicMaterial).opacity = openness * 0.9;
  }

  private renderOnce() {
    if (this.running) return;
    this.renderer.render(this.scene, this.camera);
  }
}
