# Native rebuild checkpoint

Resumed at the user's request on September 7, 2026. The paused construction placeholders are gone. The first native editing milestone is implemented; see `docs/NATIVE-REBUILD.md` for scope, test coverage, explicit gaps and next stages.

The main route is now native React/TypeScript with browser-worker geometry. `/classic` retains the previous migration. No backward compatibility with old `.tap` files is required for the rebuild.

The local development server was restarted for testing. Before pausing or closing the computer, download any user-created project from the workspace; source changes are saved in the repository. Published builds are separate from local browser autosaves.

Do not report full native parity or completion of the long-term rebuild based on this checkpoint. The 216 radial comparisons and 105 catalog tests apply to the native engine. Previous Java browser parity checks apply only to `/classic`.
