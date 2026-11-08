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
- En la primera instalación, conexión a Internet para descargar los paquetes de npm y la imagen de MariaDB.

## Inicio local

1. Abre Docker Desktop desde el menú Inicio y espera a que indique que el motor está ejecutándose. Si aparece el error `failed to connect to the docker API`, Docker Desktop aún está iniciando o no levantó su motor Linux.
2. Abre una terminal en la carpeta del proyecto:

   ```cmd
   cd C:\Users\leonc\OneDrive\Desktop\apps
   ```

3. Si es la primera instalación, crea el archivo local `.env` copiando `.env.example`, genera un valor propio para `SESSION_SECRET` y configura `ADMIN_USERS_JSON` con las cuentas y hashes bcrypt de desarrollo. No compartas el archivo. El `.env` local ya existente conserva sus valores y no se reemplaza al actualizar el repositorio.
4. Instala las dependencias una sola vez (o después de actualizar los paquetes):

   ```cmd
   npm install
   npm --prefix server install
   npm --prefix client install
   ```

5. En esa terminal inicia MariaDB:

   ```cmd
   docker compose up -d database
   docker compose ps
   ```

   Espera hasta que `apps-database-1` muestre `healthy`.

6. Abre una segunda terminal en la misma carpeta y ejecuta:

   ```cmd
   cd C:\Users\leonc\OneDrive\Desktop\apps
   npm run dev
   ```

   Deja esta terminal abierta mientras uses la app. Inicia el servidor React/Vite y la API de Node.

