/*!
 * tab-editor.js — "페이지 편집" 탭
 * 사용 계약: window.GH(github-api.js), window.AdminTabs.register(app.js), window.AdminUtil(app.js)
 * 이 파일은 위 세 전역만 사용한다(다른 탭 파일 직접 참조 금지).
 *
 * 기능 요약:
 *  - 페이지 선택(select) → 같은 출처 iframe으로 실제 백업 페이지 로드
 *  - PC(1280px) / 모바일(375px) 뷰포트 토글
 *  - iframe 문서 내 텍스트/이미지 요소를 hover 강조 + 클릭 편집
 *      텍스트: [id^="text_w"] 및 div[data-type="widget"] 내부 .widget_text_wrap (id 있는 조상 기준)
 *      이미지: div[data-type="widget"] img, background-image를 가진 ._img_wrap
 *  - 변경 시 원본 텍스트/경로가 동일한 "짝"(PC/모바일 쌍) 자동 감지 → 동시 적용 체크박스(기본 ON)
 *  - 변경 목록(30자 미리보기) + 개별 취소 + 전체 취소 + 저장(대기 목록에 추가)
 *  - 저장: data/overrides.js 를 원격에서 다시 읽어 __OVERRIDES[pageKey]에 병합 후 GH.stageText
 *          이미지 교체는 즉시 GH.stageBinary
 *
 * data/overrides.js 런타임 계약(SPEC_RUNTIME 기준, backup/js/overrides.js가 소비):
 *   window.__OVERRIDES[pageKey] = {
 *     "<elementId>":            { html: "<innerHTML>" },
 *     "<elementId>|img|<n>":    { src: "images/uploads/..." }   // n번째 img 또는 배경이미지 요소(0부터)
 *   }
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // 페이지 목록
  // ---------------------------------------------------------------------
  var PAGES = [
    {
      group: '주요 페이지',
      items: [
        ['__home', '홈(메인)'],
        ['intro_mindone', '마인드원치과 소개'],
        ['79', '전문의료진 소개'],
        ['41', '업무협약 안내'],
        ['43', 'International Patient Services'],
        ['front_tooth', '예쁜앞니치료 전문'],
        ['implant', '고난도임플란트 전문'],
        ['40', '슬림네이트'],
        ['37', '수면 임플란트'],
        ['42', '다심 임플란트 멤버십'],
        ['82', '치아교정'],
        ['83', '보톡스·턱관절치료'],
        ['price', '비급여수가안내'],
        ['39', '리뷰이벤트']
      ]
    },
    {
      group: '실제사례 게시판 (셸만 편집 가능)',
      items: [
        ['86', '슬림네이트 실제사례'],
        ['104', '비교정 스마일라인치료 실제사례'],
        ['105', '치아교정 실제사례'],
        ['106', '앞니 재생복구치료 실제사례'],
        ['121', '깨진 앞니 치료 실제사례'],
        ['107', '앞니 공간치료 실제사례'],
        ['108', '앞니 충치치료 실제사례'],
        ['109', '앞니 올세라믹 실제사례'],
        ['110', '치아미백 실제사례'],
        ['111', '치아성형/잇몸성형 실제사례'],
        ['112', '전체 임플란트 실제사례'],
        ['113', '임플란트 복합치료 실제사례'],
        ['114', '원데이 임플란트 실제사례'],
        ['115', '앞니 심미 임플란트 실제사례'],
        ['116', '상악동거상술 임플란트 실제사례'],
        ['117', '뼈재생 임플란트 실제사례'],
        ['118', '신경관 가까운 임플란트 실제사례'],
        ['119', '임플란트 틀니 실제사례']
      ]
    }
  ];
  var BOARD_KEYS = {
    '86': 1, '104': 1, '105': 1, '106': 1, '121': 1, '107': 1, '108': 1, '109': 1, '110': 1, '111': 1,
    '112': 1, '113': 1, '114': 1, '115': 1, '116': 1, '117': 1, '118': 1, '119': 1
  };

  function pageLabel(key) {
    for (var i = 0; i < PAGES.length; i++) {
      var items = PAGES[i].items;
      for (var j = 0; j < items.length; j++) {
        if (items[j][0] === key) return items[j][1];
      }
    }
    return key;
  }

  // ---------------------------------------------------------------------
  // 소형 유틸
  // ---------------------------------------------------------------------
  function toArray(nodeList) {
    try { return Array.prototype.slice.call(nodeList || []); } catch (e) { return []; }
  }

  function truncate(s, n) {
    s = s || '';
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  function stripTags(html) {
    try {
      var d = document.createElement('div');
      d.innerHTML = html || '';
      return (d.textContent || d.innerText || '').replace(/\s+/g, ' ').trim();
    } catch (e) { return ''; }
  }

  function normalizeText(html) {
    try {
      var d = document.createElement('div');
      d.innerHTML = html || '';
      var t = d.textContent || d.innerText || '';
      return t.replace(/\s+/g, '').trim();
    } catch (e) { return ''; }
  }

  function normalizeSrc(raw) {
    try {
      var s = String(raw || '');
      var m = s.match(/url\((['"]?)(.*?)\1\)/);
      if (m) s = m[2];
      s = s.split('?')[0];
      s = s.replace(/^https?:\/\/[^/]+/, '');
      s = s.replace(/^\.\.\//, '').replace(/^\.\//, '').replace(/^\//, '');
      return s;
    } catch (e) { return String(raw || ''); }
  }

  function closestWithId(el) {
    var n = el;
    while (n && n.nodeType === 1) {
      if (n.id) return n;
      n = n.parentElement;
    }
    return null;
  }

  var usedStamps = {};
  function tsStamp() {
    var d = new Date();
    function p(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
    var base = '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
    var s = base, i = 1;
    while (usedStamps[s]) { i++; s = base + '-' + i; }
    usedStamps[s] = true;
    return s;
  }

  // ---------------------------------------------------------------------
  // 상태
  // ---------------------------------------------------------------------
  var state = { pageKey: null, viewport: 'pc' };
  var els = {};
  var ctx = null;     // 현재 iframe 문서에 대한 편집 컨텍스트
  var changes = {};   // key -> 변경 객체

  // ---------------------------------------------------------------------
  // 대상 요소 탐색 (iframe 문서 내부)
  // ---------------------------------------------------------------------
  function resolveTextTargets(doc) {
    var out = [];
    var seenIds = {};
    var nodes = [];
    try {
      nodes = toArray(doc.querySelectorAll('[id^="text_w"], div[data-type="widget"] .widget_text_wrap'));
    } catch (e) { nodes = []; }
    nodes.forEach(function (el) {
      var idEl = el.id ? el : closestWithId(el);
      if (!idEl || !idEl.id || seenIds[idEl.id]) return;
      seenIds[idEl.id] = true;
      out.push({ kind: 'text', idEl: idEl });
    });
    return out;
  }

  function resolveImageTargets(doc) {
    var out = [];
    var imgs = [];
    try { imgs = toArray(doc.querySelectorAll('div[data-type="widget"] img')); } catch (e) { imgs = []; }
    imgs.forEach(function (img) {
      var idEl = closestWithId(img);
      if (!idEl) return;
      out.push({ kind: 'img', el: img, idEl: idEl });
    });
    var bgs = [];
    try { bgs = toArray(doc.querySelectorAll('._img_wrap')); } catch (e) { bgs = []; }
    bgs.forEach(function (el) {
      var bg = '';
      try { bg = el.style && el.style.backgroundImage; } catch (e2) { bg = ''; }
      if (!bg || bg === 'none') return;
      var idEl = closestWithId(el);
      if (!idEl) return;
      out.push({ kind: 'bg', el: el, idEl: idEl });
    });
    return out;
  }

  function isInsideBoardArea(el) {
    try { return !!el.closest('.widget.board, ._list_wrap, .board_view'); } catch (e) { return false; }
  }

  function indexWithin(idEl, kind, targetEl) {
    try {
      var list;
      if (kind === 'img') {
        list = toArray(idEl.querySelectorAll('img'));
      } else {
        list = toArray(idEl.querySelectorAll('._img_wrap')).filter(function (el) {
          var bg = ''; try { bg = el.style && el.style.backgroundImage; } catch (e) { bg = ''; }
          return !!bg && bg !== 'none';
        });
        if (idEl.classList && idEl.classList.contains('_img_wrap') && list.indexOf(idEl) === -1) {
          var selfBg = ''; try { selfBg = idEl.style && idEl.style.backgroundImage; } catch (e2) { selfBg = ''; }
          if (selfBg && selfBg !== 'none') list.unshift(idEl);
        }
      }
      return list.indexOf(targetEl);
    } catch (e) { return -1; }
  }

  // ---------------------------------------------------------------------
  // 편집 주입
  // ---------------------------------------------------------------------
  function injectHoverStyle(doc) {
    try {
      if (doc.getElementById('te-injected-style')) return;
      var style = doc.createElement('style');
      style.id = 'te-injected-style';
      style.textContent =
        '.te-hover{outline:2px dashed #ff6000 !important;outline-offset:2px;cursor:text;}' +
        '.te-hover-img{outline:2px dashed #ff6000 !important;outline-offset:2px;cursor:pointer;}' +
        '.te-editing{outline:2px solid #ff6000 !important;outline-offset:2px;background:rgba(255,96,0,.06);}' +
        'div[data-type="widget"] img,._img_wrap[style*="background-image"]{cursor:pointer;}';
      (doc.head || doc.documentElement).appendChild(style);
    } catch (e) { /* noop */ }
  }

  function bindTextTarget(t) {
    var el = t.idEl;
    try {
      el.addEventListener('mouseenter', function () {
        if (el.getAttribute('contenteditable') !== 'true') el.classList.add('te-hover');
      });
      el.addEventListener('mouseleave', function () { el.classList.remove('te-hover'); });
      el.addEventListener('click', function (e) {
        if (el.getAttribute('contenteditable') === 'true') return;
        try { e.preventDefault(); e.stopPropagation(); } catch (e2) { /* noop */ }
        el.classList.remove('te-hover');
        el.classList.add('te-editing');
        el.setAttribute('contenteditable', 'true');
        try { el.focus(); } catch (e3) { /* noop */ }
      }, true);
      el.addEventListener('paste', function (e) {
        try {
          e.preventDefault();
          var cd = e.clipboardData || (el.ownerDocument.defaultView && el.ownerDocument.defaultView.clipboardData);
          var text = cd ? cd.getData('text/plain') : '';
          el.ownerDocument.execCommand('insertText', false, text);
        } catch (e2) { /* noop */ }
      });
      el.addEventListener('blur', function () { onTextBlur(el); });
    } catch (e) { /* noop */ }
  }

  function bindImageTarget(t) {
    var el = t.el;
    try {
      el.addEventListener('mouseenter', function () { el.classList.add('te-hover-img'); });
      el.addEventListener('mouseleave', function () { el.classList.remove('te-hover-img'); });
      el.addEventListener('click', function (e) {
        try { e.preventDefault(); e.stopPropagation(); } catch (e2) { /* noop */ }
        onImageTargetClick(t);
      }, true);
    } catch (e) { /* noop */ }
  }

  function setupInjection(doc) {
    ctx = {
      doc: doc,
      textTargets: [],
      imgTargets: [],
      imgTargetsByKey: {},
      baselineText: {},
      baselineHtml: {},
      baselineImgSrc: {},
      baselineImgRaw: {}
    };
    changes = {};

    injectHoverStyle(doc);

    var isBoard = !!BOARD_KEYS[state.pageKey];

    var textTargets = resolveTextTargets(doc);
    if (isBoard) textTargets = textTargets.filter(function (t) { return !isInsideBoardArea(t.idEl); });
    textTargets.forEach(function (t) {
      ctx.baselineText[t.idEl.id] = normalizeText(t.idEl.innerHTML);
      ctx.baselineHtml[t.idEl.id] = t.idEl.innerHTML;
      bindTextTarget(t);
    });
    ctx.textTargets = textTargets;

    var imgTargets = resolveImageTargets(doc);
    if (isBoard) imgTargets = imgTargets.filter(function (t) { return !isInsideBoardArea(t.idEl); });
    imgTargets.forEach(function (t) {
      var n = indexWithin(t.idEl, t.kind, t.el);
      if (n < 0) return;
      t.key = t.idEl.id + '|img|' + n;
      ctx.imgTargetsByKey[t.key] = t;
      var raw = t.kind === 'img' ? (t.el.getAttribute('src') || '') : (t.el.style.backgroundImage || '');
      ctx.baselineImgRaw[t.key] = raw;
      ctx.baselineImgSrc[t.key] = normalizeSrc(raw);
      bindImageTarget(t);
    });
    ctx.imgTargets = imgTargets;

    setStatus('편집 가능 요소: 텍스트 ' + textTargets.length + '개 · 이미지 ' + imgTargets.length + '개');
  }

  // ---------------------------------------------------------------------
  // 짝(PC/모바일) 탐색
  // ---------------------------------------------------------------------
  function findTextTwin(excludeId, origNorm) {
    if (!ctx || !origNorm) return null;
    for (var i = 0; i < ctx.textTargets.length; i++) {
      var t = ctx.textTargets[i];
      if (t.idEl.id === excludeId) continue;
      if (ctx.baselineText[t.idEl.id] === origNorm) return t;
    }
    return null;
  }

  function findImageTwin(excludeKey, origNorm) {
    if (!ctx || !origNorm) return null;
    for (var key in ctx.imgTargetsByKey) {
      if (!ctx.imgTargetsByKey.hasOwnProperty(key) || key === excludeKey) continue;
      if (ctx.baselineImgSrc[key] === origNorm) return ctx.imgTargetsByKey[key];
    }
    return null;
  }

  // ---------------------------------------------------------------------
  // 변경 기록
  // ---------------------------------------------------------------------
  function onTextBlur(el) {
    try {
      el.setAttribute('contenteditable', 'false');
      el.classList.remove('te-editing');
      var id = el.id;
      if (!id || !ctx || ctx.baselineHtml[id] === undefined) return;
      var newHtml = el.innerHTML;
      if (newHtml === ctx.baselineHtml[id]) {
        // 원본으로 되돌아온 경우: 기존 변경 기록 제거
        if (changes[id] && !changes[id].isPairChild) cancelChange(id);
        return;
      }
      changes[id] = {
        key: id, kind: 'text', id: id, html: newHtml,
        preview: truncate(stripTags(newHtml), 30) || '(빈 텍스트)'
      };
      var origNorm = ctx.baselineText[id];
      var twin = findTextTwin(id, origNorm);
      if (twin) {
        changes[id].pairKey = twin.idEl.id;
        changes[id].pairLabel = '모바일/PC 버전에도 동일하게 적용';
        applyPairText(twin.idEl.id, newHtml, true, id);
      }
      renderChanges();
    } catch (e) { /* noop: 절대 페이지를 죽이지 않음 */ }
  }

  function applyPairText(twinId, html, apply, sourceKey) {
    var twin = null;
    for (var i = 0; i < (ctx ? ctx.textTargets.length : 0); i++) {
      if (ctx.textTargets[i].idEl.id === twinId) { twin = ctx.textTargets[i]; break; }
    }
    if (apply) {
      if (twin) { try { twin.idEl.innerHTML = html; } catch (e) { /* noop */ } }
      changes[twinId] = {
        key: twinId, kind: 'text', id: twinId, html: html,
        preview: truncate(stripTags(html), 30) || '(빈 텍스트)',
        isPairChild: true, pairKey: sourceKey
      };
    } else {
      if (twin && ctx.baselineHtml[twinId] !== undefined) {
        try { twin.idEl.innerHTML = ctx.baselineHtml[twinId]; } catch (e) { /* noop */ }
      }
      delete changes[twinId];
    }
  }

  function onImageTargetClick(target) {
    try {
      if (!window.AdminUtil || typeof AdminUtil.pickImage !== 'function') {
        alert('이미지 업로드 기능을 사용할 수 없습니다.');
        return;
      }
      var curRaw = target.kind === 'img' ? (target.el.getAttribute('src') || '') : (target.el.style.backgroundImage || '');
      var keepPng = /\.png(\?|['")]|$)/i.test(curRaw);
      AdminUtil.pickImage({ maxW: 1600, quality: 0.85, keepPng: keepPng }).then(function (res) {
        if (!res || !res.bytes) return;
        var path = (window.AdminUtil && typeof AdminUtil.uploadPath === 'function')
          ? AdminUtil.uploadPath('page', res.ext)
          : 'images/uploads/page-' + tsStamp() + '.' + (res.ext || 'jpg');
        try {
          GH.stageBinary(path, res.bytes, '페이지 편집 이미지 교체 (' + pageLabel(state.pageKey) + ')');
        } catch (e) {
          alert('이미지를 저장 대기 목록에 추가하지 못했습니다: ' + (e && e.message ? e.message : e));
          return;
        }
        try {
          if (target.kind === 'img') target.el.src = res.previewUrl;
          else target.el.style.backgroundImage = "url('" + res.previewUrl + "')";
        } catch (e2) { /* noop: 미리보기 실패해도 스테이징은 유지 */ }

        var key = target.key || (target.idEl.id + '|img|' + indexWithin(target.idEl, target.kind, target.el));
        changes[key] = {
          key: key, kind: 'img', id: target.idEl.id,
          n: key.split('|img|')[1], src: path, previewUrl: res.previewUrl,
          preview: '이미지 교체됨'
        };
        var origNorm = ctx ? ctx.baselineImgSrc[key] : null;
        var twin = findImageTwin(key, origNorm);
        if (twin) {
          changes[key].pairKey = twin.key;
          changes[key].pairLabel = '모바일/PC 버전에도 동일하게 적용';
          applyPairImage(twin.key, path, res.previewUrl, true, key);
        }
        renderChanges();
      }).catch(function (err) {
        try { console.warn('[tab-editor] 이미지 선택이 취소되었거나 실패했습니다.', err); } catch (e) { /* noop */ }
      });
    } catch (e) {
      try { console.warn('[tab-editor] onImageTargetClick 오류', e); } catch (e2) { /* noop */ }
    }
  }
  function applyPairImage(twinKey, path, previewUrl, apply, sourceKey) {
    var twin = ctx ? ctx.imgTargetsByKey[twinKey] : null;
    if (apply) {
      if (twin) {
        try {
          if (twin.kind === 'img') twin.el.src = previewUrl;
          else twin.el.style.backgroundImage = "url('" + previewUrl + "')";
        } catch (e) { /* noop */ }
      }
      changes[twinKey] = {
        key: twinKey, kind: 'img',
        id: twinKey.split('|img|')[0], n: twinKey.split('|img|')[1],
        src: path, previewUrl: previewUrl, preview: '이미지 교체됨',
        isPairChild: true, pairKey: sourceKey
      };
    } else {
      revertToBaseline(twinKey, 'img');
      delete changes[twinKey];
    }
  }

  function revertToBaseline(key, kind) {
    try {
      if (!ctx) return;
      if (kind === 'text') {
        for (var i = 0; i < ctx.textTargets.length; i++) {
          if (ctx.textTargets[i].idEl.id === key && ctx.baselineHtml[key] !== undefined) {
            ctx.textTargets[i].idEl.innerHTML = ctx.baselineHtml[key];
            return;
          }
        }
      } else {
        var t = ctx.imgTargetsByKey[key];
        if (t && ctx.baselineImgRaw[key] !== undefined) {
          if (t.kind === 'img') t.el.src = ctx.baselineImgRaw[key];
          else t.el.style.backgroundImage = ctx.baselineImgRaw[key];
        }
      }
    } catch (e) { /* noop */ }
  }

  function togglePair(sourceKey, on) {
    var chg = changes[sourceKey];
    if (!chg || !chg.pairKey) return;
    if (chg.kind === 'text') applyPairText(chg.pairKey, chg.html, on, sourceKey);
    else applyPairImage(chg.pairKey, chg.src, chg.previewUrl, on, sourceKey);
    renderChanges();
  }

  function cancelChange(key) {
    var chg = changes[key];
    if (!chg) return;
    revertToBaseline(key, chg.kind);
    if (chg.pairKey && changes[chg.pairKey]) {
      revertToBaseline(chg.pairKey, chg.kind);
      delete changes[chg.pairKey];
    }
    delete changes[key];
    renderChanges();
  }

  function clearAllChanges() {
    var keys = Object.keys(changes);
    if (!keys.length) return;
    if (!confirm('편집 중인 모든 변경사항을 취소할까요?')) return;
    keys.forEach(function (k) { revertToBaseline(k, changes[k].kind); });
    changes = {};
    renderChanges();
  }

  // ---------------------------------------------------------------------
  // 저장(대기 목록에 추가)
  // ---------------------------------------------------------------------
  function saveChanges() {
    var keys = Object.keys(changes);
    if (!keys.length) { alert('저장할 변경사항이 없습니다.'); return; }
    if (!window.GH || typeof GH.stageText !== 'function' || typeof GH.readJsData !== 'function') {
      alert('GitHub 연동 모듈을 사용할 수 없습니다.');
      return;
    }
    if (els.saveBtn) els.saveBtn.disabled = true;
    setStatus('저장 중…');

    Promise.resolve()
      .then(function () { return GH.readJsData('data/overrides.js'); })
      .catch(function (err) {
        try { console.warn('[tab-editor] 원격 overrides.js를 불러오지 못해 빈 값으로 진행합니다.', err); } catch (e) { /* noop */ }
        return {};
      })
      .then(function (all) {
        all = (all && typeof all === 'object') ? all : {};
        var pageObj = (all[state.pageKey] && typeof all[state.pageKey] === 'object') ? all[state.pageKey] : {};
        keys.forEach(function (k) {
          var chg = changes[k];
          if (chg.kind === 'text') {
            pageObj[chg.id] = { html: chg.html };
          } else {
            pageObj[chg.id + '|img|' + chg.n] = { src: chg.src };
          }
        });
        all[state.pageKey] = pageObj;
        var text = 'window.__OVERRIDES = ' + JSON.stringify(all, null, 2) + ';\n';
        var label = '페이지 편집: ' + pageLabel(state.pageKey) + ' (' + keys.length + '건)';
        GH.stageText('data/overrides.js', text, label);
        changes = {};
        renderChanges();
        setStatus('저장 대기 목록에 추가되었습니다.');
        alert('변경사항이 저장 대기 목록에 추가되었습니다.\n상단의 [게시하기]를 눌러야 실제 사이트에 반영됩니다.');
      })
      .catch(function (err) {
        alert('저장 중 오류가 발생했습니다: ' + (err && err.message ? err.message : err));
      })
      .then(function () {
        if (els.saveBtn) els.saveBtn.disabled = false;
      });
  }

  // ---------------------------------------------------------------------
  // 렌더링(변경 목록)
  // ---------------------------------------------------------------------
  function renderChanges() {
    if (!els.changesList) return;
    var keys = Object.keys(changes).filter(function (k) { return !changes[k].isPairChild; });
    if (els.changesCount) els.changesCount.textContent = keys.length + '건';
    els.changesList.innerHTML = '';
    if (!keys.length) {
      var empty = document.createElement('li');
      empty.className = 'te-change-empty';
      empty.textContent = '아직 변경사항이 없습니다. iframe 안의 텍스트나 이미지를 클릭해 편집해보세요.';
      els.changesList.appendChild(empty);
      return;
    }
    keys.forEach(function (k) {
      var chg = changes[k];
      var li = document.createElement('li');
      li.className = 'te-change-item';

      var typeSpan = document.createElement('span');
      typeSpan.className = 'te-change-type';
      typeSpan.textContent = chg.kind === 'text' ? '텍스트' : '이미지';
      li.appendChild(typeSpan);

      var prevSpan = document.createElement('span');
      prevSpan.className = 'te-change-preview';
      prevSpan.textContent = chg.preview;
      li.appendChild(prevSpan);

      if (chg.pairKey) {
        var lbl = document.createElement('label');
        lbl.className = 'te-pair-toggle';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.addEventListener('change', function () { togglePair(k, cb.checked); });
        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(' ' + (chg.pairLabel || 'PC/모바일 버전에도 동일 적용')));
        li.appendChild(lbl);
      }

      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'te-cancel-btn';
      cancelBtn.textContent = '취소';
      cancelBtn.addEventListener('click', function () { cancelChange(k); });
      li.appendChild(cancelBtn);

      els.changesList.appendChild(li);
    });
  }

  function setStatus(msg) {
    if (els.status) els.status.textContent = msg || '';
  }

  // ---------------------------------------------------------------------
  // iframe / 뷰포트
  // ---------------------------------------------------------------------
  function applyViewport() {
    try {
      if (!els.frame || !els.frameOuter) return;
      var target = state.viewport === 'mobile' ? 375 : 1280;
      var outer = els.frameOuter;
      var availW = outer.clientWidth || target;
      var scale = availW > 0 && availW < target ? (availW / target) : 1;
      var heightPx = Math.max(420, Math.round((window.innerHeight || 800) * 0.7));
      els.frame.style.width = target + 'px';
      els.frame.style.height = heightPx + 'px';
      els.frame.style.transformOrigin = 'top left';
      els.frame.style.transform = scale < 1 ? ('scale(' + scale.toFixed(4) + ')') : 'none';
      outer.style.height = (scale < 1 ? Math.round(heightPx * scale) : heightPx) + 'px';
    } catch (e) { /* noop */ }
  }

  function showFallback(msg) {
    if (els.fallback) {
      els.fallback.hidden = false;
      els.fallback.textContent = msg || '이 페이지는 미리보기 편집을 사용할 수 없습니다. (브라우저 보안 정책으로 페이지 내용에 접근할 수 없습니다) file://로 열었다면 인터넷을 통해 사이트에 접속한 뒤 다시 시도해주세요.';
    }
    setStatus('');
  }

  function onFrameLoad() {
    try {
      if (els.fallback) els.fallback.hidden = true;
      var doc = null;
      try { doc = els.frame.contentDocument || (els.frame.contentWindow && els.frame.contentWindow.document); } catch (e) { doc = null; }
      if (!doc || !doc.body) { showFallback(); return; }
      setupInjection(doc);
      applyViewport();
    } catch (e) {
      showFallback();
    }
  }

  function loadPage(key) {
    try {
      state.pageKey = key;
      ctx = null;
      changes = {};
      renderChanges();
      var isBoard = !!BOARD_KEYS[key];
      if (els.boardNotice) els.boardNotice.hidden = !isBoard;
      if (els.fallback) els.fallback.hidden = true;
      setStatus('불러오는 중…');
      var src = (key === '__home') ? '../' : ('../' + key + '/');
      if (els.frame) {
        els.frame.onload = onFrameLoad;
        els.frame.onerror = function () { showFallback(); };
        els.frame.src = src;
      }
      applyViewport();
    } catch (e) {
      showFallback();
    }
  }

  // ---------------------------------------------------------------------
  // render / onShow (AdminTabs 계약)
  // ---------------------------------------------------------------------
  var built = false;

  function buildOptions(selectEl) {
    PAGES.forEach(function (grp) {
      var og = document.createElement('optgroup');
      og.label = grp.group;
      grp.items.forEach(function (item) {
        var opt = document.createElement('option');
        opt.value = item[0];
        opt.textContent = item[1] + ' (' + item[0] + ')';
        og.appendChild(opt);
      });
      selectEl.appendChild(og);
    });
  }

  function injectStyleOnce() {
    if (document.getElementById('tab-editor-style')) return;
    var style = document.createElement('style');
    style.id = 'tab-editor-style';
    style.textContent =
      '.te-wrap{display:flex;flex-direction:column;gap:12px;}' +
      '.te-banner{background:#fff3ea;border:1px solid #ffcda3;color:#8a3d00;padding:10px 14px;border-radius:8px;font-size:14px;}' +
      '.te-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:12px;}' +
      '.te-toolbar select{padding:6px 8px;border:1px solid #ddd;border-radius:6px;min-width:260px;}' +
      '.te-viewport-toggle{display:flex;gap:6px;}' +
      '.te-vp-btn{padding:6px 12px;border:1px solid #ddd;background:#fff;border-radius:6px;cursor:pointer;font-size:13px;}' +
      '.te-vp-btn.is-active{background:#ff6000;border-color:#ff6000;color:#fff;}' +
      '.te-status{color:#777;font-size:13px;margin-left:auto;}' +
      '.te-board-notice{background:#eef4ff;border:1px solid #cfe0ff;color:#1a4fa0;padding:8px 12px;border-radius:8px;font-size:13px;}' +
      '.te-frame-outer{border:1px solid #ddd;border-radius:8px;overflow:hidden;background:#f4f4f4;position:relative;}' +
      '.te-frame{border:0;display:block;background:#fff;}' +
      '.te-frame-fallback{padding:24px;color:#a33;font-size:14px;line-height:1.6;background:#fff8f8;}' +
      '.te-changes-panel{border:1px solid #ddd;border-radius:8px;padding:12px 14px;}' +
      '.te-changes-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;}' +
      '.te-changes-count{color:#ff6000;font-weight:600;}' +
      '.te-changes-list{list-style:none;margin:0 0 10px;padding:0;display:flex;flex-direction:column;gap:6px;max-height:260px;overflow:auto;}' +
      '.te-change-item{display:flex;align-items:center;gap:10px;padding:6px 8px;background:#fafafa;border:1px solid #eee;border-radius:6px;font-size:13px;}' +
      '.te-change-type{flex:0 0 auto;padding:2px 8px;border-radius:10px;background:#ffe4cc;color:#a34700;font-size:12px;}' +
      '.te-change-preview{flex:1 1 auto;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.te-pair-toggle{flex:0 0 auto;font-size:12px;color:#555;display:flex;align-items:center;gap:4px;white-space:nowrap;}' +
      '.te-cancel-btn{flex:0 0 auto;border:1px solid #ddd;background:#fff;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:12px;}' +
      '.te-change-empty{color:#999;font-size:13px;padding:8px 0;}' +
      '.te-changes-actions{display:flex;gap:8px;justify-content:flex-end;}' +
      '.te-clear-all{padding:8px 14px;border:1px solid #ddd;background:#fff;border-radius:6px;cursor:pointer;}' +
      '.te-save-btn{padding:8px 16px;border:0;background:#ff6000;color:#fff;border-radius:6px;cursor:pointer;font-weight:600;}' +
      '.te-save-btn:disabled{opacity:.6;cursor:default;}';
    document.head.appendChild(style);
  }

  function render(el) {
    try {
      injectStyleOnce();
      el.innerHTML =
        '<div class="te-wrap">' +
        '  <div class="te-banner">수정 후 상단의 <strong>[게시하기]</strong>를 눌러야 실제 사이트에 반영됩니다.</div>' +
        '  <div class="te-toolbar">' +
        '    <label>편집할 페이지 ' +
        '      <select class="te-page-select"></select>' +
        '    </label>' +
        '    <div class="te-viewport-toggle">' +
        '      <button type="button" class="te-vp-btn is-active" data-vp="pc">PC 1280px</button>' +
        '      <button type="button" class="te-vp-btn" data-vp="mobile">모바일 375px</button>' +
        '    </div>' +
        '    <span class="te-status"></span>' +
        '  </div>' +
        '  <div class="te-board-notice" hidden>게시판 페이지는 \'실제사례 관리\' 탭에서 글을 관리하세요. 이 화면에서는 상단 메뉴·푸터 등 공용 영역만 편집할 수 있습니다.</div>' +
        '  <div class="te-frame-outer">' +
        '    <iframe class="te-frame"></iframe>' +
        '    <div class="te-frame-fallback" hidden></div>' +
        '  </div>' +
        '  <div class="te-changes-panel">' +
        '    <div class="te-changes-head"><strong>변경 내역</strong> <span class="te-changes-count">0건</span></div>' +
        '    <ul class="te-changes-list"></ul>' +
        '    <div class="te-changes-actions">' +
        '      <button type="button" class="te-clear-all">전체 취소</button>' +
        '      <button type="button" class="te-save-btn">저장 (대기 목록에 추가)</button>' +
        '    </div>' +
        '  </div>' +
        '</div>';

      els.pageSelect = el.querySelector('.te-page-select');
      els.frameOuter = el.querySelector('.te-frame-outer');
      els.frame = el.querySelector('.te-frame');
      els.fallback = el.querySelector('.te-frame-fallback');
      els.boardNotice = el.querySelector('.te-board-notice');
      els.status = el.querySelector('.te-status');
      els.changesList = el.querySelector('.te-changes-list');
      els.changesCount = el.querySelector('.te-changes-count');
      els.clearAllBtn = el.querySelector('.te-clear-all');
      els.saveBtn = el.querySelector('.te-save-btn');

      buildOptions(els.pageSelect);

      els.pageSelect.addEventListener('change', function () {
        loadPage(els.pageSelect.value);
      });

      var vpBtns = toArray(el.querySelectorAll('.te-vp-btn'));
      vpBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          state.viewport = btn.getAttribute('data-vp');
          vpBtns.forEach(function (b) { b.classList.toggle('is-active', b === btn); });
          applyViewport();
        });
      });

      els.clearAllBtn.addEventListener('click', clearAllChanges);
      els.saveBtn.addEventListener('click', saveChanges);

      var resizeTimer = null;
      window.addEventListener('resize', function () {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(applyViewport, 150);
      });

      renderChanges();
      built = true;
    } catch (e) {
      try { el.innerHTML = '<div class="te-banner">페이지 편집 탭을 불러오는 중 오류가 발생했습니다.</div>'; } catch (e2) { /* noop */ }
    }
  }

  function onShow() {
    try {
      if (!built) return;
      // render()가 탭 재활성화 때마다 다시 호출되어 iframe이 새로 생성됐을 수도 있으므로
      // src가 비어있으면(최초 진입 포함) 항상 다시 로드한다.
      var needLoad = !els.frame || !els.frame.getAttribute('src');
      if (needLoad) {
        var key = state.pageKey || PAGES[0].items[0][0];
        if (els.pageSelect) els.pageSelect.value = key;
        loadPage(key);
      } else {
        applyViewport();
      }
    } catch (e) { /* noop */ }
  }

  // ---------------------------------------------------------------------
  // 등록
  // ---------------------------------------------------------------------
  try {
    if (window.AdminTabs && typeof window.AdminTabs.register === 'function') {
      window.AdminTabs.register('editor', { title: '페이지 편집', render: render, onShow: onShow });
    }
  } catch (e) { /* noop */ }
})();
