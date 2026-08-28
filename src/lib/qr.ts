import QRCode from 'qrcode';

/**
 * The one QR style this site uses — generated locally (no external image
 * service sees the URL) on a fixed white ground with the ink brown, so the
 * code stays scannable in dark mode too. Shared by the QR dialog and the
 * desktop 「スマホでも見られます」 banner.
 */
export function qrDataUrl(url: string, width: number): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width,
    color: { dark: '#2b1f18', light: '#ffffff' },
  });
}
