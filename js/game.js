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

  /* 故事文本池：同一件事随机抽一句，让废土有点人味和黑色幽默 */
  var FLAVOR = {
    eat: [
      '陈默把罐头在桌角磕开，平分成了四份。虽然每个人只有一小口，但这已经是这周以来最丰盛的一顿了。',
      '{n}默默咽下冰冷的罐头，把剩下的一点汤底推给了旁边的人。',
      '{n}吃得很慢，像是想把这一口多留一会儿。',
      '铁柱两口就吞下了属于他的那份食物，然后盯着桌子上的残渣发呆，似乎在盘算着怎么把盘子也嚼了。'
    ],
    eatHard: [
      '{n}一口吞下两份口粮，连手指上的汤汁都舔干净了，可看着空荡荡的桌面，胃里还是像火烧一样。',
      '{n}狼吞虎咽到差点噎住，最后只是把空罐头捏扁，扔进墙角。'
    ],
    drink: [
      '{n}小口小口地抿着水，喉咙滚动了一下，才终于敢大口喘气。',
      '{n}把瓶子举到眼前晃了晃，确认还剩最后几滴，才舍得咽下去。'
    ],
    hungry: [
      '今天没有分配到食物。林晓饿得睡不着，只能抱着膝盖坐在角落里，听着其他人肚子里发出的咕噜声。',
      '谁都没吃上东西。铁柱把皮带又收紧了一个扣，说这样能骗骗胃。'
    ],
    sick: [
      '林晓半夜咳得很厉害，陈默找出一件破旧的大衣披在她身上，祈祷她明天能退烧。',
      '{n}裹紧了破旧的外套，半夜压抑的咳嗽声让所有人无法安睡。脸色苍白得吓人。',
      '{n}缩在角落里发抖，额头上全是汗，嘴唇没有一点血色。'
    ],
    hurt: [
      '陈默踩中了废弃工厂里的捕兽夹，惨叫声回荡在空荡荡的走廊里。你们费了好大劲才把他的脚拔出来。',
      '警局里的暴徒根本没给你们说话的机会。铁柱替林晓挡了一钢管，鲜血顺着额头流下来，你们只能拖着半箱物资仓皇逃窜。',
      '{n}咬着牙用破布自己包扎，血把布条一层层浸透。',
      '{n}的伤口又裂开了，他一声没吭，只是把袖子拉下来盖住。'
    ],
    mad: [
      '娜娜突然把桌上的空罐头瓶砸得粉碎，尖叫着说：“我们都会死在这里！”。陈默死死抱住她，铁柱在角落里一言不发。',
      '{n}抱着头蹲在墙角，嘴里反反复复念着同一个名字。'
    ],
    calm: [
      '今晚出奇的安静，甚至听不到远处的枪声。但没有人敢睡得太死，大门被堵得死死的，每个人都把武器放在手边。',
      '难得的安静夜晚，你们没有听到枪声。铁柱靠着墙打起了呼噜，陈默看着桌上的收音机发呆。',
      '风从门缝里钻进来，四个人谁也没说话。至少有屋顶，至少还有明天。'
    ],
    empty: [
      '除了满地的玻璃碴子和几只变异蟑螂，你们什么都没找到。林晓看着空荡荡的背包，深深叹了口气。',
      '翻了半天，只翻出一张过期十年的彩票。陈默把它折好塞进口袋，说留着做个纪念。'
    ],
    winTie: [
      '铁柱像推土机一样撞开了超市生锈的卷帘门，把能搬的东西全塞进了包里。林晓在后面气喘吁吁地喊：“慢点，那群野狗又要追来了！”',
      '你们在仓库的角落发现了一辆废弃的购物车。铁柱二话不说扛起车就走，你们甚至觉得他比这车还能装。'
    ],
    nana: [
      '路口遇到三个拿着铁棍的暴徒。娜娜理了理头发走上前，十分钟后，暴徒不仅放了行，还塞给她半袋饼干。陈默在后面看呆了。',
      '流浪狗盯着你们狂吠。娜娜蹲下身子，居然开始跟它讲道理。奇迹的是，狗摇着尾巴走了，还留下了一根不知从哪叼来的火腿肠。'
    ]
  };

  var FLAVOR_BAG = {};

  function flavor(key, s) {
    var list = FLAVOR[key] || FLAVOR.calm;
    var bag = FLAVOR_BAG[key];

    if (!bag || !bag.length) {
      bag = list.slice();
      // 打乱一遍，抽完一轮才会重复
      for (var i = bag.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = bag[i];
        bag[i] = bag[j];
        bag[j] = tmp;
      }
      FLAVOR_BAG[key] = bag;
    }

    var line = bag.pop();
    return line.replace(/\{n\}/g, s && s.name ? s.name : '他');
  }

  SF.flavor = flavor;

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
      missing: [],           // 失踪的人，探索时有机会救回来
      lastExpedition: null,  // 上一次去哪儿、谁去的
      todayFood: 0,          // 今天已经喂掉的食物
      todayWater: 0,         // 今天已经喂掉的水
      items: {
        radio: false,
        radioBroken: false,
        flare: false,
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
      won: false,
      storySeenDay: 0,
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

  /* 门票机制：没带对装备就绝对不能出发 */
  function wornBy(state, ids, kind) {
    var list = ids && ids.length ? ids : null;
    for (var i = 0; i < state.survivors.length; i++) {
      var s = state.survivors[i];
      if (!s.alive) continue;
      if (list && list.indexOf(s.id) === -1) continue;
      if (kind === 'torch' && s.hasTorch) return s;
      if (kind === 'mask' && s.hasMask) return s;
      if (kind === 'weapon' && s.hasWeapon) return s;
    }
    return null;
  }

  SF.gateFor = function (state, loc, ids) {
    if (!loc) return { ok: false, reason: '没有这个地方的情报。' };

    if (loc.id === 'warehouse') {
      if (wornBy(state, ids, 'torch')) return { ok: true };
      if (state.items.flashlight && !ids) return { ok: true };
      if (state.items.flashlight) {
        return { ok: false, reason: '手电筒还在库存里，出发前先给一个人穿上。' };
      }
      return { ok: false, reason: '太黑了，看不清路，需要【手电筒】才能前往。' };
    }

    if (loc.id === 'pharmacy') {
      if (wornBy(state, ids, 'mask')) return { ok: true };
      if (state.items.gasMask && !ids) return { ok: true };
      if (state.items.gasMask) {
        return { ok: false, reason: '防毒面具还在库存里，出发前先给一个人戴上。' };
      }
      return { ok: false, reason: '医院里弥漫着消毒水和尸体腐烂的毒气，需要【防毒面具】才能进入。' };
    }

    if (loc.id === 'police') {
      if (!state.items.radio) {
        return { ok: false, reason: '还没收到军方情报，先把收音机修好。' };
      }
      if (wornBy(state, ids, 'weapon')) return { ok: true };
      if (state.items.weapon && !ids) return { ok: true };
      if (state.items.weapon) {
        return { ok: false, reason: '武器还在库存里，出发前先给一个人拿上。' };
      }
      return { ok: false, reason: '警局有暴徒，赤手空拳去等于送死，需要【武器】。' };
    }

    return { ok: true };
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
    return s && s.charId === 'tie' ? 2 : C.meal.foodCost;
  };

  SF.waterRation = function (state) {
    return C.meal.waterCost;
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

      state.supplies.food = Math.max(0, Math.round((state.supplies.food || 0) - need));
      state.todayFood = Math.max(0, Math.round((state.todayFood || 0) + need));
      m.eat = true;
      s.hunger = clamp(s.hunger - C.meal.restore, 0, C.maxStat);

      SF.addLog(state, flavor(s.hunger > 60 ? 'eatHard' : 'eat', s));
      return { ok: true, msg: s.name + ' 吃了一份食物，饥饿 −' + C.meal.restore + '。' };
    }

    if (kind === 'water') {
      if (m.drink) return { ok: false, msg: s.name + ' 今天已经喝过了。' };

      var ration = SF.waterRation(state);
      if ((state.supplies.water || 0) < ration) {
        return { ok: false, msg: '水不够了。' };
      }

      state.supplies.water = Math.max(0, Math.round((state.supplies.water || 0) - ration));
      state.todayWater = Math.max(0, Math.round((state.todayWater || 0) + ration));
      m.drink = true;
      s.thirst = clamp(s.thirst - C.meal.restore, 0, C.maxStat);

      SF.addLog(state, flavor('drink', s));
      return { ok: true, msg: s.name + ' 喝了一份水，口渴 −' + C.meal.restore + '。' };
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
      state.supplies[key] = Math.max(0, Math.round((state.supplies[key] || 0) + haul[key]));
      result.loot.push({ key: key, name: SF.SUPPLIES[i].name, qty: haul[key] });
    }
  }

  // ---------- 组队探索 ----------

  SF.explore = function (state, locId, partyIds, depth) {
    var loc = SF.findLocation(locId);
    var party = [];
    var i;

    depth = depth || 1;

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

    if (loc.unlockDay && state.day < loc.unlockDay) {
      result.lines.push('这个地方现在还不知道怎么走。');
      return result;
    }

    for (i = 0; i < party.length; i++) result.partyNames.push(party[i].name);

    // 记下这次去哪儿、谁去的，夜里的事件要用来判断失踪
    state.lastExpedition = { locId: loc.id, name: loc.name, risk: loc.riskLevel, ids: [] };
    for (i = 0; i < party.length; i++) state.lastExpedition.ids.push(party[i].id);

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
    var junkOnly = false;
    result.junkOnly = false;

    // 队伍里有谁：职业规则要用
    var hasTie = false;
    var hasNana = false;
    var hasChen = false;
    var hasLin = false;
    var hasWeapon = false;
    var hasTorch = false;
    var hasMask = false;

    for (i = 0; i < party.length; i++) {
      if (party[i].charId === 'tie') hasTie = true;
      if (party[i].charId === 'nana') hasNana = true;
      if (party[i].charId === 'chen') hasChen = true;
      if (party[i].charId === 'lin') hasLin = true;
      if (party[i].hasWeapon) hasWeapon = true;
      if (party[i].hasTorch) hasTorch = true;
      if (party[i].hasMask) hasMask = true;
    }

    var locId = loc.id;

    if (depth <= 1) {
      // 第一阶段：只有废料，绝对安全
      if (Math.random() < 0.35) {
        result.lines.push(flavor('empty'));
      }
      giveHaul(haul, 'material', rnd(1, 3));
      result.lines.push('你们只在外围转了一圈，翻到一些废料，没人受伤。');
      result.safe = true;
    } else if (depth === 2) {
      // 第二阶段：基础物资，小概率受伤
      if (locId === 'market') {
        giveHaul(haul, 'food', rnd(2, 3));
        if (roll(0.2)) giveHaul(haul, 'medicine', 1);
        result.lines.push('货架上还剩几罐没过期的，你们抱了几罐出来。');
      } else if (locId === 'warehouse') {
        giveHaul(haul, 'material', rnd(2, 4));
        if (roll(0.45)) {
          state.items.gasMask = true;
          result.item = { key: 'mask', name: '防毒面具' };
          result.lines.push('仓库深处的箱子里压着一副防毒面具，镜片还没裂。');
        } else if (roll(0.3)) {
          state.items.flashlight = true;
          result.lines.push('木箱底下压着一只手电筒，还能亮。');
        }
        result.lines.push('仓库外圈全是木料和铁皮，能搬的都搬了。');
      } else if (locId === 'pharmacy') {
        var med = hasLin ? 2 : (roll(0.6) ? 1 : 0);
        if (med) giveHaul(haul, 'medicine', med);
        result.lines.push(med
          ? (hasLin ? '林晓看懂了说明书，挑出两份还能用的药。' : '你们在柜台里翻出一份药。')
          : '药柜被人翻得精光，你们什么都没找到。');
      } else if (locId === 'police') {
        giveHaul(haul, 'material', rnd(1, 2));
        result.lines.push('警局外圈只剩下散落的装备和弹药箱。');
      } else {
        giveHaul(haul, pickOne(['food', 'water']), rnd(1, 2));
        if (roll(0.25)) {
          state.items.flashlight = true;
          result.lines.push('在一堆废纸箱里翻到一只手电筒，擦擦还能用。');
        }
        result.lines.push('你们沿着熟悉的路又摸了一段，带回一点补给。');
      }
    } else {
      // 第三阶段：稀有货，风险极高
      if (locId === 'police') {
        if (hasTie || hasWeapon) {
          state.items.flare = true;
          result.item = { key: 'medicine', name: '信号弹' };
          giveHaul(haul, 'material', rnd(1, 3));

          if (hasWeapon) {
            state.items.weapon = true;
            result.lines.push('你们端着枪一路推平了警局的走廊，信号弹和一把手枪都到手了。');
          } else {
            result.lines.push('铁柱撞开最后一道门，你们在枪柜里拿到了信号弹。');
          }
        } else {
          result.lines.push('里面全是暴徒，没有能打的人，你们被追着打了出来，什么都没拿到。');
        }
      } else if (locId === 'warehouse') {
        giveHaul(haul, 'material', hasTorch ? 4 : rnd(2, 4));
        if (roll(0.5)) {
          state.items.flashlight = true;
          result.lines.push('在最里面翻到一只手电筒。');
        }
        result.lines.push(hasTorch
          ? '手电照着最深处的货架，你们把能带的都搬了。'
          : '里面黑得伸手不见五指，你们只能胡乱抓了几把。');
      } else if (locId === 'pharmacy') {
        var medDeep = hasLin ? 3 : (roll(0.4) ? 1 : 0);
        if (medDeep) giveHaul(haul, 'medicine', medDeep);
        result.lines.push(medDeep
          ? '林晓摸进药房最里面，抱出几盒高级药品。'
          : '越往里越黑，你们什么都没摸到就退了出来。');
      } else {
        giveHaul(haul, 'food', rnd(1, 2));
        giveHaul(haul, 'water', 1);
        if (roll(0.25)) {
          state.items.weapon = true;
          result.lines.push('角落靠着一根防暴棍，你们把它也带上了。');
        }
        result.lines.push('你们摸到了最里面，带回一些吃的和水。');
      }
    }

    // 掠夺者
    if (!junkOnly && roll(T.raiderChance + (party.length - 1) * 0.03)) {
      if (hasNana) {
        // 娜娜：100% 免伤，70% 概率反抢，全员心情 +10
        for (i = 0; i < alive.length; i++) {
          alive[i].mood = clamp(alive[i].mood + 10, 0, C.maxStat);
        }
        if (roll(0.7)) {
          giveHaul(haul, roll(0.5) ? 'food' : 'water', 1);
          result.lines.push(flavor('nana') + ' 全员心情 +10。');
        } else {
          result.lines.push(flavor('nana') + ' 全员心情 +10。');
        }
      } else {
        haul.food = Math.floor((haul.food || 0) / 2);
        haul.water = Math.floor((haul.water || 0) / 2);
        result.lines.push('路上被人堵住，抢走了一部分东西。');

        // 强盗动手：回来的这个人直接掉 30 血
        var robbed = pickOne(party);
        robbed.hp = clamp(robbed.hp - C.explore.injuryHp, 0, C.maxStat);
        robbed.injured = true;
        result.injured.push({ name: robbed.name, hp: C.explore.injuryHp });
        result.lines.push(robbed.name + ' 想护住背包，被他们打了一顿，血量 −' +
          C.explore.injuryHp + '。');

        if (robbed.hp <= 0) {
          robbed.alive = false;
          result.died = true;
          SF.addLog(state, robbed.name + ' 被打得太重，没能撑回避难所。');
        }
      }
    }

    // ===== 职业被动：严格按设定执行 =====
    if (hasChen) {
      // 陈默：50% 带回 1 个电子零件（该地点有稀有道具时概率翻倍）
      var chenChance = (loc.id === 'police' || loc.id === 'warehouse' || loc.id === 'pharmacy') ? 1 : 0.5;
      if (roll(chenChance)) {
        giveHaul(haul, 'medicine', 1);
        result.lines.push('陈默撬开一台电子锁，摸出一份能用的零件和药。');
      } else {
        result.lines.push('陈默摆弄了半天电子锁，这次没打开。');
      }

      // 但他不擅长搬运：食物和水的携带量固定为 1
      if ((haul.food || 0) > 1) haul.food = 1;
      if ((haul.water || 0) > 1) haul.water = 1;
    }

    if (hasLin) {
      // 林晓：必定额外 +1 药品
      giveHaul(haul, 'medicine', 1);
      result.lines.push('林晓认出了草药和化学试剂，多带回一份药品。');
    }

    if (hasTie) {
      // 铁柱：食物和材料额外 +2
      if (haul.food) giveHaul(haul, 'food', 2);
      if (haul.material) giveHaul(haul, 'material', 2);
      if (!haul.food && !haul.material) giveHaul(haul, 'material', 2);
      result.lines.push(flavor('winTie'));
    }

    // 组队加成：2 人 1.5 倍，3 人 2 倍
    var partyBoost = 1 + 0.5 * (party.length - 1);
    for (var bk in haul) {
      if (!haul.hasOwnProperty(bk)) continue;
      haul[bk] = Math.max(1, Math.round(haul[bk] * partyBoost));
    }
    if (party.length >= 2 && !haul.water) giveHaul(haul, 'water', 1);
    if (party.length >= 3 && !haul.food) giveHaul(haul, 'food', 1);

    // 危险事件：第一阶段绝对安全，第二阶段小概率，第三阶段极易重伤
    var riskChance = depth <= 1 ? 0 : (depth === 2 ? 0.12 : 0.45);

    if (loc.id === 'police' && depth >= 3 && !hasTie && !hasWeapon) {
      riskChance = 0.95;
    }
    if (loc.id === 'police' && hasWeapon) {
      riskChance = 0;
    }
    if (hasWeapon) riskChance = riskChance * 0.5;

    // 娜娜在队里：流浪狗这类危险事件也不会受伤
    if (hasNana) riskChance = 0;

    if (loc.far && depth === 2) riskChance += 0.06;

    if (roll(riskChance)) {
      var victim = pickOne(party);
      var protector = null;
      for (i = 0; i < party.length; i++) {
        if (party[i].id !== victim.id) {
          protector = party[i];
          break;
        }
      }

      var hurtHp = depth >= 3 ? 40 : C.explore.injuryHp;
      victim.hp = clamp(victim.hp - hurtHp, 0, C.maxStat);
      victim.injured = true;
      victim.mood = clamp(victim.mood - 6, 0, C.maxStat);
      result.injured.push({ name: victim.name, hp: hurtHp });

      if (victim.hp <= 0) {
        victim.alive = false;
        result.died = true;
        SF.addLog(state, victim.name + ' 伤得太重，没能撑回避难所。');
      }

      if (protector) {
        result.lines.push(flavor('hurt', victim) + ' 是为了护住 ' + protector.name + '。');
      } else {
        result.lines.push(flavor('hurt', victim));
      }
    }

    // 危险事件结束后，记一条气泡给 UI 用
    result.bubble = null;
    if (result.item) {
      result.bubble = { charId: party[0].charId, text: '拿到 ' + result.item.name + ' 了！' };
    } else if (result.injured.length) {
      result.bubble = { charId: party[0].charId, text: '嘶……挂彩了' };
    } else if (haul.food) {
      result.bubble = { charId: party[0].charId, text: '找到吃的了。' };
    }

    // 幸运事件（只给 1 份）
    if (roll(0.1)) {
      var lucky = pickOne(['medicine', 'food', 'water']);
      giveHaul(haul, lucky, 1);
      result.lines.push('在' + loc.name + '的角落发现了另一个幸存者留下的半袋东西。');
    }

    // 人际事件（需要玩家选择）
    if (!junkOnly && roll(0.16)) {
      result.choice = {
        id: 'stranger',
        title: '路边的求救声',
        text: '回来的路上，你们遇到一个抱着孩子的女人，她抓住' + leadName +
          '的袖子不肯松手，说只求一口吃的。',
        options: [
          { key: 'give', label: '给她 1 份食物', disabled: (state.supplies.food || 0) < 1 },
          { key: 'refuse', label: '狠心拒绝' }
        ]
      };
    }

    // 主线物品只在第 2 层以后才可能出现
    if (loc.id === 'police' && depth >= 2 && !state.items.flare &&
        roll(depth >= 3 ? 0.6 : 0.25)) {
      state.items.flare = true;
      result.item = { key: 'medicine', name: '信号弹' };
      result.lines.push('你们在枪柜底下摸到两发信号弹，小心地收进背包。');
    }

    // 破收音机只在城郊仓库出；带陈默就直接修好
    if (loc.id === 'warehouse' && depth >= 2 &&
        !state.items.radio && !state.items.radioBroken && roll(0.45)) {
      if (hasChen) {
        state.items.radio = true;
        result.lines.push('陈默在仓库里翻出一台收音机，当场拧了两下线圈，修好了。');
      } else {
        state.items.radioBroken = true;
        result.lines.push('临走时在杂物间翻出一台破损的收音机，也许还能修。');
      }
    }

    // 食物、水、药品死死压住，材料稍微宽松一点
    if ((haul.food || 0) > 3) haul.food = 3;
    if ((haul.water || 0) > 3) haul.water = 3;
    if ((haul.medicine || 0) > 1) haul.medicine = 1;
    if ((haul.material || 0) > 4) haul.material = 4;

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
      if (key === 'give' && (state.supplies.food || 0) >= 1) {
        state.supplies.food = Math.max(0, Math.round(state.supplies.food - 1));
        for (i = 0; i < state.survivors.length; i++) {
          if (state.survivors[i].alive) {
            state.survivors[i].mood = clamp(state.survivors[i].mood + 10, 0, C.maxStat);
          }
        }
        result.lines.push('你们给了她一份食物。她没有道谢，只是抱着孩子快步走远。全员心情 +10。');
      } else {
        for (i = 0; i < state.survivors.length; i++) {
          if (state.survivors[i].alive) {
            state.survivors[i].mood = clamp(state.survivors[i].mood - 15, 0, C.maxStat);
          }
        }
        result.lines.push('你们没有回头。回去的路上谁都没说话，全员心情 −15。');
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
    } else if (result.choice.id === 'cards') {      if (key === 'takeCards') {
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

  // 主界面：拿着药品点人，治病并回血
  SF.useMedicineOn = function (state, id) {
    var s = SF.find(state, id);
    if (!s || !s.alive) return { ok: false, msg: '' };
    if ((state.supplies.medicine || 0) < 1) {
      return { ok: false, msg: '没有药品了。' };
    }
    if (!s.sick && s.hp >= C.maxStat) {
      return { ok: false, msg: s.name + ' 没病，血也是满的，别浪费药。' };
    }

    state.supplies.medicine = Math.max(0, Math.round((state.supplies.medicine || 0) - 1));
    s.sick = false;
    s.hp = clamp(s.hp + C.night.medicineHeal, 0, C.maxStat);

    SF.addLog(state, '给 ' + s.name + ' 用了药，病好了，血也回了 ' + C.night.medicineHeal + '。');
    return { ok: true, msg: s.name + ' 吃了药，病好了，血量 +' + C.night.medicineHeal + '。' };
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
      events: [],
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

      // 结算只认“白天手动喂过的”，绝不在这里再扣一次库存
      if (plan.eat[a1.id]) {
        report.foodUsed += need;
        fed = true;
      }

      if (plan.drink[a1.id]) {
        report.waterUsed = Math.round(report.waterUsed + waterRation);
        drank = true;
      }

      rowData[a1.id] = { fed: fed, drank: drank };
    }

    // 用量就是白天手动喂掉的
    report.foodUsed = Math.round(state.todayFood || 0);
    report.waterUsed = Math.round(state.todayWater || 0);

    report.foodNeed = Math.round(report.foodNeed);
    report.waterNeed = Math.round(report.waterNeed);

    for (i = 0; i < alive.length; i++) {
      var s = alive[i];
      var isFed = rowData[s.id].fed;
      var isDrank = rowData[s.id].drank;
      var before = { hp: s.hp, hunger: s.hunger, thirst: s.thirst, mood: s.mood };

      // ② 没吃 / 没水：饥饿、水分各涨 35（涨满 100 就是死）
      var missing = 0;
      if (!isFed) {
        s.hunger = clamp(s.hunger + N.missLoss, 0, C.maxStat);
        missing += 1;
      }
      if (!isDrank) {
        s.thirst = clamp(s.thirst + N.missLoss, 0, C.maxStat);
        missing += 1;
      }
      if (missing) report.shortage = true;

      s.hungryDays = isFed ? 0 : (s.hungryDays || 0) + 1;
      s.thirstDays = isDrank ? 0 : (s.thirstDays || 0) + 1;

      var dmg = 0;
      var moodDelta = 0;

      // 饿或渴到 70 以上：心情每天额外 −20
      if (s.hunger > N.painAt || s.thirst > N.painAt) {
        moodDelta -= N.painMood;
      }

      // 连着两天没喝到水：50% 概率生病
      if (s.thirstDays >= N.sickThirstDays && s.thirst > N.painAt) {
        if (roll(N.sickChance)) s.sick = true;
      }

      // 生病：每晚额外掉 20 血；队里有林晓就减半
      if (s.sick) {
        dmg += Math.round(N.sickDamage * (SF.charAlive(state, 'lin') ? 0.5 : 1));
        moodDelta += N.moodSick;
      }

      // 饥饿或口渴满 100：直接倒下
      if (s.hunger >= C.maxStat || s.thirst >= C.maxStat) {
        dmg += 1000;
      }

      var heal = 0;
      if (isFed && isDrank && !s.sick &&
          s.hunger < N.recoverBelow && s.thirst < N.recoverBelow) {
        heal = N.recoverHp;
      }

      moodDelta += (isFed ? N.moodFed : N.moodHungry) + (isDrank ? N.moodDrank : N.moodThirsty);
      if (state.bedLevel) moodDelta += 6;

      // ③ 数值只做钳制，绝不直接清零；活着就进入第二天
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
        state.supplies.food = Math.max(0, Math.round(state.supplies.food - 1));
        taken = '食物';
      } else if ((state.supplies.water || 0) >= 1) {
        state.supplies.water = Math.max(0, Math.round((state.supplies.water || 0) - 1));
        taken = '水';
      } else if ((state.supplies.material || 0) >= 1) {
        state.supplies.material -= 1;
        taken = '材料';
      }

      SF.addLog(state, madOne.name + ' 半夜发起疯来' + (taken ? '，抢走了 1 份' + taken : '，在墙角撞了一夜'));
    }

    // 夜里的事件：每天 1~2 个，全部针对具体的人
    try {
      report.events = SF.makeNightEvents ? SF.makeNightEvents(state, report) : [];
    } catch (e) {
      report.events = [];
    }

    report.event = null;
    return report;
  };

  /* 夜里的事件池：每天 1~2 个，全部针对具体的人 */
  SF.makeNightEvents = function (state, report) {
    var list = [];
    var alive = SF.aliveAll(state);
    if (!alive.length) return list;

    var i;
    var madCand = null;
    for (i = 0; i < alive.length; i++) {
      if (!alive[i].mad && alive[i].mood < 20) {
        madCand = alive[i];
        break;
      }
    }

    var pool = ['sick', 'scare', 'shelter', 'cold'];
    if (madCand) pool.push('mad', 'mad');
    if (alive.length >= 2) pool.push('fight');

    var used = {};
    var count = rnd(1, 2);

    for (var n = 0; n < count && pool.length; n++) {
      var kind = pickOne(pool);
      if (used[kind]) {
        n -= 1;
        if (n < -5) break;
        continue;
      }
      used[kind] = true;

      if (kind === 'mad') {
        var who = madCand || pickOne(alive);
        var stolen = '';
        if ((state.supplies.food || 0) >= 1) {
          state.supplies.food = Math.max(0, Math.round(state.supplies.food - 1));
          stolen = '砸坏了 1 个罐头';
        } else if ((state.supplies.water || 0) >= 1) {
          state.supplies.water = Math.max(0, Math.round((state.supplies.water || 0) - 1));
          stolen = '砸碎了一瓶水';
        } else {
          stolen = '在墙角撞了一夜，什么也没砸到';
        }

        who.mad = true;
        who.mood = clamp(who.mood + 10, 0, C.maxStat);
        for (i = 0; i < alive.length; i++) {
          if (alive[i].id !== who.id) {
            alive[i].mood = clamp(alive[i].mood - 10, 0, C.maxStat);
          }
        }
        list.push({
          id: 'mad',
          char: who.name,
          text: flavor('mad', who) + '（砸了 1 份物资，他心情 +10，其他人心情 −10。）'
        });
      } else if (kind === 'sick') {
        var sickOne = pickOne(alive);
        sickOne.sick = true;
        list.push({
          id: 'sick',
          char: sickOne.name,
          text: flavor('sick', sickOne) + '（不吃药的话，夜里还会掉 20 点血。）'
        });
      } else if (kind === 'fight') {
        var a = pickOne(alive);
        var b = pickOne(alive);
        if (a.id === b.id) {
          b = alive[(alive.indexOf(a) + 1) % alive.length];
        }

        a.hp = clamp(a.hp - 20, 0, C.maxStat);
        b.hp = clamp(b.hp - 20, 0, C.maxStat);
        for (i = 0; i < alive.length; i++) {
          alive[i].mood = clamp(alive[i].mood - 10, 0, C.maxStat);
        }
        list.push({
          id: 'fight',
          text: a.name + ' 指责 ' + b.name + ' 吃得太多，两人大打出手。' +
            '两个人都挂了彩（血量 −20），所有人心情 −10。'
        });
      } else if (kind === 'scare') {
        for (i = 0; i < alive.length; i++) {
          alive[i].mood = clamp(alive[i].mood - 5, 0, C.maxStat);
        }
        list.push({
          id: 'scare',
          text: '一只变异老鼠窜过脚边，把所有人吓得一夜没敢合眼。全员心情 −5。'
        });
      } else if (kind === 'shelter') {
        state.supplies.medicine = Math.max(0, Math.round((state.supplies.medicine || 0) + 1));
        list.push({
          id: 'shelter',
          text: '门外传来一阵枪声。早上你们在门口发现一个沾血的医疗包，药品 +1。'
        });
      } else if (kind === 'cold') {
        if ((state.supplies.material || 0) >= 2) {
          state.supplies.material = Math.max(0, Math.round(state.supplies.material - 2));
          list.push({
            id: 'cold',
            text: '半夜气温骤降，你们烧了两块木板，四个人挤在一起熬到天亮。'
          });
        } else {
          for (i = 0; i < alive.length; i++) {
            alive[i].hp = clamp(alive[i].hp - 10, 0, C.maxStat);
          }
          list.push({
            id: 'cold',
            text: '半夜气温骤降，没有木柴生火，四个人冻得直发抖。全员血量 −10。'
          });
        }
      }
    }

    for (i = 0; i < list.length; i++) SF.addLog(state, list[i].text);

    if (report.shortage) {
      var hungryLine = flavor('hungry');
      list.unshift({ id: 'hungry', text: hungryLine });
      SF.addLog(state, hungerLine);
    }

    if (!list.length) {
      var calm = flavor('calm');
      list.push({ id: 'calm', text: calm });
      SF.addLog(state, calm);
    }

    return list;
  };

  /* 出发前给一句职业/装备评估 */
  SF.verdictFor = function (state, loc, s) {
    if (!loc || !s) return { text: '', good: true };

    if (loc.id === 'police') {
      if (s.charId === 'tie' || s.hasWeapon) {
        return { text: '适合此地，能打', good: true };
      }
      return { text: '没有战斗力，极度危险', good: false };
    }

    if (loc.id === 'pharmacy') {
      if (s.charId === 'lin') return { text: '看得懂说明书，药品翻倍', good: true };
      if (s.hasMask) return { text: '有面具，不容易染病', good: true };
      return { text: '不太懂药，收益很低', good: false };
    }

    if (loc.id === 'warehouse') {
      if (s.hasTorch) return { text: '有手电，能搜满物资', good: true };
      if (s.charId === 'tie') return { text: '身强体壮，适合搬货', good: true };
      return { text: '里面太黑，容易出事', good: false };
    }

    if (s.mood < 20) return { text: '精神快撑不住了', good: false };
    if (s.hp < 20) return { text: '伤得太重，走不远', good: false };

    return { text: '状态还可以', good: true };
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
        state.supplies.water = Math.max(0, Math.round((state.supplies.water || 0) - 1));
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

    // 第 20 天结束：有信号弹就等来直升机，没有就到此为止
    if (state.day > 20 && !state.over) {
      state.over = true;
      state.overAtDay = 20;
      state.won = !!state.items.flare;
    }

    return report;
  };

  // 线性主线的节点文本（每天只在第一次进入时弹）
  SF.storyFor = function (state) {
    var d = state.day;

    if (d === 1) {
      return {
        title: '军方广播',
        text: '城市已封锁，幸存者请寻找掩体。不要上街，不要开灯。'
      };
    }

    if (d === 4) {
      return {
        title: '城郊仓库',
        text: '你们摸清了城郊仓库的位置。里面有维修零件、武器，也许还有收音机。'
      };
    }

    if (d === 7) {
      return {
        title: '废弃医院',
        text: '有人在广播里提到城南的废弃医院还有存货。带上林晓，她看得懂说明书。'
      };
    }

    if (d === 10) {
      return {
        title: '军方的最后一句话',
        text: '警方频道传来军方广播：救援直升机进入最后十天倒计时，' +
          '未持有信号弹者将被抛弃。废弃警局里也许还有信号弹——带上有战斗力的人。'
      };
    }

    if (d === 6) {
      return {
        title: '断断续续的求援信号',
        text: '你们把收音机修好了。里面传来断断续续的求援信号：' +
          '“救援直升机将在 15 天后抵达……请准备信号弹。”\n' +
          '去废弃警局搜寻信号弹吧，但那里据说有暴徒出没。'
      };
    }

    if (d === 11 && !state.items.flare) {
      return {
        title: '改航线的传闻',
        text: '广播说救援直升机好像改航线了。如果我们没有信号弹，' +
          '就算直升机来了也看不到我们。'
      };
    }

    if (d === 16) {
      return {
        title: '最后五天',
        text: '还有五天。要么拿着信号弹站到天台上，要么就在这间屋子里等死。'
      };
    }

    return null;
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
      state.supplies.water = Math.max(0, Math.round((state.supplies.water || 0) - 1));
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
      state.supplies.water = Math.max(0, Math.round((state.supplies.water || 0) - 1));
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
      var stole = removeOne(state, 'food');
      target.mood = SF.clamp(target.mood - 8, 0, C.maxStat);
      allMood(state, -3);
      lines.push(stole
        ? target.name + ' 半夜饿得受不了，偷偷吃了一份食物，心情大跌，所有人都没吃好。'
        : target.name + ' 饿得在墙角砸了一通，什么也没找到，所有人都被吵得心情不好。');
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
        state.supplies.water = Math.max(0, Math.round((state.supplies.water || 0) - 1));
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

  // 暴露出去，给主结算函数调用
  SF.makePersonalEvent = makePersonalEvent;
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

  // 能不能出门：只看行动点和血量，饿/渴/心情差不影响
  SF.canExplore = function (state) {
    var alive = SF.aliveAll(state);
    for (var i = 0; i < alive.length; i++) {
      var s = alive[i];
      if (s.ap > 0 && !s.mad && s.hp >= 20) return s;
    }
    return null;
  };

  SF.bath = function (state, id) {
    var s = SF.find(state, id);
    if (!s || !s.alive) return { ok: false, text: '没有这个人。' };
    if (s.ap < 1) return { ok: false, text: s.name + ' 今天已经动过了。' };
    if ((state.supplies.water || 0) < 1) return { ok: false, text: '物资不足：没有多余的水。' };

    state.supplies.water = Math.max(0, Math.round((state.supplies.water || 0) - 1));
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
