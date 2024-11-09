import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    toNano,
} from '@ton/core';

export type EscrowConfig = {
    investor: Address;
    worker: Address;
    guarantor: Address;
    amount: bigint;
    amountInterest: bigint;
    jetton: Address | null;
};

export enum Opcodes {
    deploy = 0x1,
    withdraw = 0xcb03bfaf,
    refund = 0xc135f40c,
}

export function buildDeployMessage(config: EscrowConfig): Cell {
    return beginCell()
        .storeUint(Opcodes.deploy, 32)
        .storeRef(
            beginCell()
                .storeBit(true) // initialized
                .storeBit(false) // finished
                .storeRef(
                    beginCell()
                        .storeAddress(config.investor) //  investor
                        .storeAddress(config.worker) //  worker
                        .storeAddress(config.guarantor), //  guarantor
                )
                .storeAddress(config.jetton) //  jetton
                .storeCoins(config.amount) //  amount
                .storeCoins(config.amountInterest) //  amountInterest
                .endCell(),
        )
        .endCell();
}

export class Escrow implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new Escrow(address);
    }

    static createFromConfig(code: Cell, randomId: bigint, workchain = 0) {
        const data = beginCell().storeBit(0).storeBit(0).storeUint(randomId, 256).endCell();
        const init = { code, data };
        return new Escrow(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: EscrowConfig) {
        return provider.internal(via, {
            value: value.jetton ? toNano('0.01') : (value.amount + value.amountInterest + toNano('0.01')),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: buildDeployMessage(value),
        });
    }

    async sendWithdraw(provider: ContractProvider, via: Sender, isJetton: boolean) {
        return provider.internal(via, {
            value: isJetton ? toNano('0.11') : toNano('0.01'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(Opcodes.withdraw, 32).endCell(),
        });
    }

    async sendRefund(provider: ContractProvider, via: Sender, isJetton: boolean) {
        return provider.internal(via, {
            value: isJetton ? toNano('0.11') : toNano('0.01'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(Opcodes.refund, 32).endCell(),
        });
    }

    async getFinished(provider: ContractProvider): Promise<boolean> {
        const result = await provider.get('finished', []);
        return result.stack.readBoolean();
    }

    async getData(provider: ContractProvider): Promise<EscrowConfig> {
        const result = await provider.get('data', []);
        return {
            investor: result.stack.readAddress(),
            worker: result.stack.readAddress(),
            guarantor: result.stack.readAddress(),
            jetton: result.stack.readAddressOpt(),
            amount: result.stack.readBigNumber(),
            amountInterest: result.stack.readBigNumber(),
        };
    }
}
