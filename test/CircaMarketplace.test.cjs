const { expect } = require("chai");
const hre = require("hardhat");

describe("CircaMarketplace", function () {
  let marketplace;
  let owner;
  let stranger;

  beforeEach(async function () {
    const signers = await hre.ethers.getSigners();
    owner = signers[0];
    stranger = signers[1];
    const Factory = await hre.ethers.getContractFactory("CircaMarketplace", owner);
    marketplace = await Factory.deploy();
    await marketplace.waitForDeployment();
  });

  it("owner is the deployer", async function () {
    expect(await marketplace.owner()).to.equal(owner.address);
  });

  it("list emits Listed and stores the listing", async function () {
    const tx = await marketplace
      .connect(owner)
      .list(1, 1_000_000_000n, "0.0.8747372");
    await expect(tx)
      .to.emit(marketplace, "Listed")
      .withArgs(1, 1, "0.0.8747372", 1_000_000_000n);

    const l = await marketplace.getListing(1);
    expect(l.serial).to.equal(1);
    expect(l.sellerAccountId).to.equal("0.0.8747372");
    expect(l.priceTinybars).to.equal(1_000_000_000n);
    expect(l.active).to.equal(true);
    expect(l.sold).to.equal(false);
  });

  it("list reverts for non-owner", async function () {
    await expect(
      marketplace.connect(stranger).list(1, 1n, "0.0.x")
    ).to.be.revertedWithCustomError(marketplace, "NotOwner");
  });

  it("list reverts on zero price", async function () {
    await expect(
      marketplace.connect(owner).list(1, 0n, "0.0.x")
    ).to.be.revertedWithCustomError(marketplace, "ZeroPrice");
  });

  it("list reverts on empty seller", async function () {
    await expect(
      marketplace.connect(owner).list(1, 1n, "")
    ).to.be.revertedWithCustomError(marketplace, "EmptySeller");
  });

  it("markSold records the buyer + settlement tx and emits Bought", async function () {
    await marketplace.connect(owner).list(7, 12_000_000_000n, "0.0.8747372");
    const tx = await marketplace
      .connect(owner)
      .markSold(1, "0.0.8747373", "0.0.1234@1700000000.000000000");
    await expect(tx)
      .to.emit(marketplace, "Bought")
      .withArgs(
        1,
        7,
        "0.0.8747372",
        "0.0.8747373",
        12_000_000_000n,
        "0.0.1234@1700000000.000000000"
      );
    const l = await marketplace.getListing(1);
    expect(l.active).to.equal(false);
    expect(l.sold).to.equal(true);
    expect(l.buyerAccountId).to.equal("0.0.8747373");
  });

  it("markSold reverts on unknown listing", async function () {
    await expect(
      marketplace.connect(owner).markSold(999, "0.0.x", "tx")
    ).to.be.revertedWithCustomError(marketplace, "ListingUnknown");
  });

  it("markSold reverts on inactive listing (double-sell guard)", async function () {
    await marketplace.connect(owner).list(1, 1n, "0.0.a");
    await marketplace.connect(owner).markSold(1, "0.0.b", "tx");
    await expect(
      marketplace.connect(owner).markSold(1, "0.0.c", "tx")
    ).to.be.revertedWithCustomError(marketplace, "ListingInactive");
  });

  it("cancel flips active and emits Cancelled", async function () {
    await marketplace.connect(owner).list(3, 1_000n, "0.0.a");
    const tx = await marketplace.connect(owner).cancel(1);
    await expect(tx).to.emit(marketplace, "Cancelled").withArgs(1, 3, "0.0.a");
    const l = await marketplace.getListing(1);
    expect(l.active).to.equal(false);
    expect(l.sold).to.equal(false);
  });

  it("cancel reverts on already-inactive listing", async function () {
    await marketplace.connect(owner).list(3, 1_000n, "0.0.a");
    await marketplace.connect(owner).cancel(1);
    await expect(
      marketplace.connect(owner).cancel(1)
    ).to.be.revertedWithCustomError(marketplace, "ListingInactive");
  });

  it("nextListingId increments per listing", async function () {
    expect(await marketplace.nextListingId()).to.equal(1n);
    await marketplace.connect(owner).list(1, 1n, "0.0.a");
    expect(await marketplace.nextListingId()).to.equal(2n);
    await marketplace.connect(owner).list(2, 1n, "0.0.b");
    expect(await marketplace.nextListingId()).to.equal(3n);
  });
});
