#!/bin/bash
# 55_compare.sh — 미러 페이지와 원본 페이지의 "레이아웃에 영향을 주는 요소" 정합성 비교
# 브라우저 없이 HTML 구조 수준에서 차이를 잡아낸다.
# 사용: bash tools/55_compare.sh [로컬주소]
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL="${1:-http://localhost:8811}"
ORIG="https://minddent.imweb.me"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
TMP="$ROOT/_workdir/cmp"; mkdir -p "$TMP"
cd "$ROOT"

PAGES="__home:/ intro_mindone:/intro_mindone 79:/79 41:/41 43:/43 front_tooth:/front_tooth implant:/implant 40:/40 37:/37 42:/42 83:/83 price:/price 39:/39 23:/23 84:/84 85:/85 86:/86 104:/104 105:/105 82:/82 106:/106 121:/121 107:/107 108:/108 109:/109 110:/110 111:/111 112:/112 113:/113 114:/114 115:/115 116:/116 117:/117 118:/118 119:/119"

printf "%-15s %8s %8s  %8s %8s  %7s %7s  %s\n" 페이지 위젯M 위젯O 섹션M 섹션O 인라인M 인라인O 판정
fail=0
for entry in $PAGES; do
  key="${entry%%:*}"; path="${entry##*:}"
  lpath="$path"; [ "$key" = "__home" ] && lpath="/"
  [ "$key" != "__home" ] && lpath="$path/"
  curl -sSL -A "$UA" -o "$TMP/o.html" "$ORIG$path"
  curl -sS  -o "$TMP/m.html" "$LOCAL$lpath"

  # 레이아웃 결정 요소: 위젯 수, 섹션 수, 인라인 style 속성 수, <style> 블록 길이 합
  wm=$(grep -o 'data-type="widget"' "$TMP/m.html" | wc -l); wo=$(grep -o 'data-type="widget"' "$TMP/o.html" | wc -l)
  sm=$(grep -o 'class="section_wrap' "$TMP/m.html" | wc -l); so=$(grep -o 'class="section_wrap' "$TMP/o.html" | wc -l)
  im=$(grep -o 'style="' "$TMP/m.html" | wc -l); io=$(grep -o 'style="' "$TMP/o.html" | wc -l)
  # <style> 블록 내 CSS 총량(공백 제거) — 폰트/여백 규칙 누락 탐지
  cm=$(perl -0777 -ne 'my $t=0; while(m{<style[^>]*>(.*?)</style>}gs){ my $x=$1; $x=~s/\s+//g; $t+=length($x)} print $t' "$TMP/m.html")
  co=$(perl -0777 -ne 'my $t=0; while(m{<style[^>]*>(.*?)</style>}gs){ my $x=$1; $x=~s/\s+//g; $t+=length($x)} print $t' "$TMP/o.html")
  diffcss=$(( cm > co ? cm - co : co - cm ))
  verdict="OK"
  [ "$wm" != "$wo" ] && { verdict="위젯수 불일치"; fail=1; }
  [ "$sm" != "$so" ] && { verdict="$verdict/섹션수"; fail=1; }
  [ "$diffcss" -gt 2000 ] && { verdict="$verdict/CSS차이${diffcss}"; fail=1; }
  printf "%-15s %8s %8s  %8s %8s  %7s %7s  %s\n" "$key" "$wm" "$wo" "$sm" "$so" "$im" "$io" "$verdict"
done
[ "$fail" -eq 0 ] && echo "== ✅ 전 페이지 구조 일치" || echo "== ⚠️ 차이 있는 페이지 확인 필요"