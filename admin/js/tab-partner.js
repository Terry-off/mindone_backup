/**
 * tab-partner.js — 관리자 "협약기관 관리" 탭
 * 데이터: data/partners.js → window.__PARTNERS = { targets:{featured:[...],logos:[...]}, featured:[{name,desc,logo}], logos:[{name,logo}] }
 * targets 배열은 런타임(backup/js/partners.js)이 DOM 위젯을 찾는 데 쓰는 값이므로 이 탭에서는 절대 수정하지 않는다.
 * 이 파일은 window.GH / window.AdminUtil / window.AdminTabs.register 계약만 사용한다.
 * DOM은 register(render)에서 전달되는 el 컨테이너 내부에만 생성한다.
 */
(function () {
  'use strict';

  var TAB_ID = 'partner';
  var DATA_PATH = 'data/partners.js';
  var STYLE_ID = 'admin-style-tab-partner';

  var rootEl = null;
  var loaded = false;
  var loading = false;
  var data = null; // {targets, featured, logos}
  var previewCache = {}; // path -> previewUrl

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
  function truncate(s, n) {
    s = s || '';
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  // ---------- 스타일 ----------
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '.pt-wrap{font-size:14px;color:#333;}',
      '.pt-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:10px;}',
      '.pt-btn{display:inline-block;padding:8px 14px;border:1px solid #ddd;border-radius:6px;background:#fff;color:#333;cursor:pointer;font-size:13px;}',
      '.pt-btn:hover{border-color:#ff6000;color:#ff6000;}',
      '.pt-btn-primary{background:#ff6000;border-color:#ff6000;color:#fff;}',
      '.pt-btn-primary:hover{background:#e55500;color:#fff;}',
      '.pt-btn-danger{border-color:#e33;color:#e33;}',
      '.pt-btn-danger:hover{background:#e33;color:#fff;}',
      '.pt-btn-small{padding:4px 9px;font-size:12px;}',
      '.pt-status{color:#888;margin-bottom:10px;min-height:18px;}',
      '.pt-error{color:#e33;}',
      '.pt-section{margin-bottom:30px;}',
      '.pt-section h3{font-size:15px;margin:0 0 4px;}',
      '.pt-section-desc{color:#888;font-size:12px;margin:0 0 12px;}',
      '.pt-empty{color:#999;padding:20px 10px;text-align:center;background:#fafafa;border-radius:8px;}',
      '.pt-featured-list{display:flex;flex-direction:column;gap:8px;}',
      '.pt-featured-item{display:flex;align-items:center;gap:12px;border:1px solid #eee;border-radius:8px;padding:10px 12px;background:#fff;}',
      '.pt-featured-item img{width:56px;height:56px;object-fit:contain;background:#f5f5f5;border:1px solid #eee;border-radius:6px;flex-shrink:0;}',
      '.pt-featured-info{flex:1;min-width:0;}',
      '.pt-featured-info .name{font-weight:600;}',
      '.pt-featured-info .desc{color:#777;font-size:12px;margin-top:2px;}',
      '.pt-item-actions{display:flex;gap:6px;flex-shrink:0;}',
      '.pt-logo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px;}',
      '.pt-logo-card{border:1px solid #eee;border-radius:8px;padding:8px;background:#fff;text-align:center;}',
      '.pt-logo-card img{width:100%;height:64px;object-fit:contain;background:#f5f5f5;border-radius:4px;}',
      '.pt-logo-card .name{font-size:11px;color:#777;margin:4px 0;height:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.pt-logo-actions{display:flex;justify-content:center;gap:4px;}',
      '.pt-modal-back{position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,.45);z-index:2000;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:30px 14px;}',
      '.pt-modal{background:#fff;border-radius:10px;max-width:440px;width:100%;padding:20px 22px 22px;box-shadow:0 8px 30px rgba(0,0,0,.25);}',
      '.pt-modal h3{margin:0 0 14px;font-size:16px;}',
      '.pt-form-row{margin-bottom:12px;}',
      '.pt-form-row label{display:block;font-size:12px;color:#666;margin-bottom:4px;}',
      '.pt-form-row input[type=text]{width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #ddd;border-radius:5px;font-size:13px;}',
      '.pt-form-row textarea{width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #ddd;border-radius:5px;font-size:13px;min-height:70px;resize:vertical;font-family:inherit;}',
      '.pt-img-pick{display:flex;align-items:center;gap:10px;}',
      '.pt-img-pick img{width:64px;height:64px;object-fit:contain;background:#f5f5f5;border:1px solid #eee;border-radius:6px;}',
      '.pt-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px;}'
    ].join('\n');
    var styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  // ---------- 직렬화 ----------
  function serialize() {
    // revision을 올려야 사이트 런타임이 원본 마크업 대신 이 데이터로 협약기관을 그린다.
    // (revision 0 = 아임웹 원본 마크업 그대로 표시)
    data.revision = (parseInt(data.revision, 10) || 0) + 1;
    return 'window.__PARTNERS = ' + JSON.stringify(data, null, 2) + ';\n';
  }
  function stageData(label) {
    try {
      window.GH.stageText(DATA_PATH, serialize(), label);
    } catch (e) {
      try { console.error('[tab-partner] stage error', e); } catch (e2) {}
      alert('저장 대기 목록에 추가하는 중 오류가 발생했습니다.');
    }
  }

  // ---------- 렌더 ----------
  function render(el) {
    rootEl = el;
    try {
      injectStyles();
      el.innerHTML =
        '<div class="pt-wrap">' +
        '<div class="pt-toolbar"><button type="button" class="pt-btn" id="pt-refresh-btn">새로고침</button></div>' +
        '<div class="pt-status" id="pt-status"></div>' +
        '<div class="pt-section">' +
        '<h3>대표 협약 기업·협회</h3>' +
        '<p class="pt-section-desc">홈페이지 상단에 로고·설명과 함께 강조 노출되는 협약 기관입니다.</p>' +
        '<div id="pt-featured-list"></div>' +
        '<div style="margin-top:10px;"><button type="button" class="pt-btn pt-btn-primary" id="pt-featured-add">+ 대표 협약 기관 추가</button></div>' +
        '</div>' +
        '<div class="pt-section">' +
        '<h3>협약 로고 그리드</h3>' +
        '<p class="pt-section-desc">여러 협약 기관 로고를 격자로 나열해 보여줍니다.</p>' +
        '<div id="pt-logo-grid"></div>' +
        '<div style="margin-top:10px;"><button type="button" class="pt-btn pt-btn-primary" id="pt-logo-add">+ 로고 추가</button></div>' +
        '</div>' +
        '<div id="pt-modal-holder"></div>' +
        '</div>';

      var refreshBtn = byId(el, 'pt-refresh-btn');
      if (refreshBtn) refreshBtn.addEventListener('click', function () {
        try {
          if (loaded && !confirm('새로고침하면 아직 게시하지 않은 화면 표시가 초기화될 수 있습니다(저장 대기 항목은 유지됩니다). 계속할까요?')) return;
        } catch (e) {}
        loadData();
      });
      var featAddBtn = byId(el, 'pt-featured-add');
      if (featAddBtn) featAddBtn.addEventListener('click', function () { openFeaturedForm(-1); });
      var logoAddBtn = byId(el, 'pt-logo-add');
      if (logoAddBtn) logoAddBtn.addEventListener('click', function () { openLogoForm(-1); });

      loadData();
    } catch (e) {
      try { el.innerHTML = '<p class="pt-error">협약기관 관리 화면을 불러오는 중 오류가 발생했습니다.</p>'; } catch (e2) {}
      try { console.error('[tab-partner] render error', e); } catch (e3) {}
    }
  }

  function onShow() {
    try {
      if (!loaded && !loading) loadData();
    } catch (e) { try { console.error('[tab-partner] onShow error', e); } catch (e2) {} }
  }

  function setStatus(text, isError) {
    if (!rootEl) return;
    var s = byId(rootEl, 'pt-status');
    if (!s) return;
    s.textContent = text || '';
    s.className = 'pt-status' + (isError ? ' pt-error' : '');
  }

  function loadData() {
    if (!rootEl) return;
    if (!window.GH || typeof window.GH.readJsData !== 'function') {
      setStatus('GitHub 연동 모듈을 불러올 수 없습니다.', true);
      return;
    }
    loading = true;
    setStatus('불러오는 중...');
    window.GH.readJsData(DATA_PATH).then(function (d) {
      loading = false;
      loaded = true;
      var src = (d && typeof d === 'object') ? d : {};
      data = {
        targets: src.targets || { featured: [], logos: [] },
        featured: Array.isArray(src.featured) ? src.featured : [],
        logos: Array.isArray(src.logos) ? src.logos : []
      };
      setStatus('');
      renderAll();
    }).catch(function (err) {
      loading = false;
      data = { targets: { featured: [], logos: [] }, featured: [], logos: [] };
      var msg = (err && err.message) ? err.message : String(err);
      setStatus('협약기관 데이터를 불러오지 못했습니다: ' + msg, true);
      try { console.error('[tab-partner] loadData error', err); } catch (e) {}
      renderAll();
    });
  }

  function renderAll() {
    renderFeaturedList();
    renderLogoGrid();
  }

  // ---------- 섹션 1: 대표 협약 기업·협회 ----------
  function renderFeaturedList() {
    if (!rootEl) return;
    var holder = byId(rootEl, 'pt-featured-list');
    if (!holder) return;
    try {
      var list = (data && data.featured) || [];
      if (!list.length) {
        holder.innerHTML = '<div class="pt-empty">등록된 대표 협약 기관이 없습니다.</div>';
        return;
      }
      holder.innerHTML = '<div class="pt-featured-list">' + list.map(function (item, i) {
        return (
          '<div class="pt-featured-item" data-idx="' + i + '">' +
          '<img src="' + escapeHtml(resolveImg(item.logo)) + '" alt="">' +
          '<div class="pt-featured-info"><div class="name">' + escapeHtml(item.name || '(이름 없음)') + '</div>' +
          '<div class="desc">' + escapeHtml(truncate(item.desc || '', 60)) + '</div></div>' +
          '<div class="pt-item-actions">' +
          '<button type="button" class="pt-btn pt-btn-small" data-act="up"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button type="button" class="pt-btn pt-btn-small" data-act="down"' + (i === list.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '<button type="button" class="pt-btn pt-btn-small" data-act="edit">수정</button>' +
          '<button type="button" class="pt-btn pt-btn-small pt-btn-danger" data-act="delete">삭제</button>' +
          '</div>' +
          '</div>'
        );
      }).join('') + '</div>';

      holder.querySelectorAll('.pt-featured-item').forEach(function (row) {
        var idx = Number(row.getAttribute('data-idx'));
        row.querySelectorAll('button[data-act]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var act = btn.getAttribute('data-act');
            if (act === 'edit') openFeaturedForm(idx);
            else if (act === 'delete') deleteFeatured(idx);
            else if (act === 'up') moveFeatured(idx, -1);
            else if (act === 'down') moveFeatured(idx, 1);
          });
        });
      });
    } catch (e) {
      try { console.error('[tab-partner] renderFeaturedList error', e); } catch (e2) {}
      holder.innerHTML = '<div class="pt-error">목록을 표시하는 중 오류가 발생했습니다.</div>';
    }
  }

  function deleteFeatured(idx) {
    try {
      var item = data.featured[idx];
      if (!item) return;
      if (!confirm('이 협약 기관을 삭제할까요?')) return;
      data.featured.splice(idx, 1);
      stageData('대표 협약 기관 삭제: ' + (item.name || ''));
      renderFeaturedList();
    } catch (e) { try { console.error(e); } catch (e2) {} }
  }

  function moveFeatured(idx, dir) {
    try {
      var arr = data.featured;
      var n = idx + dir;
      if (n < 0 || n >= arr.length) return;
      var tmp = arr[idx]; arr[idx] = arr[n]; arr[n] = tmp;
      stageData('대표 협약 기관 순서 변경');
      renderFeaturedList();
    } catch (e) { try { console.error(e); } catch (e2) {} }
  }

  function openFeaturedForm(idx) {
    if (!rootEl) return;
    var holder = byId(rootEl, 'pt-modal-holder');
    if (!holder) return;
    var isNew = idx < 0;
    var model = isNew ? { name: '', desc: '', logo: '' } : JSON.parse(JSON.stringify(data.featured[idx]));
    var pendingImage = null;

    holder.innerHTML =
      '<div class="pt-modal-back"><div class="pt-modal">' +
      '<h3>' + (isNew ? '대표 협약 기관 추가' : '대표 협약 기관 수정') + '</h3>' +
      '<div class="pt-form-row"><label>로고 이미지</label>' +
      '<div class="pt-img-pick"><img id="pt-ff-logoprev" src="' + escapeHtml(resolveImg(model.logo)) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
      '<button type="button" class="pt-btn" id="pt-ff-logobtn">로고 선택</button></div></div>' +
      '<div class="pt-form-row"><label>기관명</label><input type="text" id="pt-ff-name" value="' + escapeHtml(model.name) + '" placeholder="예: 한국산업인력공단"></div>' +
      '<div class="pt-form-row"><label>설명</label><textarea id="pt-ff-desc" placeholder="협약 내용을 간단히 입력하세요">' + escapeHtml(model.desc) + '</textarea></div>' +
      '<div class="pt-modal-actions">' +
      '<button type="button" class="pt-btn" id="pt-ff-cancel">취소</button>' +
      '<button type="button" class="pt-btn pt-btn-primary" id="pt-ff-save">저장</button>' +
      '</div></div></div>';

    var logoPrev = byId(rootEl, 'pt-ff-logoprev');
    var logoBtn = byId(rootEl, 'pt-ff-logobtn');
    if (logoBtn) logoBtn.addEventListener('click', function () {
      if (!window.AdminUtil || typeof window.AdminUtil.pickImage !== 'function') { alert('이미지 업로드 기능을 사용할 수 없습니다.'); return; }
      window.AdminUtil.pickImage({ maxW: 800, quality: 0.9, keepPng: true }).then(function (res) {
        if (!res || !res.bytes) return;
        var path = 'images/uploads/logo-' + timestamp() + '.' + (res.ext || 'png');
        previewCache[path] = res.previewUrl;
        pendingImage = { bytes: res.bytes, path: path };
        model.logo = path;
        if (logoPrev) { logoPrev.src = resolveImg(path); logoPrev.style.visibility = 'visible'; }
      }).catch(function (err) { try { console.error('[tab-partner] pickImage error', err); } catch (e) {} });
    });

    function close() { holder.innerHTML = ''; }
    var cancelBtn = byId(rootEl, 'pt-ff-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', close);

    var saveBtn = byId(rootEl, 'pt-ff-save');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      try {
        var name = (byId(rootEl, 'pt-ff-name') || {}).value || '';
        var desc = (byId(rootEl, 'pt-ff-desc') || {}).value || '';
        name = name.trim();
        if (!name) { alert('기관명을 입력해주세요.'); return; }
        if (!model.logo) { alert('로고 이미지를 선택해주세요.'); return; }
        var item = { name: name, desc: desc, logo: model.logo };
        if (isNew) data.featured.push(item); else data.featured[idx] = item;
        if (pendingImage) window.GH.stageBinary(pendingImage.path, pendingImage.bytes, '협약기관 로고 업로드: ' + pendingImage.path);
        stageData((isNew ? '대표 협약 기관 추가' : '대표 협약 기관 수정') + ': ' + name);
        close();
        renderFeaturedList();
      } catch (e) {
        try { console.error('[tab-partner] save featured error', e); } catch (e2) {}
        alert('저장 중 오류가 발생했습니다.');
      }
    });
  }

  // ---------- 섹션 2: 협약 로고 그리드 ----------
  function renderLogoGrid() {
    if (!rootEl) return;
    var holder = byId(rootEl, 'pt-logo-grid');
    if (!holder) return;
    try {
      var list = (data && data.logos) || [];
      if (!list.length) {
        holder.innerHTML = '<div class="pt-empty">등록된 로고가 없습니다.</div>';
        return;
      }
      holder.innerHTML = '<div class="pt-logo-grid">' + list.map(function (item, i) {
        return (
          '<div class="pt-logo-card" data-idx="' + i + '">' +
          '<img src="' + escapeHtml(resolveImg(item.logo)) + '" alt="">' +
          '<div class="name">' + escapeHtml(item.name || '') + '</div>' +
          '<div class="pt-logo-actions">' +
          '<button type="button" class="pt-btn pt-btn-small" data-act="up"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button type="button" class="pt-btn pt-btn-small" data-act="down"' + (i === list.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '<button type="button" class="pt-btn pt-btn-small" data-act="edit">수정</button>' +
          '<button type="button" class="pt-btn pt-btn-small pt-btn-danger" data-act="delete">✕</button>' +
          '</div></div>'
        );
      }).join('') + '</div>';

      holder.querySelectorAll('.pt-logo-card').forEach(function (card) {
        var idx = Number(card.getAttribute('data-idx'));
        card.querySelectorAll('button[data-act]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var act = btn.getAttribute('data-act');
            if (act === 'edit') openLogoForm(idx);
            else if (act === 'delete') deleteLogo(idx);
            else if (act === 'up') moveLogo(idx, -1);
            else if (act === 'down') moveLogo(idx, 1);
          });
        });
      });
    } catch (e) {
      try { console.error('[tab-partner] renderLogoGrid error', e); } catch (e2) {}
      holder.innerHTML = '<div class="pt-error">목록을 표시하는 중 오류가 발생했습니다.</div>';
    }
  }

  function deleteLogo(idx) {
    try {
      if (!data.logos[idx]) return;
      if (!confirm('이 로고를 삭제할까요?')) return;
      data.logos.splice(idx, 1);
      stageData('협약 로고 삭제');
      renderLogoGrid();
    } catch (e) { try { console.error(e); } catch (e2) {} }
  }

  function moveLogo(idx, dir) {
    try {
      var arr = data.logos;
      var n = idx + dir;
      if (n < 0 || n >= arr.length) return;
      var tmp = arr[idx]; arr[idx] = arr[n]; arr[n] = tmp;
      stageData('협약 로고 순서 변경');
      renderLogoGrid();
    } catch (e) { try { console.error(e); } catch (e2) {} }
  }

  function openLogoForm(idx) {
    if (!rootEl) return;
    var holder = byId(rootEl, 'pt-modal-holder');
    if (!holder) return;
    var isNew = idx < 0;
    var model = isNew ? { name: '', logo: '' } : JSON.parse(JSON.stringify(data.logos[idx]));
    var pendingImage = null;

    holder.innerHTML =
      '<div class="pt-modal-back"><div class="pt-modal">' +
      '<h3>' + (isNew ? '로고 추가' : '로고 수정') + '</h3>' +
      '<div class="pt-form-row"><label>로고 이미지</label>' +
      '<div class="pt-img-pick"><img id="pt-lf-logoprev" src="' + escapeHtml(resolveImg(model.logo)) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
      '<button type="button" class="pt-btn" id="pt-lf-logobtn">로고 선택</button></div></div>' +
      '<div class="pt-form-row"><label>기관명 (선택)</label><input type="text" id="pt-lf-name" value="' + escapeHtml(model.name) + '"></div>' +
      '<div class="pt-modal-actions">' +
      '<button type="button" class="pt-btn" id="pt-lf-cancel">취소</button>' +
      '<button type="button" class="pt-btn pt-btn-primary" id="pt-lf-save">저장</button>' +
      '</div></div></div>';

    var logoPrev = byId(rootEl, 'pt-lf-logoprev');
    var logoBtn = byId(rootEl, 'pt-lf-logobtn');
    if (logoBtn) logoBtn.addEventListener('click', function () {
      if (!window.AdminUtil || typeof window.AdminUtil.pickImage !== 'function') { alert('이미지 업로드 기능을 사용할 수 없습니다.'); return; }
      window.AdminUtil.pickImage({ maxW: 600, quality: 0.9, keepPng: true }).then(function (res) {
        if (!res || !res.bytes) return;
        var path = 'images/uploads/logo-' + timestamp() + '.' + (res.ext || 'png');
        previewCache[path] = res.previewUrl;
        pendingImage = { bytes: res.bytes, path: path };
        model.logo = path;
        if (logoPrev) { logoPrev.src = resolveImg(path); logoPrev.style.visibility = 'visible'; }
      }).catch(function (err) { try { console.error('[tab-partner] pickImage error', err); } catch (e) {} });
    });

    function close() { holder.innerHTML = ''; }
    var cancelBtn = byId(rootEl, 'pt-lf-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', close);

    var saveBtn = byId(rootEl, 'pt-lf-save');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      try {
        if (!model.logo) { alert('로고 이미지를 선택해주세요.'); return; }
        var name = (byId(rootEl, 'pt-lf-name') || {}).value || '';
        var item = { name: name, logo: model.logo };
        if (isNew) data.logos.push(item); else data.logos[idx] = item;
        if (pendingImage) window.GH.stageBinary(pendingImage.path, pendingImage.bytes, '협약 로고 업로드: ' + pendingImage.path);
        stageData((isNew ? '협약 로고 추가' : '협약 로고 수정'));
        close();
        renderLogoGrid();
      } catch (e) {
        try { console.error('[tab-partner] save logo error', e); } catch (e2) {}
        alert('저장 중 오류가 발생했습니다.');
      }
    });
  }

  // ---------- 등록 ----------
  try {
    if (window.AdminTabs && typeof window.AdminTabs.register === 'function') {
      window.AdminTabs.register(TAB_ID, { title: '협약기관 관리', render: render, onShow: onShow });
    } else {
      try { console.error('[tab-partner] window.AdminTabs.register 를 찾을 수 없습니다.'); } catch (e) {}
    }
  } catch (e) {
    try { console.error('[tab-partner] register failed', e); } catch (e2) {}
  }
})();
