# Doménica Padilla — plataforma de reservas

*All types of beauty.* Estudio de micropigmentación y belleza con 7 sedes (Lima y Arequipa).

La plataforma tiene tres partes:

1. **Landing pública** (`/`): diseño editorial en blanco y negro con fotografía de Unsplash. El hero es un arco que se abre como un párpado, alterna retratos y se expande a pantalla completa con el scroll. Incluye servicios con precios por sede, estudio, método, equipo, mapa de sedes, demo del chat y reserva online con disponibilidad real.
2. **Asistente de WhatsApp con IA** (Claude): un solo número para toda la cadena. Elige la sede, reconoce a la clienta, consulta horarios reales y reserva, reprograma o cancela.
3. **Panel de gestión** (`/dashboard`): métricas, agenda por especialista con arrastrar y soltar, reservas, clientas con ficha técnica, bandeja de WhatsApp, simulador del bot y configuración. El acceso depende del rol y de la sede.

Las reglas de negocio y las decisiones tomadas están en [`docs/business-logic.md`](docs/business-logic.md).

---

## Arranque rápido (modo demo, sin configurar nada)

```bash
npm install
npm run dev
```

Abre <http://localhost:3000>. Sin `DATABASE_URL` la app usa **PGlite en memoria**: aplica la migración y siembra 7 sedes, 17 especialistas, 23 servicios, unas 520 clientas y los últimos 90 días de reservas más las próximas dos semanas. Los datos se pierden al reiniciar el servidor.

| Usuario (contraseña `demo1234`) | Qué ve |
|---|---|
| `owner@domenicapadilla.pe` | Todas las sedes, todo el panel |
| `admin@domenicapadilla.pe` | Igual que dirección, salvo crear otros usuarios de dirección |
| `sanisidro@domenicapadilla.pe` | Gerencia de Dasso y Begonias |
| `arequipa@domenicapadilla.pe` | Gerencia de Yanahuara |
| `recepcion.dasso@domenicapadilla.pe` | Agenda, reservas, clientas y bandeja de Dasso |
| `carla@domenicapadilla.pe` | Solo su agenda y sus clientas |

En **Panel → Simulador del bot** puedes probar el asistente sin WhatsApp. Sin `ANTHROPIC_API_KEY` funciona un flujo guiado por botones; con la clave responde Claude con sus herramientas.

## Stack

- **Next.js 16** (App Router, Cache Components, Server Actions, `after()`, `proxy.ts`), React 19, TypeScript estricto.
- **Tailwind CSS 4** (configurado en `src/app/globals.css` con `@theme`).
- **Motion** + **Lenis** (scroll suave), `next/image` con fotografía de Unsplash en blanco y negro.
- **Prisma 7** (`prisma-client` → `src/generated/prisma`, `prisma.config.ts`, `@prisma/adapter-pg`) sobre **PostgreSQL (Supabase)**. Modo demo con `@electric-sql/pglite`.
- Autenticación propia: `bcryptjs` + `jose` (JWT en una cookie httpOnly).
- **Zod 4**, **date-fns** + `@date-fns/tz`, **Recharts**, **lucide-react**.
- **Claude** (`@anthropic-ai/sdk`, modelo `claude-opus-5-5`) con tool use, thinking adaptativo y prompt caching.
- **WhatsApp Cloud API** (Meta).

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | `prisma generate` + build de producción |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm run lint` | ESLint (incluye las reglas del React Compiler) |
| `npm test` | Tests del motor de disponibilidad y de concurrencia (Vitest + PGlite) |
| `npm run db:migrate` | `prisma migrate dev` (crea migraciones nuevas, usa `DIRECT_URL`) |
| `npm run db:deploy` | `prisma migrate deploy` (aplica migraciones en producción) |
| `npm run db:seed` | Crea solo el usuario OWNER inicial |
| `npm run db:seed:demo` | Carga los datos de ejemplo en una base vacía |
| `npm run db:studio` | Prisma Studio |

---

## Puesta en marcha en producción

### 1. Supabase (PostgreSQL)

1. Crea un proyecto en <https://supabase.com> y elige la región **São Paulo** (`sa-east-1`), la más cercana a Lima.
2. Ve a **Project Settings → Database → Connection string**:
   - **Transaction pooler** (puerto 6543): ponla en `DATABASE_URL` y agrega `?pgbouncer=true&connection_limit=1` al final.
   - **Session pooler o conexión directa** (puerto 5432): ponla en `DIRECT_URL`.
3. Copia `.env.example` a `.env` y completa los valores.
4. Aplica la migración y crea el usuario inicial:

   ```bash
   npm run db:deploy
   npm run db:seed          # usuario OWNER (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD)
   # Opcional, solo para una base de pruebas:
   npm run db:seed:demo
   ```

5. Inicia sesión en `/login` y, en **Configuración**, carga las sedes reales (las coordenadas del seed son aproximadas), los servicios, las especialistas y sus horarios. Crea los usuarios de cada sede en **Usuarios y roles**.

### 2. Claude (Anthropic)

1. Crea una API key en <https://console.anthropic.com>.
2. Defínela en `ANTHROPIC_API_KEY`. El modelo se elige con `AI_MODEL` (por defecto `claude-opus-5-5`) y la profundidad de razonamiento con `AI_EFFORT` (por defecto `medium`; `low` es más barato y suele bastar para conversar).
3. El agente (`src/lib/ai-agent.ts`):
   - usa thinking adaptativo y fallbacks del lado del servidor (`fallbacks: "default"`) por si el modelo declina una respuesta;
   - cachea las herramientas, el system prompt y el catálogo;
   - envía como historial los últimos 20 mensajes y un resumen que se regenera cada 30;
   - valida con Zod cada llamada a una herramienta. Nunca inventa precios ni horarios porque todo sale de la base de datos.

### 3. WhatsApp Cloud API (Meta)

1. En <https://developers.facebook.com> crea una app de tipo **Business** y agrégale el producto **WhatsApp**.
2. Registra el número de la cadena (un solo número para todas las sedes) y anota su **Phone number ID** en `WHATSAPP_PHONE_NUMBER_ID`.
3. Crea un **System User** en Business Manager con permiso `whatsapp_business_messaging`, genera un token permanente y guárdalo en `WHATSAPP_TOKEN`.
4. En **App settings → Basic** copia el **App Secret** en `WHATSAPP_APP_SECRET`. Sirve para validar la firma `X-Hub-Signature-256`.
5. En **WhatsApp → Configuration → Webhook**:
   - URL de callback: `https://TU-DOMINIO/api/whatsapp/webhook`
   - Token de verificación: el mismo valor que pongas en `WHATSAPP_VERIFY_TOKEN`
   - Suscríbete al campo **messages**.
