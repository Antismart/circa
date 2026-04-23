// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title CircaMarketplace
/// @notice On-chain ledger of resale listings for Circa Digital Product Passports.
/// @dev The actual atomic NFT + HBAR transfer is executed by Hedera Token Service
///      via an SDK TransferTransaction from the Circa backend — the HTS layer
///      enforces the 2.5% royalty automatically at consensus. This contract
///      exists purely to make the listing state and settlement record verifiable
///      on the EVM side of Hedera. Only the contract owner (the Circa operator)
///      may write; end users never sign EVM transactions.
contract CircaMarketplace {
    struct Listing {
        string  sellerAccountId; // Hedera account id, e.g. "0.0.8747372"
        int64   serial;          // HTS NFT serial number
        uint256 priceTinybars;   // listing price in tinybars (1 HBAR = 1e8 tinybars)
        bool    active;
        bool    sold;
        string  buyerAccountId;  // populated on markSold
        string  settlementTxId;  // SDK-side atomic transfer that settled the sale
    }

    address public immutable owner;
    uint256 public nextListingId = 1;
    mapping(uint256 => Listing) private _listings;

    event Listed(
        uint256 indexed listingId,
        int64   indexed serial,
        string          sellerAccountId,
        uint256         priceTinybars
    );

    event Bought(
        uint256 indexed listingId,
        int64   indexed serial,
        string          sellerAccountId,
        string          buyerAccountId,
        uint256         priceTinybars,
        string          settlementTxId
    );

    event Cancelled(
        uint256 indexed listingId,
        int64   indexed serial,
        string          sellerAccountId
    );

    error NotOwner();
    error ListingInactive(uint256 listingId);
    error ListingUnknown(uint256 listingId);
    error EmptySeller();
    error EmptyBuyer();
    error ZeroPrice();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function list(
        int64 serial,
        uint256 priceTinybars,
        string calldata sellerAccountId
    ) external onlyOwner returns (uint256 listingId) {
        if (bytes(sellerAccountId).length == 0) revert EmptySeller();
        if (priceTinybars == 0) revert ZeroPrice();

        listingId = nextListingId;
        unchecked { nextListingId = listingId + 1; }

        _listings[listingId] = Listing({
            sellerAccountId: sellerAccountId,
            serial: serial,
            priceTinybars: priceTinybars,
            active: true,
            sold: false,
            buyerAccountId: "",
            settlementTxId: ""
        });

        emit Listed(listingId, serial, sellerAccountId, priceTinybars);
    }

    function markSold(
        uint256 listingId,
        string calldata buyerAccountId,
        string calldata settlementTxId
    ) external onlyOwner {
        Listing storage l = _listings[listingId];
        if (bytes(l.sellerAccountId).length == 0) revert ListingUnknown(listingId);
        if (!l.active) revert ListingInactive(listingId);
        if (bytes(buyerAccountId).length == 0) revert EmptyBuyer();

        l.active = false;
        l.sold = true;
        l.buyerAccountId = buyerAccountId;
        l.settlementTxId = settlementTxId;

        emit Bought(
            listingId,
            l.serial,
            l.sellerAccountId,
            buyerAccountId,
            l.priceTinybars,
            settlementTxId
        );
    }

    function cancel(uint256 listingId) external onlyOwner {
        Listing storage l = _listings[listingId];
        if (bytes(l.sellerAccountId).length == 0) revert ListingUnknown(listingId);
        if (!l.active) revert ListingInactive(listingId);

        l.active = false;

        emit Cancelled(listingId, l.serial, l.sellerAccountId);
    }

    function getListing(uint256 listingId) external view returns (Listing memory) {
        return _listings[listingId];
    }
}
