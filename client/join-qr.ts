import QRCode from 'qrcode';

/** Four modules of white around the code: the quiet zone scanners expect. */
const QUIET_ZONE = 4;

/**
 * Draws `url` as a QR code that fills `box` (sized by CSS) with a whole number of device pixels
 * per module, so it stays sharp at any size and pixel ratio instead of being an upscaled bitmap.
 * Redraws when the box or the pixel ratio changes. Returns a disposer.
 */
export function mountJoinQr(box: HTMLElement, url: string): () => void {
  const canvas = document.createElement('canvas');
  box.replaceChildren(canvas);
  const cells = QRCode.create(url, { errorCorrectionLevel: 'M' }).modules.size + QUIET_ZONE * 2;
  let drawn = '';
  const draw = () => {
    const ratio = window.devicePixelRatio || 1;
    const side = Math.min(box.clientWidth, box.clientHeight);
    if (side <= 0) return;
    const scale = Math.max(1, Math.floor((side * ratio) / cells));
    const key = `${scale}@${ratio}`;
    if (key === drawn) return;
    drawn = key;
    void QRCode.toCanvas(canvas, url, {
      errorCorrectionLevel: 'M',
      margin: QUIET_ZONE,
      scale,
      color: { dark: '#000000', light: '#ffffff' },
    }).then(() => {
      const css = `${(cells * scale) / ratio}px`;
      canvas.style.width = css;
      canvas.style.height = css;
    });
  };
  const observer = new ResizeObserver(draw);
  observer.observe(box);
  window.addEventListener('resize', draw);
  draw();
  return () => {
    observer.disconnect();
    window.removeEventListener('resize', draw);
  };
}
