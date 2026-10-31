## Layers come from the project

1. Map folders to layers by what they do: `handlers/`, `views.py` are Controller; `dao/` is Repository.
2. Default backend order, when those parts exist: Frontend → App → Routes → Middleware → Validator → Controller → Service → Repository → Database → Serializer → DTO.
3. Other structures get their own layers, in the order a request really runs: Next.js API routes, NestJS modules, Django apps, Laravel, feature folders.
4. Frontend layers come from its real folders and main parts, such as Pages → Components → Store → API Client.
5. Each layer once, same name and order in all of a project's diagrams. Two services are one Service layer; labels name the class.
6. Draw only the layers the flow uses. Never search for a folder that is not there.
7. Redis, Event Bus, queues and workers follow the main layers when crossed, and background work gets its own chapter. External systems come last.
8. Crons, hooks, utils, helpers, config, env values, constants and libraries are side parts: `%% @uses <cron|hook|util|config|env|lib> <name> <path:line> <few words>`. A cron, worker or listener that starts the flow is drawn first instead.

**Middleware is always its own layer**, guards and interceptors too, with one step per middleware that acts.
