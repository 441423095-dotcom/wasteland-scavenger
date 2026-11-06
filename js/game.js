/*
 * 游戏逻辑：纯数据计算，不碰 DOM。
 * 一天 = 白天组队探索 + 晚上分配食物（可能触发夜间事件）。
 */
window.SF = window.SF || {};

SF.SUPPLIES = [
  { key: 'food', name: '食物' },
  { key: 'water', name: '水' },
  { key: 'medicine', name: '止疼药' },
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
      '半夜，不知道谁的肚子叫得震天响。铁柱翻了个身，咽口水的声音在黑暗里特别清晰。',
      '今天没人分到吃的。林晓把最后一点饼干渣倒进掌心，又分了一半给别人。',
      '陈默说他不饿，然后悄悄把腰带又收紧了一格。',
      '娜娜盯着天花板数羊，数到第三只就开始念烧烤菜单。'
    ],
    fed: [
      '今天总算人人都吃上了东西，铁柱打了一个响亮的饱嗝。',
      '晚饭难得安静，只有咀嚼声。陈默说，这声音比收音机好听。'
    ],
    thirsty: [
      '水瓶被传了一圈，每人只抿了一口。林晓把瓶子倒过来晃了晃，一滴也没剩。',
      '谁也没提渴这个字。可每个人都在默默舔自己干裂的嘴唇。'
    ],
    sick: [
      '林晓的咳嗽声越来越重，她把自己裹在被子里发抖，陈默叹了口气，把破大衣盖在了她身上。',
      '{n}半夜咳得停不下来，谁都没睡好，早上谁也没提。',
      '{n}缩在角落里发抖，额头上全是汗，嘴唇没有一点血色。',
      '{n}把药盒拆开又合上，反复看了半天说明书，最后还是放了回去。'
    ],
    hurt: [
      '陈默踩中了废弃工厂里的捕兽夹，惨叫声回荡在空荡荡的走廊里。你们费了好大劲才把他的脚拔出来。',
      '保安亭里的暴徒根本没给你们说话的机会。铁柱替林晓挡了一钢管，鲜血顺着额头流下来，你们只能拖着半箱物资仓皇逃窜。',
      '{n}咬着牙用破布自己包扎，血把布条一层层浸透。',
      '{n}的伤口又裂开了，他一声没吭，只是把袖子拉下来盖住。'
    ],
    mad: [
      '娜娜突然坐起来，死死盯着大门的方向。“如果有丧尸进来，我先咬死你们。”她半开玩笑地说，但没人笑得出来。',
      '{n}抱着头蹲在墙角，把同一句话念了一整夜。',
      '铁柱开始跟墙上的裂缝说话，他说那边比这边安静。'
    ],
    calm: [
      '今晚出奇地安静，连远处的枪声都停了。四个人躺在地上，谁也没敢真睡。',
      '难得的安静。铁柱靠着墙打呼噜，陈默盯着天花板发呆，林晓在数还剩几瓶水。',
      '风从门缝钻进来，把墙上的日历吹得哗啦响——那上面还停在封城那天。',
      '楼上传来拖椅子的声音。你们互相看了一眼，谁也没问那是谁。'
    ],
    empty: [
      '除了满地的玻璃碴子和几只变异蟑螂，什么都没找到。林晓看着空荡荡的背包，深深叹了口气。',
      '翻了半天，只翻出一张过期十年的彩票。陈默把它折好塞进口袋，说留着做个纪念。',
      '货架上只剩半包受潮的纸巾和一本《装修指南》，你们还是把书带回去了——万一要堵窗户呢。'
    ],
    trip: [
      '回程的时候，铁柱一路在骂那扇锈死的铁门。',
      '路上遇到一只流浪猫，娜娜蹲下来跟它讲了十分钟道理，最后猫叼走了半根火腿肠。',
      '你们在楼道里遇到一张被钉在墙上的通知：“请各位住户不要再往楼下扔丧尸。”',
      '林晓回来的第一件事，是把背包里的东西按大小重新码了一遍。'
    ],
    leak: [
      '楼上不知道哪家的水管爆了，脏水滴在你们的桌子上。今晚谁也别想睡好。',
      '天花板又渗水了，滴滴答答敲了一整夜，像是有人在门外数秒。',
      '墙角开始发霉，陈默用胶带贴了三次，第四次干脆放弃了。'
    ],
    fear: [
      '娜娜半夜突然坐起来，死死盯着大门的方向。“如果有丧尸进来，我先咬死你们。”她半开玩笑地说，但没人笑得出来。',
      '陈默把椅子挪到门边，说今晚他值夜。没人拆穿他其实也怕得手抖。',
      '有人在小声念叨以前的事：火锅、地铁、吵死人的广场舞。念着念着就没人出声了。'
    ],
    winTie: [
      '铁柱像推土机一样撞开了便利店生锈的卷帘门，把能搬的东西全塞进了包里。林晓在后面气喘吁吁地喊：“慢点，那群野狗又要追来了！”',
      '你们在便利店后门的角落发现了一辆废弃的购物车。铁柱二话不说扛起车就走，你们甚至觉得他比这车还能装。'
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

  // 每个地方进到深处时的一句环境描写，让探险不只是数字
  var AMBIENCE = {
    store: [
      '卷帘门在身后哗啦一声落下来，店里暗得只剩冰柜的嗡嗡声。',
      '收银台后面堆着被踩烂的购物筐，价签还挂着，价格已经没有意义了。',
      '地上有一串干掉的血脚印，一直通到后门，又折了回来。'
    ],
    green: [
      '绿化带的喷头还在滴水，草长得比人腰还高，风一吹全是窸窣声。',
      '长椅上留着半盒没吃完的饼干，旁边是主人再没回来的外套。',
      '灌木丛里有东西被惊动了，窸窣一声，又安静下去。'
    ],
    clinic: [
      '候诊椅倒了一排，叫号屏还亮着最后一个名字。',
      '消毒水的味道盖不住别的味道，走廊尽头的门半掩着。',
      '药柜的玻璃碎了一地，地上散着写了一半的病历。'
    ],
    garage: [
      '车库的灯早就灭了，手电光扫过去，一排排车像停着的棺材。',
      '通风管里传来金属敲击声，一下，又一下，不急不慢。',
      '地上积着一层薄灰，你们的脚印是这几年里第一批。'
    ],
    guard: [
      '保安亭后面的铁门虚掩着，门缝里有风穿过，像有人在叹气。',
      '墙上的值班表还停在三个月前，最后一栏没填完。',
      '地上有几发打空的弹壳，还有一摊没擦干净的深色印子。'
    ],
    vault: [
      '暗门后面是间被封死的小储藏间，铁架上还压着没拆封的箱子。',
      '墙上有用炭笔写的字，只认得出“别开灯”三个字。'
    ]
  };

  function charCard(charId) {
    var list = (SF.CONFIG && SF.CONFIG.characters) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === charId) return list[i];
    }
    return null;
  }

  // 队里某个人说一句话（haul = 有收获，empty = 空手，hurt = 有人受伤）
  SF.raidTalk = function (state, ids, kind) {
    var picks = [];
    var i;

    for (i = 0; i < (ids || []).length; i++) {
      var p = SF.find(state, ids[i]);
      if (!p) continue;

      var c = charCard(p.charId);
      if (!c) continue;

      var pool = (c.lines && c.lines[kind]) || (c.lines && c.lines.haul) || null;
      if (!pool && c.quote) pool = [c.quote];
      if (!pool || !pool.length) continue;

      picks.push({ name: p.name, pool: pool });
    }

    if (!picks.length) return '';

    var who = pickOne(picks);
    return who.name + '：“' + pickOne(who.pool) + '”';
  };

  // 谁的设定卡上写着什么口头禅，用在“先搜哪儿”这种要拿主意的地方
  SF.quoteOf = function (state, id) {
    var p = SF.find(state, id);
    if (!p) return '';

    var c = charCard(p.charId);
    if (!c || !c.quote) return '';

    return p.name + '：“' + c.quote + '”';
  };

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
      hasPack: false,
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
      searchedToday: {},     // 今天哪个地点已经去过了：同一个地点一天只能去一次
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
        weapon: false,
        backpack: false
      },
      rescueLeft: 0,
      rescueDay: 0,          // 救援日：修好收音机后随机抽出来；0 = 还不知道
      rescueKnown: false,
      lastEvent: '',
      logs: [],
      vaultUnlocked: false,
      morningNews: '',
      defense: 0,
      // 用木板做的改造：床 / 接雨水 / 加固门
      upgrades: { bed: false, barrel: false, door: false },
      // 家里还能翻的角落：翻完就没了
      storageLeft: 3,
      // 三天前答应过别人的事，到日子会回来找你
      delayed: [],
      doorBroken: false,     // 铁柱梦游砸坏了门：当晚挡不住丧尸
      bathedToday: false,    // 今天有没有人洗过澡
      dirtyDays: 0,          // 连续几天没人洗澡
      actionUsed: false,
      survivors: survivors,
      exploredToday: false,
      over: false,
      won: false,
      storySeenDay: 0,
      overDay: 0,
      condition: 'calm',     // 今天的状况：沙尘暴 / 暴雨 / 停电 / 尸潮 / 黑市
      conditionDay: 1,
      tripTotals: {},        // 这一趟已经背了多少件
      tripSpecialBase: [],   // 出发时已有的特殊道具（不占这一趟的格子）
      tripCap: 0,            // 这一趟小队的总负重
      tripMembers: [],       // 这一趟出门的人
      dayNotes: [],          // 每天一篇的日记（总结）
      graves: [],            // 已经不在了的人：{ name, day, cause }
      dayLog: [],            // 今天发生过的原话（用来写日记）
      todayRecap: null,      // 今天出去过哪儿、带回了什么
      questToday: [],        // 今天拿到的主线道具
      hintDay: 0,            // 今天有没有提示过主线
      seenClinic: false,     // 去过医务室：保安亭的情报来源
      seenGarage: false,     // 下过车库：后面的主线才有意义
      seenStore: false,      // 去过楼下便利店：主线的第一步
      pity: {},              // 关键道具“越找越近”的计数
      storyDone: {},         // 已经讲过的剧情节点
      endingKind: '',        // 结局类型：perfect / scarred / nobody / day30
      dayEventId: '',        // 今天门口是谁（一天只抽一次）
      dayEventIdDay: 0,      // 这个事件是哪一天抽的
      dayEventDone: 0,       // 这一天的事件已经处理过了
      lootBonus: 1           // 今天搜刮数量的倍数（情报贩子给的）
    };
  };

  // 死了的人记一笔（日志里留个名单）
  SF.recordGrave = function (state, name, cause) {
    if (!state || !name) return;
    if (!state.graves) state.graves = [];

    for (var i = 0; i < state.graves.length; i++) {
      if (state.graves[i].name === name) return;
    }

    state.graves.push({
      name: name,
      day: state.day || 1,
      cause: cause || '伤势过重'
    });
  };

  SF.addLog = function (state, text) {
    if (!text) return;
    state.logs.push(text);
    if (state.logs.length > 12) state.logs.shift();
    state.lastEvent = text;

    if (!state.dayLog) state.dayLog = [];
    state.dayLog.push(text);
    if (state.dayLog.length > 60) state.dayLog.shift();
  };

  // 今天拿到了哪件主线道具（写日记用）
  SF.noteQuest = function (state, name) {
    if (!name) return;
    if (!state.questToday) state.questToday = [];
    if (state.questToday.indexOf(name) === -1) state.questToday.push(name);
  };

  // 还活着的人：alive 标记为真、并且血量 > 0（血量归零的绝不算活着）
  SF.aliveAll = function (state) {
    var out = [];
    if (!state) return out;
    for (var i = 0; i < state.survivors.length; i++) {
      var s = state.survivors[i];
      if (s.alive && s.hp > 0) out.push(s);
    }
    return out;
  };

  // 血量归零的人立刻标记死亡，避免出现「尸体还挂在存活名单里」
  SF.syncDeaths = function (state) {
    var dead = [];
    if (!state) return dead;

    for (var i = 0; i < state.survivors.length; i++) {
      var s = state.survivors[i];
      if (s.alive && s.hp <= 0) {
        s.alive = false;
        s.mad = false;
        dead.push(s.name);
      }
    }

    for (var k = 0; k < dead.length; k++) {
      SF.addLog(state, dead[k] + ' 已死亡。');
    }
    return dead;
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
      if (state.survivors[i].charId === charId &&
          state.survivors[i].alive && state.survivors[i].hp > 0) {
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

    // 测试台「全开」：所有地点直接可进，不再检查装备和天数
    if (state && state.allOpen) return { ok: true };

    // 便利店 / 绿化带：永远能进
    if (loc.id === 'store' || loc.id === 'green') return { ok: true };

    if (loc.id === 'garage') {
      if (wornBy(state, ids, 'torch')) return { ok: true };
      if (!state.items.flashlight) {
        return { ok: false, reason: '车库里伸手不见五指，要先找到【手电筒】才能下去。' };
      }
      if (ids) {
        return { ok: false, reason: '手电筒还在库存里，下去之前先给一个人穿上。' };
      }
      return { ok: true };
    }

    if (loc.id === 'clinic') {
      // 修好收音机，才知道医务室里还囤着药
      if (!state.items.radio) {
        return { ok: false, reason: '你们还不知道医务室里有什么。先修好收音机，听到军方的频道。' };
      }

      // 林晓对毒气免疫，不带面具也能进
      if (ids && ids.length) {
        var linS = SF.findChar ? SF.findChar(state, 'lin') : null;
        if (linS && ids.indexOf(linS.id) !== -1) return { ok: true };
      }

      if (wornBy(state, ids, 'mask')) return { ok: true };
      if (state.items.gasMask && !ids) return { ok: true };
      if (state.items.gasMask) {
        return { ok: false, reason: '防毒面具还在库存里，出发前先给一个人戴上。' };
      }
      return { ok: false, reason: '医务室里弥漫着消毒水和尸体腐烂的味道，需要【防毒面具】才能进去。' };
    }

    if (loc.id === 'guard') {
      // 保安亭里有什么，是医务室那边听来的
      if (!state.seenClinic) {
        return { ok: false, reason: '你们还不知道保安亭里有什么。先去医务室打听打听。' };
      }

      if (wornBy(state, ids, 'weapon')) return { ok: true };
      if (state.items.weapon && !ids) return { ok: true };
      if (state.items.weapon) {
        return { ok: false, reason: '武器还在库存里，出发前先给一个人拿上。' };
      }
      return { ok: false, reason: '保安亭那边有一伙暴徒，赤手空拳去等于送死，需要【武器】。' };
    }

    if (loc.id === 'garage-hidden' || loc.id === 'vault') {
      if (!state.vaultUnlocked) return { ok: false, reason: '这里现在看不出有什么。' };
      return { ok: true };
    }

    return { ok: true };
  };

  function findRow(rows, id) {
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === id) return rows[i];
    }
    return null;
  }

  function checkOver(state, day) {
    // 先把血量归零的人标记成死亡
    SF.syncDeaths(state);

    var alive = SF.aliveAll(state);

    // 只有最后一个人也倒下，才算全灭；还有一口气就继续
    if (alive.length === 0) {
      if (!state.overDay) state.overDay = day;
      state.over = true;
      return true;
    }

    state.over = false;
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

  /* ---------- 每日状况 ---------- */

  SF.condFor = function (state) {
    var list = C.conditions || [];
    var id = state && state.condition ? state.condition : 'calm';

    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return list[0] || { id: 'calm', name: '死寂', desc: '' };
  };

  // 每天早上换一个状况：按 weight 抽，抽到之后立刻结算水/心情
  function rollDailyCondition(state) {
    var list = C.conditions || [];
    if (!list.length) return SF.condFor(state);

    var total = 0;
    var i;

    for (i = 0; i < list.length; i++) total += (list[i].weight || 1);

    var r = Math.random() * total;
    var cond = list[0];

    for (i = 0; i < list.length; i++) {
      r -= (list[i].weight || 1);
      if (r <= 0) {
        cond = list[i];
        break;
      }
    }

    state.condition = cond.id;
    state.conditionDay = state.day;

    if (cond.water) {
      state.supplies.water = (state.supplies.water || 0) + cond.water;
    }

    if (cond.mood) {
      var alive = SF.aliveAll(state);
      for (i = 0; i < alive.length; i++) {
        alive[i].mood = clamp(alive[i].mood + cond.mood, 0, C.maxStat);
      }
    }

    if (cond.water || cond.mood) {
      SF.addLog(state, '今日状况：' + cond.name + '。' + cond.desc);
    }

    return cond;
  }

  SF.rollDailyCondition = rollDailyCondition;

  /* ---------- 白天突发事件 ---------- */

  function canPay(state, key, n) {
    return (state.supplies[key] || 0) >= n;
  }

  function paySupply(state, key, n) {
    state.supplies[key] = Math.max(0, Math.round((state.supplies[key] || 0) - n));
  }

  // 全员心情微调（白天事件用）
  function moodAll(state, delta) {
    var list = SF.aliveAll(state);
    for (var i = 0; i < list.length; i++) {
      list[i].mood = clamp(list[i].mood + delta, 0, C.maxStat);
    }
    return list.length;
  }

  function moodOne(state, charId, delta) {
    var s = SF.findChar ? SF.findChar(state, charId) : null;
    if (!s || !s.alive) return;
    s.mood = clamp(s.mood + delta, 0, C.maxStat);
  }

  function hpAll(state, delta) {
    var list = SF.aliveAll(state);
    for (var i = 0; i < list.length; i++) {
      list[i].hp = clamp(list[i].hp + delta, 0, C.maxStat);
    }
    return list.length;
  }

  SF.dayEventFor = function (state) {
    if (!state) return null;
    if (state.dayEventDone === state.day) return null;
    if (state.day < (C.dayEvents.firstDay || 2)) return null;

    // 一天只抽一次种类；之后每次都按种类重建，好让价格和库存保持同步
    if (state.dayEventIdDay !== state.day) {
      state.dayEventIdDay = state.day;
      state.dayEventId = pickDayEventId(state);
    }

    return dayEventById(state, state.dayEventId);
  };

  function pickDayEventId(state) {
    // 第 6~8 天：还没收音机就一定有神秘人来敲门
    if (state.day >= (C.dayEvents.radioDealDay || 6) &&
        state.day <= (C.dayEvents.radioDealUntil || 8) &&
        !state.items.radio && !state.items.radioBroken) {
      return 'radioDeal';
    }

    // 第 10 天还没收音机：保底事件，绝不让主线断掉
    if (state.day >= 10 && !state.items.radio) return 'pityRadio';

    // 今日状况是黑市开张：门口一定有商人
    if (SF.condFor(state).forceMerchant) return 'merchant';

    if (!roll(C.dayEvents.chance)) return '';

    // 白天七成是好消息（换东西、送物资、给情报），三成是麻烦
    var GOOD_POOL = ['merchant', 'neighbor', 'intel', 'plaza', 'postgrad',
      'maskSeller', 'waterPump', 'linClean', 'nanaLipstick', 'chenNet', 'tieDream'];
    var BAD_POOL = ['thugs', 'elevator', 'pigeon', 'nurse', 'fakeRescue'];

    function pickFrom(pool) {
      var ok = [];
      for (var i = 0; i < pool.length; i++) {
        if (dayEventById(state, pool[i])) ok.push(pool[i]);
      }
      return ok.length ? pickOne(ok) : '';
    }

    var goods = roll(0.7);
    var picked = pickFrom(goods ? GOOD_POOL : BAD_POOL);

    // 这一池今天都放不出来，就换另一池
    if (!picked) picked = pickFrom(goods ? BAD_POOL : GOOD_POOL);

    return picked;
  }

  // 队里有没有能用的武器（库存里的也算）
  function hasWeapon(state) {
    if (state.items && state.items.weapon) return true;

    for (var i = 0; i < state.survivors.length; i++) {
      var s = state.survivors[i];
      if (s.alive && s.hasWeapon) return true;
    }
    return false;
  }

  SF.hasWeapon = hasWeapon;

  /*
   * 救援日：修好收音机之后才随机抽出来。
   * 没修好收音机，玩家永远等不到救援——只会等到死。
   */
  // 旧接口：撤离日不再随机抽，只在拿到信号弹时才确定
  SF.setRescueDay = function (state) {
    return state ? (state.rescueDay || 0) : 0;
  };

  // 信号弹到手：第二天清晨直升机来
  SF.grabFlare = function (state) {
    if (!state) return '';

    state.items.flare = true;
    state.rescueDay = state.day + 1;
    state.rescueKnown = true;

    SF.addLog(state, '信号弹到手。军方说过：信号弹升空的第二天清晨，直升机就来。');
    return '信号弹到手：明天清晨直升机会来。今晚是最后一夜。';
  };

  // 已经死了几个人（结局要用）
  SF.deadCount = function (state) {
    var n = 0;
    if (!state || !state.survivors) return 0;

    for (var i = 0; i < state.survivors.length; i++) {
      var s = state.survivors[i];
      if (!s.alive || s.hp <= 0) n += 1;
    }
    return n;
  };

  // 收音机修好后听到的情报（不再直接给撤离日期）
  SF.rescueNews = function (state) {
    return '军方频道终于出声了：救援只认信号弹，谁在楼顶打出信号弹，第二天清晨直升机就来。';
  };

  // 破收音机：用 3 块木板重新钉个外壳
  SF.repairRadio = function (state) {
    if (!state.items.radioBroken) return { ok: false, msg: '没有要修的东西。' };

    if ((state.supplies.material || 0) < 3) {
      return { ok: false, msg: '木板不够，需要 3 块。' };
    }

    state.supplies.material = Math.max(0, Math.round((state.supplies.material || 0) - 3));
    state.items.radioBroken = false;
    state.items.radio = true;
    state.rescueKnown = true;

    var news = SF.rescueNews(state);
    SF.addLog(state, '你用木板固定好它，收音机里传来断断续续的军方广播……' + news);
    return { ok: true, msg: '你用木板固定好它，收音机里传来断断续续的军方广播……（木板 -3）' + news };
  };

  // 缺什么就直说，好让按钮旁边能写红字
  function lackOf(state, needs) {
    for (var i = 0; i < needs.length; i++) {
      var n = needs[i];
      if ((state.supplies[n.key] || 0) < n.n) return n.label;
    }
    return '';
  }

  // 身上还能拿出去换 / 被抢的装备（库存里的和穿在人身上的都算）
  function spareGearList(state) {
    var list = [];

    if (state.items.flashlight) list.push('手电筒');
    if (state.items.gasMask) list.push('防毒面具');
    if (state.items.backpack) list.push('双肩包');
    if (state.items.weapon) list.push('武器');

    for (var i = 0; i < state.survivors.length; i++) {
      var s = state.survivors[i];
      if (!s.alive) continue;
      if (s.hasTorch) list.push('手电筒');
      if (s.hasMask) list.push('防毒面具');
      if (s.hasWeapon) list.push('武器');
    }

    return list;
  }

  // 拿走一件装备，返回它的名字（没有就返回空串）
  function spendGear(state) {
    var i;

    if (state.items.flashlight) { state.items.flashlight = false; return '手电筒'; }
    if (state.items.gasMask) { state.items.gasMask = false; return '防毒面具'; }
    if (state.items.backpack) { state.items.backpack = false; return '双肩包'; }
    if (state.items.weapon) { state.items.weapon = false; return '武器'; }

    for (i = 0; i < state.survivors.length; i++) {
      var s = state.survivors[i];
      if (!s.alive) continue;
      if (s.hasTorch) { s.hasTorch = false; return s.name + ' 的手电筒'; }
      if (s.hasMask) { s.hasMask = false; return s.name + ' 的防毒面具'; }
      if (s.hasWeapon) { s.hasWeapon = false; return s.name + ' 的武器'; }
    }

    return '';
  }

  function dayEventById(state, id) {
    if (!id) return null;

    if (id === 'radioDeal') {
      var radioLack = lackOf(state, [
        { key: 'food', n: 2, label: '食物不足' },
        { key: 'water', n: 1, label: '水不足' }
      ]);
      var gearList = spareGearList(state);

      return {
        id: 'radioDeal',
        title: '门外的神秘人',
        text: '一个裹着雨衣的人敲门，说他手上有一台破损的收音机，愿意换 2 份食物和 1 瓶水。' +
          '这是唯一能听到军方频道的办法。',
        options: [
          {
            key: 'deal',
            label: '换（食物 -2，水 -1）',
            disabled: !!radioLack,
            lack: radioLack
          },
          {
            key: 'gear',
            label: '拿身上的装备换（失去 1 件装备）',
            disabled: !gearList.length,
            lack: gearList.length ? '' : '身上没有可换的装备'
          },
          { key: 'rob', label: '直接抢（可能挨一刀）' },
          { key: 'no', label: '不换（放弃这台收音机）' }
        ]
      };
    }

    if (id === 'pityRadio') {
      var hadBroken = !!state.items.radioBroken;

      return {
        id: 'pityRadio',
        title: '楼道里的收音机',
        text: hadBroken
          ? '3 楼那户人家的门一直开着，里面已经没人了。你在尸体旁翻到一个零件盒，' +
            '里面有一颗还能用的电子元件。'
          : '3 楼那户人家的门一直开着，里面已经没人了。尸体旁搁着一台摔坏的收音机，' +
            '旁边还有一个零件盒——也许还能修。',
        options: [
          {
            key: 'take',
            label: hadBroken ? '收下零件（电子零件 +1）' : '收下（破损的收音机 + 电子零件）'
          }
        ]
      };
    }

    if (id === 'merchant') {
      var merchantLack = lackOf(state, [
        { key: 'food', n: 3, label: '食物不足' }
      ]);
      var mGear = spareGearList(state);

      return {
        id: 'merchant',
        title: '黑市商人',
        text: '商人掀开大衣，里面挂着几瓶水。他说 3 份食物换 2 瓶水，换不换？',
        options: [
          {
            key: 'deal',
            label: '换（食物 -3，水 +2）',
            disabled: !!merchantLack,
            lack: merchantLack
          },
          {
            key: 'gear',
            label: '拿 1 件装备换 2 瓶水',
            disabled: !mGear.length,
            lack: mGear.length ? '' : '身上没有可换的装备'
          },
          { key: 'no', label: '不换' }
        ]
      };
    }

    if (id === 'neighbor') {
      var medLack = lackOf(state, [
        { key: 'medicine', n: 1, label: '药品不足' }
      ]);

      return {
        id: 'neighbor',
        title: '受伤的邻居',
        text: '隔壁老王捂着胳膊来求助，说给他 1 份药品，他把祖传的防毒面具给你。',
        options: [
          {
            key: 'deal',
            label: '换（药品 -1，防毒面具 +1）',
            disabled: !!medLack,
            lack: medLack
          },
          { key: 'no', label: '不换' }
        ]
      };
    }

    if (id === 'intel') {
      var intelLack = lackOf(state, [
        { key: 'food', n: 2, label: '食物不足' }
      ]);

      return {
        id: 'intel',
        title: '情报贩子',
        text: '情报贩子说，只要 2 个罐头，他就告诉你今天哪个地方油水最多（今天探索收益翻倍）。',
        options: [
          {
            key: 'deal',
            label: '买情报（食物 -2）',
            disabled: !!intelLack,
            lack: intelLack
          },
          { key: 'no', label: '不买' }
        ]
      };
    }

    if (id === 'fakeRescue') {
      return {
        id: 'fakeRescue',
        title: '自称救援队的人',
        text: '一大早有人敲门，说自己是军方搜救队，要你们开门登记。' +
          '门外的人没有手电，也没有车灯。',
        options: [
          { key: 'open', label: '开门（可能是真的，也可能不是）' },
          { key: 'ignore', label: '装没人，不开' }
        ]
      };
    }

    // ---------- 公寓邻居们的日常 ----------

    if (id === 'plaza') {
      return {
        id: 'plaza',
        title: '广场舞大妈',
        text: '楼下的王大妈疯狂拍门，说虽然丧尸爆发了，但晚上 8 点的广场舞不能停。' +
          '她提出用半袋发霉的面粉，换你的大功率音响。换吗？',
        options: [
          { key: 'deal', label: '换（食物 +2，心情 -10）' },
          { key: 'keep', label: '不换，让她在楼下跳（心情 +10）' }
        ]
      };
    }

    if (id === 'postgrad') {
      return {
        id: 'postgrad',
        title: '考研邻居',
        text: '对门同样被困的男生敲门，想用 2 瓶矿泉水，换你手里的一本《考研英语真题》。' +
          '他说他要准备二战。',
        options: [
          { key: 'deal', label: '换（水 +2，全员心情 +10）' },
          { key: 'no', label: '不换，让他自己想办法（心情 -10）' }
        ]
      };
    }

    if (id === 'maskSeller') {
      var maskLack = lackOf(state, [{ key: 'food', n: 1, label: '食物不足' }]);

      return {
        id: 'maskSeller',
        title: '微商清仓',
        text: '楼里的微商邻居在楼道摆摊，向你推销“末日特供面膜”。她说敷了能保持心情愉悦。' +
          '用 1 个罐头换 1 个面膜（全员心情 +20），换不换？',
        options: [
          {
            key: 'deal',
            label: '换（食物 -1，全员心情 +20）',
            disabled: !!maskLack,
            lack: maskLack
          },
          { key: 'no', label: '不换（心情 -10）' }
        ]
      };
    }

    if (id === 'nurse') {
      var hasTieForNurse = SF.charAlive(state, 'tie');

      return {
        id: 'nurse',
        title: '楼道里的求救',
        text: '门外传来女人的哭声，她说自己是护士，只要开门就能帮你们治病。' +
          '但铁柱从猫眼往外看，发现她背后似乎藏着撬棍。',
        options: [
          { key: 'open', label: '开门看看（可能是护士，也可能是撬棍）' },
          {
            key: 'block',
            label: '让铁柱顶死门',
            disabled: !hasTieForNurse,
            lack: hasTieForNurse ? '' : '铁柱已经不在了'
          },
          { key: 'ignore', label: '不开门（心情 -5）' }
        ]
      };
    }

    // ---------- 公寓设施故障 ----------

    if (id === 'waterPump') {
      var pumpLack = lackOf(state, [{ key: 'material', n: 2, label: '木板不足' }]);

      return {
        id: 'waterPump',
        title: '停水危机',
        text: '顶楼水箱快见底了。如果想恢复供水，必须去修水泵。' +
          '消耗 2 个木板去修，还是不管？',
        options: [
          {
            key: 'fix',
            label: '去修（木板 -2，水 +3）',
            disabled: !!pumpLack,
            lack: pumpLack
          },
          { key: 'no', label: '不管（水 -1，心情 -10）' }
        ]
      };
    }

    if (id === 'elevator') {
      var eleArmed = hasWeapon(state);
      var eleLack = lackOf(state, [{ key: 'material', n: 1, label: '木板不足' }]);

      return {
        id: 'elevator',
        title: '电梯惊魂',
        text: '电梯突然停在你们这层自动打开了，里面有一只丧尸。' +
          '是消耗武器干掉它，还是花 1 个木板把电梯门强行封死？',
        options: [
          {
            key: 'fight',
            label: '用武器干掉它（心情 +10，材料 +1）',
            disabled: !eleArmed,
            lack: eleArmed ? '' : '没有武器'
          },
          {
            key: 'seal',
            label: '用木板封门（木板 -1，心情 -10）',
            disabled: !!eleLack,
            lack: eleLack
          },
          { key: 'run', label: '谁也不管（全员血量 -10，心情 -10）' }
        ]
      };
    }

    if (id === 'pigeon') {
      var pgArmed = hasWeapon(state);
      var pgLack = lackOf(state, [{ key: 'material', n: 1, label: '木板不足' }]);

      return {
        id: 'pigeon',
        title: '阳台上的变异鸽子',
        text: '一群吃腐肉的鸽子落在阳台，眼睛里泛着不正常的红。' +
          '用木板赶走，还是消耗武器打下来烤了吃？',
        options: [
          {
            key: 'shoo',
            label: '用木板赶走（木板 -1，心情 +10）',
            disabled: !!pgLack,
            lack: pgLack
          },
          {
            key: 'hunt',
            label: '打下来烤了吃（食物 +2，心情 +10）',
            disabled: !pgArmed,
            lack: pgArmed ? '' : '没有武器'
          },
          { key: 'ignore', label: '关上阳台门（心情 -10）' }
        ]
      };
    }

    // ---------- 合租室友的奇葩操作 ----------

    if (id === 'linClean') {
      if (!SF.charAlive(state, 'lin')) return null;

      var washLack = lackOf(state, [{ key: 'water', n: 2, label: '水不足' }]);

      return {
        id: 'linClean',
        title: '林晓的洁癖',
        text: '林晓因为三天没洗澡彻底崩溃了，她拒绝吃任何东西。' +
          '除非消耗 2 瓶水让她洗个头。',
        options: [
          {
            key: 'wash',
            label: '让她洗（水 -2，林晓心情 +30）',
            disabled: !!washLack,
            lack: washLack
          },
          { key: 'no', label: '省着水（林晓心情 -20，全员 -10）' }
        ]
      };
    }

    if (id === 'nanaLipstick') {
      if (!SF.charAlive(state, 'nana')) return null;

      return {
        id: 'nanaLipstick',
        title: '娜娜的执念',
        text: '娜娜在废墟里找到了半截口红，兴奋地涂上后心情大好，' +
          '对着裂了缝的镜子自言自语。',
        options: [
          { key: 'let', label: '让她涂个够（全员心情 +10）' },
          { key: 'no', label: '劝她扔掉（心情 -10）' }
        ]
      };
    }

    if (id === 'chenNet') {
      if (!SF.charAlive(state, 'chen')) return null;

      var hasCards = !!state.items.cards;

      return {
        id: 'chenNet',
        title: '陈默的网瘾',
        text: '陈默因为没有网络，抱着手机刷新了七十多次，心情暴跌。' +
          '如果给他一副扑克牌让他自己玩，他就能打发时间。',
        options: [
          {
            key: 'cards',
            label: '给他扑克牌（陈默心情 +30）',
            disabled: !hasCards,
            lack: hasCards ? '' : '没有扑克牌'
          },
          { key: 'no', label: '让他戒网瘾（陈默心情 -20）' }
        ]
      };
    }

    if (id === 'tieDream') {
      if (!SF.charAlive(state, 'tie')) return null;

      var tieLack = lackOf(state, [{ key: 'food', n: 1, label: '食物不足' }]);

      return {
        id: 'tieDream',
        title: '铁柱的噩梦',
        text: '铁柱半夜梦游，差点把大门当成丧尸砸了。' +
          '消耗 1 个食物安抚他，还是让他自己醒？',
        options: [
          {
            key: 'feed',
            label: '喂他点吃的（食物 -1，铁柱心情 +20）',
            disabled: !!tieLack,
            lack: tieLack
          },
          { key: 'no', label: '不管（大门受损，全员心情 -10）' }
        ]
      };
    }

    if (id !== 'thugs') return null;

    var tieAlive = SF.charAlive(state, 'tie');
    var armed = hasWeapon(state);
    var fightLack = '';

    if (!tieAlive) fightLack = '铁柱已经不在了';
    else if (!armed) fightLack = '缺少武器，无法战斗';

    var payLack = lackOf(state, [
      { key: 'food', n: 2, label: '食物不足' }
    ]);

    return {
      id: 'thugs',
      title: '暴徒勒索',
      text: '门口来了两个带武器的暴徒，要么给 2 份食物打发他们，要么让铁柱拿武器出去打一架。',
      options: [
        {
          key: 'pay',
          label: '给食物（食物 -2）',
          disabled: !!payLack,
          lack: payLack
        },
        {
          key: 'fight',
          label: '让铁柱打一架',
          disabled: !!fightLack,
          lack: fightLack
        },
        { key: 'endure', label: '咬牙忍着（全员心情 -10）' }
      ]
    };
  }

  SF.resolveDayEvent = function (state, id, key) {
    state.dayEventDone = state.day;
    var out = '';

    if (id === 'radioDeal') {
      if (key === 'deal' && canPay(state, 'food', 2) && canPay(state, 'water', 1)) {
        paySupply(state, 'food', 2);
        paySupply(state, 'water', 1);
        state.items.radioBroken = true;
        out = '你们换下了那台破损的收音机。（食物 -2，水 -1）';
      } else if (key === 'gear') {
        var lostGear = spendGear(state);

        if (lostGear) {
          state.items.radioBroken = true;
          out = '你把' + lostGear + '塞给雨衣人，抱回了那台破损的收音机。';
        } else {
          out = '你身上没什么能拿出手的，雨衣人摇了摇头。';
        }
      } else if (key === 'rob') {
        if (roll(0.55)) {
          state.items.radioBroken = true;
          paySupply(state, 'food', Math.min(1, state.supplies.food || 0));
          out = '你一把抢过收音机，雨衣人的刀划破了你的袖子。收音机到手了，' +
            '代价是掉了一份食物。（食物 -1，破损收音机 +1）';
        } else {
          paySupply(state, 'food', Math.min(2, state.supplies.food || 0));
          moodAll(state, -10);
          out = '雨衣人比你能打。你们被撵回屋里，食物还被抢走了一些。（全员心情 -10）';
        }
      } else {
        out = '你们没换，雨衣人骂了一句就走了。';
      }
    } else if (id === 'pityRadio') {
      state.items.radioBroken = true;
      out = '你们把破损的收音机抱回了屋里。（破损收音机 +1）' +
        '攒 3 块木板就能把它修好，修好就知道救援什么时候来了。';
    } else if (id === 'merchant') {
      if (key === 'deal' && canPay(state, 'food', 3)) {
        paySupply(state, 'food', 3);
        state.supplies.water = (state.supplies.water || 0) + 2;
        out = '你们用 3 份食物换了 2 瓶水。（食物 -3，水 +2）';
      } else if (key === 'gear') {
        var mGearOut = spendGear(state);

        if (mGearOut) {
          state.supplies.water = (state.supplies.water || 0) + 2;
          out = '你用' + mGearOut + '换了 2 瓶水。（水 +2）';
        } else {
          out = '你身上没有能换的东西，商人走了。';
        }
      } else {
        out = '你们没换，商人走了。';
      }
    } else if (id === 'neighbor') {
      if (key === 'deal' && canPay(state, 'medicine', 1)) {
        paySupply(state, 'medicine', 1);
        state.items.gasMask = true;
        out = '老王拿走了药，把防毒面具留给了你们。（药品 -1，防毒面具 +1）';
      } else {
        out = '你们没有药，老王失望地走了。';
      }
    } else if (id === 'intel') {
      if (key === 'deal' && canPay(state, 'food', 2)) {
        paySupply(state, 'food', 2);
        state.lootBonus = C.dayEvents.lootBonus || 2;
        out = '情报到手：今天任何地点的收获翻倍。（食物 -2）';
      } else {
        out = '你们没买情报。';
      }
    } else if (id === 'thugs') {
      if (key === 'pay' && canPay(state, 'food', 2)) {
        paySupply(state, 'food', 2);
        out = '你们给了 2 份食物，暴徒骂骂咧咧地走了。（食物 -2）';
      } else if (key === 'fight' && SF.charAlive(state, 'tie') && hasWeapon(state)) {
        out = '铁柱拎着武器出去，两个暴徒被他打跑了。';
      } else {
        var mates = SF.aliveAll(state);
        for (var mi = 0; mi < mates.length; mi++) {
          mates[mi].mood = clamp(mates[mi].mood - 10, 0, C.maxStat);
        }
        out = '你们把门顶死，任由外面的暴徒踹了几脚。（全员心情 -10）';
      }
    } else if (id === 'fakeRescue') {
      if (key === 'open') {
        if (roll(0.25)) {
          state.supplies.water = (state.supplies.water || 0) + 2;
          state.supplies.medicine = (state.supplies.medicine || 0) + 1;
          moodAll(state, 10);
          out = '门外的真是搜救队先遣兵。他们留下两瓶水和一盒药，说大部队很快就到。（水 +2，药 +1，全员心情 +10）';
        } else {
          var lostF = Math.min(2, state.supplies.food || 0);
          var lostW = Math.min(2, state.supplies.water || 0);
          state.supplies.food = Math.max(0, (state.supplies.food || 0) - lostF);
          state.supplies.water = Math.max(0, (state.supplies.water || 0) - lostW);
          moodAll(state, -15);
          out = '门一开，几条人影就冲了进来。等你们反应过来，人已经跑了，' +
            '食物和水被翻走一部分。（食物 -' + lostF + '，水 -' + lostW + '，全员心情 -15）';
        }
      } else {
        moodAll(state, -5);
        out = '你们没开门。敲门声断断续续响了十几分钟，然后停了。' +
          '第二天楼道里多了几道血手印。（全员心情 -5）';
      }
    } else if (id === 'plaza') {
      if (key === 'deal') {
        state.supplies.food = (state.supplies.food || 0) + 2;
        moodAll(state, -10);
        out = '王大妈抱着音响下楼了，用半袋发霉的面粉换的。（食物 +2，全员心情 -10）晚上安静得让人难受。';
      } else {
        moodAll(state, 10);
        out = '音响留下了。八点整，楼下准时响起《最炫民族风》，连丧尸都绕着走。（全员心情 +10）';
      }
    } else if (id === 'postgrad') {
      if (key === 'deal') {
        state.supplies.water = (state.supplies.water || 0) + 2;
        moodAll(state, 10);
        out = '你把真题给了他，他抱着书连声道谢，说二战一定上岸。（水 +2，全员心情 +10）';
      } else {
        moodAll(state, -10);
        out = '你关上门。隔壁传来翻书的沙沙声，一直响到半夜。（全员心情 -10）';
      }
    } else if (id === 'maskSeller') {
      if (key === 'deal' && canPay(state, 'food', 1)) {
        paySupply(state, 'food', 1);
        moodAll(state, 20);
        out = '面膜敷上，四个人对着镜子互相说“还行”。（食物 -1，全员心情 +20）';
      } else {
        moodAll(state, -10);
        out = '微商把面膜收回包里，说你们不懂市场经济。（全员心情 -10）';
      }
    } else if (id === 'nurse') {
      if (key === 'open') {
        if (roll(0.5)) {
          hpAll(state, 20);
          state.supplies.medicine = (state.supplies.medicine || 0) + 1;
          out = '门一开，她真的是护士。她给每个人看了伤，还留下一盒药。（全员血量 +20，药品 +1）';
        } else {
          paySupply(state, 'water', 2);
          moodAll(state, -10);
          out = '门刚开一条缝，撬棍就伸了进来。等她跑掉，门口的两瓶水也没了。（水 -2，全员心情 -10）';
        }
      } else if (key === 'block' && SF.charAlive(state, 'tie')) {
        moodAll(state, 2);
        out = '铁柱用肩膀顶住门，一直顶到走廊安静下来。（全员心情 +2）';
      } else {
        moodAll(state, -5);
        out = '你们谁也没动。哭声在门外持续了很久，然后就没了。（全员心情 -5）';
      }
    } else if (id === 'waterPump') {
      if (key === 'fix' && canPay(state, 'material', 2)) {
        paySupply(state, 'material', 2);
        state.supplies.water = (state.supplies.water || 0) + 3;
        moodAll(state, 10);
        out = '你们轮流去顶楼修好了水泵，水龙头重新哗哗出水。（木板 -2，水 +3，全员心情 +10）';
      } else {
        paySupply(state, 'water', 1);
        moodAll(state, -10);
        out = '水龙头彻底不出水了。今天只能省着喝。（水 -1，全员心情 -10）';
      }
    } else if (id === 'elevator') {
      if (key === 'fight' && hasWeapon(state)) {
        moodAll(state, 10);
        state.supplies.material = (state.supplies.material || 0) + 1;
        out = '电梯门关上之前，你们把它解决了。铁柱顺手拖走了它兜里的一些零件。（心情 +10，材料 +1）';
      } else if (key === 'seal' && canPay(state, 'material', 1)) {
        paySupply(state, 'material', 1);
        moodAll(state, -10);
        out = '你们用一块木板把电梯门钉死，里面传来挠门的声音。（木板 -1，心情 -10）';
      } else {
        hpAll(state, -10);
        moodAll(state, -10);
        out = '电梯门开着，那只东西在楼道里站了一整夜。谁也没睡。（全员血量 -10，心情 -10）';
      }
    } else if (id === 'pigeon') {
      if (key === 'shoo' && canPay(state, 'material', 1)) {
        paySupply(state, 'material', 1);
        moodAll(state, 10);
        out = '你们挥着木板把鸽子赶出阳台，羽毛落了一地。（木板 -1，心情 +10）';
      } else if (key === 'hunt' && hasWeapon(state)) {
        state.supplies.food = (state.supplies.food || 0) + 2;
        moodAll(state, 10);
        out = '鸽子烤焦了，但那是很久以来最好闻的味道。（食物 +2，心情 +10）';
      } else {
        moodAll(state, -10);
        out = '你们关上阳台门，隔着玻璃看它们啄窗框。（心情 -10）';
      }
    } else if (id === 'linClean') {
      if (key === 'wash' && canPay(state, 'water', 2)) {
        paySupply(state, 'water', 2);
        moodOne(state, 'lin', 30);
        out = '林晓洗了头，擦干头发的第一句话是“我要吃饭”。（水 -2，林晓心情 +30）';
      } else {
        moodOne(state, 'lin', -20);
        moodAll(state, -10);
        out = '林晓缩进被子里，一句话都不说。晚饭谁也没吃好。（全员心情 -10）';
      }
    } else if (id === 'nanaLipstick') {
      if (key === 'let') {
        moodAll(state, 10);
        out = '娜娜抹着那半截口红，在镜子前转了三圈，说等出去了要去吃顿好的。（全员心情 +10）';
      } else {
        moodAll(state, -10);
        out = '你把口红扔进垃圾桶。娜娜一晚上没跟你说话。（全员心情 -10）';
      }
    } else if (id === 'chenNet') {
      if (key === 'cards' && state.items.cards) {
        moodOne(state, 'chen', 30);
        out = '陈默抱着扑克牌在原地摆了一整晚的接龙。（陈默心情 +30）';
      } else {
        moodOne(state, 'chen', -20);
        out = '陈默把手机贴在窗台上找信号，一格都没有。（陈默心情 -20）';
      }
    } else if (id === 'tieDream') {
      if (key === 'feed' && canPay(state, 'food', 1)) {
        paySupply(state, 'food', 1);
        moodOne(state, 'tie', 20);
        out = '你把半份口粮塞进铁柱手里，他一下子就醒了，挠头问“门还在吧”。（食物 -1，铁柱心情 +20）';
      } else {
        moodAll(state, -10);
        state.supplies.material = Math.max(0, (state.supplies.material || 0) - 1);
        state.doorBroken = true;
        out = '铁柱一拳砸在门上，门框裂了一道。今晚要是真有东西来，这门挡不住。（材料 -1，全员心情 -5）';
      }
    }

    if (out) SF.addLog(state, out);
    return out;
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
    // 死了的人不能再喂（血量归零 = 死亡）
    if (!s || !s.alive || s.hp <= 0) return { ok: false, msg: '' };

    var m = SF.mealOf(state, id);

    if (kind === 'food') {
      // 只要还没吃饱、库存够，就能继续喂；m.eat 只用来记“今天吃过”，夜里结算用
      if (s.hunger <= 0) return { ok: false, msg: s.name + ' 已经吃饱了。' };

      var need = SF.foodNeed(s);
      if ((state.supplies.food || 0) < need) {
        return { ok: false, msg: '食物不够了。' };
      }

      state.supplies.food = Math.max(0, Math.round((state.supplies.food || 0) - need));
      state.todayFood = Math.max(0, Math.round((state.todayFood || 0) + need));
      m.eat = true;
      s.hunger = clamp(s.hunger - C.meal.restore, 0, C.maxStat);

      SF.addLog(state, flavor(s.hunger > 60 ? 'eatHard' : 'eat', s));
      return {
        ok: true,
        msg: s.name + ' 吃了一份食物，饥饿 −' + C.meal.restore +
          (s.hunger > 0 ? '，还有点饿。' : '，吃饱了。')
      };
    }

    if (kind === 'water') {
      if (s.thirst <= 0) return { ok: false, msg: s.name + ' 已经不渴了。' };

      var ration = SF.waterRation(state);
      if ((state.supplies.water || 0) < ration) {
        return { ok: false, msg: '水不够了。' };
      }

      state.supplies.water = Math.max(0, Math.round((state.supplies.water || 0) - ration));
      state.todayWater = Math.max(0, Math.round((state.todayWater || 0) + ration));
      m.drink = true;
      s.thirst = clamp(s.thirst - C.meal.restore, 0, C.maxStat);

      SF.addLog(state, flavor('drink', s));
      return {
        ok: true,
        msg: s.name + ' 喝了一份水，口渴 −' + C.meal.restore +
          (s.thirst > 0 ? '，还有点渴。' : '，喝够了。')
      };
    }

    return { ok: false, msg: '' };
  };

  SF.exploreChance = function (s, loc, state) {
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

    // 今日状况：停电、尸潮这类会让今天更难搜
    if (state) {
      var cond = SF.condFor(state);
      if (cond && cond.chanceDelta) p += cond.chanceDelta;
    }

    p = clamp(p, E.minChance, E.maxChance);

    if (s.injured) p = p * E.injuredPenalty;

    return clamp(p, 0.02, E.maxChance);
  };

  // 关键道具“越找越近”：连续没出，概率一档一档往上加，最后一趟必定给
  function keyRoll(state, key, chance, tries) {
    if (!state.pity) state.pity = {};

    var n = state.pity[key] || 0;
    var p = Math.min(0.95, chance + n * 0.25);
    var ok = roll(p) || (n + 1 >= tries);

    state.pity[key] = ok ? 0 : n + 1;
    return ok;
  }

  function giveHaul(haul, key, qty) {
    if (qty <= 0) return;
    haul[key] = (haul[key] || 0) + qty;
  }

  // 这一趟背包里带着的特殊道具（也会占格子）
  var SPECIAL_KEYS = ['flashlight', 'gasMask', 'backpack', 'weapon',
    'radio', 'radioBroken', 'flare', 'cards', 'pesticide'];

  SF.specialKeys = function (state) {
    var out = [];
    if (!state || !state.items) return out;

    for (var i = 0; i < SPECIAL_KEYS.length; i++) {
      if (state.items[SPECIAL_KEYS[i]]) out.push(SPECIAL_KEYS[i]);
    }
    return out;
  };

  // 这一趟新拿到的特殊道具（出发时已有的不算）
  SF.specialGained = function (state) {
    var base = (state && state.tripSpecialBase) || [];
    var now = SF.specialKeys(state);
    var out = [];

    for (var i = 0; i < now.length; i++) {
      if (base.indexOf(now[i]) === -1) out.push(now[i]);
    }
    return out;
  };

  function tripTotal(state) {
    var t = state.tripTotals || {};
    var n = 0;
    for (var k in t) {
      if (!t.hasOwnProperty(k)) continue;
      n += t[k];
    }
    return n + SF.specialGained(state).length;
  }

  function applyHaul(state, haul, result) {
    // 一趟最多只允许轻微超载 2 件：再多的东西当场就背不动了
    var cap = (state.tripCap || 0) + 2;
    var dropped = 0;

    for (var i = 0; i < SF.SUPPLIES.length; i++) {
      var key = SF.SUPPLIES[i].key;
      if (!haul[key]) continue;

      var qty = haul[key];

      if (state.tripCap > 0) {
        var room = cap - tripTotal(state);
        if (room <= 0) {
          dropped += qty;
          haul[key] = 0;
          continue;
        }
        if (qty > room) {
          dropped += qty - room;
          qty = room;
          haul[key] = room;
        }
      }

      if (qty <= 0) continue;

      state.supplies[key] = Math.max(0, Math.round((state.supplies[key] || 0) + qty));
      result.loot.push({ key: key, name: SF.SUPPLIES[i].name, qty: qty });

      if (!state.tripTotals) state.tripTotals = {};
      state.tripTotals[key] = (state.tripTotals[key] || 0) + qty;
    }

    if (dropped > 0) {
      result.lines.push('背包实在塞不下了，有 ' + dropped + ' 件东西只能留在原地。');
    }
  }

  /* ---------- 负重 ---------- */

  // 每个人的负重：普通 4 格；铁柱体力好也是 4 格；双肩包再 +2
  SF.carryOf = function (s) {
    if (!s) return 0;

    var base = s.charId === 'tie'
      ? (C.pack.heavy || 4)
      : (C.pack.base || 2);

    if (s.hasPack) base += (C.pack.bagBonus || 2);
    return base;
  };

  // 这一趟的容量 / 已背件数 / 超载数
  SF.packState = function (state) {
    var cap = state.tripCap || 0;
    var i;

    if (!cap && state.tripMembers && state.tripMembers.length) {
      for (i = 0; i < state.tripMembers.length; i++) {
        cap += SF.carryOf(SF.find(state, state.tripMembers[i]));
      }
    }

    var totals = state.tripTotals || {};
    var total = 0;

    for (var k in totals) {
      if (!totals.hasOwnProperty(k)) continue;
      total += totals[k];
    }

    return {
      cap: cap,
      total: total,
      over: Math.max(0, total - cap)
    };
  };

  // 进下一层之前先告诉玩家有多危险：和真正判定用同一套数值，不另外瞎编
  SF.riskInfo = function (state, loc, ids, depth) {
    var E = SF.CONFIG.explore || {};
    var i;
    var hasNana = false;
    var hasTie = false;
    var hasWeapon = false;

    for (i = 0; i < (ids || []).length; i++) {
      var p = SF.find(state, ids[i]);
      if (!p || !p.alive) continue;
      if (p.charId === 'nana') hasNana = true;
      if (p.charId === 'tie') hasTie = true;
      if (p.hasWeapon) hasWeapon = true;
    }

    var chance = depth <= 1 ? 0 : (depth === 2 ? 0.12 : (E.deepRisk || 0.55));

    if (loc && loc.id === 'guard' && depth >= 3 && !hasTie && !hasWeapon) {
      chance = E.deepGuardRisk || 0.8;
    }
    if (loc && loc.id === 'guard' && hasWeapon) chance = 0;
    if (hasWeapon) chance = chance * 0.5;
    if (hasNana) chance = 0;
    if (loc && loc.far && depth === 2) chance += 0.06;

    var fatal = depth >= 3 ? (E.fatalChance || 0) : 0;
    if (hasNana) fatal = fatal * 0.5;
    var pct = Math.round(chance * 100);
    var fpct = Math.round(fatal * 100);

    var parts = [];
    if (depth >= 3) {
      parts.push(pct > 0
        ? '受伤概率约 ' + pct + '%（受伤掉 ' + (E.deepHp || 40) + ' 血）'
        : '不会受伤');
      if (fpct > 0) parts.push('还有 ' + fpct + '% 的可能直接出人命');
    } else if (depth === 2) {
      parts.push('受伤概率约 ' + pct + '%（受伤掉 ' + (E.injuryHp || 30) + ' 血）');
    } else {
      parts.push('这一层是安全的');
    }

    if (hasNana) parts.push('娜娜在，遇敌能谈下来');
    if (hasTie && loc && loc.id === 'guard' && depth >= 3) parts.push('铁柱会挡在最前面');
    if (hasWeapon && pct > 0) parts.push('有武器，受伤概率减半');

    return {
      depth: depth,
      chance: chance,
      fatal: fatal,
      level: (!chance && !fatal) ? 'ok' : ((chance >= 0.5 || fatal) ? 'danger' : 'warn'),
      text: '第 ' + depth + ' 层：' + parts.join('；') + '。'
    };
  };

  // 这一层能翻出什么、各是多少概率：和判定用的是同一套数字，写在“继续深入”上面
  SF.depthFacts = function (state, loc, ids, depth) {
    var out = [];
    var E = SF.CONFIG.explore || {};
    var T = SF.CONFIG.traits || {};
    var i;
    var hasChen = false;
    var hasTie = false;
    var hasLin = false;
    var hasNana = false;
    var hasTorch = false;
    var hasWeapon = false;

    for (i = 0; i < (ids || []).length; i++) {
      var p = SF.find(state, ids[i]);
      if (!p || !p.alive) continue;
      if (p.charId === 'chen') hasChen = true;
      if (p.charId === 'tie') hasTie = true;
      if (p.charId === 'lin') hasLin = true;
      if (p.charId === 'nana') hasNana = true;
      if (p.hasTorch) hasTorch = true;
      if (p.hasWeapon) hasWeapon = true;
    }

    var id = loc ? loc.id : '';

    if (depth === 2) {
      if (id === 'store') {
        out.push('食物 1~2 件（必得）');
        out.push('水 60%');
        out.push('药 30%');
        if (!state.items.flashlight) out.push('手电筒 40%（连着空手会更高，最多 3 趟必出）');
      } else if (id === 'garage') {
        out.push('木板 2~3 块（必得）');
        out.push('食物或水 50%');
        if (!state.items.gasMask) out.push('防毒面具 50%（最多 2 趟必出）');
        if (!state.items.radio && !state.items.radioBroken) {
          out.push('破损收音机 50%（最多 3 趟必出）');
        }
        if (!hasChen) out.push('额外木板 50%');
      } else if (id === 'clinic') {
        out.push(hasLin ? '药 3 份（林晓在，必得）' : '药 1~2 份（70% 是 2 份）');
        if (!state.items.weapon) out.push('防暴叉（武器）40%（最多 3 趟必出）');
        out.push('没戴面具的人 25% 会染病');
      } else if (id === 'guard') {
        out.push('木板 1~2 块 + 食物 1 份（必得）');
        if (!state.items.flashlight) out.push('手电筒 40%（最多 3 趟必出）');
      } else {
        out.push('食物或水 1~2 件（必得）');
        if (!state.items.flashlight) out.push('手电筒 25%');
      }
    } else if (depth >= 3) {
      if (id === 'guard') {
        if (hasTie || hasWeapon) {
          out.push('信号弹（必得）');
          out.push('木板 2~3 块（必得）');
          out.push('食物或水 1 份（50%）');
        } else {
          out.push('没有武器也没带铁柱：抢不到东西，还可能挨打');
          out.push('信号弹仍有机会：60%（再试一趟必出）');
        }
      } else if (id === 'garage') {
        out.push(hasTorch ? '木板 4 块 + 食物 1 + 水 1（手电照到，必得）' : '木板 2~3 块（必得）');
        if (!state.items.flashlight) out.push('手电筒 50%');
      } else if (id === 'clinic') {
        out.push(hasLin ? '药 5 份（林晓在，必得）' : '药 1~2 份（60% 是 2 份）');
      } else {
        out.push('食物 2 件 + 水 1~2 件（必得）');
        if (!state.items.weapon) out.push('防暴棍（武器）25%');
      }
    }

    if (depth >= 2) {
      var raiderPct = Math.round((T.raiderChance || 0.12) * 100) +
        ((ids || []).length > 1 ? 3 * ((ids || []).length - 1) : 0);

      if (hasNana) {
        out.push('遇到暴徒 ' + raiderPct + '%，娜娜在，80% 能谈下来');
      } else {
        out.push('遇到暴徒 ' + raiderPct + '%，没人镇得住就会掉血、丢东西');
      }
    }

    return out;
  };

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
      var all = SF.aliveAll(state);
      var lead = null;
      for (i = 0; i < all.length; i++) {
        if (!all[i].mad) {
          lead = all[i];
          break;
        }
      }
      if (lead) party.push(lead);
    }

    var result = {
      location: loc,
      partyNames: [],
      partyIds: [],
      refused: false,
      junkOnly: false,
      success: false,
      loot: [],
      item: null,
      items: [],
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

    // 地点不再按天数解锁：能不能去，看手里有没有对应的东西（见 SF.gateFor）

    for (i = 0; i < party.length; i++) result.partyNames.push(party[i].name);
    for (i = 0; i < party.length; i++) result.partyIds.push(party[i].id);

    // 新的一趟出发：清空背包统计，按出门的人算负重
    if (depth <= 1) {
      state.tripTotals = {};
      state.tripMembers = [];
      state.tripCap = 0;
      // 出发时身上已有的特殊道具不占这一趟的格子
      state.tripSpecialBase = SF.specialKeys(state);

      // 这一趟能背多少：出门的人各自的负重加起来（普通 2、铁柱 4、背包 +2）
      var capSum = 0;
      for (i = 0; i < party.length; i++) {
        capSum += SF.carryOf(party[i]);
        state.tripMembers.push(party[i].id);
      }
      state.tripCap = capSum;
    }

    if (!state.tripCap) {
      for (i = 0; i < party.length; i++) {
        if (state.tripMembers.indexOf(party[i].id) < 0) state.tripMembers.push(party[i].id);
      }
      var capFallback = 0;
      for (i = 0; i < party.length; i++) capFallback += SF.carryOf(party[i]);
      state.tripCap = capFallback || (C.pack.base || 2);
    }

    if (!state.tripTotals) state.tripTotals = {};

    // 记下这次去哪儿、谁去的，夜里的事件要用来判断失踪
    state.lastExpedition = { locId: loc.id, name: loc.name, risk: loc.riskLevel, ids: [] };
    for (i = 0; i < party.length; i++) state.lastExpedition.ids.push(party[i].id);

    // 去过医务室：才知道保安亭里藏着什么
    if (loc.id === 'clinic') state.seenClinic = true;
    // 下过车库：后面的主线提示才会往下走
    if (loc.id === 'garage') state.seenGarage = true;
    // 去过便利店：主线的第一站
    if (loc.id === 'store') state.seenStore = true;

    var leadName = party[0].name;
    var otherNames = [];
    for (i = 1; i < party.length; i++) otherNames.push(party[i].name);

    var withText = otherNames.length
      ? '带着 ' + otherNames.join('、') + ' '
      : '';

    result.lines.push(leadName + ' ' + withText + '去了' + loc.name + '。');

    // 进到深处先给一句环境：让人知道自己在什么地方
    if (depth >= 2) {
      var amb = AMBIENCE[loc.id];
      if (amb && amb.length) result.lines.push(pickOne(amb));
    }

    // 队伍整体成功率取平均值
    var chanceSum = 0;
    for (i = 0; i < party.length; i++) chanceSum += SF.exploreChance(party[i], loc, state);
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
      // 第一层：不直接摸东西，先选一个入口
      result.safe = true;
      result.choice = {
        id: 'floor1',
        title: loc.name + '：先搜哪儿？',
        text: '门开着，里面比想象中安静。三条路，只能挑一条。' +
          (SF.quoteOf(state, party[party.length - 1].id)
            ? '<br>' + SF.quoteOf(state, party[party.length - 1].id)
            : ''),
        options: []
      };

      var plans = C.floorOne || [];
      for (i = 0; i < plans.length; i++) {
        result.choice.options.push({
          key: plans[i].key,
          label: plans[i].label,
          desc: plans[i].desc
        });
      }
    } else if (depth === 2) {
      // 第二阶段：基础物资，小概率受伤
      if (locId === 'store') {
        giveHaul(haul, 'food', rnd(1, 2));
        if (roll(0.6)) giveHaul(haul, 'water', 1);
        if (roll(0.3)) giveHaul(haul, 'medicine', 1);
        result.lines.push('货架上还剩几罐没过期的八宝粥，你们抱了两罐出来，顺手又拿了一瓶水。');
      } else if (locId === 'garage') {
        giveHaul(haul, 'material', rnd(2, 3));
        if (roll(0.5)) giveHaul(haul, roll(0.5) ? 'food' : 'water', 1);

        if (!state.items.gasMask && keyRoll(state, 'mask', 0.5, 2)) {
          state.items.gasMask = true;
          result.item = { key: 'mask', name: '防毒面具' };
          result.items.push({ key: 'mask', name: '防毒面具' });
          result.lines.push('车库深处的箱子里压着一副防毒面具，镜片还没裂。（解锁：医务室）');
        }

        if (!state.items.radio && !state.items.radioBroken &&
            keyRoll(state, 'radioBroken', 0.5, 3)) {
          state.items.radioBroken = true;
          result.lines.push('墙角堆着报废的电器，你们拖出一台摔过的收音机，也许还能修。');
        }

        if (!hasChen && roll(0.5)) {
          giveHaul(haul, 'material', 1);
          result.lines.push('你们在废电箱里翻出一块还能用的木板。（木板 +1）');
        }

        result.lines.push('车库外圈全是拆下来的木板和铁皮，能搬的都搬了。');
      } else if (locId === 'clinic') {
        var med = hasLin ? 3 : (roll(0.7) ? 2 : 1);
        if (med) giveHaul(haul, 'medicine', med);
        result.lines.push(med >= 2
          ? (hasLin ? '林晓看懂了说明书，挑出三份还能用的药。' : '你们在输液室的柜台里翻出两份药。')
          : '药柜被人翻得七七八八，你们只找到一份药。');

        if (!state.items.weapon && keyRoll(state, 'weapon', 0.4, 3)) {
          state.items.weapon = true;
          result.lines.push('处置室的墙角靠着一把防暴叉，你们把它带上了。（武器到手，可进保安亭）');
        }
      } else if (locId === 'guard') {
        giveHaul(haul, 'material', rnd(1, 2));
        giveHaul(haul, 'food', 1);
        result.lines.push('保安亭外圈只剩下散落的装备和弹药箱，你们顺手带走一份口粮。');
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
      if (locId === 'guard') {
        if (hasTie || hasWeapon) {
          result.item = { key: 'flare', name: '信号弹' };
          result.items.push({ key: 'flare', name: '信号弹' });
          result.lines.push(SF.grabFlare(state));
          giveHaul(haul, 'material', rnd(2, 3));
          giveHaul(haul, roll(0.5) ? 'food' : 'water', 1);

          if (hasWeapon) {
            state.items.weapon = true;
            result.lines.push('你们端着枪把守在门口的人全赶跑了，信号弹和一把手枪都到手了。');
          } else {
            result.lines.push('铁柱撞开保安亭的门，你们在柜子里拿到了信号弹。');
          }
        } else {
          result.lines.push('保安亭里的人根本不讲理，你们被追着打了出来，什么都没抢到。');
        }
      } else if (locId === 'garage') {
        giveHaul(haul, 'material', hasTorch ? 4 : rnd(2, 3));
        if (hasTorch) {
          giveHaul(haul, 'food', 1);
          giveHaul(haul, 'water', 1);
          result.lines.push('手电照到了车库最里面的储物架，还多翻出吃的和水。');
        }
        if (roll(0.5)) {
          state.items.flashlight = true;
          result.lines.push('在车库最里面翻到一只手电筒。');
        }
        result.lines.push(hasTorch
          ? '手电照着车库最深处的货架，你们把能带的都搬了。'
          : '车库里黑得伸手不见五指，你们只能胡乱抓了几把。');
      } else if (locId === 'clinic') {
        var medDeep = hasLin ? 5 : (roll(0.6) ? 2 : 1);
        if (medDeep) giveHaul(haul, 'medicine', medDeep);
        result.lines.push(medDeep >= 2
          ? '林晓摸进输液室最里面，抱出好几盒还能用的药。'
          : '越往里越黑，你们只摸到一盒药就退了出来。');
      } else {
        giveHaul(haul, 'food', 2);
        giveHaul(haul, 'water', rnd(1, 2));
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
        // 娜娜：交涉成功率 80%，成功则免伤并抢回物资
        var nanaChance = (C.traits && C.traits.nanaNegotiate) || 0.8;
        var matesAlive = SF.aliveAll(state);
        for (i = 0; i < matesAlive.length; i++) {
          matesAlive[i].mood = clamp(matesAlive[i].mood + 10, 0, C.maxStat);
        }
        if (roll(nanaChance)) {
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
          SF.recordGrave(state, robbed.name, '被暴徒打成重伤');
        }
      }
    }

    // ===== 职业被动：严格按设定执行 =====
    if (hasChen) {
      // 陈默不擅长搬运：食物和水最多各背 2 件
      if ((haul.food || 0) > 2) haul.food = 2;
      if ((haul.water || 0) > 2) haul.water = 2;
    }

    if (hasLin && depth >= 2 && roll(0.5)) {
      // 林晓：进到深处才认得草药，偶尔多带回一份药品
      giveHaul(haul, 'medicine', 1);
      result.lines.push('林晓认出了草药和化学试剂，多带回一份药品。');
    }

    // 林晓心细：翻东西时能捞到杀虫剂这类零碎
    if (hasLin && depth >= 2) {
      if (!state.items.pesticide && roll(0.25)) {
        state.items.pesticide = true;
        result.lines.push('林晓在角落里找到半罐杀虫剂，说通风口用得着。');
      }
    }

    if (hasTie && depth >= 2) {
      // 铁柱：体力充沛，进到深处食物和木板各多带 2
      giveHaul(haul, 'food', 2);
      giveHaul(haul, 'material', 2);
      result.lines.push(flavor('winTie'));
    }

    // 组队加成（很小）：人越多越稳，但不会明显变多
    var partyBoost = 1 + 0.15 * (party.length - 1);
    for (var bk in haul) {
      if (!haul.hasOwnProperty(bk)) continue;
      haul[bk] = Math.max(1, Math.round(haul[bk] * partyBoost));
    }

    // 今日状况：沙尘暴之类会让收获打折
    var todayCond = SF.condFor(state);
    var condMult = (todayCond && todayCond.lootMult) ? todayCond.lootMult : 1;

    if (condMult !== 1) {
      for (var ck in haul) {
        if (!haul.hasOwnProperty(ck)) continue;

        var qty = haul[ck];
        if (qty <= 0) continue;

        if (qty === 1) {
          // 只有一件的东西：按概率直接丢在半路
          if (Math.random() > condMult) haul[ck] = 0;
        } else {
          haul[ck] = Math.max(1, Math.round(qty * condMult));
        }
      }
      result.lines.push('今天的' + todayCond.name + '让视野很差，能带回来的东西少了一截。');
    }
    // 危险事件：第一层绝对安全，第二层小概率，
    // 第三层受伤概率明显变高，但不再是“必受伤”
    var riskChance = depth <= 1 ? 0 : (depth === 2 ? 0.12 : (C.explore.deepRisk || 0.55));

    if (loc.id === 'guard' && depth >= 3 && !hasTie && !hasWeapon) {
      riskChance = C.explore.deepGuardRisk || 0.8;
    }

    // 极端恶性事件：只有摸到最深一层才会碰上，碰上就直接没命（约 2%，娜娜在减半）
    var fatalChance = depth >= 3 ? (C.explore.fatalChance || 0) : 0;
    if (hasNana) fatalChance = fatalChance * 0.5;
    var deepTragedy = [
      '最里面的天花板忽然塌下来，{n} 被压在下面，等你们把人挖出来，人已经没气了。',
      '老地板塌了一大块，{n} 直接掉了下去，底下是空的。',
      '一股泄漏的煤气被手电照到就烧了起来，{n} 没能跑出来。'
    ];
    if (loc.id === 'guard' && hasWeapon) {
      riskChance = 0;
    }
    if (hasWeapon) riskChance = riskChance * 0.5;

    // 娜娜在队里：流浪狗这类危险事件也不会受伤
    if (hasNana) riskChance = 0;

    if (loc.far && depth === 2) riskChance += 0.06;

    if (fatalChance && roll(fatalChance)) {
      var doomed = pickOne(party);

      doomed.hp = 0;
      doomed.alive = false;
      doomed.mad = false;

      result.died = true;
      result.lines.push(pickOne(deepTragedy).replace('{n}', doomed.name));
      SF.addLog(state, doomed.name + ' 在最里面出了意外，没能回来。');
      SF.recordGrave(state, doomed.name, '深层意外');

      SF.checkOver(state, state.day);
    } else if (roll(riskChance)) {
      var victim = pickOne(party);
      var protector = null;
      for (i = 0; i < party.length; i++) {
        if (party[i].id !== victim.id) {
          protector = party[i];
          break;
        }
      }

      var hurtHp = depth >= 3 ? (C.explore.deepHp || 40) : C.explore.injuryHp;
      victim.hp = clamp(victim.hp - hurtHp, 0, C.maxStat);
      victim.injured = true;
      victim.mood = clamp(victim.mood - 6, 0, C.maxStat);
      result.injured.push({ name: victim.name, hp: hurtHp });

      if (victim.hp <= 0) {
        victim.alive = false;
        result.died = true;
        SF.addLog(state, victim.name + ' 伤得太重，没能撑回避难所。');
        SF.recordGrave(state, victim.name, '重伤不治');
        SF.checkOver(state, state.day);
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
    if (roll(0.08)) {
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
          '的袖子不肯松手，说只求一口吃的。' +
          (SF.raidTalk(state, state.lastExpedition ? state.lastExpedition.ids : [], 'empty')
            ? '<br>' + SF.raidTalk(state, state.lastExpedition ? state.lastExpedition.ids : [], 'empty')
            : ''),
        options: [
          { key: 'give', label: '给她 1 份食物', disabled: (state.supplies.food || 0) < 1 },
          { key: 'refuse', label: '狠心拒绝' }
        ]
      };
    }

    // 主线最后一步：信号弹（第 2 层开始有机会，最多两趟必出）
    if (loc.id === 'guard' && depth >= 2 && !state.items.flare &&
        keyRoll(state, 'flare', depth >= 3 ? 0.6 : 0.3, 2)) {
      result.item = { key: 'flare', name: '信号弹' };
      result.items.push({ key: 'flare', name: '信号弹' });
      result.lines.push('你们在保安亭的柜子底下摸到两发信号弹，小心地收进背包。');
      result.lines.push(SF.grabFlare(state));
    }

    // 破收音机：车库第 2 层就有机会出（最多两三趟必出），保安亭深层也能翻到
    if ((loc.id === 'garage' || loc.id === 'guard') &&
        !state.items.radio && !state.items.radioBroken &&
        depth >= 2 && keyRoll(state, 'radioBroken', 0.5, 3)) {
      state.items.radioBroken = true;
      result.lines.push('临走时在' + loc.name + '角落里翻出一台破损的收音机，也许还能修。');
    }

    // 医务室：没戴防毒面具的人可能染病；戴了面具绝对不会
    if (loc.id === 'clinic') {
      for (i = 0; i < party.length; i++) {
        var pMask = party[i];
        if (pMask.hasMask || pMask.sick || pMask.charId === 'lin') continue;

        if (roll(0.25)) {
          pMask.sick = true;
          result.lines.push(pMask.name + ' 从医务室出来就开始咳嗽，多半是染上了。（已生病）');
        }
      }
    }

    // 关键道具：手电筒（便利店最容易翻到）、双肩包、深层偶尔的武器
    if ((loc.id === 'store' || loc.id === 'guard') && depth >= 2) {
      if (!state.items.flashlight && keyRoll(state, 'flashlight', 0.4, 3)) {
        state.items.flashlight = true;
        result.lines.push('在' + loc.name + '的角落翻出一支手电筒，还能亮。（解锁：公寓地下车库）');
      } else if (!state.items.backpack && roll(0.25)) {
        state.items.backpack = true;
        result.lines.push('找到一只还能用的双肩包，肩带没烂。');
      }

      if (!state.items.weapon && depth >= 3 && keyRoll(state, 'weapon', 0.25, 4)) {
        state.items.weapon = true;
        result.lines.push('货架最里面压着一根钢管，你们把它扛了回来。（武器到手）');
      }
    }

    // 每种物资各自有个上限（铁柱的 +2 不算在封顶里），总量再由临时背包卡住
    var caps = C.lootCaps || {};
    var capBonus = hasTie ? 2 : 0;
    var capFood = (caps.food === undefined ? 4 : caps.food) + capBonus;
    var capMaterial = (caps.material === undefined ? 4 : caps.material) + capBonus;

    if ((haul.food || 0) > capFood) haul.food = capFood;
    if ((haul.water || 0) > (caps.water === undefined ? 4 : caps.water)) {
      haul.water = caps.water === undefined ? 4 : caps.water;
    }
    if ((haul.medicine || 0) > (caps.medicine === undefined ? 3 : caps.medicine)) {
      haul.medicine = caps.medicine === undefined ? 3 : caps.medicine;
    }
    if ((haul.material || 0) > capMaterial) haul.material = capMaterial;

    // 情报贩子买来的情报：今天这一趟的收获翻倍
    if ((state.lootBonus || 1) > 1) {
      for (var lb in haul) {
        if (!haul.hasOwnProperty(lb)) continue;
        haul[lb] = Math.max(1, Math.round(haul[lb] * state.lootBonus));
      }
      result.lines.push('情报没白买，这一趟摸到的东西比平时多一倍。');
    }

    // 关卡：必须由玩家自己决定要不要花物资，绝不自动扣
    if (depth >= 2 && roll(0.5)) {
      var gk = pickOne(['pit', 'fireDoor', 'wound', 'dust', 'gas', 'dog', 'survivor', 'zombie', 'generator', 'bomb']);

      if (gk === 'pit' || gk === 'fireDoor') {
        result.choice = {
          id: 'gate',
          kind: 'mat',
          title: gk === 'pit' ? '塌陷的路面' : '卡死的防火门',
          text: gk === 'pit'
            ? '前面的路面塌陷了，下面全是尖刺。要用 2 块木板搭个桥才能过去。'
            : '这扇门被重物卡死了，需要 2 块木板当撬棍。',
          options: [
            { key: 'gatePay', label: '消耗 2 块木板继续', disabled: (state.supplies.material || 0) < 2 },
            { key: 'gateRetreat', label: '原路返回（见好就收）' }
          ]
        };
      } else if (gk === 'wound' || gk === 'dust' || gk === 'gas') {
        var wounded = pickOne(party);
        result.choice = {
          id: 'gate',
          kind: 'water',
          victimId: wounded.id,
          title: gk === 'wound' ? '被感染的伤口' : (gk === 'gas' ? '剧毒气体' : '扬尘废墟'),
          text: gk === 'wound'
            ? wounded.name + ' 不小心划伤了腿，伤口很脏。需要用 1 瓶水冲洗，否则会生病。'
            : (gk === 'gas'
              ? '通道里弥漫着剧毒气体，需要防毒面具；没有面具的话，只能用 1 瓶水打湿布条捂住口鼻。'
              : '这里到处都是灰尘，呛得人无法呼吸。需要用 1 瓶水打湿布条捂住口鼻才能继续搜。'),
          options: [
            { key: 'gatePay', label: '消耗 1 瓶水继续', disabled: (state.supplies.water || 0) < 1 },
            { key: 'gateRetreat', label: '原路返回（见好就收）' }
          ]
        };
      } else if (gk === 'zombie') {
        result.choice = {
          id: 'gate',
          kind: 'food',
          title: '挡路的丧尸',
          text: '一只丧尸挡住了去路。可以用 1 份食物把它引开，也可以让带武器的人直接解决。',
          options: [
            { key: 'gatePay', label: '消耗 1 份食物引开', disabled: (state.supplies.food || 0) < 1 },
            { key: 'gateRetreat', label: '原路返回（见好就收）' }
          ]
        };
      } else if (gk === 'bomb') {
        result.choice = {
          id: 'gate',
          kind: 'bomb',
          title: '未爆弹与军用运输车',
          text: '一辆翻倒的军用运输车旁躺着一枚未爆弹，车厢里全是没拆封的口粮和武器。拆解有 60% 概率直接引爆。',
          options: [
            { key: 'gatePay', label: '强行拆解（60% 爆炸）' },
            { key: 'gateRetreat', label: '太危险，见好就收' }
          ]
        };
      } else if (gk === 'dog') {
        result.choice = {
          id: 'gate',
          kind: 'dog',
          title: '快渴死的流浪狗',
          text: '一只瘦骨嶙峋的狗挡在路中间，看着你们的水瓶。给它 1 瓶水，它可能会带路。',
          options: [
            { key: 'gatePay', label: '给它 1 瓶水', disabled: (state.supplies.water || 0) < 1 },
            { key: 'gateRetreat', label: '绕路离开' }
          ]
        };
      } else if (gk === 'survivor') {
        result.choice = {
          id: 'gate',
          kind: 'food',
          title: '饥饿的幸存者',
          text: '一个瘦脱相的男人求你们给口吃的，他愿意用情报交换。',
          options: [
            { key: 'gatePay', label: '给他 1 份食物', disabled: (state.supplies.food || 0) < 1 },
            { key: 'gateRetreat', label: '无视他离开' }
          ]
        };
      } else {
        result.choice = {
          id: 'gate',
          kind: 'weapon',
          title: '破旧的老式发电机',
          text: '如果拆下这里的零件，需要 1 把武器来撬开，但武器会损坏。',
          options: [
            { key: 'gatePay', label: '牺牲武器换零件' },
            { key: 'gateRetreat', label: '直接略过' }
          ]
        };
      }
    }

    if (false && depth >= 2 && roll(0.5)) {
      var gateKind = pickOne([
        'fence', 'mother', 'generator', 'pit', 'fireDoor', 'wound', 'dust', 'dog', 'survivor'
      ]);
      var gateAlive = SF.aliveAll(state);

      if (gateKind === 'fence' || gateKind === 'fireDoor' || gateKind === 'pit') {
        var needMat = gateKind === 'pit' ? 2 : 2;
        var gname = gateKind === 'fence' ? '倒塌的铁栅栏' : (gateKind === 'fireDoor' ? '被重物卡死的防火门' : '塌陷的深坑');
        var actor = party[0];

        if ((state.supplies.material || 0) >= needMat) {
          state.supplies.material = Math.max(0, Math.round(state.supplies.material - needMat));
          giveHaul(haul, 'medicine', 1);
          result.lines.push(gname + '挡在前面，你们用 ' + needMat +
            ' 块木板搭了个临时通道过去，顺手摸到一份药。（木板 -' + needMat + '，药品 +1）');
        } else {
          for (i = 0; i < gateAlive.length; i++) {
            gateAlive[i].mood = clamp(gateAlive[i].mood - 6, 0, C.maxStat);
          }
          result.lines.push('因为找不到木板，' + actor.name + '只能眼睁睁看着对面的物资，狠狠锤了一下墙。（全员心情 -6）');
        }
      } else if (gateKind === 'mother') {
        if ((state.supplies.food || 0) >= 1) {
          state.supplies.food = Math.max(0, Math.round(state.supplies.food - 1));
          for (i = 0; i < gateAlive.length; i++) {
            gateAlive[i].mood = clamp(gateAlive[i].mood + 10, 0, C.maxStat);
          }
          result.lines.push('一个抱着孩子的女人在路边乞求，你给了她 1 份食物。（食物 -1，全员心情 +10）');
        } else {
          for (i = 0; i < gateAlive.length; i++) {
            gateAlive[i].mood = clamp(gateAlive[i].mood - 10, 0, C.maxStat);
          }
          var chased = pickOne(party);
          chased.hp = clamp(chased.hp - 20, 0, C.maxStat);
          chased.injured = true;
          result.injured.push({ name: chased.name, hp: 20 });
          result.lines.push('你们没有东西给她，她的哭声引来了丧尸，' + chased.name +
            '被追着咬伤。（全员心情 -10，' + chased.name + ' 血量 -20）');
        }
      } else if (gateKind === 'wound' || gateKind === 'dust') {
        var hurtOne = pickOne(party);

        if ((state.supplies.water || 0) >= 1) {
          state.supplies.water = Math.max(0, Math.round(state.supplies.water - 1));
          result.lines.push((gateKind === 'wound'
            ? hurtOne.name + '的腿被划开一道口子，你们用 1 瓶水冲干净了伤口。'
            : '这里的灰尘呛得人无法呼吸，你们用 1 瓶水打湿布条捂住口鼻才继续往里走。') +
            '（水 -1）');
        } else {
          hurtOne.hp = clamp(hurtOne.hp - 30, 0, C.maxStat);
          hurtOne.sick = true;
          hurtOne.injured = true;
          result.injured.push({ name: hurtOne.name, hp: 30 });
          result.lines.push('没有水给' + hurtOne.name + '冲洗，林晓只能撕下自己的衣服内衬帮他包扎。' +
            hurtOne.name + '咬着牙，疼得满头大汗。（' + hurtOne.name + ' 血量 -30，已发烧）');
        }
      } else if (gateKind === 'dog') {
        if ((state.supplies.water || 0) >= 1) {
          state.supplies.water = Math.max(0, Math.round(state.supplies.water - 1));
          giveHaul(haul, 'food', 1);
          result.lines.push('一只瘦骨嶙峋的狗挡在路口，你们给了它 1 瓶水。' +
            '它摇着尾巴带你们绕到后面，那里有半袋吃的。（水 -1，食物 +1）');
        } else {
          result.lines.push('一只瘦骨嶙峋的狗挡在路口，你们连水都没有，只能绕远路。');
        }
      } else if (gateKind === 'survivor') {
        if ((state.supplies.food || 0) >= 1) {
          state.supplies.food = Math.max(0, Math.round(state.supplies.food - 1));
          result.deepBonus = true;
          result.lines.push('一个瘦脱相的男人求你们给口吃的，他愿意用情报交换。' +
            '（食物 -1，下一层物资翻倍）');
        } else {
          for (i = 0; i < gateAlive.length; i++) {
            gateAlive[i].mood = clamp(gateAlive[i].mood - 10, 0, C.maxStat);
          }
          result.lines.push('你们连一口吃的都拿不出来，只能低着头从他身边走过。（全员心情 -10）');
        }
      } else if (gateKind === 'generator') {
        var armed = null;
        for (i = 0; i < party.length; i++) {
          if (party[i].hasWeapon) armed = party[i];
        }

        if (armed) {
          giveHaul(haul, 'material', 2);
          result.lines.push('拆开老式发电机需要撬棍，' + armed.name +
            '用武器把外壳撬开，拆下几块还能用的木板。（木板 +2）');
        } else {
          result.lines.push('一台老式发电机躺在墙角，没有武器撬不开，只能绕过。');
        }
      }
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
        SF.recordGrave(state, p.name, '没能回来');
      }
    }

    // 陈默的天赋：会拆会拼，进到深处能翻出更多木板
    if (depth >= 2 && hasChen) {
      giveHaul(haul, 'material', loc.id === 'garage' ? 2 : 1);
      result.lines.push('陈默把角落里的破箱子和铁皮架拆开，挑出几块还能用的木板。（木板 +' +
        (loc.id === 'garage' ? 2 : 1) + '）');
    }

    // 背包有概率在深处捡到
    if ((loc.id === 'garage' || loc.id === 'guard') && depth >= 2 &&
        !state.items.backpack && roll(0.3)) {
      state.items.backpack = true;
      result.item = result.item || { key: 'backpack', name: '双肩包' };
      result.items.push({ key: 'backpack', name: '双肩包' });
      result.lines.push('箱子底下压着一只还能用的双肩包，肩带没烂。（装备后负重 +2）');
    }

    // 今天出门的记录（写日记用）
    if (!state.todayRecap) state.todayRecap = { trips: [] };
    state.todayRecap.trips.push({
      loc: loc.name,
      party: result.partyNames.slice(),
      loot: result.loot.slice(),
      hurt: result.injured.map(function (v) { return v.name; }),
      died: !!result.died
    });

    state.lastEvent = result.lines[result.lines.length - 1] || '';
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

        // 三天后她会回来还这份人情
        if (!state.delayed) state.delayed = [];
        state.delayed.push({ kind: 'womanReturn', due: state.day + 3 });
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
        if (!state.items.backpack) state.items.backpack = true;
        result.lines.push('你们把他的背包翻了个底朝天，拿走 ' + bonus +
          ' 份食物和一点药品，那只结实的双肩包也归你们了。（装备后负重 +2）');
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

    if (result.choice.id === 'floor1') {
      var plans = C.floorOne || [];
      var plan = plans[0] || { items: 1, risk: 0, hp: 0 };

      for (i = 0; i < plans.length; i++) {
        if (plans[i].key === key) plan = plans[i];
      }

      var locLoot = (result.location && result.location.loot) || {};
      var pool = [];
      var lk;

      for (lk in locLoot) {
        if (!locLoot.hasOwnProperty(lk)) continue;
        if (!locLoot[lk] || locLoot[lk][1] <= 0) continue;
        pool.push(lk);
      }
      if (!pool.length) pool = ['food', 'water', 'material'];

      var haul = {};
      var count = plan.items || 0;

      // 第一层：大概率空手（普通角色）
      if (plan.empty && roll(plan.empty)) count = 0;
      else if (plan.extra && roll(plan.extra)) count += 1;

      for (i = 0; i < count; i++) {
        giveHaul(haul, pickOne(pool), 1);
      }

      result.lines.push(count
        ? '你们挑了' + String(plan.label || '一条路').replace(/（.*?）/g, '') +
          '，摸到 ' + count + ' 件东西。'
        : '你们挑了' + String(plan.label || '一条路').replace(/（.*?）/g, '') +
          '，翻了半天，什么都没找到。');

      if (plan.risk && roll(plan.risk)) {
        var pid = result.partyIds.length ? pickOne(result.partyIds) : '';
        var hurtOne = SF.find(state, pid);

        if (hurtOne) {
          hurtOne.hp = clamp(hurtOne.hp - (plan.hp || 15), 0, C.maxStat);
          hurtOne.injured = true;
          result.injured.push({ name: hurtOne.name, hp: plan.hp || 15 });
          result.lines.push('里面有别的东西。' + hurtOne.name + ' 被砸中了，血顺着袖口往下滴。' +
            '（血量 -' + (plan.hp || 15) + '）');
        }
      }

      applyHaul(state, haul, result);
    }

    if (result.choice.id === 'gate') {
      var gate = result.choice;

      if (key === 'gatePay') {
        if (gate.kind === 'mat') {
          state.supplies.material = Math.max(0, Math.round(state.supplies.material - 2));
          state.supplies.medicine = Math.max(0, Math.round((state.supplies.medicine || 0) + 1));
          result.lines.push('你们用 2 块木板搭了条通道过去，在深处摸到一份药。（木板 -2，药品 +1）');
        } else if (gate.kind === 'water') {
          state.supplies.water = Math.max(0, Math.round(state.supplies.water - 1));
          var woundedS = SF.find(state, gate.victimId);
          if (woundedS) woundedS.injured = true;
          result.lines.push('你们用 1 瓶水清理了伤口，继续往里走。（水 -1）');
        } else if (gate.kind === 'dog') {
          state.supplies.water = Math.max(0, Math.round(state.supplies.water - 1));
          state.supplies.food = Math.max(0, Math.round((state.supplies.food || 0) + 1));
          result.lines.push('狗喝了水，摇着尾巴带你们绕到后面，那里有半袋吃的。（水 -1，食物 +1）');
        } else if (gate.kind === 'food') {
          state.supplies.food = Math.max(0, Math.round(state.supplies.food - 1));
          result.deepBonus = true;
          result.lines.push('男人收下食物，把下一层的物资分布画给了你们。（食物 -1，下一层物资翻倍）');
        } else if (gate.kind === 'bomb') {
          if (roll(0.6)) {
            var blast = pickOne(party);
            blast.hp = clamp(blast.hp - 40, 0, C.maxStat);
            blast.injured = true;
            result.injured.push({ name: blast.name, hp: 40 });
            result.lines.push('拆到一半引信烧了起来，' + blast.name +
              '被爆炸掀翻在地，你们只能拖着他撤出。（' + blast.name + ' 血量 -40）');
          } else {
            state.supplies.food = Math.max(0, Math.round((state.supplies.food || 0) + 3));
            state.items.weapon = true;
            result.lines.push('你屏住呼吸拆掉了引信，车厢里的口粮和一把武器全归你们了。（食物 +3，武器到手）');
          }
        } else if (gate.kind === 'weapon') {
          var breaker = null;
          for (i = 0; i < state.survivors.length; i++) {
            if (state.survivors[i].alive && state.survivors[i].hasWeapon) breaker = state.survivors[i];
          }
          if (breaker) {
            state.supplies.material = Math.max(0, Math.round((state.supplies.material || 0) + 2));
            result.lines.push(breaker.name + ' 用武器把发电机撬开，拆下几块木板。（木板 +2）');
          } else {
            result.lines.push('没有武器撬不开，只能绕过发电机。');
          }
        }
      } else {
        result.hardStop = true;
        result.lines.push('因为没有木板搭桥，你们只能眼睁睁看着深处的物资，无奈撤退。');
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

    // 单槽：会先把身上别的装备换下来
    SF.toggleGear(state, id, 'mask');
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

      // 饥饿或口渴满 100：每晚重创 40 血（不直接判死，只扣血；血归零才死）
      if (s.hunger >= C.maxStat) dmg += 40;
      if (s.thirst >= C.maxStat) dmg += 40;

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

    // 夜里的事件会真的改血、改心情：把结算表里的数字重新读一遍，
    // 不然玩家在结算里看到的还是事件发生前的数字（明明掉了血却显示 0）
    for (i = 0; i < report.rows.length; i++) {
      var rr = report.rows[i];
      var rs = SF.find(state, rr.id);

      if (!rs) continue;

      rr.hpAfter = rs.hp;
      rr.moodAfter = rs.mood;
      rr.hungerAfter = rs.hunger;
      rr.thirstAfter = rs.thirst;
      rr.sick = rs.sick;
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

    // 夜里一半是坏事、一半是好事
    var BAD_POOL = ['sick', 'scare', 'cold', 'badCan',
      'acidRain', 'rats', 'zombieDoor'];
    var GOOD_POOL = ['shelter', 'gift', 'radioMood', 'rainWater',
      'guest', 'neighborTV', 'leak'];

    var moodSum = 0;
    for (i = 0; i < alive.length; i++) moodSum += alive[i].mood;
    if (alive.length >= 2 && (state.supplies.food || 0) > 0 &&
        (moodSum / alive.length) < 30) {
      BAD_POOL.push('fightMood');
    }
    if (madCand) BAD_POOL.push('mad', 'mad');
    if (alive.length >= 2) BAD_POOL.push('fight');

    var used = {};

    // 冲刺阶段：夜里的事更多，一天两件起
    var count = (C.events.finalFrom && state.day >= C.events.finalFrom)
      ? 2
      : rnd(1, 2);

    // 今日状况：尸潮之类的，夜里再多来一件，并且一定有它承诺的那件事
    var nightCond = SF.condFor(state);
    if (nightCond && nightCond.nightExtra) count += nightCond.nightExtra;

    var forcedKind = (nightCond && nightCond.forceNight) ? nightCond.forceNight : '';

    for (var n = 0; n < count && (BAD_POOL.length || GOOD_POOL.length); n++) {
      var kind;

      if (n === 0 && forcedKind) {
        kind = forcedKind;
      } else {
        var src = roll(0.5) ? BAD_POOL : GOOD_POOL;
        if (!src.length) src = (src === BAD_POOL) ? GOOD_POOL : BAD_POOL;
        kind = src.length ? pickOne(src) : '';
      }

      if (!kind) break;
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
      } else if (kind === 'badCan') {
        state.supplies.food = Math.max(0, Math.round((state.supplies.food || 0) + 1));
        if (roll(0.5)) {
          for (i = 0; i < alive.length; i++) alive[i].hp = clamp(alive[i].hp - 20, 0, C.maxStat);
          list.push({ id: 'badCan', text: '翻出一罐过期的罐头，大家分着吃了，后半夜全在拉肚子。（食物 +1，全员血量 -20）' });
        } else {
          list.push({ id: 'badCan', text: '翻出一罐过期的罐头，闻着还行，吃下去居然没事。（食物 +1）' });
        }
      } else if (kind === 'fightMood') {
        var a1 = pickOne(alive);
        var b1 = alive[(alive.indexOf(a1) + 1) % alive.length];
        a1.hp = clamp(a1.hp - 20, 0, C.maxStat);
        b1.hp = clamp(b1.hp - 20, 0, C.maxStat);
        for (i = 0; i < alive.length; i++) alive[i].mood = clamp(alive[i].mood - 10, 0, C.maxStat);
        list.push({
          id: 'fightMood',
          text: a1.name + ' 和 ' + b1.name + ' 为了最后一个罐头大打出手，' +
            '两个人都见了血。（各 -20 血，全员心情 -10）'
        });
      } else if (kind === 'acidRain') {
        if ((state.supplies.material || 0) >= 2) {
          state.supplies.material = Math.max(0, Math.round(state.supplies.material - 2));
          list.push({ id: 'acidRain', text: '半夜下起酸雨，窗框被腐蚀，你们用 2 块木板修补好。（木板 -2）' });
        } else {
          for (i = 0; i < alive.length; i++) alive[i].hp = clamp(alive[i].hp - 20, 0, C.maxStat);
          list.push({ id: 'acidRain', text: '半夜下起酸雨，窗框被腐蚀，没有木板可修，雨水浇了进来。（全员血量 -20）' });
        }
      } else if (kind === 'rats') {
        if ((state.supplies.material || 0) >= 1) {
          state.supplies.material = Math.max(0, Math.round(state.supplies.material - 1));
          list.push({ id: 'rats', text: '老鼠啃坏了床脚，你们用 1 块木板把床重新钉住。（木板 -1）' });
        } else {
          for (i = 0; i < alive.length; i++) alive[i].mood = clamp(alive[i].mood - 15, 0, C.maxStat);
          list.push({ id: 'rats', text: '老鼠啃坏了床脚，没有木板可修，四个人挤在一张破床上。（全员心情 -15）' });
        }
      } else if (kind === 'zombieDoor') {
        if ((state.supplies.material || 0) >= 3 && !state.doorBroken) {
          state.supplies.material = Math.max(0, Math.round(state.supplies.material - 3));
          list.push({ id: 'zombieDoor', text: '门外传来沉重的脚步声，你们用 3 块木板把门死死钉住，一直撑到天亮。（木板 -3）' });
        } else {
          for (i = 0; i < alive.length; i++) {
            alive[i].hp = clamp(alive[i].hp - 30, 0, C.maxStat);
            if (roll(0.5)) alive[i].sick = true;
          }
          list.push({ id: 'zombieDoor', text: '门外传来沉重的脚步声，木板不够，门被撞开一条缝。（全员血量 -30，可能生病）' });
        }
      } else if (kind === 'leak') {
        state.supplies.water = Math.max(0, Math.round((state.supplies.water || 0) + 1));
        for (i = 0; i < alive.length; i++) {
          alive[i].mood = clamp(alive[i].mood - 5, 0, C.maxStat);
        }
        list.push({
          id: 'leak',
          text: flavor('leak') + '（水 +1，全员心情 -5）'
        });
      } else if (kind === 'neighborTV') {
        for (i = 0; i < alive.length; i++) {
          alive[i].mood = clamp(alive[i].mood + 5, 0, C.maxStat);
        }
        list.push({
          id: 'neighborTV',
          text: '不知哪户人家还有电，半夜放起了春晚重播。你们贴着墙听完了整段小品，谁都没说话。（全员心情 +5）'
        });
      } else if (kind === 'gift') {
        state.supplies.food = Math.max(0, Math.round((state.supplies.food || 0) + 2));
        list.push({ id: 'gift', text: '陈默在墙角的暗格里，意外翻出两份没有过期的罐头！（食物 +2）' });
      } else if (kind === 'radioMood') {
        if (state.items.radio) {
          for (i = 0; i < alive.length; i++) alive[i].mood = clamp(alive[i].mood + 15, 0, C.maxStat);
          list.push({ id: 'radioMood', text: '收音机突然收到一段信号，大家听得入神，像是有人还活着。（全员心情 +15）' });
        } else {
          list.push({ id: 'radioMood', text: '夜里只有杂音。没有收音机，谁也不知道外面还有没有人。' });
        }
      } else if (kind === 'rainWater') {
        state.supplies.water = Math.max(0, Math.round((state.supplies.water || 0) + 3));
        list.push({ id: 'rainWater', text: '半夜下了一场大雨，你们用盆接了不少干净水。（水 +3）' });
      } else if (kind === 'guest') {
        if ((state.supplies.material || 0) >= 1) {
          state.supplies.material = Math.max(0, Math.round(state.supplies.material - 1));
          state.supplies.water = Math.max(0, Math.round((state.supplies.water || 0) + 1));
          list.push({ id: 'guest', text: '一个流浪汉敲门想借宿，用 1 块木板修补漏风的地板作为交换。（木板 -1，水 +1）' });
        } else {
          list.push({ id: 'guest', text: '一个流浪汉敲门想借宿，你们连一块木板都拿不出来，只能让他走。' });
        }
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
      SF.addLog(state, hungryLine);
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

    if (loc.id === 'guard') {
      if (s.charId === 'tie' || s.hasWeapon) {
        return { text: '适合此地，能打', good: true };
      }
      return { text: '没有战斗力，极度危险', good: false };
    }

    if (loc.id === 'clinic') {
      if (s.charId === 'lin') return { text: '看得懂说明书，药品翻倍', good: true };
      if (s.hasMask) return { text: '有面具，不容易染病', good: true };
      return { text: '不太懂药，收益很低', good: false };
    }

    if (loc.id === 'garage') {
      if (s.hasTorch) return { text: '有手电，能搜满物资', good: true };
      if (s.charId === 'tie') return { text: '身强体壮，适合搬货', good: true };
      if (s.charId === 'chen') return { text: '会拆电子零件', good: true };
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
        text: '陈默梦见公寓地下车库里有一道暗门，醒来时路线还清清楚楚。',
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
      report.eventText = '地图上多了一个地方：公寓地下车库的暗门。';
      SF.addLog(state, '解锁了隐藏地点：车库暗门。');
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

  /* 把今天发生的事写成一篇日记（给日志面板用） */
  function daySummary(state, report) {
    var parts = [];
    var t = state.todayRecap;
    var i;
    var j;

    if (t && t.trips && t.trips.length) {
      var locs = [];
      var party = [];
      var loot = {};
      var hurt = [];

      for (i = 0; i < t.trips.length; i++) {
        var trip = t.trips[i];

        if (locs.indexOf(trip.loc) === -1) locs.push(trip.loc);

        for (j = 0; j < trip.party.length; j++) {
          if (party.indexOf(trip.party[j]) === -1) party.push(trip.party[j]);
        }

        for (j = 0; j < trip.loot.length; j++) {
          var l = trip.loot[j];
          loot[l.name] = (loot[l.name] || 0) + l.qty;
        }

        for (j = 0; j < trip.hurt.length; j++) {
          if (hurt.indexOf(trip.hurt[j]) === -1) hurt.push(trip.hurt[j]);
        }
      }

      var lootText = [];
      for (var k in loot) {
        if (loot.hasOwnProperty(k)) lootText.push(loot[k] + ' 份' + k);
      }

      parts.push('白天，' + party.join('、') + ' 去了' + locs.join('、') + '，' +
        (lootText.length ? '带回 ' + lootText.join('、') : '几乎是空手回来的') + '。');

      parts.push(flavor('trip'));

      if (hurt.length) parts.push(hurt.join('、') + ' 在路上挂了彩。');
    } else {
      parts.push('白天谁都没出门，所有人挤在屋里熬了一天。');
    }

    if (report && report.deaths && report.deaths.length) {
      parts.push(report.deaths.join('、') + ' 没能撑过这一夜。');
    }

    var fed = 0;
    var drank = 0;
    var hungry = [];
    var thirsty = [];
    var hungryId = '';
    var meals = state.meal || {};
    var aliveNow = SF.aliveAll(state);

    for (i = 0; i < aliveNow.length; i++) {
      var who = aliveNow[i];
      var mm = meals[who.id] || {};

      if (mm.eat) fed += 1;
      else {
        hungry.push(who.name);
        if (!hungryId) hungryId = who.id;
      }

      if (mm.drink) drank += 1;
      else thirsty.push(who.name);
    }

    // 晚饭写成人话，不再播报“几个人吃上了东西”
    if (hungry.length) {
      parts.push(flavor('hungry', SF.find(state, hungryId)));
    } else {
      parts.push(flavor('fed'));
    }

    if (thirsty.length) parts.push(flavor('thirsty'));

    // 有人生病
    var sickOne = null;
    for (i = 0; i < aliveNow.length; i++) {
      if (aliveNow[i].sick) {
        sickOne = aliveNow[i];
        break;
      }
    }
    if (sickOne) parts.push(flavor('sick', sickOne));

    // 屋顶漏水：随机一阵子，或者水见底的时候
    if (roll(0.35) || (state.supplies.water || 0) <= 1) {
      parts.push(flavor('leak'));
    }

    // 发疯边缘：写心情最低的那个人
    var fearOne = null;
    for (i = 0; i < aliveNow.length; i++) {
      if (!fearOne || aliveNow[i].mood < fearOne.mood) fearOne = aliveNow[i];
    }
    if (fearOne && fearOne.mood < 30) parts.push(flavor('fear', fearOne));

    if (report && report.events && report.events.length) {
      parts.push('夜里：' + report.events[0].text);
    } else {
      parts.push('夜里很安静，只有风声。');
    }

    if (state.questToday && state.questToday.length) {
      parts.push('主线推进：今天拿到了' + state.questToday.join('、') + '。');
    }

    return parts.join('');
  }

  SF.daySummary = daySummary;

  // 死因：按当晚最严重的问题给一句话
  function deathCauseOf(s) {
    if (!s) return '伤势过重';
    if (s.thirst >= 70) return '极度缺水';
    if (s.hunger >= 70) return '极度饥饿';
    if (s.sick) return '伤病不治';
    if (s.injured) return '重伤不治';
    return '伤势过重';
  }

  // 砸掉随机 N 件物资（发疯时用）
  function smashSupplies(state, n) {
    var keys = ['food', 'water', 'medicine', 'material'];
    var removed = 0;

    for (var t = 0; t < n * 4 && removed < n; t++) {
      var k = keys[Math.floor(Math.random() * keys.length)];
      if ((state.supplies[k] || 0) > 0) {
        state.supplies[k] = Math.max(0, Math.round(state.supplies[k] - 1));
        removed += 1;
      }
    }
    return removed;
  }

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

    if (!report.deathsList) report.deathsList = [];

    // 没吃 / 没喝：第二天早上头晕眼花，直接掉 10 血（先扣，扣完再统一判死）
    for (i = 0; i < report.rows.length; i++) {
      var mrow = report.rows[i];
      if (!mrow.fed || !mrow.drank) {
        var mWho = SF.find(state, mrow.id);
        if (mWho && mWho.alive && mWho.hp > 0) {
          mWho.hp = clamp(mWho.hp - 10, 0, C.maxStat);
          SF.addLog(state, mWho.name + ' 早上起来饿得头晕眼花，血量 -10。');
        }
      }
    }

    // 血掉到 0 的人：这一夜就算没撑过去，把死因记下来（死亡全屏警告要用）
    for (i = 0; i < state.survivors.length; i++) {
      var d = state.survivors[i];
      if (!d.alive || d.hp > 0) continue;

      d.alive = false;
      d.hp = 0;
      var deadRow = findRow(report.rows, d.id);
      if (deadRow) deadRow.died = true;
      var dCause = deathCauseOf(d);
      report.deaths.push(d.name);
      report.deathsList.push({ name: d.name, cause: dCause });
      SF.recordGrave(state, d.name, dCause);
      SF.addLog(state, d.name + ' 已死亡（' + dCause + '）。');
    }

    // 心情归零：大概率发疯出走（直接死），小概率砸掉两件物资
    for (i = 0; i < state.survivors.length; i++) {
      var mo = state.survivors[i];
      if (!mo.alive || mo.hp <= 0 || mo.mood > 0) continue;

      if (roll(0.6)) {
        mo.alive = false;
        mo.hp = 0;
        report.deaths.push(mo.name);
        report.deathsList.push({ name: mo.name, cause: '精神崩溃，半夜出走' });
        SF.recordGrave(state, mo.name, '精神崩溃，半夜出走');
        SF.addLog(state, mo.name + ' 精神崩溃，半夜推开门走了，再也没有回来。');
        var moRow = findRow(report.rows, mo.id);
        if (moRow) moRow.died = true;
      } else {
        var smashed = smashSupplies(state, 2);
        SF.addLog(state, mo.name + ' 把屋子砸了一通，' +
          (smashed ? '砸坏 ' + smashed + ' 件物资。' : '什么也没砸到。'));
      }
    }

    // 写下这一天的日记，然后换新的一天
    var todayNote = daySummary(state, report);
    if (!state.dayNotes) state.dayNotes = [];

    state.dayNotes.push({
      day: state.day,
      cond: SF.condFor(state).name,
      text: todayNote
    });
    if (state.dayNotes.length > 30) state.dayNotes.shift();

    report.dayNote = todayNote;

    state.dayLog = [];
    state.todayRecap = null;
    state.questToday = [];
    state.doorBroken = false;

    // 连续两天没人洗澡（也没吃上热食）：全员心情跌到 20 以下，直接逼疯
    if (state.bathedToday) {
      state.dirtyDays = 0;
    } else {
      state.dirtyDays = (state.dirtyDays || 0) + 1;
    }
    state.bathedToday = false;

    if (state.dirtyDays >= 2) {
      var dirtyList = SF.aliveAll(state);
      var dirtyCap = (C.night && C.night.dirtyToMood) || 10;

      for (var di = 0; di < dirtyList.length; di++) {
        dirtyList[di].mood = Math.min(dirtyList[di].mood, dirtyCap);
      }
      state.dirtyDays = 0;
      SF.addLog(state, '两天没洗澡，身上全是味儿。所有人的心情跌到谷底。');
    }

    state.day = state.day + 1;
    state.actionUsed = false;
    state.meal = {};
    state.todayFood = 0;
    state.todayWater = 0;
    state.searchedToday = {};
    state.exploredToday = false;

    // 新的一天：换一个今日状况（沙尘暴、暴雨、尸潮……）
    var cond = rollDailyCondition(state);
    report.condition = cond ? cond.name : '';

    // 新的一天：门口的人、情报加成、事件记录全部清空
    state.dayEventId = '';
    state.dayEventIdDay = 0;
    state.dayEventDone = 0;
    state.lootBonus = 1;

    for (i = 0; i < alive.length; i++) {
      if (alive[i].alive) alive[i].ap = 1;
    }

    // 木板改造的每天效果
    var up = state.upgrades || {};    if (up.bed) {
      for (i = 0; i < alive.length; i++) {
        if (alive[i].alive) alive[i].mood = SF.clamp(alive[i].mood + 5, 0, C.maxStat);
      }
    }
    if (up.barrel) {
      var rainBonus = state.condition === 'rain' ? 2 : 1;
      state.supplies.water = (state.supplies.water || 0) + rainBonus;
      SF.addLog(state, '接雨水的桶又满了：水 +' + rainBonus + '。');
    }

    // 之前答应过别人的事，到日子了
    if (state.delayed && state.delayed.length) {
      var keep = [];
      for (i = 0; i < state.delayed.length; i++) {
        var dv = state.delayed[i];
        if (!dv || (dv.due || 0) > state.day) {
          keep.push(dv);
          continue;
        }

        if (dv.kind === 'womanReturn') {
          state.supplies.medicine = (state.supplies.medicine || 0) + 1;
          state.supplies.water = (state.supplies.water || 0) + 1;
          for (var wi = 0; wi < alive.length; wi++) {
            if (alive[wi].alive) alive[wi].mood = SF.clamp(alive[wi].mood + 8, 0, C.maxStat);
          }
          state.morningNews = '天刚亮，门口放着一个布包：一瓶水、一盒药，还有半张写着“谢谢”的纸。是那天那个女人。';
          SF.addLog(state, '那个女人回来了，留下水 +1、药 +1。全员心情 +8。');
        }
      }
      state.delayed = keep;
    }

    // 身上难受，心情也跟着往下掉：血少、饿、渴、生病都会持续磨人
    for (i = 0; i < alive.length; i++) {
      if (!alive[i].alive) continue;

      var pen = 0;
      if (alive[i].hp < 40) pen += 3;
      if (alive[i].hunger >= 70) pen += 5;
      if (alive[i].thirst >= 70) pen += 5;
      if (alive[i].sick) pen += 3;

      if (!pen) continue;
      alive[i].mood = SF.clamp(alive[i].mood - pen, 0, C.maxStat);
    }

    // 撤离：拿到信号弹的第二天清晨；或者硬撑到第 30 天，也算熬到了头
    var hasFlare = !!state.items.flare;
    var dayThirty = state.day >= 30;
    var aliveNow = SF.aliveAll(state);

    if ((hasFlare && state.rescueDay && state.day >= state.rescueDay) || dayThirty) {
      state.over = true;
      state.overAtDay = state.day;
      state.won = aliveNow.length > 0;

      if (!state.won) {
        state.endingKind = 'nobody';
      } else if (dayThirty && !hasFlare) {
        state.endingKind = 'day30';
      } else if (SF.deadCount(state) > 0) {
        state.endingKind = 'scarred';
      } else {
        state.endingKind = 'perfect';
      }

      report.allDead = aliveNow.length === 0;
      report.milestone = state.won
        ? (state.endingKind === 'day30'
          ? '你们硬撑到了第 30 天，军方的搜救队终于找到了这栋楼。'
          : '信号弹升了空，直升机看见了你们。')
        : '信号弹升了空，楼顶上却再没有人站起来。';
      SF.addLog(state, report.milestone);

      return report;
    }

    report.allDead = checkOver(state, report.day);

    return report;
  };

  // 主线剧情：按“拿到了什么 / 去过哪儿”触发，不再按天数
  SF.storyFor = function (state) {
    if (!state.storyDone) state.storyDone = {};

    var s = state.storyDone;

    if (!s.intro && state.day <= 2) {
      s.intro = true;
      return {
        title: '封锁第一天',
        text: '这座城市已经封了。军方广播每天只重复一句话：“保持静默，等待下一步指令。”\n' +
          '没人告诉你们救援哪天来。先去把楼下便利店和小区绿化带翻一遍，' +
          '再想办法找到【手电筒】——车库里也许有能救命的东西。'
      };
    }

    if (state.items.flashlight && !s.garage) {
      s.garage = true;
      return {
        title: '公寓地下车库',
        text: '有了手电，地下车库不再是一片死黑。' +
          '去车库里翻木板、旧电器，也许还能找到防毒面具和一台摔坏的收音机。'
      };
    }

    if (state.items.radio && !s.radio) {
      s.radio = true;
      return {
        title: '收音机里的声音',
        text: '收音机终于响了。军方频道说得很清楚：救援只认信号弹，' +
          '谁在楼顶打出信号弹，第二天清晨直升机就来。\n' +
          '信号弹在小区保安亭。另外，医务室里还囤着药——戴着防毒面具才能进去。'
      };
    }

    if (state.seenClinic && !s.clinic) {
      s.clinic = true;
      return {
        title: '保安亭的信号弹',
        text: '医务室里的人说，保安亭被一伙带武器的暴徒占了，' +
          '柜子里锁着几发信号弹。\n' +
          '想进去，手里得有一样能打的东西。'
      };
    }

    if (state.items.flare && !s.flare) {
      s.flare = true;
      return {
        title: '最后一夜',
        text: '信号弹到手了。今天晚上照常过，谁都可能撑不过去。\n' +
          '明天清晨，直升机就来。'
      };
    }

    return null;
  };

  // 没收音机之前，消息靠楼道里的喊叫、窗外飘来的话
  var STREET_SHOUTS = [
    '楼道里有人在喊：“三楼还有人吗？应一声！”',
    '窗外有人一边跑一边喊：“别开门！别开门！”',
    '对面楼传来一声闷响，接着是孩子的哭声。',
    '楼下有人扯着嗓子喊：“水！谁家有水！”',
    '远处飘来一段走调的广播：“……请留在室内，不要外出……”',
    '隔壁阳台上有人敲盆，敲了很久才停。'
  ];

  SF.streetShout = function () {
    return STREET_SHOUTS[Math.floor(Math.random() * STREET_SHOUTS.length)];
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

  // 用木板改造避难所：钉床 / 接雨水 / 加固门
  SF.buildUpgrade = function (state, key) {
    if (!state.upgrades) state.upgrades = { bed: false, barrel: false, door: false };

    var cost = key === 'bed' ? 2 : (key === 'barrel' ? 1 : 3);
    var label = key === 'bed' ? '钉床' : (key === 'barrel' ? '接雨水' : '加固门');

    if (state.upgrades[key]) return { ok: false, msg: label + '已经做过了。' };

    if ((state.supplies.material || 0) < cost) {
      return { ok: false, msg: '木板不够，' + label + '要 ' + cost + ' 块。' };
    }

    state.supplies.material = Math.max(0, Math.round((state.supplies.material || 0) - cost));
    state.upgrades[key] = true;

    if (key === 'door') {
      state.defense = (state.defense || 0) + 2;
      return { ok: true, msg: '门被钉上了双层木板，防御 +2。' };
    }

    if (key === 'bed') {
      return { ok: true, msg: '床铺好了。从明天起，每天醒来全员心情 +5。' };
    }

    return { ok: true, msg: '水桶架好了，每天早上自动接水 +1（下雨 +2）。' };
  };

  // 在家做的事：捕鼠 / 翻储物柜 / 煮汤，都要占一个人的行动点
  SF.homeTask = function (state, key) {
    var who = null;
    var alive = SF.aliveAll(state);
    var i;

    for (i = 0; i < alive.length; i++) {
      if (alive[i].ap > 0 && !alive[i].mad) {
        who = alive[i];
        break;
      }
    }

    if (!who) return { ok: false, msg: '今天没人留在家里了，都在外面。' };

    if (key === 'trap') {
      who.ap = 0;

      if (Math.random() < 0.5) {
        state.supplies.food = (state.supplies.food || 0) + 1;
        SF.addLog(state, who.name + ' 在厨房角落摆了捕鼠夹，第二天收了上来。食物 +1。');
        return { ok: true, msg: who.name + ' 摆好陷阱，第二天早上真的夹到一只。收拾干净，多了一份食物。' };
      }

      SF.addLog(state, who.name + ' 守着陷阱熬了一晚，什么也没夹到。');
      return { ok: true, msg: who.name + ' 守了一晚，陷阱是空的。' };
    }

    if (key === 'storage') {
      if ((state.storageLeft || 0) <= 0) {
        return { ok: false, msg: '家里能翻的角落都翻遍了，连床底都空了。' };
      }

      who.ap = 0;
      state.storageLeft = Math.max(0, (state.storageLeft || 0) - 1);

      if (Math.random() < 0.5) {
        state.supplies.food = (state.supplies.food || 0) + 1;
        SF.addLog(state, who.name + ' 在储物柜最里面翻出一份还能吃的东西。食物 +1。');
        return { ok: true, msg: who.name + ' 在柜子最里面摸出一份还能吃的。食物 +1（还剩 ' + state.storageLeft + ' 处没翻）。' };
      }

      state.supplies.water = (state.supplies.water || 0) + 1;
      SF.addLog(state, who.name + ' 在床底翻出半箱没开封的矿泉水。水 +1。');
      return { ok: true, msg: who.name + ' 在床底翻出半箱没过期的水。水 +1（还剩 ' + state.storageLeft + ' 处没翻）。' };
    }

    if (key === 'soup') {
      if ((state.supplies.food || 0) < 1 || (state.supplies.water || 0) < 1) {
        return { ok: false, msg: '煮汤要 1 份食物和 1 瓶水，现在不够。' };
      }

      who.ap = 0;
      state.supplies.food = Math.round((state.supplies.food || 0) - 1);
      state.supplies.water = Math.round((state.supplies.water || 0) - 1);

      var pot = SF.aliveAll(state);
      for (i = 0; i < pot.length; i++) {
        pot[i].hunger = SF.clamp(pot[i].hunger - 20, 0, C.maxStat);
        pot[i].thirst = SF.clamp(pot[i].thirst - 20, 0, C.maxStat);
        pot[i].mood = SF.clamp(pot[i].mood + 5, 0, C.maxStat);
      }

      SF.addLog(state, who.name + ' 用一份食物和一瓶水煮了一锅汤。全员饥饿 -20、口渴 -20、心情 +5。');
      return { ok: true, msg: '一锅热汤下了肚。全员饥饿 -20、口渴 -20、心情 +5。' };
    }

    return { ok: false, msg: '' };
  };

  SF.homeAction = function (state, type) {    var alive = SF.aliveAll(state);
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
        text: '陈默梦见公寓地下车库里有一道暗门，醒来时路线还清清楚楚。',
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
      lines.push('地图上多了一个地方：公寓地下车库的暗门。');
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
    state.bathedToday = true;
    SF.addLog(state, s.name + '洗了个澡，心情 +20。');
    return { ok: true, title: s.name + ' 洗澡', text: '用掉一瓶水，' + s.name + ' 洗了很久，出来时人明显松快了些。心情 +20。' };
  };

  // 单槽装备：一个人身上只可能挂着一件
  var GEAR_SLOTS = {
    mask: { worn: 'hasMask', stock: 'gasMask', name: '防毒面具' },
    torch: { worn: 'hasTorch', stock: 'flashlight', name: '手电筒' },
    weapon: { worn: 'hasWeapon', stock: 'weapon', name: '武器' },
    pack: { worn: 'hasPack', stock: 'backpack', name: '双肩包' }
  };

  SF.gearOf = function (s) {
    if (!s) return '';
    if (s.hasTorch) return 'torch';
    if (s.hasMask) return 'mask';
    if (s.hasPack) return 'pack';
    if (s.hasWeapon) return 'weapon';
    return '';
  };

  // 这件装备现在穿在谁身上（没人穿就返回空串）
  SF.gearOwner = function (state, gear) {
    var slot = GEAR_SLOTS[gear];
    if (!slot || !state) return '';

    for (var i = 0; i < state.survivors.length; i++) {
      var s = state.survivors[i];
      if (s.alive && s[slot.worn]) return s.name;
    }
    return '';
  };

  // 把身上那件脱下来放回仓库
  function unequipAll(state, s) {
    for (var key in GEAR_SLOTS) {
      if (!GEAR_SLOTS.hasOwnProperty(key)) continue;
      var slot = GEAR_SLOTS[key];
      if (s[slot.worn]) {
        s[slot.worn] = false;
        state.items[slot.stock] = true;
      }
    }
  }

  SF.toggleGear = function (state, id, gear) {
    var s = SF.find(state, id);
    var slot = GEAR_SLOTS[gear];
    if (!s || !s.alive || !slot) return false;

    // 再点一次 = 脱下来，放回仓库
    if (s[slot.worn]) {
      s[slot.worn] = false;
      state.items[slot.stock] = true;
      return true;
    }

    // 单槽：先把身上原来那件脱回仓库
    unequipAll(state, s);

    // 仓库里没有（可能正穿在别人身上）就穿不了
    if (!state.items[slot.stock]) return false;

    state.items[slot.stock] = false;
    s[slot.worn] = true;
    return true;
  };

})();
