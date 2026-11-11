# Ever Teams Boards

This repo is a modified fork of https://github.com/excalidraw/excalidraw (Copyright (c) 2020 Excalidraw, [MIT license](https://github.com/excalidraw/excalidraw/blob/master/LICENSE))

### Ever Teams sign-in

The Board lets in the people signed in to the Ever Teams deployment they came from (app.ever.team, demo.ever.team, ...).

1. Ever Teams opens the Board with `origin=<its origin>` in the address, for example `https://board.ever.team/?live=true&origin=https%3A%2F%2Fdemo.ever.team`.
2. The Board uses that origin only when it is allowed: its parsed origin must equal one of the allowed origins exactly, over https (http is also accepted on localhost in development), without a user name or password. The Board remembers it in `localStorage`. A visit without an allowed `origin` uses the remembered origin when it is still allowed, else the origin of `VITE_APP_EVER_TEAMS_URL`.
3. The Board calls `GET <origin>/api/board/session` with `credentials: "include"`. Ever Teams answers from its own session cookies, so no token reaches the Board. This relies on the Board and Ever Teams being on the same site (subdomains of `ever.team`), so that the browser sends the Ever Teams cookies along.
   - `200` with `{ id, name, imageUrl }`: signed in.
   - `401`: not signed in. The Board shows "Access denied" with a Login link to `<origin>/auth/passcode?redirect=<Board address>`, which brings the person back to the Board once signed in.
   - Anything else (`404` from a deployment without this route, `403`, `503`, a network or CORS error): the Board falls back to the legacy check, the `auth-token` cookie (when the Board can read it) checked against `VITE_APP_GAUZY_API_URL`, and shows "Access denied" when that fails too.

Build settings (`.env.production`, `.env.development`):

| Setting | Purpose |
| --- | --- |
| `VITE_APP_EVER_TEAMS_URL` | Ever Teams deployment used when a visit names no allowed origin. Its origin is always allowed. |
| `VITE_APP_EVER_TEAMS_ORIGINS` | Comma-separated Ever Teams origins allowed to open the Board, e.g. `https://app.ever.team,https://demo.ever.team,https://stage.ever.team`. Add a deployment here (and rebuild) before linking it to the Board. |
| `VITE_APP_GAUZY_API_URL` | API used by the legacy `auth-token` check only. |

On the Ever Teams side, each deployment sets `NEXT_PUBLIC_BOARD_APP_DOMAIN` to the exact Board origin (for example `https://board.ever.team`): only that origin may call `/api/board/session` or be used as the sign-in `redirect`.

### Firebase Storage and Access-Control-Allow-Origin

If you encounter this error

<img width="1425" alt="Screenshot 2023-10-04 at 10 54 14" src="https://github.com/ever-co/ever-teams-boards/assets/35149259/1a863529-2aee-4fd3-b5b7-fb458756f322">

Fix this by following the procedure below

Open the GCP console and start a cloud terminal session by clicking the `>_` icon button in the top navbar. Or search for "cloud shell editor" in the search bar.

Click the pencil icon to open the editor, then create the `cors.json` file.

Run `gsutil cors set cors.json gs://ever-teams.appspot.com`

<img width="1233" alt="Screenshot 2023-10-04 at 11 00 24" src="https://github.com/ever-co/ever-teams-boards/assets/35149259/95a6aad6-3c24-4883-8c17-4b4ac4775089">
