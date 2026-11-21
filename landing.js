const $ = (id) => document.getElementById(id)
document.documentElement.classList.add('js')
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

/* ── 1. The mark draws itself along its own strokes ──
   Measured, not guessed: each path reports its true length, so the dash animation is
   exact no matter how the icon changes later. */
for (const p of document.querySelectorAll('.mark path')) {
  p.style.setProperty('--len', p.getTotalLength())
}

/* ── 2. The living field ──
   An aurora built from the brand's own gradient, warped by fractal noise and bent
   toward the pointer. If WebGL is unavailable the static gradient already painted on
   the canvas stays — the page must never depend on it. */
const canvas = $('bg')
const gl = reduced ? null : canvas.getContext('webgl', { antialias: false, alpha: true })

if (gl) {
  const VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }'
  const FRAG = `
    precision highp float;
    uniform vec2  u_res;
    uniform float u_t;
    uniform vec2  u_m;

    // Value noise + fbm: cheap, smooth, and enough to make light behave like weather.
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p){
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
      return v;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_res.xy;
      vec2 q  = vec2(uv.x * (u_res.x / u_res.y), uv.y);

      // The field leans toward the cursor: the page notices you.
      vec2 m = (u_m - 0.5) * 0.55;
      float t = u_t * 0.045;

      float n1 = fbm(q * 2.1 + vec2(t, -t * 0.7) + m);
      float n2 = fbm(q * 3.4 - vec2(t * 0.8, t * 0.5) + n1 * 0.9 - m * 0.6);
      float n  = mix(n1, n2, 0.55);

      // The icon's own ramp: cyan → blue → deep → violet.
      vec3 cyan   = vec3(0.086, 0.898, 1.000);
      vec3 blue   = vec3(0.086, 0.529, 1.000);
      vec3 deep   = vec3(0.133, 0.294, 1.000);
      vec3 violet = vec3(0.329, 0.157, 0.910);

      vec3 col = mix(cyan, blue, smoothstep(0.15, 0.50, n));
      col = mix(col, deep,   smoothstep(0.42, 0.72, n));
      col = mix(col, violet, smoothstep(0.60, 0.95, n));

      // Filaments where the noise crests — the aurora's ribbons.
      float band = smoothstep(0.52, 0.60, n) - smoothstep(0.62, 0.78, n);
      col += band * 1.15 * mix(cyan, violet, uv.x);

      // Hold the light up and to the right, where the mark's gradient lives, and let
      // the page fall dark where the words are.
      // Bright where the mark's gradient lives (up, right), dark where the words are.
      float fall = smoothstep(1.15, 0.0, uv.y) * (0.30 + 0.85 * smoothstep(-0.1, 1.0, uv.x));
      float energy = pow(n, 1.55) * 1.9 + band * 1.1;

      vec3 outc = pow(col * energy * fall, vec3(0.88));
      gl_FragColor = vec4(outc, 1.0);
    }
  `
  const sh = (type, src) => {
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null
  }
  const vs = sh(gl.VERTEX_SHADER, VERT)
  const fs = sh(gl.FRAGMENT_SHADER, FRAG)

  if (vs && fs) {
    const prog = gl.createProgram()
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(prog, 'u_res')
    const uT = gl.getUniformLocation(prog, 'u_t')
    const uM = gl.getUniformLocation(prog, 'u_m')

    // Half resolution: this is atmosphere, not a texture. Nobody counts its pixels,
    // and a spinning laptop fan is a worse first impression than a soft gradient.
    const DPR = Math.min(devicePixelRatio || 1, 1.5) * 0.5
    const size = () => {
      canvas.width = Math.max(1, (innerWidth * DPR) | 0)
      canvas.height = Math.max(1, (innerHeight * DPR) | 0)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(uRes, canvas.width, canvas.height)
    }
    size()
    addEventListener('resize', size)

    const at = { x: 0.5, y: 0.5 }
    const to = { x: 0.5, y: 0.5 }
    addEventListener(
      'pointermove',
      (e) => {
        to.x = e.clientX / innerWidth
        to.y = 1 - e.clientY / innerHeight
      },
      { passive: true }
    )

    let running = true
    const t0 = performance.now()
    function frame(now) {
      if (!running) return
      at.x += (to.x - at.x) * 0.05 // eased, so the field drifts rather than snaps
      at.y += (to.y - at.y) * 0.05
      gl.uniform1f(uT, (now - t0) / 1000)
      gl.uniform2f(uM, at.x, at.y)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      requestAnimationFrame(frame)
    }
    document.addEventListener('visibilitychange', () => {
      running = !document.hidden
      if (running) requestAnimationFrame(frame)
    })
    canvas.style.background = 'none'
    requestAnimationFrame(frame)
  }
}

