import { expect, test } from "@playwright/test";
import {
  createHangmanLobby,
  getHangmanLobbyView,
  guessHangmanLetter,
  joinHangmanLobby,
  readyHangmanPlayer,
} from "../src/lib/hangman";

test("solo mode lets the player move and the bot answer", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Choose How to Play" }),
  ).toBeVisible();
  await page.getByLabel("Row 1, column 1, empty").click();

  await expect(page.getByLabel("Row 1, column 1, marked X")).toBeVisible();
  await expect(page.locator('[aria-label$="marked O"]')).toHaveCount(1);
  await expect(page.getByText("Your turn")).toBeVisible();
});

test("two-player mode removes a player's oldest fourth active mark", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: /One Device/ }).click();
  await expect(
    page.getByRole("button", { name: /One Device/ }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByLabel("Row 1, column 1, empty").click();
  await page.getByLabel("Row 1, column 2, empty").click();
  await page.getByLabel("Row 2, column 1, empty").click();
  await page.getByLabel("Row 2, column 2, empty").click();
  await page.getByLabel("Row 3, column 3, empty").click();
  await page.getByLabel("Row 1, column 3, empty").click();
  await page.getByLabel("Row 3, column 1, empty").click();

  await expect(page.getByLabel("Row 1, column 1, empty")).toBeVisible();
  await expect(page.getByLabel("Row 3, column 1, marked X")).toBeVisible();
  await expect(page.getByLabel("3 active X marks")).toBeVisible();
  await expect(page.getByLabel("3 active O marks")).toBeVisible();
  await expect(page.getByText("Player O's turn")).toBeVisible();
});

test("tic-tac-toe lobby can be created, joined, and synced", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Multiplayer/ }).click();
  await page.getByRole("button", { name: "Create Lobby" }).click();

  const creatorLobbyCode = page.locator(
    'output[aria-label="Tic-Tac-Toe lobby code"]',
  );
  await expect(creatorLobbyCode).toHaveText(/[A-Z0-9]{6}/);
  const code = (await creatorLobbyCode.textContent())?.trim();

  expect(code).toBeTruthy();
  await expect(page.getByText("Ready to play")).toBeVisible();
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await expect(page.getByText("Waiting for Player O")).toBeVisible();

  const joiner = await context.newPage();
  await joiner.goto("/");
  await joiner.getByRole("button", { name: /Multiplayer/ }).click();
  await joiner.getByLabel("Arcade lobby code").fill(code!);
  await joiner.getByRole("button", { name: "Join Lobby" }).click();

  await expect(
    joiner.locator('output[aria-label="Tic-Tac-Toe lobby code"]'),
  ).toHaveText(code!);
  await expect(joiner.getByText("Ready to play")).toBeVisible();
  await joiner.getByRole("button", { name: "Ready", exact: true }).click();
  await expect(page.getByText("Your turn")).toBeVisible();
  await expect(joiner.getByText("Player's turn")).toBeVisible();

  await page.getByLabel("Row 1, column 1, empty").click();

  await expect(page.getByLabel("Row 1, column 1, marked X")).toBeVisible();
  await expect(joiner.getByLabel("Row 1, column 1, marked X")).toBeVisible();
  await expect(joiner.getByText("Your turn")).toBeVisible();

  await joiner.getByLabel("Row 1, column 2, empty").click();

  await expect(page.getByLabel("Row 1, column 2, marked O")).toBeVisible();
  await expect(joiner.getByLabel("Row 1, column 2, marked O")).toBeVisible();
});

test("tic-tac-toe lobby shows a five minute waiting countdown", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Multiplayer/ }).click();
  await page.getByRole("button", { name: "Create Lobby" }).click();

  await expect(page.getByLabel("Lobby wait countdown")).toHaveText(
    /Waiting\s*(5:00|4:5\d)/,
  );
});

