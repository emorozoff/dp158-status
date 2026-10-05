/* Демо-режим: страница показывает один момент вечера 4 октября 2026 года, как будто он идёт
   прямо сейчас. Аэропорт Краснодара закрыт, самолёт под рейс заходит на посадку и через
   40 секунд после открытия страницы садится. Время идёт с обычной скоростью.
   Данные ненастоящие: за основу взят реальный вечер, но закрытие аэропорта сдвинуто раньше
   (на самом деле его закрыли уже после посадки), положение самолёта придумано. В сеть скрипт не ходит. */
(function(){
  var SEC = 1000, MIN = 60000;
  function T(hm){ return new Date('2026-10-04T' + (hm.length === 5 ? hm + ':00' : hm) + '+03:00').getTime(); }
  function iso(ms){
    if(ms == null) return null;
    return new Date(ms + 3 * 3600000).toISOString().slice(0, 19) + '+03:00';
  }
  function ceil5(ms){ return Math.ceil(ms / (5 * MIN)) * 5 * MIN; }
  function round5(ms){ return Math.round(ms / (5 * MIN)) * 5 * MIN; }

  // ── что уже произошло к этому моменту ──
  var SCHED = T('15:55'), A_SCHED = T('19:30');
  var INB_DEP = T('17:25:46'), INB_ARR = T('18:17');
  var CLOSED = T('17:48:22');                      // аэропорт закрыли, когда самолёт уже летел
  var EST = T('18:50'), VKO = T('22:31');          // вылет на табло Краснодара, прилёт на табло Внуково
  var BLOCK = 215, AIR = 210, EXPECT = 116, EXPECT_LO = 98, EXPECT_HI = 129;
  var START = INB_ARR - 40 * SEC;                  // страница открывается за 40 секунд до посадки
  var POLL = 5, LOOP = 600;                        // «сверка» раз в 5 секунд, через 10 минут всё заново

  var LOG = [
    [INB_ARR, 'Самолёт сел в Краснодаре'],
    [CLOSED, 'Аэропорт Краснодара закрыт: ограничения введены'],
    [T('17:40:06'), 'Табло Внуково: прилёт в 22:31'],
    [T('17:36:13'), 'Вылет перенесён: 18:15 → 18:50'],
    [INB_DEP, 'Самолёт вылетел в Краснодар'],
    [T('17:13:57'), 'Аэропорт Краснодара открыт: ограничения сняты'],
    [T('15:21'), 'Вылет перенесён: 15:55 → 18:15'],
    [T('15:04:36'), 'Аэропорт Краснодара закрыт: ограничения введены']
  ];

  // самолёт на глиссаде: до касания left секунд
  function planeAt(now){
    // ссылка ведёт на страницу борта: полёт давно закончился
    var p = { which: 'inb', reg: 'RA-73243', call: 'data/aircraft', id: 'ra-73243', gnd: true, est: false,
              altM: 0, kmh: 0, dest: 'KRR', distKm: 0, nearMrv: false, at: iso(now) };
    var left = (INB_ARR - now) / SEC;
    if(left > 0){
      p.gnd = false;
      p.kmh = Math.round((250 + left * .5) / 5) * 5;
      p.altM = Math.max(10, Math.round(left * 3.75 / 10) * 10);
      p.distKm = Math.max(1, Math.round(left * .072));
    }
    return p;
  }

  // состояние страницы на момент последней «сверки»: те же правила прогноза, что были у трекера
  function stateAt(now){
    var landed = now >= INB_ARR, bound = false, tOpen = CLOSED + EXPECT * MIN;
    if(tOpen <= now){ tOpen = now; bound = true; }
    // посадка пассажиров — не раньше 15 минут после прилёта борта и не раньше открытия аэропорта
    var tBoard = Math.max(now, INB_ARR + 15 * MIN, tOpen);
    var real = Math.max(EST, ceil5(Math.max(now, tBoard + 35 * MIN, tOpen + 20 * MIN)));
    if(real - EST < 10 * MIN) real = EST;
    var calc = Math.max(real, now) + BLOCK * MIN;
    var early = VKO >= real + 150 * MIN ? Math.min(calc, VKO) : calc;
    var meet = early + 20 * MIN, leave = meet - 100 * MIN;

    var steps = [];
    function step(k, t, done, at, guess){
      steps.push({ k: k, t: t, done: !!done, at: done ? iso(at) : null, est: done ? null : iso(guess) });
    }
    step('inbDep', 'Самолёт вылетел из Минвод', true, INB_DEP);
    step('inbArr', 'Самолёт сел в Краснодаре', landed, INB_ARR, INB_ARR);
    step('open', 'Аэропорт Краснодара снова открыт', false, null, round5(tOpen));
    step('boarding', 'Началась посадка', false, null, round5(tBoard));
    step('takeoff', 'Вылет в Москву', false, null, real);
    step('leave', 'Выезжать во Внуково', false, null, round5(Math.max(leave, now)));
    step('landing', 'Посадка во Внуково', false, null, round5(calc));

    var checked = iso(now - SEC), sources = {};
    ['fr', 'tg', 'krr', 'krrDetail', 'yaKrr', 'yaVko', 'fa', 'city', 'rschs', 'radar'].forEach(function(k){
      sources[k] = { ok: true, at: checked };
    });
    return {
      flight: 'DP 158', date: '2026-10-04', phase: 'checkin', delayMin: Math.floor((EST - SCHED) / MIN),
      dep: { sched: iso(SCHED), est: iso(EST), actual: null, status: 'Регистрация закончена', actualAssumed: false,
             real: real !== EST ? iso(real) : null, realBound: bound, gate: '2', terminal: '1', desks: '3, 4' },
      arr: { sched: iso(A_SCHED), board: iso(VKO), best: iso(calc), bestSrc: 'calc', meetAt: iso(meet), leaveAt: iso(leave),
             actual: null, blockMin: BLOCK, calcFrom: 'plan', airMin: AIR, terminal: 'A', belt: 'А06', diverted: false },
      inbound: { from: 'Мин.Воды', time: '18:17', status: landed ? 'Совершил посадку' : 'В пути' },
      alert: { active: true, since: iso(CLOSED), until: null, n: 104,
               expectMin: EXPECT, expectLoMin: EXPECT_LO, expectHiMin: EXPECT_HI },
      alerts: [], steps: steps, plane: planeAt(now), planeSeen: true, planeReg: 'RA-73243',
      log: LOG.filter(function(e){ return e[0] <= now; }).map(function(e){ return { at: iso(e[0]), text: e[1] }; }),
      checkedAt: checked, pollSec: 30, sources: sources
    };
  }

  var elapsed = 0;   // секунд с открытия страницы
  function now(){ return START + elapsed * SEC; }

  function run(accept){
    var last = performance.now(), shown = -1;
    function frame(){
      var poll = Math.floor(elapsed / POLL);
      if(poll === shown) return;   // между «сверками» данные не меняются, тикают только счётчики страницы
      shown = poll;
      accept(stateAt(START + poll * POLL * SEC));
    }
    frame();
    setInterval(function(){
      var t = performance.now(), dt = Math.min(.5, (t - last) / SEC); last = t;   // свёрнутая вкладка время не проматывает
      elapsed += dt;
      if(elapsed >= LOOP) elapsed = 0;
      frame();
    }, 250);
  }

  window.DP158_DEMO = { now: now, run: run, stateAt: stateAt, start: START };
})();
