import { expect, test } from "@playwright/test";

test("solo mode lets the player move and the bot answer", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Choose a Game" })).toBeVisible();
  await page.getByLabel("Row 1, column 1, empty").click();

  await expect(page.getByLabel("Row 1, column 1, marked X")).toBeVisible();
  await expect(page.locator('[aria-label$="marked O"]')).toHaveCount(1);
  await expect(page.getByText("Your turn")).toBeVisible();
});

test("two-player mode removes a player's oldest fourth active mark", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Same Device" }).click();
  await expect(
    page.getByRole("button", { name: "Same Device" }),
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
  await page.getByRole("button", { name: "Lobby", exact: true }).click();
  await page.getByRole("button", { name: "Create Lobby" }).click();

  const creatorLobbyCode = page.locator(
    'output[aria-label="Tic-Tac-Toe lobby code"]',
  );
  await expect(creatorLobbyCode).toHaveText(/[A-Z0-9]{6}/);
  const code = (await creatorLobbyCode.textContent())?.trim();

  expect(code).toBeTruthy();
  await expect(page.getByText("Waiting for Player O")).toBeVisible();

  const joiner = await context.newPage();
  await joiner.goto("/");
  await joiner.getByRole("button", { name: "Lobby", exact: true }).click();
  await joiner.getByLabel("Tic-Tac-Toe lobby code").fill(code!);
  await joiner.getByRole("button", { name: "Join Lobby" }).click();

  await expect(
    joiner.locator('output[aria-label="Tic-Tac-Toe lobby code"]'),
  ).toHaveText(code!);
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

test("memory card lobby can be created, joined, and synced", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Memory Cards/ }).click();
  await page.getByRole("button", { name: "Lobby", exact: true }).click();
  await page.getByRole("button", { name: "Create Lobby" }).click();

  const creatorLobbyCode = page.locator('output[aria-label="Lobby code"]');
  await expect(creatorLobbyCode).toHaveText(/[A-Z0-9]{6}/);
  const code = (await creatorLobbyCode.textContent())?.trim();

  expect(code).toBeTruthy();
  await expect(page.getByText("Waiting for Player 2")).toBeVisible();

  const joiner = await context.newPage();
  await joiner.goto("/");
  await joiner.getByRole("button", { name: /Memory Cards/ }).click();
  await joiner.getByRole("button", { name: "Lobby", exact: true }).click();
  await joiner.getByLabel("Lobby code").fill(code!);
  await joiner.getByRole("button", { name: "Join Lobby" }).click();

  await expect(joiner.locator('output[aria-label="Lobby code"]')).toHaveText(
    code!,
  );
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
    page.getByRole("button", { name: "Solo", exact: true }),
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
