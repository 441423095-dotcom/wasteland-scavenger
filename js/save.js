/*
 * 存档：把整个 state 塞进 localStorage，读的时候一定要能扛住脏数据。
 */
window.SF = window.SF || {};

(function () {

  var KEY = 'wasteland-save-v1';

  SF.saveGame = function (state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  };

  SF.loadGame = function () {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;

      var obj = JSON.parse(raw);
      if (!obj || !obj.survivors || !obj.survivors.length) return null;
      if (!obj.supplies || typeof obj.day !== 'number') return null;

      return obj;
    } catch (e) {
      SF.clearSave();
      return null;
    }
  };

  SF.clearSave = function () {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      /* 忽略 */
    }
  };

  // 老存档可能缺字段，读进来时补齐
  SF.repairState = function (state) {
    if (!state.supplies) state.supplies = {};
    if (!state.items) state.items = {};
    if (!state.meal) state.meal = {};
    if (typeof state.todayFood !== 'number') state.todayFood = 0;
    if (typeof state.todayWater !== 'number') state.todayWater = 0;
    if (!state.logs) state.logs = [];
    if (typeof state.expeditionOver !== 'boolean') state.expeditionOver = false;
    if (typeof state.over !== 'boolean') state.over = false;
    return state;
  };

})();
