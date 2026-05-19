# contracts

Foundry project containing the `ArbitrumSettlementCore` contract stack.

## Structure

```
src/
  ArbitrumSettlementCore.sol   # Core settlement logic (UUPS upgradeable)
  interfaces/
    IArbitrumSettlementCore.sol
    ISettlementTypes.sol
test/
  ArbitrumSettlementCore.t.sol # 82 tests (unit, fuzz, invariant)
script/
  Counter.s.sol                # Deploy script
broadcast/
  Deploy.s.sol/421614/         # Arbitrum Sepolia deployment artifacts
```

## Commands

```shell
# Build
forge build

# Run all tests
forge test -vv

# Gas snapshot
forge snapshot

# Deploy to Arbitrum Sepolia
forge script script/Counter.s.sol --rpc-url arbitrum_sepolia --broadcast
```

## Test results (M1)

```
82 tests passed, 0 failed
  78 unit / fuzz tests
   4 invariant tests
```

### Anvil

```shell
$ anvil
```

### Deploy

```shell
$ forge script script/Counter.s.sol:CounterScript --rpc-url <your_rpc_url> --private-key <your_private_key>
```

### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```
