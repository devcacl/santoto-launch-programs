# Santoto Launch Programs

Experiencia web gamificada para el lanzamiento de Nutrición y Dietética e Inteligencia de Negocios en la Universidad Santo Tomás, Seccional Tunja.

## Stack

- React + Vite para la experiencia responsive.
- Node.js + Express para la API.
- PostgreSQL para leads, retos completados y asistencias.
- Configuración del evento en `server/src/config/event.json`.

## Requisitos

- Node.js 20 o superior y npm.
- Docker Desktop para iniciar PostgreSQL local, o una instancia PostgreSQL autorizada por TI.

## Inicio local

1. Copia `.env.example` a `.env` y cambia los secretos por valores aleatorios propios. No compartas ni confirmes `.env`.
2. Inicia la base de datos con `docker compose up -d database`.
3. Instala dependencias: `npm install` en la raíz, luego `npm install` en `server` y `client`.
4. Ejecuta `npm run dev` desde la raíz.
5. Abre `http://localhost:5173`.

La API inicia en `http://localhost:3001`. `GET /api/health` es el chequeo de disponibilidad. Las tablas se crean al iniciar la API.

## Configuración del evento

Edita `server/src/config/event.json` para actualizar textos, programas, retos, opciones y charlas. Cada reto tiene un identificador estable, opciones, índice de respuesta correcta y retroalimentación. La API valida la respuesta y el orden de los retos; el cliente no es fuente de verdad.

El catálogo `otherPrograms` debe revisarse con Admisiones antes de abrir el evento. Cambia `rewards.enabled` únicamente después de aprobar formalmente las condiciones de premios. Los nombres y datos académicos publicados deben ser validados por las áreas responsables.

## Funciones disponibles

- Registro de aspirantes y preferencias de contacto.
- Sesión de evento en cookie `HttpOnly`, `SameSite=Lax`, firmada con HMAC.
- Seis retos con validación de servidor y prevención de duplicados.
- Registro de asistencia individual a las charlas con código del evento.
- Selección final del programa de interés.
- Exportación CSV bajo `GET /api/admin/leads.csv` mediante cabecera `x-admin-key`.

## Antes de producción

- Desplegar la base de datos y API dentro de una cuenta/entorno aprobado por TI; exigir TLS y `COOKIE_SECURE=true`.
- Configurar `APP_ORIGIN`, `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_API_KEY` y `AUDITORIUM_CHECKIN_CODE` como secretos del proveedor. Usa secretos distintos, aleatorios y de 32+ caracteres para sesión y administración. No usar valores del ejemplo.
- Reemplazar el limitador de solicitudes en memoria por un store compartido si la API corre en varias réplicas.
- Configurar política de backups, retención/borrado, monitoreo, logs sin datos de leads y procedimiento de incidentes con TI.
- Revisar el aviso de privacidad, autorización aplicable a menores, y textos comerciales con Jurídica/Protección de Datos.
- Confirmar el dominio/subdominio, certificados, DNS, cabeceras y escaneo de seguridad con el webmaster.
- Validar el flujo con Admisiones y acordar transferencia segura de leads. La exportación de este MVP es una función operativa, no una integración con SAC/CRM.
- Ensayar conectividad, volumen de carga, proceso manual de contingencia y códigos de charla en el campus.

## Capacidad

El API usa un pool PostgreSQL limitado (20 conexiones por proceso por defecto), índices y escrituras idempotentes. La meta de 300 usuarios concurrentes debe confirmarse en el ambiente y proveedor aprobados mediante prueba de carga antes del evento. Mantén suficientes conexiones de base de datos para el pool agregado de todas las réplicas y usa un proxy de conexiones cuando aplique.

## Estructura

```text
client/                 React, Vite y estilos
server/src/config/      contenido editable del evento
server/src/             API, validación, base de datos y seguridad
compose.yaml            PostgreSQL local para desarrollo
```
