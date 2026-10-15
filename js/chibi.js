/**
 * Hai nhan vat chibi "anh" va "em" ve bang SVG — dung chung cho phim hoat hinh
 * (chuyen-cua-chung-minh.html) va bo sticker (tools/sticker.js).
 *
 *   const { S, makeChar, heart } = Chibi;
 *   const em = makeChar('em', { outfit: 'couple' });
 *   svg.appendChild(em.g);
 *   em.set({ x: 270, y: 676, armL: -40, eyes: 'happy', mouth: 'open' });
 */
(function (root, factory) {
  root.Chibi = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  function S(tag, attrs = {}, kids = []) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    kids.forEach((c) => c && e.appendChild(c));
    return e;
  }
  // Gia tri khong doi thi bo qua: moi setAttribute la mot lan bao trinh duyet ve lai (phim ghi
  // ca tram thuoc tinh moi khung, phan lon la giong khung truoc)
  const tf = (el, v) => { if (el.__tf !== v) { el.__tf = v; el.setAttribute('transform', v); } };
  const op = (el, v) => { const s = v.toFixed(3); if (el.__op !== s) { el.__op = s; el.setAttribute('opacity', s); } };
  const show = (el, on) => (on ? el.removeAttribute('display') : el.setAttribute('display', 'none'));
  const HEART = 'M0,6 C-2,-2 -14,-4 -14,-12 C-14,-19 -6,-22 0,-15 C6,-22 14,-19 14,-12 C14,-4 2,-2 0,6Z';
  const DROP = 'M0,-14 C5,-6 9,-1 9,4 A9,9 0 1 1 -9,4 C-9,-1 -5,-6 0,-14Z';
  const heart = (fill, s = 1) => S('path', { d: HEART, fill, transform: `scale(${s})` });

  // ── NHAN VAT ─────────────────────────────────────────────────
  // Goc toa do o giua hai ban chan; cao ~240. Tay: 0 = buong thang, duong = gio ra ngoai,
  // am = dua vao trong (truoc nguoi).
  const SKIN = '#ffe1cc';
  const INK = '#2b1b18', LIP = '#8a3b3b', MOUTH = '#c4485f';
  function makeChar(who, o = {}) {
    const isAnh = who === 'anh';
    const c = isAnh
      ? { shirt: '#fbfaf6', line: '#d9d2c7', pants: '#34405e', shoe: '#3b2a24', hair: '#231713' }
      : { shirt: '#ff9fb7', line: '#ee7d9a', skirt: '#fff3f6', shoe: '#9a3d58', hair: '#2a1915' };
    if (o.outfit === 'blood') { if (isAnh) c.shirt = '#ffffff'; else { c.shirt = '#bcd9f3'; c.line = '#93b9dc'; c.skirt = '#2f3b58'; } }
    if (o.outfit === 'couple') { c.shirt = '#ffffff'; c.line = '#ddd'; if (!isAnh) c.skirt = '#dfe9f7'; }
    if (o.outfit === 'red' && !isAnh) { c.shirt = '#b8324f'; c.line = '#932640'; }

    const g = S('g');
    // toc dai phia sau (nam sau than va tay, di theo dau)
    const hairBack = S('g');
    const hairLong = S('g'), hairShort = S('g');
    if (!isAnh) {
      hairLong.appendChild(S('path', { d: 'M-62,-8 C-76,-104 76,-104 62,-8 L60,74 C38,86 -38,86 -60,74Z', fill: c.hair }));
      hairShort.appendChild(S('path', { d: 'M-62,-8 C-76,-104 76,-104 62,-8 L63,30 C40,42 -40,42 -63,30Z', fill: c.hair }));
      hairBack.append(hairLong, hairShort);
    }
    g.appendChild(hairBack);
    // chan
    const leg = () => {
      const lg = S('g');
      lg.appendChild(S('rect', { x: -6.5, y: 0, width: 13, height: 56, rx: 6.5, fill: isAnh ? c.pants : SKIN }));
      lg.appendChild(S('ellipse', { cx: 3, cy: 57, rx: 11, ry: 6.5, fill: c.shoe }));
      return lg;
    };
    const legL = leg(), legR = leg();
    g.append(legL, legR);
    // than
    if (isAnh) {
      g.appendChild(S('rect', { x: -31, y: -74, width: 62, height: 16, rx: 6, fill: c.pants }));
      g.appendChild(S('path', { d: 'M-34,-128 Q-38,-98 -33,-66 L33,-66 Q38,-98 34,-128 Q0,-138 -34,-128Z', fill: c.shirt, stroke: c.line, 'stroke-width': 2 }));
      if (o.outfit !== 'couple' && o.outfit !== 'blood') {
        g.appendChild(S('path', { d: 'M-13,-132 L0,-116 L13,-132', fill: 'none', stroke: c.line, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
        [-104, -90, -76].forEach((y) => g.appendChild(S('circle', { cx: 0, cy: y, r: 2.2, fill: c.line })));
      }
    } else {
      g.appendChild(S('path', { d: 'M-31,-88 L31,-88 L44,-44 Q0,-36 -44,-44Z', fill: c.skirt, stroke: 'rgba(0,0,0,0.06)', 'stroke-width': 2 }));
      g.appendChild(S('path', { d: 'M-30,-128 Q-34,-108 -31,-86 L31,-86 Q34,-108 30,-128 Q0,-137 -30,-128Z', fill: c.shirt, stroke: c.line, 'stroke-width': 2 }));
    }
    if (o.outfit === 'couple') {
      g.appendChild(S('text', { x: 0, y: -94, 'text-anchor': 'middle', 'font-family': 'Playfair Display, serif', 'font-weight': 800, 'font-size': 24, fill: '#7fb6e6', stroke: '#e58aa6', 'stroke-width': 1 }, [document.createTextNode(isAnh ? 'P' : 'H')]));
    }
    // tay
    const arm = () => {
      const ag = S('g');
      ag.appendChild(S('rect', { x: -6.5, y: 12, width: 13, height: 36, rx: 6.5, fill: SKIN }));
      ag.appendChild(S('rect', { x: -8, y: -6, width: 16, height: 22, rx: 5, fill: c.shirt, stroke: c.line, 'stroke-width': 1.5 }));
      ag.appendChild(S('circle', { cx: 0, cy: 50, r: 8, fill: SKIN }));
      return ag;
    };
    const armL = arm(), armR = arm();
    g.append(armL, armR);
    // dau
    const head = S('g');
    head.appendChild(S('circle', { cx: -54, cy: 4, r: 9, fill: SKIN }));
    head.appendChild(S('circle', { cx: 54, cy: 4, r: 9, fill: SKIN }));
    head.appendChild(S('circle', { cx: 0, cy: 0, r: 56, fill: SKIN }));
    const blush = S('g', {}, [
      S('ellipse', { cx: -32, cy: 22, rx: 10, ry: 5.5, fill: '#ff8fa3' }),
      S('ellipse', { cx: 32, cy: 22, rx: 10, ry: 5.5, fill: '#ff8fa3' }),
    ]);
    head.appendChild(blush);
    const eye = (x) => S('g', { transform: `translate(${x},4)` }, [
      S('ellipse', { cx: 0, cy: 0, rx: 6.5, ry: 8.5, fill: INK }),
      S('circle', { cx: 2.2, cy: -3.2, r: 2.6, fill: '#fff' }),
    ]);
    const eyeL = eye(-20), eyeR = eye(20);
    head.append(eyeL, eyeR);
    const smile = S('path', { d: 'M-8,26 Q0,33 8,26', fill: 'none', stroke: LIP, 'stroke-width': 3, 'stroke-linecap': 'round' });
    const open = S('path', { d: 'M-9,24 Q0,40 9,24Z', fill: MOUTH, stroke: LIP, 'stroke-width': 2, 'stroke-linejoin': 'round' });
    head.append(smile, open);

    // bieu cam them cho sticker (mac dinh an het -> phim ve y nhu cu)
    const ln = (d, w = 3.2, col = INK) => S('path', { d, fill: 'none', stroke: col, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    const pair = (f) => S('g', {}, [f(-20, -1), f(20, 1)]);
    const EYES = {
      happy: pair((x) => ln(`M${x - 8},8 Q${x},-5 ${x + 8},8`, 3.6)),                         // ^ ^
      closed: pair((x) => ln(`M${x - 8},3 Q${x},11 ${x + 8},3`, 3.2)),                       // ngu
      squeeze: pair((x, k) => ln(`M${x + 8 * k},-4 L${x - 7 * k},4 L${x + 8 * k},12`, 3.4)), // > <
      heart: pair((x) => S('path', { d: HEART, fill: '#ff3d68', transform: `translate(${x},11) scale(0.66)` })),
    };
    // mi mat che nghieng: gian (phia trong thap) / buon (phia ngoai thap). ox: duoi mat ngoai, ix: trong
    const lid = (angry) => pair((x, k) => {
      const ox = x + 13 * k, ix = x - 12 * k, hi = angry ? ix : ox, lo = angry ? ox : ix;
      return S('g', {}, [
        S('path', { d: `M${lo},-9 L${hi},-9 L${hi},3Z`, fill: SKIN }),
        ln(`M${lo},-7 L${hi},2`, angry ? 3.4 : 3)]);
    });
    const LIDS = { angry: lid(true), sad: lid(false) };
    const MOUTHS = {
      frown: ln('M-8,31 Q0,23 8,31', 3, LIP),
      pout: ln('M-7,28 Q-3.5,24 0,28 Q3.5,24 7,28', 3, LIP),
      kiss: ln('M-1,20 Q6,23 1,26.5 Q6,30 -1,33', 3, LIP),
      kissL: ln('M1,20 Q-6,23 -1,26.5 Q-6,30 1,33', 3, LIP),           // chu moi sang trai
      o: S('ellipse', { cx: 0, cy: 28, rx: 5.5, ry: 7, fill: MOUTH, stroke: LIP, 'stroke-width': 2 }),
      grin: S('path', { d: 'M-14,22 Q0,46 14,22Z', fill: MOUTH, stroke: LIP, 'stroke-width': 2, 'stroke-linejoin': 'round' }),
      wail: S('path', { d: 'M-12,23 Q0,17 12,23 Q10,41 0,41 Q-10,41 -12,23Z', fill: MOUTH, stroke: LIP, 'stroke-width': 2, 'stroke-linejoin': 'round' }),
    };
    const tears = S('g', {}, [-1, 1].map((k) => S('path', { d: `M${21 * k - 6},10 Q${21 * k - 9},34 ${21 * k - 5},58 L${21 * k + 5},58 Q${21 * k + 8},34 ${21 * k + 6},10Z`, fill: '#8fd3ff', opacity: 0.9 })));
    const extra = [...Object.values(EYES), ...Object.values(LIDS), ...Object.values(MOUTHS), tears];
    head.append(...extra);
    extra.forEach((e) => show(e, false));

    if (isAnh) {
      head.appendChild(S('path', { d: 'M-61,10 C-72,-96 72,-100 62,10 C58,-14 46,-26 30,-28 L22,-14 L10,-30 L-4,-16 L-18,-30 C-38,-26 -56,-14 -61,10Z', fill: c.hair }));
    } else {
      head.appendChild(S('path', { d: 'M-61,12 C-70,-96 70,-98 61,12 C55,-18 34,-30 6,-28 C-2,-14 -14,-8 -30,-5 C-46,-2 -57,4 -61,12Z', fill: c.hair }));
      // bim toc ben vai phai (chi khi toc dai)
      const braid = S('g');
      [0, 1, 2, 3, 4].forEach((k) => braid.appendChild(S('ellipse', { cx: 46 + (k % 2 ? 3 : -3), cy: 34 + k * 15, rx: 9, ry: 9.5, fill: c.hair })));
      braid.appendChild(S('circle', { cx: 46, cy: 106, r: 5, fill: '#ff6b8a' }));
      hairLong.appendChild(braid);
      head.appendChild(S('circle', { cx: -40, cy: -30, r: 7, fill: '#ff6b8a' }));        // kep toc
    }
    if (o.hat === 'santa' || o.hat === 'party') {
      const hat = o.hat === 'santa'
        ? S('g', { transform: 'translate(4,-48) rotate(14)' }, [
          S('path', { d: 'M-46,8 Q0,-70 44,8Z', fill: '#e2283c' }),
          S('rect', { x: -50, y: 2, width: 100, height: 16, rx: 8, fill: '#fff' }),
          S('circle', { cx: 4, cy: -54, r: 10, fill: '#fff' })])
        : S('g', { transform: 'translate(18,-50) rotate(18)' }, [
          S('path', { d: 'M-22,10 L0,-52 L22,10Z', fill: isAnh ? '#5aa9e6' : '#ffd23f' }),
          S('path', { d: 'M-15,-10 L15,-10 M-19,2 L19,2', stroke: '#fff', 'stroke-width': 4 }),
          S('circle', { cx: 0, cy: -54, r: 7, fill: '#ff6b8a' })]);
      head.appendChild(hat);
    }
    g.appendChild(head);

    const st = { who, g, hairLong, hairShort };
    // p: { x, y, s, armL, armR, legL, legR, bob, tilt, nod, blink, look, blush, short,
    //      mouth: '' | open | frown | pout | kiss | kissL | o | grin | wail,
    //      eyes: '' | happy | closed | squeeze | heart, lids: angry | sad, tears: 0..1 }
    st.set = (p) => {
      const s = p.s || 1;
      tf(g, `translate(${p.x.toFixed(1)},${(p.y + (p.bob || 0)).toFixed(1)}) scale(${s})`);
      tf(legL, `translate(-13,-66) rotate(${(p.legL || 0).toFixed(1)})`);
      tf(legR, `translate(13,-66) rotate(${(p.legR || 0).toFixed(1)})`);
      tf(armL, `translate(-33,-124) rotate(${(p.armL || 0).toFixed(1)})`);
      tf(armR, `translate(33,-124) rotate(${(-(p.armR || 0)).toFixed(1)})`);
      const hv = `translate(0,${(-182 + (p.nod || 0)).toFixed(1)}) rotate(${(p.tilt || 0).toFixed(1)})`;
      tf(head, hv); tf(hairBack, hv);
      const b = 1 - 0.9 * (p.blink || 0);
      tf(eyeL, `translate(-20,${4 + (p.look || 0)}) scale(1,${b.toFixed(2)})`);
      tf(eyeR, `translate(20,${4 + (p.look || 0)}) scale(1,${b.toFixed(2)})`);
      op(smile, p.mouth ? 0 : 1);
      op(open, p.mouth === 'open' ? 1 : 0);
      op(blush, p.blush == null ? 0.5 : p.blush);
      if (!isAnh) { op(hairLong, 1 - (p.short || 0)); op(hairShort, p.short || 0); }
      if (p.eyes || p.lids || p.tears || (p.mouth && p.mouth !== 'open') || st.faced) {        // chi dung toi khi sticker bat bieu cam
        st.faced = true;
        show(eyeL, !p.eyes); show(eyeR, !p.eyes);
        for (const k in EYES) show(EYES[k], p.eyes === k);
        for (const k in LIDS) show(LIDS[k], p.lids === k);
        for (const k in MOUTHS) show(MOUTHS[k], p.mouth === k);
        show(tears, !!p.tears); op(tears, p.tears || 0);
      }
    };
    // vi tri ban tay (toa do canh) de cam do vat
    st.hand = (p, side) => {
      const s = p.s || 1, a = (side === 'L' ? p.armL || 0 : -(p.armR || 0)) * Math.PI / 180;
      const sx = side === 'L' ? -33 : 33;
      return [p.x + s * (sx - 50 * Math.sin(a)), p.y + (p.bob || 0) + s * (-124 + 50 * Math.cos(a))];
    };
    return st;
  }

  return { S, tf, op, HEART, DROP, heart, SKIN, makeChar };
}));
