/*
 * 像素美术：地图图标、货架物资、幸存者小人。
 * 全部是代码画的静态 SVG 方块：没有图片文件、没有动画、没有 canvas。
 *
 * 想给小人加造型道具：往 WANDERER.gear 里加一条
 *   { x: 列, y: 行, rows: ['....', '....'] }
 * rows 里每个字符对应 PALETTES 里的颜色，'.' 是透明。
 * 角色网格是 24 列 × 32 行。
 */
window.SF = window.SF || {};

function drawGrid(rows, ox, oy, palette, scale, maxW, maxH) {
  var out = '';
  for (var y = 0; y < rows.length; y++) {
    var line = rows[y];
    for (var x = 0; x < line.length; x++) {
      var color = palette[line.charAt(x)];
      if (!color) continue;
      var px = (ox + x) * scale;
      var py = (oy + y) * scale;
      if (px >= maxW || py >= maxH) continue;
      out += '<rect x="' + px.toFixed(2) + '" y="' + py.toFixed(2) +
        '" width="' + (scale + 0.03).toFixed(2) +
        '" height="' + (scale + 0.03).toFixed(2) +
        '" fill="' + color + '"/>';
    }
  }
  return out;
}

function composeSvg(parts, palette, gridW, gridH, width) {
  var w = width || 32;
  var h = Math.round(w * gridH / gridW * 100) / 100;
  var scale = w / gridW;
  var out = '';

  for (var i = 0; i < parts.length; i++) {
    out += drawGrid(parts[i].rows, parts[i].x || 0, parts[i].y || 0, palette, scale, w, h);
  }

  return '<svg width="' + w + '" height="' + h +
    '" viewBox="0 0 ' + w + ' ' + h +
    '" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">' + out + '</svg>';
}

/* ================= 8×8 小图标（地图 / 弹窗用） ================= */

