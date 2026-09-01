/**
 * tab-board.js — 관리자 "실제사례 관리" 탭
 * 데이터: data/boards/<id>.js → window.__BOARDS["<id>"] = {boardId,title,posts:[{idx,title,thumb,bodyHtml}]}
 * 이 파일은 window.GH / window.AdminUtil / window.AdminTabs.register 계약만 사용한다.
 * DOM은 register(render)에서 전달되는 el 컨테이너 내부에만 생성한다.
 */
(function () {
  'use strict';

  var TAB_ID = 'board';
  var STYLE_ID = 'admin-style-tab-board';

  var BOARD_GROUPS = [
    {
      label: '예쁜앞니치료 실제사례',
      boards: [
        { id: '86', name: '슬림네이트' },
        { id: '104', name: '비교정 스마일라인치료' },
        { id: '105', name: '치아교정' },
        { id: '106', name: '앞니 재생복구치료' },
        { id: '121', name: '깨진 앞니 치료' },
        { id: '107', name: '앞니 공간치료' },
        { id: '108', name: '앞니 충치치료' },
        { id: '109', name: '앞니 올세라믹' },
        { id: '110', name: '치아미백' },
        { id: '111', name: '치아성형/잇몸성형' }
      ]
    },
    {
      label: '고난도임플란트 실제사례',
      boards: [
        { id: '112', name: '전체 임플란트' },
        { id: '113', name: '임플란트 복합치료' },
        { id: '114', name: '원데이 임플란트' },
        { id: '115', name: '앞니 심미 임플란트' },
        { id: '116', name: '상악동거상술 임플란트' },
        { id: '117', name: '뼈재생 임플란트' },
        { id: '118', name: '신경관 가까운 임플란트' },
        { id: '119', name: '임플란트 틀니' }
      ]
    }
  ];

  var TEMPLATE_HTML =
    '<p style="text-align:center;">안녕하세요.<br>예쁜앞니, 고난도임플란트 전문<br>마인드원치과입니다.</p>' +
    '<hr>' +
    '<p style="text-align:center;">(환자분 상황 설명을 입력하세요)</p>' +
    '<p style="text-align:center;">[BEFORE 사진을 여기에 삽입]</p>' +
    '<p style="text-align:center;">(치료 과정 설명을 입력하세요)</p>' +
    '<p style="text-align:center;">[AFTER 사진을 여기에 삽입]</p>' +
    '<p style="text-align:center;">(치료 결과와 마무리 인사를 입력하세요)</p>';

  var rootEl = null;
  var currentBoardId = '86';
  var boardData = null; // {boardId,title,posts:[]}
  var loaded = false;
  var loading = false;
  var previewCache = {}; // path -> previewUrl

  var editor = null; // { post:{idx,title,thumb,bodyHtml}, isNew:bool, editorEl, savedRange, thumbPath }

  // ---------- 소형 유틸 ----------
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function timestamp() {
    var d = new Date();
    return '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  }
  function resolveImg(path) {
    if (!path) return '';
    if (previewCache[path]) return previewCache[path];
    if (/^https?:|^data:|^\/\//.test(path)) return path;
    return '../' + String(path).replace(/^\.\//, '');
  }
  function byId(scopeEl, id) {
    try { return scopeEl.querySelector('#' + id); } catch (e) { return null; }
  }
  function boardNameOf(id) {
    for (var g = 0; g < BOARD_GROUPS.length; g++) {
      for (var i = 0; i < BOARD_GROUPS[g].boards.length; i++) {
        if (BOARD_GROUPS[g].boards[i].id === id) return BOARD_GROUPS[g].boards[i].name;
      }
    }
    return id;
  }

  // ---------- 스타일 ----------
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '.bd-wrap{font-size:14px;color:#333;}',
      '.bd-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;}',
      '.bd-toolbar select{padding:7px 9px;border:1px solid #ddd;border-radius:6px;font-size:13px;min-width:220px;}',
      '.bd-btn{display:inline-block;padding:8px 14px;border:1px solid #ddd;border-radius:6px;background:#fff;color:#333;cursor:pointer;font-size:13px;}',
      '.bd-btn:hover{border-color:#ff6000;color:#ff6000;}',
      '.bd-btn-primary{background:#ff6000;border-color:#ff6000;color:#fff;}',
      '.bd-btn-primary:hover{background:#e55500;color:#fff;}',
      '.bd-btn-danger{border-color:#e33;color:#e33;}',
      '.bd-btn-danger:hover{background:#e33;color:#fff;}',
      '.bd-btn-small{padding:4px 9px;font-size:12px;}',
      '.bd-status{color:#888;margin-bottom:10px;min-height:18px;}',
      '.bd-error{color:#e33;}',
      '.bd-table{width:100%;border-collapse:collapse;background:#fff;}',
      '.bd-table th,.bd-table td{border-bottom:1px solid #eee;padding:8px 10px;text-align:left;font-size:13px;vertical-align:middle;}',
      '.bd-table th{color:#888;font-weight:500;font-size:12px;}',
      '.bd-thumb{width:60px;height:60px;object-fit:cover;background:#f5f5f5;border-radius:4px;border:1px solid #eee;}',
      '.bd-thumb-empty{width:60px;height:60px;background:#f5f5f5;border-radius:4px;border:1px solid #eee;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:11px;}',
      '.bd-title-cell{max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.bd-empty{color:#999;padding:30px 10px;text-align:center;}',
      '.bd-editor-panel{margin-top:16px;border:1px solid #eee;border-radius:10px;padding:18px 20px;background:#fff;}',
      '.bd-editor-panel h3{margin:0 0 14px;font-size:16px;}',
      '.bd-form-row{margin-bottom:12px;}',
      '.bd-form-row label{display:block;font-size:12px;color:#666;margin-bottom:4px;}',
      '.bd-form-row input[type=text]{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #ddd;border-radius:5px;font-size:14px;}',
      '.bd-thumb-pick{display:flex;align-items:center;gap:10px;}',
      '.bd-thumb-pick img{width:60px;height:60px;object-fit:cover;background:#f5f5f5;border:1px solid #eee;border-radius:4px;}',
      '.bd-editor-toolbar{display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;}',
      '.bd-editor{max-width:700px;margin:0 auto;min-height:320px;padding:16px;border:1px solid #ddd;border-radius:6px;font-size:15px;line-height:1.7;background:#fff;}',
      '.bd-editor p{text-align:center;margin:0 0 6px;}',
      '.bd-editor img{max-width:100%;height:auto;}',
      '.bd-editor hr{margin:20px 0;border:none;border-top:1px solid #ddd;}',
      '.bd-editor-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px;}',
      '.bd-preview-overlay{position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(30,30,30,.5);z-index:2100;overflow:auto;padding:30px 14px;}',
      '.bd-preview-card{max-width:760px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;}',
      '.bd-preview-bar{display:flex;justify-content:flex-end;padding:10px 14px;border-bottom:1px solid #eee;}',
      '.bd-frview{max-width:700px;margin:0 auto;padding:24px 18px;font-size:15px;line-height:1.7;color:#333;}',
      '.bd-frview p{text-align:center;margin:0 0 4px;}',
      '.bd-frview hr{margin:24px 0;border:none;border-top:1px solid #ddd;}',
      '.bd-frview img{max-width:100%;height:auto;}'
    ].join('\n');
    var styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  // ---------- 직렬화 ----------
  function serializeBoard(id, data) {
    return 'window.__BOARDS = window.__BOARDS || {};\nwindow.__BOARDS["' + id + '"] = ' + JSON.stringify(data, null, 2) + ';\n';
  }
  function stageCurrentBoard(label) {
    try {
      window.GH.stageText('data/boards/' + currentBoardId + '.js', serializeBoard(currentBoardId, boardData), label);
    } catch (e) {
      try { console.error('[tab-board] stage error', e); } catch (e2) {}
      alert('저장 대기 목록에 추가하는 중 오류가 발생했습니다.');
    }
  }

  // ---------- 렌더: 셸 ----------
  function render(el) {
    rootEl = el;
    try {
      injectStyles();
      var optionsHtml = BOARD_GROUPS.map(function (g) {
        var opts = g.boards.map(function (b) {
          return '<option value="' + b.id + '"' + (b.id === currentBoardId ? ' selected' : '') + '>' + escapeHtml(b.id) + ' ' + escapeHtml(b.name) + '</option>';
        }).join('');
        return '<optgroup label="' + escapeHtml(g.label) + '">' + opts + '</optgroup>';
      }).join('');

      el.innerHTML =
        '<div class="bd-wrap">' +
        '<div class="bd-toolbar">' +
        '<select id="bd-board-select">' + optionsHtml + '</select>' +
        '<button type="button" class="bd-btn bd-btn-primary" id="bd-add-btn">+ 새 글 추가</button>' +
        '<button type="button" class="bd-btn" id="bd-refresh-btn">새로고침</button>' +
        '</div>' +
        '<div class="bd-status" id="bd-status"></div>' +
        '<div id="bd-list-holder"></div>' +
        '<div id="bd-editor-holder"></div>' +
        '<div id="bd-preview-holder"></div>' +
        '</div>';

      var sel = byId(el, 'bd-board-select');
      if (sel) sel.addEventListener('change', function () {
        if (editor && !confirm('편집 중인 내용이 저장되지 않았습니다. 다른 게시판으로 이동할까요?')) {
          sel.value = currentBoardId;
          return;
        }
        closeEditor();
        currentBoardId = sel.value;
        loaded = false;
        loadBoard();
      });
      var addBtn = byId(el, 'bd-add-btn');
      if (addBtn) addBtn.addEventListener('click', function () { openEditor(null); });
      var refreshBtn = byId(el, 'bd-refresh-btn');
      if (refreshBtn) refreshBtn.addEventListener('click', function () {
        try {
          if (loaded && !confirm('새로고침하면 아직 게시하지 않은 화면 표시가 초기화될 수 있습니다(저장 대기 항목은 유지됩니다). 계속할까요?')) return;
        } catch (e) {}
        loaded = false;
        loadBoard();
      });

      loadBoard();
    } catch (e) {
      try { el.innerHTML = '<p class="bd-error">실제사례 관리 화면을 불러오는 중 오류가 발생했습니다.</p>'; } catch (e2) {}
      try { console.error('[tab-board] render error', e); } catch (e3) {}
    }
  }

  function onShow() {
    try {
      if (!loaded && !loading) loadBoard();
    } catch (e) { try { console.error('[tab-board] onShow error', e); } catch (e2) {} }
  }

  function setStatus(text, isError) {
    if (!rootEl) return;
    var s = byId(rootEl, 'bd-status');
    if (!s) return;
    s.textContent = text || '';
    s.className = 'bd-status' + (isError ? ' bd-error' : '');
  }

  function loadBoard() {
    if (!rootEl) return;
    if (!window.GH || typeof window.GH.readJsData !== 'function') {
      setStatus('GitHub 연동 모듈을 불러올 수 없습니다.', true);
      return;
    }
    loading = true;
    setStatus('불러오는 중...');
    window.GH.readJsData('data/boards/' + currentBoardId + '.js').then(function (data) {
      loading = false;
      loaded = true;
      if (data && typeof data === 'object') {
        boardData = {
          boardId: data.boardId || currentBoardId,
          title: data.title || boardNameOf(currentBoardId),
          posts: Array.isArray(data.posts) ? data.posts : []
        };
      } else {
        boardData = { boardId: currentBoardId, title: boardNameOf(currentBoardId), posts: [] };
      }
      setStatus('');
      renderList();
    }).catch(function (err) {
      loading = false;
      boardData = { boardId: currentBoardId, title: boardNameOf(currentBoardId), posts: [] };
      var msg = (err && err.message) ? err.message : String(err);
      setStatus('게시판 데이터를 불러오지 못했습니다: ' + msg, true);
      try { console.error('[tab-board] loadBoard error', err); } catch (e) {}
      renderList();
    });
  }

  // ---------- 목록 ----------
  function renderList() {
    if (!rootEl) return;
    var holder = byId(rootEl, 'bd-list-holder');
    if (!holder) return;
    try {
      var posts = (boardData && boardData.posts) || [];
      if (!posts.length) {
        holder.innerHTML = '<div class="bd-empty">등록된 글이 없습니다. "+ 새 글 추가"로 만들어보세요.</div>';
        return;
      }
      var rows = posts.map(function (post, i) {
        var thumbCell = post.thumb
          ? '<img class="bd-thumb" src="' + escapeHtml(resolveImg(post.thumb)) + '" alt="">'
          : '<div class="bd-thumb-empty">썸네일<br>없음</div>';
        return (
          '<tr data-idx="' + i + '">' +
          '<td>' + thumbCell + '</td>' +
          '<td class="bd-title-cell">' + escapeHtml(post.title || '(제목 없음)') + '</td>' +
          '<td>' +
          '<button type="button" class="bd-btn bd-btn-small" data-act="edit">수정</button> ' +
          '<button type="button" class="bd-btn bd-btn-small bd-btn-danger" data-act="delete">삭제</button> ' +
          '<button type="button" class="bd-btn bd-btn-small" data-act="up"' + (i === 0 ? ' disabled' : '') + '>↑</button> ' +
          '<button type="button" class="bd-btn bd-btn-small" data-act="down"' + (i === posts.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '</td>' +
          '</tr>'
        );
      }).join('');
      holder.innerHTML = '<table class="bd-table"><thead><tr><th>썸네일</th><th>제목</th><th>관리</th></tr></thead><tbody>' + rows + '</tbody></table>';

      holder.querySelectorAll('tr[data-idx]').forEach(function (tr) {
        var idx = Number(tr.getAttribute('data-idx'));
        tr.querySelectorAll('button[data-act]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var act = btn.getAttribute('data-act');
            if (act === 'edit') openEditor(boardData.posts[idx]);
            else if (act === 'delete') handleDelete(idx);
            else if (act === 'up') moveItem(idx, -1);
            else if (act === 'down') moveItem(idx, 1);
          });
        });
      });
    } catch (e) {
      try { console.error('[tab-board] renderList error', e); } catch (e2) {}
      holder.innerHTML = '<div class="bd-error">목록을 표시하는 중 오류가 발생했습니다.</div>';
    }
  }

  function handleDelete(idx) {
    try {
      var post = boardData.posts[idx];
      if (!post) return;
      if (!confirm('이 글을 삭제할까요? (업로드된 이미지 파일은 보존을 위해 남겨둡니다)')) return;
      boardData.posts.splice(idx, 1);
      stageCurrentBoard('실제사례 글 삭제: ' + (post.title || post.idx));
      renderList();
    } catch (e) {
      try { console.error('[tab-board] delete error', e); } catch (e2) {}
      alert('삭제 중 오류가 발생했습니다.');
    }
  }

  function moveItem(idx, dir) {
    try {
      var newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= boardData.posts.length) return;
      var arr = boardData.posts;
      var tmp = arr[idx];
      arr[idx] = arr[newIdx];
      arr[newIdx] = tmp;
      stageCurrentBoard('실제사례 글 순서 변경 (' + boardData.boardId + ')');
      renderList();
    } catch (e) {
      try { console.error('[tab-board] move error', e); } catch (e2) {}
    }
  }

  function closeEditor() {
    editor = null;
    if (!rootEl) return;
    var holder = byId(rootEl, 'bd-editor-holder');
    if (holder) holder.innerHTML = '';
  }

  // ---------- 글 편집기 ----------
  function loadHtmlIntoEditor(editorEl, bodyHtml) {
    try {
      var tmp = document.createElement('div');
      tmp.innerHTML = bodyHtml || '';
      var imgs = tmp.querySelectorAll('img[src]');
      imgs.forEach(function (img) {
        var real = img.getAttribute('src');
        if (real && !/^https?:|^data:|^\.\.\//.test(real)) {
          img.setAttribute('data-real-src', real);
          img.setAttribute('src', resolveImg(real));
        }
      });
      editorEl.innerHTML = tmp.innerHTML;
    } catch (e) {
      try { console.error('[tab-board] loadHtmlIntoEditor error', e); } catch (e2) {}
      editorEl.innerHTML = bodyHtml || '';
    }
  }

  function buildStoredHtml(editorEl) {
    try {
      var clone = editorEl.cloneNode(true);
      var imgs = clone.querySelectorAll('img');
      imgs.forEach(function (img) {
        var real = img.getAttribute('data-real-src');
        if (real) {
          img.setAttribute('src', real);
          img.removeAttribute('data-real-src');
        } else {
          var src = img.getAttribute('src') || '';
          src = src.replace(/^\.\.\/(assets\/|images\/)/, '$1');
          img.setAttribute('src', src);
        }
      });
      return clone.innerHTML;
    } catch (e) {
      try { console.error('[tab-board] buildStoredHtml error', e); } catch (e2) {}
      return editorEl.innerHTML;
    }
  }

  function openEditor(existingPost) {
    if (!rootEl) return;
    var holder = byId(rootEl, 'bd-editor-holder');
    if (!holder) return;

    var isNew = !existingPost;
    var post = existingPost ? JSON.parse(JSON.stringify(existingPost)) : { idx: '', title: '', thumb: '', bodyHtml: '' };

    editor = { post: post, isNew: isNew, editorEl: null, savedRange: null };

    var html =
      '<div class="bd-editor-panel">' +
      '<h3>' + (isNew ? '새 글 작성' : '글 수정') + '</h3>' +
      '<div class="bd-form-row"><label>제목</label><input type="text" id="bd-e-title" value="' + escapeHtml(post.title) + '" placeholder="제목을 입력하세요"></div>' +
      '<div class="bd-form-row"><label>썸네일</label>' +
      '<div class="bd-thumb-pick">' +
      (post.thumb ? '<img id="bd-e-thumbprev" src="' + escapeHtml(resolveImg(post.thumb)) + '" alt="">' : '<img id="bd-e-thumbprev" src="" alt="" style="display:none;">') +
      '<button type="button" class="bd-btn bd-btn-small" id="bd-e-thumbbtn">썸네일 업로드</button>' +
      '</div></div>' +
      '<div class="bd-form-row"><label>본문</label>' +
      '<div class="bd-editor-toolbar">' +
      '<button type="button" class="bd-btn bd-btn-small" id="bd-e-img">사진 삽입</button>' +
      '<button type="button" class="bd-btn bd-btn-small" id="bd-e-hr">구분선</button>' +
      '<button type="button" class="bd-btn bd-btn-small" id="bd-e-center">가운데 정렬</button>' +
      '<button type="button" class="bd-btn bd-btn-small" id="bd-e-left">왼쪽 정렬</button>' +
      '<button type="button" class="bd-btn bd-btn-small" id="bd-e-tpl">사례 템플릿 삽입</button>' +
      '</div>' +
      '<div class="bd-editor" id="bd-e-body" contenteditable="true"></div>' +
      '</div>' +
      '<div class="bd-editor-actions">' +
      '<button type="button" class="bd-btn" id="bd-e-preview">미리보기</button>' +
      '<button type="button" class="bd-btn" id="bd-e-cancel">취소</button>' +
      '<button type="button" class="bd-btn bd-btn-primary" id="bd-e-save">저장</button>' +
      '</div>' +
      '</div>';
    holder.innerHTML = html;

    var editorEl = byId(rootEl, 'bd-e-body');
    editor.editorEl = editorEl;
    loadHtmlIntoEditor(editorEl, post.bodyHtml);

    function saveSelection() {
      try {
        var sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          var r = sel.getRangeAt(0);
          if (editorEl.contains(r.commonAncestorContainer)) editor.savedRange = r.cloneRange();
        }
      } catch (e) {}
    }
    function restoreSelection() {
      try {
        editorEl.focus();
        var sel = window.getSelection();
        sel.removeAllRanges();
        if (editor.savedRange) {
          sel.addRange(editor.savedRange);
        } else {
          var r = document.createRange();
          r.selectNodeContents(editorEl);
          r.collapse(false);
          sel.addRange(r);
        }
      } catch (e) {}
    }
    function insertNodeAtSelection(node) {
      restoreSelection();
      try {
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) { editorEl.appendChild(node); return; }
        var range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(node);
        range.setStartAfter(node);
        range.setEndAfter(node);
        sel.removeAllRanges();
        sel.addRange(range);
        editor.savedRange = range.cloneRange();
      } catch (e) {
        try { editorEl.appendChild(node); } catch (e2) {}
      }
    }
    function insertHtmlAtSelection(htmlStr) {
      var tmp = document.createElement('div');
      tmp.innerHTML = htmlStr;
      var frag = document.createDocumentFragment();
      var lastNode = null;
      while (tmp.firstChild) { lastNode = tmp.firstChild; frag.appendChild(tmp.firstChild); }
      restoreSelection();
      try {
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) { editorEl.appendChild(frag); return; }
        var range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(frag);
        if (lastNode) {
          var r2 = document.createRange();
          r2.setStartAfter(lastNode);
          r2.setEndAfter(lastNode);
          sel.removeAllRanges();
          sel.addRange(r2);
          editor.savedRange = r2.cloneRange();
        }
      } catch (e) {
        try { editorEl.appendChild(frag); } catch (e2) {}
      }
    }

    editorEl.addEventListener('mouseup', saveSelection);
    editorEl.addEventListener('keyup', saveSelection);
    editorEl.addEventListener('paste', function (e) {
      try {
        e.preventDefault();
        var text = (e.clipboardData || window.clipboardData).getData('text/plain');
        saveSelection();
        restoreSelection();
        var ok = false;
        try { ok = document.execCommand('insertText', false, text); } catch (e2) { ok = false; }
        if (!ok) {
          var sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            var range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(text));
          }
        }
      } catch (err) { try { console.error('[tab-board] paste error', err); } catch (e3) {} }
    });

    var imgBtn = byId(rootEl, 'bd-e-img');
    if (imgBtn) imgBtn.addEventListener('click', function () {
      saveSelection();
      if (!window.AdminUtil || typeof window.AdminUtil.pickImage !== 'function') {
        alert('이미지 업로드 기능을 사용할 수 없습니다.');
        return;
      }
      window.AdminUtil.pickImage({ maxW: 1600, quality: 0.85 }).then(function (res) {
        if (!res || !res.bytes) return;
        var path = 'images/uploads/post-' + timestamp() + '.' + (res.ext || 'jpg');
        previewCache[path] = res.previewUrl;
        try { window.GH.stageBinary(path, res.bytes, '본문 이미지 업로드: ' + path); } catch (e) { try { console.error(e); } catch (e2) {} }
        var p = document.createElement('p');
        p.style.textAlign = 'center';
        var img = document.createElement('img');
        img.className = 'fr-dib fr-draggable';
        img.setAttribute('data-real-src', path);
        img.src = resolveImg(path);
        img.style.width = '100%';
        img.style.maxWidth = '720px';
        p.appendChild(img);
        insertNodeAtSelection(p);
      }).catch(function (err) { try { console.error('[tab-board] pickImage error', err); } catch (e) {} });
    });

    var hrBtn = byId(rootEl, 'bd-e-hr');
    if (hrBtn) hrBtn.addEventListener('click', function () { saveSelection(); insertHtmlAtSelection('<hr>'); });

    var centerBtn = byId(rootEl, 'bd-e-center');
    if (centerBtn) centerBtn.addEventListener('click', function () { applyAlign('center'); });
    var leftBtn = byId(rootEl, 'bd-e-left');
    if (leftBtn) leftBtn.addEventListener('click', function () { applyAlign('left'); });

    function applyAlign(align) {
      saveSelection();
      restoreSelection();
      var applied = false;
      try { applied = document.execCommand(align === 'center' ? 'justifyCenter' : 'justifyLeft', false, null); } catch (e) { applied = false; }
      if (!applied) {
        try {
          var sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return;
          var node = sel.getRangeAt(0).commonAncestorContainer;
          var target = node.nodeType === 1 ? node : node.parentElement;
          while (target && target !== editorEl && !/^(P|DIV|H[1-6]|LI)$/.test(target.tagName)) target = target.parentElement;
          if (target && target !== editorEl) target.style.textAlign = align;
        } catch (e) {}
      }
    }

    var tplBtn = byId(rootEl, 'bd-e-tpl');
    if (tplBtn) tplBtn.addEventListener('click', function () {
      saveSelection();
      insertHtmlAtSelection(TEMPLATE_HTML);
    });

    var thumbBtn = byId(rootEl, 'bd-e-thumbbtn');
    var thumbPrev = byId(rootEl, 'bd-e-thumbprev');
    if (thumbBtn) thumbBtn.addEventListener('click', function () {
      if (!window.AdminUtil || typeof window.AdminUtil.pickImage !== 'function') {
        alert('이미지 업로드 기능을 사용할 수 없습니다.');
        return;
      }
      window.AdminUtil.pickImage({ maxW: 800, quality: 0.85 }).then(function (res) {
        if (!res || !res.bytes) return;
        var path = 'images/uploads/thumb-' + timestamp() + '.' + (res.ext || 'jpg');
        previewCache[path] = res.previewUrl;
        try { window.GH.stageBinary(path, res.bytes, '썸네일 업로드: ' + path); } catch (e) { try { console.error(e); } catch (e2) {} }
        post.thumb = path;
        if (thumbPrev) { thumbPrev.src = resolveImg(path); thumbPrev.style.display = ''; }
      }).catch(function (err) { try { console.error('[tab-board] pickImage error', err); } catch (e) {} });
    });

    var cancelBtn = byId(rootEl, 'bd-e-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function () {
      if (confirm('편집을 취소할까요? 작성 중인 내용은 저장되지 않습니다.')) closeEditor();
    });

    var previewBtn = byId(rootEl, 'bd-e-preview');
    if (previewBtn) previewBtn.addEventListener('click', function () {
      showPostPreview(byId(rootEl, 'bd-e-title') ? byId(rootEl, 'bd-e-title').value : post.title, editorEl.innerHTML);
    });

    var saveBtn = byId(rootEl, 'bd-e-save');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      try {
        var titleInput = byId(rootEl, 'bd-e-title');
        var title = titleInput ? titleInput.value.trim() : '';
        if (!title) { alert('제목을 입력해주세요.'); return; }
        var bodyHtml = buildStoredHtml(editorEl);

        var finalPost = {
          idx: post.idx || ('n' + Date.now()),
          title: title,
          thumb: post.thumb || '',
          bodyHtml: bodyHtml
        };

        if (isNew) {
          boardData.posts.unshift(finalPost);
        } else {
          var idx = -1;
          for (var i = 0; i < boardData.posts.length; i++) { if (boardData.posts[i].idx === finalPost.idx) { idx = i; break; } }
          if (idx >= 0) boardData.posts[idx] = finalPost; else boardData.posts.unshift(finalPost);
        }

        stageCurrentBoard((isNew ? '실제사례 글 추가' : '실제사례 글 수정') + ': ' + title);
        closeEditor();
        renderList();
      } catch (e) {
        try { console.error('[tab-board] save error', e); } catch (e2) {}
        alert('저장 중 오류가 발생했습니다.');
      }
    });

    try { holder.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
  }

  // ---------- 본문 미리보기 ----------
  function showPostPreview(title, innerHtml) {
    if (!rootEl) return;
    var holder = byId(rootEl, 'bd-preview-holder');
    if (!holder) return;
    try {
      holder.innerHTML =
        '<div class="bd-preview-overlay" id="bd-preview-overlay">' +
        '<div class="bd-preview-card">' +
        '<div class="bd-preview-bar"><button type="button" class="bd-btn" id="bd-preview-close">닫기</button></div>' +
        '<div class="bd-frview"><h2 style="text-align:center;font-size:20px;margin:0 0 16px;">' + escapeHtml(title || '') + '</h2>' + innerHtml + '</div>' +
        '</div>' +
        '</div>';
      var overlay = byId(rootEl, 'bd-preview-overlay');
      function close() { holder.innerHTML = ''; }
      if (overlay) overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
      var closeBtn = byId(rootEl, 'bd-preview-close');
      if (closeBtn) closeBtn.addEventListener('click', close);
    } catch (e) {
      try { console.error('[tab-board] preview error', e); } catch (e2) {}
    }
  }

  // ---------- 등록 ----------
  try {
    if (window.AdminTabs && typeof window.AdminTabs.register === 'function') {
      window.AdminTabs.register(TAB_ID, { title: '실제사례 관리', render: render, onShow: onShow });
    } else {
      try { console.error('[tab-board] window.AdminTabs.register 를 찾을 수 없습니다.'); } catch (e) {}
    }
  } catch (e) {
    try { console.error('[tab-board] register failed', e); } catch (e2) {}
  }
})();
