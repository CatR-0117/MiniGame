# Mini Arcade

A Next.js and Tailwind CSS mini arcade with a game chooser, Tic-Tac-Toe, Memory Cards, Hangman, Word Scramble, and Word Search.

## Tic-Tac-Toe Rules

- Choose Solo to play against the bot, Same Device for local turns, or Lobby for online turns with a code.
- Each player can only keep 3 active marks on the board.
- When a player places a 4th mark, that player's oldest active mark disappears.
- Lobby games use a 6-character code and sync the board while the Next.js server is running.

## Supabase Backend

Multiplayer lobbies are persisted through Supabase when these environment
variables are configured:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

Run `supabase/arcade_lobbies.sql` in the Supabase SQL editor first. It creates a
single `public.arcade_lobbies` table that stores each lobby as JSON with lobby
code, game, and expiration metadata.

On Vercel, add the same environment variables in Project Settings before
deploying. Do not rely on in-memory lobbies in Vercel serverless functions:
requests can hit different function instances, which makes lobbies disappear.
The app only falls back to memory outside production unless
`SUPABASE_LOBBY_FALLBACK=true` is set.

## Memory Cards

- Choose Solo to play a local one-player matching game, or Lobby to play with another person using a code.
- Create a lobby to receive a 6-character lobby code.
- A second player can join the lobby with that code from another browser or device connected to the same running app.
- Players take turns flipping cards. Matching pairs score a point and keep the turn; missed pairs pass the turn.
- Lobbies persist through Supabase, with an in-memory fallback only for local development.

## Hangman

- Choose Solo to solve a hidden word, or Lobby to race another player with the same word.
- Lobby players ready up before the round starts.
- The first player to solve the word wins; if both players run out of guesses, the round ends with no winner.

## Word Scramble

- Choose Solo to unscramble a word, or Lobby to race another player with the same scrambled word.
- Lobby players ready up before the round starts.
- Each player gets 6 guesses. The first correct answer wins the round.

## Word Search

- Choose Solo to find every word on a letter grid, or Lobby to race another player on the same board.
- Select the first and last letters of a word in a straight line.
- Lobby players ready up before the round starts. The first player to find every listed word wins.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run test:e2e
```
