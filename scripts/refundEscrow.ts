import { ContractProvider } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { Escrow } from '../wrappers/Escrow';

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();
    const contract = await ui.inputAddress('Enter escrow contract address');
    const escrow = provider.open(Escrow.createFromAddress(contract));
    const isJetton = await ui.choose(
        'What kind of amount did you use during deployment?',
        [false, true],
        (e) => ['TON', 'Jetton'][+e],
    );
    await escrow.sendRefund(provider.sender(), isJetton);
}