6. **Plantillas.** Fuera de la ventana de 24 h, WhatsApp solo deja enviar plantillas aprobadas. Crea estas dos en **WhatsApp Manager → Message templates**, en español y de categoría *Utility*:
   - `recordatorio_cita`. Cuerpo: `Hola {{1}}, te recordamos tu cita: {{2}} el {{3}} en {{4}}.` Botones de respuesta rápida: *Confirmar*, *Reprogramar* y *Cancelar*.
   - `lista_espera_hueco`. Cuerpo: `¡Se liberó un espacio en {{1}} el {{2}}! Responde a este mensaje para reservarlo.`
7. El webhook responde 200 de inmediato, descarta los mensajes repetidos por `waMessageId` y responde en segundo plano con `after()` (`maxDuration = 60`).

> Los enlaces `wa.me` de cada sede en la landing y en el footer usan los números actuales de la cadena. Cuando migres a un solo número, actualiza el teléfono de cada sede en **Configuración → Sedes** y `WHATSAPP_PUBLIC_NUMBER`.

### 4. Vercel

1. Importa el repositorio en <https://vercel.com/new>. Detecta Next.js solo, y `npm run build` ya ejecuta `prisma generate`.
2. Carga todas las variables de `.env.example` en **Settings → Environment Variables**, incluidas `APP_URL` con tu dominio y `CRON_SECRET` con una cadena aleatoria.
3. **Cron de recordatorios.** `GET /api/cron/reminders` envía los recordatorios de 24 h y 2 h; exige `Authorization: Bearer $CRON_SECRET` y es idempotente (llamarlo de más no duplica mensajes).
   - `vercel.json` lo programa **una vez al día** (13:00 UTC = 8:00 en Lima), que es lo máximo que permite el plan Hobby.
   - Para que corra **cada 15 minutos** gratis, el workflow `.github/workflows/reminders.yml` (GitHub Actions) llama al mismo endpoint. En GitHub → *Settings → Secrets and variables → Actions* crea `APP_URL` (p. ej. `https://tu-app.vercel.app`) y `CRON_SECRET` (el mismo de Vercel). Puedes lanzarlo a mano desde la pestaña *Actions* para probar.
   - Alternativa sin GitHub: [cron-job.org](https://cron-job.org), con la misma URL y la cabecera `Authorization`.
   - Con el plan **Pro** de Vercel puedes volver a `"*/15 * * * *"` en `vercel.json` y borrar el workflow.
4. Despliega y luego ejecuta `npm run db:deploy` contra la base de producción (desde tu máquina o en un paso de CI).
5. Configura la URL del webhook de Meta con el dominio final.

> **Modo demo en Vercel.** Si no defines `DATABASE_URL`, cada instancia serverless arranca su propia base en memoria. Sirve para una preview, pero las reservas no se comparten entre instancias. En producción usa siempre Supabase.

---

## Arquitectura

```
src/
├─ app/
│  ├─ page.tsx                     Landing (estática, se revalida por tag "catalog")
│  ├─ login/                       Login + server actions
│  ├─ dashboard/                   Panel (Inicio, Agenda, Reservas, Clientas, Conversaciones, Simulador, Configuración)
│  └─ api/
│     ├─ whatsapp/webhook          GET (verificación) / POST (firma, deduplicación, after())
│     ├─ cron/reminders            Recordatorios de 24 h y 2 h
│     ├─ public/{branches,catalog,availability,bookings}   API pública para la web
│     └─ dashboard/{conversations,simulator}               Bandeja (polling) y simulador
├─ lib/
│  ├─ availability-engine.ts       Motor de disponibilidad puro (sin BD), con tests
│  ├─ availability.ts              Carga de datos y consultas de disponibilidad
│  ├─ booking.ts                   Crear, reprogramar, cancelar y cambiar estado (transacción + advisory locks)
│  ├─ catalog.ts                   Catálogo por sede con overrides y sede más cercana
│  ├─ ai-agent.ts                  Agente de Claude + herramientas validadas con Zod
│  ├─ fallback-bot.ts              Flujo guiado por botones sin IA
│  ├─ conversations.ts             Mensajes entrantes y salientes, toma de control, lista de espera
│  ├─ whatsapp.ts                  Cloud API: firma, parseo, mensajes interactivos y plantillas
│  ├─ reminders.ts                 Recordatorios idempotentes
│  ├─ metrics.ts                   KPIs y series del panel
│  ├─ auth.ts · session.ts         Roles, alcance por sede y JWT
│  ├─ prisma.ts · demo.ts · seed-data.ts
│  └─ config.ts · time.ts · utils.ts · labels.ts
├─ components/{site,dashboard,brand}
└─ proxy.ts                        Chequeo optimista de sesión para /dashboard
```

### Seguridad y autorización

- `proxy.ts` solo comprueba que exista la cookie y redirige al login si falta.
- Cada página, server action y endpoint vuelve a validar en el servidor la sesión (firma del JWT, usuario activo), el rol y la sede (`requireUser`, `assertUser`, `bookingScope`, `customerScope`).
- No hay registro público: solo dirección y administración crean usuarios.
- Las contraseñas se guardan con bcrypt (coste 12) y la cookie es `httpOnly`, `sameSite=lax` y `secure` en producción.

### Concurrencia

`createBooking` toma `pg_advisory_xact_lock` por *sede + día* y luego por *especialista + día* (siempre en ese orden), vuelve a calcular la disponibilidad dentro de la transacción y, si el hueco ya se ocupó, lanza `SlotTakenError` con hasta 3 alternativas. Lo cubre el test `tests/booking-concurrency.test.ts`.

### Rendimiento y accesibilidad de la landing

- Las fotos pasan por `next/image` (AVIF/WebP, tamaños responsivos, carga diferida). Solo la primera foto del hero se carga con prioridad, y el carrusel arranca con la primera interacción para no competir con la carga inicial.
- Con `prefers-reduced-motion` no hay scroll suave, preloader, cursor propio, parallax ni carrusel.
- Lighthouse en móvil (build local, varía entre 87 y 94 según la corrida): Rendimiento ~90, Accesibilidad 97, Buenas prácticas 100, SEO 100.

### Fotografía

Las fotos están en `src/content/images.ts` (ids de Unsplash, licencia Unsplash: uso comercial sin atribución obligatoria) y se muestran en blanco y negro con CSS. Para usar fotos propias del estudio, cambia los ids o apunta `unsplash()` a archivos de `/public`.

## Pendientes antes de publicar

- [ ] Verificar la dirección y las coordenadas de cada sede (*Vía Real* y *Compostela* están marcadas como aproximadas).
- [ ] Reemplazar los testimonios de ejemplo en `src/content/testimonials.ts` por reseñas reales y autorizadas. Fuera del modo demo, la sección se oculta mientras la lista esté vacía.
- [ ] Subir fotos reales de las especialistas (campo `photoUrl`) y del trabajo del estudio. Hoy las especialistas se muestran con monogramas y el resto de la web usa fotografía de stock de Unsplash.
- [ ] Aprobar las plantillas de WhatsApp y probar el webhook con el número real.
- [ ] Revisar los precios del seed: son de referencia y deben cargarse los reales.
