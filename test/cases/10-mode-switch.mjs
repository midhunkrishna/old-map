// Characterize the tour camera mode switch (enterTour ~869-872 / exitTour ~895-898).
// enterTour: fov 70, near 0.1, far radius*10. exitTour: fov 38, near radius*0.012, far radius*16.
// enterTour requires window.cartaHarborCanoe; we install a stub canoe rig.
// enterTour/exitTour are wired to the 'Tour the harbour' and 'Return to overview'
// buttons; we drive them via their recorded click handlers.
import { loadDiorama, makeWindow, makeCarta } from '../lib/stubs.mjs';
import { assertSnapshot } from '../lib/assert.mjs';

function hostKids(win) {
  return win.document.body._kids.find((k) => k.id === 'carta-diorama')._kids;
}
function byClass(kids, cls) { return kids.find((k) => k.classList && k.classList.contains(cls)); }

export default async function () {
  const win = makeWindow();
  win.cartaHarborCanoe = (THREE) => ({
    build: (frame, opts) => ({
      group: { traverse() {} },
      spawn: () => 0,                 // returns initial yaw
      update() {},
      boatPos: () => ({ x: 0, z: 0, heading: 0 }),
      dispose() {},
    }),
  });

  const h = await loadDiorama({ win, carta: makeCarta() });
  await h.dio.open('lisbon');
  const cam = h.dio._cam;
  const radius = h.dio._frame.radius;

  const kids = hostKids(win);
  const overview = { fov: cam.fov, near: cam.near, far: cam.far };

  byClass(kids, 'dio-tour').dispatch('click', { button: 0 }); // enterTour
  const tour = { fov: cam.fov, near: cam.near, far: cam.far };

  byClass(kids, 'dio-return').dispatch('click'); // exitTour
  const back = { fov: cam.fov, near: cam.near, far: cam.far };

  assertSnapshot('mode-switch', {
    radius,
    overview,                                 // { fov:38, near:radius*0.012, far:radius*16 }
    tour: {                                   // { fov:70, near:0.1, far:radius*10 }
      fov: tour.fov, near: tour.near,
      farEqualsRadiusX10: tour.far === radius * 10,
    },
    exitRestores: {                           // back to overview rig
      fov: back.fov,
      nearEqualsRadiusX0012: back.near === Math.max(2, radius * 0.012),
      farEqualsRadiusX16: back.far === radius * 16,
    },
  });
}
