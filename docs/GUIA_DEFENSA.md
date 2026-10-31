# Guía de defensa — Nexo CRM

Material de apoyo para presentar el proyecto en la entrevista técnica de CEO Marketing. No forma parte de la aplicación; vive en `docs/` y se excluye de la imagen Docker.

---

## 1. Pitch de 30 segundos

> Nexo CRM es un mini CRM de clientes construido con Django, SQLite, HTML, CSS y JavaScript vanilla. Permite crear, listar, editar, buscar, filtrar y eliminar clientes con confirmación, mensajes de éxito/error y métricas en vivo. La interfaz es un diseño propio tipo SaaS, responsive en escritorio, tablet y móvil. El proyecto incluye 27 pruebas automatizadas, Docker con Gunicorn y WhiteNoise, y un pipeline de GitHub Actions que valida la configuración, las pruebas y la imagen.

---

## 2. Demo sugerida (5 minutos)

1. **Abrir el panel** y señalar las cuatro tarjetas KPI, la tabla y el contador de conversión.
2. **Buscar** “Nube” y mostrar el filtrado en vivo; borrar con la ✕.
3. **Filtrar** por “Prospecto” y luego combinarlo con una búsqueda.
4. **Crear** un cliente: enviar el formulario vacío para mostrar validación inline, luego completarlo y guardar. Resaltar el toast y la actualización de contadores.
5. **Editar** ese cliente y cambiar el estado a “Cliente”.
6. **Eliminar**: abrir la confirmación, cancelar una vez y luego confirmar. Mostrar el toast y el nuevo total.
7. **Abrir el Django Admin** (`/admin/`) y mostrar búsqueda, filtros y edición del estado en línea.
8. **Enseñar el repositorio**: ramas, `git log --oneline --graph --all`, workflow de CI y `docker compose up --build`.

---

## 3. Arquitectura en una frase

Django renderiza el shell HTML y expone una API JSON; el JavaScript vanilla consume esa API con `fetch` y actualiza el DOM sin recargar. Las validaciones viven en un `ModelForm` compartido por la API y el Admin, y las de interfaz son una primera barrera para dar feedback inmediato.

```text
Navegador
  ├── HTML semántico (Django templates)
  ├── CSS propio (responsive, sin framework)
  └── JS vanilla
        │ fetch + CSRF
        ▼
Django
  ├── dashboard view (render)
  ├── API JSON (list/detail/stats)
  ├── ClientForm (validación)
  ├── Django Admin
  └── SQLite
```

---

## 4. Decisiones y por qué

| Decisión | Motivo | Alternativa descartada |
| --- | --- | --- |
| Django + API JSON | Separación clara frontend/backend, respuestas fáciles de probar y CRUD concentrado. | Vistas que renderizan HTML por acción (más acoplamiento). |
| JavaScript vanilla | El alcance no justifica un framework ni un build step; menos dependencias y más control del detalle. | React/Vue con Vite. |
| SQLite | Cero configuración, suficiente para el reto y persistente en volumen Docker. | PostgreSQL (más infraestructura para el alcance). |
| `ClientForm` compartido | Una sola fuente de verdad para las reglas; API y Admin validan igual. | Validaciones duplicadas en cada vista. |
| `PATCH` parcial | El frontend puede actualizar solo el estado sin reenviar todo el objeto. | `PUT` obligatorio para cualquier cambio. |
| `<dialog>` nativo | Foco atrapado, `Esc` y accesibilidad sin librerías. | Modal hecho con `div` + JS manual. |
| WhiteNoise | Sirve estáticos en el contenedor sin Nginx. | Nginx como servicio adicional. |
| Docker sin root | Buena práctica de seguridad y producción. | Correr como root (más simple, peor práctica). |

---

## 5. Preguntas probables y respuestas

**¿Por qué no usaste React?**
El alcance es una sola pantalla con CRUD. Un framework añadiría build, dependencias y estado global sin beneficio claro. Con JS vanilla el bundle es mínimo, la carga es inmediata y el código queda legible para el tamaño del proyecto. Si la app creciera a varias vistas y equipos, migraría a React o a Django con HTMX según el caso.

