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