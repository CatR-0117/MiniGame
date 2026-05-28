# Mini Arcade

A Next.js and Tailwind CSS mini arcade with a game chooser, Tic-Tac-Toe, and Memory Cards.

## Tic-Tac-Toe Rules

- Choose Solo to play against the bot, Same Device for local turns, or Lobby for online turns with a code.
- Each player can only keep 3 active marks on the board.
- When a player places a 4th mark, that player's oldest active mark disappears.
- Lobby games use a 6-character code and sync the board while the Next.js server is running.

## Memory Cards

- Choose Solo to play a local one-player matching game, or Lobby to play with another person using a code.
- Create a lobby to receive a 6-character lobby code.
- A second player can join the lobby with that code from another browser or device connected to the same running app.
- Players take turns flipping cards. Matching pairs score a point and keep the turn; missed pairs pass the turn.
- Lobbies are stored in memory on the Next.js server and expire when the server restarts.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run test:e2e
```
