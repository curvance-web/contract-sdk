import { config } from 'dotenv';
config({ quiet: true });
import { test, describe, before } from 'node:test';
import assert from 'node:assert';

import { JsonRpcProvider } from 'ethers';
import { address, curvance_signer } from '../src/types';
import { getTestSetup, mineBlock } from './utils/helper';
import { setupChain } from '../src/setup';
import { ChainRpcPrefix, SECONDS_PER_DAY, toDecimal, UINT256_MAX } from '../src/helpers';
import { BorrowableCToken } from '../src/classes/CToken';
import { ERC20 } from '../src/classes/ERC20';


describe('Market Tests', () => {
    let provider: JsonRpcProvider;
    let signer: curvance_signer;
    let account: address;
    let curvance: Awaited<ReturnType<typeof setupChain>>;

    before(async () => {
        const setup = await getTestSetup(process.env.DEPLOYER_PRIVATE_KEY as string);
        provider = setup.provider;
        signer = setup.signer;
        account = signer.address as address;
        curvance = await setupChain(process.env.TEST_CHAIN as ChainRpcPrefix, signer);
    })

    // test('[Faucet] Redeem all tokens', async() => {
    //     const market = curvance.markets[0]!;
        
    //     let claim_tokens: address[] = [];
    //     let claim_amounts: bigint[] = [];
    //     for(const token of market.tokens) {
    //         claim_tokens.push(token.asset.address);
    //         claim_amounts.push(BigInt(10000));
    //     }

    //     const last_claims = await curvance.faucet.multiLastClaimed(account, claim_tokens);
    //     const now = new Date();
    //     const one_day = SECONDS_PER_DAY * 1000n;
    //     for(const claim of last_claims) {
    //         if(now.getTime() < claim.getTime() + Number(one_day)) {
    //             console.log('Ran redeem token already -- found a claim that cannot be redeemed');
    //             return;
    //         }
    //     }

    //     const tx = await curvance.faucet.multiClaim(account, claim_tokens, claim_amounts);
    //     await tx.wait();
    //     await mineBlock(provider);
    // });

    // test(`[Explore] Approve all the markets`, async() => {
    //     for(const market of curvance.markets) {
    //         for(const token of market.tokens) {
    //             const asset = token.getAsset() as ERC20
    //             const allownace = await asset.allowance(account, token.address);
    //             if(allownace >= UINT256_MAX / 2n) {
    //                 console.log(`Already approved ${token.symbol} -- skipping`);
    //                 continue;
    //             }

    //             const tx = await asset.approve(token.address, UINT256_MAX);
    //             await tx.wait();
    //             await mineBlock(provider);
    //         }
    //     }
    // })

    // test('[Explore] Deposit', async() => {
    //     const market = curvance.markets[1]!;
    //     {
    //         // Deposit enough tokens to borrow from later
    //         const token = market.tokens[0]!;

    //         // This should be $100
    //         const tx = await token.deposit(BigInt(100e18), account);
    //         await tx.wait();
    //         await mineBlock(provider);
    //     }
        
    //     {
    //         // Deposit with collateral
    //         const token = market.tokens[1]!;

    //         // This should be $3600
    //         const tx = await token.depositAsCollateral(BigInt(1e18), account);
    //         await tx.wait();
    //         await mineBlock(provider);
    //     }
    // });

    // test('[Explore] Borrow', async() => {
    //     const market = curvance.markets[1]!;
    //     const token = market.tokens[0]! as BorrowableCToken;

    //     // This would be borrwing $15
    //     const tx = await token.borrow(BigInt(15e18), account);
    //     await tx.wait();
    //     await mineBlock(provider);
    // });

    test('[Explore] List markets', async () => {
        // Refresh cached data from previous actions
        curvance = await setupChain(process.env.TEST_CHAIN as ChainRpcPrefix, signer);

        const markets = curvance.markets;
        const market = markets[1]!; // All tests are using this market
        console.log(`Market: ${market.name} (${market.address}):
            TVL - ${market.tvl.toFixed(18)}
            LTV - ${market.ltv}
            Your Deposits: ${market.userDeposits}
            Available Collateral: ${market.userMaxDebt}
            Can borrow: ${market.hasBorrowing()}
            Highest APY: ${market.highestApy()}
            Collateral: ${market.userCollateral}
            Debt: ${market.userDebt}
            Position Health: ${market.positionHealth}
        `);

        for(const token of market.tokens) {
            console.log(`
                Symbol: ${token.symbol} | Token: ${token.name} (${token.address}):
                \tUnderlying: ${toDecimal(await (token.getAsset() as ERC20).balanceOf(account), token.decimals)}
                \tBalance: ${toDecimal(await token.balanceOf(account), token.decimals)}
                \tCollateral Cap: ${token.collateralCap}
                \tDebt Cap: ${token.debtCap}
                \tIs borrowable: ${token.isBorrowable}
                \tPrice: ${token.getPrice()}
                \tDecimal: ${token.decimals}
                \tAPY: ${token.getApy()}
            `);
        }
    });
});