/* ── 3. The field is a HERO effect. Past the hero it would only compete with the
       words, so it dims as the page scrolls: the drama stays where it belongs. ── */
if (!reduced) {
  let ticking = false
  const dim = () => {
    const k = Math.min(1, scrollY / 700)
    canvas.style.opacity = String(1 - k * 0.82)
    ticking = false
  }
  addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(dim)
      }
    },
    { passive: true }
  )
}

/* ── 4. The window, in real space ── */
const machine = $('machine')
if (machine && !reduced && matchMedia('(pointer: fine)').matches) {
  const stage = machine.parentElement
  stage.addEventListener(
    'pointermove',
    (e) => {
      const r = machine.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width
      const py = (e.clientY - r.top) / r.height
      machine.style.transition = 'transform 0.15s linear'
      machine.style.transform = `rotateX(${9 - py * 8}deg) rotateY(${(px - 0.5) * 9}deg) scale(1)`
      machine.style.setProperty('--gx', px * 100 + '%')
      machine.style.setProperty('--gy', py * 100 + '%')
    },
    { passive: true }
  )
  stage.addEventListener('pointerleave', () => {
    machine.style.transition = 'transform 0.7s cubic-bezier(0.2, 1, 0.3, 1)'
    machine.style.transform = 'rotateX(9deg) scale(0.985)'
  })
}

/* ── 5. Downloads ──
   latest.json is DATA fetched over the network, not markup. A download URL is honoured
   only if it points at our own release assets, and every value it carries is written as
   text — otherwise whoever can alter the feed could redirect the button and inject
   script into this page. The same allowlist the app enforces in main (ADR-0195): an installer
   directly under https://outtalk.ru/releases/. Anything else falls back to the installation guide
   (the folder itself has no listing). */
const FALLBACK = 'docs/distribution.html'
const INSTALLER = /^OutTalk-[A-Za-z0-9.-]+\.(?:dmg|exe|zip|AppImage|deb)$/
// Bridge (ADR-0195): while releases are still duplicated to GitHub Releases, the feed may carry an
// older installer link there (the platform this run did not ship is carried over). Remove with the bridge.
const BRIDGE_REPO = ['', 'mdanshin', 'outtalk-releases', 'releases', 'download']
const safeUrl = (u) => {
  try {
    const url = new URL(String(u))
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port) return FALLBACK
    if (url.pathname.includes('%')) return FALLBACK
    if (url.hostname === 'outtalk.ru' && url.pathname.startsWith('/releases/') &&
        INSTALLER.test(url.pathname.slice('/releases/'.length))) return url.href
    const s = url.pathname.split('/')
    if (url.hostname === 'github.com' && s.length === 7 && BRIDGE_REPO.every((part, i) => s[i] === part) &&
        /^v\d+\.\d+\.\d+$/.test(s[5]) && INSTALLER.test(s[6])) return url.href
  } catch {
    /* not a URL */
  }
  return FALLBACK
}


const WIN_ICON =
  '<path d="M3 5.6 10 4.6v6.8H3V5.6Zm0 12.8 7 1v-6.6H3v5.6ZM11.2 4.4 21 3v8.4h-9.8V4.4Zm0 8.2H21V21l-9.8-1.4v-7Z"/>'
const MAC_ICON =
  '<path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.9-3-.8c-1.5 0-2.9.9-3.7 2.2-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.2 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.8-2.2c.9-1.2 1.2-2.4 1.2-2.5 0 0-2.4-.9-2.4-3.5ZM14.2 5.9c.6-.8 1-1.9.9-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-.9 2.9 1 .1 2-.5 2.7-1.3Z"/>'

const LINUX_ICON =
  '<path fill-rule="evenodd" d="M12 2.5c-2.2 0-3.6 1.8-3.6 4.2 0 1.2-.5 2.2-1.3 3.4C5.9 11.8 4.5 14 4.5 16.6c0 1.2.4 2.2 1 2.9-.7.3-1.5.9-1.5 1.6 0 .9 1.4 1.4 3.2 1.4 1.3 0 2.3-.3 2.9-.8.6.1 1.2.2 1.9.2s1.3-.1 1.9-.2c.6.5 1.6.8 2.9.8 1.8 0 3.2-.5 3.2-1.4 0-.7-.8-1.3-1.5-1.6.6-.7 1-1.7 1-2.9 0-2.6-1.4-4.8-2.6-6.5-.8-1.2-1.3-2.2-1.3-3.4 0-2.4-1.4-4.2-3.6-4.2Zm0 8.3c-1.9 0-3.4 2.2-3.4 4.9s1.5 4.6 3.4 4.6 3.4-1.9 3.4-4.6-1.5-4.9-3.4-4.9Z"/>'

