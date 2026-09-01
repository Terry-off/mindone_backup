/*!
 * admin/js/github-api.js
 * GitHub API 계층 — window.GH
 *
 * 데이터 스키마 요약(계약):
 *   configure({owner, repo, branch='main', token, remember=true})
 *   isConfigured() -> boolean
 *   autoDetect() -> {owner, repo, branch} | null   (location에서 유추)
 *   validateToken() -> Promise<{ok, error}>
 *   readText(path) -> Promise<string>               (항상 원격 최신, raw 미디어타입)
 *   readJsData(path) -> Promise<object>              ('window.__X = <JSON>;' 파싱)
 *   stageText(path, string, label)
 *   stageBinary(path, uint8array, label)
 *   stageDelete(path, label)
 *   stagedList() -> [{path, label, type, size, content}]
 *   unstage(path)
 *   clearStaged()
 *   publish(message) -> Promise<{commitSha}>          (Git Data API 단일 커밋, 성공 시 자동 clearStaged)
 *   pollPagesBuild(onStatus) -> Promise<'built'|'errored'|'timeout'>
 *   verifyDeployed(path, expectedContent, onStatus) -> Promise<'done'|'timeout'|'unknown'>
 *   listCommits(path, n=5) -> Promise<[{sha, date, message}]>
 *   readTextAt(path, sha) -> Promise<string>
 *
 * 모든 오류는 한국어 메시지로 throw 됩니다.
 * 인코딩: 문자열 -> UTF-8 bytes(TextEncoder) -> base64(청크 btoa). 한글 깨짐 없음.
 */
