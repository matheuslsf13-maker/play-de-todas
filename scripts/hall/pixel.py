# -*- coding: utf-8 -*-
"""Transforma o desenho (cartoon) de uma menina em PIXEL ART de verdade.

Nao e so encolher (isso deixa borrado): encolhe pela media, prende as cores
numa paleta fixa (a mesma para frente e costas -- e para todos os quadros da
animacao, senao a cor "pisca"), limpa os pixels soltos e desenha o contorno
de 1 pixel, mais escuro, da propria cor de cada borda (como um pixel artist faz).

Uso: python scripts/hall/pixel.py <altura_em_pixels> [cores]
"""
import os
import sys

import cv2
import numpy as np

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def so_a_maior_parte(rgba):
    a = rgba[:, :, 3]
    n, rot, info, _ = cv2.connectedComponentsWithStats((a > 40).astype(np.uint8), 8)
    if n > 2:
        maior = 1 + int(np.argmax(info[1:, cv2.CC_STAT_AREA]))
        rgba = rgba.copy()
        rgba[rot != maior, 3] = 0
    return rgba


def encolher(rgba, altura):
    k = altura / rgba.shape[0]
    largura = max(1, round(rgba.shape[1] * k))
    a = rgba[:, :, 3:4].astype(np.float32) / 255
    # media pre-multiplicada: a borda nao puxa cor do fundo
    cor = cv2.resize(rgba[:, :, :3].astype(np.float32) * a, (largura, altura), interpolation=cv2.INTER_AREA)
    al = cv2.resize(a[:, :, 0], (largura, altura), interpolation=cv2.INTER_AREA)
    cor = cor / np.maximum(al[:, :, None], 1e-3)
    return np.clip(cor, 0, 255), al


def paleta(amostras, n):
    lab = cv2.cvtColor(amostras.reshape(-1, 1, 3).astype(np.uint8), cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
    _, _, centros = cv2.kmeans(lab, n, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.3), 5, cv2.KMEANS_PP_CENTERS)
    return centros  # em Lab


def prender(cor, opaco, centros):
    lab = cv2.cvtColor(cor.astype(np.uint8), cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
    d = ((lab[:, None, :] - centros[None, :, :]) ** 2).sum(axis=2)
    idx = d.argmin(axis=1).reshape(opaco.shape)
    idx[~opaco] = -1
    return idx


def limpar_soltos(idx):
    """Pixel isolado (nenhum vizinho da mesma cor) vira a cor mais comum em volta."""
    h, w = idx.shape
    out = idx.copy()
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            c = idx[y, x]
            if c < 0:
                continue
            viz = idx[y - 1:y + 2, x - 1:x + 2].flatten()
            viz = np.delete(viz, 4)
            if (viz == c).any():
                continue
            v = viz[viz >= 0]
            if len(v) >= 6:
                vals, cont = np.unique(v, return_counts=True)
                out[y, x] = vals[cont.argmax()]
    return out


def colorir(idx, centros):
    lab = np.zeros(idx.shape + (3,), np.float32)
    ok = idx >= 0
    lab[ok] = centros[idx[ok]]
    bgr = cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2BGR)
    return bgr, ok


def contorno(bgr, ok):
    """A borda de fora ganha 1 pixel escuro da propria cor (sel-out)."""
    borda = ok & ~cv2.erode(ok.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[:, :, 2] = np.where(borda, hsv[:, :, 2] * 0.42, hsv[:, :, 2])
    hsv[:, :, 1] = np.where(borda, np.minimum(255, hsv[:, :, 1] * 1.15), hsv[:, :, 1])
    return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)


def nitidez(rgba, forca=0.7):
    """Realca os tracos antes de encolher: olho, boca e letra do logo nao somem na media."""
    cor = rgba[:, :, :3].astype(np.float32)
    borrada = cv2.GaussianBlur(cor, (0, 0), 2.2)
    out = rgba.copy()
    out[:, :, :3] = np.clip(cor + forca * (cor - borrada), 0, 255).astype(np.uint8)
    return out


def caixa_para_mascara(caixas, forma_original, forma_nova):
    """Caixas (x0, y0, x1, y1) no desenho grande -> mascara no tamanho pixelado."""
    h, w = forma_nova
    ky, kx = h / forma_original[0], w / forma_original[1]
    m = np.zeros((h, w), bool)
    for x0, y0, x1, y1 in caixas:
        m[int(y0 * ky):int(np.ceil(y1 * ky)), int(x0 * kx):int(np.ceil(x1 * kx))] = True
    return m