const ua = navigator.userAgent
const isMobileOs = /iPhone|iPad|iPod|Android/i.test(ua)
const isMac = /Mac|iPhone|iPad/i.test(ua)
const isLinux = !isMac && /Linux|X11/i.test(ua) && !/Android/i.test(ua)
const mb = (b) => (typeof b === 'number' && b > 0 ? ` · ${(b / 1048576).toFixed(0)} МБ` : '')
const LABEL = { win: 'Скачать для Windows', mac: 'Скачать для macOS', linux: 'Скачать для Linux (.deb)' }
const ICON = { win: WIN_ICON, mac: MAC_ICON, linux: LINUX_ICON }

/* ── 6. Terminal install ──
   Without JavaScript every command remains visible as ordinary text. With JavaScript the same
   markup becomes an accessible tab set, preferring the visitor's system and never presenting a
   command as available when the public feed has no matching build. */
const installSection = $('terminal-install')
const installTabs = [...document.querySelectorAll('[data-install-tab]')]
const installPanels = [...document.querySelectorAll('[data-install-panel]')]
const initialInstallOs = isMac ? 'mac' : isLinux ? 'linux' : 'win'
const detectedOs = isMobileOs ? null : initialInstallOs

for (const [os, icon] of Object.entries(ICON)) {
  const target = document.querySelector(`[data-install-icon="${os}"]`)
  if (target) target.innerHTML = icon // constants above, never network data
}

const chooseInstallTab = (os, moveFocus = false) => {
  for (const tab of installTabs) {
    const active = tab.dataset.installTab === os
    tab.setAttribute('aria-selected', String(active))
    tab.tabIndex = active ? 0 : -1
    if (active && moveFocus) tab.focus()
  }
  for (const panel of installPanels) panel.hidden = panel.dataset.installPanel !== os
}

if (installTabs.length && installPanels.length) {
  const tablist = installTabs[0].parentElement
  tablist.setAttribute('role', 'tablist')
  installTabs.forEach((tab, index) => {
    const os = tab.dataset.installTab
    const panel = installPanels.find((candidate) => candidate.dataset.installPanel === os)
    tab.id = `install-tab-${os}`
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-controls', panel.id)
    tab.dataset.detected = String(detectedOs !== null && os === detectedOs)
    panel.setAttribute('role', 'tabpanel')
    panel.setAttribute('aria-labelledby', tab.id)
    tab.addEventListener('click', () => chooseInstallTab(os))
    tab.addEventListener('keydown', (event) => {
      let next = null
      if (event.key === 'Home') next = 0
      if (event.key === 'End') next = installTabs.length - 1
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % installTabs.length
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + installTabs.length) % installTabs.length
      if (next === null) return
      event.preventDefault()
      chooseInstallTab(installTabs[next].dataset.installTab, true)
    })
  })
  chooseInstallTab(initialInstallOs)
  installSection.classList.add('is-loading')
  for (const button of document.querySelectorAll('[data-copy-command]')) button.disabled = true
}

const linuxVariants = [...document.querySelectorAll('[data-linux-variant]')]
const linuxCommands = [...document.querySelectorAll('[data-linux-command]')]
const linuxVariantGroup = document.querySelector('.linux-variants')
if (linuxVariantGroup) linuxVariantGroup.setAttribute('role', 'group')
const chooseLinuxVariant = (kind) => {
  for (const button of linuxVariants) {
    const active = button.dataset.linuxVariant === kind
    button.setAttribute('aria-pressed', String(active))
  }
  for (const command of linuxCommands) command.hidden = command.dataset.linuxCommand !== kind
}
for (const button of linuxVariants) {
  button.addEventListener('click', () => chooseLinuxVariant(button.dataset.linuxVariant))
}
chooseLinuxVariant('deb')

