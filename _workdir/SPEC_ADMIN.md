# 관리자 페이지 사양 (admin/) — 파일 분담과 공통 계약

바닐라 JS SPA. 전부 한국어 UI. 외부 라이브러리/CDN 금지(오프라인 백업 원칙). 대상 사용자: 비개발자(치과 원장/직원).
파일 구성:
```
admin/index.html      — 셸: 로그인 화면 + 탭 네비 + 각 탭 컨테이너 + 저장대기/게시 바
admin/css/admin.css   — 전체 스타일(깔끔한 화이트+포인트컬러 #ff6000 계열, 반응형)
admin/js/github-api.js— GitHub API 계층 (아래 계약 고정)
admin/js/app.js       — 셸 로직: 로그인/탭 전환/저장대기 목록/게시하기/상태 표시
admin/js/tab-popup.js — 팝업 관리 탭
admin/js/tab-board.js — 실제사례 관리 탭
admin/js/tab-partner.js — 협약기관 관리 탭
admin/js/tab-editor.js  — 페이지 편집(사진·텍스트) 탭
admin/js/tab-settings.js— 설정 탭
admin/help/index.html — PAT 발급/재발급 한국어 가이드(독립 페이지, 단계별 텍스트+링크)
```
index.html은 위 js를 순서대로 로드: github-api → app → tab-*.js. 각 tab 파일은 `window.AdminTabs.register(id, {title, render(el), onShow()})` 로 등록(계약은 app.js가 정의, 아래 참조).

## 저장/게시 모델 (중요 — GitHub Pages 빌드 제한 대응)
- 모든 수정은 즉시 커밋하지 않고 **저장 대기 목록(스테이징)** 에 쌓는다.
- 상단 고정 바: "저장 대기 N건 · [게시하기] · 상태표시". 게시하기 1회 = 커밋 1개(Git Data API).
- 게시 후: Pages 빌드 상태 폴링 → "게시 중(빌드) → 반영 확인 중 → 반영 완료 ✓". 안내문구: "보통 1~3분, 최대 10분 걸립니다."

## github-api.js 계약 (다른 탭 파일이 이 API만 사용)
```js
window.GH = {
  // 설정
  configure({owner, repo, branch='main', token}), isConfigured(), 
  autoDetect(), // location에서 owner/repo 유추: <owner>.github.io / <repo>/admin/... file://면 null 반환
  validateToken(), // GET /repos/:o/:r → {ok, error(한국어)}

  // 읽기 (항상 원격 최신)
  readText(path),   // Accept: application/vnd.github.raw+json (1MB 초과 파일도 OK) → string (UTF-8 디코드)
  readJsData(path), // data/*.js 파일을 읽어 'window.__X = {...};' 에서 JSON 부분만 파싱해 반환
                    // 규칙: 첫 '=' 이후 ~ 마지막 ';' 이전을 JSON.parse. (data 파일은 JSON.parse 가능한 순수 JSON으로 저장 유지)
  // 스테이징
  stageText(path, string, label),     // label: 저장대기 목록에 보여줄 한국어 설명
  stageBinary(path, uint8array, label),
  stageDelete(path, label),
  stagedList(), unstage(path), clearStaged(),
  // 게시
  publish(message) // 흐름: GET ref(heads/branch) → GET commit → POST blobs(병렬 아님, 순차; base64) →
                   // POST tree(base_tree) → POST commit(parents:[head]) → PATCH ref.
                   // 409/422: head 재취득 후 1회 재시도. 재실패 시 throw '다른 곳에서 수정되었습니다...'
                   // → {commitSha}
  ,pollPagesBuild(onStatus) // GET /repos/:o/:r/pages/builds/latest 5초 간격 최대 3분 → onStatus('building'|'built'|'errored')
  ,verifyDeployed(path, expectedContent, onStatus) // fetch(siteBase+path+'?v='+Date.now()) 15초 간격 최대 10분
  // 복원
  ,listCommits(path, n=5) // [{sha, date, message}]
  ,readTextAt(path, sha)
};
```
- 인코딩: 문자열→UTF-8 bytes(TextEncoder)→base64(청크 btoa). 한글 깨짐 금지.
- 모든 오류는 한국어 메시지로 throw: 401 "토큰이 만료되었거나 권한이 없습니다. 설정 탭에서 토큰을 재발급해 주세요.", 403(rate) "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.", 네트워크 "인터넷 연결을 확인해주세요.", 409 "다른 곳에서 수정되었습니다. 새로고침 후 다시 시도해주세요."
- 토큰 저장: localStorage 'minddent:admin:token' (또는 '이 컴퓨터에 저장 안 함' 체크 시 sessionStorage).

