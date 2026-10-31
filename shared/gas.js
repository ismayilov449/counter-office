// A real gas system (Mansion maps): a gas pipe with a meter in the kitchen and a boiler's pipe in the cellar. Shot,
// a pipe leaks; the gas fills its room and spreads from room to room through whatever is open between them (doorways,
// open or blown doors, broken windows and walls); windows, doors and holes to the outside vent it. Any spark in a room
// with enough gas sets it off. Shared by the server (lib/gas.js) and the browser (public/js/gas.js).
//
// Concentrations are a share of the room's air, 0..1 (sent as 0..Q). Volumes in m³, times in seconds.
//   step: the server's simulation step (4 Hz); leak: m³ of gas a second out of a holed pipe;
//   spread: how fast gas flows through an opening between two rooms, m³ a second per m² of opening and per unit of
//   concentration difference; vent: the same to the outside (the wind takes it); seep: the share lost every second
//   through cracks, everywhere; smell: from here you smell it; haze: from here it shimmers faintly;
//   ignite: from here a spark sets it off; rich: the strongest blast from here up; choke: from here you choke,
//   chokeDps: damage a second at choke and at full; valve: seconds of holding E to close a leaking pipe's valve,
//   reach: metres from the valve to do it; mend: without rounds (warmup, Deathmatch, Gun Game), seconds after which a
//   holed pipe is mended (and its gas stops).
export const GAS = {
  step: 0.25,
  leak: 3.0,
  spread: 0.35,
  vent: 2.0,
  seep: 0.002,
  smell: 0.03,
  haze: 0.06,
  ignite: 0.2,
  rich: 0.65,
  choke: 0.4,
  chokeDps: [3, 11],
  valve: 2,
  reach: 1.3,
  mend: 60,
  Q: 250,
};

// Pipe states (in the snapshot): intact, leaking, shut off at its valve (still holed), wrecked by a blast.
export const PIPE = { ok: 0, leak: 1, shut: 2, wrecked: 3 };

// The room (index into map.rooms) a point is in, or -1.
export function gasRoomAt(rooms, p, pad = 0.02) {
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    if (p[0] > r.min[0] - pad && p[0] < r.max[0] + pad && p[1] > r.min[1] - pad && p[1] < r.max[1] + pad && p[2] > r.min[2] - pad && p[2] < r.max[2] + pad) return i;
  }
  return -1;
}

// The gas pipes of a map: its { type: 'gaspipe' } decor (see shared/maps/mansion_gas.js), in order.
export const gasPipes = map => (map?.decor || []).filter(d => d.type === 'gaspipe');
