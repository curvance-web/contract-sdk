import { config } from 'dotenv';
config({ quiet: true });
import { test, describe, before } from 'node:test';

import { JsonRpcProvider } from 'ethers';
import { address, curvance_signer } from '../src/types';
import { fastForwardTime, getTestSetup, MARKET_HOLD_PERIOD_SECS, mineBlock } from './utils/helper';
import { setupChain } from '../src/setup';
import { ChainRpcPrefix, SECONDS_PER_DAY, toBigInt, toDecimal, UINT256_MAX } from '../src/helpers';
import { BorrowableCToken, CToken } from '../src/classes/CToken';
import { ERC20 } from '../src/classes/ERC20';
import { assert } from 'console';


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

    
    test('[Explore] Can Zap or Leverage', async() => {
        const market = curvance.markets[0]!;
        
        for(const token of market.tokens) {
            assert(typeof token.canZap === "boolean");
            assert(typeof token.canLeverage === "boolean");
        }
    });
    
    // TODO: [Explore] Deposit as zap
    // TODO: [Explore] Deposit with leverage

    test('[Faucet] Redeem all tokens', async() => {
        const market = curvance.markets[0]!;
        
        let claim_tokens: address[] = [];
        let claim_amounts: bigint[] = [];
        for(const token of market.tokens) {
            claim_tokens.push(token.asset.address);
            claim_amounts.push(BigInt(10000));
        }

        const last_claims = await curvance.faucet.multiLastClaimed(account, claim_tokens);
        const now = new Date();
        const one_day = SECONDS_PER_DAY * 1000n;
        for(const claim of last_claims) {
            if(now.getTime() < claim.getTime() + Number(one_day)) {
                console.log('Ran redeem token already -- found a claim that cannot be redeemed');
                return;
            }
        }

        const tx = await curvance.faucet.multiClaim(account, claim_tokens, claim_amounts);
        await tx.wait();
        await mineBlock(provider);
    });

    test(`[Explore] Approve all the markets with max approval amount`, async() => {
        for(const market of curvance.markets) {
            for(const token of market.tokens) {
                const asset = token.getAsset() as ERC20
                const allownace = await asset.allowance(account, token.address);
                if(allownace >= UINT256_MAX / 2n) {
                    console.log(`Already approved ${token.symbol} -- skipping`);
                    continue;
                }

                const tx = await asset.approve(token.address, UINT256_MAX);
                await tx.wait();
                await mineBlock(provider);
            }
        }
    })

    test('[Explore] Deposit with a token using redstone pull', async() => {
        const market = curvance.markets[0]!;
        const token = market.tokens[0]!;

        // This should be $100
        const amount = toBigInt(0.01, token.decimals);
        const tx = await token.deposit(amount, account);
        await tx.wait();
        await mineBlock(provider);
    });

    test('[Explore] Deposit raw', async() => {
        const market = curvance.markets[1]!;
        const token = market.tokens[0]!;

        // This should be $100
        const amount = toBigInt(100, token.decimals);
        const tx = await token.deposit(amount, account);
        await tx.wait();
        await mineBlock(provider);
    });

    test('[Explore] Deposit as collateral', async() => {
        const market = curvance.markets[1]!;
        const token = market.tokens[1]!;

        // This should be $3600
        const amount = toBigInt(1, token.decimals);
        const tx = await token.depositAsCollateral(amount, account);
        await tx.wait();
        await mineBlock(provider);
    })

    test('[Explore] Borrow', async() => {
        const market = curvance.markets[1]!;
        const token = market.tokens[0]! as BorrowableCToken;

        // This would be borrwing $15
        const amount = toBigInt(15, token.decimals);
        const tx = await token.borrow(amount, account);
        await tx.wait();
        await mineBlock(provider);

        await fastForwardTime(provider, MARKET_HOLD_PERIOD_SECS);
        await mineBlock(provider);
    });

    test('[Dashboard] Withdraw', async () => {
        const market = curvance.markets[1]!;
        const token = market.tokens[0]!;

        // Withdraw $1
        const amount = toBigInt(1, token.decimals);
        const tx = await token.redeem(amount, account, account);
        await tx.wait();
        await mineBlock(provider);
    });

    test('[Dashboard] Repay', async () => {
        const market = curvance.markets[1]!;
        const token = market.tokens[0]! as BorrowableCToken;

        // Repay $15
        const amount = toBigInt(15, token.decimals);
        const tx = await token.repay(amount);
        await tx.wait();
        await mineBlock(provider);
    });

    test('[Dashboard] Modify collateral', async () => {
        const market = curvance.markets[1]!;
        const token = market.tokens[1]! as CToken;
        
        
        {
            // Deposit tokens to modify collateral on
            const tx = await token.deposit(100n, account);
            await tx.wait();
            await mineBlock(provider);
        }

        {
            // Modify collateral up
            const tx = await token.postCollateral(100n);
            await tx.wait();
            await mineBlock(provider);

            await fastForwardTime(provider, MARKET_HOLD_PERIOD_SECS);
            await mineBlock(provider);
        }

        {
            // Modify collateral down
            const tx = await token.removeCollateral(100n);
            await tx.wait();
            await mineBlock(provider);
        }
    });

    // TODO: [Dashboard] Modify leverage

    test('[Explore] List markets', async () => {
        // Refresh cached data from previous actions
        curvance = await setupChain(process.env.TEST_CHAIN as ChainRpcPrefix, signer);

        const markets = curvance.markets;
        const market = markets[0]!; // All tests are using this market
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

    test('[Explore] List markets without wallet connected', async () => {
        const readonly_provider = new JsonRpcProvider(process.env.TEST_RPC);
        const test = await setupChain(process.env.TEST_CHAIN as ChainRpcPrefix, readonly_provider);
        
        const signed_market = curvance.markets[1]!;
        const unsigned_market = test.markets[1]!; // All tests are using this market
        assert(unsigned_market.ltv == signed_market.ltv, 'LTV should be the same');
        assert(unsigned_market.name == signed_market.name, 'Makert names should be the same');

        for(const token_idx in signed_market.tokens) {
            const signed_market_token = signed_market.tokens[token_idx]!;
            const unsigned_market_token = unsigned_market.tokens[token_idx]!;

            assert(unsigned_market_token.debtCap.equals(signed_market_token.debtCap), `Debt Cap should be the same`);
            assert(unsigned_market_token.name == signed_market_token.name, `Token names should be the same`);
        }
    });
});