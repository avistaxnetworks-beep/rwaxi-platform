// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
export const RENDER_W = 960;

export const RENDER_H = 600;

export const renderCache = {};

export function rng(e) {
  let a = 0;
  for (let t = 0; t < e.length; t++) a = (a * 31 + e.charCodeAt(t)) >>> 0;
  return () => ((a ^= a << 13), (a >>>= 0), (a ^= a >> 17), (a ^= a << 5), (a >>>= 0), a / 4294967296);
}

export function lin(e, a, t, o, n, l) {
  const r = e.createLinearGradient(a, t, o, n);
  return l.forEach(([i, s]) => r.addColorStop(i, s)), r;
}

export function rect(e, a, t, o, n, l) {
  (e.fillStyle = l), e.fillRect(a, t, o, n);
}

export function poly(e, a, t) {
  e.beginPath(),
    e.moveTo(a[0][0], a[0][1]),
    a.slice(1).forEach((o) => e.lineTo(o[0], o[1])),
    e.closePath(),
    (e.fillStyle = t),
    e.fill();
}

export function vignette(e) {
  const a = e.createRadialGradient(480, 300, 210, 480, 300, 720);
  a.addColorStop(0, "rgba(0,0,0,0)"),
    a.addColorStop(1, "rgba(10,4,24,0.28)"),
    (e.fillStyle = a),
    e.fillRect(0, 0, 960, 600);
}

export function sky(e, a, t, o) {
  rect(
    e,
    0,
    0,
    960,
    o,
    lin(e, 0, 0, 0, o, [
      [0, a],
      [1, t],
    ]),
  );
}

export function sun(e, a, t, o, n) {
  const l = e.createRadialGradient(a, t, 0, a, t, o);
  l.addColorStop(0, n),
    l.addColorStop(1, "rgba(255,255,255,0)"),
    (e.fillStyle = l),
    e.fillRect(a - o, t - o, o * 2, o * 2);
}

export function palm(e, a, t, o, n, l) {
  (e.strokeStyle = "#5b4630"),
    (e.lineWidth = 7),
    (e.lineCap = "round"),
    e.beginPath(),
    e.moveTo(a, t),
    e.quadraticCurveTo(a + n * 0.3, t - o * 0.6, a + n, t - o),
    e.stroke();
  const r = a + n,
    i = t - o;
  (e.strokeStyle = "#2f6b3e"), (e.lineWidth = 5);
  for (let s = 0; s < 8; s++) {
    const c = (s / 8) * Math.PI * 2 + l * 0.5,
      d = 60 + 20 * Math.sin(s * 1.7);
    e.beginPath(),
      e.moveTo(r, i),
      e.quadraticCurveTo(
        r + Math.cos(c) * d * 0.6,
        i + Math.sin(c) * d * 0.3 - 20,
        r + Math.cos(c) * d,
        i + Math.abs(Math.sin(c)) * 28 + 6,
      ),
      e.stroke();
  }
}

export function tree(e, a, t, o, n) {
  rect(e, a - 2, t - o * 0.5, 4, o * 0.5, "#4b3b2a"),
    (e.fillStyle = n),
    e.beginPath(),
    e.arc(a, t - o * 0.7, o * 0.45, 0, Math.PI * 2),
    e.fill(),
    (e.fillStyle = "rgba(255,255,255,0.12)"),
    e.beginPath(),
    e.arc(a - o * 0.15, t - o * 0.85, o * 0.2, 0, Math.PI * 2),
    e.fill();
}

export function windowsGrid(e, a, t, o, n, l, r, i, s, c) {
  const d = o / l,
    p = n / r;
  for (let m = 0; m < l; m++)
    for (let u = 0; u < r; u++) {
      const v = s();
      (e.fillStyle = c && v > 0.82 ? "rgba(255,214,150,0.85)" : i(v, m, u)),
        e.fillRect(a + m * d + 1.5, t + u * p + 1.5, d - 3, p - 3);
    }
}

