# -*- coding: utf-8 -*-
"""Prepara a "pele" de uma menina do Hall para a animacao.

Para cada vista (src/lib/hall/menina-<nome>.json) recorta o desenho inteiro da
folha do ChatGPT e divide em PARTES, seguindo o contorno do desenho:

  1 corpo (com a cabeca)   2 braco perto   3 braco longe
  4 perna perto            5 perna longe   6 cabelo (o que balanca)

e grava um "atlas": uma coluna por parte, cada uma so com os pixels dela e,
por baixo das partes que ficam na frente, a CONTINUACAO dela (a camisa embaixo
do cabelo, a coxa embaixo da mao) -- para nao abrir buraco quando a parte da
frente se mexe. Uma 7a coluna e o corpo com os OLHOS FECHADOS (piscar).

  arte/hall/menina/pele-<vista>.png         o atlas (so para gerar os quadros)
  arte/hall/menina/partes-<vista>.png       conferencia: as partes coloridas e os pivos

Uso: python scripts/hall/menina.py exemplo
"""
import json
import os
import sys

import cv2
import numpy as np

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PASTA = os.path.join(RAIZ, 'arte', 'hall', 'menina')

PARTES = ['corpo', 'bracoPerto', 'bracoLonge', 'pernaPerto', 'pernaLonge', 'cabelo']
NUM = {p: i + 1 for i, p in enumerate(PARTES)}
# por baixo de QUAIS partes cada uma continua, ate onde (px do desenho) e com a
# cor de quem. So onde faz sentido: a camisa embaixo do braco, a perna de tras
# embaixo da da frente, a coxa embaixo da mao. Atras do cabelo o que existe e
# MAIS cabelo (com cor de pele ali, o balanco mostrava uma mancha). O short nao
# continua coxa abaixo: aparecia como mancha quando a perna se mexia.
CONTINUA = {
    'corpo': [(['bracoPerto', 'bracoLonge'], 90, 'corpo'), (['cabelo'], 30, 'cabelo')],
    'pernaLonge': [(['bracoPerto', 'bracoLonge'], 30, 'pernaLonge')],
    'pernaPerto': [(['bracoPerto', 'bracoLonge'], 40, 'pernaPerto')],
    'bracoPerto': [],
    'bracoLonge': [],
    # o cabelo que cai ATRAS do braco continua um pouco por baixo dele
    'cabelo': [(['bracoPerto', 'bracoLonge'], 16, 'cabelo')],
}


def limpar(rgba):
    """So o pedaco principal, e a cor da borda meio transparente vem do vizinho
    opaco (sem franja)."""
    a = rgba[:, :, 3].astype(np.float32)
    n, rot, info, _ = cv2.connectedComponentsWithStats((a > 40).astype(np.uint8), 8)
    if n > 2:
        maior = 1 + int(np.argmax(info[1:, cv2.CC_STAT_AREA]))
        a[rot != maior] = 0
    opaco = (a > 230).astype(np.float32)
    cor = rgba[:, :, :3].astype(np.float32)
    soma = cv2.blur(cor * opaco[:, :, None], (5, 5))
    peso = cv2.blur(opaco, (5, 5))[:, :, None]
    viz = np.where(peso > 0.01, soma / np.maximum(peso, 0.01), cor)
    cor = np.where((a > 230)[:, :, None], cor, viz)
    return np.dstack([np.clip(cor, 0, 255), a]).astype(np.uint8)


def poligono(pol, forma, desloc):
    m = np.zeros(forma, np.uint8)
    if pol:
        cv2.fillPoly(m, [np.array(pol, np.int32) - desloc], 1)
    return m


