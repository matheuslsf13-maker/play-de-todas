# -*- coding: utf-8 -*-
"""Recorta os objetos do cenario do Hall (src/lib/hall/cena.json) da pintura
arte/hall/casa-deck.png e grava:

  public/hall/cena.webp          o fundo inteiro (mais leve que o PNG)
  public/hall/o-<id>.webp        cada objeto com transparencia, no tamanho da 'caixa'

O objeto recortado e desenhado POR CIMA da menina quando ela esta atras dele:
e isso que faz ela passar atras da sombrinha em vez de flutuar sobre a pintura.

Uso:  python scripts/hall/recortar.py [--ver]   (--ver grava uma folha de conferencia)
"""
import json
import os
import sys

import cv2
import numpy as np

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CENA = json.load(open(os.path.join(RAIZ, 'src', 'lib', 'hall', 'cena.json'), encoding='utf-8'))
PINTURA = cv2.imread(os.path.join(RAIZ, 'arte', 'hall', 'casa-deck.png'))
SAIDA = os.path.join(RAIZ, 'public', 'hall')
os.makedirs(SAIDA, exist_ok=True)

ALTURA, LARGURA = PINTURA.shape[:2]


LAB = cv2.cvtColor(PINTURA, cv2.COLOR_BGR2LAB).astype(np.float32)


def paleta_do_chao():
    """As cores do chao: os retangulos de 'amostras_chao' (madeira do deck e
    areia limpas, sem planta nem sombra de objeto), agrupados em 12 tons."""
    paletas = {}
    for tipo, caixas in CENA['amostras_chao'].items():
        amostra = np.vstack([LAB[y0:y1, x0:x1].reshape(-1, 3) for x0, y0, x1, y1 in caixas])
        _, _, centros = cv2.kmeans(amostra, 10, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0), 3, cv2.KMEANS_PP_CENTERS)
        if tipo == 'madeira':
            # as amostras pegam um pouco de folha, vaso branco e sombra: madeira
            # e quente (b alto) e nunca quase branca
            centros = centros[(centros[:, 2] > 165) & (centros[:, 0] < 235) & (centros[:, 0] > 90)]
        paletas[tipo] = centros
    return paletas


CHAO = paleta_do_chao()


def distancia_do_chao(x0, y0, x1, y1, tipo):
    """Para cada pixel, a distancia (Lab) ate o tom de chao mais parecido. Cada
    objeto compara so com o chao em que esta: o creme do sofa parece areia."""
    pix = LAB[y0:y1, x0:x1].reshape(-1, 1, 3)
    d = np.sqrt(((pix - CHAO[tipo].reshape(1, -1, 3)) ** 2).sum(axis=2)).min(axis=1)
    return d.reshape(y1 - y0, x1 - x0)


def mascara(o):
    """O que nao tem cor de chao, dentro da caixa, e objeto.

    Sem "inteligencia" de proposito (o GrabCut variava demais de um objeto para
    o outro): limiar de cor + limpeza + preenchimento dos buracos. Onde o objeto
    e da mesma cor do chao (madeira sobre madeira: cadeiras, balcao), o
    'nucleo' -- poligonos desenhados a mao -- entra inteiro."""
    x0, y0, x1, y1 = o['caixa']
    d = distancia_do_chao(x0, y0, x1, y1, o.get('chao', 'madeira'))
    a = np.where(d > o.get('limiar', 16), 255, 0).astype(np.uint8)
    a = cv2.morphologyEx(a, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    for p in o.get('nucleo', []):
        cv2.fillPoly(a, [np.array(p, np.int32) - [x0, y0]], 255)
    # preenche buracos (o que e fundo mas nao toca a borda da caixa)
    contornos, _ = cv2.findContours(a, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cheia = np.zeros_like(a)
    cv2.drawContours(cheia, contornos, -1, 255, cv2.FILLED)
    a = cheia
    # tira farelos: fica so o que tem tamanho de objeto
    n, rotulos, info, _ = cv2.connectedComponentsWithStats(a, 8)
    limpa = np.zeros_like(a)
    for i in range(1, n):
        if info[i, cv2.CC_STAT_AREA] >= 0.03 * a.size:
            limpa[rotulos == i] = 255
    # suaviza a borda (1 px), para nao serrilhar
    return cv2.GaussianBlur(limpa, (3, 3), 0)


def main():
    ver = '--ver' in sys.argv
    cv2.imwrite(os.path.join(SAIDA, 'cena.webp'), PINTURA, [cv2.IMWRITE_WEBP_QUALITY, 82])
    folhas = []
    for o in CENA['objetos']:
        if not o.get('ocluir'):
            continue  # encostado na parede: ninguem passa atras, so e obstaculo
        x0, y0, x1, y1 = o['caixa']
        a = mascara(o)
        rgba = cv2.cvtColor(PINTURA[y0:y1, x0:x1], cv2.COLOR_BGR2BGRA)
        rgba[:, :, 3] = a
        cv2.imwrite(os.path.join(SAIDA, f"o-{o['id']}.webp"), rgba, [cv2.IMWRITE_WEBP_QUALITY, 90])
        cobertura = (a > 127).mean()
        print(f"{o['id']:18s} {x1 - x0}x{y1 - y0}  cobre {cobertura:.0%}")
        if ver:
            vis = PINTURA[y0:y1, x0:x1].copy()
            vis[a < 128] = (255, 0, 255)
            folhas.append(vis)
    if ver:
        alt = max(f.shape[0] for f in folhas)
        linha = [cv2.copyMakeBorder(f, 0, alt - f.shape[0], 4, 4, cv2.BORDER_CONSTANT, value=(40, 40, 40)) for f in folhas]
        cv2.imwrite(os.path.join(RAIZ, 'arte', 'hall', 'conferencia-recortes.png'), np.hstack(linha))


if __name__ == '__main__':
    main()
