# agents-cli

CLI para inicializar repositorios con los agentes, skills y workflows de desarrollo del usuario.

El proyecto está diseñado para soportar Codex, OpenCode y Claude Code desde un catálogo canónico de agentes y skills. La selección de plataforma y skills se realizará durante `init`, manteniendo la configuración específica de cada cliente mediante adaptadores.

## Estado

El diseño y la ejecución inicial están documentados en [PLAN.md](PLAN.md). El estado operativo de la configuración inicial está en [docs/execution-status.md](docs/execution-status.md).

## Alcance inicial

- Siete agentes globales reutilizables.
- Skills seleccionables por plataforma.
- Worktrees dentro de `.worktrees/` del checkout principal.
- Workflows para Graphify, Linear y Trello.
- Integración de GitHub y Linear mediante Docker MCP Toolkit.

La implementación todavía está en progreso.
