import * as T from "three";
import { qualityBudget, type Quality } from "./tokens";
import { RING_LAYERS, resonanceView } from "./resonanceChoreography";

// Points and hairlines share these exact paths. No random numbers are generated per frame.
const trajectories = /* glsl */ `
  uniform float time;
  const float TAU = 6.28318530718;
  vec3 ringAt(float layer, float turn, float grain) {
    float a = turn * TAU;
    float radius = 1.58 + .13 * sin(layer * .8) + grain;
    float phase = .045 * sin(time * .20 + layer * .9);
    float x = -2.7 + layer * .91 + .065 * sin(a + phase + layer * .3);
    return vec3(x, cos(a + phase) * radius, sin(a + phase) * radius);
  }
  vec3 axisAt(float u, float angle, float grain) {
    float bead = pow(.5 + .5 * cos(u * TAU * 7.2), 2.6);
    float pulse = 1. + .038 * sin(time * 1.65 + u * 4.);
    float tip = .12 + .88 * smoothstep(0., .055, u);
    float radius = (.07 + .4 * bead) * pulse * tip + grain;
    return vec3(-4.1 + u * 10., cos(angle) * radius, sin(angle) * radius);
  }
  // Three closed ribbons, five parallel lines each. Symbols use these same curves.
  vec3 staffAt(float ribbon, float lane, float turn) {
    float a = turn * TAU;
    float orient = ribbon * TAU / 3. + .28;
    float radius = 2.0 + lane * .075;
    float x = .55 + 5.55 * cos(a);
    float cross = radius * sin(a);
    float weave = .28 * sin(2. * a + ribbon * .8);
    return vec3(x, cross * cos(orient) + weave * sin(orient),
      cross * sin(orient) - weave * cos(orient));
  }
`;

