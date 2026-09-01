/*!
 * admin/js/app.js
 * 관리자 셸: 로그인 / 탭 전환 / 저장대기 목록 / 게시하기 / 상태 표시
 *
 * 공개 계약(다른 탭 파일이 사용):
 *   window.AdminTabs.register(id, {title, render(el), onShow()})
 *     - render(el): 탭이 최초 마운트될 때 1회 호출. el(빈 컨테이너)에 UI를 그린다. Promise 반환 가능.
 *     - onShow(): 해당 탭이 화면에 표시될 때마다(최초 표시 포함) 호출. 데이터 새로고침 등에 사용. Promise 반환 가능.
 *   window.AdminUtil.pickImage({maxW=1600, quality=0.85, keepPng=false}) -> Promise<{bytes, ext, previewUrl}>
 *   window.AdminUtil.uploadPath(kind, ext) -> 'images/uploads/<kind>-<yyyymmddHHMMSS>.<ext>'
 *   window.AdminUtil.genId(prefix) -> prefix + Date.now()
 *   window.AdminUtil.formatDate(d) -> 'YYYY-MM-DD'
 *   window.AdminUtil.escapeHtml(str)
 *   window.AdminUtil.toast(message, type)  ('info'|'success'|'error')
 */
(function (global) {
  'use strict';

  // ==========================================================================
  // AdminTabs
  // ==========================================================================
  var tabs = [];
  var tabsById = {};
  var appMounted = false;
  var activeTabId = null;

  function safeCall(fn) {
    var extraArgs = Array.prototype.slice.call(arguments, 1);
    return new Promise(function (resolve) {
      try {
        var result = typeof fn === 'function' ? fn.apply(null, extraArgs) : undefined;
        if (result && typeof result.then === 'function') {
          result.then(function () { resolve(null); }, function (err) {
            console.error(err);
            resolve(err || new Error('알 수 없는 오류'));
          });
        } else {
          resolve(null);
        }
      } catch (err) {
        console.error(err);
        resolve(err);
      }
    });
  }

  function renderNav() {
    if (!els.tabNav) return;
    els.tabNav.innerHTML = '';
    tabs.forEach(function (t) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tab-nav-btn' + (t.id === activeTabId ? ' active' : '');
      btn.textContent = t.title;
      btn.dataset.tabId = t.id;
      btn.addEventListener('click', function () { activateTab(t.id); });
      els.tabNav.appendChild(btn);
    });
  }

  function mountSingleTab(t) {
    if (t.mounted || !els.tabContainer) return;
    t.mounted = true;
    var panel = document.createElement('div');
    panel.className = 'tab-panel';
    panel.id = 'tab-panel-' + t.id;
    panel.hidden = true;
    els.tabContainer.appendChild(panel);
    t.panel = panel;
    safeCall(t.render, panel).then(function (err) {
      if (err) {
        var box = document.createElement('p');
        box.className = 'tab-error';
        box.textContent = '이 탭을 불러오는 중 오류가 발생했습니다: ' + (err.message || err);
        panel.appendChild(box);
      }
    });
  }

  function activateTab(id) {
    var t = tabsById[id];
    if (!t) return;
    activeTabId = id;
    tabs.forEach(function (o) { if (o.panel) o.panel.hidden = (o.id !== id); });
    if (els.tabNav) {
      var btns = els.tabNav.querySelectorAll('.tab-nav-btn');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i].dataset.tabId === id);
      }
    }
    if (t.onShow) safeCall(t.onShow);
  }

  function mountApp() {
    if (appMounted) return;
    appMounted = true;
    try {
      renderNav();
      tabs.forEach(mountSingleTab);
      if (tabs.length && !activeTabId) activateTab(tabs[0].id);
    } catch (e) { console.error(e); }
  }

  global.AdminTabs = {
    register: function (id, def) {
      try {
        if (!id || tabsById[id]) {
          console.warn('[AdminTabs] 잘못되었거나 중복된 탭 id: ' + id);
          return;
        }
        def = def || {};
        var tab = { id: String(id), title: def.title || String(id), render: def.render, onShow: def.onShow, mounted: false, panel: null };
        tabs.push(tab);
        tabsById[tab.id] = tab;
        if (appMounted) {
          renderNav();
          mountSingleTab(tab);
        }
      } catch (e) { console.error(e); }
    }
  };

  // ==========================================================================
  // AdminUtil
  // ==========================================================================
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function formatDate(d) {
    try {
      var date = (d instanceof Date) ? d : new Date(d);
      if (isNaN(date.getTime())) return '';
      return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
    } catch (e) { return ''; }
  }

  function timestampCompact(d) {
    var date = d || new Date();
    return '' + date.getFullYear() + pad2(date.getMonth() + 1) + pad2(date.getDate()) +
      pad2(date.getHours()) + pad2(date.getMinutes()) + pad2(date.getSeconds());
  }

  function uploadPath(kind, ext) {
    var safeKind = (kind || 'file').replace(/[^a-z0-9_-]/gi, '') || 'file';
    var safeExt = (ext || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg';
    return 'images/uploads/' + safeKind + '-' + timestampCompact(new Date()) + '.' + safeExt;
  }

  function genId(prefix) {
    return String(prefix || '') + Date.now();
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function loadImageElement(file) {
    return new Promise(function (resolve, reject) {
      if (typeof createImageBitmap === 'function') {
        createImageBitmap(file).then(resolve, function () {
          loadImageViaTag(file).then(resolve, reject);
        });
      } else {
        loadImageViaTag(file).then(resolve, reject);
      }
    });
  }

  function loadImageViaTag(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('read-failed')); };
      reader.onload = function () {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error('decode-failed')); };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function pickImage(opts) {
    opts = opts || {};
    var maxW = opts.maxW || 1600;
    var quality = opts.quality != null ? opts.quality : 0.85;
    var keepPng = !!opts.keepPng;

    return new Promise(function (resolve, reject) {
      var input;
      try {
        input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.position = 'fixed';
        input.style.left = '-9999px';
        document.body.appendChild(input);
      } catch (e) {
        alert('이미지를 읽을 수 없습니다. JPG 또는 PNG로 저장한 후 다시 올려주세요.');
        reject(e);
        return;
      }

      var settled = false;
      function cleanup() {
        try { if (input && input.parentNode) input.parentNode.removeChild(input); } catch (e) { /* 무시 */ }
      }
      // 파일 선택 취소 시 별도 이벤트가 없어 감지가 어려우므로, 창 포커스 복귀 시 값이 없으면 정리한다.
      function onWindowFocus() {
        setTimeout(function () {
          if (!settled && input && (!input.files || !input.files.length)) {
            settled = true;
            cleanup();
            global.removeEventListener('focus', onWindowFocus);
            reject(new Error('취소됨'));
          }
        }, 300);
      }
      global.addEventListener('focus', onWindowFocus);

      input.addEventListener('change', function () {
        if (settled) return;
        var file = input.files && input.files[0];
        if (!file) { settled = true; cleanup(); global.removeEventListener('focus', onWindowFocus); reject(new Error('취소됨')); return; }

        loadImageElement(file).then(function (imgLike) {
          var width = imgLike.width;
          var height = imgLike.height;
          var scale = width > maxW ? (maxW / width) : 1;
          var outW = Math.max(1, Math.round(width * scale));
          var outH = Math.max(1, Math.round(height * scale));

          var canvas = document.createElement('canvas');
          canvas.width = outW;
          canvas.height = outH;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(imgLike, 0, 0, outW, outH);

          var mime = keepPng ? 'image/png' : 'image/jpeg';
          var ext = keepPng ? 'png' : 'jpg';

          canvas.toBlob(function (blob) {
            if (!blob) {
              settled = true; cleanup(); global.removeEventListener('focus', onWindowFocus);
              alert('이미지를 읽을 수 없습니다. JPG 또는 PNG로 저장한 후 다시 올려주세요.');
              reject(new Error('encode-failed'));
              return;
            }
            blob.arrayBuffer().then(function (buf) {
              settled = true; cleanup(); global.removeEventListener('focus', onWindowFocus);
              var bytes = new Uint8Array(buf);
              var previewUrl = URL.createObjectURL(blob);
              resolve({ bytes: bytes, ext: ext, previewUrl: previewUrl });
            }).catch(function (e) {
              settled = true; cleanup(); global.removeEventListener('focus', onWindowFocus);
              alert('이미지를 읽을 수 없습니다. JPG 또는 PNG로 저장한 후 다시 올려주세요.');
              reject(e);
            });
          }, mime, keepPng ? undefined : quality);
        }, function (err) {
          settled = true; cleanup(); global.removeEventListener('focus', onWindowFocus);
          alert('이미지를 읽을 수 없습니다. JPG 또는 PNG로 저장한 후 다시 올려주세요.');
          reject(err);
        });
      });

      input.click();
    });
  }

  function toast(message, type) {
    try {
      if (!els.toast) return;
      els.toast.textContent = message;
      els.toast.className = 'toast toast-' + (type || 'info') + ' show';
      clearTimeout(toast._t);
      toast._t = setTimeout(function () {
        if (els.toast) els.toast.className = 'toast';
      }, 5000);
    } catch (e) { /* 무시 */ }
  }

  global.AdminUtil = {
    pickImage: pickImage,
    uploadPath: uploadPath,
    genId: genId,
    formatDate: formatDate,
    escapeHtml: escapeHtml,
    toast: toast
  };

  // ==========================================================================
  // 셸 (로그인 / 헤더 / 게시)
  // ==========================================================================
  var els = {};
  var publishing = false;

  function cacheEls() {
    els.fileBanner = document.getElementById('file-banner');
    els.loginScreen = document.getElementById('login-screen');
    els.appShell = document.getElementById('app-shell');
    els.loginForm = document.getElementById('login-form');
    els.loginOwner = document.getElementById('login-owner');
    els.loginRepo = document.getElementById('login-repo');
    els.loginBranch = document.getElementById('login-branch');
    els.loginToken = document.getElementById('login-token');
    els.loginNoRemember = document.getElementById('login-noremember');
    els.loginError = document.getElementById('login-error');
    els.loginSubmit = document.getElementById('login-submit');
    els.tabNav = document.getElementById('tab-nav');
    els.tabContainer = document.getElementById('tab-container');
    els.stagedCount = document.getElementById('staged-count');
    els.publishBtn = document.getElementById('publish-btn');
    els.publishStatus = document.getElementById('publish-status');
    els.toast = document.getElementById('toast');
  }

  function setLoginError(msg) {
    if (!els.loginError) return;
    if (msg) {
      els.loginError.textContent = msg;
      els.loginError.hidden = false;
    } else {
      els.loginError.textContent = '';
      els.loginError.hidden = true;
    }
  }

  function setLoginBusy(busy) {
    if (els.loginSubmit) {
      els.loginSubmit.disabled = !!busy;
      els.loginSubmit.textContent = busy ? '연결 확인 중...' : '연결하기';
    }
  }

  function showApp() {
    if (els.loginScreen) els.loginScreen.hidden = true;
    if (els.appShell) els.appShell.hidden = false;
    mountApp();
    refreshStagedBar();
  }

  function showLogin() {
    if (els.appShell) els.appShell.hidden = true;
    if (els.loginScreen) els.loginScreen.hidden = false;
  }

  function prefillLogin() {
    try {
      var auto = (global.GH && global.GH.autoDetect) ? global.GH.autoDetect() : null;
      var cfg = (global.GH && global.GH.getConfig) ? global.GH.getConfig() : null;
      if (els.loginOwner && !els.loginOwner.value) {
        els.loginOwner.value = (cfg && cfg.owner) || (auto && auto.owner) || '';
      }
      if (els.loginRepo && !els.loginRepo.value) {
        els.loginRepo.value = (cfg && cfg.repo) || (auto && auto.repo) || '';
      }
      if (els.loginBranch && !els.loginBranch.value) {
        els.loginBranch.value = (cfg && cfg.branch) || (auto && auto.branch) || 'main';
      }
    } catch (e) { /* 무시 */ }
  }

  function wireLogin() {
    if (!els.loginForm) return;
    prefillLogin();
    els.loginForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      submitLogin();
    });
  }

  function submitLogin() {
    setLoginError('');
    setLoginBusy(true);
    try {
      var owner = (els.loginOwner && els.loginOwner.value || '').trim();
      var repo = (els.loginRepo && els.loginRepo.value || '').trim();
      var branch = (els.loginBranch && els.loginBranch.value || '').trim() || 'main';
      var token = (els.loginToken && els.loginToken.value || '').trim();
      var remember = !(els.loginNoRemember && els.loginNoRemember.checked);

      if (!owner || !repo || !token) {
        setLoginError('GitHub 계정, 저장소, 토큰을 모두 입력해주세요.');
        setLoginBusy(false);
        return;
      }
      if (!global.GH) {
        setLoginError('내부 오류: GitHub 연동 모듈을 불러오지 못했습니다.');
        setLoginBusy(false);
        return;
      }
      global.GH.configure({ owner: owner, repo: repo, branch: branch, token: token, remember: remember });
      global.GH.validateToken().then(function (r) {
        setLoginBusy(false);
        if (r.ok) {
          showApp();
        } else {
          setLoginError(r.error || '연결에 실패했습니다.');
        }
      }).catch(function (e) {
        setLoginBusy(false);
        setLoginError((e && e.message) || '연결 중 오류가 발생했습니다.');
      });
    } catch (e) {
      setLoginBusy(false);
      setLoginError((e && e.message) || '연결 중 오류가 발생했습니다.');
    }
  }

  function refreshStagedBar() {
    try {
      var list = (global.GH && global.GH.stagedList) ? global.GH.stagedList() : [];
      if (els.stagedCount) els.stagedCount.textContent = '저장 대기 ' + list.length + '건';
      if (els.publishBtn) els.publishBtn.disabled = (list.length === 0) || publishing;
    } catch (e) { /* 무시 */ }
  }

  function setPublishStatus(text) {
    if (els.publishStatus) els.publishStatus.textContent = text || '';
  }

  function wirePublishBar() {
    if (els.publishBtn) els.publishBtn.addEventListener('click', doPublish);
    refreshStagedBar();
    setInterval(refreshStagedBar, 3000);
    global.addEventListener('gh:staged-changed', refreshStagedBar);
  }

  function doPublish() {
    if (publishing) return;
    if (!global.GH) return;
    var list;
    try { list = global.GH.stagedList(); } catch (e) { list = []; }
    if (!list.length) return;

    var names = list.map(function (i) { return '- ' + (i.label || i.path); }).join('\n');
    var ok = confirm('다음 ' + list.length + '건을 게시합니다:\n' + names);
    if (!ok) return;

    publishing = true;
    refreshStagedBar();
    setPublishStatus('게시 중...');

    var verifyTarget = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].type === 'text' && list[i].content != null) { verifyTarget = list[i]; break; }
    }

    var labelSummary = list.slice(0, 5).map(function (i) { return i.label || i.path; }).join(', ');
    if (list.length > 5) labelSummary += ' 외 ' + (list.length - 5) + '건';

    global.GH.publish('관리자 게시: ' + labelSummary).then(function () {
      setPublishStatus('게시 중(빌드)... 보통 1~3분, 최대 10분 걸립니다.');
      return global.GH.pollPagesBuild(function (status) {
        if (status === 'built') setPublishStatus('반영 확인 중...');
        else if (status === 'errored') setPublishStatus('⚠ Pages 빌드 상태 확인 중 문제가 감지되었습니다. 잠시 후 사이트를 확인해주세요.');
        else setPublishStatus('게시 중(빌드)... 보통 1~3분, 최대 10분 걸립니다.');
      });
    }).then(function () {
      if (!verifyTarget) {
        setPublishStatus('반영 완료 ✓');
        return null;
      }
      setPublishStatus('반영 확인 중...');
      return global.GH.verifyDeployed(verifyTarget.path, verifyTarget.content, function (status) {
        if (status === 'checking') setPublishStatus('반영 확인 중...');
        else if (status === 'timeout') setPublishStatus('반영 확인 시간이 초과되었습니다. 잠시 후 사이트에서 직접 확인해주세요.');
      });
    }).then(function () {
      setPublishStatus('반영 완료 ✓');
      var base = (global.GH.getSiteBase && global.GH.getSiteBase()) || '';
      var link = base ? (' <a href="' + base + '" target="_blank" rel="noopener">사이트에서 확인하기 →</a>') : '';
      toast('게시가 완료되었습니다. 사이트에서 확인하세요.', 'success');
      if (els.publishStatus && link) els.publishStatus.innerHTML = '반영 완료 ✓' + link;
    }).catch(function (e) {
      var msg = (e && e.message) || '알 수 없는 오류가 발생했습니다.';
      setPublishStatus('오류: ' + msg);
      toast('게시 중 오류가 발생했습니다: ' + msg, 'error');
    }).then(function () {
      publishing = false;
      refreshStagedBar();
    });
  }

  function onBeforeUnload(e) {
    try {
      if (global.GH && global.GH.stagedList && global.GH.stagedList().length > 0) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    } catch (err) { /* 무시 */ }
  }

  function tryAutoLogin() {
    try {
      if (global.GH && global.GH.isConfigured && global.GH.isConfigured()) {
        setLoginBusy(true);
        global.GH.validateToken().then(function (r) {
          setLoginBusy(false);
          if (r.ok) {
            showApp();
          } else {
            prefillLogin();
            showLogin();
            setLoginError(r.error || '저장된 토큰으로 연결하지 못했습니다. 다시 시도해주세요.');
          }
        }).catch(function (e) {
          setLoginBusy(false);
          showLogin();
          setLoginError((e && e.message) || '연결 중 오류가 발생했습니다.');
        });
        return;
      }
    } catch (e) { /* 무시 */ }
    showLogin();
  }

  function init() {
    try {
      cacheEls();
      try {
        if (global.location.protocol === 'file:' && els.fileBanner) {
          els.fileBanner.hidden = false;
        }
      } catch (e) { /* 무시 */ }
      wireLogin();
      wirePublishBar();
      global.addEventListener('beforeunload', onBeforeUnload);
      tryAutoLogin();
    } catch (e) {
      console.error(e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);
