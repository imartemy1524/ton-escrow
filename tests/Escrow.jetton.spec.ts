import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { Escrow, EscrowConfig } from '../wrappers/Escrow';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/JettonWallet';

describe('Escrow Jetton', () => {
    let code: Cell;
    let codeJettonMinter: Cell;
    let codeJettonWallet: Cell;
    beforeAll(async () => {
        code = await compile('Escrow');
        codeJettonMinter = await compile('JettonMinter');
        codeJettonWallet = await compile('JettonWallet');
    });

    let blockchain: Blockchain;
    let investor: SandboxContract<TreasuryContract>;
    let worker: SandboxContract<TreasuryContract>;
    let guarantor: SandboxContract<TreasuryContract>;
    let escrow: SandboxContract<Escrow>;
    let jettonMinter: SandboxContract<JettonMinter>;
    let jettonEscrow: SandboxContract<JettonWallet>;
    let jettonInvestor: SandboxContract<JettonWallet>;
    let jettonWorker: SandboxContract<JettonWallet>;
    let jettonGuarantor: SandboxContract<JettonWallet>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        investor = await blockchain.treasury('investor');
        guarantor = await blockchain.treasury('guarantor');
        worker = await blockchain.treasury('worker');
        jettonMinter = blockchain.openContract(
            JettonMinter.createFromConfig(
                {
                    walletCode: codeJettonWallet,
                    admin: investor.address,
                    content: Cell.EMPTY,
                },
                codeJettonMinter,
            ),
        );

        await jettonMinter.sendDeploy(investor.getSender(), toNano('0.05'));
        await jettonMinter.sendMint(
            investor.getSender(),
            toNano('0.05'),
            toNano('0.01'),
            investor.address,
            toNano('1000000'),
        );

        escrow = blockchain.openContract(Escrow.createFromConfig(code, BigInt(123456)));

        jettonEscrow = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMinter.getWalletAddressOf(escrow.address))
        )
        jettonInvestor = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMinter.getWalletAddressOf(investor.address))
        )
        jettonWorker = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMinter.getWalletAddressOf(worker.address))
        )
        jettonGuarantor = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMinter.getWalletAddressOf(guarantor.address))
        )
        const deployResult = await escrow.sendDeploy(investor.getSender(), {
            worker: worker.address,
            investor: investor.address,
            jetton: jettonEscrow.address,
            amount: toNano('100'),
            amountInterest: toNano('10'),
            guarantor: guarantor.address,
        } as EscrowConfig);

        await jettonInvestor.sendTransfer(investor.getSender(), toNano('1'), toNano('0'), escrow.address, toNano('110'), Cell.EMPTY);

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
        expect(data.jetton).toEqualAddress(jettonEscrow.address);
        expect(data.amount).toEqual(toNano('100'));
        expect(data.amountInterest).toEqual(toNano('10'));
        expect(data.guarantor).toEqualAddress(guarantor.address);
        const balance = await jettonEscrow.getJettonBalance();
        expect(balance).toEqual(toNano('110'));
    });

    it('should withdraw by investor', async () => {
        const {transactions} = await escrow.sendWithdraw(investor.getSender(), true);
        printTransactionFees(transactions);
        await validateBalanceAfterWithdraw();
    });
    it('should withdraw by guarantor', async () => {
        const {transactions} = await escrow.sendWithdraw(guarantor.getSender(), true);
        printTransactionFees(transactions);
        await validateBalanceAfterWithdraw();
    });
    it('should not withdraw by worker', async () => {
        const {transactions} = await escrow.sendWithdraw(worker.getSender(), true);
        printTransactionFees(transactions);
        expect(transactions).toHaveTransaction({
            from: worker.address,
            to: escrow.address,
            success: false,
        })
    })
    it('should refund by worker', async () => {
        const {transactions} = await escrow.sendRefund(worker.getSender(), true);
        printTransactionFees(transactions);
        await validateBalanceAfterRefund();
    });
    it('should refund by moderator', async () => {
        const {transactions} = await escrow.sendRefund(guarantor.getSender(), true);
        printTransactionFees(transactions);
        await validateBalanceAfterRefund();
    });
    it('should not refund by investor', async () => {
        const { transactions } = await escrow.sendRefund(investor.getSender(), true);
        printTransactionFees(transactions);
        expect(transactions).toHaveTransaction({
            from: investor.address,
            to: escrow.address,
            success: false,
        })
    })


    async function validateBalanceAfterWithdraw() {
        expect(await escrow.getFinished()).toBeTruthy();
        const balance = await jettonEscrow.getJettonBalance();
        const balanceWorker = await jettonWorker.getJettonBalance();
        const balanceModerator = await jettonGuarantor.getJettonBalance();
        expect(balance).toEqual(toNano('0'));
        expect(balanceWorker).toEqual(toNano('100'));
        expect(balanceModerator).toEqual(toNano('10'));
    }
    async function validateBalanceAfterRefund(){
        expect(await escrow.getFinished()).toBeTruthy();
        const balance = await jettonEscrow.getJettonBalance();
        const balanceWorker = await jettonWorker.getJettonBalance();
        const balanceModerator = await jettonGuarantor.getJettonBalance();
        const balanceInvestor = await jettonInvestor.getJettonBalance();
        expect(balance).toEqual(0n);
        expect(balanceWorker).toEqual(0n);
        expect(balanceModerator).toEqual(toNano('10'));
        expect(balanceInvestor).toEqual(toNano('1000000') - toNano('10'));
    }
});

