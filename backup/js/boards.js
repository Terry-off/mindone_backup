/*!
 * boards.js — 게시판 목록/상세 렌더러
 *
 * 데이터 스키마: window.__BOARDS[__BOARD] = {
 *   boardId, title, posts: [ {idx, title, thumb, bodyHtml}, ... ]  // posts[0] = 최신(목록 표시 순서)
 * }
 *
 * 대상 DOM: `.widget.board._list_wrap` 내부의 `div.list-style[id^="post_card_"]`
 * 모드 판별: location.search에 bmode=view && idx가 있으면 상세, 그 외엔 목록.
 *           idx가 posts 안에 없으면(알 수 없는 idx) 목록 모드로 폴백.
 */
(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function parseQuery(search) {
    var result = {};
    if (!search) { return result; }
    var s = search.charAt(0) === '?' ? search.slice(1) : search;
    var pairs = s.split('&');
    for (var i = 0; i < pairs.length; i++) {
      if (!pairs[i]) { continue; }
      var eq = pairs[i].indexOf('=');
      var k, v;
      if (eq === -1) { k = pairs[i]; v = ''; } else { k = pairs[i].slice(0, eq); v = pairs[i].slice(eq + 1); }
      try { k = decodeURIComponent(k.replace(/\+/g, ' ')); } catch (e) {}
      try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) {}
      if (!(k in result)) { result[k] = v; }
    }
    return result;
  }

  function findAncestorByClass(el, cls) {
    var node = el;
    while (node && node.nodeType === 1) {
      if (node.classList && node.classList.contains(cls)) { return node; }
      node = node.parentNode;
    }
    return null;
  }

  // 글이 하나도 없어 템플릿 카드를 DOM에서 찾을 수 없을 때 사용하는 축약 마크업
  // (_workdir/templates/board_card_86.html 구조를 그대로 축약)
  var FALLBACK_CARD_HTML =
    '<div class="list-style-card _card_wrap">' +
      '<div class="ma-item _post_item_wrap">' +
        '<div class="card _card" style="background-size: cover; background-position: 50% 50%;">' +
          '<span class="holder blocked" style="cursor:pointer;">' +
            '<a class="post_link_wrap _fade_link" href="">' +
              '<div class="card_wrapper card-thumbnail-wrap" style="background-size: cover; background-position: 50% 50%;">' +
                '<div class="card-head _card_head _img_wrap"><span></span></div>' +
              '</div>' +
              '<div class="card-body _card_body list-group">' +
                '<div class="title title-block">' +
                  '<em class="notice-block" style="display:none">공지</em>' +
                  '<span><em style="padding-right:5px;color:;display:none"></em></span>' +
                  ' ' +
                '</div>' +
                '<div class="text text-block show_body"><span></span></div>' +
              '</div>' +
            '</a>' +
          '</span>' +
        '</div>' +
      '</div>' +
    '</div>';

  function getTemplateNode(listEl) {
    var itemTpl = listEl.querySelector('.ma-item._post_item_wrap');
    var cardTpl = itemTpl ? findAncestorByClass(itemTpl, 'list-style-card') : null;
    if (!cardTpl) { cardTpl = listEl.querySelector('.list-style-card'); }
    if (cardTpl) { return cardTpl; }
    var holder = document.createElement('div');
    holder.innerHTML = FALLBACK_CARD_HTML;
    return holder.firstElementChild;
  }

  function fillCardTitle(titleEl, text) {
    if (!titleEl) { return; }
    var nodes = titleEl.childNodes;
    var targetNode = null;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].nodeType === 3 && nodes[i].nodeValue.replace(/\s/g, '') !== '') {
        targetNode = nodes[i]; // 마지막 비어있지 않은 텍스트 노드(실제 제목 위치)를 채택
      }
    }
    if (targetNode) {
      targetNode.nodeValue = text;
    } else {
      titleEl.appendChild(document.createTextNode(text));
    }
  }

  function renderList(P, wrap, board, posts) {
    try {
      var listEl = wrap.querySelector('.list-style[id^="post_card_"]') || wrap.querySelector('.list-style');
      if (!listEl) { return; }

      var tplNode = getTemplateNode(listEl);
      if (!tplNode) { return; }

      while (listEl.firstChild) { listEl.removeChild(listEl.firstChild); }

      for (var i = 0; i < posts.length; i++) {
        try {
          var post = posts[i] || {};
          var card = tplNode.cloneNode(true);

          // 원본에 display:none이 있어도 그대로 복제되지만, 이후 imweb 초기화 스크립트가
          // 동작하지 않을 수 있으므로 방어적으로 항상 보이도록 강제한다.
          try { card.style.display = ''; } catch (e) {}

          var href = '?bmode=view&idx=' + encodeURIComponent(post.idx);
          var links = card.getElementsByTagName('a');
          for (var li = 0; li < links.length; li++) {
            links[li].setAttribute('href', href);
          }

          if (post.thumb) {
            var bgUrl = 'url(' + P + post.thumb + ')';
            var bgEls = card.querySelectorAll('[style*="background-image"]');
            if (bgEls.length) {
              var bgEl = bgEls[0];
              bgEl.style.backgroundImage = bgUrl;
              bgEl.setAttribute('data-bg', bgUrl);
              bgEl.setAttribute('data-src', P + post.thumb);
            }
          }

          var titleEl = card.querySelector('.title');
          fillCardTitle(titleEl, post.title || '');

          listEl.appendChild(card);
        } catch (eInner) { /* 개별 카드 실패는 건너뜀 */ }
      }
    } catch (e) {
      try { console.warn('[boards] renderList failed', e); } catch (e2) {}
    }
  }

  function fixAssetPaths(P, html) {
    if (!html) { return ''; }
    var s = String(html);
    s = s.replace(/src="assets\//g, 'src="' + P + 'assets/');
    s = s.replace(/src='assets\//g, "src='" + P + "assets/");
    s = s.replace(/src="images\//g, 'src="' + P + 'images/');
    s = s.replace(/src='images\//g, "src='" + P + "images/");
    return s;
  }

  function renderDetail(P, wrap, board, posts, idx) {
    try {
      var post = posts[idx] || {};
      var title = post.title || '';
      var bodyHtml = fixAssetPaths(P, post.bodyHtml || '');

      var html = '';
      html += '<div class="board_view">';
      html += '<div class="board-title holder header"><h1 class="view_tit">' + escapeHtml(title) + '</h1></div>';
      html += '<div class="board_summary"><div class="left"><div class="author"><div class="board_name"><a href="./">' + escapeHtml(board.title || '') + '</a></div></div></div></div>';
      html += '<div class="board_txt_area"><div class="custom-text-info _text_editor fr-view">' + bodyHtml + '</div></div>';

      html += '<div class="comment_section"><div class="list_tap">';
      if (idx > 0) {
        var prevPost = posts[idx - 1];
        html += '<a href="?bmode=view&idx=' + encodeURIComponent(prevPost.idx) + '"><i aria-hidden="true" class="icon-arrow-up"></i><span class="secret_icon">' + escapeHtml(prevPost.title || '') + '</span></a>';
      }
      if (idx < posts.length - 1) {
        var nextPost = posts[idx + 1];
        html += '<a href="?bmode=view&idx=' + encodeURIComponent(nextPost.idx) + '"><i aria-hidden="true" class="icon-arrow-down"></i><span class="secret_icon">' + escapeHtml(nextPost.title || '') + '</span></a>';
      }
      html += '</div>';
      html += '<div class="table_bottom over_h action-area"><a class="btn btn-primary btn-sm float_l" href="./" role="button">목록</a></div>';
      html += '</div>';
      html += '</div>';

      wrap.innerHTML = html;

      try {
        var siteName = (window.__CONFIG && window.__CONFIG.siteName) ? window.__CONFIG.siteName : '광주 마인드원치과의원';
        document.title = title + ' : ' + siteName;
      } catch (eTitle) {}
    } catch (e) {
      try { console.warn('[boards] renderDetail failed', e); } catch (e2) {}
    }
  }

  function init() {
    try {
      var P = window.__P || '';
      var BOARD_KEY = window.__BOARD || '';
      var ALL = window.__BOARDS || {};
      var board = ALL[BOARD_KEY];
      if (!board || !board.posts) { return; }

      var wrap = document.querySelector('.widget.board._list_wrap');
      if (!wrap) { return; }

      var qs = parseQuery(window.location.search);
      var posts = board.posts || [];
      var mode = 'list';
      var postIndex = -1;

      if (qs.bmode === 'view' && qs.idx) {
        var viewIdx = String(qs.idx);
        for (var pi = 0; pi < posts.length; pi++) {
          if (String(posts[pi].idx) === viewIdx) { postIndex = pi; break; }
        }
        mode = (postIndex === -1) ? 'list' : 'view';
      }

      if (mode === 'view') {
        // 상세 보기는 미러 HTML에 없으므로 항상 데이터로 그린다.
        renderDetail(P, wrap, board, posts, postIndex);
      } else {
        // 목록: revision 0이면 아임웹 원본 카드 마크업을 그대로 둔다(레이아웃 100% 일치).
        // 관리자가 글을 추가/수정하면 revision이 올라가고, 그때부터 데이터로 그린다.
        if (!board.revision) { return; }
        renderList(P, wrap, board, posts);
      }
    } catch (e) {
      try { console.warn('[boards] init failed', e); } catch (e2) {}
    }
  }

  init();
})();
