# Mini Arcade

A Next.js and Tailwind CSS mini arcade with a game chooser, Tic-Tac-Toe, and Memory Cards.

## Tic-Tac-Toe Rules

- Choose Solo to play against the bot, Same Device for local turns, or Lobby for online turns with a code.
- Each player can only keep 3 active marks on the board.
- When a player places a 4th mark, that player's oldest active mark disappears.
- Lobby games use a 6-character code and sync the board while the Next.js server is running.

## Supabase Backend

Multiplayer lobbies are persisted through Supabase REST when these environment
variables are configured:

```bash
SUPABASE_REST_URL=https://your-project-ref.supabase.co/rest/v1/
SUPABASE_API_KEY=your-supabase-publishable-or-anon-key
```

Run `supabase/arcade_lobbies.sql` in the Supabase SQL editor first. It creates a
single `public.arcade_lobbies` table that stores each lobby as JSON with lobby
code, game, and expiration metadata. If Supabase is unavailable or the table is
missing during local development, the app logs a warning and temporarily falls
back to in-memory lobbies.

## Memory Cards

- Choose Solo to play a local one-player matching game, or Lobby to play with another person using a code.
- Create a lobby to receive a 6-character lobby code.
- A second player can join the lobby with that code from another browser or device connected to the same running app.
- Players take turns flipping cards. Matching pairs score a point and keep the turn; missed pairs pass the turn.
- Lobbies persist through Supabase when configured, with an in-memory fallback for local development.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run test:e2e
```