def pixelar(rgbas, altura, cores, detalhes=None):
    """`detalhes`: para cada desenho, caixas (rosto, logo, faixas) que ganham
    cores proprias na paleta e nao passam pela limpeza de pixel solto."""
    detalhes = detalhes or [[] for _ in rgbas]
    encolhidas = [encolher(nitidez(so_a_maior_parte(r)), altura) for r in rgbas]
    mascaras = [caixa_para_mascara(d, r.shape[:2], c.shape[:2]) for d, r, (c, _) in zip(detalhes, rgbas, encolhidas)]
    # o rosto e o logo pesam 12x na escolha das cores: a paleta guarda o tom
    # do labio, do olho, o rosa e o amarelo do logo
    amostras = np.vstack(
        [c[al > 0.5] for c, al in encolhidas] + [np.repeat(c[(al > 0.5) & m], 12, axis=0) for (c, al), m in zip(encolhidas, mascaras)]
    )
    centros = paleta(amostras, cores)
    saidas = []
    for (cor, al), m in zip(encolhidas, mascaras):
        opaco = al > 0.5
        bruto = prender(cor, opaco, centros)
        idx = limpar_soltos(bruto)
        idx[m] = bruto[m]
        bgr, ok = colorir(idx, centros)
        bgr = contorno(bgr, ok)
        saidas.append(np.dstack([bgr, np.where(ok, 255, 0).astype(np.uint8)]))
    return saidas


# O logo "Play de Todas" redesenhado a mao, pixel a pixel: encolhido do desenho
# ele virava um borrao (no peito ele tem uns 10 pixels). Pixel art exagera o
# que importa: "Play" em branco com a bolinha amarela, e o "Todas" rosa como
# uma assinatura (a letra cursiva nao cabe em 3 pixels de altura).
GLIFOS = {
    'P': ['###', '#.#', '###', '#..', '#..', '...'],
    'l': ['#', '#', '#', '#', '#', '.'],
    'a': ['...', '##.', '.##', '#.#', '###', '...'],
    'y': ['...', '#.#', '#.#', '.##', '..#', '##.'],
}


def _logo():
    linhas = [''] * 6
    for i, letra in enumerate('Play'):
        for j in range(6):
            linhas[j] += ('.' if i else '') + GLIFOS[letra][j]
    linhas = [l.replace('#', 'B') + '..' for l in linhas]
    linhas[0] = linhas[0][:-2] + 'AA'
    linhas[1] = linhas[1][:-2] + 'AA'
    largura = len(linhas[0])
    assinatura = [
        '..........RRR..',
        '...RRRRRRR.....',
    ]
    return [l.ljust(largura, '.') for l in linhas] + [a.ljust(largura, '.')[:largura] for a in assinatura]


LOGO = _logo()
CORES_LOGO = {'B': (245, 245, 250), 'R': (170, 60, 245), 'A': (40, 210, 250)}  # BGR