## 데이터 파일 왕복 규칙
data/*.js는 항상 이 형태로 다시 쓴다(런타임과 file:// 호환 유지):
```
window.__POPUPS = <JSON.stringify(data, null, 2)>;
window.__BOARDS = window.__BOARDS || {};
window.__BOARDS["86"] = <JSON>;
window.__PARTNERS = <JSON>;
window.__OVERRIDES = <JSON>;
window.__CONFIG = <JSON>;
```
(boards 파일은 두 줄 구조 유지. readJsData는 마지막 '=' 기준 파싱.)

## 이미지 업로드 공통 유틸 (app.js에 구현, window.AdminUtil)
- `pickImage({maxW=1600, quality=0.85}) → Promise<{bytes:Uint8Array, ext:'jpg', previewUrl}>`
  - input[type=file] accept="image/*" → createImageBitmap(또는 Image+canvas) → 긴 변 maxW 이하로 리사이즈 → JPEG 재인코딩.
  - PNG 로고처럼 투명도가 필요한 경우 옵션 {keepPng:true} → 리사이즈만, PNG 유지.
  - 디코드 실패(HEIC 등): alert "이미지를 읽을 수 없습니다. JPG 또는 PNG로 저장한 후 다시 올려주세요."
  - 저장 경로 규칙: `images/uploads/<용도>-<yyyymmddHHMMSS>.<ext>` (용도: popup, post, thumb, logo, page)
- `dateInput(value)` 등 소형 헬퍼 자유.

## 각 탭 사양
### 1. 팝업 관리 (tab-popup.js)
- 로드 시 GH.readJsData('data/popups.js') → 카드 목록(썸네일, 기간, 상태 뱃지 '표시중/기간외/사용안함').
- 새 팝업/수정 폼: 이미지(업로드, 필수), 링크 URL(선택), 표시 시작일/종료일(date input), 사용 여부(체크), 'N일 동안 보지 않음'의 N(숫자, 기본 1), 위치 left/top(숫자, 기본 550/100), 너비(숫자, 기본 501).
- 미리보기 버튼: 관리자 화면 위에 실제 마크업(SPEC_RUNTIME의 popup.js와 동일 구조)으로 오버레이 렌더.
- 삭제: confirm("팝업을 삭제할까요?").
- 저장 → stageText('data/popups.js', ...) (+ 새 이미지 stageBinary). id는 'p'+Date.now().

### 2. 실제사례 관리 (tab-board.js)
- 게시판 선택 셀렉트(그룹 2개):
  예쁜앞니치료 실제사례: 86 슬림네이트, 104 비교정 스마일라인치료, 105 치아교정, 106 앞니 재생복구치료, 121 깨진 앞니 치료, 107 앞니 공간치료, 108 앞니 충치치료, 109 앞니 올세라믹, 110 치아미백, 111 치아성형/잇몸성형
  고난도임플란트 실제사례: 112 전체 임플란트, 113 임플란트 복합치료, 114 원데이 임플란트, 115 앞니 심미 임플란트, 116 상악동거상술 임플란트, 117 뼈재생 임플란트, 118 신경관 가까운 임플란트, 119 임플란트 틀니
- 글 목록: 썸네일 미리보기(60px), 제목, [수정][삭제][↑][↓]. 순서변경은 배열 순서 조작.
- 글 편집기:
  - 제목 input
  - 썸네일: 업로드 → images/uploads/thumb-<ts>.jpg (미리보기 표시)
  - 본문: `contenteditable` div (class="fr-view" 스타일 시뮬레이션: 최대폭 700px, 중앙, 문단 가운데정렬 기본)
    - 툴바: [사진 삽입] [구분선] [가운데/왼쪽 정렬] [사례 템플릿 삽입] 만 제공(단순!)
    - 붙여넣기: 'paste' 이벤트 가로채 text/plain만 삽입
    - [사진 삽입]: AdminUtil.pickImage → images/uploads/post-<ts>.jpg 스테이징 + `<p style="text-align:center;"><img class="fr-dib fr-draggable" src="images/uploads/post-<ts>.jpg" style="width:100%;max-width:720px"></p>` 삽입
    - [사례 템플릿 삽입]: 아래 구조 삽입(기존 글과 같은 흐름):
      `<p style="text-align:center;">안녕하세요.<br>예쁜앞니, 고난도임플란트 전문<br>마인드원치과입니다.</p><hr><p style="text-align:center;">(환자분 상황 설명을 입력하세요)</p><p style="text-align:center;">[BEFORE 사진을 여기에 삽입]</p><p style="text-align:center;">(치료 과정 설명을 입력하세요)</p><p style="text-align:center;">[AFTER 사진을 여기에 삽입]</p><p style="text-align:center;">(치료 결과와 마무리 인사를 입력하세요)</p>`
  - 저장 시: bodyHtml = editor.innerHTML (src의 __P 접두 제거 → 루트상대 유지 확인), 새 글 idx='n'+Date.now(), posts 배열 맨 앞 또는 선택 위치.
  - 미리보기 버튼: 새 탭/오버레이에 fr-view 스타일로 본문 렌더.
- 저장 → stageText('data/boards/<id>.js') (+이미지들). 삭제 시 이미지 파일은 남겨둠(이력 보존, 단순화).

### 3. 협약기관 관리 (tab-partner.js)
- GH.readJsData('data/partners.js').
- 섹션 1 "대표 협약 기업·협회"(featured): 목록(로고, 이름, 설명) CRUD + 순서. 로고 업로드 {keepPng:true}.
- 섹션 2 "협약 로고 그리드"(logos): 로고 썸네일 그리드 CRUD + ↑/↓. 
- targets 배열은 절대 수정하지 않고 그대로 보존.
- 저장 → stageText('data/partners.js').

### 4. 페이지 편집 (tab-editor.js)
- 페이지 셀렉트(한국어 제목):
  __home 홈(메인), intro_mindone 마인드원치과 소개, 79 전문의료진 소개, 41 업무협약 안내, 43 International Patient Services, front_tooth 예쁜앞니치료 전문, implant 고난도임플란트 전문, 40 슬림네이트, 37 수면 임플란트, 42 다심 임플란트 멤버십, 82 치아교정, 83 보톡스·턱관절치료, price 비급여수가안내, 39 리뷰이벤트 (+ 게시판 페이지들은 "게시판 페이지는 '실제사례 관리' 탭에서 글을 관리하세요" 안내와 함께 셸만 편집 가능)
- iframe: src = '../' + (key==='__home' ? '' : key+'/') — 같은 출처이므로 DOM 접근 가능. file://에서는 iframe 접근이 막힐 수 있으니 실패 시 안내문 표시.
- 상단 토글: [PC 1280px] [모바일 375px] — iframe width 변경(높이 70vh 고정, 축소 스케일 transform 사용 가능).
- 편집 모드 스크립트(iframe.onload 후 부모에서 주입):
  - 대상 요소: (a) 텍스트: `[id^="text_w"]`, 그리고 `div[data-type="widget"]` 내부의 `.widget_text_wrap` — id 있는 쪽 기준. (b) 이미지: `div[data-type="widget"] img` 및 background-image를 가진 `._img_wrap`.
  - hover 시 아웃라인(2px dashed #ff6000) + 클릭 시:
    - 텍스트 → contenteditable=true로 인라인 편집. blur 시 원본과 달라졌으면 변경 기록.
    - 이미지 → 파일 선택 → 미리보기 즉시 교체 + 변경 기록 {targetId|img|n, src:업로드경로}. background형이면 동일 규칙.
  - 변경 기록 시 PC/모바일 쌍 자동 감지: 문서 내 다른 text 위젯 중 "원본 normalize(공백·태그 제거) 텍스트가 동일"한 위젯을 찾아, 있으면 체크박스 기본 ON "모바일(또는 PC) 버전에도 동일하게 적용" — ON이면 그 위젯 id에도 같은 변경 기록.
- 하단: 변경 목록(요소별 텍스트 미리보기 30자) + [변경 취소] + [저장(대기목록에 추가)].
- 저장: 기존 data/overrides.js 읽기 → __OVERRIDES[pageKey]에 병합 → stageText. 이미지 업로드는 stageBinary.
- 안내 배너: "수정 후 [게시하기]를 눌러야 실제 사이트에 반영됩니다."

### 5. 설정 (tab-settings.js)
- GitHub 연결: owner/repo(자동감지 값 표시, 수정 가능), 토큰 입력(password type, 저장 위치 선택), [연결 테스트].
- 문의 메일 자동발송: Formspree 엔드포인트 URL 입력 + 설명("https://formspree.io 에서 무료 가입 후 폼 생성 → 엔드포인트 주소를 붙여넣으세요. 비워두면 방문자에게 메일 앱/복사 안내가 표시됩니다.") → data/config.js 스테이징.
- 복원: 파일 선택 셀렉트(data/popups.js, data/partners.js, data/overrides.js, data/config.js, data/boards/*.js 전체) → [이전 버전 보기] → 최근 5개 커밋 목록(날짜/메시지) → [이 버전으로 복원](해당 시점 내용을 스테이징).
- 도움말 링크 → help/index.html.

## 로그인/셸 (app.js + index.html)
- 최초 진입: 토큰 없으면 로그인 화면(토큰 입력 + 저장위치 선택 + '토큰 발급 방법' 링크→help). validateToken 성공 시 메인.
- 상단 바: 사이트명 "마인드원치과 백업 사이트 관리자" / 탭: 팝업 관리 · 실제사례 관리 · 협약기관 관리 · 페이지 편집 · 설정 / 우측: 저장 대기 N건 · [게시하기].
- 게시하기: confirm 목록 표시("다음 N건을 게시합니다") → GH.publish('관리자 게시: ' + 요약) → 진행 상태 토스트/배너 → 완료 시 "반영 완료! 사이트에서 확인하세요" + 사이트 링크.
- 나가기 전 대기 목록 있으면 beforeunload 경고.
- file://로 열린 경우: 상단에 노란 배너 "로컬 파일로 열렸습니다. 게시 기능은 인터넷 연결과 GitHub 설정이 필요합니다." (읽기/편집 UI는 동작 시도)

## help/index.html
- 단계별 한국어 가이드: 1) github.com 로그인 → 2) Settings > Developer settings > Personal access tokens > Fine-grained tokens → 3) Generate new token: 이름 'minddent-admin', 만료 최장(1년), Repository access: Only select repositories → 백업 저장소 선택, Permissions: Contents Read and write → 4) 생성된 토큰 복사 → 관리자 설정에 붙여넣기. + 만료 시 증상(401)과 재발급 안내. + 주의: 토큰은 비밀번호처럼 취급.
