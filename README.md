# Chess Impostor

Chess Impostor is a real-time multiplayer social deduction chess game. Players collectively control White against a Black bot, while one hidden Impostor tries to make White lose without being voted out.

## Stack

- React, TypeScript, Tailwind CSS, React Router, Zustand, `react-chessboard`, `chess.js`, Socket.IO client
- Node.js, Express, Socket.IO, TypeScript
- PostgreSQL with Prisma
- JWT auth with refresh tokens and bcrypt password hashing

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure the server:

   ```bash
   cp server/.env.example server/.env
   ```

3. Generate Prisma client and run migrations:

   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

4. Start both apps:

   ```bash
   npm run dev
   ```

Client: `http://localhost:5173`

Server: `http://localhost:4000`
