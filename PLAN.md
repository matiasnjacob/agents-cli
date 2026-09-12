# Plan de agents-cli

## Objetivo

Publicar en `matiasnjacob/agents-cli` una CLI que inicialice repositorios con los agentes globales actuales del usuario, skills seleccionables, reglas de worktrees, Graphify y workflows de stories para Linear o Trello. Soportar OpenCode, Codex y Claude Code mediante adaptadores de un catálogo canónico.

## Verificación inicial — 2026-09-12

- Al comenzar, la carpeta solo contenía `PLAN.md`; durante T01 se inicializó el repositorio Git local en `main` y se añadió `/.worktrees/` al ignore.
- GitHub CLI: ambas cuentas están autenticadas; `matiasnjacob` quedó activa durante T01–T03. Las credenciales no están rotas: los errores iniciales fueron del acceso restringido.
- Docker operativo, servidor 29.7.2. Se creó el perfil MCP `agents-cli` con `github-official` y `linear`; el perfil `default` existente se conservó.
- La identidad de `gh` fue verificada como `matiasnjacob`; el MCP GitHub tiene configurado el secreto `github.personal_access_token` tomado del keyring de esa cuenta. Falta una llamada funcional del MCP GitHub.
- Decisión confirmada: administrar GitHub y Linear mediante Docker MCP Toolkit/Gateway. No es requisito alojar las imágenes en Docker Hub; se admiten servidores remotos administrados por el Toolkit. Linear quedó autorizado en el almacén de Docker MCP; GitHub quedó configurado con secreto local.
- El perfil `agents-cli` se conectó a Codex, OpenCode y Claude Code. La conexión de clientes quedó creada; falta verificar una llamada desde cada cliente.
- `~/.agents` ya contiene siete roles canónicos: orchestrator, backend-developer, frontend-developer, aws-specialist, code-reviewer, qa-automator y qa-manual; adaptadores Codex/OpenCode, manifiestos de procedencia, skills y scripts `init-project.py`, `render-codex.py` y `worktree.py`.
- La búsqueda inicial no encontró referencias en `~/.agents`, pero la herramienta local `graphify 0.9.48` quedó identificada y su CLI fue inspeccionada durante T12. Falta decidir si `agents-cli` la envuelve o solo documenta su uso.
- Decisión confirmada: excluir agent-stack del alcance; no importar sus agentes ni mantener su revisión como dependencia.

## Diseño propuesto

CLI en TypeScript/Node.js, empaquetable para ejecución con npx; nombre definitivo del paquete pendiente. Catálogo versionado dentro del repositorio y adaptadores por plataforma. Instalación local al proyecto por defecto, sin depender de rutas absolutas de esta Mac ni modificar las instalaciones globales.

Interfaz propuesta, aún no implementada:

```sh
agents-cli init --platform codex --tracker linear
agents-cli init --platform opencode --tracker trello
agents-cli init --platform claude --tracker none
agents-cli init --platform codex --dry-run
agents-cli skills list --platform codex
agents-cli skills add <skill> --platform codex
agents-cli doctor
agents-cli update --dry-run
```

Sin plataforma, `init` pregunta primero por ella y después por skills/perfil y tracker. El modo no interactivo requiere opciones completas. Los siete roles se preservan; skills opcionales se instalan después de resolver plataforma y dependencias. No fijar modelos del usuario.

Áreas previstas: `src/cli/`, `src/catalog/`, `src/adapters/{codex,opencode,claude}/`, `src/install/`, `src/mcp/`, `catalog/{agents,skills,workflows}/`, `schemas/`, `tests/`, `docs/` y `.github/workflows/`.

## Identidades por agente

Las integraciones externas deben usar identidades distinguibles por bot, separadas de la cuenta personal principal y seleccionadas por proveedor. Las credenciales se mantienen fuera del catálogo y nunca se publican.

| Proveedor | Identidad inicial | Uso | Fuente local |
| --- | --- | --- | --- |
| Linear | `matiasnjorquestrator` (`matiasnj+orquestrator@gmail.com`) | Orquestación, stories y actualizaciones de proyecto | OAuth gestionado por Docker MCP Toolkit |
| GitHub | `cli-code-reviewer-agent[bot]` | Commits, branches y PRs de automatización/revisión | GitHub App e installation token temporal |

