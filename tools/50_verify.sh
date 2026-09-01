#!/bin/bash
# 50_verify.sh — 배포 전 검증 게이트
# 사용: bash tools/50_verify.sh [http://localhost:8811]
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${1:-http://localhost:8811}"
cd "$ROOT"
fail=0

echo "== 1) 잔여 imweb/instagram 참조 (0건이어야 함)"
n=$(grep -roE "imweb\.me|cdninstagram\.com" index.html [0-9a-z_]*/index.html backup/ data/ 2>/dev/null | grep -v "minddent.imweb.me/price" | wc -l)
echo "   잔여: $n"
[ "$n" -gt 0 ] && { grep -roE ".{20}(imweb\.me|cdninstagram\.com).{20}" index.html [0-9a-z_]*/index.html backup/ data/ 2>/dev/null | head -5; fail=1; }

echo "== 2) 전체 페이지 HTTP 응답 (서버 필요: $BASE)"
PAGES=". intro_mindone 79 41 43 front_tooth implant 40 37 42 83 price 39 23 84 85 86 104 105 82 106 121 107 108 109 110 111 112 113 114 115 116 117 118 119 admin"
for p in $PAGES; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/$p/")
  [ "$code" != "200" ] && { echo "   FAIL [$code] /$p/"; fail=1; }
done
echo "   페이지 응답 검사 완료"

echo "== 3) 필수 런타임/데이터 파일 존재"
for f in backup/js/stubs.js backup/js/fixups.js backup/js/overrides.js backup/js/popup.js backup/js/boards.js backup/js/partners.js backup/js/inquiry.js data/config.js data/overrides.js data/popups.js data/partners.js; do
  [ -s "$f" ] || { echo "   FAIL 누락: $f"; fail=1; }
done
for b in 86 104 105 106 107 108 109 110 111 112 113 114 115 116 117 118 119 121; do
  [ -s "data/boards/$b.js" ] || { echo "   FAIL 누락: data/boards/$b.js"; fail=1; }
done
echo "   파일 존재 검사 완료"

echo "== 4) 게시글 수 (66개)"
total=$(grep -h '"idx"' data/boards/*.js | grep -o '"idx"' | wc -l)
echo "   게시글: $total"
[ "$total" -ne 66 ] && fail=1

echo "== 5) HTML 파싱 무결성 (각 페이지 </html> 존재 + 크기)"
for f in index.html [0-9a-z_]*/index.html; do
  [ -f "$f" ] || continue
  tail -c 200 "$f" | grep -q "</html>" || { echo "   FAIL 끝 태그 없음: $f"; fail=1; }
done
echo "   HTML 무결성 검사 완료"

if [ "$fail" -eq 0 ]; then echo "== ✅ 전체 게이트 통과"; else echo "== ❌ 실패 항목 있음"; exit 1; fi