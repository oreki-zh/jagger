"""Volume 02: nine additional logo motions designed by Claude Opus 5.5.

Each renderer uses the same 2x canvas, timing envelope and source raster as the
first volume: the entry resolves exactly to the supplied SVG by 1.85 s, the
shared hold keeps it untouched, and every exit clears to white by 4.37 s.
"""
import math
import numpy as np
import cv2
from PIL import Image, ImageDraw

STYLES = [
    dict(id='sweep', name='光束扫描', en='Light sweep', category='光影', description='一道倾斜的柔光自左向右扫过，标识在光后显现，随即掠过一抹温润的高光。', mood='明亮 · 通透 · 精致', number='10', posterTime=.86),
    dict(id='wave', name='波浪浮现', en='Wave rise', category='流动', description='标识像水面倒影般逐列浮起，涟漪由左向右依次平复，最终稳稳落定。', mood='柔和 · 起伏 · 灵动', number='11', posterTime=.78),
    dict(id='stamp', name='印章落定', en='Seal stamp', category='笔触', description='红色书籍标识如印章般从高处落下，一圈印泥涟漪散开，文字随之铺展。', mood='郑重 · 有力 · 东方', number='12', posterTime=1.30),
    dict(id='typewriter', name='逐字打印', en='Typewriter', category='节奏', description='红色光标领路，中文逐字键入，英文按字母排出，退场时再以退格收回。', mood='叙事 · 清晰 · 编辑感', number='13', posterTime=1.18),
    dict(id='particles', name='粒子凝聚', en='Particle gather', category='构成', description='上万颗取自原图颜色的微粒从漩涡中汇聚成形，退场时像被风吹散。', mood='细腻 · 科技 · 生长', number='14', posterTime=.95),
    dict(id='blinds', name='百叶开合', en='Venetian blinds', category='空间', description='四十片竖向百叶依次转开，光影在叶片间流动，露出完整的标识。', mood='韵律 · 建筑 · 秩序', number='15', posterTime=.70),
    dict(id='bloom', name='水墨晕染', en='Ink bloom', category='笔触', description='以不规则的水墨边界从图标向外晕开，边缘带出一层淡淡的朱砂水色。', mood='写意 · 温润 · 自然', number='16', posterTime=.92),
    dict(id='baseline', name='红线托起', en='Baseline lift', category='节奏', description='一道红色基线从中心展开，标识从线下缓缓升起，基线随后收束离场。', mood='简洁 · 稳健 · 引导', number='17', posterTime=.95),
    dict(id='swing', name='立体旋入', en='Perspective swing', category='镜头', description='标识以左侧为轴，从纵深处旋转入场，轻微过冲后回正，如同一扇门被推开。', mood='立体 · 动感 · 开阔', number='18', posterTime=.60),
]
for style in STYLES:
    style['series'] = 'opus'

RED = np.array([176, 0, 0], np.float32)


