/*
 * 界面逻辑：避难所（背景图 + 代码画的货架）/ 外出地图 / 弹窗。
 * 像素美术都在 js/art.js 里；这里只有静态 DOM 排版，没有动画、没有 canvas。
 */
(function () {

  var C = SF.CONFIG;

  // 版本号：每次改动都往后加一，方便确认页面是不是最新版
  var BUILD = 'v67';
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

        ctx.putImageData(data, 0, 0);
        out = canvas.toDataURL('image/png');
      } catch (err) {
        out = '';
      }

      KEYED[src] = out || src;
      done(KEYED[src]);
    };

    img.onerror = function () {
      KEYED[src] = src;
      done(src);
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
          return;
        }
        keyWhite(src, function (url) {
          sceneImg.src = url;
          sceneImg.className = 'scene-img is-keyed';
        });
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
    $('overlay').classList.add('is-on');
  }

  function closeModal() {
    $('overlay').classList.remove('is-on');
    $('modal').innerHTML = '';
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

    var supplyCells = '';
    for (var i = 0; i < SF.SUPPLIES.length; i++) {
      var key = SF.SUPPLIES[i].key;
      var n = state.supplies[key] || 0;
      var canFeed = key === 'food' || key === 'water' || key === 'medicine';
      var ico = '<span class="inv-ico" style="width:40px;height:40px;display:flex;align-items:center;justify-content:center">' +
        SF.itemSvg(key, 40) + '</span>';
      var num = '<span class="inv-num">' + Math.round(n) + '</span>';

      if (canFeed) {
        supplyCells += '<button type="button" id="hold-' + key + '" class="inv-cell' +
          (n <= 0 ? ' is-empty' : '') + '" data-hold="' + key + '" title="' +
          SF.SUPPLIES[i].name + '">' + ico + num + '</button>';
      } else {
        supplyCells += '<span class="inv-cell' + (n <= 0 ? ' is-empty' : '') + '">' +
          ico + num + '</span>';
      }
    }

    var slots = [
      { key: 'radio', label: '收音机', tip: '收音机 - 修好后能收到军方救援情报。', has: state.items.radio, worn: false, group: 'special' },
      { key: 'mask', label: '面具', tip: '防毒面具 - 进入废弃医院的必需品。', has: state.items.gasMask, worn: gearWorn('mask'), group: 'special' },
      { key: 'flashlight', label: '手电', tip: '手电筒 - 可在城郊仓库大幅增加收益。', has: state.items.flashlight, worn: gearWorn('torch'), group: 'gear' },
      { key: 'weapon', label: '武器', tip: '武器 - 警局必备，也可在探索中当撬棍。', has: state.items.weapon, worn: gearWorn('weapon'), group: 'gear' }
    ];

    var specialCells = '';
    var gearCells = '';
    for (var si = 0; si < slots.length; si++) {
      if (slots[si].group === 'special') specialCells += shelfSlot(slots[si]);
      else gearCells += shelfSlot(slots[si]);
    }

    function section(label, cells) {
      return '<div class="shelf-sec">' +
        '<span class="shelf-label">' + label + '</span>' +
        '<div class="inv-grid">' + cells + '</div>' +
        '</div>';
    }

    html += section('物资', supplyCells);
    html += section('特殊道具', specialCells);
    html += section('武器装备', gearCells);

    $('shelf').innerHTML = html;
  }

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
    $('rescue-tag').textContent = state.rescueLeft > 0
      ? '救援倒计时 ' + state.rescueLeft + ' 天'
      : '救援没来';
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

    var gear = $('gear');
    if (!gear) return;

    gear.innerHTML = '<div class="inv-sub">特殊道具</div>' +
      '<div class="inv-gear-row">' +
      (row || '<span class="inv-empty">还没有特殊道具</span>') +
      '</div>';
  }

  /* 顶部广播栏：一眼看清今天发生了什么 */
  function renderTicker() {
    var parts = [];
    var left = state.rescueLeft > 0 ? state.rescueLeft : 0;

    if (state.items && state.items.flare) {
      parts.push('已取得信号弹 · 救援倒计时 ' + left + ' 天');
    } else {
      parts.push('军方警告：救援倒计时 ' + left + ' 天。未持有信号弹者将被抛弃');
    }

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
        '"></span>' + s.name + mealMarks + '</span>' +
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

  /* 日志按钮：半屏面板，看得清 */
  function openLog() {
    var lines = state.logs.slice().reverse();
    var html = '<div class="modal-head">' +
      '<span class="modal-title">避难所日志</span>' +
      '<span class="modal-sub">第 ' + state.day + ' 天</span>' +
      '</div>' +
      '<div class="log-summary">' + summaryText() + '</div>';

    if (!lines.length) {
      html += '<div class="empty-text">还没有发生什么。</div>';
    }

    for (var i = 0; i < lines.length; i++) {
      html += '<div class="log-entry">' + lines[i] + '</div>';
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
    if (state.items && state.items.flare) return '信号弹到手，准备撤离';
    if (state.day <= 5) return '军方封锁中，先活下去';
    if (state.day <= 10) return '去废弃警局找信号弹';
    if (state.day <= 15) return '没有信号弹，直升机看不到我们';
    return '最后冲刺';
  }

  function renderShelter() {
    $('day-num').textContent = String(state.day);

    renderShelf();
    renderMatChip();
    renderGear();
    renderTicker();
    renderPeople();

    var alive = SF.aliveAll(state);
    var exploreBtn = $('btn-explore');
    var anyAp = SF.anyAp(state);
    var scout = SF.canExplore ? SF.canExplore(state) : null;

    if (!alive.length) {
      exploreBtn.disabled = true;
      exploreBtn.textContent = '没有人了';
      $('btn-status').disabled = true;
      $('btn-night').disabled = true;
    } else {
      $('btn-status').disabled = false;
      $('btn-night').disabled = false;

      // 只有血量低于 20 才算虚弱；饿、渴、心情差都不锁按钮
      exploreBtn.disabled = !scout;
      exploreBtn.textContent = scout ? '出门探索' : '今天都动不了了';
    }

    $('btn-clean').disabled = !anyAp || (state.supplies.water || 0) < 1;

    // 底部主线状态
    var storyLine = $('story-line');
    if (storyLine) {
      var flareText = state.items.flare ? '信号弹：已到手' : '信号弹：还没有';
      storyLine.textContent = '第 ' + state.day + ' / 15 天 · ' +
        (state.rescueLeft > 0 ? '军方倒计时 ' + state.rescueLeft + ' 天' : '救援没来') +
        ' · ' + storyText() + ' · ' + flareText;
    }

    // 直接给图标和名片绑点击，再按当前选中的物资刷一遍样式
    paintHold();
    bindFastTaps();
    updateHint();
  }

  /* ---------------- 地图 ---------------- */

  function renderMap() {
    $('day-num-map').textContent = String(state.day);
    var lead = SF.find(state, state.leaderId);
    $('lead-name').textContent = lead ? lead.name : '—';

    var html = '';
    var paths = '';

    for (var i = 0; i < C.locations.length; i++) {
      var loc = C.locations[i];
      if (loc.hidden && !state.vaultUnlocked) continue;

      var gate = SF.gateFor(state, loc);
      var locked = !gate.ok;

      paths += '<line x1="50" y1="82" x2="' + loc.mapX + '" y2="' + loc.mapY +
        '" stroke="rgba(200,210,190,0.32)" stroke-width="0.45" stroke-dasharray="2 2"/>';

      if (locked) {
        html += '<button type="button" class="map-node is-locked" style="left:' + loc.mapX +
          '%;top:' + loc.mapY + '%" data-locked="' + loc.id + '">' +
          '<span class="node-ico">?</span>' +
          '<span class="node-name">未知区域</span>' +
          '<span class="node-risk risk-high">未解锁</span>' +
          '</button>';
        continue;
      }

      html += '<button type="button" class="map-node" style="left:' + loc.mapX +
        '%;top:' + loc.mapY + '%" data-id="' + loc.id + '">' +
        '<span class="node-ico">' + SF.icon(loc.icon, 26) + '</span>' +
        '<span class="node-name">' + loc.name + '</span>' +
        '<span class="node-risk risk-' + loc.riskLevel + '">' + loc.risk + '</span>' +
        '</button>';
    }

    html += '<div class="map-node is-home" style="left:50%;top:82%">' +
      '<span class="node-ico">' + SF.icon('house', 26) + '</span>' +
      '<span class="node-name">避难所</span>' +
      '</div>';

    $('map-path').innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' +
      paths + '</svg>';
    $('map-grid').innerHTML = html;
  }

  /* 出发前的装备界面 */
  var raidLoc = '';
  var raidIds = [];
  var raidDepth = 1;
  var raidTotals = {};

  function gearButtons(s, locId) {
    var defs = [
      { key: 'mask', label: '面具', has: s.hasMask, own: state.items.gasMask },
      { key: 'torch', label: '手电', has: s.hasTorch, own: state.items.flashlight },
      { key: 'weapon', label: '武器', has: s.hasWeapon, own: state.items.weapon }
    ];
    var html = '';

    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      if (!d.has && !d.own) continue;
      html += '<button type="button" class="gear-chip' + (d.has ? ' is-on' : '') + '"' +
        ' data-act="equip" data-gear="' + d.key + '" data-id="' + s.id + '"' +
        ' data-loc="' + (locId || '') + '">' +
        d.label + (d.has ? ' ✓' : '') + '</button>';
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
        '<span class="equip-role">' + s.role + ' · ' + s.trait + '</span>' +
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
        '<span class="pick-role">' + s.role + ' · ' + traitName(s) + '</span>' +
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

      if (!SF.aliveAll(state).length) {
        state.over = true;
        state.overDay = state.day;
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

    var html = '<div class="modal-head">' +
      '<span class="modal-title">探险日志</span>' +
      '<span class="modal-sub">' + r.location.name + '</span>' +
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
        html += '<span class="loot-chip">' + SF.icon(r.loot[i].key, 15) +
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
      totalChips += '<span class="loot-chip is-total">' + SF.icon(tk, 15) +
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
        '<div class="modal-actions">';

      for (i = 0; i < r.choice.options.length; i++) {
        html += '<button type="button" class="btn' + (i === 0 ? ' btn-main' : '') +
          '" data-act="log-choice" data-key="' + r.choice.options[i].key + '">' +
          r.choice.options[i].label + '</button>';
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
    renderShelter();
    showScreen('screen-shelter');

    if (state.over) {
      openGameOver();
    }
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

    var left = state.rescueLeft > 0
      ? '军方救援倒计时：' + state.rescueLeft + ' 天'
      : '救援倒计时已经到了，外面却什么也没有。';

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

  function openGear(key) {
    if (key === 'radio') openBroadcast();
    else if (key === 'radioBroken') tryRepair();
    else if (key === 'pesticide') openPesticide();
    else if (key === 'cards') openGearInfo('扑克牌', '只要它在避难所里，所有人每天的心情恢复都会更快。');
    else if (key === 'flashlight') openGearInfo('手电筒', '可在城郊仓库大幅增加收益。出发前给队员穿上。');
    else if (key === 'gasMask') openGearInfo('防毒面具', '进入废弃医院的必需品，也能防止探索时染病。');
    else if (key === 'weapon') openGearInfo('武器', '警局必备；也可以在探索里当撬棍换零件。');
    else if (key === 'mask') openGearInfo('防毒面具', '出发前给队员戴上，医院里不会被毒气伤到。');
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

    showStoryIfAny();
    openNight();
  }

  /* 线性主线：进入新的一天时弹一次 */
  function showStoryIfAny() {
    if (!SF.storyFor) return;

    var st = SF.storyFor(state);
    if (!st) return;
    if (state.storySeenDay === state.day) return;

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
  }

  function openVictory() {
    var days = state.overAtDay || 20;

    openModal('<div class="modal-head"><span class="modal-title">直升机来了</span></div>' +
      '<div class="res-text">第 ' + days + ' 天的清晨，你们爬上楼顶，' +
      '把最后一发信号弹打上天。螺旋桨的声音越来越近。</div>' +
      '<div class="res-label">结局</div>' +
      '<div class="res-text">活下来的人：' +
      SF.aliveAll(state).map(function (s) { return s.name; }).join('、') + '</div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn btn-main" data-act="restart">再来一局</button>' +
      '</div>',
      'modal-over');
  }

  /* ---------------- 主界面投喂 ---------------- */

  // 手里正拿着的物资：'food' | 'water' | null
  var heldItem = null;
  // 刚喂过的人：卡片闪一下
  var flashId = null;
  var hintTimer = 0;
  var lastPickAt = 0;

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
      bar.textContent = '【已选中' + holdLabel(heldItem) + '，请点击人物' +
        (heldItem === 'medicine' ? '用药】' : '投喂】');
      bar.style.color = '#ff5252';
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
      (function (el) {
        el.style.pointerEvents = 'auto';
        el.onclick = function (ev) {
          if (ev) ev.stopPropagation();
          onPersonTap(el.getAttribute('data-id'));
        };
      })(cards[i]);
    }
  }

  function holdLabel(key) {
    if (key === 'food') return '食物';
    if (key === 'water') return '水';
    return '药品';
  }

  /* 点物资图标：拿起来 / 放回去 */
  function pickItem(key) {
    var now = Date.now();
    // 一次点击只处理一次，避免冒泡和直接绑定各触发一遍
    if (now - lastPickAt < 260) return;
    lastPickAt = now;

    if (heldItem === key) {
      heldItem = null;
      renderShelter();
      updateHint('把手里的东西放回了库存。');
      return;
    }

    if ((state.supplies[key] || 0) <= 0) {
      updateHint(holdLabel(key) + ' 已经用完了。');
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

  /* 喂一个人 / 给他用药：库存当场扣掉，卡片闪一下 */
  function feedPerson(id) {
    if (!heldItem) return;

    var kind = heldItem;
    var res = kind === 'medicine'
      ? SF.useMedicineOn(state, id)
      : SF.feed(state, id, kind);

    if (!res.ok) {
      updateHint(res.msg || '不行。');
      return;
    }

    heldItem = null; // 投喂完成自动放下
    flashId = id;

    if (SF.sfx) {
      if (kind === 'food' && SF.sfx.eat) SF.sfx.eat();
      else if (kind === 'water' && SF.sfx.drink) SF.sfx.drink();
      else if (SF.sfx.pick) SF.sfx.pick();
    }

    renderShelter();
    updateHint();

    window.setTimeout(function () {
      if (flashId === id) flashId = null;
    }, 700);
  }

  /* 点名片：手里有东西就喂，否则打开人物面板 */
  function onPersonTap(id) {
    var s = SF.find(state, id);
    if (!s || !s.alive) return;

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
    if (!alive.length) return;

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

  function openGameOver() {
    var days = state.overDay || (state.day - 1);
    if (days < 1) days = 1;

    openModal('<div class="modal-head"><span class="modal-title">避难所熄灯了</span></div>' +
      '<div class="res-text">撑到了第 ' + days + ' 天。</div>' +
      '<div class="res-label">最后</div>' +
      '<div class="res-text">最后一盏灯灭了。铁门还锁着，门外再没有声音。</div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn btn-main" data-act="restart">重新开始</button>' +
      '</div>',
      'modal-over');
  }

  function restart() {
    if (timer) {
      window.clearTimeout(timer);
      timer = 0;
    }
    searching = false;
    lastReport = null;
    nightReport = null;

    state = SF.newGame();
    closeModal();
    renderShelter();
    showScreen('screen-shelter');
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
    } else if (act === 'radio-listen') {
      openBroadcast();
    } else if (act === 'back-home') {
      backHome();
    } else if (act === 'next-day') {
      closeModal();
      renderShelter();
      showScreen('screen-shelter');
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
      openModal('<div class="modal-head"><span class="modal-title">' +
        (loc ? loc.name : '未知区域') + '</span></div>' +
        '<div class="res-text">' + (gate.reason || '没有情报，前往太危险。') + '</div>' +
        '<div class="modal-actions"><button type="button" class="btn" data-act="close">知道了</button></div>',
        'modal-action');
      return;
    }

    var el = elementFrom(ev.target, $('map-grid'), 'data-id');
    if (!el) return;
    openExplorerPicker(el.getAttribute('data-id'));
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
    if (!SF.canExplore(state)) return;

    closeModal();
    renderMap();
    showScreen('screen-map');
  }

  function onGoHome() {
    closeModal();
    renderShelter();
    showScreen('screen-shelter');
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
    '撑过 14 天，楼顶的救援直升机才会来。在这之前，一口水，就能决定谁能看到明天的太阳。'
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

  /* ---------------- 抢物资小游戏 ---------------- */
  var miniTimer = 0;
  var miniDropTimer = 0;
  var miniClockTimer = 0;
  var miniItems = [];
  var miniCounts = { food: 0, water: 0, material: 0 };
  var miniBasketX = 50;
  var miniLeft = 15;
  var miniRunning = false;

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
    showStoryIfAny();
  }

  function bindMiniInput() {
    var screen = $('screen-mini');
    if (!screen) return;

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
    $('btn-status').addEventListener('click', openRoster);
    $('shelf').addEventListener('click', onShelfClick);
    $('btn-night').addEventListener('click', endDay);
    $('btn-clean').addEventListener('click', openBath);
    $('btn-repair').addEventListener('click', function () { homeFortify('door'); });
    $('btn-bed').addEventListener('click', function () { homeFortify('bed'); });
    $('btn-log').addEventListener('click', openLog);
    $('btn-go-home').addEventListener('click', onGoHome);
    $('people').addEventListener('click', onPeopleClick);
    $('scene').addEventListener('click', openRoster);
    $('map-grid').addEventListener('click', onMapClick);
    $('modal').addEventListener('click', onModalClick);

    $('overlay').addEventListener('click', function (ev) {
      if (ev.target === $('overlay')) closeModal();
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

    if (loadNoticeDay) {
      updateHint('已读取第 ' + loadNoticeDay + ' 天存档');
      showStoryIfAny();
      return;
    }

    showScreen('screen-intro');

    playIntro();

    var introBtn = $('btn-intro-go');
    if (introBtn) {
      introBtn.onclick = function (ev) {
        if (ev) ev.stopPropagation();
        introBtn.classList.remove('is-hidden');
        if (introTimer) window.clearTimeout(introTimer);
        introTimer = 0;
        startMiniGame();
      };
    }

    bindMiniInput();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