var ICONS = {
  food: {
    rows: [
      '.AAAAAA.',
      'ABBBBBBA',
      'ABBBBBBA',
      'ABBBBBBA',
      'ABBBBBBA',
      'ABBBBBBA',
      'ABBBBBBA',
      '.AAAAAA.'
    ],
    palette: { A: '#e8c56a', B: '#b3763a' }
  },
  water: {
    rows: [
      '...AA...',
      '..AAAA..',
      '..ABBA..',
      '..ABBA..',
      '..ABBA..',
      '..ABBA..',
      '..ABBA..',
      '..AAAA..'
    ],
    palette: { A: '#8fd0e6', B: '#357f9e' }
  },
  medicine: {
    rows: [
      '........',
      '.AAAAAA.',
      '.AABBAA.',
      '.BBBBBB.',
      '.BBBBBB.',
      '.AABBAA.',
      '.AAAAAA.',
      '........'
    ],
    palette: { A: '#dfe3df', B: '#4a4f4c' }
  },
  material: {
    rows: [
      '........',
      '.BBBBBB.',
      '.AAAAAA.',
      '........',
      '.AAAAAA.',
      '.BBBBBB.',
      '........',
      '........'
    ],
    palette: { A: '#a88456', B: '#c9a473' }
  },
  tree: {
    rows: [
      '...AA...',
      '..AAAA..',
      '.AAAAAA.',
      'AAAAAAAA',
      '.AAAAAA.',
      '...BB...',
      '...BB...',
      '..BBBB..'
    ],
    palette: { A: '#66a05a', B: '#6b5030' }
  },
  bowl: {
    rows: [
      '........',
      '........',
      '.AAAAAA.',
      '.BBBBBB.',
      '.BBBBBB.',
      '..AAAA..',
      '........',
      '........'
    ],
    palette: { A: '#e0c68c', B: '#9a7442' }
  },
  drop: {
    rows: [
      '........',
      '...AA...',
      '..AAAA..',
      '..AAAA..',
      '.AAAAAA.',
      '.AAAAAA.',
      '..AAAA..',
      '........'
    ],
    palette: { A: '#6fb6d8', B: '#3d7f9e' }
  },
  cloud: {
    rows: [
      '........',
      '...AA...',
      '..AAAA..',
      '.AAAAAA.',
      'AAAAAAA.',
      '.AAAAA..',
      '........',
      '........'
    ],
    palette: { A: '#9aa0a8', B: '#6f767f' }
  },
  radio: {
    rows: [
      '........',
      'A.......',
      'AA......',
      '.AAAAAA.',
      '.ABBBBA.',
      '.ABCBA..',
      '.AAAAAA.',
      '........'
    ],
    palette: { A: '#8a7248', B: '#2c2a22', C: '#d8c070' }
  },
  pesticide: {
    rows: [
      '........',
      '.....AA.',
      '....AAA.',
      '..AAAAA.',
      '..BBBB..',
      '.ABBBBA.',
      '.ABBBBA.',
      '..AAAA..'
    ],
    palette: { A: '#7fbf6a', B: '#d8e2c8' }
  },
  shop: {
    rows: [
      '............',
      '.AAAAAAAAAA.',
      '.ABABABABAB.',
      '.AAAAAAAAAA.',
      '..CCCCCCCC..',
      '..CDDDDDDC..',
      '..CDDDDDDC..',
      '..CCCCCCCC..'
    ],
    palette: { A: '#c8643f', B: '#f0e0c0', C: '#6b5236', D: '#33241a' }
  },
  hospital: {
    rows: [
      '............',
      '..WWWWWWWW..',
      '..WWWWWWWW..',
      '..WWWCCWWW..',
      '..WCCCCCCW..',
      '..WWWCCWWW..',
      '..WWWWWWWW..',
      '..WWWWWWWW..'
    ],
    palette: { W: '#d8dcd8', C: '#5a6b5a' }
  },
  warehouse: {
    rows: [
      '............',
      '...RRRRRR...',
      '..RRRRRRRR..',
      '.RRRRRRRRRR.',
      '..WWWWWWWW..',
      '..WWDDDDWW..',
      '..WWDDDDWW..',
      '..WWWWWWWW..'
    ],
    palette: { R: '#8a4a3a', W: '#7a6548', D: '#2e2218' }
  },
  house: {
    rows: [
      '............',
      '....AAAA....',
      '..AAAAAAAA..',
      '.AAAAAAAAAA.',
      '.BBBBBBBBBB.',
      '.BBBCCCCBBB.',
      '.BBBCCCCBBB.',
      '.BBBBBBBBBB.'
    ],
    palette: { A: '#8a908a', B: '#5a625a', C: '#2a2a24' }
  },
  cards: {
    rows: [
      '........',
      '.AA..BB.',
      '.AA..BB.',
      '.AA..BB.',
      '.AA..BB.',
      '.AA..BB.',
      '.AA..BB.',
      '........'
    ],
    palette: { A: '#e8e4d8', B: '#c8403a' }
  },
  flashlight: {
    rows: [
      '........',
      '..AAAA..',
      '..ABBA..',
      '..AAAA..',
      '.AAAAAA.',
      '.AAAAAA.',
      '..FFFF..',
      '...FF...'
    ],
    palette: { A: '#8a9090', B: '#d8c46a', F: '#f0dc8c' }
  },
  weapon: {
    rows: [
      '........',
      '......AA',
      '.....AA.',
      '....AA..',
      '...AA...',
      '..AA....',
      '.AA.....',
      'A.......'
    ],
    palette: { A: '#a08060' }
  },
  mask: {
    rows: [
      '........',
      '.AAAAAA.',
      '.ABBBBA.',
      '.ABBBBA.',
      '.ABBBBA.',
      '..AAAA..',
      '...AA...',
      '........'
    ],
    palette: { A: '#6f7f6a', B: '#3a4438' }
  }
};

SF.icon = function (name, size) {
  var def = ICONS[name] || ICONS.food;
  return composeSvg([{ rows: def.rows }], def.palette,
    def.rows[0].length, def.rows.length, size || 16);
};

/* ================= 货架上的物资 ================= */

