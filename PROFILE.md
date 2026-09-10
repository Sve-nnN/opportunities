# Perfil de Juan — referencia

Espejo legible del contenido real de la tabla `profile_fields` (Postgres, dev + prod). Este archivo es solo referencia/versionado — la fuente de verdad operativa es la DB, porque es de ahí que `generateApplyPrompt` (Phase 7) arma el snapshot real que va en cada prompt de "Send to AI". Si algo cambia acá, hay que reflejarlo también en la DB (pestaña "Perfil" de la app, o pedirle a Claude que lo actualice).

**Última actualización:** 2026-09-10
**Fuente:** CV 2026.pdf + certificado de práctica Philharmonie Luxembourg + GitHub (github.com/Sve-nnN) + juan-tech.com + entrevista directa con Juan

**Voz:** casual, directo, sin relleno — la forma en que Juan habla en el chat, no el tono de copy de marketing de su propio sitio. Frases cortas. Sin "boasts", "showcasing", ni metrics infladas tipo consultora.

## Contacto

| Campo | Valor |
|-------|-------|
| Nombre completo | Juan Carlos Angulo Abud |
| Email | juancarlosanguloabud@gmail.com |
| Teléfono | +51 986 861 213 |
| Ubicación | Lima, Perú |

## Links

| Campo | Valor |
|-------|-------|
| LinkedIn | https://www.linkedin.com/in/juancangulo/ |
| GitHub | https://github.com/Sve-nnN |
| Sitio personal | https://juan-tech.com |
| CV (Google Drive) | https://drive.google.com/file/d/1Flpg0UqPOKGOSDist8c7-dqw7av0-yiD/view?usp=drive_link |

## Educación

| Campo | Valor |
|-------|-------|
| Universidad | UPC (Universidad Peruana de Ciencias Aplicadas), Lima, Perú |
| Carrera | Ingeniería de Software |
| Ciclo actual | Ciclo 7 |
| Graduación estimada | Diciembre 2027 |

## Experiencia

| Campo | Valor |
|-------|-------|
| Resumen profesional | Estudiante de Ingeniería de Software en UPC (ciclo 7, me gradúo en diciembre 2027). Llevo 5 años en SEO técnico — empecé en AprendoSEO en 2021, la empresa después se convirtió en Loops Growth — y en paralelo armo software: Next.js, Payload CMS, proyectos propios y sitios de clientes. Ahora busco internships de Software Engineering. |
| Experiencia más reciente | 5 años en el mismo equipo con dos nombres: arranqué en AprendoSEO en 2021, y desde 2024 es Loops Growth. Ahí llegué a Senior Technical SEO Analyst manejando más de 18 clientes internacionales, incluyendo money.com y Miami Herald. Hacía auditorías técnicas, arreglaba problemas de indexación, y lideré migraciones de varios sitios a Webflow. |
| Práctica técnica (Luxemburgo) | Práctica remota con el equipo de Marketing & Digital de Philharmonie Luxembourg, 30h por semana. Armaba plantillas HTML para las pantallas de los eventos en vivo, con scripts que jalaban datos del backend en tiempo real, y probaba que todo se viera bien en distintas resoluciones antes de que saliera al aire. |
| Proyecto destacado | Trustloop (trustlup.netlify.app, github.com/Sve-nnN/TrustLoop) lo armé solo. Quería resolver algo puntual y real: fuera de plataformas tipo Upwork, un freelancer no tiene forma fácil de mostrar reseñas verificadas. Es full-stack en TypeScript. Más de 50 clientes de la agencia AprendoClub se registraron y lo probaron, pero le faltó marketing y alcance para que quedara alguien usándolo de forma activa. El problema que resolvía era bueno; lo que faltó fue empujarlo después de construirlo. |
| Clientes de desarrollo | Además de Trustloop y la práctica en Luxemburgo, hice sitios/proyectos para clientes: Arianna Lupi, Apturio, Childrenchic, TuMundoSalud, Crédito USS, Wiñaypaq, el consultorio del Dr. Manuel Vargas Hidalgo, Puntada con Amor, Aprendoclub, Pro Torque Diesel, Cresory y Estylopia. |
| Skills técnicos | JS/TS con React y Next.js, Python, SQL/Postgres, C++, Kotlin, Java (con Spring Boot). En GitHub tengo cerca de 56 repos, desde ejercicios de estructuras de datos en C++ hasta proyectos reales como `dr-angulo-website` (sitio de un cliente real) o `SiembraConnect.API` en Java. |
| Certificaciones | Bootcamp de React de Código Facilito (12 semanas, +50h). Curso de SEO con Arianna Lupi (2022). HXPLOIT UPC en ciberseguridad ofensiva, básico e intermedio. Serie de Google IT Support en Coursera (redes, sistemas operativos, seguridad, infraestructura). Scrum Fundamentals Certified. 5 insignias de Google Cloud Skills Boost en IA generativa, LLMs e IA responsable. |
| Por qué el cambio a software | El SEO es una herramienta poderosa para posicionar webs, pero ahora estoy estudiando para hacer software escalable y performante. Me di cuenta que puedo aplicar SEO en las webs de mis clientes y así darles mucho más alcance — no es dejar el SEO, es sumarle ingeniería real. |
| Empresa/equipo que busco | Me encantaría una FAANG. Fuera de eso, cualquier empresa con buena cultura — pero si no es FAANG, tiene que ser pago. |
| Intereses personales | Autodidacta por naturaleza: me gusta aprender cosas nuevas por mi cuenta y probarlas, no solo en programación, también en el día a día. Ando en bicicleta y me gustan los atardeceres. |
| Logro del que estoy orgulloso | juan-tech.com. Fue el impulso para empezar a construir mi identidad digital en serio. |

## Preguntas comunes (para formularios de aplicación)

| Campo | Valor |
|-------|-------|
| Rol buscado | Internship de Software Engineering. En el prompt de auto-apply, destacar el lado técnico: UPC, Trustloop, los clientes de desarrollo, y el lado técnico de SEO (no growth/marketing). |
| Autorización para trabajar en EEUU | No, necesito sponsorship o visa. Estudio en UPC en Lima, no en una universidad de EEUU, así que no califico para F-1/CPT/OPT. Lo normal sería una visa J-1 (tipo CIEE/InterExchange) o que la empresa patrocine directamente. |
| Preferencia de modalidad | Abierto a internships remotas (ahí no hay tema de visa) o presenciales en EEUU si la empresa patrocina. |

## Notas para Claude

- Cuando el botón "Send to AI" arme el prompt, el snapshot real viene de `profile_fields` en Postgres — este archivo es la copia legible para referencia rápida sin tener que consultar la DB.
- Si Juan agrega un campo nuevo a mano en la pestaña "Perfil" de la app, o una sesión de auto-apply aprende un campo nuevo vía el callback (PROFILE-03), ese campo vive en la DB pero **no se refleja automáticamente acá** — hay que sincronizar este archivo a mano cuando se note el drift.
- Los campos de perfil no incluyen datos genuinamente sensibles (SSN, historial salarial, autorización de trabajo detallada más allá de sí/no) — ver `.planning/PROJECT.md` Key Decisions sobre por qué `profile_fields` no está cifrado (T-05-03, riesgo aceptado mientras no haya un campo así).
