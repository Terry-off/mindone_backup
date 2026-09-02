/*!
 * inquiry.js — 제휴협력 문의 폼(/41) 제출 처리
 *
 * 대상: `a._input_form_submit` 버튼을 가진 문의 폼(참고: _workdir/templates/form_41.html).
 * 필드는 id 해시가 배포마다 달라질 수 있어 구조 기반으로 탐색한다:
 *   - .phonenumber_wrap 을 포함한 .form-group → 연락처(3분할 input)
 *   - .email_wrap 을 포함한 .form-group → 이메일
 *   - <textarea>를 포함한 .form-group → 문의사항
 *   - input[type=checkbox]를 포함한 .form-group(#privacy) → 개인정보 동의
 *   - 위에 해당하지 않는 일반 텍스트 input의 첫 번째/두 번째 → 업체명/담당자명
 *
 * 제출 흐름:
 *   1) __CONFIG.formspreeEndpoint가 있으면 fetch POST → 성공 시 alert+폼 리셋
 *   2) 없거나 실패하면 폴백 모달(복사/메일앱/닫기)을 띄운다.
 *
 * 임웹 SITE_FORM 기본 제출 동작은 onclick 속성 제거 + capture 단계에서
 * stopImmediatePropagation/preventDefault로 차단한다.
 */
