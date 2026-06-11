/* Carta Temporum — harborbirds module: a wheeling flock of gulls over the
   diorama harbour. Each bird is a low-poly body with a head, beak, fanned tail
   and two swept, multi-segment wings that flap; it glides a lazy circular/
   figure-eight path at altitude, banking into its turns. The flock is small
   (~26), so a handful of cloned Groups is cheaper to reason about than
   instancing — and the per-frame cost is trivial even with the richer mesh.
   Consumed by harbordiorama.js; gated, like everything, at tier ≥ 3. */
'use strict';

window.cartaHarborBirds = function cartaHarborBirds(THREE) {
  // A swept gull wing as a small triangle strip (metres; symbolic ~12 m span
  // like the ships are drawn out of scale). Root at the body, sweeping out and
  // back with a little camber and a drooped tip — a few segments so it reads as
  // a real wing, not a paper dart. side: +1 right, −1 left.
  function wingGeo(side) {
    const s = side;
    const g = new THREE.BufferGeometry();
    // leading edge (LE) and trailing edge (TE) points from root → tip
    const P = [
      0.0, 0.00, 0.0,        // 0 root LE
      0.0, -0.05, 1.0,       // 1 root TE
      s * 2.0, 0.12, -0.2,   // 2 inner LE
      s * 1.7, 0.00, 0.95,   // 3 inner TE
      s * 4.2, 0.06, -0.6,   // 4 outer LE
      s * 3.4, -0.06, 0.55,  // 5 outer TE
      s * 6.1, -0.22, -0.25, // 6 tip
    ];
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    // wind triangles so each pair faces the same way (DoubleSide anyway)
    g.setIndex([
      0, 2, 1, 1, 2, 3,
      2, 4, 3, 3, 4, 5,
      4, 6, 5,
    ]);
    g.computeVertexNormals();
    return g;
  }

  function buildProto() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xe9e3d4 });
    const wingMat = new THREE.MeshLambertMaterial({ color: 0xf3efe6, side: THREE.DoubleSide });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0xb9a070 }); // beak / wingtips

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), bodyMat);
    body.scale.set(0.5, 0.5, 2.2);            // slim, nose toward −Z
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), bodyMat);
    head.position.set(0, 0.12, -1.7);
    g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 6), darkMat);
    beak.rotation.x = -Math.PI / 2;           // point forward (−Z)
    beak.position.set(0, 0.06, -2.15);
    g.add(beak);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 4), bodyMat);
    tail.rotation.x = Math.PI / 2;            // fan back (+Z), flattened
    tail.scale.set(1, 0.18, 1);
    tail.position.set(0, 0, 1.7);
    g.add(tail);

    const wingR = new THREE.Mesh(wingGeo(1), wingMat);
    const wingL = new THREE.Mesh(wingGeo(-1), wingMat);
    g.add(wingR, wingL);
    g.userData.wingR = wingR;
    g.userData.wingL = wingL;
    g.userData.wingIdx = [g.children.indexOf(wingR), g.children.indexOf(wingL)];
    return g;
  }

  // build(radius) → { group, update(t), dispose }
  function build(radius) {
    const group = new THREE.Group();
    const proto = buildProto();
    const N = 26;                               // half the former flock
    const alt0 = radius * 0.07;
    // gulls drawn a touch out of scale (as the ships are) so they read at range
    const sizeMul = Math.max(2.2, radius * 0.0016);
    const birds = [];
    for (let i = 0; i < N; i++) {
      const b = proto.clone(true);
      // clones share geometry/material; re-grab the per-clone wing refs
      const [ir, il] = proto.userData.wingIdx;
      b.userData.wingR = b.children[ir];
      b.userData.wingL = b.children[il];
      group.add(b);
      const r01 = (i * 2654435761 % 1000) / 1000;   // cheap deterministic spread
      const r02 = (i * 40503 % 997) / 997;
      birds.push({
        mesh: b,
        cx: (r01 - 0.5) * radius * 0.5,             // path centre, near the harbour
        cz: (r02 - 0.5) * radius * 0.5,
        pr: radius * (0.22 + r01 * 0.5),            // path radius
        alt: alt0 + r02 * radius * 0.11,
        spd: (0.09 + r02 * 0.11) * (i % 2 ? 1 : -1), // direction & speed (slowed ~half)
        fig8: r01 > 0.6,                            // some fly figure-eights
        phase: r01 * Math.PI * 2,
        flapF: 3.2 + r02 * 2.0,                     // gentler, slower wingbeat
        scale: sizeMul * (0.8 + r01 * 0.5),
      });
      b.scale.setScalar(birds[i].scale);
    }

    const _t = new THREE.Vector3();
    function pathAt(bd, a) {
      const x = bd.cx + Math.cos(a) * bd.pr;
      const z = bd.cz + Math.sin(a) * bd.pr * (bd.fig8 ? Math.cos(a) : 1);
      const y = bd.alt + Math.sin(a * 2 + bd.phase) * radius * 0.012;
      return [x, y, z];
    }

    function update(t) {
      for (const bd of birds) {
        const a = t * bd.spd + bd.phase;
        const [x, y, z] = pathAt(bd, a);
        const [nx, ny, nz] = pathAt(bd, a + 0.04 * Math.sign(bd.spd || 1));
        bd.mesh.position.set(x, y, z);
        _t.set(nx, ny, nz);
        bd.mesh.lookAt(_t);                          // nose (−Z) along the flight path
        bd.mesh.rotateZ(Math.sign(bd.spd) * 0.32);   // bank into the turn
        const flap = Math.sin(t * bd.flapF + bd.phase) * 0.7;
        bd.mesh.userData.wingR.rotation.z = -flap;
        bd.mesh.userData.wingL.rotation.z = flap;
      }
    }

    function dispose() {
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }

    return { group, update, dispose };
  }

  return { build };
};
