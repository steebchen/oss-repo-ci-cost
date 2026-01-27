import { test, expect } from "@playwright/test";

test.describe("GitHub Actions Cost Calculator", () => {
  test.beforeEach(async ({ request }) => {
    // Initialize database before each test
    await request.get("/api/init");
  });

  test("landing page renders correctly", async ({ page }) => {
    await page.goto("/");

    // Check main heading
    await expect(
      page.getByRole("heading", { name: "GitHub Actions Cost Calculator" })
    ).toBeVisible();

    // Check description
    await expect(
      page.getByText("Calculate theoretical GitHub Actions costs")
    ).toBeVisible();

    // Check input field
    await expect(page.getByLabel("Repository")).toBeVisible();
    await expect(
      page.getByPlaceholder("owner/repo (e.g., facebook/react)")
    ).toBeVisible();

    // Check submit button
    await expect(
      page.getByRole("button", { name: "Calculate Costs" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Calculate Costs" })
    ).toBeDisabled();

    // Check pricing info
    await expect(
      page.getByText("Public repositories have FREE GitHub Actions usage")
    ).toBeVisible();
  });

  test("validates repository format", async ({ page }) => {
    await page.goto("/");

    // Enter invalid format
    await page.getByLabel("Repository").fill("invalid-repo");
    await page.getByRole("button", { name: "Calculate Costs" }).click();

    // Should show error
    await expect(
      page.getByText("Invalid format. Use: owner/repo")
    ).toBeVisible();
  });

  test("enables button when valid repo entered", async ({ page }) => {
    await page.goto("/");

    // Enter valid format
    await page.getByLabel("Repository").fill("octocat/Hello-World");

    // Button should be enabled
    await expect(
      page.getByRole("button", { name: "Calculate Costs" })
    ).toBeEnabled();
  });

  test("full calculation flow", async ({ page }) => {
    await page.goto("/");

    // Enter a repository
    await page.getByLabel("Repository").fill("octocat/Hello-World");
    await page.getByRole("button", { name: "Calculate Costs" }).click();

    // Should navigate to results page
    await expect(page).toHaveURL(/\/octocat\/Hello-World/);

    // Wait for results (either loading or completed)
    await expect(
      page.getByText(/Calculating Costs|GitHub Actions Cost Analysis/)
    ).toBeVisible({ timeout: 10000 });

    // Wait for completion
    await expect(
      page.getByRole("heading", { name: "GitHub Actions Cost Analysis" })
    ).toBeVisible({ timeout: 60000 });

    // Check results page elements
    await expect(page.getByText("octocat/Hello-World")).toBeVisible();
    await expect(page.getByText(/Summary/)).toBeVisible();

    // Check cost sections
    await expect(page.getByText(/Actual Cost/)).toBeVisible();
    await expect(page.getByText(/Estimated Monthly/)).toBeVisible();
    await expect(page.getByText(/Estimated Yearly/)).toBeVisible();

    // Check back link
    await expect(
      page.getByRole("link", { name: "Calculate Another Repository" })
    ).toBeVisible();
  });

  test("results page shows loading or result state", async ({ page }) => {
    // Go directly to a new repo
    await page.goto("/");
    const uniqueRepo = `test-org/test-repo-${Date.now()}`;
    await page.getByLabel("Repository").fill(uniqueRepo);
    await page.getByRole("button", { name: "Calculate Costs" }).click();

    // Should show either loading state or completed/error state eventually
    // Using heading role to be more specific
    await expect(
      page.getByRole("heading", {
        name: /Calculating Costs|GitHub Actions Cost Analysis|Calculation Failed/,
      })
    ).toBeVisible({ timeout: 30000 });
  });

  test("not found page shows for unknown status", async ({ page }) => {
    // Go directly to a repo that doesn't exist in DB without triggering calculation
    const response = await page.request.get(
      "/api/status/nonexistent/repo123456"
    );
    const data = await response.json();

    expect(data.status).toBe("not_found");
  });

  test("api returns correct structure", async ({ request }) => {
    // Initialize DB
    await request.get("/api/init");

    // Start calculation - may return pending or completed if cached
    const calcResponse = await request.post("/api/calculate", {
      data: { slug: "octocat/Hello-World" },
    });
    const calcData = await calcResponse.json();

    // Status should be either pending or completed (if cached)
    expect(["pending", "completed"]).toContain(calcData.status);

    // Wait a bit for calculation to complete if pending
    if (calcData.status === "pending") {
      await new Promise((r) => setTimeout(r, 5000));
    }

    // Check status
    const statusResponse = await request.get(
      "/api/status/octocat/Hello-World"
    );
    const statusData = await statusResponse.json();

    expect(statusData.status).toBe("completed");
    expect(statusData.data).toHaveProperty("slug");
    expect(statusData.data).toHaveProperty("daysAnalyzed");
    expect(statusData.data).toHaveProperty("actualCost");
    expect(statusData.data).toHaveProperty("monthlyCost");
    expect(statusData.data).toHaveProperty("yearlyCost");
  });
});
