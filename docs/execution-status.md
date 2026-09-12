# Estado de ejecución

Última actualización: 2026-09-12

## T01 — Registrar estado e identidad

Estado: `done`

- Se inicializó el repositorio Git local en `/Users/matiasbinagora/Projects/agents-cli`.
- La rama inicial es `main`.
- Se creó `.gitignore` con `/.worktrees/`.
- `gh auth status` confirma `matiasnjacob` activa y `matiasbinagora` inactiva.
- `gh api user --jq .login` devolvió `matiasnjacob`.

## T02 — Verificar/configurar MCP GitHub mediante Toolkit

Estado: `in_progress`

- Docker Desktop está operativo; Docker Engine/MCP Toolkit reporta versión `29.7.2`.
- Se creó el perfil Docker MCP `agents-cli` con el servidor `github-official`.
- Se conectó el perfil a `codex`, `opencode` y `claude-code`.
- Se configuró localmente `github.personal_access_token` desde el token de `gh` para `matiasnjacob`; el valor no se imprimió ni se guardó en el repositorio.
- El perfil se conectó globalmente a Codex, OpenCode y Claude Code; los tres clientes aparecen como `connected` en `docker mcp client ls`.
- `github-official__get_file_contents` vía perfil `agents-cli` leyó correctamente `matiasnjacob/agents-cli/README.md`.
- `github-official__get_me` no es compatible con el token de instalación y devuelve 403 para `/user`; la identidad de la App fue verificada por el JWT de la App y el acceso al repositorio por el token de instalación.
- Pendiente: documentar esta limitación del endpoint de identidad o configurar un token de usuario de GitHub MCP si se requiere que `get_me` devuelva un usuario.

## T03 — Configurar MCP Linear mediante Toolkit

Estado: `done`

- Se añadió `linear` al perfil `agents-cli`.
- Endpoint detectado por el catálogo: `https://mcp.linear.app/mcp`.
- Linear aparece autorizado en el almacén local de Docker MCP.
- El perfil se conectó globalmente a Codex, OpenCode y Claude Code; los tres clientes aparecen como `connected` en `docker mcp client ls`.
- `linear__get_user` vía perfil `agents-cli` confirmó `matiasnjorquestrator`, `matiasnj+orquestrator@gmail.com`, administradora activa y miembro del equipo `Personal (PER)`.
- Se publicó el status en PER-5 como comentario Linear `147f9b2e-7285-4dbf-8d6e-c6d89c1c917b`.
- `linear__get_user` confirmó la cuenta y el equipo `Personal (PER)` mediante el gateway.

## T04 — Inventario canónico

Estado: `done`

- Se inventariaron los siete agentes globales actuales y sus adaptadores Codex.
- Se registraron 129 directorios de skills, 123 registros de procedencia y seis skills genéricas authored.
- Se documentaron los scopes, scripts, hashes disponibles, reglas de portabilidad y exclusiones.
- Entregable: `docs/catalog-inventory.md`.

## T05 — Importar catálogo auditado

Estado: `done`

- Worktree aislado: `.worktrees/t05-catalog-import`.
- Se importaron los siete agentes en `catalog/agents/`.
- Se importaron las seis skills genéricas authored en `catalog/skills/`.
- Se creó `catalog/manifest.json` con rutas relativas, identificadores de fuente, hashes y exclusiones.
- Las 123 variantes de skills con scope de proyecto quedaron fuera del catálogo portable por defecto y permanecen documentadas en T04.
- Validaciones completadas: JSON válido, todas las rutas del manifiesto existen, hashes SHA-256 coinciden con las fuentes y no se detectaron credenciales, claves privadas ni rutas absolutas en el catálogo.
- PR de implementación: https://github.com/matiasnjacob/agents-cli/pull/4 (aprobado y mergeado).
- La exclusión de las variantes de proyecto queda explícita en el manifiesto.

## T06 — Contrato y esqueleto CLI

Estado: `done`

- Worktree aislado: `.worktrees/t06-cli-skeleton`.
- Se creó `package.json`, `package-lock.json` y configuración TypeScript con Node.js >=20.
- Se definieron los contratos de plataforma (`codex`, `opencode`, `claude`) y tracker (`linear`, `trello`, `none`).
- Se implementó el comando operativo `validate` y `--help`; la instalación, skills y adaptadores quedan para tareas posteriores.
- Validaciones ejecutadas: `npm run typecheck`, `npm run build`, `npm test` (3 tests), ayuda, selección válida y rechazo de plataforma inválida.
- PR de implementación: https://github.com/matiasnjacob/agents-cli/pull/5 (aprobado y mergeado).

