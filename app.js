const express = require("express");
const fs = require("fs");
const bodyParser = require("body-parser");
const sigMan = require("./lib/signatureManager");

const config = JSON.parse(process.env.CONFIG);

const depositDataPath =
  process.env.IS_TEST === "true"
    ? "./tests/data/depositData.json"
    : config.dataPath;

const pubKey = process.env.PUB_KEY;

const app = express();

const depositData = JSON.parse(fs.readFileSync(depositDataPath));

app.use(
  bodyParser.text({
    type() {
      return "text";
    },
  })
);

// Validate signature on all reqs.
app.use(async (req, res, next) => {
  try {
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
  } catch (e) {
    res.status(403).send({
      status: "fail",
      message: "Signature or data invalid.",
    });
  }
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
app.post("/addresses", async (req, res) => {
  const { data } = JSON.parse(req.body);

  if (
    data === undefined ||
    data.coin === undefined ||
    data.addresses === undefined ||
    data.addresses.length === 0 ||
    depositData[data.coin] === undefined
  ) {
    console.log(`Invalid address req. Received: ${JSON.stringify(data)}`);
    res.status(403).send({
      status: "fail",
      message: "Invalid address data.",
    });
    return true;
  }

  try {
    if (depositData[data.coin].addresses.length > 0) {
      data.addresses.forEach((newAddress) => {
        let addressExists = false;
        depositData[data.coin].addresses.forEach((oldAddress) => {
          if (oldAddress.address === newAddress.address) {
            addressExists = true;
          }
        });
        if (addressExists === false) {
          depositData[data.coin].addresses.push(newAddress);
        }
      });
    } else {
      depositData[data.coin].addresses = data.addresses;
    }
    fs.writeFileSync(depositDataPath, JSON.stringify(depositData, null, 2));
  } catch (e) {
    console.log(`Error adding new addresses: ${e.message}`);
    res.status(403).send({
      status: "fail",
      message: `Error adding new addresses: ${e.message}`,
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

// Add deposits.
app.post("/deposits", async (req, res) => {
  const { data } = JSON.parse(req.body);

  if (
    data === undefined ||
    data.coin === undefined ||
    data.chainHeight === undefined ||
    data.txData === undefined ||
    depositData[data.coin] === undefined
  ) {
    console.log(`Invalid deposits req. Received: ${JSON.stringify(data)}`);
    res.status(403).send({
      status: "fail",
      message: "Invalid deposits data.",
    });
    return true;
  }

  try {
    if (depositData[data.coin].deposits.length > 0) {
      data.txData.forEach((newDeposit) => {
        if (newDeposit.block === undefined) {
          newDeposit.block = 0; // eslint-disable-line
        }
        let depositExists = false;
        for (let i = 0; i < depositData[data.coin].deposits.length; i += 1) {
          const oldDeposit = depositData[data.coin].deposits[i];
          if (
            oldDeposit.address === newDeposit.address &&
            oldDeposit.txid === newDeposit.txid
          ) {
            depositData[data.coin].deposits[i].confirmations =
              newDeposit.confirmations;
            depositExists = true;
            depositData[data.coin].deposits[i].block = newDeposit.block;
          }
        }
        if (depositExists === false) {
          depositData[data.coin].deposits.push(newDeposit);
        }
      });
    } else {
      depositData[data.coin].deposits = data.txData;
    }

    let highestDepositBlock = 0;

    depositData[data.coin].deposits.forEach((deposit) => {
      if (deposit.block > highestDepositBlock) {
        highestDepositBlock = deposit.block;
      }
    });

    depositData[data.coin].deposits = trimArray(
      depositData[data.coin].deposits,
      config.maxDeposits
    );

    if (highestDepositBlock > depositData[data.coin].highestDepositBlock) {
      depositData[data.coin].lastDepositTime = Date.now();
    }

    depositData[data.coin].highestDepositBlock = highestDepositBlock;
    depositData[data.coin].lastBlockTime = Date.now();
    depositData[data.coin].chainHeight = data.chainHeight;

    depositData[data.coin].deposits.sort((a, b) => {
      return b.block - a.block;
    });

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

function trimArray(arr, length) {
  if (arr.length <= length) {
    return arr;
  }
  arr.sort((a, b) => a - b);
  arr.splice(0, arr.length - length);
  return arr;
}

module.exports = app;
