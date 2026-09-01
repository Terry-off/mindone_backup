/*!
 * overrides.js — 페이지별 콘텐츠 오버라이드 적용기
 *
 * 데이터 스키마: window.__OVERRIDES[__PAGE] = {
 *   "<elementId>"          : { html: "<innerHTML 문자열>" },
 *     // 해당 id 요소의 innerHTML을 통째로 교체
 *   "<elementId>|img|<n>"  : { src: "assets/... 또는 images/uploads/..." },
 *     // #<elementId> 내부 n번째(0-based) <img>의 src 교체.
 *     // <img>가 없고 background-image 방식(._img_wrap 등)이면 해당 n번째 요소의
 *     // style.backgroundImage 교체(존재 시 data-bg/data-src도 함께 갱신, lazyload 대비)
 *   "<elementId>|hide"     : true
 *     // 해당 id 요소 display:none 처리
 * }
 *
 * 실행 시점: </body> 직전, 문서 파싱 직후 즉시 실행(DOM은 이미 존재하므로
 * DOMContentLoaded를 기다리지 않고 바로 적용해 화면 깜빡임을 최소화한다).
 * 없는 id는 콘솔 warn 한 줄만 남기고 조용히 무시한다.
 */
(function () {
  'use strict';

  function warnMissing(id) {
    try { console.warn('[overrides] element not found: #' + id); } catch (e) {}
  }

  function applyHtml(id, html) {
    var el = document.getElementById(id);
    if (!el) { warnMissing(id); return; }
    try { el.innerHTML = html; } catch (e) {}
  }

  function applyHide(id) {
    var el = document.getElementById(id);
    if (!el) { warnMissing(id); return; }
    try { el.style.display = 'none'; } catch (e) {}
  }

  function applyImg(P, id, n, src) {
    var el = document.getElementById(id);
    if (!el) { warnMissing(id); return; }
    var full = P + src;
    try {
      var imgs = el.getElementsByTagName('img');
      if (imgs && imgs.length > n) {
        imgs[n].setAttribute('src', full);
        return;
      }
      // <img> 태그가 없으면 background-image 방식(._img_wrap 등)으로 대체 적용
      var bgEls = el.querySelectorAll('[class*="_img_wrap"],[style*="background-image"]');
      if (bgEls && bgEls.length > n) {
        var bgEl = bgEls[n];
        bgEl.style.backgroundImage = 'url(' + full + ')';
        if (bgEl.hasAttribute('data-bg')) { bgEl.setAttribute('data-bg', 'url(' + full + ')'); }
        if (bgEl.hasAttribute('data-src')) { bgEl.setAttribute('data-src', full); }
        return;
      }
      try { console.warn('[overrides] img target not found: #' + id + ' index ' + n); } catch (e) {}
    } catch (e) {}
  }

  function init() {
    try {
      var P = window.__P || '';
      var PAGE = window.__PAGE || '';
      var all = window.__OVERRIDES || {};
      var rules = all[PAGE];
      if (!rules) { return; }

      var keys = Object.keys(rules);
      for (var i = 0; i < keys.length; i++) {
        try {
          var key = keys[i];
          var val = rules[key];
          var parts = key.split('|');
          if (parts.length === 1) {
            if (val && typeof val.html === 'string') { applyHtml(parts[0], val.html); }
          } else if (parts[1] === 'img') {
            var n = parseInt(parts[2], 10);
            if (isNaN(n)) { n = 0; }
            if (val && typeof val.src === 'string') { applyImg(P, parts[0], n, val.src); }
          } else if (parts[1] === 'hide') {
            if (val) { applyHide(parts[0]); }
          }
        } catch (eInner) { /* 개별 규칙 실패는 무시하고 계속 진행 */ }
      }
    } catch (e) {
      try { console.warn('[overrides] init failed', e); } catch (e2) {}
    }
  }

  init();
})();
