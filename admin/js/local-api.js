/* local-api.js — 관리자 "로컬 모드" 백엔드
 *
 * 내 컴퓨터에서 관리자 프로그램(tools/serve.ps1)을 통해 열었을 때 사용된다.
 * GitHub 토큰이 필요 없다: 파일은 내 PC의 저장소 폴더에 직접 저장되고,
 * [게시하기]를 누르면 서버가 git commit + push를 대신 실행해 실제 사이트에 반영한다.
 *
 * window.GH 계약(github-api.js와 동일)을 그대로 구현해 교체하므로,
 * 각 탭(tab-popup/tab-board/tab-partner/tab-editor/tab-settings)은 수정 없이 동작한다.
 * 로컬이 아니면(=github.io에서 열면) 아무 것도 하지 않고 기존 토큰 방식이 유지된다.
 */
(function (global) {
  'use strict';

  var host = (global.location && global.location.hostname) || '';
  var isLocal = (host === 'localhost' || host === '127.0.0.1');
  if (!isLocal) { return; }

  var staged = {};
  var stagedOrder = [];
  var siteBase = '';
  var branch = 'main';
  var serverOk = false;

  // ---------- 유틸 ----------
  function bytesToBase64(bytes) {
    var chunk = 0x8000, out = '';
    for (var i = 0; i < bytes.length; i += chunk) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(out);
  }

  function api(path, opts) {
    return fetch(path, opts).then(function (res) {
      return res.json().catch(function () { return { ok: false, error: '서버 응답을 읽을 수 없습니다.' }; })
        .then(function (data) {
          if (!res.ok || data.ok === false) {
            throw new Error((data && data.error) || '관리자 프로그램과 통신하지 못했습니다.');
          }
          return data;
        });
    }, function () {
      throw new Error('관리자 프로그램이 종료된 것 같습니다. 바탕화면의 "마인드원치과 관리자"를 다시 실행해주세요.');
    });
  }

  function parseJsData(text, path) {
    // 'window.__X = { ... };' 형태에서 JSON 부분만 추출
    var eq = text.indexOf('=', text.lastIndexOf('window.'));
    var end = text.lastIndexOf(';');
    if (eq === -1 || end === -1 || end < eq) {
      throw new Error('데이터 파일 형식을 읽을 수 없습니다: ' + path);
    }
    return JSON.parse(text.slice(eq + 1, end).trim());
  }

  function notifyStagedChanged() {
    try { global.dispatchEvent(new CustomEvent('gh:staged-changed')); } catch (e) {}
  }

  function stagedListInternal() {
    return stagedOrder.map(function (p) { return staged[p]; }).filter(Boolean);
  }

  // ---------- window.GH 구현 ----------
  var LocalGH = {
    isLocalMode: true,

    configure: function () { /* 로컬 모드에서는 설정할 것이 없다 */ },
    isConfigured: function () { return true; },
    getConfig: function () {
      return { owner: '(내 컴퓨터)', repo: '로컬 모드', branch: branch, hasToken: true, siteBase: siteBase, local: true };
    },
    getSiteBase: function () { return siteBase; },
    autoDetect: function () { return null; },

    validateToken: function () {
      return api('/__api/ping').then(function (d) {
        serverOk = true;
        siteBase = d.siteBase || '';
        branch = d.branch || 'main';
        return { ok: true };
      }).catch(function (e) {
        return { ok: false, error: e.message };
      });
    },

    readText: function (path) {
      // 저장 대기 중인 내용이 있으면 그것을 우선 반환(편집 중 값 유지)
      if (staged[path] && staged[path].type === 'text') {
        return Promise.resolve(staged[path].content);
      }
      return api('/__api/read?path=' + encodeURIComponent(path)).then(function (d) { return d.content; });
    },

    readJsData: function (path) {
      return LocalGH.readText(path).then(function (t) { return parseJsData(t, path); });
    },

    readTextAt: function (path, sha) {
      return api('/__api/readAt?path=' + encodeURIComponent(path) + '&sha=' + encodeURIComponent(sha))
        .then(function (d) { return d.content; });
    },

    stageText: function (path, string, label) {
      if (!path) return;
      staged[path] = { path: path, type: 'text', content: String(string), label: label || path };
      if (stagedOrder.indexOf(path) === -1) stagedOrder.push(path);
      notifyStagedChanged();
    },

    stageBinary: function (path, uint8array, label) {
      if (!path) return;
      var bytes = uint8array instanceof Uint8Array ? uint8array : new Uint8Array(uint8array);
      staged[path] = { path: path, type: 'binary', contentBase64: bytesToBase64(bytes), size: bytes.length, label: label || path };
      if (stagedOrder.indexOf(path) === -1) stagedOrder.push(path);
      notifyStagedChanged();
    },

    stageDelete: function (path, label) {
      if (!path) return;
      staged[path] = { path: path, type: 'delete', label: label || ('삭제: ' + path) };
      if (stagedOrder.indexOf(path) === -1) stagedOrder.push(path);
      notifyStagedChanged();
    },

    stagedList: stagedListInternal,

    unstage: function (path) {
      delete staged[path];
      var i = stagedOrder.indexOf(path);
      if (i >= 0) stagedOrder.splice(i, 1);
      notifyStagedChanged();
    },

    clearStaged: function () {
      staged = {}; stagedOrder = [];
      notifyStagedChanged();
    },

    publish: function (message) {
      var list = stagedListInternal();
      if (!list.length) { return Promise.reject(new Error('게시할 변경 사항이 없습니다.')); }
      var files = list.map(function (e) {
        if (e.type === 'delete') { return { path: e.path, delete: true }; }
        if (e.type === 'binary') { return { path: e.path, encoding: 'base64', contentBase64: e.contentBase64 }; }
        return { path: e.path, content: e.content };
      });
      return api('/__api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: files })
      }).then(function () {
        return api('/__api/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: message || '관리자 수정' })
        });
      }).then(function (d) {
        LocalGH.clearStaged();
        return { commitSha: d.sha || '' };
      });
    },

    // 로컬 모드에서는 Pages 빌드 API를 쓸 수 없으므로(권한 필요) 곧바로 다음 단계로 넘어간다.
    pollPagesBuild: function (onStatus) {
      try { if (onStatus) onStatus('building'); } catch (e) {}
      return new Promise(function (resolve) {
        setTimeout(function () {
          try { if (onStatus) onStatus('built'); } catch (e) {}
          resolve('built');
        }, 1000);
      });
    },

    // 실제 사이트에서 내용이 바뀌었는지 직접 확인(공개 사이트라 인증 불필요)
    verifyDeployed: function (path, expectedContent, onStatus) {
      function status(s) { try { if (onStatus) onStatus(s); } catch (e) {} }
      if (!siteBase || !path) { status('unknown'); return Promise.resolve('unknown'); }
      var expected = String(expectedContent == null ? '' : expectedContent).trim();
      var start = Date.now();
      var maxMs = 10 * 60 * 1000;
      function loop() {
        if (Date.now() - start >= maxMs) { status('timeout'); return Promise.resolve('timeout'); }
        status('checking');
        return fetch(siteBase + String(path).replace(/^\//, '') + '?v=' + Date.now(), { cache: 'no-store' })
          .then(function (r) { return r.ok ? r.text() : null; })
          .catch(function () { return null; })
          .then(function (text) {
            if (text != null && text.trim() === expected) { status('deployed'); return 'deployed'; }
            return new Promise(function (res) { setTimeout(res, 15000); }).then(loop);
          });
      }
      return loop();
    },

    listCommits: function (path, n) {
      return api('/__api/history?path=' + encodeURIComponent(path) + '&n=' + (n || 5))
        .then(function (d) { return d.commits || []; });
    }
  };

  global.GH = LocalGH;

  // 서버 정보(사이트 주소/브랜치)를 미리 확보
  api('/__api/ping').then(function (d) {
    serverOk = true;
    siteBase = d.siteBase || '';
    branch = d.branch || 'main';
  }).catch(function () { /* app.js의 로그인 절차에서 다시 안내된다 */ });
})(window);