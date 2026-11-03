/*
 * 游戏逻辑：纯数据计算，不碰 DOM。
 * 一天 = 白天组队探索 + 晚上分配食物（可能触发夜间事件）。
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

  function pickOne(list) {
    return list[rnd(0, list.length - 1)];
  }

  function newId() {
    seq = seq + 1;
    return 'p' + seq;
  }

  SF.clamp = clamp;
  SF.rnd = rnd;
  SF.roll = roll;

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

  function giveHaul(haul, key, qty) {
    if (qty <= 0) return;
    haul[key] = (haul[key] || 0) + qty;
  }

  function applyHaul(state, haul, result) {
    for (var i = 0; i < SF.SUPPLIES.length; i++) {
      var key = SF.SUPPLIES[i].key;
      if (!haul[key]) continue;
      state.supplies[key] = (state.supplies[key] || 0) + haul[key];
      result.loot.push({ key: key, name: SF.SUPPLIES[i].name, qty: haul[key] });
    }
  }

  // ---------- 组队探索 ----------

  SF.explore = function (state, locId, partyIds) {
    var loc = SF.findLocation(locId);
    var party = [];
    var i;

    if (partyIds && partyIds.length) {
      for (i = 0; i < partyIds.length; i++) {
        var m = SF.find(state, partyIds[i]);
        if (m && m.alive) party.push(m);
      }
    }
    if (!party.length) {
      var lead = SF.find(state, state.leaderId);
      if (!lead || !lead.alive) lead = SF.aliveAll(state)[0];
      if (lead) party.push(lead);
    }

    var result = {
      location: loc,
      partyNames: [],
      refused: false,
      junkOnly: false,
      success: false,
      loot: [],
      item: null,
      lines: [],
      injured: [],
      died: false,
      newcomer: null,
      choice: null
    };

    if (!loc || !party.length) {
      result.lines.push('没有人能出门。');
      return result;
    }

    for (i = 0; i < party.length; i++) result.partyNames.push(party[i].name);

    var leadName = party[0].name;
    var otherNames = [];
    for (i = 1; i < party.length; i++) otherNames.push(party[i].name);

    var withText = otherNames.length
      ? '带着 ' + otherNames.join('、') + ' '
      : '';

    result.lines.push(leadName + ' ' + withText + '去了' + loc.name + '。');

    // 队伍整体成功率取平均值
    var chanceSum = 0;
    for (i = 0; i < party.length; i++) chanceSum += SF.exploreChance(party[i], loc);
    var success = roll(chanceSum / party.length);
    result.success = success;

    var haul = {};
    var junkOnly = !loc.far && roll(C.explore.junkChanceNear);
    result.junkOnly = junkOnly;
    var mult = 1 + C.party.lootPerExtra * (party.length - 1);

    if (junkOnly) {
      giveHaul(haul, 'material', Math.ceil(rnd(C.explore.junkLoot[0], C.explore.junkLoot[1]) * mult));
      result.lines.push('整片地方被人翻过好几轮了，食物和水一点没剩，只拖回一堆还能用的材料。');
    } else {
      var factor = success ? 1 : C.explore.failLootFactor;
      for (i = 0; i < SF.SUPPLIES.length; i++) {
        var key = SF.SUPPLIES[i].key;
        var range = loc.loot[key];
        if (!range) continue;
        var qty = rnd(range[0], range[1]);
        if (!success) qty = Math.floor(qty * factor);
        if (qty > 0) giveHaul(haul, key, Math.ceil(qty * mult));
      }
      result.lines.push(success ? loc.okText : loc.badText);
    }

    // 铁柱在队里：物资翻倍
    var hasTie = false;
    var hasNana = false;
    for (i = 0; i < party.length; i++) {
      if (party[i].charId === 'tie') hasTie = true;
      if (party[i].charId === 'nana') hasNana = true;
    }
    if (hasTie) {
      for (var hk in haul) {
        if (!haul.hasOwnProperty(hk)) continue;
        haul[hk] = haul[hk] * T.tieLootMult;
      }
      result.lines.push('铁柱扛起一整箱东西就走，一趟顶两趟。');
    }

    // 掠夺者
    if (!junkOnly && roll(T.raiderChance + (party.length - 1) * 0.03)) {
      if (hasNana && roll(T.nanaNegotiate)) {
        var bonus = rnd(T.nanaBonus[0], T.nanaBonus[1]);
        giveHaul(haul, roll(0.5) ? 'food' : 'water', bonus);
        result.lines.push('路上被三个掠夺者拦住。娜娜笑着递了根烟，聊了几句，东西一样没少，还多拿了 ' + bonus + ' 份。');
      } else {
        haul.food = Math.floor((haul.food || 0) / 2);
        haul.water = Math.floor((haul.water || 0) / 2);
        result.lines.push('路上被人堵住，抢走了一部分东西。');
      }
    }

    // 危险事件：受伤
    var riskChance = (loc.far ? C.explore.injuryChanceFar : (success ? 0 : C.explore.injuryChanceNear))
      + (party.length - 1) * C.party.riskPerExtra;

    if (roll(riskChance)) {
      var victim = pickOne(party);
      var protector = null;
      for (i = 0; i < party.length; i++) {
        if (party[i].id !== victim.id) {
          protector = party[i];
          break;
        }
      }

      var hurtHp = C.explore.injuryHp;
      victim.hp = clamp(victim.hp - hurtHp, 0, C.maxStat);
      victim.injured = true;
      victim.mood = clamp(victim.mood - 6, 0, C.maxStat);
      result.injured.push({ name: victim.name, hp: hurtHp });

      if (protector) {
        result.lines.push('在' + loc.name + '遇到了流浪狗，' + victim.name +
          '为了保护' + protector.name + '被咬伤了。');
      } else {
        result.lines.push('在' + loc.name + '遇到了流浪狗，' + victim.name + '被咬伤了。');
      }
    }

    // 幸运事件
    if (!junkOnly && roll(0.14)) {
      var lucky = pickOne(['medicine', 'food', 'water']);
      giveHaul(haul, lucky, 2);
      result.lines.push('在' + loc.name + '发现了另一个死去幸存者留下的背包，里面还有些能用的东西。');
    }

    // 人际事件（需要玩家选择）
    if (!junkOnly && roll(0.16)) {
      result.choice = {
        id: 'stranger',
        title: '路边的求救声',
        text: '回来的路上，你们遇到一个抱着孩子的女人，她抓住' + leadName +
          '的袖子不肯松手，说只求一口吃的。',
        options: [
          { key: 'take', label: '带她回去' },
          { key: 'leave', label: '不管她' }
        ]
      };
    }

    applyHaul(state, haul, result);

    // 特殊道具
    if (roll(C.explore.specialChance)) {
      if (!state.items.radio && !state.items.radioBroken) {
        state.items.radioBroken = true;
        result.item = { key: 'radio', name: '损坏的收音机', text: '一台摔坏的收音机。也许还能修。' };
        result.lines.push('墙角有台摔坏的收音机，你顺手拎了回来。');
      } else if (!state.items.pesticide) {
        state.items.pesticide = true;
        result.item = { key: 'pesticide', name: '杀虫剂', text: '半罐杀虫剂，喷头还能用。' };
        result.lines.push('货架底层还压着半罐杀虫剂。');
      }
    }

    // 每个人的消耗与心情
    for (i = 0; i < party.length; i++) {
      var p = party[i];
      p.hunger = clamp(p.hunger + C.explore.hungerCost, 0, C.maxStat);
      p.thirst = clamp(p.thirst + C.explore.thirstCost, 0, C.maxStat);
      p.mood = clamp(p.mood + (success ? C.explore.moodOnSuccess : C.explore.moodOnFail), 0, C.maxStat);

      if (p.hp <= 0) {
        p.alive = false;
        result.died = true;
        result.lines.push(p.name + ' 没能回来。');
      }
    }

    state.lastEvent = result.lines[result.lines.length - 1] || '';
    ensureLeader(state);
    checkOver(state, state.day);
    return result;
  };

  SF.applyExploreChoice = function (state, result, key) {
    if (!result || !result.choice) return;

    if (result.choice.id === 'stranger') {
      if (key === 'take') {
        if ((state.supplies.food || 0) >= 1) {
          state.supplies.food -= 1;
          result.lines.push('你们把女人和孩子带了回来，分了他们一份口粮。');
        } else {
          result.lines.push('你们实在拿不出吃的，只能看着她走远。');
        }
        for (var i = 0; i < state.survivors.length; i++) {
          if (state.survivors[i].alive) {
            state.survivors[i].mood = clamp(state.survivors[i].mood + 8, 0, C.maxStat);
          }
        }
      } else {
        for (var j = 0; j < state.survivors.length; j++) {
          if (state.survivors[j].alive) {
            state.survivors[j].mood = clamp(state.survivors[j].mood - 8, 0, C.maxStat);
          }
        }
        result.lines.push('你们没有回头。回去的路上谁都没说话。');
      }
    }

    result.choice = null;
  };

  // ---------- 晚间结算（前半段） ----------

  SF.startNight = function (state, plan) {
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
      event: null,
      eventText: '',
      rows: [],
      deaths: [],
      meds: [],
      allDead: false
    };

    var waterRation = SF.waterRation(state);
    var rowData = {};

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

    if ((state.supplies.material || 0) < C.material.guardCost && roll(C.material.theftChance)) {
      var stealFood = Math.min(state.supplies.food || 0, C.material.theftFood);
      var stealWater = Math.min(state.supplies.water || 0, C.material.theftWater);

      if (stealFood > 0 || stealWater > 0) {
        state.supplies.food -= stealFood;
        state.supplies.water -= stealWater;
        report.theft = { food: stealFood, water: stealWater };
      }
    }

    report.event = makeNightEvent(state);
    return report;
  };

  // ---------- 夜间事件 ----------

  function makeNightEvent(state) {
    if (!roll(C.events.nightChance)) return null;

    var alive = SF.aliveAll(state);
    var kinds = ['thief', 'rats', 'fever'];
    var kind = pickOne(kinds);
    var food = state.supplies.food || 0;
    var med = state.supplies.medicine || 0;

    if (kind === 'fever') {
      if (!alive.length) return null;
      var sick = pickOne(alive);
      if (sick.sick) {
        kind = 'thief';
      } else {
        return {
          id: 'fever',
          targetId: sick.id,
          title: '发烧',
          text: sick.name + ' 半夜烧得说胡话，额头发烫。',
          options: [
            { key: 'med', label: '用药品', disabled: med < 1 },
            { key: 'endure', label: '硬扛一夜' }
          ]
        };
      }
    }

    if (kind === 'rats') {
      return {
        id: 'rats',
        title: '变异老鼠',
        text: '墙角传来窸窸窣窣的声音，一群变异老鼠正在啃货架上的食物。',
        options: [
          { key: 'spray', label: '喷杀虫剂', disabled: !state.items.pesticide },
          { key: 'chase', label: '拿棍子赶' },
          { key: 'ignore', label: '不管它们' }
        ]
      };
    }

    return {
      id: 'thief',
      targetId: null,
      title: '半夜敲门',
      text: '半夜有人敲门，说只要给点食物就走。门外不止一个人。',
      options: [
        { key: 'give', label: '给 2 份食物', disabled: food < 2 },
        { key: 'fight', label: '抄家伙守着' },
        { key: 'sleep', label: '装睡不吭声' }
      ]
    };
  }

  SF.resolveNightEvent = function (state, report, key) {
    if (!report || !report.event) return report;

    var ev = report.event;
    var lines = [];
    var i;

    if (ev.id === 'thief') {
      if (key === 'give') {
        state.supplies.food = Math.max(0, (state.supplies.food || 0) - 2);
        lines.push('你把两份食物从门缝塞了出去。脚步声渐渐远了。');
      } else if (key === 'fight') {
        if (roll(0.45)) {
          var victim = pickOne(SF.aliveAll(state));
          if (victim) {
            victim.hp = clamp(victim.hp - 12, 0, C.maxStat);
            victim.injured = true;
            lines.push('门外的人试了两下门，最后跑了，但' + victim.name + '在门口挂了彩。');
          }
        } else {
          var lost = Math.min(state.supplies.food || 0, C.events.nightFoodSteal);
          state.supplies.food -= lost;
          lines.push('门锁被撬开，他们抢走了 ' + lost + ' 份食物。');
        }
      } else {
        var lost2 = Math.min(state.supplies.food || 0, C.events.nightFoodSteal);
        state.supplies.food -= lost2;
        for (i = 0; i < state.survivors.length; i++) {
          if (state.survivors[i].alive) {
            state.survivors[i].mood = clamp(state.survivors[i].mood - 6, 0, C.maxStat);
          }
        }
        lines.push('你们谁也没出声，等门外安静下去，才发现少了 ' + lost2 + ' 份食物。');
      }
    } else if (ev.id === 'rats') {
      if (key === 'spray') {
        state.items.pesticide = false;
        lines.push('杀虫剂喷下去，老鼠四散逃开，货架保住了。');
      } else if (key === 'chase') {
        var lost3 = Math.min(state.supplies.food || 0, 1);
        state.supplies.food -= lost3;
        lines.push('你们拿棍子赶了半天，还是被啃掉了一份食物。');
      } else {
        var lost4 = Math.min(state.supplies.food || 0, 3);
        state.supplies.food -= lost4;
        lines.push('老鼠啃了一整夜，早上清点时少了 ' + lost4 + ' 份食物。');
      }
    } else if (ev.id === 'fever') {
      var target = SF.find(state, ev.targetId);
      if (target && target.alive) {
        if (key === 'med' && (state.supplies.medicine || 0) >= 1) {
          state.supplies.medicine -= 1;
          target.sick = false;
          target.hp = clamp(target.hp + 20, 0, C.maxStat);
          lines.push('你给' + target.name + '喂了药，后半夜她终于退了烧。');
        } else {
          target.sick = true;
          target.hp = clamp(target.hp - C.events.feverHpLoss, 0, C.maxStat);
          lines.push(target.name + '硬扛了一夜，烧没退，人也更虚了。');
        }
      }
    }

    report.eventText = lines.join(' ');
    report.event = null;
    return report;
  };

  // ---------- 晚间结算（后半段） ----------

  SF.finishNight = function (state, report) {
    var alive = SF.aliveAll(state);
    var i;

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

  // 旧接口：一次性跑完（没有事件选择时使用）
  SF.endDay = function (state, plan) {
    var report = SF.startNight(state, plan);
    if (report.event) report.event = null;
    return SF.finishNight(state, report);
  };

})();
