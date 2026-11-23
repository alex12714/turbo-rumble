import type { Phase, Snapshot } from '../shared/types.ts';

/** `?embed=1`: the page runs inside another site's iframe (e.g. a video-call stage). */
export const embedded =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('embed') === '1';
/** Query string that keeps embed mode across in-app navigation. */
export const embedQuery = () => (embedded ? '?embed=1' : '');

export interface RumbleStatus {
  type: 'rumble:status';
  room: string;
  state: Phase;
  round: number;
  /** Controller URL for phones (render it as a QR) or a desktop side pane. */
  joinUrl: string;
  players: {
    id: string;
    name: string;
    bot: boolean;
    connected: boolean;
    ready: boolean;
    score: number;
    wins: number;
  }[];
}

/**
 * Reports room status to the embedding page. Messages go only to the allow-listed parent
 * origins from the server (EMBED_ORIGINS); the browser drops any whose origin does not match.
 */
export function embedStatusReporter(origins: string[], joinUrl: string) {
  let last = '';
  return (state: Snapshot) => {
    if (!embedded || window.parent === window || origins.length === 0) return;
    const message: RumbleStatus = {
      type: 'rumble:status',
      room: state.code,
      state: state.phase,
      round: state.round,
      joinUrl,
      players: state.cars.map((car) => ({
        id: car.id,
        name: car.name,
        bot: car.bot,
        connected: car.connected,
        ready: car.ready,
        score: car.score,
        wins: car.wins,
      })),
    };
    const key = JSON.stringify(message);
    if (key === last) return;
    last = key;
    for (const origin of origins) window.parent.postMessage(message, origin);
  };
}
