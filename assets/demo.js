/* "Try it yourself" on the landing page.
 *
 * Deliberately uses the SAME engine as the dashboard (/assets/reply-engine.js),
 * so what a visitor sees here is exactly what a paying customer gets. If the two
 * ever drift apart, the demo becomes a promise the product does not keep.
 */
(function () {
  'use strict';

  const input   = document.getElementById('reviewInput');
  const btn     = document.getElementById('draftBtn');
  const btnTxt  = document.getElementById('draftBtnText');
  const panel   = document.getElementById('replyPanel');
  const box     = document.getElementById('replyBox');
  const label   = document.getElementById('replyLabel');
  const copyBtn = document.getElementById('copyBtn');
  if (!input || !btn || !panel) return;

  let venue = 'restaurant';
  let lastReply = '';

  const SAMPLES = {
    restaurant: [
      "Absolutely loved it. The truffle pasta was the best I've had in years and our server was incredibly attentive. Warm, cosy room. We'll be back!",
      "The food was genuinely good and the staff were friendly, but we waited nearly 40 minutes for our table despite having a reservation.",
      "Really disappointing. Our table wasn't ready even though we booked, the steak came out cold, and nobody seemed to care."
    ],
    hotel: [
      "What a stay! The room was spotless, the bed incredibly comfortable, and the view over the harbour was stunning. The front desk could not have been kinder.",
      "Lovely room and a great location, but check-in took almost half an hour and breakfast was cold by the time we got there.",
      "Disappointing stay. Our room wasn't ready at check-in despite booking weeks ahead, and the bathroom wasn't properly cleaned."
    ],
    cafe: [
      "My new favourite spot. The flat white was perfectly made and the barista was so friendly. Lovely atmosphere and great pastries.",
      "The coffee was lovely and the space is gorgeous, but there was a long queue and only one person working the counter.",
      "Not great. The coffee was lukewarm and bitter, the table was sticky, and the staff seemed too busy to care."
    ]
  };
  const SAMPLE_RATING = [5, 3, 2];   // the three buttons, in order

  const pills = Array.prototype.slice.call(document.querySelectorAll('.sample-pill'));
  function refreshSamples() {
    pills.forEach(function (p) { p.dataset.text = SAMPLES[venue][+p.dataset.i]; });
  }
  refreshSamples();

  document.querySelectorAll('.vt-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.vt-btn').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      venue = b.dataset.venue;
      refreshSamples();
    });
  });

  pills.forEach(function (p) {
    p.addEventListener('click', function () {
      input.value = p.dataset.text;
      input.dataset.rating = SAMPLE_RATING[+p.dataset.i];  // samples carry their star rating
      input.focus();
    });
  });
  // Typing their own review means we no longer know the stars; judge by wording instead.
  input.addEventListener('input', function () { delete input.dataset.rating; });

  function typeOut(text) {
    lastReply = text;
    box.innerHTML = '<div class="reply-text" id="rt"></div>';
    const el = document.getElementById('rt');
    let i = 0;
    (function step() {
      if (i < text.length) {
        i++;
        el.textContent = text.slice(0, i);
        el.insertAdjacentHTML('beforeend', '<span class="tcursor"></span>');
        setTimeout(step, i < 50 ? 22 : i < 140 ? 15 : 9);
      } else {
        el.textContent = text;
      }
    })();
  }

  const TOPIC = {
    risotto: 'Food', pasta: 'Food', pizza: 'Food', steak: 'Food', burger: 'Food',
    dessert: 'Food', breakfast: 'Food', food: 'Food',
    coffee: 'Drinks', wine: 'Drinks',
    team: 'Service', service: 'Service',
    wait: 'Wait time', table: 'Wait time',
    room: 'Room', pool: 'Room', spa: 'Room',
    view: 'Atmosphere', atmosphere: 'Atmosphere',
    cleanliness: 'Cleanliness', value: 'Value'
  };

  function moodOf(a, rating) {
    if (rating != null) return rating >= 4 ? 'positive' : rating === 3 ? 'mixed' : 'negative';
    if (a.n > a.p) return 'negative';
    if (a.p > a.n) return 'positive';
    return 'mixed';
  }

  btn.addEventListener('click', function () {
    const text = input.value.trim();
    if (text.length < 12) {
      input.focus();
      input.style.borderColor = 'rgba(255,68,102,.5)';
      setTimeout(function () { input.style.borderColor = ''; }, 1400);
      return;
    }
    if (!window.RezponaReply) { console.error('[demo] reply engine not loaded'); return; }

    btn.disabled = true;
    btnTxt.innerHTML = '<span class="loading-dots"><span></span><span></span><span></span></span>';
    panel.classList.remove('has-reply');
    panel.querySelectorAll('.sent-row').forEach(function (el) { el.remove(); });
    label.textContent = 'Writing your reply...';
    copyBtn.style.display = 'none';
    box.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';

    setTimeout(function () {
      const rating = input.dataset.rating ? Number(input.dataset.rating) : null;
      const reply  = window.RezponaReply.generate({ rating: rating, comment: text, venue: venue });
      const a      = window.RezponaReply.analyse(text);
      const mood   = moodOf(a, rating);

      panel.classList.add('has-reply');
      label.textContent = 'Reply ready';
      copyBtn.style.display = 'block';
      copyBtn.classList.remove('copied');
      copyBtn.textContent = 'Copy';
      typeOut(reply);

      const topics = [];
      a.praise.concat(a.issues, a.all).forEach(function (id) {
        const t = TOPIC[id];
        if (t && topics.indexOf(t) === -1) topics.push(t);
      });

      const row = document.createElement('div');
      row.className = 'sent-row';
      const nameOf = { positive: 'Positive', negative: 'Negative', mixed: 'Mixed' };
      const clsOf  = { positive: 'sp-pos', negative: 'sp-neg', mixed: 'sp-mix' };
      row.innerHTML =
        '<span class="sent-label">Sentiment:</span>' +
        '<span class="sent-pill ' + clsOf[mood] + '">' + nameOf[mood] + '</span>' +
        '<span class="sent-label" style="margin-left:.2rem">Topics:</span>' +
        '<span class="sent-pill ch-b">' + (topics.slice(0, 3).join(' · ') || 'General') + '</span>';

      // Show the badges once the reply has finished typing.
      const waiter = setInterval(function () {
        const rt = document.getElementById('rt');
        if (rt && rt.textContent.length >= reply.length - 2) {
          clearInterval(waiter);
          panel.querySelectorAll('.sent-row').forEach(function (el) { el.remove(); });
          panel.appendChild(row);
        }
      }, 120);

      btn.disabled = false;
      btnTxt.innerHTML = 'Draft another reply &rarr;';
      maybeNudge();
    }, 900);
  });

  /* After a few drafts the visitor has seen that the writing holds up. That is the
     moment to point out what is actually being sold: not the text, but never having
     to do this by hand. Deliberately not a paywall. A counter in a static page can be
     cleared with a refresh, so gating here would only annoy people while stopping no one. */
  let drafts = 0;
  function maybeNudge() {
    drafts++;
    if (drafts !== 3 || document.getElementById('demoNudge')) return;

    const n = document.createElement('div');
    n.id = 'demoNudge';
    n.style.cssText =
      'margin-top:1rem;padding:1rem 1.1rem;border-radius:14px;' +
      'background:linear-gradient(135deg,rgba(0,206,255,.08),rgba(91,111,255,.08));' +
      'border:1px solid rgba(0,206,255,.2);font-size:.88rem;line-height:1.6;color:var(--muted2)';
    n.innerHTML =
      'Rezpona does this for every new Google review automatically, and posts the reply back for you. ' +
      '<a href="/login.html#signup" style="color:var(--acc);text-decoration:none;font-weight:600;white-space:nowrap">Try it on your own reviews &rarr;</a>';
    panel.appendChild(n);
  }

  copyBtn.addEventListener('click', function () {
    if (!lastReply) return;
    function done() {
      copyBtn.textContent = 'Copied ✓';
      copyBtn.classList.add('copied');
      setTimeout(function () {
        copyBtn.textContent = 'Copy';
        copyBtn.classList.remove('copied');
      }, 2200);
    }
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = lastReply;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* ignore */ }
      document.body.removeChild(ta);
      done();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(lastReply).then(done).catch(fallback);
    } else {
      fallback();
    }
  });

  input.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') btn.click();
  });
})();