(function () {
  'use strict';

  // 실제 마크업에서는 제출 버튼(a._input_form_submit)이 <form> 태그의 자손이 아니라
  // 위젯 래퍼 안의 형제 요소로 존재한다(버튼 → .form.text-center → ... → 위젯 div,
  // 그 위젯 div 하위 어딘가에 <form>이 별도로 존재). 그래서 "form 조상"이 아니라
  // "버튼과 form을 동시에 포함하는 가장 가까운 공통 조상(위젯 스코프)"을 찾는다.
  function findFormScope(el) {
    var node = el.parentNode;
    while (node && node.nodeType === 1) {
      if (node.querySelector && node.querySelector('form')) { return node; }
      node = node.parentNode;
    }
    return null;
  }

  function val(el) {
    return el && typeof el.value === 'string' ? el.value.trim() : '';
  }

  function collectFields(form) {
    var groups = form.querySelectorAll('.form-group');
    var textInputs = [];
    var result = { company: null, contact: null, phones: null, email: null, textarea: null, agree: null };
    for (var i = 0; i < groups.length; i++) {
      try {
        var g = groups[i];
        if (g.querySelector('.phonenumber_wrap')) {
          result.phones = g.querySelectorAll('input');
          continue;
        }
        if (g.querySelector('.email_wrap')) {
          result.email = g.querySelector('input');
          continue;
        }
        var ta = g.querySelector('textarea');
        if (ta) { result.textarea = ta; continue; }
        var chk = g.querySelector('input[type="checkbox"]');
        if (chk) { result.agree = chk; continue; }
        var inp = g.querySelector('input[type="text"]') || g.querySelector('input');
        if (inp) { textInputs.push(inp); }
      } catch (eInner) { /* 개별 그룹 파악 실패는 건너뜀 */ }
    }
    result.company = textInputs[0] || null;
    result.contact = textInputs[1] || null;
    return result;
  }

  function inquiryEmail() {
    return (window.__CONFIG && window.__CONFIG.inquiryEmail) ? window.__CONFIG.inquiryEmail : 'minddent@naver.com';
  }

  function buildModal(payload) {
    try {
      var subject = '[제휴 협약 문의] ' + payload['업체명'];
      var bodyText =
        '업체명: ' + payload['업체명'] + '\n' +
        '담당자명: ' + payload['담당자명'] + '\n' +
        '연락처: ' + payload['연락처'] + '\n' +
        '이메일: ' + payload['이메일'] + '\n' +
        '문의사항: ' + payload['문의사항'];
      var fullText = '제목: ' + subject + '\n\n' + bodyText;

      var overlay = document.createElement('div');
      overlay.setAttribute('style',
        'position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,0.55);' +
        'z-index:99999;display:flex;align-items:center;justify-content:center;' +
        'padding:20px;box-sizing:border-box;'
      );

      var card = document.createElement('div');
      card.setAttribute('style',
        'background:#fff;border-radius:8px;padding:24px;max-width:480px;width:100%;' +
        'box-shadow:0 10px 40px rgba(0,0,0,0.25);font-size:14px;line-height:1.6;' +
        'color:#333;box-sizing:border-box;'
      );

      var desc = document.createElement('p');
      desc.style.margin = '0 0 12px';
      desc.textContent = '아래 내용을 복사해 ' + inquiryEmail() + ' 으로 보내주시면 빠르게 답변드리겠습니다.';

      var ta = document.createElement('textarea');
      ta.readOnly = true;
      ta.value = fullText;
      ta.setAttribute('style',
        'width:100%;height:180px;box-sizing:border-box;margin-bottom:14px;padding:10px;' +
        'border:1px solid #ddd;border-radius:4px;font-size:13px;resize:vertical;'
      );

      var btnRow = document.createElement('div');
      btnRow.setAttribute('style', 'display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;');

      var copyBtn = document.createElement('a');
      copyBtn.href = 'javascript:;';
      copyBtn.className = 'btn btn-primary';
      copyBtn.textContent = '내용 복사';
      copyBtn.addEventListener('click', function (e) {
        try { e.preventDefault(); } catch (er) {}
        function done() { try { copyBtn.textContent = '복사됨!'; } catch (er3) {} }
        function legacyCopy() {
          try {
            ta.focus();
            ta.select();
            if (document.execCommand && document.execCommand('copy')) { done(); }
          } catch (er2) { /* 복사 실패는 무시 */ }
        }
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(fullText).then(done, legacyCopy);
          } else {
            legacyCopy();
          }
        } catch (er) { legacyCopy(); }
      });

      var mailBtn = document.createElement('a');
      mailBtn.href = 'javascript:;';
      mailBtn.className = 'btn btn-default';
      mailBtn.textContent = '메일 앱으로 보내기';
      mailBtn.addEventListener('click', function (e) {
        try { e.preventDefault(); } catch (er) {}
        try {
          window.location.href = 'mailto:' + inquiryEmail() + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(bodyText);
        } catch (er2) {}
      });

      var closeBtn = document.createElement('a');
      closeBtn.href = 'javascript:;';
      closeBtn.className = 'btn btn-flat';
      closeBtn.textContent = '닫기';
      closeBtn.addEventListener('click', function (e) {
        try { e.preventDefault(); } catch (er) {}
        try { overlay.parentNode && overlay.parentNode.removeChild(overlay); } catch (er2) {}
      });

      btnRow.appendChild(closeBtn);
      btnRow.appendChild(mailBtn);
      btnRow.appendChild(copyBtn);

      card.appendChild(desc);
      card.appendChild(ta);
      card.appendChild(btnRow);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
    } catch (e) {
      try { console.warn('[inquiry] buildModal failed', e); } catch (e2) {}
    }
  }

  // Formspree는 payload의 '_subject' 키를 실제 발송 메일 제목으로 사용한다.
  // data/config.js의 inquirySubject를 관리자가 자유롭게 바꿀 수 있으며,
  // '{업체명}' 자리표시자가 있으면 문의 업체명으로 치환하고, 없으면 뒤에 덧붙인다.
  function buildSubject(company) {
    var cfg = window.__CONFIG || {};
    var tmpl = (cfg.inquirySubject && String(cfg.inquirySubject).trim())
      || '[마인드원치과] 제휴 협약 문의 - {업체명}';
    if (tmpl.indexOf('{업체명}') !== -1) {
      return tmpl.replace(/\{업체명\}/g, company || '');
    }
    return company ? (tmpl + ' - ' + company) : tmpl;
  }

  function submit(payload, form) {
    var endpoint = window.__CONFIG && window.__CONFIG.formspreeEndpoint;
    if (!endpoint) {
      buildModal(payload);
      return;
    }
    try {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (res && res.ok) {
          try { window.alert('문의가 정상적으로 접수되었습니다. 감사합니다.'); } catch (eAlert) {}
          try { if (form && form.reset) { form.reset(); } } catch (eReset) {}
        } else {
          buildModal(payload);
        }
      }).catch(function () {
        buildModal(payload);
      });
    } catch (e) {
      buildModal(payload);
    }
  }

  function init() {
    try {
      var btn = document.querySelector('a._input_form_submit');
      if (!btn) { return; }
      var scope = findFormScope(btn);
      if (!scope) { return; }
      var form = scope.querySelector('form');

      try { btn.removeAttribute('onclick'); } catch (eRemove) {}

      btn.addEventListener('click', function (e) {
        try { e.preventDefault(); } catch (er) {}
        try { e.stopImmediatePropagation(); } catch (er2) {}

        try {
          var fields = collectFields(scope);
          var company = val(fields.company);
          var contact = val(fields.contact);
          var phones = fields.phones ? [val(fields.phones[0]), val(fields.phones[1]), val(fields.phones[2])] : ['', '', ''];
          var phone = phones.join('-');
          var phoneFilled = !!(phones[0] && phones[1] && phones[2]);
          var email = val(fields.email);
          var message = val(fields.textarea);
          var agreed = fields.agree ? !!fields.agree.checked : false;

          if (!company) { window.alert('업체명을 입력해주세요.'); return; }
          if (!contact) { window.alert('담당자명을 입력해주세요.'); return; }
          if (!phoneFilled) { window.alert('연락처를 입력해주세요.'); return; }
          if (!message) { window.alert('문의사항을 입력해주세요.'); return; }
          if (!agreed) { window.alert('개인정보 수집 및 이용에 동의해주세요.'); return; }

          var payload = {
            '업체명': company,
            '담당자명': contact,
            '연락처': phone,
            '이메일': email,
            '문의사항': message,
            '_subject': buildSubject(company)
          };
          submit(payload, form);
        } catch (eHandler) {
          try { console.warn('[inquiry] submit handling failed', eHandler); } catch (e2) {}
        }
      }, true);
    } catch (e) {
      try { console.warn('[inquiry] init failed', e); } catch (e2) {}
    }
  }

  init();
})();