def carimbar_logo(rgba, cx, cy):
    """Apaga o logo encolhido (borrao) e carimba o desenhado, centro em (cx, cy)."""
    h, w = len(LOGO), len(LOGO[0])
    x0, y0 = int(round(cx - w / 2)), int(round(cy - h / 2))
    # o azul da camisa em volta, para tapar o borrao (cabelo e pele ficam)
    hsv = cv2.cvtColor(rgba[:, :, :3], cv2.COLOR_BGR2HSV)
    azul = (hsv[:, :, 0] > 100) & (hsv[:, :, 0] < 130) & (hsv[:, :, 1] > 120) & (rgba[:, :, 3] > 0)
    ys, xs = np.where(azul[max(0, y0 - 3):y0 + h + 3, max(0, x0 - 3):x0 + w + 3])
    fundo = np.median(rgba[max(0, y0 - 3) + ys, max(0, x0 - 3) + xs, :3], axis=0) if len(ys) else (180, 60, 30)
    for y in range(max(0, y0 - 1), min(rgba.shape[0], y0 + h + 1)):
        for x in range(max(0, x0 - 1), min(rgba.shape[1], x0 + w + 1)):
            hh, ss, vv = hsv[y, x]
            cabelo_ou_pele = hh < 22 and ss > 60
            if rgba[y, x, 3] > 0 and not azul[y, x] and not cabelo_ou_pele:
                rgba[y, x, :3] = fundo
    # o logo desenhado e mais largo que o original: escorrega ate caber inteiro
    # na camisa que aparece (o cabelo cai sobre o peito), o mais perto possivel
    # do lugar original -- e so pinta em cima de camisa: o cabelo fica por cima
    hsv = cv2.cvtColor(rgba[:, :, :3], cv2.COLOR_BGR2HSV)
    camisa = (hsv[:, :, 0] > 100) & (hsv[:, :, 0] < 130) & (hsv[:, :, 1] > 120) & (rgba[:, :, 3] > 0)
    pontos = [(j, i) for j, linha in enumerate(LOGO) for i, ch in enumerate(linha) if ch in CORES_LOGO]
    melhor = None
    for dy in range(-3, 4):
        for dx in range(-8, 3):
            cabe = sum(
                1 for j, i in pontos
                if 0 <= y0 + dy + j < rgba.shape[0] and 0 <= x0 + dx + i < rgba.shape[1] and camisa[y0 + dy + j, x0 + dx + i]
            )
            nota = cabe * 10 - abs(dx) - abs(dy)
            if melhor is None or nota > melhor[0]:
                melhor = (nota, dx, dy)
    _, dx, dy = melhor
    for j, linha in enumerate(LOGO):
        for i, ch in enumerate(linha):
            if ch in CORES_LOGO:
                y, x = y0 + dy + j, x0 + dx + i
                if 0 <= y < rgba.shape[0] and 0 <= x < rgba.shape[1] and camisa[y, x]:
                    rgba[y, x, :3] = CORES_LOGO[ch]
    return rgba


# as 5 vistas da menina de exemplo: (arquivo, caixa x,y,w,h, caixas de detalhe, logo)
VISTAS = {
    'frente34': ('exemplo-frente', (26, 17, 444, 986), [(70, 20, 290, 230), (190, 255, 290, 320), (40, 230, 330, 480)], (254, 287)),
    'costas34': ('exemplo-costas', (50, 21, 376, 984), [(150, 40, 260, 200), (150, 330, 360, 470)], None),
    'frente': ('exemplo-vistas3', (160, 11, 423, 994), [(110, 15, 310, 240), (210, 250, 300, 310), (60, 240, 360, 480)], (258, 281)),
    'perfil': ('exemplo-vistas3', (617, 11, 263, 991), [(140, 50, 263, 220), (150, 230, 263, 470)], None),
    'costas': ('exemplo-vistas3', (964, 11, 426, 987), [(90, 260, 340, 480)], None),
}


def main():
    altura = int(sys.argv[1]) if len(sys.argv) > 1 else 192
    cores = int(sys.argv[2]) if len(sys.argv) > 2 else 56
    destino = sys.argv[3] if len(sys.argv) > 3 else os.path.join(RAIZ, 'arte', 'hall', 'menina')
    nomes = list(VISTAS)
    desenhos, detalhes = [], []
    for n in nomes:
        arq, (x, y, w, h), det, _ = VISTAS[n]
        folha = cv2.imread(os.path.join(RAIZ, 'arte', 'hall', 'menina', arq + '.webp'), cv2.IMREAD_UNCHANGED)
        desenhos.append(folha[y:y + h, x:x + w])
        detalhes.append(det)
    # a mesma paleta para todas as vistas: ao girar, a cor nao "pisca"
    pixeladas = pixelar(desenhos, altura, cores, detalhes)
    for n, d, px in zip(nomes, desenhos, pixeladas):
        logo = VISTAS[n][3]
        if logo:
            k = altura / d.shape[0]
            # a versao espelhada (andando para o outro lado) carimba o logo DEPOIS
            # de espelhar -- senao a letra sai ao contrario
            esp = carimbar_logo(px[:, ::-1].copy(), px.shape[1] - 1 - logo[0] * k, logo[1] * k)
            cv2.imwrite(os.path.join(destino, f'pixel-{n}-espelho-{altura}.png'), esp)
            px = carimbar_logo(px, logo[0] * k, logo[1] * k)
        else:
            cv2.imwrite(os.path.join(destino, f'pixel-{n}-espelho-{altura}.png'), px[:, ::-1])
        cv2.imwrite(os.path.join(destino, f'pixel-{n}-{altura}.png'), px)
    print('ok', [p.shape[:2] for p in pixeladas])


if __name__ == '__main__':
    main()
