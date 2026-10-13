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

  /* ——— Загрузка ———
     latest.json — данные из сети, а не разметка: ссылка принимается, только если ведёт на наши
     выпуски, и пишется в href, а не в HTML. Тот же список, что у главной страницы. */
  var RELEASES = 'https://github.com/mdanshin/outtalk-releases/releases'
  var LATEST = RELEASES + '/latest'
  function safeUrl(u) {
    return typeof u === 'string' && u.indexOf(RELEASES + '/') === 0 ? u : LATEST
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
