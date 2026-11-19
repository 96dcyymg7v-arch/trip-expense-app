/*!
 * tripmath.js — 여행 경비 정산 계산 로직 (DOM 없이 동작, 단위 테스트 가능)
 * 브라우저에서는 window.TripMath, Node/quickjs 에서는 module.exports 로도 쓸 수 있어요.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TripMath = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* 기준 환율: 2026-11-19 조회값(1단위 = 원). 사용자가 화면에서 직접 고칠 수 있어요. */
  var RATE_ASOF = '2026-11-19';

  var CURRENCY_LIST = [
    { code: 'KRW', symbol: '₩', name: '원', unit: '원', decimals: 0, rate: 1 },
    { code: 'JPY', symbol: '¥', name: '엔', unit: '엔', decimals: 0, rate: 8.3834 },
    { code: 'PHP', symbol: '₱', name: '페소', unit: '페소', decimals: 0, rate: 20.9705 },
    { code: 'USD', symbol: '$', name: '달러', unit: '달러', decimals: 2, rate: 1335.11 },
    { code: 'EUR', symbol: '€', name: '유로', unit: '유로', decimals: 2, rate: 1468.43 },
    { code: 'THB', symbol: '฿', name: '바트', unit: '바트', decimals: 0, rate: 39.5 },
    { code: 'TWD', symbol: 'NT$', name: '타이완 달러', unit: '달러', decimals: 0, rate: 40.49 },
    { code: 'HKD', symbol: 'HK$', name: '홍콩 달러', unit: '달러', decimals: 0, rate: 170.3 },
    { code: 'VND', symbol: '₫', name: '동', unit: '동', decimals: 0, rate: 0.0519 },
    { code: 'SGD', symbol: 'S$', name: '싱가포르 달러', unit: '달러', decimals: 2, rate: 1037.34 },
    { code: 'CNY', symbol: 'CN¥', name: '위안', unit: '위안', decimals: 0, rate: 200.08 },
    { code: 'GBP', symbol: '£', name: '파운드', unit: '파운드', decimals: 2, rate: 1763.67 },
    { code: 'AUD', symbol: 'A$', name: '호주 달러', unit: '달러', decimals: 2, rate: 899.28 },
    { code: 'CAD', symbol: 'C$', name: '캐나다 달러', unit: '달러', decimals: 2, rate: 934.58 }
  ];

  var CATEGORIES = [
    { id: 'food', name: '식비', emoji: '🍜', color: '#FF9DAE' },
    { id: 'transport', name: '교통', emoji: '🚇', color: '#8FB8F0' },
    { id: 'stay', name: '숙소', emoji: '🏨', color: '#B9A6EE' },
    { id: 'shopping', name: '쇼핑', emoji: '🛍️', color: '#FFC97A' },
    { id: 'activity', name: '액티비티', emoji: '🎡', color: '#7FD8BE' },
    { id: 'etc', name: '기타', emoji: '✨', color: '#C9C0BC' }
  ];

  var uidCounter = 0;

  function uid(prefix) {
    uidCounter += 1;
    return (prefix || 'id') + '_' + Date.now().toString(36) + uidCounter.toString(36) +
      Math.floor(Math.random() * 1296).toString(36);
  }

  function num(v) {
    var n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/[,\s]/g, ''));
    return isFinite(n) ? n : 0;
  }

  function currencyMeta(code) {
    for (var i = 0; i < CURRENCY_LIST.length; i++) {
      if (CURRENCY_LIST[i].code === code) return CURRENCY_LIST[i];
    }
    return CURRENCY_LIST[0];
  }

  function categoryMeta(id) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === id) return CATEGORIES[i];
    }
    return CATEGORIES[CATEGORIES.length - 1];
  }

  /* ── 금액 계산 ───────────────────────────────────────────── */

  /* 지출 1건의 원화 금액 (원 단위 정수) */
  function expenseKRW(exp, rate) {
    if (!exp) return 0;
    if (exp.paidInKRW) return Math.round(num(exp.amountKRW));
    return Math.round(num(exp.amount) * num(rate));
  }

  /* 지출 1건의 현지 통화 금액 (원화로 결제한 건은 환율로 되돌려 표시) */
  function expenseLocal(exp, rate) {
    if (!exp) return 0;
    if (exp.paidInKRW) {
      var r = num(rate);
      return r > 0 ? num(exp.amountKRW) / r : 0;
    }
    return num(exp.amount);
  }

  function sumKRW(expenses, rate) {
    var total = 0;
    (expenses || []).forEach(function (e) { total += expenseKRW(e, rate); });
    return total;
  }

  function sumLocal(expenses, rate) {
    var total = 0;
    (expenses || []).forEach(function (e) { total += expenseLocal(e, rate); });
    return total;
  }

  /* 합계가 target 이 되도록 정수로 나눠 담기 (최대잔여법) */
  function apportion(values, target) {
    var n = values.length;
    var out = new Array(n);
    if (!n) return out;
    var sum = 0, i;
    for (i = 0; i < n; i++) sum += values[i];
    var goal = Math.round(num(target) || sum);
    if (sum <= 0) {
      for (i = 0; i < n; i++) out[i] = 0;
      return out;
    }
    var floors = [], fracs = [], flooredSum = 0;
    for (i = 0; i < n; i++) {
      var scaled = values[i] * goal / sum;
      var f = Math.floor(scaled);
      floors.push(f);
      fracs.push({ i: i, frac: scaled - f });
      flooredSum += f;
    }
    var left = goal - flooredSum;
    fracs.sort(function (a, b) { return b.frac - a.frac || a.i - b.i; });
    for (i = 0; i < fracs.length && left > 0; i++) {
      floors[fracs[i].i] += 1;
      left -= 1;
    }
    return floors;
  }

  /* 최소 이체 횟수 계산: 빚진 사람 큰 순서 ↔ 받을 사람 큰 순서로 짝지어요 */
  function minimalTransfers(rows) {
    var debtors = [], creditors = [];
    (rows || []).forEach(function (r) {
      var b = Math.round(num(r.balance));
      if (b < 0) debtors.push({ row: r, amount: -b });
      else if (b > 0) creditors.push({ row: r, amount: b });
    });
    debtors.sort(function (a, b) { return b.amount - a.amount; });
    creditors.sort(function (a, b) { return b.amount - a.amount; });

    var out = [];
    var i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      var pay = Math.min(debtors[i].amount, creditors[j].amount);
      if (pay > 0) {
        out.push({
          fromId: debtors[i].row.memberId,
          fromName: debtors[i].row.name,
          toId: creditors[j].row.memberId,
          toName: creditors[j].row.name,
          amount: pay
        });
      }
      debtors[i].amount -= pay;
      creditors[j].amount -= pay;
      if (debtors[i].amount <= 0) i += 1;
      if (creditors[j].amount <= 0) j += 1;
    }
    return out;
  }

  /* 여행 1개의 전체 요약 (총액·1인당·멤버별·카테고리·최소이체) */
  function computeSummary(trip) {
    var rate = num(trip && trip.rate) || 0;
    var members = (trip && trip.members) || [];
    var expenses = (trip && trip.expenses) || [];
    var totalKRW = 0;
    var totalLocal = 0;
    var byId = {};
    var paidExact = {};
    var shareExact = {};
    var catMap = {};

    members.forEach(function (m) {
      byId[m.id] = m;
      paidExact[m.id] = 0;
      shareExact[m.id] = 0;
    });

    var allIds = members.map(function (m) { return m.id; });

    expenses.forEach(function (e) {
      var krw = expenseKRW(e, rate);
      totalKRW += krw;
      totalLocal += expenseLocal(e, rate);

      var payerId = byId[e.payerId] ? e.payerId : (allIds[0] || null);
      if (payerId) paidExact[payerId] += krw;

      var ids = (e.participantIds || []).filter(function (id) { return !!byId[id]; });
      if (!ids.length) ids = allIds;
      if (ids.length) {
        var each = krw / ids.length;
        ids.forEach(function (id) { shareExact[id] += each; });
      }

      var cat = categoryMeta(e.category).id;
      catMap[cat] = (catMap[cat] || 0) + krw;
    });

    var paidInts = apportion(members.map(function (m) { return paidExact[m.id]; }), totalKRW);
    var shareInts = apportion(members.map(function (m) { return shareExact[m.id]; }), totalKRW);

    var rows = members.map(function (m, idx) {
      var paid = paidInts[idx] || 0;
      var share = shareInts[idx] || 0;
      return {
        memberId: m.id,
        name: m.name,
        paid: paid,
        share: share,
        balance: paid - share
      };
    });

    var transfers = minimalTransfers(rows);

    var categoryTotals = CATEGORIES.map(function (c) {
      var amount = catMap[c.id] || 0;
      return {
        id: c.id,
        name: c.name,
        emoji: c.emoji,
        color: c.color,
        amount: amount,
        ratio: totalKRW > 0 ? amount / totalKRW : 0
      };
    }).filter(function (c) { return c.amount > 0 || totalKRW === 0; });

    categoryTotals.sort(function (a, b) { return b.amount - a.amount; });

    return {
      currency: (trip && trip.currency) || 'KRW',
      rate: rate,
      totalKRW: totalKRW,
      totalLocal: Math.round(totalLocal * 100) / 100,
      perPerson: members.length ? Math.round(totalKRW / members.length) : 0,
      memberCount: members.length,
      expenseCount: expenses.length,
      budget: num(trip && trip.budget),
      budgetRatio: num(trip && trip.budget) > 0 ? totalKRW / num(trip.budget) : 0,
      averagePerExpense: expenses.length ? Math.round(totalKRW / expenses.length) : 0,
      rows: rows,
      transfers: transfers,
      categories: categoryTotals
    };
  }

  /* ── 표시 포맷 ───────────────────────────────────────────── */

  function formatNumber(value, decimals) {
    var d = typeof decimals === 'number' ? decimals : 0;
    var n = num(value);
    var neg = n < 0;
    n = Math.abs(n);
    var fixed = n.toFixed(d);
    var parts = fixed.split('.');
    var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var out = parts[1] ? intPart + '.' + parts[1] : intPart;
    return (neg ? '-' : '') + out;
  }

  /* 306,000원 */
  function formatKRW(value) {
    return formatNumber(value, 0) + '원';
  }

  /* ¥36,500 / $45.50 / ₩12,000 */
  function formatLocal(value, code) {
    var meta = currencyMeta(code);
    if (meta.code === 'KRW') return formatKRW(value);
    return meta.symbol + formatNumber(value, meta.decimals);
  }

  /* 현지 금액 + 단위까지: 36,500엔 */
  function formatLocalUnit(value, code) {
    var meta = currencyMeta(code);
    if (meta.code === 'KRW') return formatKRW(value);
    return formatNumber(value, meta.decimals) + meta.unit;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function parseDate(value) {
    if (!value) return null;
    var m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    if (!m) return null;
    return {
      year: +m[1], month: +m[2], day: +m[3],
      hour: m[4] ? +m[4] : 0, minute: m[5] ? +m[5] : 0,
      dateKey: m[1] + '-' + m[2] + '-' + m[3]
    };
  }

  var WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

  /* 11.21 (토) */
  function dateLabel(value) {
    var d = parseDate(value);
    if (!d) return '';
    var wd = WEEKDAYS[new Date(d.year, d.month - 1, d.day).getDay()];
    return pad2(d.month) + '.' + pad2(d.day) + ' (' + wd + ')';
  }

  /* 13:00 */
  function timeLabel(value) {
    var d = parseDate(value);
    if (!d) return '';
    return pad2(d.hour) + ':' + pad2(d.minute);
  }

  function nowLocalInput() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /* ── 카톡 공유용 텍스트 ──────────────────────────────────── */

  function buildShareText(trip) {
    var s = computeSummary(trip);
    var code = s.currency;
    var lines = [];
    lines.push('🧳 ' + (trip.name || '여행') + ' 경비 정산');
    lines.push('');
    lines.push('💰 총 지출 ' + formatLocalUnit(s.totalLocal, code) +
      (code === 'KRW' ? '' : ' (약 ' + formatKRW(s.totalKRW) + ')'));
    lines.push('👥 1인당 ' + formatKRW(s.perPerson) + ' · ' + s.memberCount + '명');
    if (s.budget > 0) {
      lines.push('🎯 예산 ' + formatKRW(s.budget) + ' 중 ' + Math.round(s.budgetRatio * 100) + '% 사용');
    }

    var cats = s.categories.filter(function (c) { return c.amount > 0; });
    if (cats.length) {
      lines.push('');
      lines.push('📊 카테고리');
      cats.slice(0, 5).forEach(function (c) {
        lines.push(c.emoji + ' ' + c.name + ' ' + formatKRW(c.amount) +
          ' (' + Math.round(c.ratio * 100) + '%)');
      });
    }

    lines.push('');
    lines.push('🧾 정산');
    if (!s.transfers.length) {
      lines.push('서로 주고받을 돈이 없어요 ✨');
    } else {
      s.transfers.forEach(function (t) {
        lines.push(t.fromName + ' → ' + t.toName + ' ' + formatKRW(t.amount));
      });
    }

    lines.push('');
    lines.push('총 ' + s.expenseCount + '건 · 트립스플릿');
    return lines.join('\n');
  }

  /* ── 여행/지출 데이터 ────────────────────────────────────── */

  function member(name) {
    return { id: uid('m'), name: String(name || '').trim() };
  }

  function newTrip(opts) {
    var o = opts || {};
    var code = currencyMeta(o.currency || 'JPY').code;
    var names = (o.members && o.members.length) ? o.members : ['나'];
    return {
      id: uid('t'),
      name: String(o.name || '새 여행').trim() || '새 여행',
      currency: code,
      rate: o.rate != null && num(o.rate) > 0 ? num(o.rate) : currencyMeta(code).rate,
      budget: num(o.budget),
      members: names.map(function (n) { return member(n); }),
      expenses: [],
      isSample: false,
      createdAt: new Date().toISOString()
    };
  }

  function newExpense(opts) {
    var o = opts || {};
    return {
      id: uid('e'),
      title: String(o.title || '').trim(),
      amount: num(o.amount),
      paidInKRW: !!o.paidInKRW,
      amountKRW: num(o.amountKRW),
      category: o.category || 'etc',
      payerId: o.payerId || null,
      participantIds: (o.participantIds || []).slice(),
      at: o.at || nowLocalInput(),
      memo: String(o.memo || '').trim(),
      isSample: !!o.isSample
    };
  }

  /* 봄 여행 2박 3일 샘플 — 화면에서 '샘플'이라고 명확히 표시해요 (모두 가상의 예시 데이터) */
  function sampleTrip() {
    var trip = {
      id: uid('t'),
      name: '봄 여행 2박 3일 (샘플)',
      currency: 'JPY',
      rate: 8.3834,
      budget: 900000,
      members: [
        { id: uid('m'), name: '민지' },
        { id: uid('m'), name: '지훈' }
      ],
      expenses: [],
      isSample: true,
      createdAt: new Date().toISOString()
    };
    var a = trip.members[0].id;
    var b = trip.members[1].id;
    var all = [a, b];

    function add(title, amount, category, payerId, participants, at, memo) {
      trip.expenses.push({
        id: uid('e'),
        title: title,
        amount: amount,
        paidInKRW: false,
        amountKRW: 0,
        category: category,
        payerId: payerId,
        participantIds: participants.slice(),
        at: at,
        memo: memo || '',
        isSample: true
      });
    }

    add('공항 특급열차', 2745, 'transport', b, all, '2026-05-01T09:55', '특급열차 2명');
    add('이자카야 저녁', 32000, 'food', a, all, '2026-05-01T19:00', '안주 4접시 외 음료 2잔');
    add('숙소 2박', 38000, 'stay', b, all, '2026-05-01T16:00', '시내 호텔 · 조식 포함');
    add('라멘 맛집', 9800, 'food', b, all, '2026-05-02T20:00', '');
    add('오락실 게임', 5000, 'activity', a, [a], '2026-05-02T22:30', '민지만');
    add('기념품 쇼핑', 4200, 'shopping', a, all, '2026-05-03T11:00', '');
    add('편의점 간식', 3600, 'food', a, all, '2026-05-03T12:30', '공항 편의점');

    return trip;
  }

  function normalizeExpense(e, trip) {
    var members = (trip && trip.members) || [];
    var ids = members.map(function (m) { return m.id; });
    var out = {
      id: e && e.id ? String(e.id) : uid('e'),
      title: e && e.title ? String(e.title) : '지출',
      amount: num(e && e.amount),
      paidInKRW: !!(e && e.paidInKRW),
      amountKRW: num(e && e.amountKRW),
      category: categoryMeta(e && e.category).id,
      payerId: e && ids.indexOf(e.payerId) >= 0 ? e.payerId : (ids[0] || null),
      participantIds: (e && e.participantIds && e.participantIds.length
        ? e.participantIds.filter(function (id) { return ids.indexOf(id) >= 0; })
        : ids.slice()),
      at: (e && e.at) ? String(e.at) : nowLocalInput(),
      memo: e && e.memo ? String(e.memo) : '',
      isSample: !!(e && e.isSample)
    };
    if (!out.participantIds.length) out.participantIds = ids.slice();
    return out;
  }

  function normalizeTrip(t) {
    var code = currencyMeta(t && t.currency).code;
    var members = ((t && t.members) || []).filter(function (m) { return m && m.name; }).map(function (m) {
      return { id: m.id ? String(m.id) : uid('m'), name: String(m.name).trim() };
    });
    if (!members.length) members = [{ id: uid('m'), name: '나' }];
    var trip = {
      id: t && t.id ? String(t.id) : uid('t'),
      name: t && t.name ? String(t.name) : '여행',
      currency: code,
      rate: t && num(t.rate) > 0 ? num(t.rate) : currencyMeta(code).rate,
      budget: num(t && t.budget),
      members: members,
      expenses: [],
      isSample: !!(t && t.isSample),
      createdAt: (t && t.createdAt) || new Date().toISOString()
    };
    trip.expenses = ((t && t.expenses) || []).map(function (e) {
      e.isSample = e.isSample != null ? !!e.isSample : trip.isSample;
      return normalizeExpense(e, trip);
    });
    return trip;
  }

  return {
    RATE_ASOF: RATE_ASOF,
    CURRENCY_LIST: CURRENCY_LIST,
    CATEGORIES: CATEGORIES,
    uid: uid,
    num: num,
    currencyMeta: currencyMeta,
    categoryMeta: categoryMeta,
    expenseKRW: expenseKRW,
    expenseLocal: expenseLocal,
    sumKRW: sumKRW,
    sumLocal: sumLocal,
    apportion: apportion,
    minimalTransfers: minimalTransfers,
    computeSummary: computeSummary,
    formatNumber: formatNumber,
    formatKRW: formatKRW,
    formatLocal: formatLocal,
    formatLocalUnit: formatLocalUnit,
    dateLabel: dateLabel,
    timeLabel: timeLabel,
    parseDate: parseDate,
    nowLocalInput: nowLocalInput,
    buildShareText: buildShareText,
    member: member,
    newTrip: newTrip,
    newExpense: newExpense,
    sampleTrip: sampleTrip,
    normalizeTrip: normalizeTrip,
    normalizeExpense: normalizeExpense
  };
});
