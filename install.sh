#!/bin/sh
set -eu

origin='https://outtalk.ru'
mode='auto'
if [ "${1-}" = '--appimage' ]; then
  mode='appimage'
  shift
fi
if [ "$#" -ne 0 ]; then
  printf '%s\n' 'Использование: install.sh [--appimage]' >&2
  exit 2
fi

command -v curl >/dev/null 2>&1 || {
  printf '%s\n' 'Для установки нужен curl.' >&2
  exit 1
}
command -v openssl >/dev/null 2>&1 || {
  printf '%s\n' 'Для проверки контрольной суммы нужен openssl.' >&2
  exit 1
}

work="$(mktemp -d "${TMPDIR:-/tmp}/outtalk-install.XXXXXX")"
trap 'rm -rf "$work"' EXIT HUP INT TERM

fetch() {
  curl --fail --silent --show-error --proto '=https' --tlsv1.2 \
    --connect-timeout 20 --max-time 1800 --output "$2" "$1"
}

feed="$work/latest.json"
fetch "$origin/latest.json" "$feed"
version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$feed" | sed -n '1p')"
printf '%s' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-beta\.[0-9]+)?$' || {
  printf '%s\n' 'Сайт вернул некорректный номер версии.' >&2
  exit 1
}

system="$(uname -s)"
machine="$(uname -m)"
case "$system:$machine" in
  Darwin:arm64)
    kind='mac'
    file="OutTalk-$version-arm64.dmg"
    ;;
  Linux:x86_64|Linux:amd64)
    if [ "$mode" = 'appimage' ]; then
      kind='appimage'
      file="OutTalk-$version-x64.AppImage"
    elif command -v dpkg >/dev/null 2>&1 && command -v apt >/dev/null 2>&1; then
      kind='deb'
      file="OutTalk-$version-x64.deb"
    else
      kind='appimage'
      file="OutTalk-$version-x64.AppImage"
    fi
    ;;
  Darwin:*)
    printf '%s\n' 'OutTalk для macOS сейчас доступен только на Apple Silicon.' >&2
    exit 1
    ;;
  Linux:*)
    printf '%s\n' 'OutTalk для Linux сейчас доступен только для x64.' >&2
    exit 1
    ;;
  *)
    printf '%s\n' 'Эта команда поддерживает macOS и Linux. Для Windows используйте install.ps1.' >&2
    exit 1
    ;;
esac

uri="$origin/releases/$file"
signature="$work/$file.sig"
package="$work/$file"
printf 'Скачиваю OutTalk %s...\n' "$version"
fetch "$uri.sig" "$signature"
fetch "$uri" "$package"

sig_file="$(sed -n 's/.*"file":"\([^"]*\)".*/\1/p' "$signature" | sed -n '1p')"
sig_version="$(sed -n 's/.*"version":"\([^"]*\)".*/\1/p' "$signature" | sed -n '1p')"
expected="$(sed -n 's/.*"sha512":"\([A-Za-z0-9+\/=]*\)".*/\1/p' "$signature" | sed -n '1p')"
if ! grep -q '"format":"outtalk-update-signature"' "$signature" ||
   ! grep -q '"v":1' "$signature" ||
   ! grep -q '"kid":"u1"' "$signature" ||
   [ "$sig_file" != "$file" ] || [ "$sig_version" != "$version" ] || [ -z "$expected" ]; then
  printf '%s\n' 'Опубликованные сведения о контрольной сумме некорректны.' >&2
  exit 1
fi

actual="$(openssl dgst -sha512 -binary "$package" | openssl base64 -A)"
if [ "$actual" != "$expected" ]; then
  printf '%s\n' 'Контрольная сумма загруженного файла не совпала.' >&2
  exit 1
fi

case "$kind" in
  mac)
    downloads="${HOME}/Downloads"
    mkdir -p "$downloads"
    target="$downloads/$file"
    if [ -e "$target" ]; then
      target="$downloads/OutTalk-$version-arm64-$(date +%Y%m%d-%H%M%S).dmg"
    fi
    mv "$package" "$target"
    printf '%s\n' 'Открываю образ. Перетащите OutTalk в «Программы».'
    open "$target"
    ;;
  deb)
    if [ "$(id -u)" -eq 0 ]; then
      apt install "$package"
    elif command -v sudo >/dev/null 2>&1; then
      sudo apt install "$package"
    else
      printf '%s\n' "Скачано: $package" >&2
      printf '%s\n' 'Для установки .deb нужны права администратора и команда apt.' >&2
      trap - EXIT HUP INT TERM
      exit 1
    fi
    printf '%s\n' 'OutTalk установлен.'
    ;;
  appimage)
    appdir="${HOME}/Applications"
    mkdir -p "$appdir"
    target="$appdir/$file"
    if [ -e "$target" ]; then
      target="$appdir/OutTalk-$version-x64-$(date +%Y%m%d-%H%M%S).AppImage"
    fi
    mv "$package" "$target"
    chmod 0755 "$target"
    printf 'OutTalk сохранён в %s и запускается.\n' "$target"
    "$target" >/dev/null 2>&1 &
    ;;
esac
