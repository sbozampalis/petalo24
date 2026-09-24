/* ============================================================
   ΕΛΛΗΝΙΚΟ ΣΤΡΙΚΕΡ — arcade football engine (Virtua Striker 2 feel)
   Single-file three.js game. No external assets.
   ============================================================ */
(function () {
  'use strict';

  // ---------------------------------------------------------- config
  const HALF_L = 52, HALF_W = 34;          // pitch half length / half width
  const GOAL_W = 3.66, GOAL_H = 2.44;      // half-width of goal mouth, crossbar height
  const BALL_R = 0.36;
  const GRAVITY = -26;
  const HALF_SECONDS = 150;                // real seconds per half
  const RUN = 15.2, SPRINT = 15.2;         // one speed: no sprint button
  const ACCEL = 13, TURN_SLOW = 15.5, TURN_FAST = 8.4;   // pivot when walking, arc when sprinting

  const DEFAULT_TEAMS = [
    { ab:'ΑΕΚ',  name:'ΑΕΚ',            city:'ΑΘΗΝΑ',     shirt:0xf2c700, shorts:0x121212, sock:0xf2c700, gk:0x21b36a, rate:5 },
    { ab:'ΟΣΦΠ', name:'ΟΛΥΜΠΙΑΚΟΣ',     city:'ΠΕΙΡΑΙΑΣ',  shirt:0xd2232a, shorts:0xffffff, sock:0xd2232a, gk:0x2b2b2b, stripe:0xf2f2f2, rate:5 },
    { ab:'ΠΑΟ',  name:'ΠΑΝΑΘΗΝΑΪΚΟΣ',   city:'ΑΘΗΝΑ',     shirt:0x0c8b3f, shorts:0xffffff, sock:0x0c8b3f, gk:0xe0631a, rate:4 },
    { ab:'ΠΑΟΚ', name:'ΠΑΟΚ',           city:'ΘΕΣΣΑΛΟΝΙΚΗ',shirt:0x141414, shorts:0xffffff, sock:0x141414, gk:0xc8d400, stripe:0xf2f2f2, rate:5 },
    { ab:'ΑΡΗΣ', name:'ΑΡΗΣ',           city:'ΘΕΣΣΑΛΟΝΙΚΗ',shirt:0xf6d600, shorts:0x141414, sock:0xf6d600, gk:0x1a7fc4, rate:4 },
    { ab:'ΗΡΑ',  name:'ΗΡΑΚΛΗΣ',        city:'ΘΕΣΣΑΛΟΝΙΚΗ',shirt:0x3fb8e8, shorts:0xffffff, sock:0x3fb8e8, gk:0xd94040, stripe:0xf2f2f2, rate:3 },
    { ab:'ΟΦΗ',  name:'ΟΦΗ',            city:'ΗΡΑΚΛΕΙΟ',  shirt:0x1b1b1b, shorts:0xffffff, sock:0x1b1b1b, gk:0x00a37a, stripe:0xf2f2f2, rate:3 },
    { ab:'ΑΤΡ',  name:'ΑΤΡΟΜΗΤΟΣ',      city:'ΠΕΡΙΣΤΕΡΙ', shirt:0x1a4fa0, shorts:0xffffff, sock:0x1a4fa0, gk:0xf0a500, rate:3 },
    { ab:'ΑΣΤ',  name:'ΑΣΤΕΡΑΣ',        city:'ΤΡΙΠΟΛΗ',   shirt:0xf3c700, shorts:0x123a8c, sock:0xf3c700, gk:0xbb2f2f, rate:3 },
    { ab:'ΒΟΛ',  name:'ΒΟΛΟΣ',          city:'ΒΟΛΟΣ',     shirt:0x18378f, shorts:0x18378f, sock:0xd42a2a, gk:0x27b36a, rate:3 },
    { ab:'ΠΑΝ',  name:'ΠΑΝΑΙΤΩΛΙΚΟΣ',   city:'ΑΓΡΙΝΙΟ',   shirt:0x0f7d3e, shorts:0x0f7d3e, sock:0xffffff, gk:0xe8b500, rate:3 },
    { ab:'ΛΕΒ',  name:'ΛΕΒΑΔΕΙΑΚΟΣ',    city:'ΛΙΒΑΔΕΙΑ',  shirt:0x17a04e, shorts:0xffffff, sock:0x17a04e, gk:0x2b2b2b, rate:2 },
    { ab:'ΚΑΛ',  name:'ΚΑΛΑΜΑΤΑ',       city:'ΚΑΛΑΜΑΤΑ',  shirt:0x1b1b1b, shorts:0x1b1b1b, sock:0xffffff, gk:0xf25c05, rate:2 },
    { ab:'ΚΗΦ',  name:'ΚΗΦΙΣΙΑ',        city:'ΑΘΗΝΑ',     shirt:0x2166c4, shorts:0xffffff, sock:0x2166c4, gk:0xc6d60c, rate:2 }
  ];

  // A host page can supply its own roster and commerce hooks via window.BRAND.
  const BRAND = window.BRAND || {};
  const TEAMS = (BRAND.teams && BRAND.teams.length >= 4) ? BRAND.teams : DEFAULT_TEAMS;
  const hook = (name, a, b) => { try { if (BRAND[name]) BRAND[name](a, b); } catch (e) {} };

  // 4-4-2, normalised: x −1 = own goal line, +1 = opponent goal line
  const FORMATION = [
    [-0.97, 0.00],                                           // GK
    [-0.66,-0.56], [-0.72,-0.19], [-0.72, 0.19], [-0.66, 0.56], // DF
    [-0.22,-0.62], [-0.30,-0.18], [-0.30, 0.18], [-0.22, 0.62], // MF
    [ 0.18,-0.26], [ 0.18, 0.26]                              // FW
  ];

  // ---------------------------------------------------------- helpers
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const $ = id => document.getElementById(id);
  const hex = c => '#' + c.toString(16).padStart(6, '0');

  // ---------------------------------------------------------- audio
  const Audio = (() => {
    let ctx = null, crowdGain = null, target = 0.05;
    function boot() {
      if (ctx) return;
      try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      if (ctx.state === 'suspended') ctx.resume();
      // crowd = filtered noise
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = (last + (Math.random() * 2 - 1) * 0.15) * 0.97; d[i] = last; }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 620; bp.Q.value = 0.6;
      crowdGain = ctx.createGain(); crowdGain.gain.value = 0.05;
      src.connect(bp); bp.connect(crowdGain); crowdGain.connect(ctx.destination);
      src.start();
      } catch (e) { ctx = null; }
    }
    function tone(f0, f1, dur, type, vol) {
      if (!ctx) return;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), ctx.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur);
    }
    function noise(dur, freq, vol) {
      if (!ctx) return;
      const len = Math.floor(ctx.sampleRate * dur);
      const b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = ctx.createBufferSource(); s.buffer = b;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
      const g = ctx.createGain(); g.gain.value = vol;
      s.connect(f); f.connect(g); g.connect(ctx.destination); s.start();
    }
    return {
      boot,
      kick(p) { noise(0.09, 1400, 0.25 * p); tone(190, 60, 0.11, 'sine', 0.3 * p); },
      whistle() { tone(2100, 2400, 0.16, 'square', 0.09); setTimeout(() => tone(2300, 1900, 0.2, 'square', 0.08), 150); },
      post() { tone(900, 300, 0.22, 'triangle', 0.25); },
      excite(v) { if (!ctx || !crowdGain || Math.abs(v - target) < 0.001) return; target = v; crowdGain.gain.setTargetAtTime(v, ctx.currentTime, 0.4); },
      cheer() { if (!ctx || !crowdGain) return; crowdGain.gain.setTargetAtTime(0.42, ctx.currentTime, 0.05); setTimeout(() => { if (ctx) crowdGain.gain.setTargetAtTime(target, ctx.currentTime, 2.5); }, 2600); }
    };
  })();

  // ---------------------------------------------------------- three basics
  const canvas = $('c');
  // No MSAA: Model 3 had none, and at 384p it would only smear the pixels.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  const scene = new THREE.Scene();
  const SKY = 0xa8c8dd;
  scene.background = new THREE.Color(SKY);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.4, 700);
  Look.setFog(SKY, 210, 430);

  // Lighting lives entirely in the Gouraud shader — no three.js light objects.
  const MAT = c => Look.mat({ color: c, shine: 12, spec: 0x242424 });

  // pitch
  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF_L * 2, HALF_W * 2),
    Look.mat({ map: Look.tex.pitch(), shine: 5, spec: 0x14180f })
  );
  pitch.rotation.x = -Math.PI / 2;
  scene.add(pitch);

  // surrounding turf apron
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(HALF_L * 2 + 26, HALF_W * 2 + 26), MAT(0x3f9440));
  apron.rotation.x = -Math.PI / 2; apron.position.y = -0.02;
  scene.add(apron);

  // running track / surround
  const surround = new THREE.Mesh(new THREE.PlaneGeometry(HALF_L * 2 + 46, HALF_W * 2 + 46), MAT(0x9a5d3a));
  surround.rotation.x = -Math.PI / 2; surround.position.y = -0.06;
  scene.add(surround);

  // goals
  function buildGoal(side) {
    const g = new THREE.Group();
    const x = side * (HALF_L + 0.12);
    const white = Look.mat({ color: 0xf2f4f7, shine: 44, spec: 0x8a8a8a });
    const postGeo = new THREE.CylinderGeometry(0.1, 0.1, GOAL_H, 8);
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(postGeo, white);
      p.position.set(x, GOAL_H / 2, s * GOAL_W);
      g.add(p);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, GOAL_W * 2, 8), white);
    bar.rotation.x = Math.PI / 2; bar.position.set(x, GOAL_H, 0);
    g.add(bar);
    // net: back + sides + roof, wireframe-ish
    const netMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.32 });
    const depth = 2.2;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W * 2, GOAL_H, 14, 7), netMat);
    back.position.set(x + side * depth, GOAL_H / 2, 0); back.rotation.y = Math.PI / 2;
    g.add(back);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(depth, GOAL_W * 2, 4, 14), netMat);
    roof.rotation.x = Math.PI / 2; roof.rotation.z = Math.PI / 2;
    roof.position.set(x + side * depth / 2, GOAL_H, 0);
    g.add(roof);
    for (const s of [-1, 1]) {
      const sd = new THREE.Mesh(new THREE.PlaneGeometry(depth, GOAL_H, 4, 7), netMat);
      sd.position.set(x + side * depth / 2, GOAL_H / 2, s * GOAL_W);
      g.add(sd);
    }
    return g;
  }
  scene.add(buildGoal(1), buildGoal(-1));

  // advertising hoardings ringing the pitch
  (function hoardings() {
    const t = Look.tex.boards();
    const mk = (w, reps) => {
      const tt = t.clone(); tt.needsUpdate = true; tt.repeat.set(reps, 1);
      return Look.mat({ map: tt, shine: 26, spec: 0x3a3a3a });
    };
    const D = 6.5, H = 1.5;
    const long = HALF_L * 2 + 12, short = HALF_W * 2 + 8;
    const specs = [
      [long, 0, HALF_W + D, 0, 8],
      [long, 0, -(HALF_W + D), Math.PI, 8],
      [short, HALF_L + D, 0, -Math.PI / 2, 4],
      [short, -(HALF_L + D), 0, Math.PI / 2, 4]
    ];
    for (const [w, x, z, ry, reps] of specs) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), mk(w, reps));
      m.position.set(x, H / 2, z); m.rotation.y = ry;
      scene.add(m);
    }
  })();

  // stands
  (function stands() {
    const tex = Look.tex.crowd();
    const mk = (w, h, rep) => {
      const t = tex.clone(); t.needsUpdate = true; t.repeat.set(rep, 1);
      return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
    };
    const D = 16, HGT = 17;
    const sides = [
      { w: HALF_L * 2 + 40, rot: [0, 0, 0], pos: [0, HGT / 2, -(HALF_W + D)], rep: 22 },
      { w: HALF_L * 2 + 40, rot: [0, Math.PI, 0], pos: [0, HGT / 2, HALF_W + D], rep: 22 },
      { w: HALF_W * 2 + 30, rot: [0, Math.PI / 2, 0], pos: [-(HALF_L + D), HGT / 2, 0], rep: 16 },
      { w: HALF_W * 2 + 30, rot: [0, -Math.PI / 2, 0], pos: [HALF_L + D, HGT / 2, 0], rep: 16 }
    ];
    for (const s of sides) {
      const m = mk(s.w, HGT, s.rep);
      m.rotation.set(s.rot[0], s.rot[1], s.rot[2]);
      m.position.set(s.pos[0], s.pos[1], s.pos[2]);
      m.rotateX(0.26);
      scene.add(m);
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(s.w, 4), MAT(0x1a2230));
      wall.rotation.set(s.rot[0], s.rot[1], s.rot[2]);
      wall.position.set(s.pos[0] * 0.86, 2, s.pos[2] * 0.86);
      scene.add(wall);
    }
    // floodlight pylons
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 34, 1), MAT(0x333a45));
      m.position.set(sx * (HALF_L + 22), 17, sz * (HALF_W + 20));
      scene.add(m);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 1), new THREE.MeshBasicMaterial({ color: 0xfff6d0 }));
      lamp.position.set(sx * (HALF_L + 22), 33, sz * (HALF_W + 20));
      scene.add(lamp);
    }
  })();

  // ball
  const ball = {
    mesh: new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 14, 10),
      Look.mat({ map: Look.tex.ball(), shine: 46, spec: 0x9a9a9a })),
    p: new THREE.Vector3(0, BALL_R, 0),
    v: new THREE.Vector3(),
    spin: new THREE.Vector3(),
    owner: null,
    lastTouch: null,
    lastTouchTeam: 0
  };
  scene.add(ball.mesh);

  // blob shadows
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false });
  function blob(r) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 14), shadowMat);
    m.rotation.x = -Math.PI / 2; m.position.y = 0.03;
    scene.add(m); return m;
  }
  const ballShadow = blob(BALL_R * 1.1);

  // the sweeping white arc a struck ball leaves behind
  const TRAIL_N = 20;
  const trailPos = new Float32Array(TRAIL_N * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trail = new THREE.Line(trailGeo,
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
  trail.frustumCulled = false;
  scene.add(trail);
  function pushTrail(show) {
    if (!show) {
      for (let i = 0; i < TRAIL_N; i++) {
        trailPos[i * 3] = ball.p.x; trailPos[i * 3 + 1] = ball.p.y; trailPos[i * 3 + 2] = ball.p.z;
      }
    } else {
      trailPos.copyWithin(0, 3);
      trailPos[(TRAIL_N - 1) * 3] = ball.p.x;
      trailPos[(TRAIL_N - 1) * 3 + 1] = ball.p.y;
      trailPos[(TRAIL_N - 1) * 3 + 2] = ball.p.z;
    }
    trail.visible = show;
    trailGeo.attributes.position.needsUpdate = true;
  }

  // the 1P arrow that hangs over whoever you are controlling
  const marker = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 0.85, 4),
    new THREE.MeshBasicMaterial({ color: 0xff2f21 }));
  marker.rotation.x = Math.PI;
  scene.add(marker);

  // ---------------------------------------------------------- selection ring for the controlled player
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.95, 20),
    new THREE.MeshBasicMaterial({ color: 0xffd33d, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
  scene.add(ring);

  // The man in black. He has no say in the physics — he just has to be where
  // a referee would be, so a foul feels officiated rather than automatic.
  const REF_KIT = { ab: '_ref', shirt: 0x15171c, shorts: 0x15171c, sock: 0x15171c,
                    gk: 0x15171c, stripe: null, trim: 0xf2c700, rate: 3 };
  const ref = {
    mesh: null, rig: null, shadow: null,
    p: new THREE.Vector3(0, 0, 12), v: new THREE.Vector3(),
    face: new THREE.Vector3(1, 0, 0), gait: 0
  };
  function buildRef() {
    if (ref.mesh) return;
    ref.mesh = Look.buildPlayer(REF_KIT, false, 2);
    ref.rig = ref.mesh.userData.rig;
    scene.add(ref.mesh);
    ref.shadow = blob(0.6);
  }
  function updateRef(dt) {
    if (!ref.mesh) return;
    // trails the play at an angle, the way a referee runs a diagonal
    const tx = clamp(ball.p.x - 7, -(HALF_L - 4), HALF_L - 4);
    const tz = clamp(ball.p.z + 11, -(HALF_W - 3), HALF_W - 3);
    const dx = tx - ref.p.x, dz = tz - ref.p.z;
    const d = Math.hypot(dx, dz);
    const want = d > 1.2 ? Math.min(11, d * 2.2) : 0;
    const k = clamp(dt * 5, 0, 1);
    ref.v.x = lerp(ref.v.x, d ? dx / d * want : 0, k);
    ref.v.z = lerp(ref.v.z, d ? dz / d * want : 0, k);
    ref.p.x += ref.v.x * dt; ref.p.z += ref.v.z * dt;
    const sp = Math.hypot(ref.v.x, ref.v.z);
    if (sp > 0.5) ref.face.set(ref.v.x / sp, 0, ref.v.z / sp);
    ref.gait += sp * dt * 2.35;
    ref.mesh.position.set(ref.p.x, 0, ref.p.z);
    ref.mesh.rotation.y = Math.atan2(ref.face.x, ref.face.z);
    ref.shadow.position.set(ref.p.x, 0.03, ref.p.z);
    Look.pose(ref.rig, { phase: ref.gait, run: clamp(sp / RUN, 0, 1.1), slide: 0, kick: 0, dive: 0 });
  }

  // ---------------------------------------------------------- game state
  const G = {
    state: 'menu',     // menu | kickoff | play | goal | restart | halftime | fulltime
    t: 0,
    half: 1,
    clock: 0,
    score: [0, 0],
    players: [],
    human: 0,          // team index the player controls (0 or 1)
    controlled: null,
    teamInfo: [null, null],
    dir: [1, -1],      // attacking direction on X for team 0 / team 1
    freeze: 0,
    stateTimer: 0,
    restartTeam: 0,
    kickoffTeam: 0,
    switchCool: 0,
    cards: [0, 0],
    scorer: null,
    charging: false,
    charge: 0,
    camZ: 0, camDist: 14.5, camH: 4.9
  };

  class Player {
    constructor(team, idx, kit) {
      this.team = team; this.idx = idx;
      this.isGK = idx === 0;
      const lum = ((kit.shirt >> 16 & 255) * 0.3 + (kit.shirt >> 8 & 255) * 0.59 + (kit.shirt & 255) * 0.11);
      kit = Object.assign({}, kit);
      this.mesh = Look.buildPlayer(Object.assign({}, kit, {
        number: this.isGK ? 1 : idx + 1,
        numberInk: lum > 140 ? 0x161616 : 0xffffff
      }), this.isGK, team * 5 + idx);
      this.rig = this.mesh.userData.rig;
      scene.add(this.mesh);
      this.shadow = blob(0.62);
      this.p = new THREE.Vector3();
      this.v = new THREE.Vector3();
      this.face = new THREE.Vector3(G.dir[team], 0, 0);
      this.gait = 0;
      this.cool = 0;
      this.slide = 0;
      this.dive = 0;
      this.hold = 0;
      this.stun = 0;
      this.kick = 0;
      this.st = 'IDLE'; this.stT = 0; this.act = null; this.charge = 0; this.aiHold = 0;
      // club strength: a rate-5 side is quicker to the ball and finishes better
      this.skill = 0.92 + (kit.rate - 1) * 0.045;
    }
    locked() {
      return this.st === 'WINDUP' || this.st === 'RECOVER' || this.st === 'SLIDE' || this.st === 'STUN';
    }
    home() {
      const d = G.dir[this.team];
      const f = FORMATION[this.idx];
      let x = d * f[0] * (HALF_L - 3);
      let z = f[1] * (HALF_W - 4);
      if (!this.isGK) {
        x += clamp(ball.p.x * 0.5, -26, 26);
        z += clamp(ball.p.z * 0.30, -10, 10);
      } else {
        z = clamp(ball.p.z * 0.30, -GOAL_W - 1.5, GOAL_W + 1.5);
        const ownGoalX = -d * HALF_L;
        const away = Math.abs(ball.p.x - ownGoalX);     // how far the ball is from my goal
        x = ownGoalX + d * (0.8 + clamp((away - 42) * 0.22, 0, 8));
      }
      return { x: clamp(x, -HALF_L + 1, HALF_L - 1), z: clamp(z, -HALF_W + 1, HALF_W - 1) };
    }
  }

  function makeTeams(aIdx, bIdx) {
    for (const p of G.players) { scene.remove(p.mesh); scene.remove(p.shadow); }
    G.players = [];
    G.teamInfo = [TEAMS[aIdx], TEAMS[bIdx]];
    for (let t = 0; t < 2; t++)
      for (let i = 0; i < 11; i++)
        G.players.push(new Player(t, i, G.teamInfo[t]));
    buildRef();
  }

  // ---------------------------------------------------------- input
  const keys = {};
  const touch = { active: false, dx: 0, dy: 0, shoot: false, pass: false, lob: false };
  addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  function axis() {
    let x = 0, y = 0;
    if (keys.ArrowLeft || keys.KeyA) x -= 1;
    if (keys.ArrowRight || keys.KeyD) x += 1;
    if (keys.ArrowUp || keys.KeyW) y += 1;
    if (keys.ArrowDown || keys.KeyS) y -= 1;
    if (touch.active) { x += touch.dx; y += touch.dy; }
    const m = Math.hypot(x, y);
    return m > 1 ? { x: x / m, y: y / m, m: 1 } : { x, y, m };
  }
  const kPass = () => keys.KeyJ || touch.pass;
  const kShoot = () => keys.KeyK || touch.shoot;
  const kLob = () => keys.KeyL || touch.lob;

  // touch controls
  (function setupTouch() {
    if (!('ontouchstart' in window)) return;
    $('touch').classList.add('on');
    const stick = $('stick'), knob = $('knob');
    let id = null, cx = 0, cy = 0;
    stick.addEventListener('touchstart', e => {
      const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      id = e.changedTouches[0].identifier; touch.active = true; e.preventDefault();
    }, { passive: false });
    addEventListener('touchmove', e => {
      for (const t of e.changedTouches) if (t.identifier === id) {
        const dx = clamp((t.clientX - cx) / 46, -1, 1), dy = clamp((cy - t.clientY) / 46, -1, 1);
        touch.dx = dx; touch.dy = dy;
        knob.style.transform = `translate(${dx * 30}px,${-dy * 30}px)`;
      }
    }, { passive: false });
    addEventListener('touchend', e => {
      for (const t of e.changedTouches) if (t.identifier === id) {
        id = null; touch.active = false; touch.dx = touch.dy = 0; knob.style.transform = '';
      }
    });
    const bind = (el, key) => {
      el.addEventListener('touchstart', e => { touch[key] = true; e.preventDefault(); }, { passive: false });
      el.addEventListener('touchend', e => { touch[key] = false; e.preventDefault(); }, { passive: false });
    };
    bind($('bShoot'), 'shoot'); bind($('bPass'), 'pass'); bind($('bLob'), 'lob');
  })();

  // ---------------------------------------------------------- HUD
  const ui = {
    cap: $('caption'), pow: $('power'), powFill: $('powerFill'),
    sA: $('scoreA'), sB: $('scoreB'), clock: $('clock'),
    abA: $('abA'), abB: $('abB'), swA: $('swA'), swB: $('swB'), hint: $('hint')
  };
  let capTimer = 0;
  function caption(txt, sub, hold) {
    ui.cap.innerHTML = txt + (sub ? '<small>' + sub + '</small>' : '');
    ui.cap.classList.add('show');
    capTimer = hold || 1.4;
  }
  const hudCache = { a: -1, b: -1, c: '' };
  function refreshHud() {
    if (hudCache.a !== G.score[0]) { hudCache.a = G.score[0]; ui.sA.textContent = G.score[0]; }
    if (hudCache.b !== G.score[1]) { hudCache.b = G.score[1]; ui.sB.textContent = G.score[1]; }
    let txt;
    if (G.golden) txt = 'ΠΑΡΑΤΑΣΗ';
    else {
      const left = Math.max(0, HALF_SECONDS - G.clock);
      txt = Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0');
    }
    if (hudCache.c !== txt) { hudCache.c = txt; ui.clock.textContent = txt; }
  }

  // ---------------------------------------------------------- ball / physics
  function kickBall(from, dirV, speed, lift, by) {
    ball.owner = null;
    ball.p.copy(from);
    ball.p.y = Math.max(ball.p.y, BALL_R + 0.1);
    ball.v.set(dirV.x * speed, lift, dirV.z * speed);
    ball.lastTouch = by;
    if (by) { ball.lastTouchTeam = by.team; by.kick = 1; }
    ball.shotId = (ball.shotId || 0) + 1;
    Audio.kick(clamp(speed / 45, 0.35, 1));
  }

  function stepBall(dt) {
    if (ball.owner) return;
    ball.v.y += GRAVITY * dt;
    ball.p.addScaledVector(ball.v, dt);
    if (ball.p.y < BALL_R) {
      ball.p.y = BALL_R;
      if (ball.v.y < -1.2) ball.v.y *= -0.55; else ball.v.y = 0;
      const f = Math.pow(0.16, dt);
      ball.v.x *= f; ball.v.z *= f;
    } else {
      const f = Math.pow(0.86, dt);
      ball.v.x *= f; ball.v.z *= f;
    }
    // posts & crossbar
    for (const side of [-1, 1]) {
      const gx = side * (HALF_L + 0.12);
      if (Math.abs(ball.p.x - gx) < 0.45 && ball.p.y < GOAL_H + 0.3) {
        for (const s of [-1, 1]) {
          if (Math.abs(ball.p.z - s * GOAL_W) < 0.46 && ball.p.y < GOAL_H) {
            ball.v.z *= -0.7; ball.v.x *= -0.55;
            ball.p.z = s * GOAL_W + Math.sign(ball.p.z - s * GOAL_W) * 0.47;
            Audio.post(); caption('ΔΟΚΑΡΙ!', '', 1.1);
          }
        }
        if (Math.abs(ball.p.y - GOAL_H) < 0.4 && Math.abs(ball.p.z) < GOAL_W) {
          ball.v.y = -Math.abs(ball.v.y) * 0.6; ball.v.x *= -0.5;
          Audio.post(); caption('ΔΟΚΑΡΙ!', '', 1.1);
        }
      }
    }
  }

  // ---------------------------------------------------------- restarts
  function placeAll(kickTeam) {
    for (const p of G.players) {
      const d = G.dir[p.team];
      const f = FORMATION[p.idx];
      let x = d * f[0] * (HALF_L - 3) * 0.9;
      let z = f[1] * (HALF_W - 4);
      if (p.isGK) { x = d * -(HALF_L - 0.7); z = 0; }
      // nobody in the opponent half at kick-off
      if (!p.isGK && d * x > -2) x = -d * 2 - d * Math.abs(f[0]) * 6;
      p.p.set(x, 0, z); p.v.set(0, 0, 0);
      p.face.set(d, 0, 0); p.hold = 0; p.stun = 0; setIdle(p);
    }
    // kicker
    const kicker = G.players.find(p => p.team === kickTeam && p.idx === 9);
    if (kicker) { kicker.p.set(-G.dir[kickTeam] * 1.4, 0, 0.6); }
    const mate = G.players.find(p => p.team === kickTeam && p.idx === 10);
    if (mate) { mate.p.set(-G.dir[kickTeam] * 1.2, 0, -2.4); }
    ball.p.set(0, BALL_R, 0); ball.v.set(0, 0, 0);
    ball.owner = kicker || null;
    G.taker = kicker || null;
    ball.lastTouchTeam = kickTeam;
  }

  function kickoff(team, msg) {
    G.kickoffTeam = team;
    placeAll(team);
    G.state = 'kickoff'; G.stateTimer = 1.5;
    caption(msg || 'ΣΕΝΤΡΑ!', '', 1.2);
    Audio.whistle();
  }

  function deadBall(x, z, team, label, sub) {
    ball.p.set(clamp(x, -HALF_L + 1, HALF_L - 1), BALL_R, clamp(z, -HALF_W + 1, HALF_W - 1));
    ball.v.set(0, 0, 0); ball.owner = null;
    // nearest outfielder of `team` takes it
    let best = null, bd = 1e9;
    for (const p of G.players) {
      if (p.team !== team || p.isGK) continue;
      const d = (p.p.x - x) ** 2 + (p.p.z - z) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    if (label === 'ΑΟΥΤ') {                 // goal kick -> keeper
      best = G.players.find(p => p.team === team && p.isGK);
      ball.p.set(G.dir[team] * -(HALF_L - 6), BALL_R, clamp(z, -12, 12));
    }
    if (best) { best.p.set(ball.p.x - G.dir[team] * 1.2, 0, ball.p.z); ball.owner = best; }
    G.taker = best || null;
    ball.lastTouchTeam = team;
    G.state = 'restart'; G.stateTimer = 1.5;
    if (label) caption(label, sub, 1.0);
  }

  /** Slide that takes the man rather than the ball. */
  function foul(offender, victim) {
    Audio.whistle();
    G.cards[offender.team] = G.cards[offender.team] || 0;
    const book = Math.random() < 0.25;
    if (book) G.cards[offender.team]++;
    deadBall(victim.p.x, victim.p.z, victim.team, null);
    caption(book ? 'ΚΙΤΡΙΝΗ ΚΑΡΤΑ!' : 'ΦΑΟΥΛ!', G.teamInfo[victim.team].name, 1.7);
    G.stateTimer = 1.9;
    offender.cool = 1.6;
  }

  function scored(team) {
    G.score[team]++;
    G.lastScorer = team;
    G.scorer = (ball.lastTouch && ball.lastTouch.team === team) ? ball.lastTouch : null;
    G.celebZ = Math.random() < 0.5 ? -1 : 1;
    refreshHud();
    G.state = 'goal'; G.stateTimer = 3.4;
    const t = G.teamInfo[team];
    caption('ΓΚΟΛΛΛ!', t.name, 3.2);
    Audio.cheer();
    ball.owner = null;
  }

  // ---------------------------------------------------------- AI + control
  function moveTowards(p, tx, tz, speed, dt) {
    const dx = tx - p.p.x, dz = tz - p.p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.8) { p.v.multiplyScalar(Math.pow(0.015, dt)); return; }   // arrived: brake
    if (d < 3) speed *= d / 3;                                          // ease in
    steer(p, dx, dz, speed, dt);
  }

  // ======================================================= ACTIONS
  // Every strike is a committed animation: WINDUP -> STRIKE -> RECOVER.
  // Nothing cancels it, and if the ball is stolen mid-windup you swing at air.
  // That commitment is most of the arcade feel.
  const ACT = {
    short: { windup: 6,  recover: 9,  charge: 0  },
    long:  { windup: 9,  recover: 13, charge: 0  },
    shoot: { windup: 7,  recover: 17, charge: 42 },
    slide: { windup: 0,  recover: 32, charge: 0  }
  };

  function setIdle(p) { p.st = ball.owner === p ? 'DRIBBLE' : 'IDLE'; p.stT = 0; p.act = null; }

  function begin(p, type) {
    if (p.locked()) return false;
    p.act = type; p.stT = 0; p.charge = 0;
    p.st = (type === 'slide') ? 'SLIDE' : 'WINDUP';
    if (type === 'slide') { p.v.multiplyScalar(1.5); }
    return true;
  }

  /** Direction the player is asking to play the ball in. */
  function intent(p) {
    if (p === G.controlled && p.team === G.human) {
      const a = axis();
      if (a.m > 0.25) return { x: a.x, z: -a.y };     // screen-relative, side camera
    }
    return { x: p.face.x, z: p.face.z };
  }

  /**
   * Semi-automatic pass targeting. The player presses a DIRECTION, not a
   * teammate: we take every teammate inside a cone around that direction and
   * score them. Alignment dominates, so the pass always goes roughly where you
   * pointed; everything else only breaks ties.
   */
  const CONE = { short: 1.15, long: 0.95 };          // half-angle, radians
  const RANGE = { short: [2.5, 30], long: [8, 62] };

  function pickTarget(p, kind, dir) {
    const dl = Math.hypot(dir.x, dir.z) || 1;
    const dx = dir.x / dl, dz = dir.z / dl;
    const d = G.dir[p.team];
    const [minR, maxR] = RANGE[kind];
    let best = null, bestScore = -1e9;

    for (const m of G.players) {
      if (m.team !== p.team || m === p || m.st === 'STUN') continue;
      const vx = m.p.x - p.p.x, vz = m.p.z - p.p.z;
      const dist = Math.hypot(vx, vz);
      if (dist < minR || dist > maxR) continue;

      const cosA = (vx * dx + vz * dz) / dist;
      const ang = Math.acos(clamp(cosA, -1, 1));
      if (ang > CONE[kind]) continue;

      // alignment is worth far more than anything else: that is the "lock-on"
      let score = (1 - ang / CONE[kind]) * 100;
      score += (1 - dist / maxR) * 22;                   // prefer the nearer option
      score += clamp(d * vx / 30, -1, 1) * 14;           // prefer forward
      if (m.isGK) score -= 120;                          // never hospital-pass the keeper

      // defenders sitting in the passing lane
      for (const o of G.players) {
        if (o.team === p.team) continue;
        const t = ((o.p.x - p.p.x) * vx + (o.p.z - p.p.z) * vz) / (dist * dist);
        if (t <= 0.04 || t >= 1) continue;
        const off = Math.hypot(o.p.x - (p.p.x + vx * t), o.p.z - (p.p.z + vz * t));
        if (off < 2.0) score -= kind === 'long' ? 14 : 34;   // a lofted ball clears legs
      }
      // how tightly the receiver is marked
      for (const o of G.players) {
        if (o.team === p.team) continue;
        const md = Math.hypot(o.p.x - m.p.x, o.p.z - m.p.z);
        if (md < 3.2) score -= (3.2 - md) * 7;
      }
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  /** Constant flight time makes a pass land where you expect every time. */
  function execPass(p, kind) {
    const dir = intent(p);
    const target = pickTarget(p, kind, dir);
    const lofted = kind === 'long';

    if (!target) {                                   // nobody there: hoof it that way
      const dl = Math.hypot(dir.x, dir.z) || 1;
      const v = new THREE.Vector3(dir.x / dl, 0, dir.z / dl);
      kickBall(ball.p, v, lofted ? 28 : 21, lofted ? 8 : 1.2, p);
      return;
    }
    const FLIGHT = lofted ? 0.72 : 0.42;
    const tx = target.p.x + target.v.x * FLIGHT;
    const tz = target.p.z + target.v.z * FLIGHT;
    const vx = tx - ball.p.x, vz = tz - ball.p.z;
    const dist = Math.hypot(vx, vz) || 1;
    const v = new THREE.Vector3(vx / dist, 0, vz / dist);
    const speed = clamp(dist / FLIGHT, 15, lofted ? 46 : 39);
    kickBall(ball.p, v, speed, lofted ? clamp(dist * 0.30, 5.5, 11) : 0.5, p);
    ball.curve = 0;
  }

  /** Rockets. Gravity is a suggestion. */
  function execShot(p, power) {
    const d = G.dir[p.team];
    const gx = d * (HALF_L + 0.8);
    const gk = G.players.find(q => q.team !== p.team && q.isGK);
    const human = (p === G.controlled && p.team === G.human);

    let side = gk ? (gk.p.z >= 0 ? -1 : 1) : (Math.random() < 0.5 ? -1 : 1);
    const a = human ? axis() : null;
    if (a && Math.abs(a.x) > 0.35) side = Math.sign(a.x) * d;

    const dist0 = Math.hypot(gx - ball.p.x, ball.p.z);
    let gz = side * (GOAL_W - 0.5) + rnd(-0.7, 0.7) + rnd(-1, 1) * clamp(dist0 * 0.04, 0, 2.1);
    if (!human) gz += rnd(-1, 1) * 1.35 * (2 - p.skill);
    gz = clamp(gz, -(GOAL_W + 1.4), GOAL_W + 1.4);

    const toGoal = new THREE.Vector3(gx - ball.p.x, 0, gz - ball.p.z).normalize();
    const dir = new THREE.Vector3().addScaledVector(p.face, 0.22).addScaledVector(toGoal, 0.78);
    if (dir.lengthSq() < 0.01) dir.copy(toGoal);
    dir.y = 0; dir.normalize();

    const dist = Math.hypot(gx - ball.p.x, gz - ball.p.z);
    const speed = 56 + power * 34;                      // 56-90 u/s
    const lift = clamp(dist * 0.055 + power * 1.1, 0.9, 6.5);
    kickBall(ball.p, dir, speed, lift, p);
    ball.curve = rnd(-1, 1) * (5 + power * 9);          // the sweeping arc
    Audio.excite(0.18);
  }

  /** The committed frame where boot meets ball. */
  function strike(p) {
    if (p.act === 'shoot' || p.act === 'short' || p.act === 'long') {
      if (ball.owner !== p) return;                     // stolen mid-swing: air shot
      if (p.act === 'shoot') execShot(p, p.charge);
      else execPass(p, p.act);
    }
  }

  /** One frame of the state machine. Returns true if the player may steer. */
  function stepState(p, moving) {
    p.stT++;
    const a = ACT[p.act];
    switch (p.st) {
      case 'WINDUP': {
        const holding = (p === G.controlled && p.team === G.human) ? kShoot() : (p.aiHold-- > 0);
        if (p.act === 'shoot' && holding && p.stT < a.windup + a.charge) {
          p.charge = clamp((p.stT - a.windup) / a.charge, 0, 1);
          return false;
        }
        if (p.stT >= a.windup) {
          if (p.act === 'shoot') p.charge = clamp((p.stT - a.windup) / a.charge, 0, 1);
          p.kick = 1;
          strike(p);
          p.st = 'RECOVER'; p.stT = 0;
        }
        return false;
      }
      case 'RECOVER':
        if (p.stT >= a.recover) setIdle(p);
        return false;
      case 'SLIDE':
        if (p.stT >= ACT.slide.recover) setIdle(p);
        return false;
      case 'STUN':
        if (p.stT >= 28) setIdle(p);
        return false;
      default:
        p.st = (ball.owner === p) ? 'DRIBBLE' : (moving ? 'RUN' : 'IDLE');
        return true;
    }
  }

  /** Heading-based movement: you steer a heading, you don't teleport a vector. */
  function steer(p, dx, dz, speed, dt) {
    const l = Math.hypot(dx, dz);
    if (l < 0.01) {
      p.v.x = lerp(p.v.x, 0, clamp(dt * 11, 0, 1));
      p.v.z = lerp(p.v.z, 0, clamp(dt * 11, 0, 1));
      return;
    }
    const want = Math.atan2(dx / l, dz / l);
    let cur = Math.atan2(p.face.x, p.face.z);
    let diff = want - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    // A standing player can spin on the spot; a sprinting one has to arc.
    // Without this they orbit their target forever instead of arriving.
    const frac = clamp(Math.hypot(p.v.x, p.v.z) / RUN, 0, 1);
    const rate = TURN_SLOW + (TURN_FAST - TURN_SLOW) * frac;
    cur += clamp(diff, -rate * dt, rate * dt);
    p.face.set(Math.sin(cur), 0, Math.cos(cur));

    const align = Math.max(0, Math.cos(diff));
    const tgt = speed * (0.34 + 0.66 * align);          // bleed pace into the turn
    const k = clamp(dt * ACCEL, 0, 1);
    p.v.x = lerp(p.v.x, p.face.x * tgt, k);
    p.v.z = lerp(p.v.z, p.face.z * tgt, k);
  }

  /** 16-way snapping: a D-pad, not a mouse. */
  function snap(x, z) {
    if (Math.hypot(x, z) < 0.01) return { x: 0, z: 0 };
    const step = Math.PI / 8;
    const a = Math.round(Math.atan2(z, x) / step) * step;
    return { x: Math.cos(a), z: Math.sin(a) };
  }

  function tryTakeBall(dt) {
    if (ball.owner || ball.p.y > 2.2) return;
    const spd = ball.v.length();

    // bodies get in the way: a driven ball can clip a defender
    if (spd > 18 && ball.p.y < 1.9) {
      for (const p of G.players) {
        if (p.isGK || p.cool > 0 || p === ball.lastTouch) continue;
        if (p.team === ball.lastTouchTeam) continue;
        const d = Math.hypot(p.p.x - ball.p.x, p.p.z - ball.p.z);
        if (d < 0.95 && Math.random() < 0.6) {
          ball.v.set(ball.v.x * -0.25 + rnd(-5, 5), 2.4, ball.v.z * 0.3 + rnd(-5, 5));
          ball.lastTouch = p; ball.lastTouchTeam = p.team;
          ball.shotId = (ball.shotId || 0) + 1;
          p.cool = 0.25;
          return;
        }
      }
    }

    let best = null, bd = 1e9;
    for (const p of G.players) {
      if (p.cool > 0 || p.stun > 0) continue;
      // a rocket is much harder to gather than a rolling ball
      const reach = p.isGK
        ? (spd > 45 ? 1.25 : 1.9)
        : (p.st === 'SLIDE' ? 1.85 : 1.25);
      const d = Math.hypot(p.p.x - ball.p.x, p.p.z - ball.p.z);
      if (d > reach) continue;
      if (spd > 34 && !p.isGK && Math.random() > 0.45) continue;
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) return;
    if (best.isGK && spd > 42) {                 // parried, not held
      ball.v.set(-ball.v.x * 0.22 + rnd(-4, 4), 3.2, rnd(-10, 10));
      ball.p.y = BALL_R + 0.35;
      ball.lastTouch = best; ball.lastTouchTeam = best.team;
      best.cool = 0.45;
      caption('ΑΠΟΚΡΟΥΣΗ!', '', 0.9);
      return;
    }
    ball.owner = best; ball.lastTouch = best; ball.lastTouchTeam = best.team;
    ball.v.multiplyScalar(0.1); ball.p.y = BALL_R;
    if (best.isGK) best.hold = 1.1;
  }

  function updatePlayer(p, dt) {
    const d = G.dir[p.team];
    const isHuman = (p === G.controlled && p.team === G.human && G.state === 'play');
    p.cool = Math.max(0, p.cool - dt);
    p.stun = Math.max(0, p.stun - dt);
    if (p.hold > 0) p.hold -= dt;

    const frozen = G.freeze > 0 || G.state === 'fulltime' || G.state === 'kickoff';

    // input first, so the state machine knows whether we are trying to move
    let wantX = 0, wantZ = 0, moving = false;
    if (!frozen) {
      if (isHuman) {
        const a = axis();
        if (a.m > 0.15) {
          // camera sits on the +z touchline looking across, so screen-right is
          // +x and screen-up is -z, whichever way your team is attacking
          const sn = snap(a.x, -a.y);
          wantX = sn.x; wantZ = sn.z; moving = true;
        }
      }
    }

    const free = stepState(p, moving);

    if (frozen) {
      p.v.multiplyScalar(Math.pow(0.02, dt));
    } else if (p.st === 'SLIDE') {
      p.v.multiplyScalar(Math.pow(0.55, dt));   // carries through the challenge
    } else if (p.st === 'WINDUP' || p.st === 'STUN') {
      p.v.multiplyScalar(Math.pow(0.02, dt));   // planted: the commitment frame
    } else if (isHuman) {
      let spd = RUN * (ball.owner === p ? 0.95 : 1) * (p.st === 'RECOVER' ? 0.45 : 1);
      if (moving) {
        // magnetism toward a loose ball just ahead — the semi-automatic feel
        if (ball.owner !== p) {
          const bx = ball.p.x - p.p.x, bz = ball.p.z - p.p.z;
          const bd = Math.hypot(bx, bz);
          if (bd < 4.5 && bd > 0.3 && (bx * wantX + bz * wantZ) / bd > 0.35) {
            const w = (1 - bd / 4.5) * 0.55;
            wantX = lerp(wantX, bx / bd, w); wantZ = lerp(wantZ, bz / bd, w);
          }
        }
        // The camera looks along z, so a metre up or down the screen covers far
        // less of the view than a metre left or right. Without compensation,
        // running toward goal feels much faster than running across.
        spd *= 1 + Math.abs(wantZ) * 0.8;
        steer(p, wantX, wantZ, spd, dt);
      } else {
        p.v.x = lerp(p.v.x, 0, clamp(dt * 11, 0, 1));
        p.v.z = lerp(p.v.z, 0, clamp(dt * 11, 0, 1));
      }
    } else if (G.state === 'goal') {
      celebrate(p, dt);
    } else if (free || p.st === 'RECOVER') {
      aiPlayer(p, dt);
    }

    p.p.x += p.v.x * dt; p.p.z += p.v.z * dt;
    p.p.x = clamp(p.p.x, -HALF_L - 3, HALF_L + 3);
    p.p.z = clamp(p.p.z, -HALF_W - 2.5, HALF_W + 2.5);

    const sp = Math.hypot(p.v.x, p.v.z);
    if (sp > 0.6 && !p.locked()) p.face.set(p.v.x / sp, 0, p.v.z / sp);

    // carry the ball
    if (ball.owner === p) {
      if (p.isGK && p.hold > 0) {
        ball.p.set(p.p.x + p.face.x * 0.5, 1.2, p.p.z + p.face.z * 0.5);
      } else {
        const ahead = 0.85 + Math.min(sp, SPRINT) * 0.055;
        ball.p.set(p.p.x + p.face.x * ahead, BALL_R, p.p.z + p.face.z * ahead);
        ball.v.set(p.v.x, 0, p.v.z);
      }
      ball.lastTouchTeam = p.team;
    }

    // ---- presentation -------------------------------------------------
    p.kick = Math.max(0, p.kick - dt * 3.2);
    p.mesh.position.set(p.p.x, 0, p.p.z);
    p.mesh.rotation.y = Math.atan2(p.face.x, p.face.z);
    p.shadow.position.set(p.p.x, 0.03, p.p.z);

    // stride length scales with speed so the feet don't skate
    p.gait += sp * dt * 2.35;
    if (p.st === 'SLIDE') {
      p.mesh.rotation.x = -0.55;
      p.mesh.position.y = 0.12;
    } else {
      p.mesh.rotation.x = 0;
      p.mesh.position.y = 0;
    }
    Look.pose(p.rig, {
      phase: p.gait,
      run: clamp(sp / RUN, 0, 1.15),
      slide: p.st === 'SLIDE' ? 1 : 0,
      kick: p.kick,
      dive: 0,
      celebrate: (G.state === 'goal' && p.team === G.lastScorer) ? 1 : 0,
      dejected: (G.state === 'goal' && p.team !== G.lastScorer) ? 1 : 0
    });
  }

  /** The three seconds after a goal: one man wheels away, the rest chase him. */
  function celebrate(p, dt) {
    const d = G.dir[p.team];
    if (p.team !== G.lastScorer) {                       // trudge back
      const h = p.home();
      moveTowards(p, h.x, h.z, RUN * 0.30, dt);
      return;
    }
    if (p.isGK) { moveTowards(p, p.p.x, p.p.z, 2, dt); return; }
    const hero = G.scorer || G.players.find(q => q.team === G.lastScorer && q.idx === 9);
    if (p === hero) {
      // wheel away toward the corner flag in front of the away end
      const cx = d * (HALF_L - 6), cz = (G.celebZ || 1) * (HALF_W - 5);
      moveTowards(p, cx, cz, RUN * 0.92, dt);
    } else if (hero) {
      moveTowards(p, hero.p.x - d * 2.2, hero.p.z + (p.idx % 2 ? 1.8 : -1.8), RUN * 0.88, dt);
    }
  }

  function aiPlayer(p, dt) {
    const d = G.dir[p.team];
    const mine = ball.owner && ball.owner.team === p.team;
    const distBall = Math.hypot(p.p.x - ball.p.x, p.p.z - ball.p.z);

    if (p.isGK) {
      const h = p.home();
      const gx = -d * HALF_L;
      const spd = ball.v.length();
      const towards = (d < 0 ? ball.v.x > 4 : ball.v.x < -4);
      if (!ball.owner && towards && Math.abs(ball.p.x - gx) < 30) {
        const t = (gx - ball.p.x) / (ball.v.x || 0.001);
        if (t > 0 && t < 2) {
          // one reaction delay + one aim error per shot — hard shots beat him
          if (p.shotId !== ball.shotId) {
            p.shotId = ball.shotId;
            p.react = rnd(0.05, 0.13) + clamp((spd - 30) * 0.0022, 0, 0.09);
            p.err = rnd(-1, 1) * (0.30 + clamp((spd - 30) * 0.030, 0, 1.75));
          }
          p.react -= dt;
          if (p.react > 0) { p.v.multiplyScalar(Math.pow(0.2, dt)); return; }
          const iz = ball.p.z + ball.v.z * t + p.err;
          if (Math.abs(iz) < GOAL_W + 3) moveTowards(p, gx + d * 0.6, clamp(iz, -GOAL_W - 1.8, GOAL_W + 1.8), 19, dt);
          else moveTowards(p, h.x, h.z, 7, dt);
          return;
        }
      }
      if (ball.owner === p) {
        if (p.hold <= 0) begin(p, 'long');
        return;
      }
      if (distBall < 9 && !ball.owner && Math.abs(ball.p.x) > HALF_L - 14) {
        moveTowards(p, ball.p.x, ball.p.z, 11, dt); return;
      }
      moveTowards(p, h.x, h.z, 8, dt);
      return;
    }

    // who on this team is closest to the ball?
    let closest = null, cd = 1e9, second = null, sd = 1e9;
    for (const q of G.players) {
      if (q.team !== p.team || q.isGK) continue;
      const dd = Math.hypot(q.p.x - ball.p.x, q.p.z - ball.p.z);
      if (dd < cd) { second = closest; sd = cd; closest = q; cd = dd; }
      else if (dd < sd) { second = q; sd = dd; }
    }

    if (ball.owner === p) {
      // carry / decide
      const toGoalX = d * (HALF_L) - p.p.x;
      const distGoal = Math.hypot(toGoalX, p.p.z);
      let pressure = 0;
      for (const o of G.players) if (o.team !== p.team && Math.hypot(o.p.x - p.p.x, o.p.z - p.p.z) < 3.4) pressure++;
      if (distGoal < 26 && p.cool <= 0 &&
          (Math.random() < 0.009 + (26 - distGoal) * 0.0022 || (pressure && distGoal < 16 && Math.random() < 0.04))) {
        p.aiHold = (rnd(0.35, 1) * ACT.shoot.charge) | 0; begin(p, 'shoot'); return;
      }
      if (p.cool <= 0 && (pressure >= 1 && Math.random() < 0.06)) {
        begin(p, Math.random() < 0.25 ? 'long' : 'short'); return;
      }
      if (p.cool <= 0 && Math.random() < 0.012) { begin(p, 'short'); return; }
      // run at goal, drift to centre
      const tz = clamp(lerp(p.p.z, clamp(p.p.z * 0.6, -14, 14), 0.5), -(HALF_W - 5), HALF_W - 5);
      const tx = clamp(p.p.x + d * 14, -(HALF_L - 2), HALF_L - 2);
      moveTowards(p, tx, tz, RUN * 0.95 * p.skill, dt);
      return;
    }

    if (mine) {
      // we have it: forwards run the channels, the rest push up and stay spread
      const h = p.home();
      if (p.idx >= 9) {
        const runX = clamp(ball.p.x + d * rnd(9, 16), -(HALF_L - 3), HALF_L - 3);
        moveTowards(p, runX, clamp(h.z * 1.15, -(HALF_W - 5), HALF_W - 5), RUN * 0.9 * p.skill, dt);
      } else if (p.idx >= 5) {
        moveTowards(p, h.x + d * 8, h.z, RUN * 0.84 * p.skill, dt);   // support the carrier
      } else {
        moveTowards(p, h.x + d * 4, h.z, RUN * 0.7, dt);              // hold the line
      }
      return;
    }

    // ---- defending / loose ball -------------------------------------
    if (p === closest) {
      const lead = ball.owner ? 0.28 : 0.18;
      const tx = clamp(ball.p.x + ball.v.x * lead, -(HALF_L - 1), HALF_L - 1);
      const tz = clamp(ball.p.z + ball.v.z * lead, -(HALF_W - 1), HALF_W - 1);
      moveTowards(p, tx, tz, SPRINT * 0.95 * p.skill, dt);
      if (ball.owner && ball.owner.team !== p.team && distBall < 2.2 && p.cool <= 0 && Math.random() < 0.028) {
        begin(p, 'slide'); p.cool = 1.1;
      }
      return;
    }
    if (p === second) {      // second man covers the space behind the presser
      moveTowards(p, ball.p.x - d * 4.5, lerp(p.p.z, ball.p.z, 0.6), RUN * 0.92 * p.skill, dt);
      return;
    }

    // everyone else picks up a man, goal-side. This is what stops the
    // opposition walking through the middle.
    const ownGoalX = -d * HALF_L;
    const h = p.home();
    let mark = null, bd = 1e9;
    for (const o of G.players) {
      if (o.team === p.team || o.isGK) continue;
      if (o === ball.owner) continue;                     // the presser has him
      if (d * (o.p.x - ball.p.x) > 6) continue;           // ignore anyone behind the ball
      const dd = (o.p.x - h.x) * (o.p.x - h.x) + (o.p.z - h.z) * (o.p.z - h.z);
      if (dd < bd && dd < 900) { bd = dd; mark = o; }
    }
    if (mark) {
      const vx = ownGoalX - mark.p.x, vz = -mark.p.z;
      const l = Math.hypot(vx, vz) || 1;
      const gx = mark.p.x + (vx / l) * 2.5, gz = mark.p.z + (vz / l) * 2.5;
      moveTowards(p, clamp(gx, -(HALF_L - 2), HALF_L - 2),
                     clamp(gz, -(HALF_W - 2), HALF_W - 2), RUN * 0.88 * p.skill, dt);
      return;
    }
    // no one to pick up: drop into shape, a little deeper than normal
    moveTowards(p, h.x - d * 3, h.z, RUN * 0.76 * p.skill, dt);
  }

  // human control extras
  // Three buttons. Short pass, long pass, shoot. Nothing else.
  const edge = {};
  function pressed(name, down) {
    const was = edge[name]; edge[name] = down;
    return down && !was;
  }

  function humanInput(dt) {
    const p = G.controlled;
    const sp = kShoot(), pa = kPass(), lo = kLob();
    const newShoot = pressed('shoot', sp), newPass = pressed('pass', pa), newLob = pressed('lob', lo);

    if (!p || G.state !== 'play') { ui.pow.classList.remove('on'); return; }

    if (p.st === 'WINDUP' && p.act === 'shoot') {
      ui.pow.classList.add('on');
      ui.powFill.style.width = (p.charge * 100) + '%';
    } else {
      ui.pow.classList.remove('on');
    }
    if (p.locked()) return;

    const hasBall = ball.owner === p;
    if (hasBall) {
      if (newShoot) begin(p, 'shoot');
      else if (newPass) begin(p, 'short');
      else if (newLob) begin(p, 'long');
    } else {
      // off the ball the short-pass button is the slide tackle
      if (newPass && !p.isGK) begin(p, 'slide');
    }
  }

  function manualSwitch() {
    const mates = G.players.filter(p => p.team === G.human && !p.isGK && p !== G.controlled);
    mates.sort((a, b) =>
      Math.hypot(a.p.x - ball.p.x, a.p.z - ball.p.z) - Math.hypot(b.p.x - ball.p.x, b.p.z - ball.p.z));
    if (mates[0]) G.controlled = mates[0];
  }

  function autoSwitch() {
    if (ball.owner && ball.owner.team === G.human) { G.controlled = ball.owner; return; }
    if (G.switchCool > 0) return;
    let best = null, bd = 1e9;
    for (const p of G.players) {
      if (p.team !== G.human || p.isGK) continue;
      const d = Math.hypot(p.p.x - ball.p.x, p.p.z - ball.p.z);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) G.controlled = best;
  }

  // ---------------------------------------------------------- collisions
  function separate() {
    for (let i = 0; i < G.players.length; i++) {
      for (let j = i + 1; j < G.players.length; j++) {
        const a = G.players[i], b = G.players[j];
        let dx = b.p.x - a.p.x, dz = b.p.z - a.p.z;
        let d2 = dx * dx + dz * dz;
        const min = 1.05;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (min - d) * 0.5;
          dx /= d; dz /= d;
          a.p.x -= dx * push; a.p.z -= dz * push;
          b.p.x += dx * push; b.p.z += dz * push;
          // a sliding player knocks the ball loose
          if (a.team !== b.team) {
            const slider = a.st === 'SLIDE' ? a : (b.st === 'SLIDE' ? b : null);
            const victim = slider === a ? b : a;
            if (slider && ball.owner === victim) {
              ball.owner = null;
              ball.v.set(rnd(-6, 6), 2, rnd(-6, 6));
              victim.st = 'STUN'; victim.stT = 0; victim.cool = 0.5;
              slider.cool = 0.6;
              // Did he get the ball, or the man? Judged by where he came from:
              // through the ball is a tackle, from behind or the side is a foul.
              const bvx = ball.p.x - victim.p.x, bvz = ball.p.z - victim.p.z;
              const svx = slider.p.x - victim.p.x, svz = slider.p.z - victim.p.z;
              const bl = Math.hypot(bvx, bvz) || 1, sl = Math.hypot(svx, svz) || 1;
              const throughBall = (bvx * svx + bvz * svz) / (bl * sl);
              const clean = throughBall > 0.35 &&
                            Math.hypot(ball.p.x - slider.p.x, ball.p.z - slider.p.z) < 1.7;
              if (!clean && G.state === 'play' && Math.random() < 0.7) foul(slider, victim);
            }
          }
        }
      }
    }
  }

  // ---------------------------------------------------------- boundaries
  function boundaries() {
    if (G.state !== 'play') return;
    const b = ball.p;
    const carrier = ball.owner;
    const lastTeam = ball.lastTouchTeam;

    // goal?
    if (Math.abs(b.x) > HALF_L + 0.2 && Math.abs(b.z) < GOAL_W - 0.05 && b.y < GOAL_H - 0.05) {
      const scorer = b.x > 0 ? 0 : 1;   // team 0 attacks +x
      if (!carrier || carrier.team === scorer) { scored(scorer); return; }
    }
    // sidelines
    if (Math.abs(b.z) > HALF_W) {
      const other = 1 - lastTeam;
      deadBall(b.x, Math.sign(b.z) * (HALF_W - 0.6), other, 'ΠΛΑΓΙΟ ΑΟΥΤ');
      return;
    }
    // byline
    if (Math.abs(b.x) > HALF_L + 0.6) {
      const side = Math.sign(b.x);
      const defendingTeam = side > 0 ? 1 : 0;     // team defending that goal
      if (lastTeam === defendingTeam) {
        deadBall(side * (HALF_L - 1), Math.sign(b.z || 1) * (HALF_W - 1), 1 - defendingTeam, 'ΚΟΡΝΕΡ');
      } else {
        deadBall(side * (HALF_L - 6), 0, defendingTeam, 'ΑΟΥΤ');
      }
    }
  }

  // ---------------------------------------------------------- camera
  // Broadcast camera: parked on the near touchline, panning left and right with
  // the play, both goals off the sides of the screen. Long lens, like TV.
  // Set pieces and goals cut to their own angle, the way the arcade does.
  const CAM_SIDE = HALF_W + 10;          // how far outside the touchline it sits
  const camPos = new THREE.Vector3(0, 14, CAM_SIDE);
  const camAim = new THREE.Vector3(0, 1.1, 0);

  function setFov(f, dt) {
    if (Math.abs(camera.fov - f) > 0.04) {
      camera.fov = lerp(camera.fov, f, clamp(dt * 3.2, 0, 1));
      camera.updateProjectionMatrix();
    }
  }

  function updateCamera(dt) {
    const bs = ball.v.length();
    let pos, aim, fov, snapK = 4.2;

    if (G.state === 'goal') {
      // in behind the net that was just breached
      const side = G.lastScorer === 0 ? 1 : -1;
      pos = new THREE.Vector3(side * (HALF_L + 13), 4.2, ball.p.z * 0.5 + side * 2);
      aim = new THREE.Vector3(side * (HALF_L - 4), 1.4, ball.p.z * 0.4);
      fov = 46; snapK = 2.4;

    } else if (G.state === 'restart' || G.state === 'kickoff') {
      // pull right back so you can read the whole pitch before you play it
      const bx = clamp(ball.p.x, -HALF_L, HALF_L) * 0.35;
      pos = new THREE.Vector3(bx, 38, HALF_W + 40);
      aim = new THREE.Vector3(bx, 0, 0);
      fov = 44; snapK = 2.2;

    } else {
      const hot = Math.abs(ball.p.x) > HALF_L - 19 || (!ball.owner && bs > 38);
      const dist = hot ? CAM_SIDE - 5 : CAM_SIDE;
      const h = hot ? 10.5 : 14;
      fov = hot ? 16.5 : 23;
      // trail the ball slightly so play runs into frame rather than sitting dead centre
      const lead = clamp(ball.v.x * 0.16, -7, 7);
      pos = new THREE.Vector3(clamp(ball.p.x + lead, -HALF_L - 6, HALF_L + 6) * 0.94,
                              h, dist + clamp(ball.p.z * 0.16, -4, 4));
      aim = new THREE.Vector3(clamp(ball.p.x, -HALF_L - 4, HALF_L + 4), 1.1, ball.p.z * 0.30);
    }

    camPos.lerp(pos, clamp(dt * snapK, 0, 1));
    camAim.lerp(aim, clamp(dt * (snapK + 1.6), 0, 1));
    setFov(fov, dt);
    camera.position.copy(camPos);
    camera.lookAt(camAim);
  }

  // ---------------------------------------------------------- loop
  // Fixed 60Hz simulation, the way the arcade board ran it: the physics never
  // sees a variable dt, so shots and tackles behave identically on every machine.
  const STEP = 1 / 60;
  let last = performance.now(), acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const real = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (G.state === 'menu') {
      menuSpin(real); render();
      if (radar) radar.style.display = 'none';
      return;
    }
    if (radar) radar.style.display = '';
    acc += real;
    if (acc > STEP * 3) acc = STEP * 3;      // never try to claw back a long stall
    let guard = 0;
    while (acc >= STEP && guard++ < 3) { acc -= STEP; tick(STEP); }
    render();
    if (G.players.length) drawRadar();
    fpsTick(now);
  }

  function tick(dt) {
    G.t += dt;
    if (capTimer > 0) { capTimer -= dt; if (capTimer <= 0) ui.cap.classList.remove('show'); }
    G.stateTimer -= dt;

    switch (G.state) {
      case 'kickoff':
      case 'restart':
        if (G.stateTimer <= 0) { G.state = 'play'; G.taker = null; }
        break;
      case 'goal':
        if (G.stateTimer <= 0) { if (G.golden) finish(); else kickoff(1 - G.lastScorer); }
        break;
      case 'halftime':
        if (G.stateTimer <= 0) { G.half = 2; G.clock = 0; kickoff(1, 'Β΄ ΗΜΙΧΡΟΝΟ'); }
        break;
      case 'play':
        G.clock += dt;
        if (G.golden) {
          // sudden death: the next goal ends it. A stalemate falls to the
          // stronger side after three minutes so a run can never hang.
          if (G.clock > 180) {
            const meId = G.cup.me, oppTie = myTie();
            const opp = oppTie.a === meId ? oppTie.b : oppTie.a;
            const win = TEAMS[meId].rate >= TEAMS[opp].rate;
            G.score[win ? G.human : 1 - G.human]++;
            finish();
          }
          break;
        }
        if (G.clock >= HALF_SECONDS) {
          if (G.half === 1) {
            G.state = 'halftime'; G.stateTimer = 2.6;
            caption('ΗΜΙΧΡΟΝΟ', G.score[0] + ' – ' + G.score[1], 2.4); Audio.whistle();
          } else {
            finish();
          }
        }
        break;
    }

    if (G.state !== 'fulltime') {
      autoSwitch();
      humanInput(dt);
      for (const p of G.players) updatePlayer(p, dt);
      updateRef(dt);
      separate();
      if (G.state === 'play' || G.state === 'goal') {
        stepBall(dt);
        tryTakeBall(dt);
        boundaries();
      } else if (G.state === 'kickoff' || G.state === 'restart') {
        stepBall(dt);
      }
      // excitement
      const near = Math.abs(ball.p.x) > HALF_L - 22 ? 0.13 : 0.06;
      Audio.excite(near);
    }

    // ball visuals
    ball.mesh.position.copy(ball.p);
    ball.mesh.rotation.x += ball.v.z * dt * 0.9;
    ball.mesh.rotation.z -= ball.v.x * dt * 0.9;
    ballShadow.position.set(ball.p.x, 0.04, ball.p.z);
    const sc = clamp(1.3 - ball.p.y * 0.08, 0.45, 1.3);
    ballShadow.scale.set(sc, sc, sc);

    // selection ring
    if (G.controlled) {
      ring.visible = true;
      ring.position.set(G.controlled.p.x, 0.06, G.controlled.p.z);
      marker.visible = true;
      marker.position.set(G.controlled.p.x, 2.95 + Math.sin(G.t * 6) * 0.10, G.controlled.p.z);
    } else { ring.visible = false; marker.visible = false; }
    const bs = ball.v.length();
    pushTrail(!ball.owner && bs > 26);

    updateCamera(dt);
    refreshHud();
  }

  function render() { renderer.render(scene, camera); }

  // An honest frame counter beats "it feels laggy" — it gives us a number.
  let fpsN = 0, fpsT = 0, fpsEl = null;
  function fpsTick(now) {
    fpsN++;
    if (!fpsT) fpsT = now;
    if (now - fpsT < 500) return;
    const fps = Math.round(fpsN * 1000 / (now - fpsT));
    fpsN = 0; fpsT = now;
    if (!fpsEl) fpsEl = $('fps');
    const calls = renderer.info && renderer.info.render ? renderer.info.render.calls : 0;
    if (fpsEl) fpsEl.textContent = fps + ' FPS · ' + calls + ' draws';
  }

  // Bottom-centre radar: every player and the ball, the whole pitch at a glance.
  let radar = null, rctx = null, radarTried = false;
  function drawRadar() {
    if (!radarTried) { radarTried = true; radar = $('radar'); rctx = radar ? radar.getContext('2d') : null; }
    if (!rctx || !G.teamInfo[0]) return;
    const W = radar.width, H = radar.height;
    rctx.clearRect(0, 0, W, H);
    rctx.fillStyle = 'rgba(16,72,30,0.72)'; rctx.fillRect(0, 0, W, H);
    rctx.strokeStyle = 'rgba(235,245,255,0.55)'; rctx.lineWidth = 2;
    rctx.strokeRect(3, 3, W - 6, H - 6);
    rctx.beginPath(); rctx.moveTo(W / 2, 3); rctx.lineTo(W / 2, H - 3); rctx.stroke();
    rctx.beginPath(); rctx.arc(W / 2, H / 2, H * 0.14, 0, 7); rctx.stroke();
    for (const sx of [-1, 1]) {
      const bw = W * 0.14, bh = H * 0.42;
      rctx.strokeRect(sx > 0 ? W - 3 - bw : 3, (H - bh) / 2, bw, bh);
    }
    const X = x => (x + HALF_L) / (HALF_L * 2) * (W - 8) + 4;
    const Y = z => (z + HALF_W) / (HALF_W * 2) * (H - 8) + 4;
    for (const p of G.players) {
      const r = p.isGK ? 4.5 : 5.5;
      rctx.fillStyle = 'rgba(0,0,0,0.5)';
      rctx.beginPath(); rctx.arc(X(p.p.x) + 1, Y(p.p.z) + 1, r, 0, 7); rctx.fill();
      rctx.fillStyle = hex(G.teamInfo[p.team].shirt);
      rctx.beginPath(); rctx.arc(X(p.p.x), Y(p.p.z), r, 0, 7); rctx.fill();
      rctx.strokeStyle = 'rgba(255,255,255,0.75)'; rctx.lineWidth = 1;
      rctx.beginPath(); rctx.arc(X(p.p.x), Y(p.p.z), r, 0, 7); rctx.stroke();
    }
    if (G.controlled) {
      rctx.strokeStyle = '#ffd21e'; rctx.lineWidth = 2.5;
      rctx.beginPath(); rctx.arc(X(G.controlled.p.x), Y(G.controlled.p.z), 9, 0, 7); rctx.stroke();
    }
    rctx.fillStyle = '#ffffff';
    rctx.beginPath(); rctx.arc(X(ball.p.x), Y(ball.p.z), 4, 0, 7); rctx.fill();
    rctx.strokeStyle = '#111'; rctx.lineWidth = 1.4;
    rctx.beginPath(); rctx.arc(X(ball.p.x), Y(ball.p.z), 4, 0, 7); rctx.stroke();
  }

  function menuSpin(dt) {
    G.t += dt;
    const a = G.t * 0.12;
    camera.position.set(Math.cos(a) * 78, 30, Math.sin(a) * 78);
    camera.lookAt(0, 2, 0);
  }

  function finish() {
    // A cup tie cannot end level: golden goal, 1997 rules.
    if (G.mode === 'cup' && G.score[0] === G.score[1] && !G.golden) {
      G.golden = true; G.half = 3; G.clock = 0;
      caption('ΠΑΡΑΤΑΣΗ', 'ΑΙΦΝΙΔΙΟΣ ΘΑΝΑΤΟΣ', 2.6);
      kickoff(Math.random() < 0.5 ? 0 : 1, 'ΠΑΡΑΤΑΣΗ');
      return;
    }
    G.state = 'fulltime';
    Audio.whistle();
    if (G.mode === 'cup') { cupResult(G.score[G.human], G.score[1 - G.human]); return; }
    $('ftScore').textContent = G.score[0] + ' – ' + G.score[1];
    $('ftTeams').textContent = G.teamInfo[0].name + '  vs  ' + G.teamInfo[1].name;
    const mine = G.score[G.human], theirs = G.score[1 - G.human];
    $('ftLine').textContent = mine > theirs ? 'ΝΙΚΗ!' : mine < theirs ? 'ΗΤΤΑ' : 'ΙΣΟΠΑΛΙΑ';
    hook('onMatchEnd', { won: mine > theirs, score: mine + '-' + theirs,
                         teamName: G.teamInfo[G.human].name, ab: G.teamInfo[G.human].ab });
    $('fulltime').classList.remove('hidden');
  }

  // ================================================== ΚΥΠΕΛΛΟ ΕΛΛΑΔΟΣ
  // Eight-team knockout: quarters, semis, final. Lose once and the run ends,
  // the way an arcade cabinet ends a credit.
  // With eight or more clubs the cup is quarters/semis/final; a smaller roster
  // (the six-club shop build) runs semis and a final instead of repeating teams.
  const CUP_SIZE = () => (TEAMS.length >= 8 ? 8 : 4);
  const NAMES_8 = ['ΠΡΟΗΜΙΤΕΛΙΚΑ', 'ΗΜΙΤΕΛΙΚΑ', 'ΤΕΛΙΚΟΣ'];
  const OUT_8 = ['ΤΕΛΟΣ ΣΤΑ ΠΡΟΗΜΙΤΕΛΙΚΑ', 'ΤΕΛΟΣ ΣΤΑ ΗΜΙΤΕΛΙΚΑ', 'ΧΑΜΕΝΟΣ ΤΕΛΙΚΟΣ'];
  const ROUND_NAMES = () => (CUP_SIZE() === 8 ? NAMES_8 : NAMES_8.slice(1));
  const ROUND_OUT = () => (CUP_SIZE() === 8 ? OUT_8 : OUT_8.slice(1));

  /** Poisson scoreline weighted by the two ratings; knockouts cannot end level. */
  function simMatch(a, b) {
    const ra = TEAMS[a].rate, rb = TEAMS[b].rate;
    const draw = x => {
      x = Math.max(0.25, x);
      let k = 0, p = Math.exp(-x), c = p;
      const u = Math.random();
      while (u > c && k < 7) { k++; p *= x / k; c += p; }
      return k;
    };
    let sa = draw(1.15 + (ra - rb) * 0.30), sb = draw(1.15 + (rb - ra) * 0.30);
    if (sa === sb) { if (ra + rnd(0, 1.8) >= rb + rnd(0, 1.8)) sa++; else sb++; }
    return [sa, sb];
  }

  function cupStart(humanTeam) {
    const pool = TEAMS.map((_, i) => i).filter(i => i !== humanTeam);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const size = CUP_SIZE();
    const field = [humanTeam].concat(pool.slice(0, size - 1));
    for (let i = field.length - 1; i > 0; i--) {   // draw the bracket
      const j = (Math.random() * (i + 1)) | 0;
      [field[i], field[j]] = [field[j], field[i]];
    }
    const tie = (a, b) => ({ a: a === undefined ? null : a, b: b === undefined ? null : b, sa: null, sb: null, w: null });
    const rounds = [];
    for (let n = size / 2; n >= 1; n /= 2) {
      const row = [];
      for (let i = 0; i < n; i++) {
        row.push(rounds.length === 0 ? tie(field[i * 2], field[i * 2 + 1]) : tie());
      }
      rounds.push(row);
    }
    G.cup = { me: humanTeam, round: 0, rounds: rounds };
    G.mode = 'cup';
    showBracket();
  }

  function myTie() {
    return G.cup.rounds[G.cup.round].find(t => t.a === G.cup.me || t.b === G.cup.me);
  }

  function renderBracket() {
    const el = $('bracket');
    const me = G.cup.me;
    const row = (id, score, won, live) => {
      if (id === null) return `<div class="lost">—<b></b></div>`;
      const cls = [];
      if (id === me) cls.push('you');
      if (won === true) cls.push('won');
      if (won === false) cls.push('lost');
      return `<div class="${cls.join(' ')}">${TEAMS[id].ab}<b>${score === null ? '' : score}</b></div>`;
    };
    el.innerHTML = G.cup.rounds.map((round, ri) => `
      <div class="bcol">
        <h4>${ROUND_NAMES()[ri]}</h4>
        ${round.map(t => `<div class="tie">
            ${row(t.a, t.sa, t.w === null ? null : t.w === t.a)}
            ${row(t.b, t.sb, t.w === null ? null : t.w === t.b)}
          </div>`).join('')}
      </div>`).join('');
  }

  function showBracket() {
    G.state = 'menu';
    $('menu').classList.add('hidden');
    $('fulltime').classList.add('hidden');
    $('cup').classList.remove('hidden');
    $('cupRound').textContent = ROUND_NAMES()[G.cup.round];
    renderBracket();
    const t = myTie();
    const opp = t.a === G.cup.me ? t.b : t.a;
    $('cupNext').innerHTML = `<em>${TEAMS[G.cup.me].name}</em> &nbsp;—&nbsp; <em>${TEAMS[opp].name}</em>`;
  }

  $('cupGo').onclick = () => {
    const t = myTie();
    const opp = t.a === G.cup.me ? t.b : t.a;
    $('cup').classList.add('hidden');
    start(G.cup.me, opp, 'cup');
  };
  $('cupQuit').onclick = () => backToMenu();

  /** Called when the human's tie is settled. */
  function cupResult(myGoals, theirGoals) {
    const c = G.cup, t = myTie();
    const won = myGoals > theirGoals;
    if (t.a === c.me) { t.sa = myGoals; t.sb = theirGoals; }
    else { t.sb = myGoals; t.sa = theirGoals; }
    t.w = won ? c.me : (t.a === c.me ? t.b : t.a);

    // the rest of the round plays out on its own
    for (const tie of c.rounds[c.round]) {
      if (tie.w !== null) continue;
      const [sa, sb] = simMatch(tie.a, tie.b);
      tie.sa = sa; tie.sb = sb; tie.w = sa > sb ? tie.a : tie.b;
    }
    // feed the winners forward
    if (c.round < c.rounds.length - 1) {
      const next = c.rounds[c.round + 1];
      c.rounds[c.round].forEach((tie, i) => {
        const slot = next[i >> 1];
        if (i % 2 === 0) slot.a = tie.w; else slot.b = tie.w;
      });
    }

    if (!won) return cupEnd(false, myGoals, theirGoals);
    if (c.round === c.rounds.length - 1) return cupEnd(true, myGoals, theirGoals);
    c.round++;
    showBracket();
  }

  function cupEnd(champion, mine, theirs) {
    G.state = 'fulltime';
    hook('onCupEnd', { champion: champion, team: G.cup.me, teamName: TEAMS[G.cup.me].name,
                       ab: TEAMS[G.cup.me].ab, round: G.cup.round, score: mine + '-' + theirs });
    $('cup').classList.add('hidden');
    $('ftLine').textContent = champion ? 'ΚΥΠΕΛΛΟΥΧΟΣ!' : 'ΑΠΟΚΛΕΙΣΤΗΚΕΣ';
    $('ftScore').textContent = mine + ' – ' + theirs;
    $('ftTeams').textContent = champion
      ? TEAMS[G.cup.me].name + ' — ΣΗΚΩΝΕΙ ΤΟ ΚΥΠΕΛΛΟ'
      : ROUND_OUT()[G.cup.round];
    $('againBtn').textContent = 'ΝΕΟ ΚΥΠΕΛΛΟ';
    $('fulltime').classList.remove('hidden');
  }

  // ---------------------------------------------------------- menu wiring
  let pick = { a: null, b: null, stage: 0, mode: 'cup' };
  const grid = $('teamGrid');
  function buildGrid() {
    grid.innerHTML = '';
    TEAMS.forEach((t, i) => {
      const el = document.createElement('div');
      el.className = 'tcard';
      el.innerHTML = `<div class="bar"><i style="background:${hex(t.shirt)}"></i><i style="background:${hex(t.shorts)}"></i></div>
                      ${t.name}<span class="city">${t.city}</span>`;
      el.onclick = () => choose(i, el);
      grid.appendChild(el);
    });
  }
  function choose(i, el) {
    Audio.boot();
    [...grid.children].forEach(c => c.classList.remove('sel'));
    el.classList.add('sel');
    if (pick.mode === 'cup') {
      pick.a = i; pick.b = null; pick.stage = 1;
      $('pickLabel').innerHTML = `<em>${TEAMS[i].name}</em> — ΣΤΟ ΚΥΠΕΛΛΟ`;
      $('startBtn').textContent = 'ΞΕΚΙΝΑ ΤΟ ΚΥΠΕΛΛΟ';
      $('startBtn').style.display = '';
      return;
    }
    if (pick.stage === 0) {
      pick.a = i; pick.stage = 1;
      $('pickLabel').innerHTML = `<em>${TEAMS[i].name}</em> — ΤΩΡΑ ΔΙΑΛΕΞΕ ΑΝΤΙΠΑΛΟ`;
      $('startBtn').style.display = 'none';
    } else {
      if (i === pick.a) return;
      pick.b = i;
      $('pickLabel').innerHTML = `<em>${TEAMS[pick.a].name}</em> &nbsp;vs&nbsp; <em>${TEAMS[i].name}</em>`;
      $('startBtn').textContent = 'ΣΕΝΤΡΑ!';
      $('startBtn').style.display = '';
    }
  }
  buildGrid();

  function setMode(m) {
    pick = { a: null, b: null, stage: 0, mode: m };
    $('modeCup').classList.toggle('on', m === 'cup');
    $('modeFriendly').classList.toggle('on', m === 'friendly');
    $('pickLabel').innerHTML = 'ΔΙΑΛΕΞΕ ΤΗΝ <em>ΟΜΑΔΑ ΣΟΥ</em>';
    $('startBtn').style.display = 'none';
    buildGrid();
  }
  $('modeCup').onclick = () => setMode('cup');
  $('modeFriendly').onclick = () => setMode('friendly');

  function backToMenu() {
    $('fulltime').classList.add('hidden');
    $('cup').classList.add('hidden');
    $('menu').classList.remove('hidden');
    $('againBtn').textContent = 'ΞΑΝΑ';
    setMode(pick.mode);
    G.state = 'menu';
  }

  $('startBtn').onclick = () => {
    if (pick.mode === 'cup') cupStart(pick.a);
    else start(pick.a, pick.b, 'friendly');
  };
  $('againBtn').onclick = () => {
    $('fulltime').classList.add('hidden');
    if (pick.mode === 'cup') cupStart(pick.a);
    else start(pick.a, pick.b, 'friendly');
  };
  $('menuBtn').onclick = backToMenu;

  function start(a, b, mode) {
    Audio.boot();
    $('menu').classList.add('hidden');
    $('cup').classList.add('hidden');
    makeTeams(a, b);
    G.mode = mode || 'friendly';
    G.golden = false;
    G.human = 0; G.score = [0, 0]; G.half = 1; G.clock = 0; G.t = 0;
    ui.abA.textContent = TEAMS[a].ab; ui.abB.textContent = TEAMS[b].ab;
    const crest = (el, t) => {
      el.innerHTML = `<i style="background:${hex(t.shirt)}"></i>` +
                     `<i style="background:${hex(t.stripe !== undefined && t.stripe !== null ? t.stripe : t.shorts)}"></i>`;
    };
    crest(ui.swA, TEAMS[a]); crest(ui.swB, TEAMS[b]);
    $('formL').innerHTML = TEAMS[a].ab + '<b>4-4-2</b>';
    $('formR').innerHTML = 'COM ' + TEAMS[b].ab + '<b>4-4-2</b>';
    ui.hint.innerHTML = '<b>J</b> ΚΟΝΤΙΝΗ ΠΑΣΑ / ΤΑΚΛΙΝ &nbsp; <b>L</b> ΜΑΚΡΙΝΗ ΠΑΣΑ &nbsp; <b>K</b> ΣΟΥΤ';
    refreshHud();
    kickoff(0, 'ΣΕΝΤΡΑ!');
    Audio.excite(0.08);
  }

  // ---------------------------------------------------------- resolution
  G.arcade = true;                    // 496x384-class buffer, nearest upscale
  function resize() { Look.applyResolution(renderer, camera, canvas, G.arcade); }
  addEventListener('resize', resize);
  resize();

  const gfxBtn = $('gfxBtn');
  if (gfxBtn) gfxBtn.onclick = () => {
    G.arcade = !G.arcade;
    gfxBtn.textContent = G.arcade ? 'ΓΡΑΦΙΚΑ: ARCADE 384p' : 'ΓΡΑΦΙΚΑ: HD';
    resize();
  };

  camera.position.set(0, 30, 78);
  camera.lookAt(0, 0, 0);

  // a few idle players on the menu pitch, for looks
  (function menuDressing() {
    makeTeams(0, 3);
    placeAll(0);
    for (const p of G.players) {
      p.mesh.position.set(p.p.x, 0, p.p.z);
      p.shadow.position.set(p.p.x, 0.03, p.p.z);
    }
    ring.visible = false;
  })();

  requestAnimationFrame(frame);
  G.ball = ball;
  window.__GAME = G;
})();
