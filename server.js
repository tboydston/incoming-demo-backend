const http = require("http");
const fs = require("fs");

if (process.env.IS_TEST === "true") {
  process.env.PUB_KEY = fs.readFileSync("./tests/keys/pub.pem");
  process.env.CONFIG = JSON.stringify(require("./tests/config-test"));
} else {
  process.env.PUB_KEY = fs.readFileSync("./keys/pub.pem");
  process.env.CONFIG = JSON.stringify(require("./config"));
}

const config = JSON.parse(process.env.CONFIG);

if (!fs.existsSync(config.dataPath)) {
  console.log(
    `Deposit data doesn't exist at ${config.dataPath}. Attempting to create it from template...`
  );
  fs.copyFileSync("./data/depositData-template.json", config.dataPath);
}

const app = require("./app");

try {
  http.createServer(app).listen(config.port);
  console.log(`Demo Server running on port ${config.port}`);
  console.log(`Config:`, config);
} catch (e) {
  console.log(e);
}
