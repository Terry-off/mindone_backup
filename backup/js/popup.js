/*!
 * popup.js — 홈 전용 팝업 배너 렌더러
 *
 * 데이터 스키마: window.__POPUPS = [
 *   { id, image, link, width, left, top, start, end, enabled, hideDays }, ...
 * ]  // start/end: 'YYYY-MM-DD' (KST 기준 비교)
 *
 * 표시 조건: enabled && start<=오늘(KST)<=end
 *           && localStorage['minddent:popup:<id>:hideUntil']가 없거나 지났을 때
 * localStorage: 'minddent:popup:<id>:hideUntil' = ms epoch 문자열
 *
 * 기존 정적 팝업 마크업은 head의 `.popup-banner-wrap{display:none!important}`
 * 규칙에 의해 숨겨져 있으므로, 이 스크립트는 별도의 id(#backup-popups)를 가진
 * 새 래퍼를 만들고 그 id에 대해서만 !important로 표시 처리한다.
 */
(function () {
  'use strict';

  function todayKST() {
    return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  }

  function getHideUntil(id) {
    try {
      var v = window.localStorage.getItem('minddent:popup:' + id + ':hideUntil');
      return v ? parseInt(v, 10) : 0;
    } catch (e) { return 0; }
  }

  function setHideUntil(id, ms) {
    try { window.localStorage.setItem('minddent:popup:' + id + ':hideUntil', String(ms)); } catch (e) {}
  }

  function buildStyle() {
    var style = document.createElement('style');
    style.type = 'text/css';
    var css = '';
    css += '#backup-popups{display:block!important}\n';
    css += '@media (max-width:767px){\n';
    css += '  #backup-popups .pop-container{left:50%!important;right:auto!important;top:70px!important;transform:translateX(-50%);}\n';
    css += '  #backup-popups .pop-container .pop-img img{width:100%!important;max-width:92vw!important;}\n';
    css += '  #backup-popups .pop-container .btn-group{width:100%!important;max-width:92vw!important;}\n';
    css += '}\n';
    if (style.styleSheet) { style.styleSheet.cssText = css; } else { style.appendChild(document.createTextNode(css)); }
    return style;
  }

  function buildPopupNode(P, pop, zIndex, top) {
    var container = document.createElement('div');
    container.id = 'popup_' + pop.id;
    container.className = 'pop-container';
    container.setAttribute('style', 'z-index:' + zIndex + ';left:' + pop.left + 'px;right:auto!important;top:' + top + 'px;position:fixed;');

    var item = document.createElement('div');
    item.className = 'pop-item';

    var imgWrap = document.createElement('div');
    imgWrap.className = 'pop-img';

    var closeX = document.createElement('a');
    closeX.href = 'javascript:;';
    closeX.className = 'btl bt-times del';
    closeX.style.color = '#979797';

    var linkInner = document.createElement('a');
    if (pop.link) {
      linkInner.href = pop.link;
      linkInner.target = '_blank';
    }
    var img = document.createElement('img');
    img.src = P + pop.image;
    img.style.width = pop.width + 'px';
    img.style.maxWidth = '92vw';
    linkInner.appendChild(img);

    imgWrap.appendChild(closeX);
    imgWrap.appendChild(linkInner);

    var btnGroup = document.createElement('div');
    btnGroup.className = 'btn-group clearfix';
    btnGroup.style.width = pop.width + 'px';
    btnGroup.style.maxWidth = '92vw';

    var days = pop.hideDays || 1;
    var hideBtn = document.createElement('a');
    hideBtn.href = 'javascript:;';
    hideBtn.className = 'btn btn-flat';
    hideBtn.textContent = days + '일 동안 보지 않음';

    var closeBtn = document.createElement('a');
    closeBtn.href = 'javascript:;';
    closeBtn.className = 'btn btn-flat right';
    closeBtn.textContent = '닫기';

    btnGroup.appendChild(hideBtn);
    btnGroup.appendChild(closeBtn);

    item.appendChild(imgWrap);
    item.appendChild(btnGroup);
    container.appendChild(item);

    function removeIt() {
      try { container.parentNode && container.parentNode.removeChild(container); } catch (e) {}
    }
    closeX.addEventListener('click', function (e) { try { e.preventDefault(); } catch (er) {} removeIt(); });
    closeBtn.addEventListener('click', function (e) { try { e.preventDefault(); } catch (er) {} removeIt(); });
    hideBtn.addEventListener('click', function (e) {
      try { e.preventDefault(); } catch (er) {}
      setHideUntil(pop.id, Date.now() + days * 86400000);
      removeIt();
    });

    return container;
  }

  function init() {
    try {
      var list = window.__POPUPS;
      if (!list || !list.length) { return; }
      var P = window.__P || '';
      var today = todayKST();

      var visible = [];
      for (var i = 0; i < list.length; i++) {
        try {
          var p = list[i];
          if (!p || !p.enabled) { continue; }
          if (!p.start || !p.end) { continue; }
          if (!(p.start <= today && today <= p.end)) { continue; }
          var hu = getHideUntil(p.id);
          if (hu && hu > Date.now()) { continue; }
          visible.push(p);
        } catch (eInner) { /* 개별 팝업 데이터 오류는 건너뜀 */ }
      }
      if (!visible.length) { return; }

      var wrap = document.createElement('div');
      wrap.className = 'popup-banner-wrap';
      wrap.id = 'backup-popups';

      var leftCounts = {};
      for (var j = 0; j < visible.length; j++) {
        try {
          var pop = visible[j];
          var leftKey = String(pop.left);
          var stack = leftCounts[leftKey] || 0;
          var top = (parseInt(pop.top, 10) || 0) + stack * 40;
          leftCounts[leftKey] = stack + 1;

          var node = buildPopupNode(P, pop, 1001 + j, top);
          wrap.appendChild(node);
        } catch (eInner2) { /* 개별 팝업 렌더 실패는 건너뜀 */ }
      }

      if (wrap.childNodes.length) {
        document.head.appendChild(buildStyle());
        document.body.appendChild(wrap);
      }
    } catch (e) {
      try { console.warn('[popup] init failed', e); } catch (e2) {}
    }
  }

  init();
})();
