// The SWAT helicopter, the browser's part (ROADMAP 18, stage 1; rules in shared/heli.js, the server's part
// lib/heli.js): its model and pad, where it is (the snapshot's hl, smoothed; the pilot's own flying is ours), the
// pilot's controls and chase camera, a passenger's seat, the rotor's sound, the hints.
import * as THREE from 'three';
import { HELI, S, SEATS, GUNNERS, seatPos, heliBoxes, stepHeli, heliGround, nosePos } from '/shared/heli.js';

const ROTOR_Y = 3.7; // (over the street's 3.5 m walls when it stands on its pad)

// Stage 2: the door gunners' PKTs (on the model, turned the way their gunners look), the fast rope (whoever slides down
// it: the rope from the door to him; our own slide follows the server's path).
// ctx: { me, game, scene, audio, hud, send(m), map(), coll(), keys(), remotes }
export function createHeli(ctx) {
  const { me } = ctx;
  let model = null, pad = null, rotor = null, tailRotor = null, view = null; // view: { p, yaw, tilt, roll, st, hp, fuel, seats }
  let own = null; // the pilot's own flying: { p, yaw, v, tilt, roll, landed, engine, sent }
  let cam = { yaw: 0, pitch: 0.25 }, spinA = 0, spinV = 0, last = 0, guns = [];
  const ropes = new Map(); // stage 2: id -> { line, until } for whoever slides down the rope
  // the pilot's flares: bright sparks falling away from it for a few seconds
  const sparks = [];
  let sparkTex = null, rocketAt = 0;
  const _dir = new THREE.Vector3();

  function build() {
    if (model) { ctx.scene.remove(model, pad); model = pad = null; }
    const H = ctx.map().heli;
    if (!H) return;
    const navy = new THREE.MeshLambertMaterial({ color: 0x1d2a44 }), dark = new THREE.MeshLambertMaterial({ color: 0x15181c });
    const glass = new THREE.MeshLambertMaterial({ color: 0x8fb4d0, transparent: true, opacity: 0.35, depthWrite: false });
    model = new THREE.Group();
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); model.add(m); return m; };
    add(new THREE.BoxGeometry(2.0, 0.9, 4.4), navy, 0, 0.9, 0); // the body below the windows
    add(new THREE.BoxGeometry(1.96, 1.0, 2.6), glass, 0, 1.85, -0.7); // the cockpit's glass (front: -z)
    add(new THREE.BoxGeometry(2.0, 0.1, 1.8), navy, 0, 2.3, 1.3); // the cabin's back: its roof and back wall, the doors open each side
    add(new THREE.BoxGeometry(2.0, 1.0, 0.1), navy, 0, 1.85, 2.15);
    guns = GUNNERS.map(i => { // the door guns: a receiver and a barrel on a pivot in each door
      const g = new THREE.Group(), side = SEATS[i][0] >= 0 ? 1 : -1;
      g.position.set(side * 1.02, 1.5, -SEATS[i][2]);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.45), dark), barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.8), dark);
      body.position.z = -0.1; barrel.position.z = -0.7;
      g.add(body, barrel);
      g.userData = { side, seat: i };
      model.add(g);
      return g;
    });
    add(new THREE.BoxGeometry(0.5, 0.6, 3.8), navy, 0, 1.65, 4.1); // the tail boom
    add(new THREE.BoxGeometry(0.12, 1.2, 0.8), navy, 0, 2.3, 5.8); // the fin
    for (const x of [-0.85, 0.85]) add(new THREE.BoxGeometry(0.1, 0.08, 4.2), dark, x, 0.04, 0); // the skids
    add(new THREE.CylinderGeometry(0.09, 0.09, ROTOR_Y - 2.35, 8), dark, 0, (ROTOR_Y + 2.35) / 2, 0); // the mast
    rotor = new THREE.Group();
    rotor.position.set(0, ROTOR_Y, 0);
    for (const a of [0, Math.PI / 2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(HELI.rotor * 2, 0.04, 0.28), dark); b.rotation.y = a; rotor.add(b); }
    model.add(rotor);
    tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 0.16), dark);
    tailRotor.position.set(0.12, 2.3, 5.9);
    model.add(tailRotor);
    model.scale.setScalar(S); // (built at full size, drawn at shared/heli.js's S)
    ctx.scene.add(model);
    // the pad: a white H in a circle on the street
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.strokeStyle = '#e8e8e8'; g.lineWidth = 14; g.beginPath(); g.arc(128, 128, 110, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#e8e8e8'; g.fillRect(78, 60, 22, 136); g.fillRect(156, 60, 22, 136); g.fillRect(78, 117, 100, 22);
    pad = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    pad.position.set(H.p[0], H.p[1] + 0.02, H.p[2]);
    ctx.scene.add(pad);
    view = { p: H.p.slice(), yaw: H.yaw, tilt: 0, roll: 0, st: 0, hp: 100, fuel: HELI.fuel, seats: [] };
  }
  const shown = () => (own && me.heli?.seat === 0 ? own : view);
  const pilotNow = () => me.alive && me.heli?.seat === 0 && own;

  return {
    load() { build(); own = null; me.heli = null; },
    handlers: {
      heliIn(m) {
        me.heli = { seat: m.seat };
        own = null;
        if (m.seat === 0) own = { p: m.h.p.slice(), yaw: m.h.yaw, v: m.h.v.slice(), tilt: 0, roll: 0, landed: true, engine: !m.h.out, sent: 0 };
        cam = { yaw: 0, pitch: 0.25 };
      },
      heliOut(m) { me.heli = null; own = null; me.p = m.p.slice(); me.v = [0, 0, 0]; me.onGround = false; me.viewY = me.p[1]; },
      slide(m) {
      const now = performance.now();
      if (m.id === me.id) { me.heli = null; own = null; me.slide = { ...m, t0: now }; }
      const old = ropes.get(m.id);
      if (old) ctx.scene.remove(old.line);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x2a2a2a }));
      line.frustumCulled = false;
      ctx.scene.add(line);
      ropes.set(m.id, { line, m, until: now + ((m.y0 - m.g) / m.v) * 1000 + 400 });
    },
    heliFlare(m) {
      ctx.audio.play('flare', m.p);
      if (!sparkTex) {
        const c = document.createElement('canvas'); c.width = c.height = 32;
        const g = c.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
        r.addColorStop(0, 'rgba(255,250,220,1)'); r.addColorStop(0.3, 'rgba(255,170,60,0.9)'); r.addColorStop(1, 'rgba(255,120,20,0)');
        g.fillStyle = r; g.fillRect(0, 0, 32, 32);
        sparkTex = new THREE.CanvasTexture(c);
      }
      for (let i = 0; i < 10; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        s.position.set(m.p[0], m.p[1] + 0.5, m.p[2]);
        s.scale.setScalar(0.7);
        ctx.scene.add(s);
        const a = (i / 10) * Math.PI * 2;
        sparks.push({ s, v: [Math.cos(a) * (3 + Math.random() * 3), 1 + Math.random() * 2, Math.sin(a) * (3 + Math.random() * 3)], t0: performance.now() });
      }
    },
    slideEnd(m) { me.slide = null; me.p = m.p.slice(); me.v = [0, 0, 0]; me.onGround = true; me.viewY = me.p[1]; },
    heliFuel(m) { if (own) own.engine = false; ctx.hud.small(m.dead ? 'HIT! The helicopter is going down — jump (E)!' : 'OUT OF FUEL! The engine stopped — get out (E)!', 4); },
    },
    snapshot(hl) {
      if (!hl || !view) return;
      const [x, y, z, yaw, tilt, roll, st, hp, fuel, seats, side = 0, rockets = 0, flares = 0] = hl;
      Object.assign(view, { target: [x, y, z], tyaw: yaw, tilt, roll, st, hp, fuel, seats, side: [null, 'T', 'CT'][side], rockets, flares });
      if (st >= 2 && own) own.engine = false; // (falling or wrecked: the server has it now)
      if (st >= 2 && me.heli?.seat === 0) own = null;
    },
    piloting: () => !!pilotNow(),
    // Q in it: on the ground, to a door gun and back (like the pickup's gun).
    // Mouse1 flying: a nose rocket toward what the middle of the screen is on.
    rocket(camera) {
      if (!pilotNow() || view.st >= 2) return;
      const now = performance.now();
      if (now < rocketAt) return;
      if (!(view.rockets > 0)) { ctx.hud.small('No rockets left', 1.5); return; }
      rocketAt = now + HELI.rocketGap * 1000;
      camera.getWorldDirection(_dir);
      const c = [camera.position.x, camera.position.y, camera.position.z], d = [_dir.x, _dir.y, _dir.z];
      const hit = ctx.coll().raycast(c, d, 250, 'bullet', 'heli'), t = hit ? hit.t : 250;
      const o = nosePos(own), aim = [c[0] + d[0] * t - o[0], c[1] + d[1] * t - o[1], c[2] + d[2] * t - o[2]], l = Math.hypot(...aim) || 1;
      ctx.send({ t: 'heliRocket', d: aim.map(v => Math.round((v / l) * 1000) / 1000) });
      ctx.audio.play('shot', null, 'rpg26');
    },
    // G flying: flares.
    flare() {
      if (!pilotNow() || view.st >= 2) return;
      if (!(view.flares > 0)) { ctx.hud.small('No flares left', 1.5); return; }
      ctx.send({ t: 'heliFlare' });
    },
    swap() {
      if (view?.st === 1) { ctx.hud.small('Land first to change seats', 2); return; }
      ctx.send({ t: 'heliSeat' });
    },
    seated: () => me.alive && !!me.heli,
    gunner: () => me.alive && GUNNERS.includes(me.heli?.seat),
    // The mouse while flying: it turns, the camera's pitch.
    mouse(dx, dy, k) {
      if (!pilotNow()) return false;
      own.yaw -= dx * k;
      cam.pitch = Math.max(-0.3, Math.min(1.2, cam.pitch + dy * k));
      return true;
    },
    // Our own movement in it (true: handled): the pilot flies; a passenger sits.
    local(dt) {
      if (me.alive && me.slide) { // (down the rope: where the server has us)
        const s = me.slide;
        me.p = [s.x, Math.max(s.g, s.y0 - (s.v * (performance.now() - s.t0)) / 1000), s.z];
        me.v = [0, 0, 0]; me.crouch = false; me.jumpQueued = false; me.viewY = me.p[1];
        return true;
      }
      if (!me.alive || !me.heli) return false;
      const keys = ctx.keys();
      if (pilotNow()) {
        const input = { fwd: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), side: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), up: (keys.has('Space') ? 1 : 0) - (keys.has('ControlLeft') ? 1 : 0) };
        const crash = stepHeli(own, input, dt, ctx.coll().move('heli', own.p, 9), own.engine);
        if (crash > HELI.hard) ctx.send({ t: 'heliHit', s: Math.round(crash * 10) / 10 });
        ctx.coll().heli = heliBoxes(own);
        const now = performance.now();
        if (now - own.sent > 50) {
          own.sent = now;
          const r3 = v => Math.round(v * 1000) / 1000;
          const g = heliGround(ctx.coll().move('heli', own.p, 9), own.p, own.yaw);
          ctx.send({ t: 'heli', p: own.p.map(r3), yaw: r3(own.yaw), v: own.v.map(r3), tilt: r3(own.tilt), roll: r3(own.roll), air: own.p[1] - g > 0.15 ? 1 : 0 });
        }
      }
      const h = shown();
      if (h) me.p = seatPos(h, me.heli.seat);
      me.v = [0, 0, 0]; me.crouch = true; me.eyeH = 1.0; me.onGround = true; me.jumpQueued = false; me.viewY = me.p[1];
      return true;
    },
    // The pilot's chase camera (true when it set it).
    camera(camera) {
      if (!pilotNow()) return false;
      const t = [own.p[0], own.p[1] + 1.3, own.p[2]], yaw = own.yaw + cam.yaw, p = cam.pitch;
      const dir = [Math.sin(yaw) * Math.cos(p), Math.sin(p), Math.cos(yaw) * Math.cos(p)];
      const hit = ctx.coll().raycast(t, dir, 8, 'solid'), d = hit ? Math.max(1.5, hit.t - 0.3) : 8;
      camera.position.set(t[0] + dir[0] * d, t[1] + dir[1] * d, t[2] + dir[2] * d);
      camera.lookAt(t[0], t[1], t[2]);
      return true;
    },
    hint() {
      if (!view || !ctx.map().heli) return null;
      if (me.alive && me.heli) {
        const fuel = Math.ceil(view.fuel), hull = view.hp, gun = GUNNERS.includes(me.heli.seat), q = view.st === 1 ? '' : gun ? ' · Q: leave the gun' : ' · Q: a door gun';
        return me.heli.seat === 0
          ? `${me.team === 'T' ? 'STOLEN HELICOPTER · ' : 'HELICOPTER · '}fuel ${fuel} s · hull ${hull}% · Mouse1 rocket (${view.rockets}) · G flares (${view.flares}) · W/S A/D fly · Space up · Ctrl down · E: get out${q}`
          : `${gun ? 'DOOR GUN · Mouse1 fires (no reloads)' : 'In the helicopter'} · hull ${hull}% · E: ${view.st === 1 ? 'slide down the rope (hovering slowly) or jump' : 'get out'}${q}`;
      }
      if (!me.alive || (me.team !== 'CT' && me.team !== 'T') || view.st >= 2) return null;
      const h = shown();
      if (Math.hypot(me.p[0] - h.p[0], me.p[2] - h.p[2]) > HELI.reach || Math.abs(me.p[1] - h.p[1]) > 2.5) return null;
      const free = SEATS.findIndex((_, i) => !(view.seats?.[i]));
      if (free < 0) return 'The helicopter is full';
      if (view.side && view.side !== me.team) return null;
      if (me.team === 'T') return free === 0 ? 'Press E to steal the helicopter and fly it' : 'Press E to get into the stolen helicopter';
      return free === 0 ? `Press E to fly the helicopter (fuel ${Math.ceil(view.fuel)} s)` : 'Press E to get into the helicopter';
    },
    frame(now) {
      const dt = Math.min(0.1, (now - (last || now)) / 1000);
      last = now;
      if (!model || !view) return;
      // others' view: ease towards the snapshot
      if (view.target) {
        const k = Math.min(1, dt * 10);
        for (let i = 0; i < 3; i++) view.p[i] += (view.target[i] - view.p[i]) * k;
        let dy = view.tyaw - view.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        view.yaw += dy * k;
      }
      const h = shown();
      if (!own || me.heli?.seat !== 0) ctx.coll().heli = heliBoxes(view);
      model.position.set(h.p[0], h.p[1], h.p[2]);
      model.rotation.set(h.tilt || 0, h.yaw, -(h.roll || 0), 'YXZ');
      // the rotor spins up while anyone is in it (or it flies), down when it's empty or wrecked
      const running = view.st === 1 || (view.st === 0 && view.seats?.some(Boolean)) || (own && own.engine);
      spinV += ((running && view.st !== 3 ? 1 : 0) - spinV) * Math.min(1, dt * 0.8);
      spinA += spinV * dt * 28;
      rotor.rotation.y = spinA;
      tailRotor.rotation.x = spinA * 1.7;
      model.visible = true;
      model.children[0].material.color.setHex(view.st === 3 ? 0x1a1a1a : 0x1d2a44);
      // the door guns turn the way their gunners look; an empty one points out of its door
      for (const g of guns) {
        const id = view.seats?.[g.userData.seat], r = id && (id === me.id ? me : ctx.remotes.get(id));
        const yaw = r ? (r === me ? me.yaw : r.yaw) - h.yaw : -g.userData.side * Math.PI / 2, pitch = r ? (r === me ? me.pitch : r.pitch) : -0.2;
        g.rotation.set(pitch, yaw, 0, 'YXZ');
        g.visible = !(r === me); // (our own: the view model)
      }
      // the fast ropes: from the door over its slider to him
      for (const [id, l] of ropes) {
        const who = id === me.id ? me : ctx.remotes.get(id);
        if (now > l.until || !who) { ctx.scene.remove(l.line); l.line.geometry.dispose(); ropes.delete(id); continue; }
        const pos = l.line.geometry.attributes.position;
        pos.setXYZ(0, l.m.x, Math.max(h.p[1] + 1.6, l.m.y0 + 1.5), l.m.z);
        pos.setXYZ(1, who.p[0], who.p[1] + 1.6, who.p[2]);
        pos.needsUpdate = true;
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const k = sparks[i], age = (now - k.t0) / 1000;
        if (age > 2.5) { ctx.scene.remove(k.s); k.s.material.dispose(); sparks.splice(i, 1); continue; }
        k.v[1] -= 4 * dt;
        k.s.position.x += k.v[0] * dt; k.s.position.y += k.v[1] * dt; k.s.position.z += k.v[2] * dt;
        k.s.material.opacity = 1 - age / 2.5;
      }
      ctx.audio.engine('heli', [h.p[0], h.p[1] + 2, h.p[2]], 17 * spinV, spinV > 0.05);
    },
    died() { me.heli = null; own = null; me.slide = null; },
  };
}
