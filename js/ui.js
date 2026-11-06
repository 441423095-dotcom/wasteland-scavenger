/*
 * 界面逻辑：避难所（背景图 + 代码画的货架）/ 外出地图 / 弹窗。
 * 像素美术都在 js/art.js 里；这里只有静态 DOM 排版，没有动画、没有 canvas。
 */
(function () {

  var C = SF.CONFIG;

  // 版本号：每次改动都往后加一，方便确认页面是不是最新版
  var BUILD = 'v174';
  var loadNoticeDay = 0;

  // 货架上固定摆这四层
  var SHELF_ITEMS = ['food', 'water', 'medicine', 'material'];

  var state = null;
  var lastReport = null;
  var nightReport = null;
  var timer = 0;
  var searching = false;

  // 去白底：把接近白色的像素判为透明，结果缓存起来
  var KEYED = {};

  /*
   * 场景图专用抠白底：
   * 1) 把接近白色的像素整片清掉（阈值比人物头像更宽一点，JPEG 压缩的白也会被吃掉）；
   * 2) 再沿着轮廓向内收一圈，把残留的浅灰毛边直接清掉。
   */
  function keyScenePixels(px, w, h) {
    var i;
    var lo;
    var hi;

    for (i = 0; i < px.length; i += 4) {
      lo = Math.min(px[i], px[i + 1], px[i + 2]);
      hi = Math.max(px[i], px[i + 1], px[i + 2]);

      // 有明显颜色的像素（人物、桌椅）一律不动
      if (hi - lo > 40) continue;

      if (lo >= 226) {
        px[i + 3] = 0;
      } else if (lo >= 196) {
        px[i + 3] = Math.round(px[i + 3] * (226 - lo) / 30);
      }
    }

    // 去毛边：紧挨着透明区的浅色像素直接清掉
    for (i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;

      lo = Math.min(px[i], px[i + 1], px[i + 2]);
      hi = Math.max(px[i], px[i + 1], px[i + 2]);
      if (hi - lo > 50 || lo < 205) continue;

      var idx = i / 4;
      var x = idx % w;
      var y = (idx - x) / w;
      var edge =
        (x > 0 && px[i - 4 + 3] === 0) ||
        (x < w - 1 && px[i + 4 + 3] === 0) ||
        (y > 0 && px[i - w * 4 + 3] === 0) ||
        (y < h - 1 && px[i + w * 4 + 3] === 0);

      if (edge) px[i + 3] = 0;
    }
  }

  function keyWhite(src, done) {
    if (KEYED[src]) {
      done(KEYED[src]);
      return;
    }

    var img = new Image();

    img.onload = function () {
      var out = '';
      try {
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;

        // 游戏里最大也就显示一百多像素，先缩小再处理，省内存也省时间
        var cap = src.indexOf('scene') >= 0 ? 1024 : 256;
        if (w > cap || h > cap) {
          var scale = Math.min(cap / w, cap / h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }

        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;

        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        var data = ctx.getImageData(0, 0, w, h);
        var px = data.data;

        if (src.indexOf('scene') >= 0) {
          keyScenePixels(px, w, h);
        } else {
          for (var i = 0; i < px.length; i += 4) {
            var r = px[i];
            var g = px[i + 1];
            var b = px[i + 2];
            var lo = Math.min(r, g, b);
            var hi = Math.max(r, g, b);

            if (hi - lo <= 26) {
              if (lo >= 234) {
                px[i + 3] = 0;
              } else if (lo >= 210) {
                px[i + 3] = Math.round(px[i + 3] * (234 - lo) / 24);
              }
            }
          }
        }

        ctx.putImageData(data, 0, 0);
        out = canvas.toDataURL('image/png');

        // 检查一下抠完还剩多少不透明的白色；剩太多就当没抠成功
        if (src.indexOf('scene') >= 0) {
          var leftWhite = 0;
          var opaqueAll = 0;
          for (var q = 0; q < px.length; q += 4) {
            if (px[q + 3] < 20) continue;
            opaqueAll += 1;
            var l2 = Math.min(px[q], px[q + 1], px[q + 2]);
            var h2 = Math.max(px[q], px[q + 1], px[q + 2]);
            if (l2 >= 220 && h2 - l2 <= 30) leftWhite += 1;
          }
          if (opaqueAll && leftWhite / opaqueAll > 0.03) out = '';
        }
      } catch (err) {
        out = '';
      }

      KEYED[src] = out || src;
      done(KEYED[src], !!(out && out.indexOf('data:') === 0));
    };

    img.onerror = function () {
      KEYED[src] = src;
      done(src, false);
    };

    img.src = src;
  }

  function hasTransparentCorner(src, done) {
    var img = new Image();

    img.onload = function () {
      try {
        var canvas = document.createElement('canvas');
        canvas.width = 8;
        canvas.height = 8;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 8, 8);

        var data = ctx.getImageData(0, 0, 8, 8).data;
        var corners = [0, 7, 56, 63];
        var clear = 0;

        for (var i = 0; i < corners.length; i++) {
          if (data[corners[i] * 4 + 3] < 30) clear += 1;
        }

        done(clear >= 2);
      } catch (err) {
        done(false);
      }
    };

    img.onerror = function () { done(false); };
    img.src = src;
  }

  function loadImages() {
    var sceneImg = $('scene-img');
    if (sceneImg) {
      var src = sceneImg.getAttribute('src');

      hasTransparentCorner(src, function (transparent) {
        if (transparent) {
          sceneImg.className = 'scene-img is-keyed';
          sceneImg.style.opacity = '1';
          return;
        }
        keyWhite(src, function (url, ok) {
          sceneImg.src = url;
          // 只有真的抠干净了才用正常显示；否则退回旧方案（靠混合模式吃掉白底）
          sceneImg.className = 'scene-img ' + (ok ? 'is-keyed' : 'is-raw');
          sceneImg.style.opacity = '1';
        });
      });
    }

    var diaryImg = $('diary-img');
    if (diaryImg) {
      keyWhite(diaryImg.getAttribute('src'), function (url, ok) {
        diaryImg.src = url;
        if (!ok) diaryImg.classList.add('is-raw');
      });
    }

    var idx = 0;

    function nextPortrait() {
      if (idx >= C.characters.length) {
        nextItems();
        return;
      }
      var ch = C.characters[idx];
      idx += 1;

      keyWhite(ch.portrait, function (url) {
        KEYED[ch.portrait] = url;
        renderShelter();
        nextPortrait();
      });
    }

    var itemPaths = SF.itemImagePaths || [];
    var itemIdx = 0;

    function nextItems() {
      if (itemIdx >= itemPaths.length) return;
      var path = itemPaths[itemIdx];
      itemIdx += 1;

      keyWhite(path, function (url) {
        SF.itemSrc[path] = url;
        renderShelter();
        nextItems();
      });
    }

    nextPortrait();
  }

  function $(id) {
    return document.getElementById(id);
  }

  /* ---- 正文关键词高亮：物品金色、地点青色、危险红色、好事绿色 ---- */
  var HI_WORDS = [
    ['place', '公寓地下车库', '地下车库', '小区保安亭', '保安亭',
      '楼下便利店', '便利店', '小区绿化带', '绿化带', '医务室', '车库暗门'],
    ['bad', '全灭', '已死亡', '死亡', '精神崩溃', '发疯', '生病', '受伤',
      '流血', '丧尸', '尸潮', '暴徒', '中毒', '极度缺水', '极度饥饿'],
    ['gold', '防毒面具', '止疼药', '手电筒', '收音机', '信号弹',
      '防暴棍', '扑克牌', '杀虫剂', '电子零件', '木板', '食物', '药品', '武器'],
    ['good', '解锁', '获救', '撤离', '救援', '恢复', '安全', '装满'],
    ['stat', '血量', '心情', '饥饿', '口渴']
  ];

  var HI_MAP = {};
  var HI_LIST = [];

  (function () {
    for (var i = 0; i < HI_WORDS.length; i++) {
      var type = HI_WORDS[i][0];
      for (var j = 1; j < HI_WORDS[i].length; j++) {
        var w = HI_WORDS[i][j];
        if (HI_MAP[w]) continue;
        HI_MAP[w] = type;
        HI_LIST.push(w);
      }
    }
    HI_LIST.sort(function (a, b) { return b.length - a.length; });
  })();

  var HI_RE = null;

  (function () {
    try {
      var parts = [];
      for (var i = 0; i < HI_LIST.length; i++) {
        parts.push(HI_LIST[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      }
      HI_RE = new RegExp(parts.join('|'), 'g');
    } catch (e) {
      HI_RE = null;
    }
  })();

  // 已经有标签的字符串（比如带 <br> 的）就不动，免得把标签拆坏
  function hi(text) {
    if (!text) return '';

    var s = String(text);
    if (s.indexOf('<') >= 0) return s;

    s = s.replace(/【([^】]{1,16})】/g, function (m, inner) {
      return '<span class="hi hi-key">【' + inner + '】</span>';
    });

    if (HI_RE) {
      s = s.replace(HI_RE, function (m) {
        return '<span class="hi hi-' + (HI_MAP[m] || 'gold') + '">' + m + '</span>';
      });
    }

    return s;
  }

  function hiLines(text) {
    if (!text) return '';
    var arr = String(text).split('\n');
    for (var i = 0; i < arr.length; i++) arr[i] = hi(arr[i]);
    return arr.join('<br>');
  }

  function showScreen(id) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
      screens[i].classList.remove('is-active');
    }
    var target = document.getElementById(id);
    if (target) target.classList.add('is-active');
  }

  function openModal(html, extraClass) {
    var modal = $('modal');
    // 任何新弹窗都不能被上一次的“背包锁”卡住
    bagLock = false;
    modal.className = 'modal' + (extraClass ? ' ' + extraClass : '');
    modal.innerHTML = '<button type="button" class="modal-x" data-act="close">×</button>' + html;
    modal.scrollTop = 0;
    $('overlay').classList.remove('is-death');
    $('overlay').classList.remove('is-victory');
    $('overlay').classList.add('is-on');
  }

  function closeModal() {
    $('overlay').classList.remove('is-on');
    $('overlay').classList.remove('is-death');
    $('overlay').classList.remove('is-victory');
    $('modal').innerHTML = '';

    // 关掉「派谁去」时，把地图上亮着的热区一起灭掉
    mapSelected = '';
    var spots = document.querySelectorAll('.map-spot.is-selected');
    for (var i = 0; i < spots.length; i++) {
      spots[i].classList.remove('is-selected');
    }
    hideMapRisk();
  }

  /* ---------------- 状态条 ---------------- */

  function statBar(label, value, invert, kind) {
    var v = Math.round(value);
    var good = invert ? 100 - v : v;
    if (good < 0) good = 0;
    if (good > 100) good = 100;

    var cls = 'ok';
    if (good < 33) cls = 'bad';
    else if (good < 66) cls = 'warn';

    return '<div class="stat ' + (kind || '') + '">' +
      '<span class="stat-label">' + label + '</span>' +
      '<span class="bar"><i class="' + cls + '" style="width:' + good + '%"></i></span>' +
      '<span class="stat-val">' + v + '</span>' +
      '</div>';
  }

  function statsBlock(s) {
    return statBar('血量', s.hp, false, 'hp') +
      statBar('饥饿', s.hunger, true, 'hunger') +
      statBar('口渴', s.thirst, true, 'thirst') +
      statBar('心情', s.mood, false, 'mood');
  }

  /* ---------------- 避难所渲染 ---------------- */

  function renderShelf() {
    var html = '';
    var tilts = [-6, 4, -3, 7, 3, -5, 6, -4];
    var tIdx = 0;

    function cell(key, n, kind, extra, title) {
      var rot = tilts[tIdx % tilts.length];
      tIdx += 1;
      // 只有基础物资（食物/水/止疼药/木板）显示数量，道具只亮图标
      var showNum = n > 0 && kind !== 'info';
      var cls = 'inv-cell' +
        (kind === 'hold' && n <= 0 ? ' is-empty' : '') +
        (kind === 'info' && n <= 0 ? ' is-ghost' : '') +
        (heldItem === key ? ' is-held' : '') +
        (extra ? ' ' + extra : '');
      var inner = '<span class="inv-ico" style="transform:rotate(' + rot + 'deg)">' +
        SF.itemSvg(key, 40) + '</span>' +
        (showNum ? '<span class="inv-num">' + Math.round(n) + '</span>' : '') +
        (extra === 'is-broken' ? '<span class="inv-tag">破损</span>' : '');
      var tAttr = title ? ' title="' + title + '"' : '';

      if (kind === 'info' && n <= 0) {
        // 没获得：只有一圈极淡的虚线，没有任何字
        return '<button type="button" class="inv-cell is-empty-slot" data-item="' + key + '"></button>';
      }

      if (kind === 'hold') {
        return '<button type="button" id="hold-' + key + '" class="' + cls +
          '" data-hold="' + key + '">' + inner + '</button>';
      }

      return '<button type="button" class="' + cls + '" data-item="' + key + '"' +
        tAttr + '>' + inner + '</button>';
    }

    var basics = '';
    var props = '';

    // 基础物资：食物 / 水 / 止疼药 / 木板
    basics += cell('food', state.supplies.food || 0, 'hold');
    basics += cell('water', state.supplies.water || 0, 'hold');
    basics += cell('medicine', state.supplies.medicine || 0, 'hold');
    basics += cell('material', state.supplies.material || 0, 'count');

    // 道具：防暴棍 / 手电筒 / 收音机 / 防毒面具 / 杀虫剂 / 扑克牌
    var broken = !state.items.radio && !!state.items.radioBroken;

    props += cell('weapon', state.items.weapon ? 1 : 0, 'info');
    props += cell('flashlight', state.items.flashlight ? 1 : 0, 'info');
    props += cell('radio', (state.items.radio || state.items.radioBroken) ? 1 : 0,
      'info', state.items.radioBroken && !state.items.radio ? 'is-broken' : '',
      state.items.radioBroken && !state.items.radio ? '破损的收音机' : '收音机');
    props += cell('mask', state.items.gasMask ? 1 : 0, 'info');
    props += cell('pesticide', state.items.pesticide ? 1 : 0, 'info');
    props += cell('cards', state.items.cards ? 1 : 0, 'info');

    html += '<div class="shelf-sec"><span class="shelf-label">基础物资</span>' +
      '<div class="shelf-row">' + basics + '</div></div>';

    html += '<div class="shelf-sec"><span class="shelf-label">道具</span>' +
      '<div class="shelf-row shelf-row-wrap">' + props + '</div></div>';

    $('shelf').innerHTML = html;
  }

  function shelfSlotOld() {}

  /* 没拿到就是灰色虚线空槽，拿到了才是彩色图标 */
  function shelfSlot(sl) {
    var hasImg = SF.itemHasImage && SF.itemHasImage(sl.key);
    var box = 'style="width:40px;height:40px;display:flex;align-items:center;justify-content:center"';

    if (!sl.has) {
      // 空槽：什么都别写，只有一圈很淡的虚线
      return '<button type="button" class="inv-cell inv-tool is-ghost" data-item="' + sl.key +
        '" title="' + sl.tip +
        '" style="border:1px dashed #555;background:rgba(0,0,0,.42);color:transparent">' +
        (hasImg ? '<span class="inv-ico" ' + box +
          ' style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;opacity:.22;filter:grayscale(1)">' +
          SF.itemSvg(sl.key, 40) + '</span>' : '') +
        '</button>';
    }

    return '<button type="button" class="inv-cell inv-tool is-on" data-item="' + sl.key +
      '" title="' + sl.tip + '">' +
      '<span class="inv-ico" ' + box + '>' + SF.itemSvg(sl.key, 40) + '</span>' +
      (sl.worn ? '<i class="inv-dot"></i>' : '') +
      '</button>';
  }

  function gearWorn(kind) {
    var alive = SF.aliveAll(state);
    for (var i = 0; i < alive.length; i++) {
      if (kind === 'torch' && alive[i].hasTorch) return true;
      if (kind === 'mask' && alive[i].hasMask) return true;
      if (kind === 'weapon' && alive[i].hasWeapon) return true;
    }
    return false;
  }

  function renderMatChip() {
    // 倒计时从顶上挪走了，这里只留空，不再重复天数
    $('rescue-tag').textContent = '';
  }

  /* 面板下方：特殊道具 */
  function renderGear() {
    var row = '';

    if (state.items.radioBroken) {
      row += '<button type="button" class="gear-item" data-item="radioBroken">' +
        SF.icon('radio', 22) + '<span>坏收音机</span></button>';
    } else if (state.items.radio) {
      row += '<button type="button" class="gear-item" data-item="radio">' +
        SF.icon('radio', 22) + '<span>收音机</span></button>';
    }
    if (state.items.pesticide) {
      row += '<button type="button" class="gear-item" data-item="pesticide">' +
        SF.icon('pesticide', 22) + '<span>杀虫剂</span></button>';
    }
    if (state.items.cards) {
      row += '<button type="button" class="gear-item" data-item="cards">' +
        SF.icon('cards', 22) + '<span>扑克牌</span></button>';
    }
    if (state.items.flashlight) {
      row += '<span class="gear-item is-static">' + SF.icon('flashlight', 22) +
        '<span>手电</span></span>';
    }
    if (state.items.weapon) {
      row += '<span class="gear-item is-static">' + SF.icon('weapon', 22) +
        '<span>武器</span></span>';
    }
    if (state.items.gasMask) {
      row += '<button type="button" class="gear-item" data-item="mask">' +
        SF.icon('mask', 22) + '<span>面具</span></button>';
    }

    if (state.items.flare) {
      row += '<span class="gear-item is-static">' +
        SF.itemSvg('flare', 22) + '<span>信号弹</span></span>';
    }

    if (state.items.backpack) {
      row += '<button type="button" class="gear-item" data-item="backpack">' +
        SF.itemSvg('backpack', 22) + '<span>双肩包</span></button>';
    }

    var gear = $('gear');
    if (!gear) return;

    gear.innerHTML = '<div class="inv-sub">特殊道具</div>' +
      '<div class="inv-gear-row">' +
      (row || '<span class="inv-empty">还没有特殊道具</span>') +
      '</div>';
  }

  /* ---------------- 主线清单 ---------------- */

  // 主线提示：严格按 收音机 → 修好 → 面具 → 医务室 → 防暴棍 → 信号弹
  var questSeen = null;

  function questStep() {
    // 严格按地图解锁顺序：便利店 → 车库 → 收音机 → 修好 → 面具 → 医务室 → 防暴棍 → 保安亭
    if (!state.seenStore) {
      return {
        key: 'store', name: '楼下便利店', where: '楼下便利店',
        who: '陈默',
        say: '先下楼去便利店翻一遍吧，吃的喝的都在那儿，顺便看看有没有手电。'
      };
    }

    if (!state.items.flashlight && !gearWorn('torch')) {
      return {
        key: 'flashlight', name: '手电', where: '楼下便利店（深处）',
        who: '陈默',
        say: '地下车库黑得要命，便利店深处也许还有支手电，再去翻翻。'
      };
    }

    if (!state.seenGarage) {
      return {
        key: 'garage', name: '地下车库', where: '公寓地下车库',
        who: '陈默',
        say: '楼下那扇铁门后面就是车库，里头堆着旧电器，下去看看。'
      };
    }

    if (!state.items.radio && !state.items.radioBroken) {
      return {
        key: 'radio', name: '收音机', where: '公寓地下车库（第 2 层起）',
        who: '陈默',
        say: '车库里堆着旧电器，也许能翻出一台能修的收音机。'
      };
    }

    if (!state.items.radio) {
      var boards = Math.round(state.supplies.material || 0);
      return {
        key: 'radioFix', name: '修好收音机', where: '避难所（3 块木板）',
        who: '林晓',
        say: '外壳碎成这样……攒 3 块木板，我帮你把它钉回去。',
        note: '现有木板 ' + boards + ' / 3，先别拿去修门'
      };
    }

    if (!state.items.gasMask && !gearWorn('mask')) {
      return {
        key: 'mask', name: '防毒面具', where: '公寓地下车库',
        who: '陈默',
        say: '医务室那股味儿隔着门都冲鼻子，得先弄副防毒面具。'
      };
    }

    if (!state.seenClinic) {
      return {
        key: 'clinic', name: '医务室', where: '医务室',
        who: '林晓',
        say: '戴着面具，我陪你走一趟医务室，药不能这么断了。'
      };
    }

    if (!state.items.weapon && !gearWorn('weapon')) {
      return {
        key: 'weapon', name: '防暴棍', where: '医务室 / 车库',
        who: '铁柱',
        say: '保安亭那帮孙子不讲道理，空手去就是送命，得找根趁手的。'
      };
    }

    if (!state.items.flare) {
      return {
        key: 'flare', name: '信号弹', where: '小区保安亭（第 2 层起）',
        who: '娜娜',
        say: '武器有了，去保安亭把信号弹抢回来吧，打完这趟就能走了。'
      };
    }

    return null;
  }

  var questSeen = null;

  function renderQuest() {
    var box = $('quest');
    if (!box) return;

    var step = questStep();

    // 不再是生硬的“下一步去某地”，改成同伴说的一句话
    box.innerHTML = step
      ? '<span class="quest-who">' + step.who + '</span>' +
        '<span class="quest-say">“' + step.say + '”</span>' +
        (step.note ? '<span class="quest-note">' + hi(step.note) + '</span>' : '')
      : '<span class="quest-who">娜娜</span>' +
        '<span class="quest-say">“信号弹到手了，今晚熬过去，明早就能走。”</span>';

    // 每天第一次进主界面，让陈默说一句下一步该找什么
    if (step && state.hintDay !== state.day) {
      state.hintDay = state.day;
      window.setTimeout(function () {
        showBubble('chen', step.say);
      }, 500);
    }
  }

  function onQuestClick() {
    var step = questStep();
    if (!step) {
      updateHint('信号弹已经到手，撑过今晚就能走。');
      return;
    }
    updateHint('【' + step.name + '】' + '大概在：' + step.where);
  }

  /* 顶部广播栏：一眼看清今天发生了什么 */
  function renderTicker() {
    var parts = [];
    var cond = SF.condFor ? SF.condFor(state) : null;

    if (cond) parts.push('今日状况：' + cond.name + '（' + cond.desc + '）');

    parts.push('生存第 ' + state.day + ' 天');

    // 今天还差几口
    var missFood = 0;
    var missWater = 0;
    var aliveNow = SF.aliveAll(state);
    for (var ai = 0; ai < aliveNow.length; ai++) {
      var mm = (state.meal && state.meal[aliveNow[ai].id]) || {};
      if (!mm.eat) missFood += 1;
      if (!mm.drink) missWater += 1;
    }
    if (missFood || missWater) {
      parts.push('待喂：' + (missFood ? missFood + ' 人没吃' : '') +
        (missFood && missWater ? '、' : '') +
        (missWater ? missWater + ' 人没喝' : ''));
    }

    // 收音机之前：不播报消息，靠屏幕中间的喊声
    if (state.items && state.items.radio) {
      if (state.rescueDay) {
        parts.push('撤离：第 ' + state.rescueDay + ' 天清晨');
      } else {
        parts.push('撤离：只等信号弹');
      }
      parts.push(state.items.flare ? '信号弹已到手' : '还没有信号弹');
    }

    if (loadNoticeDay) {
      parts.push('已读取第 ' + loadNoticeDay + ' 天存档');
    }

    if (state.items && state.items.radio && state.lastEvent) {
      var t = String(state.lastEvent);
      if (t.length > 24) t = t.slice(0, 24) + '…';
      parts.push(t);
    }

    $('ticker-text').textContent = parts.join('　·　');
  }

  /* 状态差就换成蹲坐的像素小人 */
  function isWeak(s) {
    var h = C.pose;
    if (s.sick && h.crouchWhenSick) return true;
    if (s.hunger >= h.crouchAtHunger) return true;
    if (s.thirst >= h.crouchAtThirst) return true;
    if (s.hp <= h.crouchAtHp) return true;
    if (s.mood <= h.crouchWhenMoodBelow) return true;
    return false;
  }

  function portraitHtml(s, w, h) {
    var src = KEYED[s.portrait] || s.portrait || '';
    if (!src) return '';

    // 万一某个格式读不到，自动换成另一种再试一次
    var alt = '';
    if (src.indexOf('.jpg') >= 0) alt = src.replace('.jpg', '.png');
    else if (src.indexOf('.png') >= 0) alt = src.replace('.png', '.jpg');

    return '<img class="portrait-img" src="' + src + '" alt=""' +
      (alt ? ' onerror="this.onerror=null;this.src=\'' + alt + '\'"' : '') +
      ' style="width:' + w + 'px;height:' + h + 'px">';
  }

  /* 头顶小图标：只给最重要的几个状态 */
  function statusBadges(s) {
    var out = [];
    if (s.mad) out.push({ icon: 'cloud', text: '发疯' });
    if (s.sick) out.push({ icon: 'medicine', text: '生病' });
    if (s.injured) out.push({ icon: 'medicine', text: '受伤' });
    if (s.hasMask) out.push({ icon: 'pesticide', text: '面具' });
    if (s.thirst >= C.pose.crouchAtThirst) out.push({ icon: 'drop', text: '口渴' });
    if (s.hunger >= C.pose.crouchAtHunger) out.push({ icon: 'bowl', text: '饥饿' });
    if (s.mood <= C.pose.crouchWhenMoodBelow) out.push({ icon: 'cloud', text: '低落' });
    return out;
  }

  function headBadgesHtml(s) {
    var list = statusBadges(s);
    if (!list.length) return '';

    var html = '<span class="person-badges">';
    for (var i = 0; i < list.length && i < 3; i++) {
      html += '<span class="person-badge">' + SF.icon(list[i].icon, 11) + '</span>';
    }
    html += '</span>';
    return html;
  }

  /* 左侧名片：头像 + 名字 + 四维微缩状态条 */
  var PREV_STATS = {};

  function microRow(id, label, cls, key, value, rowCls) {
    var v = Math.round(value);
    if (v < 0) v = 0;
    if (v > 100) v = 100;

    var snap = PREV_STATS[id] || {};
    var from = typeof snap[key] === 'number' ? snap[key] : v;

    return '<span class="mrow' + (rowCls ? ' ' + rowCls : '') +
      (v < 20 ? ' is-low' : '') + '">' +
      '<span class="mkey">' + label + '</span>' +
      '<span class="mtrack"><i class="mfill ' + cls +
      '" style="width:' + from + '%" data-w="' + v + '"></i></span>' +
      '<span class="mval">' + v + '</span>' +
      '</span>';
  }

  /* 让四根细条从上一夜的位置平滑长到新数值 */
  function growBars() {
    var box = $('people');
    if (!box) return;

    var fills = box.querySelectorAll('.mfill');
    for (var i = 0; i < fills.length; i++) {
      var w = fills[i].getAttribute('data-w');
      if (w !== null) fills[i].style.width = w + '%';
    }
  }

  function renderPeople() {
    var list = state.survivors || [];
    var html = '';
    var nextStats = {};

    // 面板小标题：还剩几个人、今天还差几口
    var aliveN = 0;
    var missN = 0;
    for (var ci = 0; ci < list.length; ci++) {
      var cc = list[ci];
      if (!cc.alive || cc.hp <= 0) continue;
      aliveN += 1;
      var cm = (state.meal && state.meal[cc.id]) || {};
      if (!cm.eat) missN += 1;
      if (!cm.drink) missN += 1;
    }

    html += '<div class="people-head">' +
      '<span class="people-title">幸存者</span>' +
      '<span class="people-count"><b>' + aliveN + '</b>/' + list.length + '</span>' +
      (missN
        ? '<span class="people-need">待喂 ' + missN + '</span>'
        : '<span class="people-ok">吃喝都够了</span>') +
      '</div>';

    for (var i = 0; i < list.length; i++) {
      var s = list[i];

      // 血量归零 / 已死亡：灰卡片，不能点、不能喂
      if (!s.alive || s.hp <= 0) {
        html += '<div class="mini-card is-dead" data-id="' + s.id + '">' +
          '<span class="mini-fig">' + portraitHtml(s, 46, 46) + '</span>' +
          '<span class="mini-main">' +
          '<span class="mini-name"><span class="mini-name-main">' + s.name +
          '<span class="mini-dead">已死亡</span></span></span>' +
          '</span>' +
          '</div>';
        continue;
      }

      var moodTag = '';
      if (s.mad) moodTag = '<span class="mini-mood is-mad">!</span>';
      else if (s.mood <= 30) moodTag = '<span class="mini-mood">' + SF.icon('cloud', 12) + '</span>';

      var m = (state.meal && state.meal[s.id]) || {};
      var lowHp = s.hp < 20;
      var lowThirst = s.thirst > 80;
      var lowHunger = s.hunger > 80;
      var starving = lowThirst || lowHunger;
      var fedAll = !!m.eat && !!m.drink;
      var ready = heldItem === 'food' ? s.hunger > 0
        : (heldItem === 'water' ? s.thirst > 0
          : (heldItem === 'medicine' ? !!s.sick : false));

      // 今天吃没吃、喝没喝、身上有什么毛病：压成名字后面的一两个字，不占高度
      var marks = '';
      marks += s.hunger <= 10
        ? '<span class="mini-mark is-ok">饱</span>'
        : '<span class="mini-mark is-warn">饿</span>';
      marks += s.thirst <= 10
        ? '<span class="mini-mark is-ok">水</span>'
        : '<span class="mini-mark is-warn">渴</span>';
      if (s.sick) marks += '<span class="mini-mark is-bad">病</span>';
      if (s.injured) marks += '<span class="mini-mark is-bad">伤</span>';
      if (s.mad) marks += '<span class="mini-mark is-bad">疯</span>';

      var gearId = SF.gearOf ? SF.gearOf(s) : '';

      html += '<button type="button" class="mini-card' +
        (lowHp ? ' is-deadly' : '') +
        (starving ? ' is-starving' : '') +
        (fedAll ? ' is-fed' : '') +
        (ready ? ' is-ready' : '') +
        (s.id === flashId ? ' is-flash' : '') +
        '" data-id="' + s.id + '">' +
        '<span class="mini-fig">' + portraitHtml(s, 46, 46) + moodTag + '</span>' +
        '<span class="mini-main">' +
        '<span class="mini-name">' +
        '<span class="mini-name-main">' +
        '<span class="mini-ap' + (s.ap > 0 ? ' is-on' : '') +
        '"></span>' + s.name +
        '</span>' +
        '<span class="mini-marks">' + marks + '</span>' +
        '<span class="mini-slot' + (gearId ? ' is-on' : '') + '">' +
        (gearId ? gearArt(gearId, 12) : '空') +
        '</span></span>' +
        microRow(s.id, '血', 'hp', 'hp', s.hp, 'r-hp') +
        microRow(s.id, '水', 'thirst', 'thirst', 100 - s.thirst, 'r-thirst') +
        microRow(s.id, '食', 'hunger', 'hunger', 100 - s.hunger, 'r-food') +
        microRow(s.id, '心', 'mood', 'mood', s.mood, 'r-mood') +
        '</span>' +
        '</button>';

      nextStats[s.id] = {
        hp: Math.round(s.hp),
        thirst: Math.round(100 - s.thirst),
        hunger: Math.round(100 - s.hunger),
        mood: Math.round(s.mood)
      };
    }

    $('people').innerHTML = html;
    PREV_STATS = nextStats;
    window.setTimeout(growBars, 30);
  }

  function summaryText() {
    var alive = SF.aliveAll(state);
    var parts = [];

    for (var i = 0; i < alive.length; i++) {
      var s = alive[i];
      if (s.mad) parts.push(s.name + ' 发疯');
      else if (s.hp <= 30) parts.push(s.name + ' 快不行了');
      else if (s.hunger >= 80) parts.push(s.name + ' 快饿死');
      else if (s.thirst >= 80) parts.push(s.name + ' 快渴死');
      else if (s.mood <= 25) parts.push(s.name + ' 情绪崩溃');
    }

    if (!parts.length) return '暂时都还撑得住。';
    return parts.join(' · ');
  }

  function renderLogPanel() {
    var box = $('wall-log');
    if (!box) return;

    var lines = state.logs.slice(-4).reverse();
    var html = '<div class="wl-title">避难所日志</div>' +
      '<div class="wl-sum">' + summaryText() + '</div>';

    for (var i = 0; i < lines.length; i++) {
      html += '<div class="wl-item">' + lines[i] + '</div>';
    }

    box.innerHTML = html;
  }

  /* 日志按钮：每天一篇总结，而不是流水账 */
  function openLog() {
    var notes = (state.dayNotes || []).slice().reverse();
    var html = '<div class="modal-head">' +
      '<span class="modal-title">避难所日志</span>' +
      '<span class="modal-sub">第 ' + state.day + ' 天</span>' +
      '</div>' +
      '<div class="log-summary">' + hi(summaryText()) + '</div>';

    var recL = recordLine();
    if (recL) html += '<div class="log-summary">' + recL + '</div>';

    if (state.graves && state.graves.length) {
      html += '<div class="res-label">已经不在了</div>';
      for (var gi = 0; gi < state.graves.length; gi++) {
        var gv = state.graves[gi];
        html += '<div class="grave-line">' + hi(gv.name) + ' · 第 ' + gv.day +
          ' 天 · ' + hi(gv.cause) + '</div>';
      }
    }

    if (!notes.length) {
      html += '<div class="empty-text">第一篇日记还没写完，先撑过今晚。</div>';
    }

    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      html += '<div class="day-note">' +
        '<div class="day-note-head">第 ' + n.day + ' 天' +
        (n.cond ? '<span>' + n.cond + '</span>' : '') +
        '</div>' +
        '<p>' + hi(n.text) + '</p>' +
        '</div>';
    }

    var today = state.dayLog || [];
    if (today.length) {
      var tail = today.slice(-3);
      html += '<div class="day-note is-today">' +
        '<div class="day-note-head">第 ' + state.day + ' 天 · 还没结束</div>' +
        '<p>' + hi(tail.join(' ')) + '</p>' +
        '</div>';
    }

    html += '<div class="modal-actions">' +
      '<button type="button" class="btn" data-act="close">关闭</button></div>';

    openModal(html, 'modal-logbook');
  }

  function dayHint() {
    var alive = SF.aliveAll(state);
    if (!alive.length) return '';

    if ((state.supplies.food || 0) <= 0 && (state.supplies.water || 0) <= 0) {
      return '【物资耗尽，必须出门】';
    }

    var ev = currentDayEvent();
    if (ev) {
      return '【门口有人：' + ev.title + '，点上面的金色按钮】';
    }

    return '';
  }

  function allFed() {
    var alive = SF.aliveAll(state);
    if (!alive.length) return false;

    for (var i = 0; i < alive.length; i++) {
      var m = (state.meal && state.meal[alive[i].id]) || {};
      if (!m.eat || !m.drink) return false;
    }
    return true;
  }

  function storyText() {
    if (state.items.flare) return '信号弹在手：明早直升机就来';
    if (!state.items.flashlight) return '主线：先找到手电筒';
    if (!state.items.radio && !state.items.radioBroken) return '主线：去车库找一台收音机';
    if (!state.items.radio) return '主线：用 3 块木板把收音机钉好';
    if (!state.items.gasMask) return '主线：去车库找防毒面具';
    if (!state.seenClinic) return '主线：戴面具去医务室打听';
    if (!state.items.weapon) return '主线：找一件武器';
    return '主线：带武器去保安亭拿信号弹';
  }

  function renderShelter() {
    // 兜底：手里的物资已经没了就自动松手，绝不让黄框卡在屏幕上
    if (heldItem && (state.supplies[heldItem] || 0) <= 0) {
      heldItem = null;
    }

    // 血量归零的人先标成死亡，避免出现「已经没血还被算作存活」
    if (SF.syncDeaths) SF.syncDeaths(state);

    var dayBig = $('day-big');
    if (dayBig) {
      dayBig.innerHTML = '生存第 <b>' + state.day + '</b> 天';
    }

    $('day-num').textContent = String(state.day);

    renderShelf();
    renderMatChip();
    renderGear();
    renderQuest();
    renderTicker();
    renderPeople();

    var alive = SF.aliveAll(state);
    var exploreBtn = $('btn-explore');
    var anyAp = SF.anyAp(state);
    var scout = SF.canExplore ? SF.canExplore(state) : null;
    var pendingEv = currentDayEvent();

    if (!alive.length) {
      exploreBtn.disabled = true;
      exploreBtn.textContent = '没有人了';
      $('btn-night').disabled = true;
    } else {
      $('btn-night').disabled = false;

      if (pendingEv) {
        // 门口有人：只有「派谁去」那种弹窗真的开着时才锁按钮，
        // 弹窗没弹出来（或者被关掉了）也要让玩家点得动，绝不锁死
        var evModalOpen = $('overlay').classList.contains('is-on') &&
          $('modal').classList.contains('modal-day-event');

        if (evModalOpen) {
          exploreBtn.disabled = true;
          exploreBtn.textContent = '先处理门口的事';
        } else {
          exploreBtn.disabled = !scout;
          exploreBtn.textContent = scout ? '门口有人（点这里）' : '今天都动不了了';
        }
      } else {
        // 只有血量低于 20 才算虚弱；饿、渴、心情差都不锁按钮
        exploreBtn.disabled = !scout;
        exploreBtn.textContent = scout ? '出门探索' : '今天都动不了了';
      }
    }

    $('btn-clean').disabled = !anyAp || (state.supplies.water || 0) < 1;

    // 第一天还没出过门：让“出门探索”闪一下，别让新人卡在屋里
    if (exploreBtn) {
      exploreBtn.className = 'btn btn-main' +
        ((!state.seenStore && !exploreBtn.disabled) ? ' is-next' : '');
    }

    // 底部主线状态（不再重复天数 / 倒计时）
    var storyLine = $('story-line');
    if (storyLine) {
      var condNow = SF.condFor ? SF.condFor(state) : null;
      var flareText = state.items.flare ? ' · 信号弹已到手' : '';
      storyLine.textContent = '今日：' + (condNow ? condNow.name : '死寂') +
        ' · 存活 ' + alive.length + ' 人' + flareText + ' · ' + BUILD;
    }

    // 左下角：今晚的风险提示
    var nightRisk = $('night-risk');
    if (nightRisk) {
      var condN = SF.condFor ? SF.condFor(state) : null;
      var boardsN = Math.round(state.supplies.material || 0);
      var hordeN = !!(condN && condN.id === 'horde');

      nightRisk.className = 'night-risk' +
        ((hordeN || state.doorBroken) ? ' is-bad' : (boardsN < 3 ? ' is-warn' : ''));
      nightRisk.textContent = '今晚：' + (condN ? condN.name : '死寂') +
        (hordeN ? '（撞门要 3 块木板）' : '') +
        ' · 木板 ' + boardsN +
        (state.doorBroken ? ' · 门已经破了' : '');
    }

    // 门口有人：有事件才亮出来，点开就能重新看
    var evBtn = $('btn-event');
    if (evBtn) {
      var ev = null;
      try {
        ev = SF.dayEventFor ? SF.dayEventFor(state) : null;
      } catch (e) {
        ev = null;
      }

      if (ev) {
        evBtn.classList.remove('is-hidden');
      } else {
        evBtn.classList.add('is-hidden');
      }
    }

    // 直接给图标和名片绑点击，再按当前选中的物资刷一遍样式
    paintHold();
    bindFastTaps();
    updateHint();

    // 全员阵亡 / 主角倒下：无论从哪条路走到这里，都立刻弹死亡结算
    if (state.over && !state.won && !gameOverLock) {
      if (!state.overDay) state.overDay = state.day;
      openGameOver();
      return;
    }

    if (!alive.length && !gameOverLock) {
      if (!state.overDay) state.overDay = state.day;
      state.over = true;
      openGameOver();
    }
  }

  /* ---------------- 地图 ---------------- */

  /*
   * 热区位置：百分比是按整张底图算的（left / top 是左上角，w / h 是宽高）。
   * 觉得哪块没盖住图上文字，只改这几个数字就行。
   */
  var MAP_SPOTS = {
    store: { left: 2, top: 8, w: 42, h: 18 },     // 楼下便利店：左上角
    guard: { left: 56, top: 8, w: 42, h: 18 },    // 小区保安亭：右上角
    green: { left: 2, top: 38, w: 42, h: 18 },    // 小区绿化带：左侧中间
    clinic: { left: 56, top: 38, w: 42, h: 18 },  // 医务室：右侧中间
    garage: { left: 22, top: 66, w: 56, h: 22 },  // 公寓地下车库：正下方
    vault: { left: 32, top: 88, w: 36, h: 11 }    // 车库暗门：藏在最下面
  };

  // 当前点亮的那个地点
  var mapSelected = '';

  /* 底图按 cover 铺满画面：宽高都算好，热区的百分比才对得上图 */
  function sizeMapStage() {
    var host = $('screen-map');
    var stage = $('map-stage');
    var img = $('map-bg');
    if (!host || !stage) return;

    var iw = (img && img.naturalWidth) || 563;
    var ih = (img && img.naturalHeight) || 1002;
    var w = host.clientWidth || 1;
    var h = host.clientHeight || 1;

    var scale = Math.max(w / iw, h / ih);
    stage.style.width = Math.round(iw * scale) + 'px';
    stage.style.height = Math.round(ih * scale) + 'px';
  }

  function renderMap() {
    $('day-num-map').textContent = String(state.day);

    sizeMapStage();

    var html = '';

    for (var i = 0; i < C.locations.length; i++) {
      var loc = C.locations[i];
      if (loc.hidden && !state.vaultUnlocked) continue;

      var spot = MAP_SPOTS[loc.id] || MAP_SPOTS.garage;
      var gate = SF.gateFor(state, loc);
      var locked = !gate.ok;
      var doneToday = !!(state.searchedToday && state.searchedToday[loc.id] === state.day);

      // 锁住的地方直接标出缺什么
      var needKey = '';
      if (locked) {
        if (loc.id === 'garage') needKey = 'flashlight';
        else if (loc.id === 'clinic') needKey = state.items.radio ? 'mask' : 'radio';
        else if (loc.id === 'guard') needKey = 'weapon';
        else if (loc.id === 'vault') needKey = 'flashlight';
      }

      html += '<button type="button" class="map-spot' +
        (locked ? ' is-locked' : '') +
        (doneToday ? ' is-done' : '') +
        (mapSelected === loc.id ? ' is-selected' : '') + '"' +
        ' style="left:' + spot.left + '%;top:' + spot.top +
        '%;width:' + spot.w + '%;height:' + spot.h + '%"' +
        (locked ? ' data-locked="' + loc.id + '"' : ' data-id="' + loc.id + '"') +
        ' aria-label="' + loc.name + '">' +
        (needKey ? '<span class="map-need">' + SF.itemSvg(needKey, 16) + '</span>' : '') +
        '</button>';
    }

    $('map-grid').innerHTML = html;
    hideMapRisk();
  }

  /* 地图图例：把所有地点的产出和推荐装备列出来 */
  function openMapInfo() {
    var html = '<div class="modal-head">' +
      '<span class="modal-title">这块地方能搜到什么</span>' +
      '<span class="modal-sub">推荐装备只占 1 个装备槽</span>' +
      '</div>';

    for (var i = 0; i < C.locations.length; i++) {
      var loc = C.locations[i];
      if (loc.hidden && !state.vaultUnlocked) continue;

      var gate = SF.gateFor(state, loc);

      html += '<div class="map-info-row">' +
        '<span class="map-info-name">' + loc.name + '</span>' +
        '<span class="map-info-risk">' + loc.risk + '</span>' +
        '<span class="map-info-loot">' + (loc.hint || '') + '</span>' +
        '<span class="map-info-rec">推荐：' + (loc.rec || '—') + '</span>' +
        (gate.ok ? '' : '<span class="map-info-lock">尚未解锁</span>') +
        '</div>';
    }

    html += '<div class="modal-actions">' +
      '<button type="button" class="btn" data-act="close">知道了</button></div>';

    openModal(html, 'modal-map-info');
  }
  function showMapRisk(locId, locked) {
    var loc = SF.findLocation(locId);
    var mapHint = $('map-risk');
    var text = $('map-risk-text');
    if (!mapHint || !text || !loc) return;

    var line = loc.name + ' · ' + (loc.risk || '风险不明');
    if (loc.hint) line += ' · ' + loc.hint;
    if (loc.rec) line += ' · 推荐装备：' + loc.rec;
    if (locked) {
      var gate = SF.gateFor(state, loc);
      line += ' · ' + (gate.reason || '尚未解锁');
    }

    text.textContent = line;
    mapHint.classList.add('is-on');
    if (locked) {
      mapHint.classList.add('is-bad');
    } else {
      mapHint.classList.remove('is-bad');
    }
  }

  function hideMapRisk() {
    var mapHint = $('map-risk');
    var text = $('map-risk-text');
    if (!mapHint || !text) return;

    text.textContent = '点地图上的地点，再选谁去';
    mapHint.classList.remove('is-on');
    mapHint.classList.remove('is-bad');
  }

  // 鼠标移开时：如果还点着某个地点，就继续显示它的风险
  function showMapSelectedOrHide() {
    if (mapSelected) {
      showMapRisk(mapSelected, false);
    } else {
      hideMapRisk();
    }
  }

  /* 出发前的装备界面 */
  var raidLoc = '';
  var raidIds = [];
  var raidDepth = 1;
  var raidTotals = {};

  var GEAR_LABEL = { torch: '手电', mask: '面具', pack: '背包', weapon: '武器' };
  var GEAR_ITEM = { torch: 'flashlight', mask: 'mask', pack: 'backpack', weapon: 'weapon' };
  // 不用 SVG/emoji，直接用仓库里存进去的实物图
  function gearArt(gear, size) {
    return SF.itemSvg ? SF.itemSvg(GEAR_ITEM[gear] || 'flashlight', size) : '';
  }

  /* 出发前的单槽装备：一个人只有一格，穿在别人身上就选不到 */
  function gearButtons(s, locId) {
    var defs = [
      { key: 'torch', has: s.hasTorch, own: state.items.flashlight },
      { key: 'mask', has: s.hasMask, own: state.items.gasMask },
      { key: 'pack', has: s.hasPack, own: state.items.backpack },
      { key: 'weapon', has: s.hasWeapon, own: state.items.weapon }
    ];

    var cur = SF.gearOf ? SF.gearOf(s) : '';
    var html = '<span class="gear-slot-now">槽位：' +
      (cur ? GEAR_LABEL[cur] : '空') + '</span>';

    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      var owner = d.has ? '' : (SF.gearOwner ? SF.gearOwner(state, d.key) : '');

      if (!d.has && !d.own && !owner) continue;

      var label = GEAR_LABEL[d.key];
      var disabled = !d.has && (!d.own || owner) ? ' disabled' : '';

      html += '<button type="button" class="gear-chip' +
        (d.has ? ' is-on' : '') + (owner ? ' is-taken' : '') + '"' +
        disabled +
        ' data-act="equip" data-gear="' + d.key + '" data-id="' + s.id + '"' +
        ' data-loc="' + (locId || '') + '">' +
        label + (d.has ? ' ✓' : (owner ? '（' + owner + '用着）' : '')) +
        '</button>';
    }

    return html;
  }

  function openEquipment(locId, ids) {
    raidLoc = locId;
    raidIds = ids;

    var loc = SF.findLocation(locId);
    var html = '<div class="modal-head">' +
      '<span class="modal-title">出发前准备</span>' +
      '<span class="modal-sub">' + (loc ? loc.name : '') + '</span>' +
      '</div>' +
      '<div class="res-text">给出发的人分配装备，不穿也能出发。</div>';

    for (var i = 0; i < ids.length; i++) {
      var s = SF.find(state, ids[i]);
      if (!s) continue;
      html += '<div class="equip-row">' +
        '<span class="equip-fig">' + portraitHtml(s, 34, 34) + '</span>' +
        '<span class="equip-main">' + s.name +
        '<span class="equip-role">' + s.role + ' · ' + s.trait +
        ' · 负重 ' + SF.carryOf(s) + ' 格</span>' +
        '<span class="equip-trait">' + s.traitText + '</span>' +
        '<span class="equip-verdict' +
        (SF.verdictFor(state, loc, s).good ? ' is-good' : ' is-bad') + '">' +
        SF.verdictFor(state, loc, s).text + '</span></span>' +
        '<span class="equip-gear">' + gearButtons(s) + '</span>' +
        '</div>';
    }

    html += '<div class="modal-actions">' +
      '<button type="button" class="btn btn-main" data-act="depart">确认出发</button>' +
      '<button type="button" class="btn" data-act="close">返回</button>' +
      '</div>';

    openModal(html, 'modal-equip');
  }

  function depart() {
    for (var i = 0; i < raidIds.length; i++) {
      var s = SF.find(state, raidIds[i]);
      if (s) s.ap = 0;
    }
    partyPick = {};
    closeModal();
    renderShelter();
    startSearch(raidLoc, raidIds);
  }

  /* 材料：修门 / 铺床 */
  /* 木板改造：钉床 / 接雨水 / 加固门 */
  function openUpgrade() {
    var up = state.upgrades || {};
    var m = state.supplies.material || 0;

    function row(key, cost, name, desc) {
      var done = !!up[key];
      var can = !done && m >= cost;

      return '<button type="button" class="up-row' + (can ? '' : ' is-off') + '"' +
        (can ? '' : ' disabled') +
        ' data-act="upgrade" data-key="' + key + '">' +
        '<span class="up-name">' + name + '</span>' +
        '<span class="up-desc">' + desc + '</span>' +
        '<span class="up-cost">' + (done ? '已改造' : ('木板 ' + cost)) + '</span>' +
        '</button>';
    }

    var html = '<div class="modal-head">' +
      '<span class="modal-title">改造避难所</span>' +
      '<span class="modal-sub">现有木板 ' + m + ' 块</span>' +
      '</div>' +
      row('bed', 2, '钉床', '每天醒来全员心情 +5') +
      row('barrel', 1, '接雨水', '每天早上自动接水 +1，下雨 +2') +
      row('door', 3, '加固门', '防贼、挡撞门，防御 +2') +
      '<div class="modal-actions">' +
      '<button type="button" class="btn" data-act="close">关闭</button>' +
      '</div>';

    openModal(html, 'modal-upgrade');
  }

  /* 在家：捕鼠 / 翻储物柜 / 煮汤 */
  function openHomeTask() {
    var alive = SF.aliveAll(state);
    var free = null;
    for (var i = 0; i < alive.length; i++) {
      if (alive[i].ap > 0 && !alive[i].mad) { free = alive[i]; break; }
    }

    var left = state.storageLeft || 0;
    var no = !free;

    function row(key, name, desc, off) {
      var disabled = no || off;
      return '<button type="button" class="up-row' + (disabled ? ' is-off' : '') + '"' +
        (disabled ? ' disabled' : '') +
        ' data-act="do-home" data-key="' + key + '">' +
        '<span class="up-name">' + name + '</span>' +
        '<span class="up-desc">' + desc + '</span>' +
        '</button>';
    }

    var html = '<div class="modal-head"><span class="modal-title">在避难所里做点什么</span>' +
      '<span class="modal-sub">' + (free ? free.name + ' 还有行动点' : '今天没人留在家里') + '</span></div>' +
      row('trap', '捕鼠陷阱', '占一个人一晚，一半机会抓到，食物 +1', false) +
      row('storage', '翻储物柜', '家里还剩 ' + left + ' 处没翻，翻出食物或水', left <= 0) +
      row('soup', '煮汤', '1 份食物 + 1 瓶水，全员饥饿、口渴各 -20，心情 +5',
        (state.supplies.food || 0) < 1 || (state.supplies.water || 0) < 1) +
      '<div class="modal-actions">' +
      '<button type="button" class="btn" data-act="close">关闭</button>' +
      '</div>';

    openModal(html, 'modal-home');
  }

  function homeFortify(kind) {
    openUpgrade();
  }

  /* 浴室：选一个人洗澡 */
  function openBath() {
    var alive = SF.aliveAll(state);
    var html = '<div class="modal-head">' +
      '<span class="modal-title">浴室</span>' +
      '<span class="modal-sub">消耗 1 水 · 心情 +20</span>' +
      '</div>';

    for (var i = 0; i < alive.length; i++) {
      var s = alive[i];
      var can = s.ap > 0 && (state.supplies.water || 0) >= 1;
      html += '<button type="button" class="pick-row' + (can ? '' : ' is-off') + '"' +
        (can ? '' : ' disabled') +
        ' data-act="bath" data-id="' + s.id + '">' +
        '<span class="pick-fig">' + portraitHtml(s, 30, 40) + '</span>' +
        '<span class="pick-main"><b>' + s.name + '</b>' +
        '<span class="pick-role">' + s.role + '</span></span>' +
        '<span class="pick-mood">' + (s.ap > 0 ? '可以洗' : '没力气') + '</span>' +
        '</button>';
    }

    if ((state.supplies.water || 0) < 1) {
      html += '<div class="alert bad">物资不足：没有多余的水。</div>';
    }

    html += '<div class="modal-actions">' +
      '<button type="button" class="btn" data-act="close">关闭</button></div>';

    openModal(html, 'modal-bath');
  }

  /* 组队：勾选几个人一起出门 */
  var partyPick = {};
  var gearMenuId = '';

  function openExplorerPicker(locId) {
    var loc = SF.findLocation(locId);
    if (!loc) return;
    partyPick = {};
    gearMenuId = '';
    renderPartyPicker(locId);
  }

  function partyCount() {
    var n = 0;
    for (var k in partyPick) {
      if (partyPick.hasOwnProperty(k)) n += 1;
    }
    return n;
  }

  function traitName(s) {
    if (s.charId === 'chen') return '黑科技破解';
    if (s.charId === 'lin') return '药理知识';
    if (s.charId === 'tie') return '体力充沛';
    if (s.charId === 'nana') return '交涉能力';
    return s.trait;
  }

  /* 名字后面那一行具体天赋 */
  function traitShort(s) {
    if (s.charId === 'chen') return '30%概率额外发现电子零件，免疫陷阱';
    if (s.charId === 'lin') return '必定多带回1个药品，100%免疫毒气';
    if (s.charId === 'tie') return '基础负重4格，带回的食物/材料+2';
    if (s.charId === 'nana') return '遇敌交涉成功率80%，大概率反抢物资';
    return '';
  }

  /* 选人面板展示的被动文案（与底层逻辑保持一致） */
  function traitTextFor(s) {
    if (s.charId === 'chen') {
      return '有几率带回稀有零件，但不擅长搬运基础物资。';
    }
    if (s.charId === 'lin') {
      return '必定多带回 1 个药品，免疫生化污染。';
    }
    if (s.charId === 'tie') {
      return '带回的食物和材料 +2，但吃得也多。';
    }
    if (s.charId === 'nana') {
      return '遇敌无伤，大概率反抢物资。';
    }
    return s.traitText;
  }

  function renderPartyPicker(locId) {
    var loc = SF.findLocation(locId);
    if (!loc) return;

    var alive = SF.aliveAll(state);
    var loot = (loc.hint || '不确定').replace(/ · /g, '、');

    var html = '<div class="pp-head">' +
      '<span class="pp-title">派谁去？<small>最多 ' + C.party.maxMembers + ' 人</small></span>' +
      '<span class="pp-loc">' + loc.name + '</span>' +
      '</div>' +
      '<div class="pp-hint">跟着出门的人，能力都会生效。</div>' +
      '<div class="pp-loot">产出倾向：大概率' + loot + '</div>' +
      (loc.rec ? '<div class="pp-rec">推荐装备：' + loc.rec + '</div>' : '') +
      '<div class="pp-list">';

    for (var i = 0; i < alive.length; i++) {
      var s = alive[i];
      if (s.mad) continue;

      var tired = s.ap < 1;
      var on = !tired && !!partyPick[s.id];
      var gear = SF.gearOf ? SF.gearOf(s) : '';

      html += '<div class="pp-row' + (on ? ' is-on' : '') + (tired ? ' is-tired' : '') + '">' +
        '<button type="button" class="pp-main" data-act="pick-toggle" data-id="' +
        s.id + '" data-loc="' + loc.id + '"' + (tired ? ' disabled' : '') + '>' +
        '<span class="pp-check' + (on ? ' is-on' : '') + '"></span>' +
        '<span class="pp-fig">' + portraitHtml(s, 30, 30) + '</span>' +
        '<span class="pp-name">' + s.name + '</span>' +
        '</button>' +
        '<span class="pp-eff">' + (tired ? '今天已经出去过了' : traitShort(s)) + '</span>' +
        '<span class="pp-slot-wrap">' +
        '<button type="button" class="pp-slot' + (gear ? ' is-on' : '') + '"' +
        ' data-act="gear-slot" data-id="' + s.id + '" data-loc="' + loc.id + '">' +
        (gear ? gearArt(gear, 26) : '空') +
        '</button>';

      if (gearMenuId === s.id) {
        var avail = [];

        if (state.items.flashlight) avail.push('torch');
        if (state.items.gasMask) avail.push('mask');
        if (state.items.backpack) avail.push('pack');
        if (state.items.weapon) avail.push('weapon');

        html += '<div class="pp-pop">';
        if (!avail.length) {
          html += '<span class="pp-pop-empty">没有空着的装备</span>';
        }
        for (var a = 0; a < avail.length; a++) {
          html += '<button type="button" class="pp-pop-btn" data-act="equip"' +
            ' data-gear="' + avail[a] + '" data-id="' + s.id +
            '" data-loc="' + loc.id + '" aria-label="' + GEAR_LABEL[avail[a]] + '">' +
            gearArt(avail[a], 24) + '</button>';
        }
        html += '</div>';
      }

      html += '</span></div>';
    }

    html += '</div>';

    var count = partyCount();

    html += '<div class="modal-actions">' +
      '<button type="button" class="btn btn-main"' + (count ? '' : ' disabled') +
      ' data-act="party-go" data-loc="' + loc.id + '">出发（' + count + ' 人）</button>' +
      '<button type="button" class="btn" data-act="close">取消</button>' +
      '</div>';

    openModal(html, 'modal-pick');
  }

  /* ---------------- 搜刮 ---------------- */

  function startSearch(locId, partyIds, depth) {
    if (searching) return;
    if (!partyIds || !partyIds.length) return;

    var loc = SF.findLocation(locId);
    if (!loc) return;

    var gate = SF.gateFor(state, loc, partyIds);
    if (!gate.ok) {
      openModal('<div class="modal-head"><span class="modal-title">无法出发</span></div>' +
        '<div class="res-text">' + gate.reason + '</div>' +
        '<div class="modal-actions"><button type="button" class="btn" data-act="close">知道了</button></div>',
        'modal-action');
      return;
    }

    raidLoc = locId;
    raidIds = partyIds.slice();
    raidDepth = depth || 1;

    // 同一个地点一天只能去一次，不管派几个人
    if (!state.searchedToday) state.searchedToday = {};

    // 一天只能出门一趟：再去就明天吧
    if (raidDepth <= 1 && state.exploredToday) {
      openModal('<div class="modal-head"><span class="modal-title">今天已经出去过了</span></div>' +
        '<div class="res-text">一天只够出去一趟。剩下的人留在家里，可以洗澡、改造，或者在「在家」里找点吃的。</div>' +
        '<div class="modal-actions">' +
        '<button type="button" class="btn btn-main" data-act="close">知道了</button>' +
        '</div>', 'modal-action');
      return;
    }

    if (raidDepth <= 1 && state.searchedToday[locId] === state.day) {
      openModal('<div class="modal-head"><span class="modal-title">今天已经去过了</span></div>' +
        '<div class="res-text">' + loc.name + ' 今天搜过了，货架都被你们翻空，再去也没东西了。' +
        '换个地方，或者先回避难所。</div>' +
        '<div class="modal-actions">' +
        '<button type="button" class="btn btn-main" data-act="close">知道了</button>' +
        '</div>', 'modal-action');
      return;
    }

    var names = [];
    for (var i = 0; i < partyIds.length; i++) {
      var m = SF.find(state, partyIds[i]);
      if (m && m.alive) names.push(m.name);
    }
    if (!names.length) {
      openModal('<div class="modal-head"><span class="modal-title">走不了了</span></div>' +
        '<div class="res-text">这一趟的人都不在了，先回避难所吧。</div>' +
        '<div class="modal-actions">' +
        '<button type="button" class="btn btn-main" data-act="back-home">回避难所</button>' +
        '</div>', 'modal-log');
      return;
    }

    // 记下这个地点今天已经搜过，今天也就算出去过了
    if (raidDepth <= 1) {
      state.searchedToday[locId] = state.day;
      state.exploredToday = true;
    }

    searching = true;

    openModal('<div class="modal-head">' +
      '<span class="modal-title">' + loc.name + '</span>' +
      '<span class="modal-sub">第 ' + raidDepth + ' 层 · 搜寻中……</span>' +
      '</div>' +
      '<div class="res-text">' + names.join('、') + ' 正在里面翻找，别出声。</div>',
      'modal-search');

    timer = window.setTimeout(function () {
      timer = 0;
      searching = false;

      try {
        lastReport = SF.explore(state, locId, partyIds, raidDepth);
      } catch (e) {
        lastReport = {
          location: loc,
          partyNames: [],
          loot: [],
          lines: ['这次的路线出了岔子，你们什么都没摸到就撤了回来。'],
          injured: [],
          item: null,
          choice: null,
          depth: raidDepth
        };
      }

      lastReport.depth = raidDepth;

      if (raidDepth === 1) raidTotals = {};
      for (var li = 0; li < lastReport.loot.length; li++) {
        var lk = lastReport.loot[li].key;
        raidTotals[lk] = (raidTotals[lk] || 0) + lastReport.loot[li].qty;
      }

      // 已经死了（全员阵亡或主角倒下）：立刻弹结算，不许再继续
      if (state.over && !state.won) {
        openGameOver();
        return;
      }

      if (!SF.aliveAll(state).length) {
        state.over = true;
        state.overDay = state.day;
        openGameOver();
        return;
      }

      // 第一 / 二层就超载：先逼玩家丢掉，丢完才能继续往里走
      if (!state.over && raidDepth < 3 && SF.packState(state).over > 0) {
        openBagCheck('trip');
        return;
      }

      try {
        renderLog();
      } catch (e) {
        // 结算界面万一出错，也别把玩家困在“搜寻中”里出不来
        openModal('<div class="modal-head"><span class="modal-title">这一步出了点状况</span></div>' +
          '<div class="res-text">东西已经记下了，先回避难所吧。</div>' +
          '<div class="modal-actions">' +
          '<button type="button" class="btn btn-main" data-act="back-home">回避难所</button>' +
          '</div>', 'modal-log');
      }
    }, C.explore.searchDelay);
  }

  /* 探险日志 */
  var RAID_TALK = [
    '还好找到了这些东西，今晚总算能多撑一顿。',
    '林晓把东西一样样码好：“省着点吃，能撑几天是几天。”',
    '铁柱把包往地上一扔：“就这些？下趟得多带两个人。”',
    '娜娜叹了口气：“至少今天不用空手回来了。”'
  ];

  function pickRaidTalk(kind) {
    var line = SF.raidTalk ? SF.raidTalk(state, raidIds, kind || 'haul') : '';
    if (line) return line;

    return RAID_TALK[Math.floor(Math.random() * RAID_TALK.length)];
  }

  function renderLog() {
    var r = lastReport;
    if (!r || !r.location) return;

    var pk = SF.packState(state);

    var html = '<div class="modal-head">' +
      '<span class="modal-title">探险日志</span>' +
      '<span class="modal-sub">' + r.location.name +
      ' · 背包 ' + pk.total + '/' + pk.cap +
      (pk.over > 0 ? '（超载 ' + pk.over + '）' : '') + '</span>' +
      '</div>';

    // 本次探索的临时背包：只有这一趟捡到的东西，空格子是还能装的位置
    var units = bagUnits();
    var slotHtml = '';
    var si;

    for (si = 0; si < pk.cap; si++) {
      var sk = units[si];
      slotHtml += sk
        ? '<span class="log-slot is-on">' + SF.itemSvg(bagIconKey(sk), 22) + '</span>'
        : '<span class="log-slot"></span>';
    }

    // 超出的（超载）用红框标出来
    for (si = pk.cap; si < units.length; si++) {
      slotHtml += '<span class="log-slot is-over">' +
        SF.itemSvg(bagIconKey(units[si]), 22) + '</span>';
    }

    html += '<div class="log-bag">' +
      '<span class="log-bag-cap">背包 ' + pk.total + ' / ' + pk.cap + '</span>' +
      '<div class="log-bag-slots">' + slotHtml + '</div>' +
      '</div>';

    for (var i = 0; i < r.lines.length; i++) {
      var lineText = hi(String(r.lines[i])).replace(/（([^）]*)）/g,
        '<span class="story-note">（$1）</span>');
      html += '<p class="log-line">' + lineText + '</p>';
    }

    html += '<div class="res-label">这一层摸到的</div>';
    if (r.loot.length) {
      html += '<div class="loot-row">';
      for (i = 0; i < r.loot.length; i++) {
        html += '<span class="loot-chip is-' + r.loot[i].key + '">' + SF.itemSvg(r.loot[i].key, 18) +
          '<span>' + r.loot[i].name + '</span>' +
          '<span class="loot-qty">×' + r.loot[i].qty + '</span></span>';
      }
      html += '</div>';
    } else {
      html += '<div class="empty-text">什么也没带回来。</div>';
    }

    // 本次探索累计结算（和顶部临时背包完全一致）
    var totalChips = '';
    var totalCount = units.length;
    var counts = {};

    for (si = 0; si < units.length; si++) {
      counts[units[si]] = (counts[units[si]] || 0) + 1;
    }

    for (var tk in counts) {
      if (!counts.hasOwnProperty(tk) || counts[tk] <= 0) continue;
      totalChips += '<span class="loot-chip is-total is-' + tk + '">' +
        SF.itemSvg(bagIconKey(tk), 18) +
        '<span class="loot-qty">×' + counts[tk] + '</span></span>';
    }

    if (totalChips) {
      html += '<div class="res-label">本次探索总计（共 ' + totalCount + ' 件）</div>' +
        '<div class="loot-row">' + totalChips + '</div>';
    }

    html += '<div class="night-story">' + (totalCount
      ? pickRaidTalk('haul')
      : pickRaidTalk('empty')) + '</div>';

    var got = (r.items && r.items.length) ? r.items : (r.item ? [r.item] : []);
    for (i = 0; i < got.length; i++) {
      html += '<div class="res-line"><span>特殊道具</span>' +
        '<span class="res-val">' + got[i].name + '</span></div>';
    }

    for (i = 0; i < r.injured.length; i++) {
      html += '<div class="res-line"><span>' + r.injured[i].name + '</span>' +
        '<span class="res-bad">受伤，血量 −' + r.injured[i].hp + '</span></div>';
    }

    if (r.choice) {
      html += '<div class="res-label">' + r.choice.title + '</div>' +
        '<div class="res-text">' + r.choice.text + '</div>' +
        '<div class="modal-actions modal-actions-col">';

      for (i = 0; i < r.choice.options.length; i++) {
        var op = r.choice.options[i];
        html += '<div class="opt-row">' +
          '<button type="button" class="btn' + (i === 0 ? ' btn-main' : '') + '"' +
          (op.disabled ? ' disabled' : '') +
          ' data-act="log-choice" data-key="' + op.key + '">' +
          op.label + '</button>' +
          (op.desc ? '<div class="opt-desc">' + op.desc + '</div>' : '') +
          '</div>';
      }
      html += '</div>';
    } else {
      html += '<div class="modal-actions">';

      if (raidDepth < 3 && !r.hardStop) {
        // 再往下一层有多危险、能翻到什么，先摆在玩家眼前
        if (SF.riskInfo) {
          var nxt = SF.riskInfo(state, r.location, raidIds, raidDepth + 1);
          html += '<div class="risk-note' +
            (nxt.level === 'danger' ? ' is-bad' : (nxt.level === 'warn' ? ' is-warn' : '')) +
            '">' + nxt.text + '</div>';
        }

        var facts = SF.depthFacts ? SF.depthFacts(state, r.location, raidIds, raidDepth + 1) : [];
        if (facts.length) {
          html += '<div class="depth-facts"><div class="df-title">第 ' +
            (raidDepth + 1) + ' 层能翻出什么</div><ul>';
          for (var fi = 0; fi < facts.length; fi++) {
            html += '<li>' + facts[fi] + '</li>';
          }
          html += '</ul></div>';
        }

        html += '<button type="button" class="btn btn-main" data-act="deeper">' +
          '继续深入（第 ' + (raidDepth + 1) + ' 层）</button>';
      }

      html += '<button type="button" class="btn" data-act="back-home">见好就收</button>' +
        '</div>';
    }

    openModal(html, 'modal-log');

    if (r.bubble) showBubble(r.bubble.charId, r.bubble.text);
  }

  function backHome() {
    closeModal();

    if (state.over) {
      openGameOver();
      return;
    }

    checkPackThenHome();
  }

  /* ---------------- 负重结算（网格） ---------------- */

  var bagLock = false;
  var bagMode = 'return';
  var bagPending = '';
  var gameOverLock = false;

  function bagUnits() {
    var totals = state.tripTotals || {};
    var order = ['food', 'water', 'medicine', 'material'];
    var units = [];

    for (var i = 0; i < order.length; i++) {
      var n = totals[order[i]] || 0;
      for (var j = 0; j < n; j++) units.push(order[i]);
    }

    // 特殊道具是“随身带”的，不占这一趟的格子，免得背包永远清不空
    return units;
  }

  var SPECIAL_LABEL = {
    flashlight: '手电筒', gasMask: '防毒面具', backpack: '双肩包', weapon: '武器',
    radio: '收音机', radioBroken: '破损的收音机', flare: '信号弹',
    cards: '扑克牌', pesticide: '杀虫剂'
  };

  function bagIconKey(key) {
    if (key === 'gasMask') return 'mask';
    if (key === 'radioBroken') return 'radio';
    return key;
  }

  function supplyLabel(key) {
    if (SPECIAL_LABEL[key]) return SPECIAL_LABEL[key];

    for (var i = 0; i < SF.SUPPLIES.length; i++) {
      if (SF.SUPPLIES[i].key === key) return SF.SUPPLIES[i].name;
    }
    return key;
  }

  function openBagCheck(mode) {
    bagMode = mode || 'return';
    bagPending = '';
    renderBagModal();
  }

  function renderBagModal() {
    var pk = SF.packState(state);
    var units = bagUnits();
    var i;

    var html = '<div class="modal-head">' +
      '<span class="modal-title">清点背包</span>' +
      '<span class="modal-sub">' + pk.total + ' / ' + pk.cap + ' 格</span>' +
      '</div>';

    if (pk.over > 0) {
      html += '<div class="bag-warn">背包超载！点任意一件物资就能丢掉</div>' +
        '<div class="bag-sub">还要再丢掉 ' + pk.over + ' 件（红框里的只是提示，实线格里的也能丢）</div>';
    } else if (bagMode === 'trip') {
      html += '<div class="bag-ok">装得下了，可以继续往里搜。</div>';
    } else {
      html += '<div class="bag-ok">刚好装得下，可以带回避难所。</div>';
    }

    html += '<div class="bag-grid">';

    // 实线格子 = 容量，里面的东西同样可以点
    for (i = 0; i < pk.cap; i++) {
      var k = units[i];

      if (!k) {
        html += '<div class="bag-slot is-empty"></div>';
        continue;
      }

      html += '<button type="button" class="bag-slot" data-act="bag-pick"' +
        ' data-key="' + k + '" title="点击丢弃 1 份' + supplyLabel(k) + '">' +
        SF.itemSvg(bagIconKey(k), 24) +
        '</button>';
    }

    // 红色虚线格子 = 超载提示区（动态算出来的）
    for (i = pk.cap; i < units.length; i++) {
      var ok2 = units[i];
      html += '<button type="button" class="bag-slot is-over" data-act="bag-pick"' +
        ' data-key="' + ok2 + '" title="点击丢弃 1 份' + supplyLabel(ok2) + '">' +
        SF.itemSvg(bagIconKey(ok2), 24) +
        '</button>';
    }

    html += '</div>';

    // 点了一件东西：先确认
    if (bagPending) {
      html += '<div class="bag-confirm">' +
        '<div class="bag-confirm-text">确定丢弃这 1 份' + supplyLabel(bagPending) + '吗？</div>' +
        '<div class="bag-confirm-actions">' +
        '<button type="button" class="btn btn-main" data-act="bag-drop"' +
        ' data-key="' + bagPending + '">确定丢弃</button>' +
        '<button type="button" class="btn" data-act="bag-cancel">取消</button>' +
        '</div></div>';
    } else {
      html += '<div class="modal-actions">' +
        '<button type="button" class="btn btn-main" data-act="bag-confirm"' +
        (pk.over > 0 ? ' disabled' : '') + '>' +
        (bagMode === 'trip' ? '继续' : '带回避难所') +
        '</button>' +
        '</div>';
    }

    // 超载只是提醒，不再锁死界面：清不掉也能先带回去
    bagLock = false;

    openModal(html, 'modal-bag');
  }

  function dropBagItem(key) {
    // 主线要用的东西丢不了，免得彻底卡关
    var NO_DROP = {
      flashlight: 1, gasMask: 1, weapon: 1, backpack: 1,
      radio: 1, radioBroken: 1, flare: 1
    };

    if (SPECIAL_LABEL[key]) {
      if (NO_DROP[key]) {
        updateHint('这是主线要用的东西，丢不了。');
        return;
      }

      // 特殊道具：丢掉就是真的没了
      if (state.items && state.items.hasOwnProperty(key)) {
        state.items[key] = false;
      }
      updateHint('丢掉了' + SPECIAL_LABEL[key] + '。');
      return;
    }

    if ((state.supplies[key] || 0) > 0) {
      state.supplies[key] = Math.max(0, Math.round(state.supplies[key] - 1));
    }
    if (!state.tripTotals) state.tripTotals = {};
    state.tripTotals[key] = Math.max(0, (state.tripTotals[key] || 0) - 1);

    updateHint('丢掉了 1 份' + supplyLabel(key) + '。');
  }

  function finishTrip() {
    bagLock = false;
    bagPending = '';
    state.tripTotals = {};
    state.tripCap = 0;
    state.tripMembers = [];

    if (SF.saveGame) SF.saveGame(state);

    renderShelter();
    showScreen('screen-shelter');
  }

  function checkPackThenHome() {
    if (SF.packState(state).over > 0) {
      openBagCheck('return');
      return;
    }
    finishTrip();
  }

  /* ---------------- 人物 ---------------- */

  function openDetail(id) {
    var s = SF.find(state, id);
    if (!s) return;

    // 找到这个人的设定卡（后来加入的幸存者没有，就用通用说法）
    var cfg = null;
    for (var ci = 0; ci < C.characters.length; ci++) {
      if (C.characters[ci].id === s.charId) cfg = C.characters[ci];
    }

    var chips = '';
    var list = statusBadges(s);
    if (list.length) {
      chips = '<div class="status-chips">';
      for (var c = 0; c < list.length; c++) {
        chips += '<span class="status-chip">' + SF.icon(list[c].icon, 11) +
          '<span>' + list[c].text + '</span></span>';
      }
      chips += '</div>';
    }

    var tagHtml = '';
    if (cfg && cfg.strengths) {
      for (var ti = 0; ti < cfg.strengths.length && ti < 3; ti++) {
        tagHtml += '<span class="hero-tag">' + cfg.strengths[ti].name + '</span>';
      }
    }

    // 头像 + 名字 + 身份 + 一句口头禅
    var html = '<div class="hero">' +
      '<div class="hero-fig">' + portraitHtml(s, 84, 104) + '</div>' +
      '<div class="hero-meta">' +
      '<div class="hero-name">' + s.name + '</div>' +
      '<div class="hero-role">' + s.role +
      (s.trait ? ' · ' + s.trait : '') + '</div>' +
      (cfg && cfg.quote ? '<div class="hero-quote">“' + cfg.quote + '”</div>' : '') +
      (tagHtml ? '<div class="hero-tags">' + tagHtml + '</div>' : '') +
      '</div></div>';

    // 说清楚能力怎么算
    html += '<div class="info-box"><div class="box-title">能力</div>' +
      '<div class="box-text">' +
      '只要跟着一起出门就自动生效，不需要谁带头。' +
      '</div></div>';

    // 人物背景
    if (cfg && cfg.bio) {
      html += '<div class="info-box">' +
        '<div class="box-title">人物背景</div>' +
        '<div class="box-text">' + hi(cfg.bio) + '</div>' +
        '</div>';
    }

    // 长处：一条一条列清楚
    if (cfg && cfg.strengths && cfg.strengths.length) {
      html += '<div class="info-box"><div class="box-title">长处</div>';
      for (var ai = 0; ai < cfg.strengths.length; ai++) {
        html += '<div class="adv-row">' +
          '<span class="adv-name">' + cfg.strengths[ai].name + '</span>' +
          '<span class="adv-desc">' + hi(cfg.strengths[ai].desc) + '</span>' +
          '</div>';
      }
      html += '</div>';
    } else {
      html += '<div class="info-box"><div class="box-title">长处</div>' +
        '<div class="box-text">' + (s.trait || '普通人') + '：' +
        hi(s.traitText || '没什么特别的本事，但愿意跟着你走。') + '</div></div>';
    }

    // 今天的状态
    html += '<div class="info-box"><div class="box-title">今天的状态</div>' +
      chips + statsBlock(s) + '</div>';

    if (s.sick) {
      html += '<div class="alert bad">正在生病。每晚会掉血，点下面的「用药品」可以治疗。</div>';
    }
    if (s.hunger >= C.night.painAt) {
      html += '<div class="alert">饿得厉害，再吃不上东西就要掉血了。</div>';
    }
    if (s.thirst >= C.night.painAt) {
      html += '<div class="alert">渴得厉害，再喝不上水就要掉血了。</div>';
    }

    var specials = '';
    if (s.sick && (state.supplies.medicine || 0) >= 1) {
      specials += '<button type="button" class="btn btn-main" data-act="use-med"' +
        ' data-id="' + s.id + '">用药品</button>';
    }
    if (state.items.gasMask && !s.hasMask) {
      specials += '<button type="button" class="btn" data-act="mask"' +
        ' data-id="' + s.id + '">戴防毒面具</button>';
    }
    if (specials) {
      html += '<div class="modal-actions">' + specials + '</div>';
    }

    html += '<div class="modal-actions">' +
      '<button type="button" class="btn" data-act="close">关闭</button>' +
      '</div>';

    openModal(html, 'modal-detail');
  }

  function openRoster() {
    var alive = SF.aliveAll(state);
    var html = '<div class="modal-head">' +
      '<span class="modal-title">人物状态</span>' +
      '<span class="modal-sub">' + alive.length + ' 人</span>' +
      '</div>';

    if (!alive.length) {
      html += '<div class="empty-text">一个人也没有了。</div>';
    }

    for (var i = 0; i < alive.length; i++) {
      var s = alive[i];
      html += '<button type="button" class="roster-row" data-act="detail" data-id="' + s.id + '">' +
        '<span class="roster-fig">' + portraitHtml(s, 28, 38) + '</span>' +
        '<span class="roster-main">' +
        '<span class="roster-top"><b>' + s.name + '</b>' +
        '<span class="roster-role">' + s.role + '</span>' +
        (s.sick ? '<span class="tag tag-bad">生病</span>' : '') +
        '</span>' +
        '<span class="mini-stats">' +
        '<span>渴 ' + Math.round(s.thirst) + '</span>' +
        '<span>饿 ' + Math.round(s.hunger) + '</span>' +
        '<span>血 ' + Math.round(s.hp) + '</span>' +
        '<span>心 ' + Math.round(s.mood) + '</span>' +
        '</span>' +
        '</span>' +
        '</button>';
    }

    html += '<div class="modal-actions">' +
      '<button type="button" class="btn" data-act="close">关闭</button>' +
      '</div>';

    openModal(html, 'modal-roster');
  }

  /* ---------------- 收音机 / 特殊道具 ---------------- */

  function openBroadcast() {
    var list = C.broadcasts;
    var text = list[Math.floor(Math.random() * list.length)];

    var left = state.rescueDay
      ? '军方频道：救援日，第 ' + state.rescueDay + ' 天。'
      : (state.items.radio
        ? '军方频道：“保持静默，等待下一步指令。”'
        : '收音机还没修好，听不到军方频道。');

    openModal('<div class="modal-head">' +
      '<span class="modal-title">收音机</span>' +
      '<span class="modal-sub">沙沙作响</span>' +
      '</div>' +
      '<div class="res-text">“' + text + '”</div>' +
      '<div class="res-label">频道提示</div>' +
      '<div class="res-text">' + left + '</div>' +
      '<div class="modal-actions"><button type="button" class="btn" data-act="close">关掉</button></div>',
      'modal-radio');
  }

  function openPesticide() {
    openModal('<div class="modal-head">' +
      '<span class="modal-title">杀虫剂</span>' +
      '<span class="modal-sub">道具</span>' +
      '</div>' +
      '<div class="res-text">半罐杀虫剂。喷头还能用，以后修通风口、处理床铺上的虫子都得靠它。</div>' +
      '<div class="modal-actions"><button type="button" class="btn" data-act="close">关闭</button></div>',
      'modal-gear');
  }

  function tryRepair() {
    var r = SF.repairRadio(state);
    renderShelter();

    if (r.ok) {
      openModal('<div class="modal-head">' +
        '<span class="modal-title">收音机</span>' +
        '<span class="modal-sub">修好了</span>' +
        '</div>' +
        '<div class="res-text">陈默把后盖撬开，吹了吹灰，拧了两下线圈。沙沙声里终于有了人声。</div>' +
        '<div class="modal-actions">' +
        '<button type="button" class="btn btn-main" data-act="radio-listen">听广播</button>' +
        '<button type="button" class="btn" data-act="close">关闭</button>' +
        '</div>',
        'modal-radio');
    } else {
      openModal('<div class="modal-head">' +
        '<span class="modal-title">收音机</span>' +
        '<span class="modal-sub">没修好</span>' +
        '</div>' +
        '<div class="res-text">拆开鼓捣了半天，还是只有杂音。明天再试试吧（成功率 ' +
        Math.round(r.chance * 100) + '%）。</div>' +
        '<div class="modal-actions">' +
        '<button type="button" class="btn" data-act="close">关闭</button></div>',
        'modal-radio');
    }
  }

  function openGearInfo(title, text) {
    openModal('<div class="modal-head">' +
      '<span class="modal-title">' + title + '</span>' +
      '</div>' +
      '<div class="res-text">' + text + '</div>' +
      '<div class="modal-actions"><button type="button" class="btn" data-act="close">关闭</button></div>',
      'modal-gear');
  }

  /* 库存面板：点物资图标拿起/放下（备用委托），点特殊道具看详情 */
  function onShelfClick(ev) {
    var hold = elementFrom(ev.target, $('shelf'), 'data-hold');
    if (hold) {
      pickItem(hold.getAttribute('data-hold'));
      return;
    }

    var gear = elementFrom(ev.target, $('shelf'), 'data-item');
    if (!gear) return;

    openGear(gear.getAttribute('data-item'));
  }

  var tipTimer = 0;

  function showCenterTip(text, sticky) {
    var el = $('center-tip');
    if (!el) return;

    el.textContent = text;
    el.classList.add('is-on');

    if (tipTimer) {
      window.clearTimeout(tipTimer);
      tipTimer = 0;
    }

    if (!sticky) {
      tipTimer = window.setTimeout(function () {
        tipTimer = 0;
        el.classList.remove('is-on');
      }, 3000);
    }
  }

  function hideCenterTip() {
    var el = $('center-tip');
    if (tipTimer) {
      window.clearTimeout(tipTimer);
      tipTimer = 0;
    }
    if (el) el.classList.remove('is-on');
  }

  function itemDesc(key) {
    if (key === 'food') return '【食物：食用后恢复 40 点饥饿值】';
    if (key === 'water') return '【水：饮用后恢复 40 点口渴值】';
    if (key === 'medicine') return '【止疼药：治好生病并恢复 30 点血量】';
    if (key === 'material') return '【木板：修补窗户、钉死大门、生火取暖】';
    if (key === 'flashlight') return '【手电筒：探索暗处时物资收益增加】';
    if (key === 'weapon') return '【防暴棍：保安亭必备，也能当撬棍】';
    if (key === 'radio') return '【收音机：修好后能收到军方情报】';
    if (key === 'flare') return '【信号弹：救援直升机靠它找到你们】';
    if (key === 'mask') return '【防毒面具：进入医务室的必需品】';
    if (key === 'cards') return '【扑克牌：避难所里每天心情恢复更快】';
    if (key === 'pesticide') return '【杀虫剂：清理通风口和床铺的虫子】';
    if (key === 'backpack') return '【双肩包：给一个人背上，他的负重 +2 格】';
    return '';
  }

  function openGear(key) {
    // 破收音机：用 3 块木板钉个新外壳
    if (key === 'radioBroken' || (key === 'radio' && state.items.radioBroken && !state.items.radio)) {
      var boards = (state.supplies.material || 0);

      openModal('<div class="modal-head">' +
        '<span class="modal-title">破损的收音机</span>' +
        '</div>' +
        '<div class="gear-big-ico is-broken">' + SF.itemSvg('radio', 44) + '</div>' +
        '<div class="res-text">外壳和天线碎了，需要 3 块木板重新钉个外壳。</div>' +
        '<div class="res-text">现有木板：' + boards + ' / 3</div>' +
        '<div class="modal-actions modal-actions-col">' +
        '<button type="button" class="btn btn-main" data-act="repair-radio"' +
        (boards < 3 ? ' disabled' : '') + '>消耗 3 木板修理</button>' +
        (boards < 3 ? '<div class="opt-lack">【木板不足】</div>' : '') +
        '<button type="button" class="btn" data-act="close">先放着</button>' +
        '</div>',
        'modal-gear');
      return;
    }

    var owned = true;

    if (key === 'flashlight') owned = !!state.items.flashlight;
    else if (key === 'weapon') owned = !!state.items.weapon;
    else if (key === 'radio') owned = !!state.items.radio;
    else if (key === 'mask' || key === 'gasMask') owned = !!state.items.gasMask;
    else if (state.supplies[key] !== undefined) owned = (state.supplies[key] || 0) > 0;

    if (!owned) {
      updateHint('【未知物品：还没搜到】');
      return;
    }

    updateHint(itemDesc(key) || '');
  }

  /* ---------------- 物资兑换（占位） ---------------- */

  function openCraft() {
    openModal('<div class="modal-head">' +
      '<span class="modal-title">物资兑换</span>' +
      '<span class="modal-sub">占位</span>' +
      '</div>' +
      '<div class="res-text">这里以后放合成配方，比如：罐头 + 材料 → 热餐，药品 + 材料 → 急救包。</div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn" data-act="close">知道了</button>' +
      '</div>',
      'modal-craft');
  }

  /* ---------------- 夜晚结算 ---------------- */

  /* 夜晚：先结算吃饭，再处理随机事件，最后收尾 */
  function openNightEvent() {
    var ev = nightReport.event;
    if (!ev) return;

    var available = 0;
    var i;

    for (i = 0; i < ev.options.length; i++) {
      if (!ev.options[i].disabled) available += 1;
    }

    // 万一所有选项都点不了，直接按最保守的结果推进，绝不卡死
    if (!available) {
      SF.resolveHardNightEvent(state, nightReport, 'skip');
      finishNight();
      return;
    }

    var html = '<div class="modal-head">' +
      '<span class="modal-title">' + ev.title + '</span>' +
      '<span class="modal-sub">夜里</span>' +
      '</div>' +
      '<div class="res-text">' + ev.text + '</div>' +
      '<div class="modal-actions">';

    for (i = 0; i < ev.options.length; i++) {
      var op = ev.options[i];
      html += '<button type="button" class="btn' + (i === 0 ? ' btn-main' : '') + '"' +
        (op.disabled ? ' disabled' : '') +
        ' data-act="night-choice" data-key="' + op.key + '">' +
        op.label + (op.disabled ? '（物资不足）' : '') + '</button>';
    }

    html += '</div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn" data-act="night-choice" data-key="skip">什么也不做</button>' +
      '</div>';

    openModal(html, 'modal-night-event');
  }

  // 夜里的大事：死人 / 发疯 / 生病 / 打架 / 丧尸撞门 / 没吃上饭
  // 这些必须先弹一个挡路的窗口，玩家亲手点掉才进得了下一天
  var CRITICAL_NIGHT = ['zombieDoor', 'fight', 'fightMood', 'mad', 'sick',
    'badCan', 'acidRain', 'cold', 'hungry'];

  function nightCritical(n) {
    var out = [];
    if (!n || !n.events) return out;

    for (var i = 0; i < n.events.length; i++) {
      var ev = n.events[i];
      if (ev && CRITICAL_NIGHT.indexOf(ev.id) >= 0) out.push(ev);
    }
    return out;
  }

  var nightSteps = [];

  function runNightSteps() {
    if (!nightSteps.length) {
      openNight();
      return;
    }

    var step = nightSteps.shift();

    if (step === 'death') {
      openDeathAlert();
      return;
    }
    if (step === 'alert') {
      openNightAlert();
      return;
    }

    openNight();
  }

  /* 有人死了：全屏血红警告，必须点【安葬】才往下走 */
  function openDeathAlert() {
    var list = (nightReport && nightReport.deathsList) || [];

    var html = '<div class="dead-mark">死亡</div>' +
      '<div class="dead-title">这一夜，有人再也没醒过来</div>' +
      '<div class="dead-list">';

    for (var i = 0; i < list.length; i++) {
      html += '<div class="dead-one"><b>' + list[i].name + '</b>' +
        '<span>死因：' + list[i].cause + '</span></div>';
    }

    html += '</div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn btn-main" data-act="bury">' +
      (list.length > 1 ? '把他们安葬' : '安葬他／她') + '</button>' +
      '</div>';

    openModal(html, 'modal-death-alert');
  }

  /* 夜里出的事：一件一件念出来，玩家点【知道了】才看得到结算 */
  function openNightAlert() {
    var evs = nightCritical(nightReport);

    var html = '<div class="na-tag">夜间警情</div>' +
      '<div class="na-title">第 ' + nightReport.day + ' 夜，出事了</div>' +
      '<div class="na-list">';

    for (var i = 0; i < evs.length; i++) {
      html += '<div class="na-line">' + evs[i].text + '</div>';
    }

    html += '</div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn btn-main" data-act="night-ok">知道了</button>' +
      '</div>';

    openModal(html, 'modal-night-alert');
  }

  function finishNight() {
    nightReport = SF.finishNight(state, nightReport);
    if (SF.saveGame) SF.saveGame(state);
    renderShelter();
    showScreen('screen-shelter');

    if (state.won) {
      openVictory();
      return;
    }

    if (nightReport.allDead || state.over) {
      openGameOver();
      return;
    }

    // 死亡警告 → 夜间警情 → 夜间结算，一步步点过去
    nightSteps = [];
    if (nightReport.deathsList && nightReport.deathsList.length) nightSteps.push('death');
    if (nightCritical(nightReport).length) nightSteps.push('alert');
    runNightSteps();
  }

  /* 线性主线：进入新的一天时弹一次 */
  function showStoryIfAny() {
    if (!SF.storyFor) return false;

    var st = SF.storyFor(state);
    if (!st) return false;
    if (state.storySeenDay === state.day) return false;

    state.storySeenDay = state.day;

    openModal('<div class="modal-head">' +
      '<span class="modal-title">' + st.title + '</span>' +
      '<span class="modal-sub">第 ' + state.day + ' 天</span>' +
      '</div>' +
      '<div class="res-text">' + hiLines(st.text) + '</div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn btn-main" data-act="close">知道了</button>' +
      '</div>',
      'modal-story');

    return true;
  }

  /* 关掉早晨的弹窗后，继续走早晨的队列 */
  function afterModalClose() {
    runMorningQueue();
  }

  /* ---------------- 白天突发事件 ---------------- */

  function currentDayEvent() {
    try {
      return SF.dayEventFor ? SF.dayEventFor(state) : null;
    } catch (e) {
      return null;
    }
  }

  /* 门口来的人：有就弹窗，返回有没有弹 */
  function openDayEvent() {
    try {
      var ev = currentDayEvent();
      if (!ev || !ev.options) return false;

      var html = '<div class="modal-head">' +
        '<span class="modal-title">' + ev.title + '</span>' +
        '<span class="modal-sub">第 ' + state.day + ' 天 · 一大早</span>' +
        '</div>' +
        '<div class="res-text">' + hi(ev.text) + '</div>' +
        '<div class="modal-actions modal-actions-col">';

      for (var i = 0; i < ev.options.length; i++) {
        var op = ev.options[i];
        var lack = op.disabled && ev.options[i].lack ? ev.options[i].lack : '';

        html += '<div class="opt-row">' +
          '<button type="button" class="btn' +
          (i === 0 && !op.disabled ? ' btn-main' : '') + '"' +
          (op.disabled ? ' disabled' : '') +
          ' data-act="day-event" data-key="' + op.key + '">' +
          op.label + '</button>' +
          (lack ? '<div class="opt-lack">【' + lack + '】</div>' : '') +
          '</div>';
      }

      html += '</div>';

      openModal(html, 'modal-day-event');
      return true;
    } catch (e) {
      // 兜底：事件本身出问题就直接跳过这一天，绝不把【出门探索】锁死
      try {
        state.dayEventDone = state.day;
      } catch (e2) { }
      return false;
    }
  }

  /* 早晨：先把门口的人处理掉，再讲今天的剧情 */
  var morningQueue = [];

  function startNewDay() {
    morningQueue = [];

    if (currentDayEvent()) morningQueue.push('event');

    if (state.storySeenDay !== state.day) morningQueue.push('story');

    // 没有收音机之前：消息靠楼道里的喊叫、窗外飘来的话，从屏幕中间冒出来
    if (!state.items.radio && SF.streetShout) {
      morningQueue.push({ shout: SF.streetShout() });
    }

    renderShelter();
    runMorningQueue();
  }

  function runMorningQueue() {
    while (morningQueue.length) {
      var step = morningQueue.shift();

      if (step === 'event') {
        if (openDayEvent()) return;
        // 弹不出来：立刻重画一次，把【出门探索】解开
        renderShelter();
      } else if (step === 'story') {
        if (showStoryIfAny()) return;
      } else if (step && step.shout) {
        showCenterTip(step.shout);
      }
    }
  }

  function openVictory() {
    noteRecord('win');

    var days = state.overAtDay || state.day;
    var kind = state.endingKind || 'perfect';
    var names = SF.aliveAll(state).map(function (s) { return s.name; }).join('、');
    var lost = SF.deadCount ? SF.deadCount(state) : 0;

    var title = '一个不少';
    var line = '';

    if (kind === 'day30') {
      title = '熬到了头';
      line = '第 30 天的傍晚，楼下忽然传来汽车引擎声。你们把窗帘拉开一条缝，' +
        '看见两辆涂着军徽的车停在院门口。没有人开枪，也没有人尖叫。\n' +
        '搜救队敲门的时候，你们已经不认识日历了。';
    } else if (kind === 'scarred') {
      title = '带他们回家';
      line = '直升机落下来的时候，楼顶只有 ' + (names || '一个人') + ' 还站着。\n' +
        '剩下的 ' + lost + ' 个同伴，你用毯子一层层裹好，一趟一趟背了上来。\n' +
        '螺旋桨转起来的时候，你没敢回头看那几张脸。';
    } else {
      title = '一个不少';
      line = '直升机落下来的时候，四个人都站在楼顶。\n' +
        '谁也没说话，只是把手里的东西一件件扔进机舱。';
    }

    var html = '<div class="modal-head"><span class="modal-title">' + title + '</span></div>' +
      '<div class="vic-days">活到了第 <b>' + days + '</b> 天</div>' +
      '<div class="res-text">' + hiLines(line) + '</div>' +
      '<div class="res-label">活下来的人</div>' +
      '<div class="res-text">' + (names || '没有人') + '</div>';

    // 后日谈：活下来的人后来怎么样了
    var epi = '';
    var aliveList = SF.aliveAll(state);

    for (var ai = 0; ai < aliveList.length; ai++) {
      var as = aliveList[ai];
      var acfg = null;
      for (var ci2 = 0; ci2 < C.characters.length; ci2++) {
        if (C.characters[ci2].id === as.charId) acfg = C.characters[ci2];
      }
      if (acfg && acfg.epilogue) {
        epi += '<div class="epi-line"><b>' + as.name + '</b>：' + acfg.epilogue + '</div>';
      }
    }

    if (epi) {
      html += '<div class="res-label">后来</div>' + epi;
    }

    if (kind === 'scarred') {
      html += '<div class="res-label">带走的</div>' +
        '<div class="res-text">' + lost + ' 个同伴</div>';
    }

    var recV = recordLine();
    if (recV) {
      html += '<div class="res-text">' + recV + '</div>';
    }

    html += '<div class="modal-actions">' +
      '<button type="button" class="btn btn-main" data-act="restart">再来一局</button>' +
      '</div>';

    openModal(html, 'modal-over');
    $('overlay').classList.add('is-victory');
  }

  /* ---------------- 主界面投喂 ---------------- */

  // 手里正拿着的物资：'food' | 'water' | null
  var heldItem = null;
  // 刚喂过的人：卡片闪一下
  var flashId = null;
  var hintTimer = 0;

  function isInside(el, node) {
    while (el && el.nodeType === 1) {
      if (el === node) return true;
      el = el.parentNode;
    }
    return false;
  }

  /* 直接用 style 点亮 / 熄灭右上角的图标，不依赖任何类名 */
  function paintHold() {
    var keys = ['food', 'water', 'medicine'];
    var i;

    for (i = 0; i < keys.length; i++) {
      var el = document.getElementById('hold-' + keys[i]);
      if (!el) continue;

      el.style.pointerEvents = 'auto';

      if (heldItem === keys[i]) {
        el.style.border = '4px solid #ffeb3b';
        el.style.boxShadow = '0 0 12px #ffeb3b';
        el.style.background = 'rgba(255, 235, 59, 0.3)';
        el.style.zIndex = '60';
      } else {
        el.style.border = '1px solid rgba(255, 255, 255, 0.12)';
        el.style.boxShadow = 'none';
        el.style.background = 'rgba(255, 255, 255, 0.05)';
        el.style.zIndex = '';
      }
    }
  }

  /* 底部提示：选中物资时是红色的“请点击人物” */
  function updateHint(message) {
    var bar = $('hintbar');
    if (!bar) return;

    if (hintTimer) {
      window.clearTimeout(hintTimer);
      hintTimer = 0;
    }

    if (heldItem) {
      var heldText = heldItem === 'food' ? '已拿起食物（恢复50饥饿值） | 请点击人物'
        : (heldItem === 'water' ? '已拿起水（恢复50口渴值） | 请点击人物'
          : '已拿起药品（治病并回50血） | 请点击人物');
      bar.textContent = heldText;
      bar.style.color = '#ffffff';
      bar.style.fontWeight = '700';
      return;
    }

    bar.style.color = '';
    bar.style.fontWeight = '';
    bar.textContent = message || dayHint();

    if (!message && allFed()) {
      bar.style.color = '#7fd16a';
    }

    if (message) {
      hintTimer = window.setTimeout(function () {
        hintTimer = 0;
        if (heldItem) return;
        var b = $('hintbar');
        if (b) b.textContent = dayHint();
      }, 1600);
    }
  }

  /* 图标和名片：统一交给 #shelf / #people 上的事件委托处理。
     千万不能再给每个节点单独绑 onclick，否则一次点击会结算两次：
     第一次喂成功，第二次变成“已经吃过了”，还会顺手把人物详情弹出来。 */
  function bindFastTaps() {
    var keys = ['food', 'water', 'medicine'];
    var i;

    for (i = 0; i < keys.length; i++) {
      (function (key) {
        var el = document.getElementById('hold-' + key);
        if (!el) return;

        el.style.pointerEvents = 'auto';
        el.onclick = function (ev) {
          if (ev) ev.stopPropagation();
          pickItem(key);
        };
      })(keys[i]);
    }

    var cards = document.querySelectorAll('.mini-card');
    for (i = 0; i < cards.length; i++) {
      (function (card) {
        var id = card.getAttribute('data-id');
        if (!id) return;

        card.style.pointerEvents = 'auto';
        card.onclick = function (ev) {
          if (ev) ev.stopPropagation();
          onPersonTap(id);
        };
      })(cards[i]);
    }
  }

  /* 名片：绑在自己的节点上，点一下就结算 */
  function bindCardTap(el, id) {
    el.style.pointerEvents = 'auto';

    el.onclick = function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      onPersonTap(id);
    };
  }

  function holdLabel(key) {
    if (key === 'food') return '食物';
    if (key === 'water') return '水';
    return '止疼药';
  }

  /* 点物资：选中 / 放下。没有冷却，连点也一定生效 */
  function pickItem(key) {
    if (heldItem === key) {
      heldItem = null;
      renderShelter();
      updateHint();
      hideCenterTip();
      return;
    }

    if ((state.supplies[key] || 0) <= 0) {
      heldItem = null;
      renderShelter();
      updateHint('没有' + holdLabel(key) + '了，先出门找回来。');
      hideCenterTip();
      return;
    }

    heldItem = key;
    renderShelter();
    updateHint();
    if (SF.sfx && SF.sfx.pick) SF.sfx.pick();
  }

  /* 点空白处：把手里的东西放回去 */
  function clearHold() {
    if (!heldItem) return;
    heldItem = null;
    renderShelter();
  }

  /* 喂一个人 / 给他用药：当场同步结算 */
  function feedPerson(id) {
    var kind = heldItem;
    if (!kind) return;

    var label = holdLabel(kind);

    // 兜底：库存已经空了，立刻提示并取消选中，绝不拿着空气卡住
    if ((state.supplies[kind] || 0) <= 0) {
      heldItem = null;
      renderShelter();
      updateHint('没有' + label + '了');
      showCenterTip('没有' + label + '了');
      return;
    }

    var res;

    try {
      res = kind === 'medicine'
        ? SF.useMedicineOn(state, id)
        : SF.feed(state, id, kind);
    } catch (e) {
      res = { ok: false, msg: '这一下没结算成功，再点一次就好。' };
    }

    var ok = !!(res && res.ok);

    // 不管成不成，点过人就松手：失败时也取消高亮，玩家可以重新拿、重新点
    heldItem = null;
    flashId = ok ? id : null;

    if (ok && SF.sfx) {
      try {
        if (kind === 'food' && SF.sfx.eat) SF.sfx.eat();
        else if (kind === 'water' && SF.sfx.drink) SF.sfx.drink();
        else if (SF.sfx.pick) SF.sfx.pick();
      } catch (e) {
        /* 声音失败不影响结算 */
      }
    }

    renderShelter();
    hideCenterTip();

    if (ok) {
      updateHint((res && res.msg) || '喂好了。');
    } else {
      updateHint((res && res.msg) ? res.msg : '现在没法给他' + label + '。');
    }

    var flashing = flashId;
    if (flashing) {
      window.setTimeout(function () {
        if (flashId === flashing) flashId = null;
      }, 700);
    }
  }

  /* 点名片：手里有东西就喂，否则打开人物面板 */
  function onPersonTap(id) {
    var s = SF.find(state, id);
    if (!s) return;

    // 人已经没了：手里的东西也要放下，不能让高亮僵在屏幕上
    if (!s.alive || s.hp <= 0) {
      if (heldItem) {
        heldItem = null;
        renderShelter();
        updateHint('这个人已经不在了。');
      }
      return;
    }

    if (heldItem) {
      feedPerson(id);
      return;
    }

    // 只是看看这个人：不抢“选中”的金框，避免卡片高亮乱跳
    openDetail(s.id);
  }

  /* 「结束今天」：按今天已经喂过的人直接结算，不再弹分配窗 */
  function endDay() {
    var alive = SF.aliveAll(state);
    if (!alive.length) {
      state.over = true;
      if (!state.overDay) state.overDay = state.day;
      openGameOver();
      return;
    }

    heldItem = null;

    var plan = { eat: {}, drink: {}, prepaid: true };
    var i;

    for (i = 0; i < alive.length; i++) {
      var m = (state.meal && state.meal[alive[i].id]) || {};
      if (m.eat) plan.eat[alive[i].id] = true;
      if (m.drink) plan.drink[alive[i].id] = true;
    }

    nightReport = SF.startNight(state, plan);

    renderShelter();
    showScreen('screen-shelter');

    if (nightReport.event) {
      openNightEvent();
    } else {
      finishNight();
    }
  }

  /* 投喂：一次把还饿着/渴着的人喂完 */
  function openFeedAll() {
    var alive = SF.aliveAll(state);
    if (!alive.length) return;

    var needFood = 0;
    var needWater = 0;
    var i;

    for (i = 0; i < alive.length; i++) {
      var m = (state.meal && state.meal[alive[i].id]) || {};
      if (!m.eat) needFood += SF.foodNeed(alive[i]);
      if (!m.drink) needWater += SF.waterRation(state);
    }

    var haveFood = Math.round(state.supplies.food || 0);
    var haveWater = Math.round(state.supplies.water || 0);

    openModal('<div class="modal-head">' +
      '<span class="modal-title">投喂</span>' +
      '<span class="modal-sub">一次把还饿着的人喂完</span>' +
      '</div>' +
      '<div class="res-text">还没吃：还需要 ' + needFood + ' 份 · 库存 ' + haveFood + ' 份</div>' +
      '<div class="res-text">还没喝：还需要 ' + needWater + ' 瓶 · 库存 ' + haveWater + ' 瓶</div>' +
      '<div class="modal-actions modal-actions-col">' +
      '<button type="button" class="btn btn-main" data-act="feed-all-food"' +
      (needFood === 0 || haveFood < needFood ? ' disabled' : '') + '>' +
      (needFood === 0 ? '都吃过了' : '全部喂食（食物 -' + needFood + '）') +
      '</button>' +
      '<button type="button" class="btn" data-act="feed-all-water"' +
      (needWater === 0 || haveWater < needWater ? ' disabled' : '') + '>' +
      (needWater === 0 ? '都喝过了' : '全部喂水（水 -' + needWater + '）') +
      '</button>' +
      '<button type="button" class="btn" data-act="close">先这样</button>' +
      '</div>',
      'modal-feed');
  }

  function feedAll(kind) {
    var alive = SF.aliveAll(state);
    var okCount = 0;

    for (var i = 0; i < alive.length; i++) {
      if ((state.supplies[kind] || 0) <= 0) break;
      var res = SF.feed(state, alive[i].id, kind);
      if (res && res.ok) okCount += 1;
    }

    closeModal();
    renderShelter();

    updateHint(okCount
      ? '给 ' + okCount + ' 个人喂了' + (kind === 'food' ? '饭' : '水') + '。'
      : '没人需要再喂了。');
  }

  function openNight() {
    var n = nightReport;

    var html = '<div class="modal-head">' +
      '<span class="modal-title">第 ' + n.day + ' 夜</span>' +
      '<span class="modal-sub">' +
      (n.events && n.events.length ? n.events.length + ' 件事' : '很安静') +
      '</span>' +
      '</div>';

    html += '<div class="consume-line">今日消耗：食物 -' + (n.foodUsed || 0) +
      ' · 水 -' + (n.waterUsed || 0) + '</div>';

    if (n.dayNote) {
      html += '<div class="res-label">今天的总结</div>' +
        '<div class="night-story">' + hi(n.dayNote) + '</div>';
    }

    if (n.condition) {
      html += '<div class="night-story">明天早上的状况：' + hi(n.condition) + '</div>';
    }

    if (n.milestone) {
      html += '<div class="warn-line">' + hi('【主线警告】' + n.milestone) + '</div>';
    }

    html += '<div class="res-label">夜里发生了什么</div>';

    if (n.events && n.events.length) {
      for (var i = 0; i < n.events.length; i++) {
        var ev = n.events[i];
        html += '<div class="night-story">' + hi(ev.text) + '</div>';

        if (ev.char) {
          html += '<div class="warn-line">【警告：' + ev.char +
            (ev.id === 'sick' ? ' 因极度口渴，已进入生病状态！' : ' 精神崩溃，已经发疯！') +
            '】</div>';
        }
      }
    } else {
      html += '<div class="night-story">这一夜很安静，只有风吹过铁皮的声音。</div>';
    }

    // 数值结算：把每个人的变化用彩色标签列出来
    if (n.rows && n.rows.length) {
      html += '<div class="res-label">数值结算</div>';

      for (var rI = 0; rI < n.rows.length; rI++) {
        var row = n.rows[rI];
        var tags = '';

        function dtag(label, v, goodWhenUp) {
          if (!v) return '';
          var up = v > 0;
          var good = goodWhenUp ? up : !up;
          return '<span class="delta ' + (good ? 'is-good' : 'is-bad') + '">' +
            label + (up ? '+' : '') + Math.round(v) + '</span>';
        }

        tags += dtag('食', -(row.hungerAfter - row.hungerBefore), true);
        tags += dtag('水', -(row.thirstAfter - row.thirstBefore), true);
        tags += dtag('血', row.hpAfter - row.hpBefore, true);
        tags += dtag('心', row.moodAfter - row.moodBefore, true);

        if (row.sick) tags += '<span class="delta is-bad">生病</span>';
        if (row.died) tags += '<span class="delta is-bad">倒下</span>';

        html += '<div class="delta-row"><span class="delta-name">' + row.name +
          '</span><span class="delta-tags">' + (tags || '<span class="delta is-gray">无事</span>') +
          '</span></div>';
      }
    }

    if (n.deaths && n.deaths.length) {
      html += '<div class="alert bad">' + hi(n.deaths.join('、') + ' 没能撑过这一夜。') + '</div>';
    }

    html += '<div class="modal-actions">' +
      '<button type="button" class="btn btn-main" data-act="next-day">进入第 ' +
      state.day + ' 天</button>' +
      '</div>';

    openModal(html, 'modal-night');
  }

  /*
   * 死亡结算：一整屏的背景图 + 存活记录，
   * 底下问一句「要不要重新开始」，选「重新开始」就回到片头那一幕。
   */
  /* ---------------- 成绩记录 ---------------- */
  var REC_KEY = 'sf-records';
  var recordDone = false;

  function readRecords() {
    try {
      var raw = localStorage.getItem(REC_KEY);
      var o = raw ? JSON.parse(raw) : null;
      if (!o || typeof o !== 'object') o = {};
      return {
        best: o.best || 0,
        wins: o.wins || 0,
        deaths: o.deaths || 0
      };
    } catch (e) {
      return { best: 0, wins: 0, deaths: 0 };
    }
  }

  function writeRecords(r) {
    try {
      localStorage.setItem(REC_KEY, JSON.stringify(r));
    } catch (e) {
      /* 忽略 */
    }
  }

  function recordLine() {
    var r = readRecords();
    if (!r.best && !r.wins && !r.deaths) return '';
    return '最远第 ' + r.best + ' 天 · 撤离成功 ' + r.wins + ' 次 · 阵亡 ' + r.deaths + ' 次';
  }

  function noteRecord(kind) {
    if (recordDone) return;
    recordDone = true;

    var r = readRecords();
    var d = state.overAtDay || state.overDay || state.day || 1;

    if (d > r.best) r.best = d;
    if (kind === 'win') r.wins += 1;
    else r.deaths += 1;

    writeRecords(r);
  }

  function openGameOver() {
    var days = state.overDay || state.overAtDay || state.day;
    if (days < 1) days = 1;

    var alive = SF.aliveAll(state);
    var allDead = alive.length === 0;
    // 撑到期限却没等到直升机：不是被打死，是没人来接
    var noFlare = !allDead && !state.won && state.overAtDay > 0;
    var title = allDead ? '全员阵亡' : (noFlare ? '直升机没有来' : '你没能活下去');

    var lines = [
      '大门被撞开的那一刻，一切都结束了。',
      '最后一点食物在三天前就吃完了。',
      '你们把最后一瓶水分着喝了，然后就没人再醒过来。',
      '收音机最后响了一阵，之后就只剩下风声。',
      '楼下的脚步声停了很久，你们也没再起来。'
    ];
    var line = noFlare
      ? '直升机来了，可你们没能打出信号弹。它在楼顶盘旋了一圈，走了。'
      : lines[Math.floor(Math.random() * lines.length)];

    gameOverLock = true;
    noteRecord('dead');

    // 先把可能压在上面的弹窗收掉，再切到死亡这一屏
    closeModal();

    var tag = $('go-tag');
    if (tag) tag.textContent = noFlare ? '结局 · 救援落空' : '结局 · 中途阵亡';

    var titleEl = $('go-title');
    if (titleEl) titleEl.textContent = title;

    var daysEl = $('go-days');
    if (daysEl) daysEl.innerHTML = '撑了 <b>' + days + '</b> <span>天</span>';

    var lineEl = $('go-line');
    if (lineEl) lineEl.textContent = line;

    var chips = [];
    chips.push('<span class="go-chip">幸存 <b>' + alive.length + '</b> / ' +
      state.survivors.length + ' 人</span>');
    chips.push('<span class="go-chip">生存 <b>' + days + '</b> 天</span>');
    chips.push(state.items.flare
      ? '<span class="go-chip">信号弹：到手</span>'
      : '<span class="go-chip is-off">信号弹：没有</span>');

    var rec = recordLine();
    if (rec) chips.push('<span class="go-chip">' + rec + '</span>');

    var statsEl = $('go-stats');
    if (statsEl) statsEl.innerHTML = chips.join('');

    var whoEl = $('go-who');
    if (whoEl) {
      whoEl.textContent = alive.length
        ? '还活着的人：' + alive.map(function (s) { return s.name; }).join('、')
        : '这间屋子里，再没有一个人站起来。';
    }

    document.body.classList.add('is-dead');
    showScreen('screen-death');
  }

  /* 死了以后重开：清掉存档，回到片头那一幕重新讲一遍 */
  function startFreshRun() {
    recordDone = false;

    if (timer) {
      window.clearTimeout(timer);
      timer = 0;
    }
    if (introTimer) {
      window.clearTimeout(introTimer);
      introTimer = 0;
    }

    searching = false;
    lastReport = null;
    nightReport = null;
    gameOverLock = false;
    heldItem = null;
    loadNoticeDay = 0;

    if (SF.clearSave) SF.clearSave();

    state = SF.newGame();

    closeModal();
    document.body.classList.remove('is-dead');
    bindIntroGo();
    bindMiniInput();
    showScreen('screen-intro');
    playIntro();
  }

  function restart() {
    if (timer) {
      window.clearTimeout(timer);
      timer = 0;
    }
    searching = false;
    lastReport = null;
    nightReport = null;
    gameOverLock = false;

    state = SF.newGame();
    closeModal();
    document.body.classList.remove('is-dead');
    renderShelter();
    showScreen('screen-shelter');
    startNewDay();
  }

  /* ---------------- 事件 ---------------- */

  function elementFrom(target, root, attr) {
    var el = target;
    while (el && el.nodeType === 1 && el !== root) {
      if (el.getAttribute(attr)) return el;
      el = el.parentNode;
    }
    return null;
  }

  function onModalClick(ev) {
    var el = elementFrom(ev.target, $('modal'), 'data-act');
    if (!el) return;

    var act = el.getAttribute('data-act');
    var id = el.getAttribute('data-id');

    if (act === 'close') {
      closeModal();
      afterModalClose();
    } else if (act === 'newrun') {
      if (SF.clearSave) SF.clearSave();
      window.location.href = 'index.html';
      return;
    } else if (act === 'bag-pick') {
      bagPending = el.getAttribute('data-key') || '';
      renderBagModal();
    } else if (act === 'bag-cancel') {
      bagPending = '';
      renderBagModal();
    } else if (act === 'bag-drop') {
      dropBagItem(el.getAttribute('data-key'));
      bagPending = '';
      renderBagModal();
    } else if (act === 'bag-confirm') {
      if (SF.packState(state).over > 0) return;
      if (bagMode === 'trip') {
        bagLock = false;
        closeModal();
        renderLog();
        return;
      }

      bagLock = false;
      closeModal();
      finishTrip();
    } else if (act === 'do-home') {
      var hr = SF.homeTask
        ? SF.homeTask(state, el.getAttribute('data-key'))
        : { ok: false, msg: '' };

      renderShelter();
      updateHint(hr.msg || '');
      openHomeTask();
    } else if (act === 'upgrade') {
      var ur = SF.buildUpgrade
        ? SF.buildUpgrade(state, el.getAttribute('data-key'))
        : { ok: false, msg: '' };

      renderShelter();
      updateHint(ur.msg || '');
      openUpgrade();
    } else if (act === 'detail') {
      openDetail(id);
    } else if (act === 'equip') {
      SF.toggleGear(state, id, el.getAttribute('data-gear'));
      gearMenuId = '';
      renderPartyPicker(el.getAttribute('data-loc') || raidLoc);
    } else if (act === 'gear-slot') {
      var gs = SF.find(state, id);
      var worn = gs && SF.gearOf ? SF.gearOf(gs) : '';

      if (worn) {
        // 已经穿着：再点一下直接卸下
        SF.toggleGear(state, id, worn);
        gearMenuId = '';
      } else {
        gearMenuId = (gearMenuId === id) ? '' : id;
      }

      renderPartyPicker(el.getAttribute('data-loc'));
    } else if (act === 'depart') {
      depart();
    } else if (act === 'deeper') {
      startSearch(raidLoc, raidIds, raidDepth + 1);
    } else if (act === 'deeper-go') {
      startSearch(raidLoc, raidIds, raidDepth + 1);
    } else if (act === 'bath') {
      var br = SF.bath(state, id);
      renderShelter();
      openModal('<div class="modal-head">' +
        '<span class="modal-title">' + (br.title || '浴室') + '</span>' +
        '</div>' +
        '<div class="res-text">' + br.text + '</div>' +
        '<div class="modal-actions"><button type="button" class="btn" data-act="close">好</button></div>',
        'modal-bath');
    } else if (act === 'use-med') {
      SF.useMedicine(state, id);
      renderShelter();
      openDetail(id);
    } else if (act === 'mask') {
      SF.equipMask(state, id);
      renderShelter();
      openDetail(id);
    } else if (act === 'pick-toggle') {
      var locId = el.getAttribute('data-loc');

      if (partyPick[id]) {
        delete partyPick[id];
      } else if (partyCount() < C.party.maxMembers) {
        partyPick[id] = true;
      }
      gearMenuId = '';
      renderPartyPicker(locId);
    } else if (act === 'party-go') {
      var ids = [];
      for (var pk in partyPick) {
        if (partyPick.hasOwnProperty(pk)) ids.push(pk);
      }
      if (!ids.length) return;

      var goLoc = el.getAttribute('data-loc');

      for (var pi = 0; pi < ids.length; pi++) {
        var ps = SF.find(state, ids[pi]);
        if (ps) ps.ap = 0;
      }

      raidLoc = goLoc;
      raidIds = ids;
      partyPick = {};
      closeModal();
      renderShelter();
      startSearch(goLoc, ids);
    } else if (act === 'log-choice') {
      SF.applyExploreChoice(state, lastReport, el.getAttribute('data-key'));
      renderLog();
    } else if (act === 'night-choice') {
      var choice = el.getAttribute('data-key');
      try {
        SF.resolvePersonalEvent(state, nightReport, choice);
      } catch (e) {
        nightReport.event = null;
      }
      finishNight();
    } else if (act === 'day-event') {
      var dev = currentDayEvent();
      var dkey = el.getAttribute('data-key');
      var out = '';

      try {
        out = SF.resolveDayEvent(state, dev ? dev.id : '', dkey);
      } catch (e) {
        out = '';
      }

      closeModal();
      if (SF.saveGame) SF.saveGame(state);
      renderShelter();

      if (out) updateHint(out);
      afterModalClose();
    } else if (act === 'repair-radio') {
      var rr = SF.repairRadio ? SF.repairRadio(state) : { ok: false, msg: '' };
      closeModal();
      renderShelter();
      updateHint(rr.msg || '');
    } else if (act === 'radio-listen') {
      openBroadcast();
    } else if (act === 'back-home') {
      backHome();
    } else if (act === 'next-day') {
      closeModal();
      renderShelter();
      showScreen('screen-shelter');
      if (SF.saveGame) SF.saveGame(state);
      startNewDay();
    } else if (act === 'feed-all-food') {
      feedAll('food');
    } else if (act === 'feed-all-water') {
      feedAll('water');
    } else if (act === 'bury' || act === 'night-ok') {
      // 死亡警告 / 夜间警情：点掉之后接着走夜里的流程
      runNightSteps();
    } else if (act === 'restart') {
      restart();
    }
  }

  function onPeopleClick(ev) {
    var el = elementFrom(ev.target, $('people'), 'data-id');
    if (!el) return;

    onPersonTap(el.getAttribute('data-id'));
  }

  function onMapClick(ev) {
    var locked = elementFrom(ev.target, $('map-grid'), 'data-locked');
    if (locked) {
      var loc = SF.findLocation(locked);
      var gate = SF.gateFor(state, loc);

      // 点到没解锁的地方：先把别处的亮光灭掉，再弹「尚未解锁」
      mapSelected = '';
      var spots = $('map-grid').querySelectorAll('.map-spot.is-selected');
      for (var i = 0; i < spots.length; i++) spots[i].classList.remove('is-selected');

      openModal('<div class="modal-head"><span class="modal-title">尚未解锁</span>' +
        '<span class="modal-sub">' + (loc ? loc.name : '未知区域') + '</span></div>' +
        '<div class="res-text">' + (gate.reason || '这里还去不了。') + '</div>' +
        '<div class="modal-actions"><button type="button" class="btn" data-act="close">知道了</button></div>',
        'modal-action');
      return;
    }

    var el = elementFrom(ev.target, $('map-grid'), 'data-id');
    if (!el) return;

    var locId = el.getAttribute('data-id');
    mapSelected = locId;

    // 点亮选中的那一块
    var all = $('map-grid').querySelectorAll('.map-spot');
    for (var j = 0; j < all.length; j++) all[j].classList.remove('is-selected');
    el.classList.add('is-selected');

    openExplorerPicker(locId);
  }

  /* 头顶气泡：0 陈默 · 1 林晓 · 2 铁柱 · 3 娜娜 */
  var bubbleTimers = [0, 0, 0, 0];

  function showBubble(charId, text) {
    var idx = { chen: 0, lin: 1, tie: 2, nana: 3 }[charId];
    if (idx === undefined || !text) return;

    var el = $('bubble-' + idx);
    if (!el) return;

    el.textContent = text;
    el.classList.add('is-on');

    if (bubbleTimers[idx]) window.clearTimeout(bubbleTimers[idx]);
    bubbleTimers[idx] = window.setTimeout(function () {
      bubbleTimers[idx] = 0;
      el.classList.remove('is-on');
    }, 4000);
  }

  /* ---------------- 日常行动 ---------------- */

  function onHomeAction(type) {
    var r = SF.homeAction(state, type);

    renderShelter();

    if (!r.ok) {
      openModal('<div class="modal-head">' +
        '<span class="modal-title">不行</span>' +
        '</div>' +
        '<div class="res-text">' + r.text + '</div>' +
        '<div class="modal-actions"><button type="button" class="btn" data-act="close">知道了</button></div>',
        'modal-action');
      return;
    }

    openModal('<div class="modal-head">' +
      '<span class="modal-title">' + r.title + '</span>' +
      '<span class="modal-sub">今天的行动</span>' +
      '</div>' +
      '<div class="res-text">' + r.text + '</div>' +
      '<div class="modal-actions"><button type="button" class="btn btn-main" data-act="close">好</button></div>',
      'modal-action');
  }

  function onExplore() {
    if (!SF.aliveAll(state).length) return;

    // 门口的事没处理完，先弹事件；弹不出来就直接放行，绝不卡死
    if (currentDayEvent()) {
      if (openDayEvent()) return;
      state.dayEventDone = state.day;
      renderShelter();
    }

    if (!SF.canExplore(state)) return;

    closeModal();
    showScreen('screen-map');
    renderMap();
  }

  function onGoHome() {
    closeModal();
    checkPackThenHome();
  }

  /* ---------------- 开发者测试面板 ---------------- */

  var dbgTarget = null;

  function openDebug() {
    var panel = $('debug-panel');
    if (panel) panel.classList.add('is-on');
    renderDebugPeople();
  }

  function closeDebug() {
    var panel = $('debug-panel');
    if (panel) panel.classList.remove('is-on');
  }

  function renderDebugPeople() {
    var box = $('dbg-people');
    if (!box) return;

    var alive = SF.aliveAll(state);
    if (!alive.length) {
      box.innerHTML = '<span class="dbg-label">没有活人</span>';
      return;
    }

    if (!dbgTarget || !SF.find(state, dbgTarget)) dbgTarget = alive[0].id;

    var html = '';
    for (var i = 0; i < alive.length; i++) {
      var s = alive[i];
      html += '<button type="button" class="dbg-person' +
        (s.id === dbgTarget ? ' is-on' : '') +
        '" data-dbg-id="' + s.id + '">' + s.name + '</button>';
    }

    box.innerHTML = html;
  }

  function debugAction(action) {
    var s = dbgTarget ? SF.find(state, dbgTarget) : null;
    var i;
    var msg = '';

    if (action === 'dying') {
      if (!s) return;
      s.hp = 10;
      s.hunger = 90;
      s.thirst = 90;
      s.mood = 10;
      msg = s.name + '：血量 10、饥饿 90、口渴 90、心情 10（马上要死）。';
    } else if (action === 'sick') {
      if (!s) return;
      s.sick = true;
      msg = s.name + ' 生病了。';
    } else if (action === 'mad') {
      if (!s) return;
      s.mood = 0;
      s.mad = true;
      msg = s.name + ' 发疯了。';
    } else if (action === 'full') {
      var all = SF.aliveAll(state);
      for (i = 0; i < all.length; i++) {
        all[i].hp = 100;
        all[i].hunger = 0;
        all[i].thirst = 0;
        all[i].mood = 100;
        all[i].sick = false;
        all[i].mad = false;
        all[i].injured = false;
      }
      msg = '全员满状态。';
    } else if (action === 'wipe') {
      state.supplies.food = 0;
      state.supplies.water = 0;
      state.supplies.medicine = 0;
      state.supplies.material = 0;
      msg = '物资已清空。';
    } else if (action === 'stock') {
      state.supplies.food = 10;
      state.supplies.water = 10;
      state.supplies.medicine = 10;
      state.supplies.material = 10;
      msg = '一键神装：食物 / 水 / 药品 / 木板 各 10。';
    } else if (action === 'allopen') {
      // 测试专用：物资全满 + 全部装备 + 所有地点直接能进
      state.supplies.food = 30;
      state.supplies.water = 30;
      state.supplies.medicine = 30;
      state.supplies.material = 30;

      state.items.flashlight = true;
      state.items.gasMask = true;
      state.items.weapon = true;
      state.items.backpack = true;
      state.items.radio = true;
      state.items.flare = true;
      state.items.cards = true;
      state.items.pesticide = true;

      state.vaultUnlocked = true;
      state.allOpen = true;

      var allp = SF.aliveAll(state);
      for (i = 0; i < allp.length; i++) {
        allp[i].hp = 100;
        allp[i].hunger = 0;
        allp[i].thirst = 0;
        allp[i].mood = 100;
        allp[i].sick = false;
        allp[i].injured = false;
        allp[i].mad = false;
      }

      msg = '全开：物资各 30、全部装备、所有地点（含车库暗门）都能进。';
    } else if (action === 'event') {
      var ev = SF.makePersonalEvent ? SF.makePersonalEvent(state) : null;
      if (!ev) {
        updateHint('这次没抽到夜间事件，再点一下试试。');
        return;
      }
      try {
        SF.resolvePersonalEvent(state, {
          day: state.day,
          rows: [],
          eventText: '',
          event: ev,
          deaths: [],
          meds: [],
          theft: null
        }, ev.options && ev.options.length ? ev.options[0].key : 'ok');
        msg = '已强制触发：' + ev.title;
      } catch (e) {
        msg = '事件执行失败：' + e.message;
      }
    } else if (action === 'day') {
      var pool = ['merchant', 'neighbor', 'intel', 'thugs'];
      state.dayEventId = pool[Math.floor(Math.random() * pool.length)];
      state.dayEventIdDay = state.day;
      state.dayEventDone = 0;

      if (!openDayEvent()) {
        updateHint('白天事件没弹出来，再点一下试试。');
        return;
      }
      if (SF.saveGame) SF.saveGame(state);
      return;
    } else if (action === 'day29') {
      // 测试用：直接给信号弹，今晚过完明早就是结局
      state.items.radio = true;
      state.supplies.material = Math.max(3, state.supplies.material || 0);

      SF.grabFlare(state);

      state.storySeenDay = state.day - 1;
      state.dayEventDone = 0;
      state.dayEventIdDay = 0;
      state.dayEventId = '';
      state.over = false;
      state.won = false;
      state.endingKind = '';

      if (SF.saveGame) SF.saveGame(state);
      closeDebug();
      renderShelter();
      updateHint('信号弹在手：今晚照常过，明早直升机就来。');
      startNewDay();
      return;
    } else if (action === 'config') {
      var rows = (SF.balance && SF.balance.summary) ? SF.balance.summary() : [];
      var warns = (SF.balance && SF.balance.warnings) || [];
      var changed = (SF.balance && SF.balance.applied) || [];
      var html = '<div class="modal-head">' +
        '<span class="modal-title">数值自检</span>' +
        '<span class="modal-sub">改完 js/balance.js 刷新即可</span>' +
        '</div>' +
        '<div class="res-label">当前生效</div>';

      for (var ri = 0; ri < rows.length; ri++) {
        html += '<div class="res-line"><span>' + rows[ri].label + '</span>' +
          '<span class="res-val">' + rows[ri].value + '</span></div>';
      }

      html += '<div class="res-label">你改过的项：' + changed.length + '</div>';

      if (changed.length) {
        html += '<div class="res-text">' + changed.join('、') + '</div>';
      }

      if (warns.length) {
        html += '<div class="res-label">需要检查的地方</div>';
        for (var wi = 0; wi < warns.length; wi++) {
          html += '<div class="warn-line">' + warns[wi] + '</div>';
        }
      } else {
        html += '<div class="res-text">没有发现问题。</div>';
      }

      html += '<div class="modal-actions">' +
        '<button type="button" class="btn" data-act="close">关闭</button></div>';

      openModal(html, 'modal-config');
      return;
    } else if (action === 'testpage') {
      window.location.href = 'test.html';
      return;
    } else if (action === 'restart') {
      if (SF.clearSave) SF.clearSave();
      window.location.reload();
      return;
    }

    renderShelter();
    renderDebugPeople();
    if (msg) updateHint(msg);
  }

  /* ---------------- 片头 ---------------- */
  var INTRO_LINES = [
    '灾难爆发十分钟，整座城市沦陷。你们四个室友刚把防盗门死死焊住。',
    '一架满载难民、仓皇撤离的运输机从楼顶掠过。为了减重，他们把大量物资箱直接抛向街道。',
    '这是活下去的唯一机会。不管以前是程序员还是健身教练，现在立刻冲下去，抢！',
    '没人知道救援哪天来。修好一台收音机，军方才会在频道里报出日期。' +
      '在那之前，一口水，就能决定谁能看到明天的太阳。'
  ];

  var introTimer = 0;

  function playIntro() {
    var box = $('intro-text');
    var btn = $('btn-intro-go');
    if (!box || !btn) return;

    box.innerHTML = '';
    btn.classList.add('is-hidden');

    var lineIdx = 0;
    var charIdx = 0;
    var current = null;

    function nextChar() {
      if (lineIdx >= INTRO_LINES.length) {
        btn.classList.remove('is-hidden');
        return;
      }

      if (!current) {
        current = document.createElement('p');
        current.className = 'intro-line';
        box.appendChild(current);

        if (lineIdx === 0 && SF.sfx && SF.sfx.pick) SF.sfx.pick();
      }

      var text = INTRO_LINES[lineIdx];
      current.textContent = text.slice(0, charIdx + 1);
      charIdx += 1;

      if (charIdx >= text.length) {
        lineIdx += 1;
        charIdx = 0;
        current = null;
        introTimer = window.setTimeout(nextChar, 420);
        return;
      }

      introTimer = window.setTimeout(nextChar, 34);
    }

    nextChar();
  }

  // 片头那颗按钮只绑一次：死了从结算页回到片头，它还得管用
  function bindIntroGo() {
    var btn = $('btn-intro-go');
    if (!btn) return;

    btn.onclick = function (ev) {
      if (ev) ev.stopPropagation();
      btn.classList.remove('is-hidden');
      if (introTimer) window.clearTimeout(introTimer);
      introTimer = 0;
      startMiniGame();
    };
  }

  /* ---------------- 抢物资小游戏 ---------------- */
  var miniTimer = 0;
  var miniDropTimer = 0;
  var miniClockTimer = 0;
  var miniItems = [];
  var miniCounts = { food: 0, water: 0, material: 0, medicine: 0 };
  var miniBasketX = 50;
  var miniBasketPx = -1;   // 毯子中心的像素位置（场地坐标），-1 = 还没定，用百分比
  var miniLeft = 15;
  var miniRunning = false;
  var miniBound = false;
  var miniTestMode = false;   // 从测试台点「抢物资小游戏」进来：只测试，不碰存档

  var MINI_NAMES = { food: '食物', water: '水', material: '木板', medicine: '药品' };
  // 掉落池：物资少一点、慢一点，还会掉炸弹
  var MINI_POOL = ['food', 'water', 'material', 'food', 'water', 'material',
    'medicine', 'bomb', 'bomb'];
  var MINI_BAG_MAX = 8;
  var MINI_BOMB_SVG = '<svg viewBox="0 0 32 32" aria-hidden="true">' +
    '<path d="M20 8 L24 4" stroke="#c9b08a" stroke-width="2.4" fill="none"/>' +
    '<circle cx="25" cy="3.5" r="2" fill="#ffcf6a"/>' +
    '<circle cx="15" cy="19" r="9" fill="#242424"/>' +
    '<circle cx="12" cy="16" r="3" fill="#3c3c3c"/>' +
    '<rect x="13" y="8" width="5" height="4" rx="1.4" fill="#4a4a4a"/>' +
    '</svg>';

  function miniTotal() {
    return miniCounts.food + miniCounts.water + miniCounts.material + miniCounts.medicine;
  }

  function miniRenderCounts() {
    var box = $('mini-counts');
    if (!box) return;

    var html = '';
    var keys = ['food', 'water', 'material', 'medicine'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      html += '<span class="mini-cnt">' + SF.itemSvg(k, 16) +
        '<b>' + miniCounts[k] + '</b></span>';
    }
    var total = miniTotal();
    var full = total >= MINI_BAG_MAX;

    html += '<span class="mini-cnt-cap' + (full ? ' is-full' : '') + '">背包 ' +
      total + '/' + MINI_BAG_MAX + (full ? ' · 满了' : '') + '</span>';
    box.innerHTML = html;
  }

  function miniPlaceBasket() {
    var field = $('mini-field');
    var basket = $('mini-basket');
    if (!basket) return;

    var w = field ? field.clientWidth : 0;
    var half = (basket.offsetWidth || 152) / 2;

    if (!w) {
      basket.style.left = miniBasketX + '%';
      return;
    }

    // 用“场地内的像素”定位：毯子中心对准手指，再夹住不让它跑出场地
    var x = miniBasketPx;
    if (x < 0) x = (miniBasketX / 100) * w;
    x = Math.max(half, Math.min(w - half, x));

    basket.style.transform = 'translateX(-50%)';
    basket.style.left = x + 'px';
    miniBasketPx = x;
  }

  function miniSpawn() {
    if (!miniRunning) return;

    var field = $('mini-field');
    if (!field) return;

    var key = MINI_POOL[Math.floor(Math.random() * MINI_POOL.length)];

    var el = document.createElement('div');
    el.className = 'mini-item' + (key === 'bomb' ? ' is-bomb' : '');
    el.innerHTML = key === 'bomb' ? MINI_BOMB_SVG : SF.itemSvg(key, 34);
    var left = 5 + Math.random() * 90;
    el.style.left = left + '%';
    el.style.top = '-40px';
    field.appendChild(el);

    miniItems.push({ el: el, key: key, left: left, top: -40, dead: false });
  }

  function pickLostItem() {
    var keys = ['food', 'water', 'material', 'medicine'];
    var avail = [];

    for (var i = 0; i < keys.length; i++) {
      if (miniCounts[keys[i]] > 0) avail.push(keys[i]);
    }
    if (!avail.length) return '';

    var k = avail[Math.floor(Math.random() * avail.length)];
    miniCounts[k] -= 1;
    return k;
  }

  function miniStep() {
    if (!miniRunning) return;

    var field = $('mini-field');
    if (!field) return;

    var h = field.clientHeight || 600;
    var fieldW = field.clientWidth || 400;
    var basketEl = $('mini-basket');
    var bRect = null;

    if (basketEl) {
      var fRect = field.getBoundingClientRect();
      var raw = basketEl.getBoundingClientRect();
      bRect = {
        left: raw.left - fRect.left,
        top: raw.top - fRect.top,
        width: raw.width,
        height: raw.height
      };
    }

    // 量不到篮子的真实尺寸时按比例兜底，绝不出现“接住了却不算”
    if (!bRect || !bRect.width || !bRect.height) {
      var defW = 152;
      var defH = 62;
      bRect = {
        left: (miniBasketX / 100) * fieldW - defW / 2,
        top: h - h * 0.18 - defH,
        width: defW,
        height: defH
      };
    }

    // 篮子的“装货线”：物品底边扫过这条线就算接住
    var catchLine = bRect.top + 6;
    var bCenter = bRect.left + bRect.width / 2;

    for (var i = miniItems.length - 1; i >= 0; i--) {
      var it = miniItems[i];
      if (it.dead) {
        miniItems.splice(i, 1);
        continue;
      }

      var prevBottom = it.top + 34;

      it.top += 3.6;
      it.el.style.top = it.top + 'px';

      // 物品是 34px 的方块：拿它的中心和毯子中心比，
      // 容差 = 毯子半宽 + 物品半宽 + 10px，玩家看到碰到就算接住
      var itemBottom = it.top + 34;
      var itemCenter = (it.left / 100) * fieldW + 17;
      var nearX = Math.abs(itemCenter - bCenter) <= (bRect.width / 2 + 17 + 10);
      var nearY = (itemBottom >= catchLine && it.top <= bRect.top + bRect.height + 20) ||
        (prevBottom < catchLine && itemBottom >= catchLine);

      if (nearX && nearY) {
        if (it.key === 'bomb') {
          // 接到炸弹：扣 3 秒，再炸掉一件已经接到的物资
          miniLeft = Math.max(0, miniLeft - 3);
          var clockEl = $('mini-time');
          if (clockEl) clockEl.textContent = String(miniLeft);

          var lost = pickLostItem();
          if (lost) miniRenderCounts();

          var bombFlash = document.getElementById('mini-flash');
          if (bombFlash) {
            bombFlash.classList.add('is-bomb');
            window.setTimeout(function () { bombFlash.classList.remove('is-bomb'); }, 260);
          }
        } else if (miniTotal() < MINI_BAG_MAX) {
          // 背包还有位置：接到就进袋
          miniCounts[it.key] += 1;
          miniRenderCounts();
          if (SF.sfx && SF.sfx.pick) SF.sfx.pick();
        } else {
          // 已经装满 8 件：界面会显示「满了」，别让玩家以为没接住
          miniRenderCounts();
        }

        it.dead = true;
        it.el.remove();
        miniItems.splice(i, 1);
        continue;
      }

      if (it.top > h + 40) {
        it.dead = true;
        it.el.remove();
        miniItems.splice(i, 1);
      }
    }
  }

  function miniStop() {
    miniRunning = false;
    if (miniDropTimer) window.clearInterval(miniDropTimer);
    if (miniClockTimer) window.clearInterval(miniClockTimer);
    miniDropTimer = 0;
    miniClockTimer = 0;

    for (var i = 0; i < miniItems.length; i++) {
      if (miniItems[i].el) miniItems[i].el.remove();
    }
    miniItems = [];
  }

  function startMiniGame() {
    // 连点两下也不会有两套计时器
    miniStop();

    miniCounts = { food: 0, water: 0, material: 0, medicine: 0 };
    miniBasketX = 50;
    miniBasketPx = -1;
    miniLeft = 15;
    miniRunning = true;

    var over = $('mini-over');
    if (over) over.classList.remove('is-on');

    var field = $('mini-field');
    if (field) field.innerHTML = '';

    var clock = $('mini-time');
    if (clock) clock.textContent = '15';

    miniRenderCounts();
    miniPlaceBasket();
    showScreen('screen-mini');
    // 屏幕显示出来之后场地才有宽度，再摆一次毯子，位置才准
    miniPlaceBasket();

    miniDropTimer = window.setInterval(miniSpawn, 1400);
    miniClockTimer = window.setInterval(function () {
      miniLeft -= 1;
      var c = $('mini-time');
      if (c) c.textContent = String(Math.max(0, miniLeft));
      if (miniLeft <= 0) miniEnd();
    }, 1000);
  }

  function miniEnd() {
    if (!miniRunning && miniLeft > 0) return;

    miniRunning = false;
    if (miniDropTimer) window.clearInterval(miniDropTimer);
    if (miniClockTimer) window.clearInterval(miniClockTimer);
    miniDropTimer = 0;
    miniClockTimer = 0;

    var text = $('mini-over-text');
    if (text) {
      text.textContent = '你拖着接满物资的地毯，赶在尸群包围前逃回了房间。' +
        '（第一天口粮 → 食物 x' + miniCounts.food + '，水 x' + miniCounts.water +
        '，木板 x' + miniCounts.material + '，药品 x' + miniCounts.medicine + '）';
    }

    var flash = $('mini-flash');
    if (flash) {
      flash.classList.add('is-on');
      window.setTimeout(function () { flash.classList.remove('is-on'); }, 220);
    }

    var over = $('mini-over');
    if (over) {
      window.setTimeout(function () { over.classList.add('is-on'); }, 180);
    }
  }

  function miniFinish() {
    miniStop();
    recordDone = false;

    // 测试模式：玩完直接回测试台，不动玩家存档
    if (miniTestMode) {
      miniTestMode = false;
      window.location.href = 'test.html';
      return;
    }

    state = SF.newGame();
    state.supplies.food = miniCounts.food;
    state.supplies.water = miniCounts.water;
    state.supplies.material = miniCounts.material;
    state.supplies.medicine = miniCounts.medicine;

    if (SF.saveGame) SF.saveGame(state);

    closeModal();
    renderShelter();
    showScreen('screen-shelter');
    startNewDay();
  }

  function bindMiniInput() {
    var screen = $('screen-mini');
    if (!screen) return;
    if (miniBound) return;
    miniBound = true;

    var move = function (clientX) {
      var field = $('mini-field');
      if (!field) return;

      var rect = field.getBoundingClientRect();
      miniBasketPx = clientX - rect.left;
      miniPlaceBasket();
    };

    screen.addEventListener('mousemove', function (ev) {
      if (ev.buttons || ev.type === 'mousemove') move(ev.clientX);
    });

    screen.addEventListener('touchstart', function (ev) {
      if (ev.touches && ev.touches[0]) move(ev.touches[0].clientX);
    }, { passive: true });

    screen.addEventListener('touchmove', function (ev) {
      if (ev.touches && ev.touches[0]) move(ev.touches[0].clientX);
    }, { passive: true });

    var go = $('btn-mini-go');
    if (go) go.addEventListener('click', miniFinish);

    window.setInterval(miniStep, 16);
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    // 从测试台点场景进来：读写测试存档，永远不碰正式存档
    SF.useTestSave = (window.location.search || '').indexOf('test=1') >= 0;

    var loaded = SF.loadGame ? SF.loadGame() : null;

    if (loaded) {
      state = SF.repairState ? SF.repairState(loaded) : loaded;
      loadNoticeDay = state.day || 0;
    } else {
      state = SF.newGame();
    }

    nightReport = null;
    renderShelter();
    loadImages();

    // 库存和人物面板压在最上面，弹窗再压在它们上面
    $('shelf').style.zIndex = '30';
    $('shelf').style.pointerEvents = 'auto';
    $('shelf').style.maxWidth = '52vw';
    $('people').style.zIndex = '30';
    $('people').style.pointerEvents = 'auto';
    $('overlay').style.zIndex = '100';

    $('btn-explore').addEventListener('click', onExplore);
    $('shelf').addEventListener('click', onShelfClick);
    $('btn-night').addEventListener('click', endDay);
    $('btn-feed').addEventListener('click', openFeedAll);
    $('btn-clean').addEventListener('click', openBath);
    $('btn-repair').addEventListener('click', function () { homeFortify('door'); });
    $('btn-home-task').addEventListener('click', openHomeTask);
    $('btn-log').addEventListener('click', openLog);

    var evBtn = $('btn-event');
    if (evBtn) {
      evBtn.addEventListener('click', function (ev) {
        if (ev) ev.stopPropagation();
        openDayEvent();
      });
    }
    $('btn-go-home').addEventListener('click', onGoHome);
    $('people').addEventListener('click', onPeopleClick);
    $('quest').addEventListener('click', onQuestClick);
    var mapGrid = $('map-grid');
    if (mapGrid) {
      mapGrid.addEventListener('click', onMapClick);

      // 悬停 / 按下 / 键盘聚焦时，在顶部显示这个地点的风险
      var pointAt = function (target) {
        var el = elementFrom(target, mapGrid, 'data-id') ||
          elementFrom(target, mapGrid, 'data-locked');
        if (!el) return;

        var lockedId = el.getAttribute('data-locked');
        showMapRisk(lockedId || el.getAttribute('data-id'), !!lockedId);
      };

      mapGrid.addEventListener('mouseover', function (ev) {
        pointAt(ev.target);
      });

      mapGrid.addEventListener('mouseout', function (ev) {
        if (ev.relatedTarget && mapGrid.contains(ev.relatedTarget)) return;
        showMapSelectedOrHide();
      });

      mapGrid.addEventListener('touchstart', function (ev) {
        pointAt(ev.target);
      }, { passive: true });

      mapGrid.addEventListener('focusin', function (ev) {
        pointAt(ev.target);
      });

      mapGrid.addEventListener('focusout', function () {
        showMapSelectedOrHide();
      });
    }

    var mapInfoBtn = $('btn-map-info');
    if (mapInfoBtn) mapInfoBtn.addEventListener('click', openMapInfo);

    // 底图加载完 / 屏幕尺寸变了，重新算一次铺满尺寸，热区才不会偏
    var mapImg = $('map-bg');
    if (mapImg) {
      mapImg.addEventListener('load', sizeMapStage);
      if (mapImg.complete) sizeMapStage();
    }

    window.addEventListener('resize', function () {
      var m = $('screen-map');
      if (m && m.classList.contains('is-active')) sizeMapStage();
    });

    $('modal').addEventListener('click', onModalClick);

    // 死亡结算这一屏：重新开始 / 看看日记
    var deathScreen = $('screen-death');
    if (deathScreen) {
      deathScreen.addEventListener('click', function (ev) {
        var el = elementFrom(ev.target, deathScreen, 'data-act');
        if (!el) return;

        var act = el.getAttribute('data-act');
        if (act === 'newrun') {
          startFreshRun();
        } else if (act === 'log') {
          openLog();
        }
      });
    }

    $('overlay').addEventListener('click', function (ev) {
      if (ev.target === $('overlay')) {
        // 探险日志、夜间结算、剧情这些中途弹窗，点空白不能关，免得流程断掉
        var modalEl = $('modal');
        var guard = modalEl ? modalEl.className : '';

        if (guard.indexOf('modal-log') >= 0 ||
            guard.indexOf('modal-search') >= 0 ||
            guard.indexOf('modal-night') >= 0 ||
            guard.indexOf('modal-story') >= 0 ||
            guard.indexOf('modal-day-event') >= 0) {
          return;
        }

        closeModal();
        afterModalClose();
      }
    });

    $('btn-debug').addEventListener('click', function (ev) {
      if (ev) ev.stopPropagation();
      openDebug();
    });

    $('btn-debug-close').addEventListener('click', function (ev) {
      if (ev) ev.stopPropagation();
      closeDebug();
    });

    // 音效开关
    var muteBtn = $('btn-mute');
    if (muteBtn) {
      var paintMute = function () {
        muteBtn.textContent = (SF.sfxMuted && SF.sfxMuted()) ? '音效：关' : '音效：开';
      };

      paintMute();
      muteBtn.addEventListener('click', function (ev) {
        if (ev) ev.stopPropagation();
        if (SF.setSfxMuted) SF.setSfxMuted(!(SF.sfxMuted && SF.sfxMuted()));
        paintMute();
      });
    }

    // 第一次碰屏幕时垫一点风声（静音就不起）
    var ambientKick = function () {
      if (SF.ambientStart) SF.ambientStart();
      document.removeEventListener('pointerdown', ambientKick);
    };
    document.addEventListener('pointerdown', ambientKick);

    $('debug-panel').addEventListener('click', function (ev) {
      var person = elementFrom(ev.target, $('debug-panel'), 'data-dbg-id');
      if (person) {
        dbgTarget = person.getAttribute('data-dbg-id');
        renderDebugPeople();
        return;
      }

      var btn = elementFrom(ev.target, $('debug-panel'), 'data-dbg');
      if (btn) {
        if (ev) ev.stopPropagation();
        debugAction(btn.getAttribute('data-dbg'));
      }
    });

    // 点空白处：放下手里的物资
    document.addEventListener('click', function (ev) {
      if (!heldItem) return;
      var t = ev.target;
      if (isInside(t, $('shelf'))) return;
      if (isInside(t, $('people'))) return;
      if (isInside(t, $('overlay'))) return;
      if (isInside(t, $('debug-panel'))) return;
      if (isInside(t, $('btn-debug'))) return;
      clearHold();
    });

    showScreen('screen-shelter');

    // 片头的按钮、抢物资的操作：不管有没有存档都先绑好
    bindIntroGo();
    bindMiniInput();

    // 测试台专用：index.html?mini=1 直接进「抢物资」小游戏，玩完回测试台
    if (window.location.search.indexOf('mini=1') >= 0) {
      miniTestMode = true;
      startMiniGame();
      return;
    }

    if (loadNoticeDay) {
      updateHint('已读取第 ' + loadNoticeDay + ' 天存档');

      // 读档时如果已经是结局状态，直接给结局，绝不重开
      if (state.over) {
        if (state.won) openVictory(); else openGameOver();
        return;
      }

      if (!SF.aliveAll(state).length) {
        openGameOver();
        return;
      }

      startNewDay();
      return;
    }

    showScreen('screen-intro');

    playIntro();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
