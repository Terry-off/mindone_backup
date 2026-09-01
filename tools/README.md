# 백업 사이트 도구 안내 (tools/)

이 폴더는 minddent.imweb.me 를 정적 백업으로 만드는 파이프라인입니다.
실행 환경: Windows + Git Bash (curl, perl 내장 — 별도 설치 불필요)

## 파이프라인 순서
```bash
bash tools/crawl.sh        # 1. 원본 크롤 (35페이지 + 게시글) → _workdir/raw/
bash tools/10_assets.sh    # 2. 에셋 수집·다운로드 (cdn/vendor-cdn/인스타) → assets/
bash tools/15_fix_assets.sh# 3. 실패 다운로드 보정
perl tools/30_extract.pl   # 4. 게시글/협약/팝업 → data/*.js (주의: 기존 data를 덮어씀!)
perl tools/20_build.pl     # 5. 페이지 빌드 (URL 재작성, SDK 제거, 런타임 주입)
bash tools/50_verify.sh    # 6. 검증 게이트
```

## 재미러 절차 (원본 사이트가 갱신됐을 때)
1. **주의**: `perl tools/30_extract.pl` 은 data/boards, data/partners.js, data/popups.js 를
   원본 사이트 기준으로 다시 만듭니다. **관리자 페이지로 등록한 글이 있다면 먼저 백업**하세요
   (git 이력에 남아 있으므로 `git log -- data/` 에서 복원 가능).
   data/overrides.js (텍스트/이미지 수정분)는 extract가 건드리지 않지만,
   위젯 id가 바뀐 페이지에서는 수정분이 적용되지 않을 수 있으니 재확인하세요.
2. crawl → assets → extract → build → verify 순서로 재실행.
3. `git diff` 로 변경분 확인 후 커밋·푸시.

## 로컬 미리보기
```powershell
powershell -File tools/serve.ps1   # http://localhost:8811/
```

## 검색엔진 노출 전환 (원본 사이트 운영 종료 후 백업을 정식 사이트로 쓸 때)
모든 페이지에 noindex 메타태그가 들어 있습니다. 해제하려면 Git Bash에서:
```bash
perl -pi -e 's{<meta name="robots" content="noindex, nofollow">\n?}{}' index.html */index.html
```
실행 후 커밋·푸시하면 검색엔진에 노출됩니다.

## 구조 요약
- `index.html`, `<페이지>/index.html` : 미러된 정적 페이지 (원본 마크업 그대로, 수정 금지 — 수정은 data/overrides.js 로)
- `assets/` : 원본 CDN 에셋 전체 로컬 사본
- `data/*.js` : 관리자 페이지가 수정하는 콘텐츠 데이터 (팝업/게시글/협약/수정분/설정)
- `backup/js/` : 백업 사이트 전용 런타임 (게시판/팝업/협약/문의 렌더러)
- `admin/` : 관리자 페이지 (GitHub 토큰으로 로그인)
- `_workdir/` : 파이프라인 중간 산출물 (raw 크롤은 git 제외)