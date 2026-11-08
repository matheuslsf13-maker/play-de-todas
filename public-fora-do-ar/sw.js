/* Service worker de SAIDA do Play de Terca (/masculino/) e do Play Mista (/mista/), que sairam do ar
   (dono, 08/11/2026). O celular que tinha um deles instalado busca este arquivo para se atualizar: ele
   apaga os arquivos guardados desse app, se desinstala e leva as telas abertas para o Play de Todas. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const escopo = new URL('./', self.location.href).pathname.replace(/[^a-z0-9]+/gi, '-')
    for (const k of await caches.keys()) if (k.startsWith('play@' + escopo + '@')) await caches.delete(k)
    await self.registration.unregister()
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(new URL('../', self.location.href).href)
  })())
})
