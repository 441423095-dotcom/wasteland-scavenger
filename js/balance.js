/*
 * ============================================================
 *  数值调参文件（唯一需要你手动改的地方）
 * ============================================================
 *
 *  说明：
 *  1. 你只需要改下面 OVERRIDES 里的内容，其它地方一个字都不用碰。
 *  2. 写法：写到和 config.js 同名的分组里，只写你要改的那一行。
 *     比如想把「每份食物恢复 50 点」改成 40，就写：
 *
 *        meal: { restore: 40 }
 *
 *  3. 没写到的项，会自动使用 config.js 里的默认值。
 *  4. 数值写得离谱也不会把游戏弄坏：
 *     概率超过 1 会被改成 1，数量写成负数会被改成 0，
 *     区间写反了（最小值比最大值大）会自动对调，
 *     写错名字的项会被忽略并提醒你。
 *  5. 改完保存，刷新页面就生效。刷新后在主界面点右下角「测试」
 *     →「数值自检」，能看到当前生效的关键数值和提醒。
 *
 *  下面方括号里的例子都是注释，照着抄下来改成你要的数字即可。
 */
window.SF = window.SF || {};

(function () {
  // ========================================================
  //  ★★★  只改这里  ★★★
  // ========================================================
  var OVERRIDES = {
    // —— 投喂：每份食物 / 水能恢复多少点 ——
    // meal: { restore: 40 },

    // —— 夜晚：没吃到 / 没喝到，每天涨多少 ——
    // night: { missLoss: 35 },

    // —— 负重：普通队员 / 铁柱 / 双肩包加成 ——
    // pack: { base: 2, heavy: 4, bagBonus: 2 },

    // —— 单次探索每种物资最多带回几件 ——
    // lootCaps: { food: 2, water: 2, medicine: 1, material: 3 },

    // —— 第一层三个入口分别能拿几件、受伤概率、掉多少血 ——
    // floorOne: [
    //   { key: 'front', label: '翻外围货架（稳妥）', desc: '六成空手，最多 1 件，不会受伤。', items: 1, empty: 0.6, risk: 0, hp: 0 },
    //   { key: 'back', label: '走后门（有点动静）', desc: '至少 1 件，偶尔 2 件，20% 概率受伤 −15 血。', items: 1, extra: 0.35, risk: 0.2, hp: 15 },
    //   { key: 'inner', label: '摸最里面（赌一把）', desc: '稳稳 2 件，偶尔 3 件，45% 概率受伤 −20 血。', items: 2, extra: 0.2, risk: 0.45, hp: 20 }
    // ],

    // —— 修好收音机之后再过几天来救援 ——
    // rescueDelay: { min: 8, max: 14 },

    // —— 每天门口有人的概率（0~1） ——
    // dayEvents: { chance: 0.5 },

    // —— 每天夜里出事的概率（0~1） ——
    // events: { nightChance: 0.55 }
  };
  // ========================================================
  //  下面不用动
  // ========================================================

  var C = SF.CONFIG;
  if (!C) return;

  var BASE = JSON.parse(JSON.stringify(C));
  var warnings = [];
  var applied = [];

  function warn(msg) {
    warnings.push(msg);
  }

  function isPlain(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  // 把默认值原地写回（game.js 一直握着同一个对象，必须原地改）
  function copyInto(target, src) {
    var k;

    for (k in target) {
      if (!target.hasOwnProperty(k)) continue;
      if (!(k in src)) delete target[k];
    }

    for (k in src) {
      if (!src.hasOwnProperty(k)) continue;

      var v = src[k];

      if (isPlain(v)) {
        if (!isPlain(target[k])) target[k] = {};
        copyInto(target[k], v);
      } else if (Array.isArray(v)) {
        target[k] = clone(v);
      } else {
        target[k] = v;
      }
    }
  }

  function isProbKey(path) {
    return /chance|rate|risk/i.test(path);
  }

  function checkNumber(path, def, val) {
    if (typeof val !== 'number' || !isFinite(val)) {
      warn(path + ' 应该是数字，已改回默认值 ' + def);
      return def;
    }

    if (isProbKey(path)) {
      if (val > 1) {
        warn(path + ' 是概率（只能 0~1），已改成 1');
        return 1;
      }
      if (val < 0) {
        warn(path + ' 是概率（只能 0~1），已改成 0');
        return 0;
      }
    }

    if (def >= 0 && val < 0) {
      warn(path + ' 不能是负数，已改成 0');
      return 0;
    }

    return val;
  }

  // 对象数组里的一项：按默认值的同名字段逐个校验
  function fixElement(path, defEl, valEl) {
    if (!isPlain(defEl) || !isPlain(valEl)) return valEl;

    var out = {};
    var k;

    for (k in valEl) {
      if (valEl.hasOwnProperty(k)) out[k] = valEl[k];
    }

    for (k in defEl) {
      if (!defEl.hasOwnProperty(k)) continue;
      if (!(k in out)) continue;

      var dv = defEl[k];
      var v = out[k];

      if (typeof dv === 'number') {
        out[k] = checkNumber(path + '.' + k, dv, v);
      } else if (Array.isArray(dv) && Array.isArray(v)) {
        out[k] = checkArray(path + '.' + k, dv, v);
      } else if (isPlain(dv) && isPlain(v)) {
        out[k] = fixElement(path + '.' + k, dv, v);
      }
    }

    return out;
  }

  function checkArray(path, def, val) {
    if (!Array.isArray(val)) {
      warn(path + ' 应该是数组，已保留默认值');
      return clone(def);
    }

    // 形如 [最少, 最多] 的区间
    if (def.length === 2 && typeof def[0] === 'number' && typeof def[1] === 'number') {
      var a = Number(val[0]);
      var b = Number(val[1]);

      if (!isFinite(a) || !isFinite(b)) {
        warn(path + ' 的区间里不是数字，已改回默认');
        return clone(def);
      }

      if (def[0] >= 0 && (a < 0 || b < 0)) {
        warn(path + ' 的区间不能是负数，已改成 0');
        a = Math.max(0, a);
        b = Math.max(0, b);
      }

      if (a > b) {
        warn(path + ' 的最小值比最大值大，已自动对调');
        var t = a;
        a = b;
        b = t;
      }

      return [a, b];
    }

    if (val.length === 0) {
      warn(path + ' 被清空了，游戏可能会不正常');
    }

    // 对象数组（地点、角色、第一层选项）：按 id 或位置对照默认值逐项检查
    if (def.length && isPlain(def[0])) {
      var out = [];
      var i;
      var j;

      for (i = 0; i < val.length; i++) {
        var defEl = null;

        if (val[i] && val[i].id) {
          for (j = 0; j < def.length; j++) {
            if (def[j] && def[j].id === val[i].id) defEl = def[j];
          }
        }
        if (!defEl && def[i]) defEl = def[i];

        out.push(defEl ? fixElement(path + '[' + i + ']', defEl, val[i]) : val[i]);
      }

      return out;
    }

    return clone(val);
  }

  function mergeInto(dest, def, src, path) {
    for (var k in src) {
      if (!src.hasOwnProperty(k)) continue;

      var key = path ? path + '.' + k : k;

      if (!(k in def)) {
        warn('不认识这一项：' + key + '（已忽略，请对照 config.js 的名字）');
        continue;
      }

      var dv = def[k];
      var v = src[k];

      if (isPlain(dv)) {
        if (!isPlain(v)) {
          warn(key + ' 应该写成 { 子项: 值 } 的形式（已忽略）');
          continue;
        }
        if (!isPlain(dest[k])) dest[k] = {};
        mergeInto(dest[k], dv, v, key);
        continue;
      }

      if (Array.isArray(dv)) {
        dest[k] = checkArray(key, dv, v);
        applied.push(key);
        continue;
      }

      if (typeof dv === 'boolean') {
        dest[k] = !!v;
        applied.push(key);
        continue;
      }

      if (typeof dv === 'string') {
        if (typeof v !== 'string') {
          warn(key + ' 应该是文字（已忽略）');
          continue;
        }
        dest[k] = v;
        applied.push(key);
        continue;
      }

      dest[k] = checkNumber(key, dv, v);
      applied.push(key);
    }
  }

  // 几项彼此关联的数值，改歪了给个提醒（不强行改）
  function crossCheck() {
    if (C.pack && C.pack.heavy < C.pack.base) {
      warn('pack.heavy（铁柱负重）比 pack.base（普通负重）还小，铁柱反而背得更少');
    }

    if (C.meal && C.maxStat && C.meal.restore > C.maxStat) {
      warn('meal.restore 比 maxStat（属性上限）还大，多出来的部分会浪费');
    }

    if (C.floorOne && C.floorOne.length !== 3) {
      warn('floorOne 应该有 3 个选项，现在是 ' + C.floorOne.length + ' 个');
    }

    if (!C.rescueDelay || !(C.rescueDelay.min > 0) || !(C.rescueDelay.max >= C.rescueDelay.min)) {
      warn('rescueDelay 应该是 { min, max } 且 min ≤ max，决定修好收音机后几天来救援');
    }
  }

  function reset() {
    warnings.length = 0;
    applied.length = 0;
    copyInto(C, BASE);
  }

  function report() {
    try {
      if (applied.length) {
        console.log('[数值] 已应用 ' + applied.length + ' 项自定义数值：' + applied.join('、'));
      }
      if (warnings.length) {
        console.log('[数值] 有 ' + warnings.length + ' 处需要检查：\n- ' + warnings.join('\n- '));
      }
    } catch (e) {
      /* 控制台不可用就算了 */
    }
  }

  function apply(obj) {
    reset();
    if (obj) mergeInto(C, BASE, obj, '');
    crossCheck();
    report();
    return { warnings: warnings, applied: applied };
  }

  function summary() {
    var rows = [];
    var caps = C.lootCaps || {};
    var plans = C.floorOne || [];
    var items = [];

    for (var i = 0; i < plans.length; i++) items.push(plans[i].items);

    function add(label, value) {
      rows.push({ label: label, value: String(value) });
    }

    var RD = C.rescueDelay || { min: '—', max: '—' };
    add('修好收音机后多久来救援', RD.min + ' ~ ' + RD.max + ' 天');
    add('每份食物/水恢复', (C.meal ? C.meal.restore : '—') + ' 点');
    add('没吃没喝每天涨', (C.night ? C.night.missLoss : '—') + ' 点');
    add('负重（普通/铁柱/背包）',
      (C.pack ? C.pack.base + ' / ' + C.pack.heavy + ' / +' + C.pack.bagBonus : '—'));
    add('单次收获上限',
      '食 ' + caps.food + ' · 水 ' + caps.water +
      ' · 药 ' + caps.medicine + ' · 木 ' + caps.material);
    add('第一层三档件数', items.join(' / '));
    add('白天事件概率', Math.round(((C.dayEvents || {}).chance || 0) * 100) + '%');
    add('夜间事件概率', Math.round((C.events ? C.events.nightChance : 0) * 100) + '%');
    add('一次最多出门', (C.party ? C.party.maxMembers : '—') + ' 人');

    return rows;
  }

  SF.balance = {
    warnings: warnings,
    applied: applied,
    apply: apply,
    summary: summary,
    defaults: BASE
  };

  apply(OVERRIDES);
})();
