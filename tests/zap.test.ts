import { config } from 'dotenv';
config({ quiet: true });
import { test, describe, before, afterEach, after } from 'node:test';
import { address } from '../src/types';
import Decimal from 'decimal.js';
import { TestFramework } from './utils/TestFramework';
import { fastForwardTime, MARKET_HOLD_PERIOD_SECS } from './utils/helper';
import { ERC20 } from '../src';

describe('Zapping', () => {
    let account: address;
    let framework: TestFramework;

    before(async () => {
        framework = await TestFramework.init(process.env.DEPLOYER_PRIVATE_KEY as string, 'monad-mainnet', {
            seedNativeBalance: true,
            seedUnderlying: true,
            snapshot: true,
            log: false,
        });
        account = framework.account;
    })

    after(async () => {
        await framework.destroy();
    });

    afterEach(async () => {
        await framework.reset();
    });

    test('Naitve Zap', async function() {
        const [ market, shMON, WMON ] = await framework.getMarket('shMON | WMON');
        const depositAmount = Decimal(1_000);

        await shMON.approvePlugin('native-vault', 'zapper');
        await shMON.approveUnderlying(depositAmount);
        await shMON.depositAsCollateral(depositAmount, 'native-vault');
    });

    test('Vault Zap', async function() {
        const [ market, csAUSD, cAUSD ] = await framework.getMarket('sAUSD | AUSD');
        const depositAmount = Decimal(1_000);

        const sAUSD = await csAUSD.getUnderlyingVault();
        const AUSD = await sAUSD.fetchAsset(true);
        await csAUSD.approvePlugin('vault', 'zapper');
        await AUSD.approve(csAUSD.getPluginAddress('vault', 'zapper') as address, depositAmount);
        await csAUSD.approveUnderlying(depositAmount);
        await csAUSD.depositAsCollateral(depositAmount, 'vault');
    });

    test('Simple Zap', async function() {
        const [ market, cearnAUSD, cAUSD ] = await framework.getMarket('earnAUSD | AUSD');
        const depositAmount = Decimal(1_000);

        const first_available_token = (await cearnAUSD.getDepositTokens())[2]!;

        await cearnAUSD.approvePlugin('simple', 'zapper');
        await cearnAUSD.approveUnderlying(depositAmount);

        // Not required for native token zaps
        if(first_available_token.interface instanceof ERC20) {
            await first_available_token.interface.approve(cearnAUSD.getPluginAddress('simple', 'zapper') as address, depositAmount);
        }

        await cearnAUSD.depositAsCollateral(depositAmount, {
            type: 'simple',
            inputToken: first_available_token.interface.address,
            slippage: Decimal(0.005)
        });
    });
});