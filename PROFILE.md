# Perfil de Juan — referencia

Espejo legible del contenido real de la tabla `profile_fields` (Postgres, dev + prod). Este archivo es solo referencia/versionado — la fuente de verdad operativa es la DB, porque es de ahí que `generateApplyPrompt` (Phase 7) arma el snapshot real que va en cada prompt de "Send to AI". Si algo cambia acá, hay que reflejarlo también en la DB (pestaña "Perfil" de la app, o pedirle a Claude que lo actualice).

**Última actualización:** 2026-09-10
**Fuente:** CV 2026.pdf + entrevista directa con Juan

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
| Resumen profesional | Estudiante de Ingeniería de Software (UPC, ciclo 7) con experiencia profesional como Technical SEO Analyst, un rol con fuerte componente técnico (auditorías de arquitectura de sitio, indexación, Core Web Vitals, migraciones de plataforma) — no marketing de contenidos puro. Busca internships de Software Engineering para 2027. |
| Experiencia más reciente | Senior Technical SEO Analyst @ Loops Growth (remoto, nov 2024 – ene 2026) — gestión de +18 clientes internacionales, resolución de issues críticos de indexación, liderazgo de migraciones a Webflow (+25% tráfico orgánico, +45% velocidad de sitio). Roles previos en la misma empresa: Technical SEO Analyst (feb 2023–nov 2024), Content SEO Specialist (nov 2022–feb 2023). |
| Proyecto destacado | Trustloop (https://trustlup.netlify.app/) — plataforma full-stack para recolección centralizada de reseñas profesionales, embebible en +50 sitios web de clientes, uptime >99.9% |

## Preguntas comunes (para formularios de aplicación)

| Campo | Valor |
|-------|-------|
| Rol buscado | Software Engineering Intern (SWE) — el prompt de auto-apply debe destacar el perfil técnico (UPC + Trustloop + el lado técnico de Loops Growth), no el lado de marketing/growth |
| Autorización para trabajar en EEUU | No, necesito sponsorship/visa — estudia en UPC (Lima, Perú), no en universidad de EEUU, así que no califica para F-1/CPT/OPT. La vía típica para un internship de verano en EEUU sería una visa J-1 (Exchange Visitor, tipo CIEE/InterExchange) o sponsorship directo de la empresa. |
| Preferencia de modalidad | Abierto a internships remotas (sin restricción de visa) o presenciales en EEUU (con sponsorship/visa) |

## Notas para Claude

- Cuando el botón "Send to AI" arme el prompt, el snapshot real viene de `profile_fields` en Postgres — este archivo es la copia legible para referencia rápida sin tener que consultar la DB.
- Si Juan agrega un campo nuevo a mano en la pestaña "Perfil" de la app, o una sesión de auto-apply aprende un campo nuevo vía el callback (PROFILE-03), ese campo vive en la DB pero **no se refleja automáticamente acá** — hay que sincronizar este archivo a mano cuando se note el drift.
- Los campos de perfil no incluyen datos genuinamente sensibles (SSN, historial salarial, autorización de trabajo detallada más allá de sí/no) — ver `.planning/PROJECT.md` Key Decisions sobre por qué `profile_fields` no está cifrado (T-05-03, riesgo aceptado mientras no haya un campo así).