**¿Cómo evitas el doble envío del formulario?**
El botón se deshabilita y muestra un spinner mientras la petición está en curso (`setSubmitting`). Además, el backend valida de nuevo; el correo es único a nivel de base de datos.

**¿Cómo manejas la búsqueda sin saturar el servidor?**
`debounce` de 280 ms en el evento `input`. Cada respuesta lleva un identificador de petición; si llega una respuesta vieja, se descarta para evitar que pise resultados más recientes.

**¿Qué pasa si el usuario borra un cliente que ya no existe?**
La API devuelve `404` con JSON. El frontend lo detecta, cierra el modal, muestra un toast informativo y recarga el directorio.

**¿Cómo proteges las escrituras?**
Cookie `csrftoken` + encabezado `X-CSRFToken` en `POST`, `PUT`, `PATCH` y `DELETE`. Django rechaza peticiones sin token. Las pruebas del flujo CSRF usan `enforce_csrf_checks`.

**¿Dónde están los secretos?**
Fuera del repositorio. `DJANGO_SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS` y `SQLITE_PATH` se leen de variables de entorno. `.env` está en `.gitignore`; solo se versiona `.env.example` con valores de ejemplo.

**¿Cómo funciona el despliegue?**
`docker compose up --build` construye la imagen, aplica migraciones en el `entrypoint.sh`, arranca Gunicorn con 3 workers y sirve estáticos con WhiteNoise. La base vive en el volumen `nexo-crm-data`, por lo que sobrevive a reinicios y a `docker compose down`.

**¿Qué cubren las pruebas?**
27 pruebas: modelo (estado por defecto, `__str__`, iniciales, orden, unicidad del correo) y API/dashboard (render, listado, búsqueda por tres campos, filtros, combinación, CRUD, `PATCH` parcial, validaciones, JSON inválido, 404, estadísticas y caso sin clientes).

**¿Qué mejorarías con más tiempo?**
- Autenticación de usuarios y aislamiento de cartera por equipo.
- Paginación y ordenamiento por columnas en la tabla.
- Exportación a CSV y un historial de interacciones por cliente.
- PostgreSQL y migraciones en CI contra una base real.
- Pruebas end-to-end con Playwright.
- HTTPS y `SECURE_*` en un despliegue real.

**¿Qué limitación conocida tiene?**
SQLite no es ideal para escrituras concurrentes altas; para producción con varios usuarios migraría a PostgreSQL. La API no tiene autenticación porque el alcance no la pide y el panel se asume interno; sería el siguiente paso antes de exponerlo públicamente.

**¿Por qué hay lógica de validación en cliente y servidor?**
La del cliente da feedback inmediato y evita viajes innecesarios; la del servidor es la que garantiza la integridad. Nunca se confía solo en el navegador.

**¿Cómo es el responsive?**
Breakpoints en 1160, 1024, 860, 640 y 380 px. Por debajo de 1024 el sidebar pasa a panel deslizante con overlay; por debajo de 640 la tabla se convierte en tarjetas usando `data-label` y el modal ocupa el ancho disponible. Verificado a 1440, 1024, 768 y 390 px sin desbordamiento horizontal.

**¿Por qué el estado es un `CharField` con `choices` y no una tabla aparte?**
Los tres estados son un catálogo fijo del negocio. `TextChoices` da validación, etiquetas y legibilidad sin una tabla y un `JOIN` adicionales. Si los estados fueran configurables por el usuario, sí usaría una entidad aparte.

---

## 6. Git y CI para explicar

- `main` estable, `develop` integración, tres ramas `feature/*`.
- Merges con `--no-ff` para conservar el contexto de cada bloque.
- Commits semánticos: `feat:`, `fix:`, `test:`, `docs:`, `chore:`.
- `.gitignore` excluye `.venv`, `db.sqlite3`, `staticfiles`, `.env` y logs.
- CI en `push`/`pull_request`: `check`, verificación de migraciones, 27 pruebas y build de Docker. El job de Docker depende del de pruebas.

---

## 7. Cierre

> “El proyecto cumple las seis fases del desafío y prioriza lo que pedía el brief: una interfaz propia y responsive, un CRUD completo con validaciones y confirmaciones, y una base sólida de pruebas, Docker y CI. Las decisiones buscaron simplicidad y claridad, dejando documentado qué haría distinto en un escenario de producción.”
