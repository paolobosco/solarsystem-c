// Texture dei corpi (§ 8.12, R10): caricate quando il raggio apparente supera 8 px (§ 8.1).
// Le immagini restano in memoria (cache CPU) per il ripristino del contesto WebGL (R13).

import { LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, ClampToEdgeWrapping, SRGBColorSpace, Texture } from 'three';
import type { CorpoCatalogo } from '../data/catalogTypes';
import type { DataStore } from '../data/types';

export type ImmagineTexture = ImageBitmap | HTMLCanvasElement | HTMLImageElement | OffscreenCanvas;

export interface FornitoreTexture {
  /** Immagine equirettangolare (riga 0 = polo nord, colonna 0 = u 0) o null se assente. */
  carica(corpo: CorpoCatalogo, segnale: AbortSignal): Promise<ImmagineTexture | null>;
}

/** Fornitore basato su DataStore: legge corpo.texture.file (JPEG) e lo decodifica con createImageBitmap. */
export function fornitoreTextureDaDataStore(store: DataStore): FornitoreTexture {
  return {
    async carica(corpo, segnale) {
      if (!corpo.texture) return null;
      const buf = await store.carica(corpo.texture.file, segnale);
      const tipo = corpo.texture.file.endsWith('.png') ? 'image/png' : 'image/jpeg';
      return createImageBitmap(new Blob([buf], { type: tipo }), { imageOrientation: 'none', colorSpaceConversion: 'none' });
    },
  };
}

/** Texture three da un'immagine: sRGB, mipmap, ripetizione in u, nessun capovolgimento. */
export function creaTextureCorpo(img: ImmagineTexture, maxAnisotropia: number): Texture {
  const t = new Texture(img);
  t.colorSpace = SRGBColorSpace;
  t.flipY = false;
  t.wrapS = RepeatWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = Math.min(8, maxAnisotropia);
  t.needsUpdate = true;
  return t;
}
