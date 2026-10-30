import "dotenv/config";
import { createApp } from "./app.js";
import { getEnv } from "./utils/env.js";

const env = getEnv(); // fails fast with a clear message if a secret is missing
createApp().listen(env.PORT, () => console.log(`API listening on :${env.PORT}`));