export function facadeResort(e, a) {
  sky(e, "#7fbcd8", "#f4e3c4", 300),
    sun(e, 760, 150, 220, "rgba(255,236,190,0.9)"),
    rect(
      e,
      0,
      300,
      960,
      70,
      lin(e, 0, 300, 0, 370, [
        [0, "#2b8db0"],
        [1, "#5cc3d4"],
      ]),
    );
  for (let n = 0; n < 14; n++) rect(e, a() * 960, 308 + a() * 55, 40 + a() * 80, 2, "rgba(255,255,255,0.35)");
  rect(
    e,
    0,
    370,
    960,
    600,
    lin(e, 0, 370, 0, 600, [
      [0, "#ecdcb8"],
      [1, "#d9c093"],
    ]),
  ),
    [
      [60, 250, 250, 140],
      [360, 230, 280, 160],
      [690, 255, 230, 130],
    ].forEach(([n, l, r, i]) => {
      const s = 370 + i - (370 - l) - 10;
      poly(
        e,
        [
          [n + 10, s + i],
          [n + r + 40, s + i],
          [n + r + 70, s + i + 18],
          [n + 30, s + i + 18],
        ],
        "rgba(90,70,40,0.25)",
      ),
        rect(e, n, s, r, i, "#f7f4ee"),
        rect(e, n - 14, s - 12, r + 28, 14, "#e9e3d8"),
        rect(
          e,
          n + 14,
          s + 24,
          r - 28,
          i * 0.48,
          lin(e, 0, s + 24, 0, s + 24 + i * 0.48, [
            [0, "#2b4e63"],
            [1, "#4b8aa2"],
          ]),
        );
      for (let c = n + 20; c < n + r - 14; c += 22) rect(e, c, s + 24, 3, i * 0.48, "rgba(247,244,238,0.9)");
      for (let c = n + 8; c < n + r - 8; c += 9) rect(e, c, s + i * 0.78, 5, i * 0.22, "#a87a4f");
    }),
    palm(e, 330, 520, 230, 30, 1),
    palm(e, 655, 540, 260, -40, 2),
    palm(e, 900, 560, 210, -20, 3),
    palm(e, 30, 560, 190, 25, 4),
    vignette(e);
}

export function facadeTower(e, a) {
  rect(e, 0, 0, 960, 600, "#8f8a82"),
    sky(e, "#8fb2cf", "#e7edf2", 430),
    poly(
      e,
      [
        [0, 330],
        [120, 250],
        [260, 300],
        [380, 220],
        [520, 290],
        [700, 210],
        [860, 270],
        [960, 240],
        [960, 430],
        [0, 430],
      ],
      "#6e8a78",
    ),
    poly(
      e,
      [
        [0, 370],
        [180, 320],
        [340, 360],
        [560, 310],
        [760, 350],
        [960, 320],
        [960, 430],
        [0, 430],
      ],
      "#587463",
    ),
    [
      [40, 300, 120],
      [170, 340, 90],
      [760, 320, 110],
      [870, 350, 80],
    ].forEach(([i, s, c]) => {
      rect(e, i, s, c, 430 - s, "#b9c3cc"),
        windowsGrid(
          e,
          i + 6,
          s + 8,
          c - 12,
          430 - s - 16,
          Math.round(c / 18),
          Math.round((430 - s) / 16),
          (d) => `rgba(70,90,110,${0.35 + d * 0.3})`,
          a,
        );
    });
  const o = 330,
    n = 250,
    l = 120,
    r = 40;
  rect(
    e,
    o,
    r,
    n,
    430 - r + 40,
    lin(e, o, 0, o + n, 0, [
      [0, "#5d7f9c"],
      [0.5, "#a9c6dc"],
      [1, "#6f90ab"],
    ]),
  ),
    windowsGrid(
      e,
      o + 4,
      r + 6,
      n - 8,
      430 - r + 30,
      10,
      34,
      (i, s) => `rgba(${30 + s * 4},${55 + s * 3},${85 + s * 2},${0.25 + i * 0.25})`,
      a,
    ),
    poly(
      e,
      [
        [o + n, r],
        [o + n + l, r + 26],
        [o + n + l, 470],
        [o + n, 470],
      ],
      lin(e, o + n, 0, o + n + l, 0, [
        [0, "#3a5670"],
        [1, "#2a4258"],
      ]),
    );
  for (let i = 0; i < 34; i++)
    (e.strokeStyle = "rgba(255,255,255,0.12)"),
      e.beginPath(),
      e.moveTo(o + n, r + 12 + i * 13.5),
      e.lineTo(o + n + l, r + 34 + i * 13.2),
      e.stroke();
  rect(e, o - 6, r - 14, n + 12, 16, "#2f3e4c"),
    rect(e, 0, 470, 960, 600, "#8f8a82"),
    rect(e, 0, 500, 960, 60, "#4a4a4e");
  for (let i = 0; i < 960; i += 70) rect(e, i, 528, 36, 4, "#e8e2d4");
  for (let i = 20; i < 960; i += 85) tree(e, i, 498, 60, i % 2 ? "#3f6f4a" : "#4d7d55");
  rect(e, 0, 560, 960, 600, "#b7b1a6"), vignette(e);
}