test("hangman lobby stays available while the waiting countdown is active", async ({
  page,
}) => {
  const joinRequests: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());

    if (
      request.method() === "POST" &&
      /^\/api\/hangman\/lobbies\/[A-Z0-9]{6}\/join$/.test(url.pathname)
    ) {
      joinRequests.push(url.pathname);
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: /Multiplayer/ }).click();
  await page.getByRole("button", { name: /Hangman/ }).click();
  await page.getByRole("button", { name: "Create Lobby" }).click();

  const lobbyCode = page.locator('output[aria-label="Hangman lobby code"]');

  await expect(lobbyCode).toHaveText(/[A-Z0-9]{6}/);
  const code = (await lobbyCode.textContent())?.trim();

  expect(code).toBeTruthy();
  await expect(page.getByLabel("Lobby wait countdown")).toHaveText(
    /Waiting\s*(5:00|4:5\d)/,
  );

  await page.waitForTimeout(1_200);

  await expect(lobbyCode).toHaveText(code!);
  await expect(page.getByText("Lobby is no longer available.")).toHaveCount(0);
  await expect(page.getByText("Lobby not found.")).toHaveCount(0);
  expect(joinRequests.length).toBeLessThanOrEqual(1);

  const statusResponse = await page.request.get(`/api/lobbies/${code}`);

  expect(statusResponse.status()).toBe(200);
  await expect(statusResponse.json()).resolves.toMatchObject({
    game: "hangman",
  });
});

test("host can switch lobby game after entering their name once", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Multiplayer/ }).click();
  await expect(page.getByLabel("Player Name")).toHaveCount(1);
  await page.getByLabel("Player Name").fill("Ada");
  await page.getByRole("button", { name: "Create Lobby" }).click();

  const ticTacToeLobbyCode = page.locator(
    'output[aria-label="Tic-Tac-Toe lobby code"]',
  );
  await expect(ticTacToeLobbyCode).toHaveText(/[A-Z0-9]{6}/);
  const code = (await ticTacToeLobbyCode.textContent())?.trim();

  expect(code).toBeTruthy();
  await expect(page.getByLabel("Player Name")).toHaveCount(0);

  const joiner = await context.newPage();

  await joiner.goto("/");
  await joiner.getByRole("button", { name: /Multiplayer/ }).click();
  await joiner.getByLabel("Arcade lobby code").fill(code!);
  await joiner.getByRole("button", { name: "Join Lobby" }).click();

  await expect(
    joiner.locator('output[aria-label="Tic-Tac-Toe lobby code"]'),
  ).toHaveText(code!);

  const hostMemoryJoinRequests: string[] = [];
  const guestMemoryJoinRequests: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());

    if (
      request.method() === "POST" &&
      url.pathname === `/api/memory/lobbies/${code}/join`
    ) {
      hostMemoryJoinRequests.push(url.pathname);
    }
  });

  joiner.on("request", (request) => {
    const url = new URL(request.url());

    if (
      request.method() === "POST" &&
      url.pathname === `/api/memory/lobbies/${code}/join`
    ) {
      guestMemoryJoinRequests.push(url.pathname);
    }
  });

  await page.getByRole("button", { name: /Memory Cards/ }).click();

  await expect(page.getByRole("heading", { name: "Memory Cards" })).toBeVisible();
  await expect(page.locator('output[aria-label="Lobby code"]')).toHaveText(
    code!,
  );
  await expect(page.getByText("Ada")).toBeVisible();
  await expect(
    joiner.getByRole("heading", { name: "Memory Cards" }),
  ).toBeVisible();
  await expect(joiner.locator('output[aria-label="Lobby code"]')).toHaveText(
    code!,
  );

  await page.waitForTimeout(1_200);
  expect(hostMemoryJoinRequests.length).toBeLessThanOrEqual(1);
  expect(guestMemoryJoinRequests.length).toBeLessThanOrEqual(1);
});

