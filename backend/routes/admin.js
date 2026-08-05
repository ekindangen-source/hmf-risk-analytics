import { Router } from "express";
import { refreshAnalytics } from "../services/analyticsRefresh.js";

const router = Router();

router.post("/refresh", async (request, response) => {
  const expectedHeader = process.env.INTERNAL_REFRESH_HEADER;

  if (
    !expectedHeader ||
    request.get("X-Internal-Refresh") !== expectedHeader
  ) {
    return response.status(403).json({
      error: "Forbidden",
    });
  }

  try {
    const result = await refreshAnalytics("manual");

    return response.json({
      status: "OK",
      message: "Analytics refreshed successfully",
      data: result,
    });
  } catch (error) {
    request.log.error({ error }, "Manual analytics refresh failed");

    const status = error.message.includes("already running")
      ? 409
      : 500;

    return response.status(status).json({
      status: "FAILED",
      error:
        status === 409
          ? "Another refresh is already running"
          : "Analytics refresh failed",
    });
  }
});

export default router;