El catálogo debe modelar una identidad lógica por agente y proveedor, permitiendo agregar futuros aliases de Linear y GitHub Apps sin acoplar credenciales ni nombres de usuario a las instrucciones. La CLI debe usar la identidad seleccionada en cada operación, informar el actor efectivo antes de una mutación externa y registrar solo el alias, proveedor y alcance. No debe impersonar una cuenta humana mediante credenciales compartidas: debe autenticarse mediante OAuth, una GitHub App u otro mecanismo explícito del proveedor.

La configuración de la GitHub App se toma únicamente desde variables locales (`GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID` o Client ID, `GITHUB_APP_PRIVATE_KEY_PATH`) y genera installation tokens efímeros. El `.env` y las claves privadas quedan fuera de Git. Docker MCP Toolkit puede usar el token temporal para el servidor GitHub; si el endpoint `/user` no funciona para installation tokens, se valida la identidad mediante la App y el acceso efectivo al repositorio.

## Etapas y criterios de aceptación

Las etapas siguientes describen el alcance. Para ejecutarlas con Luna, seguir las tareas T01–T15 de la sección de ejecución; no implementar una etapa entera de una sola vez.

1. **Cerrar identidad y conexiones.** Seleccionar o aislar la autenticación `matiasnjacob` para este trabajo; comprobar `gh api user`, identidad de commits y destino remoto antes del primer push. Configurar los aliases de bot definidos en la matriz de identidades y conservar credenciales fuera del repositorio. Inspeccionar el catálogo Docker actual para Linear y su mecanismo de autenticación. Configurar GitHub y Linear en un perfil dedicado y conectar el gateway al cliente elegido. Validar GitHub y Linear mediante lecturas, registrando el actor efectivo y sus límites. No reutilizar implícitamente la identidad personal de `gh` para el MCP. Criterio: evidencia de identidad correcta y llamadas exitosas por Docker, distinguiendo configuración de funcionamiento. OAuth puede necesitar interacción del usuario.

2. **Inventariar y preservar agentes actuales.** Leer los siete roles, manifiestos, recursos de skills y scripts existentes; comparar con las ubicaciones globales de Claude, Codex y OpenCode. Registrar procedencia, hashes, dependencias, licencias y variantes por proyecto. Incluir todas las definiciones propias pertinentes; representar skills de plugins/sistema mediante dependencias de sus gestores cuando corresponda. No copiar credenciales, historiales, cachés ni reglas privadas de proyectos como defaults universales. Criterio: inventario trazable y diferencias explicadas respecto del origen.

3. **Definir contrato portable.** Separar instrucciones comunes de modelos, permisos, herramientas y formato de cada runtime. Preservar roles y responsabilidades; parametrizar rutas y tracker. Documentar diferencias de permisos que no tienen equivalencia y evitar prometer restricciones que el runtime no enforce. Validar formatos contra documentación oficial vigente y las versiones objetivo antes de implementar adaptadores. Criterio: esquema y matriz de capacidades para las tres plataformas.

4. **Construir init y selección de skills.** Implementar argumentos, asistente interactivo, perfiles, dependencias y renderizado local. Registrar versión y hashes en un lockfile de instalación. Añadir dry-run, manejo de conflictos, backups y comportamiento idempotente; combinar archivos de configuración existentes conservando contenido ajeno. Reutilizar la lógica útil de los scripts actuales después de revisarla. Criterio: inicialización repetida sin cambios y ejecución segura en repositorio con configuración previa.

5. **Adaptadores de las tres plataformas.** Implementar descubrimiento de agentes, skills, instrucciones principales y MCP según cada cliente. Reutilizar el adaptador Codex actual tras comprobar sus supuestos; adaptar OpenCode y completar Claude. Evitar symlinks absolutos a la máquina de origen. Criterio: cada cliente descubre los siete roles y puede cargar una skill en un repositorio limpio; diferencias de delegación y permisos documentadas.

6. **Worktrees, Graphify y trackers.** Mantener `.worktrees/<tarea>` dentro del checkout principal y su exclusión de Git, sin relocalizar worktrees existentes. Identificar Graphify, revisar instalación/indexación/actualización e ignorar artefactos generados cuando corresponda. Crear plantilla común de story: contexto, objetivo, alcance/no alcance, aceptación, dependencias, responsable, branch/worktree y evidencias. Adaptar campos y estados a Linear/Trello reales; no asumir nombres universales ni crear stories durante init. Criterio: ejemplos completos para ambos trackers y flujo de worktree reproducible.

