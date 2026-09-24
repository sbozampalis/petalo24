/* ============================================================
   PETALO ARCADE — brand configuration and shop hooks
   Loaded BEFORE game.js. Everything you'll want to change lives
   in the CONFIG block at the top.
   ============================================================ */
(function () {
  'use strict';

  // ------------------------------------------------------------------ CONFIG
  // EDIT THESE. The six clubs match Drop 01 / Drop 02 / Drop 03, so the team a
  // visitor picks in the game is the shirt they get offered afterwards.
  const CONFIG = {
    shopBase: 'https://petalo24.gr',

    // Real anchors as they exist on petalo24.gr today. There are no per-club
    // ids yet, so every winner lands on the Insert Coin soccer drop — which is
    // the matching product line anyway. Add per-club ids to the site later and
    // these become deep links with no change here beyond the strings.
    products: {
      ΠΑΟ:  '/#drop3',
      ΟΣΦΠ: '/#drop3',
      ΑΕΚ:  '/#drop3',
      ΠΑΟΚ: '/#drop3',
      ΑΡΗΣ: '/#drop3',
      ΗΡΑ:  '/#drop3'
    },
    dropAll: '/#/shop',

    // Nothing is for sale yet, so winning sends people to the "would you buy
    // this" vote instead of a discount. The query string is a hint your site
    // can act on — see link-snippets.html. The link works fine without it.
    voteQuery: '?from=arcade',

    // Leaderboard backend. 'local' keeps scores in the visitor's own browser.
    // Switch to 'api' once you've added the routes from worker-api.js.
    scoreBackend: 'local',
    apiBase: '/api'
  };

  // ------------------------------------------------------------------ ROSTER
  // Same shape the engine uses. rate 1-5 drives AI difficulty.
  const TEAMS = [
    { ab:'ΠΑΟ',  name:'ΠΑΝΑΘΗΝΑΪΚΟΣ', city:'ΑΘΗΝΑ',       shirt:0x0c8b3f, shorts:0xffffff, sock:0x0c8b3f, gk:0xe0631a, rate:4 },
    { ab:'ΟΣΦΠ', name:'ΟΛΥΜΠΙΑΚΟΣ',   city:'ΠΕΙΡΑΙΑΣ',    shirt:0xd2232a, shorts:0xffffff, sock:0xd2232a, gk:0x2b2b2b, rate:5, stripe:0xf2f2f2 },
    { ab:'ΑΕΚ',  name:'ΑΕΚ',          city:'ΑΘΗΝΑ',       shirt:0xf2c700, shorts:0x121212, sock:0xf2c700, gk:0x21b36a, rate:5 },
    { ab:'ΠΑΟΚ', name:'ΠΑΟΚ',         city:'ΘΕΣΣΑΛΟΝΙΚΗ', shirt:0x141414, shorts:0xffffff, sock:0x141414, gk:0xc8d400, rate:5, stripe:0xf2f2f2 },
    { ab:'ΑΡΗΣ', name:'ΑΡΗΣ',         city:'ΘΕΣΣΑΛΟΝΙΚΗ', shirt:0xf6d600, shorts:0x141414, sock:0xf6d600, gk:0x1a7fc4, rate:4 },
    { ab:'ΗΡΑ',  name:'ΗΡΑΚΛΗΣ',      city:'ΘΕΣΣΑΛΟΝΙΚΗ', shirt:0x3fb8e8, shorts:0xffffff, sock:0x3fb8e8, gk:0xd94040, rate:3, stripe:0xf2f2f2 }
  ];

  // ------------------------------------------------------------------ scores
  const KEY = 'petalo_arcade_scores_v1';

  function localScores() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch (e) { return []; }
  }
  function saveLocal(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20))); } catch (e) {}
  }

  async function loadScores() {
    if (CONFIG.scoreBackend === 'api') {
      try {
        const r = await fetch(CONFIG.apiBase + '/scores');
        if (r.ok) return await r.json();
      } catch (e) {}
    }
    return localScores();
  }

  async function submitScore(entry) {
    if (CONFIG.scoreBackend === 'api') {
      try {
        const r = await fetch(CONFIG.apiBase + '/scores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry)
        });
        if (r.ok) return await r.json();
      } catch (e) {}
    }
    const list = localScores();
    list.push(entry);
    list.sort((a, b) => (b.points - a.points) || (a.ms - b.ms));
    saveLocal(list);
    return list;
  }

  /** Points: a cup win is worth far more than a round or two. */
  function pointsFor(r) {
    if (r.champion) return 1000 + r.goalsFor * 25 - r.goalsAgainst * 10;
    return r.round * 150 + r.goalsFor * 25 - r.goalsAgainst * 10;
  }

  // ------------------------------------------------------------------ UI glue
  const $ = id => document.getElementById(id);
  let run = { goalsFor: 0, goalsAgainst: 0 };

  function showReward(res) {
    const panel = $('reward');
    if (!panel) return;
    const won = res.champion;
    $('rwTitle').textContent = won ? 'ΚΥΠΕΛΛΟΥΧΟΣ!' : 'ΤΕΛΟΣ ΤΗΣ ΠΟΡΕΙΑΣ';
    $('rwTeam').textContent = res.teamName;

    const blurb = $('rwBlurb');
    blurb.textContent = won
      ? 'Το μπλουζάκι της ομάδας σου είναι στο Drop 02. Πες μας αν θα το φορούσες.'
      : 'Καλή προσπάθεια. Ρίξε μια ματιά στα μπλουζάκια πριν φύγεις.';

    const link = $('rwShop');
    const path = CONFIG.products[res.ab] || CONFIG.dropAll || '/';
    const q = CONFIG.voteQuery + (res.ab ? '&team=' + encodeURIComponent(res.ab) : '');
    link.href = CONFIG.shopBase + '/' + q + path.replace(/^\//, '');
    link.textContent = won ? 'ΨΗΦΙΣΕ ΤΟ ΜΠΛΟΥΖΑΚΙ ΣΟΥ →' : 'ΔΕΣ ΤΑ ΜΠΛΟΥΖΑΚΙΑ →';

    const pts = pointsFor({ champion: won, round: res.round,
                            goalsFor: run.goalsFor, goalsAgainst: run.goalsAgainst });
    $('rwPoints').textContent = pts;
    panel.dataset.points = pts;
    panel.dataset.team = res.ab;
    panel.classList.remove('hidden');
  }

  async function renderBoard() {
    const el = $('board');
    if (!el) return;
    const list = await loadScores();
    if (!list.length) {
      el.innerHTML = '<p class="empty">Κανείς δεν έχει παίξει ακόμα. Γίνε ο πρώτος.</p>';
      return;
    }
    list.sort((a, b) => b.points - a.points);
    el.innerHTML = list.slice(0, 10).map((s, i) =>
      `<div class="row"><b>${i + 1}</b><span>${escapeHtml(s.name || '—')}</span>` +
      `<em>${escapeHtml(s.team || '')}</em><i>${s.points}</i></div>`).join('');
  }

  function escapeHtml(t) {
    return String(t).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ------------------------------------------------------------------ export
  window.BRAND = {
    teams: TEAMS,
    config: CONFIG,

    onCupEnd(res) {
      showReward(res);
      renderBoard();
    },
    onMatchEnd(res) {
      const parts = (res.score || '0-0').split('-');
      run.goalsFor += (+parts[0] || 0);
      run.goalsAgainst += (+parts[1] || 0);
    },

    resetRun() { run = { goalsFor: 0, goalsAgainst: 0 }; },
    submitScore, renderBoard, pointsFor
  };

  // wire the reward panel once the DOM is up (scripts load late, so the event
  // may already have fired by the time we get here)
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  ready(() => {
    renderBoard();
    const form = $('scoreForm');
    if (form) form.addEventListener('submit', async e => {
      e.preventDefault();
      const panel = $('reward');
      const name = ($('scName').value || '').trim().slice(0, 18);
      if (!name) return;
      await submitScore({
        name,
        team: panel.dataset.team || '',
        points: +panel.dataset.points || 0,
        ms: Date.now()
      });
      $('scDone').textContent = 'Καταχωρήθηκε. Ευχαριστούμε!';
      form.reset();
      renderBoard();
    });
    const close = $('rwClose');
    if (close) close.addEventListener('click', () => {
      $('reward').classList.add('hidden');
      $('scDone').textContent = '';
      window.BRAND.resetRun();
    });
  });
})();