export function facadeSuites(e, a) {
  rect(e, 0, 0, 960, 600, "#7f9a6b"),
    sky(e, "#f0b98a", "#f7e6cf", 380),
    sun(e, 180, 300, 200, "rgba(255,210,150,0.8)"),
    poly(
      e,
      [
        [0, 300],
        [200, 230],
        [420, 280],
        [640, 210],
        [960, 260],
        [960, 380],
        [0, 380],
      ],
      "#7f9a6b",
    );
  for (let s = 0; s < 70; s++) {
    const c = a() * 960,
      d = 260 + a() * 110;
    rect(e, c, d, 8 + a() * 10, 6 + a() * 6, a() > 0.5 ? "#d9b48f" : "#efe5d6");
  }
  const o = 260,
    n = 440,
    l = 9,
    r = 34,
    i = 500 - l * r;
  rect(e, o, i, n, l * r, "#e9e2d6");
  for (let s = 0; s < l; s++) {
    const c = i + s * r;
    rect(
      e,
      o + 10,
      c + 6,
      n - 20,
      r - 12,
      lin(e, 0, c, 0, c + r, [
        [0, "#41566a"],
        [1, "#6f8ea6"],
      ]),
    );
    for (let d = o + 10; d < o + n - 10; d += 55) rect(e, d, c + 6, 3, r - 12, "#e9e2d6");
    rect(e, o - 14, c + r - 6, n + 28, 6, "#faf7f2");
    for (let d = o; d < o + n; d += 26)
      a() > 0.45 &&
        ((e.fillStyle = a() > 0.5 ? "#4f7d45" : "#6a9a55"),
        e.beginPath(),
        e.arc(d + 8, c + r - 9, 7, 0, Math.PI * 2),
        e.fill());
  }
  rect(e, o + n * 0.62, i - 30, n * 0.3, 30, "#d8cfc0"),
    rect(
      e,
      0,
      500,
      960,
      600,
      lin(e, 0, 500, 0, 600, [
        [0, "#9c958a"],
        [1, "#7e786e"],
      ]),
    );
  for (let s = 30; s < 960; s += 110) tree(e, s, 530, 80, "#4b7b47");
  vignette(e);
}

