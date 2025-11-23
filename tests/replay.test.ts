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
        const test_wallet = "0x6D3DA13B41E18Dc7bd1c084De0034fBcB1fDbCE8";
        await provider.send("anvil_impersonateAccount", [test_wallet]);
        
        const impersonatedSigner = await provider.getSigner(test_wallet);
        const impCurvance = await setupChain('monad-mainnet', impersonatedSigner, true);
        for(const market of impCurvance.markets) {
            if(market.name == 'earnAUSD | AUSD') {
                const [ earnAUSD, AUSD ] = market.tokens as [BorrowableCToken, BorrowableCToken];
                console.log(await earnAUSD.getUserUnderlyingBalance(false));
                await earnAUSD.depositAsCollateral(Decimal('1.00659'));
            }
        }

        await provider.send("anvil_stopImpersonatingAccount", [test_wallet]);
    });
});