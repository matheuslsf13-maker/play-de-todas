# -*- coding: utf-8 -*-
"""Transforma os quadros da animacao (scripts/hall/quadros.mjs) em PIXEL ART e
monta a folha de sprites que o app usa.

Usa o mesmo processo aprovado nas 8 direcoes (scripts/hall/pixel.py): realce dos
tracos, encolher pela media, UMA paleta para todos os quadros (senao a cor
"pisca" de um quadro para o outro), rosto e logo sem limpeza, contorno de 1 pixel
e o logo "Play" redesenhado a mao.

  public/hall/menina/<nome>.png    a folha de sprites
  public/hall/menina/<nome>.json   onde esta cada quadro e as animacoes

Uso: python scripts/hall/sprites.py exemplo
"""
import importlib.util
import json
import os
import sys

import cv2
import numpy as np

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PASTA = os.path.join(RAIZ, 'arte', 'hall', 'menina')
QUADROS = os.path.join(PASTA, 'quadros')

_spec = importlib.util.spec_from_file_location('pixel', os.path.join(RAIZ, 'scripts', 'hall', 'pixel.py'))
px = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(px)

CORES = 64
POR_LINHA = 16


def encolher(rgba, S):
    """Do quadro em alta (S x S por pixel) para o pixel do sprite, pela media."""
    h, w = rgba.shape[0] // S, rgba.shape[1] // S
    a = rgba[:, :, 3:4].astype(np.float32) / 255
    cor = cv2.resize(rgba[:, :, :3].astype(np.float32) * a, (w, h), interpolation=cv2.INTER_AREA)
    al = cv2.resize(a[:, :, 0], (w, h), interpolation=cv2.INTER_AREA)
    return np.clip(cor / np.maximum(al[:, :, None], 1e-3), 0, 255), al


def realce(rgba, sigma):
    cor = rgba[:, :, :3].astype(np.float32)
    borrada = cv2.GaussianBlur(cor, (0, 0), sigma)
    out = rgba.copy()
    out[:, :, :3] = np.clip(cor + 0.7 * (cor - borrada), 0, 255).astype(np.uint8)
    return out


def main():
    nome = sys.argv[1] if len(sys.argv) > 1 else 'exemplo'
    info = json.load(open(os.path.join(QUADROS, 'quadros.json'), encoding='utf-8'))
    S = info['S']
    Q = info['QUADRO']
    W, H = Q['largura'], Q['altura']
    quadros = info['quadros']

    encolhidos = []
    for q in quadros:
        alta = cv2.imread(os.path.join(QUADROS, q['id'] + '.png'), cv2.IMREAD_UNCHANGED)
        cor, al = encolher(realce(alta, 1.7 * S / 4), S)
        # area de detalhe: o rosto (em volta do pescoco, para cima) e o logo
        det = np.zeros((H, W), bool)
        if q['cabeca']:
            cx, cy = q['cabeca']
            det[max(0, int(cy - 34)):int(cy + 2), max(0, int(cx - 18)):int(cx + 18)] = True
        if q['logo']:
            lx, ly = q['logo']
            det[max(0, int(ly - 6)):int(ly + 7), max(0, int(lx - 12)):int(lx + 12)] = True
        encolhidos.append((cor, al, det))

    # a paleta sai dos quadros parados de olho aberto (a pose aprovada), com o
    # rosto e o logo pesando mais
    amostras = []
    for (cor, al, det), q in zip(encolhidos, quadros):
        if q['tipo'] == 'parada' and not q['piscando'] and q['i'] % 4 == 0:
            amostras.append(cor[al > 0.5])
            amostras.append(np.repeat(cor[(al > 0.5) & det], 10, axis=0))
    centros = px.paleta(np.vstack(amostras), CORES)
    np.save(os.path.join(PASTA, f'paleta-{nome}.npy'), centros)

    folha = np.zeros((H * ((len(quadros) + POR_LINHA - 1) // POR_LINHA), W * POR_LINHA, 4), np.uint8)
    saida_quadros = []
    for k, ((cor, al, det), q) in enumerate(zip(encolhidos, quadros)):
        opaco = al > 0.5
        bruto = px.prender(cor, opaco, centros)
        idx = px.limpar_soltos(bruto)
        idx[det] = bruto[det]
        bgr, ok = px.colorir(idx, centros)
        bgr = px.contorno(bgr, ok)
        spr = np.dstack([bgr, np.where(ok, 255, 0).astype(np.uint8)])
        if q['logo']:
            spr = px.carimbar_logo(spr, q['logo'][0], q['logo'][1])
        x, y = (k % POR_LINHA) * W, (k // POR_LINHA) * H
        folha[y:y + H, x:x + W] = spr
        saida_quadros.append([x, y])

    # as animacoes: direcao -> tipo -> lista de quadros (indices)
    anims = {}
    for k, q in enumerate(quadros):
        dirc = q['vista'] + ('E' if q['espelho'] else '')
        chave = q['tipo'] + ('-piscando' if q['piscando'] else '')
        anims.setdefault(dirc, {}).setdefault(chave, []).append(k)
    destino = os.path.join(RAIZ, 'public', 'hall', 'menina')
    os.makedirs(destino, exist_ok=True)
    cv2.imwrite(os.path.join(destino, f'{nome}.png'), folha, [cv2.IMWRITE_PNG_COMPRESSION, 9])
    json.dump(
        {'largura': W, 'altura': H, 'peX': Q['peX'], 'peY': Q['peY'], 'quadros': saida_quadros, 'animacoes': anims},
        open(os.path.join(destino, f'{nome}.json'), 'w', encoding='utf-8'),
        separators=(',', ':'),
    )
    print('ok', folha.shape, os.path.getsize(os.path.join(destino, f'{nome}.png')) // 1024, 'KB')


if __name__ == '__main__':
    main()
