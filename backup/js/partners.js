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

  // 이름/설명은 원본과 동일한 줄바꿈(<br>)을 유지해야 캡션 높이가 원본과 일치한다.
  // <br>만 허용하고 나머지는 이스케이프.
  function richText(s) {
    return escapeHtml(s).replace(/&lt;br\s*\/?&gt;/gi, '<br>');
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
      h4s[i].innerHTML = richText(name);
      var parent = h4s[i].parentNode;
      if (parent) {
        var pEl = parent.querySelector('p');
        if (pEl && (!pEl.className || pEl.className.indexOf('title') === -1)) {
          pEl.innerHTML = richText(desc);
        }
      }
    }

    // text_wrap 안의 caption(.title, 있는 경우) — 원본은 "이름<span class="body">설명</span>" 구조
    var titleEl = clone.querySelector('.text_wrap .title');
    if (titleEl) {
      var html = richText(name);
      if (desc) { html += '<span class="body">' + richText(desc) + '</span>'; }
      titleEl.innerHTML = html;
    }
  }

  // 미러된 원본 마크업이 데이터와 이미 일치하면 DOM을 그대로 둔다.
  // (아임웹 갤러리 JS가 '더보기'(_item_hide)·행 높이·레이아웃을 직접 관리하므로,
  //  불필요한 재생성은 모바일 그리드 레이아웃을 깨뜨린다. 관리자 수정이 있을 때만 재생성.)
  function domSignature(container) {
    var its = container.querySelectorAll('._item');
    var sig = [];
    for (var i = 0; i < its.length; i++) {
      var b = its[i].querySelector('.img_wrap') || its[i].querySelector('[class*="_img_wrap"]');
      // 저장 데이터(logo)는 배경이미지 기준이므로 data-bg/background-image를 먼저 본다.
      // (data-src는 라이트박스용 원본이라 파일이 다를 수 있어 비교 기준이 될 수 없다.)
      var url = '';
      if (b) {
        var m = /url\(["']?([^"')]+)/.exec(b.getAttribute('data-bg') || b.style.backgroundImage || '');
        url = m ? m[1] : (b.getAttribute('data-src') || '');
      }
      sig.push(url.replace(/^.*\/assets\//, 'assets/').replace(/^.*\/images\//, 'images/'));
    }
    return sig.join('|');
  }

  function dataSignature(items) {
    var sig = [];
    for (var i = 0; i < items.length; i++) { sig.push((items[i] && items[i].logo) || ''); }
    return sig.join('|');
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

        // 원본 그대로면 손대지 않음 (레이아웃 100% 보존)
        if (domSignature(container) === dataSignature(items)) { continue; }

        var tpl = tplItem.cloneNode(true);
        tpl.classList.remove('_item_hide');
        // 원본이 '더보기'로 숨겨두던 개수를 그대로 재현
        var initialVisible = 0;
        var existing = container.querySelectorAll('._item');
        for (var k = 0; k < existing.length; k++) {
          if (!existing[k].classList.contains('_item_hide')) { initialVisible++; }
        }
        if (!initialVisible) { initialVisible = existing.length || items.length; }

        while (container.firstChild) { container.removeChild(container.firstChild); }

        for (var i = 0; i < items.length; i++) {
          try {
            var clone = tpl.cloneNode(true);
            reassignIds(clone, groupKey + '_bk_' + w + '_' + i);
            fillItem(P, clone, items[i] || {});
            if (i >= initialVisible) { clone.classList.add('_item_hide'); }
            container.appendChild(clone);
          } catch (eItem) { /* 개별 아이템 실패는 건너뜀 */ }
        }

        // 아이템 개수가 바뀌면 열/행 폭, _gallery_row 배치, img_wrap 높이를 아임웹
        // GALLERY2 위젯 자신의 로직으로 다시 계산해야 한다(직접 흉내내지 않는다).
        // 각 위젯은 페이지에 'gallery_<위젯id>' 전역 인스턴스로 이미 초기화되어 있고
        // listResize()가 화면에 보이는 열 재배치·이미지 높이 계산을 전부 수행한다.
        try {
          var galleryInst = window['gallery_' + widgetIds[w]];
          if (galleryInst && typeof galleryInst.listResize === 'function') {
            galleryInst.listResize();
          }
        } catch (eResize) { /* 무시 - 최소한 이미지는 채워진 상태로 남는다 */ }
      } catch (eWidget) { /* 개별 위젯 실패는 건너뜀 */ }
    }
  }

  function init() {
    try {
      var data = window.__PARTNERS;
      if (!data || !data.targets) { return; }
      // revision 0 = 원본 미러 마크업 그대로. 아임웹 갤러리 JS가 열/행 폭과 '더보기'를
      // 직접 계산하므로 손대지 않아야 레이아웃이 원본과 100% 일치한다.
      // 관리자가 협약기관을 수정하면 revision이 올라가고, 그때부터 데이터 기준으로 렌더한다.
      if (!data.revision) { return; }
      var P = window.__P || '';
      renderGroup(P, data.targets.featured, data.featured, 'featured');
      renderGroup(P, data.targets.logos, data.logos, 'logo');
    } catch (e) {
      try { console.warn('[partners] init failed', e); } catch (e2) {}
    }
  }

  init();
})();