## T07 — Motor de instalación

Estado: `done`

- Worktree aislado: `.worktrees/t07-install-engine`.
- Se implementaron `planInstall` y `applyInstall` en `src/install/engine.ts`.
- El motor soporta dry-run, lockfile `.agents-cli.lock.json`, hashes SHA-256, backups, conflictos, idempotencia y validación de rutas.
- Se documentó recuperación ante fallos parciales en `docs/install-engine.md`.
- PR de implementación: https://github.com/matiasnjacob/agents-cli/pull/6 (aprobado y mergeado).
- La suite ampliada de T07 y el CI de PR quedaron integrados por los PR #7 y #8.

## T08 — Adaptador Codex

Estado: `done`

- Worktree aislado: `.worktrees/t08-codex-adapter`.
- Se implementó `renderCodex` en `src/adapters/codex/render.ts`.
- El adaptador genera los siete roles bajo `.codex/agents/`, `.codex/AGENTS.md` y un manifiesto de plataforma.
- Las referencias a skills son relativas y se generan según la selección recibida; las fuentes externas de `skills.sh` siguen delegadas al instalador.
- Se preservan las señales de sandbox y delegación del catálogo, documentando que las políticas de Codex/runtime son autoritativas.
- Validaciones ejecutadas: `npm run typecheck`, `npm run build`, `npm test` (17 tests), `git diff --check`.
- PR de implementación: https://github.com/matiasnjacob/agents-cli/pull/9 (aprobado y mergeado).

## T09 — Adaptador OpenCode

Estado: `done`

- Worktree aislado: `.worktrees/t09-opencode-adapter`.
- Se implementó `renderOpenCode` en `src/adapters/opencode/render.ts`.
- El adaptador genera los siete agentes como Markdown OpenCode bajo `.opencode/agents/` y un manifiesto de plataforma.
- Se preservan `description`, `mode` y `permission` del catálogo; las referencias a skills son relativas y seleccionables.
- No se genera `opencode.json`, para no sobrescribir modelos, providers, MCP ni plugins existentes.
- PR de implementación: https://github.com/matiasnjacob/agents-cli/pull/11 (aprobado y mergeado).

## T10 — Adaptador Claude Code

Estado: `done`

- Worktree aislado: `.worktrees/t10-claude-adapter`.
- Se implementó `renderClaude` en `src/adapters/claude/render.ts`.
- El adaptador genera los siete agentes bajo `.claude/agents/`, `CLAUDE.md` y un manifiesto de plataforma.
- Se mapean herramientas soportadas, `permissionMode` y restricciones de delegación; las diferencias no enforceables quedan documentadas como limitaciones del runtime.
- Las referencias a skills son relativas; las fuentes externas de `skills.sh` quedan para el instalador por plataforma.
- PR de implementación: https://github.com/matiasnjacob/agents-cli/pull/12 (aprobado y mergeado).

## T11 — Init y selección de skills

Estado: `done`

- Worktree aislado: `.worktrees/t11-init-skills`.
- Se implementaron `init`, `skills list` y `skills add` con selección explícita de plataforma, tracker y skills.
- `init` integra los tres adaptadores con el motor de instalación; `--dry-run`, conflictos e idempotencia se mantienen.
- `skills list` muestra skills portables y `skills.sh` como fuente externa diferida; no descarga contenido externo automáticamente.
- Las skills portables seleccionadas se copian a la ruta específica de Codex, OpenCode o Claude y se registran en `.agents-cli.lock.json`.
- Smoke tests en directorios temporales: init real + segunda ejecución sin conflictos para las tres plataformas; fuente externa rechazada sin descarga.
- Validaciones ejecutadas: `npm run typecheck`, `npm run build`, `npm test` (28 tests), smoke tests de las tres plataformas y `git diff --check`.
- PR de implementación: https://github.com/matiasnjacob/agents-cli/pull/13 (aprobado y mergeado).

## T12 — Workflows de proyecto

Estado: `in_review`

