import {
  mountLanguageSwitch,
  onLanguageChange,
  t,
  weaponText,
  raceMessage,
  translateMessage,
} from '../i18n.ts';
import { mountScreenAwake } from '../screen-awake-controls.ts';
import { lobbyReadiness } from '../lobby-readiness.ts';
import { roomAdmin } from '../room-admin.ts';
import { roomSettings } from '../room-settings.ts';
import { controllerLobbyMode, waitingForSummary } from '../race-presentation.ts';
import '../controller-lobby.css';
import { app, $, logo, toast } from '../core/dom.ts';
import { appUrl } from '../core/paths.ts';
import { storeItem } from '../core/api.ts';
import { connectGame, createInput } from '../core/network.ts';
import { padSteer } from '../../shared/steering.ts';
import { type Session, type Snapshot } from '../../shared/types.ts';
export function controller(session: Session) {
  document.body.className = 'controller-page';
  app.innerHTML = /* HTML */ `<div class="pad-shell">
    <header class="pad-header">
      <a class="brand small" href="${appUrl('/')}">${logo}</a
      ><span class="pad-room">POKÓJ <b>${session.code}</b></span
      ><span id="pad-connection" class="connection">Łączenie…</span>
      <button class="icon-button screen-awake-button" id="screen-awake" type="button"></button>
    </header>
    <section class="pad-identity">
      <span class="driver-badge" id="pad-number">1</span>
      <div>
        <small>TWÓJ SAMOCHÓD</small>
        <h1 id="pad-name">Kierowca</h1>
      </div>
      <span class="pad-score" id="pad-score">5 <small>PKT</small></span>
    </section>
    <div class="pad-status">
      <div class="pad-status-copy">
        <strong
          id="pad-ready-count"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          hidden
        ></strong>
        <span id="pad-status-text">Łączę z hostem…</span>
      </div>
      <button class="button primary" id="ready-button" hidden disabled>
        Jestem gotowy <span>✓</span>
      </button>
    </div>
    <section id="pad-admin"></section>
    <section id="pad-settings"></section>
    <main class="pad-controls" id="pad-controls">
      <section class="fire-controls">
        <button id="fire-control" class="fire-key" aria-label="Użyj przedmiotu">
          <span id="weapon-icon">ϟ</span><b id="weapon-name">PRZEDMIOT</b></button
        ><span id="weapon-help">Zbieraj złote kryształy na torze</span>
      </section>
      <section class="direction-controls">
        <div
          class="steer-zone"
          id="steer-zone"
          role="slider"
          aria-label="Kierownica: przesuń palec w lewo lub w prawo"
          aria-valuemin="-1"
          aria-valuemax="1"
          aria-valuenow="0"
        >
          <span class="steer-arrow steer-arrow-left" aria-hidden="true">‹</span
          ><span class="steer-track" aria-hidden="true"
            ><span class="steer-knob" id="steer-knob"></span></span
          ><span class="steer-arrow steer-arrow-right" aria-hidden="true">›</span>
          <small class="steer-label">PRZESUŃ, ABY SKRĘCAĆ</small>
        </div>
        <span class="brake-tip">DŁUGI SKRĘT = DRIFT · W DÓŁ = HAMULEC / COFANIE</span>
      </section>
    </main>
    <footer class="pad-footer">
      <span id="pad-phase">CZEKAMY NA EKIPĘ</span
      ><button class="text-button" id="pad-rejoin">Zmień pokój</button>
    </footer>
    <div class="pad-knockout" id="knockout" hidden>
      <b>BUM!</b><span>Wracasz w następnej rundzie.</span>
    </div>
    <div class="pad-countdown" id="pad-countdown" hidden></div>
  </div>`;
  mountLanguageSwitch(app);
  mountScreenAwake($<HTMLButtonElement>('#screen-awake'));
  const socket = connectGame(session),
    input = createInput(socket);
  const updateSettings = roomSettings($('#pad-settings'), socket, { playerId: session.playerId! });
  const updateAdmin = roomAdmin($('#pad-admin'), socket, { playerId: session.playerId! });
  let readyPending = false,
    ready = false,
    latest: Snapshot | null = null,
    dead = false,
    finished = false;
  // Right thumb: a floating slider. Where the finger lands becomes the centre; the whole slide
  // (about 40% of the pad width each way) maps proportionally to -1..1 with a small dead zone
  // and a soft curve (shared/steering.ts), so small slides give small corrections and only the
  // end of the travel is full lock. Pulling down past BRAKE_PX brakes / reverses.
  const BRAKE_PX = 46;
  const zone = $('#steer-zone'),
    track = $('.steer-track'),
    knob = $('#steer-knob');
  let stick: { id: number; x: number; y: number; travel: number } | null = null,
    steerValue = 0,
    braking = false;
  const sync = (dx = 0, dy = 0) => {
    const active = !!stick;
    input.set(
      active && (braking || steerValue < 0),
      active && (braking || steerValue > 0),
      active && !braking ? steerValue : undefined,
    );
    // The knob mirrors the finger along the track (it is narrower than the slide travel).
    const visual = Math.max(24, (track.clientWidth - knob.offsetWidth) / 2 + 24);
    const kx = stick ? (dx / stick.travel) * visual : 0;
    knob.style.transform = `translate(${kx.toFixed(1)}px, ${Math.max(0, dy)}px)`;
    zone.classList.toggle('steer-left', active && !braking && steerValue < 0);
    zone.classList.toggle('steer-right', active && !braking && steerValue > 0);
    zone.classList.toggle('steer-brake', active && braking);
    zone.classList.toggle('pressed', active);
    zone.setAttribute('aria-valuenow', (active && !braking ? steerValue : 0).toFixed(2));
    zone.dataset.steer = (active && !braking ? steerValue : 0).toFixed(3);
  };
  const steer = (e: PointerEvent) => {
    if (!stick || e.pointerId !== stick.id) return;
    let dx = e.clientX - stick.x;
    const dy = e.clientY - stick.y;
    // Drag the centre along when the finger runs past the end, so sliding back steers at once.
    if (Math.abs(dx) > stick.travel) {
      stick.x += dx - Math.sign(dx) * stick.travel;
      dx = Math.sign(dx) * stick.travel;
    }
    braking = dy > BRAKE_PX;
    steerValue = padSteer(dx, stick.travel);
    sync(dx, Math.min(dy, 70));
  };
  zone.onpointerdown = (e) => {
    e.preventDefault();
    if (latest?.phase !== 'racing' || dead || finished) return;
    // A new touch always takes over, so a lost pointerup can never leave the wheel stuck.
    zone.setPointerCapture(e.pointerId);
    stick = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      travel: Math.min(160, Math.max(60, zone.clientWidth * 0.4)),
    };
    steerValue = 0;
    braking = false;
    sync();
  };
  zone.onpointermove = steer;
  const release = (e: PointerEvent) => {
    if (!stick || e.pointerId !== stick.id) return;
    stick = null;
    steerValue = 0;
    braking = false;
    sync();
  };
  zone.onpointerup = release;
  zone.onpointercancel = release;
  zone.onlostpointercapture = release;
  $('#fire-control').onpointerdown = (e) => {
    e.preventDefault();
    if (latest?.phase === 'racing' && !dead && !finished) {
      input.fire();
      $('#fire-control').classList.add('pressed');
    }
  };
  for (const event of ['pointerup', 'pointercancel', 'pointerleave'])
    $('#fire-control').addEventListener(event, () =>
      $('#fire-control').classList.remove('pressed'),
    );
  const reset = () => {
    stick = null;
    steerValue = 0;
    braking = false;
    input.reset();
    sync();
    $('#fire-control').classList.remove('pressed');
  };
  window.addEventListener('blur', reset);
  window.addEventListener('orientationchange', reset);
  screen.orientation?.addEventListener('change', reset);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) reset();
  });
  $('#ready-button').onclick = async () => {
    if (
      !socket.connected ||
      readyPending ||
      !latest ||
      !(controllerLobbyMode(latest) || latest.phase === 'countdown')
    )
      return;
    readyPending = true;
    $<HTMLButtonElement>('#ready-button').disabled = true;
    try {
      await socket.timeout(3000).emitWithAck('ready', !ready);
    } catch {
      toast('Nie udało się potwierdzić gotowości. Spróbuj ponownie.');
    } finally {
      readyPending = false;
      $<HTMLButtonElement>('#ready-button').disabled = !socket.connected;
    }
  };
  $('#pad-rejoin').onclick = () => {
    storeItem('turbo:player:' + session.code, null);
    input.dispose();
    socket.disconnect();
    location.href = appUrl('/join');
  };
  socket.on('connect', () => {
    $('#pad-connection').textContent = t('Połączono');
    $('#pad-connection').classList.add('online');
    reset();
  });
  socket.on('disconnect', (reason) => {
    $('#pad-connection').textContent =
      reason === 'io server disconnect' ? t('Pad odłączony') : t('Łączenie ponownie…');
    $('#pad-connection').classList.remove('online');
    $<HTMLButtonElement>('#ready-button').disabled = true;
    reset();
    if (reason === 'io server disconnect')
      toast('Pad został odłączony przez hosta lub otwarty w innym oknie.');
  });
  socket.on('connect_error', (e) => {
    toast(translateMessage(e.message));
    $('#pad-connection').textContent = t('Brak połączenia');
  });
  const render = (state: Snapshot) => {
    latest = state;
    updateSettings(state);
    updateAdmin(state);
    const car = state.cars.find((c) => c.id === session.playerId);
    if (!car) return;
    document.documentElement.style.setProperty('--player', car.color);
    $('#pad-name').textContent = car.name;
    $('#pad-number').textContent = String(car.slot + 1);
    $('#pad-score').innerHTML = `${car.score} <small>${t('PKT')}</small>`;
    ready = car.ready;
    const summaryPending = waitingForSummary(state);
    const inLobby = controllerLobbyMode(state);
    $('.pad-shell').dataset.lobby = String(inLobby);
    $('.pad-shell').dataset.phase = state.phase;
    $('.pad-shell').dataset.frozen = String(car.alive && car.frozen);
    zone.setAttribute('aria-disabled', String(car.alive && car.frozen));
    finished = !!car.finishPlace;
    $('#pad-controls').hidden = inLobby || finished;
    const mayReady = inLobby || state.phase === 'countdown';
    $('#ready-button').hidden = !mayReady;
    $<HTMLButtonElement>('#ready-button').disabled = readyPending || !socket.connected;
    $('#ready-button').textContent = ready ? t('✓ Gotowy · cofnij') : t('Jestem gotowy ✓');
    $('#ready-button').setAttribute('aria-pressed', String(ready));
    const readiness = lobbyReadiness(state.cars);
    const readyCount = $('#pad-ready-count');
    readyCount.hidden = !mayReady;
    const readyText = t('Gotowi: {ready}/{total}', readiness);
    if (readyCount.textContent !== readyText) readyCount.textContent = readyText;
    $('#ready-button').classList.toggle('is-ready', ready);
    $('#pad-status-text').textContent =
      finished && state.phase === 'racing'
        ? t('Meta · {place}. miejsce. Czekamy na drugiego gracza.', { place: car.finishPlace! })
        : summaryPending
          ? t('RUNDA {round} ZAKOŃCZONA', { round: state.round })
          : inLobby
            ? state.phase === 'finished'
              ? t('Powrót do lobby za {seconds} s', { seconds: Math.ceil(state.seconds) })
              : ready
                ? t('✓ Gotowy. Czekamy na ekipę.')
                : t('○ Nie gotowy. Potwierdź przyciskiem.')
            : state.phase === 'paused'
              ? t('Pauza — czekamy na ekran hosta.')
              : state.phase === 'segment'
                ? raceMessage(state)
                : car.alive && car.frozen
                  ? t('ZAMROŻENIE · prędkość zachowana, skręt zablokowany.')
                  : t('Gaz automatyczny. Zakręty pokonujesz sam.');
    const weapon = car.weapon ? weaponText(car.weapon) : null;
    $('#weapon-icon').textContent = weapon?.icon ?? '+';
    $('#weapon-name').textContent = weapon?.name.toUpperCase() ?? t('PUSTY SLOT');
    $('#weapon-help').textContent = weapon?.help ?? t('Zbieraj złote kryształy na torze');
    $('#fire-control').style.setProperty('--weapon', weapon?.color ?? car.color);
    $('#fire-control').classList.toggle('empty', !weapon);
    $('#pad-phase').textContent =
      finished && state.phase === 'racing'
        ? t('META · {place}. MIEJSCE', { place: car.finishPlace! })
        : inLobby
          ? t('CZEKAMY NA EKIPĘ')
          : t('OKRĄŻENIE {lap}/{total} · RUNDA {round}', {
              lap: state.lap,
              total: state.lapLimit,
              round: state.round,
            });
    const nowDead = !car.alive && (state.phase === 'racing' || summaryPending);
    $('#knockout').hidden = !nowDead;
    if (nowDead && !dead) {
      reset();
      navigator.vibrate?.([100, 60, 100]);
    }
    dead = nowDead;
    $('#pad-countdown').hidden = state.phase !== 'countdown';
    $('#pad-countdown').textContent = String(Math.ceil(state.seconds));
    if (state.phase !== 'racing' || finished) reset();
  };
  socket.on('state', render);
  onLanguageChange(() => {
    $('#pad-connection').textContent = socket.connected ? t('Połączono') : t('Brak połączenia');
    if (latest) render(latest);
  });
}
