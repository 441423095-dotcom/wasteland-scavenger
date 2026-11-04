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
    if (typeof state.items.backpack !== 'boolean') state.items.backpack = false;
    if (typeof state.parts !== 'number') state.parts = 0;
    if (typeof state.tripCap !== 'number') state.tripCap = 0;
    if (!state.tripMembers) state.tripMembers = [];

    for (var si = 0; si < (state.survivors || []).length; si++) {
      if (typeof state.survivors[si].hasPack !== 'boolean') {
        state.survivors[si].hasPack = false;
      }
    }
    if (!state.meal) state.meal = {};
    if (typeof state.todayFood !== 'number') state.todayFood = 0;
    if (typeof state.todayWater !== 'number') state.todayWater = 0;
    if (!state.logs) state.logs = [];
    if (!state.missing) state.missing = [];
    if (typeof state.storySeenDay !== 'number') state.storySeenDay = 0;
    if (typeof state.won !== 'boolean') state.won = false;
    if (typeof state.expeditionOver !== 'boolean') state.expeditionOver = false;
    if (typeof state.over !== 'boolean') state.over = false;
    if (typeof state.doorBroken !== 'boolean') state.doorBroken = false;
    // 救援日：修好收音机后才会抽出来，老存档里没有这个字段
    if (typeof state.rescueDay !== 'number') state.rescueDay = 0;
    if (typeof state.rescueKnown !== 'boolean') state.rescueKnown = state.rescueDay > 0;
    if (typeof state.dayEventDone !== 'number') state.dayEventDone = 0;
    if (typeof state.dayEventIdDay !== 'number') state.dayEventIdDay = 0;
    if (typeof state.dayEventId !== 'string') state.dayEventId = '';
    if (typeof state.lootBonus !== 'number') state.lootBonus = 1;
    if (!state.dayNotes) state.dayNotes = [];
    if (!state.dayLog) state.dayLog = [];
    if (!state.questToday) state.questToday = [];
    if (typeof state.hintDay !== 'number') state.hintDay = 0;

    if (typeof state.condition !== 'string' || !state.condition) {
      state.condition = 'calm';
    }
    if (typeof state.conditionDay !== 'number') state.conditionDay = state.day || 1;
    // 读档时不会有进行中的探索，背包统计清零
    state.tripTotals = state.tripTotals || {};

    // 地图改名：老存档里记的旧地点 ID 换成新的，免得夜里的判定找不到地方
    var locAlias = {
      market: 'store',
      park: 'green',
      warehouse: 'garage',
      pharmacy: 'clinic',
      police: 'guard'
    };
    if (state.lastExpedition && state.lastExpedition.locId &&
        locAlias[state.lastExpedition.locId]) {
      state.lastExpedition.locId = locAlias[state.lastExpedition.locId];
      if (SF.findLocation) {
        var moved = SF.findLocation(state.lastExpedition.locId);
        if (moved) state.lastExpedition.name = moved.name;
      }
    }

    // 老存档里的倒计时已经没用了，统一清掉
    state.rescueLeft = 0;

    return state;
  };

})();