/** Hollow ring tunnel. Two GPU batches, observed from the oblique front. */
export function createResonanceField(quality: Quality) {
  const group = new T.Group();
  const viewRig = new T.Group();
  group.add(viewRig);
  const low = quality === "standard",
    high = quality === "cinematic";
  const counts = {
    axis: low ? 5000 : high ? 19000 : 12000,
    rings: low ? 4200 : high ? 16000 : 10000,
    symbols: low ? 160 : high ? 440 : 300,
    staff: low ? 700 : 1800,
  };
  const uniforms = {
    time: { value: 0 },
    pixelRatio: {
      value: Math.min(devicePixelRatio, qualityBudget[quality].dpr),
    },
    viewportScale: { value: 1 },
  };
  const total = counts.axis + counts.rings + counts.symbols + counts.staff;
  const positions = new Float32Array(total * 3);
  const bands = new Float32Array(total),
    tracks = new Float32Array(total);
  const styles = new Float32Array(total),
    sizes = new Float32Array(total),
    strengths = new Float32Array(total);
  let seed = 761933;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < total; i++) {
    const u = random(),
      angle = random() * Math.PI * 2,
      grain = random();
    const axis = i < counts.axis;
    const ring = !axis && i < counts.axis + counts.rings;
    const symbol = i >= counts.axis + counts.rings && i < total - counts.staff;
    const ringSymbol = symbol && i % 5 < 3;
    positions.set([u, angle, grain], i * 3);
    bands[i] = axis ? 0 : ring ? 1 : ringSymbol ? 2 : symbol ? 3 : 4;
    tracks[i] = ring || ringSymbol ? i % RING_LAYERS : i % 15;
    styles[i] = symbol ? 1 + (i % 7) : 0;
    sizes[i] = symbol ? 7 + grain ** 2 * 11 : 0.75 + grain * 0.85;
    strengths[i] = symbol
      ? 0.58 + grain * 0.3
      : axis
        ? 0.22 + grain * 0.48
        : ring
          ? 0.3 + grain * 0.48
          : 0.18 + grain * 0.25;
  }
  const particles = new T.BufferGeometry();
  particles.setAttribute("position", new T.BufferAttribute(positions, 3));
  for (const [name, values] of Object.entries({
    band: bands,
    track: tracks,
    style: styles,
    size: sizes,
    strength: strengths,
  }))
    particles.setAttribute(name, new T.BufferAttribute(values, 1));
  const points = new T.Points(
    particles,
    new T.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: T.AdditiveBlending,
      toneMapped: false,
      vertexShader:
        trajectories +
        /* glsl */ `
      attribute float band, track, style, size, strength;
      uniform float pixelRatio, viewportScale;
      varying float vStyle, vAlpha, vSpin;
      void main() {
        float u = position.x, a = position.y, seed = position.z;
        float opacity = 1.;
        vec3 p;
        if (band < .5) {
          u = fract(u + time * .044);
          p = axisAt(u, a + time * .20, (seed - .5) * .028);
          opacity = smoothstep(0., .015, u) * (1. - smoothstep(.975, 1., u));
          opacity *= 1. + .65 * (1. - smoothstep(.02, .14, u));
        } else if (band < 2.5) {
          float turn = u + time * (.026 + track * .0017);
          p = ringAt(track, turn, (seed - .5) * (band > 1.5 ? .06 : .033));
          p.x += (seed - .5) * .04;
        } else {
          p = staffAt(floor(track / 5.), mod(track, 5.), u + time * (.033 + floor(track / 5.) * .003));
        }
        vec4 view = modelViewMatrix * vec4(p, 1.);
        float perspective = clamp(15. / -view.z, .6, 1.65);
        gl_Position = projectionMatrix * view;
        gl_PointSize = max(.85, size * viewportScale * perspective) * pixelRatio;
        vAlpha = strength * opacity * clamp(perspective * perspective, .35, 1.2);
        vStyle = style;
        vSpin = seed * .55 + sin(time * .13 + seed * 6.) * .15;
      }
    `,
      fragmentShader: /* glsl */ `
      varying float vStyle, vAlpha, vSpin;
      float segment(vec2 p, vec2 a, vec2 b) {
        vec2 v = b - a;
        return length(p - a - v * clamp(dot(p - a, v) / dot(v, v), 0., 1.));
      }
      void main() {
        vec2 p = gl_PointCoord - .5;
        float r = length(p);
        float c = cos(vSpin), s = sin(vSpin);
        p = mat2(c,-s,s,c) * p;
        float d = 1., alpha = 0.;
        if (vStyle < .5) {
          alpha = exp(-r*r*19.) * (1. - smoothstep(.28,.5,r));
        } else if (vStyle < 1.5) {
          d = abs(r - .28);
        } else if (vStyle < 2.5) {
          d = abs(max(abs(p.x),abs(p.y)) - .26);
        } else if (vStyle < 3.5) {
          d = min(segment(p,vec2(0.,-.34),vec2(-.3,.23)),
            min(segment(p,vec2(-.3,.23),vec2(.3,.23)),segment(p,vec2(.3,.23),vec2(0.,-.34))));
        } else if (vStyle < 4.5) {
          float a = atan(p.y,p.x) + 1.5707963;
          float edge = .15 + .20 * pow(.5 + .5*cos(a*5.),2.);
          alpha = 1. - smoothstep(edge-.015,edge+.015,r);
        } else if (vStyle < 5.5) {
          d = min(segment(p,vec2(.09,-.30),vec2(.09,.18)),
            min(segment(p,vec2(.09,-.3),vec2(.27,-.13)),segment(p,vec2(.27,-.13),vec2(.20,-.03))));
          alpha = 1. - smoothstep(.8,1.,length((p-vec2(-.015,.20))/vec2(.12,.078)));
        } else if (vStyle < 6.5) {
          alpha = exp(-r*13.) + .7*exp(-abs(p.x)*80.-abs(p.y)*7.) + .7*exp(-abs(p.y)*80.-abs(p.x)*7.);
        } else d = abs(r-.28);
        if (d < .2) alpha = max(alpha,1.-smoothstep(.016,.038,d));
        if (alpha < .008) discard;
        vec3 color = vStyle > 5.5 && vStyle < 6.5 ? vec3(.83,.83,1.) : vec3(.94,.94,1.);
        gl_FragColor = vec4(color,alpha*vAlpha);
      }
    `,
    }),
  );
  points.frustumCulled = false;
  viewRig.add(points);

  // Attribute x=curve progress, y=track, z=path kind. Positions are derived in the shader.
  const vertices: number[] = [],
    opacity: number[] = [];
  function line(
    u: number,
    track: number,
    v: number,
    other: number,
    kind: number,
    alpha: number,
  ) {
    vertices.push(u, track, kind, v, other, kind);
    opacity.push(alpha, alpha);
  }
  const segments = low ? 128 : 256;
  for (let layer = 0; layer < RING_LAYERS; layer++)
    for (let j = 0; j < segments; j++)
      line(j / segments, layer, (j + 1) / segments, layer, 1, 0.28);
  // Separate fine circular cross-sections, without a solid tube surface.
  for (let ring = 0; ring < 98; ring++)
    for (let j = 0; j < 64; j++)
      line(
        ring / 97,
        (j / 64) * Math.PI * 2,
        ring / 97,
        ((j + 1) / 64) * Math.PI * 2,
        0,
        0.21,
      );
  for (let track = 0; track < 15; track++)
    for (let j = 0; j < segments; j++)
      line(j / segments, track, (j + 1) / segments, track, 2, 0.27);
  const paths = new T.BufferGeometry();
  paths.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
  paths.setAttribute("strength", new T.Float32BufferAttribute(opacity, 1));
  const lines = new T.LineSegments(
    paths,
    new T.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: T.AdditiveBlending,
      toneMapped: false,
      vertexShader:
        trajectories +
        /* glsl */ `
      attribute float strength;
      varying float vAlpha;
      void main() {
        float u=position.x, track=position.y, kind=position.z;
        vec3 p;
        if(kind<.5) p=axisAt(u,track,0.);
        else if(kind<1.5) p=ringAt(track,u,0.);
        else p=staffAt(floor(track/5.),mod(track,5.),u);
        vec4 view=modelViewMatrix*vec4(p,1.);
        vAlpha=strength*clamp(pow(15./-view.z,2.),.35,1.2);
        gl_Position=projectionMatrix*view;
      }
    `,
      fragmentShader: `varying float vAlpha;void main(){gl_FragColor=vec4(.90,.90,1.,vAlpha);}`,
    }),
  );
  lines.frustumCulled = false;
  viewRig.add(lines);
  function update(time: number) {
    uniforms.time.value = time;
    const view = resonanceView(time);
    // Apply the viewing yaw first, then screen-space roll; the axis stays diagonal,
    // rather than tipping vertically when the view approaches the front.
    viewRig.rotation.set(view.pitch, view.yaw, view.roll, "ZYX");
  }
  update(0);
  return {
    group,
    update,
    setViewport(height: number, dpr: number) {
      uniforms.pixelRatio.value = dpr;
      uniforms.viewportScale.value = T.MathUtils.clamp(height / 560, 0.65, 1.4);
    },
  };
}