- Worktree aislado: `.worktrees/t12-project-workflows`.
- Se documentaron workflows portables para worktrees, stories de Linear y Trello, y selección explícita de tracker.
- Se documentó Graphify `0.9.48` con instalación por plataforma, actualización, detección de pendientes, exclusión de `graphify-out/` y límites de integración.
- Se agregó una suite de contrato para verificar plantillas, comandos y ausencia de rutas privadas.
- La interfaz de Graphify fue verificada localmente; todavía no está decidido si `agents-cli` la envolverá o solo la documentará.
- Subtarea abierta para esa decisión: PER-17, https://linear.app/matias-personal/issue/PER-17/t12-g-decide-graphify-integration-boundary.
- Validaciones: `npm run typecheck`, `npm run build`, `npm test` (31 tests), `git diff --check`.
- Commit: `e5bcdd7 docs: add project workflow catalog`.
- PR de implementación: https://github.com/matiasnjacob/agents-cli/pull/14.
- PER-16 quedó en `In Review`.

## T13 — Doctor y update seguro

Estado: `in_review`

- Worktree aislado: `.worktrees/t13-doctor-update`.
- Se implementaron `doctor` y `update --dry-run`.
- `doctor` comprueba Node.js, catálogo, lockfile, manifiesto de plataforma, disponibilidad de Docker para un perfil MCP declarado e identidad externa declarada; distingue configuración de conectividad y no muestra secretos.
- `update --dry-run` detecta plataforma y skills desde el manifiesto generado, reconstruye el estado deseado desde el catálogo y reporta creates, updates, unchanged y conflicts sin escribir.
- Los archivos editados por el usuario siguen siendo conflictos; no hay aplicación automática de updates.
- Validaciones: `npm run typecheck`, `npm run build`, `npm test` (34 tests), `git diff --check`, smoke de `doctor` y `update --dry-run` sobre un proyecto temporal.
- Commit: `0ea8e8f feat: add doctor and safe update preview`.
- PR de implementación: https://github.com/matiasnjacob/agents-cli/pull/15.
- PER-18 quedó en `In Review`.

## Próximo paso

Revisar T12 y, tras su merge, continuar con T13: doctor y update. Las skills externas de `skills.sh` deben modelarse como fuentes resolubles durante la instalación por plataforma, no copiarse indiscriminadamente al catálogo portable. La compatibilidad de Graphify queda como decisión/subtarea explícita.

## PER-9 — Suite ampliada y CI de PR

Estado: `in_progress`

- Worktree aislado: `.worktrees/t07-qa-pr-ci`.
- Se agregaron casos para rutas absolutas POSIX/Windows, destinos no administrados, dry-run con conflicto, lockfile malformado y paths duplicados.
- La suite pasó de 9 a 14 tests; la primera ejecución detectó y corrigió dos defectos reales del motor.
- Se agregó `.github/workflows/ci.yml` para `pull_request` en eventos `opened`, `reopened` y `synchronize`, sin secretos externos.
- La primera ejecución del workflow falló porque `node --test tests/**/*.test.js` dejó el glob sin expandir en Ubuntu; se corrigió el script a `node --test tests`, que permite el descubrimiento recursivo multiplataforma.
- Pendiente: validación final, commit, PR y pasar la tarea a `In Review`.

## PER-10 — Resumen por test en CI

Estado: `in_progress`

- Worktree aislado: `.worktrees/t10-ci-summary`.
- La Action conserva el exit code original de `npm test` mediante `pipefail` y `continue-on-error` controlado.
- Se agregó un job summary con una tabla por test (`passed`/`failed`) y estado general.
- Un fallo de cualquier test continúa haciendo fallar el job después de publicar el resumen.
- Pendiente: validación final, commit, PR y pasar la tarea a `In Review`.

## PER-12 — Corrección del parser del resumen CI

Estado: `in_progress`

- Worktree aislado: `.worktrees/t12-ci-summary-parser`.
- Los logs de GitHub confirmaron que el runner emite TAP (`ok N - nombre`) al ejecutar `npm test` mediante `tee`.
- Se reemplazó el parser dependiente de símbolos visuales por `scripts/ci-test-summary.mjs`, que parsea TAP y genera una fila por test.
- La Action conserva el estado general y falla si no encuentra resultados o si el comando original falló.
- Pendiente: validación final, commit, PR y pasar la tarea a `In Review`.