export function interior(e, a, t) {
  const o = {
    resort: {
      wall: "#efe6d8",
      floor: ["#c79f74", "#a77f57"],
      view: ["#76bad6", "#e9d9b6"],
      sofa: "#e7e0d3",
      accent: "#2b8db0",
    },
    tower: {
      wall: "#e4e2df",
      floor: ["#9a8f86", "#7b716a"],
      view: ["#9fb9cf", "#e1e8ee"],
      sofa: "#3c3a48",
      accent: "#B77A1E",
    },
    suites: {
      wall: "#f1ebe2",
      floor: ["#b9906a", "#94704f"],
      view: ["#efb789", "#f6e3cc"],
      sofa: "#cbbba5",
      accent: "#4f7d45",
    },
  }[t];
  rect(e, 0, 0, 960, 600, o.wall);
  const n = 170,
    l = 70,
    r = 620,
    i = 300;
  if (
    (rect(
      e,
      n,
      l,
      r,
      i,
      lin(e, 0, l, 0, l + i, [
        [0, o.view[0]],
        [1, o.view[1]],
      ]),
    ),
    t === "resort" &&
      rect(
        e,
        n,
        l + i * 0.62,
        r,
        i * 0.38,
        lin(e, 0, l + i * 0.62, 0, l + i, [
          [0, "#2b8db0"],
          [1, "#6fcbd8"],
        ]),
      ),
    t === "tower")
  )
    for (let s = 0; s < 9; s++) {
      const c = 60 + a() * 150;
      rect(e, n + 20 + s * 66, l + i - c, 46, c, `rgba(80,100,125,${0.35 + a() * 0.3})`);
    }
  t === "suites" &&
    poly(
      e,
      [
        [n, l + i * 0.6],
        [n + 200, l + i * 0.45],
        [n + 420, l + i * 0.55],
        [n + r, l + i * 0.42],
        [n + r, l + i],
        [n, l + i],
      ],
      "#7f9a6b",
    );
  for (let s = 1; s < 4; s++) rect(e, n + (r / 4) * s - 3, l, 6, i, "#2c2a30");
  (e.strokeStyle = "#2c2a30"),
    (e.lineWidth = 8),
    e.strokeRect(n, l, r, i),
    poly(
      e,
      [
        [0, 430],
        [960, 430],
        [960, 600],
        [0, 600],
      ],
      lin(e, 0, 430, 0, 600, [
        [0, o.floor[0]],
        [1, o.floor[1]],
      ]),
    ),
    (e.strokeStyle = "rgba(0,0,0,0.08)"),
    (e.lineWidth = 2);
  for (let s = -8; s < 16; s++)
    e.beginPath(), e.moveTo(960 / 2 + s * 22, 430), e.lineTo(960 / 2 + s * 120, 600), e.stroke();
  poly(
    e,
    [
      [0, 370],
      [170, 370],
      [170, 430],
      [0, 430],
    ],
    "rgba(0,0,0,0.03)",
  ),
    (e.fillStyle = "rgba(255,255,255,0.18)"),
    poly(
      e,
      [
        [n + 40, 430],
        [n + r - 40, 430],
        [n + r + 120, 600],
        [n - 120, 600],
      ],
      "rgba(255,255,255,0.14)",
    ),
    rect(e, 250, 500, 460, 60, "rgba(0,0,0,0.12)"),
    rect(e, 250, 420, 460, 80, o.sofa),
    rect(e, 250, 390, 460, 40, o.sofa),
    rect(e, 250, 390, 460, 6, "rgba(255,255,255,0.18)"),
    rect(e, 290, 405, 90, 50, o.accent),
    rect(e, 580, 405, 90, 50, "#f5f1ea"),
    rect(e, 380, 520, 200, 16, "#2c2a30"),
    rect(e, 395, 536, 6, 30, "#2c2a30"),
    rect(e, 560, 536, 6, 30, "#2c2a30"),
    rect(e, 820, 200, 4, 230, "#2c2a30"),
    (e.fillStyle = "#f2e2c0"),
    poly(
      e,
      [
        [790, 200],
        [854, 200],
        [840, 160],
        [804, 160],
      ],
      "#efe1c2",
    ),
    tree(e, 100, 470, 120, "#4d7d55"),
    rect(e, 76, 440, 48, 40, "#d8cfc0"),
    vignette(e);
}

export function commonResort(e, a) {
  sky(e, "#86c3dc", "#f3e3c2", 260),
    rect(
      e,
      0,
      230,
      960,
      50,
      lin(e, 0, 230, 0, 280, [
        [0, "#2b8db0"],
        [1, "#58bfd2"],
      ]),
    ),
    poly(
      e,
      [
        [0, 280],
        [960, 280],
        [960, 420],
        [0, 470],
      ],
      lin(e, 0, 280, 0, 470, [
        [0, "#3fb5cf"],
        [1, "#1f86a8"],
      ]),
    );
  for (let t = 0; t < 26; t++)
    rect(e, a() * 960, 300 + a() * 140, 50 + a() * 90, 3, "rgba(255,255,255,0.35)");
  rect(e, 0, 276, 960, 6, "#f4efe6"),
    poly(
      e,
      [
        [0, 470],
        [960, 420],
        [960, 600],
        [0, 600],
      ],
      "#d9c6a4",
    ),
    [
      [120, 500],
      [330, 480],
      [540, 462],
      [750, 446],
    ].forEach(([t, o]) => {
      poly(
        e,
        [
          [t, o],
          [t + 130, o - 12],
          [t + 150, o + 10],
          [t + 18, o + 24],
        ],
        "#f6f2ea",
      ),
        poly(
          e,
          [
            [t, o],
            [t + 34, o - 46],
            [t + 50, o - 40],
            [t + 18, o + 6],
          ],
          "#ece5d8",
        ),
        (e.fillStyle = "#B77A1E"),
        e.beginPath(),
        e.ellipse(t + 90, o - 120, 70, 18, -0.08, 0, Math.PI * 2),
        e.fill(),
        rect(e, t + 88, o - 120, 4, 110, "#6b5640");
    }),
    palm(e, 900, 560, 300, -50, 5),
    palm(e, 40, 600, 280, 40, 6),
    vignette(e);
}

