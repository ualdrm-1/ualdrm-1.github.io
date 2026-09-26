/* ==========================================================================
   Защита от БПЛА — ООО «Сфера», стиль «Защитный контур».
   Шапка и прогресс прокрутки, появление блоков и заголовков по словам,
   подсветка и наклон карточек под курсором, «магнитные» кнопки, хребет
   этапов, сборка стенки по прокрутке, конфигуратор защиты с переносом
   выбора в заявку, форма заявки, ленивая загрузка обеих 3D-сцен.
   ========================================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(pointer: fine)').matches;
  var doc = document.documentElement;
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var $$ = function (sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); };

  /* ------------------------------------------------------------------
     Заголовки по словам: каждое слово поднимается из-под своей строки
     ------------------------------------------------------------------ */
  function splitWords(el) {
    var i = 0;
    (function walk(node) {
      [].slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          // делим только по обычным пробелам: неразрывные остаются внутри слова
          var parts = n.textContent.split(/([ \t\n\r]+)/);
          var frag = document.createDocumentFragment();
          parts.forEach(function (p) {
            if (!p) return;
            if (/^[ \t\n\r]+$/.test(p)) { frag.appendChild(document.createTextNode(' ')); return; }
            var w = document.createElement('span');
            w.className = 'w';
            var inner = document.createElement('span');
            inner.className = 'w__i';
            inner.style.setProperty('--i', i++);
            inner.textContent = p;
            w.appendChild(inner);
            frag.appendChild(w);
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') {
          walk(n);
        }
      });
    })(el);
  }
  if (reduced) doc.classList.add('no-split');
  else $$('.split').forEach(splitWords);

  /* ------------------------------------------------------------------
     Появление блоков
     ------------------------------------------------------------------ */
  // первый экран «Взрыв наоборот»: прокрутка отматывает время, заголовок
  // появляется в конце. Если 3D-сцена не запустилась, возвращаем обычный экран
  var heroSec = document.querySelector('.hero[data-scene]');
  if (heroSec && !reduced && hasWebGL()) {
    heroSec.classList.add('is-rewind');
    setTimeout(function () {
      if (!heroSec.classList.contains('is-3d')) heroSec.classList.remove('is-rewind');
    }, 8000);
  }

  var revealables = $$('.reveal, .split');
  if (reduced || !('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var ro = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); ro.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    revealables.forEach(function (el) { ro.observe(el); });
    // страховка: текст не должен остаться невидимым, если наблюдатель не сработал
    setTimeout(function () {
      $$('.reveal:not(.is-in), .split:not(.is-in)').forEach(function (el) {
        if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('is-in');
      });
    }, 3000);
  }

  /* ------------------------------------------------------------------
     Счётчики
     ------------------------------------------------------------------ */
  function runCounter(el) {
    var to = parseInt(el.getAttribute('data-to'), 10);
    if (isNaN(to)) return;
    if (reduced) { el.textContent = String(to); return; }
    var from = el.hasAttribute('data-plain') ? Math.max(0, to - 24) : 0;
    var start = null;
    function tick(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / 1400);
      el.textContent = String(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 4))));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  var counters = $$('.counter');
  if (counters.length && 'IntersectionObserver' in window) {
    var co = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { runCounter(e.target); co.unobserve(e.target); } });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { co.observe(el); });
  }

  /* ------------------------------------------------------------------
     Шапка: подложка после начала прокрутки, прогресс, активный раздел
     ------------------------------------------------------------------ */
  var hdr = document.getElementById('hdr');
  var progress = document.getElementById('hdrProgress');
  var navLinks = $$('.nav > a[href^="#"]');
  var navTargets = navLinks.map(function (a) { return document.querySelector(a.getAttribute('href')); });

  function paintHeader() {
    var y = window.scrollY;
    var range = Math.max(1, doc.scrollHeight - window.innerHeight);
    if (hdr) hdr.classList.toggle('is-scrolled', y > 24);
    if (progress) progress.style.transform = 'scaleX(' + clamp(y / range, 0, 1) + ')';
    // активен раздел, верх которого прошёл отметку; разделы в меню идут
    // не в порядке страницы, поэтому берём самый нижний из прошедших
    var mark = window.innerHeight * 0.4;
    var active = -1;
    var best = -Infinity;
    navTargets.forEach(function (t, i) {
      if (!t) return;
      var r = t.getBoundingClientRect();
      if (r.top <= mark && r.bottom > mark && r.top > best) { best = r.top; active = i; }
    });
    navLinks.forEach(function (a, i) { a.classList.toggle('is-active', i === active); });
  }

  /* ------------------------------------------------------------------
     Мобильное меню: панель на весь экран под кнопкой-бургером
     ------------------------------------------------------------------ */
  var burger = document.getElementById('burger');
  var siteNav = document.getElementById('siteNav');

  function setMenu(open) {
    if (!hdr || !burger) return;
    hdr.classList.toggle('hdr--open', open);
    doc.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    if (!open) paintHeader();
  }

  if (burger && siteNav) {
    burger.addEventListener('click', function () {
      setMenu(!hdr.classList.contains('hdr--open'));
    });
    siteNav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && hdr.classList.contains('hdr--open')) { setMenu(false); burger.focus(); }
    });
    var wideMq = window.matchMedia('(min-width: 1181px)');
    var onWide = function (e) { if (e.matches) setMenu(false); };
    if (wideMq.addEventListener) wideMq.addEventListener('change', onWide);
    else if (wideMq.addListener) wideMq.addListener(onWide);
  }

  /* ------------------------------------------------------------------
     Хребет этапов: наливается по мере прокрутки раздела
     ------------------------------------------------------------------ */
  var spine = document.getElementById('steps');
  var spineLive = document.getElementById('stepsLive');
  var stepItems = spine ? $$('.step', spine) : [];

  function paintSpine() {
    if (!spine || !spineLive) return;
    var box = spine.getBoundingClientRect();
    var mark = window.innerHeight * 0.55;
    spineLive.style.height = clamp(mark - box.top, 0, box.height) + 'px';
    stepItems.forEach(function (li) {
      li.classList.toggle('is-on', li.getBoundingClientRect().top + 40 <= mark);
    });
  }

  /* ------------------------------------------------------------------
     Сборка стенки по прокрутке. Этапы — доли прохода по разделу,
     те же границы у 3D-модуля (foundation3d.js читает window.__wallProgress)
     ------------------------------------------------------------------ */
  var WALL_STEPS = [0, 0.1, 0.26, 0.38, 0.5, 0.64, 0.9];
  var asmTrack = document.getElementById('asmTrack');
  var asmSteps = asmTrack ? $$('#asmSteps li') : [];
  var asmBar = document.getElementById('asmBar');
  window.__wallProgress = reduced ? 1 : 0;

  function paintAssembly() {
    if (!asmTrack) return;
    var p = 1;
    if (!reduced) {
      var r = asmTrack.getBoundingClientRect();
      var run = Math.max(1, r.height - window.innerHeight);
      p = clamp(-r.top / run, 0, 1);
    }
    window.__wallProgress = p;
    var cur = 0;
    WALL_STEPS.forEach(function (s, i) { if (p >= s) cur = i; });
    asmSteps.forEach(function (li, i) {
      li.classList.toggle('is-on', i === cur);
      li.classList.toggle('is-done', i < cur);
    });
    if (asmBar) asmBar.style.transform = 'scaleX(' + clamp(p / WALL_STEPS[WALL_STEPS.length - 1], 0, 1) + ')';
  }

  var ticking = false;
  function onScroll() {
    ticking = false;
    if (hdr && hdr.classList.contains('hdr--open')) return;
    paintHeader();
    paintSpine();
    paintAssembly();
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  window.addEventListener('resize', onScroll);
  if (reduced) stepItems.forEach(function (li) { li.classList.add('is-on'); });

  /* ------------------------------------------------------------------
     Курсор: подсветка, наклон карточек, магнитные кнопки
     ------------------------------------------------------------------ */
  if (fine && !reduced) {
    var glow = document.getElementById('cursorGlow');
    var gx = 0, gy = 0, tx = 0, ty = 0, glowRaf = 0;
    var moveGlow = function () {
      gx += (tx - gx) * 0.16;
      gy += (ty - gy) * 0.16;
      glow.style.transform = 'translate(' + gx.toFixed(1) + 'px,' + gy.toFixed(1) + 'px)';
      glowRaf = (Math.abs(tx - gx) + Math.abs(ty - gy) > 0.5) ? requestAnimationFrame(moveGlow) : 0;
    };
    if (glow) {
      window.addEventListener('pointermove', function (e) {
        tx = e.clientX; ty = e.clientY;
        if (!glow.classList.contains('is-on')) { gx = tx; gy = ty; glow.classList.add('is-on'); }
        if (!glowRaf) glowRaf = requestAnimationFrame(moveGlow);
      }, { passive: true });
      document.addEventListener('pointerleave', function () { glow.classList.remove('is-on'); });
    }

    $$('.fx').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        // чем шире блок, тем меньше угол: большая панель не должна «качаться»
        var max = r.width > 560 ? 3 : r.width > 400 ? 4.5 : 6.5;
        var x = (e.clientX - r.left) / r.width;
        var y = (e.clientY - r.top) / r.height;
        el.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
        el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
        el.style.setProperty('--rx', ((0.5 - y) * max).toFixed(2) + 'deg');
        el.style.setProperty('--ry', ((x - 0.5) * max).toFixed(2) + 'deg');
        el.classList.add('is-tilting');
      });
      el.addEventListener('pointerleave', function () {
        el.classList.remove('is-tilting');
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
      });
    });

    $$('[data-magnetic]').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--bx', ((e.clientX - (r.left + r.width / 2)) * 0.22).toFixed(1) + 'px');
        el.style.setProperty('--by', ((e.clientY - (r.top + r.height / 2)) * 0.32).toFixed(1) + 'px');
      });
      el.addEventListener('pointerleave', function () {
        el.style.setProperty('--bx', '0px');
        el.style.setProperty('--by', '0px');
      });
    });
  }

  /* ------------------------------------------------------------------
     Вопросы: открыт только один ответ
     ------------------------------------------------------------------ */
  var faqItems = $$('.faq__item');
  faqItems.forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (d.open) faqItems.forEach(function (o) { if (o !== d) o.open = false; });
    });
  });

  /* ------------------------------------------------------------------
     Конфигуратор защиты
     ------------------------------------------------------------------ */
  var cfg = document.getElementById('cfg');
  var scheme = document.getElementById('scheme');
  var works = document.getElementById('cfgWorks');

  var LABELS = {
    kind: { legend: 'Тип объекта', opts: { tek: 'ТЭК: НПЗ, нефтебаза', energy: 'Энергетика', industry: 'Промышленность', logistics: 'Склады и логистика', telecom: 'Связь, ЦОД', transport: 'Транспорт' } },
    goal: { legend: 'Что защищаем', opts: { top: 'площадку сверху', unit: 'отдельное оборудование', perim: 'периметр', staff: 'персонал' } },
    supports: { legend: 'Опоры и порталы на площадке', opts: { yes: 'есть', no: 'нет', unknown: 'не знаем' } },
    pass: { legend: 'Проезд техники под защитой', opts: { no: 'не нужен', yes: 'нужен' } },
    term: { legend: 'Защита периметра', opts: { perm: 'постоянная', temp: 'быстро и временно' } }
  };
  // подпись под защищаемым объектом на схеме
  var KIND_OBJ = { tek: 'Резервуар', energy: 'Реактор / трансформатор', industry: 'Технологическая установка', logistics: 'Склад', telecom: 'Узел связи', transport: 'Насосная станция' };

  function cfgState() {
    var s = { goal: {} };
    $$('input:checked', cfg).forEach(function (i) {
      if (i.type === 'checkbox') s[i.name][i.value] = true;
      else s[i.name] = i.value;
    });
    return s;
  }

  /* Что ставим на площадку при таком выборе */
  function layersFor(s) {
    var g = s.goal;
    return {
      net: !!g.top,
      masts: !!g.top && s.supports !== 'yes',
      portals: !!g.top && s.supports === 'yes',
      gate: !!g.top && s.pass === 'yes',
      roof: !!g.unit && !g.top,
      blocks: !!g.perim && s.term === 'perm',
      containers: !!g.perim && s.term === 'temp',
      bunker: !!g.staff
    };
  }

  /* Состав работ. Порядок — как они идут на объекте. */
  function worksFor(s) {
    var g = s.goal;
    var w = [{ name: 'Обследование объекта', why: 'Уязвимости, состояние опор и порталов, необходимый уровень защиты по СП 542.1325800.2024.' },
             { name: 'Проектные решения', why: 'Компоновка конструкций, расчёт каркаса и тросовой системы, узлы креплений, спецификация материалов.' }];
    if (g.top) {
      var why = s.supports === 'yes'
        ? 'Полотно на тросовой системе с креплением к существующим опорам и порталам — там, где это допускают расчёты.'
        : s.supports === 'no'
          ? 'Полотно на тросовой системе и новых мачтах с оттяжками: перекрытие площадки и экраны по периметру.'
          : 'Полотно на тросовой системе; опоры — существующие или новые, по итогам обследования.';
      if (g.unit) why += ' Козырьки над отдельным оборудованием.';
      if (s.pass === 'yes') why += ' Разборные участки для проезда техники.';
      w.push({ name: 'Защитные сетки (сетчатые ЗОК)', why: why });
    }
    if (g.unit && !g.top) w.push({ name: 'Металлоконструкции', why: 'Навес или козырёк над оборудованием: несёт сетчатое полотно или обшивку.' });
    if (g.perim) {
      w.push(s.term === 'perm'
        ? { name: 'Стенка из бетонных блоков', why: 'Противоосколочный барьер из блоков ФБС на основании ниже уровня земли.' }
        : { name: 'Стенка из морских контейнеров', why: 'Быстро выстраивается, заполняется грунтом или щебнем, переносится на другую площадку.' });
    }
    if (g.staff) w.push({ name: 'Бункеры-укрытия', why: 'Железобетонные модули по маршрутам эвакуации и у рабочих мест с постоянным персоналом.' });
    w.push({ name: 'Монтаж и сдача', why: 'Работы по нарядам-допускам на действующем объекте, КС-2, КС-3, исполнительная документация.' });
    return w;
  }

  /* Направления атаки: откуда заходит аппарат и где его останавливает защита.
     Точки — в координатах схемы (viewBox 640×300). */
  function threatsFor(s, L) {
    var g = s.goal;
    var t = [];
    t.push(L.net
      ? { d: 'M640 8 C560 20 420 60 330 117', ok: true, cov: 'top' }
      : { d: 'M640 8 C560 20 420 80 322 184', ok: false, cov: 'top' });
    t.push(L.net
      ? { d: 'M630 150 C600 120 520 100 470 110', ok: true, cov: 'unit' }
      : L.roof
        ? { d: 'M630 150 C600 120 520 140 470 172', ok: true, cov: 'unit' }
        : { d: 'M630 150 C600 140 520 160 470 206', ok: false, cov: 'unit' });
    t.push(L.blocks || L.containers
      ? { d: 'M640 216 C630 216 624 218 612 220', ok: true, cov: 'perim', end: [596, 222] }
      : { d: 'M640 216 C600 218 540 226 500 232', ok: false, cov: 'perim' });
    t.push(L.bunker
      ? { d: 'M20 40 C60 80 110 150 128 204', ok: true, cov: 'staff' }
      : { d: 'M20 40 C60 80 110 170 124 224', ok: false, cov: 'staff' });
    return t;
  }

  function endOf(d) {
    var n = d.trim().split(/[\s,]+/);
    return [parseFloat(n[n.length - 2]), parseFloat(n[n.length - 1])];
  }

  function renderCfg() {
    if (!cfg || !scheme) return;
    var s = cfgState();
    var L = layersFor(s);

    $$('.sc-layer', scheme).forEach(function (el) {
      el.classList.toggle('is-on', !!L[el.getAttribute('data-layer')]);
    });
    var people = document.getElementById('scPeople');
    if (people) people.style.opacity = L.bunker ? '0' : '1';
    var kindLabel = document.getElementById('scKind');
    if (kindLabel) kindLabel.textContent = KIND_OBJ[s.kind] || '';
    // 3D-схема (cfg3d.js) берёт выбор отсюда
    window.__cfg = { kind: s.kind, layers: L };
    document.dispatchEvent(new CustomEvent('cfg:change', { detail: window.__cfg }));

    var threats = threatsFor(s, L);
    var box = document.getElementById('scThreats');
    if (box) {
      box.innerHTML = threats.map(function (x, i) {
        var e = x.end || endOf(x.d);
        var delay = (-i * 0.7).toFixed(1) + 's';
        return '<path class="sc-traj" d="' + x.d + '"/>' +
          '<g class="sc-uav" style="offset-path:path(\'' + x.d + '\');animation-delay:' + delay + '">' +
          '<path d="M-7 0h14M0-3v6"/><circle cx="-7" cy="-3" r="2.6"/><circle cx="7" cy="-3" r="2.6"/></g>' +
          '<g class="sc-hit' + (x.ok ? '' : ' sc-hit--bad') + '" style="--d:' + delay + '">' +
          '<circle cx="' + e[0] + '" cy="' + e[1] + '" r="7"/><circle cx="' + e[0] + '" cy="' + e[1] + '" r="7"/></g>';
      }).join('');
    }

    var cov = {};
    threats.forEach(function (x) { cov[x.cov] = x.ok; });
    $$('#cfgCov li').forEach(function (li) {
      li.classList.toggle('is-on', !!cov[li.getAttribute('data-cov')]);
    });

    if (works) {
      works.innerHTML = worksFor(s).map(function (x, i) {
        return '<li style="--i:' + i + '"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-check"/></svg>' +
          '<div><b>' + x.name + '</b><em>' + x.why + '</em></div></li>';
      }).join('');
    }
  }

  if (cfg) {
    cfg.addEventListener('change', renderCfg);
    renderCfg();

    // «Отправить на расчёт»: переносим выбор в заявку, чтобы
    // посетителю не приходилось пересказывать его текстом
    var send = document.getElementById('cfgSend');
    if (send) {
      send.addEventListener('click', function (e) {
        e.preventDefault();
        var s = cfgState();
        var goals = Object.keys(s.goal).map(function (k) { return LABELS.goal.opts[k]; });
        var lines = [
          LABELS.kind.legend + ': ' + LABELS.kind.opts[s.kind],
          LABELS.goal.legend + ': ' + (goals.length ? goals.join(', ') : 'не выбрано'),
          LABELS.supports.legend + ': ' + LABELS.supports.opts[s.supports],
          LABELS.pass.legend + ': ' + LABELS.pass.opts[s.pass]
        ];
        if (s.goal.perim) lines.push(LABELS.term.legend + ': ' + LABELS.term.opts[s.term]);
        lines.push('', 'Состав по схеме:');
        worksFor(s).forEach(function (x) { lines.push('— ' + x.name); });

        var box = document.getElementById('f-msg');
        if (box) box.value = lines.join('\n');
        var req = document.getElementById('request');
        if (req) req.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        var nm = document.getElementById('f-name');
        if (nm) setTimeout(function () { nm.focus({ preventScroll: true }); }, reduced ? 0 : 700);
      });
    }
  }

  /* ------------------------------------------------------------------
     Форма заявки
     ------------------------------------------------------------------ */
  var form = document.getElementById('requestForm');
  var status = document.getElementById('formStatus');

  function setError(field, message) {
    var wrap = field.closest('.field') || field.closest('.check');
    if (!wrap) return;
    wrap.classList.toggle('is-invalid', Boolean(message));
    var slot = wrap.querySelector('[data-err]');
    if (slot) slot.textContent = message || '';
  }

  function validate() {
    var errors = 0;
    var name = form.elements.name;
    if (!name.value.trim()) { setError(name, 'Укажите, как к вам обращаться'); errors++; }
    else setError(name, '');

    var phone = form.elements.phone;
    var digits = phone.value.replace(/\D/g, '');
    if (!digits) { setError(phone, 'Укажите телефон для обратной связи'); errors++; }
    else if (digits.length < 10 || digits.length > 15) { setError(phone, 'Телефон: от 10 до 15 цифр с кодом страны'); errors++; }
    else setError(phone, '');

    var consent = form.elements.consent;
    setError(consent, consent.checked ? '' : 'error');
    if (!consent.checked) {
      errors++;
      if (status) {
        status.textContent = 'Чтобы отправить заявку, подтвердите согласие на обработку персональных данных.';
        status.className = 'form__status is-err';
      }
    }
    return errors === 0;
  }

  if (form) {
    form.addEventListener('input', function (e) {
      if (e.target.name !== 'consent') setError(e.target, '');
    });
    form.addEventListener('change', function (e) {
      if (e.target.name === 'consent' && e.target.checked) setError(e.target, '');
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (status) { status.textContent = ''; status.className = 'form__status'; }
      if (!validate()) {
        var bad = form.querySelector('.is-invalid input');
        if (bad) bad.focus();
        return;
      }
      if (form.elements.website && form.elements.website.value) return;   // ловушка для ботов

      var data = {
        name: form.elements.name.value,
        phone: form.elements.phone.value,
        message: form.elements.message ? form.elements.message.value : '',
        consent: true,
        page: window.location.pathname,
        sentAt: new Date().toISOString()
      };

      var button = form.querySelector('button[type="submit"]');
      var label = button ? button.querySelector('.btn__label') : null;
      var endpoint = form.getAttribute('data-endpoint');
      if (button) button.disabled = true;
      if (label) label.textContent = 'Отправляем…';

      var request = endpoint
        ? fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          }).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (body) {
              if (!res.ok || !body.ok) throw new Error(body.message || ('HTTP ' + res.status));
              return body;
            });
          })
        : new Promise(function (r) { setTimeout(r, 700); });

      request.then(function () {
        form.reset();
        if (status) {
          status.textContent = 'Заявка принята. Мы перезвоним, чтобы уточнить детали по объекту.';
          status.className = 'form__status is-ok';
        }
      }).catch(function (err) {
        if (status) {
          status.textContent = 'Не удалось отправить заявку. Попробуйте ещё раз или позвоните нам.';
          status.className = 'form__status is-err';
        }
        if (window.console) console.error(err);
      }).then(function () {
        if (button) button.disabled = false;
        if (label) label.textContent = 'Отправить заявку';
      });
    });
  }

  /* ------------------------------------------------------------------
     3D-сцены: Three.js грузим только там, где есть WebGL
     ------------------------------------------------------------------ */
  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return Boolean(window.WebGL2RenderingContext && c.getContext('webgl2'));
    } catch (e) { return false; }
  }
  function loadModule(src) {
    var m = document.createElement('script');
    m.type = 'module';
    m.src = src;
    document.body.appendChild(m);
  }

  if (hasWebGL()) {
    if (heroSec) {
      // вариант первого экрана: data-scene у .hero, для сравнения — ?scene=zoom в адресе
      var scene = (location.search.match(/[?&]scene=(\w+)/) || [])[1] || heroSec.getAttribute('data-scene');
      loadModule(scene === 'zoom' ? '/assets/js/hero-zoom.js?v=e6f289b1' : '/assets/js/hero-rewind.js?v=8af1fcfb');
    }
    var wallStage = document.getElementById('wallStage');
    if (wallStage && 'IntersectionObserver' in window) {
      var so = new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) return;
        so.disconnect();
        loadModule('/assets/js/foundation3d.js?v=255be161');
      }, { rootMargin: '600px 0px' });
      so.observe(wallStage);
    }
    // следим за экраном схемы: сам #cfgStage скрыт, пока 3D не загрузилось
    var cfgScreen = document.querySelector('.cfg__screen');
    if (cfgScreen && document.getElementById('cfgStage') && 'IntersectionObserver' in window) {
      var co = new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) return;
        co.disconnect();
        loadModule('/assets/js/cfg3d.js?v=9c19e5a5');
      }, { rootMargin: '600px 0px' });
      co.observe(cfgScreen);
    }
  }

  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  onScroll();
  window.addEventListener('load', onScroll);
})();