const copyStatus = $('copy-status')
for (const button of document.querySelectorAll('[data-copy-command]')) {
  button.addEventListener('click', async () => {
    const code = $(button.dataset.copyCommand)
    const command = code.textContent.trim()
    let copied = false
    try {
      if (location.protocol !== 'https:' || !navigator.clipboard || !navigator.clipboard.writeText) {
        throw new Error('clipboard unavailable')
      }
      await navigator.clipboard.writeText(command)
      copied = true
    } catch {
      const selection = getSelection()
      const range = document.createRange()
      range.selectNodeContents(code)
      selection.removeAllRanges()
      selection.addRange(range)
    }
    const shortcut = isMac && !isMobileOs ? '⌘C' : 'Ctrl+C'
    const message = copied ? 'Скопировано' : `Выделено — нажмите ${shortcut}`
    button.textContent = message
    copyStatus.textContent = copied ? 'Команда скопирована' : `Команда выделена. Нажмите ${shortcut}, чтобы скопировать.`
    setTimeout(() => {
      button.textContent = 'Копировать'
    }, 2000)
  })
}

function paintInstallAvailability(downloads) {
  if (!installSection) return
  const available = {
    win: safeUrl((downloads.win || {}).url) !== FALLBACK,
    mac: safeUrl((downloads.mac || {}).url) !== FALLBACK,
    linux: safeUrl((downloads.linux || {}).url) !== FALLBACK &&
      safeUrl((downloads['linux-appimage'] || {}).url) !== FALLBACK
  }
  for (const panel of installPanels) {
    const ok = available[panel.dataset.installPanel]
    panel.classList.toggle('is-unavailable', !ok)
    for (const button of panel.querySelectorAll('[data-copy-command]')) button.disabled = !ok
    const unavailable = panel.querySelector('.install-unavailable')
    if (unavailable) unavailable.hidden = ok
  }
  installSection.classList.remove('is-loading')
}

// One link as text: «<label> · NN МБ». The href is always checked by safeUrl.
function link(entry, label) {
  const a = document.createElement('a')
  a.href = safeUrl(entry.url)
  a.textContent = label + mb(entry.size)
  return a
}

function paintDownloads(feed) {
  const d = (feed && feed.downloads) || {}
  // Linux (ADR-0213) is offered only once its own half of a release is out: .deb for Ubuntu/Debian,
  // AppImage for the rest. Until then a Linux visitor sees the page as before.
  const linux = safeUrl((d.linux || {}).url) !== FALLBACK && safeUrl((d['linux-appimage'] || {}).url) !== FALLBACK
  const os = isMac ? 'mac' : isLinux && linux ? 'linux' : 'win'
  const here = d[os] || {}

  $('os-icon').innerHTML = ICON[os] // our constants, never feed data
  $('download').href = safeUrl(here.url)
  $('download-label').textContent = LABEL[os] + mb(here.size)

  const alt = $('other-os')
  if (os === 'linux') {
    alt.textContent = 'Другие дистрибутивы — '
    alt.appendChild(link(d['linux-appimage'], 'AppImage'))
    alt.appendChild(document.createTextNode('. Есть версии для '))
    alt.appendChild(link(d.win || {}, 'Windows'))
    alt.appendChild(document.createTextNode(' и '))
    alt.appendChild(link(d.mac || {}, 'macOS'))
    alt.appendChild(document.createTextNode('.'))
  } else {
    const other = os === 'win' ? 'mac' : 'win'
    alt.textContent = `Нужна версия для ${other === 'mac' ? 'macOS' : 'Windows'}? `
    alt.appendChild(link(d[other] || {}, 'Скачать'))
    if (linux) {
      alt.appendChild(document.createTextNode('. Для Linux — '))
      alt.appendChild(link(d.linux, '.deb'))
      alt.appendChild(document.createTextNode(' или '))
      alt.appendChild(link(d['linux-appimage'], 'AppImage'))
      alt.appendChild(document.createTextNode('.'))
    }
  }
  if (linux) $('platforms').textContent = 'Windows 10/11 · macOS 12+ на Apple Silicon · Linux x64'

  if (feed && /^[\w.+-]{1,24}$/.test(String(feed.version ?? ''))) {
    $('version').textContent = String(feed.version)
  }
  if (feed && feed.date) {
    const dt = new Date(feed.date)
    if (!isNaN(dt)) {
      $('date').textContent = dt.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
    }
  }
  paintInstallAvailability(d)
}

fetch('latest.json', { cache: 'no-store' })
  .then((r) => (r.ok ? r.json() : null))
  .then(paintDownloads)
  .catch(() => paintDownloads(null))
