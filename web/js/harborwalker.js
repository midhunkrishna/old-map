/* Carta Temporum — on-foot walker rig (plan/5 "Land Tour").

   A first-person walking controller that owns the camera each frame while the
   diorama is in 'walking' mode. It implements the SAME interface as the canoe
   (build → {group, spawn, update, pos, dispose}) but shares none of its
   machinery: no water, grass, wake, spray, fish or audio — just look, move,
   collide, follow the ground. The camera-seat block is lifted from
   harborcanoe.js:823-830 (minus the boat tilt).

   Controls (host feeds `input`): WASD + free mouse-look. Mouse sets yaw/pitch
   independently; W/S walk along facing, A/D strafe, Shift = faster. Collision is
   circle-vs-circle ejection (houses as bounding circles, tree trunks as boles)
   with a single pass then a reject-fallback so corners can't oscillate. Heights
   come from frame.sampleH (O(1) bilinear, or heightAt where no bake exists).
   Registered via window. */
'use strict';

window.cartaHarborWalker = function (THREE) {
  const EMPTY = [];

  return {
    build(frame, opts) {
      opts = opts || {};
      const sampleH = frame.sampleH || frame.heightAt || (() => 0);
      const seaLevel = (opts.seaLevel != null) ? opts.seaLevel : 0;
      const houses = (opts.obstacles && opts.obstacles.houses) || [];
      const streets = opts.streets || [];
      const nearTrunks = opts.nearTrunks || (() => EMPTY);
      const bake = frame.bake || null;             // for the off-grid boundary
      const radius = frame.radius || 1500;

      // real-world metres (a person is ~6 ft at the eye, ~0.45 m shoulder radius)
      const BODY_R = 0.45, EYE_STAND = 1.83;
      // gait for a 6 ft adult: preferred walk ≈ 1.4 m/s (≈5 km/h); a sprint tops
      // ≈6 m/s (≈21 km/h). Cobbled streets walk a touch quicker than soft sand.
      // Shift sprints (RUN multiplier → ~6 m/s on a street). VMAX caps it.
      const WALK_SAND = 1.15, WALK_STREET = 1.45, RUN = 4.1, VMAX = 6.2;
      const TURN_SLOW_MIN = 0.5;           // pace floor while sweeping the view fast
      const BOB_AMP = 0.06, BOB_RATE = 2.0;
      const MAX_DROP = 0.6;                // m of eye-Y change per frame (anti-punch-through)
      // the walkable lower bound: the rendered water surface sits ~0.42 m below
      // seaLevel, so the beach is dry well below seaLevel — block only at the
      // waterline, not 3 m up the sand. (Was the "invisible wall on the beach".)
      const WADE = 0.4;

      let px = 0, pz = 0, yaw = 0, pitch = 0;
      let eyeY = EYE_STAND, bobPh = 0, bobLevel = 0, lastYaw = 0;
      const group = new THREE.Group();     // empty; a debug marker could live here
      const _e = new THREE.Euler(0, 0, 0, 'YXZ');

      // ---- surface test: are we on a street (cobbles, faster) or sand? ----
      function segDist2(x, z, s) {
        const ex = s.x2 - s.x1, ez = s.z2 - s.z1;
        const L2 = ex * ex + ez * ez || 1e-6;
        let u = ((x - s.x1) * ex + (z - s.z1) * ez) / L2;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const dx = x - (s.x1 + ex * u), dz = z - (s.z1 + ez * u);
        return dx * dx + dz * dz;
      }
      function onStreet(x, z) {
        for (let i = 0; i < streets.length; i++) {
          const hw = streets[i].w * 0.5;
          if (segDist2(x, z, streets[i]) < hw * hw) return true;
        }
        return false;
      }

      // ---- collision: gather blockers near a point, then one ejection pass ----
      const _list = [];
      function gather(x, z) {
        _list.length = 0;
        const reach = BODY_R + 1;
        for (let i = 0; i < houses.length; i++) {
          const h = houses[i], dx = x - h.x, dz = z - h.z, rr = h.r + reach;
          if (dx * dx + dz * dz < rr * rr) _list.push(h);
        }
        const tr = nearTrunks(x, z, reach);
        for (let i = 0; i < tr.length; i++) _list.push(tr[i]);
        return _list;
      }
      function penetrates(x, z, list) {
        for (let i = 0; i < list.length; i++) {
          const c = list[i], dx = x - c.x, dz = z - c.z, rr = c.r + BODY_R;
          if (dx * dx + dz * dz < rr * rr - 1e-3) return true;
        }
        return false;
      }
      // returns [x,z] resolved, or null to reject the whole move (canoe semantics)
      function resolve(nx, nz) {
        const list = gather(nx, nz);
        let bx = nx, bz = nz;
        for (let i = 0; i < list.length; i++) {       // single ejection pass
          const c = list[i], dx = bx - c.x, dz = bz - c.z, rr = c.r + BODY_R;
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr) {
            const d = Math.sqrt(d2) || 1e-4;
            bx = c.x + (dx / d) * rr; bz = c.z + (dz / d) * rr;
          }
        }
        if (penetrates(bx, bz, list)) return null;    // wedged in a corner → keep last good
        return [bx, bz];
      }

      // stay on the island: not into the sea, not off the baked grid (which would
      // clamp to a flat edge value and let the player stroll out over the water).
      function inBounds(x, z) {
        if (bake) return x >= bake.x0 && x <= bake.x0 + bake.w && z >= bake.z0 && z <= bake.z0 + bake.d;
        return Math.hypot(x, z) < radius;
      }

      function spawn(x, z, yaw0) {
        yaw = yaw0 || 0; lastYaw = yaw; pitch = 0; bobPh = 0; bobLevel = 0;
        // eject so a beachfront house/palm at the landing point can't trap us frame 1
        const list = gather(x, z);
        let bx = x, bz = z;
        for (let i = 0; i < list.length; i++) {
          const c = list[i], dx = bx - c.x, dz = bz - c.z, rr = c.r + BODY_R;
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr) { const d = Math.sqrt(d2) || 1e-4; bx = c.x + (dx / d) * rr; bz = c.z + (dz / d) * rr; }
        }
        px = bx; pz = bz;
        eyeY = sampleH(px, pz) + EYE_STAND;
        return { x: px, z: pz, heading: yaw };
      }

      function update(dt, t, input, camera) {
        dt = Math.min(0.05, Math.max(1e-4, dt));
        input = input || {};
        yaw = input.camYaw || 0;
        pitch = Math.max(-1.5, Math.min(1.5, input.camPitch || 0));

        // facing frame: forward = camera look dir, right = camera local +X (world)
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        const rx = Math.cos(yaw), rz = -Math.sin(yaw);
        const mvF = (input.fwd ? 1 : 0) - (input.back ? 1 : 0);
        const mvR = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        let dx = fx * mvF + rx * mvR, dz = fz * mvF + rz * mvR;
        const dl = Math.hypot(dx, dz);
        const moving = dl > 1e-4;

        let curSpeed = 0;
        if (moving) {
          dx /= dl; dz /= dl;
          let speed = onStreet(px, pz) ? WALK_STREET : WALK_SAND;
          const turnRate = Math.abs(yaw - lastYaw) / dt;             // rad/s of view sweep
          speed *= 1 - (1 - TURN_SLOW_MIN) * Math.min(1, turnRate / 3);
          if (input.run) speed *= RUN;
          if (speed > VMAX) speed = VMAX;
          curSpeed = speed;
          const stepLen = Math.min(speed * dt, BODY_R * 0.9);        // cap < BODY_R: no tunnelling
          const nx = px + dx * stepLen, nz = pz + dz * stepLen;
          if (sampleH(nx, nz) >= seaLevel - WADE && inBounds(nx, nz)) {   // block only at the waterline
            const r = resolve(nx, nz);
            if (r) { px = r[0]; pz = r[1]; }
          }
        }
        lastYaw = yaw;

        // ground-follow with a per-frame clamp so steep grade doesn't punch the camera
        const targetEye = sampleH(px, pz) + EYE_STAND;
        const dEye = targetEye - eyeY;
        eyeY += Math.abs(dEye) > MAX_DROP ? (dEye < 0 ? -MAX_DROP : MAX_DROP) : dEye;

        // head bob: eased in/out with travel
        bobLevel += ((moving ? 1 : 0) - bobLevel) * Math.min(1, dt * 8);
        bobPh += curSpeed * dt * BOB_RATE;
        const bob = Math.sin(bobPh) * BOB_AMP * bobLevel;

        camera.position.set(px, eyeY + bob, pz);
        _e.set(pitch, yaw, 0, 'YXZ');
        camera.quaternion.setFromEuler(_e);
      }

      function pos() { return { x: px, z: pz, heading: yaw }; }
      function dispose() { /* group is empty; nothing heavy to free */ }

      return { group, spawn, update, pos, dispose };
    },
  };
};
