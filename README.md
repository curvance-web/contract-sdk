<p style="text-align: center;width:100%">
    <img src="https://pbs.twimg.com/profile_banners/1445781144125857796/1752160592" alt="Curvance"/>
</p>

Dependencies:
- [ethers.js](https://www.npmjs.com/package/ethers): All signers passed into the protocol are using ether.js typed signers.
- [alchemy](https://dashboard.alchemy.com/apps): We use alchemy chain prefixing to define changes for example. `eth-mainnet` or `arb-sepolia`, you do not need to use a provider with alchemy but you will need to provide a chain using the alchemy naming standard for a chain.

Note: All values are returned in either BigInt or [Decimals](https://www.npmjs.com/package/decimal.js)

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