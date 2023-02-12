const express = require("express");
const fs = require("fs");
const crypto = require("crypto");
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

// Validate Deposit Addresses.
app.post("/validate/addresses", async (req, res) => {
  const validationTypes = ["hash", "address"];
  let validRequest = true;
  let reqData = {};

  // This is basic validation for this example. In a live environment this should be replaced with something more robust.
  try {
    reqData = JSON.parse(req.body).data;
  } catch (e) {
    validRequest = false;
  }

  if (
    reqData.xPubHash === undefined ||
    reqData.validationType === undefined ||
    reqData.xPubHash.length !== 64 ||
    !validationTypes.includes(reqData.validationType) ||
    Number.isNaN(reqData.startIndex) ||
    Number.isNaN(reqData.endIndex)
  ) {
    validRequest = false;
  }

  if (validRequest === false) {
    res.status(400).send({
      status: "fail",
      message:
        "Invalid request. Body must include data object with xPubHash, validationType, startIndex, and endIndex.",
      data: null,
    });
    return;
  }

  let depositsAddress = [];

  try {
    // eslint-disable-next-line
    for (const [key, value] of Object.entries(depositData)) {
      if (depositData[key].addresses[0].xPubHash === reqData.xPubHash) {
        depositsAddress = depositData[key].addresses;
      }
    }

    if (depositsAddress.length === 0) {
      console.log(`xPubHash ${reqData.xPubHash} does not exists.`);
      res.status(500).send({
        status: "fail",
        message: "xPubHash does not exists.",
        data: null,
      });
      return;
    }
  } catch (e) {
    console.log("Error finding xPubHash. Raw Error:", e);
    res.status(500).send({
      status: "fail",
      message: "Deposit data structure invalid.",
      data: null,
    });
    return;
  }

  // Request to validate deposit addresses by hash.
  if (reqData.validationType === "hash") {
    let addressHash = "";

    try {
      addressHash = await getAddressHash(
        depositsAddress,
        reqData.startIndex,
        reqData.endIndex
      );
    } catch (e) {
      console.log("Error generating address hash. Raw Error:", e);
      res.status(500).send({
        status: "fail",
        message: "Unknown Error",
        data: null,
      });
      return;
    }

    res.status(200).send({
      status: "success",
      message: null,
      data: {
        hash: addressHash,
      },
    });
  }

  if (reqData.validationType === "address") {
    let addresses = {};

    try {
      addresses = await getAddresses(
        depositsAddress,
        reqData.startIndex,
        reqData.endIndex
      );
    } catch (e) {
      console.log("Error generating addresses. Raw Error:", e);
      res.status(500).send({
        status: "fail",
        message: "Unknown Error",
        data: null,
      });
      return;
    }

    res.status(200).send({
      status: "success",
      message: null,
      data: {
        addresses,
      },
    });
  }
});

// Validate Deposits.
app.post("/validate/deposits", async (req, res) => {
  let validRequest = true;
  let reqData = {};

  // This is basic validation for this example. In a live environment this should be replaced with something more robust.
  try {
    reqData = JSON.parse(req.body).data;
  } catch (e) {
    validRequest = false;
  }

  if (
    reqData.xPubHash === undefined ||
    reqData.xPubHash.length !== 64 ||
    Number.isNaN(reqData.startBlock) ||
    Number.isNaN(reqData.endBlock)
  ) {
    validRequest = false;
  }

  if (validRequest === false) {
    res.status(400).send({
      status: "fail",
      message:
        "Invalid request. Body must include data object with xPubHash, startBlock, and endBlock.",
      data: null,
    });
    return;
  }

  let deposits = {};
  let formatedDeposits = {};

  try {
    // eslint-disable-next-line
    for (const [key, value] of Object.entries(depositData)) {
      if (depositData[key].deposits[0].xPubHash === reqData.xPubHash) {
        deposits = depositData[key].deposits;
      }
    }

    if (Object.keys(deposits).length === 0) {
      console.log(`xPubHash ${reqData.xPubHash} does not exists.`);
      res.status(500).send({
        status: "fail",
        message: "xPubHash does not exists.",
        data: null,
      });
      return;
    }
  } catch (e) {
    console.log("Error finding xPubHash. Raw Error:", e);
    res.status(500).send({
      status: "fail",
      message: "Deposit data structure invalid.",
      data: null,
    });
    return;
  }

  try {
    formatedDeposits = await getDeposits(
      deposits,
      reqData.startBlock,
      reqData.endBlock
    );
  } catch (e) {
    console.log(e);
    res.status(500).send({
      status: "fail",
      message: "Unknown Error",
      data: null,
    });
    return;
  }

  res.status(200).send({
    status: "success",
    message: null,
    data: {
      formatedDeposits,
    },
  });
});

async function getAddressHash(addresses, startIndex, endIndex) {
  let validationString = "";

  addresses.forEach((address) => {
    if (address.index >= startIndex && address.index <= endIndex) {
      validationString += `${address.index},${address.address},`;
    }
  });

  const validationHash = crypto
    .createHash("sha256")
    .update(validationString)
    .digest("hex");

  return validationHash;
}

async function getAddresses(allAddresses, startIndex, endIndex) {
  const addresses = [];

  allAddresses.forEach((address) => {
    if (address.index >= startIndex && address.index <= endIndex) {
      addresses.push(address);
    }
  });

  const addObj = {};

  let index = startIndex;
  addresses.forEach((address) => {
    addObj[index] = address.address;
    index += 1;
  });

  return addObj;
}

async function getDeposits(deposits, startBlock, endBlock) {
  // Format wallet transactions.
  const formDeposits = {};

  deposits.forEach((deposit) => {
    // Exclude deposits outside of range.
    if (deposit.blockheight < startBlock || deposit.blockheight > endBlock) {
      return;
    }

    if (formDeposits[deposit.txid] === undefined) {
      formDeposits[deposit.txid] = {};
    }

    formDeposits[deposit.txid][deposit.address] = deposit.amount;
  });

  return formDeposits;
}

function trimArray(arr, length) {
  if (arr.length <= length) {
    return arr;
  }
  arr.sort((a, b) => {
    if (a.block === 0) {
      return -1;
    }

    if (b.block === 0) {
      return 1;
    }

    return b.block - a.block;
  });

  arr.splice(-(arr.length - length), arr.length - length);
  return arr;
}

module.exports = app;
