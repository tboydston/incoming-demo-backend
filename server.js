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
console.log(config);
try {
  http.createServer(app).listen(config.port);
  console.log(`Demo Server running on port ${config.port}`);
} catch (e) {
  console.log(e);
}
