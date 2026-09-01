/**
 * tab-popup.js — 관리자 "팝업 관리" 탭
 * 데이터: data/popups.js → window.__POPUPS = [{id,image,link,width,left,top,start,end,enabled,hideDays}, ...]
 * 이 파일은 window.GH / window.AdminUtil / window.AdminTabs.register 계약만 사용한다.
 * DOM은 register(render)에서 전달되는 el 컨테이너 내부에만 생성한다.
 */
(function () {
  'use strict';

  var TAB_ID = 'popup';
  var DATA_PATH = 'data/popups.js';
  var STYLE_ID = 'admin-style-tab-popup';

  var rootEl = null;
  var loaded = false;
  var loading = false;
  var popups = [];
  var previewCache = {}; // path -> previewUrl(blob/data), 이번 세션에서 새로 올린 이미지만

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
  function todayKST() {
    try { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }
    catch (e) { return ''; }
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

  // ---------- 스타일 ----------
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '.pp-wrap{font-size:14px;color:#333;}',
      '.pp-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;}',
      '.pp-btn{display:inline-block;padding:8px 14px;border:1px solid #ddd;border-radius:6px;background:#fff;color:#333;cursor:pointer;font-size:13px;}',
      '.pp-btn:hover{border-color:#ff6000;color:#ff6000;}',
      '.pp-btn-primary{background:#ff6000;border-color:#ff6000;color:#fff;}',
      '.pp-btn-primary:hover{background:#e55500;color:#fff;}',
      '.pp-btn-danger{border-color:#e33;color:#e33;}',
      '.pp-btn-danger:hover{background:#e33;color:#fff;}',
      '.pp-btn-small{padding:5px 10px;font-size:12px;}',
      '.pp-status{color:#888;margin-bottom:10px;min-height:18px;}',
      '.pp-error{color:#e33;}',
      '.pp-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;}',
      '.pp-card{border:1px solid #eee;border-radius:10px;overflow:hidden;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.06);display:flex;flex-direction:column;}',
      '.pp-card-thumb{width:100%;height:140px;background:#f5f5f5 center/contain no-repeat;display:flex;align-items:center;justify-content:center;overflow:hidden;}',
      '.pp-card-thumb img{max-width:100%;max-height:100%;object-fit:contain;}',
      '.pp-card-body{padding:10px 12px;flex:1;}',
      '.pp-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;margin-bottom:6px;}',
      '.pp-badge-on{background:#e8f7ee;color:#1a9a4c;}',
      '.pp-badge-out{background:#f0f0f0;color:#888;}',
      '.pp-badge-off{background:#fdeaea;color:#c0392b;}',
      '.pp-card-row{color:#666;font-size:12px;margin:2px 0;word-break:break-all;}',
      '.pp-card-actions{display:flex;gap:6px;padding:8px 12px;border-top:1px solid #f0f0f0;}',
      '.pp-empty{color:#999;padding:30px 10px;text-align:center;}',
      '.pp-modal-back{position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,.45);z-index:2000;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:30px 14px;}',
      '.pp-modal{background:#fff;border-radius:10px;max-width:480px;width:100%;padding:20px 22px 22px;box-shadow:0 8px 30px rgba(0,0,0,.25);}',
      '.pp-modal h3{margin:0 0 14px;font-size:16px;color:#222;}',
      '.pp-form-row{margin-bottom:12px;}',
      '.pp-form-row label{display:block;font-size:12px;color:#666;margin-bottom:4px;}',
      '.pp-form-row input[type=text],.pp-form-row input[type=number],.pp-form-row input[type=date]{width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #ddd;border-radius:5px;font-size:13px;}',
      '.pp-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}',
      '.pp-check-row{display:flex;align-items:center;gap:8px;}',
      '.pp-img-pick{display:flex;align-items:center;gap:10px;}',
      '.pp-img-pick img{width:70px;height:70px;object-fit:contain;background:#f5f5f5;border:1px solid #eee;border-radius:6px;}',
      '.pp-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px;}',
      '.pp-preview-overlay{position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(30,30,30,.35);z-index:2100;}',
      '.pp-preview-close-bar{position:fixed;top:14px;right:14px;z-index:2101;}',
      '.popup-banner-wrap{display:block;}',
      '.pop-container{position:fixed;}',
      '.pop-item{background:#fff;border-radius:4px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.3);}',
      '.pop-img{position:relative;}',
      '.pop-img img{display:block;}',
      '.pop-img a.del{position:absolute;right:6px;top:4px;color:#979797;font-size:16px;text-decoration:none;background:rgba(255,255,255,.8);border-radius:50%;width:20px;height:20px;line-height:20px;text-align:center;}',
      '.btn-group.clearfix{display:flex;}',
      '.btn-group .btn{flex:1;text-align:center;padding:8px 0;background:#333;color:#fff;font-size:12px;text-decoration:none;cursor:pointer;}',
      '.btn-group .btn.right{background:#555;}'
    ].join('\n');
    var styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  // ---------- 직렬화 ----------
  function serialize(list) {
    return 'window.__POPUPS = ' + JSON.stringify(list, null, 2) + ';\n';
  }

  // ---------- 렌더 ----------
  function render(el) {
    rootEl = el;
    try {
      injectStyles();
      el.innerHTML =
        '<div class="pp-wrap">' +
        '<div class="pp-toolbar">' +
        '<button type="button" class="pp-btn pp-btn-primary" id="pp-add-btn">+ 새 팝업 추가</button>' +
        '<button type="button" class="pp-btn" id="pp-refresh-btn">새로고침</button>' +
        '</div>' +
        '<div class="pp-status" id="pp-status"></div>' +
        '<div class="pp-list" id="pp-list"></div>' +
        '<div id="pp-modal-holder"></div>' +
        '<div id="pp-preview-holder"></div>' +
        '</div>';

      var addBtn = byId(el, 'pp-add-btn');
      if (addBtn) addBtn.addEventListener('click', function () { openForm(null); });
      var refreshBtn = byId(el, 'pp-refresh-btn');
      if (refreshBtn) refreshBtn.addEventListener('click', function () {
        try {
          if (loaded && !confirm('새로고침하면 아직 게시하지 않은 화면 표시가 초기화될 수 있습니다(저장 대기 항목은 유지됩니다). 계속할까요?')) return;
        } catch (e) {}
        loadData(true);
      });

      loadData(false);
    } catch (e) {
      try { el.innerHTML = '<p class="pp-error">팝업 관리 화면을 불러오는 중 오류가 발생했습니다.</p>'; } catch (e2) {}
      try { console.error('[tab-popup] render error', e); } catch (e3) {}
    }
  }

  function onShow() {
    try {
      if (!loaded && !loading) loadData(false);
    } catch (e) { try { console.error('[tab-popup] onShow error', e); } catch (e2) {} }
  }

  function setStatus(text, isError) {
    if (!rootEl) return;
    var s = byId(rootEl, 'pp-status');
    if (!s) return;
    s.textContent = text || '';
    s.className = 'pp-status' + (isError ? ' pp-error' : '');
  }

  function loadData(forceReload) {
    if (!rootEl) return;
    if (!window.GH || typeof window.GH.readJsData !== 'function') {
      setStatus('GitHub 연동 모듈을 불러올 수 없습니다.', true);
      return;
    }
    loading = true;
    setStatus('불러오는 중...');
    window.GH.readJsData(DATA_PATH).then(function (data) {
      loading = false;
      loaded = true;
      popups = Array.isArray(data) ? data : [];
      setStatus('');
      renderList();
    }).catch(function (err) {
      loading = false;
      var msg = (err && err.message) ? err.message : String(err);
      setStatus('팝업 데이터를 불러오지 못했습니다: ' + msg, true);
      try { console.error('[tab-popup] loadData error', err); } catch (e) {}
      renderList();
    });
  }

  function statusOf(p) {
    try {
      if (!p.enabled) return { label: '사용안함', cls: 'pp-badge-off' };
      var today = todayKST();
      if (today && p.start && today < p.start) return { label: '기간외', cls: 'pp-badge-out' };
      if (today && p.end && today > p.end) return { label: '기간외', cls: 'pp-badge-out' };
      return { label: '표시중', cls: 'pp-badge-on' };
    } catch (e) { return { label: '-', cls: 'pp-badge-out' }; }
  }

  function renderList() {
    if (!rootEl) return;
    var list = byId(rootEl, 'pp-list');
    if (!list) return;
    try {
      if (!popups.length) {
        list.innerHTML = '<div class="pp-empty">등록된 팝업이 없습니다. "+ 새 팝업 추가"로 만들어보세요.</div>';
        return;
      }
      var html = popups.map(function (p, i) {
        var st = statusOf(p);
        var src = resolveImg(p.image);
        return (
          '<div class="pp-card" data-idx="' + i + '">' +
          '<div class="pp-card-thumb">' + (src ? '<img src="' + escapeHtml(src) + '" alt="">' : '이미지 없음') + '</div>' +
          '<div class="pp-card-body">' +
          '<span class="pp-badge ' + st.cls + '">' + st.label + '</span>' +
          '<div class="pp-card-row">기간: ' + escapeHtml(p.start || '?') + ' ~ ' + escapeHtml(p.end || '?') + '</div>' +
          '<div class="pp-card-row">위치: left ' + escapeHtml(p.left) + 'px / top ' + escapeHtml(p.top) + 'px · 너비 ' + escapeHtml(p.width) + 'px</div>' +
          '<div class="pp-card-row">' + (p.hideDays ? escapeHtml(p.hideDays) + '일 동안 보지 않음' : '') + '</div>' +
          '<div class="pp-card-row">링크: ' + (p.link ? escapeHtml(p.link) : '없음') + '</div>' +
          '</div>' +
          '<div class="pp-card-actions">' +
          '<button type="button" class="pp-btn pp-btn-small" data-act="preview">미리보기</button>' +
          '<button type="button" class="pp-btn pp-btn-small" data-act="edit">수정</button>' +
          '<button type="button" class="pp-btn pp-btn-small pp-btn-danger" data-act="delete">삭제</button>' +
          '</div>' +
          '</div>'
        );
      }).join('');
      list.innerHTML = html;
      list.querySelectorAll('.pp-card').forEach(function (card) {
        var idx = Number(card.getAttribute('data-idx'));
        card.querySelectorAll('button[data-act]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var act = btn.getAttribute('data-act');
            var p = popups[idx];
            if (!p) return;
            if (act === 'edit') openForm(p);
            else if (act === 'delete') handleDelete(p);
            else if (act === 'preview') showPreview(p, null);
          });
        });
      });
    } catch (e) {
      try { console.error('[tab-popup] renderList error', e); } catch (e2) {}
      list.innerHTML = '<div class="pp-error">목록을 표시하는 중 오류가 발생했습니다.</div>';
    }
  }

  function handleDelete(p) {
    try {
      if (!confirm('팝업을 삭제할까요?')) return;
      popups = popups.filter(function (x) { return x.id !== p.id; });
      window.GH.stageText(DATA_PATH, serialize(popups), '팝업 삭제 (' + p.id + ')');
      renderList();
    } catch (e) {
      try { console.error('[tab-popup] delete error', e); } catch (e2) {}
      alert('삭제 중 오류가 발생했습니다.');
    }
  }

  // ---------- 폼(추가/수정) ----------
  function openForm(existing) {
    if (!rootEl) return;
    var holder = byId(rootEl, 'pp-modal-holder');
    if (!holder) return;

    var isNew = !existing;
    var model = existing ? JSON.parse(JSON.stringify(existing)) : {
      id: '', image: '', link: '', width: 501, left: 550, top: 100,
      start: todayKST(), end: '2099-12-31', enabled: true, hideDays: 1
    };
    var pendingImage = null; // {bytes, ext, path}

    var html =
      '<div class="pp-modal-back">' +
      '<div class="pp-modal">' +
      '<h3>' + (isNew ? '새 팝업 추가' : '팝업 수정') + '</h3>' +
      '<div class="pp-form-row">' +
      '<label>이미지 (필수)</label>' +
      '<div class="pp-img-pick">' +
      '<img id="pp-f-imgprev" src="' + escapeHtml(resolveImg(model.image)) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
      '<button type="button" class="pp-btn" id="pp-f-imgbtn">이미지 선택</button>' +
      '</div>' +
      '</div>' +
      '<div class="pp-form-row"><label>링크 URL (선택)</label><input type="text" id="pp-f-link" value="' + escapeHtml(model.link) + '" placeholder="https://..."></div>' +
      '<div class="pp-form-grid">' +
      '<div class="pp-form-row"><label>표시 시작일</label><input type="date" id="pp-f-start" value="' + escapeHtml(model.start) + '"></div>' +
      '<div class="pp-form-row"><label>표시 종료일</label><input type="date" id="pp-f-end" value="' + escapeHtml(model.end) + '"></div>' +
      '</div>' +
      '<div class="pp-form-row pp-check-row"><input type="checkbox" id="pp-f-enabled" ' + (model.enabled ? 'checked' : '') + '><label style="margin:0;" for="pp-f-enabled">사용함</label></div>' +
      '<div class="pp-form-grid">' +
      '<div class="pp-form-row"><label>N일 동안 보지 않음</label><input type="number" id="pp-f-hidedays" value="' + escapeHtml(model.hideDays) + '" min="0"></div>' +
      '<div class="pp-form-row"><label>너비(px)</label><input type="number" id="pp-f-width" value="' + escapeHtml(model.width) + '" min="1"></div>' +
      '</div>' +
      '<div class="pp-form-grid">' +
      '<div class="pp-form-row"><label>위치 left(px)</label><input type="number" id="pp-f-left" value="' + escapeHtml(model.left) + '"></div>' +
      '<div class="pp-form-row"><label>위치 top(px)</label><input type="number" id="pp-f-top" value="' + escapeHtml(model.top) + '"></div>' +
      '</div>' +
      '<div class="pp-modal-actions">' +
      '<button type="button" class="pp-btn" id="pp-f-preview">미리보기</button>' +
      '<button type="button" class="pp-btn" id="pp-f-cancel">취소</button>' +
      '<button type="button" class="pp-btn pp-btn-primary" id="pp-f-save">저장</button>' +
      '</div>' +
      '</div></div>';
    holder.innerHTML = html;

    var imgPrev = byId(rootEl, 'pp-f-imgprev');
    var imgBtn = byId(rootEl, 'pp-f-imgbtn');
    if (imgBtn) imgBtn.addEventListener('click', function () {
      if (!window.AdminUtil || typeof window.AdminUtil.pickImage !== 'function') {
        alert('이미지 업로드 기능을 사용할 수 없습니다.');
        return;
      }
      window.AdminUtil.pickImage({ maxW: 1200, quality: 0.85 }).then(function (res) {
        if (!res || !res.bytes) return;
        var path = 'images/uploads/popup-' + timestamp() + '.' + (res.ext || 'jpg');
        previewCache[path] = res.previewUrl;
        pendingImage = { bytes: res.bytes, path: path };
        model.image = path;
        if (imgPrev) { imgPrev.src = resolveImg(path); imgPrev.style.visibility = 'visible'; }
      }).catch(function (err) { try { console.error('[tab-popup] pickImage error', err); } catch (e) {} });
    });

    function closeForm() { holder.innerHTML = ''; }

    var cancelBtn = byId(rootEl, 'pp-f-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeForm);

    function readFormValues() {
      return {
        link: (byId(rootEl, 'pp-f-link') || {}).value || '',
        start: (byId(rootEl, 'pp-f-start') || {}).value || '',
        end: (byId(rootEl, 'pp-f-end') || {}).value || '',
        enabled: !!((byId(rootEl, 'pp-f-enabled') || {}).checked),
        hideDays: Number((byId(rootEl, 'pp-f-hidedays') || {}).value) || 0,
        width: Number((byId(rootEl, 'pp-f-width') || {}).value) || 501,
        left: Number((byId(rootEl, 'pp-f-left') || {}).value) || 0,
        top: Number((byId(rootEl, 'pp-f-top') || {}).value) || 0
      };
    }

    var previewBtn = byId(rootEl, 'pp-f-preview');
    if (previewBtn) previewBtn.addEventListener('click', function () {
      var v = readFormValues();
      var tmp = { image: model.image, link: v.link, width: v.width, left: v.left, top: v.top, hideDays: v.hideDays };
      showPreview(tmp, resolveImg(model.image));
    });

    var saveBtn = byId(rootEl, 'pp-f-save');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      try {
        var v = readFormValues();
        var errors = [];
        if (!model.image) errors.push('이미지를 선택해주세요.');
        if (!v.start) errors.push('시작일을 입력해주세요.');
        if (!v.end) errors.push('종료일을 입력해주세요.');
        if (v.start && v.end && v.start > v.end) errors.push('시작일이 종료일보다 늦을 수 없습니다.');
        if (errors.length) { alert(errors.join('\n')); return; }

        var popup = {
          id: model.id || ('p' + Date.now()),
          image: model.image,
          link: v.link,
          width: v.width,
          left: v.left,
          top: v.top,
          start: v.start,
          end: v.end,
          enabled: v.enabled,
          hideDays: v.hideDays
        };

        var idx = -1;
        for (var i = 0; i < popups.length; i++) { if (popups[i].id === popup.id) { idx = i; break; } }
        if (idx >= 0) popups[idx] = popup; else popups.push(popup);

        if (pendingImage) {
          window.GH.stageBinary(pendingImage.path, pendingImage.bytes, '팝업 이미지 업로드: ' + pendingImage.path);
        }
        window.GH.stageText(DATA_PATH, serialize(popups), (isNew ? '팝업 추가' : '팝업 수정') + ' (' + popup.id + ')');

        closeForm();
        renderList();
      } catch (e) {
        try { console.error('[tab-popup] save error', e); } catch (e2) {}
        alert('저장 중 오류가 발생했습니다.');
      }
    });
  }

  // ---------- 미리보기(실제 마크업 오버레이) ----------
  function showPreview(p, imgSrcOverride) {
    if (!rootEl) return;
    var holder = byId(rootEl, 'pp-preview-holder');
    if (!holder) return;
    try {
      var src = imgSrcOverride || resolveImg(p.image);
      var width = Number(p.width) || 501;
      var left = Number(p.left) || 0;
      var top = Number(p.top) || 0;
      var hideDays = Number(p.hideDays) || 1;
      var linkOpen = p.link ? ('<a href="' + escapeHtml(p.link) + '" target="_blank" rel="noopener">') : '';
      var linkClose = p.link ? '</a>' : '';
      var html =
        '<div class="pp-preview-overlay" id="pp-preview-overlay">' +
        '<div class="popup-banner-wrap" id="backup-popups">' +
        '<div class="pop-container" style="z-index:1001;left:' + left + 'px;top:' + top + 'px;">' +
        '<div class="pop-item">' +
        '<div class="pop-img">' +
        '<a href="javascript:;" class="btl bt-times del" title="닫기">×</a>' +
        linkOpen + '<img src="' + escapeHtml(src) + '" style="width:' + width + 'px;max-width:92vw" alt="">' + linkClose +
        '</div>' +
        '<div class="btn-group clearfix" style="width:' + width + 'px;max-width:92vw">' +
        '<a href="javascript:;" class="btn btn-flat">' + hideDays + '일 동안 보지 않음</a>' +
        '<a href="javascript:;" class="btn btn-flat right">닫기</a>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '<div class="pp-preview-close-bar"><button type="button" class="pp-btn pp-btn-primary" id="pp-preview-exit">미리보기 종료</button></div>' +
        '</div>';
      holder.innerHTML = html;
      function closePreview() { holder.innerHTML = ''; }
      var overlay = byId(rootEl, 'pp-preview-overlay');
      if (overlay) overlay.addEventListener('click', function (e) { if (e.target === overlay) closePreview(); });
      var exitBtn = byId(rootEl, 'pp-preview-exit');
      if (exitBtn) exitBtn.addEventListener('click', closePreview);
      holder.querySelectorAll('.del, .btn-flat').forEach(function (btn) {
        btn.addEventListener('click', closePreview);
      });
    } catch (e) {
      try { console.error('[tab-popup] preview error', e); } catch (e2) {}
    }
  }

  // ---------- 등록 ----------
  try {
    if (window.AdminTabs && typeof window.AdminTabs.register === 'function') {
      window.AdminTabs.register(TAB_ID, { title: '팝업 관리', render: render, onShow: onShow });
    } else {
      try { console.error('[tab-popup] window.AdminTabs.register 를 찾을 수 없습니다.'); } catch (e) {}
    }
  } catch (e) {
    try { console.error('[tab-popup] register failed', e); } catch (e2) {}
  }
})();