def rotular(img, v):
    """Corta o desenho em partes pelo contorno (watershed), a partir de sementes."""
    gx, gy = v['gabarito'][:2]
    h, w = img.shape[:2]
    alfa = img[:, :, 3]
    opaco = (alfa > 200).astype(np.uint8)
    hsv = cv2.cvtColor(img[:, :, :3], cv2.COLOR_BGR2HSV)
    marcas = np.zeros((h, w), np.int32)

    membros = np.zeros((h, w), np.uint8)
    # pernas antes dos bracos: onde a mao encosta na coxa, a mao e do braco
    regioes = sorted(v['regioes'].items(), key=lambda kv: kv[0].startswith('braco'))
    for nome, pol in regioes:
        m = poligono(pol, (h, w), (gx, gy))
        membros |= m
        marcas[cv2.erode(m & opaco, np.ones((21, 21), np.uint8)) > 0] = NUM[nome]
    corpo = opaco & (1 - cv2.dilate(membros, np.ones((31, 31), np.uint8)))
    marcas[cv2.erode(corpo, np.ones((9, 9), np.uint8)) > 0] = NUM['corpo']

    # cabelo: castanho escuro, fora do rosto (sobrancelha e olho sao do rosto)
    rosto = poligono(v.get('rosto') or [], (h, w), (gx, gy))
    cabelo = ((hsv[:, :, 0] <= 25) | (hsv[:, :, 0] >= 170)) & (hsv[:, :, 2] < 185) & (hsv[:, :, 1] > 60) & (alfa > 200)
    cabelo = cabelo.astype(np.uint8) & (1 - rosto)
    # o cabelo acaba na cintura: abaixo disso, o escuro e sombra da pele/short
    cabelo[max(0, v.get('cabeloAte', 520) - gy):] = 0
    cabelo = cv2.morphologyEx(cabelo, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    marcas[cv2.erode(cabelo, np.ones((5, 5), np.uint8)) > 0] = NUM['cabelo']
    # o rosto e do corpo (cabeca), mesmo nos pontos escuros
    marcas[cv2.erode(rosto & opaco, np.ones((5, 5), np.uint8)) > 0] = NUM['corpo']

    # o short (azul-marinho) e do corpo: a barra nao pode ir com a perna
    short = (hsv[:, :, 0] > 95) & (hsv[:, :, 0] < 135) & (hsv[:, :, 1] > 60) & (hsv[:, :, 2] < 130) & (alfa > 100)
    short[: int(h * 0.4)] = False
    marcas[short] = NUM['corpo']
    marcas[alfa < 20] = 99
    cv2.watershed(np.ascontiguousarray(img[:, :, :3]), marcas)
    divisa = marcas == -1
    viz = cv2.dilate(np.where(divisa | (marcas == 99), 0, marcas).astype(np.uint8), np.ones((3, 3), np.uint8))
    marcas[divisa] = viz[divisa]
    marcas[short] = NUM['corpo']
    return np.where((marcas >= 1) & (marcas <= 6) & (alfa > 0), marcas, 0).astype(np.uint8)


def continuar(cor, minha, onde):
    """Pinta `onde` com a cor do pixel MAIS PERTO de `minha` (e suaviza um pouco)."""
    if not onde.any() or not minha.any():
        return cor
    # a cor vem de DENTRO da parte, nao da borda: o contorno escuro do desenho
    # virava mancha marrom quando a parte da frente saia de cima
    fonte = cv2.erode(minha, np.ones((9, 9), np.uint8))
    if fonte.sum() < 50:
        fonte = minha
    _, rot = cv2.distanceTransformWithLabels((1 - fonte).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(fonte)
    tabela = np.zeros((rot.max() + 1, 3), np.uint8)
    tabela[rot[ys, xs]] = cor[ys, xs]
    perto = tabela[rot]
    suave = cv2.GaussianBlur(perto, (0, 0), 4.0)
    out = cor.copy()
    out[onde] = suave[onde]
    return out


def fechar_olhos(img, olhos, desloc):
    """Palpebra: o olho vira pele (a cor logo acima dele) e uma linha de cilios."""
    out = img.copy()
    for cx, cy, rx, ry in olhos:
        cx, cy = cx - desloc[0], cy - desloc[1]
        # a palpebra tem a cor da pele logo ABAIXO do olho (em cima e sombra/maquiagem),
        # um tiquinho mais rosada
        anel = out[int(cy + ry * 1.9):int(cy + ry * 3.0), int(cx - rx * 0.7):int(cx + rx * 0.7), :3].reshape(-1, 3)
        pele = np.median(anel, axis=0) if len(anel) else np.array([150, 190, 240])
        pele = np.clip(pele * np.array([0.97, 0.95, 1.0]), 0, 255)
        m = np.zeros(out.shape[:2], np.uint8)
        cv2.ellipse(m, (int(cx), int(cy)), (int(rx * 1.2), int(ry * 1.45)), 0, 0, 360, 1, -1)
        m = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 1.5)[:, :, None]
        out[:, :, :3] = (out[:, :, :3] * (1 - m) + pele * m).astype(np.uint8)
        # cilios: um arco escuro na metade de baixo
        cv2.ellipse(out, (int(cx), int(cy + ry * 0.2)), (int(rx * 1.15), int(ry * 0.9)), 0, 10, 170, (30, 28, 40, 255), 3, cv2.LINE_AA)
    return out


def main():
    nome = sys.argv[1] if len(sys.argv) > 1 else 'exemplo'
    cfg = json.load(open(os.path.join(RAIZ, 'src', 'lib', 'hall', f'menina-{nome}.json'), encoding='utf-8'))
    cores = {1: (210, 210, 210), 2: (0, 0, 255), 3: (255, 0, 0), 4: (0, 190, 0), 5: (255, 0, 255), 6: (0, 200, 255)}
    folhas = {}
    for vista, v in cfg['vistas'].items():
        if v['folha'] not in folhas:
            folhas[v['folha']] = cv2.imread(os.path.join(PASTA, v['folha'] + '.webp'), cv2.IMREAD_UNCHANGED)
        gx, gy, gw, gh = v['gabarito']
        img = limpar(folhas[v['folha']][gy:gy + gh, gx:gx + gw])
        rot = rotular(img, v)
        ordem = [NUM[p] for p in v['ordem']]
        fonte = {NUM[a]: NUM[b] for a, b in (v.get('duplicar') or {}).items()}
        cor = img[:, :, :3]
        colunas = {}
        for num in range(1, 7):
            if num in fonte:
                continue  # copia: feita depois, da coluna pronta da outra
            minha = (rot == num).astype(np.uint8)
            c = cor.copy()
            a = np.where(minha > 0, img[:, :, 3], 0).astype(np.uint8)
            for debaixo, alcance, de_quem in CONTINUA[PARTES[num - 1]]:
                # so por baixo das que estao na frente dela nesta vista
                debaixo = [NUM[d] for d in debaixo if NUM[d] in ordem and ordem.index(NUM[d]) > ordem.index(num)]
                if not debaixo:
                    continue
                perto = cv2.dilate(minha, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * alcance + 1, 2 * alcance + 1)))
                extra = (perto & np.isin(rot, debaixo) & (a == 0)).astype(bool)
                if num == NUM['corpo'] and de_quem == 'corpo':
                    # a camisa so continua DENTRO do contorno do tronco: o braco
                    # solto do lado do corpo nao tem camisa atras dele
                    pts = cv2.findNonZero(minha)
                    casco = np.zeros(minha.shape, np.uint8)
                    if pts is not None:
                        cv2.fillConvexPoly(casco, cv2.convexHull(pts), 1)
                    extra &= casco.astype(bool)
                c = continuar(c, (rot == NUM[de_quem]).astype(np.uint8), extra)
                a[extra] = 255
            c[a == 0] = 0
            colunas[num] = np.dstack([c, a])
        for num, src in fonte.items():
            c = colunas[src].copy()
            c[:, :, :3] = (c[:, :, :3].astype(np.float32) * 0.8).astype(np.uint8)  # o de tras, na sombra
            colunas[num] = c
        colunas = [colunas[n] for n in range(1, 7)]
        corpo_piscando = colunas[0].copy()
        if v.get('olhos'):
            corpo_piscando = fechar_olhos(corpo_piscando, v['olhos'], (gx, gy))
        colunas.append(corpo_piscando)
        cv2.imwrite(os.path.join(PASTA, f'pele-{vista}.png'), np.hstack(colunas))

        a = img[:, :, 3:4] / 255.0
        vis = (img[:, :, :3] * a + 235 * (1 - a)).astype(np.uint8)
        cam = vis.copy()
        for k, c in cores.items():
            cam[rot == k] = c
        vis = cv2.addWeighted(cam, 0.4, vis, 0.6, 0)
        for o in v['ossos'].values():
            cv2.circle(vis, (o['pivo'][0] - gx, o['pivo'][1] - gy), 6, (0, 0, 0), -1)
        cv2.imwrite(os.path.join(PASTA, f'partes-{vista}.png'), vis)
        print(vista, 'ok', {p: int((rot == NUM[p]).sum()) for p in PARTES})


if __name__ == '__main__':
    main()
