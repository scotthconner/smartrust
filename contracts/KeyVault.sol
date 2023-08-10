// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

///////////////////////////////////////////////////////////
// IMPORTS
//
// We need this to use the ERC1155 token standard and be able to ugprade
import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";

// Required for Upgradeable Contracts
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// UUPS Proxy Standard
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

// KeyVault Interface - implemented to keep bytecode clean across upgrade tracking
// also used nicely for platform building.
import './interfaces/IKeyVault.sol';
import './interfaces/ILocksmith.sol';

// We are going to use the Enumerable Set to keep track of where
// the keys are going and who owns what
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
using EnumerableSet for EnumerableSet.UintSet;
using EnumerableSet for EnumerableSet.AddressSet;
///////////////////////////////////////////////////////////

/**
 * KeyVault 
 *
 * This simple contract is where the ERC1155s are minted and burned.
 * It has no knowledge of the rest of the system, and is used to
 * contain the tokenziation of the keys only.
 *
 * Only the contract deployer and any associated minters (locksmith's)
 * can manage the keys.
 */
contract KeyVault is IKeyVault, ERC1155Upgradeable, UUPSUpgradeable {
    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    address private owner;
    address public  locksmith;

    // The respected locksmith can mint and burn tokens, as
    // well as bind specific keys to wallets and prevent the
    // vault from enabling transfers. This prpevents contracts
    // and delinquent key holders from moving their NFT
    // or having it stolen out of their wallet.
    // wallet / keyId => amount
    mapping(address => mapping(uint256 => uint256)) private soulboundKeyAmounts;

    // we want to keep track of each key type
    // in each address for introspection
    mapping(address => EnumerableSet.UintSet) private addressKeys;
   
    // we want to keep track of each holder of keys
    mapping(uint256 => EnumerableSet.AddressSet) private keyHolders;

    // we want to keep track of the total supply of each key
    mapping(uint256 => uint256) public keySupply;

    ///////////////////////////////////////////////////////
    // Constructor and Upgrade Methods
    //
    // This section is specifically for upgrades and inherited
    // override functionality.
    ///////////////////////////////////////////////////////
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // this disables all previous initializers
        // and locks the contract for anyone but the owner
        _disableInitializers();
    }

     /**
     * initialize()
     *
     * Fundamentally replaces the constructor for an upgradeable contract.
     *
     */
    function initialize() initializer public {
        owner = msg.sender;
        __UUPSUpgradeable_init();
    }

     /**
     * _authorizeUpgrade
     *
     * This method is required to safeguard from un-authorized upgrades, since
     * in the UUPS model the upgrade occures from this contract, and not the proxy.
     * I think it works by reverting if upgrade() is called from someone other than
     * the owner.
     *
     * //UNUSED -param newImplementation the new address implementation to upgrade to
     */
    function _authorizeUpgrade(address) internal view override {
        require(msg.sender == owner, 'NOT_OWNER');
    }

    ////////////////////////////////////////////////////////
    // Introspection
    ////////////////////////////////////////////////////////
   
    /**
     * getKeys
     *
     * This method will return the IDs of the keys held
     * by the given address.
     *
     * @param holder the address of the key holder you want to see
     * @return an array of key IDs held by the user.
     */
    function getKeys(address holder) external view returns (uint256[] memory) {
        return addressKeys[holder].values();
    }

    /**
     * getHolders
     *
     * This method will return the addresses that hold
     * a particular keyId
     *
     * @param keyId the key ID to look for
     * @return an array of addresses that hold that key
     */
    function getHolders(uint256 keyId) external view returns (address[] memory) {
        return keyHolders[keyId].values();
    }

    /**
     * keyBalanceOf
     *
     * We want to expose a generic ERC1155 interface here, but we are
     * going to layer it through a key vault interface.
     *
     * @param account   the wallet address you want the balance for
     * @param id        the key Id you want the balance of.
     * @param soulbound true if you want the soulbound balance
     * @return the token balance for that wallet and key id
     */
    function keyBalanceOf(address account, uint256 id, bool soulbound) external view returns (uint256) {
        return soulbound ? soulboundKeyAmounts[account][id] : this.balanceOf(account, id);
    }

    /**
     * uri 
     *
     * This method overrides the ERC1155 interface to provide 
     * a minimal view into the NFTs in a user's wallet.
     * 
     * Later we should encode these to be per-key, but for
     * now let's at least ensure master keys and accounts
     * show up properly.
     *
     * @param id the id of the NFT we want to inspect
     */
    function uri(uint256 id) public view virtual override returns (string memory) {
        // I'll be honest, there's two things I don't like here:
        // 1) Calling back to the locksmith to check if its root. This is bad.
        //    I should be generating the metadata pre-transaction and taking
        //    it as input upon mint. This would enable me to set the account name
        //    as an attribute. This must come later as I am pressed for time.
        // 2) Hard-coding it. It's just a waste of bytes. But its fast.
        if(ILocksmith(locksmith).isRootKey(id)) {
            return "https://bafkreid6zaapx5572ect2t2awlrocbrj5qzwrbhcpuziifuys4f6t3jhli.ipfs.nftstorage.link";
        } else {
            return "https://bafkreicfiix7nnedfg3mk5lqt2dpsiuzjkfywft4dawgbyftczqwfg2qnq.ipfs.nftstorage.link";
        }
    }

    /**
     * name
     * 
     * We want the collection name to show up, but we don't want to
     * change the storage format of the contract.
     */
    function name() external pure returns (string memory) {
        return "Locksmith Wallet";
    }

    ////////////////////////////////////////////////////////
    // Owner methods
    //
    // Only the contract owner can call these 
    ////////////////////////////////////////////////////////

    /**
     * setRespectedLocksmith
     *
     * Only the owner can call this method, to set
     * the key vault owner to a specific locksmith.
     *
     * @param _Locksmith the address of the locksmith to respect
     */
    function setRespectedLocksmith(address _Locksmith) external {
        require(msg.sender == owner, 'NOT_OWNER');
        locksmith = _Locksmith;
    }

    ////////////////////////////////////////////////////////
    // Locksmith methods 
    //
    // Only the anointed locksmith can call these. 
    ////////////////////////////////////////////////////////
    
    /**
     * mint 
     *
     * Only the locksmith can mint keys. 
     *
     * @param receiver   the address to send the new key to 
     * @param keyId      the ERC1155 NFT ID you want to mint 
     * @param amount     the number of keys you want to mint to the receiver
     * @param data       the data field for the key 
     */
    function mint(address receiver, uint256 keyId, uint256 amount, bytes calldata data) external {
        require(locksmith == msg.sender, "NOT_LOCKSMITH");
        keySupply[keyId] += amount;
        _mint(receiver, keyId, amount, data);
    }

    /**
     * soulbind
     *
     * The locksmith can call this method to ensure that the current
     * key-holder of a specific address cannot exchange or move a certain
     * amount of keys from their wallets. Essentially it will prevent
     * transfers.
     *
     * In the average case, this is on behalf of the root key holder of
     * a trust. 
     *
     * It is safest to soulbind in the same transaction as the minting.
     * This function does not check if the keyholder holds the amount of
     * tokens. And this function is SETTING the soulbound amount. It is
     * not additive.
     *
     * @param keyHolder the current key-holder
     * @param keyId     the key id to bind to the keyHolder
     * @param amount    it could be multiple depending on the use case
     */
    function soulbind(address keyHolder, uint256 keyId, uint256 amount) external {
        // respect only the locksmith in this call
        require(locksmith == msg.sender, "NOT_LOCKSMITH");

        // here ya go boss
        soulboundKeyAmounts[keyHolder][keyId] = amount;
        emit setSoulboundKeyAmount(msg.sender, keyHolder, keyId, amount); 
    }

    /**
     * burn 
     *
     * We want to provide some extra functionality to allow the Locksmith
     * to burn Trust Keys on behalf of the root key holder. While the KeyVault
     * "trusts" the locksmith, the locksmith will only call this method on behalf
     * of the root key holder.
     *
     * We've also made the design decision to allow holders to burn keys they own.
     *
     * @param holder     the address of the key holder you want to burn from
     * @param keyId      the ERC1155 NFT ID you want to burn
     * @param burnAmount the number of said keys you want to burn from the holder's possession.
     */
    function burn(address holder, uint256 keyId, uint256 burnAmount) external {
        require(locksmith == msg.sender || holder == msg.sender, "NOT_LOCKSMITH_OR_HOLDER");
        keySupply[keyId] -= burnAmount;
        _burn(holder, keyId, burnAmount);
    }
    
    ////////////////////////////////////////////////////////
    // Key Methods 
    //
    // These are overrides of the token standard that we use
    // to add additional functionalty to the keys themselves.
    ////////////////////////////////////////////////////////

    /**
     * _beforeTokenTransfer 
     *
     * This is an override for ERC1155. We are going
     * to ensure that the transfer is not tripping any
     * soulbound token amounts.
     */
    function _beforeTokenTransfer(
        address operator, address from, address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal virtual override {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);

        // here we check to see if any 'from' addresses
        // would end up with too few soulbound requirements
        // at the end of the transaction.
        for(uint256 x = 0; x < ids.length; x++) {
            // we need to allow address zero during minting,
            // and we need to allow the locksmith to violate during burning 
            require(
                (from == address(0)) || 
                (operator == locksmith) ||  
                ((this.balanceOf(from, ids[x]) - amounts[x]) >=
                soulboundKeyAmounts[from][ids[x]]), 'SOUL_BREACH');

            // lets keep track of each key that is moving
            if(from != address(0) && ((this.balanceOf(from, ids[x]) - amounts[x]) == 0)) {
                assert(addressKeys[from].remove(ids[x]));
                assert(keyHolders[ids[x]].remove(from));
            }
            if(to != address(0) && ((this.balanceOf(to, ids[x]) + amounts[x]) > 0)) {
                addressKeys[to].add(ids[x]);
                keyHolders[ids[x]].add(to);
            }
        }
    }
}
