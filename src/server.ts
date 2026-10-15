import app from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";

try {
  await connectDatabase();
  app.listen(env.PORT, () => {
    console.info(`VehicleTrack Pro API listening on port ${env.PORT}`);
  });
} catch (error) {
  console.error("Could not start the API server", error);
  process.exitCode = 1;
}
