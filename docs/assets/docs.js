// Документация OutTalk на сайте (ADR-0166): тема, поиск, «На этой странице».
// Без зависимостей и без сторонних запросов: индекс поиска — свой файл data/search.json,
// он грузится только при первом поиске.
;(function () {
  'use strict'
  var root = document.documentElement
  var KEY = 'outtalk-docs-theme'

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

  /* ——— Разделы на узком экране свёрнуты ——— */
  var sideBox = document.querySelector('.side-box')
  if (sideBox && window.matchMedia && window.matchMedia('(max-width: 820px)').matches) sideBox.removeAttribute('open')

  /* ——— «На этой странице»: подсветка текущего раздела ——— */
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.toc a'))
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var byId = {}
    tocLinks.forEach(function (a) {
      byId[decodeURIComponent(a.getAttribute('href').slice(1))] = a
    })
    var current = null
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return
          var link = byId[e.target.id]
          if (!link || link === current) return
          if (current) current.classList.remove('active')
          current = link
          link.classList.add('active')
        })
      },
      { rootMargin: '-70px 0px -70% 0px' }
    )
    Object.keys(byId).forEach(function (id) {
      var el = document.getElementById(id)
      if (el) observer.observe(el)
    })
  }

  /* ——— Поиск ——— */
  var input = document.getElementById('q')
  var box = document.getElementById('results')
  if (!input || !box) return
  var index = null
  var loading = null
  var selected = -1

  function load() {
    if (index || loading) return loading
    loading = fetch('data/search.json', { credentials: 'omit' })
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status))
        return r.json()
      })
      .then(function (data) {
        var titles = {}
        data.docs.forEach(function (d) {
          titles[d.s] = d.t
        })
        index = data.sections.map(function (s) {
          return {
            slug: s.s,
            id: s.i,
            doc: titles[s.s] || s.s,
            heading: s.h,
            text: s.t,
            hay: (titles[s.s] + ' ' + s.h + ' ' + s.t).toLowerCase(),
            head: (titles[s.s] + ' ' + s.h).toLowerCase()
          }
        })
      })
      .catch(function () {
        loading = null
      })
    return loading
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  // Подсветка по сырому тексту: совпадения и промежутки экранируются по отдельности, поэтому
  // слово поиска не может «попасть» внутрь HTML-сущности.
  function highlight(text, terms) {
    var re = new RegExp(
      '(' + terms.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }).join('|') + ')',
      'gi'
    )
    return String(text)
      .split(re)
      .map(function (part, i) {
        return i % 2 ? '<mark>' + escapeHtml(part) + '</mark>' : escapeHtml(part)
      })
      .join('')
  }

  function snippet(text, term) {
    var i = text.toLowerCase().indexOf(term)
    if (i < 0) return text.slice(0, 160)
    var start = Math.max(0, i - 60)
    return (start > 0 ? '…' : '') + text.slice(start, start + 180) + (start + 180 < text.length ? '…' : '')
  }

  function search(q) {
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    if (!terms.length || !index) return []
    var hits = []
    for (var i = 0; i < index.length; i++) {
      var e = index[i]
      var ok = true
      var score = 0
      for (var j = 0; j < terms.length; j++) {
        if (e.hay.indexOf(terms[j]) < 0) {
          ok = false
          break
        }
        if (e.head.indexOf(terms[j]) >= 0) score += 10
      }
      if (ok) hits.push({ e: e, score: score })
      if (hits.length > 400) break
    }
    hits.sort(function (a, b) {
      return b.score - a.score
    })
    return hits.slice(0, 20).map(function (h) {
      return h.e
    })
  }

  function render() {
    var q = input.value.trim()
    selected = -1
    if (!q) {
      box.hidden = true
      input.setAttribute('aria-expanded', 'false')
      return
    }
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    var hits = search(q)
    if (!index) {
      box.innerHTML = '<div class="r-empty">Загружаю индекс…</div>'
    } else if (!hits.length) {
      box.innerHTML = '<div class="r-empty">Ничего не найдено</div>'
    } else {
      box.innerHTML = hits
        .map(function (e, k) {
          var href = e.slug + '.html' + (e.id ? '#' + e.id : '')
          return (
            '<a role="option" id="r' + k + '" href="' + escapeHtml(href) + '">' +
            '<span class="r-path">' + escapeHtml(e.doc) + '</span>' +
            '<span class="r-title">' + highlight(e.heading || e.doc, terms) + '</span>' +
            '<span class="r-snip">' + highlight(snippet(e.text, terms[0]), terms) + '</span></a>'
          )
        })
        .join('')
    }
    box.hidden = false
    input.setAttribute('aria-expanded', 'true')
  }

  function move(delta) {
    var items = box.querySelectorAll('a')
    if (!items.length) return
    if (selected >= 0) items[selected].removeAttribute('aria-selected')
    selected = (selected + delta + items.length) % items.length
    items[selected].setAttribute('aria-selected', 'true')
    items[selected].scrollIntoView({ block: 'nearest' })
    input.setAttribute('aria-activedescendant', items[selected].id)
  }

  var timer = 0
  input.addEventListener('focus', load)
  input.addEventListener('input', function () {
    clearTimeout(timer)
    timer = setTimeout(function () {
      var p = load()
      render()
      if (p && !index) p.then(render)
    }, 80)
  })
  input.addEventListener('keydown', function (ev) {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault()
      move(1)
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault()
      move(-1)
    } else if (ev.key === 'Enter') {
      var items = box.querySelectorAll('a')
      var target = items[selected >= 0 ? selected : 0]
      if (target) window.location.href = target.getAttribute('href')
    } else if (ev.key === 'Escape') {
      input.value = ''
      render()
      input.blur()
    }
  })
  document.addEventListener('click', function (ev) {
    if (!box.contains(ev.target) && ev.target !== input) {
      box.hidden = true
      input.setAttribute('aria-expanded', 'false')
    }
  })
  // «/» — к поиску, как на большинстве сайтов документации.
  document.addEventListener('keydown', function (ev) {
    if (ev.key === '/' && document.activeElement !== input && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
      ev.preventDefault()
      input.focus()
    }
  })
})()
