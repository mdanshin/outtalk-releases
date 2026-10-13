// Страницы продаж сайта OutTalk: тема и ссылки на загрузку.
// Без зависимостей и без сторонних запросов: читается только свой latest.json.
;(function () {
  'use strict'
  var root = document.documentElement
  var KEY = 'outtalk-docs-theme' // общий с документацией: выбор темы один на весь сайт

  /* ——— Тема ——— */
  function isDark() {
    var t = root.getAttribute('data-theme')
    if (t) return t === 'dark'
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  var themeBtn = document.getElementById('theme')
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark'
      root.setAttribute('data-theme', next)
      try {
        localStorage.setItem(KEY, next)
      } catch (e) {
        /* без хранилища выбор живёт до перехода на другую страницу */
      }
    })
  }

  /* ——— Оглавление документа на узком экране свёрнуто ——— */
  var toc = document.querySelector('.doc-toc details')
  if (toc && window.matchMedia && window.matchMedia('(max-width: 60rem)').matches) toc.removeAttribute('open')

  /* ——— Оплата через ЮKassa (ADR-0193) ———
     Форма уходит обычной отправкой браузера на страницу ЮKassa. Перед отправкой здесь собираются
     данные для чека (ym_merchant_receipt) — тот же JSON, что пишет скрипт конструктора ЮKassa:
     { customer: { email }, items }. Позиции чека заданы при сборке сайта (data-receipt-items),
     от покупателя — только адрес, и он попадает в JSON через JSON.stringify, а не склейкой строк.
     Без этого скрипта кнопка «Оплатить» остаётся выключенной: без чека платёж не уходит. */
  var payForms = document.querySelectorAll('form.pay')
  for (var i = 0; i < payForms.length; i += 1) {
    ;(function (form) {
      var items
      try {
        items = JSON.parse(form.getAttribute('data-receipt-items') || '')
      } catch (e) {
        return
      }
      if (!Array.isArray(items) || !items.length) return
      var email = form.querySelector('input[name="cps_email"]')
      var receipt = form.querySelector('input[name="ym_merchant_receipt"]')
      var button = form.querySelector('button[type="submit"]')
      if (!email || !receipt || !button) return
      form.addEventListener('submit', function (event) {
        var address = String(email.value || '').trim()
        if (!address || !email.checkValidity()) {
          event.preventDefault()
          email.reportValidity()
          return
        }
        email.value = address
        receipt.value = JSON.stringify({ customer: { email: address }, items: items })
      })
      button.disabled = false
    })(payForms[i])
  }

  /* ——— Загрузка ———
     latest.json — данные из сети, а не разметка: ссылка принимается, только если ведёт на наш
     установщик в https://outtalk.ru/releases/ (ADR-0195), и пишется в href, а не в HTML. Тот же
     список, что у главной страницы. Мост: пока выпуски дублируются в GitHub Releases, перенесённая
     запись платформы может ещё вести туда — убрать вместе с мостом. */
  var FALLBACK = '../' // главная страница: у папки releases/ нет списка файлов
  var INSTALLER = /^OutTalk-[A-Za-z0-9.-]+\.(?:dmg|exe|zip)$/
  var BRIDGE_REPO = ['', 'mdanshin', 'outtalk-releases', 'releases', 'download']
  function safeUrl(u) {
    var url
    try {
      url = new URL(String(u))
    } catch (e) {
      return FALLBACK
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port) return FALLBACK
    if (url.pathname.indexOf('%') !== -1) return FALLBACK
    if (url.hostname === 'outtalk.ru' && url.pathname.indexOf('/releases/') === 0 &&
        INSTALLER.test(url.pathname.slice('/releases/'.length))) return url.href
    var s = url.pathname.split('/')
    if (url.hostname === 'github.com' && s.length === 7 && /^v\d+\.\d+\.\d+$/.test(s[5]) && INSTALLER.test(s[6])) {
      for (var i = 0; i < BRIDGE_REPO.length; i += 1) if (s[i] !== BRIDGE_REPO[i]) return FALLBACK
      return url.href
    }
    return FALLBACK
  }
  var win = document.getElementById('dl-win')
  var mac = document.getElementById('dl-mac')
  if (!win && !mac) return
  fetch('../latest.json', { cache: 'no-store' })
    .then(function (r) {
      return r.ok ? r.json() : null
    })
    .then(function (feed) {
      var d = (feed && feed.downloads) || {}
      if (win) win.href = safeUrl(d.win && d.win.url)
      if (mac) mac.href = safeUrl(d.mac && d.mac.url)
    })
    .catch(function () {
      /* остаётся страница выпусков */
    })
})()
