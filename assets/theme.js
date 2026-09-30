/* Light and dark.
 *
 * Dark is the default and stays the default: it is what the product looks like,
 * and a visitor who has expressed no preference should see the design as it was
 * drawn. Light exists because people work in daylight, in bright kitchens and
 * receptions, and because some of them simply prefer it.
 *
 * The choice is stored per browser. The <html> element carries data-theme, and a
 * small inline script in each page's <head> applies it before the first paint,
 * so a light-mode visitor never gets a flash of dark. That inline copy is the
 * part that must run early; everything here runs after and only handles the
 * switch itself.
 */
(function (global) {
  'use strict';

  const KEY = 'rz-theme';

  function current() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function apply(theme) {
    const t = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(KEY, t); } catch (e) { /* private mode: honour it for this page only */ }

    // Keep the browser chrome in step, or a light page sits under a dark bar.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#F6F7FB' : '#060612');

    document.querySelectorAll('[data-theme-toggle]').forEach(paint);
    global.dispatchEvent(new CustomEvent('rz-theme', { detail: { theme: t } }));
  }

  function toggle() { apply(current() === 'light' ? 'dark' : 'light'); }

  const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  function paint(btn) {
    const light = current() === 'light';
    // Show where the click leads, not where you are.
    btn.innerHTML = light ? MOON : SUN;
    btn.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
    btn.setAttribute('title', light ? 'Dark mode' : 'Light mode');
  }

  /* Pages that have somewhere sensible for the switch mark it up themselves. The
     rest get one placed top right, away from the support button in the opposite
     corner, so no page is left without a way to change theme. */
  function ensureButton() {
    if (document.querySelector('[data-theme-toggle]')) return;

    const style = document.createElement('style');
    style.textContent =
      '.rz-theme-float{position:fixed;top:16px;right:16px;z-index:880;width:34px;height:34px;' +
      'display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;' +
      'border:1px solid var(--bd);border-radius:50%;background:var(--s1);color:var(--muted2);' +
      'transition:color .2s,border-color .2s}' +
      '.rz-theme-float:hover{color:var(--acc);border-color:var(--bd2)}' +
      '.rz-theme-float svg{width:16px;height:16px}';
    document.head.appendChild(style);

    const b = document.createElement('button');
    b.className = 'rz-theme-float';
    b.setAttribute('data-theme-toggle', '');
    document.body.appendChild(b);
  }

  function init() {
    ensureButton();
    const btns = document.querySelectorAll('[data-theme-toggle]');
    btns.forEach(function (b) {
      if (b.dataset.rzBound) return;
      b.dataset.rzBound = '1';
      b.type = 'button';
      b.addEventListener('click', toggle);
      paint(b);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.RezponaTheme = { apply: apply, toggle: toggle, current: current, init: init };
})(window);
