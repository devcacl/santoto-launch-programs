# Santoto Launch Programs

Experiencia web gamificada para el lanzamiento de Nutrición y Dietética e Inteligencia de Negocios en la Universidad Santo Tomás, Seccional Tunja.

## Stack

- React + Vite para la experiencia responsive.
- Node.js + Express para la API.
- MariaDB 11.4 (InnoDB, utf8mb4) para leads, retos completados y asistencias.
- Configuración del evento en `server/src/config/event.json`.

## Requisitos

- Node.js 20 o superior y npm.
- Docker Desktop para iniciar MariaDB local, o una instancia MariaDB autorizada por TI.

## Inicio local

1. Copia `.env.example` a `.env` y cambia los secretos por valores aleatorios propios. No compartas ni confirmes `.env`.
2. Inicia la base de datos con `docker compose up -d database` y espera a que el contenedor esté saludable.
3. Instala dependencias: `npm install` en la raíz, luego `npm install` en `server` y `client`.
4. Ejecuta `npm run dev` desde la raíz.
5. Abre `http://localhost:5173`.

La API inicia en `http://localhost:3001`. `GET /api/health` es el chequeo de disponibilidad. Las tablas se crean al iniciar la API.

La base local de esta rama es MariaDB y crea su volumen `launch_mariadb_data`. No hay migración automática desde el PostgreSQL usado en una versión temprana del prototipo; no conectes datos existentes de producción sin un plan de exportación, conversión, conciliación y respaldo aprobado por TI. Los registros de prueba antiguos de PostgreSQL no se incorporan.

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

## Pasaporte y controles de experiencia

- El recorrido es individual. Los nodos del mapa se desbloquean en orden por programa; el auditorio aparece al completar las dos misiones.
- Hay seis minijuegos: construir un plato, armar una canasta con presupuesto, ordenar una secuencia, investigar un tablero, distribuir fichas y crear un titular a partir de métricas.
- Tommy Coins se suman al completar niveles y charlas. Son puntos simbólicos; no hay premios ni canje asociados.
- Los sonidos y la vibración son controles opcionales en la barra superior. La vibración depende del dispositivo y navegador.
- Tommy guía desde un botón flotante en la esquina inferior derecha. La bienvenida, el inicio de cada nivel, las instrucciones del auditorio y las pistas se presentan en una pantalla que requiere confirmación antes de continuar.
- Cada uno de los seis niveles desbloquea una insignia ilustrada con el modelo de Tommy correspondiente. Las insignias se conservan en el pasaporte asociado al registro y se pueden descargar como PNG al dispositivo.
- El movimiento de las insignias usa la orientación del teléfono cuando el navegador lo permite. iOS puede pedir autorización; la experiencia se mantiene usable si el sensor no está disponible.
- Los requisitos de respuestas correctas se validan en el servidor. La ruta pública de evento no entrega las reglas ni las soluciones.

## Datos de prueba local

Los códigos que vienen en `.env.example` son solamente para desarrollo. En la copia local `.env` puedes usar estos valores:

```text
DEMO-CHARLA-1
DEMO-CHARLA-2
DEMO-CHARLA-3
```

Usa cada código únicamente en su charla correspondiente. Antes de un evento real, cámbialos por códigos distintos y privados para cada ponente.

Para registrar un lead de prueba, usa por ejemplo:

```text
Nombre: Camila
Apellido: Rojas
Correo: camila.prueba+01@example.com
Celular: +573001234567 (opcional)
Ciudad: Tunja (opcional)
Colegio: Colegio de prueba (opcional)
```

El correo debe ser único por registro y la autorización de privacidad es obligatoria. La autorización comercial es opcional. Para probar errores en el formulario, intenta un nombre con números, un correo sin formato válido, un celular con menos de siete caracteres o enviar sin autorización de privacidad. El navegador y la API hacen validaciones; la API vuelve a validar aunque se altere el formulario en el cliente.

### Respuestas para completar cada minijuego durante la prueba

- **Construye un plato:** Arroz + Fríjoles + Tomate.
- **Mercado con presupuesto:** Lentejas + Arepa de maíz + Manzana (10 de 12 fichas).
- **Ruta del alimento seguro:** Lavarse las manos → separar superficies limpias y alimentos crudos → preparar y servir → refrigerar lo que requiere frío.
- **El tablero perdido:** Investigar en qué paso se abandonan las compras.
- **Invierte tus fichas:** 3 en investigar clientes, 4 en probar una idea y 3 en medir resultados.
- **Un titular con evidencia:** Las ventas aumentaron y las devoluciones bajaron.

Cada registro local agrega información de prueba a MariaDB. Usa un correo diferente al probar otro registro. Las preferencias de contacto y la preferencia final quedan almacenadas como datos de evento.

## Antes de producción

- Desplegar la base de datos y API dentro de una cuenta/entorno aprobado por TI; exigir TLS, `DB_SSL=true`, validación de certificado y `COOKIE_SECURE=true`.
- Configurar `APP_ORIGIN`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`, `SESSION_SECRET`, `ADMIN_API_KEY` y `AUDITORIUM_CHECKIN_CODES` como secretos/variables del proveedor. Usa secretos distintos, aleatorios y de 32+ caracteres para sesión y administración. No usar valores del ejemplo.
- Reemplazar el limitador de solicitudes en memoria por un store compartido si la API corre en varias réplicas.
- Configurar política de backups, retención/borrado, monitoreo, logs sin datos de leads y procedimiento de incidentes con TI.
- Revisar el aviso de privacidad, autorización aplicable a menores, y textos comerciales con Jurídica/Protección de Datos.
- Confirmar el dominio/subdominio, certificados, DNS, cabeceras y escaneo de seguridad con el webmaster.
- Validar el flujo con Admisiones y acordar transferencia segura de leads. La exportación de este MVP es una función operativa, no una integración con SAC/CRM.
- Ensayar conectividad, volumen de carga, proceso manual de contingencia y códigos de charla en el campus.

## Capacidad

El API usa un pool MariaDB limitado (20 conexiones por proceso por defecto), tablas InnoDB, índices y escrituras idempotentes. La meta de 300 usuarios concurrentes debe confirmarse en el ambiente y proveedor aprobados mediante prueba de carga antes del evento. Mantén suficientes conexiones de base de datos para el pool agregado de todas las réplicas.

## Estructura

```text
client/                 React, Vite y estilos
server/src/config/      contenido editable del evento
server/src/             API, validación, base de datos y seguridad
compose.yaml            MariaDB local para desarrollo
```
