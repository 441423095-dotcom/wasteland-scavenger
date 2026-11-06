/*
 * 极简音效：不用任何音频文件，直接用 WebAudio 合成。
 * 吃东西是两下闷响，喝水是一声下坠的水声。
 * 浏览器不给播就静默失败，绝不影响游戏。
 */
window.SF = window.SF || {};

(function () {

  var ctx = null;
  var MUTE_KEY = 'sf-mute';
  var muted = false;

  try {
    muted = localStorage.getItem(MUTE_KEY) === '1';
  } catch (e) {
    muted = false;
  }

  SF.sfxMuted = function () { return muted; };

  SF.setSfxMuted = function (v) {
    muted = !!v;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch (e) {
      /* 忽略 */
    }
    if (SF.ambientRefresh) SF.ambientRefresh();
  };

  /* ---------- 环境音：极轻的风声，一直垫在背景里 ---------- */

  var amb = null;

  function startAmbient() {
    if (muted || amb) return;

    var ac = audio();
    if (!ac) return;

    try {
      var len = Math.floor(ac.sampleRate * 3);
      var buf = ac.createBuffer(1, len, ac.sampleRate);
      var data = buf.getChannelData(0);

      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.5;

      var src = ac.createBufferSource();
      src.buffer = buf;
      src.loop = true;

      var filt = ac.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 380;

      var amp = ac.createGain();
      amp.gain.value = 0.018;

      src.connect(filt);
      filt.connect(amp);
      amp.connect(ac.destination);
      src.start();

      amb = { src: src, amp: amp };
    } catch (e) {
      amb = null;
    }
  }

  function stopAmbient() {
    if (!amb) return;
    try { amb.src.stop(); } catch (e) { /* 忽略 */ }
    amb = null;
  }

  SF.ambientStart = startAmbient;
  SF.ambientStop = stopAmbient;
  SF.ambientRefresh = function () {
    if (muted) stopAmbient();
    else startAmbient();
  };

  function audio() {
    try {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      return ctx;
    } catch (e) {
      return null;
    }
  }

  function tone(freq, start, dur, type, gain) {
    if (muted) return;
    var ac = audio();
    if (!ac) return;

    try {
      var osc = ac.createOscillator();
      var amp = ac.createGain();
      var t0 = ac.currentTime + start;

      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      amp.gain.setValueAtTime(0.0001, t0);
      amp.gain.exponentialRampToValueAtTime(gain || 0.08, t0 + 0.01);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      osc.connect(amp);
      amp.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (e) {
      /* 静默失败 */
    }
  }

  function sweep(from, to, start, dur, gain) {
    if (muted) return;
    var ac = audio();
    if (!ac) return;

    try {
      var osc = ac.createOscillator();
      var amp = ac.createGain();
      var t0 = ac.currentTime + start;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(from, t0);
      osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
      amp.gain.setValueAtTime(0.0001, t0);
      amp.gain.exponentialRampToValueAtTime(gain || 0.07, t0 + 0.02);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      osc.connect(amp);
      amp.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (e) {
      /* 静默失败 */
    }
  }

  SF.sfx = {
    // 选物资：轻轻一下
    pick: function () {
      tone(520, 0, 0.06, 'triangle', 0.05);
    },
    // 吃东西：两下闷响
    eat: function () {
      tone(150, 0, 0.09, 'square', 0.07);
      tone(110, 0.09, 0.11, 'square', 0.06);
    },
    // 喝水：下坠的水声
    drink: function () {
      sweep(620, 260, 0, 0.16, 0.07);
      sweep(420, 180, 0.14, 0.14, 0.05);
    }
  };

})();
