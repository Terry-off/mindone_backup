/*!
 * partners.js — 제휴기관(/41) 갤러리 렌더러
 *
 * 데이터 스키마: window.__PARTNERS = {
 *   targets: { featured: [widgetId, ...], logos: [widgetId, ...] }, // PC/모바일 위젯 래퍼 id
 *   featured: [ {name, desc, logo}, ... ],
 *   logos:    [ {name, logo}, ... ]
 * }
 *
 * 각 target id 요소가 DOM에 있으면 내부 .gallery2 컨테이너의 첫 ._item.item_gallary를
 * template으로 clone하여 컨테이너를 비우고 데이터 순서대로 재생성한다.
 * 아이템 수 변화는 그대로 전부 삽입한다(더보기/숨김 처리는 관여하지 않음).
 */
(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function findGalleryContainer(widgetEl) {
    var c = widgetEl.querySelector('.gallery2');
    if (c) { return c; }
    return widgetEl.querySelector('[id^="container_"]');
  }

  // 클론 내부의 id 속성을 순번 기반으로 재부여하고, data-sub-html 등 id 참조를 함께 갱신
  function reassignIds(clone, prefix) {
    var idEls = clone.querySelectorAll('[id]');
    var map = {};
    var n = 0;
    for (var i = 0; i < idEls.length; i++) {
      var oldId = idEls[i].id;
      var newId = prefix + '_' + (n++);
      if (oldId) { map[oldId] = newId; }
      idEls[i].id = newId;
    }
    var subHtmlEls = clone.querySelectorAll('[data-sub-html]');
    for (var j = 0; j < subHtmlEls.length; j++) {
      var v = subHtmlEls[j].getAttribute('data-sub-html');
      if (v && v.charAt(0) === '#' && map[v.slice(1)]) {
        subHtmlEls[j].setAttribute('data-sub-html', '#' + map[v.slice(1)]);
      }
    }
  }

  function fillItem(P, clone, item) {
    var full = P + (item.logo || '');
    var bgEl = clone.querySelector('.img_wrap') || clone.querySelector('[class*="_img_wrap"]');
    if (bgEl) {
      bgEl.style.backgroundImage = 'url(' + full + ')';
      bgEl.setAttribute('data-bg', 'url(' + full + ')');
      bgEl.setAttribute('data-src', full);
    }

    var name = item.name || '';
    var desc = item.desc || '';

    // 숨은 caption 박스(h4 + p) 채우기 — h4의 부모 안에서 p를 찾아 구조를 유지한다.
    var h4s = clone.querySelectorAll('h4');
    for (var i = 0; i < h4s.length; i++) {
      h4s[i].textContent = name;
      var parent = h4s[i].parentNode;
      if (parent) {
        var pEl = parent.querySelector('p');
        if (pEl && (!pEl.className || pEl.className.indexOf('title') === -1)) {
          pEl.textContent = desc;
        }
      }
    }

    // text_wrap 안의 caption(.title, 있는 경우) — 원본은 "이름<span class="body">설명</span>" 구조
    var titleEl = clone.querySelector('.text_wrap .title');
    if (titleEl) {
      var html = escapeHtml(name);
      if (desc) { html += '<span class="body">' + escapeHtml(desc) + '</span>'; }
      titleEl.innerHTML = html;
    }
  }

  function renderGroup(P, widgetIds, items, groupKey) {
    if (!widgetIds || !widgetIds.length || !items) { return; }
    for (var w = 0; w < widgetIds.length; w++) {
      try {
        var widgetEl = document.getElementById(widgetIds[w]);
        if (!widgetEl) { continue; }
        var container = findGalleryContainer(widgetEl);
        if (!container) { continue; }
        var tplItem = container.querySelector('._item.item_gallary') || container.querySelector('.item_gallary');
        if (!tplItem) { continue; }
        var tpl = tplItem.cloneNode(true);

        while (container.firstChild) { container.removeChild(container.firstChild); }

        for (var i = 0; i < items.length; i++) {
          try {
            var clone = tpl.cloneNode(true);
            reassignIds(clone, groupKey + '_bk_' + w + '_' + i);
            fillItem(P, clone, items[i] || {});
            container.appendChild(clone);
          } catch (eItem) { /* 개별 아이템 실패는 건너뜀 */ }
        }
      } catch (eWidget) { /* 개별 위젯 실패는 건너뜀 */ }
    }
  }

  function init() {
    try {
      var data = window.__PARTNERS;
      if (!data || !data.targets) { return; }
      var P = window.__P || '';
      renderGroup(P, data.targets.featured, data.featured, 'featured');
      renderGroup(P, data.targets.logos, data.logos, 'logo');
    } catch (e) {
      try { console.warn('[partners] init failed', e); } catch (e2) {}
    }
  }

  init();
})();