7. **Verificación y mantenimiento.** Tests de argumentos, dependencias, renderizado, idempotencia, conflictos y preservación de archivos; integración en repositorios temporales para las tres plataformas. Smoke tests reales de descubrimiento y MCP. `doctor` comprueba dependencias, versiones, configuración e identidad sin mostrar secretos. `update` compara hashes y evita sobrescribir ediciones locales silenciosamente. Criterio: checks automatizados y limitaciones reales registradas.

8. **Publicación.** Confirmar visibilidad del repositorio y licencia, crear `matiasnjacob/agents-cli`, configurar remoto y publicar catálogo auditado con documentación y CI. Probar instalación desde un artefacto empaquetado fuera del checkout. Crear release versionada; publicación en npm queda pendiente de decidir nombre y cuenta/registro. Criterio: desde otro repositorio se instala la CLI y se completa init sin acceder al home original.

## Validaciones previstas

- Identidad: `gh api user --jq .login`, propietario del remoto y `get_me` del MCP GitHub.
- Docker: `docker mcp profile server ls --format json`, seguido de llamadas de lectura reales a ambos MCP.
- CLI: scripts previstos `npm run typecheck`, `npm test`, `npm run build` y `npm pack --dry-run`; definirlos durante implementación.
- Integración: init de cada plataforma en directorio limpio, segunda ejecución sin diff, configuración previa conservada, invocación real de un agente y skill.
- Catálogo: enlaces y recursos válidos, hashes/procedencia, ausencia de rutas privadas y secretos, licencias preservadas.

## Decisiones pendientes

- Visibilidad de GitHub y licencia de distribución.
- Qué implementación de Graphify usa el usuario.
- Equipo/proyecto de Linear y tablero de Trello; seleccionables por proyecto, sin defaults privados publicados.
- Nombre/registro del paquete y sistemas operativos objetivo. Propuesta inicial: macOS/Linux; confirmar alcance Windows antes de prometer soporte.

## Ejecución por tareas pequeñas para Luna

### Reglas de ejecución

- Luna es el modelo ejecutor del plan, no un modelo a fijar en los agentes generados.
- Ejecutar una tarea a la vez. Leer este plan, `docs/execution-status.md` cuando exista y únicamente las fuentes de la tarea actual. No cargar todo el catálogo de skills en contexto.
- Verificar el estado actual antes de actuar: la verificación inicial de este documento es histórica.
- Mantener `docs/execution-status.md` con ID, estado (`pending`, `in_progress`, `blocked`, `done`), archivos cambiados, comandos/resultados, decisiones y próximo paso. No guardar secretos ni salidas con tokens.
- Marcar una tarea `done` solo con evidencia de su criterio de aceptación. Una prueba omitida queda `NOT VERIFIED`; no equivale a éxito.
- Si una tarea requiere más de una sesión, guardar un punto de continuación preciso. No repetir cambios ya completados ni ampliar el alcance.
- Si falta OAuth, acceso o una decisión de producto, registrar el bloqueo de esa tarea y avanzar únicamente con tareas independientes. No inventar imágenes, IDs de MCP, comandos de Graphify, campos de Linear ni capacidades de un runtime.
- Configuración global actual es fuente de lectura para la migración. Cambios MCP/autenticación se limitan a los necesarios para este proyecto. No trasladar ni eliminar instalaciones existentes.
- Preparar y validar el trabajo local antes de publicar. Resolver visibilidad/licencia antes de crear el remoto; no publicar en npm sin decidir nombre y cuenta.

### Tareas y entregables

**T01 — Registrar estado e identidad.** Dependencias: ninguna.
Leer estado de la carpeta y autenticación sin imprimir tokens. Crear `docs/execution-status.md` y `docs/environment.md`. Preparar autenticación de trabajo con `matiasnjacob`, verificar login y documentar identidad de commits por separado. Inicializar Git local si todavía no existe; añadir `/.worktrees/` al ignore. No crear remoto todavía.
Registrar también la matriz de identidades por bot y el alcance de cada proveedor; distinguir cuenta humana, alias Linear y GitHub App.
Aceptación: identidad GitHub comprobada, Git local disponible, estado inicial documentado y actores externos identificados sin secretos. Si autenticación está bloqueada, el inventario local puede continuar.

