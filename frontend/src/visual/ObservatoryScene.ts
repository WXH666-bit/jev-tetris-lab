import * as T from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { palette as p, materials, qualityBudget, type Quality } from "./tokens";
import type { CoreState } from "../components/SpatialLab";
import { createResonanceField } from "./ResonanceField";

export type SceneStats = {
  fps: number;
  frameMs: number;
  calls: number;
  triangles: number;
  dpr: number;
};
/** Presentation only. No API, game timers or experiment mutations enter this module. */
export function mountObservatory(
  host: HTMLElement,
  quality: Quality,
  onStats: (s: SceneStats) => void,
  onStatus: (s: string) => void,
  variant: "home" | "core" = "home",
) {
  const budget = qualityBudget[quality];
  const renderer = new T.WebGLRenderer({
    alpha: true,
    antialias: quality !== "standard",
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, budget.dpr));
  renderer.setClearColor(0, 0);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.transmissionResolutionScale = 0.5;
  renderer.domElement.setAttribute(
    "aria-label",
    variant === "home"
      ? "星轨共振：圆环、串珠光轴与五线谱粒子"
      : "实时 3D 核心 · 应用状态可视化",
  );
  host.append(renderer.domElement);
  const scene = new T.Scene();
  const pmrem = new T.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.32;
  room.dispose();
  pmrem.dispose();
  const camera = new T.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 15);
  const ambient = new T.HemisphereLight(p.lavender, p.skyStart, 0.65);
  scene.add(ambient);
  const key = new T.DirectionalLight(p.primary, 2);
  key.position.set(-4, 5, 6);
  scene.add(key);
  const rim = new T.DirectionalLight(p.info, 2.6);
  rim.position.set(5, 1, -2);
  scene.add(rim);
  const warm = new T.PointLight(p.highlight, 6, 20);
  warm.position.set(-5, -2, 4);
  scene.add(warm);
  const alloy = new T.MeshPhysicalMaterial(materials.alloy);
  const pearl = new T.MeshPhysicalMaterial({
    ...materials.pearl,
    transmission: budget.transmission,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const energy = new T.MeshStandardMaterial(materials.energy);
  const blue = new T.MeshStandardMaterial({
    ...materials.energy,
    color: p.mint,
    emissive: p.info,
    emissiveIntensity: 0.32,
  });
  const gold = new T.MeshStandardMaterial({
    color: p.highlight,
    metalness: 0.7,
    roughness: 0.22,
    emissive: p.peach,
    emissiveIntensity: 0.25,
  });
  function mesh(
    geometry: T.BufferGeometry,
    material: T.Material,
    parent: T.Object3D,
    x = 0,
    y = 0,
    z = 0,
  ) {
    const item = new T.Mesh(geometry, material);
    item.position.set(x, y, z);
    parent.add(item);
    return item;
  }
  function ring(
    parent: T.Object3D,
    radius: number,
    tube: number,
    material: T.Material,
    arc = Math.PI * 2,
  ) {
    return mesh(
      new T.TorusGeometry(radius, tube, 8, budget.segments, arc),
      material,
      parent,
    );
  }
  const world = new T.Group();
  scene.add(world);
  const core = new T.Group();
  world.add(core);
  const inner = mesh(new T.IcosahedronGeometry(0.68, 1), energy, core);
  const facets = mesh(
    new T.IcosahedronGeometry(0.91, 1),
    new T.MeshPhysicalMaterial({
      ...materials.pearl,
      wireframe: true,
      transparent: true,
      opacity: 0.6,
    }),
    core,
  );
  mesh(new T.SphereGeometry(1.04, budget.segments, 32), pearl, core);
  const orbitGroups: T.Group[] = [];
  for (let i = 0; i < budget.rings; i++) {
    const orbit = new T.Group();
    orbit.rotation.set(0.55 + i * 0.65, 0.4 + i * 0.56, i * 0.8);
    core.add(orbit);
    orbitGroups.push(orbit);
    const r = 1.34 + i * 0.2;
    ring(orbit, r, 0.055, alloy);
    for (let j = 0; j < 3; j++) {
      const segment = ring(orbit, r, 0.035, i % 2 ? blue : energy, 0.65);
      segment.position.z = 0.04;
      segment.rotation.z = (j * Math.PI * 2) / 3;
    }
    const ticks = new T.InstancedMesh(
      new T.BoxGeometry(0.022, 0.08, 0.026),
      i % 2 ? gold : pearl,
      48,
    );
    const dummy = new T.Object3D();
    for (let j = 0; j < 48; j++) {
      const a = (j * Math.PI) / 24;
      dummy.position.set(Math.cos(a) * (r + 0.09), Math.sin(a) * (r + 0.09), 0);
      dummy.rotation.z = a - Math.PI / 2;
      dummy.updateMatrix();
      ticks.setMatrixAt(j, dummy.matrix);
    }
    orbit.add(ticks);
    mesh(new T.OctahedronGeometry(0.1), i % 2 ? blue : gold, orbit, r, 0, 0);
  }
  // Freestanding scanner pedestal, with genuine depth and occlusion beneath the shell.
  const dais = new T.Group();
  core.add(dais);
  dais.position.y = -2.05;
  dais.rotation.x = -Math.PI / 2;
  mesh(new T.CylinderGeometry(1.3, 1.5, 0.16, 64), alloy, dais).rotation.x =
    Math.PI / 2;
  ring(dais, 1.22, 0.023, energy);
  ring(dais, 0.95, 0.018, blue);
  const stars = new Float32Array(budget.stars * 3);
  for (let i = 0; i < budget.stars; i++) {
    const r = Math.sin(i * 127.1 + 4) * 43758.5453;
    const v = r - Math.floor(r);
    stars[i * 3] = (v - 0.5) * 26;
    stars[i * 3 + 1] = Math.sin(i * 39.7) * 0.5 * 16;
    stars[i * 3 + 2] = -2 - v * 10;
  }
  const starGeo = new T.BufferGeometry();
  starGeo.setAttribute("position", new T.BufferAttribute(stars, 3));
  const dust = new T.Points(
    starGeo,
    new T.PointsMaterial({
      color: p.lavender,
      size: 0.026,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    }),
  );
  scene.add(dust);
  const resonance =
    variant === "home" ? createResonanceField(quality) : undefined;
  if (resonance) {
    world.add(resonance.group);
    core.visible = false;
  }
  if (variant === "core") {
    dust.visible = false;
    dais.visible = false;
  }
  let frame = 0,
    previous = 0,
    visible = true,
    lost = false,
    disposed = false,
    elapsed = 0,
    frames = 0,
    totalMs = 0,
    windowStart = 0;
  let state: CoreState = "idle",
    pointerX = 0,
    pointerY = 0,
    paused = false,
    pulseAt = -10;
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const mobile = width < 620;
    camera.position.z = mobile ? 19 : 15;
    core.position.set(mobile ? 0 : 1.9, mobile ? 1.6 : 1.3, 0);
    core.scale.setScalar(mobile ? 1.0 : 1.26);
    if (resonance) {
      const visibleWidth =
        2 *
        Math.tan(T.MathUtils.degToRad(camera.fov / 2)) *
        camera.position.z *
        camera.aspect;
      resonance.group.position.set(
        mobile ? -0.25 : visibleWidth * 0.10,
        mobile ? 1.5 : 1.2,
        0,
      );
      resonance.group.scale.setScalar(
        mobile ? 1.1 : Math.min(1.3, (width / height) * 0.68),
      );
      // The instrument is off-centre in the homepage. Align its observation basis
      // with the eye so perspective does not turn the intended diagonal axis vertical.
      resonance.group.lookAt(camera.position);
      resonance.setViewport(height, renderer.getPixelRatio());
    }
    if (variant === "core") {
      core.position.set(0, 0, 0);
      core.scale.setScalar(1);
      camera.position.z = 7.7;
    }
    renderOnce();
  }
  function renderOnce() {
    if (!disposed && !lost) renderer.render(scene, camera);
  }
  function tick(now: number) {
    frame = 0;
    if (disposed || lost || !visible || document.hidden) return;
    if (now - previous >= 1000 / budget.fps - 0.5) {
      const dt = previous ? Math.min((now - previous) / 1000, 0.1) : 0;
      previous = now;
      elapsed += dt;
      resonance?.update(elapsed);
      orbitGroups.forEach((g, i) => {
        g.rotation.z +=
          (paused ? 0 : dt) *
          (state === "requesting" ? 0.9 : 0.26) *
          (i % 2 ? -1 : 1);
      });
      inner.rotation.y += (paused ? 0 : dt) * 0.2;
      facets.rotation.x += (paused ? 0 : dt) * 0.09;
      energy.emissiveIntensity =
        0.35 + Math.max(0, 1 - (elapsed - pulseAt)) * 0.5;
      inner.scale.setScalar(
        1 + Math.sin(elapsed * (state === "requesting" ? 3 : 1.1)) * 0.035,
      );
      dust.rotation.z = elapsed * 0.003;
      world.rotation.y += (pointerX * 0.035 - world.rotation.y) * 0.04;
      world.rotation.x += (pointerY * 0.018 - world.rotation.x) * 0.04;
      const start = performance.now();
      renderOnce();
      totalMs += performance.now() - start;
      frames++;
      if (now - windowStart >= 1500) {
        if (windowStart)
          onStats({
            fps: Math.round((frames * 1000) / (now - windowStart)),
            frameMs: +(totalMs / frames).toFixed(2),
            calls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
            dpr: renderer.getPixelRatio(),
          });
        windowStart = now;
        frames = 0;
        totalMs = 0;
      }
    }
    frame = requestAnimationFrame(tick);
  }
  function resume() {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
    windowStart = 0;
    if (!visible || document.hidden || lost) return;
    if (budget.fps) frame = requestAnimationFrame(tick);
    else renderOnce();
  }
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    resume();
  });
  observer.observe(host);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const move = (event: PointerEvent) => {
    if (
      quality === "reduced" ||
      event.pointerType !== "mouse" ||
      document.activeElement?.matches("input,textarea,select")
    )
      return;
    const r = host.getBoundingClientRect();
    pointerX = (event.clientX - r.left) / r.width - 0.5;
    pointerY = (event.clientY - r.top) / r.height - 0.5;
  };
  const focus = () => {
    pointerX = 0;
    pointerY = 0;
  };
  const lose = (event: Event) => {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(frame);
    onStatus("图形上下文已中断 · 备用视图仍可操作");
  };
  const restore = () => {
    lost = false;
    onStatus("实时 3D");
    resize();
    resume();
  };
  renderer.domElement.addEventListener("webglcontextlost", lose);
  renderer.domElement.addEventListener("webglcontextrestored", restore);
  host.addEventListener("pointermove", move);
  document.addEventListener("focusin", focus);
  document.addEventListener("visibilitychange", resume);
  resize();
  resume();
  onStatus("实时 3D");
  return {
    setState(next: CoreState, suspend = false) {
      if (next === "complete" && state !== "complete") pulseAt = elapsed;
      state = next;
      paused = suspend;
      energy.emissive.set(next === "error" ? p.danger : p.primary);
      energy.emissiveIntensity = next === "complete" ? 0.75 : 0.35;
      if (!budget.fps) renderOnce();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      host.removeEventListener("pointermove", move);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("visibilitychange", resume);
      renderer.domElement.removeEventListener("webglcontextlost", lose);
      renderer.domElement.removeEventListener("webglcontextrestored", restore);
      const geometries = new Set<T.BufferGeometry>(),
        mats = new Set<T.Material>();
      scene.traverse((obj) => {
        if (
          obj instanceof T.Mesh ||
          obj instanceof T.Points ||
          obj instanceof T.LineSegments
        ) {
          geometries.add(obj.geometry);
          (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(
            (m) => mats.add(m),
          );
        }
      });
      geometries.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
