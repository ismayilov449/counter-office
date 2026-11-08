// Underground & vents on the server (cs_mansion, cs_mansion_night; see shared/underground.js).
//   1. No radar underground: a player down there gets no enemies in his snapshot ("sp": his radar shows static), can't
//      ping or call in a target, isn't spotted onto anyone's radar and spots nobody onto his team's (server.js asks
//      under() in spots(), the snapshot, onPing and onSpot).
import { isUnderground } from '../shared/underground.js';

export const UG_MSG = 'No signal underground — no radar, pings or target calls down here.';

export function createUnderground(api) {
  // api: map(), world(), game, now(), broadcast(msg), send(p, msg)
  const under = p => isUnderground(api.map(), p);

  // 1. the radar: a live player underground gets no spotted enemies (his radar shows static)
  const noRadar = p => !!p.alive && under(p.p);
  // a ping or a target call from underground: refused, with a message (true: refused)
  function refuse(p) {
    if (!p.alive || !under(p.p)) return false;
    api.send(p, { t: 'msg', text: UG_MSG });
    return true;
  }

  return { under, noRadar, refuse };
}
