/* White-label (Agency).
 *
 * Branding was only reaching the notification emails, which is not what an agency
 * means by white-label: they put a client in front of this dashboard and it says
 * Rezpona across the top. This applies the venue's logo and accent colour to the
 * app itself, so the panel a client sees carries their own brand.
 *
 * Deliberately narrow about what it accepts. The values come out of the database
 * and end up in a <style> block and an <img src>, so a stored string must not be
 * able to become markup or script: only an https URL, only a six-digit hex.
 */
(function (global) {
  'use strict';

  const DEFAULT_LOGO = '/logo.png';

  function safeLogo(url) {
    if (!url) return null;
    const s = String(url).trim();
    return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : null;
  }
  function safeColor(c) {
    if (!c) return null;
    const s = String(c).trim();
    return /^#[0-9a-fA-F]{6}$/.test(s) ? s : null;
  }

  // Darken a hex colour so the gradient still has two tones to work with.
  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
      Math.max(0, Math.min(255, Math.round(v + amount))));
    return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  /**
   * @param {{brand_logo_url?:string|null, brand_color?:string|null, name?:string}|null} venue
   */
  function apply(venue) {
    const logo = safeLogo(venue && venue.brand_logo_url);
    const colour = safeColor(venue && venue.brand_color);

    // Logo, and the wordmark next to it.
    const img = document.querySelector('.logo-ic');
    const word = document.querySelector('.logo-t');
    if (img) {
      img.src = logo || DEFAULT_LOGO;
      img.alt = logo ? ((venue && venue.name) || 'Logo') : 'Rezpona logo';
    }
    if (word) {
      if (logo) {
        // Their logo usually carries the name already; a second wordmark beside it
        // reads as two brands stapled together.
        word.style.display = 'none';
      } else {
        word.style.display = '';
      }
    }

    let style = document.getElementById('rz-brand');
    if (!colour) { if (style) style.remove(); return; }

    if (!style) {
      style = document.createElement('style');
      style.id = 'rz-brand';
      document.head.appendChild(style);
    }
    style.textContent =
      ':root{--acc:' + colour + ';--acc2:' + shade(colour, -38) + '}';
  }

  global.RezponaBrand = { apply };
})(window);
