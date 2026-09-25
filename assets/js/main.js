/* ==========================================================================
   Защита от БПЛА — ООО «Сфера»
   Скрипты витрины: навигация, анимации появления, счётчики, форма заявки
   ========================================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------
     Шапка: тень при прокрутке + индикатор прочитанного
     ------------------------------------------------------------------ */
  var hdr = document.getElementById('hdr');
  var progress = document.getElementById('progress');
  var ticking = false;

  function onScroll() {
    var y = window.scrollY || document.documentElement.scrollTop;
    if (hdr) hdr.classList.toggle('is-stuck', y > 8);

    if (progress) {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = (h > 0 ? Math.min(100, (y / h) * 100) : 0) + '%';
    }
    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  /* ------------------------------------------------------------------
     Мобильное меню
     ------------------------------------------------------------------ */
  var burger = document.getElementById('burger');
  var nav = document.getElementById('nav');

  function closeMenu() {
    if (!nav || !burger) return;
    nav.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Открыть меню');
  }

  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
  }

  /* ------------------------------------------------------------------
     Появление блоков при прокрутке
     ------------------------------------------------------------------ */
  var revealables = document.querySelectorAll('.reveal');

  if (reduced || !('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(revealables, function (el) { el.classList.add('is-in'); });
  } else {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    Array.prototype.forEach.call(revealables, function (el) { revealObserver.observe(el); });

    // Страховка: если наблюдатель по какой-то причине не сработал,
    // через 4 секунды показываем всё — текст не должен оставаться невидимым.
    window.setTimeout(function () {
      Array.prototype.forEach.call(revealables, function (el) { el.classList.add('is-in'); });
    }, 4000);
  }

  /* ------------------------------------------------------------------
     Счётчики в блоке статистики
     ------------------------------------------------------------------ */
  function runCounter(el) {
    var to = parseInt(el.getAttribute('data-to'), 10);
    if (isNaN(to)) return;

    if (reduced) { el.textContent = String(to); return; }

    var plain = el.hasAttribute('data-plain');
    var from = plain ? Math.max(0, to - 24) : 0;
    var dur = 1100;
    var start = null;

    function tick(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(from + (to - from) * eased));
      if (p < 1) window.requestAnimationFrame(tick);
    }
    window.requestAnimationFrame(tick);
  }

  var counters = document.querySelectorAll('.counter');
  if (counters.length) {
    // Страховка: если наблюдатель не сработает, числа останутся верными —
    // в разметке уже стоят итоговые значения.
    window.setTimeout(function () {
      Array.prototype.forEach.call(counters, function (el) {
        var to = parseInt(el.getAttribute('data-to'), 10);
        if (!isNaN(to) && el.textContent.trim() !== String(to)) el.textContent = String(to);
      });
    }, 4000);

    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(counters, runCounter);
    } else {
      var counterObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            runCounter(entry.target);
            counterObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.6 });
      Array.prototype.forEach.call(counters, function (el) { counterObserver.observe(el); });
    }
  }

  /* ------------------------------------------------------------------
     Подсветка текущего раздела в меню
     ------------------------------------------------------------------ */
  var navLinks = nav ? nav.querySelectorAll('a[href^="#"]') : [];
  var sections = [];

  Array.prototype.forEach.call(navLinks, function (link) {
    var target = document.querySelector(link.getAttribute('href'));
    if (target) sections.push({ link: link, el: target });
  });

  if (sections.length && 'IntersectionObserver' in window) {
    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        sections.forEach(function (s) {
          s.link.classList.toggle('is-active', s.el === entry.target);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    sections.forEach(function (s) { sectionObserver.observe(s.el); });
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
    // снимаем подсветку ошибки, как только поле начали править
    form.addEventListener('input', function (e) {
      if (e.target.name === 'consent') return;
      setError(e.target, '');
    });
    form.addEventListener('change', function (e) {
      if (e.target.name === 'consent' && e.target.checked) setError(e.target, '');
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      if (status) { status.textContent = ''; status.className = 'form__status'; }
      if (!validate()) {
        var firstBad = form.querySelector('.is-invalid input');
        if (firstBad) firstBad.focus();
        return;
      }

      // ловушка для спам-ботов: поле скрыто от человека
      if (form.elements.website && form.elements.website.value) return;

      var data = {};
      new FormData(form).forEach(function (value, key) {
        if (key === 'website') return;
        if (data[key] === undefined) data[key] = value;
        else if (Array.isArray(data[key])) data[key].push(value);
        else data[key] = [data[key], value];
      });
      data.page = window.location.href;
      data.sentAt = new Date().toISOString();

      var button = form.querySelector('button[type="submit"]');
      var label = button ? button.querySelector('.btn__label') : null;
      var endpoint = form.getAttribute('data-endpoint');

      if (button) button.disabled = true;
      if (label) label.textContent = 'Отправляем…';

      /* --------------------------------------------------------------
         ТОЧКА ПОДКЛЮЧЕНИЯ БЭКЕНДА
         Демо-режим: data-endpoint пуст, запрос никуда не уходит.
         Для боевой версии укажите в разметке формы
         data-endpoint="/send.php" — ниже уже готов реальный POST.
         -------------------------------------------------------------- */
      var request = endpoint
        ? fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          }).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res;
          })
        : new Promise(function (resolve) { window.setTimeout(resolve, 700); });

      request.then(function () {
        form.reset();
        if (status) {
          status.textContent = endpoint
            ? 'Заявка принята. Мы перезвоним, чтобы уточнить детали по объекту.'
            : 'Демо-режим: заявка проверена и не отправлена. В боевой версии она уйдёт на приём заявок.';
          status.className = 'form__status is-ok';
        }
        if (!endpoint && window.console) console.info('[демо] заявка:', data);
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
     3D-схема стенки: Three.js (~170 КБ) грузим, только когда блок
     подходит к экрану. Подключаем как <script type="module">: старые
     браузеры его просто пропустят и покажут статичную картинку.
     ------------------------------------------------------------------ */
  var wallStage = document.getElementById('wallStage');
  if (wallStage && 'IntersectionObserver' in window) {
    var wallObserver = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      wallObserver.disconnect();
      var mod = document.createElement('script');
      mod.type = 'module';
      mod.src = '/assets/js/foundation3d.js';
      document.body.appendChild(mod);
    }, { rootMargin: '400px 0px' });
    wallObserver.observe(wallStage);
  }

  /* ------------------------------------------------------------------
     Год в подвале
     ------------------------------------------------------------------ */
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
