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
      mad: !!stats.mad,
      hasMask: false,
      hasTorch: false,
      hasWeapon: false,
      ap: 1,
      hungerDays: 0,
      thirstDays: 0,
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
      meal: {},              // 今天谁吃过、喝过：{ id: { eat, drink } }
      todayFood: 0,          // 今天已经喂掉的食物
      todayWater: 0,         // 今天已经喂掉的水
      items: {
        radio: false,
        radioBroken: false,
        pesticide: false,
        cards: false,
        gasMask: false,
        flashlight: false,
        weapon: false
      },
      rescueLeft: C.rescueDays,
      lastEvent: '',
      logs: [],
      vaultUnlocked: false,
      morningNews: '',
      defense: 0,
      actionUsed: false,
      survivors: survivors,
      leaderId: player.id,
      exploredToday: false,
      over: false,
      overDay: 0
    };
  };

  SF.addLog = function (state, text) {
    if (!text) return;
    state.logs.push(text);
    if (state.logs.length > 12) state.logs.shift();
    state.lastEvent = text;
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

  // ---------- 主界面投喂 ----------

  SF.mealOf = function (state, id) {
    if (!state.meal) state.meal = {};
    if (!state.meal[id]) state.meal[id] = { eat: false, drink: false };
    return state.meal[id];
  };

  // 把一份食物/水从库存里直接递给某个人
  SF.feed = function (state, id, kind) {
    var s = SF.find(state, id);
    if (!s || !s.alive) return { ok: false, msg: '' };

    var m = SF.mealOf(state, id);

    if (kind === 'food') {
      if (m.eat) return { ok: false, msg: s.name + ' 今天已经吃过了。' };

      var need = SF.foodNeed(s);
      if ((state.supplies.food || 0) < need) {
        return { ok: false, msg: '食物不够了。' };
      }

      state.supplies.food = Math.round(((state.supplies.food || 0) - need) * 10) / 10;
      state.todayFood = Math.round(((state.todayFood || 0) + need) * 10) / 10;
      m.eat = true;

      SF.addLog(state, '给 ' + s.name + ' 分了食物。');
      return { ok: true, msg: s.name + ' 吃了一份食物。' };
    }

    if (kind === 'water') {
      if (m.drink) return { ok: false, msg: s.name + ' 今天已经喝过了。' };

      var ration = SF.waterRation(state);
      if ((state.supplies.water || 0) < ration) {
        return { ok: false, msg: '水不够了。' };
      }

      state.supplies.water = Math.round(((state.supplies.water || 0) - ration) * 10) / 10;
      state.todayWater = Math.round(((state.todayWater || 0) + ration) * 10) / 10;
      m.drink = true;

      SF.addLog(state, '给 ' + s.name + ' 分了水。');
      return { ok: true, msg: s.name + ' 喝了一份水。' };
    }

    return { ok: false, msg: '' };
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

    if (s.sick && !s.hasMask) p += E.sickPenalty;
    if (s.mood < E.moodLowAt) p += E.moodLowPenalty;
    if (s.hasTorch) p += 0.05;

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
        if (m && m.alive && !m.mad) party.push(m);
      }
    }
    if (!party.length) {
      var lead = SF.find(state, state.leaderId);
      if (!lead || !lead.alive || lead.mad) {
        lead = null;
        var all = SF.aliveAll(state);
        for (i = 0; i < all.length; i++) {
          if (!all[i].mad) {
            lead = all[i];
            break;
          }
        }
      }
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

    var hasWeapon = false;
    for (i = 0; i < party.length; i++) {
      if (party[i].hasWeapon) hasWeapon = true;
    }
    if (hasWeapon) riskChance = riskChance * 0.5;

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

    // 特殊事件：只在特定地点出现，特殊物品只能靠它拿到
    if (!result.choice && roll(C.special.chance)) {
      var far = loc.far;

      if (far && !state.items.gasMask) {
        result.choice = {
          id: 'backpacker',
          title: '死去的背包客',
          text: '货架后面靠着一个已经凉透的背包客，背包还挂在他身上。',
          options: [
            { key: 'loot', label: '搜刮他的背包' },
            { key: 'bury', label: '安葬他' }
          ]
        };
      } else if (far && !state.items.radio && !state.items.radioBroken) {
        result.choice = {
          id: 'radio',
          title: '角落里的收音机',
          text: '值班室的抽屉里塞着一台摔过的收音机，后盖已经裂了。',
          options: [
            { key: 'takeRadio', label: '拆下来带走' },
            { key: 'leaveRadio', label: '别费力气' }
          ]
        };
      } else if (!far && !state.items.cards) {
        result.choice = {
          id: 'cards',
          title: '一副扑克牌',
          text: '休息室的桌上还摊着一副扑克牌，牌角被汗水泡软了。',
          options: [
            { key: 'takeCards', label: '收进口袋' },
            { key: 'leaveCards', label: '留下' }
          ]
        };
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
    var i;

    if (result.choice.id === 'stranger') {
      if (key === 'take') {
        if ((state.supplies.food || 0) >= 1) {
          state.supplies.food -= 1;
          result.lines.push('你们把女人和孩子带了回来，分了他们一份口粮。');
        } else {
          result.lines.push('你们实在拿不出吃的，只能看着她走远。');
        }
        for (i = 0; i < state.survivors.length; i++) {
          if (state.survivors[i].alive) {
            state.survivors[i].mood = clamp(state.survivors[i].mood + 8, 0, C.maxStat);
          }
        }
      } else {
        for (i = 0; i < state.survivors.length; i++) {
          if (state.survivors[i].alive) {
            state.survivors[i].mood = clamp(state.survivors[i].mood - 8, 0, C.maxStat);
          }
        }
        result.lines.push('你们没有回头。回去的路上谁都没说话。');
      }
    } else if (result.choice.id === 'backpacker') {
      if (key === 'bury') {
        state.items.gasMask = true;
        result.lines.push('你们把他埋在了后墙下，背包里翻出一副防毒面具，还能用。');
      } else {
        var bonus = rnd(1, 2);
        state.supplies.food = (state.supplies.food || 0) + bonus;
        state.supplies.medicine = (state.supplies.medicine || 0) + 1;
        result.lines.push('你们把他的背包翻了个底朝天，拿走 ' + bonus + ' 份食物和一点药品，人留在了原地。');
        for (i = 0; i < state.survivors.length; i++) {
          if (state.survivors[i].alive) {
            state.survivors[i].mood = clamp(state.survivors[i].mood - 9, 0, C.maxStat);
          }
        }
      }
    } else if (result.choice.id === 'radio') {
      if (key === 'takeRadio') {
        state.items.radioBroken = true;
        result.lines.push('你把收音机拆了下来，能不能修好得看陈默的手艺。');
      } else {
        result.lines.push('你把它放回抽屉，没那个力气了。');
      }
    } else if (result.choice.id === 'cards') {
      if (key === 'takeCards') {
        state.items.cards = true;
        result.lines.push('你们把这副扑克牌收了回去，总算有点能打发时间的东西。');
      } else {
        result.lines.push('牌留在了桌上，反正也没人有心情玩。');
      }
    }

    result.choice = null;
  };

  // ---------- 用药 / 装备防毒面具 ----------

  SF.useMedicine = function (state, id) {
    var s = SF.find(state, id);
    if (!s || !s.alive || !s.sick) return false;
    if ((state.supplies.medicine || 0) < 1) return false;

    state.supplies.medicine -= 1;
    s.sick = false;
    s.hp = clamp(s.hp + C.night.medicineHeal, 0, C.maxStat);
    SF.addLog(state, '给 ' + s.name + ' 用了药，烧终于退了一点。');
    return true;
  };

  SF.equipMask = function (state, id) {
    var s = SF.find(state, id);
    if (!s || !s.alive || s.hasMask) return false;
    if (!state.items.gasMask) return false;

    s.hasMask = true;
    SF.addLog(state, s.name + ' 戴上了防毒面具，出去不再受病痛影响。');
    return true;
  };

  // ---------- 晚间结算（前半段） ----------

  SF.startNight = function (state, plan) {
    var alive = SF.aliveAll(state);
    var N = C.night;
    var i;

    plan = plan || { eat: {}, drink: {} };
    if (!plan.eat) plan.eat = {};
    if (!plan.drink) plan.drink = {};

    // 主界面已经喂过的情况：库存当时就扣了，这里不再重复扣
    var prepaid = !!plan.prepaid;

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

      if (plan.eat[a1.id] && (prepaid || (state.supplies.food || 0) >= need)) {
        if (!prepaid) {
          state.supplies.food -= need;
        }
        report.foodUsed += need;
        fed = true;
      }

      if (plan.drink[a1.id] && (prepaid || (state.supplies.water || 0) >= waterRation)) {
        if (!prepaid) {
          state.supplies.water = Math.round(((state.supplies.water || 0) - waterRation) * 10) / 10;
        }
        report.waterUsed = Math.round((report.waterUsed + waterRation) * 10) / 10;
        drank = true;
      }

      rowData[a1.id] = { fed: fed, drank: drank };
    }

    if (prepaid) {
      report.foodUsed = Math.round((state.todayFood || 0) * 10) / 10;
      report.waterUsed = Math.round((state.todayWater || 0) * 10) / 10;
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

      s.hungryDays = isFed ? 0 : (s.hungryDays || 0) + 1;
      s.thirstDays = isDrank ? 0 : (s.thirstDays || 0) + 1;

      if (!isFed) {
        dmg += (s.hungryDays >= N.streakAt) ? N.streakHp : N.starveHp;
        report.shortage = true;
      }
      if (!isDrank) {
        dmg += (s.thirstDays >= N.streakAt) ? N.streakHp : N.thirstHp;
        report.shortage = true;
      }
      if (s.hungryDays >= N.streakAt || s.thirstDays >= N.streakAt) {
        s.mood = clamp(s.mood - N.streakMood, 0, C.maxStat);
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
      s.mood = clamp(s.mood + moodDelta + (state.items.cards ? 4 : 0), 0, C.maxStat);

      // 心情缓过来就会停止发疯
      if (s.mad && s.mood >= C.madness.recoverAt) {
        s.mad = false;
        SF.addLog(state, s.name + ' 终于缓过神来，不再发疯了。');
      }

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

    // 心情低于 20 的人里，每晚最多一个人发疯；发疯只抢走 1 份物资
    var candidates = [];
    for (i = 0; i < alive.length; i++) {
      if (alive[i].hp > 0 && !alive[i].mad && alive[i].mood <= C.madness.moodAt) {
        candidates.push(alive[i]);
      }
    }

    if (candidates.length && roll(C.madness.chance)) {
      var madOne = pickOne(candidates);
      madOne.mad = true;

      var taken = '';
      if ((state.supplies.food || 0) >= 1) {
        state.supplies.food -= 1;
        taken = '食物';
      } else if ((state.supplies.water || 0) >= 1) {
        state.supplies.water = Math.round(((state.supplies.water || 0) - 1) * 10) / 10;
        taken = '水';
      } else if ((state.supplies.material || 0) >= 1) {
        state.supplies.material -= 1;
        taken = '材料';
      }

      SF.addLog(state, madOne.name + ' 半夜发起疯来' + (taken ? '，抢走了 1 份' + taken : '，在墙角撞了一夜'));
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

    report.event = makePersonalEvent(state);
    return report;
  };

  /* 硬核版夜间事件：盗窃 / 传染 / 乞丐 / 梦境 */
  function makeRealNightEvent(state) {
    if (!roll(C.events.nightChance)) return null;

    var alive = SF.aliveAll(state);
    var pool = ['theft', 'infection', 'beggar'];

    if (!state.vaultUnlocked && SF.charAlive(state, 'chen')) pool.push('dream');

    var sick = null;
    for (var i = 0; i < alive.length; i++) {
      if (alive[i].sick) {
        sick = alive[i];
        break;
      }
    }
    if (!sick) pool = pool.filter(function (k) { return k !== 'infection'; });

    var kind = pickOne(pool);

    if (kind === 'infection') {
      return {
        id: 'infection',
        targetId: sick.id,
        title: '半夜咳嗽',
        text: sick.name + ' 半夜开始剧烈咳嗽，同屋的人谁都没睡好。',
        options: [{ key: 'ok', label: '熬到天亮' }]
      };
    }

    if (kind === 'beggar') {
      return {
        id: 'beggar',
        title: '门外的老人',
        text: '门外有个绝望的老人，隔着铁门讨一口水喝。',
        options: [
          { key: 'give', label: '给 1 瓶水', disabled: (state.supplies.water || 0) < 1 },
          { key: 'refuse', label: '不给' }
        ]
      };
    }

    if (kind === 'dream') {
      return {
        id: 'dream',
        targetId: null,
        title: '一个梦',
        text: '陈默梦见城郊仓库里有一道暗门，醒来时路线还清清楚楚。',
        options: [{ key: 'ok', label: '记下来' }]
      };
    }

    return {
      id: 'theft',
      targetId: null,
      title: '门口的异响',
      text: '半夜门口有金属摩擦的声响，一直持续到天快亮。',
      options: [{ key: 'ok', label: '等到天亮' }]
    };
  }

  SF.resolveHardNightEvent = function (state, report, key) {
    if (!report || !report.event) return report;

    var ev = report.event;
    var i;

    if (ev.id === 'theft') {
      if (state.defense > 0) {
        report.eventText = '门被加固过的木板顶得死死的，盗贼转了两圈，骂了一句就走了。';
        SF.addLog(state, '避难所防御生效，盗贼什么都没拿到。');
      } else if ((state.supplies.material || 0) >= C.material.guardCost * 2) {
        report.eventText = '门被材料顶得死死的，盗贼转了两圈，骂了一句就走了。';
        SF.addLog(state, '盗贼被堵在门外，什么都没丢。');
      } else {
        var lost = Math.min(state.supplies.food || 0, C.events.nightFoodSteal);
        state.supplies.food -= lost;
        report.eventText = '早上清点时，食物少了 ' + lost + ' 份。';
        SF.addLog(state, '夜里遭了贼，食物 −' + lost + '。');
      }
    } else if (ev.id === 'infection') {
      for (i = 0; i < state.survivors.length; i++) {
        var s = state.survivors[i];
        if (!s.alive || s.id === ev.targetId) continue;
        s.mood = clamp(s.mood - 8, 0, C.maxStat);
      }
      report.eventText = '听着那阵咳嗽，谁都没再睡着。其他人的心情下降了。';
      SF.addLog(state, '夜里的咳嗽声让所有人心情 −8。');
    } else if (ev.id === 'beggar') {
      if (key === 'give' && (state.supplies.water || 0) >= 1) {
        state.supplies.water = Math.round(((state.supplies.water || 0) - 1) * 10) / 10;
        state.beggarReward = true;
        for (i = 0; i < state.survivors.length; i++) {
          if (state.survivors[i].alive) {
            state.survivors[i].mood = clamp(state.survivors[i].mood + 6, 0, C.maxStat);
          }
        }
        report.eventText = '你把一瓶水从门缝递了出去，老人一直道谢。';
      } else {
        for (i = 0; i < state.survivors.length; i++) {
          if (state.survivors[i].alive) {
            state.survivors[i].mood = clamp(state.survivors[i].mood - 10, 0, C.maxStat);
          }
        }
        report.eventText = '门外安静了下去。你们谁都没说话。';
        SF.addLog(state, '你们没有给老人水，所有人的心情 −10。');
      }
    } else if (ev.id === 'dream') {
      state.vaultUnlocked = true;
      report.eventText = '地图上多了一个地方：城郊仓库的暗门。';
      SF.addLog(state, '解锁了隐藏地点：仓库暗门。');
    }

    report.event = null;
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

    // 乞丐的回礼
    if (state.beggarReward) {
      state.beggarReward = false;
      if (roll(C.special.beggarReward)) {
        var gift = pickOne(['cards', 'pesticide', 'medicine', 'flashlight', 'weapon']);

        if (gift === 'cards' && !state.items.cards) {
          state.items.cards = true;
          SF.addLog(state, '老人在门口留下了一副扑克牌。');
        } else if (gift === 'pesticide' && !state.items.pesticide) {
          state.items.pesticide = true;
          SF.addLog(state, '老人在门口留下了半罐杀虫剂。');
        } else if (gift === 'flashlight' && !state.items.flashlight) {
          state.items.flashlight = true;
          SF.addLog(state, '老人在门口留下了一只手电筒。');
        } else if (gift === 'weapon' && !state.items.weapon) {
          state.items.weapon = true;
          SF.addLog(state, '老人在门口留下了一根铁棍。');
        } else {
          state.supplies.medicine = (state.supplies.medicine || 0) + 1;
          SF.addLog(state, '老人在门口留下了一盒药。');
        }
      }
    }

    // 收音机的早晨播报
    if (state.items.radio) {
      state.morningNews = pickOne(C.broadcasts);
      SF.addLog(state, '收音机：' + state.morningNews);
    }

    for (i = 0; i < alive.length; i++) {
      var d = alive[i];
      if (d.hp > 0) continue;
      d.alive = false;
      var deadRow = findRow(report.rows, d.id);
      if (deadRow) deadRow.died = true;
      report.deaths.push(d.name);
      SF.addLog(state, d.name + ' 没撑过去，走了。');
    }

    state.day = state.day + 1;
    state.actionUsed = false;
    state.meal = {};
    state.todayFood = 0;
    state.todayWater = 0;
    if (state.rescueLeft > 0) state.rescueLeft -= 1;

    for (i = 0; i < alive.length; i++) {
      if (alive[i].alive) alive[i].ap = 1;
    }

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


// ---------- 日常行动 ----------
(function () {
  var C = SF.CONFIG;

  function allMood(state, delta) {
    var alive = SF.aliveAll(state);
    for (var i = 0; i < alive.length; i++) {
      alive[i].mood = SF.clamp(alive[i].mood + delta, 0, C.maxStat);
    }
    return alive.length;
  }

  SF.homeAction = function (state, type) {
    var alive = SF.aliveAll(state);
    if (!alive.length) return { ok: false, text: '没有人能动了。' };

    var worker = null;
    for (var w = 0; w < alive.length; w++) {
      if (alive[w].ap > 0 && !alive[w].mad) {
        worker = alive[w];
        break;
      }
    }
    if (!worker) {
      return { ok: false, text: '今天所有人的行动点都用完了。' };
    }

    if (type === 'clean') {
      if ((state.supplies.water || 0) < 1) {
        return { ok: false, text: '没有多余的水，擦不了地。' };
      }
      state.supplies.water = Math.round(((state.supplies.water || 0) - 1) * 10) / 10;
      allMood(state, 10);
      worker.ap = 0;
      var line1 = '你们用一瓶水把地面和床铺擦了一遍，屋里的味道终于淡了点。全员心情 +10。';
      SF.addLog(state, '打扫房间：水 −1，全员心情 +10。');
      return { ok: true, title: '打扫房间', text: line1 };
    }

    if (type === 'repair') {
      if ((state.supplies.material || 0) < 2) {
        return { ok: false, text: '材料不够，连门框都补不上（需要 2 份材料）。' };
      }
      state.supplies.material -= 2;
      state.defense += 1;
      worker.ap = 0;
      allMood(state, 3);
      var line2 = '你们把木板钉在门后、把通风口堵严。避难所防御 +1，现在是 ' + state.defense + '。';
      SF.addLog(state, '修理避难所：材料 −2，防御 +1。');
      return { ok: true, title: '修理避难所', text: line2 };
    }

    if (type === 'talk') {
      allMood(state, 15);
      worker.ap = 0;
      var line3 = '没人出门。你们围着桌子聊了很久，从工作聊到想吃的东西。全员心情 +15。';
      SF.addLog(state, '围炉夜话：全员心情 +15。');
      return { ok: true, title: '围炉夜话', text: line3 };
    }

    return { ok: false, text: '不知道要做什么。' };
  };
})();


// ---------- 针对个人的夜间事件 ----------
(function () {
  var C = SF.CONFIG;

  function removeOne(state, key) {
    if (key === 'water') {
      if ((state.supplies.water || 0) < 1) return false;
      state.supplies.water = Math.round(((state.supplies.water || 0) - 1) * 10) / 10;
      return true;
    }
    if ((state.supplies[key] || 0) < 1) return false;
    state.supplies[key] -= 1;
    return true;
  }

  function allMood(state, delta) {
    var alive = SF.aliveAll(state);
    for (var i = 0; i < alive.length; i++) {
      alive[i].mood = SF.clamp(alive[i].mood + delta, 0, C.maxStat);
    }
  }

  function makePersonalEvent(state) {
    if (!SF.roll(C.events.nightChance)) return null;

    var alive = SF.aliveAll(state);
    if (!alive.length) return null;

    var kinds = ['fever', 'rat', 'rage', 'theft'];
    if (!state.vaultUnlocked && SF.charAlive(state, 'chen')) kinds.push('dream');
    kinds.push('beggar');

    var kind = SF.pick
      ? SF.pick(kinds)
      : kinds[Math.floor(Math.random() * kinds.length)];
    var t;

    if (kind === 'fever') {
      t = alive[Math.floor(Math.random() * alive.length)];
      return {
        id: 'fever',
        targetId: t.id,
        title: t.name + ' 发烧了',
        text: '半夜，' + t.name + ' 因为口渴难耐，开始发烧咳嗽。',
        options: [
          { key: 'med', label: '用药品救治', disabled: (state.supplies.medicine || 0) < 1 },
          { key: 'endure', label: '让她硬扛' }
        ]
      };
    }

    if (kind === 'rat') {
      t = alive[Math.floor(Math.random() * alive.length)];
      return {
        id: 'rat',
        targetId: t.id,
        title: t.name + ' 被咬了',
        text: '一只变异老鼠爬到了' + t.name + ' 的床上，咬伤了他。',
        options: [{ key: 'ok', label: '只能忍着' }]
      };
    }

    if (kind === 'rage') {
      t = SF.findChar(state, 'tie') || alive[Math.floor(Math.random() * alive.length)];
      return {
        id: 'rage',
        targetId: t.id,
        title: t.name + ' 发脾气',
        text: t.name + ' 因为今天没吃饱，脾气暴躁，砸坏了桌子。',
        options: [{ key: 'ok', label: '随他去吧' }]
      };
    }

    if (kind === 'beggar') {
      return {
        id: 'beggar',
        targetId: null,
        title: '门外的老人',
        text: '门外有个绝望的老人，隔着铁门讨一口水喝。',
        options: [
          { key: 'give', label: '给 1 瓶水', disabled: (state.supplies.water || 0) < 1 },
          { key: 'refuse', label: '不给' }
        ]
      };
    }

    if (kind === 'dream') {
      return {
        id: 'dream',
        targetId: null,
        title: '陈默的一个梦',
        text: '陈默梦见城郊仓库里有一道暗门，醒来时路线还清清楚楚。',
        options: [{ key: 'ok', label: '记下来' }]
      };
    }

    return {
      id: 'theft',
      targetId: null,
      title: '门口的异响',
      text: '半夜门口有金属摩擦的声响，一直持续到天快亮。',
      options: [{ key: 'ok', label: '等到天亮' }]
    };
  }

  SF.resolvePersonalEvent = function (state, report, key) {
    if (!report || !report.event) return report;

    var ev = report.event;
    var target = ev.targetId ? SF.find(state, ev.targetId) : null;
    var lines = [];

    if (ev.id === 'fever' && target) {
      if (key === 'med' && (state.supplies.medicine || 0) >= 1) {
        state.supplies.medicine -= 1;
        target.sick = false;
        target.hp = SF.clamp(target.hp + 15, 0, C.maxStat);
        lines.push('你给' + target.name + '喂了药，天快亮时她终于退了烧。');
      } else {
        target.sick = true;
        target.hp = SF.clamp(target.hp - 10, 0, C.maxStat);
        target.mood = SF.clamp(target.mood - 10, 0, C.maxStat);
        lines.push(target.name + '烧了一整夜，血量 −10，心情 −10。');
      }
    } else if (ev.id === 'rat' && target) {
      target.hp = SF.clamp(target.hp - 15, 0, C.maxStat);
      target.mood = SF.clamp(target.mood - 6, 0, C.maxStat);
      lines.push(target.name + '被咬伤，血量 −15。');
    } else if (ev.id === 'rage' && target) {
      if (!removeOne(state, 'material')) removeOne(state, 'food');
      allMood(state, -5);
      lines.push(target.name + '砸了一通东西，物资少了一份，所有人都被吵得心情 −5。');
    } else if (ev.id === 'theft') {
      if (state.defense > 0 || (state.supplies.material || 0) >= C.material.guardCost * 2) {
        lines.push('门被顶得死死的，盗贼转了两圈就走了。');
      } else {
        var lost = Math.min(state.supplies.food || 0, C.events.nightFoodSteal);
        state.supplies.food -= lost;
        lines.push('早上清点时，食物少了 ' + lost + ' 份。');
      }
    } else if (ev.id === 'beggar') {
      if (key === 'give' && (state.supplies.water || 0) >= 1) {
        state.supplies.water = Math.round(((state.supplies.water || 0) - 1) * 10) / 10;
        state.beggarReward = true;
        allMood(state, 6);
        lines.push('你递出一瓶水，老人一直道谢。');
      } else {
        allMood(state, -10);
        lines.push('你没有开门。听着外面的脚步声，所有人都低下了头。');
      }
    } else if (ev.id === 'dream') {
      state.vaultUnlocked = true;
      lines.push('地图上多了一个地方：城郊仓库的暗门。');
    }

    if (lines.length) SF.addLog(state, lines.join(' '));
    report.eventText = lines.join(' ');
    report.event = null;
    return report;
  };
})();


// ---------- 行动点数 / 洗澡 / 装备 ----------
(function () {
  var C = SF.CONFIG;

  SF.anyAp = function (state) {
    var alive = SF.aliveAll(state);
    for (var i = 0; i < alive.length; i++) {
      if (alive[i].ap > 0 && !alive[i].mad) return true;
    }
    return false;
  };

  SF.bath = function (state, id) {
    var s = SF.find(state, id);
    if (!s || !s.alive) return { ok: false, text: '没有这个人。' };
    if (s.ap < 1) return { ok: false, text: s.name + ' 今天已经动过了。' };
    if ((state.supplies.water || 0) < 1) return { ok: false, text: '物资不足：没有多余的水。' };

    state.supplies.water = Math.round(((state.supplies.water || 0) - 1) * 10) / 10;
    s.ap = 0;
    s.mood = SF.clamp(s.mood + 20, 0, C.maxStat);
    SF.addLog(state, s.name + '洗了个澡，心情 +20。');
    return { ok: true, title: s.name + ' 洗澡', text: '用掉一瓶水，' + s.name + ' 洗了很久，出来时人明显松快了些。心情 +20。' };
  };

  SF.toggleGear = function (state, id, gear) {
    var s = SF.find(state, id);
    if (!s || !s.alive) return false;

    if (gear === 'mask') {
      if (s.hasMask) {
        s.hasMask = false;
        state.items.gasMask = true;
        return true;
      }
      if (state.items.gasMask) {
        s.hasMask = true;
        state.items.gasMask = false;
        return true;
      }
      return false;
    }

    if (gear === 'torch') {
      if (s.hasTorch) {
        s.hasTorch = false;
        state.items.flashlight = true;
        return true;
      }
      if (state.items.flashlight) {
        s.hasTorch = true;
        state.items.flashlight = false;
        return true;
      }
      return false;
    }

    if (gear === 'weapon') {
      if (s.hasWeapon) {
        s.hasWeapon = false;
        state.items.weapon = true;
        return true;
      }
      if (state.items.weapon) {
        s.hasWeapon = true;
        state.items.weapon = false;
        return true;
      }
      return false;
    }

    return false;
  };
})();