export function commonTower(e, a) {
  rect(e, 0, 0, 960, 600, "#e9e5df"), rect(e, 0, 0, 960, 80, "#d9d3ca");
  for (let t = 0; t < 6; t++)
    rect(
      e,
      60 + t * 150,
      80,
      110,
      330,
      lin(e, 0, 80, 0, 410, [
        [0, "#a9c0d3"],
        [1, "#e1e7ec"],
      ]),
    );
  for (let t = 0; t < 7; t++) rect(e, 50 + t * 150, 80, 10, 330, "#2c2a30");
  rect(e, 0, 410, 960, 10, "#2c2a30"),
    poly(
      e,
      [
        [0, 420],
        [960, 420],
        [960, 600],
        [0, 600],
      ],
      lin(e, 0, 420, 0, 600, [
        [0, "#cfc9c0"],
        [1, "#a9a299"],
      ]),
    ),
    (e.strokeStyle = "rgba(0,0,0,0.07)");
  for (let t = -10; t < 20; t++)
    e.beginPath(), e.moveTo(480 + t * 30, 420), e.lineTo(480 + t * 140, 600), e.stroke();
  rect(e, 300, 400, 360, 90, "#2F145F"),
    rect(e, 300, 400, 360, 8, "#B77A1E"),
    rect(e, 290, 490, 380, 14, "rgba(0,0,0,0.15)"),
    (e.fillStyle = "#f2e2c0");
  for (let t = 0; t < 5; t++) e.beginPath(), e.arc(200 + t * 140, 40, 14, 0, Math.PI * 2), e.fill();
  tree(e, 110, 520, 150, "#3f6f4a"),
    tree(e, 860, 520, 150, "#3f6f4a"),
    rect(e, 86, 480, 48, 50, "#3c3a48"),
    rect(e, 836, 480, 48, 50, "#3c3a48"),
    vignette(e);
}

export function commonSuites(e, a) {
  rect(e, 0, 0, 960, 600, "#8c6c50"),
    rect(
      e,
      0,
      290,
      960,
      90,
      lin(e, 0, 290, 0, 380, [
        [0, "#3a2c4e"],
        [1, "#1f1a36"],
      ]),
    ),
    sky(e, "#2f2a55", "#d98a5e", 300);
  for (let t = 0; t < 260; t++) {
    const o = a() * 960,
      n = 250 + a() * 120;
    rect(e, o, n, 2 + a() * 2, 2, a() > 0.3 ? "rgba(255,214,150,0.9)" : "rgba(196,181,253,0.8)");
  }
  poly(
    e,
    [
      [0, 300],
      [240, 250],
      [520, 290],
      [760, 240],
      [960, 280],
      [960, 250],
      [0, 250],
    ],
    "rgba(40,30,70,0.6)",
  ),
    rect(e, 0, 370, 960, 10, "#d8cfc0");
  for (let t = 0; t < 960; t += 40) rect(e, t, 330, 3, 40, "rgba(255,255,255,0.4)");
  rect(e, 0, 330, 960, 3, "rgba(255,255,255,0.5)"),
    rect(e, 0, 380, 960, 90, "#a3876a"),
    poly(
      e,
      [
        [120, 380],
        [840, 380],
        [900, 470],
        [60, 470],
      ],
      lin(e, 0, 380, 0, 470, [
        [0, "#3aa8c4"],
        [1, "#24B8D7"],
      ]),
    );
  for (let t = 0; t < 14; t++)
    rect(e, 140 + a() * 640, 395 + a() * 60, 40 + a() * 60, 2, "rgba(255,255,255,0.4)");
  poly(
    e,
    [
      [0, 470],
      [960, 470],
      [960, 600],
      [0, 600],
    ],
    "#8c6c50",
  );
  for (let t = 0; t < 960; t += 24) rect(e, t, 470, 2, 130, "rgba(0,0,0,0.12)");
  [
    [150, 520],
    [420, 530],
    [700, 520],
  ].forEach(([t, o]) => {
    rect(e, t, o, 120, 26, "#efe7da"), rect(e, t, o - 26, 26, 30, "#efe7da");
  });
  for (let t = 0; t < 6; t++)
    (e.fillStyle = "rgba(255,214,150,0.9)"),
      e.beginPath(),
      e.arc(80 + t * 160, 490, 5, 0, Math.PI * 2),
      e.fill();
  vignette(e);
}

