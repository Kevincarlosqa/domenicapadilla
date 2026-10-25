/**
 * Fotografía editorial de Unsplash (licencia Unsplash: uso comercial libre, sin atribución obligatoria).
 * Se muestra en blanco y negro. Reemplaza los ids por fotos propias del estudio cuando las tengas
 * (o cambia `src` por una ruta de /public).
 */
export interface Photo {
  id: string;
  alt: string;
}

const u = (id: string, alt: string): Photo => ({ id, alt });

export const PHOTOS = {
  heroMain: u("photo-1637851497145-0faa2e456081", "Mujer con los ojos cerrados y cejas definidas, luz suave"),
  heroLashes: u("photo-1683719312734-e31de63957ab", "Primer plano de pestañas largas y curvadas"),
  heroPortrait: u("photo-1563170446-9c3c0622d8a9", "Retrato de una mujer de mirada serena"),
  brows: u("photo-1777521778743-d152c0404e32", "Primer plano de una ceja y un ojo en blanco y negro"),
  browsWork: u("photo-1519415387722-a1c3bbef716c", "Especialista diseñando cejas con hilo"),
  lashes: u("photo-1589710751893-f9a6770ad71b", "Aplicación de extensiones de pestañas con pinzas"),
  lashArtist: u("photo-1772235616130-b80e12f0ab7a", "Esteticista aplicando extensiones de pestañas"),
  lips: u("photo-1654374504608-67c4cfe65fca", "Labios definidos con color natural"),
  skin: u("photo-1552693673-1bf958298935", "Tratamiento facial en cabina"),
  skinMassage: u("photo-1741934023052-26baf5535088", "Masaje facial con los ojos cerrados"),
  nails: u("photo-1630843599725-32ead7671867", "Manicure en tono nude"),
  hair: u("photo-1700760934268-8aa0ef52ce0a", "Estilista cortando cabello largo"),
  makeup: u("photo-1487412947147-5cebf100ffc2", "Mujer aplicándose labial frente al espejo"),
  portraitHands: u("photo-1508186225823-0963cf9ab0de", "Retrato en blanco y negro con las manos en el rostro"),
  portraitProfile: u("photo-1695822341415-84af280d2579", "Perfil de mujer en blanco y negro"),
  portraitShoulders: u("photo-1508184964240-ee96bb9677a7", "Mujer con hombros descubiertos en blanco y negro"),
  portraitDark: u("photo-1620122303020-87ec826cf70d", "Retrato de mujer con fondo oscuro"),
  portraitEyesClosed: u("photo-1633382933634-5be93a64aaeb", "Mujer con los ojos cerrados en blanco y negro"),
  portraitElegant: u("photo-1699206791200-414d95e68450", "Mujer posando con la mano en el mentón"),
} as const;

export const CATEGORY_PHOTOS = {
  BROWS: PHOTOS.brows,
  LASHES: PHOTOS.lashes,
  LIPS: PHOTOS.lips,
  SKIN: PHOTOS.skin,
  NAILS: PHOTOS.nails,
  HAIR: PHOTOS.hair,
  MAKEUP: PHOTOS.makeup,
} as const;

/** Foto por servicio (slug). Si un servicio no está aquí, se usa la de su categoría. */
export const SERVICE_PHOTOS: Record<string, Photo> = {
  microblading: PHOTOS.brows,
  microshading: PHOTOS.heroMain,
  "cejas-hibridas": PHOTOS.portraitHands,
  "laminado-cejas": u("photo-1534143826428-81fc61582afd", "Dos rostros con cejas definidas y peinadas"),
  "diseno-henna": PHOTOS.browsWork,
  "lifting-pestanas": PHOTOS.heroLashes,
  extensiones: PHOTOS.lashes,
  delineado: u("photo-1542833807-ad5af0977050", "Primer plano de un ojo con delineado"),
  "lip-blush": PHOTOS.lips,
  "neutralizacion-labios": u("photo-1584457361626-06effef61a7c", "Primer plano de labios entreabiertos"),
  "limpieza-profunda": u("photo-1616394584738-fc6e612e71b9", "Mujer con mascarilla de limpieza facial"),
  hydrafacial: PHOTOS.skin,
  dermapen: u("photo-1761718210089-ba3bb5ccb54f", "Tratamiento facial en cabina"),
  "bb-glow": PHOTOS.skinMassage,
  "manicure-semi": PHOTOS.nails,
  "unas-gel": u("photo-1604654894610-df63bc536371", "Uñas esculpidas con diseño y anillo"),
  "pedicure-spa": u("photo-1610992015762-45dca7fa3a85", "Mano con uñas nude sobre textura suave"),
  "corte-brushing": PHOTOS.hair,
  balayage: u("photo-1629397685944-7073f5589754", "Estilista ondulando cabello con iluminación"),
  "color-raiz": u("photo-1580618672591-eb180b1a973f", "Estilista secando cabello con cepillo redondo"),
  keratina: u("photo-1634449571010-02389ed0f9b0", "Lavado de cabello en el salón"),
  "maquillaje-social": PHOTOS.makeup,
  peinado: PHOTOS.portraitElegant,
};

export function unsplash(photo: Photo) {
  return `https://images.unsplash.com/${photo.id}?auto=format&fit=crop&w=2000&q=80`;
}
