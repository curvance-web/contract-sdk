import { execSync } from 'child_process';
import fs from 'fs';
import Anvil from './anvil';
import { address } from '../../src/types';
import { ChainRpcPrefix } from '../../src/helpers';
import { getRpcUrl } from './helper';

export default class Foundry {
    rpc: string;
    repo: string;
    chain: ChainRpcPrefix;
    anvil: Anvil | undefined;
    contracts: { [key: string]: address } = {};

    constructor(chain_prefix: ChainRpcPrefix) {
        this.repo = process.env.CONTRACT_REPO_PATH as string;
        this.chain = chain_prefix;
        this.rpc = getRpcUrl(chain_prefix);
    }

    static getAbi(contract_name: string) {
        const repo = process.env.CONTRACT_REPO_PATH as string;
        const path = `${repo}/artifacts`;
        const abiPath = `${path}/${contract_name}.sol/${contract_name}.json`;
        
        if (!fs.existsSync(abiPath)) {
            throw new Error(`ABI for contract ${contract_name} not found at ${abiPath}`);
        }

        return JSON.parse(fs.readFileSync(abiPath, 'utf-8')).abi;
    }

    get scripts() {
        return fs.readdirSync(`${this.repo}/script/deployment`)
            .filter(file => file.endsWith('.s.sol'))
            .map(file => file.replace('.s.sol', ''));
    }

    async fork() {
        if(process.env.RPC_OVERRIDE) {
            this.rpc = process.env.RPC_OVERRIDE;
            console.log(`Using RPC override: ${this.rpc}`);
            return;
        }

        this.anvil = new Anvil(this.rpc, this.chain);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second to ensure Anvil killed off previous instance
        await this.anvil.start();

        if(!this.anvil.rpc) {
            throw new Error('Anvil RPC is not set. Make sure Anvil is started successfully.');
        }

        this.rpc = this.anvil.rpc;
    }

    build() {
        process.chdir(this.repo as string);
        execSync('forge build', { stdio: 'ignore' });
    }

    shutdown() {
        if (this.anvil) {
            this.anvil.stop();
        }
    }
}