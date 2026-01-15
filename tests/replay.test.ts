import { config } from 'dotenv';
config({ quiet: true });
import { test, describe, before, after } from 'node:test';
import { address } from '../src/types';
import { setupChain } from '../src/setup';
import { BorrowableCToken } from '../src/classes/BorrowableCToken';
import { TestFramework } from './utils/TestFramework';
import Decimal from 'decimal.js';


describe('Replay', () => {
    let account: address;
    let framework: TestFramework;

    before(async () => {
        framework = await TestFramework.init(process.env.DEPLOYER_PRIVATE_KEY as string, 'monad-mainnet', {
            seedNativeBalance: false,
            seedUnderlying: false,
            snapshot: true,
            log: false,
        });
        account = framework.account;
    })

    after(async () => {
        await framework.destroy();
    });

    test('test', async function() {
        const impersonate = "0xe2165a834F93C39483123Ac31533780b9c679ed4";
        await framework.impersonateStart(impersonate);

        const [ market, cWMON, cAUSD ] = await framework.getMarket('WMON | AUSD');
        const wmon = await cWMON.getAsset(true);

        console.log(`Existing position: `, await cWMON.getUserShareBalance(false));

        await cWMON.approveUnderlying();
        await cWMON.depositAsCollateral(Decimal(500));
        await framework.skipMarketCooldown(market.address, impersonate);
        await market.reloadUserData(impersonate);

        console.log('New position: ', await cWMON.getUserShareBalance(false));
        console.log('Asset position: ', await cWMON.getUserAssetBalance(false));

        const beforeBalance = await wmon.balanceOf(impersonate, false);
        console.log(`WMON balance before: ${beforeBalance}`);

        await cWMON.redeem(Decimal(200));
        await market.reloadUserData(impersonate);

        console.log('Final position: ', await cWMON.getUserShareBalance(false));
        console.log('Final asset position: ', await cWMON.getUserAssetBalance(false));

        const afterBalance = await wmon.balanceOf(impersonate, false);
        console.log(`WMON balance after: ${afterBalance}`);
        console.log(`WMON redeemed: ${afterBalance - beforeBalance}`);

        // const shMON = cshMON.getAsset(true);

        // const beforeBalance = await shMON.balanceOf(impersonate, false);
        // console.log(`shMON balance before: ${beforeBalance}`);

        // await cshMON.redeem(Decimal(1000));

        // const afterBalance = await shMON.balanceOf(impersonate, false);
        // console.log(`shMON balance after: ${afterBalance}`);
        // console.log(`shMON redeemed: ${afterBalance - beforeBalance}`);
    });
});