(function (global) {
  'use strict';

  var API_BASE = 'https://api.github.com';
  var TOKEN_KEY = 'minddent:admin:token';
  var REPO_KEY = 'minddent:admin:repo';
  var STAGED_KEY = 'minddent:admin:staged';

  // ----------------------------------------------------------------------
  // 내부 상태
  // ----------------------------------------------------------------------
  var state = {
    owner: '',
    repo: '',
    branch: 'main',
    token: ''
  };

  // staged: path -> entry. order: path 배열(등록 순서 보존)
  var staged = {};
  var stagedOrder = [];

  // ----------------------------------------------------------------------
  // 유틸: base64 / UTF-8
  // ----------------------------------------------------------------------
  function bytesToBase64(bytes) {
    var binary = '';
    var chunkSize = 0x8000;
    for (var i = 0; i < bytes.length; i += chunkSize) {
      var chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }

  function textToBase64(str) {
    try {
      var bytes = new TextEncoder().encode(String(str));
      return bytesToBase64(bytes);
    } catch (e) {
      // TextEncoder 미지원 등 극히 드문 경우의 폴백
      return btoa(unescape(encodeURIComponent(String(str))));
    }
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // ----------------------------------------------------------------------
  // 유틸: 영속화 (best-effort, 실패해도 앱은 정상 동작)
  // ----------------------------------------------------------------------
  function loadPersistedConfig() {
    try {
      var raw = localStorage.getItem(REPO_KEY);
      if (raw) {
        var cfg = JSON.parse(raw);
        if (cfg && typeof cfg === 'object') {
          state.owner = cfg.owner || '';
          state.repo = cfg.repo || '';
          state.branch = cfg.branch || 'main';
        }
      }
    } catch (e) { /* 무시 */ }
    try {
      state.token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
    } catch (e) { /* 무시 */ }
  }

  function persistConfig() {
    try {
      localStorage.setItem(REPO_KEY, JSON.stringify({ owner: state.owner, repo: state.repo, branch: state.branch }));
    } catch (e) { /* 무시 (저장 공간 부족 등) */ }
  }

  function persistToken(remember) {
    try {
      if (remember) {
        localStorage.setItem(TOKEN_KEY, state.token);
        sessionStorage.removeItem(TOKEN_KEY);
      } else {
        sessionStorage.setItem(TOKEN_KEY, state.token);
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch (e) { /* 무시 */ }
  }

  function loadPersistedStaged() {
    try {
      var raw = localStorage.getItem(STAGED_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data && typeof data === 'object' && Array.isArray(data.order)) {
        stagedOrder = data.order.slice();
        staged = data.entries || {};
      }
    } catch (e) {
      // 손상된 데이터는 무시하고 빈 상태로 시작
      staged = {};
      stagedOrder = [];
    }
  }

  function persistStaged() {
    try {
      localStorage.setItem(STAGED_KEY, JSON.stringify({ order: stagedOrder, entries: staged }));
    } catch (e) {
      // 용량 초과 등 — 메모리 상의 저장대기 목록은 계속 동작하되 새로고침 시 사라질 수 있음
      console.warn('[GH] 저장 대기 목록을 로컬에 영속화하지 못했습니다(용량 제한 가능). 메모리에서는 계속 유지됩니다.');
    }
  }

  function notifyStagedChanged() {
    persistStaged();
    try { global.dispatchEvent(new CustomEvent('gh:staged-changed')); } catch (e) { /* 구형 환경 무시 */ }
  }

  // ----------------------------------------------------------------------
  // 오류 매핑 (한국어)
  // ----------------------------------------------------------------------
  function GHError(message, opts) {
    var err = new Error(message);
    err.name = 'GHError';
    err.status = opts && opts.status;
    err.conflict = !!(opts && opts.conflict);
    return err;
  }

  function mapErrorMessage(status, bodyText) {
    if (status === 401) {
      return '토큰이 만료되었거나 권한이 없습니다. 설정 탭에서 토큰을 재발급해 주세요.';
    }
    if (status === 403) {
      var lower = (bodyText || '').toLowerCase();
      if (lower.indexOf('rate limit') !== -1) {
        return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
      }
      if (lower.indexOf('resource not accessible') !== -1 || lower.indexOf('permission') !== -1) {
        return '이 저장소에 대한 쓰기 권한이 없습니다. 토큰의 저장소 접근 범위와 Contents 권한(Read and write)을 확인해주세요.';
      }
      return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
    }
    if (status === 404) {
      return '저장소 또는 파일을 찾을 수 없습니다. owner/repo 이름과 경로를 확인해주세요.';
    }
    if (status === 409 || status === 422) {
      return '다른 곳에서 수정되었습니다. 새로고침 후 다시 시도해주세요.';
    }
    return '요청 중 오류가 발생했습니다. (상태 코드 ' + status + ')';
  }

  // res: fetch Response(!ok). 본문을 안전하게 읽어 에러 메시지를 구성.
  function throwMappedError(res) {
    return res.text().catch(function () { return ''; }).then(function (bodyText) {
      var conflict = (res.status === 409 || res.status === 422);
      throw GHError(mapErrorMessage(res.status, bodyText), { status: res.status, conflict: conflict });
    });
  }

  // ----------------------------------------------------------------------
  // fetch 래퍼
  // ----------------------------------------------------------------------
  function ensureConfigured() {
    if (!state.owner || !state.repo || !state.token) {
      throw GHError('GitHub 연결 설정이 필요합니다. 설정 탭에서 저장소와 토큰을 입력해주세요.', {});
    }
  }

  function ghFetch(path, options) {
    options = options || {};
    var url = /^https?:\/\//.test(path) ? path : API_BASE + path;
    var headers = Object.assign({
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }, options.headers || {});
    if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
    var fetchOpts = Object.assign({}, options, { headers: headers });

    return fetch(url, fetchOpts).catch(function (e) {
      throw GHError('인터넷 연결을 확인해주세요.', {});
    });
  }

  // JSON 응답이 기대되는 요청. 실패 시 매핑된 한국어 오류 throw.
  function ghFetchJson(path, options) {
    return ghFetch(path, options).then(function (res) {
      if (!res.ok) return throwMappedError(res);
      if (res.status === 204) return null;
      return res.json().catch(function () { return null; });
    });
  }

  // 텍스트(raw) 응답이 기대되는 요청.
  function ghFetchText(path, options) {
    return ghFetch(path, options).then(function (res) {
      if (!res.ok) return throwMappedError(res);
      return res.text();
    });
  }

  function encodePath(path) {
    return String(path).split('/').filter(function (s) { return s.length > 0; }).map(encodeURIComponent).join('/');
  }

  // ----------------------------------------------------------------------
  // data/*.js 파싱: 'window.X[...] = <JSON>;' 마지막 대입문 기준
  // (boards/*.js 처럼 두 줄 구조인 경우 두 번째(마지막) 대입문의 JSON을 사용)
  // ----------------------------------------------------------------------
  function parseJsData(text, path) {
    try {
      var re = /window\.[A-Za-z_$][A-Za-z0-9_$]*(\s*\[\s*"[^"]*"\s*\])?\s*=\s*/g;
      var m;
      var last = null;
      while ((m = re.exec(text)) !== null) { last = m; }
      if (!last) throw new Error('no-assignment-found');
      var rest = text.slice(last.index + last[0].length).trim();
      if (rest.charAt(rest.length - 1) === ';') rest = rest.slice(0, -1).trim();
      return JSON.parse(rest);
    } catch (e) {
      throw GHError('데이터 파일 형식을 해석할 수 없습니다: ' + path, {});
    }
  }

  // ----------------------------------------------------------------------
  // 사이트 기준 경로 계산 (verifyDeployed / 게시 완료 링크용)
  // ----------------------------------------------------------------------
  function computeSiteBase() {
    try {
      if (global.location.protocol === 'file:') return null;
      var segments = global.location.pathname.split('/').filter(Boolean);
      var adminIdx = segments.indexOf('admin');
      var baseSegments = adminIdx >= 0 ? segments.slice(0, adminIdx) : [];
      var basePath = baseSegments.length ? ('/' + baseSegments.join('/') + '/') : '/';
      return global.location.origin + basePath;
    } catch (e) {
      return null;
    }
  }

  // ----------------------------------------------------------------------
  // Git Data API 헬퍼 (publish 내부용)
  // ----------------------------------------------------------------------
  function getRefSha() {
    return ghFetchJson('/repos/' + state.owner + '/' + state.repo + '/git/ref/heads/' + encodeURIComponent(state.branch))
      .then(function (data) { return data.object.sha; });
  }

  function getCommitTreeSha(commitSha) {
    return ghFetchJson('/repos/' + state.owner + '/' + state.repo + '/git/commits/' + commitSha)
      .then(function (data) { return data.tree.sha; });
  }

  function createBlob(base64Content) {
    return ghFetchJson('/repos/' + state.owner + '/' + state.repo + '/git/blobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: base64Content, encoding: 'base64' })
    }).then(function (data) { return data.sha; });
  }

  function createTree(baseTreeSha, entries) {
    return ghFetchJson('/repos/' + state.owner + '/' + state.repo + '/git/trees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: entries.map(function (e) {
          return { path: e.path, mode: '100644', type: 'blob', sha: e.sha };
        })
      })
    }).then(function (data) { return data.sha; });
  }

  function createCommit(message, treeSha, parents) {
    return ghFetchJson('/repos/' + state.owner + '/' + state.repo + '/git/commits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message, tree: treeSha, parents: parents })
    }).then(function (data) { return data.sha; });
  }

  function updateRef(commitSha) {
    return ghFetchJson('/repos/' + state.owner + '/' + state.repo + '/git/refs/heads/' + encodeURIComponent(state.branch), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: commitSha, force: false })
    });
  }

  // ----------------------------------------------------------------------
  // window.GH 공개 API
  // ----------------------------------------------------------------------
  var GH = {

    configure: function (opts) {
      opts = opts || {};
      state.owner = (opts.owner || '').trim();
      state.repo = (opts.repo || '').trim();
      state.branch = (opts.branch || 'main').trim() || 'main';
      if (typeof opts.token === 'string') {
        state.token = opts.token.trim();
        persistToken(opts.remember !== false);
      }
      persistConfig();
    },

    isConfigured: function () {
      return !!(state.owner && state.repo && state.token);
    },

    getConfig: function () {
      return {
        owner: state.owner,
        repo: state.repo,
        branch: state.branch,
        hasToken: !!state.token,
        siteBase: computeSiteBase()
      };
    },

    getSiteBase: function () {
      return computeSiteBase();
    },

    autoDetect: function () {
      try {
        if (global.location.protocol === 'file:') return null;
        var host = global.location.hostname || '';
        var hostParts = host.split('.');
        if (hostParts.length < 3 || hostParts.slice(-2).join('.').toLowerCase() !== 'github.io') {
          return null;
        }
        var owner = hostParts[0];
        var segments = global.location.pathname.split('/').filter(Boolean);
        var adminIdx = segments.indexOf('admin');
        var repo;
        if (adminIdx > 0) {
          repo = segments[0];
        } else {
          repo = owner + '.github.io';
        }
        return { owner: owner, repo: repo, branch: 'main' };
      } catch (e) {
        return null;
      }
    },

    validateToken: function () {
      try {
        ensureConfigured();
      } catch (e) {
        return Promise.resolve({ ok: false, error: e.message });
      }
      return ghFetch('/repos/' + state.owner + '/' + state.repo).then(function (res) {
        if (res.ok) return { ok: true };
        return res.text().catch(function () { return ''; }).then(function (bodyText) {
          return { ok: false, error: mapErrorMessage(res.status, bodyText) };
        });
      }).catch(function (e) {
        return { ok: false, error: (e && e.message) || '알 수 없는 오류가 발생했습니다.' };
      });
    },

    readText: function (path) {
      ensureConfigured();
      var url = '/repos/' + state.owner + '/' + state.repo + '/contents/' + encodePath(path) + '?ref=' + encodeURIComponent(state.branch);
      return ghFetchText(url, { headers: { 'Accept': 'application/vnd.github.raw+json' } });
    },

    readJsData: function (path) {
      return GH.readText(path).then(function (text) { return parseJsData(text, path); });
    },

    readTextAt: function (path, sha) {
      ensureConfigured();
      var url = '/repos/' + state.owner + '/' + state.repo + '/contents/' + encodePath(path) + '?ref=' + encodeURIComponent(sha);
      return ghFetchText(url, { headers: { 'Accept': 'application/vnd.github.raw+json' } });
    },

    stageText: function (path, string, label) {
      if (!path) return;
      staged[path] = { path: path, type: 'text', content: String(string), label: label || path };
      if (stagedOrder.indexOf(path) === -1) stagedOrder.push(path);
      notifyStagedChanged();
    },

    stageBinary: function (path, uint8array, label) {
      if (!path) return;
      var base64 = bytesToBase64(uint8array instanceof Uint8Array ? uint8array : new Uint8Array(uint8array));
      staged[path] = { path: path, type: 'binary', contentBase64: base64, size: uint8array.length, label: label || path };
      if (stagedOrder.indexOf(path) === -1) stagedOrder.push(path);
      notifyStagedChanged();
    },

    stageDelete: function (path, label) {
      if (!path) return;
      staged[path] = { path: path, type: 'delete', label: label || ('삭제: ' + path) };
      if (stagedOrder.indexOf(path) === -1) stagedOrder.push(path);
      notifyStagedChanged();
    },

    stagedList: function () {
      return stagedOrder.filter(function (p) { return !!staged[p]; }).map(function (p) {
        var e = staged[p];
        return {
          path: e.path,
          label: e.label,
          type: e.type,
          size: e.type === 'text' ? (e.content ? e.content.length : 0) : (e.size || 0),
          content: e.type === 'text' ? e.content : undefined
        };
      });
    },

    unstage: function (path) {
      delete staged[path];
      stagedOrder = stagedOrder.filter(function (p) { return p !== path; });
      notifyStagedChanged();
    },

    clearStaged: function () {
      staged = {};
      stagedOrder = [];
      notifyStagedChanged();
    },

    publish: function (message) {
      ensureConfigured();
      var entries = stagedOrder.filter(function (p) { return !!staged[p]; }).map(function (p) { return staged[p]; });
      if (!entries.length) {
        return Promise.reject(GHError('게시할 변경사항이 없습니다.', {}));
      }

      // 1) blob 업로드는 콘텐츠 주소화(ref 상태와 무관)이므로 순차적으로 한 번만 수행
      var blobEntriesPromise = entries.reduce(function (chain, e) {
        return chain.then(function (acc) {
          if (e.type === 'delete') {
            acc.push({ path: e.path, sha: null });
            return acc;
          }
          var base64 = e.type === 'text' ? textToBase64(e.content) : e.contentBase64;
          return createBlob(base64).then(function (sha) {
            acc.push({ path: e.path, sha: sha });
            return acc;
          });
        });
      }, Promise.resolve([]));

      function tryCommit(blobEntries) {
        return getRefSha().then(function (headSha) {
          return getCommitTreeSha(headSha).then(function (baseTreeSha) {
            return createTree(baseTreeSha, blobEntries).then(function (newTreeSha) {
              return createCommit(message, newTreeSha, [headSha]).then(function (newCommitSha) {
                return updateRef(newCommitSha).then(function () { return newCommitSha; });
              });
            });
          });
        });
      }

      return blobEntriesPromise.then(function (blobEntries) {
        return tryCommit(blobEntries).catch(function (err) {
          if (err && err.conflict) {
            // 409/422: head 재취득 후 1회 재시도
            return tryCommit(blobEntries).catch(function () {
              throw GHError('다른 곳에서 수정되었습니다. 새로고침 후 다시 시도해주세요.', {});
            });
          }
          throw err;
        });
      }).then(function (commitSha) {
        GH.clearStaged();
        return { commitSha: commitSha };
      });
    },

    pollPagesBuild: function (onStatus) {
      onStatus = typeof onStatus === 'function' ? onStatus : function () {};
      var intervalMs = 5000;
      var maxMs = 3 * 60 * 1000;
      var start = Date.now();

      function safeStatus(s) { try { onStatus(s); } catch (e) { /* 무시 */ } }

      // Actions 기반 Pages 배포용 폴백: 최신 워크플로 실행 상태 확인
      function actionsStatus() {
        return ghFetch('/repos/' + state.owner + '/' + state.repo + '/actions/runs?per_page=1&branch=' + encodeURIComponent(state.branch))
          .then(function (res) { return res.ok ? res.json() : null; })
          .catch(function () { return null; })
          .then(function (data) {
            var run = data && data.workflow_runs && data.workflow_runs[0];
            if (!run) return null;
            if (run.status === 'completed') return run.conclusion === 'success' ? 'built' : 'errored';
            return 'building';
          });
      }

      function loop() {
        if (Date.now() - start >= maxMs) return Promise.resolve('timeout');
        return ghFetch('/repos/' + state.owner + '/' + state.repo + '/pages/builds/latest')
          .then(function (res) {
            if (res.ok) return res.json().catch(function () { return null; });
            return null; // 404 등 — 레거시 Pages 빌드 API 없음(Actions 배포) — Actions 상태로 폴백
          })
          .catch(function () { return null; })
          .then(function (data) {
            var status = data && data.status;
            if (status === 'built' || status === 'errored') return status;
            return actionsStatus().then(function (as) { return as || 'building'; });
          })
          .then(function (status) {
            if (status === 'built') { safeStatus('built'); return 'built'; }
            if (status === 'errored') { safeStatus('errored'); return 'errored'; }
            safeStatus('building');
            return sleep(intervalMs).then(loop);
          });
      }

      return loop();
    },

    verifyDeployed: function (path, expectedContent, onStatus) {
      onStatus = typeof onStatus === 'function' ? onStatus : function () {};
      function safeStatus(s) { try { onStatus(s); } catch (e) { /* 무시 */ } }

      var base = computeSiteBase();
      if (!base || !path) {
        safeStatus('unknown');
        return Promise.resolve('unknown');
      }
      var intervalMs = 15000;
      var maxMs = 10 * 60 * 1000;
      var start = Date.now();
      var cleanPath = String(path).replace(/^\//, '');
      var expected = String(expectedContent == null ? '' : expectedContent).trim();

      function loop() {
        if (Date.now() - start >= maxMs) { safeStatus('timeout'); return Promise.resolve('timeout'); }
        safeStatus('checking');
        var url = base + cleanPath + '?v=' + Date.now();
        return fetch(url, { cache: 'no-store' })
          .then(function (res) { return res.ok ? res.text() : null; })
          .catch(function () { return null; })
          .then(function (text) {
            if (text != null && text.trim() === expected) {
              safeStatus('done');
              return 'done';
            }
            return sleep(intervalMs).then(loop);
          });
      }

      return loop();
    },

    listCommits: function (path, n) {
      ensureConfigured();
      n = n || 5;
      var url = '/repos/' + state.owner + '/' + state.repo + '/commits?path=' + encodePath(path) +
        '&sha=' + encodeURIComponent(state.branch) + '&per_page=' + encodeURIComponent(n);
      return ghFetchJson(url).then(function (list) {
        if (!Array.isArray(list)) return [];
        return list.map(function (c) {
          var commit = c.commit || {};
          var who = commit.author || commit.committer || {};
          var msg = commit.message || '';
          return {
            sha: c.sha,
            date: who.date || '',
            message: msg.split('\n')[0]
          };
        });
      });
    }
  };

  // ----------------------------------------------------------------------
  // 초기화: 영속화된 설정 복원
  // ----------------------------------------------------------------------
  try { loadPersistedConfig(); } catch (e) { /* 무시 */ }
  try { loadPersistedStaged(); } catch (e) { /* 무시 */ }

  global.GH = GH;

})(window);
