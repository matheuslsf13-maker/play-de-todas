# -*- coding: utf-8 -*-
"""Prepara o boneco articulado de uma menina do Hall.

Le a folha de pecas (arte/hall/menina/<folha>.webp, com transparencia) e o
encaixe em src/lib/hall/menina-<nome>.json, e grava:

  public/hall/menina/<folha>-<peca>.webp   cada peca recortada e limpa
  arte/hall/menina/conferencia-<vista>.png  o boneco montado AO LADO do gabarito

A conferencia e o que diz se o encaixe esta certo: o boneco montado (parado)
tem que parecer o gabarito. Ajuste 'lugar' e os pivos no JSON e rode de novo.

Uso: python scripts/hall/menina.py exemplo
"""
import json
import os
import sys

import cv2
import numpy as np

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def limpar(rgba, tirar_branco=False):
    """Bordas sem franja colorida e (na cabeca) sem a regata branca que o
    ChatGPT desenha embaixo do pescoco."""
    a = rgba[:, :, 3].astype(np.float32)
    # so o pedaco principal: a caixa pega pontas das pecas vizinhas da folha
    n, rotulos, info, _ = cv2.connectedComponentsWithStats((a > 40).astype(np.uint8), 8)
    if n > 2:
        maior = 1 + int(np.argmax(info[1:, cv2.CC_STAT_AREA]))
        a[rotulos != maior] = 0
    if tirar_branco:
        hsv = cv2.cvtColor(rgba[:, :, :3], cv2.COLOR_BGR2HSV)
        branco = (hsv[:, :, 1] < 40) & (hsv[:, :, 2] > 200)
        branco[: int(rgba.shape[0] * 0.45)] = False  # so na parte de baixo (o rosto tem brilhos brancos)
        a[branco] = 0
        a = cv2.morphologyEx(a, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    # a cor dos pixels meio transparentes vem do vizinho opaco (sem halo)
    opaco = (a > 230).astype(np.float32)
    cor = rgba[:, :, :3].astype(np.float32)
    soma = cv2.blur(cor * opaco[:, :, None], (5, 5))
    peso = cv2.blur(opaco, (5, 5))[:, :, None]
    viz = np.where(peso > 0.01, soma / np.maximum(peso, 0.01), cor)
    cor = np.where((a > 230)[:, :, None], cor, viz)
    out = np.dstack([np.clip(cor, 0, 255), a]).astype(np.uint8)
    return out


def esfumar_cima(rgba, frac):
    """Some com a ponta de cima (fracao da altura): o ombro do braco fica
    embaixo da manga do tronco, e a bola do joelho, embaixo da coxa."""
    if not frac:
        return rgba
    h = rgba.shape[0]
    corte = int(h * frac)
    rampa = np.ones(h, np.float32)
    rampa[:corte] = 0
    rampa[corte:corte + 4] = np.linspace(0, 1, min(4, h - corte))
    rgba = rgba.copy()
    rgba[:, :, 3] = (rgba[:, :, 3] * rampa[:, None]).astype(np.uint8)
    return rgba


def esfumar_baixo(rgba, px):
    """A ponta de baixo some aos poucos (a coxa termina dentro da canela)."""
    if not px:
        return rgba
    h = rgba.shape[0]
    rampa = np.ones(h, np.float32)
    rampa[h - px:] = np.linspace(1, 0, px)
    rgba = rgba.copy()
    rgba[:, :, 3] = (rgba[:, :, 3] * rampa[:, None]).astype(np.uint8)
    return rgba


def main():
    nome = sys.argv[1] if len(sys.argv) > 1 else 'exemplo'
    cfg = json.load(open(os.path.join(RAIZ, 'src', 'lib', 'hall', f'menina-{nome}.json'), encoding='utf-8'))
    saida = os.path.join(RAIZ, 'public', 'hall', 'menina')
    os.makedirs(saida, exist_ok=True)
    for vista, v in cfg['vistas'].items():
        folha = cv2.imread(os.path.join(RAIZ, 'arte', 'hall', 'menina', v['folha'] + '.webp'), cv2.IMREAD_UNCHANGED)
        pecas = {}
        for pid, p in v['pecas'].items():
            x, y, w, h = p['caixa']
            img = limpar(folha[y:y + h, x:x + w], p.get('tirarBranco', False))
            img = esfumar_baixo(img, p.get('esfumar', 0))
            img = esfumar_cima(img, p.get('cortarCima', 0))
            pecas[pid] = img
            cv2.imwrite(os.path.join(saida, f"{v['folha']}-{pid}.webp"), img, [cv2.IMWRITE_WEBP_QUALITY, 92])

        # conferencia: monta parado e poe ao lado do gabarito
        gx, gy, gw, gh = v['gabarito']
        tela = np.zeros((1100, 520, 4), np.float32)
        desloc = np.array([60, 60])  # margem (a coroa sobe acima do topo)

        def cola(img, lugar):
            lx, ly, lw, lh = lugar
            if lw <= 0 or lh <= 0:
                return
            r = cv2.resize(img, (int(lw), int(lh)), interpolation=cv2.INTER_AREA).astype(np.float32)
            ox, oy = int(lx - gx + desloc[0]), int(ly - gy + desloc[1])
            x0, y0 = max(0, ox), max(0, oy)
            x1, y1 = min(tela.shape[1], ox + r.shape[1]), min(tela.shape[0], oy + r.shape[0])
            if x1 <= x0 or y1 <= y0:
                return
            pedaco = r[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
            al = pedaco[:, :, 3:4] / 255.0
            dst = tela[y0:y1, x0:x1]
            dst[:, :, :3] = pedaco[:, :, :3] * al + dst[:, :, :3] * (1 - al)
            dst[:, :, 3:4] = np.maximum(dst[:, :, 3:4], pedaco[:, :, 3:4])

        for pid in v['ordem']:
            cola(pecas[pid], v['pecas'][pid]['lugar'])
        fundo = np.full((1100, 520, 3), 235, np.float32)
        al = tela[:, :, 3:4] / 255.0
        montado = (tela[:, :, :3] * al + fundo * (1 - al)).astype(np.uint8)
        for oid, o in v['ossos'].items():
            px, py = o['pivo']
            cv2.circle(montado, (int(px - gx + desloc[0]), int(py - gy + desloc[1])), 5, (0, 0, 255), -1)
        gab = folha[gy:gy + gh, gx:gx + gw].astype(np.float32)
        ga = gab[:, :, 3:4] / 255.0
        gimg = np.full((1100, 520, 3), 235, np.float32)
        gimg[desloc[1]:desloc[1] + gh, desloc[0]:desloc[0] + gw] = gab[:, :, :3] * ga + 235 * (1 - ga)
        sobre = (0.5 * montado + 0.5 * gimg).astype(np.uint8)  # "papel vegetal": desalinhado aparece dobrado
        lado = np.hstack([montado, sobre, gimg.astype(np.uint8)])
        for yy in range(0, 1100, 100):
            cv2.line(lado, (0, yy), (lado.shape[1], yy), (180, 180, 255), 1)
        cv2.imwrite(os.path.join(RAIZ, 'arte', 'hall', 'menina', f'conferencia-{vista}.png'), cv2.resize(lado, None, fx=0.6, fy=0.6))
        print(vista, 'ok:', len(pecas), 'pecas')


if __name__ == '__main__':
    main()
