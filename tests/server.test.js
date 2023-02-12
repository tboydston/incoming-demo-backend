const request = require("supertest");
const httpStatus = require("http-status");
const fs = require("fs");
const crypto = require("crypto");

process.env.IS_TEST = true;
process.env.PUB_KEY = fs.readFileSync("./tests/keys/pub.pem");
process.env.CONFIG = JSON.stringify(require("./config-test"));

const depositData = {
  BTC: {
    chainHeight: 0,
    highestDepositBlock: 0,
    lastBlockTime: 0,
    lastDepositTime: 0,
    addresses: {},
    deposits: [],
  },
};

fs.writeFileSync(
  "./tests/data/depositData.json",
  JSON.stringify(depositData, null, 2),
  (error) => {
    if (error) {
      console.error(error);
    }
  }
);

const app = require("../app");
const sigMan = require("../lib/signatureManager");

const privKey = fs.readFileSync("./tests/keys/priv.key");

const demoAddresses = {
  coin: "BTC",
  addresses: [
    {
      xPubHash:
        "93f50d6676288093c9f58bec4e57fd65aa12ae70ccd961039dec0ebb080a9868",
      index: 1,
      path: "m/84'/0'/0'/0/1",
      address: "bc1qcp0t2g0s7m6gul7wmuq4q4xjusrz7q5uhutest",
      pubKey:
        "02449dbf873fc99dd194953ab34a076982a1cb014b54063c54c533edd9ee5test",
    },
    {
      xPubHash:
        "93f50d6676288093c9f58bec4e57fd65aa12ae70ccd961039dec0ebb080a9868",
      index: 2,
      path: "m/84'/0'/0'/0/2",
      address: "bc1qgl88uxk5d9bmnrvru0ww0th35uzcwv3jytest2",
      pubKey:
        "03a8a72147af8ac933a6f6d2d2ede6172ea0a3187eb33a707a5fd1f993b65test",
    },
  ],
};

const demoDeposits = {
  coin: "BTC",
  chainHeight: 739526,
  txData: [
    {
      xPubHash:
        "93f50d6676288093c9f58bec4e57fd65aa12ae70ccd961039dec0ebb080a9868",
      address: "bc1q46y8dujhdy4wl52m4xlkdarp6uvlj280rtest1",
      amount: 1.0201,
      confirmations: 0,
      txid: "bf0980ef2b56288570535f6e34e84da57704657a0aa77669c34a48dcatesttest5",
    },
    {
      xPubHash:
        "93f50d6676288093c9f58bec4e57fd65aa12ae70ccd961039dec0ebb080a9868",
      address: "bc1q46y8dujhsy4wl52m4xlkdarp6uvlj280rktest",
      amount: 1.0001,
      confirmations: 0,
      txid: "bf0980ef2b56288570535f6e34e84da57704657a0aa77669c34a48dcadfftest",
    },
    {
      xPubHash:
        "93f50d6676288093c9f58bec4e57fd65aa12ae70ccd961039dec0ebb080a9868",
      address: "bc1ql2vsmnjmzkj7adqkf4d9hehgfmj4c8a8vstest",
      amount: 2.3422,
      confirmations: 1,
      block: 739527,
      txid: "541d5beb1f5a79bcfbebfbfab0f30dcc0595e73f15c335ada78bc70197ectest",
    },
  ],
};

describe("POST /addresses", () => {
  test("Should add new addresses to tests/data/depositData.json", async () => {
    const unsignedData = {
      nonce: Date.now(),
      data: demoAddresses,
    };

    const signedData = await sigMan.sign(privKey, JSON.stringify(unsignedData));

    await request(app)
      .post("/addresses")
      .set("Signature", signedData.signature)
      .send(JSON.parse(signedData.data))
      .expect(httpStatus.OK);
  });
});

describe("POST /deposits", () => {
  test("Should add new deposits to tests/data/depositData.json", async () => {
    const unsignedData = {
      nonce: Date.now(),
      data: demoDeposits,
    };

    const signedData = await sigMan.sign(privKey, JSON.stringify(unsignedData));

    await request(app)
      .post("/deposits")
      .set("Signature", signedData.signature)
      .send(JSON.parse(signedData.data))
      .expect(httpStatus.OK);
  });
});

describe("POST /validate/addresses", () => {
  test("Expect returned hash to match locally calculated hash when validating by hash.", async () => {
    let validationString = "";

    demoAddresses.addresses.forEach((address) => {
      validationString += `${address.index},${address.address},`;
    });

    const validationHash = crypto
      .createHash("sha256")
      .update(validationString)
      .digest("hex");

    const unsignedData = {
      nonce: Date.now(),
      data: {
        xPubHash: demoAddresses.addresses[0].xPubHash,
        validationType: "hash",
        startIndex: 1,
        endIndex: 2,
      },
    };

    const signedData = await sigMan.sign(privKey, JSON.stringify(unsignedData));

    const response = await request(app)
      .post("/validate/addresses")
      .set("Signature", signedData.signature)
      .send(JSON.parse(signedData.data))
      .expect(httpStatus.OK);

    expect(response.body.data.hash).toBe(validationHash);
  });
  test("Expect returned addresses to match stored addresses when validating by address.", async () => {
    const addObj = {};
    let index = 1;
    demoAddresses.addresses.forEach((address) => {
      addObj[index] = address.address;
      index += 1;
    });

    const unsignedData = {
      nonce: Date.now(),
      data: {
        xPubHash: demoAddresses.addresses[0].xPubHash,
        validationType: "address",
        startIndex: 1,
        endIndex: 2,
      },
    };

    const signedData = await sigMan.sign(privKey, JSON.stringify(unsignedData));

    const response = await request(app)
      .post("/validate/addresses")
      .set("Signature", signedData.signature)
      .send(JSON.parse(signedData.data))
      .expect(httpStatus.OK);
    expect(response.body.data.addresses).toStrictEqual(addObj);
  });
});

describe("POST /validate/deposits", () => {
  test("Should add new deposits to tests/data/depositData.json", async () => {
    const formDeposits = {};

    const trunDeposits = [demoDeposits.txData[0], demoDeposits.txData[1]];

    trunDeposits[0].block = 0;
    trunDeposits[1].block = 0;

    trunDeposits.forEach((deposit) => {
      if (formDeposits[deposit.txid] === undefined) {
        formDeposits[deposit.txid] = {};
      }

      formDeposits[deposit.txid][deposit.address] = deposit.amount;
    });

    const unsignedData = {
      nonce: Date.now(),
      data: {
        xPubHash: demoAddresses.addresses[0].xPubHash,
        startBlock: 1,
        endBlock: 999999,
      },
    };

    const signedData = await sigMan.sign(privKey, JSON.stringify(unsignedData));

    const response = await request(app)
      .post("/validate/deposits")
      .set("Signature", signedData.signature)
      .send(JSON.parse(signedData.data))
      .expect(httpStatus.OK);

    expect(response.body.data.deposits).toStrictEqual(formDeposits);
  });
});

describe("Verify Data", () => {
  test("Should add new deposits to tests/data/depositData.json", async () => {
    const depositDataFile = JSON.parse(
      fs.readFileSync("./tests/data/depositData.json")
    ).BTC;

    expect(depositDataFile.addresses.length).toBe(
      demoAddresses.addresses.length
    );
    expect(depositDataFile.deposits.length).toBe(2);
    expect(depositDataFile.chainHeight).toBe(739526);
    expect(depositDataFile.lastBlockTime).toBeGreaterThan(0);
    expect(depositDataFile.lastDepositTime).toBeGreaterThan(0);
  });
});

describe("POST /deposits", () => {});
