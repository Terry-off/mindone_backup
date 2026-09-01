#!/bin/bash
# crawl.sh — minddent.imweb.me 원본 HTML 수집
# 산출물: _workdir/raw/pages/<key>.html, _workdir/raw/posts/<board>-<idx>.html
set -u
BASE="https://minddent.imweb.me"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW="$ROOT/_workdir/raw"
mkdir -p "$RAW/pages" "$RAW/posts"

fetch() { # $1=url $2=outfile
  local code
  code=$(curl -sSL -A "$UA" -H "Accept-Language: ko-KR,ko;q=0.9" -o "$2" -w "%{http_code}" "$1")
  local size=$(stat -c%s "$2" 2>/dev/null || echo 0)
  echo "[$code] $(basename "$2") ${size}B  $1"
  if [ "$code" != "200" ] || [ "$size" -lt 1000 ]; then
    echo "RETRY $1"
    sleep 2
    code=$(curl -sSL -A "$UA" -H "Accept-Language: ko-KR,ko;q=0.9" -o "$2" -w "%{http_code}" "$1")
    echo "[retry:$code] $(basename "$2") $(stat -c%s "$2" 2>/dev/null || echo 0)B"
  fi
  sleep 0.4
}

# 0) sitemap + rss (교차 검증용)
fetch "$BASE/sitemap.xml" "$RAW/sitemap.xml"
fetch "$BASE/rss" "$RAW/rss.xml"

# 1) 메뉴 페이지 35개 (홈은 key=__home)
PAGES="__home intro_mindone 79 41 43 front_tooth implant 40 37 42 83 price 39 23 84 85 86 104 105 82 106 121 107 108 109 110 111 112 113 114 115 116 117 118 119"
for p in $PAGES; do
  if [ "$p" = "__home" ]; then url="$BASE/"; else url="$BASE/$p"; fi
  fetch "$url" "$RAW/pages/$p.html"
done

# 2) 실제 게시판 18개의 목록 HTML에서 idx 열거 → 상세 크롤
BOARDS="86 104 105 106 121 107 108 109 110 111 112 113 114 115 116 117 118 119"
> "$RAW/post_index.txt"
for b in $BOARDS; do
  # 목록 페이지에서 bmode=view 링크의 idx 추출 (페이지 2 이상 대비 page 파라미터도 시도)
  idxs=$(grep -oE 'idx=[0-9]+' "$RAW/pages/$b.html" | sort -u | sed 's/idx=//')
  # 페이지네이션 링크가 있으면 추가 페이지도 수집
  npages=$(grep -oE '\?[^"]*page=[0-9]+' "$RAW/pages/$b.html" | grep -oE 'page=[0-9]+' | sed 's/page=//' | sort -un | tail -1)
  if [ -n "${npages:-}" ] && [ "$npages" -gt 1 ]; then
    for pg in $(seq 2 "$npages"); do
      fetch "$BASE/$b/?page=$pg" "$RAW/pages/$b-page$pg.html"
      idxs="$idxs
$(grep -oE 'idx=[0-9]+' "$RAW/pages/$b-page$pg.html" | sort -u | sed 's/idx=//')"
    done
  fi
  for i in $(echo "$idxs" | sort -u | grep -E '^[0-9]+$'); do
    echo "$b $i" >> "$RAW/post_index.txt"
  done
done
sort -u "$RAW/post_index.txt" -o "$RAW/post_index.txt"
echo "== post count: $(wc -l < "$RAW/post_index.txt")"

while read -r b i; do
  [ -f "$RAW/posts/$b-$i.html" ] && continue
  fetch "$BASE/$b/?bmode=view&idx=$i&t=board" "$RAW/posts/$b-$i.html"
done < "$RAW/post_index.txt"

echo "== CRAWL DONE: pages=$(ls "$RAW/pages" | wc -l) posts=$(ls "$RAW/posts" | wc -l)"
