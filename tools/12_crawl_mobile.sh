#!/bin/bash
# 12_crawl_mobile.sh — 모바일 UA로 각 페이지를 다시 크롤
# 아임웹은 UA에 따라 인라인 CSS(위젯 여백/폰트/높이)를 다르게 내려주므로,
# 데스크톱 버전만 미러링하면 모바일에서 여백·글자 간격이 어긋난다.
set -u
BASE="https://minddent.imweb.me"
UA="Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/_workdir/raw/mobile"
mkdir -p "$OUT"

PAGES="__home intro_mindone 79 41 43 front_tooth implant 40 37 42 83 price 39 23 84 85 86 104 105 82 106 121 107 108 109 110 111 112 113 114 115 116 117 118 119"
for p in $PAGES; do
  if [ "$p" = "__home" ]; then url="$BASE/"; else url="$BASE/$p"; fi
  code=$(curl -sSL -A "$UA" -H "Accept-Language: ko-KR,ko;q=0.9" -o "$OUT/$p.html" -w "%{http_code}" "$url")
  sz=$(stat -c%s "$OUT/$p.html" 2>/dev/null || echo 0)
  echo "[$code] $p ${sz}B"
  [ "$code" != "200" ] || [ "$sz" -lt 1000 ] && { sleep 2; curl -sSL -A "$UA" -o "$OUT/$p.html" "$url"; }
  sleep 0.3
done
echo "== 모바일 크롤 완료: $(ls "$OUT" | wc -l)개"