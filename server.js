const fs = require("fs");
const express = require("express");
const http = require("http");
//const bodyParser = require("body-parser");

const pubKey = fs.readFileSync("./keys/pub.pem");
const sigMan = require("./lib/signatureManager");

const config = require("./config");

const depositDataPath = "./data/depositData.json"(async () => {
  const app = express();

  const depositData = JSON.parse(fs.readFileSync(depositDataPath));

  // app.use(
  //   bodyParser.text({
  //     type(req) {
  //       return "text";
  //     },
  //   })
  // );

  // Validate signature on all reqs.
  app.use(async (req, res, next) => {
    const sigResult = await sigMan.verify(
      pubKey,
      req.body,
      req.headers.signature
    );
    if (sigResult) return next();
    console.log("Invalid signature.");
    res.status(403).send({
      status: "fail",
      message: "Invalid signature.",
    });
    return true;
  });

  // Validate nonce on all reqs.
  app.use(async (req, res, next) => {
    const now = Date.now();
    const { nonce } = JSON.parse(req.body);

    if (nonce === undefined || nonce < now - config.nonceTolerance) {
      console.log(
        `Invalid nonce. Sent: ${nonce}, No later then: ${
          now - config.nonceTolerance
        }`
      );
      res.status(403).send({
        status: "fail",
        message: "Invalid nonce.",
      });
      return true;
    }

    return next();
  });

  // Log incoming req to console.
  app.use(async (req, res, next) => {
    console.log(req.originalUrl, req.body);
    next();
  });

  // Add deposits.
  app.post("/deposits", async (req, res) => {
    if (
      req.body.data === undefined ||
      !["coin", "chainHeight", "txData"].some((key) =>
        Object.prototype.hasOwnProperty.call(req.body.data, key)
      ) ||
      depositData[req.body.data.coin] === undefined
    ) {
      console.log(
        `Invalid deposits req. Recieved: ${JSON.stringify(depositData)}`
      );
      res.status(403).send({
        status: "fail",
        message: "Invalid deposits data.",
      });
      return true;
    }

    try {
      const newDeposit = req.body.data;
      const data = depositData[req.body.data.coin];
      data.chainHeight = newDeposit.chainHeight;
      data.txData.push(newDeposit);
      data.txData = trimArray(data.txData, data.maxDeposits);
      depositData[req.body.data.coin] = data;

      fs.writeFileSync(depositDataPath, JSON.stringify(depositData, null, 2));
    } catch (e) {
      console.log(`Error adding new deposits: ${e.message}`);
      res.status(403).send({
        status: "fail",
        message: `Error adding new deposits: ${e.message}`,
      });
      return true;
    }

    res.status(200).send({
      status: "success",
      message: null,
      data: null,
    });

    return true;
  });

  try {
    http.createServer(app).listen(config.serverPort);
    console.log(`Demo Server running on port ${config.serverPort}`);
  } catch (e) {
    console.log(e);
  }
})();

function trimArray(arr, length) {
  if (arr.length <= length) {
    return arr;
  }
  arr.sort((a, b) => a - b);
  arr.splice(0, arr.length - length);
  return arr;
}