test("returning tic-tac-toe player can reclaim a full lobby", async ({
  request,
}) => {
  const creatorToken = "creator-rejoin-token";
  const joinerToken = "joiner-rejoin-token";
  const createResponse = await request.post("/api/tic-tac-toe/lobbies", {
    data: {
      playerName: "Ada",
      rejoinToken: creatorToken,
    },
  });

  expect(createResponse.ok()).toBe(true);

  const created = await createResponse.json();
  const code = created.lobby.code;

  const joinResponse = await request.post(
    `/api/tic-tac-toe/lobbies/${code}/join`,
    {
      data: {
        playerName: "Grace",
        rejoinToken: joinerToken,
      },
    },
  );

  expect(joinResponse.ok()).toBe(true);

  const rejoinResponse = await request.post(
    `/api/tic-tac-toe/lobbies/${code}/join`,
    {
      data: {
        playerName: "Ada",
        rejoinToken: creatorToken,
      },
    },
  );

  expect(rejoinResponse.ok()).toBe(true);

  const rejoined = await rejoinResponse.json();

  expect(rejoined.playerId).toBe("X");
  expect(rejoined.lobby.players).toHaveLength(2);
});

test("tic-tac-toe lobby closes for the guest when the host leaves", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Multiplayer/ }).click();
  await page.getByRole("button", { name: "Create Lobby" }).click();

  const creatorLobbyCode = page.locator(
    'output[aria-label="Tic-Tac-Toe lobby code"]',
  );
  await expect(creatorLobbyCode).toHaveText(/[A-Z0-9]{6}/);
  const code = (await creatorLobbyCode.textContent())?.trim();

  expect(code).toBeTruthy();

  const joiner = await context.newPage();
  await joiner.goto("/");
  await joiner.getByRole("button", { name: /Multiplayer/ }).click();
  await joiner.getByLabel("Arcade lobby code").fill(code!);
  await joiner.getByRole("button", { name: "Join Lobby" }).click();

  await expect(
    joiner.locator('output[aria-label="Tic-Tac-Toe lobby code"]'),
  ).toHaveText(code!);

  await page.getByRole("button", { name: "Leave Lobby" }).click();

  await expect(
    joiner.locator('output[aria-label="Tic-Tac-Toe lobby code"]'),
  ).toHaveCount(0);
  await expect(joiner.getByRole("button", { name: "Create Lobby" })).toBeVisible();
});

test("memory card lobby can be created, joined, and synced", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Multiplayer/ }).click();
  await page.getByRole("button", { name: /Memory Cards/ }).click();
  await page.getByRole("button", { name: "Create Lobby" }).click();

  const creatorLobbyCode = page.locator('output[aria-label="Lobby code"]');
  await expect(creatorLobbyCode).toHaveText(/[A-Z0-9]{6}/);
  const code = (await creatorLobbyCode.textContent())?.trim();

  expect(code).toBeTruthy();
  await expect(page.getByText("Ready to play")).toBeVisible();
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await expect(page.getByText("Waiting for Player 2")).toBeVisible();

  const joiner = await context.newPage();
  await joiner.goto("/");
  await joiner.getByRole("button", { name: /Multiplayer/ }).click();
  await joiner.getByLabel("Arcade lobby code").fill(code!);
  await joiner.getByRole("button", { name: "Join Lobby" }).click();

  await expect(joiner.locator('output[aria-label="Lobby code"]')).toHaveText(
    code!,
  );
  await expect(joiner.getByText("Ready to play")).toBeVisible();
  await joiner.getByRole("button", { name: "Ready", exact: true }).click();
  await expect(page.getByText("Your turn")).toBeVisible();
  await expect(joiner.getByText("Player's turn")).toBeVisible();

  const firstCreatorCard = page.getByRole("button", {
    name: "Hidden memory card 1",
    exact: true,
  });
  const firstJoinerCard = joiner.getByRole("button", {
    name: "Hidden memory card 1",
    exact: true,
  });

  await firstCreatorCard.click();
  await expect(firstCreatorCard).toBeHidden();
  await expect(firstJoinerCard).toBeHidden();
});

