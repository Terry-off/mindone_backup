#!/bin/bash
# 10_assets.sh — 에셋 수집·다운로드·CSS 재귀 처리
# in : _workdir/raw/{pages,posts}/*.html
# out: assets/{vendor,cdn,cdnopt,site,insta}/..., _workdir/asset_map.tsv (원본URL<TAB>로컬경로)
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW="$ROOT/_workdir/raw"
WD="$ROOT/_workdir"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
BASE="https://minddent.imweb.me"
cd "$ROOT"
mkdir -p assets/vendor assets/cdn assets/cdnopt assets/site assets/insta

echo "== [1/5] URL 수집"
cat "$RAW"/pages/*.html "$RAW"/posts/*.html > "$WD/_all.html"

# imweb CDN 계열 (쿼리 캐시버스터 제거)
grep -oE "https?://(vendor-cdn|cdn|cdn-optimized)\.imweb\.me/[^\"'()<> ]+" "$WD/_all.html" \
  | sed -E 's/[?&][0-9]+$//; s/\\$//' | sed -E "s/[?]$//" | sort -u > "$WD/urls_imweb.txt"

# 사이트 상대 JS/CSS (속성 안, oms/fo-shopping 제외 — 어차피 제거 대상)
grep -oE "src='/js/[^']+'|src=\"/js/[^\"]+\"|href='/css/[^']+'|href=\"/css/[^\"]+\"" "$WD/_all.html" \
  | sed -E "s/^(src|href)=['\"]//; s/['\"]$//" | sed -E 's/\?[0-9]+$//' | sort -u > "$WD/urls_site.txt"

# 인스타그램 (엔티티 &amp; 포함 원문 그대로 보존)
grep -oE "https://[a-z0-9.-]*cdninstagram\.com/[^\"'<> ]+" "$WD/_all.html" | sort -u > "$WD/urls_insta_raw.txt"

echo "  imweb: $(wc -l < "$WD/urls_imweb.txt"), site: $(wc -l < "$WD/urls_site.txt"), insta: $(wc -l < "$WD/urls_insta_raw.txt")"

> "$WD/asset_map.tsv"
> "$WD/dl_fail.txt"

dl() { # $1=fetch_url $2=localpath  (skip if exists)
  local out="$2"
  if [ ! -s "$out" ]; then
    mkdir -p "$(dirname "$out")"
    local code
    code=$(curl -sS --retry 2 -A "$UA" -o "$out" -w "%{http_code}" "$1" 2>>"$WD/dl_fail.txt")
    if [ "$code" != "200" ] || [ ! -s "$out" ]; then
      echo "FAIL [$code] $1" >> "$WD/dl_fail.txt"; rm -f "$out"; return 1
    fi
  fi
  return 0
}

localpath_for() { # $1=url(no query) → echo local path
  local u="$1"
  case "$u" in
    https://vendor-cdn.imweb.me/*) echo "assets/vendor/${u#https://vendor-cdn.imweb.me/}" ;;
    http://vendor-cdn.imweb.me/*)  echo "assets/vendor/${u#http://vendor-cdn.imweb.me/}" ;;
    https://cdn-optimized.imweb.me/*) echo "assets/cdnopt/${u#https://cdn-optimized.imweb.me/}" ;;
    https://cdn.imweb.me/*)        echo "assets/cdn/${u#https://cdn.imweb.me/}" ;;
    http://cdn.imweb.me/*)         echo "assets/cdn/${u#http://cdn.imweb.me/}" ;;
    /css/custom.cm)                echo "assets/site/css/custom.css" ;;
    /*)                            echo "assets/site${u}" ;;
    *) return 1 ;;
  esac
}

echo "== [2/5] imweb CDN 다운로드"
n=0
while read -r u; do
  lp=$(localpath_for "$u") || continue
  if dl "$u" "$lp"; then printf '%s\t%s\n' "$u" "$lp" >> "$WD/asset_map.tsv"; fi
  n=$((n+1)); [ $((n % 50)) -eq 0 ] && echo "  ...$n"
done < "$WD/urls_imweb.txt"

echo "== [3/5] 사이트 상대 에셋 다운로드"
while read -r u; do
  lp=$(localpath_for "$u") || continue
  if dl "$BASE$u" "$lp"; then printf '%s\t%s\n' "$u" "$lp" >> "$WD/asset_map.tsv"; fi
done < "$WD/urls_site.txt"
# custom.cm은 0바이트라도 빈 파일 생성(참조 유지)
[ -f assets/site/css/custom.css ] || { mkdir -p assets/site/css; : > assets/site/css/custom.css; printf '%s\t%s\n' "/css/custom.cm" "assets/site/css/custom.css" >> "$WD/asset_map.tsv"; }

echo "== [4/5] 인스타그램 이미지 고정"
while read -r raw; do
  dec=$(printf '%s' "$raw" | sed 's/&amp;/\&/g')
  h=$(printf '%s' "$dec" | md5sum | cut -c1-16)
  lp="assets/insta/$h.jpg"
  if dl "$dec" "$lp"; then printf '%s\t%s\n' "$raw" "$lp" >> "$WD/asset_map.tsv"; fi
done < "$WD/urls_insta_raw.txt"

echo "== [5/5] CSS 재귀 수집 + CSS 내부 URL 재작성 (3회 반복)"
for round in 1 2 3; do
  found=0
  while IFS= read -r -d '' css; do
    dir=$(dirname "$css")
    # 절대 imweb URL → 다운로드 + 상대경로 재작성
    for u in $(grep -oE "https?://(vendor-cdn|cdn|cdn-optimized)\.imweb\.me/[^\"')( ]+" "$css" | sed -E 's/[?&][0-9]+$//' | sort -u); do
      lp=$(localpath_for "$u") || continue
      dl "$u" "$lp" || continue
      rel=$(realpath --relative-to="$dir" "$ROOT/$lp" 2>/dev/null | sed 's|\\|/|g')
      [ -n "$rel" ] || continue
      perl -pi -e "s{\Q$u\E(\?[0-9]+)?}{$rel}g" "$css"
      found=1
    done
    # 상대 url(...) → 소스 URL 기준 해석해 다운로드 (구조 보존이라 재작성 불필요)
    src_url=$(grep -P "\t$(echo "$css" | sed "s|$ROOT/||")$" "$WD/asset_map.tsv" | head -1 | cut -f1)
    [ -z "$src_url" ] && continue
    case "$src_url" in https://*|http://*) ;; *) src_url="$BASE$src_url" ;; esac
    src_base="${src_url%/*}"
    for r in $(grep -oE "url\([^)]*\)" "$css" | sed -E "s/^url\(['\"]?//; s/['\"]?\)$//" | grep -vE '^(data:|https?:|//|#)' | sed -E 's/\?.*$//;s/#.*$//' | sort -u); do
      # ../ 해석
      abs="$src_base/$r"
      while echo "$abs" | grep -q '/[^/]*/\.\./'; do abs=$(echo "$abs" | sed -E 's|/[^/]+/\.\./|/|'); done
      lp=$(localpath_for "$abs") || continue
      [ -s "$ROOT/$lp" ] && continue
      if dl "$abs" "$lp"; then printf '%s\t%s\n' "$abs" "$lp" >> "$WD/asset_map.tsv"; found=1; fi
    done
  done < <(find assets -name '*.css' -print0)
  echo "  round $round done (found=$found)"
  [ "$found" -eq 0 ] && break
done

sort -u "$WD/asset_map.tsv" -o "$WD/asset_map.tsv"
echo "== 완료: $(wc -l < "$WD/asset_map.tsv") 매핑, 실패 $(grep -c FAIL "$WD/dl_fail.txt" 2>/dev/null || echo 0)건"
du -sh assets/* 2>/dev/null