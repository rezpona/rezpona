/* Landing page: show the way back in to someone who is already signed in.
 *
 * Coming back here never signed anyone out, but the bar still said "Log in" and
 * "Start free", which reads as having been signed out and leaves no route back
 * to the app. Clicking the logo from inside the dashboard landed in exactly that.
 *
 * An earlier version guessed at the key the Supabase client stores its session
 * under, to avoid loading the client on the landing page. It did not work. The
 * client is the only thing that actually knows, so it is asked directly; the
 * extra script is deferred and costs nothing before the page paints.
 */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://upepsbyqqefdaygmjxie.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwZXBzYnlxcWVmZGF5Z21qeGllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NDM1NjMsImV4cCI6MjA5NjMxOTU2M30.XZNA0TmVZQmPeoniut3fkOyj1A6-lmfHvhvx5hMBaTc';

  function signedIn() {
    window.rzSignedIn = true;

    // One destination, not two. A signed-in visitor does not need both a link to
    // log in and a button to start free.
    document.querySelectorAll('[data-signed-out]').forEach(function (el) {
      el.style.display = 'none';
    });
    document.querySelectorAll('[data-app-link]').forEach(function (a) {
      a.href = '/dashboard.html';
      a.innerHTML = 'Dashboard &rarr;';
    });
  }

  function boot() {
    if (!window.supabase || !window.supabase.createClient) return;
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: false,      // reading only; the app refreshes properly
        detectSessionInUrl: false,    // no auth callback happens on this page
      },
    });
    sb.auth.getSession().then(function (res) {
      if (res && res.data && res.data.session) signedIn();
    }).catch(function () { /* stay as the signed-out page */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
