# 런타임 렌더러 사양 (backup/js/) — 구현 대상: overrides.js, popup.js, boards.js, partners.js, inquiry.js

바닐라 JS(ES5 호환 우선, jQuery는 페이지에 이미 로드되어 있으므로 사용 가능하나 의존 최소화).
모든 파일은 즉시실행 + 예외 안전(try/catch로 페이지 전체를 죽이지 않게).
스크립트는 각 페이지 `</body>` 직전에 이 순서로 주입되어 있음(파서 시점 동기 실행 = jQuery ready 핸들러들보다 먼저 실행됨):

```html
<script>window.__P='../';window.__PAGE='86';window.__BOARD='86';</script>
<script src='../data/config.js'></script>      <!-- window.__CONFIG -->
<script src='../data/overrides.js'></script>   <!-- window.__OVERRIDES -->
<script src='../backup/js/overrides.js'></script>
<!-- 홈에만: data/popups.js + backup/js/popup.js -->
<!-- 게시판 페이지에만: data/boards/<id>.js + backup/js/boards.js -->
<!-- /41에만: data/partners.js + backup/js/partners.js + backup/js/inquiry.js -->
```

전역 컨텍스트:
- `window.__P`: 사이트 루트로 가는 상대 접두어('' 또는 '../'). 데이터의 모든 에셋 경로는 루트 기준('assets/...', 'images/...')이므로 사용 시 `__P + path`.
- `window.__PAGE`: 페이지 키(예: '__home', '86', '41').
- `window.__BOARD`: 이 페이지가 렌더할 게시판 id(허브: 84→'86', 85→'112', 82→'105').

## 1) overrides.js
데이터: `window.__OVERRIDES[__PAGE]` = 객체. 키 형식:
- `"<elementId>"` → `{ "html": "<innerHTML>" }` : 해당 id 요소의 innerHTML 교체. (id 예: `w20230626...`, `text_w2023...`)
- `"<elementId>|img|<n>"` → `{ "src": "assets/... 또는 images/uploads/..." }` : `#<elementId>` 내부 n번째(0부터) `<img>`의 src 교체. 같은 요소가 `style` background-image를 쓰면(`._img_wrap`) `<img>` 대신 background-image가 있는 자식 요소 n번째의 style.backgroundImage 교체.
- `"<elementId>|hide"` → `true` : display:none.
동작: 문서 파싱 완료 직후 적용(DOMContentLoaded 대기 — body 끝이므로 즉시 실행해도 DOM은 존재. 즉시 적용해 깜빡임 최소화). src 교체 시 `__P` 접두. 존재하지 않는 id는 조용히 무시(콘솔 warn 1줄).

## 2) popup.js (홈 전용)
데이터: `window.__POPUPS` = 배열 `{id,image,link,width,left,top,start,end,enabled,hideDays}` (start/end는 'YYYY-MM-DD').
- KST 오늘 계산: `new Date(Date.now()+9*3600*1000).toISOString().slice(0,10)` — 뷰어 시간대 무관.
- 표시 조건: `enabled && start<=todayKST<=endKST` && localStorage `minddent:popup:<id>:hideUntil` (ms 타임스탬프)이 없거나 지났을 때.
- 마크업(원본 imweb과 동일 구조— 기존 정적 팝업은 CSS로 숨겨져 있으므로 새로 생성):
```html
<div class="popup-banner-wrap" id="backup-popups" style="display:block">
 <div id="popup_<id>" class="pop-container" style="z-index:1001;left:<left>px;right:auto!important;top:<top>px;position:fixed;">
  <div class="pop-item">
   <div class="pop-img">
    <a href="javascript:;" class="btl bt-times del" style="color:#979797"></a> <!-- 닫기 X -->
    <a [href=link target=_blank (link 있을 때만)]><img src="__P+image" style="width:<width>px;max-width:92vw"></a>
   </div>
   <div class="btn-group clearfix" style="width:<width>px;max-width:92vw">
    <a href="javascript:;" class="btn btn-flat">1일 동안 보지 않음</a>  <!-- hideDays 값 반영: 'N일 동안 보지 않음' -->
    <a href="javascript:;" class="btn btn-flat right">닫기</a>
   </div>
  </div>
 </div>
</div>
```
- `#backup-popups`는 head의 `.popup-banner-wrap{display:none}` 규칙을 이기도록 인라인 style 또는 별도 스타일로 표시 처리(자기 자신에게만).
- 모바일(≤767px): 주입 스타일로 `left:50%!important;transform:translateX(-50%);top:70px!important;` + img width:100% 처리.
- 'N일 동안 보지 않음' 클릭: hideUntil = now + hideDays*86400000 저장 후 제거. '닫기'/X: 제거만.
- 여러 팝업이면 z-index 1001+i, left 값이 같으면 top을 40px씩 계단 배치.

## 3) boards.js (게시판 페이지)
데이터: `window.__BOARDS[__BOARD]` = `{boardId,title,posts:[{idx,title,thumb,bodyHtml}]}` (posts[0]=최신, 목록 표시 순서).
대상 DOM: `div.list-style[id^="post_card_"]`가 있는 `.widget.board._list_wrap` (페이지당 1개).
모드: `new URLSearchParams(location.search)` → `bmode==='view' && idx` 있으면 상세, 아니면 목록. 알 수 없는 idx → 목록 모드로.

### 목록 모드
- 기존 `.list-style` 안의 첫 `.ma-item._post_item_wrap` 노드를 template으로 clone 후, 컨테이너 비우고 posts 순서대로 카드 생성:
  - 링크(`a.post_link_wrap` 또는 카드 내 모든 `<a>`): `href='?bmode=view&idx='+idx`
  - 썸네일: 카드 내 background-image를 가진 요소(`._img_wrap` 등)의 style.backgroundImage=`url(__P+thumb)`, `data-bg`/`data-src` 속성도 동일 값으로 갱신(imweb lazyload 대비)
  - 제목: `.title` 요소의 텍스트 교체(내부 구조 유지)