var ITEMS = {
  food: {
    rows: [
      '............',
      '...MMMMMM...',
      '..MNLLLLNM..',
      '..MNLLLLNM..',
      '..MNLLLLNM..',
      '..MNLLLLNM..',
      '..MNLLLLNM..',
      '..MNLLLLNM..',
      '..MMMMMMMM..',
      '............'
    ],
    palette: { M: '#8a9090', N: '#b9c0c0', L: '#c9772f' }
  },
  water: {
    rows: [
      '............',
      '....kkkk....',
      '....kkkk....',
      '...BBBBBB...',
      '...BWWWWB...',
      '...BWWWWB...',
      '...BWWWWB...',
      '...BWWWWB...',
      '...BWWWWB...',
      '...BWWWWB...',
      '...BWWWWB...',
      '...BBBBBB...',
      '............'
    ],
    palette: { B: '#8fc4d4', W: '#2f7ea8', k: '#2a2a2a' }
  },
  medicine: {
    rows: [
      '............',
      '..WWWWWWWW..',
      '..WWWRRWWW..',
      '..WRRRRRRW..',
      '..WWWRRWWW..',
      '..WWWRRWWW..',
      '..WWWRRWWW..',
      '..WWWWWWWW..',
      '............'
    ],
    palette: { W: '#dfe3df', R: '#4a4f4c' }
  },
  material: {
    rows: [
      '............',
      '.AAAAAAAAAA.',
      '.BBBBBBBBBB.',
      '............',
      '.AAAAAAAAAA.',
      '.BBBBBBBBBB.',
      '............',
      '............'
    ],
    palette: { A: '#9a764a', B: '#7a5a34' }
  }
};

/* 支持用图片替换某个物资的图标（没有配图片就继续用代码画） */
var ITEM_IMAGES = {
  water: 'assets/item-water.png'
};

SF.itemSrc = {};

SF.itemImagePaths = [];
for (var _ik in ITEM_IMAGES) {
  if (ITEM_IMAGES.hasOwnProperty(_ik)) SF.itemImagePaths.push(ITEM_IMAGES[_ik]);
}

SF.itemSvg = function (key, width) {
  var w = width || 16;
  var path = ITEM_IMAGES[key];

  if (path) {
    var real = SF.itemSrc[path] || path;
    return '<img class="item-img" src="' + real + '" alt="" ' +
      'style="width:' + w + 'px;height:' + w + 'px">';
  }

  var def = ITEMS[key] || ITEMS.food;
  return composeSvg([{ rows: def.rows }], def.palette,
    def.rows[0].length, def.rows.length, w);
};

/* ================= 四个室友：纯 CSS 像素小人 ================= */
/*
 * 16 × 24 的像素格子，用 box-shadow 拼出来（不依赖任何图片/Emoji）。
 * 想改谁的样子，直接改对应 rows 里的字符。
 */
