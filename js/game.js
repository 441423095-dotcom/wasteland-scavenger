/*
 * 游戏逻辑：纯数据计算，不碰 DOM。一个回合 = 一天。
 * 四个室友各有天赋；晚上要手动分配食物和水。
 */
window.SF = window.SF || {};

SF.SUPPLIES = [
  { key: 'food', name: '食物' },
  { key: 'water', name: '水' },
  { key: 'medicine', name: '药品' },
  { key: 'material', name: '材料' }
];

(function () {

  var C = SF.CONFIG;
  var T = C.traits;
  var seq = 0;

  function clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  function rnd(min, max) {
    if (max < min) max = min;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function roll(p) {
    return Math.random() < p;
  }

  function newId() {
    seq = seq + 1;
    return 'p' + seq;
  }

  SF.clamp = clamp;
  SF.rnd = rnd;

  // ---------- 角色 / 幸存者 ----------

  SF.makeSurvivor = function (ch, stats) {
    stats = stats || {};
    return {
      id: newId(),
      charId: ch.id,
      name: ch.name,
      role: ch.role,
      trait: ch.trait,
      traitText: ch.traitText,
      style: ch.style,
      portrait: ch.portrait,
      emoji: ch.emoji,
      hp: clamp(stats.hp === undefined ? 100 : stats.hp, 0, C.maxStat),
      hunger: clamp(stats.hunger === undefined ? C.startStats.hunger : stats.hunger, 0, C.maxStat),
      thirst: clamp(stats.thirst === undefined ? C.startStats.thirst : stats.thirst, 0, C.maxStat),
      mood: clamp(stats.mood === undefined ? 70 : stats.mood, 0, C.maxStat),
      sick: !!stats.sick,
      injured: !!stats.injured,
      alive: true,
      isPlayer: !!ch.isPlayer
    };
  };

  SF.newGame = function () {
    seq = 0;

    var survivors = [];
    var player = null;
    var ci;

    for (ci = 0; ci < C.characters.length; ci++) {
      var ch = C.characters[ci];
      var person = SF.makeSurvivor(ch, {
        hp: C.startStats.hp,
        hunger: C.startStats.hunger,
        thirst: C.startStats.thirst,
        mood: C.startStats.mood
      });

      if (ch.isPlayer) player = person;
      survivors.push(person);
    }

    var supplies = {};
    for (var i = 0; i < SF.SUPPLIES.length; i++) {
      var key = SF.SUPPLIES[i].key;
      supplies[key] = C.startSupplies[key] || 0;
    }

    return {
      day: 1,
      supplies: supplies,
      items: { radio: false, radioBroken: false, pesticide: false },
      rescueLeft: C.rescueDays,
      lastEvent: '',
      survivors: survivors,
      leaderId: player.id,
      exploredToday: false,
      over: false,
      overDay: 0
    };
  };

  SF.aliveAll = function (state) {
    var out = [];
    if (!state) return out;
    for (var i = 0; i < state.survivors.length; i++) {
      if (state.survivors[i].alive) out.push(state.survivors[i]);
    }
    return out;
  };

  SF.find = function (state, id) {
    if (!state || !id) return null;
    for (var i = 0; i < state.survivors.length; i++) {
      if (state.survivors[i].id === id) return state.survivors[i];
    }
    return null;
  };

  SF.findChar = function (state, charId) {
    for (var i = 0; i < state.survivors.length; i++) {
      if (state.survivors[i].charId === charId && state.survivors[i].alive) {
        return state.survivors[i];
      }
    }
    return null;
  };

  SF.charAlive = function (state, charId) {
    return !!SF.findChar(state, charId);
  };

  SF.findLocation = function (id) {
    for (var i = 0; i < C.locations.length; i++) {
      if (C.locations[i].id === id) return C.locations[i];
    }
    return null;
  };

  function findRow(rows, id) {
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === id) return rows[i];
    }
    return null;
  }

  function ensureLeader(state) {
    var alive = SF.aliveAll(state);
    if (!alive.length) {
      state.leaderId = null;
      return;
    }
    for (var i = 0; i < alive.length; i++) {
      if (alive[i].id === state.leaderId) return;
    }
    state.leaderId = alive[0].id;
  }

  SF.ensureLeader = ensureLeader;

  function checkOver(state, day) {
    var player = null;
    var alive = SF.aliveAll(state);
    var i;

    for (i = 0; i < state.survivors.length; i++) {
      if (state.survivors[i].isPlayer) player = state.survivors[i];
    }

    if (alive.length === 0 || (player && !player.alive)) {
      if (!state.overDay) state.overDay = day;
      state.over = true;
      return true;
    }
    return false;
  }

  SF.checkOver = checkOver;

  // ---------- 天赋 ----------

  SF.foodNeed = function (s) {
    return s.charId === 'tie' ? T.tieFoodCost : 1;
  };

  SF.waterRation = function (state) {
    return SF.charAlive(state, 'lin') ? T.linWaterFactor : 1;
  };

  // ---------- 探索成功率 ----------

  SF.exploreChance = function (s, loc) {
    var E = C.explore;
    var p = loc.chance;

    if (s.hp < E.hpLowAt) p += E.hpLowPenalty;
    else if (s.hp < E.hpMidAt) p += E.hpMidPenalty;

    if (s.hunger > E.hungerHighAt) p += E.hungerHighPenalty;
    else if (s.hunger > E.hungerMidAt) p += E.hungerMidPenalty;

    if (s.thirst > E.thirstHighAt) p += E.thirstHighPenalty;
    else if (s.thirst > E.thirstMidAt) p += E.thirstMidPenalty;

    if (s.sick) p += E.sickPenalty;
    if (s.mood < E.moodLowAt) p += E.moodLowPenalty;

    p = clamp(p, E.minChance, E.maxChance);

    if (s.injured) p = p * E.injuredPenalty;

    return clamp(p, 0.02, E.maxChance);
  };

  // 还没被救回来的室友
  SF.recruitCandidates = function (state) {
    var out = [];
    var i;

    for (i = 0; i < C.characters.length; i++) {
      if (!SF.findChar(state, C.characters[i].id)) out.push(C.characters[i]);
    }
    return out;
  };

  function giveHaul(haul, key, qty) {
    if (qty <= 0) return;
    haul[key] = (haul[key] || 0) + qty;
  }

  function applyHaul(state, haul, result) {
    var key;
    for (var i = 0; i < SF.SUPPLIES.length; i++) {
      key = SF.SUPPLIES[i].key;
      if (!haul[key]) continue;
      state.supplies[key] = (state.supplies[key] || 0) + haul[key];
      result.loot.push({ key: key, name: SF.SUPPLIES[i].name, qty: haul[key] });
    }
  }

  // ---------- 出门探索一次 ----------

  SF.explore = function (state, locId) {
    var loc = SF.findLocation(locId);
    var who = SF.find(state, state.leaderId);
    if (!who || !who.alive) who = SF.aliveAll(state)[0];

    var result = {
      location: loc,
      whoName: who ? who.name : '',
      refused: false,
      junkOnly: false,
      raider: '',
      success: false,
      loot: [],
      item: null,
      text: '',
      injured: 0,
      died: false,
      newcomer: null
    };

    if (!loc || !who) {
      result.text = '没有人能出门。';
      return result;
    }

    if (who.mood < C.explore.refuseMoodBelow) {
      result.refused = true;
      result.text = who.name + ' 缩在墙角不肯动，嘴里一直在念叨。今天他出不了门。';
      state.lastEvent = who.name + ' 理智崩溃，拒绝出门。';
      return result;
    }

    var success = roll(SF.exploreChance(who, loc));
    result.success = success;

    var haul = {};
    var junkOnly = !loc.far && roll(C.explore.junkChanceNear);
    result.junkOnly = junkOnly;

    if (junkOnly) {
      giveHaul(haul, 'material', rnd(C.explore.junkLoot[0], C.explore.junkLoot[1]));
    } else {
      var factor = success ? 1 : C.explore.failLootFactor;
      for (var i = 0; i < SF.SUPPLIES.length; i++) {
        var key = SF.SUPPLIES[i].key;
        var range = loc.loot[key];
        if (!range) continue;

        var qty = rnd(range[0], range[1]);
        if (!success) qty = Math.floor(qty * factor);
        giveHaul(haul, key, qty);
      }
    }

    // 铁柱：带回的物资翻倍
    if (who.charId === 'tie') {
      for (var k in haul) {
        if (!haul.hasOwnProperty(k)) continue;
        haul[k] = haul[k] * T.tieLootMult;
      }
    }

    // 掠夺者事件
    if (!junkOnly && roll(T.raiderChance)) {
      if (who.charId === 'nana' && roll(T.nanaNegotiate)) {
        var bonus = rnd(T.nanaBonus[0], T.nanaBonus[1]);
        giveHaul(haul, roll(0.5) ? 'food' : 'water', bonus);
        result.raider = '路上被三个掠夺者拦住。娜娜笑着递了根烟，聊了几句，东西一样没少，还多拿了 ' + bonus + ' 份。';
      } else {
        var lostFood = Math.floor((haul.food || 0) / 2);
        var lostWater = Math.floor((haul.water || 0) / 2);
        haul.food = (haul.food || 0) - lostFood;
        haul.water = (haul.water || 0) - lostWater;
        result.raider = '路上被人堵住，抢走了一部分东西。';

        if (roll(0.4)) {
          who.hp = clamp(who.hp - C.explore.injuryHp, 0, C.maxStat);
          who.injured = true;
          result.injured = C.explore.injuryHp;
          result.raider += '他挨了两下，受了伤。';
        }
      }
      state.lastEvent = result.raider;
    }

    applyHaul(state, haul, result);

    // 特殊道具：收音机（坏的） / 杀虫剂
    if (roll(C.explore.specialChance)) {
      if (!state.items.radio && !state.items.radioBroken) {
        state.items.radioBroken = true;
        result.item = { key: 'radio', name: '损坏的收音机', text: '一台摔坏的收音机。也许还能修。' };
      } else if (!state.items.pesticide) {
        state.items.pesticide = true;
        result.item = { key: 'pesticide', name: '杀虫剂', text: '半罐杀虫剂，喷头还能用。' };
      }
    }

    who.hunger = clamp(who.hunger + C.explore.hungerCost, 0, C.maxStat);
    who.thirst = clamp(who.thirst + C.explore.thirstCost, 0, C.maxStat);

    var injuryChance = loc.far ? C.explore.injuryChanceFar : (success ? 0 : C.explore.injuryChanceNear);
    if (roll(injuryChance)) {
      who.hp = clamp(who.hp - C.explore.injuryHp, 0, C.maxStat);
      who.injured = true;
      who.mood = clamp(who.mood - 6, 0, C.maxStat);
      result.injured = C.explore.injuryHp;
    }

    if (success) {
      who.mood = clamp(who.mood + C.explore.moodOnSuccess, 0, C.maxStat);
    } else {
      who.mood = clamp(who.mood + C.explore.moodOnFail, 0, C.maxStat);
    }

    if (who.hp <= 0) {
      who.alive = false;
      result.died = true;
    }

    // 10%：救回一个还没出现的室友
    var pool = SF.recruitCandidates(state);
    if (!result.died && pool.length && SF.aliveAll(state).length < C.explore.maxSurvivors) {
      if (roll(C.explore.newcomerChance)) {
        var ch = pool[rnd(0, pool.length - 1)];
        var nb = SF.makeSurvivor(ch, {
          hp: rnd(60, 90),
          hunger: rnd(20, 50),
          thirst: rnd(20, 50),
          mood: rnd(30, 60)
        });
        state.survivors.push(nb);
        result.newcomer = nb;
      }
    }

    if (junkOnly) {
      result.text = '整片地方被人翻过好几轮了，食物和水一点没剩，你只拖回一堆还能用的材料。';
    } else {
      result.text = success ? loc.okText : loc.badText;
    }

    if (!result.raider) {
      state.lastEvent = result.text.length > 26 ? result.text.slice(0, 26) + '…' : result.text;
    }

    ensureLeader(state);
    checkOver(state, state.day);
    return result;
  };

  // ---------- 修收音机 ----------

  SF.repairRadio = function (state) {
    var chen = SF.findChar(state, 'chen');
    var chance = chen ? T.chenRepair : T.otherRepair;
    var ok = roll(chance);

    if (ok) {
      state.items.radioBroken = false;
      state.items.radio = true;
      state.lastEvent = '收音机修好了，能收到信号了。';
    } else {
      state.lastEvent = '收音机冒了一股烟，还是没修好。';
    }

    return { ok: ok, chance: chance };
  };

  // ---------- 夜晚结算（手动分配） ----------

  SF.endDay = function (state, plan) {
    var alive = SF.aliveAll(state);
    var N = C.night;
    var i;

    plan = plan || { eat: {}, drink: {} };
    if (!plan.eat) plan.eat = {};
    if (!plan.drink) plan.drink = {};

    var report = {
      day: state.day,
      population: alive.length,
      foodNeed: 0,
      waterNeed: 0,
      foodUsed: 0,
      waterUsed: 0,
      shortage: false,
      theft: null,
      rows: [],
      deaths: [],
      meds: [],
      allDead: false
    };

    var waterRation = SF.waterRation(state);
    var rowData = {};

    // 先按玩家分配扣物资
    for (var a = 0; a < alive.length; a++) {
      var a1 = alive[a];
      var need = SF.foodNeed(a1);
      var fed = false;
      var drank = false;

      report.foodNeed += need;
      report.waterNeed += waterRation;

      if (plan.eat[a1.id] && (state.supplies.food || 0) >= need) {
        state.supplies.food -= need;
        report.foodUsed += need;
        fed = true;
      }

      if (plan.drink[a1.id] && (state.supplies.water || 0) >= waterRation) {
        state.supplies.water = Math.round(((state.supplies.water || 0) - waterRation) * 10) / 10;
        report.waterUsed = Math.round((report.waterUsed + waterRation) * 10) / 10;
        drank = true;
      }

      rowData[a1.id] = { fed: fed, drank: drank };
    }

    report.foodNeed = Math.round(report.foodNeed);
    report.waterNeed = Math.round(report.waterNeed * 10) / 10;

    for (i = 0; i < alive.length; i++) {
      var s = alive[i];
      var isFed = rowData[s.id].fed;
      var isDrank = rowData[s.id].drank;
      var before = { hp: s.hp, hunger: s.hunger, thirst: s.thirst, mood: s.mood };

      s.hunger = clamp(s.hunger + N.hungerUp - (isFed ? N.fedHungerDown : 0), 0, C.maxStat);
      s.thirst = clamp(s.thirst + N.thirstUp - (isDrank ? N.drankThirstDown : 0), 0, C.maxStat);

      var dmg = 0;
      if (!isFed) {
        dmg += N.shortfallHp;
        s.mood = clamp(s.mood - N.shortfallMood, 0, C.maxStat);
        report.shortage = true;
      }
      if (!isDrank) {
        dmg += N.waterShortfallHp;
        s.mood = clamp(s.mood - N.shortfallMood, 0, C.maxStat);
        report.shortage = true;
      }
      if (s.sick) dmg += N.sickDamage;

      if (!isFed || !isDrank) {
        if (roll(N.sickChance)) s.sick = true;
      }

      var heal = 0;
      if (isFed && isDrank && !s.sick &&
          s.hunger < N.recoverBelow && s.thirst < N.recoverBelow) {
        heal = N.recoverHp;
      }

      var moodDelta = (isFed ? N.moodFed : N.moodHungry) + (isDrank ? N.moodDrank : N.moodThirsty);
      if (s.sick) moodDelta += N.moodSick;

      s.hp = clamp(s.hp + heal - dmg, 0, C.maxStat);
      s.mood = clamp(s.mood + moodDelta, 0, C.maxStat);

      if (s.injured && s.hp >= N.injuredRecoverHp && isFed && isDrank) {
        s.injured = false;
      }

      report.rows.push({
        id: s.id,
        name: s.name,
        role: s.role,
        fed: isFed,
        drank: isDrank,
        sick: s.sick,
        injured: s.injured,
        med: false,
        hpBefore: before.hp,
        hpAfter: s.hp,
        hungerBefore: before.hunger,
        hungerAfter: s.hunger,
        thirstBefore: before.thirst,
        thirstAfter: s.thirst,
        moodBefore: before.mood,
        moodAfter: s.mood,
        died: false
      });
    }

    // 药品自动用在生病的人身上
    for (i = 0; i < alive.length; i++) {
      var p = alive[i];
      if (!p.sick) continue;
      if ((state.supplies.medicine || 0) < 1) continue;

      state.supplies.medicine -= 1;
      p.sick = false;
      p.hp = clamp(p.hp + N.medicineHeal, 0, C.maxStat);

      var medRow = findRow(report.rows, p.id);
      if (medRow) {
        medRow.med = true;
        medRow.sick = false;
        medRow.hpAfter = p.hp;
      }
      report.meds.push({ name: p.name });
    }

    // 材料不够堵门：夜里可能被偷
    if ((state.supplies.material || 0) < C.material.guardCost && roll(C.material.theftChance)) {
      var stealFood = Math.min(state.supplies.food || 0, C.material.theftFood);
      var stealWater = Math.min(state.supplies.water || 0, C.material.theftWater);

      if (stealFood > 0 || stealWater > 0) {
        state.supplies.food -= stealFood;
        state.supplies.water -= stealWater;
        report.theft = { food: stealFood, water: stealWater };
        state.lastEvent = '夜里有人摸进来，偷走了食物 ' + stealFood + '、水 ' + stealWater + '。';
      }
    }

    for (i = 0; i < alive.length; i++) {
      var d = alive[i];
      if (d.hp > 0) continue;
      d.alive = false;
      var deadRow = findRow(report.rows, d.id);
      if (deadRow) deadRow.died = true;
      report.deaths.push(d.name);
    }

    state.day = state.day + 1;
    state.exploredToday = false;
    if (state.rescueLeft > 0) state.rescueLeft -= 1;

    ensureLeader(state);
    report.allDead = checkOver(state, report.day);

    return report;
  };

})();