- 원본 카드에 `style="display:none"`이 있어도 그대로 복제(이후 imweb 게시판 init이 레이아웃/표시 처리 — 우리 스크립트가 ready 이전에 실행되므로 자연스럽게 처리됨). 만약 검증 중 카드가 안 보이면 render 후 `display:''`로 강제.
- 템플릿 카드가 없으면(글 0개 게시판) `_workdir/templates/board_card_86.html` 구조를 축약한 내장 문자열 사용.
- 페이지네이션: 만들지 않음(전체 나열 — 현 운영과 동일).

### 상세 모드
- `_workdir/templates/post_view.html`(원본 상세 마크업)을 참고해 동일 구조의 HTML 문자열을 생성해 `.widget.board._list_wrap`의 innerHTML 교체:
  - `<div class='board_view'>` > `.board-title.holder.header` > `<h1 class="view_tit">제목</h1>`
  - `.board_summary` > `.board_name` 링크: 텍스트=게시판 title, href='./'
  - 본문: `<div class="board_txt_area"><div class="custom-text-info _text_editor fr-view">bodyHtml</div></div>` — bodyHtml 삽입 전 문자열 치환으로 `src="assets/` → `src="__P+assets/`, `src="images/` → `src="__P+images/` (작은따옴표 변형 포함).
  - `.list_tap`: 인접 글 링크 — 이전(더 최신, i-1): `icon-arrow-up`, 다음(i+1): `icon-arrow-down`, 각각 제목 + `?bmode=view&idx=`. 없으면 생략. (원본은 인접글만 노출)
  - `.table_bottom.action-area`: `목록` 버튼 → href='./'
- `document.title = 제목 + ' : 광주 마인드원치과의원'`.
- 원본 상세의 파일영역/댓글영역은 빈 상태 그대로 생략 가능(빈 마크업 포함해도 무방).
- 스크롤 상단 이동 불필요(전체 리로드 방식).

## 4) partners.js (/41 전용)
데이터: `window.__PARTNERS`:
```js
{ targets: { featured:[wid1,wid2], logos:[wid3,wid4] },   // PC/모바일 위젯 래퍼 id
  featured: [{name,desc,logo}], logos: [{name,logo}] }
```
- 각 target id의 요소가 DOM에 있으면: 내부 `.gallery2` 컨테이너에서 첫 `._item.item_gallary`를 template clone → 컨테이너 비우고 데이터 순서로 재생성:
  - bg 요소(`.img_wrap._img_wrap`): style.backgroundImage=`url(__P+logo)`, data-bg 갱신, data-src는 동일 값
  - caption(`h4`)=name, `p`=desc (없으면 빈 문자열)
  - 각 item의 `data-sub-html`/`id`(caption id) 등 원본 고유 id 속성은 순번 기반으로 재부여(caption_bk_0 등) 하고 참조 일치시킴
- 아이템 수 변화 대응: 그대로 전부 삽입(36개 초과 숨김/더보기는 imweb gallery init이 config대로 처리 — 우리 코드는 ready 이전 실행이므로 관여하지 않음).

## 5) inquiry.js (/41 전용)
- 대상: 문의 폼 위젯(참고: `_workdir/templates/form_41.html`). 필드: 업체명, 담당자명, 연락처(tel 3분할 input), 이메일, 문의사항(textarea), 개인정보 동의 체크박스. 제출 버튼: `a._input_form_submit`.
- 버튼에 capture 단계 클릭 리스너 등록 + `stopImmediatePropagation`/`preventDefault`로 imweb SITE_FORM 동작 차단. (버튼의 onclick 속성 제거도 병행)
- 검증(한국어 alert): 업체명/담당자명/연락처/문의사항 비어있으면 "OO을(를) 입력해주세요."; 동의 체크 안 됐으면 "개인정보 수집 및 이용에 동의해주세요."
- 제출 처리:
  1. `__CONFIG.formspreeEndpoint`가 비어있지 않으면: `fetch(endpoint, {method:'POST', headers:{'Accept':'application/json','Content-Type':'application/json'}, body: JSON.stringify({업체명, 담당자명, 연락처, 이메일, 문의사항})})` → ok면 alert('문의가 정상적으로 접수되었습니다. 감사합니다.') + 폼 리셋. 실패 시 2번 폴백.
  2. 폴백 모달(직접 스타일 주입, 아임웹 룩과 무난하게 어울리는 심플 흰 카드 + 반투명 배경):
     - 안내문: "아래 내용을 복사해 minddent@naver.com 으로 보내주시면 빠르게 답변드리겠습니다."
     - `<textarea readonly>`에 구성된 문의 내용(제목: [제휴 협약 문의] 업체명 / 본문: 각 필드 라벨: 값 줄바꿈)
     - 버튼 3개: "내용 복사"(navigator.clipboard, 실패 시 textarea select+execCommand 폴백, 성공 시 버튼 텍스트 '복사됨!'), "메일 앱으로 보내기"(`location.href='mailto:minddent@naver.com?subject=..&body=..'` encodeURIComponent), "닫기".
- 전화 3분할 값은 '-' 조인.

## 공통 품질 기준
- 각 파일 상단 주석으로 데이터 스키마 요약.
- 콘솔 에러 0 (없는 요소는 조용히 skip).
- 문자열/DOM 조작만 사용, document.write 금지, 외부 네트워크 요청 금지(formspree 제출 제외).
