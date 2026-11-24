import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/protocol.ts';
import type { Input, ConnectionSession } from '../../shared/types.ts';
import { appUrl } from './paths.ts';
export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export const connectGame = (auth: ConnectionSession): GameSocket =>
  io({ auth, path: appUrl('/socket.io') });
export function createInput(socket: GameSocket) {
  let seq = 0,
    actionSeq = 0,
    left = false,
    right = false,
    steer: number | undefined;
  const send = () => {
    if (socket.connected)
      socket.emit('input', {
        seq: ++seq,
        left,
        right,
        ...(steer === undefined ? {} : { steer }),
        actionSeq,
      } satisfies Input);
  };
  const onConnect = () => {
    seq = 0;
    actionSeq = 0;
    left = false;
    right = false;
    steer = undefined;
    send();
  };
  socket.on('connect', onConnect);
  const timer = setInterval(send, 33);
  const reset = () => {
    left = false;
    right = false;
    steer = undefined;
    send();
  };
  window.addEventListener('blur', reset);
  const visibility = () => {
    if (document.hidden) reset();
  };
  document.addEventListener('visibilitychange', visibility);
  return {
    /** Buttons; `analog` (-1 left .. 1 right) is the pad's proportional steer, if any. */
    set(l: boolean, r: boolean, analog?: number) {
      left = l;
      right = r;
      steer = analog;
      send();
    },
    fire() {
      actionSeq++;
      send();
    },
    reset,
    dispose() {
      clearInterval(timer);
      socket.off('connect', onConnect);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', visibility);
    },
  };
}
