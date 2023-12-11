//SPDX-License-Identifier: MIT 
pragma solidity ^0.8.16;

///////////////////////////////////////////////////////////
// IMPORTS
// This enables the author of the contract to own it, and provide
// ownership only methods to be called by the author for maintenance
// or other issues.
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

// Initializable interface is required because constructors don't work the same
// way for upgradeable contracts.
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// We are using the UUPSUpgradeable Proxy pattern instead of the transparent proxy
// pattern because its more gas efficient and comes with some better trade-offs.
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

// used to peer to the ledger
import "../Ledger.sol";
///////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////
// Peer 
//
// Simply a quick stub to test peering upgrades for the ledger.
///////////////////////////////////////////////////////////
contract Peer is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    Ledger public ledger;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // this disables all previous initializers
        _disableInitializers();
    }

    /**
     * initialize()
     *
     * Fundamentally replaces the constructor for an upgradeable contract.
     */
    function initialize(address _Ledger) initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();

        ledger = Ledger(_Ledger);
    }

    /**
     * _authorizeUpgrade
     *
     * This method is required to safeguard from un-authorized upgrades, since
     * in the UUPS model the upgrade occures from this contract, and not the proxy.
     * I think it works by reverting if upgrade() is called from someone other than
     * the owner.
     *
     * @param newImplementation the new address implementation to upgrade to
     */
    function _authorizeUpgrade(address newImplementation) internal view onlyOwner override
    { newImplementation; }


    /**
     * deposit
     *
     * a stub method that tries to run a deposit into the ledger.
     * this should fail if the Peer isn't properly peered
     * to the ledger.
     */
    function deposit() external {
        ledger.deposit(0, bytes32('ether'), 10**18); 
    }
}
