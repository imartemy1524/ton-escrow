import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, fromNano, toNano } from '@ton/core';
import { Escrow, EscrowConfig } from '../wrappers/Escrow';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/JettonWallet';

const InitBalance = 1000000000000000n;
describe('Escrow TONs', () => {
    let code: Cell;
    beforeAll(async () => {
        code = await compile('Escrow');
    });

    let blockchain: Blockchain;
    let investor: SandboxContract<TreasuryContract>;
    let worker: SandboxContract<TreasuryContract>;
    let guarantor: SandboxContract<TreasuryContract>;
    let escrow: SandboxContract<Escrow>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        investor = await blockchain.treasury('investor');
        guarantor = await blockchain.treasury('guarantor');
        worker = await blockchain.treasury('worker');

        escrow = blockchain.openContract(Escrow.createFromConfig(code, BigInt(123456)));

        const deployResult = await escrow.sendDeploy(investor.getSender(), {
            worker: worker.address,
            investor: investor.address,
            jetton: null,
            amount: toNano('100'),
            amountInterest: toNano('10'),
            guarantor: guarantor.address,
        } as EscrowConfig);
        printTransactionFees(deployResult.transactions);
        expect(deployResult.transactions).toHaveTransaction({
            from: investor.address,
            to: escrow.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        expect(await escrow.getFinished()).toBeFalsy();

        const data = await escrow.getData();
        expect(data.worker).toEqualAddress(worker.address);
        expect(data.investor).toEqualAddress(investor.address);
        expect(data.jetton).toBeNull();
        expect(data.amount).toEqual(toNano('100'));
        expect(data.amountInterest).toEqual(toNano('10'));
        expect(data.guarantor).toEqualAddress(guarantor.address);
    });
    it('should withdraw by investor', async () => {
        const { transactions } = await escrow.sendWithdraw(investor.getSender(), false);
        printTransactionFees(transactions);
        await validateBalanceAfterWithdraw();
    });
    it('should withdraw by guarantor', async () => {
        const { transactions } = await escrow.sendWithdraw(guarantor.getSender(), false);
        printTransactionFees(transactions);
        await validateBalanceAfterWithdraw();
    });
    it('should not withdraw by worker', async () => {
        const { transactions } = await escrow.sendWithdraw(worker.getSender(), false);
        printTransactionFees(transactions);
        expect(transactions).toHaveTransaction({
            from: worker.address,
            to: escrow.address,
            success: false,
        });
    });
    it('should refund by worker', async () => {
        const { transactions } = await escrow.sendRefund(worker.getSender(), false);
        printTransactionFees(transactions);
        await validateBalanceAfterRefund();
    });
    it('should refund by moderator', async () => {
        const { transactions } = await escrow.sendRefund(guarantor.getSender(), false);
        printTransactionFees(transactions);
        await validateBalanceAfterRefund();
    });
    it('should not refund by investor', async () => {
        const { transactions } = await escrow.sendRefund(investor.getSender(), false);
        printTransactionFees(transactions);
        expect(transactions).toHaveTransaction({
            from: investor.address,
            to: escrow.address,
            success: false,
        });
    });

    async function validateBalanceAfterWithdraw() {
        expect(await escrow.getFinished()).toBeTruthy();
        const balance = await blockchain.getContract(escrow.address).then((e) => e.balance);
        const balanceWorker = await blockchain.getContract(worker.address).then((e) => e.balance);
        const balanceModerator = await blockchain.getContract(guarantor.address).then((e) => e.balance);
        expect(+fromNano(balance)).toBeCloseTo(0.013, 1);
        expect(+fromNano(balanceWorker - InitBalance)).toBeCloseTo(100, 1);
        expect(+fromNano(balanceModerator - InitBalance)).toBeCloseTo(10, 1);
    }

    async function validateBalanceAfterRefund() {
        expect(await escrow.getFinished()).toBeTruthy();
        const balance = await blockchain.getContract(escrow.address).then((e) => e.balance);
        const balanceWorker = await blockchain.getContract(worker.address).then((e) => e.balance);
        const balanceModerator = await blockchain.getContract(guarantor.address).then((e) => e.balance);
        const balanceInvestor = await blockchain.getContract(investor.address).then((e) => e.balance);
        expect(+fromNano(balance)).toBeCloseTo(0.013);
        expect(+fromNano(balanceWorker - InitBalance)).toBeCloseTo(0, 1);
        expect(+fromNano(balanceModerator - InitBalance)).toBeCloseTo(10, 1);
        expect(+fromNano(balanceInvestor - InitBalance)).toBeCloseTo(-10, 1);
    }
});
