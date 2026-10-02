import sharp from 'sharp';

/** Capa de teste: PNG pequeno e bem colorido (azul forte com uma faixa laranja), para o tema ter o que extrair. */
export async function coverPng(): Promise<Buffer> {
  const band = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect x="0" y="120" width="200" height="60" fill="#e8741c"/></svg>',
  );
  return sharp({ create: { width: 200, height: 300, channels: 3, background: '#1f5fbf' } })
    .composite([{ input: band }])
    .png()
    .toBuffer();
}
