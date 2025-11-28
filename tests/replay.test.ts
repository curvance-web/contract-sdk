import { config } from 'dotenv';
config({ quiet: true });
import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { JsonRpcProvider, Wallet } from 'ethers';
import { address, curvance_signer } from '../src/types';
import { getTestSetup, MARKET_HOLD_PERIOD_SECS, setNativeBalance } from './utils/helper';
import { setupChain } from '../src/setup';
import { ChainRpcPrefix } from '../src/helpers';
import { BorrowableCToken } from '../src/classes/BorrowableCToken';
import Decimal from 'decimal.js';


describe('Market Tests', () => {
    let provider: JsonRpcProvider;
    let signer: curvance_signer;
    let account: address;

    before(async () => {
        const setup = await getTestSetup(process.env.DEPLOYER_PRIVATE_KEY as string);
        provider = setup.provider;
        signer = setup.signer;
        account = signer.address as address;
    })

    test('test', async function() {
        const test_wallet = "0xe2165a834f93c39483123ac31533780b9c679ed4";
        await provider.send("anvil_impersonateAccount", [test_wallet]);
        
        const impersonatedSigner = await provider.getSigner(test_wallet);
        const impCurvance = await setupChain('monad-mainnet', impersonatedSigner, true);
        for(const market of impCurvance.markets) {
            // console.log(market.name);
            if(market.name == 'aprMON | WMON') {
                const [ aprMON, WMON ] = market.tokens as [ BorrowableCToken, BorrowableCToken ];
                await WMON.deposit(Decimal(50000000), 'none');
                // const depositAmount = Decimal(4779.433969669800378533);
                // const pluginAddr = WMON.getPluginAddress('simple', 'positionManager');
                // await WMON.approveUnderlying(null, pluginAddr);
                // await WMON.approvePlugin('simple', 'positionManager');
                // await WMON.depositAndLeverage(depositAmount, aprMON, depositAmount.mul(8.33), 'simple', Decimal(.9));
                
            }   
            // for(const token of market.tokens) {
            //     console.log(token.symbol, token.getLeverage(), token.getUserCollateral(true), token.getUserDebt(true));
            // }
        }

        await provider.send("anvil_stopImpersonatingAccount", [test_wallet]);
    });
});