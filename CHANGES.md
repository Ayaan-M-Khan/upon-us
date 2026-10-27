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
