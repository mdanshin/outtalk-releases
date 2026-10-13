// Тема до первой отрисовки: явный выбор человека (светлая/тёмная) или — без него — системная.
// Отдельным файлом, а не встроенным скриптом: CSP страниц документации — `script-src 'self'`.
try {
  var t = localStorage.getItem('outtalk-docs-theme')
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t)
} catch (e) {
  /* хранилище недоступно — остаётся системная тема */
}
