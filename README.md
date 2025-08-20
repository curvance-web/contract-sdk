<p style="text-align: center;width:100%">
    <img src="https://pbs.twimg.com/profile_banners/1445781144125857796/1752160592" alt="Curvance"/>
</p>

Features
- **Efficient RPC Usage:** Preloads all market data with minimal calls.
- **Typed Contracts:** Uses ethers.js for safe, typed blockchain interactions.
- **Price Feeds:** Integrates Redstone for on-chain price updates.
- **Decimal Support:** Handles BigInt and floating-point math with decimal.js.
- **Flexible Providers:** Works with multiple providers:
    - `ethers.Wallet` - For CLI/Local wallet connections
    - `ethers.JsonRpcSigner` - For browser interactions
    - `ethers.JsonRpcProvider` - For a user configured RPC
    - `null` - We setup a JsonRpcProvider if we configured one for you
- **Property conversions:** For example getting a users asset balance can optionally be returned in USD or token amount
- **Contract addresses:** Use this package to pull in curvance contracts & have the latest contract addresses (especially useful on testnet)

Dependencies:
- [Redstone](https://www.npmjs.com/package/@redstone-finance/sdk): Used to attach price updates in a multicall for some actions.
- [Decimals](https://www.npmjs.com/package/decimal.js): Any floating point path being done with BigInt is done with Decimals.
- [ethers.js](https://www.npmjs.com/package/ethers): All signers passed into the protocol are using ether.js typed signers.

Notes: 
- All values are returned in either BigInt or [Decimals](https://www.npmjs.com/package/decimal.js)
- We use [alchemy](https://dashboard.alchemy.com/apps) chain prefixing for exaple: `eth-mainnet` or `arb-sepolia` to represents chains

## ❯ Install

```
$ npm install --save curvance
```

## ❯ Usage

### Grab general information
This is very RPC efficient as it uses 1-3 RPC call's to setup all the data you need. This is the main way to use the SDK as ALL the data is pre-setup for you. All you need to do is traverse the markets.
```js
const { markets, reader, faucet } = await setupChain("monad-testnet", wallet);
```

You can then explore the data pretty easily like so:
```js
let count = 0;
console.log(`Market summaries in USD:`);
for(const market of markets) {
    console.log(`[${count}] tvl: ${market.tvl.toFixed(18)} | totalDebt: ${market.totalDebt.toFixed(18)} | totalCollateral: ${market.totalCollateral.toFixed(18)}`);
    for(const token of market.tokens) {
        console.log(`\tToken: ${token.symbol} | Price: ${token.getPrice()} | Amount: ${token.getTvl(false)}`);
    }
    count++;
}
```

### Grab individaul classes
```js
const test_1 = new ERC20(signer, `0x123`);
await test_1.approve(someGuy, BigInt(50e18));
```

Some of these classes use preloaded cache to prevent RPC calls for example
```js
const test_1 = new ERC20(signer, `0x123`);
console.log(test_1.name); // Attempts to use cache for name, so this returns undefined
const name = await test_1.fetchName();
console.log(name); // My Test Token
console.log(test_1.name); // My Test Token
```

Note: Protocol reader will populate things like `test_1.name` for underlying assets from the first preload RPC call and wont need to be fetched.


### Helpers
- `getContractAddresses` - Grab the contracts addresses for a given chain
- `AdaptorTypes` - Adaptor identifier enums
- `WAD` - WAD amount
- `WAD_DECIMAL` - WAD amount as Decimal.js type
- `contractSetup` - Used to initialize contract & attach typescript interface
- `handleTransactionWithOracles` - Depending on what adaptor is being used to execute the function we choose to run a multi-call that will write-price on-chain with the given function -- but only if the adaptor is the type of adaptor that requires this (pull oracle)

```js
const contracts = getContractAddresses('monad-testnet');
console.log(contracts.ProtocolReader);
```