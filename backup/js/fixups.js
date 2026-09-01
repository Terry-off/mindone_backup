/* fixups.js — 정적 미러 보정: 유튜브 배경영상 자동재생 재시도 */
(function () {
  function kick() {
    try {
      var yp = window.yt_player || {};
      for (var k in yp) {
        try { if (yp[k] && typeof yp[k].playVideo === 'function') yp[k].playVideo(); } catch (e) {}
      }
    } catch (e) {}
  }
  function arm() { setTimeout(kick, 1500); setTimeout(kick, 4000); }
  if (document.readyState === 'complete') arm();
  else window.addEventListener('load', arm);
})();