import { ethers } from "ethers";
import { spawn, exec } from "child_process";
import { openSync, existsSync, mkdirSync } from "fs";
import net from 'net';
import { address } from '../../src/types';
import { ChainRpcPrefix } from "../../src/helpers";

export default class Anvil {
    forkRpc: string;
    rpc: string | undefined;
    process: any;
    provider: ethers.JsonRpcProvider | undefined;
    chainName: ChainRpcPrefix;
    port: number;
    running: boolean = false;

    constructor(rpc: string, chain: ChainRpcPrefix , port = 8545) {
        this.forkRpc = rpc;
        this.chainName = chain;
        this.port = port;
    }

    async start() {
        // Kill any process using this port
        exec(`lsof -ti:${this.port} | xargs kill -9 2>/dev/null || true`, () => {});

        const logPath = `${process.cwd()}/storage/${this.chainName}-anvil.log`;
        if(!existsSync(`${process.cwd()}/storage`)) {
            mkdirSync(`${process.cwd()}/storage`);
        }
        const logFile = openSync(logPath, 'w');

        const isPortUsed = await isPortInUse(this.port);
        if(isPortUsed) {
            throw new Error(`Anvil Port ${this.port} is already in use, make sure to terminate any existing anvil process`);
        }

        const anvil = spawn("anvil", [
                "--fork-url", this.forkRpc,
                "--port", this.port.toString(),
            ], {
            detached: false,
            stdio: ['ignore', logFile, logFile],
        });

        this.process = anvil;
        this.rpc = `http://localhost:${this.port}`
        await waitUntilPortIsUsed(this.port);
        this.provider = new ethers.JsonRpcProvider(this.rpc);
        this.provider.send("anvil_setRpcUrl", [this.forkRpc]);
        this.provider.send("anvil_setLoggingEnabled", [true]);

        this.running = true;
    }

    stop() {
        if(this.process) {
            this.process.kill();
        }
        this.running = false;
    }

    async modifyBalance(wallet_address: address, amount: number) {
        if(!this.provider) throw new Error("Anvil provider is not initialized. Make sure to start Anvil first");
        return this.provider.send("anvil_setBalance", [wallet_address, amount]);
    }

    async getTimestamp() {
        if(!this.provider) throw new Error("Anvil provider is not initialized. Make sure to start Anvil first");
        const block = await this.provider.getBlock('latest');
        return block?.timestamp;
    }

    async setBlockTimestamp(block_timestamp: number) {
        if(!this.provider) throw new Error("Anvil provider is not initialized. Make sure to start Anvil first");
        await this.provider.send("evm_setNextBlockTimestamp", [block_timestamp]);
        await this.mineBlock();
    }

    async mineBlock() {
        if(!this.provider) throw new Error("Anvil provider is not initialized. Make sure to start Anvil first");
        await this.provider.send("evm_mine", []);
    }

    async impersonate(address: address) {
        if(!this.provider) throw new Error("Anvil provider is not initialized. Make sure to start Anvil first");
        await this.provider.send("anvil_impersonateAccount", [address]);
    }

    async stopImpersonating(address: address) {
        if(!this.provider) throw new Error("Anvil provider is not initialized. Make sure to start Anvil first");
        await this.provider.send("anvil_stopImpersonatingAccount", [address]);
    }
}

function waitUntilPortIsUsed(port: number, retries = 10, retryTime = 250) {
    return new Promise((resolve, reject) => {
        let currentRetries = 0;

        const checkPort = async () => {
            if (await isPortInUse(port)) {
                resolve(null);
            } else {
                if (currentRetries >= retries) {
                    reject(`Port ${port} is not in use after ${retries} retries. Ensure the port is available & there is no errors in the anvil log.`);
                } else {
                    currentRetries++;
                    setTimeout(checkPort, retryTime);
                }
            }
        };

        checkPort();
    });
}

function isPortInUse(port: number, host = '127.0.0.1') {
    return new Promise((resolve, reject) => {
        const server = net.createServer();

        server.once('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                resolve(true); // Port is in use
            } else {
                server.close();
                reject(err); // Other errors (e.g., permission issues)
            }
        });

        server.once('listening', () => {
            server.close(); // Close the server if it successfully listens
            resolve(false); // Port is not in use
        });

        server.listen(port, host);
    });
}