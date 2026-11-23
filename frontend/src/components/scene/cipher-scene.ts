/**
 * "Key space": the 3D scene behind the public pages and the unlock screen.
 *
 * A cloud of points on a sphere stands for the space of possible keys; a wireframe core in the
 * middle is the vault; two thin rings orbit it. The cloud breathes, follows the pointer, bursts
 * when the UI pulses it, contracts and spins while a key is being derived, and opens outward on
 * unlock. Purely decorative: it never sees any user data.
 *
 * Loaded lazily (see SceneBackdrop), so three.js is not part of the main bundle.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  EdgesGeometry,
  Group,
  IcosahedronGeometry,
  Line,
  LineBasicMaterial,
  LineSegments,
  NormalBlending,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from 'three';
import type { SceneMode } from './signal';

export interface CipherSceneOptions {
  /** Fewer, fainter points for pages where the scene is only atmosphere. */
  intensity: 'hero' | 'ambient';
  reducedMotion: boolean;
}

const VERTEX = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uPulse;
  uniform float uContract;
  uniform float uSize;
  uniform float uPixelRatio;
  varying float vSeed;
  varying float vDepth;

  void main() {
    vec3 dir = normalize(position);
    float t = uTime * 0.35;
    float wave = sin(dir.x * 3.1 + t) * sin(dir.y * 3.7 + t * 1.3) * sin(dir.z * 2.9 + t * 0.7);
    float radius = length(position) * (1.0 - 0.42 * uContract) + wave * 0.11;
    radius += uPulse * (0.35 + aSeed * 0.9);
    vec4 mv = modelViewMatrix * vec4(dir * radius, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (0.55 + aSeed) / -mv.z;
    vSeed = aSeed;
    vDepth = clamp((-mv.z - 3.0) / 3.5, 0.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uOpacity;
  varying float vSeed;
  varying float vDepth;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, d);
    vec3 color = mix(uColorA, uColorB, smoothstep(0.15, 0.95, vSeed));
    gl_FragColor = vec4(color, soft * uOpacity * (1.0 - vDepth * 0.75));
  }
`;

/** Points spread evenly over a sphere, with a little radial jitter. Visual only. */
function fibonacciSphere(count: number, radius: number) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const random = new Uint32Array(count * 2);
  crypto.getRandomValues(random);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const ring = Math.sqrt(1 - y * y);
    const theta = golden * i;
    const jitter = 1 + ((random[i * 2] ?? 0) / 0xffffffff - 0.5) * 0.18;
    positions[i * 3] = Math.cos(theta) * ring * radius * jitter;
    positions[i * 3 + 1] = y * radius * jitter;
    positions[i * 3 + 2] = Math.sin(theta) * ring * radius * jitter;
    seeds[i] = (random[i * 2 + 1] ?? 0) / 0xffffffff;
  }
  return { positions, seeds };
}

function circle(radius: number, segments: number) {
  const points = new Float32Array((segments + 1) * 3);
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    points[i * 3] = Math.cos(a) * radius;
    points[i * 3 + 2] = Math.sin(a) * radius;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(points, 3));
  return geometry;
}

function cssColor(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new Color(value || fallback);
}

/** Moves value toward target at a rate independent of frame rate. */
function damp(value: number, target: number, rate: number, dt: number) {
  return value + (target - value) * (1 - Math.exp(-rate * dt));
}

export class CipherScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(42, 1, 0.1, 50);
  private readonly world = new Group();
  private readonly core: LineSegments;
  private readonly rings: Line[] = [];
  private readonly points: Points;
  private readonly pointsMaterial: ShaderMaterial;
  private readonly disposables: { dispose(): void }[] = [];

  private frame = 0;
  private running = false;
  private last = 0;
  private time = 0;
  private mode: SceneMode = 'idle';
  private pulse = 0;
  private contract = 0;
  private spin = 1;
  private coreScale = 1;
  private pointer = { x: 0, y: 0 };
  private tilt = { x: 0, y: 0 };
  private offsetX = 0;
  private offsetY = 0;
  private scroll = 0;
  private scrollEased = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private options: CipherSceneOptions,
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.camera.position.set(0, 0, 6.2);

    const hero = options.intensity === 'hero';
    const { positions, seeds } = fibonacciSphere(hero ? 2600 : 1400, 1.65);
    const cloud = new BufferGeometry();
    cloud.setAttribute('position', new BufferAttribute(positions, 3));
    cloud.setAttribute('aSeed', new BufferAttribute(seeds, 1));
    this.pointsMaterial = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uContract: { value: 0 },
        uSize: { value: hero ? 46 : 30 },
        uPixelRatio: { value: this.renderer.getPixelRatio() },
        uColorA: { value: new Color() },
        uColorB: { value: new Color() },
        uOpacity: { value: hero ? 1 : 0.6 },
      },
    });
    this.points = new Points(cloud, this.pointsMaterial);
    this.disposables.push(cloud, this.pointsMaterial);

    const coreGeometry = new EdgesGeometry(new IcosahedronGeometry(0.62, 1));
    const coreMaterial = new LineBasicMaterial({ transparent: true, opacity: 0.95 });
    this.core = new LineSegments(coreGeometry, coreMaterial);
    this.disposables.push(coreGeometry, coreMaterial);

    for (const [radius, tiltX, tiltZ] of [
      [2.15, 1.15, 0.25],
      [2.45, 1.9, -0.4],
    ] as const) {
      const geometry = circle(radius, 160);
      const material = new LineBasicMaterial({ transparent: true, opacity: 0.35 });
      const ring = new Line(geometry, material);
      ring.rotation.set(tiltX, 0, tiltZ);
      this.rings.push(ring);
      this.disposables.push(geometry, material);
    }

    this.world.add(this.points, this.core, ...this.rings);
    this.scene.add(this.world);
    this.applyTheme();
    this.resize();
  }

  /** Reads the theme's colours from the CSS variables, so the scene follows light and dark. */
  applyTheme() {
    const accent = cssColor('--sv-accent', '#3fe0b0');
    const text = cssColor('--sv-text', '#e8efe9');
    const background = cssColor('--sv-bg', '#090c0f');
    // Additive glow only reads on a dark background; on a light one it washes out.
    const light = background.getHSL({ h: 0, s: 0, l: 0 }).l > 0.5;
    this.pointsMaterial.blending = light ? NormalBlending : AdditiveBlending;
    this.pointsMaterial.needsUpdate = true;
    const uniforms = this.pointsMaterial.uniforms as Record<string, { value: Color }>;
    uniforms.uColorA?.value.copy(accent);
    // On a light page the points are drawn darker, since they cannot glow.
    uniforms.uColorB?.value.copy(light ? cssColor('--sv-accent-strong', '#1f5a4f') : text);
    if (!light) uniforms.uColorB?.value.lerp(accent, 0.35);
    (this.core.material as LineBasicMaterial).color.copy(accent);
    for (const ring of this.rings) (ring.material as LineBasicMaterial).color.copy(text);
    this.renderOnce();
  }

  resize() {
    const parent = this.canvas.parentElement;
    const width = parent?.clientWidth ?? window.innerWidth;
    const height = parent?.clientHeight ?? window.innerHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // On wide screens the sphere sits to the right of the text; on narrow ones it sits behind it.
    this.offsetX = this.options.intensity === 'hero' && this.camera.aspect > 1.15 ? 2.1 : 0;
    // On phones the hero text fills the screen, so the sphere sits low and peeks out below it.
    this.offsetY = this.options.intensity === 'hero' && this.camera.aspect < 0.8 ? -2.3 : 0;
    this.camera.position.z = this.camera.aspect < 0.8 ? 8.2 : 6.2;
    this.camera.updateProjectionMatrix();
    this.renderOnce();
  }

  /** Page scroll as a fraction of one viewport height; the scene turns as the page moves. */
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

  burst(strength: number) {
    if (this.options.reducedMotion) return;
    this.pulse = Math.min(1.6, this.pulse + strength);
    this.start();
  }

  setMode(mode: SceneMode) {
    this.mode = mode;
    if (mode === 'open') this.burst(1.3);
    if (mode === 'error') this.burst(0.25);
    this.renderOnce();
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
    for (const d of this.disposables) d.dispose();
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
    const deriving = this.mode === 'deriving';
    this.time += dt * (deriving ? 2.4 : 1);
    this.pulse = damp(this.pulse, 0, 2.2, dt);
    this.contract = damp(this.contract, deriving ? 1 : 0, deriving ? 2.5 : 3.5, dt);
    this.spin = damp(this.spin, deriving ? 5 : this.mode === 'open' ? 3 : 1, 2, dt);
    this.coreScale = damp(
      this.coreScale,
      deriving ? 0.8 + Math.sin(this.time * 6) * 0.08 : this.mode === 'open' ? 1.5 : 1,
      4,
      dt,
    );
    this.tilt.x = damp(this.tilt.x, this.pointer.y * 0.35, 3, dt);
    this.tilt.y = damp(this.tilt.y, this.pointer.x * 0.5, 3, dt);

    this.scrollEased = damp(this.scrollEased, this.scroll, 5, dt);
    this.world.position.x = damp(this.world.position.x, this.offsetX, 4, dt);
    this.world.position.y = damp(
      this.world.position.y,
      this.offsetY + Math.sin(this.scrollEased * 1.2) * 0.35,
      4,
      dt,
    );
    this.world.rotation.x = this.tilt.x + this.scrollEased * 0.6;
    this.world.rotation.z = this.scrollEased * 0.25;
    this.world.rotation.y += dt * 0.08 * this.spin;
    this.points.rotation.y = this.tilt.y;
    this.core.rotation.x += dt * 0.25 * this.spin;
    this.core.rotation.y += dt * 0.35 * this.spin;
    this.core.scale.setScalar(this.coreScale);
    this.rings.forEach((ring, i) => {
      ring.rotation.y += dt * (i === 0 ? 0.18 : -0.12) * this.spin;
    });

    const u = this.pointsMaterial.uniforms as Record<string, { value: number }>;
    if (u.uTime) u.uTime.value = this.time;
    if (u.uPulse) u.uPulse.value = this.pulse;
    if (u.uContract) u.uContract.value = this.contract;
  }

  private renderOnce() {
    if (this.running) return;
    this.world.position.x = this.offsetX;
    this.world.position.y = this.offsetY;
    this.renderer.render(this.scene, this.camera);
  }
}
