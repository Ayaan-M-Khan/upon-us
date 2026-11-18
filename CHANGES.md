# Changes in this update

- **Bots**: lobbies with fewer than 4 players are filled with AI bots (toggle "Fill empty seats with bots" in lobby settings). Bots path-find, do tasks, kill (impostor), report bodies, chat and vote.
- **Movement**: held keys are cleared on blur/tab-away/menus, input listeners are removed on unmount (they used to stack), camera drag can no longer stick, velocity is smoothed, server clamps speed.
- **Map**: rebuilt as a Skeld-style layout from floor rectangles; walls, collision, bot navigation and the 3D map are all generated from the same data (`shared/mapData.ts`).
- **Game loop** (server-authoritative, `server/game/GameRoom.ts`): roles, tasks, kills/bodies/ghosts, vents, emergency button, report, meetings + chat + voting + ejection, win conditions, return to lobby.
- **UI**: Among Us-style HUD (task bar + list, USE / REPORT / KILL / VENT / SABOTAGE buttons), role reveal, meeting screen, ejection scene, game over screen.

Not done yet: sabotages (button is shown disabled), fog-of-war / vision radius, collision on props like the cafeteria table.

## Update 2

- **Movement**: rigid camera follow (no more character jitter), camera zooms in instantly at walls and eases back out, collision is sub-stepped so a slow frame can't tunnel through walls, smooth turning, same stuck-key fixes applied to the lobby scene.
- **Map**: more compact Skeld layout with chamfered Cafeteria/engines/reactor, loop corridors (west loop via Medbay, east loop via Weapons/Navigation/Shields), explicit task spots and vents per room. All spots verified reachable for bots.
- **Tasks are now 2D**: pressing USE opens a flat mini-game panel (`src/ui/taskGames.tsx`): wires, card swipe, align engine, clean O2, prime shields, calibrate, divert power, unlock manifolds, chart course, stabilize steering, scan, asteroids, fuel, garbage, download/upload, start reactor, inspect sample.
- **Lobby**: crew panel moved to a right-hand side panel (bottom sheet on phones), single big Start button, and the dropship's south wall that was hiding your character is gone; the camera is offset so the crew sits centred in the free area.

## Update 3 — multiplayer reliability

- **Reconnect / refresh**: each tab has a session id (sessionStorage). When a socket drops, the server holds the seat (60 s in a match, 20 s in the lobby) instead of removing the player, so a refresh or Wi-Fi blip no longer ejects you or ends the match. On reconnect the client rejoins automatically and every server reference (lobby, game room, bodies, votes, bot memory) is re-keyed to the new socket. Other players see "(offline)" / "Reconnecting…" meanwhile, and votes don't wait for offline players. A duplicated tab can't steal a live seat. Explicit Leave still releases the seat immediately.
- **Kick** now actually removes the kicked client's view (it used to stay in a frozen lobby) and shows why on the menu.
- **Server hardening**: every socket handler is wrapped so a malformed payload can't crash the process; names, codes, lobby input and all settings are validated (kill distance, task bar mode, booleans, at least one task).
- **Ready toggle** is now sent to the server and shown to everyone (it was local-only); the fake "24ms" ping is replaced by real Online / Ready / Reconnecting status.
- **Vision**: the crewmate / impostor vision sliders now set the sight radius (14 m × multiplier); lights sabotage cuts crew vision to 35 % and darkens the screen around them.
- **Visual Tasks** setting now works: others see a green scanner on players doing Submit Scan, Clear Asteroids, Prime Shields or Empty Garbage.
- **Task Bar Updates** (Always / Meetings / Never) is implemented and exposed in lobby settings.
- **Name tags** update in-game: impostors see their partners in red; offline players are marked.
- `npm install` works again (esbuild dev dependency was outside Vite 8's peer range).
- **Tests**: `npm run test:mp` boots the server in-process and drives scripted clients through join, kick, ready, malformed payloads, lobby + mid-match disconnect/rejoin, seat expiry, host migration and a full match played over the socket protocol to game over and back to the lobby.

Prop collision (cafeteria tables, reactor, etc.) was already in place via `MAP_OBSTACLES`; the "not done yet" note above is out of date.
