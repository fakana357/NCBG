# Night City Battlegrounds — multiplayer server

One Node.js process serves the game page and runs every match. Each match runs in its own worker thread with the full game engine, so the server is the referee: players only send their moves.

- **Find Match** waits at most 30 seconds, groups everyone who is waiting (up to 8 per match) and fills the rest with bots.
- **Rooms** get a 4-letter code. The host can start any time, with or without bots (at least 2 players without bots).
- Bots get nicknames and a mix of difficulties (about 60% Normal, 30% Hard, 10% Very Hard).
- Recruit timer: 45 s on turn 1, +5 s per turn, up to 90 s. The turn ends early when every player has pressed End Turn.
- If someone disconnects, a bot plays their seat until they reload the page and take it back.

## Deploy on Render (free, no command line)

1. Put this folder in a GitHub repository (github.com → New repository → "uploading an existing file" → drag in everything from this folder).
2. Sign in at render.com with GitHub → **New +** → **Blueprint** → pick the repository → **Apply**.
3. Wait for the build (2–3 minutes) and open the URL Render shows, e.g. `https://night-city-battlegrounds.onrender.com`.

The free plan sleeps after 15 minutes without visitors; the first visit after that takes about a minute to wake it.

## Deploy with Docker (any VPS)

```
docker compose up -d --build
```

The game is then on port 80 of that machine.

## Run locally

```
npm install
npm start
```

Open http://localhost:8080. Set `PORT` to change the port.
