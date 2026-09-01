# 광주 마인드원치과의원 — 홈페이지 백업 사이트

minddent.imweb.me 홈페이지의 완전한 정적 백업본입니다. 아임웹과 무관하게 독립적으로 온라인 서비스됩니다.

- **사이트 주소**: https://terry-off.github.io/mindone_backup/
- **관리자 페이지**: https://terry-off.github.io/mindone_backup/admin/

## 최초 1회 설정 — GitHub Pages 켜기

저장소 **Settings → Pages** ( https://github.com/Terry-off/mindone_backup/settings/pages ) 에서:

1. **Source**: `Deploy from a branch` 선택
2. **Branch**: `main` / 폴더 `/ (root)` 선택 → **Save**

저장 후 몇 분 뒤 https://terry-off.github.io/mindone_backup/ 으로 접속됩니다 (HTTPS 자동 적용).

## 관리자 페이지 사용법

1. `admin/` 페이지 접속 → GitHub 계정(Terry-off), 저장소(mindone_backup), 토큰 입력
2. 토큰 발급 방법: 관리자 로그인 화면의 "토큰 발급 방법 안내" 참고 (admin/help/)
   - Fine-grained token, 이 저장소만, **Contents: Read and write** 권한
3. 기능:
   - **팝업 관리**: 메인화면 팝업 등록/수정/삭제, 표시 기간 설정, 'N일 동안 보지 않음'
   - **실제사례 관리**: 심미 10개 + 임플란트 8개 게시판에 원본과 같은 형식으로 글 등록/수정/삭제
   - **협약기관 관리**: 대표 협약기관(이름/설명/로고) + 로고 그리드 등록/삭제/순서 변경
   - **페이지 편집**: 모든 페이지의 텍스트·이미지를 클릭해서 수정 (PC/모바일 동시 적용)
   - **설정**: 문의 메일 자동발송(Formspree) 연결, 이전 버전 복원
4. 수정 후 반드시 **[게시하기]** 를 눌러야 실제 사이트에 반영됩니다 (보통 1~3분, 최대 10분).

## 제휴 협약 문의 메일

`/41/` 페이지의 문의하기는 기본적으로 방문자에게 minddent@naver.com 안내(내용 복사 + 메일 앱 열기)를 제공합니다.
Formspree(https://formspree.io) 무료 가입 후 관리자 설정 탭에 엔드포인트를 입력하면 **자동 발송**으로 전환됩니다.

## 구조/재미러

`tools/README.md` 참고. 원본 사이트가 갱신되면 재미러 파이프라인으로 다시 수집할 수 있습니다.

## 주의

- 이 저장소는 Public입니다(무료 GitHub Pages 조건). 사이트에 이미 공개된 콘텐츠만 포함되지만,
  git 특성상 한 번 커밋된 사진은 이력에 영구 보존됩니다(완전 삭제는 이력 재작성 필요).
- 전 페이지에 `noindex`가 설정되어 검색엔진에 노출되지 않습니다(원본 운영 중 중복 노출 방지).
  백업을 정식 사이트로 전환할 때 해제 방법은 `tools/README.md` 참고.
