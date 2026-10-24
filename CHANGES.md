# Changes in this update

- **Bots**: lobbies with fewer than 4 players are filled with AI bots (toggle "Fill empty seats with bots" in lobby settings). Bots path-find, do tasks, kill (impostor), report bodies, chat and vote.
- **Movement**: held keys are cleared on blur/tab-away/menus, input listeners are removed on unmount (they used to stack), camera drag can no longer stick, velocity is smoothed, server clamps speed.
- **Map**: rebuilt as a Skeld-style layout from floor rectangles; walls, collision, bot navigation and the 3D map are all generated from the same data (`shared/mapData.ts`).
- **Game loop** (server-authoritative, `server/game/GameRoom.ts`): roles, tasks, kills/bodies/ghosts, vents, emergency button, report, meetings + chat + voting + ejection, win conditions, return to lobby.
- **UI**: Among Us-style HUD (task bar + list, USE / REPORT / KILL / VENT / SABOTAGE buttons), role reveal, meeting screen, ejection scene, game over screen.

Not done yet: sabotages (button is shown disabled), fog-of-war / vision radius, collision on props like the cafeteria table.
