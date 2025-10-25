import { Contract, TransactionResponse } from "ethers";
import { address, bytes, curvance_signer } from "../types";
import { Calldata } from "./Calldata";
import { Swap } from "./Zapper";
import { contractSetup, EMPTY_ADDRESS } from "../helpers";
import abi from '../abis/SimplePositionManager.json';

export type PositionManagerTypes = 'native-vault' | 'simple';
export interface LeverageAction {
    borrowableCToken: address;
    borrowAssets: bigint;
    cToken: address;
    swapAction?: Swap;
    auxData?: bytes;
}

export interface DeleverageAction {
    cToken: address;
    collateralAssets: bigint;
    borrowableCToken: address;
    repayAssets: bigint;
    swapActions?: Swap[];
    auxData?: bytes;
}

export interface IPositionManager {
    leverage(action: LeverageAction, slippage: bigint): Promise<TransactionResponse>;
    depositAndLeverage(assets: bigint, action: LeverageAction, slippage: bigint): Promise<TransactionResponse>;
    deleverage(action: DeleverageAction, slippage: bigint): Promise<TransactionResponse>;
}

export class PositionManager extends Calldata<IPositionManager> {
    provider: curvance_signer;
    contract: IPositionManager & Contract;
    address: address;
    type: PositionManagerTypes;

    constructor(address: address, provider: curvance_signer, type: PositionManagerTypes) {
        super();
        this.address = address;
        this.provider = provider;
        this.type = type;
        this.contract = contractSetup<IPositionManager>(provider, address, abi);
    }

    static emptySwapAction(): Swap {
        return {
            inputToken: EMPTY_ADDRESS,
            inputAmount: 0n,
            outputToken: EMPTY_ADDRESS,
            target: EMPTY_ADDRESS,
            slippage: 0n,
            call: "0x"
        }
    }

    getDeleverageCalldata(action: DeleverageAction, slippage: bigint) {
        return this.getCallData("deleverage", [action, slippage]);
    }

    getLeverageCalldata(action: LeverageAction, slippage: bigint) {
        return this.getCallData("leverage", [action, slippage]);
    }

    getDepositAndLeverageCalldata(assets: bigint, action: LeverageAction, slippage: bigint) {
        return this.getCallData("depositAndLeverage", [assets, action, slippage]);
    }
}