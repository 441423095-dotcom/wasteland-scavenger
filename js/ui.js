/*
 * 界面逻辑：避难所（背景图 + 代码画的货架）/ 外出地图 / 弹窗。
 * 像素美术都在 js/art.js 里；这里只有静态 DOM 排版，没有动画、没有 canvas。
 */
(function () {

  var C = SF.CONFIG;

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
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;

        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

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
    modal.innerHTML = html;
    modal.scrollTop = 0;
    $('overlay').classList.add('is-on');
  }

  function closeModal() {
    $('overlay').classList.remove('is-on');
    $('modal').innerHTML = '';
  }

  /* ---------------- 状态条 ---------------- */

  function statBar(label, value, invert) {
    var v = Math.round(value);
    var good = invert ? 100 - v : v;
    if (good < 0) good = 0;
    if (good > 100) good = 100;

    var cls = 'ok';
    if (good < 33) cls = 'bad';
    else if (good < 66) cls = 'warn';

    return '<div class="stat">' +
      '<span class="stat-label">' + label + '</span>' +
      '<span class="bar"><i class="' + cls + '" style="width:' + good + '%"></i></span>' +
      '<span class="stat-val">' + v + '</span>' +
      '</div>';
  }

  function statsBlock(s) {
    return statBar('口渴', s.thirst, true) +
      statBar('饥饿', s.hunger, true) +
      statBar('血量', s.hp, false) +
      statBar('心情', s.mood, false);
  }

  /* ---------------- 避难所渲染 ---------------- */

  function renderShelf() {
    var html = '';

    for (var i = 0; i < SHELF_ITEMS.length; i++) {
      var key = SHELF_ITEMS[i];
      var n = state.supplies[key] || 0;

      html += '<div class="tier">' +
        '<span class="piece">' + SF.itemSvg(key, 26) + '</span>' +
        '<span class="piece-count">' + (n === 0 ? '空' : '×' + (Math.round(n * 10) / 10)) + '</span>' +
        '</div>';
    }

    $('shelf').innerHTML = html;
  }

  function renderMatChip() {
    $('rescue-tag').textContent = state.rescueLeft > 0
      ? '救援倒计时 ' + state.rescueLeft + ' 天'
      : '救援没来';
  }

  /* 货架下方：特殊道具 */
  function renderGear() {
    var html = '';

    if (state.items.radioBroken) {
      html += '<button type="button" class="gear-item" data-item="radioBroken">' +
        SF.icon('radio', 20) + '<span>坏收音机</span></button>';
    } else if (state.items.radio) {
      html += '<button type="button" class="gear-item" data-item="radio">' +
        SF.icon('radio', 20) + '<span>收音机</span></button>';
    }
    if (state.items.pesticide) {
      html += '<button type="button" class="gear-item" data-item="pesticide">' +
        SF.icon('pesticide', 20) + '<span>杀虫剂</span></button>';
    }

    var gear = $('gear');
    gear.innerHTML = html;
    gear.style.display = html ? 'flex' : 'none';

    var shelf = $('shelf');
    if (shelf) {
      gear.style.top = (shelf.offsetTop + shelf.offsetHeight + 6) + 'px';
    }
  }

  /* 顶部滚动播报 */
  function renderTicker() {
    var parts = ['第 ' + state.day + ' 天'];

    if (state.rescueLeft > 0) {
      parts.push('军方救援倒计时 ' + state.rescueLeft + ' 天');
    } else {
      parts.push('救援没有来');
    }
    if (state.lastEvent) parts.push(state.lastEvent);

    $('ticker-text').textContent = parts.join('  ·  ') + '  ·  ';
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

  /* 左侧名片：半身像 + 名字职业 + 四条状态条 */
  function miniBar(value, invert) {
    var v = Math.round(value);
    var good = invert ? 100 - v : v;
    if (good < 0) good = 0;
    if (good > 100) good = 100;

    var cls = 'ok';
    if (good < 33) cls = 'bad';
    else if (good < 66) cls = 'warn';

    return '<span class="pbar"><i class="' + cls + '" style="width:' + good + '%"></i></span>';
  }

  function renderPeople() {
    var alive = SF.aliveAll(state);
    var html = '';

    for (var i = 0; i < alive.length; i++) {
      var s = alive[i];
      var critical = s.hp <= 30 || s.hunger >= 85 || s.thirst >= 85;

      var hpGood = s.hp;
      var hungerGood = 100 - s.hunger;
      var thirstGood = 100 - s.thirst;

      var kind = 'hp';
      var val = hpGood;
      if (hungerGood < val) {
        kind = 'hunger';
        val = hungerGood;
      }
      if (thirstGood < val) {
        kind = 'thirst';
        val = thirstGood;
      }

      val = Math.max(0, Math.min(100, Math.round(val)));

      var moodTag = '';
      if (s.mad) moodTag = '<span class="mini-mood is-mad">!</span>';
      else if (s.mood <= 30) moodTag = '<span class="mini-mood">' + SF.icon('cloud', 12) + '</span>';

      html += '<button type="button" class="mini-card' +
        (s.id === state.leaderId ? ' is-lead' : '') +
        (critical ? ' is-critical' : '') +
        '" data-id="' + s.id + '">' +
        '<span class="mini-fig">' + portraitHtml(s, 40, 40) + moodTag + '</span>' +
        '<span class="mini-main">' +
        '<span class="mini-name"><span class="mini-ap' + (s.ap > 0 ? ' is-on' : '') +
        '"></span>' + s.name + '</span>' +
        '<span class="mini-track">' +
        '<i class="mini-fill ' + kind + '" style="width:' + val + '%"></i>' +
        '</span>' +
        '</span>' +
        '</button>';
    }

    $('people').innerHTML = html;
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
    if (!alive.length) return '避难所里已经没有活人了。';

    var food = 0;
    var water = 0;
    var ap = 0;
    var waterR = SF.waterRation(state);

    for (var i = 0; i < alive.length; i++) {
      food += SF.foodNeed(alive[i]);
      water += waterR;
      ap += alive[i].ap;
    }

    var need = '今夜要 食物 ' + food + ' · 水 ' + (Math.round(water * 10) / 10) +
      '，存货 食物 ' + (state.supplies.food || 0) + ' · 水 ' + (state.supplies.water || 0) + '。';
    var apText = '还剩 ' + ap + ' 点行动点。';

    return apText + need;
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

    if (!alive.length) {
      exploreBtn.disabled = true;
      exploreBtn.textContent = '没有人了';
      $('btn-status').disabled = true;
      $('btn-night').disabled = true;
    } else {
      $('btn-status').disabled = false;
      $('btn-night').disabled = false;

      exploreBtn.disabled = !anyAp;
      exploreBtn.textContent = anyAp ? '出门探索' : '没有力气了';
    }

    $('btn-clean').disabled = !anyAp || (state.supplies.water || 0) < 1;
    $('btn-repair').disabled = !anyAp;
    $('btn-talk').disabled = !anyAp;

    $('hintbar').textContent = dayHint();
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

      paths += '<line x1="50" y1="82" x2="' + loc.mapX + '" y2="' + loc.mapY +
        '" stroke="rgba(200,210,190,0.32)" stroke-width="0.45" stroke-dasharray="2 2"/>';

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

  function gearButtons(s) {
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
        ' data-act="equip" data-gear="' + d.key + '" data-id="' + s.id + '">' +
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
        '<span class="equip-role">' + s.role + '</span></span>' +
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

  function renderPartyPicker(locId) {
    var loc = SF.findLocation(locId);
    if (!loc) return;

    var alive = SF.aliveAll(state);
    var html = '<div class="modal-head">' +
      '<span class="modal-title">' + loc.name + '</span>' +
      '<span class="modal-sub">派谁去？（最多 ' + C.party.maxMembers + ' 人）</span>' +
      '</div>';

    for (var i = 0; i < alive.length; i++) {
      var s = alive[i];
      if (s.mad || s.ap < 1) continue;

      var on = !!partyPick[s.id];
      var weak = s.mood < C.explore.refuseMoodBelow;

      html += '<button type="button" class="pick-row' + (on ? ' is-on' : '') +
        (s.id === state.leaderId ? ' is-lead' : '') +
        '" data-act="pick-toggle" data-id="' + s.id + '" data-loc="' + loc.id + '">' +
        '<span class="pick-check' + (on ? ' is-on' : '') + '"></span>' +
        '<span class="pick-fig">' + portraitHtml(s, 30, 40) + '</span>' +
        '<span class="pick-main"><b>' + s.name + '</b>' +
        '<span class="pick-role">' + s.role + ' · ' + s.trait + '</span></span>' +
        '<span class="pick-mood' + (weak ? ' is-bad' : '') + '">心情 ' +
        Math.round(s.mood) + (weak ? ' 崩溃' : '') + '</span>' +
        '</button>';
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

  function startSearch(locId, partyIds) {
    if (searching) return;
    if (!partyIds || !partyIds.length) return;

    var loc = SF.findLocation(locId);
    if (!loc) return;

    var names = [];
    for (var i = 0; i < partyIds.length; i++) {
      var m = SF.find(state, partyIds[i]);
      if (m && m.alive) names.push(m.name);
    }
    if (!names.length) return;

    searching = true;

    openModal('<div class="modal-head">' +
      '<span class="modal-title">' + loc.name + '</span>' +
      '<span class="modal-sub">搜寻中……</span>' +
      '</div>' +
      '<div class="res-text">' + names.join('、') + ' 正在里面翻找，别出声。</div>',
      'modal-search');

    timer = window.setTimeout(function () {
      timer = 0;
      searching = false;
      lastReport = SF.explore(state, locId, partyIds);

      if (!SF.aliveAll(state).length) {
        state.over = true;
        state.overDay = state.day;
      }
      renderLog();
    }, C.explore.searchDelay);
  }

  /* 探险日志 */
  function renderLog() {
    var r = lastReport;
    if (!r || !r.location) return;

    var html = '<div class="modal-head">' +
      '<span class="modal-title">探险日志</span>' +
      '<span class="modal-sub">' + r.location.name + '</span>' +
      '</div>';

    for (var i = 0; i < r.lines.length; i++) {
      html += '<p class="log-line">' + r.lines[i] + '</p>';
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
      html += '<div class="modal-actions">' +
        '<button type="button" class="btn btn-main" data-act="back-home">带回避难所</button>' +
        '</div>';
    }

    openModal(html, 'modal-log');
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
    if (s.hunger >= C.night.hungerHurtAt) {
      html += '<div class="alert">饿得厉害，再吃不上东西就要掉血了。</div>';
    }
    if (s.thirst >= C.night.thirstHurtAt) {
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

  function onGearClick(ev) {
    var el = elementFrom(ev.target, $('gear'), 'data-item');
    if (!el) return;

    var key = el.getAttribute('data-item');
    if (key === 'radio') openBroadcast();
    else if (key === 'radioBroken') tryRepair();
    else if (key === 'pesticide') openPesticide();
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
    renderShelter();
    showScreen('screen-shelter');

    if (nightReport.allDead) {
      openGameOver();
    } else {
      openNight();
    }
  }

  /* ---------------- 晚餐分配 ---------------- */

  var dinner = null;

  function r2(v) {
    return Math.round(v * 100) / 100;
  }

  function openDinner() {
    if (!SF.aliveAll(state).length) return;

    dinner = {
      eat: {},
      drink: {},
      foodLeft: state.supplies.food || 0,
      waterLeft: state.supplies.water || 0
    };

    renderDinner();
  }

  function dinnerToggle(act, id) {
    if (!dinner) return;

    var s = SF.find(state, id);
    if (!s) return;

    var isEat = act === 'eat';
    var need = isEat ? SF.foodNeed(s) : SF.waterRation(state);
    var store = isEat ? dinner.eat : dinner.drink;
    var leftKey = isEat ? 'foodLeft' : 'waterLeft';

    if (store[id]) {
      delete store[id];
      dinner[leftKey] = r2(dinner[leftKey] + need);
    } else if (dinner[leftKey] >= need) {
      store[id] = true;
      dinner[leftKey] = r2(dinner[leftKey] - need);
    }

    renderDinner();
  }

  function dinnerAuto() {
    if (!dinner) return;

    var alive = SF.aliveAll(state);
    var waterR = SF.waterRation(state);
    var i;

    dinner.eat = {};
    dinner.drink = {};
    dinner.foodLeft = state.supplies.food || 0;
    dinner.waterLeft = state.supplies.water || 0;

    for (i = 0; i < alive.length; i++) {
      var n = SF.foodNeed(alive[i]);
      if (dinner.foodLeft >= n) {
        dinner.eat[alive[i].id] = true;
        dinner.foodLeft = r2(dinner.foodLeft - n);
      }
    }

    for (i = 0; i < alive.length; i++) {
      if (dinner.waterLeft >= waterR) {
        dinner.drink[alive[i].id] = true;
        dinner.waterLeft = r2(dinner.waterLeft - waterR);
      }
    }

    renderDinner();
  }

  function dinnerGo() {
    if (!dinner) return;

    var plan = { eat: dinner.eat, drink: dinner.drink };
    dinner = null;

    nightReport = SF.startNight(state, plan);
    closeModal();
    renderShelter();
    showScreen('screen-shelter');

    if (nightReport.event) {
      openNightEvent();
    } else {
      finishNight();
    }
  }

  function renderDinner() {
    var alive = SF.aliveAll(state);
    var waterR = SF.waterRation(state);
    var waterText = waterR === 0.5 ? '½' : String(waterR);

    var html = '<div class="modal-head">' +
      '<span class="modal-title">晚餐分配</span>' +
      '<span class="modal-sub">第 ' + state.day + ' 天</span>' +
      '</div>' +
      '<div class="dinner-left">食物 ' + r2(dinner.foodLeft) +
      ' · 水 ' + r2(dinner.waterLeft) + '</div>';

    for (var i = 0; i < alive.length; i++) {
      var s = alive[i];
      var foodNeed = SF.foodNeed(s);
      var isEat = !!dinner.eat[s.id];
      var isDrink = !!dinner.drink[s.id];

      var eatLabel = foodNeed > 1 ? '喂食(需' + foodNeed + '份)' : '喂食';
      var drinkLabel = waterR < 1 ? '喂水(½份)' : '喂水';

      var eatDisabled = !isEat && dinner.foodLeft < foodNeed;
      var drinkDisabled = !isDrink && dinner.waterLeft < waterR;

      html += '<div class="dinner-row">' +
        '<span class="dinner-name">' + s.name +
        '<span class="dinner-role">' + s.role + '</span></span>' +
        '<button type="button" class="dinner-btn' + (isEat ? ' is-on' : '') + '"' +
        (eatDisabled ? ' disabled' : '') +
        ' data-act="eat" data-id="' + s.id + '">' + eatLabel + '</button>' +
        '<button type="button" class="dinner-btn' + (isDrink ? ' is-on' : '') + '"' +
        (drinkDisabled ? ' disabled' : '') +
        ' data-act="drink" data-id="' + s.id + '">' + drinkLabel + '</button>' +
        '</div>';
    }

    html += '<div class="modal-actions">' +
      '<button type="button" class="btn" data-act="dinner-auto">平均分配</button>' +
      '<button type="button" class="btn btn-main" data-act="dinner-go">开饭</button>' +
      '</div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn" data-act="dinner-cancel">再等等</button>' +
      '</div>';

    openModal(html, 'modal-dinner');
  }

  function openNight() {
    var n = nightReport;

    var html = '<div class="modal-head">' +
      '<span class="modal-title">第 ' + n.day + ' 夜</span>' +
      '<span class="modal-sub">结算</span>' +
      '</div>';

    if (n.eventText) {
      html += '<div class="alert">' + n.eventText + '</div>';
    }

    html += '<div class="need-row">' + SF.icon('food', 15) +
      '<span>食物</span><span class="need-num">−' + n.foodUsed + '</span>' +
      '<span class="need-left">剩 ' + (state.supplies.food || 0) + '</span></div>';

    html += '<div class="need-row">' + SF.icon('water', 15) +
      '<span>水</span><span class="need-num">−' + n.waterUsed + '</span>' +
      '<span class="need-left">剩 ' + (state.supplies.water || 0) + '</span></div>';

    if (n.shortage) {
      html += '<div class="alert bad">有人没分到吃的或喝的，饿着睡了。</div>';
    }
    if (n.theft) {
      html += '<div class="alert bad">门没堵牢，夜里被偷了：食物 −' +
        n.theft.food + '，水 −' + n.theft.water + '。</div>';
    }

    html += '<div class="res-label">这一夜</div>';

    for (var i = 0; i < n.rows.length; i++) {
      var row = n.rows[i];
      var diff = Math.round(row.hpAfter) - Math.round(row.hpBefore);

      html += '<div class="np-row">' +
        '<span class="np-name">' + row.name + '</span>' +
        '<span class="np-tags">' +
        '<span class="tag ' + (row.fed ? 'tag-ok' : 'tag-bad') + '">' +
        (row.fed ? '吃了' : '没吃') + '</span>' +
        '<span class="tag ' + (row.drank ? 'tag-ok' : 'tag-bad') + '">' +
        (row.drank ? '喝了' : '没喝') + '</span>' +
        (row.sick ? '<span class="tag tag-bad">生病</span>' : '') +
        (row.injured ? '<span class="tag tag-bad">受伤</span>' : '') +
        (row.med ? '<span class="tag tag-ok">用药</span>' : '') +
        (diff !== 0 ? '<span class="tag ' + (diff > 0 ? 'tag-ok' : 'tag-bad') +
          '">血 ' + (diff > 0 ? '+' : '') + diff + '</span>' : '') +
        (row.died ? '<span class="tag tag-bad">倒下</span>' : '') +
        '</span></div>';
    }

    if (n.deaths.length) {
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
    } else if (act === 'eat' || act === 'drink') {
      dinnerToggle(act, id);
    } else if (act === 'equip') {
      SF.toggleGear(state, id, el.getAttribute('data-gear'));
      openEquipment(raidLoc, raidIds);
    } else if (act === 'depart') {
      depart();
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
      openEquipment(goLoc, ids);
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
    } else if (act === 'dinner-auto') {
      dinnerAuto();
    } else if (act === 'dinner-go') {
      dinnerGo();
    } else if (act === 'dinner-cancel') {
      dinner = null;
      closeModal();
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

    var s = SF.find(state, el.getAttribute('data-id'));
    if (!s || !s.alive) return;

    state.leaderId = s.id;
    renderShelter();
    openDetail(s.id);
  }

  function onMapClick(ev) {
    var el = elementFrom(ev.target, $('map-grid'), 'data-id');
    if (!el) return;
    openExplorerPicker(el.getAttribute('data-id'));
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
    if (!SF.anyAp(state)) return;

    closeModal();
    renderMap();
    showScreen('screen-map');
  }

  function onGoHome() {
    if (searching) return;
    closeModal();
    renderShelter();
    showScreen('screen-shelter');
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    state = SF.newGame();
    renderShelter();
    loadImages();

    $('btn-explore').addEventListener('click', onExplore);
    $('btn-status').addEventListener('click', openRoster);
    $('gear').addEventListener('click', onGearClick);
    $('btn-night').addEventListener('click', openDinner);
    $('btn-clean').addEventListener('click', openBath);
    $('btn-repair').addEventListener('click', function () { onHomeAction('repair'); });
    $('btn-talk').addEventListener('click', function () { onHomeAction('talk'); });
    $('btn-log').addEventListener('click', openLog);
    $('btn-go-home').addEventListener('click', onGoHome);
    $('people').addEventListener('click', onPeopleClick);
    $('scene').addEventListener('click', openRoster);
    $('map-grid').addEventListener('click', onMapClick);
    $('modal').addEventListener('click', onModalClick);

    showScreen('screen-shelter');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
