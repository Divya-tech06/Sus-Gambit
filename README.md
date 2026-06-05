# ♟️ Chess Impostor

A multiplayer social deduction game where chess meets deception.

In Chess Impostor, players work together to defeat a chess bot while one hidden player secretly tries to sabotage the game from within.

Everyone controls the White pieces.

The bot controls Black.

One player is the Impostor.

The challenge isn't just finding the best move—it's figuring out who is intentionally making the worst ones.

---

## How It Works

At the start of each match:

* One player is randomly assigned as the **Impostor**
* All other players become **Crewmates**
* Players take turns controlling White
* After each player move, the bot responds as Black

The game continues until either White wins, Black wins, or the Impostor is discovered.

---

## Crewmate Objective

Work together to:

* Find strong chess moves
* Identify suspicious behavior
* Vote out the Impostor before it's too late
* Defeat the Black bot

---

## Impostor Objective

Blend in while secretly helping Black.

The Impostor can:

* Make suspicious moves
* Miss tactics
* Sacrifice pieces
* Manipulate discussions
* Shift blame onto innocent players

But be careful.

If the Impostor is voted out, the game ends immediately.

---

## Emergency Meetings

After a configurable number of moves, players can call an Emergency Meeting.

During a meeting:

* Discuss suspicious moves
* Accuse players
* Defend yourself
* Vote someone out

When a player is eliminated:

* Their role is revealed
* If they were innocent, the game continues
* If they were the Impostor, the Crewmates win instantly

---

## Victory Conditions

### Crewmates Win

* White checkmates Black
* The Impostor is voted out

### Impostor Wins

* Black checkmates White
* White resigns
* Only two players remain alive and one of them is the Impostor

---

## Features

* Real-time multiplayer gameplay
* Hidden role system
* Emergency meetings and voting
* Live game chat
* Room codes and private lobbies
* Automatic role assignment
* Chess bot opponent
* Match statistics and vote history
* Spectator mode for eliminated players
* Reconnection support

---

## Tech Stack

### Frontend

* React
* TypeScript
* Tailwind CSS
* React Router
* Zustand
* react-chessboard
* chess.js
* Socket.IO Client

### Backend

* Node.js
* Express
* TypeScript
* Socket.IO

### Database

* PostgreSQL
* Prisma ORM

### Authentication

* JWT Authentication
* Refresh Tokens
* bcrypt

### Chess Engine

* Stockfish WASM

---

## The Real Question

Was that move a mistake...

or sabotage?
