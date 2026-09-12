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

Estado: `in_progress`

- Worktree aislado: `.worktrees/t07-install-engine`.
- Se implementaron `planInstall` y `applyInstall` en `src/install/engine.ts`.
- El motor soporta dry-run, lockfile `.agents-cli.lock.json`, hashes SHA-256, backups, conflictos, idempotencia y validación de rutas.
- Se documentó recuperación ante fallos parciales en `docs/install-engine.md`.
- Validaciones pendientes: typecheck, build, tests de instalación y revisión del diff.

## Próximo paso

Revisar T07 y, tras su merge, continuar con T08: adaptador Codex. Las skills externas de `skills.sh` deben modelarse como fuentes resolubles durante la instalación por plataforma, no copiarse indiscriminadamente al catálogo portable.
