import { JsonRpcProvider, toBeHex, Wallet } from 'ethers';
import { Block } from 'ethers';
import { ChainRpcPrefix } from '../../src/helpers';

export const MARKET_HOLD_PERIOD_SECS = 1200; // 20 minutes

const fresh = Wallet.createRandom();
export const TEST_ACCOUNTS = [
    { account_name: 'DEPLOYER', account_pk: process.env.DEPLOYER_PRIVATE_KEY as string },
    { account_name: 'FRESH', account_pk: fresh.privateKey as string },
];

// Utility function to fast forward time on Anvil
export async function fastForwardTime(provider: JsonRpcProvider, seconds: number) {
    // Increase time by the specified amount
    await provider.send('evm_increaseTime', [seconds]);
    await mineBlock(provider);
}

export async function mineBlock(provider: JsonRpcProvider) {
    const beforeBlock = await provider.getBlock('latest');

    await provider.send('evm_mine', []);

    let newBlock: Block | null = null;
    do {
        newBlock = await provider.getBlock('latest');
        if(newBlock?.number == beforeBlock?.number) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    } while (beforeBlock?.number === newBlock?.number);
}

export async function setNativeBalance(provider: JsonRpcProvider, targetAddress: string, amount: bigint) {
    const haxAmount = toBeHex(amount);
    await provider.send("anvil_setBalance", [targetAddress, haxAmount]);
    await mineBlock(provider);
}

export const getTestSetup = async (private_key: string) => {
    const provider = new JsonRpcProvider(process.env.TEST_RPC);
    const wallet = new Wallet(private_key, provider);
    return {
        provider,
        signer: wallet
    };
}

export const getRpcUrl = (chain_prefix: ChainRpcPrefix) => {
    return `https://${chain_prefix}.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
}
