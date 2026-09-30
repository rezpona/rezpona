/* Support widget.
 *
 * Pro and Agency are sold with priority support, so there has to be somewhere to
 * write from inside the app. A mailto link would have been less work, but it
 * opens whatever mail client the machine happens to have configured, loses the
 * sender's plan and the page they were on, and leaves no record that anyone
 * wrote. This posts to the support function instead, which stores the message
 * and then emails it.
 *
 * Usage: include after the Supabase client exists, then RezponaSupport.init(sb).
 */
(function (global) {
  'use strict';

  const FN = 'https://upepsbyqqefdaygmjxie.supabase.co/functions/v1/support';
  const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwZXBzYnlxcWVmZGF5Z21qeGllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NDM1NjMsImV4cCI6MjA5NjMxOTU2M30.XZNA0TmVZQmPeoniut3fkOyj1A6-lmfHvhvx5hMBaTc';

  let sb = null;
  let open = false;

  const CSS = `
.rz-sup-btn{position:fixed;right:22px;bottom:22px;z-index:900;display:flex;align-items:center;gap:.5rem;
  padding:.7rem 1.15rem;border:none;border-radius:100px;cursor:pointer;font-family:'Outfit',sans-serif;
  font-size:.86rem;font-weight:600;color:var(--on-acc);background:linear-gradient(135deg,var(--acc),var(--acc2));
  box-shadow:0 6px 24px rgba(0,0,0,.45);transition:transform .2s}
.rz-sup-btn:hover{transform:translateY(-2px)}
.rz-sup-btn svg{width:16px;height:16px}
.rz-sup-back{position:fixed;inset:0;z-index:901;background:var(--scrim,rgba(3,3,12,.72));display:flex;align-items:flex-end;
  justify-content:flex-end;padding:22px}
.rz-sup-panel{width:100%;max-width:400px;background:var(--bg2,#0B0B1C);border:1px solid var(--bd);border-radius:18px;
  padding:1.4rem;font-family:'Outfit',sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.6)}
.rz-sup-panel h3{font-size:1rem;font-weight:600;color:var(--text);margin:0 0 .2rem}
.rz-sup-panel p.rz-hint{font-size:.82rem;color:var(--muted);margin:0 0 1.1rem;line-height:1.55}
.rz-sup-panel label{display:block;font-size:.78rem;color:var(--muted2);margin:0 0 .3rem}
.rz-sup-panel input,.rz-sup-panel textarea{width:100%;padding:.6rem .8rem;border-radius:10px;
  background:var(--s2);border:1px solid var(--bd);color:var(--text);
  font-family:'Outfit',sans-serif;font-size:.88rem;outline:none;margin-bottom:.9rem}
.rz-sup-panel textarea{min-height:120px;resize:vertical;line-height:1.6}
.rz-sup-panel input:focus,.rz-sup-panel textarea:focus{border-color:rgba(0,206,255,.4)}
.rz-sup-row{display:flex;align-items:center;gap:.7rem}
.rz-sup-send{padding:.6rem 1.4rem;border-radius:100px;border:none;cursor:pointer;font-family:'Outfit',sans-serif;
  font-size:.85rem;font-weight:600;color:var(--on-acc);background:linear-gradient(135deg,var(--acc),var(--acc2))}
.rz-sup-send:disabled{opacity:.5;cursor:default}
.rz-sup-cancel{background:none;border:none;color:var(--muted);font-family:'Outfit',sans-serif;
  font-size:.84rem;cursor:pointer}
.rz-sup-cancel:hover{color:var(--text)}
.rz-sup-msg{font-size:.82rem;margin-left:auto}
.rz-sup-msg.err{color:#FF7090}
.rz-sup-done{text-align:center;padding:1rem 0}
.rz-sup-done .tick{font-size:1.8rem;margin-bottom:.6rem}
.rz-sup-done p{font-size:.88rem;color:var(--muted2);line-height:1.6;margin:0}
@media(max-width:520px){.rz-sup-back{padding:0;align-items:stretch}
  .rz-sup-panel{max-width:none;border-radius:0;display:flex;flex-direction:column;justify-content:center}}`;

  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function close() {
    const b = document.getElementById('rzSupBack');
    if (b) b.remove();
    open = false;
  }

  function show() {
    if (open) return;
    open = true;

    const back = el('div', 'rz-sup-back');
    back.id = 'rzSupBack';
    const panel = el('div', 'rz-sup-panel');
    panel.innerHTML =
      '<h3>Message us</h3>' +
      '<p class="rz-hint">Tell us what is going on and we will reply by email.</p>' +
      '<label for="rzSupSubj">Subject</label>' +
      '<input id="rzSupSubj" type="text" placeholder="Something is not working" maxlength="140">' +
      '<label for="rzSupBody">Message</label>' +
      '<textarea id="rzSupBody" placeholder="What happened, and what did you expect instead?" maxlength="5000"></textarea>' +
      '<div class="rz-sup-row">' +
        '<button class="rz-sup-send" id="rzSupSend">Send</button>' +
        '<button class="rz-sup-cancel" id="rzSupCancel">Cancel</button>' +
        '<span class="rz-sup-msg" id="rzSupMsg"></span>' +
      '</div>';

    back.appendChild(panel);
    document.body.appendChild(back);

    // Clicking the dark area closes; clicking inside the panel must not.
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    panel.addEventListener('click', (e) => e.stopPropagation());
    document.getElementById('rzSupCancel').addEventListener('click', close);
    document.getElementById('rzSupSend').addEventListener('click', send);
    document.getElementById('rzSupBody').focus();

    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
  }

  async function send() {
    const btn = document.getElementById('rzSupSend');
    const msg = document.getElementById('rzSupMsg');
    const body = document.getElementById('rzSupBody').value.trim();
    const subject = document.getElementById('rzSupSubj').value.trim();

    if (body.length < 10) {
      msg.textContent = 'Please write a little more.';
      msg.className = 'rz-sup-msg err';
      return;
    }

    btn.disabled = true;
    msg.className = 'rz-sup-msg';
    msg.textContent = 'Sending...';

    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { location.href = '/login.html'; return; }

      const res = await fetch(FN, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + session.access_token,
          'apikey': ANON,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subject: subject, body: body, page: location.pathname }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Could not send (' + res.status + ')');

      const panel = document.querySelector('.rz-sup-panel');
      panel.innerHTML =
        '<div class="rz-sup-done"><div class="tick">✓</div>' +
        '<p>' + (out.message || 'Thanks, we have got your message.') + '</p></div>';
      setTimeout(close, 3200);
    } catch (e) {
      btn.disabled = false;
      msg.textContent = e.message;
      msg.className = 'rz-sup-msg err';
    }
  }

  /** @param {object} client a signed-in Supabase client */
  function init(client) {
    sb = client;
    if (document.getElementById('rzSupBtn')) return;

    const style = el('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const btn = el('button', 'rz-sup-btn', ICON + '<span>Support</span>');
    btn.id = 'rzSupBtn';
    btn.type = 'button';
    btn.addEventListener('click', show);
    document.body.appendChild(btn);
  }

  global.RezponaSupport = { init: init, open: show };
})(window);
