import { Address, beginCell, Cell, fromNano, toNano } from '@ton/core';
import { Escrow } from '../wrappers/Escrow';
import { compile, NetworkProvider } from '@ton/blueprint';
import { randomUUID } from 'node:crypto';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/JettonWallet';

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();

    let master: Address | null = null;
    if (await ui.choose('What kind of amount do you want to use?', [0, 1], (e) => ['TON', 'Jetton'][e])) {
        master = (await ui.inputAddress('Enter jetton master address', null as any)) as Address | null;
    }
    const worker = await ui.inputAddress('Enter worker address');
    const investor = await ui.inputAddress('Enter investor address (to use TONs keep empty)');
    const guarantor = await ui.inputAddress('Enter moderator address');
    const amount = toNano(await ui.input('Enter amount (TONs/Jettons)'));
    const amountFee = toNano(await ui.input('Enter amount (moderator fees)'));

    const randomNumber = BigInt('0x' + beginCell().storeStringTail(randomUUID()).endCell().hash().toString('hex'));
    const escrow = provider.open(Escrow.createFromConfig(await compile('Escrow'), randomNumber));

    let jetton: Address | null;
    if (master) {
        const jettonMaster = provider.open(JettonMinter.createFromAddress(master));
        jetton = await jettonMaster.getWalletAddressOf(escrow.address);
    } else jetton = null;
    await escrow.sendDeploy(provider.sender(), {
        worker,
        investor,
        jetton,
        amount,
        amountInterest: amountFee,
        guarantor,
    });
    console.log('Deployed escrow at', escrow.address);
    await provider.waitForDeploy(escrow.address);
    if (jetton) {
        const jettonMaster = provider.open(JettonMinter.createFromAddress(master!));
        jetton = await jettonMaster.getWalletAddressOf(provider.sender().address!);
        await provider
            .open(JettonWallet.createFromAddress(jetton))
            .sendTransfer(
                provider.sender(),
                toNano('0.05'),
                0n,
                escrow.address!,
                amount + amountFee,
                Cell.EMPTY,
            );
    }
}
