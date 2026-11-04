/*
 * 极简音效：不用任何音频文件，直接用 WebAudio 合成。
 * 吃东西是两下闷响，喝水是一声下坠的水声。
 * 浏览器不给播就静默失败，绝不影响游戏。
 */
window.SF = window.SF || {};

(function () {

  var ctx = null;

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
