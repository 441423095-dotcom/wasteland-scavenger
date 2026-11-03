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
    food: 5,
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
      portrait: 'assets/portrait-chen.png',
      isPlayer: true
    },
    {
      id: 'lin',
      name: '林晓',
      role: '考研党',
      trait: '囤积癖',
      traitText: '只要她在避难所，全队每天的水消耗减半。',
      style: 'lin',
      portrait: 'assets/portrait-lin.png'
    },
    {
      id: 'tie',
      name: '铁柱',
      role: '健身教练',
      trait: '体力充沛',
      traitText: '派他出门带回的物资翻倍；但他每天要吃 2 份食物。',
      style: 'tie',
      portrait: 'assets/portrait-tie.png'
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
    tieFoodCost: 2,       // 铁柱每天的食物量
    tieLootMult: 2,       // 铁柱带回的物资翻倍
    linWaterFactor: 0.5,  // 林晓在队里：全队水消耗减半
    nanaNegotiate: 0.85,  // 娜娜交涉成功概率
    nanaBonus: [1, 3],    // 交涉成功额外带回
    chenRepair: 0.9,      // 陈默修收音机
    otherRepair: 0.35,    // 别人修收音机
    raiderChance: 0.12    // 探索遇到掠夺者的概率
  },

  // ---------- 探索 ----------
  explore: {
    searchDelay: 900,
    maxSurvivors: 8,

    newcomerChance: 0.1,      // 带回新幸存者（10%）
    specialChance: 0.04,      // 搜到收音机 / 杀虫剂（极低）

    hungerCost: 12,
    thirstCost: 16,

    junkChanceNear: 0.4,      // 超市/公园：40% 只搜到材料
    junkLoot: [1, 3],

    failLootFactor: 0.25,

    injuryChanceFar: 0.3,     // 远点（药店/仓库）受伤概率
    injuryChanceNear: 0.15,   // 近点失手受伤概率
    injuryHp: 20,
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

  // ---------- 夜晚结算 ----------
  night: {
    foodPerPerson: 1,
    waterPerPerson: 1,

    shortfallHp: 20,          // 没分到食物：扣 20 血
    waterShortfallHp: 12,     // 没分到水：扣 12 血
    shortfallMood: 14,        // 并且心情下降

    hungerUp: 38,
    thirstUp: 44,
    fedHungerDown: 55,
    drankThirstDown: 62,

    sickChance: 0.4,
    sickDamage: 8,

    recoverHp: 6,
    recoverBelow: 40,

    moodFed: 5,
    moodDrank: 4,
    moodHungry: -12,
    moodThirsty: -14,
    moodSick: -10,

    medicineHeal: 35,
    injuredRecoverHp: 55     // 吃饱喝足、血量回到这条线以上，伤就好了
  },

  // ---------- 材料与防贼 ----------
  material: {
    guardCost: 1,             // 至少留这么多材料才算堵好门
    theftChance: 0.45,        // 材料不够时夜里被偷的概率
    theftFood: 2,
    theftWater: 2
  },

  // ---------- 救援倒计时 ----------
  rescueDays: 15,

  // ---------- 收音机广播 ----------
  broadcasts: [
    '…沙沙…这里是城防广播，军方将在救援倒计时结束时抵达天桥街区。请留在室内。',
    '…有听众报告，附近出现了成群暴徒，夜里不要开门，也别点灯。',
    '…药品短缺已持续三周。水一定要煮沸，别再喝地下室的积水。',
    '…重复一遍：不要相信自称救援队的人。他们没有编号，也没有车。',
    '…城区东侧的火还在烧。风向朝西，今晚关紧通风口。',
    '…有人听见孩子们在唱歌？那不是孩子。别回应，别开门。',
    '…这里是军方中继站。保持无线电静默，等待下一次联络。'
  ],

  // ---------- 可带回的幸存者名字 ----------
  names: [
    '林岚', '周野', '阿禾', '老谭', '程小雨', '阿吉',
    '许星', '白杨', '石头', '沈秋', '小满', '陆离',
    '阿武', '蓉姨', '赵四', '米粒', '铁牛', '苏晚'
  ],

  // ---------- 组队与事件 ----------
  party: {
    lootPerExtra: 0.35,    // 每多一个人，物资收益 +35%
    riskPerExtra: 0.06,    // 每多一个人，队伍受伤概率 +6%
    maxMembers: 3          // 一次最多派几个人
  },

  events: {
    nightChance: 0.55,     // 每晚触发事件的概率
    nightFoodSteal: 2,     // 强盗/老鼠带走的食物
    feverHpLoss: 15
  },

  // ---------- 四个探索地点 ----------
  locations: [
    {
      id: 'market',
      name: '超市',
      icon: 'shop',
      mapX: 22,
      mapY: 24,
      risk: '低风险',
      riskLevel: 'low',
      hint: '食物 · 水',
      far: false,
      chance: 0.9,
      newcomerBonus: 0,
      loot: {
        food: [2, 4],
        water: [1, 3],
        medicine: [0, 1],
        material: [0, 1]
      },
      okText: '货架被翻过很多遍，你在倒塌的收银台后面，还是摸到了几罐没过期的。',
      badText: '过道里堆着倒下来的铁架，你被绊了一跤，东西撒了一地，只能匆忙抓两把。'
    },
    {
      id: 'park',
      name: '公园',
      icon: 'tree',
      mapX: 74,
      mapY: 20,
      risk: '中低风险',
      riskLevel: 'low',
      hint: '水 · 材料',
      far: false,
      chance: 0.84,
      newcomerBonus: 0,
      loot: {
        food: [0, 1],
        water: [2, 4],
        medicine: [0, 0],
        material: [1, 3]
      },
      okText: '喷泉早干了，可地下水管里还存着水。你接了几瓶，又拖回一捆能烧的枯枝。',
      badText: '草丛里窜出两条野狗，你扔下半袋东西往回跑，只剩手里还攥着几根柴。'
    },
    {
      id: 'pharmacy',
      name: '医院',
      icon: 'hospital',
      mapX: 20,
      mapY: 64,
      risk: '中风险',
      riskLevel: 'mid',
      hint: '药品 · 少量食物',
      far: true,
      chance: 0.8,
      newcomerBonus: 0,
      loot: {
        food: [0, 1],
        water: [0, 1],
        medicine: [1, 3],
        material: [0, 0]
      },
      okText: '玻璃碎了一地，你把柜台最里面那排抽屉整个拽出来，里面还有几盒没被拿走的东西。',
      badText: '柜台后面被人拉了一根细线，你被绊倒的时候，整排货架跟着砸了下来。'
    },
    {
      id: 'warehouse',
      name: '仓库',
      icon: 'warehouse',
      mapX: 76,
      mapY: 58,
      risk: '高风险',
      riskLevel: 'high',
      hint: '材料 · 大量物资',
      far: true,
      chance: 0.68,
      newcomerBonus: 0,
      loot: {
        food: [1, 3],
        water: [1, 2],
        medicine: [0, 1],
        material: [2, 5]
      },
      okText: '你撬开仓库侧门，里面是成堆的木料和没拆封的箱子。你搬了两趟，才在天黑前回去。',
      badText: '铁皮棚深处有东西在动。你只摸到门口的几个破箱子，就被逼着退了出来。'
    }
  ]
};
