#!/bin/bash
# 15_fix_assets.sh — 실패 다운로드 보정 (꼬리 문자 정리 + CSS 상대경로 재해석)
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WD="$ROOT/_workdir"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
cd "$ROOT"

dl() { local code; mkdir -p "$(dirname "$2")"
  code=$(curl -sS --retry 1 -A "$UA" -o "$2" -w "%{http_code}" "$1" 2>/dev/null)
  if [ "$code" = "200" ] && [ -s "$2" ]; then return 0; else rm -f "$2"; return 1; fi }

echo "== 1) imweb URL 꼬리 정리 재시도"
ok=0; ng=0
grep -E "^FAIL" "$WD/dl_fail.txt" | grep -oE "https://(vendor-cdn|cdn)\.imweb\.me/[^ ]+" | sed -E 's/(&quot;?|\);*|&amp.*)$//' | sort -u | while read -r u; do
  case "$u" in
    https://vendor-cdn.imweb.me/*) lp="assets/vendor/${u#https://vendor-cdn.imweb.me/}" ;;
    https://cdn.imweb.me/*)        lp="assets/cdn/${u#https://cdn.imweb.me/}" ;;
    *) continue ;;
  esac
  lp="${lp%%\?*}"
  [ -s "$lp" ] && { grep -qF "$u	$lp" "$WD/asset_map.tsv" || printf '%s\t%s\n' "$u" "$lp" >> "$WD/asset_map.tsv"; continue; }
  if dl "$u" "$lp"; then printf '%s\t%s\n' "$u" "$lp" >> "$WD/asset_map.tsv"; echo "OK  $u"; else echo "NG  $u"; fi
done

echo "== 2) CSS 아이콘/폰트 실경로 탐색"
# 알려진 실패 상대참조들: 후보 경로 순회
try_paths() { # $1=상대경로핵심 $2...=후보 URL들
  local rel="$1"; shift
  local lp="assets/vendor/_resolved/$rel"
  [ -s "$lp" ] && return 0
  for u in "$@"; do
    if dl "$u" "$lp"; then echo "OK  $rel <= $u"; printf '%s\t%s\n' "$u" "$lp" >> "$WD/asset_map.tsv"; return 0; fi
  done
  echo "NG  $rel"; return 1
}
V=https://vendor-cdn.imweb.me
try_paths "images/lightgallery/youtube-play.png" $V/css/images/lightgallery/youtube-play.png $V/images/lightgallery/youtube-play.png
try_paths "images/lightgallery/vimeo-play.png"   $V/css/images/lightgallery/vimeo-play.png   $V/images/lightgallery/vimeo-play.png
try_paths "images/lightgallery/video-play.png"   $V/css/images/lightgallery/video-play.png   $V/images/lightgallery/video-play.png
try_paths "images/lightgallery/loading.gif"      $V/css/images/lightgallery/loading.gif      $V/images/lightgallery/loading.gif
try_paths "common/img/filters.svg"               $V/css/site/common/img/filters.svg          $V/css/common/img/filters.svg
try_paths "owl.video.play.png"                   $V/css/owl.video.play.png                   $V/img/owl.video.play.png
try_paths "grabbing.png"                         $V/css/grabbing.png                         $V/img/grabbing.png
for ext in woff2 woff ttf eot svg; do
  try_paths "fonts/glyphicons-halflings-regular.$ext" $V/css/site/fonts/glyphicons-halflings-regular.$ext $V/fonts/glyphicons-halflings-regular.$ext $V/css/fonts/glyphicons-halflings-regular.$ext
done

echo "== 3) CSS 내부 실패 참조를 _resolved 경로로 재작성"
for css in assets/vendor/minify_css/*.css assets/vendor/css/site/bootstrap.css assets/vendor/css/owl.carousel1.css assets/vendor/css/site/site.css assets/vendor/css/site/site2.css; do
  [ -f "$css" ] || continue
  dir=$(dirname "$css")
  rel=$(realpath --relative-to="$dir" "$ROOT/assets/vendor/_resolved" | sed 's|\\|/|g')
  perl -pi -e "s{url\((['\"]?)(?:\.\./)*images/lightgallery/}{url(\$1$rel/images/lightgallery/}g;
               s{url\((['\"]?)(?:\.\./)*common/img/filters\.svg}{url(\$1$rel/common/img/filters.svg}g;
               s{url\((['\"]?)owl\.video\.play\.png}{url(\$1$rel/owl.video.play.png}g;
               s{url\((['\"]?)grabbing\.png}{url(\$1$rel/grabbing.png}g;
               s{url\((['\"]?)(?:\.\./)*fonts/glyphicons-halflings-regular\.}{url(\$1$rel/fonts/glyphicons-halflings-regular.}g" "$css"
done
sort -u "$WD/asset_map.tsv" -o "$WD/asset_map.tsv"
echo "== 완료. 매핑 $(wc -l < "$WD/asset_map.tsv")건"