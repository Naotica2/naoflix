export const NOBAR_WEBVIEW_BRIDGE_SCRIPT = `
(function() {
  if (window.__naoflixNobarBridgeInstalled) return;
  window.__naoflixNobarBridgeInstalled = true;
  window.__naoflixNobarSuppressUntil = 0;
  window.__naoflixNobarPendingCmd = null;

  function applyCmdToVideo(v, cmd) {
    if (!v || !cmd) return;
    try {
      window.__naoflixNobarSuppressUntil = Date.now() + 900;
      var targetTime = Number(cmd.currentTime) || 0;
      if (cmd.playerState === 'PLAYING' && cmd.timestamp) {
        var elapsed = (Date.now() - Number(cmd.timestamp)) / 1000;
        if (elapsed > 0 && elapsed < 8) {
          targetTime += elapsed;
        }
      }
      if (Math.abs((v.currentTime || 0) - targetTime) > 2) {
        v.currentTime = targetTime;
      }
      if (cmd.playerState === 'PLAYING') {
        var p = v.play();
        if (p && p.catch) p.catch(function() {});
      } else if (cmd.playerState === 'PAUSED') {
        v.pause();
      }
    } catch (e) {}
  }

  window.addEventListener('message', function(ev) {
    if (ev && ev.data && ev.data.__naoflixNobarCmd) {
      var cmd = ev.data.__naoflixNobarCmd;
      window.__naoflixNobarPendingCmd = cmd;
      var videos = document.querySelectorAll('video');
      for (var i = 0; i < videos.length; i++) {
        applyCmdToVideo(videos[i], cmd);
      }
    }
  });

  function postState(v, forcedState) {
    try {
      if (!window.ReactNativeWebView) return;
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'NOBAR_WEBVIEW_STATE',
        playerState: forcedState || (v.paused ? 'PAUSED' : 'PLAYING'),
        currentTime: Number(v.currentTime) || 0,
        timestamp: Date.now()
      }));
    } catch (e) {}
  }

  function attachVideo(v) {
    if (!v || v.__naoflixNobarAttached) return;
    v.__naoflixNobarAttached = true;

    v.addEventListener('loadedmetadata', function() {
      if (window.__naoflixNobarPendingCmd) {
        applyCmdToVideo(v, window.__naoflixNobarPendingCmd);
      }
    });

    v.addEventListener('canplay', function() {
      if (window.__naoflixNobarPendingCmd) {
        var cmd = window.__naoflixNobarPendingCmd;
        window.__naoflixNobarPendingCmd = null;
        applyCmdToVideo(v, cmd);
      }
    });

    v.addEventListener('play', function() {
      if (Date.now() < window.__naoflixNobarSuppressUntil) return;
      postState(v, 'PLAYING');
    });

    v.addEventListener('pause', function() {
      if (Date.now() < window.__naoflixNobarSuppressUntil) return;
      postState(v, 'PAUSED');
    });

    v.addEventListener('seeked', function() {
      if (Date.now() < window.__naoflixNobarSuppressUntil) return;
      postState(v, v.paused ? 'PAUSED' : 'PLAYING');
    });

    var lastTick = 0;
    v.addEventListener('timeupdate', function() {
      var now = Date.now();
      if (now < window.__naoflixNobarSuppressUntil) return;
      if (now - lastTick >= 2000 && !v.paused) {
        lastTick = now;
        postState(v, 'PLAYING');
      }
    });
  }

  function scanVideos() {
    try {
      var videos = document.querySelectorAll('video');
      for (var i = 0; i < videos.length; i++) {
        attachVideo(videos[i]);
      }
    } catch (e) {}
  }

  scanVideos();
  setInterval(scanVideos, 800);
})();
`;

export function buildNobarWebViewCommandScript(cmd: {
  playerState: string;
  currentTime: number;
  timestamp: number;
}): string {
  const payload = JSON.stringify(cmd);
  return `
    (function(c) {
      function send(win) {
        try { win.postMessage({ __naoflixNobarCmd: c }, '*'); } catch (e) {}
        try {
          for (var i = 0; i < win.frames.length; i++) {
            send(win.frames[i]);
          }
        } catch (e) {}
      }
      send(window);
    })(${payload});
    true;
  `;
}
