import satori from 'satori';
import { initWasm, Resvg } from '@resvg/resvg-wasm';

export class OgEngine {
  private static wasmInitialized = false;

  /**
   * 🛡️ Inicijalizacija resvg WASM modula
   */
  private static async ensureWasmInitialized() {
    if (this.wasmInitialized) return;
    
    // U Cloudflare Workers okruženju, WASM module obično dobijamo preko binding-a ili specifičnog importa
    // Ovde koristimo dinamički import koji Wrangler prepoznaje
    // @ts-ignore
    const resvgWasm = await import('@resvg/resvg-wasm/index_bg.wasm');
    
    await initWasm(resvgWasm.default);
    this.wasmInitialized = true;
  }

  /**
   * 🎨 Generiše sirovi PNG buffer na osnovu dinamičkih NBS podataka
   */
  static async generatePng(
    payload: { valuta: string; kurs: string; promena: string; raste: boolean },
    fontBuffer: ArrayBuffer
  ): Promise<Uint8Array> {
    await this.ensureWasmInitialized();

    // JSX-like struktura za Satori
    const element = {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          backgroundColor: '#0f172a',
          padding: '60px',
          justifyContent: 'space-between',
        },
        children: [
          {
            type: 'div',
            props: {
              style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
              children: [
                { type: 'span', props: { style: { color: '#94a3b8', fontSize: '32px', fontWeight: 'bold' }, children: 'ZVANIČNI SREDNJI KURS NBS' } },
                { type: 'span', props: { style: { color: '#10b981', fontSize: '28px', backgroundColor: '#064e3b', padding: '10px 20px', borderRadius: '12px' }, children: '● SEF SYNCED' } }
              ]
            }
          },
          {
            type: 'div',
            props: {
              style: { display: 'flex', flexDirection: 'column', marginTop: 'auto', marginBottom: 'auto' },
              children: [
                { type: 'h1', props: { style: { color: '#ffffff', fontSize: '120px', margin: 0, fontWeight: 900 }, children: `${payload.valuta} = ${payload.kurs} RSD` } }
              ]
            }
          },
          {
            type: 'div',
            props: {
              style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
              children: [
                { type: 'span', props: { style: { color: '#64748b', fontSize: '28px' }, children: 'Generisano preko sef.rs platforme' } },
                { 
                  type: 'span', 
                  props: { 
                    style: { 
                      color: payload.raste ? '#10b981' : '#f43f5e', 
                      fontSize: '36px', 
                      fontWeight: 'bold' 
                    }, 
                    children: `${payload.raste ? '▲' : '▼'} ${payload.promena}%` 
                  } 
                }
              ]
            }
          }
        ]
      }
    };

    const svg = await satori(element as any, {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Inter',
          data: fontBuffer,
          weight: 700,
          style: 'normal',
        },
      ],
    });

    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1200 },
    });

    return resvg.render().asPng();
  }
}
