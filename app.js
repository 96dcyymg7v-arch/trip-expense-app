/*!
 * app.js — 여행 경비 정산 앱 UI
 * 순수 계산은 tripmath.js (window.TripMath) 에 있고, 여기서는 화면·저장만 담당해요.
 */
(function () {
  'use strict';

  var M = window.TripMath;
  var STORE_KEY = 'trip-expense-app/v1';

  var state = null;
  var ui = { view: 'home', form: null, newTrip: null };
  var els = {};
  var toastTimer = null;
  var sheetTimer = null;

  /* ── 유틸 ────────────────────────────────────────────── */

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function activeTrip() {
    if (!state) return null;
    for (var i = 0; i < state.trips.length; i++) {
      if (state.trips[i].id === state.activeTripId) return state.trips[i];
    }
    return null;
  }

  function currencyBadge(code) { return M.currencyMeta(code).symbol; }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (err) {
      toast('저장 공간이 부족해요 😢');
    }
  }

  function load() {
    var empty = { version: 1, activeTripId: null, trips: [] };
    var raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (err) { return empty; }
    if (!raw) return empty;
    try {
      var parsed = JSON.parse(raw);
      var trips = ((parsed && parsed.trips) || []).map(M.normalizeTrip);
      var active = parsed && parsed.activeTripId;
      var found = false;
      trips.forEach(function (t) { if (t.id === active) found = true; });
      return {
        version: 1,
        activeTripId: found ? active : (trips[0] ? trips[0].id : null),
        trips: trips
      };
    } catch (err) {
      console.warn('저장된 데이터를 읽지 못했어요', err);
      return empty;
    }
  }

  /* 예전 기본 샘플이 남은 브라우저를 위해, 그 샘플의 '모양'(2명 · 지출 7건 · 금액 목록)만으로 알아보고
     지금의 가명 샘플로 바꿔요. 사용자가 만든 여행이나 손댄 샘플은 그대로 둡니다. */
  var LEGACY_SAMPLE_AMOUNTS = [2745, 32000, 38000, 9800, 5000, 4200, 3600];

  function isLegacySample(t) {
    if (!t.isSample || t.members.length !== 2) return false;
    var want = LEGACY_SAMPLE_AMOUNTS.slice().sort(function (a, b) { return a - b; });
    var got = t.expenses.map(function (e) { return Math.round(M.num(e.amount)); })
      .sort(function (a, b) { return a - b; });
    if (got.length !== want.length) return false;
    for (var i = 0; i < want.length; i++) {
      if (got[i] !== want[i]) return false;
    }
    return true;
  }

  function scrubLegacySample() {
    var touched = false;
    state.trips.forEach(function (t) {
      if (!isLegacySample(t)) return;
      var fresh = M.sampleTrip();
      t.name = fresh.name;
      t.currency = fresh.currency;
      t.rate = fresh.rate;
      t.budget = fresh.budget;
      t.members = fresh.members;
      t.expenses = fresh.expenses;
      touched = true;
    });
    if (touched) save();
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove('show');
      setTimeout(function () { els.toast.hidden = true; }, 200);
    }, 2000);
  }

  /* ── 화면 전환 ───────────────────────────────────────── */

  function setView(name, opts) {
    ui.view = name;
    render();
    if (!opts || opts.scroll !== false) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function render() {
    if (!state) return;
    ['home', 'settle', 'settings'].forEach(function (name) {
      $('view-' + name).hidden = (ui.view !== name);
    });
    if (ui.view === 'home') $('view-home').innerHTML = homeHTML();
    else if (ui.view === 'settle') $('view-settle').innerHTML = settleHTML();
    else $('view-settings').innerHTML = settingsHTML();

    var tabs = document.querySelectorAll('[data-tab]');
    for (var i = 0; i < tabs.length; i++) {
      var isOn = tabs[i].getAttribute('data-tab') === ui.view;
      tabs[i].classList.toggle('active', isOn);
      tabs[i].setAttribute('aria-current', isOn ? 'page' : 'false');
    }
  }

  /* ── 홈 ──────────────────────────────────────────────── */

  function homeHTML() {
    var trip = activeTrip();
    if (!trip) return onboardingHTML();

    var s = M.computeSummary(trip);
    var code = s.currency;
    var meta = M.currencyMeta(code);
    var isKRW = code === 'KRW';

    var bigAmount = isKRW ? M.formatKRW(s.totalKRW) : M.formatLocal(s.totalLocal, code);
    var subLine = isKRW
      ? (s.expenseCount ? '지출 ' + s.expenseCount + '건 · ' + s.memberCount + '명' : '아직 기록이 없어요')
      : '약 ' + M.formatKRW(s.totalKRW) + (s.expenseCount ? ' · ' + s.expenseCount + '건' : '');

    var hero = '' +
      '<header class="tripbar">' +
        '<button type="button" class="trip-chip" data-action="open-trips">' +
          '<span class="trip-flag">' + currencyBadge(code) + '</span>' +
          '<span class="trip-name">' + esc(trip.name) + '</span>' +
          '<span class="trip-caret">▾</span>' +
        '</button>' +
        '<button type="button" class="round-btn" data-action="go-settings" aria-label="설정">⚙️</button>' +
      '</header>' +

      '<section class="hero">' +
        '<div class="hero-head">' +
          '<span class="hero-label">총 지출</span>' +
          '<span class="hero-cur">' + meta.code + '</span>' +
        '</div>' +
        '<div class="hero-amount">' + bigAmount + '</div>' +
        '<div class="hero-sub">' + subLine + '</div>' +
        '<div class="hero-stats">' +
          '<div class="hstat"><span>1인당</span><b>' + M.formatKRW(s.perPerson) + '</b></div>' +
          '<div class="hstat"><span>인원</span><b>' + s.memberCount + '명</b></div>' +
          '<div class="hstat"><span>기록</span><b>' + s.expenseCount + '건</b></div>' +
        '</div>' +
        (s.budget > 0 ? budgetBlock(s) : '') +
      '</section>';

    var sampleBanner = trip.isSample
      ? '<div class="sample-banner">' +
          '<div class="sb-text"><b>샘플 데이터예요</b><span>내 지출이 아니라 예시로 채워둔 거예요</span></div>' +
          '<button type="button" class="sb-btn" data-action="start-real-trip">내 여행 시작</button>' +
        '</div>'
      : '';

    var peek = '' +
      '<section class="card peek">' +
        '<div class="card-head">' +
          '<h2>💸 정산</h2>' +
          '<button type="button" class="link-btn" data-action="go-settle">자세히 ›</button>' +
        '</div>' +
        transfersCompactHTML(s) +
      '</section>';

    var cats = categoryStripHTML(s);
    var list = expenseListHTML(trip, s);

    return hero + sampleBanner + peek + cats + list +
      '<button type="button" class="fab-add" data-action="open-expense">지출 추가하기</button>';
  }

  function budgetBlock(s) {
    var pct = Math.round(s.budgetRatio * 100);
    var width = Math.max(2, Math.min(100, s.budgetRatio * 100));
    var over = s.budgetRatio > 1;
    return '' +
      '<div class="hero-budget">' +
        '<div class="hb-row">' +
          '<span>예산 ' + M.formatKRW(s.budget) + '</span>' +
          '<b class="' + (over ? 'over' : '') + '">' + pct + '%</b>' +
        '</div>' +
        '<div class="hb-bar"><i class="' + (over ? 'over' : '') + '" style="width:' + width + '%"></i></div>' +
        '<div class="hb-note">' + (over
          ? '예산보다 ' + M.formatKRW(s.totalKRW - s.budget) + ' 더 썼어요'
          : M.formatKRW(s.budget - s.totalKRW) + ' 남았어요') + '</div>' +
      '</div>';
  }

  function transfersCompactHTML(s) {
    if (!s.expenseCount) {
      return '<p class="peek-empty">아직 지출이 없어서 정산할 게 없어요 🌱</p>';
    }
    if (!s.transfers.length) {
      return '<p class="peek-empty">서로 주고받을 돈이 없어요 ✨<br><span>이미 딱 맞게 냈어요</span></p>';
    }
    var shown = s.transfers.slice(0, 2);
    var rows = shown.map(function (t) {
      return '<div class="trow">' +
        '<span class="trow-who"><b>' + esc(t.fromName) + '</b><i>→</i><b>' + esc(t.toName) + '</b></span>' +
        '<span class="trow-amt">' + M.formatKRW(t.amount) + '</span>' +
      '</div>';
    }).join('');
    var more = s.transfers.length > shown.length
      ? '<button type="button" class="trow-more" data-action="go-settle">외 ' + (s.transfers.length - shown.length) + '건 더 있어요</button>'
      : '';
    return '<div class="trows">' + rows + '</div>' + more;
  }

  function categoryStripHTML(s) {
    var cats = s.categories.filter(function (c) { return c.amount > 0; });
    if (!cats.length) return '';
    var bar = cats.map(function (c) {
      return '<i style="width:' + Math.max(3, c.ratio * 100) + '%;background:' + c.color + '"></i>';
    }).join('');
    var legend = cats.slice(0, 3).map(function (c) {
      return '<span class="cl"><i style="background:' + c.color + '"></i>' +
        c.emoji + ' ' + c.name + ' <b>' + Math.round(c.ratio * 100) + '%</b></span>';
    }).join('');
    return '<section class="card cat-card">' +
      '<div class="card-head"><h2>📊 카테고리</h2>' +
        '<span class="muted">' + M.formatKRW(s.totalKRW) + '</span></div>' +
      '<div class="cat-bar">' + bar + '</div>' +
      '<div class="cat-legend">' + legend + '</div>' +
      '</section>';
  }

  function expenseListHTML(trip, s) {
    if (!trip.expenses.length) {
      return '<section class="card empty-card">' +
        '<div class="empty-emoji">🧳</div>' +
        '<p class="empty-title">첫 지출을 기록해볼까요?</p>' +
        '<p class="empty-sub">밥값·교통·숙소까지 적어두면<br>누가 누구에게 얼마 보낼지 자동으로 계산해요</p>' +
        '<button type="button" class="btn-primary" data-action="open-expense">+ 지출 추가하기</button>' +
        '</section>';
    }

    var byDate = {};
    trip.expenses.forEach(function (e) {
      var d = M.parseDate(e.at);
      var key = d ? d.dateKey : '기타';
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(e);
    });
    var keys = Object.keys(byDate).sort().reverse();

    var html = '<div class="list-head"><h2>지출 내역</h2><span class="muted">' + trip.expenses.length + '건</span></div>';

    keys.forEach(function (key) {
      var items = byDate[key].slice().sort(function (a, b) {
        return String(b.at).localeCompare(String(a.at));
      });
      var daySum = M.sumKRW(items, trip.rate);
      html += '<div class="date-group">' +
        '<div class="date-head"><span>' + (key === '기타' ? '기타' : M.dateLabel(key)) + '</span>' +
        '<b>' + M.formatKRW(daySum) + '</b></div>' +
        '<div class="exp-list">' +
        items.map(function (e) { return expenseRowHTML(e, trip); }).join('') +
        '</div></div>';
    });
    return html;
  }

  function expenseRowHTML(e, trip) {
    var cat = M.categoryMeta(e.category);
    var person = memberName(trip, e.payerId);
    var partCount = (e.participantIds || []).length || trip.members.length;
    var local = e.paidInKRW ? e.amountKRW : e.amount;
    var localText = e.paidInKRW ? M.formatKRW(local) : M.formatLocal(local, trip.currency);
    var krwText = e.paidInKRW ? '' : M.formatKRW(M.expenseKRW(e, trip.rate));
    var metaParts = [person + ' 결제'];
    metaParts.push(partCount + '명이 나눔');
    metaParts.push(M.timeLabel(e.at));
    if (e.paidInKRW) metaParts.push('원화 결제');

    return '<button type="button" class="exp-row" data-action="edit-expense" data-id="' + esc(e.id) + '">' +
      '<span class="cat-badge" style="background:' + cat.color + '22;color:' + cat.color + '">' + cat.emoji + '</span>' +
      '<span class="exp-main">' +
        '<span class="exp-title">' + esc(e.title) +
          (e.isSample ? '<i class="tag-sample">샘플</i>' : '') + '</span>' +
        '<span class="exp-meta">' + esc(metaParts.join(' · ')) + '</span>' +
        (e.memo ? '<span class="exp-memo">📝 ' + esc(e.memo) + '</span>' : '') +
      '</span>' +
      '<span class="exp-amt"><b>' + localText + '</b>' + (krwText ? '<i>' + krwText + '</i>' : '') + '</span>' +
      '</button>';
  }

  function memberName(trip, id) {
    for (var i = 0; i < trip.members.length; i++) {
      if (trip.members[i].id === id) return trip.members[i].name;
    }
    return trip.members[0] ? trip.members[0].name : '-';
  }

  function onboardingHTML() {
    return '' +
      '<div class="onboard">' +
        '<div class="onboard-emoji">🧳✨</div>' +
        '<h1>여행 경비,<br>같이 정산해요</h1>' +
        '<p class="onboard-sub">지출만 적으면 누가 누구에게<br>얼마 보낼지 자동으로 계산해 드려요</p>' +
        '<div class="onboard-actions">' +
          '<button type="button" class="btn-primary big" data-action="new-trip">+ 새 여행 만들기</button>' +
          '<button type="button" class="btn-ghost big" data-action="load-sample">샘플 여행 구경하기 (봄 여행 2박 3일)</button>' +
        '</div>' +
        '<p class="onboard-note">샘플은 연습용 데이터예요 · 언제든 지울 수 있어요</p>' +
      '</div>';
  }

  /* ── 정산 화면 ───────────────────────────────────────── */

  function settleHTML() {
    var trip = activeTrip();
    if (!trip) return onboardingHTML();
    var s = M.computeSummary(trip);
    var code = s.currency;

    if (!s.expenseCount) {
      return '<header class="page-head"><h1>정산 결과</h1>' +
        '<p>지출을 먼저 기록해 주세요</p></header>' +
        '<section class="card empty-card"><div class="empty-emoji">🧮</div>' +
        '<p class="empty-title">아직 정산할 게 없어요</p>' +
        '<p class="empty-sub">지출을 추가하면 여기에<br>한눈에 정산 결과가 나와요</p>' +
        '<button class="btn-primary" type="button" data-action="open-expense">+ 지출 추가하기</button></section>';
    }

    var members = s.rows.map(function (r) {
      var state2 = r.balance > 0 ? 'receive' : (r.balance < 0 ? 'send' : 'even');
      var badge = r.balance > 0
        ? '<span class="m-badge receive">받을 돈 ' + M.formatKRW(r.balance) + '</span>'
        : (r.balance < 0
          ? '<span class="m-badge send">보낼 돈 ' + M.formatKRW(-r.balance) + '</span>'
          : '<span class="m-badge even">딱 맞아요</span>');
      return '<div class="m-row ' + state2 + '">' +
        '<div class="m-top"><b class="m-name">' + esc(r.name) + '</b>' + badge + '</div>' +
        '<div class="m-nums">' +
          '<span>냈어요 <b>' + M.formatKRW(r.paid) + '</b></span>' +
          '<span>부담 <b>' + M.formatKRW(r.share) + '</b></span>' +
        '</div>' +
        '</div>';
    }).join('');

    var transfers = s.transfers.length
      ? s.transfers.map(function (t) {
        return '<div class="transfer-card">' +
          '<div class="tc-top">' +
            '<span class="tc-from">' + esc(t.fromName) + '</span>' +
            '<span class="tc-arrow">→</span>' +
            '<span class="tc-to">' + esc(t.toName) + '</span>' +
          '</div>' +
          '<div class="tc-amount">' + M.formatKRW(t.amount) + '</div>' +
          '</div>';
      }).join('')
      : '<p class="peek-empty">서로 주고받을 돈이 없어요 ✨<br><span>이미 딱 맞게 냈어요</span></p>';

    var cats = s.categories.filter(function (c) { return c.amount > 0; }).map(function (c) {
      return '<div class="cat-row">' +
        '<span class="cr-name">' + c.emoji + ' ' + c.name + '</span>' +
        '<span class="cr-bar"><i style="width:' + Math.max(2, c.ratio * 100) + '%;background:' + c.color + '"></i></span>' +
        '<span class="cr-amt">' + M.formatKRW(c.amount) + '<i>' + Math.round(c.ratio * 100) + '%</i></span>' +
        '</div>';
    }).join('');

    return '' +
      '<header class="page-head">' +
        '<h1>정산 결과</h1>' +
        '<p>' + esc(trip.name) + ' · ' + s.memberCount + '명 · ' + s.expenseCount + '건</p>' +
      '</header>' +

      '<section class="hero compact">' +
        '<div class="hero-head"><span class="hero-label">총 지출</span>' +
          '<span class="hero-cur">' + code + '</span></div>' +
        '<div class="hero-amount small">' + (code === 'KRW' ? M.formatKRW(s.totalKRW) : M.formatLocal(s.totalLocal, code)) + '</div>' +
        '<div class="hero-sub">' + (code === 'KRW' ? s.memberCount + '명이 나눠서' : '약 ' + M.formatKRW(s.totalKRW)) + '</div>' +
        '<div class="hero-stats">' +
          '<div class="hstat"><span>1인당</span><b>' + M.formatKRW(s.perPerson) + '</b></div>' +
          '<div class="hstat"><span>1건 평균</span><b>' + M.formatKRW(s.averagePerExpense) + '</b></div>' +
          '<div class="hstat"><span>이체</span><b>' + s.transfers.length + '번</b></div>' +
        '</div>' +
        (s.budget > 0 ? budgetBlock(s) : '') +
      '</section>' +

      '<section class="card">' +
        '<div class="card-head"><h2>👥 멤버별</h2>' +
          '<span class="muted">냈어요 / 부담</span></div>' +
        '<div class="m-list">' + members + '</div>' +
      '</section>' +

      '<section class="card">' +
        '<div class="card-head"><h2>💌 이렇게 보내면 끝!</h2>' +
          '<span class="muted">' + (s.transfers.length ? s.transfers.length + '번' : '완료') + '</span></div>' +
        '<div class="transfer-list">' + transfers + '</div>' +
        (s.transfers.length ? '<p class="hint">가장 적은 횟수로 보내는 방법이에요</p>' : '') +
      '</section>' +

      '<section class="card">' +
        '<div class="card-head"><h2>📊 카테고리별</h2>' +
          '<span class="muted">' + M.formatKRW(s.totalKRW) + '</span></div>' +
        '<div class="cat-rows">' + cats + '</div>' +
      '</section>' +

      '<div class="copy-bar">' +
        '<button type="button" class="btn-primary big" data-action="copy-settle">📋 정산 요약 복사</button>' +
      '</div>';
  }

  /* ── 설정 화면 ───────────────────────────────────────── */

  function settingsHTML() {
    var trip = activeTrip();
    if (!trip) return onboardingHTML();
    var meta = M.currencyMeta(trip.currency);

    var curOptions = M.CURRENCY_LIST.map(function (c) {
      return '<option value="' + c.code + '"' + (c.code === trip.currency ? ' selected' : '') + '>' +
        c.code + ' · ' + c.name + '</option>';
    }).join('');

    var memberChips = trip.members.map(function (m) {
      return '<span class="mem-chip">' + esc(m.name) +
        ' <button type="button" class="mem-x" data-action="remove-member" data-id="' + esc(m.id) + '" aria-label="' + esc(m.name) + ' 삭제">×</button></span>';
    }).join('');

    var tripItems = state.trips.map(function (t) {
      var on = t.id === trip.id;
      var sum = M.sumKRW(t.expenses, t.rate);
      return '<div class="trip-item' + (on ? ' on' : '') + '">' +
        '<button type="button" class="ti-main" data-action="switch-trip" data-id="' + esc(t.id) + '">' +
          '<span class="ti-flag">' + currencyBadge(t.currency) + '</span>' +
          '<span class="ti-text"><b>' + esc(t.name) + '</b>' +
            '<span>' + t.members.length + '명 · ' + M.formatKRW(sum) + (t.isSample ? ' · 샘플' : '') + '</span></span>' +
          (on ? '<span class="ti-on">사용 중</span>' : '') +
        '</button>' +
        '<button type="button" class="ti-del" data-action="delete-trip" data-id="' + esc(t.id) + '" aria-label="삭제">🗑</button>' +
        '</div>';
    }).join('');

    return '' +
      '<header class="page-head"><h1>설정</h1><p>여행 정보와 멤버, 백업을 관리해요</p></header>' +

      '<form class="card" data-form="trip-info">' +
        '<div class="card-head"><h2>🧳 여행 정보</h2></div>' +
        '<label class="field"><span class="field-label">여행 이름</span>' +
          '<input name="name" type="text" value="' + esc(trip.name) + '" placeholder="예) 오사카 3박 4일"></label>' +
        '<label class="field"><span class="field-label">통화</span>' +
          '<select name="currency" id="set-currency">' + curOptions + '</select></label>' +
        '<label class="field"><span class="field-label">환율 (1 ' + meta.code + ' = ? 원)</span>' +
          '<input name="rate" id="set-rate" type="text" inputmode="decimal" value="' + trip.rate + '">' +
          '<span class="field-hint">기본값은 ' + M.RATE_ASOF + ' 환율이에요 · 직접 고칠 수 있어요</span></label>' +
        '<label class="field"><span class="field-label">예산 (원, 선택)</span>' +
          '<input name="budget" type="text" inputmode="numeric" value="' + (trip.budget ? M.formatNumber(trip.budget, 0) : '') + '" placeholder="예) 600000"></label>' +
        '<button type="submit" class="btn-primary">저장하기</button>' +
      '</form>' +

      '<section class="card">' +
        '<div class="card-head"><h2>👯 함께 하는 사람</h2><span class="muted">' + trip.members.length + '명</span></div>' +
        '<div class="mem-chips">' + memberChips + '</div>' +
        '<form class="mem-add" data-form="member-add">' +
          '<input name="member" type="text" placeholder="이름 (예: 민지)" maxlength="12">' +
          '<button type="submit" class="btn-soft">추가</button>' +
        '</form>' +
        '<p class="field-hint">지출에서 나눌 사람을 고를 수 있어요 · 1인당은 전체 인원 기준이에요</p>' +
      '</section>' +

      '<section class="card">' +
        '<div class="card-head"><h2>🗂 내 여행</h2><span class="muted">' + state.trips.length + '개</span></div>' +
        '<div class="trip-list">' + tripItems + '</div>' +
        '<div class="row-btns">' +
          '<button type="button" class="btn-soft" data-action="new-trip">+ 새 여행</button>' +
          '<button type="button" class="btn-soft" data-action="load-sample">샘플 불러오기</button>' +
        '</div>' +
      '</section>' +

      '<section class="card">' +
        '<div class="card-head"><h2>💾 백업</h2></div>' +
        '<div class="row-btns">' +
          '<button type="button" class="btn-soft" data-action="export-json">JSON 내보내기</button>' +
          '<button type="button" class="btn-soft" data-action="import-json">JSON 불러오기</button>' +
        '</div>' +
        '<input type="file" id="import-file" accept="application/json,.json" hidden>' +
        '<p class="field-hint">내보낸 파일은 다른 기기에서 불러올 수 있어요</p>' +
      '</section>' +

      '<section class="card">' +
        '<div class="card-head"><h2>📱 앱처럼 쓰기</h2></div>' +
        '<p class="field-hint">사파리에서 <b>공유 → 홈 화면에 추가</b>를 누르면 앱처럼 열려요. 인터넷이 없어도 기록할 수 있어요.</p>' +
      '</section>' +

      '<section class="card danger-card">' +
        '<div class="card-head"><h2>⚠️ 데이터</h2></div>' +
        '<button type="button" class="btn-danger" data-action="reset-all">모든 여행 데이터 지우기</button>' +
        '<p class="field-hint">이 기기의 저장 공간(localStorage)에서만 지워져요. 서버로 보내는 데이터는 없어요.</p>' +
      '</section>' +

      '<p class="app-foot">여행 경비 정산 · 트립스플릿<br>환율 기준일 ' + M.RATE_ASOF + '</p>';
  }

  /* ── 시트(바텀시트) ──────────────────────────────────── */

  function openSheet(html) {
    clearTimeout(sheetTimer);
    els.sheet.innerHTML = html;
    els.sheet.hidden = false;
    els.backdrop.hidden = false;
    document.body.classList.add('sheet-open');
    requestAnimationFrame(function () {
      els.sheet.classList.add('open');
      els.backdrop.classList.add('open');
    });
    var focusEl = els.sheet.querySelector('[data-autofocus]');
    if (focusEl) setTimeout(function () { try { focusEl.focus(); } catch (e) {} }, 240);
  }

  function closeSheet() {
    els.sheet.classList.remove('open');
    els.backdrop.classList.remove('open');
    document.body.classList.remove('sheet-open');
    ui.form = null;
    ui.newTrip = null;
    clearTimeout(sheetTimer);
    sheetTimer = setTimeout(function () {
      els.sheet.hidden = true;
      els.backdrop.hidden = true;
      els.sheet.innerHTML = '';
    }, 200);
  }

  /* 지출 추가/수정 시트 */
  function openExpenseSheet(expenseId) {
    var trip = activeTrip();
    if (!trip) { openTripCreateSheet(); return; }
    var editing = null;
    if (expenseId) {
      trip.expenses.forEach(function (e) { if (e.id === expenseId) editing = e; });
    }
    var code = trip.currency;
    var meta = M.currencyMeta(code);
    var payerId = editing && editing.payerId ? editing.payerId : (trip.members[0] ? trip.members[0].id : null);
    var parts = editing && editing.participantIds && editing.participantIds.length
      ? editing.participantIds.slice()
      : trip.members.map(function (m) { return m.id; });

    ui.form = {
      id: editing ? editing.id : null,
      category: editing ? editing.category : 'food',
      payerId: payerId,
      participantIds: parts,
      paidInKRW: editing ? !!editing.paidInKRW : false
    };

    var amountValue = editing ? (editing.paidInKRW ? editing.amountKRW : editing.amount) : '';
    var atValue = editing && editing.at ? editing.at : M.nowLocalInput();

    var html = '' +
      '<form class="sheet-form" data-form="expense" novalidate>' +
        '<div class="sheet-grab"></div>' +
        '<div class="sheet-head">' +
          '<h2>' + (editing ? '지출 수정' : '지출 추가') + '</h2>' +
          '<button type="button" class="icon-btn" data-action="close-sheet" aria-label="닫기">✕</button>' +
        '</div>' +
        '<div class="sheet-body">' +

          '<label class="field">' +
            '<span class="field-label">무엇에 썼어요?</span>' +
            '<input id="f-title" name="title" type="text" placeholder="예) 라멘 한 그릇" maxlength="40" value="' + esc(editing ? editing.title : '') + '"' + (editing ? '' : ' data-autofocus') + '>' +
          '</label>' +

          '<div class="field">' +
            '<div class="field-row">' +
              '<span class="field-label" id="amount-label">금액</span>' +
              '<button type="button" class="mini-toggle' + (ui.form.paidInKRW ? ' on' : '') + '" data-action="toggle-krw">' +
                (ui.form.paidInKRW ? '원화로 적는 중' : '원화로 결제했어요') +
              '</button>' +
            '</div>' +
            '<div class="amount-row">' +
              '<span class="amount-cur">' + (ui.form.paidInKRW ? '₩' : meta.symbol) + '</span>' +
              '<input id="f-amount" name="amount" type="text" inputmode="decimal" placeholder="0" value="' + (amountValue === '' ? '' : amountValue) + '">' +
            '</div>' +
            '<div class="live-krw" id="live-krw"></div>' +
          '</div>' +

          '<div class="field">' +
            '<span class="field-label">카테고리</span>' +
            '<div class="cat-chips" id="cat-chips">' + catChipsHTML() + '</div>' +
          '</div>' +

          '<div class="field">' +
            '<span class="field-label">결제한 사람</span>' +
            '<div class="chips" id="payer-chips">' + payerChipsHTML(trip) + '</div>' +
          '</div>' +

          '<div class="field">' +
            '<span class="field-label">나눌 사람 <i class="field-hint inline">' + ui.form.participantIds.length + '명</i></span>' +
            '<div class="chips" id="part-chips">' + partChipsHTML(trip) + '</div>' +
          '</div>' +

          '<label class="field">' +
            '<span class="field-label">날짜 · 시간</span>' +
            '<input id="f-at" name="at" type="datetime-local" value="' + esc(atValue) + '">' +
          '</label>' +

          '<label class="field">' +
            '<span class="field-label">메모 (선택)</span>' +
            '<input id="f-memo" name="memo" type="text" placeholder="예) 2명이서 나눠 먹음" maxlength="60" value="' + esc(editing ? editing.memo : '') + '">' +
          '</label>' +

          '<div class="sheet-actions">' +
            '<button type="submit" class="btn-primary big">' + (editing ? '수정 저장' : '추가하기') + '</button>' +
            (editing ? '<button type="button" class="btn-danger ghost" data-action="delete-expense" data-id="' + esc(editing.id) + '">이 지출 삭제</button>' : '') +
          '</div>' +
        '</div>' +
      '</form>';

    openSheet(html);
    updateLivePreview();
  }

  function catChipsHTML() {
    return M.CATEGORIES.map(function (c) {
      var on = ui.form.category === c.id ? ' on' : '';
      return '<button type="button" class="cchip' + on + '" data-action="pick-cat" data-id="' + c.id + '">' +
        '<span class="cchip-emoji">' + c.emoji + '</span>' + c.name + '</button>';
    }).join('');
  }

  function payerChipsHTML(trip) {
    return trip.members.map(function (m) {
      var on = ui.form.payerId === m.id ? ' on' : '';
      return '<button type="button" class="pchip' + on + '" data-action="pick-payer" data-id="' + esc(m.id) + '">' + esc(m.name) + '</button>';
    }).join('');
  }

  function partChipsHTML(trip) {
    var allOn = trip.members.length > 0 && ui.form.participantIds.length === trip.members.length;
    var html = '<button type="button" class="pchip all' + (allOn ? ' on' : '') + '" data-action="pick-part-all">전체</button>';
    html += trip.members.map(function (m) {
      var on = ui.form.participantIds.indexOf(m.id) >= 0 ? ' on' : '';
      return '<button type="button" class="pchip' + on + '" data-action="pick-part" data-id="' + esc(m.id) + '">' + esc(m.name) + '</button>';
    }).join('');
    return html;
  }

  function formatAmountValue(value) {
    var code = ui.form && ui.form.paidInKRW
      ? 'KRW'
      : (activeTrip() ? activeTrip().currency : 'KRW');
    var decimals = M.currencyMeta(code).decimals;
    var cleaned = String(value == null ? '' : value).replace(decimals > 0 ? /[^\d.]/g : /[^\d]/g, '');
    if (decimals > 0) {
      var firstDot = cleaned.indexOf('.');
      if (firstDot >= 0) {
        var intRaw = cleaned.slice(0, firstDot);
        var decRaw = cleaned.slice(firstDot + 1).replace(/\./g, '').slice(0, decimals);
        cleaned = intRaw + '.' + decRaw;
      }
    }
    if (!cleaned) return '';
    var dot = cleaned.indexOf('.');
    var intPart = dot >= 0 ? cleaned.slice(0, dot) : cleaned;
    var rest = dot >= 0 ? cleaned.slice(dot) : '';
    var grouped = intPart === '' ? '0' : M.formatNumber(M.num(intPart), 0);
    return grouped + rest;
  }

  function updateLivePreview() {
    var box = $('live-krw');
    if (!box || !ui.form) return;
    var trip = activeTrip();
    if (!trip) return;
    var amountEl = $('f-amount');
    var raw = M.num(amountEl ? amountEl.value : 0);
    var rate = M.num(trip.rate);
    var code = trip.currency;
    var meta = M.currencyMeta(code);

    if (raw <= 0) {
      box.innerHTML = ui.form.paidInKRW
        ? '원화 금액을 적으면 ' + meta.name + '으로도 보여드려요'
        : '금액을 적으면 원화로 바꿔서 보여드려요';
      box.classList.remove('active');
      return;
    }
    box.classList.add('active');

    var krw, other;
    if (ui.form.paidInKRW) {
      krw = Math.round(raw);
      other = rate > 0 ? raw / rate : 0;
      box.innerHTML = '≈ ' + M.formatKRW(krw) +
        (rate > 0 ? ' <i>(' + M.formatLocal(other, code) + ')</i>' : '');
    } else {
      krw = Math.round(raw * rate);
      box.innerHTML = '≈ ' + M.formatKRW(krw);
    }

    var parts = ui.form.participantIds.length || trip.members.length;
    if (parts > 1) {
      box.innerHTML += '<span class="live-split">' + parts + '명이 나누면 1인 ' +
        M.formatKRW(Math.round(krw / parts)) + '</span>';
    }
  }

  /* 여행 만들기 시트 */
  function openTripCreateSheet() {
    ui.newTrip = { currency: 'JPY' };
    var html = '' +
      '<form class="sheet-form" data-form="trip-new" novalidate>' +
        '<div class="sheet-grab"></div>' +
        '<div class="sheet-head">' +
          '<h2>새 여행 만들기</h2>' +
          '<button type="button" class="icon-btn" data-action="close-sheet" aria-label="닫기">✕</button>' +
        '</div>' +
        '<div class="sheet-body">' +
          '<label class="field">' +
            '<span class="field-label">여행 이름</span>' +
            '<input id="t-name" name="name" type="text" placeholder="예) 오사카 3박 4일" maxlength="30" data-autofocus>' +
          '</label>' +
          '<div class="field">' +
            '<span class="field-label">통화</span>' +
            '<div class="chips" id="cur-chips">' + curChipsHTML() + '</div>' +
          '</div>' +
          '<label class="field">' +
            '<span class="field-label">환율 (1 <b id="rate-code">JPY</b> = ? 원)</span>' +
            '<input id="t-rate" name="rate" type="text" inputmode="decimal" value="' + M.currencyMeta('JPY').rate + '">' +
            '<span class="field-hint" id="rate-note">' + rateNoteHTML('JPY') + '</span>' +
          '</label>' +
          '<label class="field">' +
            '<span class="field-label">함께 하는 사람</span>' +
            '<input id="t-members" name="members" type="text" placeholder="예) 민지, 지훈" maxlength="80">' +
            '<span class="field-hint">쉼표(,)로 구분해 주세요 · 나중에 추가할 수 있어요</span>' +
          '</label>' +
          '<label class="field">' +
            '<span class="field-label">예산 (원, 선택)</span>' +
            '<input id="t-budget" name="budget" type="text" inputmode="numeric" placeholder="예) 600000">' +
          '</label>' +
          '<div class="sheet-actions">' +
            '<button type="submit" class="btn-primary big">여행 시작하기</button>' +
          '</div>' +
        '</div>' +
      '</form>';
    openSheet(html);
  }

  function curChipsHTML() {
    var quick = ['KRW', 'JPY', 'PHP', 'USD', 'EUR', 'THB', 'TWD', 'HKD', 'VND', 'SGD', 'CNY', 'GBP', 'AUD', 'CAD'];
    return quick.map(function (code) {
      var on = ui.newTrip.currency === code ? ' on' : '';
      return '<button type="button" class="pchip cur' + on + '" data-action="pick-currency" data-id="' + code + '">' +
        currencyBadge(code) + ' ' + code + '</button>';
    }).join('');
  }

  function rateNoteHTML(code) {
    var meta = M.currencyMeta(code);
    if (code === 'KRW') return '원화 여행이면 환율은 1이에요';
    return M.RATE_ASOF + ' 기준 ' + M.formatNumber(meta.rate, 4) + '원 · 직접 고쳐도 돼요';
  }

  /* 여행 전환 시트 */
  function openTripSheet() {
    var trip = activeTrip();
    var items = state.trips.map(function (t) {
      var on = trip && t.id === trip.id;
      var sum = M.sumKRW(t.expenses, t.rate);
      return '<button type="button" class="sheet-trip' + (on ? ' on' : '') + '" data-action="switch-trip" data-id="' + esc(t.id) + '">' +
        '<span class="st-flag">' + currencyBadge(t.currency) + '</span>' +
        '<span class="st-text"><b>' + esc(t.name) + '</b>' +
          '<span>' + t.members.length + '명 · ' + M.formatKRW(sum) + (t.isSample ? ' · 샘플' : '') + '</span></span>' +
        (on ? '<span class="st-on">✓</span>' : '') +
        '</button>';
    }).join('');

    openSheet('' +
      '<div class="sheet-form">' +
        '<div class="sheet-grab"></div>' +
        '<div class="sheet-head"><h2>여행 선택</h2>' +
          '<button type="button" class="icon-btn" data-action="close-sheet" aria-label="닫기">✕</button></div>' +
        '<div class="sheet-body">' +
          '<div class="sheet-trips">' + items + '</div>' +
          '<button type="button" class="btn-primary big" data-action="new-trip">+ 새 여행 만들기</button>' +
          '<button type="button" class="btn-ghost" data-action="load-sample">샘플 여행 구경하기</button>' +
        '</div>' +
      '</div>');
  }

  /* ── 동작 처리 ───────────────────────────────────────── */

  function handleAction(action, el) {
    var trip = activeTrip();

    switch (action) {
      case 'close-sheet':
        closeSheet();
        break;

      case 'open-expense':
        openExpenseSheet(null);
        break;

      case 'edit-expense':
        openExpenseSheet(el.getAttribute('data-id'));
        break;

      case 'delete-expense':
        deleteExpense(el.getAttribute('data-id'));
        break;

      case 'pick-cat':
        if (!ui.form) return;
        ui.form.category = el.getAttribute('data-id');
        $('cat-chips').innerHTML = catChipsHTML();
        break;

      case 'pick-payer':
        if (!ui.form) return;
        ui.form.payerId = el.getAttribute('data-id');
        $('payer-chips').innerHTML = payerChipsHTML(trip);
        break;

      case 'pick-part':
        if (!ui.form) return;
        toggleParticipant(el.getAttribute('data-id'));
        break;

      case 'pick-part-all':
        if (!ui.form) return;
        ui.form.participantIds = trip.members.map(function (m) { return m.id; });
        $('part-chips').innerHTML = partChipsHTML(trip);
        refreshPartLabel();
        updateLivePreview();
        break;

      case 'toggle-krw':
        if (!ui.form) return;
        toggleKrwMode();
        break;

      case 'pick-currency':
        if (!ui.newTrip) return;
        ui.newTrip.currency = el.getAttribute('data-id');
        $('cur-chips').innerHTML = curChipsHTML();
        $('rate-code').textContent = ui.newTrip.currency;
        $('t-rate').value = M.currencyMeta(ui.newTrip.currency).rate;
        $('rate-note').innerHTML = rateNoteHTML(ui.newTrip.currency);
        break;

      case 'open-trips':
        openTripSheet();
        break;

      case 'switch-trip':
        switchTrip(el.getAttribute('data-id'));
        break;

      case 'delete-trip':
        deleteTrip(el.getAttribute('data-id'));
        break;

      case 'new-trip':
        openTripCreateSheet();
        break;

      case 'start-real-trip':
        closeSheet();
        openTripCreateSheet();
        break;

      case 'load-sample':
        loadSample();
        break;

      case 'go-settle':
        setView('settle');
        break;

      case 'go-settings':
        setView('settings');
        break;

      case 'copy-settle':
        if (!activeTrip()) return;
        copyText(M.buildShareText(activeTrip()), '정산 요약을 복사했어요 📋 카톡에 붙여넣기!');
        break;

      case 'export-json':
        exportJSON();
        break;

      case 'import-json':
        $('import-file').click();
        break;

      case 'remove-member':
        removeMember(el.getAttribute('data-id'));
        break;

      case 'reset-all':
        resetAll();
        break;

      default:
        break;
    }
  }

  function refreshPartLabel() {
    var label = document.querySelector('#part-chips');
    if (!label || !ui.form) return;
    var hint = document.querySelector('.field-hint.inline');
    if (hint) hint.textContent = (ui.form.participantIds.length || activeTrip().members.length) + '명';
  }

  function toggleParticipant(id) {
    var trip = activeTrip();
    if (!trip) return;
    var idx = ui.form.participantIds.indexOf(id);
    if (idx >= 0) {
      if (ui.form.participantIds.length <= 1) { toast('한 사람은 골라야 해요'); return; }
      ui.form.participantIds.splice(idx, 1);
    } else {
      ui.form.participantIds.push(id);
    }
    $('part-chips').innerHTML = partChipsHTML(trip);
    refreshPartLabel();
    updateLivePreview();
  }

  function toggleKrwMode() {
    var trip = activeTrip();
    if (!trip) return;
    var amountEl = $('f-amount');
    var raw = M.num(amountEl ? amountEl.value : 0);
    var meta = M.currencyMeta(trip.currency);

    // 적어둔 숫자는 그대로 두고 '이 결제가 원화였는지'만 바꿔요
    ui.form.paidInKRW = !ui.form.paidInKRW;
    if (amountEl && raw > 0) amountEl.value = String(ui.form.paidInKRW ? Math.round(raw) : raw);
    var curEl = document.querySelector('.amount-cur');
    if (curEl) curEl.textContent = ui.form.paidInKRW ? '₩' : meta.symbol;

    var btn = document.querySelector('.mini-toggle');
    if (btn) {
      btn.textContent = ui.form.paidInKRW ? '원화로 적는 중' : '원화로 결제했어요';
      btn.classList.toggle('on', ui.form.paidInKRW);
    }
    updateLivePreview();
  }

  function deleteExpense(id) {
    var trip = activeTrip();
    if (!trip || !id) return;
    if (!confirm('이 지출을 삭제할까요?')) return;
    trip.expenses = trip.expenses.filter(function (e) { return e.id !== id; });
    save(); closeSheet(); render();
    toast('지출을 삭제했어요');
  }

  function switchTrip(id) {
    if (!state.trips.some(function (t) { return t.id === id; })) return;
    state.activeTripId = id;
    save(); closeSheet(); render();
    toast('여행을 바꿨어요');
  }

  function deleteTrip(id) {
    var target = null;
    state.trips.forEach(function (t) { if (t.id === id) target = t; });
    if (!target) return;
    if (!confirm('"' + target.name + '" 여행을 지울까요?\n기록한 지출 ' + target.expenses.length + '건도 함께 사라져요.')) return;
    state.trips = state.trips.filter(function (t) { return t.id !== id; });
    if (state.activeTripId === id) state.activeTripId = state.trips[0] ? state.trips[0].id : null;
    save(); closeSheet(); render();
    toast('여행을 지웠어요');
  }

  function loadSample() {
    var existing = null;
    state.trips.forEach(function (t) { if (t.isSample) existing = t; });
    if (existing) {
      state.activeTripId = existing.id;
      save(); closeSheet(); render();
      toast('샘플 여행으로 이동했어요');
      return;
    }
    var sample = M.sampleTrip();
    state.trips.push(sample);
    state.activeTripId = sample.id;
    save(); closeSheet(); render();
    toast('샘플 여행을 불러왔어요 (연습용)');
  }

  function saveExpenseForm(form) {
    var trip = activeTrip();
    if (!trip || !ui.form) return;
    var titleEl = $('f-title');
    var amountEl = $('f-amount');
    var atEl = $('f-at');
    var memoEl = $('f-memo');
    var raw = M.num(amountEl ? amountEl.value : 0);

    if (raw <= 0) {
      toast('금액을 적어 주세요 💸');
      if (amountEl) amountEl.focus();
      return;
    }

    var memberIds = trip.members.map(function (m) { return m.id; });
    var parts = ui.form.participantIds.filter(function (id) { return memberIds.indexOf(id) >= 0; });
    if (!parts.length) parts = memberIds.slice();

    var title = (titleEl && titleEl.value || '').trim() || M.categoryMeta(ui.form.category).name;
    var payload = {
      id: ui.form.id || M.uid('e'),
      title: title,
      paidInKRW: ui.form.paidInKRW,
      amount: ui.form.paidInKRW ? 0 : raw,
      amountKRW: ui.form.paidInKRW ? Math.round(raw) : 0,
      category: ui.form.category,
      payerId: ui.form.payerId || memberIds[0],
      participantIds: parts,
      at: (atEl && atEl.value) || M.nowLocalInput(),
      memo: (memoEl && memoEl.value || '').trim(),
      isSample: editingSampleFlag(ui.form.id)
    };

    if (ui.form.id) {
      trip.expenses = trip.expenses.map(function (e) { return e.id === payload.id ? payload : e; });
      toast('지출을 수정했어요 ✏️');
    } else {
      trip.expenses.push(payload);
      toast('지출을 기록했어요 💗');
    }
    save(); closeSheet(); render();
  }

  function editingSampleFlag(expenseId) {
    var trip = activeTrip();
    if (!trip || !expenseId) return false;
    var flag = false;
    trip.expenses.forEach(function (e) { if (e.id === expenseId) flag = !!e.isSample; });
    return flag;
  }

  function saveTripInfoForm(form) {
    var trip = activeTrip();
    if (!trip) return;
    var nameEl = form.querySelector('[name="name"]');
    var curEl = form.querySelector('[name="currency"]');
    var rateEl = form.querySelector('[name="rate"]');
    var budgetEl = form.querySelector('[name="budget"]');
    var newCode = curEl ? curEl.value : trip.currency;
    var newRate = M.num(rateEl ? rateEl.value : trip.rate);

    if (newCode !== trip.currency && trip.expenses.length) {
      var ok = confirm('통화를 ' + trip.currency + ' → ' + newCode + '로 바꿀까요?\n기록된 금액 숫자는 그대로 두고 새 통화로 계산해요.');
      if (!ok) { render(); return; }
    }
    trip.name = (nameEl && nameEl.value || '').trim() || trip.name;
    trip.currency = newCode;
    trip.rate = newRate > 0 ? newRate : M.currencyMeta(newCode).rate;
    trip.budget = Math.max(0, Math.round(M.num(budgetEl ? budgetEl.value : 0)));
    save(); render();
    toast('여행 정보를 저장했어요 ✨');
  }

  function addMember(form) {
    var trip = activeTrip();
    if (!trip) return;
    var input = form.querySelector('[name="member"]');
    var name = (input && input.value || '').trim();
    if (!name) { toast('이름을 적어 주세요'); if (input) input.focus(); return; }
    if (trip.members.some(function (m) { return m.name === name; })) {
      toast('이미 있는 이름이에요');
      return;
    }
    trip.members.push(M.member(name));
    save(); render();
    toast(name + ' 님을 추가했어요');
  }

  function removeMember(id) {
    var trip = activeTrip();
    if (!trip || trip.members.length <= 1) { toast('멤버가 한 명은 있어야 해요'); return; }
    var target = trip.members.filter(function (m) { return m.id === id; })[0];
    if (!target) return;
    if (!confirm('"' + target.name + '" 님을 뺄까요?\n이 사람이 낸 지출은 다른 멤버 결제로 바뀌어요.')) return;

    trip.members = trip.members.filter(function (m) { return m.id !== id; });
    var fallback = trip.members[0].id;
    trip.expenses.forEach(function (e) {
      if (e.payerId === id) e.payerId = fallback;
      e.participantIds = (e.participantIds || []).filter(function (pid) { return pid !== id; });
      if (!e.participantIds.length) e.participantIds = trip.members.map(function (m) { return m.id; });
    });
    save(); render();
    toast(target.name + ' 님을 뺐어요');
  }

  function resetAll() {
    if (!confirm('모든 여행과 지출 기록을 지울까요?\n이 기기에서 되돌릴 수 없어요.')) return;
    if (!confirm('정말요? 한 번 더 확인할게요 🙏')) return;
    state = { version: 1, activeTripId: null, trips: [] };
    save(); closeSheet(); setView('home');
    toast('모든 데이터를 지웠어요');
  }

  /* ── 복사/백업 ───────────────────────────────────────── */

  function copyText(text, okMessage) {
    function done() { toast(okMessage || '복사했어요 📋'); }
    function fail() {
      if (legacyCopy(text)) done();
      else toast('복사가 안 됐어요 · 길게 눌러 복사해 주세요');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fail);
    } else fail();
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (err) { return false; }
  }

  function exportJSON() {
    var now = new Date();
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    var stamp = '' + now.getFullYear() + p2(now.getMonth() + 1) + p2(now.getDate());
    var payload = {
      app: 'trip-expense-app',
      version: 1,
      exportedAt: now.toISOString(),
      trips: state.trips
    };
    try {
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'trip-expense-' + stamp + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      toast('백업 파일을 내려받았어요 💾');
    } catch (err) {
      toast('백업 파일을 만들지 못했어요');
    }
  }

  function importJSON(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try {
        data = JSON.parse(String(reader.result));
      } catch (err) {
        toast('JSON 파일을 읽지 못했어요');
        return;
      }
      var trips = Array.isArray(data) ? data : (data && data.trips) || [];
      if (!trips.length) { toast('여행 데이터가 없는 파일이에요'); return; }
      var added = trips.map(function (t) {
        var nt = M.normalizeTrip(t);
        nt.id = M.uid('t');
        nt.expenses.forEach(function (e) { e.id = M.uid('e'); });
        return nt;
      });
      if (!confirm('불러온 여행 ' + added.length + '개를 목록에 추가할까요?\n지금 있는 여행은 그대로 남아요.')) return;
      state.trips = state.trips.concat(added);
      state.activeTripId = added[0].id;
      save(); closeSheet(); render();
      toast('여행 ' + added.length + '개를 불러왔어요 ✨');
    };
    reader.onerror = function () { toast('파일을 읽지 못했어요'); };
    reader.readAsText(file);
  }

  /* ── 이벤트 ─────────────────────────────────────────── */

  function bindEvents() {
    document.addEventListener('click', function (ev) {
      var tabEl = ev.target.closest('[data-tab]');
      if (tabEl && !ev.target.closest('[data-action]')) {
        setView(tabEl.getAttribute('data-tab'));
        return;
      }
      var el = ev.target.closest('[data-action]');
      if (!el) return;
      ev.preventDefault();
      handleAction(el.getAttribute('data-action'), el, ev);
    });

    document.addEventListener('submit', function (ev) {
      var form = ev.target.closest('form[data-form]');
      if (!form) return;
      ev.preventDefault();
      var kind = form.getAttribute('data-form');
      if (kind === 'expense') saveExpenseForm(form);
      else if (kind === 'trip-new') createTripFromForm(form);
      else if (kind === 'trip-info') saveTripInfoForm(form);
      else if (kind === 'member-add') addMember(form);
    });

    document.addEventListener('input', function (ev) {
      var el = ev.target;
      if (!el) return;
      if (el.id === 'f-amount') {
        el.value = formatAmountValue(el.value);
        updateLivePreview();
      } else if (el.id === 'f-krw') {
        updateLivePreview();
      }
    });

    document.addEventListener('focusout', function (ev) {
      var el = ev.target;
      if (!el) return;
      if (el.name === 'budget') {
        var v = M.num(el.value);
        el.value = v > 0 ? M.formatNumber(Math.round(v), 0) : '';
      }
    });

    document.addEventListener('change', function (ev) {
      if (ev.target.id === 'import-file') {
        var file = ev.target.files && ev.target.files[0];
        if (file) importJSON(file);
        ev.target.value = '';
      }
      if (ev.target.id === 'set-currency') {
        var code = ev.target.value;
        var rateEl = $('set-rate');
        var meta = M.currencyMeta(code);
        if (rateEl) rateEl.value = meta.rate;
      }
    });

    els.backdrop.addEventListener('click', closeSheet);

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !els.sheet.hidden) closeSheet();
    });
  }

  function createTripFromForm(form) {
    var nameEl = $('t-name');
    var rateEl = $('t-rate');
    var membersEl = $('t-members');
    var budgetEl = $('t-budget');
    var code = (ui.newTrip && ui.newTrip.currency) || 'JPY';
    var rawMembers = (membersEl && membersEl.value || '').split(/[,，\/]+/);
    var names = rawMembers.map(function (n) { return n.trim(); }).filter(Boolean);
    if (!names.length) names = ['나'];
    if (names.length > 8) names = names.slice(0, 8);

    var trip = M.newTrip({
      name: (nameEl && nameEl.value || '').trim() || '새 여행',
      currency: code,
      rate: M.num(rateEl && rateEl.value),
      members: names,
      budget: M.num(budgetEl && budgetEl.value)
    });

    state.trips.push(trip);
    state.activeTripId = trip.id;
    save(); closeSheet(); setView('home');
    toast(trip.name + ' 시작! 💗');
  }

  /* ── 시작 ───────────────────────────────────────────── */

  function init() {
    els.sheet = $('sheet');
    els.backdrop = $('backdrop');
    els.toast = $('toast');
    state = load();
    scrubLegacySample();
    bindEvents();
    render();

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { /* 오프라인 지원은 덤이에요 */ });
      });
    }

    // 테스트/디버깅용 (화면에는 영향 없음)
    window.__tripApp = {
      getState: function () { return state; },
      summary: function () { return activeTrip() ? M.computeSummary(activeTrip()) : null; },
      version: 1
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
