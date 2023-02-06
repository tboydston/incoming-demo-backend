const http = require("http");
const fs = require("fs");

if (process.env.IS_TEST === "true") {
  process.env.PUB_KEY = fs.readFileSync("./tests/keys/pub.pem");
  process.env.CONFIG = JSON.stringify(require("./tests/config-test"));
} else {
  process.env.PUB_KEY = fs.readFileSync("./keys/pub.pem");
  process.env.CONFIG = JSON.stringify(require("./config"));
}

const app = require("./app");

const config = JSON.parse(process.env.CONFIG);

(async () => {
  try {
    await fs.promises.access(config.dataPath);
  } catch (err) {
    console.log(
      `Deposit data doesn't exist at ${config.dataPath}. Attempting to create it from template...`
    );
    await fs.promises.copyFile(
      "./data/depositData-template.json",
      config.dataPath
    );
  }

  try {
    http.createServer(app).listen(config.port);
    console.log(`Demo Server running on port ${config.port}`);
    console.log(`Config:`, config);
  } catch (e) {
    console.log(e);
  }
})();