**T02 — Verificar/configurar MCP GitHub mediante Toolkit.** Dependencias: T01 para verificar cuenta.
Leer ayuda de la versión instalada de Docker MCP, inspeccionar perfiles y preparar un perfil de proyecto sin sustituir perfiles existentes. Configurar GitHub y conectar el gateway al cliente de trabajo. Registrar instrucciones sin secretos en `docs/mcp.md`.
Usar la GitHub App seleccionada para operaciones automatizadas y verificar el repositorio con un installation token. Si el servidor no puede resolver `/user` con ese token, registrar la limitación y verificar App, instalación, repositorio y permisos por endpoints compatibles.
Aceptación: la identidad de la App y su acceso al repositorio quedan comprobados por el gateway; la autenticación de gh no sustituye esta prueba.

**T03 — Configurar MCP Linear mediante Toolkit.** Dependencias: perfil de T02; independiente de la autenticación GitHub.
Identificar Linear en el catálogo vigente, registrar tipo de servidor y autenticación, completar OAuth con el usuario si hace falta y añadirlo al perfil. Si no está disponible, documentar una configuración soportada por Toolkit antes de proponerla. No crear issues.
Autorizar el alias Linear seleccionado para el agente, empezando por `matiasnjorquestrator`; no usar implícitamente la cuenta humana `matiasnj`.
Aceptación: lectura real de identidad/equipos mediante el gateway devuelve el alias seleccionado; evidencia en `docs/mcp.md`. Equipo/proyecto de destino puede elegirse más adelante.

**T04 — Inventario canónico.** Dependencias: ninguna.
Leer `~/.agents/README.md`, manifiestos y listado de agentes/skills. Comparar definiciones de las tres plataformas. Crear `docs/catalog-inventory.md` con origen, rol, recursos, licencia, dependencias y diferencias; calcular hashes en un manifiesto sin rutas personales distribuibles.
Aceptación: los siete roles identificados y todas las skills propias clasificadas como incluidas, variante de proyecto o dependencia externa, con motivo. No omitir variantes silenciosamente.

**T05 — Importar catálogo auditado.** Dependencias: T04.
Crear `catalog/agents/`, `catalog/skills/` y manifiesto de procedencia. Copiar instrucciones propias y recursos necesarios; sustituir rutas locales por referencias portables documentadas. Conservar originales/variantes y licencias cuando proceda; excluir cachés y paquetes gestionados que requieran instalación externa.
Aceptación: comparación contra inventario y hashes de origen; cada transformación registrada. Sin secretos, enlaces absolutos al home ni referencias rotas.

**T06 — Contrato y esqueleto CLI.** Dependencias: T04.
Crear `package.json`, configuración TypeScript, `src/cli/`, `schemas/` y `docs/platform-contract.md`. Usar Node.js/TypeScript, npm y un único runner de tests. Definir `typecheck`, `test`, `build`. Documentar versiones objetivo, archivos de salida y diferencias de permisos contrastando documentación oficial; fijar versiones de dependencias en lockfile.
Aceptación: los tres scripts funcionan; ayuda/validación de argumentos acepta `codex|opencode|claude` y `linear|trello|none`, rechaza valores inválidos. No anunciar comandos incompletos como operativos.

**T07 — Motor de instalación.** Dependencias: T05, T06.
Implementar `src/install/`: cálculo de cambios separado de escritura, dry-run, lockfile con hashes, backups y detección de conflictos. Archivos editados por el usuario no se sobrescriben silenciosamente. Validar rutas y rechazar destinos que escapen del proyecto.
Aceptación: tests de primera instalación, repetición sin diff, dry-run sin escritura, conflicto y preservación de configuración ajena. Documentar recuperación ante fallo parcial.

**T08 — Adaptador Codex.** Dependencias: T07.
Revisar el renderizador actual y el contrato T06; implementar `src/adapters/codex/` con fixture de proyecto y pruebas. Renderizar agentes, referencias a skills e instrucciones; configurar gateway sin secretos.
Aceptación: formato válido y siete roles generados; smoke test real de descubrimiento de roles y carga de una skill. Si falta runtime, registrar esa prueba como pendiente.

**T09 — Adaptador OpenCode.** Dependencias: T07.
Implementar `src/adapters/opencode/` usando las definiciones actuales, fixture y pruebas, según contrato T06.
Aceptación: mismos controles de T08, preservando semántica de selección/delegación y configuración existente.