test("memory cards solo mode lets one player flip cards", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Memory Cards/ }).click();

  await expect(
    page.getByRole("button", { name: /Singleplayer/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Find a pair")).toBeVisible();
  await expect(page.locator('button[aria-label^="Hidden memory card"]')).toHaveCount(
    16,
  );
  await expect(page.getByText("Matches")).toBeVisible();
  await expect(page.getByText("Moves")).toBeVisible();

  const firstCard = page.getByRole("button", {
    name: "Hidden memory card 1",
    exact: true,
  });

  await firstCard.click();
  await expect(firstCard).toBeHidden();
  await expect(page.getByText("Pick one more")).toBeVisible();
});

test("hangman is playable on a phone-sized viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /Hangman/ }).click();

  await expect(page.getByRole("heading", { name: "Hangman" })).toBeVisible();
  await expect(page.getByLabel("Hangman letter keyboard")).toBeVisible();
  await expect(page.getByText("Pick a letter")).toBeVisible();

  const hasNoHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );

  expect(hasNoHorizontalOverflow).toBe(true);

  const letterA = page.getByRole("button", { name: "Guess A" });

  await letterA.click();
  await expect(letterA).toBeDisabled();
});

test("shared multiplayer lobby join is usable on a phone-sized viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /Multiplayer/ }).click();

  const lobbyCode = page.getByLabel("Arcade lobby code");

  await expect(lobbyCode).toBeVisible();
  await lobbyCode.fill("ab-c12 3");
  await expect(lobbyCode).toHaveValue("ABC123");
  await expect(page.getByRole("button", { name: "Join Lobby" })).toBeVisible();

  const hasNoHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  );

  expect(hasNoHorizontalOverflow).toBe(true);
});

test("hangman lobby waits for both players to ready before starting", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Multiplayer/ }).click();
  await page.getByRole("button", { name: /Hangman/ }).click();
  await page.getByRole("button", { name: "Create Lobby" }).click();

  const creatorLobbyCode = page.locator(
    'output[aria-label="Hangman lobby code"]',
  );
  await expect(creatorLobbyCode).toHaveText(/[A-Z0-9]{6}/);
  const code = (await creatorLobbyCode.textContent())?.trim();

  expect(code).toBeTruthy();
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await expect(page.getByText("Waiting for Player 2")).toBeVisible();

  const joiner = await context.newPage();
  await joiner.goto("/");
  await joiner.getByRole("button", { name: /Multiplayer/ }).click();
  await joiner.getByLabel("Arcade lobby code").fill(code!);
  await joiner.getByRole("button", { name: "Join Lobby" }).click();

  await expect(
    joiner.locator('output[aria-label="Hangman lobby code"]'),
  ).toHaveText(code!);
  await expect(joiner.getByText("Ready to race")).toBeVisible();

  await joiner.getByRole("button", { name: "Ready", exact: true }).click();

  await expect(joiner.getByText("Race is live")).toBeVisible();
  await expect(page.getByText("Race is live")).toBeVisible();
  await expect(joiner.getByLabel("Hangman letter keyboard")).toBeVisible();
});

test("hangman lobby records the first solver as the fastest winner", () => {
  const puzzle = { word: "ARCADE", category: "Games" };
  let lobby = createHangmanLobby("ABC123", "Ada", 1_000, puzzle);

  lobby = joinHangmanLobby(lobby, "Grace", 1_100);
  lobby = readyHangmanPlayer(lobby, "player-1", 2_000);
  lobby = readyHangmanPlayer(lobby, "player-2", 3_000);
  lobby = guessHangmanLetter(lobby, "player-2", "A", 3_100);
  lobby = guessHangmanLetter(lobby, "player-1", "A", 3_200);
  lobby = guessHangmanLetter(lobby, "player-1", "R", 3_300);
  lobby = guessHangmanLetter(lobby, "player-1", "C", 3_400);
  lobby = guessHangmanLetter(lobby, "player-1", "D", 3_500);
  lobby = guessHangmanLetter(lobby, "player-1", "E", 3_600);

  const playerOneView = getHangmanLobbyView(lobby, "player-1");
  const playerTwoView = getHangmanLobbyView(lobby, "player-2");

  expect(lobby.status).toBe("finished");
  expect(lobby.winnerId).toBe("player-1");
  expect(playerOneView?.players[0].elapsedMs).toBe(600);
  expect(playerOneView?.revealedWord).toBe("ARCADE");
  expect(playerTwoView?.wordSlots.join("")).toBe("ARCADE");
});
