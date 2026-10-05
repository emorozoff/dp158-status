/* Демо-режим: вместо настоящих табло страница получает запись вечера 4 октября 2026 года
   в ускоренном темпе. События и их время взяты из реальной истории слежения, положение
   самолёта и секунды «сверено» придуманы. В сеть скрипт не ходит. */
(function(){
  var MIN = 60000;
  function T(hm, next){
    return new Date((next ? '2026-10-05' : '2026-10-04') + 'T' + (hm.length === 5 ? hm + ':00' : hm) + '+03:00').getTime();
  }
  function iso(ms){
    if(ms == null) return null;
    var d = new Date(ms + 3 * 3600000);
    return d.toISOString().slice(0, 19) + '+03:00';
  }
  function hm(ms){ return iso(ms).slice(11, 16); }
  function ceil5(ms){ return Math.ceil(ms / (5 * MIN)) * 5 * MIN; }
  function round5(ms){ return Math.round(ms / (5 * MIN)) * 5 * MIN; }
  // значение из расписания [[с какого момента, значение], …] на момент now
  function pick(list, now){
    var v = null;
    for(var i = 0; i < list.length; i++) if(list[i][0] <= now) v = list[i]; else break;
    return v;
  }
  function clamp(x){ return Math.max(0, Math.min(1, x)); }
  function smooth(x){ x = clamp(x); return x * x * (3 - 2 * x); }
  function lerp(a, b, x){ return a + (b - a) * clamp(x); }

  // ── что и когда произошло ──
  var SCHED = T('15:55'), A_SCHED = T('19:30');
  var CLOSE1 = T('15:04:36'), OPEN1 = T('17:13:57');
  var INB_DEP = T('17:25:46'), INB_ARR = T('18:17');
  var CLOSE2 = T('18:32:22'), OPEN2 = T('20:44:28');
  var BOARDING = T('19:37:36'), GATE_CLOSED = T('19:57:20'), PUSHBACK = T('20:46');
  var TAKEOFF = T('20:52'), LANDED = T('00:20', true);
  var BLOCK = 215, AIR = 210, EXPECT = 116, EXPECT_LO = 98, EXPECT_HI = 129;

  // время вылета на табло Краснодара
  var EST = [[0, T('18:15')], [T('17:36:13'), T('18:50')], [T('18:43:33'), T('19:25')], [T('19:05:38'), T('19:40')],
             [T('19:23:36'), T('20:10')], [T('19:51:04'), T('20:40')], [PUSHBACK, T('20:52')]];
  var STATUS = [[0, 'Регистрация закончена'], [BOARDING, 'Посадка'], [GATE_CLOSED, 'Посадка окончена'],
                [PUSHBACK, 'Отправляется'], [T('21:10:14'), 'Вылетел']];
  var GATE = [[0, '2'], [T('19:31:36'), '1, 2']];
  // время прилёта на табло Внуково
  var VKO = [[T('17:04:08'), T('21:56')], [T('17:40:06'), T('22:31')], [T('19:23:36'), T('23:01')],
             [T('19:54:36'), T('23:41')], [T('20:10:48'), T('00:06', true)], [T('20:51:49'), T('00:36', true)],
             [T('21:14:02'), T('00:33', true)], [T('21:22:09'), T('00:20', true)]];
  // строка борта DP 157 на табло Краснодара
  var INBOUND = [[0, ['16:25', 'Задержан']], [T('17:30:12'), ['17:59', 'В пути']], [INB_ARR, ['18:17', 'Прибыл']]];

  var LOG = [
    [T('15:04:36'), 'Аэропорт Краснодара закрыт: ограничения введены'],
    [T('15:21'), 'Вылет перенесён: 15:55 → 18:15'],
    [T('17:13:57'), 'Аэропорт Краснодара открыт: ограничения сняты'],
    [T('17:25:46'), 'Самолёт вылетел в Краснодар'],
    [T('17:36:13'), 'Вылет перенесён: 18:15 → 18:50'],
    [T('18:17'), 'Самолёт сел в Краснодаре'],
    [T('18:32:22'), 'Аэропорт Краснодара закрыт: ограничения введены'],
    [T('18:43:33'), 'Вылет перенесён: 18:50 → 19:25'],
    [T('19:05:38'), 'Вылет перенесён: 19:25 → 19:40'],
    [T('19:23:36'), 'Вылет перенесён: 19:40 → 20:10'],
    [T('19:31:36'), 'Выход изменён: 2 → 1, 2'],
    [T('19:37:36'), 'Статус в Краснодаре: Посадка'],
    [T('19:51:04'), 'Вылет перенесён: 20:10 → 20:40'],
    [T('19:57:20'), 'Статус в Краснодаре: Посадка окончена'],
    [T('20:44:28'), 'Аэропорт Краснодара открыт: ограничения сняты'],
    [T('20:46'), 'Вылет перенесён: 20:40 → 20:52'],
    [T('20:46:10'), 'Статус в Краснодаре: Отправляется'],
    [T('20:52'), 'Вылетел в 20:52'],
    [T('21:10:14'), 'Статус в Краснодаре: Вылетел'],
    [T('00:20', true), 'Приземлился в 00:20']
  ];
  VKO.forEach(function(v){ LOG.push([v[0], 'Табло Внуково: прилёт в ' + hm(v[1])]); });
  LOG.sort(function(a, b){ return b[0] - a[0]; });

  function logAt(now){
    var out = [], vko = false;
    for(var i = 0; i < LOG.length && out.length < 8; i++){
      if(LOG[i][0] > now) continue;
      if(/^Табло Внуково/.test(LOG[i][1])){ if(vko) continue; vko = true; }
      out.push({ at: iso(LOG[i][0]), text: LOG[i][1] });
    }
    return out;
  }

  // ── где самолёт ──
  function wobble(now, amp, step){ return Math.round(Math.sin(now / MIN * 1.7) * amp / step) * step; }
  // оценка посадки в Краснодаре: сначала «вылет + 40 минут», ближе к делу — по скорости и расстоянию
  function inbEta(now){ return lerp(INB_DEP + 40 * MIN, INB_ARR, smooth((now - T('17:40')) / (30 * MIN))); }

  function planeAt(now){
    // ссылка ведёт на страницу борта: полёт давно закончился
    var p = { which: 'inb', reg: 'RA-73243', call: 'data/aircraft', id: 'ra-73243', gnd: true, est: false,
              altM: 0, kmh: 0, dest: 'KRR', distKm: 0, nearMrv: false, at: iso(now) };
    var x;
    if(now < INB_DEP){ p.nearMrv = true; p.distKm = 320; }
    else if(now < INB_ARR){
      x = (now - INB_DEP) / (INB_ARR - INB_DEP);
      p.gnd = false;
      p.altM = x < .28 ? lerp(350, 7300, smooth(x / .28)) : x < .55 ? 7300 : lerp(7300, 0, smooth((x - .55) / .45));
      p.kmh = x < .2 ? lerp(290, 720, smooth(x / .2)) : x < .6 ? 720 + wobble(now, 15, 10) : lerp(720, 250, smooth((x - .6) / .4));
      p.distKm = Math.max(5, 320 * (1 - (.25 * x + .75 * smooth(x))));
    }
    else if(now >= TAKEOFF && now < LANDED){
      x = (now - TAKEOFF) / (LANDED - TAKEOFF);
      p.which = 'out'; p.dest = 'VKO'; p.gnd = false;
      p.altM = x < .09 ? lerp(400, 10650, smooth(x / .09)) : x < .5 ? 10650 : x < .87 ? 11250 : lerp(11250, 0, smooth((x - .87) / .13));
      p.kmh = x < .07 ? lerp(300, 810, smooth(x / .07)) : x < .9 ? 810 + wobble(now, 20, 10) : lerp(810, 260, smooth((x - .9) / .1));
      p.distKm = Math.max(5, 1195 * (1 - Math.pow(x, 1.5)));
    }
    p.altM = Math.round(p.altM / 50) * 50; p.kmh = Math.round(p.kmh / 10) * 10; p.distKm = Math.round(p.distKm / 5) * 5;
    return p;
  }

  // ── состояние страницы на момент now: те же правила, что были у трекера ──
  function stateAt(now, age){
    var est = pick(EST, now)[1], status = pick(STATUS, now)[1];
    var actual = now >= TAKEOFF ? TAKEOFF : null, landed = now >= LANDED ? LANDED : null;
    var closed = now >= CLOSE2 && now < OPEN2;
    var openAt = now >= OPEN2 ? OPEN2 : closed ? null : OPEN1;
    var bound = false, tOpen = openAt;
    if(closed){ tOpen = CLOSE2 + EXPECT * MIN; if(tOpen <= now){ tOpen = now; bound = true; } }

    var dInbArr = now >= INB_ARR, tInbArr = dInbArr ? INB_ARR : Math.max(now, inbEta(now));
    var dBoard = now >= BOARDING, tBoard = dBoard ? BOARDING : Math.max(now, tInbArr + 15 * MIN);
    if(closed && !dBoard) tBoard = Math.max(tBoard, tOpen);
    var real = est;
    if(!actual){
      var chain = Math.max(now, tBoard + 35 * MIN);
      if(closed) chain = Math.max(chain, tOpen + 20 * MIN);
      real = Math.max(est, ceil5(chain));
      if(real - est < 10 * MIN) real = est;
    }

    var vko = pick(VKO, now), board = vko ? vko[1] : null;
    var calc = actual ? actual + AIR * MIN : Math.max(real, now) + BLOCK * MIN;
    var best = calc, bestSrc = 'calc';
    if(landed){ best = landed; bestSrc = 'fact'; }
    else if(actual && board && vko[0] > actual){ best = board; bestSrc = 'board'; }
    var early = best;
    if(!landed){
      early = Math.min(best, calc);
      if(board && board >= (actual || real) + 150 * MIN) early = Math.min(early, board);
    }
    var meet = early + 20 * MIN, leave = meet - 100 * MIN;

    var low = status.toLowerCase(), phase;
    if(landed) phase = 'landed';
    else if(actual) phase = 'airborne';
    else if(low.indexOf('отправляется') >= 0) phase = 'departing';
    else if(low.indexOf('посадка оконч') >= 0) phase = 'gate_closed';
    else if(low.indexOf('посадка') >= 0) phase = 'boarding';
    else phase = 'checkin';

    var steps = [];
    function step(k, t, done, at, guess){
      steps.push({ k: k, t: t, done: !!done, at: done && at ? iso(at) : null,
                   est: !done && guess ? iso(round5(Math.max(guess, now))) : null });
    }
    var reopen = now >= CLOSE2;
    if(!reopen) step('open', 'Аэропорт Краснодара открыт', true, OPEN1, OPEN1);
    step('inbDep', 'Самолёт вылетел из Минвод', now >= INB_DEP, INB_DEP, INB_DEP);
    step('inbArr', 'Самолёт сел в Краснодаре', dInbArr, INB_ARR, tInbArr);
    if(reopen) step('open', 'Аэропорт Краснодара снова открыт', !closed, openAt, tOpen);
    step('boarding', 'Началась посадка', dBoard, BOARDING, tBoard);
    step('takeoff', 'Вылет в Москву', actual, actual, real);
    step('leave', 'Выезжать во Внуково', actual && now >= leave, leave, leave);
    step('landing', 'Посадка во Внуково', landed, landed, best);

    var inb = pick(INBOUND, now)[1], srcAt = { ok: true, at: iso(now - age) }, sources = {};
    ['fr', 'tg', 'krr', 'krrDetail', 'yaKrr', 'yaVko', 'fa', 'city', 'rschs', 'radar'].forEach(function(k){ sources[k] = srcAt; });

    return {
      flight: 'DP 158', date: '2026-10-04', phase: phase, delayMin: Math.floor(((actual || est) - SCHED) / MIN),
      dep: { sched: iso(SCHED), est: iso(actual || est), actual: iso(actual), status: status, actualAssumed: false,
             real: real !== est && !actual ? iso(real) : null, realBound: bound,
             gate: pick(GATE, now)[1], terminal: '1', desks: '3, 4' },
      arr: { sched: iso(A_SCHED), board: iso(board), best: iso(best), bestSrc: bestSrc, meetAt: iso(meet), leaveAt: iso(leave),
             actual: iso(landed), blockMin: BLOCK, calcFrom: actual ? 'takeoff' : 'plan', airMin: AIR,
             terminal: 'A', belt: 'А06', diverted: false },
      inbound: { from: 'Мин.Воды', time: inb[0], status: inb[1] },
      alert: { active: closed, since: iso(now >= CLOSE2 ? CLOSE2 : CLOSE1), until: iso(closed ? null : openAt),
               n: 104, expectMin: EXPECT, expectLoMin: EXPECT_LO, expectHiMin: EXPECT_HI },
      alerts: [], steps: steps, plane: landed ? null : planeAt(now), planeSeen: true, planeReg: 'RA-73243',
      log: logAt(now), checkedAt: iso(now - age), pollSec: 30, sources: sources
    };
  }

  // ── часы демо: вечер идёт быстро, полёт в Москву ещё быстрее, после посадки — пауза и заново ──
  var START = T('17:26');
  var PACE = [[TAKEOFF + 4 * MIN, 4], [LANDED, 8], [LANDED + 8 * MIN, 1]];   // до какого момента, минут в секунду
  var elapsed = 0, total = 0;
  (function(){ var from = START; PACE.forEach(function(s){ total += (s[0] - from) / MIN / s[1]; from = s[0]; }); })();

  function now(){
    var left = elapsed, from = START;
    for(var i = 0; i < PACE.length; i++){
      var len = (PACE[i][0] - from) / MIN / PACE[i][1];
      if(left <= len) return from + left * PACE[i][1] * MIN;
      left -= len; from = PACE[i][0];
    }
    return from;
  }

  // запись можно открыть с нужного места: адрес с #19:30 в конце
  function seek(){
    var m = /^#(\d{1,2}):(\d{2})$/.exec(location.hash);
    if(!m) return 0;
    var h = +m[1], at = T((h < 10 ? '0' : '') + h + ':' + m[2], h < 12), left = 0, from = START;
    for(var i = 0; i < PACE.length; i++){
      if(at <= PACE[i][0]) return Math.max(0, left + (at - from) / MIN / PACE[i][1]);
      left += (PACE[i][0] - from) / MIN / PACE[i][1]; from = PACE[i][0];
    }
    return 0;
  }

  function run(accept){
    var last = performance.now();
    function frame(){
      // «сверено N с назад» — в настоящих секундах, сверка будто бы раз в четыре секунды
      accept(stateAt(now(), (1 + elapsed % 4) * 1000));
    }
    elapsed = seek();
    frame();
    setInterval(function(){
      var t = performance.now(), dt = Math.min(.5, (t - last) / 1000); last = t;   // свёрнутая вкладка не проматывает запись
      elapsed += dt;
      if(elapsed >= total) elapsed = 0;
      frame();
    }, 250);
  }

  window.DP158_DEMO = { now: now, run: run, stateAt: stateAt, start: START, total: total };
})();