def renderers(g):
    """Build renderers from render_collection.py's shared globals."""
    W, H, S = g['W'], g['H'], g['S']
    LX, LY, LW, LH = g['LX'], g['LY'], g['LW'], g['LH']
    XX, YY, ARR, STATIC, WHITE, logo = g['XX'], g['YY'], g['ARR'], g['STATIC'], g['WHITE'], g['logo']
    parts, english, ex, ey = g['parts'], g['english'], g['ex'], g['ey']
    clamp, smooth = g['clamp'], g['smooth']
    eo, eio, ebo = g['ease_out_cubic'], g['ease_in_out_cubic'], g['ease_back_out']
    WS, HS = W * S, H * S
    ST = np.asarray(STATIC).astype(np.float32)
    INK = (ST.mean(axis=2) < 225).astype(np.float32)  # logo pixels on the full canvas

    def ein(v):
        return v * v * v

    def masked(mask, base=ST):
        out = 255 + (base - 255) * np.clip(mask, 0, 1)[..., None]
        return out

    def img(arr):
        return Image.fromarray(np.clip(arr, 0, 255).astype('uint8'))

    def fade(im, opacity):
        if opacity >= 1: return im
        return Image.blend(Image.new('RGB', im.size, 'white'), im, max(0., opacity))

    # 10 ─ Light sweep ─────────────────────────────────────────────────────
    diag = XX + (YY - HS / 2) * .42
    span0, span1 = LX - 260 * S, LX + LW + 260 * S
    soft = 150 * S

    def sweep(t):
        p = eio(clamp((t - .10) / 1.45))
        q = eio(clamp((t - 3.62) / .68))
        front = span0 + p * (span1 - span0 + soft)
        mask = np.clip((front - diag) / soft, 0, 1)
        mask = mask * mask * (3 - 2 * mask)
        if q > 0:
            back = span0 + q * (span1 - span0 + soft)
            mask *= smooth((diag - back) / soft)
        out = masked(mask)
        # A narrow gleam trails the front and lightens only logo pixels.
        gp = eio(clamp((t - .55) / 1.2))
        if 0 < gp < 1:
            centre = span0 + gp * (span1 - span0)
            band = np.exp(-((diag - centre) / (26 * S)) ** 2) * math.sin(math.pi * gp) * .62
            out = out + (255 - out) * (band * INK)[..., None]
        return img(out)

    # 11 ─ Wave rise ───────────────────────────────────────────────────────
    cols = (np.arange(WS, dtype=np.float32) - LX) / LW

    def wave(t):
        pc = np.clip((t - .10 - np.clip(cols, 0, 1) * .62) / .98, 0, 1)
        e = 1 - (1 - pc) ** 3
        dy = 88 * S * (1 - e) ** 2 * np.cos(e * math.pi * 3.2)
        alpha = np.clip(pc * 3.2, 0, 1)
        q = np.clip((t - 3.60 - np.clip(cols, 0, 1) * .38) / .38, 0, 1)
        if q.max() > 0:
            dy = dy + 70 * S * q ** 3
            alpha = alpha * (1 - q ** 2)
        mapy = (YY - dy[None, :]).astype(np.float32)
        warped = cv2.remap(ST, XX, mapy, cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255))
        return img(masked(np.broadcast_to(alpha[None, :], (HS, WS)), warped))

    # 12 ─ Seal stamp ──────────────────────────────────────────────────────
    icon, ix, iy = parts[0]
    icx, icy = ix + icon.width / 2, iy + icon.height / 2
    text_only = np.asarray(STATIC).astype(np.float32).copy()
    text_only[:, : ix + icon.width] = 255
    text_left = ix + icon.width

    def paste_darker(canvas, part, cx, cy, scale, angle, opacity):
        if opacity <= 0 or scale <= .01: return canvas
        pw, ph = max(1, round(part.width * scale)), max(1, round(part.height * scale))
        piece = part.resize((pw, ph), Image.Resampling.BICUBIC)
        if angle: piece = piece.rotate(angle, Image.Resampling.BICUBIC, expand=True, fillcolor='white')
        piece = np.asarray(fade(piece, opacity)).astype(np.float32)
        x0, y0 = round(cx - piece.shape[1] / 2), round(cy - piece.shape[0] / 2)
        xa, ya = max(0, x0), max(0, y0)
        xb, yb = min(WS, x0 + piece.shape[1]), min(HS, y0 + piece.shape[0])
        if xa < xb and ya < yb:
            region = canvas[ya:yb, xa:xb]
            canvas[ya:yb, xa:xb] = np.minimum(region, piece[ya - y0:yb - y0, xa - x0:xb - x0])
        return canvas

    def stamp(t):
        c = np.full((HS, WS, 3), 255, np.float32)
        drop = clamp((t - .10) / .62)
        q_icon = eio(clamp((t - 3.98) / .36))
        if t < .72:
            s, a = 1 + 1.05 * (1 - ein(drop)), -9 * (1 - ein(drop))
            op = clamp(drop * 3)
        else:
            k = clamp((t - .72) / .34)  # small squash after impact
            s, a, op = 1 + .045 * math.sin(math.pi * k) * (1 - k), 0, 1
        s += q_icon * .35
        c = paste_darker(c, icon, icx, icy, s, a, op * (1 - q_icon))
        # Ink ring from the impact.
        rk = clamp((t - .72) / .75)
        if 0 < rk < 1:
            r = (icon.width * .55) + eo(rk) * 190 * S
            d = np.abs(np.sqrt((XX - icx) ** 2 + (YY - icy) ** 2) - r)
            ring = np.clip(1 - d / (2.2 * S), 0, 1) * (1 - rk) ** 1.5 * .55
            c = c * (1 - ring[..., None]) + RED * ring[..., None]
        # Text unrolls from the seal outward, and rolls back first on exit.
        tp = eio(clamp((t - .86) / .88))
        tq = eio(clamp((t - 3.60) / .44))
        front = text_left + tp * (WS - text_left)
        mask = np.clip((front - XX) / (60 * S), 0, 1) * (XX >= text_left)
        if tq > 0: mask *= np.clip((text_left + (1 - tq) * (LW + 60 * S) - XX) / (60 * S), 0, 1)
        text = masked(mask, text_only)
        return img(np.minimum(c, text))

    # 13 ─ Typewriter ──────────────────────────────────────────────────────
    ink_cols = np.where((np.asarray(english).mean(axis=2) < 200).any(axis=0))[0]
    glyphs, start = [], ink_cols[0]
    for a, b in zip(ink_cols, ink_cols[1:]):
        if b - a > 2: glyphs.append((start, a + 1)); start = b
    glyphs.append((start, ink_cols[-1] + 1))
    char_tops = LY, LY + round(94 * LW / 1048)
    eng_rows = np.where((np.asarray(english).mean(axis=2) < 200).any(axis=1))[0]
    eng_top, eng_bot = LY + ey + eng_rows[0], LY + ey + eng_rows[-1] + 1
    icon_ink = np.where((np.asarray(icon).mean(axis=2) < 200).any(axis=1))[0]
    zh_rows = np.where((np.asarray(logo.crop((ex, 0, LW, ey))).mean(axis=2) < 200).any(axis=1))[0]
    zh_top, zh_bot = LY + zh_rows[0], LY + zh_rows[-1] + 1
    zh_times = [.40 + i * .075 for i in range(len(parts) - 1)]
    en_start, en_step = 1.23, .52 / len(glyphs)

    def typewriter(t):
        c = np.full((HS, WS, 3), 255, np.float32)
        icon_op = clamp((t - .10) / .22) * (1 - clamp((t - 4.20) / .14))
        if icon_op > 0:
            c[iy:iy + icon.height, ix:ix + icon.width] = 255 + (np.asarray(icon).astype(np.float32) - 255) * icon_op
        back = t >= 3.6
        # Backspace: English glyphs first, then characters, at the same cadence.
        erase_en = int(clamp((t - 3.60) / .30) * len(glyphs)) if back else 0
        erase_zh = int(clamp((t - 3.92) / .28) * (len(parts) - 1)) if back else 0
        shown_zh, zh_cursor = 0, None
        for i, (part, x, y) in enumerate(parts[1:]):
            tt = zh_times[i]
            if t >= tt and i < len(parts) - 1 - erase_zh:
                a = clamp((t - tt) / .04 + .35)
                c[y:y + part.height, x:x + part.width] = 255 + (np.asarray(part).astype(np.float32) - 255) * a
                shown_zh = i + 1
                zh_cursor = (x + part.width + 3 * S, zh_top, zh_bot)
        n = int(clamp((t - en_start) / (en_step * len(glyphs))) * len(glyphs)) if t >= en_start else 0
        if back: n = max(0, n - erase_en)
        if n > 0:
            x1 = glyphs[n - 1][1]
            c[LY + ey:LY + LH, LX + ex:LX + ex + x1] = np.asarray(english).astype(np.float32)[:, :x1]
        en_cursor = (LX + ex + (glyphs[n - 1][1] + 4 * S if n else -2 * S), eng_top, eng_bot)
        zh_home = (parts[1][1] - 2 * S, zh_top, zh_bot)
        if not back:
            cursor = en_cursor if (n or t >= en_start - .05) else (zh_cursor or (zh_home if t >= .22 else None))
        else:
            cursor = en_cursor if (n or t < 3.92) else (zh_cursor or zh_home)
            if t >= 4.20: cursor = None
        if cursor and (t >= .40 or math.floor(t * 6) % 2 == 0):
            x, y0, y1 = cursor
            c[y0 - 2 * S:y1 + 2 * S, x:x + 3 * S] = RED
        return img(c)

    # 14 ─ Particle gather ─────────────────────────────────────────────────
    rng = np.random.default_rng(55)
    gy, gx = np.mgrid[0:LH:3, 0:LW:3]
    keep = ARR[gy, gx].mean(axis=2) < 215
    px, py = gx[keep].astype(np.float32), gy[keep].astype(np.float32)
    colors = ARR[gy, gx][keep].astype(np.float32)
    count = len(px)
    tx, ty = px + LX, py + LY
    ang = rng.uniform(0, math.tau, count)
    rad = rng.uniform(120, 460, count) * S
    spin = rng.uniform(1.4, 2.6, count) * rng.choice([-1, 1], count)
    delay = (px / LW) * .38 + rng.uniform(0, .22, count)
    wind = rng.uniform(.6, 1.4, count)
    wdelay = (1 - px / LW) * .18 + rng.uniform(0, .14, count)

    def dots(x, y, alpha):
        c = np.full((HS, WS, 3), 255, np.float32)
        ok = (alpha > .01) & (x >= 0) & (x < WS - 3) & (y >= 0) & (y < HS - 3)
        xi, yi = x[ok].astype(int), y[ok].astype(int)
        col = 255 + (colors[ok] - 255) * alpha[ok, None]
        order = np.argsort(-alpha[ok])  # stronger dots drawn last
        for dx in range(3):
            for dy in range(3):
                c[yi[order[::-1]] + dy, xi[order[::-1]] + dx] = col[order[::-1]]
        return c

    def particles(t):
        if t < 3.6:
            p = np.clip((t - .10 - delay) / 1.05, 0, 1)
            e = 1 - (1 - p) ** 3
            r = rad * (1 - e)
            th = ang + spin * (1 - e)
            x = tx + np.cos(th) * r
            y = ty + np.sin(th) * r * .5
            c = dots(x, y, np.clip(p * 2.5, 0, 1))
            k = smooth(clamp((t - 1.42) / .38))
            return img(c * (1 - k) + ST * k) if k > 0 else img(c)
        q = np.clip((t - 3.62 - wdelay) / .62, 0, 1)
        e = q * q
        x = tx + e * wind * 520 * S + np.sin(py * .05 + q * 6) * e * 30 * S
        y = ty - e * wind * 90 * S
        c = dots(x, y, 1 - e)
        k = 1 - smooth(clamp((t - 3.60) / .10))
        return img(ST * k + c * (1 - k))

    # 15 ─ Venetian blinds ─────────────────────────────────────────────────
    N = 40
    strip_edges = [round(i * LW / N) for i in range(N + 1)]
    strips = [(logo.crop((a, 0, b, LH)), a) for a, b in zip(strip_edges, strip_edges[1:])]
    slat = np.array([236, 234, 228], np.float32)

    def blinds(t):
        c = np.full((HS, WS, 3), 255, np.float32)
        for i, (strip, a) in enumerate(strips):
            p = clamp((t - .10 - i * .020) / .82)
            q = clamp((t - 3.60 - i * .011) / .30)
            e = eio(p) * (1 - eio(q))
            if e <= 0: continue
            sw = strip.width
            w = max(1, round(sw * math.sin(e * math.pi / 2)))
            x0 = LX + a + (sw - w) // 2
            shade = (1 - e) * .5
            piece = np.asarray(strip.resize((w, LH), Image.Resampling.BICUBIC)).astype(np.float32)
            piece = piece * (1 - shade) + slat * shade
            c[LY:LY + LH, x0:x0 + w] = piece if e < 1 else np.asarray(strip)
        return img(c)

    # 16 ─ Ink bloom ───────────────────────────────────────────────────────
    def noise(seed, cells):
        r = np.random.default_rng(seed)
        out = np.zeros((HS, WS), np.float32)
        amp, total = 1., 0.
        for octave in range(4):
            gw, gh = cells * 2 ** octave, max(2, cells * 2 ** octave * HS // WS)
            layer = cv2.resize(r.random((gh, gw)).astype(np.float32), (WS, HS), interpolation=cv2.INTER_CUBIC)
            out += layer * amp; total += amp; amp *= .5
        return out / total

    dist = np.sqrt(((XX - icx) / (LW * 1.0)) ** 2 + ((YY - icy) / (LW * .55)) ** 2)
    field_in = dist + (noise(16, 6) - .5) * .42
    field_out = (XX - LX) / LW * .9 + (noise(61, 5) - .5) * .5
    wash = np.array([244, 214, 208], np.float32)
    near = cv2.GaussianBlur(cv2.dilate(INK, np.ones((9 * S, 9 * S), np.uint8)), (0, 0), 14 * S)
    near = np.clip(near / near.max() * 1.6, 0, 1)

    def bloom(t):
        if t < 3.6:
            p = clamp((t - .15) / 1.60)
            level = -.22 + (.5 * p + .5 * p * p * (3 - 2 * p)) * 1.55
            edge = level - field_in
        else:
            q = clamp((t - 3.60) / .74)
            level = -.4 + (.5 * q + .5 * q * q * (3 - 2 * q)) * 1.75
            edge = field_out - level
        mask = np.clip(edge / .07, 0, 1)
        mask = mask * mask * (3 - 2 * mask)
        out = masked(mask)
        halo = np.exp(-((edge - .035) / .05) ** 2) * .6 * near * (1 - INK * mask)
        halo *= clamp((t - .10) / .2) * (1 - clamp((t - 4.25) / .12))
        out = out * (1 - halo[..., None]) + wash * halo[..., None]
        return img(out)

    # 17 ─ Baseline lift ───────────────────────────────────────────────────
    line_y = LY + LH + 14 * S
    line_h = 3 * S
    lx0, lx1 = LX - 10 * S, LX + LW + 10 * S
    mid = (lx0 + lx1) / 2

    def baseline(t):
        c = np.full((HS, WS, 3), 255, np.float32)
        if t < 3.6:
            grow = eio(clamp((t - .10) / .50))
            a, b = mid - grow * (mid - lx0), mid + grow * (lx1 - mid)
            rise = eo(clamp((t - .50) / .95))
            retract = eio(clamp((t - 1.30) / .45))
            a = a + retract * (lx1 - lx0)
        else:
            grow = eio(clamp((t - 3.60) / .28))
            a, b = lx0, lx0 + grow * (lx1 - lx0)
            rise = 1 - ein(clamp((t - 3.80) / .36))
            shrink = eio(clamp((t - 4.10) / .26))
            a, b = a + shrink * (mid - a), b - shrink * (b - mid)
        dy = round((1 - rise) * (LH + 20 * S))
        if rise > 0:
            y0 = LY + dy
            y1 = min(line_y, y0 + LH)
            if y1 > y0:
                c[y0:y1, LX:LX + LW] = ARR[: y1 - y0].astype(np.float32)
        if b - a > 1:
            c[line_y:line_y + line_h, round(a):round(b)] = RED
        return img(c)

    # 18 ─ Perspective swing ───────────────────────────────────────────────
    focal = 1500 * S
    src = np.float32([[0, 0], [LW, 0], [LW, LH], [0, LH]])

    def project(theta, hinge_right=False):
        pts = []
        for x, y in src:
            d = (LW - x) if hinge_right else x
            xr, z = d * math.cos(theta), d * math.sin(theta)
            k = focal / (focal + z)
            X = (LX + LW - xr * k) if hinge_right else (LX + xr * k)
            pts.append([X, HS / 2 + (y - LH / 2) * k])
        return np.float32(pts)

    def swing(t):
        if 1.75 <= t < 3.6: return STATIC.copy()
        if t < 3.6:
            p = clamp((t - .10) / 1.62)
            theta = math.radians(78) * (1 - ebo(p))
            op = clamp(p * 3.2)
            dst = project(theta)
        else:
            q = eio(clamp((t - 3.60) / .70))
            theta = math.radians(82) * q
            op = 1 - clamp((q - .55) / .45)
            dst = project(theta, hinge_right=True)
        M = cv2.getPerspectiveTransform(src, dst)
        out = cv2.warpPerspective(ARR, M, (WS, HS), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255)).astype(np.float32)
        light = abs(math.sin(theta)) * .35
        out = out + (255 - out) * (light + (1 - op) * (1 - light))
        return img(out)

    return dict(sweep=sweep, wave=wave, stamp=stamp, typewriter=typewriter, particles=particles,
                blinds=blinds, bloom=bloom, baseline=baseline, swing=swing)
