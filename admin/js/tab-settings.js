/*!
 * tab-settings.js — "설정" 탭
 * 사용 계약: window.GH(github-api.js), window.AdminTabs.register(app.js), window.AdminUtil(app.js)
 * 이 파일은 위 세 전역만 사용한다(다른 탭 파일 직접 참조 금지).
 *
 * 기능 요약:
 *  1) GitHub 연결: owner/repo/branch(자동감지 표시, 수정 가능) + 토큰(password) + 저장 위치 선택 + [연결 테스트]
 *  2) 문의 메일 자동발송: Formspree 엔드포인트 → data/config.js 스테이징
 *  3) 복원: 대상 파일 선택 → 최근 5개 커밋 이력 → 특정 시점으로 복원(스테이징)
 *  4) 도움말(PAT 발급 안내) 링크 → help/index.html
 *
 * 토큰 저장 위치는 GH.configure({..., remember})가 내부적으로 처리한다(localStorage 기본,
 * '이 컴퓨터에 저장 안 함' 체크 시 sessionStorage). 이 파일은 토큰 원문을 직접 읽거나 쓰지 않는다.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // 복원 대상 파일 목록
  // ---------------------------------------------------------------------
  var BOARD_IDS = ['86', '104', '105', '106', '121', '107', '108', '109', '110', '111',
    '112', '113', '114', '115', '116', '117', '118', '119'];

  var RESTORE_FILES = [
    ['data/popups.js', '팝업 데이터 (data/popups.js)'],
    ['data/partners.js', '협약기관 데이터 (data/partners.js)'],
    ['data/overrides.js', '페이지 편집 데이터 (data/overrides.js)'],
    ['data/config.js', '사이트 설정 (data/config.js)']
  ];
  BOARD_IDS.forEach(function (id) {
    RESTORE_FILES.push(['data/boards/' + id + '.js', '실제사례 게시판 글 데이터 (data/boards/' + id + '.js)']);
  });

  // ---------------------------------------------------------------------
  // 상태 / DOM 참조
  // ---------------------------------------------------------------------
  var els = {};
  var built = false;

  // ---------------------------------------------------------------------
  // 소형 유틸
  // ---------------------------------------------------------------------
  function setStatus(msg, isError) {
    if (!els.status) return;
    els.status.textContent = msg || '';
    els.status.style.color = isError ? '#c0392b' : '#777';
  }

  function setFormspreeStatus(msg, isError) {
    if (!els.formspreeStatus) return;
    els.formspreeStatus.textContent = msg || '';
    els.formspreeStatus.style.color = isError ? '#c0392b' : '#2c7a2c';
  }

  function errMsg(err) {
    return (err && err.message) ? err.message : String(err || '알 수 없는 오류');
  }

  function formatCommitDate(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return iso || '';
      return d.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso || ''; }
  }

  // ---------------------------------------------------------------------
  // 1) GitHub 연결
  // ---------------------------------------------------------------------
  function prefillConnection() {
    var cfg = null;
    try {
      if (window.GH && typeof GH.getConfig === 'function') cfg = GH.getConfig();
    } catch (e) { cfg = null; }
    var configured = false;
    try { configured = !!(window.GH && typeof GH.isConfigured === 'function' && GH.isConfigured()); } catch (e) { configured = false; }

    // 이미 입력값이 있으면(사용자가 수정 중) 덮어쓰지 않는다.
    var hasValue = els.owner && (els.owner.value || els.repo.value);
    if (!hasValue) {
      if (cfg && (cfg.owner || cfg.repo)) {
        if (els.owner) els.owner.value = cfg.owner || '';
        if (els.repo) els.repo.value = cfg.repo || '';
        if (els.branch) els.branch.value = cfg.branch || 'main';
      } else {
        var auto = null;
        try {
          if (window.GH && typeof GH.autoDetect === 'function') auto = GH.autoDetect();
        } catch (e) { auto = null; }
        if (els.owner) els.owner.value = (auto && auto.owner) || '';
        if (els.repo) els.repo.value = (auto && auto.repo) || '';
        if (els.branch) els.branch.value = (auto && auto.branch) || 'main';
      }
    }

    // 토큰 원문은 GH가 노출하지 않으므로(보안) 직접 채우지 않는다.
    // 이미 저장된 토큰이 있으면 안내만 하고, 입력란은 "변경 시에만 입력" 방식으로 비워둔다.
    if (els.token) {
      els.token.placeholder = (cfg && cfg.hasToken)
        ? '저장된 토큰이 있습니다. 변경하려면 새로 입력하세요.'
        : 'ghp_ 또는 github_pat_ 로 시작';
    }

    setStatus(configured ? 'GitHub 연동이 설정되어 있습니다.' : 'GitHub 연동이 아직 설정되지 않았습니다.');
  }

  function onTestConnection() {
    try {
      var owner = (els.owner.value || '').trim();
      var repo = (els.repo.value || '').trim();
      var branch = (els.branch.value || '').trim() || 'main';
      var token = els.token.value || '';

      if (!owner || !repo) { alert('GitHub 계정(owner)과 저장소(repo) 이름을 입력해주세요.'); return; }

      if (!window.GH || typeof GH.configure !== 'function' || typeof GH.isConfigured !== 'function' || typeof GH.validateToken !== 'function') {
        alert('GitHub 연동 모듈을 사용할 수 없습니다.');
        return;
      }

      var alreadyHasToken = false;
      try { alreadyHasToken = GH.isConfigured(); } catch (e) { alreadyHasToken = false; }
      if (!token && !alreadyHasToken) {
        alert('토큰을 입력해주세요. 발급 방법은 [토큰 발급 방법 안내]를 참고하세요.');
        return;
      }

      // token을 비워두면(이미 저장된 토큰이 있는 경우) 기존 토큰을 그대로 유지한다.
      var opts = { owner: owner, repo: repo, branch: branch, remember: !!els.remember.checked };
      if (token) opts.token = token;
      GH.configure(opts);

      if (els.testBtn) els.testBtn.disabled = true;
      setStatus('연결을 테스트하는 중…');

      Promise.resolve()
        .then(function () { return GH.validateToken(); })
        .then(function (res) {
          if (res && res.ok) {
            if (els.token) els.token.value = '';
            prefillConnection();
            setStatus('연결 성공 ✓ (' + owner + '/' + repo + ')');
            alert('GitHub 저장소 연결에 성공했습니다.');
          } else {
            var msg = (res && res.error) || '연결에 실패했습니다. 토큰과 저장소 이름을 확인해주세요.';
            setStatus(msg, true);
            alert(msg);
          }
        })
        .catch(function (err) {
          var msg = errMsg(err);
          setStatus(msg, true);
          alert('연결 테스트 중 오류가 발생했습니다: ' + msg);
        })
        .then(function () {
          if (els.testBtn) els.testBtn.disabled = false;
        });
    } catch (e) {
      alert('연결 설정 중 오류가 발생했습니다: ' + errMsg(e));
      if (els.testBtn) els.testBtn.disabled = false;
    }
  }

  // ---------------------------------------------------------------------
  // 2) Formspree 엔드포인트 → data/config.js
  // ---------------------------------------------------------------------
  function prefillFormspree() {
    if (!window.GH || typeof GH.readJsData !== 'function') return;
    Promise.resolve()
      .then(function () { return GH.readJsData('data/config.js'); })
      .then(function (cfg) {
        if (cfg && typeof cfg === 'object' && els.formspree) {
          els.formspree.value = cfg.formspreeEndpoint || '';
        }
      })
      .catch(function (err) {
        try { console.warn('[tab-settings] data/config.js 불러오기 실패', err); } catch (e) { /* noop */ }
      });
  }

  function onSaveFormspree() {
    if (!window.GH || typeof GH.stageText !== 'function' || typeof GH.readJsData !== 'function') {
      alert('GitHub 연동 모듈을 사용할 수 없습니다.');
      return;
    }
    var val = (els.formspree.value || '').trim();
    if (els.formspreeBtn) els.formspreeBtn.disabled = true;
    setFormspreeStatus('저장 중…');

    Promise.resolve()
      .then(function () { return GH.readJsData('data/config.js'); })
      .catch(function (err) {
        try { console.warn('[tab-settings] 원격 config.js를 불러오지 못해 기본값으로 진행합니다.', err); } catch (e) { /* noop */ }
        return null;
      })
      .then(function (cfg) {
        if (!cfg || typeof cfg !== 'object') {
          cfg = { siteName: '광주 마인드원치과의원', inquiryEmail: 'minddent@naver.com', formspreeEndpoint: '' };
        }
        cfg.formspreeEndpoint = val;
        var text = 'window.__CONFIG = ' + JSON.stringify(cfg, null, 2) + ';\n';
        GH.stageText('data/config.js', text, '설정: Formspree 엔드포인트 변경');
        setFormspreeStatus('저장 대기 목록에 추가되었습니다.');
        alert('저장되었습니다. 상단의 [게시하기]를 눌러야 실제 사이트에 반영됩니다.');
      })
      .catch(function (err) {
        setFormspreeStatus('저장 실패', true);
        alert('저장 중 오류가 발생했습니다: ' + errMsg(err));
      })
      .then(function () {
        if (els.formspreeBtn) els.formspreeBtn.disabled = false;
      });
  }

  // ---------------------------------------------------------------------
  // 3) 복원
  // ---------------------------------------------------------------------
  function buildRestoreOptions(selectEl) {
    RESTORE_FILES.forEach(function (item) {
      var opt = document.createElement('option');
      opt.value = item[0];
      opt.textContent = item[1];
      selectEl.appendChild(opt);
    });
  }

  function onViewHistory() {
    if (!window.GH || typeof GH.listCommits !== 'function') {
      alert('GitHub 연동 모듈을 사용할 수 없습니다.');
      return;
    }
    var path = els.restoreSelect.value;
    if (!path) { alert('복원할 파일을 선택해주세요.'); return; }

    els.historyList.innerHTML = '';
    if (els.historyBtn) els.historyBtn.disabled = true;
    setStatus('이력을 불러오는 중…');

    Promise.resolve()
      .then(function () { return GH.listCommits(path, 5); })
      .then(function (list) {
        setStatus('');
        els.historyList.innerHTML = '';
        if (!list || !list.length) {
          var empty = document.createElement('li');
          empty.className = 'ts-hist-empty';
          empty.textContent = '이 파일의 변경 이력을 찾을 수 없습니다.';
          els.historyList.appendChild(empty);
          return;
        }
        list.forEach(function (c) {
          var li = document.createElement('li');
          li.className = 'ts-hist-item';

          var meta = document.createElement('div');
          meta.className = 'ts-hist-meta';
          var dateText = formatCommitDate(c.date);
          var msgText = c.message || '(설명 없음)';
          meta.textContent = dateText + ' · ' + msgText;
          li.appendChild(meta);

          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'ts-restore-btn';
          btn.textContent = '이 버전으로 복원';
          btn.addEventListener('click', function () { onRestore(path, c.sha, dateText, msgText); });
          li.appendChild(btn);

          els.historyList.appendChild(li);
        });
      })
      .catch(function (err) {
        setStatus('', false);
        alert('이력을 불러오지 못했습니다: ' + errMsg(err));
      })
      .then(function () {
        if (els.historyBtn) els.historyBtn.disabled = false;
      });
  }

  function onRestore(path, sha, dateText, msgText) {
    if (!window.GH || typeof GH.readTextAt !== 'function' || typeof GH.stageText !== 'function') {
      alert('GitHub 연동 모듈을 사용할 수 없습니다.');
      return;
    }
    var ok = confirm(
      '"' + path + '" 파일을\n' + dateText + ' · ' + msgText + '\n버전으로 복원할까요?\n\n' +
      '저장 대기 목록에 추가되며, 상단 [게시하기]를 눌러야 실제 사이트에 반영됩니다.'
    );
    if (!ok) return;

    setStatus('복원 준비 중…');
    Promise.resolve()
      .then(function () { return GH.readTextAt(path, sha); })
      .then(function (content) {
        GH.stageText(path, content, '이전 버전 복원: ' + path + ' (' + (dateText || sha) + ')');
        setStatus('');
        alert('이전 버전이 저장 대기 목록에 추가되었습니다. 상단의 [게시하기]를 눌러야 반영됩니다.');
      })
      .catch(function (err) {
        setStatus('', false);
        alert('복원 중 오류가 발생했습니다: ' + errMsg(err));
      });
  }

  // ---------------------------------------------------------------------
  // render / onShow (AdminTabs 계약)
  // ---------------------------------------------------------------------
  function injectStyleOnce() {
    if (document.getElementById('tab-settings-style')) return;
    var style = document.createElement('style');
    style.id = 'tab-settings-style';
    style.textContent =
      '.ts-wrap{display:flex;flex-direction:column;gap:18px;max-width:720px;}' +
      '.ts-section{border:1px solid #ddd;border-radius:8px;padding:16px 18px;}' +
      '.ts-section h3{margin:0 0 10px;font-size:15px;color:#222;}' +
      '.ts-row{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px;align-items:center;}' +
      '.ts-row label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:#555;flex:1 1 160px;}' +
      '.ts-row input[type="text"],.ts-row input[type="password"],.ts-row input[type="url"]{padding:7px 9px;border:1px solid #ddd;border-radius:6px;font-size:14px;}' +
      '.ts-checkline{display:flex;align-items:center;gap:6px;font-size:13px;color:#555;}' +
      '.ts-help-text{font-size:12px;color:#888;line-height:1.5;margin:4px 0 10px;}' +
      '.ts-btn{padding:8px 16px;border:0;background:#ff6000;color:#fff;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;}' +
      '.ts-btn:disabled{opacity:.6;cursor:default;}' +
      '.ts-btn-secondary{padding:7px 14px;border:1px solid #ddd;background:#fff;color:#333;border-radius:6px;cursor:pointer;font-size:13px;}' +
      '.ts-status{font-size:13px;color:#777;margin-left:8px;}' +
      '.ts-hist-list{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:6px;max-height:220px;overflow:auto;}' +
      '.ts-hist-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;background:#fafafa;border:1px solid #eee;border-radius:6px;font-size:13px;}' +
      '.ts-hist-meta{flex:1 1 auto;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.ts-hist-empty{color:#999;font-size:13px;}' +
      '.ts-restore-btn{flex:0 0 auto;border:1px solid #ddd;background:#fff;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;}' +
      '.ts-help-link{display:inline-block;margin-top:6px;color:#ff6000;text-decoration:none;font-size:13px;font-weight:600;}' +
      '.ts-help-link:hover{text-decoration:underline;}' +
      '.ts-warn{font-size:12px;color:#a33;margin-top:6px;}';
    document.head.appendChild(style);
  }

  function render(el) {
    try {
      injectStyleOnce();
      el.innerHTML =
        '<div class="ts-wrap">' +
        '  <div class="ts-section">' +
        '    <h3>GitHub 연결</h3>' +
        '    <div class="ts-row">' +
        '      <label>GitHub 계정(owner) <input type="text" class="ts-owner" placeholder="예: minddent"></label>' +
        '      <label>저장소(repo) <input type="text" class="ts-repo" placeholder="예: minddent-backup"></label>' +
        '      <label>브랜치 <input type="text" class="ts-branch" placeholder="main"></label>' +
        '    </div>' +
        '    <div class="ts-row">' +
        '      <label style="flex:1 1 100%;">개인 액세스 토큰(PAT) <input type="password" class="ts-token" placeholder="ghp_ 또는 github_pat_ 로 시작"></label>' +
        '    </div>' +
        '    <div class="ts-row">' +
        '      <span class="ts-checkline"><input type="checkbox" class="ts-remember" checked> 이 컴퓨터에 저장 (체크 해제 시 브라우저를 닫으면 토큰이 사라집니다)</span>' +
        '    </div>' +
        '    <button type="button" class="ts-btn ts-test-btn">연결 테스트</button>' +
        '    <span class="ts-status ts-conn-status"></span>' +
        '    <div class="ts-warn">토큰은 비밀번호와 같습니다. 다른 사람과 공유하지 마세요.</div>' +
        '    <a class="ts-help-link" href="help/index.html" target="_blank" rel="noopener">토큰 발급 방법 안내 보기 →</a>' +
        '  </div>' +

        '  <div class="ts-section">' +
        '    <h3>문의 메일 자동발송</h3>' +
        '    <div class="ts-help-text">https://formspree.io 에서 무료 가입 후 폼 생성 → 엔드포인트 주소를 붙여넣으세요. 비워두면 방문자에게 메일 앱/복사 안내가 표시됩니다.</div>' +
        '    <div class="ts-row">' +
        '      <label style="flex:1 1 100%;">Formspree 엔드포인트 URL <input type="url" class="ts-formspree" placeholder="https://formspree.io/f/xxxxxxx"></label>' +
        '    </div>' +
        '    <button type="button" class="ts-btn ts-formspree-btn">저장</button>' +
        '    <span class="ts-status ts-formspree-status"></span>' +
        '  </div>' +

        '  <div class="ts-section">' +
        '    <h3>파일 복원</h3>' +
        '    <div class="ts-help-text">실수로 데이터를 잘못 저장했을 때, 이전 버전으로 되돌릴 수 있습니다.</div>' +
        '    <div class="ts-row">' +
        '      <label style="flex:1 1 100%;">복원할 파일 <select class="ts-restore-select"></select></label>' +
        '    </div>' +
        '    <button type="button" class="ts-btn-secondary ts-history-btn">이전 버전 보기</button>' +
        '    <ul class="ts-hist-list"></ul>' +
        '  </div>' +
        '</div>';

      els.owner = el.querySelector('.ts-owner');
      els.repo = el.querySelector('.ts-repo');
      els.branch = el.querySelector('.ts-branch');
      els.token = el.querySelector('.ts-token');
      els.remember = el.querySelector('.ts-remember');
      els.testBtn = el.querySelector('.ts-test-btn');
      els.status = el.querySelector('.ts-conn-status');

      els.formspree = el.querySelector('.ts-formspree');
      els.formspreeBtn = el.querySelector('.ts-formspree-btn');
      els.formspreeStatus = el.querySelector('.ts-formspree-status');

      els.restoreSelect = el.querySelector('.ts-restore-select');
      els.historyBtn = el.querySelector('.ts-history-btn');
      els.historyList = el.querySelector('.ts-hist-list');

      buildRestoreOptions(els.restoreSelect);

      els.testBtn.addEventListener('click', onTestConnection);
      els.formspreeBtn.addEventListener('click', onSaveFormspree);
      els.historyBtn.addEventListener('click', onViewHistory);

      built = true;
    } catch (e) {
      try { el.innerHTML = '<div class="ts-section">설정 탭을 불러오는 중 오류가 발생했습니다.</div>'; } catch (e2) { /* noop */ }
    }
  }

  function onShow() {
    try {
      if (!built) return;
      prefillConnection();
      prefillFormspree();
    } catch (e) { /* noop */ }
  }

  // ---------------------------------------------------------------------
  // 등록
  // ---------------------------------------------------------------------
  try {
    if (window.AdminTabs && typeof window.AdminTabs.register === 'function') {
      window.AdminTabs.register('settings', { title: '설정', render: render, onShow: onShow });
    }
  } catch (e) { /* noop */ }
})();
