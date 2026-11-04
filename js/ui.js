/*
 * 界面逻辑：避难所（背景图 + 代码画的货架）/ 外出地图 / 弹窗。
 * 像素美术都在 js/art.js 里；这里只有静态 DOM 排版，没有动画、没有 canvas。
 */
(function () {

  var C = SF.CONFIG;

  // 版本号：每次改动都往后加一，方便确认页面是不是最新版
  var BUILD = 'v121';
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

    function cell(key, n, kind) {
      var rot = tilts[tIdx % tilts.length];
      tIdx += 1;
      var showNum = n > 0;
      var cls = 'inv-cell' +
        (kind === 'hold' && n <= 0 ? ' is-empty' : '') +
        (kind === 'info' && n <= 0 ? ' is-ghost' : '') +
        (heldItem === key ? ' is-held' : '');
      var inner = '<span class="inv-ico" style="transform:rotate(' + rot + 'deg)">' +
        SF.itemSvg(key, 40) + '</span>' +
        (showNum ? '<span class="inv-num">' + Math.round(n) + '</span>' : '');

      if (kind === 'info' && n <= 0) {
        // 没获得：只有一圈极淡的虚线，没有任何字
        return '<button type="button" class="inv-cell is-empty-slot" data-item="' + key + '"></button>';
      }

      if (kind === 'hold') {
        return '<button type="button" id="hold-' + key + '" class="' + cls +
          '" data-hold="' + key + '">' + inner + '</button>';
      }

      return '<button type="button" class="' + cls + '" data-item="' + key + '">' +
        inner + '</button>';
    }

    var basics = '';
    var gear = '';
    var special = '';

    basics += cell('food', state.supplies.food || 0, 'hold');
    basics += cell('water', state.supplies.water || 0, 'hold');
    basics += cell('medicine', state.supplies.medicine || 0, 'hold');
    basics += cell('material', state.supplies.material || 0, 'count');

    gear += cell('weapon', state.items.weapon ? 1 : 0, 'info');
    gear += cell('pesticide', state.items.pesticide ? 1 : 0, 'info');

    // 主线道具全部并进“特殊道具”：手电 / 收音机（含破损）/ 面具 / 信号弹
    special += cell('flashlight', state.items.flashlight ? 1 : 0, 'info');
    special += cell('radio',
      (state.items.radio || state.items.radioBroken) ? 1 : 0, 'info');
    special += cell('mask', state.items.gasMask ? 1 : 0, 'info');
    special += cell('flare', state.items.flare ? 1 : 0, 'info');
    special += cell('cards', state.items.cards ? 1 : 0, 'info');

    html += '<div class="shelf-sec"><span class="shelf-label">基础物资</span>' +
      '<div class="shelf-row">' + basics + '</div></div>';

    html += '<div class="shelf-sec"><span class="shelf-label">武器装备</span>' +
      '<div class="shelf-row">' + gear + '</div></div>';

    html += '<div class="shelf-sec"><span class="shelf-label">特殊道具</span>' +
      '<div class="shelf-row">' + special + '</div></div>';

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

    if (state.parts > 0) {
      row += '<button type="button" class="gear-item" data-item="parts">' +
        SF.itemSvg('parts', 22) +
        '<span>零件</span><span class="gear-num">×' + state.parts + '</span></button>';
    }

    var gear = $('gear');
    if (!gear) return;

    gear.innerHTML = '<div class="inv-sub">特殊道具</div>' +
      '<div class="inv-gear-row">' +
      (row || '<span class="inv-empty">还没有特殊道具</span>') +
      '</div>';
  }

  /* ---------------- 主线清单 ---------------- */

  var QUEST_ITEMS = [
    {
      key: 'flashlight', name: '手电', tip: '车库里黑得伸手不见五指，得带手电才敢下去（楼下便利店偶尔也能翻到）。',
      where: '公寓地下车库',
      say: '地下车库黑得要命，先弄支手电，不然下去也是白跑。'
    },
    {
      key: 'radio', name: '收音机', tip: '修好收音机，才听得到军方频道的信号。',
      where: '公寓地下车库（坏了带回避难所修）',
      say: '没有收音机，我们连外面还有没有人活着都不知道。'
    },
    {
      key: 'mask', name: '面具', tip: '社区卫生站里全是消毒水和腐臭味，没面具进不去。',
      where: '受伤的邻居 / 隔壁社区卫生站',
      say: '卫生站那股味儿，没面具进去就是送死。'
    },
    {
      key: 'weapon', name: '武器', tip: '保安亭和门口的暴徒都吃这一套。',
      where: '公寓地下车库 / 小区保安亭',
      say: '保安亭那帮人不讲道理，空手去等于送命。'
    },
    {
      key: 'flare', name: '信号弹', tip: '信号弹一响，第二天一早直升机就来。',
      where: '小区保安亭',
      say: '信号弹一响，第二天直升机就落在楼顶，我们只要撑到那一刻。'
    }
  ];

  var questSeen = null;

  function questOwned(key) {
    if (key === 'flashlight') return !!state.items.flashlight || gearWorn('torch');
    if (key === 'radio') return !!state.items.radio;
    if (key === 'mask') return !!state.items.gasMask || gearWorn('mask');
    if (key === 'weapon') return !!state.items.weapon || gearWorn('weapon');
    if (key === 'flare') return !!state.items.flare;
    return false;
  }

  function renderQuest() {
    var box = $('quest');
    if (!box) return;

    var now = {};
    var next = null;
    var i;

    for (i = 0; i < QUEST_ITEMS.length; i++) {
      var q = QUEST_ITEMS[i];
      var has = questOwned(q.key);
      now[q.key] = has;
      if (!has && !next) next = q;
    }

    // 刚拿到某件主线道具：记进日记、提示一下（不再画格子）
    if (questSeen) {
      for (i = 0; i < QUEST_ITEMS.length; i++) {
        var it = QUEST_ITEMS[i];
        if (now[it.key] && questSeen[it.key] === false) {
          if (SF.noteQuest) SF.noteQuest(state, it.name);
          (function (got) {
            window.setTimeout(function () {
              updateHint('【主线推进】' + got.name + ' 到手：' + got.tip);
            }, 0);
          })(it);
        }
      }
    }

    box.innerHTML = '<span class="quest-next">' +
      (next
        ? '下一步：<b>' + next.name + '</b> · 去' + next.where
        : '主线全齐，守着信号弹等救援日') +
      '</span>';

    // 每天第一次进主界面，让陈默说一句下一步该找什么
    if (next && state.hintDay !== state.day) {
      state.hintDay = state.day;
      window.setTimeout(function () {
        showBubble('chen', next.say);
      }, 500);
    }

    questSeen = now;
  }

  function onQuestClick(ev) {
    var el = elementFrom(ev.target, $('quest'), 'data-quest');
    if (!el) return;

    var key = el.getAttribute('data-quest');
    var item = null;

    for (var i = 0; i < QUEST_ITEMS.length; i++) {
      if (QUEST_ITEMS[i].key === key) item = QUEST_ITEMS[i];
    }
    if (!item) return;

    updateHint(questOwned(key)
      ? '【' + item.name + '】已到手：' + item.tip
      : '【缺少' + item.name + '】' + item.tip + ' 大概在：' + item.where);
  }

  /* 顶部广播栏：一眼看清今天发生了什么 */
  function renderTicker() {
    var parts = [];
    var cond = SF.condFor ? SF.condFor(state) : null;

    if (cond) parts.push('今日状况：' + cond.name + '（' + cond.desc + '）');

    parts.push('生存第 ' + state.day + ' 天');

    if (state.rescueDay) {
      parts.push('救援：第 ' + state.rescueDay + ' 天');
    } else if (state.items && state.items.radio) {
      parts.push('救援：等待军方指令');
    } else {
      parts.push('救援：未知（先修好收音机）');
    }
    parts.push(state.items && state.items.flare ? '信号弹已到手' : '还没有信号弹');

    if (loadNoticeDay) {
      parts.push('已读取第 ' + loadNoticeDay + ' 天存档');
    }

    if (state.lastEvent) {
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
    var src = KEYED[s.portrait] || s.portrait;
    return '<img class="portrait-img" src="' + src + '" alt="" ' +
      'style="width:' + w + 'px;height:' + h + 'px">';
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

  function microRow(id, label, cls, key, value) {
    var v = Math.round(value);
    if (v < 0) v = 0;
    if (v > 100) v = 100;

    var snap = PREV_STATS[id] || {};
    var from = typeof snap[key] === 'number' ? snap[key] : v;

    return '<span class="mrow' + (v < 20 ? ' is-low' : '') + '">' +
      '<span class="mkey">' + label + '</span>' +
      '<span class="mtrack"><i class="mfill ' + cls +
      '" style="width:' + from + '%" data-w="' + v + '"></i></span>' +
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
    var alive = SF.aliveAll(state);
    var html = '';
    var nextStats = {};

    for (var i = 0; i < alive.length; i++) {
      var s = alive[i];

      var moodTag = '';
      if (s.mad) moodTag = '<span class="mini-mood is-mad">!</span>';
      else if (s.mood <= 30) moodTag = '<span class="mini-mood">' + SF.icon('cloud', 12) + '</span>';

      var m = (state.meal && state.meal[s.id]) || {};
      var lowHp = s.hp < 20;
      var lowThirst = s.thirst > 80;
      var lowHunger = s.hunger > 80;
      var starving = lowThirst || lowHunger;
      var fedAll = !!m.eat && !!m.drink;
      var ready = heldItem === 'food' ? !m.eat
        : (heldItem === 'water' ? !m.drink
          : (heldItem === 'medicine' ? !!s.sick : false));

      var mealMarks = '';
      if (m.eat) mealMarks += '<span class="mini-fed">饱</span>';
      else mealMarks += '<span class="mini-fed is-missing">饿</span>';
      if (m.drink) mealMarks += '<span class="mini-fed">水</span>';
      if (s.sick) mealMarks += '<span class="mini-fed is-bad">病</span>';

      html += '<button type="button" class="mini-card' +
        (s.id === state.leaderId ? ' is-lead' : '') +
        (lowHp ? ' is-deadly' : '') +
        (starving ? ' is-starving' : '') +
        (fedAll ? ' is-fed' : '') +
        (ready ? ' is-ready' : '') +
        (s.id === flashId ? ' is-flash' : '') +
        '" data-id="' + s.id + '">' +
        '<span class="mini-fig">' + portraitHtml(s, 42, 42) + moodTag + '</span>' +
        '<span class="mini-main">' +
        '<span class="mini-name"><span class="mini-ap' + (s.ap > 0 ? ' is-on' : '') +
        '"></span>' + s.name + mealMarks +
        '<span class="mini-slot' + (SF.gearOf && SF.gearOf(s) ? ' is-on' : '') + '">' +
        (SF.gearOf && SF.gearOf(s)
          ? SF.icon({ torch: 'flashlight', mask: 'mask', pack: 'backpack', weapon: 'weapon' }[SF.gearOf(s)], 12)
          : '空') +
        '</span></span>' +
        microRow(s.id, '血', 'hp', 'hp', s.hp) +
        microRow(s.id, '水', 'thirst', 'thirst', 100 - s.thirst) +
        microRow(s.id, '食', 'hunger', 'hunger', 100 - s.hunger) +
        microRow(s.id, '心', 'mood', 'mood', s.mood) +
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
      '<div class="log-summary">' + summaryText() + '</div>';

    if (!notes.length) {
      html += '<div class="empty-text">第一篇日记还没写完，先撑过今晚。</div>';
    }

    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      html += '<div class="day-note">' +
        '<div class="day-note-head">第 ' + n.day + ' 天' +
        (n.cond ? '<span>' + n.cond + '</span>' : '') +
        '</div>' +
        '<p>' + n.text + '</p>' +
        '</div>';
    }

    var today = state.dayLog || [];
    if (today.length) {
      var tail = today.slice(-3);
      html += '<div class="day-note is-today">' +
        '<div class="day-note-head">第 ' + state.day + ' 天 · 还没结束</div>' +
        '<p>' + tail.join(' ') + '</p>' +
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
    if (state.rescueDay && state.items.flare) {
      return '守到第 ' + state.rescueDay + ' 天，信号弹已备好';
    }
    if (!state.items.radio) return '修好收音机，才知道救援哪天来';
    if (!state.rescueDay) return '收音机：等待军方的下一步指令';
    if (!state.items.flare) return '救援日第 ' + state.rescueDay + ' 天，还缺信号弹';
    return '救援日第 ' + state.rescueDay + ' 天';
  }

  function renderShelter() {
    // 兜底：手里的物资已经没了就自动松手，绝不让黄框卡在屏幕上
    if (heldItem && (state.supplies[heldItem] || 0) <= 0) {
      heldItem = null;
    }

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

    // 底部主线状态（不再重复天数 / 倒计时）
    var storyLine = $('story-line');
    if (storyLine) {
      var condNow = SF.condFor ? SF.condFor(state) : null;
      var flareText = state.items.flare ? '信号弹：已到手' : '信号弹：还没有';
      storyLine.textContent = '今日：' + (condNow ? condNow.name : '死寂') +
        ' · ' + storyText() + ' · ' + flareText + ' · ' + BUILD;
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
    clinic: { left: 56, top: 38, w: 42, h: 18 },  // 隔壁社区卫生站：右侧中间
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
    var lead = SF.find(state, state.leaderId);
    $('lead-name').textContent = lead ? lead.name : '—';

    sizeMapStage();

    var html = '';

    for (var i = 0; i < C.locations.length; i++) {
      var loc = C.locations[i];
      if (loc.hidden && !state.vaultUnlocked) continue;

      var spot = MAP_SPOTS[loc.id] || MAP_SPOTS.garage;
      var gate = SF.gateFor(state, loc);
      var locked = !gate.ok;

      html += '<button type="button" class="map-spot' +
        (locked ? ' is-locked' : '') +
        (mapSelected === loc.id ? ' is-selected' : '') + '"' +
        ' style="left:' + spot.left + '%;top:' + spot.top +
        '%;width:' + spot.w + '%;height:' + spot.h + '%"' +
        (locked ? ' data-locked="' + loc.id + '"' : ' data-id="' + loc.id + '"') +
        ' aria-label="' + loc.name + '"></button>';
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
    if (locked) line += ' · 尚未解锁';

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
  var GEAR_ICON = { torch: 'flashlight', mask: 'mask', pack: 'backpack', weapon: 'weapon' };

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
  function homeFortify(kind) {
    var cost = kind === 'door' ? 3 : 4;

    if ((state.supplies.material || 0) < cost) {
      updateHint('材料不够，需要 ' + cost + ' 份。');
      return;
    }

    state.supplies.material = Math.max(0, Math.round(state.supplies.material - cost));

    if (kind === 'door') {
      state.defense = 1;
    } else {
      state.bedLevel = 1;
    }

    renderShelter();
    updateHint(kind === 'door'
      ? '门被木板钉死了，夜里盗贼进不来。'
      : '床铺加了一层，睡觉时心情恢复翻倍。');
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

  function openExplorerPicker(locId) {
    var loc = SF.findLocation(locId);
    if (!loc) return;
    partyPick = {};
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
    var html = '<div class="modal-head">' +
      '<span class="modal-title">' + loc.name + '</span>' +
      '<span class="modal-sub">派谁去？（最多 ' + C.party.maxMembers + ' 人）</span>' +
      '</div>' +
      '<div class="res-text">点在名字上选人，右边的装备点一下就能穿上；选好直接出发。</div>';

    for (var i = 0; i < alive.length; i++) {
      var s = alive[i];
      if (s.mad || s.ap < 1) continue;

      var on = !!partyPick[s.id];
      var v = SF.verdictFor(state, loc, s);

      html += '<div class="pick-row' + (on ? ' is-on' : '') + '">' +
        '<button type="button" class="pick-hit" data-act="pick-toggle" data-id="' +
        s.id + '" data-loc="' + loc.id + '">' +
        '<span class="pick-check' + (on ? ' is-on' : '') + '"></span>' +
        '<span class="pick-fig">' + portraitHtml(s, 30, 40) + '</span>' +
        '<span class="pick-main"><b>' + s.name + '</b>' +
        '<span class="pick-role">' + s.role + ' · ' + traitName(s) +
        ' · 负重 ' + SF.carryOf(s) + ' 格</span>' +
        '<span class="pick-trait">' + traitTextFor(s) + '</span>' +
        '<span class="pick-verdict' + (v.good ? ' is-good' : ' is-bad') + '">' +
        v.text + '</span></span>' +
        '</button>' +
        '<div class="pick-gear">' + gearButtons(s, loc.id) + '</div>' +
        '</div>';
    }

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

    var names = [];
    for (var i = 0; i < partyIds.length; i++) {
      var m = SF.find(state, partyIds[i]);
      if (m && m.alive) names.push(m.name);
    }
    if (!names.length) return;

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

      renderLog();
    }, C.explore.searchDelay);
  }

  /* 探险日志 */
  var RAID_TALK = [
    '还好找到了这些东西，今晚总算能多撑一顿。',
    '林晓把东西一样样码好：“省着点吃，能撑几天是几天。”',
    '铁柱把包往地上一扔：“就这些？下趟得多带两个人。”',
    '娜娜叹了口气：“至少今天不用空手回来了。”'
  ];

  function pickRaidTalk() {
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

    for (var i = 0; i < r.lines.length; i++) {
      var lineText = String(r.lines[i]).replace(/（([^）]*)）/g,
        '<span class="story-note">（$1）</span>');
      html += '<p class="log-line">' + lineText + '</p>';
    }

    html += '<div class="res-label">带回来的东西</div>';
    if (r.loot.length) {
      html += '<div class="loot-row">';
      for (i = 0; i < r.loot.length; i++) {
        html += '<span class="loot-chip">' + SF.itemSvg(r.loot[i].key, 18) +
          '<span>' + r.loot[i].name + '</span>' +
          '<span class="loot-qty">×' + r.loot[i].qty + '</span></span>';
      }
      html += '</div>';
    } else {
      html += '<div class="empty-text">什么也没带回来。</div>';
    }

    // 本次探索累计结算
    var totalChips = '';
    var totalCount = 0;
    for (var tk in raidTotals) {
      if (!raidTotals.hasOwnProperty(tk) || raidTotals[tk] <= 0) continue;
      totalCount += raidTotals[tk];
      totalChips += '<span class="loot-chip is-total">' + SF.itemSvg(tk, 18) +
        '<span class="loot-qty">×' + raidTotals[tk] + '</span></span>';
    }

    if (totalChips) {
      html += '<div class="res-label">本次探索总计（共 ' + totalCount + ' 件）</div>' +
        '<div class="loot-row">' + totalChips + '</div>';
    }

    html += '<div class="night-story">' + (totalCount
      ? pickRaidTalk()
      : '空手而归。林晓把空背包往地上一扔，谁也没说话。') + '</div>';

    if (r.item) {
      html += '<div class="res-line"><span>特殊道具</span>' +
        '<span class="res-val">' + r.item.name + '</span></div>';
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
    return units;
  }

  function supplyLabel(key) {
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
        SF.itemSvg(k, 24) +
        '</button>';
    }

    // 红色虚线格子 = 超载提示区（动态算出来的）
    for (i = pk.cap; i < units.length; i++) {
      var ok2 = units[i];
      html += '<button type="button" class="bag-slot is-over" data-act="bag-pick"' +
        ' data-key="' + ok2 + '" title="点击丢弃 1 份' + supplyLabel(ok2) + '">' +
        SF.itemSvg(ok2, 24) +
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

    // 搜到一半超载：必须清完才能继续，也不许顺手关掉
    bagLock = (bagMode === 'trip') || pk.over > 0;

    openModal(html, 'modal-bag');
  }

  function dropBagItem(key) {
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

    var alive = SF.aliveAll(state);
    if (alive.length) state.leaderId = alive[0].id;

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

    var html = '<div class="modal-head">' +
      '<span class="modal-title">' + s.name + '</span>' +
      '<span class="modal-sub">' + s.role + '</span>' +
      '</div>' +
      '<div class="stat-fig">' + portraitHtml(s, 96, 120) + '</div>' +
      '<div class="trait-box"><b>' + s.trait + '</b><span>' + s.traitText + '</span></div>' +
      chips +
      statsBlock(s);

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

    if (s.id === state.leaderId) {
      html += '<div class="modal-actions">' +
        '<button type="button" class="btn" data-act="close">关闭</button>' +
        '</div>';
    } else {
      html += '<div class="modal-actions">' +
        '<button type="button" class="btn btn-main" data-act="lead" data-id="' + s.id + '">换他带队</button>' +
        '<button type="button" class="btn" data-act="close">关闭</button>' +
        '</div>';
    }

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
        (s.id === state.leaderId ? '<span class="tag tag-ok">带队</span>' : '') +
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
    if (key === 'food') return '【食物：食用后恢复 50 点饥饿值】';
    if (key === 'water') return '【水：饮用后恢复 50 点口渴值】';
    if (key === 'medicine') return '【药品：治好生病并恢复 30 点血量】';
    if (key === 'material') return '【木板：修补窗户、钉死大门、生火取暖】';
    if (key === 'flashlight') return '【手电筒：探索暗处时物资收益增加】';
    if (key === 'weapon') return '【武器：保安亭必备，也能当撬棍】';
    if (key === 'radio') return '【收音机：修好后能收到军方情报】';
    if (key === 'flare') return '【信号弹：救援直升机靠它找到你们】';
    if (key === 'mask') return '【防毒面具：进入隔壁社区卫生站的必需品】';
    if (key === 'cards') return '【扑克牌：避难所里每天心情恢复更快】';
    if (key === 'pesticide') return '【杀虫剂：清理通风口和床铺的虫子】';
    if (key === 'backpack') return '【双肩包：给一个人背上，他的负重 +2 格】';
    if (key === 'parts') return '【电子零件：修收音机用，不占负重】';
    return '';
  }

  function openGear(key) {
    // 破收音机：用 1 枚电子零件修好
    if (key === 'radioBroken') {
      var parts = state.parts || 0;

      openModal('<div class="modal-head">' +
        '<span class="modal-title">破损的收音机</span>' +
        '</div>' +
        '<div class="gear-big-ico">' + SF.itemSvg('parts', 44) + '</div>' +
        '<div class="res-text">外壳裂了，线圈也断了。陈默说，换一枚电子零件就能救回来。</div>' +
        '<div class="res-text">现有电子零件：' + parts + ' / 1</div>' +
        '<div class="modal-actions modal-actions-col">' +
        '<button type="button" class="btn btn-main" data-act="repair-radio"' +
        (parts < 1 ? ' disabled' : '') + '>修好它（零件 -1）</button>' +
        (parts < 1 ? '<div class="opt-lack">【缺少电子零件】</div>' : '') +
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

    openNight();
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
      '<div class="res-text">' + st.text.replace(/\n/g, '<br>') + '</div>' +
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
        '<div class="res-text">' + ev.text + '</div>' +
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

    var hasStory = false;
    try {
      hasStory = !!(SF.storyFor && SF.storyFor(state) &&
        state.storySeenDay !== state.day);
    } catch (e) {
      hasStory = false;
    }
    if (hasStory) morningQueue.push('story');

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
      }
    }
  }

  function openVictory() {
    var days = state.overAtDay || state.rescueDay || state.day;
    var names = SF.aliveAll(state).map(function (s) { return s.name; }).join('、');

    openModal('<div class="modal-head"><span class="modal-title">逃出生天</span></div>' +
      '<div class="vic-days">活到了第 <b>' + days + '</b> 天</div>' +
      '<div class="res-text">信号弹升空的那晚，直升机记下了这栋楼。第二天清晨，' +
      '螺旋桨的声音由远及近，最后停在头顶。</div>' +
      '<div class="res-label">活下来的人</div>' +
      '<div class="res-text">' + (names || '没有人') + '</div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn btn-main" data-act="restart">再来一局</button>' +
      '</div>',
      'modal-over');

    $('overlay').classList.add('is-victory');
  }

  /* ---------------- 主界面投喂 ---------------- */

  // 手里正拿着的物资：'food' | 'water' | null
  var heldItem = null;
  // 刚喂过的人：卡片闪一下
  var flashId = null;
  var hintTimer = 0;
  // 上一次点名片的时间：只用来吃掉连点带出来的第二下
  var lastCardTapId = '';
  var lastCardTapAt = 0;
  // 连点保护窗口（毫秒）
  var TAP_GUARD = 220;

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
          : '已拿起药品（治病并回30血） | 请点击人物');
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

  /* 图标和名片：直接在元素上绑 click，不走冒泡 */
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
      bindCardTap(cards[i], cards[i].getAttribute('data-id'));
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
    return '药品';
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

  /* 喂一个人 / 给他用药：当场同步结算，然后无条件松手 */
  function feedPerson(id) {
    var kind = heldItem;
    if (!kind) return;

    var label = holdLabel(kind);
    var now = Date.now();

    // 连点保护：同一个人 220 毫秒内的第二下直接吃掉，绝不多算一次
    if (id === lastCardTapId && now - lastCardTapAt < TAP_GUARD) return;
    lastCardTapId = id;
    lastCardTapAt = now;

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

    // 黄框必须立刻消失：不管成功还是失败
    heldItem = null;
    flashId = res && res.ok ? id : null;

    if (res && res.ok && SF.sfx) {
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

    if (res && res.ok) {
      updateHint(res.msg || '喂好了。');
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
    if (!s || !s.alive) return;

    // 连点保护：同一个人 220 毫秒内的第二下不重复处理
    if (id === lastCardTapId && Date.now() - lastCardTapAt < TAP_GUARD) return;

    if (heldItem) {
      feedPerson(id);
      return;
    }

    state.leaderId = s.id;
    renderShelter();
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
        '<div class="night-story">' + n.dayNote + '</div>';
    }

    if (n.condition) {
      html += '<div class="night-story">明天早上的状况：' + n.condition + '</div>';
    }

    if (n.milestone) {
      html += '<div class="warn-line">【主线警告】' + n.milestone + '</div>';
    }

    html += '<div class="res-label">夜里发生了什么</div>';

    if (n.events && n.events.length) {
      for (var i = 0; i < n.events.length; i++) {
        var ev = n.events[i];
        html += '<div class="night-story">' + ev.text + '</div>';

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
      html += '<div class="alert bad">' + n.deaths.join('、') + ' 没能撑过这一夜。</div>';
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
      if (bagLock) return;
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
    } else if (act === 'lead') {
      state.leaderId = id;
      closeModal();
      renderShelter();
    } else if (act === 'detail') {
      openDetail(id);
    } else if (act === 'equip') {
      SF.toggleGear(state, id, el.getAttribute('data-gear'));
      renderPartyPicker(el.getAttribute('data-loc') || raidLoc);
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
      renderPartyPicker(locId);
    } else if (act === 'party-go') {
      var ids = [];
      for (var pk in partyPick) {
        if (partyPick.hasOwnProperty(pk)) ids.push(pk);
      }
      if (!ids.length) return;

      var goLoc = el.getAttribute('data-loc');
      state.leaderId = ids[0];

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
    } else if (act === 'restart') {
      restart();
    }
  }

  function onPeopleClick(ev) {
    var el = elementFrom(ev.target, $('people'), 'data-id');
    if (!el) return;

    var id = el.getAttribute('data-id');
    var s = SF.find(state, id);
    if (!s || !s.alive) return;

    // 连点保护：刚处理过的那个人，第二下直接吃掉
    if (id === lastCardTapId && Date.now() - lastCardTapAt < TAP_GUARD) return;

    // 手里拿着东西：直接喂给他
    if (heldItem) {
      feedPerson(id);
      return;
    }

    state.leaderId = s.id;
    renderShelter();
    openDetail(s.id);
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
      s.hp = 5;
      s.hunger = 95;
      s.thirst = 95;
      s.mood = 5;
      msg = s.name + '：血量 5、饥饿 95、口渴 95、心情 5。';
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
      state.supplies.food = 20;
      state.supplies.water = 20;
      state.supplies.medicine = 20;
      state.supplies.material = 20;
      msg = '物资全满：食物 / 水 / 药品 / 木板 各 20。';
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
      // 跳到救援前一天：把收音机和信号弹都塞给你，好让结局两步就能看到
      state.items.radio = true;
      state.items.flare = true;
      if (!state.parts) state.parts = 1;

      state.rescueDay = state.day + 2;
      state.rescueKnown = true;

      var lastNight = state.day;
      state.storySeenDay = state.day - 1;
      state.dayEventDone = 0;
      state.dayEventIdDay = 0;
      state.dayEventId = '';
      state.over = false;
      state.won = false;

      if (SF.saveGame) SF.saveGame(state);
      closeDebug();
      renderShelter();
      updateHint('收音机报了日期：第 ' + state.rescueDay + ' 天撤离。信号弹在手，' +
        '再点两次「结束今天」就能看到直升机。');
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
  var miniCounts = { food: 0, water: 0, material: 0 };
  var miniBasketX = 50;
  var miniLeft = 15;
  var miniRunning = false;
  var miniBound = false;

  var MINI_DEFS = {
    food: { icon: '🍖', name: '食物' },
    water: { icon: '💧', name: '水' },
    material: { icon: '🪵', name: '木板' }
  };

  function miniRenderCounts() {
    var box = $('mini-counts');
    if (!box) return;
    box.textContent = '🍖 ' + miniCounts.food + ' · 💧 ' + miniCounts.water +
      ' · 🪵 ' + miniCounts.material;
  }

  function miniPlaceBasket() {
    var basket = $('mini-basket');
    if (basket) basket.style.left = miniBasketX + '%';
  }

  function miniSpawn() {
    if (!miniRunning) return;

    var field = $('mini-field');
    if (!field) return;

    var keys = ['food', 'water', 'material', 'material'];
    var key = keys[Math.floor(Math.random() * keys.length)];

    var el = document.createElement('div');
    el.className = 'mini-item';
    el.textContent = MINI_DEFS[key].icon;
    var left = 4 + Math.random() * 88;
    el.style.left = left + '%';
    el.style.top = '-40px';
    field.appendChild(el);

    miniItems.push({ el: el, key: key, left: left, top: -40, dead: false });
  }

  function miniStep() {
    if (!miniRunning) return;

    var field = $('mini-field');
    if (!field) return;

    var h = field.clientHeight || 600;
    var basketTop = h - 78;
    var basketEl = $('mini-basket');
    if (basketEl) {
      var fRect = field.getBoundingClientRect();
      var bRect = basketEl.getBoundingClientRect();
      basketTop = bRect.top - fRect.top;
    }

    for (var i = miniItems.length - 1; i >= 0; i--) {
      var it = miniItems[i];
      if (it.dead) {
        miniItems.splice(i, 1);
        continue;
      }

      it.top += 4.4;
      it.el.style.top = it.top + 'px';

      if (it.top + 30 >= basketTop && it.top < h) {
        if (Math.abs(it.left - miniBasketX) < 7.5) {
          miniCounts[it.key] += 1;
          miniRenderCounts();
          if (SF.sfx && SF.sfx.pick) SF.sfx.pick();
          it.dead = true;
          it.el.remove();
          miniItems.splice(i, 1);
          continue;
        }
      }

      if (it.top > h + 20) {
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
    miniCounts = { food: 0, water: 0, material: 0 };
    miniBasketX = 50;
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

    miniDropTimer = window.setInterval(miniSpawn, 440);
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
      text.textContent = '你拖着接满物资的地毯，赶在尸群包围前逃回了房间。（食物 x' +
        miniCounts.food + '，水 x' + miniCounts.water + '，木板 x' + miniCounts.material + '）';
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

    state = SF.newGame();
    state.supplies.food = miniCounts.food;
    state.supplies.water = miniCounts.water;
    state.supplies.material = miniCounts.material;

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
      var rect = screen.getBoundingClientRect();
      var pct = ((clientX - rect.left) / rect.width) * 100;
      if (pct < 6) pct = 6;
      if (pct > 94) pct = 94;
      miniBasketX = pct;
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
    $('btn-clean').addEventListener('click', openBath);
    $('btn-repair').addEventListener('click', function () { homeFortify('door'); });
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
      if (bagLock) return;
      if (ev.target === $('overlay')) {
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
