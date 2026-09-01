#!/bin/bash
# 16_custom_css.sh — 사이트 고유 CSS(custom.cm, 178KB) 수집 + 그 안의 폰트/에셋 재귀 로컬화
# custom.cm은 Referer 헤더 없이는 빈 응답이 오므로 반드시 이 스크립트로 받아야 함.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WD="$ROOT/_workdir"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
REF="https://minddent.imweb.me/"
cd "$ROOT"

dlref() { # $1=url $2=out
  mkdir -p "$(dirname "$2")"
  local code
  code=$(curl -sS -A "$UA" -H "Referer: $REF" -H "Accept: text/css,*/*;q=0.1" -o "$2" -w "%{http_code}" "$1")
  if [ "$code" = "200" ] && [ -s "$2" ]; then return 0; else rm -f "$2"; echo "  FAIL[$code] $1"; return 1; fi
}

echo "== 1) custom.cm 수집 (Referer 필수)"
dlref "https://minddent.imweb.me/css/custom.cm" "assets/site/css/custom.css" \
  && echo "  OK $(stat -c%s assets/site/css/custom.css)B"
grep -qF "/css/custom.cm	assets/site/css/custom.css" "$WD/asset_map.tsv" || \
  printf '%s\t%s\n' "/css/custom.cm" "assets/site/css/custom.css" >> "$WD/asset_map.tsv"

echo "== 2) 구글폰트(나눔고딕) 로컬화"
GF="https://fonts.googleapis.com/earlyaccess/nanumgothic.css"
if dlref "$GF" "assets/gfonts/nanumgothic.css"; then
  echo "  css OK $(stat -c%s assets/gfonts/nanumgothic.css)B"
  for u in $(grep -oE "https://fonts\.gstatic\.com/[^)\"']+" assets/gfonts/nanumgothic.css | sort -u); do
    fn=$(basename "${u%%\?*}")
    if dlref "$u" "assets/gfonts/files/$fn"; then
      perl -pi -e "s{\Q$u\E}{files/$fn}g" assets/gfonts/nanumgothic.css
    fi
  done
  echo "  폰트파일 $(ls assets/gfonts/files 2>/dev/null | wc -l)개"
fi

echo "== 3) custom.css 내부 참조 로컬화 (@import + url)"
CSS=assets/site/css/custom.css
# vendor-cdn @import/url → 다운로드 후 상대경로
for u in $(grep -oE "https?://(vendor-cdn|cdn|cdn-optimized)\.imweb\.me/[^)\"' ]+" "$CSS" | sed -E 's/[?&][0-9]+$//' | sort -u); do
  case "$u" in
    *vendor-cdn*) lp="assets/vendor/${u#https://vendor-cdn.imweb.me/}" ;;
    *cdn-optimized*) lp="assets/cdnopt/${u#https://cdn-optimized.imweb.me/}" ;;
    *) lp="assets/cdn/${u#https://cdn.imweb.me/}" ;;
  esac
  [ -s "$lp" ] || dlref "$u" "$lp" || continue
  rel=$(realpath --relative-to="assets/site/css" "$ROOT/$lp" | sed 's|\\|/|g')
  perl -pi -e "s{\Q$u\E(\?[0-9]+)?}{$rel}g" "$CSS"
  grep -qF "$u	$lp" "$WD/asset_map.tsv" || printf '%s\t%s\n' "$u" "$lp" >> "$WD/asset_map.tsv"
done
# 구글폰트 @import → 로컬
relg=$(realpath --relative-to="assets/site/css" "$ROOT/assets/gfonts/nanumgothic.css" | sed 's|\\|/|g')
perl -pi -e "s{(?:https?:)?//fonts\.googleapis\.com/earlyaccess/nanumgothic\.css}{$relg}g" "$CSS"
# 사이트 상대 url(/upload/...) → cdn 로컬 대응
perl -pi -e 's{url\((["\x27]?)/upload/}{url($1../../cdn/upload/}g' "$CSS"

echo "== 4) 새로 등장한 vendor CSS의 @import 재귀 (pretendard.css 등)"
for round in 1 2; do
  for css in $(find assets/vendor/css assets/vendor/fonts -name '*.css' -newer "$WD/asset_map.tsv" 2>/dev/null); do
    dir=$(dirname "$css")
    for u in $(grep -oE "https?://(vendor-cdn|cdn)\.imweb\.me/[^)\"' ]+" "$css" | sed -E 's/[?&][0-9]+$//' | sort -u); do
      case "$u" in *vendor-cdn*) lp="assets/vendor/${u#https://vendor-cdn.imweb.me/}" ;; *) lp="assets/cdn/${u#https://cdn.imweb.me/}" ;; esac
      [ -s "$lp" ] || dlref "$u" "$lp" || continue
      rel=$(realpath --relative-to="$dir" "$ROOT/$lp" | sed 's|\\|/|g')
      perl -pi -e "s{\Q$u\E(\?[0-9]+)?}{$rel}g" "$css"
    done
    # 상대 url() 폰트 파일 확보
    src=$(grep -P "\t$(echo "$css")$" "$WD/asset_map.tsv" | head -1 | cut -f1)
    [ -z "$src" ] && continue
    base="${src%/*}"
    for r in $(grep -oE "url\([^)]*\)" "$css" | sed -E "s/^url\(['\"]?//; s/['\"]?\)$//" | grep -vE '^(data:|https?:|//|#)' | sed -E 's/[?#].*$//' | sort -u); do
      abs="$base/$r"; while echo "$abs" | grep -q '/[^/]*/\.\./'; do abs=$(echo "$abs" | sed -E 's|/[^/]+/\.\./|/|'); done
      case "$abs" in *vendor-cdn*) lp="assets/vendor/${abs#https://vendor-cdn.imweb.me/}" ;; *cdn.imweb*) lp="assets/cdn/${abs#https://cdn.imweb.me/}" ;; *) continue ;; esac
      [ -s "$lp" ] || { dlref "$abs" "$lp" && printf '%s\t%s\n' "$abs" "$lp" >> "$WD/asset_map.tsv"; }
    done
  done
done

sort -u "$WD/asset_map.tsv" -o "$WD/asset_map.tsv"
echo "== 완료: custom.css $(stat -c%s "$CSS" 2>/dev/null)B, 잔여 외부참조 $(grep -cE 'imweb\.me|fonts\.(googleapis|gstatic)' "$CSS" 2>/dev/null)건"