var CHAR_SPRITES = {
  // 陈默：黑发、黑框眼镜、蓝色格子衬衫
  chen: {
    palette: {
      h: '#1b1714', s: '#d2a072', S: '#a87b4e', g: '#0f0f0f', e: '#2a1a12',
      c: '#4f6f9a', C: '#3a5478', l: '#7f9fc8', t: '#3f4a5a', b: '#2a2320'
    },
    rows: [
      '................',
      '.....hhhhhh.....',
      '....hhhhhhhh....',
      '....hhhhhhhh....',
      '....hssssssh....',
      '....hssssssh....',
      '....hsgssgsh....',
      '....hssssssh....',
      '.....ssssss.....',
      '....cccccccc....',
      '...cccccccccc...',
      '..ccclccccclcc..',
      '..cccccccccccc..',
      '..ccclccccclcc..',
      '..cCccccccccCc..',
      '..sCccccccccCs..',
      '....tttttttt....',
      '....tttttttt....',
      '....ttt..ttt....',
      '....ttt..ttt....',
      '....ttt..ttt....',
      '...bbbb..bbbb...',
      '..bbbbb..bbbbb..',
      '................'
    ]
  },

  // 林晓：黑长直、灰长袖、黑眼圈
  lin: {
    palette: {
      h: '#1a1614', s: '#d8a878', S: '#a87b4e', e: '#241a12',
      c: '#8a9098', C: '#6f767e', t: '#3a4250', b: '#2a2320'
    },
    rows: [
      '................',
      '.....hhhhhh.....',
      '....hhhhhhhh....',
      '...hhhhhhhhhh...',
      '...hhhhhhhhhh...',
      '...hhsssssshh...',
      '...hhsesseshh...',
      '...hhsSsSsshh...',
      '....ssssssss....',
      '.....ssssss.....',
      '..hhcccccccchh..',
      '..hhcccccccchh..',
      '..hhcccccccchh..',
      '..hhcCcccccChh..',
      '..hhcccccccchh..',
      '..hhcccccccchh..',
      '...scccccccs....',
      '....cccccccc....',
      '....tttttttt....',
      '....tttttttt....',
      '....ttt..ttt....',
      '....ttt..ttt....',
      '...bbbb..bbbb...',
      '................'
    ]
  },

  // 铁柱：寸头、红色无袖背心、宽肩粗手臂
  tie: {
    palette: {
      h: '#2a2018', s: '#c98d5e', S: '#a06a40', e: '#241a12',
      c: '#b04438', C: '#8a2f28', t: '#4a4a44', b: '#2a2320'
    },
    rows: [
      '................',
      '.....hhhhhh.....',
      '....hhhhhhhh....',
      '....hhhhhhhh....',
      '....hhhhhhhh....',
      '....ssssssss....',
      '....sesssses....',
      '....ssssssss....',
      '.....ssssss.....',
      '..cccccccccccc..',
      '.sccccccccccccs.',
      '.sccccccccccccs.',
      '.sccccccccccccs.',
      '.sccccccccccccs.',
      '.ssccccccccccss.',
      '..cccccccccccc..',
      '..cccccccccccc..',
      '....tttttttt....',
      '....tttttttt....',
      '....ttt..ttt....',
      '....ttt..ttt....',
      '....ttt..ttt....',
      '...bbbb..bbbb...',
      '................'
    ]
  },

  // 娜娜：棕色长卷发、粉色外套、大眼睛 + 红唇 + 腮红
  nana: {
    palette: {
      h: '#7a4a28', s: '#e0b08c', S: '#b98a5e', e: '#3a2418', w: '#f0eee8',
      r: '#c8263a', p: '#e08a9a', c: '#d4789a', C: '#a85570', t: '#6b4a3a', b: '#2a2320'
    },
    rows: [
      '................',
      '.....hhhhhh.....',
      '....hhhhhhhh....',
      '...hhhhhhhhhh...',
      '..hhhhhhhhhhhh..',
      '...hhsssssshh...',
      '...hswesswesh...',
      '...hhspsspshh...',
      '...hhsrrrrhh....',
      '....ssssssss....',
      '..hhhhcccchhhh..',
      '..hhhhcccchhhh..',
      '..hhhhcccchhhh..',
      '..hhhhcCCchhhh..',
      '..hhhhcccchhhh..',
      '..hhhhcccchhhh..',
      '..hhhsccccshhh..',
      '.....cccccc.....',
      '....cccccccc....',
      '....cccccccc....',
      '....cccccccc....',
      '....tttttttt....',
      '....ssss.ssss...',
      '...bbbb..bbbb...'
    ]
  }
};

function figureShadow(spr, unit) {
  var colors = [];

  for (var y = 0; y < spr.rows.length; y++) {
    var line = spr.rows[y];
    for (var x = 0; x < line.length; x++) {
      var color = spr.palette[line.charAt(x)];
      if (!color) continue;
      colors.push((x * unit) + 'px ' + (y * unit) + 'px 0 0 ' + color);
    }
  }

  return colors.join(', ') || 'none';
}