7. En el navegador abre [http://localhost:5173](http://localhost:5173). El panel está en [http://localhost:5173/admin](http://localhost:5173/admin).
8. Para comprobar que la API conectó con MariaDB, abre [http://localhost:3001/api/health](http://localhost:3001/api/health). Debe responder `{"status":"ok","database":"ok"}`.

Para detener la web y la API, pulsa `Ctrl+C` en la segunda terminal. Para detener MariaDB sin borrar sus datos, ejecuta `docker compose stop database` en la primera. Para volver a iniciar el proyecto, repite desde el paso 1 y omite la instalación de dependencias si no cambió el código de paquetes.

### Acceso local al panel administrativo

El panel usa cuentas individuales definidas en `ADMIN_USERS_JSON`, con roles `admin`, `admissions` y `analyst`. Las contraseñas se guardan como hashes bcrypt cost 12; el navegador recibe una cookie `HttpOnly`, `SameSite=Strict`, con expiración a las 8 horas. En el `.env` local hay cuentas de demostración con esos tres roles; sus claves son solo para esta máquina. TI debe crear cuentas institucionales, hashes únicos y secretos fuera del repositorio, y retirar las cuentas de prueba antes de desplegar. `admin` y `admissions` pueden exportar CSV; `analyst` tiene lectura del panel.

Para generar de forma segura un registro bcrypt para una cuenta institucional, ejecuta `npm --prefix server run admin:hash`, escribe el correo, el rol y la contraseña cuando se solicite. La contraseña se pide por entrada interactiva y no se incluye en el historial del comando. Agrega la salida JSON al secreto `ADMIN_USERS_JSON` del proveedor; no la subas a Git.

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
- Exportación CSV bajo `GET /api/admin/leads.csv` tras validar el rol de la sesión administrativa.
- Panel con inicio de sesión individual, roles y sesión en cookie `HttpOnly`; las exportaciones están reservadas a roles autorizados.

## Pasaporte y controles de experiencia

- El recorrido es individual. Los nodos del mapa se desbloquean en orden por programa; el auditorio aparece al completar las dos misiones.
- Hay seis minijuegos: construir un plato, armar una canasta con presupuesto, ordenar una secuencia, investigar un tablero, distribuir fichas y crear un titular a partir de métricas.
- Tommy Coins se suman al completar niveles y charlas. Son puntos simbólicos; no hay premios ni canje asociados.
- Los sonidos y la vibración son controles opcionales en la barra superior. La vibración depende del dispositivo y navegador.
- Tommy guía desde un botón flotante en la esquina inferior derecha. La bienvenida, el inicio de cada nivel, las instrucciones del auditorio y las pistas se presentan en una pantalla que requiere confirmación antes de continuar.
- Cada uno de los seis niveles desbloquea una insignia ilustrada con el modelo de Tommy correspondiente. Las insignias se conservan en el pasaporte asociado al registro y se pueden descargar como PNG al dispositivo.
- La experiencia autenticada tiene navegación horizontal entre **Mis retos**, **Mi pasaporte** y **Mis insignias**. El pasaporte se muestra desbloqueado desde el inicio; Tommy lo presenta y la descarga de la tarjeta se habilita al terminar las seis misiones y las tres charlas.
- La portada y el auditorio muestran la identidad EVOLUCIONA-T, el afiche, la fecha, el horario y el lugar configurados en `server/src/config/event.json`.
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

## Prueba de carga de recorrido completo

`scripts/k6-event-flow.js` simula asistentes que crean lead, completan los seis retos, registran las tres charlas y guardan su preferencia. Ejecútalo solo contra staging o una base descartable; crea registros reales en la base configurada. `VUS=300` y `ITERATIONS_PER_VU=1` generan 300 usuarios virtuales concurrentes (no son 300 celulares físicos). Ejemplo para 300 asistentes:

```cmd
set BASE_URL=https://staging.example.edu
set VUS=300
set ITERATIONS_PER_VU=1
set LOAD_TEST_PREFIX=evoluciona-load-2026
set TALK_1_CODE=codigo-staging-charla-1
set TALK_2_CODE=codigo-staging-charla-2
set TALK_3_CODE=codigo-staging-charla-3
k6 run scripts/k6-event-flow.js
```

Usa códigos de staging privados y elimina únicamente los leads con el prefijo de la corrida cuando termines. No ejecutes esta prueba contra producción. Los umbrales configurados son menos de 1% de errores y p95 menor de 3 s; una corrida local no certifica el proveedor ni 300 dispositivos físicos.

Validación local del 8 de noviembre de 2026: MariaDB 11.4, 300 VUs, 3.300 solicitudes de recorrido, 0 errores y p95 de 1,06 s. Los 300 leads de carga se eliminaron después. Esta medición cubre una sola máquina, no la infraestructura de la Universidad ni teléfonos físicos.

## Antes de producción

- Desplegar la base de datos y API dentro de una cuenta/entorno aprobado por TI; exigir TLS, `DB_SSL=true`, validación de certificado y `COOKIE_SECURE=true`.
- Configurar `APP_ORIGIN`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`, `SESSION_SECRET`, `ADMIN_USERS_JSON` y `AUDITORIUM_CHECKIN_CODES` como secretos/variables del proveedor. Usa secretos aleatorios y cuentas institucionales con contraseñas únicas; no uses valores de desarrollo.
- Reemplazar el limitador de solicitudes en memoria por un store compartido si la API corre en varias réplicas.
- Configurar política de backups, retención/borrado, monitoreo, logs sin datos de leads y procedimiento de incidentes con TI.
- Revisar el aviso de privacidad, autorización aplicable a menores, y textos comerciales con Jurídica/Protección de Datos.
- Confirmar el dominio/subdominio, certificados, DNS, cabeceras y escaneo de seguridad con el webmaster.
- Validar el flujo con Admisiones y acordar transferencia segura de leads. La exportación de este MVP es una función operativa, no una integración con SAC/CRM.
- Ensayar conectividad, volumen de carga, proceso manual de contingencia y códigos de charla en el campus.

## Capacidad

El API usa un pool MariaDB limitado (50 conexiones y cola acotada a 2000 operaciones por proceso por defecto), tablas InnoDB, índices y escrituras idempotentes. El límite del API y el de registro consideran que cientos de asistentes pueden compartir la IP pública del campus; ajústalos en `API_RATE_LIMIT_PER_IP` y `REGISTRATION_RATE_LIMIT_PER_IP` después de pruebas de abuso y carga. El limitador estándar guarda estado en memoria por proceso; para varias réplicas se debe configurar un store distribuido antes de escalar. La meta de 300 usuarios concurrentes debe confirmarse en el ambiente y proveedor aprobados mediante prueba de carga antes del evento. Mantén suficientes conexiones de base de datos para el pool agregado de todas las réplicas.

Antes de arrancar con `NODE_ENV=production`, la API exige origen HTTPS, TLS de base de datos, cookie segura, contraseñas/secrets largos y códigos privados no demo para todas las charlas. En desarrollo, los datos de EVOLUCIONA-T, el catálogo y los retos son configuración editable en `server/src/config/event.json`; códigos DEMO y contraseñas locales solo se permiten para pruebas locales.

## Estructura

```text
client/                 React, Vite y estilos
server/src/config/      contenido editable del evento
server/src/             API, validación, base de datos y seguridad
compose.yaml            MariaDB local para desarrollo
```
