/* Rezpona — Paddle Billing (client side)
 *
 * Only the CLIENT-SIDE token belongs here. It is designed to be public, the same way
 * the Supabase anon key is. The secret API key must never appear in the browser —
 * it lives in Supabase Edge Function secrets.
 *
 * Token: Paddle → Developer Tools → Authentication → Client-side tokens (starts "live_").
 */
(function (global) {
  'use strict';

  const PADDLE_TOKEN = 'live_3bbbf8075ad4a1a7d12bb0b90f3';   // client-side token
  const PADDLE_ENV   = 'production';               // 'sandbox' while testing

  const PRICES = {
    starter: 'pri_01m3ahqwz6z2z5aq9wm7y05c79',
    pro:     'pri_01m3ahnqybjkv7pbr3y5rgck2d',
    agency:  'pri_01m3aj18cxqa58m1ytpa5p9stp',
  };

  let ready = false;

  // Load paddle.js once, then initialise it.
  function load() {
    if (ready) return Promise.resolve(true);
    return new Promise((resolve) => {
      if (!PADDLE_TOKEN || PADDLE_TOKEN.indexOf('REPLACE_ME') !== -1) {
        console.warn('[billing] Paddle client-side token is not set yet.');
        resolve(false);
        return;
      }
      const done = () => {
        try {
          if (PADDLE_ENV === 'sandbox') global.Paddle.Environment.set('sandbox');
          global.Paddle.Initialize({
            token: PADDLE_TOKEN,
            /* Paddle's overlay says only "Something went wrong" and puts the
               reason in the console, where a customer will never look and
               cannot report it. Surfacing it means a failed checkout can be
               diagnosed from what the person tells us. */
            eventCallback: function (ev) {
              if (!ev || !/error/i.test(ev.name || '')) return;
              const detail = (ev.data && (ev.data.error || ev.data.message)) || ev.name;
              console.error('[billing] Paddle:', ev.name, ev.data);
              global.dispatchEvent(new CustomEvent('rz-billing-error', {
                detail: typeof detail === 'string' ? detail : JSON.stringify(detail),
              }));
            },
          });
          ready = true;
          resolve(true);
        } catch (e) {
          console.error('[billing] Paddle init failed:', e);
          resolve(false);
        }
      };
      if (global.Paddle) { done(); return; }
      const s = document.createElement('script');
      s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
      s.onload = done;
      s.onerror = () => { console.error('[billing] Could not load paddle.js'); resolve(false); };
      document.head.appendChild(s);
    });
  }

  /**
   * Open Paddle checkout for a plan.
   * @param {'starter'|'pro'|'agency'} plan
   * @param {{id:string,email:string}|null} user  signed-in Supabase user (null -> send to signup)
   */
  async function checkout(plan, user) {
    const priceId = PRICES[plan];
    if (!priceId) { console.error('[billing] unknown plan:', plan); return; }

    // Not signed in yet: create the account first so the webhook can attach the
    // subscription to a real user. Remember the plan so we can resume after login.
    if (!user || !user.id) {
      try { sessionStorage.setItem('rz_plan_intent', plan); } catch (e) { /* ignore */ }
      window.location.href = '/login.html#signup';
      return;
    }

    const ok = await load();
    if (!ok) {
      window.location.href = 'mailto:rezpona@gmail.com?subject=' +
        encodeURIComponent('Subscription request: ' + plan);
      return;
    }

    global.Paddle.Checkout.open({
      items: [{ priceId: priceId, quantity: 1 }],
      customer: user.email ? { email: user.email } : undefined,
      customData: { user_id: user.id },      // webhook reads this to find the account
      settings: {
        displayMode: 'overlay',
        theme: 'dark',
        successUrl: window.location.origin + '/dashboard.html?upgraded=1',
      },
    });
  }

  /* Paddle's "default payment link" points here.
   *
   * When a customer has to pay outside the normal signup flow, Paddle sends them
   * to that link with ?_ptxn=txn_... and expects the page to open the checkout for
   * that transaction. This covers a retried failed payment, a card update, and
   * paying an invoice. Without it they would land on the dashboard with nothing
   * happening and no way to pay, which is how a subscription quietly dies.
   */
  async function resumePaddleTransaction() {
    let txn = null;
    try { txn = new URLSearchParams(window.location.search).get('_ptxn'); } catch (e) { return false; }
    if (!txn) return false;

    const ok = await load();
    if (!ok) return false;

    global.Paddle.Checkout.open({
      transactionId: txn,
      settings: { displayMode: 'overlay', theme: 'dark' },
    });
    return true;
  }

  // If someone picked a plan before signing up, resume that checkout after login.
  function pendingPlan() {
    try {
      const p = sessionStorage.getItem('rz_plan_intent');
      if (p) sessionStorage.removeItem('rz_plan_intent');
      return p;
    } catch (e) { return null; }
  }

  global.RezponaBilling = { checkout, load, pendingPlan, resumePaddleTransaction, PRICES };
})(window);