SF.figureHtml = function (style, targetWidth) {
  var spr = CHAR_SPRITES[style] || CHAR_SPRITES.chen;
  var cols = spr.rows[0].length;
  var unit = Math.max(2, Math.round((targetWidth || 48) / cols));
  var shadow = figureShadow(spr, unit);
  var w = cols * unit;
  var h = spr.rows.length * unit;

  return '<span class="px-figure" style="width:' + w + 'px;height:' + h + 'px">' +
    '<i style="width:' + unit + 'px;height:' + unit + 'px;box-shadow:' + shadow + '"></i>' +
    '</span>';
};

var WANDERER = {
  w: 24,
  h: 32,

  // 乱发、护目镜、胡茬、打补丁的大衣、手、破裤、厚靴
  base: [
    '........................',
    '........hhhhhhhh........',
    '.......hhhhhhhhhh.......',
    '......hhhhhhhhhhhh......',
    '.....hhhhhhhhhhhhhh.....',
    '.....hhhsssssssshhh.....',
    '.....hhsssssssssshh.....',
    '.....hssssssssssssh.....',
    '.....hsseessssseessh....',
    '.....hsssssSSsssssh.....',
    '.....hsssbbbbbbsssh.....',
    '......ssssssssssss......',
    '.......ssssssssss.......',
    '.....rrrrrrrrrrrrrr.....',
    '....rrrrRRrrrrRRrrrr....',
    '...cccccccccccccccccc...',
    '..cccccccccccccccccccc..',
    '..cCccccccccccccccccCc..',
    '..cCcccpppccccccccccCc..',
    '..cCcccppcccccccccccCc..',
    '..cCccccccccccccccccCc..',
    '..cCccccccccccccccccCc..',
    '..kkkkkkkkkkkkkkkkkkkk..',
    '.sCccccccccccccccccccCs.',
    '..cCCccccccccccccccCCc..',
    '.....tttttttttttttt.....',
    '.....tttttttttttttt.....',
    '.....ttttt....ttttt.....',
    '.....ttttt....ttttt.....',
    '.....TTTTT....TTTTT.....',
    '.....ooooo....ooooo.....',
    '....oooooo....oooooo....'
  ],

  // 造型道具层：以后加帽子、背包、面具，直接在这里加一条
  gear: [
    {
      x: 0, y: 6,
      rows: [
        '.....kkkkkkkkkkkkkk.....',
        '......gggghhhhgggg......',
        '......GGGGhhhhGGGG......'
      ]
    },
    { x: 18, y: 15, rows: ['k', 'k', 'k', 'k', 'k', 'k', 'k'] },
    {
      x: 13, y: 20,
      rows: [
        'aaaaaa',
        'aAAAAa',
        'aaaaaa'
      ]
    }
  ]
};

var PALETTES = [  {
    h: '#33241a', s: '#d2a072', S: '#a87b4e', e: '#241a12', b: '#8a6448',
    r: '#a8483a', R: '#7a3025', c: '#5c6b4e', C: '#3f4a35', p: '#a4653a',
    k: '#2a2018', m: '#b9a878', t: '#464d50', T: '#32383b',
    o: '#3a2b20', g: '#5f8a8f', G: '#b3d5d2', a: '#6b5236', A: '#493623'
  },
  {
    h: '#2c2118', s: '#c08a5a', S: '#9a6a40', e: '#1e1710', b: '#7a5638',
    r: '#5f7f8c', R: '#41606b', c: '#6b5236', C: '#4b3a26', p: '#8a5a3a',
    k: '#241b14', m: '#a89a72', t: '#4a4238', T: '#332d26',
    o: '#2f261d', g: '#728d90', G: '#b6d2cf', a: '#5a432c', A: '#3d2d1e'
  },
  {
    h: '#1e1a16', s: '#d8a878', S: '#b08154', e: '#1a1510', b: '#96684a',
    r: '#b08a3a', R: '#856426', c: '#3f4a5c', C: '#2b333f', p: '#8f6a3c',
    k: '#221d18', m: '#b0a988', t: '#3c4048', T: '#2a2d33',
    o: '#332a22', g: '#6a8288', G: '#a4c2c4', a: '#5c4a30', A: '#3e3120'
  },
  {
    h: '#33251b', s: '#b98a5e', S: '#93683f', e: '#20170f', b: '#7d5a3c',
    r: '#8a9094', R: '#63696d', c: '#7a4a3c', C: '#57332a', p: '#a4744a',
    k: '#261c15', m: '#b3a27c', t: '#4a4238', T: '#342e27',
    o: '#3a2b20', g: '#78908f', G: '#b2cdc9', a: '#6d5534', A: '#4a3923'
  },
  {
    h: '#2e241b', s: '#cc9a68', S: '#a87b4e', e: '#221a12', b: '#8a6448',
    r: '#7a3a30', R: '#57261f', c: '#4f5a4a', C: '#38402f', p: '#8a6a3a',
    k: '#241d16', m: '#b5a982', t: '#41453f', T: '#2e322c',
    o: '#33291f', g: '#6f8a8c', G: '#a9c9c6', a: '#5f4a30', A: '#41321f'
  },
  {
    h: '#3a2b1e', s: '#e0b48c', S: '#bb8f63', e: '#241a12', b: '#a07a55',
    r: '#5c6b4e', R: '#414c37', c: '#8a7048', C: '#655033', p: '#a4552f',
    k: '#2a2016', m: '#c0b28a', t: '#4a4a44', T: '#34342f',
    o: '#3a2d22', g: '#75908f', G: '#aecac6', a: '#6b5836', A: '#4a3d24'
  }
];

