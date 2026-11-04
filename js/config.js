/*
 * 《我在末日捡垃圾》核心数值配置
 * 硬核生存：每人每天 1 食物 1 水，不够就全员掉血；探索可能空手而归。
 * 想调难度，只改这一个对象就行。
 */
window.SF = window.SF || {};

SF.CONFIG = {

  // ---------- 主角与开局 ----------
  playerName: '陈默',
  maxStat: 100,

  startSupplies: {
    food: 3,
    water: 2
  },

  startStats: {
    hp: 100,
    hunger: 20,
    thirst: 20,
    mood: 75
  },

  // 主角什么时候改成蹲着的样子
  pose: {
    crouchAtHunger: 60,
    crouchAtThirst: 60,
    crouchAtHp: 50,
    crouchWhenMoodBelow: 30,
    crouchWhenSick: true
  },

  // ---------- 四个室友（一开始只有陈默） ----------
  characters: [
    {
      id: 'chen',
      name: '陈默',
      role: '程序员',
      trait: '电子达人',
      traitText: '捡到收音机时，他修好的概率极高。',
      style: 'chen',
      portrait: 'assets/portrait-tie.png',
      isPlayer: true
    },
    {
      id: 'lin',
      name: '林晓',
      role: '考研党',
      trait: '囤积癖',
      traitText: '队里的水和物资都由她清点，谁都别想浪费。',
      style: 'lin',
      portrait: 'assets/portrait-chen.png'
    },
    {
      id: 'tie',
      name: '铁柱',
      role: '健身教练',
      trait: '体力充沛',
      traitText: '派他出门带回的物资翻倍。',
      style: 'tie',
      portrait: 'assets/portrait-lin.png'
    },
    {
      id: 'nana',
      name: '娜娜',
      role: '美妆博主',
      trait: '交涉能力',
      traitText: '遇到掠夺者时，她大概率能毫发无伤地保住物资，甚至多拿一些。',
      style: 'nana',
      portrait: 'assets/portrait-nana.png'
    }
  ],

  // 天赋相关的数值
  traits: {
    tieFoodCost: 2,       // 铁柱每天吃 2 份食物
    tieLootMult: 2,       // 铁柱带回的物资翻倍
    linWaterFactor: 1,    // 水统一按整数算
    nanaNegotiate: 0.85,  // 娜娜交涉成功概率
    nanaBonus: [1, 3],    // 交涉成功额外带回
    chenRepair: 0.9,      // 陈默修收音机
    otherRepair: 0.35,    // 别人修收音机
    raiderChance: 0.12    // 探索遇到掠夺者的概率
  },

  // ---------- 探索 ----------
  explore: {
    searchDelay: 900,
    maxSurvivors: 4,

    newcomerChance: 0.1,      // 带回新幸存者（10%）
    specialChance: 0.04,      // 搜到收音机 / 杀虫剂（极低）

    hungerCost: 12,
    thirstCost: 16,

    junkChanceNear: 0.2,      // 近点只搜到材料的概率
    junkLoot: [1, 3],

    radioChance: 0.3,         // 车库 / 保安亭深层翻出破收音机的概率

    failLootFactor: 0.25,

    injuryChanceFar: 0.3,     // 远点（卫生站 / 车库 / 保安亭）受伤概率
    injuryChanceNear: 0.15,   // 近点失手受伤概率
    injuryHp: 30,             // 被流浪狗 / 强盗伤到：直接掉 30 血
    injuredPenalty: 0.5,      // 受伤的人成功率减半

    refuseMoodBelow: 30,      // 心情低于这条线拒绝出门

    moodOnSuccess: 6,
    moodOnFail: -9,

    minChance: 0.08,
    maxChance: 0.96,

    hpLowAt: 40,
    hpLowPenalty: -0.18,
    hpMidAt: 70,
    hpMidPenalty: -0.07,

    hungerHighAt: 70,
    hungerHighPenalty: -0.12,
    hungerMidAt: 45,
    hungerMidPenalty: -0.05,

    thirstHighAt: 70,
    thirstHighPenalty: -0.14,
    thirstMidAt: 45,
    thirstMidPenalty: -0.06,

    sickPenalty: -0.12,
    moodLowAt: 30,
    moodLowPenalty: -0.12
  },

  // ---------- 投喂 ----------
  meal: {
    foodCost: 1,             // 一份食物 = 1 个库存
    waterCost: 1,            // 一份水 = 1 个库存
    restore: 50              // 投喂后立刻恢复 50 点对应属性
  },

  // ---------- 夜晚结算 ----------
  night: {
    foodPerPerson: 1,
    waterPerPerson: 1,

    // 没吃 / 没喝：对应的食 / 水各掉 35（满 100 就死）
    missLoss: 30,
    // 饿或渴超过这条线：心情每天额外掉 20
    painAt: 70,
    painMood: 20,
    // 连着两天没喝到水（口渴 > 70）：50% 概率生病
    sickThirstDays: 2,
    sickChance: 0.5,
    // 生病每晚掉血
    sickDamage: 20,

    recoverHp: 6,
    recoverBelow: 40,

    moodFed: 8,
    moodDrank: 8,
    moodHungry: 0,
    moodThirsty: 0,
    moodSick: -10,

    medicineHeal: 30,
    injuredRecoverHp: 55     // 吃饱喝足、血量回到这条线以上，伤就好了
  },

  // ---------- 材料与防贼 ----------
  material: {
    guardCost: 1,             // 至少留这么多材料才算堵好门
    theftChance: 0.30,        // 材料不够时夜里被偷的概率
    theftFood: 1,
    theftWater: 1
  },

  // ---------- 负重 ----------
  pack: {
    base: 2,        // 每人基础负重：2 格（单槽装备）
    heavy: 2,       // 保留字段：单槽之后不再有人额外多格
    bagBonus: 2     // 背上双肩包 → 4 格
  },

  // 一次探索里，每种物资最多带回几件（超过会被压到这个数）
  lootCaps: {
    food: 2,
    water: 2,
    medicine: 1,
    material: 3
  },

  // 进入地点后的第一层：三个入口，先选再搜
  floorOne: [
    {
      key: 'front',
      label: '翻外围货架（稳妥）',
      desc: '六成空手，最多 1 件，不会受伤。',
      items: 1,
      empty: 0.6,
      risk: 0,
      hp: 0
    },
    {
      key: 'back',
      label: '走后门（有点动静）',
      desc: '至少 1 件，偶尔 2 件，20% 概率受伤 −15 血。',
      items: 1,
      extra: 0.35,
      risk: 0.2,
      hp: 15
    },
    {
      key: 'inner',
      label: '摸最里面（赌一把）',
      desc: '稳稳 2 件，偶尔 3 件，45% 概率受伤 −20 血。',
      items: 2,
      extra: 0.15,
      risk: 0.45,
      hp: 20
    }
  ],

  // ---------- 救援（不再固定天数） ----------
  // 修好收音机后，军方频道才会报出一个日期；
  // 没修好收音机就永远等不到救援。
  // rescueDelay = 从修好收音机那天算，再过多少天直升机到。
  rescueDays: 0,
  rescueDelay: { min: 8, max: 14 },

  // ---------- 每日状况（每天醒来随机一个） ----------
  conditions: [
    {
      id: 'calm',
      name: '死寂',
      desc: '街上没什么动静，今天可以专心搜刮。',
      weight: 3
    },
    {
      id: 'sand',
      name: '沙尘暴',
      desc: '能见度极低，今天带回来的东西会少 30%。',
      lootMult: 0.7,
      chanceDelta: -0.05
    },
    {
      id: 'rain',
      name: '暴雨',
      desc: '接了小半桶雨水，可所有人都被浇透了。（水 +1，全员心情 -5）',
      water: 1,
      mood: -5
    },
    {
      id: 'blackout',
      name: '停电',
      desc: '整片街区没电，手电也不太顶用。（探索成功率 -10%）',
      chanceDelta: -0.10
    },
    {
      id: 'horde',
      name: '尸潮',
      desc: '街上全是游荡的尸群，今晚一定会有东西来撞门。（夜间事件 +1，必有丧尸）',
      nightExtra: 1,
      forceNight: 'zombieDoor',
      chanceDelta: -0.05
    },
    {
      id: 'market',
      name: '黑市开张',
      desc: '楼下有人摆摊，今天门口一定有买卖。',
      forceMerchant: true
    }
  ],

  // ---------- 白天突发事件（门口来的人） ----------
  dayEvents: {
    chance: 0.5,           // 每天早上门口有人的概率
    firstDay: 2,           // 第一天要抢物资，从第二天开始才有人敲门
    radioDealDay: 6,       // 第 6~8 天：神秘人拿破损收音机来换
    radioDealUntil: 8,
    lootBonus: 2,          // 买了情报之后，当天搜刮数量翻倍
    radioChance: 0.35,     // 前半段在地下车库能翻出破收音机的概率
    radioChanceLate: 0.2   // 之后概率降低
  },

  // ---------- 收音机广播 ----------
  broadcasts: [
    '…沙沙…这里是城防广播，军方将在救援倒计时结束时抵达天桥街区。请留在室内。',
    '…有听众报告，附近出现了成群暴徒，夜里不要开门，也别点灯。',
    '…药品短缺已持续三周。水一定要煮沸，别再喝地下室的积水。',
    '…重复一遍：不要相信自称救援队的人。他们没有编号，也没有车。',
    '…城区东侧的火还在烧。风向朝西，今晚关紧通风口。',
    '…有人听见孩子们在唱歌？那不是孩子。别回应，别开门。',
    '…这里是军方中继站。保持无线电静默，等待下一次联络。',
    '…听好：直升机只在这个月来回一趟。信号弹响一次，第二天一早就走。'
  ],

  // ---------- 可带回的幸存者名字 ----------
  names: [
    '林岚', '周野', '阿禾', '老谭', '程小雨', '阿吉',
    '许星', '白杨', '石头', '沈秋', '小满', '陆离',
    '阿武', '蓉姨', '赵四', '米粒', '铁牛', '苏晚'
  ],

  // ---------- 组队与事件 ----------
  party: {
    lootPerExtra: 0.22,    // 每多一个人，物资收益 +22%
    riskPerExtra: 0.06,    // 每多一个人，队伍受伤概率 +6%
    maxMembers: 3          // 一次最多派几个人
  },

  events: {
    nightChance: 0.55,     // 每晚触发事件的概率
    nightFoodSteal: 1,     // 强盗/老鼠带走的食物
    feverHpLoss: 15,
    finalFrom: 11          // 从这天起进入最后冲刺，夜里事件更多
  },

  // 发疯与特殊事件
  madness: {
    moodAt: 20,            // 心情掉到 20 以下就有可能彻底发疯
    chance: 0.4,           // 每晚每个人发疯的概率（最多一个人）
    recoverAt: 40,         // 心情回到这条线以上才恢复正常
    breakItems: true
  },
  special: {
    chance: 0.16,          // 特定地点触发特殊事件的概率
    beggarReward: 0.6      // 给乞丐水之后，第二天送东西的概率
  },

  // ---------- 探索地点（都在这栋公寓附近） ----------
  locations: [
    {
      id: 'store',
      name: '楼下便利店',
      icon: 'shop',
      mapX: 22,
      mapY: 24,
      risk: '低风险',
      riskLevel: 'low',
      hint: '食物 · 水',
      rec: '背包',
      far: false,
      chance: 0.84,
      newcomerBonus: 0,
      loot: {
        food: [1, 2],
        water: [1, 1],
        medicine: [0, 0],
        material: [0, 1]
      },
      okText: '便利店的卷帘门被撬开一半，收银台后面还压着几罐没过期的八宝粥。',
      badText: '货架东倒西歪，你被散落的购物筐绊了一跤，只抓了两把就往回跑。'
    },
    {
      id: 'green',
      name: '小区绿化带',
      icon: 'tree',
      mapX: 74,
      mapY: 20,
      risk: '低风险',
      riskLevel: 'low',
      hint: '水 · 木板',
      rec: '背包',
      far: false,
      chance: 0.8,
      newcomerBonus: 0,
      loot: {
        food: [0, 0],
        water: [1, 2],
        medicine: [0, 0],
        material: [2, 3]
      },
      okText: '绿化带的浇花软管里还存着水，你接满几瓶，又把拆下来的木栅栏捆成一捆。',
      badText: '灌木丛里窜出两条野狗，你扔下半袋东西往回跑，只剩腋下夹着几根木条。'
    },
    {
      id: 'clinic',
      name: '隔壁社区卫生站',
      icon: 'hospital',
      mapX: 20,
      mapY: 64,
      risk: '中高风险',
      riskLevel: 'mid',
      hint: '药品 · 少量食物',
      rec: '防毒面具',
      far: true,
      unlockDay: 7,
      chance: 0.74,
      newcomerBonus: 0,
      loot: {
        food: [0, 1],
        water: [0, 1],
        medicine: [1, 2],
        material: [0, 0]
      },
      okText: '输液室的柜子翻得乱七八糟，你把最里层抽屉整个拽出来，还有几盒没拆封的药。',
      badText: '走廊里挂着半截输液管，你被绊倒时整排药架跟着砸了下来。'
    },
    {
      id: 'garage',
      name: '公寓地下车库',
      icon: 'warehouse',
      mapX: 76,
      mapY: 58,
      risk: '中高风险',
      riskLevel: 'mid',
      hint: '木板 · 手电 · 坏收音机',
      rec: '手电筒',
      far: true,
      unlockDay: 4,
      chance: 0.62,
      newcomerBonus: 0,
      loot: {
        food: [1, 2],
        water: [1, 2],
        medicine: [0, 1],
        material: [2, 4]
      },
      okText: '你们从车库侧门钻进去，成堆的木板和没拆封的箱子还堆在最里面。',
      badText: '车库深处有东西在动，你们只摸到门口几个破箱子，就被逼着退了出来。'
    },
    {
      id: 'guard',
      name: '小区保安亭',
      icon: 'house',
      mapX: 46,
      mapY: 70,
      risk: '极高风险',
      riskLevel: 'high',
      hint: '武器 · 信号弹',
      rec: '武器',
      far: true,
      unlockDay: 8,
      chance: 0.66,
      newcomerBonus: 0,
      loot: {
        food: [1, 2],
        water: [1, 2],
        medicine: [1, 2],
        material: [1, 2]
      },
      okText: '保安亭的柜子早被撬开过，地上散着几颗信号弹，你捡起还能用的那几发。',
      badText: '刚摸到保安亭背后就听见脚步，你们只能贴着墙退了出来。'
    },
    {
      id: 'vault',
      name: '车库暗门',
      icon: 'material',
      mapX: 52,
      mapY: 42,
      hidden: true,
      risk: '高风险',
      riskLevel: 'high',
      hint: '隐藏地点',
      rec: '手电筒',
      far: true,
      chance: 0.66,
      newcomerBonus: 0,
      loot: {
        food: [1, 2],
        water: [1, 1],
        medicine: [1, 2],
        material: [2, 3]
      },
      okText: '暗门后面是间被封起来的小储藏间，铁架上还压着没拆封的箱子。',
      badText: '暗门后面塌了一半，你只来得及抓了几样东西就退了出来。'
    }
  ]
};
