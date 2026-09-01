/* stubs.js — 제거된 외부 SDK 전역의 no-op 대체 (모든 imweb JS보다 먼저 로드) */
(function () {
  var noop = function () {};
  window.wcs = window.wcs || {};
  window.wcs_add = window.wcs_add || {};
  window.wcs_do = window.wcs_do || noop;
  window.a7s = window.a7s || { init: noop, track: noop, send: noop, pageView: noop };
  window.DD_RUM = window.DD_RUM || { init: noop, onReady: noop, addAction: noop };
  window.ChannelIO = window.ChannelIO || noop;
  window.daum = window.daum || {}; /* postcode SDK 제거 대비 */
})();