// 蹲坐版：整个上半身往下沉 4 行，腿收起来
WANDERER.crouch = (function () {
  var rows = [];
  var blank = '........................';
  var i;

  for (i = 0; i < 4; i++) rows.push(blank);
  for (i = 0; i < 25; i++) rows.push(WANDERER.base[i]);
  rows.push('....ttttt......ttttt....');
  rows.push('...TTTTTT......TTTTTT...');
  rows.push('..ooooooo......ooooooo..');

  return rows;
})();

// 不同角色的造型叠加（形状标在 24×32 的网格上）
var STYLE_LAYERS = {
  chen: [
    { x: 7, y: 8, rows: ['kkkkkkkkkk'] }
  ],
  lin: [
    { x: 8, y: 9, rows: ['SS......SS'] },
    { x: 3, y: 11, rows: ['hh', 'hh', 'hh', 'hh', 'hh', 'hh'] },
    { x: 19, y: 11, rows: ['hh', 'hh', 'hh', 'hh', 'hh', 'hh'] }
  ],
  tie: [
    { x: 9, y: 16, rows: ['ssssss', 'ssssss', 'ssssss', 'ssssss', 'ssssss', 'ssssss'] }
  ],
  nana: [
    { x: 3, y: 10, rows: ['hhrr', 'hhrr', 'hhrr', 'hhrr', 'hh..', 'hh..'] },
    { x: 17, y: 10, rows: ['rrhh', 'rrhh', 'rrhh', 'rrhh', '..hh', '..hh'] },
    { x: 9, y: 9, rows: ['rrrr'] }
  ]
};

var STYLE_PALETTE = {
  chen: 0,
  lin: 1,
  tie: 2,
  nana: 3
};

SF.personSvg = function (style, width, crouch) {
  var key = STYLE_PALETTE[style] === undefined ? 0 : STYLE_PALETTE[style];
  var p = PALETTES[key];
  var parts = [{ rows: crouch ? WANDERER.crouch : WANDERER.base }];
  var offY = crouch ? 4 : 0;
  var i;

  for (i = 0; i < WANDERER.gear.length; i++) {
    parts.push({
      x: WANDERER.gear[i].x,
      y: WANDERER.gear[i].y + offY,
      rows: WANDERER.gear[i].rows
    });
  }

  var extra = STYLE_LAYERS[style] || [];
  for (i = 0; i < extra.length; i++) {
    parts.push({
      x: extra[i].x,
      y: extra[i].y + offY,
      rows: extra[i].rows
    });
  }

  return composeSvg(parts, p, WANDERER.w, WANDERER.h, width || 56);
};