export function locationMap(e, a, t) {
  rect(e, 0, 0, 960, 600, "#eef0ec"),
    t.render === "resort" &&
      poly(
        e,
        [
          [0, 0],
          [380, 0],
          [330, 120],
          [360, 260],
          [300, 400],
          [330, 600],
          [0, 600],
        ],
        "#a9d8e6",
      ),
    t.render === "suites" &&
      ((e.strokeStyle = "#a9d8e6"),
      (e.lineWidth = 26),
      e.beginPath(),
      e.moveTo(120, 0),
      e.bezierCurveTo(260, 200, 140, 380, 300, 600),
      e.stroke()),
    (e.fillStyle = "#cfe3c4"),
    e.beginPath(),
    e.ellipse(720, 140, 120, 70, 0.3, 0, Math.PI * 2),
    e.fill(),
    e.beginPath(),
    e.ellipse(800, 480, 90, 60, -0.2, 0, Math.PI * 2),
    e.fill();
  const o = t.render === "resort" ? 380 : 40;
  for (let r = o; r < 960; r += 64)
    for (let i = 20; i < 600; i += 54)
      a() > 0.12 && rect(e, r + 6, i + 6, 52, 42, a() > 0.85 ? "#e2ded3" : "#ffffff");
  (e.strokeStyle = "#ffffff"),
    (e.lineWidth = 16),
    e.beginPath(),
    e.moveTo(o, 330),
    e.lineTo(960, 270),
    e.stroke(),
    e.beginPath(),
    e.moveTo(560, 0),
    e.lineTo(620, 600),
    e.stroke(),
    (e.strokeStyle = "#f2c38a"),
    (e.lineWidth = 6),
    e.beginPath(),
    e.moveTo(o, 330),
    e.lineTo(960, 270),
    e.stroke(),
    e.beginPath(),
    e.moveTo(560, 0),
    e.lineTo(620, 600),
    e.stroke();
  const n = 590,
    l = 300;
  (e.fillStyle = "rgba(36,184,215,0.18)"),
    e.beginPath(),
    e.arc(n, l, 90, 0, Math.PI * 2),
    e.fill(),
    (e.strokeStyle = "#24B8D7"),
    (e.lineWidth = 2),
    e.setLineDash([6, 6]),
    e.beginPath(),
    e.arc(n, l, 90, 0, Math.PI * 2),
    e.stroke(),
    e.setLineDash([]),
    (e.fillStyle = "#2F145F"),
    e.beginPath(),
    e.arc(n, l - 34, 22, Math.PI, 0),
    e.lineTo(n, l),
    e.closePath(),
    e.fill(),
    (e.fillStyle = "#ffffff"),
    e.beginPath(),
    e.arc(n, l - 36, 8, 0, Math.PI * 2),
    e.fill(),
    rect(e, 40, 500, 330, 70, "#ffffff"),
    (e.fillStyle = "#2F145F"),
    (e.font = "600 26px 'Cormorant Garamond', Georgia, serif"),
    e.fillText(t.asset, 58, 530),
    (e.fillStyle = "#5E5873"),
    (e.font = "500 14px 'IBM Plex Mono', monospace"),
    e.fillText(`${t.region.toUpperCase()} · ${t.city.toUpperCase()}`, 58, 554),
    rect(e, 800, 560, 120, 4, "#2A2238"),
    (e.fillStyle = "#2A2238"),
    (e.font = "500 12px 'IBM Plex Mono', monospace"),
    e.fillText("500 m", 842, 552);
}

export const SHOTS = ["Fachada", "Interior", "Zona Común", "Ubicación / Render"];

export function renderShot(e, a) {
  const t = e.id + ":" + a;
  if (renderCache[t]) return renderCache[t];
  const o = document.createElement("canvas");
  (o.width = 960), (o.height = 600);
  const n = o.getContext("2d"),
    l = rng(t),
    r = {
      resort: facadeResort,
      tower: facadeTower,
      suites: facadeSuites,
    }[e.render],
    i = {
      resort: commonResort,
      tower: commonTower,
      suites: commonSuites,
    }[e.render];
  try {
    a === 0 ? r(n, l) : a === 1 ? interior(n, l, e.render) : a === 2 ? i(n, l) : locationMap(n, l, e),
      (renderCache[t] = o.toDataURL("image/jpeg", 0.86));
  } catch (s) {
    renderCache[t] = "";
  }
  return renderCache[t];
}

export function projectPhotos(e, a) {
  return SHOTS.map((t, o) => {
    const n = a && a[o];
    return n
      ? {
          src: n,
          label: t,
          real: true,
        }
      : e.photos && e.photos[o]
        ? {
            ...e.photos[o],
            real: true,
          }
        : {
            src: renderShot(e, o),
            label: t,
            real: false,
          };
  });
}