**T10 — Adaptador Claude Code.** Dependencias: T07.
Implementar `src/adapters/claude/`, fixture y pruebas según contrato T06. Documentar explícitamente cualquier permiso o capacidad sin equivalencia.
Aceptación: mismos controles de T08; no tratar instrucciones textuales como restricciones técnicas enforceadas.

**T11 — Init y selección de skills.** Dependencias: T08–T10.
Conectar motor y adaptadores a `init`; preguntar plataforma antes de skills y tracker. Añadir `--skills <id,id>`, `--yes` y selección explícita de tracker para ejecución no interactiva; `--yes` no autoriza sobrescribir conflictos. Implementar `skills list` y `skills add`; resolver dependencias sin instalar todo el catálogo por defecto.
Aceptación: los tres ejemplos de init funcionan, flags incompletos en modo no interactivo fallan con explicación y segunda ejecución no cambia archivos. Probar dependencia ausente y skill incompatible.

**T12 — Workflows de proyecto.** Dependencias: T05, T11.
Adaptar scripts de worktree actuales; crear `catalog/workflows/` y ejemplos de stories Linear/Trello con campos comunes. Tracker `none` no impone ninguno. Identificar Graphify con evidencia local o pedir su URL si sigue ambiguo; documentar instalación, indexación, actualización y exclusiones para la herramienta confirmada.
Aceptación: worktree bajo checkout principal `.worktrees/`, plantilla usable para ambos trackers y procedimiento Graphify verificado. Si Graphify está pendiente, dividir T12 y mantener esa subtarea abierta; no declarar todo terminado.

**T13 — Doctor y update.** Dependencias: T11, T02–T03 para pruebas MCP reales.
Implementar `doctor` y `update --dry-run` con informe accionable. Doctor distingue configuración detectada, autenticación y funcionamiento; update usa hashes para preservar cambios locales.
Aceptación: pruebas de runtime/dependencia ausentes, MCP desconectado y archivo editado; sin exposición de secretos.

**T14 — Validación integral y documentación.** Dependencias: T01–T13 completas.
Ejecutar typecheck/test/build; empaquetar con `npm pack` e instalar el tarball en un repositorio temporal fuera del checkout. Verificar init de las tres plataformas sin acceso a archivos del home de origen; registrar smoke tests reales y revisión del catálogo. Añadir README y CI que no dependan de tokens para pruebas locales.
Aceptación: matriz de tres plataformas con evidencia, segunda inicialización sin diff, cambios previos conservados, funcionamiento MCP comprobado y cero validaciones obligatorias pendientes.

**T15 — Publicar en GitHub.** Dependencias: T14, visibilidad y licencia resueltas.
Revalidar el actor efectivo de la GitHub App, revisar contenido preparado, crear o verificar `matiasnjacob/agents-cli`, configurar remoto y publicar mediante installation token. Verificar que CI termina correctamente y preparar release versionada. npm es un paso separado pendiente de decisión.
Aceptación: propietario/URL correctos, CI verde y release instalable siguiendo README desde un repositorio nuevo. Registrar URL y versión; no dar esta tarea por hecha solo por crear el repositorio.

### Prompt para iniciar o retomar con Luna

```text
Ejecuta PLAN.md por tareas T01–T15. Primero lee PLAN.md y
docs/execution-status.md si existe. Selecciona la primera tarea pendiente
cuyas dependencias estén satisfechas. Revisa solo sus fuentes necesarias,
implementa su alcance, verifica su aceptación y registra evidencia y el
próximo paso. Continúa con la siguiente tarea si es posible. Conserva mis
agentes actuales; excluye agent-stack. GitHub y Linear se administran por
Docker MCP Toolkit. No inventes configuraciones ni marques como exitosas
pruebas no ejecutadas. Si falta una decisión u OAuth, registra el bloqueo
y continúa con tareas independientes. No fijes Luna en los agentes.
```

La planificación usa writing-plans para ordenar entregables y validaciones; no importa las obligaciones Trello/OpenSpec del proyecto del que proviene esa skill. Este documento prepara la ejecución; su edición no configura MCP ni publica contenido.

## Referencias

- Base local: `~/.agents/README.md`, `agents/`, `manifests/`, `adapters/` y `scripts/`.
- GitHub MCP en Docker Catalog: https://hub.docker.com/mcp/server/github-official/overview
