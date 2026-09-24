/* ============================================================
   LOOK — Sega Model 3 (1997) presentation layer
   · per-vertex Gouraud diffuse + specular (lighting in the VERTEX shader)
   · mid-poly segmented character meshes, rigid hierarchical joints
   · unfiltered small textures, filtered+mipmapped large ones
   · vertex fog, no shadow maps
   ============================================================ */
window.Look = (function () {
  'use strict';

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  // ---------------------------------------------------------------- shaders
  // Real3D Pro-1000 lit per VERTEX and interpolated across the triangle.
  // That is the whole look: highlights crawl over facets instead of sitting
  // smoothly on the surface the way a modern per-pixel shader puts them.
  const VERT = `
    precision mediump float;
    uniform vec3  uLightDir;      // world space, toward the light
    uniform vec3  uLightColor;
    uniform vec3  uAmbient;
    uniform vec3  uSpec;
    uniform float uShine;
    uniform float uFogNear;
    uniform float uFogFar;
    varying vec3  vDiff;
    varying vec3  vSpecular;
    varying vec2  vUv;
    varying float vFog;
    void main() {
      vUv = uv;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vec3 n  = normalize(normalMatrix * normal);              // survives non-uniform scale
      vec3 L  = normalize((viewMatrix * vec4(uLightDir, 0.0)).xyz);
      float ndl = max(dot(n, L), 0.0);
      vDiff = uAmbient + uLightColor * ndl;
      vec3 V = normalize(-mv.xyz);
      vec3 H = normalize(L + V);
      float s = pow(max(dot(n, H), 0.0), uShine);
      vSpecular = uSpec * s * step(0.0001, ndl);
      vFog = clamp((-mv.z - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
      gl_Position = projectionMatrix * mv;
    }`;

  const FRAG = `
    precision mediump float;
    uniform vec3      uColor;
    uniform sampler2D uMap;
    uniform float     uUseMap;
    uniform vec3      uFogColor;
    varying vec3  vDiff;
    varying vec3  vSpecular;
    varying vec2  vUv;
    varying float vFog;
    void main() {
      vec3 base = uColor;
      if (uUseMap > 0.5) base *= texture2D(uMap, vUv).rgb;
      vec3 c = base * vDiff + vSpecular;
      gl_FragColor = vec4(mix(c, uFogColor, vFog), 1.0);
    }`;

  // one shared set of light/fog uniforms; every material points at these objects
  const shared = {
    uLightDir:   { value: new THREE.Vector3(0.36, 0.86, 0.36).normalize() },
    uLightColor: { value: new THREE.Color(0xfff4de) },
    uAmbient:    { value: new THREE.Color(0x93a3ae) },   // bright overcast fill
    uFogColor:   { value: new THREE.Color(0xa8c8dd) },
    uFogNear:    { value: 210 },
    uFogFar:     { value: 430 }
  };

  let WHITE1x1 = null;
  function white() {
    if (!WHITE1x1) {
      const c = document.createElement('canvas'); c.width = c.height = 1;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 1, 1);
      WHITE1x1 = new THREE.CanvasTexture(c);
    }
    return WHITE1x1;
  }

  /** Gouraud material. shine 4-8 = matte turf, 20-30 = kit fabric, 40+ = wet plastic. */
  function mat(o) {
    o = o || {};
    return new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uLightDir: shared.uLightDir, uLightColor: shared.uLightColor,
        uAmbient: shared.uAmbient, uFogColor: shared.uFogColor,
        uFogNear: shared.uFogNear, uFogFar: shared.uFogFar,
        uColor: { value: new THREE.Color(o.color === undefined ? 0xffffff : o.color) },
        uMap:   { value: o.map || white() },
        uUseMap:{ value: o.map ? 1 : 0 },
        uSpec:  { value: new THREE.Color(o.spec === undefined ? 0x2a2a2a : o.spec) },
        uShine: { value: o.shine === undefined ? 18 : o.shine }
      }
    });
  }

  function setFog(color, near, far) {
    shared.uFogColor.value.set(color);
    shared.uFogNear.value = near;
    shared.uFogFar.value = far;
  }

  // ---------------------------------------------------------------- textures
  // Small textures get NearestFilter — arcade crunch. Large ones (the pitch)
  // get linear + mipmaps, which is what Model 3 actually did; nearest on a
  // 2048px plane viewed at a grazing angle just shimmers.
  function crisp(t) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    return t;
  }

  const tex = {
    pitch() {
      // Power-of-two on both axes: WebGL1 silently rescales NPOT textures that
      // need mipmaps, which would stretch the pitch markings.
      const W = 2048, H = 1024;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      const HL = 52, HW = 34;
      const px = W / (HL * 2), py = H / (HW * 2);
      const X = x => (x + HL) * px, Y = z => (z + HW) * py;

      for (let i = 0; i < 16; i++) {
        g.fillStyle = i % 2 ? '#3f9e39' : '#50b447';
        g.fillRect(i * W / 16, 0, W / 16 + 1, H);
      }
      g.globalAlpha = 0.07;
      for (let i = 0; i < 800; i++) {
        g.fillStyle = Math.random() < .5 ? '#2c7a2e' : '#7ade82';
        const s = rnd(6, 40);
        g.fillRect(Math.random() * W, Math.random() * H, s, s * 0.4);
      }
      g.globalAlpha = 1;

      g.strokeStyle = '#f4f7f4'; g.lineWidth = Math.max(3, px * 0.22);
      const line = (x1, z1, x2, z2) => { g.beginPath(); g.moveTo(X(x1), Y(z1)); g.lineTo(X(x2), Y(z2)); g.stroke(); };
      const rect = (x1, z1, x2, z2) => g.strokeRect(X(x1), Y(z1), (x2 - x1) * px, (z2 - z1) * py);

      rect(-HL + 0.3, -HW + 0.3, HL - 0.3, HW - 0.3);
      line(0, -HW + 0.3, 0, HW - 0.3);
      g.beginPath(); g.arc(X(0), Y(0), 9.15 * px, 0, 7); g.stroke();
      g.fillStyle = '#f4f7f4';
      g.beginPath(); g.arc(X(0), Y(0), 0.55 * px, 0, 7); g.fill();
      for (const s of [-1, 1]) {
        rect(s * HL - s * 16.5, -20.15, s * HL - s * 0.3, 20.15);
        rect(s * HL - s * 5.5, -9.16, s * HL - s * 0.3, 9.16);
        g.beginPath(); g.arc(X(s * (HL - 11)), Y(0), 0.55 * px, 0, 7); g.fill();
        g.beginPath();
        g.arc(X(s * (HL - 11)), Y(0), 9.15 * px,
          s > 0 ? Math.PI * 0.72 : -Math.PI * 0.28,
          s > 0 ? Math.PI * 1.28 : Math.PI * 0.28);
        g.stroke();
        for (const t of [-1, 1]) {
          g.beginPath(); g.arc(X(s * (HL - 0.3)), Y(t * (HW - 0.3)), 1 * px, 0, 7); g.stroke();
        }
      }
      const t = new THREE.CanvasTexture(c);
      t.anisotropy = 8;                       // pitch keeps bilinear + mips
      return t;
    },

    /** Shirt. The torso is a cylinder, so vertical bands in the texture
        wrap into real vertical stripes — PAOK, Olympiacos, OFI. */
    shirt(kit) {
      const S = 64;
      const c = document.createElement('canvas'); c.width = c.height = S;
      const g = c.getContext('2d');
      const hexs = n => '#' + n.toString(16).padStart(6, '0');
      g.fillStyle = hexs(kit.shirt); g.fillRect(0, 0, S, S);
      if (kit.stripe !== undefined && kit.stripe !== null) {
        g.fillStyle = hexs(kit.stripe);
        const bands = 6, w = S / (bands * 2);
        for (let i = 0; i < bands; i++) g.fillRect(i * w * 2, 0, w, S);
      }
      // collar + shoulder yoke
      g.fillStyle = hexs(kit.trim !== undefined ? kit.trim : kit.shorts);
      g.fillRect(0, 0, S, 5);
      if (kit.number) {
        g.font = 'bold 26px "Arial Narrow", Arial, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 4;
        g.strokeStyle = 'rgba(0,0,0,0.55)';
        g.strokeText(kit.number, S / 2, S * 0.34);
        g.fillStyle = hexs(kit.numberInk !== undefined ? kit.numberInk : 0xffffff);
        g.fillText(kit.number, S / 2, S * 0.34);
      }
      // shading band at the hem, sells the cylinder
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, S - 6, S, 6);
      return crisp(new THREE.CanvasTexture(c));
    },

    ball() {
      const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
      const g = c.getContext('2d');
      g.fillStyle = '#f6f6f2'; g.fillRect(0, 0, S, S);
      g.fillStyle = '#17191d';
      const spots = [[.2, .32], [.5, .2], [.8, .34], [.34, .6], [.66, .62], [.12, .82], [.5, .86], [.88, .8]];
      for (const [u, v] of spots) {
        const cx = u * S, cy = v * S, r = S * 0.09;
        g.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
          const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
          i ? g.lineTo(px, py) : g.moveTo(px, py);
        }
        g.closePath(); g.fill();
      }
      return crisp(new THREE.CanvasTexture(c));
    },

    /** Pitchside hoardings. Invented Greek sponsors — no real brands. */
    boards() {
      const W = 1024, H = 96;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      const ads = [
        ['#e8352e', '#ffffff', 'ΟΥΖΟ ΘΕΡΜΗΣ'], ['#ffffff', '#1a52a8', 'ΦΕΤΑ ΟΛΥΜΠΟΥ'],
        ['#123a8c', '#ffd23d', 'ΚΑΦΕΣ ΜΟΚΑ'],  ['#f4c20d', '#1b1b1b', 'ΓΥΡΟΣ ΠΙΤΑ'],
        ['#0d8a46', '#ffffff', 'ΜΕΛΙ ΠΙΝΔΟΥ'], ['#ffffff', '#d2232a', 'ΤΥΡΟΠΙΤΑ ΑΙΓΑΙΟ'],
        ['#1b1b1b', '#f2f2f2', 'ΛΑΔΙ ΚΑΛΑΜΑΤΑΣ'], ['#7b2fa0', '#ffffff', 'ΠΟΡΤΟΚΑΛΑΔΑ']
      ];
      const w = W / ads.length;
      ads.forEach(([bg, ink, txt], i) => {
        g.fillStyle = bg; g.fillRect(i * w, 0, w, H);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(i * w, H - 10, w, 10);
        g.fillStyle = ink;
        g.font = 'bold 30px "Arial Narrow", Arial, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(txt, i * w + w / 2, H / 2);
      });
      const t = crisp(new THREE.CanvasTexture(c));
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    },

    /** A head. SphereGeometry puts u=0.25 dead on +Z, so the face goes there. */
    face(tone, i) {
      const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
      const g = c.getContext('2d');
      const hexs = n => '#' + n.toString(16).padStart(6, '0');
      g.fillStyle = hexs(tone); g.fillRect(0, 0, S, S);
      // a little shading so the head is not a flat blob
      g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(0, S * 0.72, S, S * 0.28);
      const cx = S * 0.25, cy = S * 0.46;
      g.fillStyle = '#20150f';
      g.fillRect(cx - 7, cy - 2, 4, 3);            // eyes
      g.fillRect(cx + 3, cy - 2, 4, 3);
      g.fillRect(cx - 8, cy - 6, 5, 2);            // brows
      g.fillRect(cx + 3, cy - 6, 5, 2);
      g.fillStyle = 'rgba(70,30,25,0.75)';
      g.fillRect(cx - 4, cy + 7, 8, 2);            // mouth
      if (i % 3 === 0) { g.fillStyle = 'rgba(40,25,18,0.5)'; g.fillRect(cx - 6, cy + 3, 12, 3); }
      return crisp(new THREE.CanvasTexture(c));
    },

    crowd() {
      const W = 512, H = 128;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      g.fillStyle = '#2a3340'; g.fillRect(0, 0, W, H);
      const pal = ['#d8d8d8', '#c0392b', '#2c3e50', '#f1c40f', '#ecf0f1', '#8e44ad', '#16a085', '#e67e22'];
      for (let y = 4; y < H; y += 7) {
        for (let x = 2; x < W; x += 6) {
          if (Math.random() < 0.13) continue;
          g.fillStyle = pal[(Math.random() * pal.length) | 0];
          g.globalAlpha = rnd(0.45, 1);
          g.fillRect(x + rnd(-1, 1), y + rnd(-1, 1), 4, 5);
        }
      }
      g.globalAlpha = 1;
      // flags and banners you can pick out while you play
      for (let i = 0; i < 26; i++) {
        const x = Math.random() * W, y = rnd(6, H - 26), w = rnd(22, 40), h = w * 0.62;
        const kind = Math.random();
        if (kind < 0.45) {                       // Greek flag
          g.fillStyle = '#0d5eaf'; g.fillRect(x, y, w, h);
          g.fillStyle = '#ffffff';
          for (let k = 1; k < 9; k += 2) g.fillRect(x, y + k * h / 9, w, h / 9);
          g.fillStyle = '#0d5eaf'; g.fillRect(x, y, w * 0.42, h * 0.56);
          g.fillStyle = '#ffffff';
          g.fillRect(x + w * 0.16, y, w * 0.10, h * 0.56);
          g.fillRect(x, y + h * 0.22, w * 0.42, h * 0.11);
        } else {                                  // plain club banner
          const pal2 = ['#f2c700', '#d2232a', '#0c8b3f', '#141414', '#3fb8e8', '#ffffff'];
          g.fillStyle = pal2[(Math.random() * pal2.length) | 0];
          g.fillRect(x, y, w, h);
          g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y + h - 3, w, 3);
        }
      }
      const t = crisp(new THREE.CanvasTexture(c));
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    }
  };

  // ---------------------------------------------------------------- geometry
  // Every player shares one set of geometries and most of one set of materials.
  // Building them per player was 350+ buffers and 130+ materials on the GPU,
  // which is what made the frame rate stutter.
  const P = {
    hipY: 1.02, thigh: 0.50, shin: 0.46,
    torso: 0.66, neck: 0.10, headR: 0.17,
    upper: 0.40, fore: 0.36
  };

  const GEO = {};
  function cyl(rTop, rBot, len, sides) {
    const k = 'c' + rTop + '_' + rBot + '_' + len + '_' + (sides || 8);
    if (!GEO[k]) {
      const g = new THREE.CylinderGeometry(rTop, rBot, len, sides || 8, 1, false);
      g.translate(0, -len / 2, 0);
      GEO[k] = g;
    }
    return GEO[k];
  }
  function sph(r, w, h) {
    const k = 's' + r + '_' + (w || 10) + '_' + (h || 7);
    if (!GEO[k]) GEO[k] = new THREE.SphereGeometry(r, w || 10, h || 7);
    return GEO[k];
  }
  /** Weld same-material parts into one buffer so each is not its own draw call. */
  function merged(key, parts) {
    if (GEO[key]) return GEO[key];
    const pos = [], nor = [], uvs = [];
    const m = new THREE.Matrix4();
    for (const pt of parts) {
      const g = pt.geo.clone();
      m.identity();
      m.compose(
        new THREE.Vector3(pt.pos ? pt.pos[0] : 0, pt.pos ? pt.pos[1] : 0, pt.pos ? pt.pos[2] : 0),
        new THREE.Quaternion(),
        new THREE.Vector3(pt.scale ? pt.scale[0] : 1, pt.scale ? pt.scale[1] : 1, pt.scale ? pt.scale[2] : 1));
      g.applyMatrix4(m);
      const gi = g.index ? g.toNonIndexed() : g;
      const a = gi.attributes.position.array, b = gi.attributes.normal.array, c = gi.attributes.uv.array;
      for (let i = 0; i < a.length; i++) pos.push(a[i]);
      for (let i = 0; i < b.length; i++) nor.push(b[i]);
      for (let i = 0; i < c.length; i++) uvs.push(c[i]);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    GEO[key] = out;
    return out;
  }

  function box(x, y, z) {
    const k = 'b' + x + '_' + y + '_' + z;
    if (!GEO[k]) GEO[k] = new THREE.BoxGeometry(x, y, z);
    return GEO[k];
  }

  // four skin tones and four hair colours, shared across every player
  const TONES = [0xf0c9a0, 0xdca877, 0xc08a56, 0x8d5a33];
  const HAIRS = [0x201410, 0x3d2a18, 0x6b4a2a, 0x141414];
  const SKIN = [], HEAD = [], HAIR = [];
  function palettes() {
    if (SKIN.length) return;
    TONES.forEach((t, i) => {
      SKIN.push(mat({ color: t, shine: 13, spec: 0x322a24 }));
      HEAD.push(mat({ color: 0xffffff, map: tex.face(t, i), shine: 13, spec: 0x322a24 }));
    });
    HAIRS.forEach(h => HAIR.push(mat({ color: h, shine: 28, spec: 0x3a3028 })));
  }

  const KITMAT = {};
  function kitMats(kit, isGK) {
    const key = kit.ab + (isGK ? '_gk' : '');
    if (KITMAT[key]) return KITMAT[key];
    const col = isGK
      ? { shorts: kit.gk, sock: kit.gk }
      : { shorts: kit.shorts, sock: kit.sock };
    KITMAT[key] = {
      shorts: mat({ color: col.shorts, shine: 24, spec: 0x363636 }),
      sock:   mat({ color: col.sock,   shine: 20, spec: 0x2e2e2e }),
      boot:   mat({ color: 0x141619,   shine: 54, spec: 0x808080 }),
      sole:   mat({ color: 0xe8e8e8,   shine: 40, spec: 0x707070 })
    };
    return KITMAT[key];
  }

  function limb(geo, mtl) { return new THREE.Mesh(geo, mtl); }

  /**
   * Segmented rigid-body player: no vertex skinning, every joint is a transform
   * node with a solid hung beneath it. Tapered limbs and a sphere at each joint
   * are what keep it from reading as a stack of bricks.
   */
  function buildPlayer(kit, isGK, variant) {
    palettes();
    const v = (variant || 0);
    const skin = SKIN[v % SKIN.length];
    const head1 = HEAD[v % HEAD.length];
    const hairM = HAIR[(v * 3 + 1) % HAIR.length];
    const bald = (v % 7) === 5;
    const km = kitMats(kit, isGK);
    const shirtM = mat({
      color: 0xffffff,
      map: tex.shirt(isGK
        ? { shirt: kit.gk, shorts: kit.gk, stripe: null, trim: 0x101010, number: kit.number, numberInk: kit.numberInk }
        : kit),
      shine: 26, spec: 0x3a3a3a
    });

    const root = new THREE.Group();
    const hips = new THREE.Group();
    hips.position.y = P.hipY;
    root.add(hips);

    const pelvis = limb(cyl(0.205, 0.19, 0.34), km.shorts);
    pelvis.position.y = 0.06; pelvis.scale.set(1.4, 1, 0.95);
    hips.add(pelvis);

    const torso = new THREE.Group();
    hips.add(torso);
    const chest = limb(cyl(0.215, 0.185, P.torso), shirtM);
    chest.position.y = P.torso; chest.scale.set(1.45, 1, 0.82);
    torso.add(chest);

    const neck = new THREE.Group();
    neck.position.y = P.torso;
    torso.add(neck);
    const head = new THREE.Mesh(sph(P.headR, 12, 9), head1);
    head.position.y = P.neck + P.headR * 0.85;
    head.scale.set(0.92, 1.08, 0.98);
    neck.add(head);
    if (!bald) {
      const hair = new THREE.Mesh(sph(P.headR * 1.03, 10, 7), hairM);
      hair.position.y = P.neck + P.headR * 1.12;
      hair.scale.set(1, 0.72, 1);
      neck.add(hair);
    }

    function arm(sx) {
      const sh = new THREE.Group();
      sh.position.set(sx * 0.30, P.torso - 0.06, 0);
      torso.add(sh);
      sh.add(new THREE.Mesh(sph(0.098), shirtM));         // deltoid
      sh.add(limb(cyl(0.090, 0.068, P.upper), skin));     // bicep taper
      const el = new THREE.Group();
      el.position.y = -P.upper;
      sh.add(el);
      el.add(new THREE.Mesh(merged('forearm', [
        { geo: sph(0.066) },
        { geo: cyl(0.070, 0.050, P.fore) },
        { geo: sph(0.058), pos: [0, -P.fore, 0], scale: [1, 1.15, 0.8] }
      ]), skin));
      return { sh, el };
    }
    const aL = arm(-1), aR = arm(1);

    function legOf(sx) {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.115, 0, 0);
      hips.add(hip);
      hip.add(limb(cyl(0.160, 0.112, P.thigh), skin));    // quad tapering to knee
      const kn = new THREE.Group();
      kn.position.y = -P.thigh;
      hip.add(kn);
      kn.add(new THREE.Mesh(sph(0.112), skin));           // knee
      kn.add(new THREE.Mesh(merged('calf', [
        { geo: cyl(0.113, 0.056, P.shin) },
        { geo: sph(0.098), pos: [0, -0.15, -0.035], scale: [0.95, 1.25, 0.9] }   // calf muscle
      ]), km.sock));
      const ank = new THREE.Group();
      ank.position.y = -P.shin;
      kn.add(ank);
      ank.add(new THREE.Mesh(merged('boot', [
        { geo: box(0.135, 0.085, 0.33), pos: [0, -0.035, 0.075] },
        { geo: box(0.145, 0.026, 0.345), pos: [0, -0.083, 0.075] }               // sole
      ]), km.boot));
      return { hip, kn, ank };
    }
    const lL = legOf(-1), lR = legOf(1);

    root.userData.rig = {
      hips, torso, neck, chest,
      shL: aL.sh, elL: aL.el, shR: aR.sh, elR: aR.el,
      hipL: lL.hip, knL: lL.kn, ankL: lL.ank,
      hipR: lR.hip, knR: lR.kn, ankR: lR.ank,
      baseHipY: P.hipY
    };
    return root;
  }

  // ---------------------------------------------------------------- animation
  // Model 3 characters were keyframed rigid hierarchies, not skinned. The one
  // detail that stops a runner looking like a puppet: knees flex ONE way.
  // Convention: forward is +Z. A limb hanging down swings forward on NEGATIVE
  // rotation.x; a limb pointing up leans forward on POSITIVE rotation.x.
  function pose(rig, s) {
    const run = clamp(s.run, 0, 1);
    const ph = s.phase;
    const sn = Math.sin(ph), sn2 = Math.sin(ph + Math.PI);

    if (s.slide > 0) {
      rig.hipL.rotation.x = -0.9; rig.knL.rotation.x = 0.15;
      rig.hipR.rotation.x = 0.25; rig.knR.rotation.x = 1.5;
      rig.shL.rotation.x = 0.7;   rig.shR.rotation.x = 0.5;
      rig.elL.rotation.x = 0.4;   rig.elR.rotation.x = 0.4;
      rig.torso.rotation.x = 0.25;
      rig.hips.position.y = rig.baseHipY * 0.55;
      return;
    }

    // legs: thigh swings, knee flexes only backward and peaks in mid-swing
    const swing = 0.92 * run + 0.04;
    rig.hipL.rotation.x = -sn * swing;
    rig.hipR.rotation.x = -sn2 * swing;
    const flex = p => (0.5 - 0.5 * Math.cos(p + 0.7)) * (1.55 * run) + 0.10;
    rig.knL.rotation.x = flex(ph);
    rig.knR.rotation.x = flex(ph + Math.PI);
    rig.ankL.rotation.x = -0.15 + Math.sin(ph + 1.5) * 0.28 * run;
    rig.ankR.rotation.x = -0.15 + Math.sin(ph + 1.5 + Math.PI) * 0.28 * run;

    // arms counter-swing, elbows stay bent
    const asw = 0.62 * run;
    rig.shL.rotation.x = sn * asw;
    rig.shR.rotation.x = sn2 * asw;
    rig.shL.rotation.z = 0.13;
    rig.shR.rotation.z = -0.13;
    const bend = 0.55 + 0.45 * run;
    rig.elL.rotation.x = -bend - Math.max(0, sn) * 0.35 * run;
    rig.elR.rotation.x = -bend - Math.max(0, sn2) * 0.35 * run;

    // torso leans into the run, shoulders counter-rotate against the hips
    rig.torso.rotation.x = 0.07 + 0.20 * run;
    rig.torso.rotation.y = -sn * 0.16 * run;
    rig.hips.rotation.y = sn * 0.10 * run;
    rig.hips.position.y = rig.baseHipY - Math.abs(Math.sin(ph)) * 0.035 * run;
    rig.neck.rotation.x = -0.05 - 0.10 * run;

    // kick: 0 -> 1 over the strike, right leg drives through
    if (s.kick > 0) {
      const k = s.kick;                       // 1 at contact, decaying to 0
      const drive = Math.sin(k * Math.PI);
      rig.hipR.rotation.x = -1.25 * drive - 0.2;
      rig.knR.rotation.x = (1 - drive) * 1.2;
      rig.shL.rotation.x = 0.9 * drive;
      rig.torso.rotation.x = 0.07 + 0.3 * drive;
      rig.hips.rotation.y = -0.3 * drive;
    }

    // arms up, wheeling away
    if (s.celebrate) {
      rig.shL.rotation.x = -2.35; rig.shR.rotation.x = -2.35;
      rig.shL.rotation.z = 0.55;  rig.shR.rotation.z = -0.55;
      rig.elL.rotation.x = -0.25; rig.elR.rotation.x = -0.25;
      rig.torso.rotation.x = -0.14;
      rig.neck.rotation.x = -0.28;
    } else if (s.dejected) {
      rig.shL.rotation.x = 0.35 + sn * 0.12;  rig.shR.rotation.x = 0.35 + sn2 * 0.12;
      rig.elL.rotation.x = -0.5;  rig.elR.rotation.x = -0.5;
      rig.torso.rotation.x = 0.30;
      rig.neck.rotation.x = 0.42;              // head down
    }

    // keeper dive: whole body rolls sideways
    if (s.dive) {
      rig.torso.rotation.z = s.dive * 0.9;
      rig.shL.rotation.x = -1.9; rig.shR.rotation.x = -1.9;
      rig.elL.rotation.x = -0.2; rig.elR.rotation.x = -0.2;
    } else {
      rig.torso.rotation.z = 0;
    }
  }

  // ---------------------------------------------------------------- resolution
  // The single biggest authenticity lever. Model 3 ran 496x384 at 57.5Hz onto
  // a CRT. Render into a buffer that size and let the browser blow it up with
  // nearest-neighbour: every other trick rides on this one.
  const NATIVE_H = 384;
  function applyResolution(renderer, camera, canvas, arcade) {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    if (arcade) {
      const H = NATIVE_H, W = Math.round(H * (w / h));
      renderer.setPixelRatio(1);
      renderer.setSize(W, H, false);
      canvas.style.imageRendering = 'pixelated';
    } else {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      canvas.style.imageRendering = 'auto';
    }
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return { mat, setFog, tex, buildPlayer, pose, applyResolution, shared, crisp, P };
})();
